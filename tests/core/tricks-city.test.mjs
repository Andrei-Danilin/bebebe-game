// SPEC-042 AC 7 (and AC 3 for it): the City's ice-cream truck — a loop of open 2-cell-wide lanes found with the level, a slow drive, a 2 × 1 sight
// blocker, a stop for whoever is in front, no truck where there is no lane, the bots and the autopilot behind it. Motion and sight run on a cleared map
// with a hand-made ring so what is checked is the truck, not the level around it.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, COLS, ROWS, TRICK_MODS, autoDecide, canSee, cellsOf, createGame, forbiddenCells, initTrick, levelReport, levelsPerWorld, newInput, step, stepTrick,
  trickHideSpot, truckAt, useGame, withGame, generateLevel } from "../../src/core/index.js";

const DT = CFG.STEP, C = CFG.TRICKS.truck;
const LV = Array.from({ length: levelsPerWorld() }, (_, i) => i + 1);

// a ring of window nodes around (x0, y0)–(x0 + w, y0 + h), clockwise, one per cell step (the shape the generator makes)
function ring(x0, y0, w, h) {
  const out = [];
  for (let x = x0; x < x0 + w; x++) out.push([x, y0]);
  for (let y = y0; y < y0 + h; y++) out.push([x0 + w, y]);
  for (let x = x0 + w; x > x0; x--) out.push([x, y0 + h]);
  for (let y = y0 + h; y > y0; y--) out.push([x0, y]);
  return out;
}
// a City game on a cleared map with the truck on a hand-made ring; Dad and the kids far away unless a test moves them
function field(nodes = ring(6, 4, 8, 6), start = 0) {
  const g = createGame({ world: "city", n: 2, seed: 3 });
  useGame(g);
  g.seeGrid.fill(0); g.moveGrid.fill(0); g.moveGridBig.fill(0); g.blocked.fill(0); g.blockedBig.fill(0); g.reachable.fill(1);
  g.bushes = []; g.obstacles = []; g.safeZone = null; g.dangerZone = null;
  Object.assign(g.big, { x: 40, y: 600, dir: 0, state: "look", timer: 99, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, kind: false, boss: null });
  g.littles.forEach((l, i) => { Object.assign(l, { x: 920, y: 600 - 30 * i, state: "ok", invuln: 0, dizzy: 0, moving: false, speedFrac: 0, path: [] }); l.fx.cloak = 0; });
  g.trick.pieces = [{ shape: "loop", cx: nodes[0][0] + 1, cy: nodes[0][1] + 1, nodes, cells: [], start }];
  initTrick();
  g.fx.length = 0;
  return g;
}
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) withGame(g, () => stepTrick(DT)); };

test("City: every level has one truck on a loop of 16–64 cells; the lane is free ground, clear of houses and aprons, closed, step by step", () => {
  const loops = [];
  for (const lv of LV) {
    const rep = levelReport("city", lv);
    assert.equal(rep.fallback, false);
    assert.equal(rep.trick.name, "truck");
    assert.equal(rep.trick.n, 1, `city ${lv}: a truck (loop ${rep.trick.loop})`);
    const g = createGame({ world: "city", n: lv, seed: 1, fx: false }), p = g.trick.pieces[0], nodes = p.nodes;
    assert.ok(nodes.length >= C.minLoop && nodes.length <= C.maxLoop, `city ${lv}: loop of ${nodes.length}`);
    loops.push(nodes.length);
    assert.equal(new Set(nodes.map(n => n.join())).size, nodes.length, "no window twice");
    nodes.forEach((n, i) => { const m = nodes[(i + 1) % nodes.length]; assert.equal(Math.abs(n[0] - m[0]) + Math.abs(n[1] - m[1]), 1, `city ${lv}: a step of one cell`); });
    const { house, apron } = forbiddenCells(generateLevel("city", lv, g.levelInfo.attempt));
    for (const i of cellsOf(p)) assert.ok(!g.blocked[i] && !house[i] && !apron[i], `city ${lv}: lane cell ${i % COLS},${(i / COLS) | 0} is free ground`);
    // the 2-wide lane: all four cells of every window are lane cells
    const lane = new Set(cellsOf(p));
    for (const [x, y] of nodes) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.ok(lane.has((y + dy) * COLS + x + dx));
  }
  assert.ok(Math.max(...loops) > Math.min(...loops), `loops differ: ${loops.join(" ")}`);
});

test("City: the loop and the start come from the level — the same every time; another level, another lane; no other world has a truck", () => {
  const a = createGame({ world: "city", n: 7, seed: 1, fx: false }).trick.pieces, b = createGame({ world: "city", n: 7, seed: 99, fx: false }).trick.pieces;
  assert.deepEqual(a, b);
  const sigs = new Set(LV.map(lv => JSON.stringify(createGame({ world: "city", n: lv, seed: 1, fx: false }).trick.pieces[0].nodes)));
  assert.ok(sigs.size >= 10, `${sigs.size} different loops over 20 levels`);
  for (const w of ["park", "field", "school", "beach", "winter"]) assert.notEqual(createGame({ world: w, n: 3, seed: 1, fx: false }).trick.name, "truck");
});

