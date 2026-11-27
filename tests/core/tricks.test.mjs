// SPEC-042 step 1 (AC 1, 2, 4): the world-tricks framework. CFG.WORLD_TRICK picks a trick module per world; the generator places its pieces
// (seeded, on the finished map, from its own stream), validate.js checks them, applyWorld makes G.trick, the fixed step runs init / step /
// bigStep, and the effect fields of G.trick.fx are what vision / world / hearing / rules / grid ask (tricks/query.js). The six real tricks are
// stubs here and place nothing (they land in their own steps), so the harness uses a fake module in the Park's slot.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, COLS, ROWS, TRICK_MODS, NO_HOOKS, WORLDS, anyArea, audible, bigGrid, buildLevel, canSee, cellsOf, clearLevelCache, createGame, forbiddenCells,
  generateLevel, levelsPerWorld, moveSolidBigAt, moveSpeed, newFx, newGame, seeSolidAt, step, trickOf, useGame, validateTrick, withGame } from "../../src/core/index.js";

const DT = CFG.STEP;
const ALL = WORLDS.flatMap(w => Array.from({ length: levelsPerWorld() }, (_, i) => [w, i + 1]));
// run fn with TRICK_MODS.puddles replaced (and the level cache cleared before and after); everything restored
function withFake(mod, fn) {
  const keep = TRICK_MODS.puddles;
  TRICK_MODS.puddles = { name: "puddles", ...NO_HOOKS, ...mod };
  clearLevelCache();
  try { return fn(); } finally { TRICK_MODS.puddles = keep; clearLevelCache(); }
}
// a fake that puts n puddles on free spots (1 cell, pad 1)
const spots = n => ({ place(ctx) {
  const out = [];
  for (let i = 0; i < n; i++) { const s = ctx.spot(1, 1, 1); if (s) { ctx.take(s.x, s.y, 1, 1); out.push({ shape: "circle", cx: s.x + 0.5, cy: s.y + 0.5, r: 0.5 }); } }
  return out;
} });
const quiet = fn => { const warn = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = warn; } };   // buildLevel warns on a fallback level

test("the tables: each of the six worlds has its trick, each trick its module and its numbers", () => {
  assert.deepEqual(CFG.WORLD_TRICK, { park: "puddles", field: "sprinklers", city: "truck", school: "bell", beach: "waves", winter: "footprints" });
  assert.deepEqual([...WORLDS].sort(), Object.keys(CFG.WORLD_TRICK).sort(), "every world");
  for (const w of WORLDS) {
    const n = CFG.WORLD_TRICK[w];
    assert.equal(trickOf(w), n);
    assert.equal(TRICK_MODS[n].name, n);
    assert.ok(CFG.TRICKS[n] && typeof CFG.TRICKS[n] === "object", `CFG.TRICKS.${n}`);
    for (const h of ["place", "validate", "init", "step", "bigStep"]) assert.equal(typeof TRICK_MODS[n][h], "function", `${n}.${h}`);
  }
  // the spec's numbers
  const T = CFG.TRICKS;
  assert.deepEqual([T.puddles.count, T.puddles.splashMul, T.puddles.splashTime], [[3, 5], 2, 1]);
  assert.deepEqual([T.sprinklers.count, T.sprinklers.cycle, T.sprinklers.warn, T.sprinklers.spray, T.sprinklers.r], [[2, 3], 20, 1, 5, 2]);
  assert.deepEqual([T.truck.speedMul, T.truck.minLoop, T.truck.w, T.truck.h], [0.5, 16, 2, 1]);
  assert.deepEqual([T.bell.every, T.bell.warn, T.bell.ring], [30, 2, 3]);
  assert.deepEqual([T.waves.every, T.waves.depth, T.waves.time, T.waves.slowMul], [20, 2, 6, 0.6]);
  assert.deepEqual([T.footprints.every, T.footprints.life], [0.4, 8]);
});

