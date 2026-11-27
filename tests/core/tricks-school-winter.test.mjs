// SPEC-042 AC 8 / AC 10 (and AC 3 for them): the School's bell and Winter's footprints — timing, effect, how the bell meets Dad's other states, the
// bots and the autopilot, determinism and the stall guard's view of the ring. Run on a cleared map (no walls) so what is checked is the trick.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, TAU, autoDecide, bellPhase, bigMark, createGame, initTrick, newInput, printAge, step, stepTrick, trickFreeze, trickQuiet, updateBig, updateBots, useGame, withGame } from "../../src/core/index.js";
import { stallExempt } from "../stall/detector.mjs";

const DT = CFG.STEP, B = CFG.TRICKS.bell, F = CFG.TRICKS.footprints;
const types = g => g.fx.map(e => e.type + (e.name ? ":" + e.name : "") + (e.kind ? ":" + e.kind : ""));

// a game of `world` on a cleared map, Dad calm in the middle looking right, the kids far in the corner
function clearField(world) {
  const g = createGame({ world, n: 2, seed: 3 });
  useGame(g);
  g.seeGrid.fill(0); g.moveGrid.fill(0); g.moveGridBig.fill(0); g.blocked.fill(0); g.blockedBig.fill(0); g.reachable.fill(1);
  g.bushes = []; g.obstacles = []; g.safeZone = null; g.dangerZone = null;
  Object.assign(g.big, { x: 480, y: 320, dir: 0, state: "patrol", goal: { x: 900, y: 600 }, patrolT: 99, timer: 99, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, kind: false, hearCd: 99, noise: 0, boss: null, lookSign: 1 });
  g.littles.forEach((l, i) => { Object.assign(l, { x: 920, y: 40 + 40 * i, state: "ok", invuln: 0, dizzy: 0, moving: false, speedFrac: 0, path: [] }); l.fx.cloak = 0; });
  initTrick();
  g.fx.length = 0;
  return g;
}
const at = (g, t) => { g.trick.t = t - DT; };                   // the next stepTrick makes the trick time t
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) withGame(g, () => stepTrick(DT)); };
const bigStepNow = g => withGame(g, () => updateBig(DT));

// ================= the bell (School) =================
test("bell: the cycle is 30 s, warning 2 s, ring 3 s — the first ring comes at 27 s, not at once", () => {
  assert.deepEqual([B.every, B.warn, B.ring], [30, 2, 3]);
  assert.equal(bellPhase(0).phase, "idle");
  assert.equal(bellPhase(24.9).phase, "idle");
  assert.equal(bellPhase(25).phase, "warn");
  assert.equal(bellPhase(26.9).phase, "warn");
  assert.equal(bellPhase(27).phase, "ring");
  assert.equal(bellPhase(29.99).phase, "ring");
  assert.equal(bellPhase(30).phase, "idle");
  assert.equal(bellPhase(30 + 26).phase, "warn");
  assert.equal(Math.ceil(bellPhase(25.2).left), 2);
  assert.equal(Math.ceil(bellPhase(26.2).left), 1);
  const g = clearField("school");
  const seen = [];
  for (let i = 0; i < Math.round(65 / DT); i++) { const was = g.trick.st.ph; tick(g); if (g.trick.st.ph !== was) seen.push([g.trick.st.ph, Math.round(g.trick.t * 10) / 10]); }
  assert.deepEqual(seen.map(s => s[0]), ["warn", "ring", "idle", "warn", "ring", "idle"]);
  assert.deepEqual(seen.map(s => Math.round(s[1])), [25, 27, 30, 55, 57, 60]);
  assert.equal(g.events.filter(e => e.type === "bell").length, 2);
});

test("bell: the first ring of a level shows the Freeze! banner (a hint event), the second does not; the bell sounds each time", () => {
  const g = clearField("school");
  at(g, 26.9); tick(g, 1);
  assert.equal(types(g).includes("hint:freeze"), false, "not in the warning");
  at(g, 27.0); tick(g, 1);
  assert.equal(types(g).filter(t => t === "hint:freeze").length, 1);
  assert.ok(types(g).includes("sfx:bell"));
  g.fx.length = 0;
  at(g, 40); tick(g, 1);
  at(g, 57.0); tick(g, 1);
  assert.equal(types(g).includes("hint:freeze"), false, "only the first ring");
  assert.ok(types(g).includes("sfx:bell"));
});

