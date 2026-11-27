// SPEC-042 AC 5 / AC 6 (and AC 3 for them): the Park's puddles and the Football field's sprinklers — placement, timing, effect, determinism, the bots
// and the autopilot, and nothing of it in a practice game. The query tests drive the trick's own step on a cleared map (no walls) so what is
// checked is the trick, not the level around it.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, audible, autoDecide, canSee, cellsOf, createGame, hearNoise, initTrick, levelsPerWorld, moveSolidBigAt,
  newInput, sprinklerPhase, step, stepTrick, trickHideSpot, trickQuiet, updateBig, updateBots, useGame, withGame } from "../../src/core/index.js";

const DT = CFG.STEP, P = CFG.TRICKS.puddles, S = CFG.TRICKS.sprinklers;
const LV = Array.from({ length: levelsPerWorld() }, (_, i) => i + 1);
const kinds = g => g.fx.map(e => e.type + (e.name ? ":" + e.name : "") + (e.kind ? ":" + e.kind : "") + (e.key ? ":" + e.key : ""));

// a game of `world` on a cleared map (no walls, bushes, houses): Dad in the middle looking right, kid 0 far to the right, the other kids far away
function clearField(world, trick) {
  const g = createGame({ world, n: 2, seed: 3 });
  useGame(g);
  g.seeGrid.fill(0); g.moveGrid.fill(0); g.moveGridBig.fill(0); g.blocked.fill(0); g.blockedBig.fill(0); g.reachable.fill(1);
  g.bushes = []; g.obstacles = []; g.safeZone = null; g.dangerZone = null;
  Object.assign(g.big, { x: 480, y: 320, dir: 0, state: "look", timer: 99, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, kind: false, hearCd: 0, noise: 0, boss: null });
  g.littles.forEach((l, i) => { Object.assign(l, { x: 900, y: 40 + 40 * i, state: "ok", invuln: 0, dizzy: 0, moving: false, speedFrac: 0, path: [] }); l.fx.cloak = 0; l.fx.boots = 0; });
  g.trick.pieces = trick;
  initTrick();
  g.fx.length = 0;
  return g;
}
const puddleAt = (cx, cy) => ({ shape: "circle", cx, cy, r: P.r });
const sprinkler = (cx, cy, off = 0) => ({ shape: "circle", cx, cy, r: S.r, off });

// ================= puddles (Park) =================
test("puddles: 3–5 one-cell puddles per Park level, on free ground, clear of houses and aprons, the same every time", () => {
  const counts = new Set();
  for (const lv of LV) {
    const g = createGame({ world: "park", n: lv, seed: 1, fx: false }), again = createGame({ world: "park", n: lv, seed: 2, fx: false });
    assert.equal(g.trick.name, "puddles");
    const n = g.trick.pieces.length;
    assert.ok(n >= P.count[0] && n <= P.count[1], `park ${lv}: ${n} puddles`);
    counts.add(n);
    assert.deepEqual(g.trick.pieces, again.trick.pieces, `park ${lv}: the seed of the game does not matter, the level does`);
    for (const p of g.trick.pieces) {
      assert.equal(p.r, P.r);
      assert.equal(cellsOf(p).length, 1, "a one-cell puddle");
      assert.equal(g.blocked[cellsOf(p)[0]], 0, "free ground");
    }
  }
  assert.ok(counts.size > 1, "the number varies between levels");
});

test("puddles: a running kid who crosses one splashes — pop, drops, sound, an event — and is loud for splashTime s, once per crossing", () => {
  const g = clearField("park", [puddleAt(10.5, 9.5)]);
  const l = g.littles[0];
  Object.assign(l, { x: 10.5 * CELL, y: 9.5 * CELL, moving: true, speedFrac: 1 });
  withGame(g, () => stepTrick(DT));
  assert.ok(kinds(g).includes("pop:splash") && kinds(g).includes("burst:splash") && kinds(g).includes("sfx:splash"), kinds(g).join());
  assert.equal(g.trick.fx.loud[l.id], P.splashMul);
  assert.equal(g.events.filter(e => e.type === "splash").length, 1);
  g.fx.length = 0;
  for (let i = 0; i < 20; i++) withGame(g, () => stepTrick(DT));          // still in it, still running: no second splash
  assert.equal(g.events.filter(e => e.type === "splash").length, 1);
  assert.equal(g.fx.length, 0);
  // leaves and crosses again: a new splash
  l.x = 14 * CELL; withGame(g, () => stepTrick(DT));
  l.x = 10.5 * CELL; withGame(g, () => stepTrick(DT));
  assert.equal(g.events.filter(e => e.type === "splash").length, 2);
});