test("AC 2: all 120 levels build fair with tricks on — a trick fail rejects an attempt, never the level — and the layout is the same with tricks off", () => {
  assert.equal(ALL.length, 120);
  clearLevelCache();
  const keep = CFG.TRICKS_ON;
  try {
    for (const [w, lv] of ALL) {
      CFG.TRICKS_ON = 1;
      const on = withGame(newGame({ world: w, n: lv }), () => buildLevel(w, lv));
      assert.equal(on.fallback, false, `${w} ${lv} is fair`);
      assert.ok(!on.rejects.some(r => r.includes("trick:")), `${w} ${lv}: no attempt thrown out by its trick (${on.rejects.join(" ")})`);
      const gen = generateLevel(w, lv, on.attempt);
      assert.equal(gen.trick.name, CFG.WORLD_TRICK[w], `${w} ${lv}: the world's trick is placed`);
      assert.ok(Array.isArray(gen.trick.pieces), "its pieces");
      CFG.TRICKS_ON = 0;
      const off = generateLevel(w, lv, on.attempt);
      assert.equal(off.trick, null, "TRICKS_ON 0: no trick");
      const { trick, ...rest } = gen, { trick: none, ...restOff } = off;
      assert.deepEqual(rest, restOff, `${w} ${lv}: the layout does not depend on the trick`);
      assert.ok(trick && none === null);
    }
  } finally { CFG.TRICKS_ON = keep; clearLevelCache(); }
});

test("pieces are placed by the generator from the level seed: same level, same pieces; another level, others; never in a house or its door apron", () => {
  withFake(spots(4), () => {
    const seen = new Set();
    for (let lv = 1; lv <= levelsPerWorld(); lv++) {
      const rep = withGame(newGame({ world: "park", n: lv }), () => buildLevel("park", lv));
      assert.equal(rep.fallback, false);
      const a = generateLevel("park", lv, rep.attempt), b = generateLevel("park", lv, rep.attempt);
      assert.deepEqual(a.trick, b.trick, `park ${lv}: same seed, same pieces`);
      assert.equal(a.trick.pieces.length, 4, `park ${lv}: 4 puddles`);
      seen.add(JSON.stringify(a.trick.pieces));
      const { house, apron } = forbiddenCells(a);
      for (const p of a.trick.pieces) for (const i of cellsOf(p)) assert.ok(!house[i] && !apron[i], `park ${lv}: a piece in a house or apron (cell ${i % COLS},${(i / COLS) | 0})`);
    }
    assert.ok(seen.size > 15, "different levels place different pieces");
    // the stream follows the attempt number: another attempt, another placement
    assert.notDeepEqual(generateLevel("park", 3, 0).trick.pieces, generateLevel("park", 3, 1).trick.pieces);
  });
});

test("validate.js throws out an attempt whose piece is in a house, in a door apron, off the map or on a wall", () => {
  const bad = pick => ({ place(ctx) {
    const safe = ctx.items.find(it => it.t === "safe"), door = ctx.doors.big[0];
    return [pick({ safe, door, ctx })];
  } });
  const cases = {
    "trick:house": ({ safe }) => ({ shape: "circle", cx: safe.x + 3, cy: safe.y + 3, r: 0.5 }),
    "trick:apron": ({ door }) => ({ shape: "circle", cx: door.x + 0.5 + door.dx, cy: door.y + 0.5 + door.dy, r: 0.5 }),
    "trick:bounds": () => ({ shape: "circle", cx: -3.5, cy: 4.5, r: 0.5 }),
    "trick:blocked": ({ ctx }) => { const w = ctx.items.find(it => it.t === "wall" && it.kind !== "home"); return { shape: "circle", cx: w.x + 0.5, cy: w.y + 0.5, r: 0.5 }; }
  };
  quiet(() => {
    for (const [fail, make] of Object.entries(cases)) {
      withFake(bad(make), () => {
        const rep = withGame(newGame({ world: "park", n: 4 }), () => buildLevel("park", 4));
        assert.equal(rep.fallback, true, `${fail}: every attempt is thrown out`);
        assert.equal(rep.rejects.length, CFG.LEVEL_ATTEMPTS);
        assert.ok(rep.rejects.every(r => r.includes(fail)), `${fail}: ${rep.rejects[0]}`);
      });
    }
  });
});

test("a trick that keeps Dad out (blocksDad) may not cut the path between the houses' doors", () => {
  const wall = { blocksDad: true, ground: "none", place: () => [{ shape: "rect", x: 14, y: 0, w: 2, h: ROWS }] };   // a whole column of cells
  quiet(() => {
    withFake(wall, () => {
      const rep = withGame(newGame({ world: "park", n: 3 }), () => buildLevel("park", 3));
      assert.ok(rep.rejects.length > 0 && rep.rejects.every(r => r.includes("trick:path")), `rejects: ${rep.rejects[0]}`);
    });
    // one small blocking piece somewhere free does not
    withFake({ blocksDad: true, place: ctx => { const s = ctx.spot(1, 1, 1); return s ? [{ shape: "circle", cx: s.x + 0.5, cy: s.y + 0.5, r: 0.5 }] : []; } }, () => {
      const rep = withGame(newGame({ world: "park", n: 3 }), () => buildLevel("park", 3));
      assert.equal(rep.fallback, false);
    });
  });
});