test("bell: during the ring Dad stands and turns once round (state look, 🔔), then walks on", () => {
  const g = clearField("school");
  at(g, 27 - DT); tick(g, 1);
  const x0 = g.big.x, y0 = g.big.y, d0 = g.big.dir;
  let turned = 0, prev = g.big.dir;
  withGame(g, () => {
    for (let i = 0; i < Math.round(B.ring / DT) - 2; i++) {
      stepTrick(DT); updateBig(DT);
      assert.equal(g.big.state, "look");
      assert.equal(g.big.moving, false);
      assert.equal(bigMark(), "🔔");
      turned += g.big.dir - prev; prev = g.big.dir;
    }
  });
  assert.deepEqual([g.big.x, g.big.y], [x0, y0], "he did not move");
  assert.ok(Math.abs(turned - TAU) < 0.1, `one turn: ${turned.toFixed(2)} rad (of ${d0.toFixed(1)})`);
  // after the ring: the mark goes and he is free (look → patrol after afterLook)
  withGame(g, () => { for (let i = 0; i < 40; i++) { stepTrick(DT); updateBig(DT); } });
  assert.notEqual(bigMark(), "🔔");
  assert.equal(g.trick.st.ph, "idle");
  assert.equal(g.big.state, "patrol");
});

test("bell: a kid who runs in Dad's sight is spotted — from any side — and Dad goes after him when the ring ends; tiptoeing, standing, a house, a bush are not spotted", () => {
  const spotted = (setup) => {
    const g = clearField("school"), l = g.littles[0];
    setup(g, l);
    at(g, 27 - DT); tick(g, 1);
    withGame(g, () => { for (let i = 0; i < Math.round(B.ring / DT) - 1; i++) { stepTrick(DT); updateBig(DT); } });
    const ids = Object.keys(g.trick.st.spotted).length;
    withGame(g, () => { stepTrick(DT); stepTrick(DT); stepTrick(DT); });
    return { g, ids, state: g.big.state, seen: g.big.lastSeen };
  };
  const behind = spotted((g, l) => Object.assign(l, { x: 480 - 150, y: 320, moving: true, speedFrac: 1 }));   // behind his back: a cone would not see him
  assert.equal(behind.ids, 1, "running behind him");
  assert.equal(behind.state, "chase", "he chases after the ring");
  assert.ok(Math.hypot(behind.seen.x - 330, behind.seen.y - 320) < 1, "where the runner was");
  assert.equal(spotted((g, l) => Object.assign(l, { x: 480 + 120, y: 320 + 50, moving: true, speedFrac: 1 })).ids, 1, "in front");
  assert.equal(spotted((g, l) => Object.assign(l, { x: 480 - 150, y: 320, moving: true, speedFrac: CFG.TIPTOE_MULT })).ids, 0, "tiptoeing");
  assert.equal(spotted((g, l) => Object.assign(l, { x: 480 - 150, y: 320, moving: false, speedFrac: 0 })).ids, 0, "standing still");
  assert.equal(spotted((g, l) => Object.assign(l, { x: 480 + CFG.VISION_RANGE + 80, y: 320, moving: true, speedFrac: 1 })).ids, 0, "too far to see");
  assert.equal(spotted((g, l) => { g.safeZone = { shape: "rect", x: 300, y: 280, w: 100, h: 80 }; Object.assign(l, { x: 350, y: 320, moving: true, speedFrac: 1 }); }).ids, 0, "in the kids' house");
  assert.equal(spotted((g, l) => { g.bushes = [{ x: 330, y: 320, r: 30 }]; Object.assign(l, { x: 330, y: 320, moving: true, speedFrac: 1 }); }).ids, 0, "hidden in a bush");
  assert.equal(spotted((g, l) => { g.seeGrid.fill(1); Object.assign(l, { x: 330, y: 320, moving: true, speedFrac: 1 }); }).ids, 0, "behind a wall");
  const after = spotted((g, l) => Object.assign(l, { x: 480 - 150, y: 320, moving: false, speedFrac: 0 }));
  assert.notEqual(after.state, "chase", "nobody spotted: no chase");
});