test("puddles: tiptoeing through is silent", () => {
  const g = clearField("park", [puddleAt(10.5, 9.5)]);
  const l = g.littles[0];
  Object.assign(l, { x: 10.5 * CELL, y: 9.5 * CELL, moving: true, speedFrac: CFG.TIPTOE_MULT });
  for (let i = 0; i < 30; i++) withGame(g, () => stepTrick(DT));
  assert.equal(g.events.filter(e => e.type === "splash").length, 0);
  assert.deepEqual(g.trick.fx.loud, {});
  assert.equal(g.fx.length, 0);
  l.moving = false;
  withGame(g, () => stepTrick(DT));
  assert.deepEqual(g.trick.fx.loud, {}, "standing still in it: nothing");
});

test("puddles: the splash is heard from splashMul × HEAR_RADIUS for splashTime s even if the kid stops at once — and then it is over", () => {
  const g = clearField("park", [puddleAt(10.5, 9.5)]);
  const l = g.littles[0];
  // 8 cells behind Dad (he looks right): beyond HEAR_RADIUS (5), inside 2 × (10)
  const x = g.big.x - 8 * CELL, y = g.big.y;
  Object.assign(l, { x, y, moving: true, speedFrac: 1 });
  g.trick.pieces = [puddleAt(x / CELL, y / CELL)]; initTrick();
  assert.equal(withGame(g, () => audible(l)), 0, "running 8 cells behind him: not heard without a puddle");
  withGame(g, () => stepTrick(DT));
  assert.ok(withGame(g, () => audible(l)) > 0, "the splash is heard");
  Object.assign(l, { moving: false, speedFrac: 0, x: x - 40 });             // stops, and steps out of the puddle
  assert.ok(withGame(g, () => audible(l)) > 0, "a kid who stops right after is still heard");
  const noise0 = g.big.noise;
  withGame(g, () => hearNoise(DT));
  assert.ok(g.big.noise > noise0 || g.big.hearTurnT > 0, "Dad takes it in");
  for (let i = 0; i < Math.round(P.splashTime / DT) + 2; i++) withGame(g, () => stepTrick(DT));
  assert.equal(withGame(g, () => audible(l)), 0, "after splashTime it is over");
  // 12 cells: too far even for a splash
  Object.assign(l, { x: g.big.x - 12 * CELL, moving: true, speedFrac: 1 });
  g.trick.fx.loud[l.id] = P.splashMul;
  assert.equal(withGame(g, () => audible(l)), 0);
});

test("puddles: Dad stepping in one only splashes (drops and sound, no pop, no noise, no event)", () => {
  const g = clearField("park", [puddleAt(15.5, 9.5)]);
  Object.assign(g.big, { x: 15.5 * CELL, y: 9.5 * CELL, moving: true });
  withGame(g, () => stepTrick(DT));
  assert.deepEqual(kinds(g), ["burst:splash", "sfx:splash"]);
  assert.deepEqual(g.trick.fx.loud, {});
  assert.equal(g.events.filter(e => e.type === "splash").length, 0);
  g.fx.length = 0;
  withGame(g, () => stepTrick(DT));
  assert.equal(g.fx.length, 0, "once while he stands in it");
});

