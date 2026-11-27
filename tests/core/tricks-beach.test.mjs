// SPEC-042 AC 9 (and AC 3 for it): the Beach's waves — a shore band placed along a map edge with the level, a wave that comes up for 6 s every 20 s,
// kids slowed to 60 % in it, Dad kept out of it (and walking out of it), the bots and the autopilot going round it. Motion and Dad's rules run on a
// cleared map with a hand-made band so what is checked is the trick.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, COLS, ROWS, createGame, forbiddenCells, generateLevel, initTrick, levelsPerWorld, moveSolidBigAt, moveSpeed, step, steerPoint, stepTrick, trickDadSolid,
  trickKidCost, updateBig, useGame, wavePhase, withGame } from "../../src/core/index.js";

const DT = CFG.STEP, W9 = CFG.TRICKS.waves;
const LV = Array.from({ length: levelsPerWorld() }, (_, i) => i + 1);
const strip = (edge, a, len) => {
  const d = W9.depth;
  const r = edge === "bottom" ? { x: a, y: ROWS - d, w: len, h: d } : edge === "top" ? { x: a, y: 0, w: len, h: d } : edge === "left" ? { x: 0, y: a, w: d, h: len } : { x: COLS - d, y: a, w: d, h: len };
  return { shape: "rect", ...r, edge, a, len, off: 0 };
};
function field(pieces) {
  const g = createGame({ world: "beach", n: 2, seed: 3 });
  useGame(g);
  g.seeGrid.fill(0); g.moveGrid.fill(0); g.moveGridBig.fill(0); g.blocked.fill(0); g.blockedBig.fill(0); g.reachable.fill(1);
  g.bushes = []; g.obstacles = []; g.safeZone = null; g.dangerZone = null;
  Object.assign(g.big, { x: 480, y: 320, dir: 0, state: "patrol", goal: { x: 480, y: 320 }, patrolT: 99, timer: 99, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, kind: false, hearCd: 99, noise: 0, boss: null });
  g.littles.forEach((l, i) => { Object.assign(l, { x: 920, y: 40 + 40 * i, state: "ok", invuln: 0, dizzy: 0, moving: false, speedFrac: 0, path: [] }); l.fx.cloak = 0; l.fx.boots = 0; });
  g.trick.pieces = pieces; g.trick.meta = { off: 0 };
  initTrick();
  g.fx.length = 0;
  return g;
}
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) withGame(g, () => stepTrick(DT)); };
const up = g => { g.trick.t = W9.every - W9.time - DT / 2; tick(g, 2); return g; };   // the wave has just come up

test("waves: a shore band on every Beach level — strips 2 cells deep on one edge, mostly the bottom one, on free ground, clear of houses and aprons", () => {
  let bottom = 0;
  for (const lv of LV) {
    const g = createGame({ world: "beach", n: lv, seed: 1, fx: false }), ps = g.trick.pieces;
    assert.equal(g.trick.name, "waves");
    assert.ok(ps.length >= 1, `beach ${lv}: a band (${g.trick.meta.edge})`);
    assert.ok(new Set(ps.map(p => p.edge)).size === 1, "one edge");
    if (ps[0].edge === "bottom") bottom++;
    const { house, apron } = forbiddenCells(generateLevel("beach", lv, g.levelInfo.attempt));
    let cells = 0;
    for (const p of ps) {
      assert.equal(Math.min(p.w, p.h), W9.depth, "2 cells deep");
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= COLS && p.y + p.h <= ROWS, "inside the map");
      assert.ok(Math.max(p.w, p.h) >= W9.minRun);
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) { const i = y * COLS + x; cells++; assert.ok(!g.blocked[i] && !house[i] && !apron[i], `beach ${lv}: band cell ${x},${y} is free ground`); }
    }
    assert.ok(cells >= 2 * 5, `beach ${lv}: ${cells} cells`);
    assert.equal(g.levelInfo.fallback, false);
  }
  assert.ok(bottom >= 15, `the bottom edge on ${bottom} of 20 levels`);
});

test("waves: the wave comes up for 6 s every 20 s (calm 14 s), rises and runs back smoothly; same seed, same band and phase", () => {
  assert.deepEqual([W9.every, W9.time, W9.slowMul, W9.depth], [20, 6, 0.6, 2]);
  assert.equal(wavePhase(0).up, false);
  assert.equal(wavePhase(13.9).up, false);
  assert.equal(wavePhase(14).up, true);
  assert.equal(wavePhase(19.99).up, true);
  assert.equal(wavePhase(20).up, false);
  assert.equal(wavePhase(14 + 20).up, true);
  assert.ok(wavePhase(14.1).k < 0.1 && wavePhase(14.8).k > 0.99 && wavePhase(17).k === 1 && wavePhase(19.9).k < 0.1, "rises, holds, runs back");
  assert.equal(wavePhase(5, 10).up, true, "the offset shifts the cycle");
  const g = field([strip("bottom", 4, 10)]), seen = [];
  for (let i = 0; i < Math.round(45 / DT); i++) { const was = g.trick.st.up; tick(g); if (g.trick.st.up !== was) seen.push([g.trick.st.up, Math.round(g.trick.t)]); }
  assert.deepEqual(seen, [[true, 14], [false, 20], [true, 34], [false, 40]]);
  assert.equal(g.events.filter(e => e.type === "wave").length, 4);
  const a = createGame({ world: "beach", n: 6, seed: 1, fx: false }), b = createGame({ world: "beach", n: 6, seed: 77, fx: false });
  assert.deepEqual(a.trick.pieces, b.trick.pieces);
  assert.equal(a.trick.meta.off, b.trick.meta.off);
});