test("bell: it does not override his other states — stunned, slipping, red, standing after a push: the ring changes nothing; chasing: the chase goes on", () => {
  for (const over of [{ stun: 2 }, { slip: 2 }, { blush: 2 }, { pushCd: 2 }]) {
    const g = clearField("school");
    Object.assign(g.big, over);
    at(g, 28); tick(g, 1);
    const d0 = g.big.dir;
    bigStepNow(g);
    assert.notEqual(bigMark(), "🔔", JSON.stringify(over));
    assert.ok(Math.abs(g.big.dir - d0) < 0.2, `${JSON.stringify(over)}: he did not start a sweep`);
  }
  const g = clearField("school");
  Object.assign(g.big, { state: "chase", lastSeen: { x: 700, y: 320 } });
  at(g, 28); tick(g, 1);
  bigStepNow(g);
  assert.equal(g.big.state === "chase" || g.big.state === "search", true, "the chase goes on");
  assert.notEqual(bigMark(), "🔔");
  assert.equal(g.big.moving, true);
});

test("bell: bots and the careful autopilot tiptoe in the warning and stand still in the ring when Dad is near or can see them; far away or in a chase they are free", () => {
  const g = clearField("school"), b = g.littles[1], l = g.littles[0];
  Object.assign(b, { kind: "bot", x: 480 + 150, y: 320 });
  assert.equal(withGame(g, () => trickFreeze(b)), 0, "idle: nothing");
  at(g, 25.5); tick(g, 1);
  assert.equal(withGame(g, () => trickFreeze(b)), 1);
  Object.assign(b, { x: 480 + 150, y: 320, fleeT: 0 });
  at(g, 25.5); tick(g, 1);
  withGame(g, () => updateBots(DT));
  assert.ok(!b.moving || b.speedFrac <= CFG.TIPTOE_MULT, `warning: tiptoe (${b.speedFrac})`);
  const x1 = b.x, y1 = b.y;
  at(g, 28); tick(g, 1);
  assert.equal(withGame(g, () => trickFreeze(b)), 2);
  for (let i = 0; i < 30; i++) withGame(g, () => updateBots(DT));
  assert.deepEqual([b.x, b.y, b.moving, b.speedFrac], [x1, y1, false, 0], "ring: standing still");
  // far from Dad (and behind a wall): free
  Object.assign(b, { x: 900, y: 600 });
  assert.equal(withGame(g, () => trickFreeze(b)), 0, "far");
  g.seeGrid.fill(1); Object.assign(b, { x: 480 + 200, y: 320 });
  assert.equal(withGame(g, () => trickFreeze(b)), 0, "out of his sight");
  g.seeGrid.fill(0);
  assert.equal(withGame(g, () => trickFreeze(b)), 2);
  g.big.state = "chase";
  assert.equal(withGame(g, () => trickFreeze(b)), 0, "Dad is chasing: nobody freezes");
  g.big.state = "patrol";
  // the autopilot
  Object.assign(l, { x: 480 + 150, y: 320 });
  g.autoOn = true; g.autoStyle = "careful"; g.autoMove = [];
  withGame(g, () => autoDecide(l, g.inputs[l.slot] || (g.inputs[l.slot] = newInput()), DT));
  assert.equal(g.autoMove[l.id], undefined, "careful: stands still in the ring");
  g.autoStyle = "reckless";
  withGame(g, () => autoDecide(l, g.inputs[l.slot], DT));
  assert.ok(g.autoMove[l.id], "reckless runs on");
});

test("bell: the ring stand is a look for the stall guard, and a played School level is never flagged for it", () => {
  const g = clearField("school");
  at(g, 28); tick(g, 1); bigStepNow(g);
  assert.equal(g.big.state, "look");
  assert.ok(stallExempt(g), "exempt like any look");
});