test("puddles: bots and the careful autopilot tiptoe across a puddle while Dad is near enough to hear it, and run when he is far", () => {
  const g = clearField("park", [puddleAt(15.5, 9.5)]);
  const b = g.littles[1], l = g.littles[0];
  // Dad at (480, 320) looking at the bot at the puddle 130 px ahead: it flees; near Dad the puddle would give it away
  Object.assign(b, { kind: "bot", x: 15.5 * CELL + 130, y: 9.5 * CELL, state: "ok" });
  g.trick.pieces = [puddleAt(b.x / CELL, b.y / CELL)]; initTrick();
  const run = () => { withGame(g, () => updateBots(DT)); return [b.moving, b.speedFrac, b.task]; };
  assert.equal(withGame(g, () => trickQuiet(b)), true);
  const r = run();
  assert.deepEqual([r[0], r[2]], [true, "flee"]);
  assert.ok(r[1] <= CFG.TIPTOE_MULT && r[1] < CFG.TIPTOE_MAX, `tiptoes (${r[1]})`);
  Object.assign(g.big, { x: 40, y: 600 });                                   // Dad far from the puddle: nothing to hide
  assert.equal(withGame(g, () => trickQuiet(b)), false);
  Object.assign(b, { x: g.trick.pieces[0].cx * CELL, y: g.trick.pieces[0].cy * CELL });
  // the careful autopilot: Dad near and looking at the kid
  Object.assign(g.big, { x: 480, y: 320, dir: Math.atan2(l.y - 320, 700 - 480) });
  Object.assign(l, { x: 700, y: 320 });
  g.trick.pieces = [puddleAt(700 / CELL, 320 / CELL)]; initTrick();
  Object.assign(g.big, { x: 480, y: 320, dir: 0 });
  g.autoOn = true; g.autoStyle = "careful";
  const m = () => { g.autoMove = []; withGame(g, () => autoDecide(l, g.inputs[l.slot] || (g.inputs[l.slot] = newInput()), DT)); const v = g.autoMove[l.id]; return v ? Math.hypot(v.x, v.y) : 0; };
  assert.ok(m() <= CFG.TIPTOE_MULT + 1e-9, "near Dad, in a puddle: it tiptoes");
  g.trick.fx.quiet = [];
  assert.ok(m() > CFG.TIPTOE_MULT, "without the puddle it does not");
});

test("puddles: same seed, same splashes (a played level, the autopilot)", () => {
  const run = seed => {
    const g = createGame({ world: "park", n: 3, seed, fx: false });
    g.autoOn = true; g.autoStyle = "reckless";
    for (let i = 0; i < 1800; i++) step(g, DT);
    return JSON.stringify([g.trick, g.events.filter(e => e.type === "splash" || e.type === "heard")]);
  };
  assert.equal(run(5), run(5));
});

// ================= sprinklers (Field) =================
test("sprinklers: 2–3 per Field level, at least 2r + 1 cells apart, clear of houses and aprons, never spraying all at once; the level is not lost to them", () => {
  const counts = [];
  for (const lv of LV) {
    const g = createGame({ world: "field", n: lv, seed: 1, fx: false });
    const ps = g.trick.pieces;
    counts.push(ps.length);
    assert.ok(ps.length >= 1 && ps.length <= S.count[1], `field ${lv}: ${ps.length} sprinklers`);
    for (const p of ps) assert.equal(p.r, S.r);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].cx - ps[j].cx, ps[i].cy - ps[j].cy) >= 2 * S.r + 1, `field ${lv}: apart`);
    if (ps.length > 1) for (let t = 0; t < 2 * S.cycle; t += 0.1) assert.ok(ps.filter(p => sprinklerPhase(p, t) === "spray").length <= 1, `field ${lv} t=${t.toFixed(1)}: two sprays at once`);
    assert.equal(g.levelInfo.fallback, false);
  }
  assert.ok(counts.filter(n => n >= S.count[0]).length >= 17, `most levels have ${S.count[0]}–${S.count[1]}: ${counts.join(" ")}`);
});