test("the game runs the trick: init at the build, step every fixed step with its dt, bigStep inside Dad's step; G.trick is plain data", () => {
  const calls = { init: 0, step: [], big: 0 };
  withFake({ ...spots(3), init(T) { calls.init++; T.st.k = 0; }, step(T, dt) { calls.step.push(dt); T.st.k++; }, bigStep() { calls.big++; return false; } }, () => {
    const g = createGame({ world: "park", n: 2, seed: 4, fx: false });
    assert.equal(calls.init, 1, "init once, at the build");
    assert.equal(g.trick.name, "puddles");
    assert.equal(g.trick.pieces.length, 3);
    assert.equal(g.trick.t, 0);
    for (let i = 0; i < 60; i++) step(g, DT);
    assert.equal(calls.step.length, 60);
    assert.ok(calls.step.every(d => d === DT), "the fixed step");
    assert.equal(g.trick.st.k, 60);
    assert.ok(Math.abs(g.trick.t - 60 * DT) < 1e-9, "its own clock");
    assert.ok(calls.big > 0, "Dad asked the trick");
    assert.doesNotThrow(() => structuredClone(JSON.parse(JSON.stringify(g.trick))), "plain data");
    // a second game: init again and the state starts from zero
    const g2 = createGame({ world: "park", n: 2, seed: 4, fx: false });
    assert.equal(calls.init, 2);
    assert.equal(g2.trick.st.k, 0);
  });
});

test("same seed → same level and same trick state after the same steps (a different seed: another game)", () => {
  const stepper = { ...spots(4), init(T) { T.st.a = 0; }, step(T, dt) { T.st.a += dt * (1 + T.pieces.length); T.st.phase = Math.floor(T.t / 3) % 2; } };
  const run = seed => {
    const g = createGame({ world: "park", n: 5, seed, fx: false });
    for (let i = 0; i < 300; i++) step(g, DT);
    return JSON.stringify({ trick: g.trick, big: [g.big.x, g.big.y], l: g.littles.map(l => [l.x, l.y]) });
  };
  withFake(stepper, () => {
    assert.equal(run(9), run(9));
    assert.notEqual(run(9), run(10));
  });
});

test("AC 4: practice games and the tutorial have no trick, nothing of it runs", () => {
  const calls = [];
  withFake({ ...spots(3), init: () => calls.push("init"), step: () => calls.push("step"), bigStep: () => { calls.push("big"); return false; } }, () => {
    for (const practice of [1, 2]) {
      const g = createGame({ world: "park", n: 1, practice, seed: 1, fx: false });
      assert.equal(g.trick, null, `practice ${practice}`);
      for (let i = 0; i < 120; i++) step(g, DT);
      assert.equal(g.trick, null);
    }
    assert.deepEqual(calls, [], "no hook ran");
    // a normal level in the same session does
    const g = createGame({ world: "park", n: 1, seed: 1, fx: false });
    step(g, DT);
    assert.equal(calls.filter(c => c === "init").length, 1);
  });
});

test("TRICKS_ON 0 and a world with no trick: G.trick is null and nothing runs", () => {
  const keep = CFG.TRICKS_ON;
  try {
    CFG.TRICKS_ON = 0; clearLevelCache();
    assert.equal(createGame({ world: "park", n: 2, seed: 1, fx: false }).trick, null);
    CFG.TRICKS_ON = 1; clearLevelCache();
    assert.notEqual(createGame({ world: "park", n: 2, seed: 1, fx: false }).trick, null);
    assert.equal(trickOf("nowhere"), null);
    assert.equal(generateLevel("nowhere", 2, 0).trick, null, "an unknown world has none");
  } finally { CFG.TRICKS_ON = keep; clearLevelCache(); }
});

test("a trick's bigStep that returns true takes Dad's step (he stays put); false lets him go on", () => {
  let hold = true;
  withFake({ bigStep: () => hold }, () => {
    const g = createGame({ world: "park", n: 2, seed: 2, fx: false });
    const before = [g.big.x, g.big.y, g.big.dir];
    g.big.state = "patrol"; g.big.goal = { x: g.big.x + 200, y: g.big.y }; g.big.patrolT = 10;
    for (let i = 0; i < 60; i++) step(g, DT);
    assert.deepEqual([g.big.x, g.big.y, g.big.dir], before, "held");
    hold = false;
    for (let i = 0; i < 60; i++) step(g, DT);
    assert.notDeepEqual([g.big.x, g.big.y], before.slice(0, 2), "released: he walks");
  });
});