test("truck: it drives the loop at speedMul × a kid's speed (2 × 1 cells) and comes back to where it started", () => {
  const nodes = ring(6, 4, 8, 6), g = field(nodes), T = g.trick;
  const v = CFG.PLAYER_SPEED * C.speedMul;                                  // px/s
  assert.equal(C.speedMul, 0.5);
  const p0 = { x: T.st.x, y: T.st.y };
  tick(g, 60);
  const moved = Math.hypot(T.st.x - p0.x, T.st.y - p0.y);
  assert.ok(Math.abs(moved - v) < 0.5, `moved ${moved.toFixed(2)} px in 1 s, want ${v}`);
  const L = nodes.length * CELL, steps = Math.round(L / v / DT);
  tick(g, steps - 60);
  assert.ok(Math.hypot(T.st.x - p0.x, T.st.y - p0.y) < 2, "once round");
  // the body is 2 cells long in the way it points, 1 across; it follows the lane's corners
  const r = T.fx.sight[0];
  assert.deepEqual([Math.max(r.w, r.h), Math.min(r.w, r.h)], [2 * CELL, CELL]);
  assert.equal(T.st.horizontal, r.w > r.h);
  const seenDirs = new Set();
  for (let i = 0; i < steps; i++) { tick(g, 1); seenDirs.add(T.st.horizontal + ":" + Math.round(T.st.dir * 100)); }
  assert.equal(seenDirs.size, 4, "east, south, west, north");
  const at = truckAt(nodes, 0);
  assert.deepEqual([at.x, at.y], [(nodes[0][0] + 1) * CELL, (nodes[0][1] + 1) * CELL]);
});

test("truck: it blocks Dad's line of sight like a wall — a kid behind it is not seen, beside it he is; it never moves anybody", () => {
  const g = field(), T = g.trick, l = g.littles[0];
  // Dad left of the truck's top lane, looking right along it; the truck at the lane's middle
  tick(g, 1);
  const c = { x: T.st.x, y: T.st.y };
  Object.assign(g.big, { x: c.x - 4 * CELL, y: c.y, dir: 0 });
  Object.assign(l, { x: c.x + 3 * CELL, y: c.y });
  if (!T.st.horizontal) assert.fail("the test needs the truck on the top lane");
  assert.equal(withGame(g, () => canSee(l)), false, "behind the truck");
  Object.assign(l, { y: c.y + 45 });
  assert.equal(withGame(g, () => canSee(l)), true, "beside it, out of the line");
  const pos = [l.x, l.y, g.big.x, g.big.y];
  tick(g, 120);
  assert.deepEqual([l.x, l.y, g.big.x, g.big.y], pos, "the truck pushed nobody");
});

test("truck: it stops while a kid or Dad is in front of it (or in it), goes on when they leave, and after maxWait goes on anyway", () => {
  const g = field(), T = g.trick, l = g.littles[0];
  tick(g, 1);
  const front = (who, ahead) => Object.assign(who, { x: T.st.x + Math.cos(T.st.dir) * ahead, y: T.st.y + Math.sin(T.st.dir) * ahead });
  const s0 = T.st.s;
  front(l, 1.5 * CELL);
  tick(g, 30);
  assert.equal(T.st.stopped, true);
  assert.equal(T.st.s, s0, "it did not move while a kid stood in front");
  assert.equal(g.events.filter(e => e.type === "truckStop").length, 1);
  Object.assign(l, { x: 920, y: 600 });
  tick(g, 5);
  assert.equal(T.st.stopped, false);
  assert.equal(g.events.filter(e => e.type === "truckGo").length, 1);
  assert.ok(T.st.s > s0 + 2, "it is going again");
  // Dad in front stops it too
  front(g.big, 1.2 * CELL);
  tick(g, 5);
  assert.equal(T.st.stopped, true, "Dad in front");
  // somebody who stays: after maxWait it goes on (a second and a half through them), then stops again
  const sStop = T.st.s;
  tick(g, Math.round((C.maxWait - 0.2) / DT));
  assert.equal(T.st.s, sStop, "still waiting");
  tick(g, Math.round(0.5 / DT));
  assert.ok(T.st.s > sStop, "after maxWait it goes on");
  assert.ok(g.events.some(e => e.type === "truckGo"));
  // someone behind it does not stop it
  Object.assign(g.big, { x: 40, y: 600 });
  tick(g, 2);
  front(l, -3 * CELL);
  const s1 = T.st.s;
  tick(g, 60);
  assert.ok(T.st.s > s1 + 40, "a kid behind it is no reason to wait");
});