test("sprinklers: the cycle is off → 1 s of drip → 5 s of spray, every 20 s (log and phases)", () => {
  const g = clearField("field", [sprinkler(10.5, 9.5, 0)]);
  const seen = [];
  for (let i = 0; i < Math.round(55 / DT); i++) {
    const was = g.trick.st.ph[0];
    withGame(g, () => stepTrick(DT));
    if (g.trick.st.ph[0] !== was) seen.push([g.trick.st.ph[0], Math.round(g.trick.t * 10) / 10]);
  }
  const at = [[S.cycle - S.spray - S.warn, "drip"], [S.cycle - S.spray, "spray"], [S.cycle, "off"], [2 * S.cycle - S.spray - S.warn, "drip"], [2 * S.cycle - S.spray, "spray"], [2 * S.cycle, "off"], [3 * S.cycle - S.spray - S.warn, "drip"]];
  assert.deepEqual(seen.map(s => s[0]), at.map(a => a[1]));
  seen.forEach((s, i) => assert.ok(Math.abs(s[1] - at[i][0]) <= DT + 0.05, `${s[0]} at ${s[1]} (want ${at[i][0]})`));
  assert.deepEqual([S.cycle, S.warn, S.spray, S.r], [20, 1, 5, 2]);
  assert.equal(g.events.filter(e => e.type === "sprinkler").length, seen.length);
  // the offset shifts the cycle
  assert.equal(sprinklerPhase(sprinkler(1, 1, 5), 10), "spray");
});

test("sprinklers: a kid in an active spray is hidden from Dad like in a bush; in the drip, off, or outside it he is seen", () => {
  const g = clearField("field", [sprinkler(18.5, 9.5, 0)]);
  const l = g.littles[0];
  Object.assign(l, { x: 18.5 * CELL + 20, y: 9.5 * CELL });                 // 4+ cells ahead of Dad, inside the spray's circle
  const seenAt = t => { g.trick.t = t - DT; withGame(g, () => { stepTrick(DT); return 0; }); return withGame(g, () => canSee(l)); };
  assert.equal(seenAt(5), true, "off: seen");
  assert.equal(seenAt(S.cycle - S.spray - S.warn + 0.2), true, "drip: seen");
  assert.equal(seenAt(S.cycle - S.spray + 0.2), false, "spray: hidden");
  Object.assign(l, { x: 18.5 * CELL + 3 * CELL });
  assert.equal(withGame(g, () => canSee(l)), true, "just outside the spray: seen");
});

test("sprinklers: Dad never walks into an active spray (his A* and his line keep out), whichever way he is going", () => {
  const g = clearField("field", [sprinkler(15.5, 9.5, 0)]);
  g.trick.t = S.cycle - S.spray - DT / 2;                                    // the spray starts now and lasts S.spray s
  const cx = 15.5 * CELL, cy = 9.5 * CELL, R = S.r * CELL;
  Object.assign(g.big, { x: cx - 5 * CELL, y: cy, dir: 0, state: "patrol", goal: { x: cx + 5 * CELL, y: cy }, patrolT: 30 });
  let worst = Infinity, steps = 0;
  withGame(g, () => {
    for (let i = 0; i < Math.round(S.spray / DT); i++) {
      stepTrick(DT); updateBig(DT); steps++;
      assert.equal(moveSolidBigAt(g.big.x, g.big.y), false, `step ${i}: Dad's centre in the spray at ${g.big.x | 0},${g.big.y | 0}`);
      worst = Math.min(worst, Math.hypot(g.big.x - cx, g.big.y - cy));
    }
  });
  assert.ok(steps > 100 && g.trick.st.ph[0] === "spray");
  assert.ok(worst > R * 0.7, `closest to the centre: ${worst | 0} px`);
});

test("sprinklers: Dad caught inside when the spray starts steps out of it", () => {
  const g = clearField("field", [sprinkler(15.5, 9.5, 0)]);
  g.trick.t = S.cycle - S.spray - DT / 2;
  const cx = 15.5 * CELL, cy = 9.5 * CELL;
  Object.assign(g.big, { x: cx, y: cy, dir: 0, state: "patrol", goal: { x: cx + 9 * CELL, y: cy }, patrolT: 30 });
  withGame(g, () => {
    for (let i = 0; i < Math.round(3 / DT); i++) { stepTrick(DT); updateBig(DT); }
  });
  assert.equal(g.trick.st.ph[0], "spray");
  assert.equal(moveSolidBigAt(g.big.x, g.big.y), false, `out of the spray by now (${g.big.x | 0},${g.big.y | 0})`);
  assert.ok(Math.hypot(g.big.x - cx, g.big.y - cy) > 0.8 * S.r * CELL);
});