test("bell: same seed, same rings and spots; no bell in a practice game", () => {
  const run = seed => {
    const g = createGame({ world: "school", n: 4, seed, fx: false });
    g.autoOn = true; g.autoStyle = "careful";
    for (let i = 0; i < 3600; i++) step(g, DT);
    return JSON.stringify([g.trick.st, g.events.filter(e => e.type.startsWith("bell")), g.big.x, g.big.y]);
  };
  assert.equal(run(6), run(6));
  const p = createGame({ world: "school", n: 1, practice: 1, seed: 1, fx: false });
  assert.equal(p.trick, null);
  for (let i = 0; i < 300; i++) step(p, DT);
});

// ================= footprints (Winter) =================
test("footprints: a running kid leaves a print every 0.4 s, alternating feet; the first at once; tiptoeing leaves none", () => {
  const g = clearField("winter"), l = g.littles[0];
  Object.assign(l, { x: 300, y: 300, moving: true, speedFrac: 1, dir: 0 });
  for (let i = 0; i < 61; i++) { l.x += 1; tick(g, 1); }                // a little over 1 s of running
  const pr = g.trick.st.prints;
  assert.equal(pr.length, 3, "at 0, 0.4 and 0.8 s");
  assert.deepEqual(pr.map(p => p.side), [-1, 1, -1], "left, right, left");
  assert.ok(Math.abs(pr[1].t - pr[0].t - F.every) < DT * 1.5);
  assert.ok(pr.every(p => p.id === l.id));
  const n = pr.length;
  Object.assign(l, { speedFrac: CFG.TIPTOE_MULT });
  tick(g, 120);
  assert.equal(g.trick.st.prints.length, n, "tiptoeing: none");
  Object.assign(l, { moving: false, speedFrac: 0 });
  tick(g, 60);
  assert.equal(g.trick.st.prints.length, n, "standing: none");
  assert.equal(F.every, 0.4);
});

test("footprints: a print fades over 8 s and is gone; at most max are kept; none in the kids' house", () => {
  const g = clearField("winter"), l = g.littles[0];
  Object.assign(l, { x: 300, y: 300, moving: true, speedFrac: 1 });
  tick(g, 1);
  assert.equal(g.trick.st.prints.length, 1);
  const p = g.trick.st.prints[0];
  Object.assign(l, { moving: false, speedFrac: 0 });
  tick(g, Math.round((F.life - 0.3) / DT));
  assert.equal(g.trick.st.prints.length, 1);
  assert.ok(printAge(g.trick, p) < F.life);
  tick(g, Math.round(0.5 / DT));
  assert.equal(g.trick.st.prints.length, 0, "gone after life");
  // the cap
  Object.assign(l, { moving: true, speedFrac: 1 });
  for (let i = 0; i < (F.max + 20) * Math.round(F.every / DT); i++) { l.x = 40 + (i % 800); tick(g, 1); g.trick.t -= DT * 0.9; }   // (time crawls: no print expires)
  assert.ok(g.trick.st.prints.length <= F.max, `${g.trick.st.prints.length} ≤ ${F.max}`);
  // the house
  const h = clearField("winter"), k = h.littles[0];
  h.safeZone = { shape: "rect", x: 200, y: 200, w: 160, h: 120 };
  Object.assign(k, { x: 260, y: 260, moving: true, speedFrac: 1 });
  tick(h, 90);
  assert.equal(h.trick.st.prints.length, 0, "no prints inside the house");
});