// ---------- the effect fields: what the rest of the core asks ----------
function openField() {
  const g = createGame({ world: "park", n: 2, seed: 3, fx: false });
  useGame(g);
  // Dad in the middle looking right, a kid 120 px ahead in clear view; the walls cleared out of the way for the query tests
  g.seeGrid.fill(0); g.moveGrid.fill(0); g.moveGridBig.fill(0); g.blocked.fill(0); g.blockedBig.fill(0); g.bushes = []; g.obstacles = []; g.safeZone = null;
  Object.assign(g.big, { x: 480, y: 320, dir: 0, state: "look", timer: 99, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, kind: false });
  const l = g.littles[0];
  Object.assign(l, { x: 600, y: 320, state: "ok", invuln: 0, dizzy: 0, moving: false, speedFrac: 0 });
  l.fx.cloak = 0; l.fx.boots = 0;
  g.trick = { name: "puddles", pieces: [], meta: {}, st: {}, fx: newFx(), t: 0 };
  return { g, l };
}
test("fx.hide: a kid in a hiding area is not seen (like a bush); outside it he is", () => {
  const { g, l } = openField();
  assert.equal(canSee(l), true);
  g.trick.fx.hide.push({ shape: "circle", x: l.x + 10, y: l.y, r: 64 });
  assert.equal(canSee(l), false, "hidden");
  g.trick.fx.hide[0].x = l.x + 500;
  assert.equal(canSee(l), true, "out of the area");
});
test("fx.sight: an area on the line blocks Dad's sight like a wall; off the line it does not", () => {
  const { g, l } = openField();
  assert.equal(seeSolidAt(540, 320), false);
  g.trick.fx.sight.push({ shape: "rect", x: 520, y: 300, w: 64, h: 32 });
  assert.equal(seeSolidAt(540, 320), true);
  assert.equal(canSee(l), false, "the truck is in the way");
  g.trick.fx.sight[0].y = 100;
  assert.equal(canSee(l), true, "not in the way");
});
test("fx.noDad: Dad's cells are solid for him and for his A*; the level's own grid is untouched", () => {
  const { g } = openField();
  const m = new Uint8Array(COLS * ROWS), cell = 15 * COLS + 10;
  m[cell] = 1; g.trick.fx.noDad = m;
  assert.equal(moveSolidBigAt(10.5 * CELL, 15.5 * CELL), true);
  assert.equal(moveSolidBigAt(11.5 * CELL, 15.5 * CELL), false);
  assert.equal(bigGrid()[cell], 1, "his path search keeps out");
  assert.equal(g.blockedBig[cell], 0, "the level's own grid is untouched");
  g.trick.fx.noDad = null;
  assert.equal(bigGrid()[cell], 0);
});
test("fx.slow: a kid on slow ground moves at slowMul of his speed", () => {
  const { g, l } = openField();
  const base = moveSpeed(l);
  g.trick.fx.slow.push({ shape: "rect", x: l.x - 40, y: l.y - 40, w: 80, h: 80 }); g.trick.fx.slowMul = 0.6;
  assert.equal(moveSpeed(l), base * 0.6);
  l.x += 300;
  assert.equal(moveSpeed(l), base, "off the slow ground");
});
test("fx.loud: a running kid is heard from loud × HEAR_RADIUS", () => {
  const { g, l } = openField();
  Object.assign(l, { x: 480 - 7 * CELL, y: 320, moving: true, speedFrac: 1 });   // 7 cells behind Dad: beyond HEAR_RADIUS (5)
  assert.equal(audible(l), 0, "too far");
  g.trick.fx.loud[l.id] = 2;
  assert.ok(audible(l) > 0, "a splash is heard from twice as far");
  l.x = 480 - 11 * CELL;
  assert.equal(audible(l), 0, "but not from 11 cells");
});
test("no trick in the game: every query answers no effect", () => {
  const { g, l } = openField();
  g.trick = null;
  assert.equal(canSee(l), true);
  assert.equal(moveSpeed(l), CFG.PLAYER_SPEED);
  assert.equal(moveSolidBigAt(100, 100), false);
  assert.equal(anyArea([], 1, 1), false);
  assert.equal(bigGrid(), g.blockedBig);
});

test("validateTrick on a level with no trick is no fails", () => {
  assert.deepEqual(validateTrick({ items: [], doors: { small: [], big: [] }, trick: null }, null), []);
});