test("sprinklers: the mask and the hide areas are exactly the active sprays and clear when they stop", () => {
  const g = clearField("field", [sprinkler(10.5, 9.5, 0), sprinkler(20.5, 9.5, 10)]);
  const states = [];
  for (let i = 0; i < Math.round(40 / DT); i++) {
    withGame(g, () => stepTrick(DT));
    const act = g.trick.pieces.filter((p, k) => g.trick.st.ph[k] === "spray").length;
    assert.equal(g.trick.fx.hide.length, act);
    assert.equal(!!g.trick.fx.noDad, act > 0);
    if (act) assert.equal(g.trick.fx.noDad.reduce((a, v) => a + v, 0), g.trick.pieces.filter((p, k) => g.trick.st.ph[k] === "spray").reduce((a, p) => a + cellsOf(p).length, 0));
    states.push(act);
  }
  assert.ok(states.includes(0) && states.includes(1) && Math.max(...states) === 1);
});

test("sprinklers: bots flee into a spray near them; the careful autopilot hides in it when Dad sees him", () => {
  const g = clearField("field", [sprinkler(15.5, 9.5, 0)]);
  g.trick.t = S.cycle - S.spray + 0.5; withGame(g, () => stepTrick(DT));   // active
  assert.equal(g.trick.fx.hide.length, 1);
  const cx = 15.5 * CELL, cy = 9.5 * CELL, b = g.littles[1], l = g.littles[0];
  // Dad at the spray's left looking right at a bot 2.5 cells from the spray's edge: it flees into the spray
  Object.assign(g.big, { x: cx - 3 * CELL, y: cy, dir: 0 });
  Object.assign(b, { kind: "bot", x: cx + 3.5 * CELL, y: cy + 10, fleeT: 0, fleeGoal: null, fleeRe: 0 });
  withGame(g, () => updateBots(DT));
  assert.equal(b.task, "flee");
  assert.deepEqual([b.fleeGoal.x, b.fleeGoal.y], [cx, cy], "the spray is the place to flee to");
  // the autopilot kid in his view, a spray 3 cells away: it heads for the spray
  Object.assign(l, { x: cx + 3.5 * CELL, y: cy });
  g.autoOn = true; g.autoStyle = "careful";
  withGame(g, () => autoDecide(l, g.inputs[l.slot] || (g.inputs[l.slot] = newInput()), DT));
  const v = g.autoMove[l.id];
  assert.ok(v && v.x < -0.5, `moves toward the spray centre (${JSON.stringify(v)})`);
  // out of reach: nothing special
  assert.equal(withGame(g, () => trickHideSpot({ x: 40, y: 40 }, S.hideReach * CELL)), null);
});

test("sprinklers: same seed, same sprays; Dad never in an active spray over a played Field level", () => {
  const deep = g => g.trick.fx.hide.some(h => Math.hypot(g.big.x - h.x, g.big.y - h.y) < h.r - CELL / 2);   // an active spray, Dad's centre more than half a cell inside its edge
  const run = seed => {
    const g = createGame({ world: "field", n: 4, seed, fx: false });
    g.autoOn = true; g.autoStyle = "careful";
    let inside = 0, run = 0;
    useGame(g);
    for (let i = 0; i < 3600; i++) { step(g, DT); if (deep(g)) { run++; inside = Math.max(inside, run); } else run = 0; }
    return { sig: JSON.stringify([g.trick.st, g.events.filter(e => e.type === "sprinkler").length, g.big.x, g.big.y]), inside };
  };
  const a = run(7), b = run(7);
  assert.equal(a.sig, b.sig);
  assert.ok(a.inside <= 2 / DT, `the longest stretch of steps with Dad's centre deep in an active spray: ${a.inside} (he walks out of one that starts under him, after a push he first stands)`);
});

test("AC 4: practice games have neither puddles nor sprinklers", () => {
  for (const world of ["park", "field"]) for (const practice of [1, 2]) {
    const g = createGame({ world, n: 1, practice, seed: 1, fx: false });
    assert.equal(g.trick, null);
    for (let i = 0; i < 300; i++) step(g, DT);
    assert.deepEqual(g.events.filter(e => e.type === "splash" || e.type === "sprinkler"), []);
  }
});