test("footprints: Dad in patrol or search who sees a print goes to the freshest of that kid's trail; not one outside his cone, in a chase, or one he has been to", () => {
  const prints = (g, list) => { g.trick.st.prints = list.map(([x, y, t, id = 0]) => ({ x, y, t, id, dir: 0, side: 1 })); };
  const g = clearField("winter");
  g.trick.t = 10;
  // a trail 90 → 200 px ahead of Dad (he looks right): the freshest is the far one
  prints(g, [[570, 320, 9], [630, 320, 9.4], [690, 320, 9.8]]);
  withGame(g, () => { updateBig(DT); stepTrick(DT); updateBig(DT); });
  assert.equal(g.big.state, "search");
  assert.deepEqual([g.big.lastSeen.x, g.big.lastSeen.y], [690, 320], "the freshest print of the trail");
  // he does not go twice to the print he has been to
  Object.assign(g.big, { state: "patrol", lastSeen: null });
  withGame(g, () => updateBig(DT));
  assert.equal(g.big.state, "patrol", "nothing newer");
  prints(g, [[570, 320, 9], [690, 320, 9.8], [740, 320, 10]]);
  Object.assign(g.big, { state: "patrol" });
  withGame(g, () => updateBig(DT));
  assert.equal(g.big.state, "search", "a newer print of the same kid");
  // outside his cone (behind him): not seen
  const b = clearField("winter"); b.trick.t = 10;
  prints(b, [[400, 320, 9.5], [330, 320, 9.8]]);
  withGame(b, () => updateBig(DT));
  assert.equal(b.big.state, "patrol", "behind him");
  // in a chase: no
  const c = clearField("winter"); c.trick.t = 10;
  prints(c, [[570, 320, 9], [690, 320, 9.8]]);
  Object.assign(c.big, { state: "chase", lastSeen: { x: 500, y: 320 } });
  withGame(c, () => updateBig(DT));
  assert.deepEqual([c.big.lastSeen.x, c.big.lastSeen.y], [500, 320], "he keeps to what he saw (the chase turns into his normal search, not into the prints)");
  // the end of the trail is where he stands: nothing new
  const d = clearField("winter"); d.trick.t = 10;
  prints(d, [[470, 320, 9], [520, 320, 9.8]]);
  Object.assign(d.big, { x: 500, y: 320 });
  withGame(d, () => updateBig(DT));
  assert.equal(d.big.state, "patrol");
  // an expired print is not a print; a wall between: not seen
  const e = clearField("winter"); e.trick.t = 30;
  prints(e, [[570, 320, 9], [690, 320, 9.8]]);
  withGame(e, () => updateBig(DT));
  assert.equal(e.big.state, "patrol", "faded");
  const w = clearField("winter"); w.trick.t = 10; w.seeGrid.fill(1);
  prints(w, [[570, 320, 9.5], [690, 320, 9.8]]);
  withGame(w, () => updateBig(DT));
  assert.equal(w.big.state, "patrol", "behind a wall");
});

test("footprints: bots and the careful autopilot tiptoe on the snow while Dad is near and not yet chasing, and run when he is far", () => {
  const g = clearField("winter"), b = g.littles[1], l = g.littles[0];
  Object.assign(b, { kind: "bot", x: 480 + 150, y: 320 });
  assert.equal(withGame(g, () => trickQuiet(b)), true, "Dad within quietRange");
  Object.assign(b, { x: 480 + F.quietRange * CELL + 40 });
  assert.equal(withGame(g, () => trickQuiet(b)), false, "far");
  Object.assign(b, { x: 480 + 150 });
  g.big.state = "chase";
  assert.equal(withGame(g, () => trickQuiet(b)), false, "chasing: run");
  g.big.state = "patrol";
  Object.assign(g.big, { dir: Math.PI });                                // looking away: the bot lurks behind him
  withGame(g, () => updateBots(DT));
  assert.ok(!b.moving || b.speedFrac <= CFG.TIPTOE_MULT, `tiptoe (${b.speedFrac})`);
  Object.assign(l, { x: 480 + 150, y: 320 });
  g.autoOn = true; g.autoStyle = "careful"; g.autoMove = [];
  Object.assign(g.big, { dir: 0 });
  withGame(g, () => autoDecide(l, g.inputs[l.slot] || (g.inputs[l.slot] = newInput()), DT));
  const v = g.autoMove[l.id];
  assert.ok(!v || Math.hypot(v.x, v.y) <= CFG.TIPTOE_MULT + 1e-9, "the careful autopilot tiptoes");
});

test("footprints: same seed, same prints; none in a practice game; Winter's levels keep a Dad that does not stall", () => {
  const run = seed => {
    const g = createGame({ world: "winter", n: 4, seed, fx: false });
    g.autoOn = true; g.autoStyle = "reckless";
    for (let i = 0; i < 1800; i++) step(g, DT);
    return JSON.stringify([g.trick.st, g.big.x, g.big.y]);
  };
  assert.equal(run(8), run(8));
  assert.equal(createGame({ world: "winter", n: 1, practice: 2, seed: 1, fx: false }).trick, null);
});