test("waves: kids in the band move at 60 % while the wave is up, at full speed outside it and when it is calm; Dad's mask is the band, only while it is up", () => {
  const g = field([strip("bottom", 4, 10)]), l = g.littles[0], base = moveSpeed(l);
  const inBand = { x: 8 * CELL, y: (ROWS - 1) * CELL }, outside = { x: 8 * CELL, y: (ROWS - 4) * CELL };
  Object.assign(l, inBand);
  assert.equal(withGame(g, () => moveSpeed(l)), base, "calm");
  assert.equal(withGame(g, () => moveSolidBigAt(inBand.x, inBand.y)), false);
  up(g);
  assert.equal(withGame(g, () => moveSpeed(l)), base * W9.slowMul);
  assert.equal(withGame(g, () => moveSolidBigAt(inBand.x, inBand.y)), true, "Dad does not stand in it");
  Object.assign(l, outside);
  assert.equal(withGame(g, () => moveSpeed(l)), base, "outside the band");
  assert.equal(withGame(g, () => moveSolidBigAt(outside.x, outside.y)), false);
  g.trick.t = W9.every - DT / 2; tick(g, 2);
  assert.equal(g.trick.fx.noDad, null, "calm again");
  assert.deepEqual(g.trick.fx.slow, []);
});

test("waves: Dad never walks into the band while the wave is up (a goal inside it too); caught inside when it comes up he walks straight out", () => {
  const g = field([strip("bottom", 2, 24)]);
  Object.assign(g.big, { x: 480, y: (ROWS - 6) * CELL, goal: { x: 480, y: (ROWS - 0.5) * CELL } });
  up(g);
  withGame(g, () => {
    for (let i = 0; i < Math.round(W9.time / DT) - 3; i++) {
      stepTrick(DT); updateBig(DT);
      assert.equal(trickDadSolid(g.big.x, g.big.y), false, `step ${i}: Dad's centre in the wave at ${g.big.x | 0},${g.big.y | 0}`);
    }
  });
  assert.ok(g.big.y < (ROWS - 2) * CELL, "he stayed on the sand side");
  // inside when it comes up
  const h = field([strip("bottom", 2, 24)]);
  Object.assign(h.big, { x: 480, y: (ROWS - 0.8) * CELL, goal: { x: 480, y: (ROWS - 0.5) * CELL }, state: "look", timer: 5 });
  h.trick.t = W9.every - W9.time - DT / 2;
  let out = -1;
  withGame(h, () => { for (let i = 0; i < Math.round(3 / DT); i++) { stepTrick(DT); updateBig(DT); if (out < 0 && !trickDadSolid(h.big.x, h.big.y)) out = i; } });
  assert.ok(out >= 0 && out * DT < 1.5, `out of the wave after ${(out * DT).toFixed(2)} s`);
  assert.ok(h.big.y < (ROWS - 2) * CELL + 2);
});

test("waves: bots and the autopilot go round a wave that is up rather than through it", () => {
  const g = field([{ shape: "rect", x: 14, y: 4, w: 2, h: 12, edge: "left", a: 4, len: 12, off: 0 }]);   // a wall of water in the middle (the band, moved, for the route test)
  const b = g.littles[1];
  Object.assign(b, { kind: "bot", x: 11 * CELL, y: 10 * CELL });
  const route = () => {
    const n = { x: b.x, y: b.y, r: b.r, path: [], repath: 0 };
    withGame(g, () => steerPoint(n, 18 * CELL, 10 * CELL, DT, false));
    return n.path;
  };
  const dry = route();
  assert.ok(dry.length === 0 || dry.every(p => !withGame(g, () => trickKidCost(p.x, p.y))), "calm: any way");
  up(g);
  assert.ok(withGame(g, () => trickKidCost(15 * CELL, 10 * CELL)) > 0, "the cost of wet ground");
  const wet = route();
  assert.ok(wet.length > 0, "a path round, not a straight line");
  for (const p of wet) assert.equal(withGame(g, () => trickKidCost(p.x, p.y)), 0, `the path avoids the wave: ${p.x | 0},${p.y | 0}`);
});

test("waves: same seed, same waves; no waves in a practice game", () => {
  const run = seed => {
    const g = createGame({ world: "beach", n: 4, seed, fx: false });
    g.autoOn = true; g.autoStyle = "careful";
    for (let i = 0; i < 3600; i++) step(g, DT);
    return JSON.stringify([g.trick.st, g.events.filter(e => e.type === "wave").length, g.big.x, g.big.y, g.littles.map(l => [l.x | 0, l.y | 0])]);
  };
  assert.equal(run(2), run(2));
  assert.equal(createGame({ world: "beach", n: 1, practice: 1, seed: 1, fx: false }).trick, null);
});