test("truck: a level with no lane has no truck, and the level is the same", () => {
  const mod = TRICK_MODS.truck, full = new Uint8Array(COLS * ROWS).fill(1);
  const r = mod.place({ occ: full, rng: () => 0.5 });
  assert.deepEqual(r.pieces, []);
  assert.equal(r.meta.loop, "none");
  // a game with no truck runs
  const g = createGame({ world: "city", n: 2, seed: 1, fx: false });
  g.trick.pieces = []; withGame(g, () => initTrick());
  assert.ok(g.events.some(e => e.type === "truckNone"), "the missing lane is logged (AC 7)");
  for (let i = 0; i < 60; i++) step(g, DT);
  assert.deepEqual(g.trick.fx.sight, []);
});

test("truck: same seed, same drive (a played City level with the autopilot)", () => {
  const run = seed => {
    const g = createGame({ world: "city", n: 5, seed, fx: false });
    g.autoOn = true; g.autoStyle = "careful";
    for (let i = 0; i < 1800; i++) step(g, DT);
    return JSON.stringify([g.trick.st, g.events.filter(e => e.type.startsWith("truck")).length, g.big.x, g.big.y]);
  };
  assert.equal(run(4), run(4));
});

test("truck: bots flee to its far side from Dad, where Dad cannot see them; the careful autopilot goes there when Dad looks at him", () => {
  const g = field(), T = g.trick, b = g.littles[1], l = g.littles[0];
  tick(g, 1);
  const c = { x: T.st.x, y: T.st.y };
  // Dad 5 cells before the truck looking at it; a bot just beside the truck's rear corner is seen and flees
  Object.assign(g.big, { x: c.x - 5 * CELL, y: c.y + 2, dir: 0 });
  Object.assign(b, { kind: "bot", x: c.x + 1.5 * CELL, y: c.y + 1.3 * CELL, fleeT: 0, fleeGoal: null, fleeRe: 0 });
  const spot = withGame(g, () => trickHideSpot(b));
  assert.ok(spot, "a spot behind the truck");
  assert.ok(spot.x > c.x + CELL, "on the far side from Dad");
  Object.assign(b, { x: spot.x, y: spot.y });
  assert.equal(withGame(g, () => canSee(b)), false, "Dad cannot see a bot there");
  Object.assign(b, { x: c.x + 1.5 * CELL, y: c.y + 1.3 * CELL });
  withGame(g, () => step(g, DT));
  assert.equal(b.task, "flee");
  assert.ok(b.fleeGoal.x > c.x + CELL * 0.5, `flees behind the truck (${b.fleeGoal.x | 0} vs the truck at ${c.x | 0})`);
  // out of reach: no spot
  assert.equal(withGame(g, () => trickHideSpot({ x: 900, y: 40 })), null);
  // the autopilot kid in Dad's view near the truck heads for the spot
  Object.assign(l, { x: c.x + 0.5 * CELL, y: c.y + 2.2 * CELL });
  g.autoOn = true; g.autoStyle = "careful";
  g.autoMove = [];
  withGame(g, () => autoDecide(l, g.inputs[l.slot] || (g.inputs[l.slot] = newInput()), DT));
  assert.ok(g.autoMove[l.id], "it moves");
});

test("AC 4: practice games have no truck", () => {
  for (const practice of [1, 2]) assert.equal(createGame({ world: "city", n: 1, practice, seed: 1, fx: false }).trick, null);
});

test("truck: it hides only what is BEHIND it — a kid standing inside its body is seen, and Dad standing inside it is not blind", () => {
  const g = field(), T = g.trick, l = g.littles[0];
  tick(g, 1);
  const c = { x: T.st.x, y: T.st.y };
  Object.assign(g.big, { x: c.x - 4 * CELL, y: c.y, dir: 0 });
  Object.assign(l, { x: c.x + 3 * CELL, y: c.y });
  assert.equal(withGame(g, () => canSee(l)), false, "behind the truck: hidden");
  Object.assign(l, { x: c.x, y: c.y });
  assert.equal(withGame(g, () => canSee(l)), true, "in the truck, in Dad's cone: seen");
  Object.assign(l, { x: c.x + 0.5 * CELL, y: c.y });
  assert.equal(withGame(g, () => canSee(l)), true, "still inside the body (half a cell from its middle)");
  // Dad inside the body looks out at a kid in front of him
  Object.assign(g.big, { x: c.x, y: c.y, dir: 0 });
  Object.assign(l, { x: c.x + 3 * CELL, y: c.y });
  assert.equal(withGame(g, () => canSee(l)), true, "Dad in the truck sees out");
  // walls still hide: a wall on the line hides a kid inside the truck's reach
  g.seeGrid.fill(1);
  assert.equal(withGame(g, () => canSee(l)), false, "walls always hide");
});
