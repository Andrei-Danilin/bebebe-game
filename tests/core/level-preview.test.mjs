// SPEC-041 AC 6 / 9: the level card's preview is the map of the very level the game builds, made in a game of its own — it never
// changes the running game, its rng stream or the random sequence of the level. Plain Node: npm run test:core.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, COLS, ROWS, WORLDS, autopilot, clearLevelCache, createGame, levelPreview, levelsPerWorld, setProgress, step, withGame } from "../../src/core/index.js";

const DT = CFG.STEP;
const LEVELS = [1, 2, 5, 9, 13, 17, levelsPerWorld()];   // a spread of the level types of every world, the first and the boss level

test("the preview's cells equal the cells of the generated level (every world, a sample of levels)", () => {
  assert.ok(WORLDS.length >= 6);
  let checked = 0;
  for (const world of WORLDS) for (const lv of LEVELS) {
    const p = levelPreview(world, lv), g = createGame({ world, n: lv, players: 1, seed: 7, fx: false });
    // the real level: blocked cells of its move grid, water and bush cells counted here from the level's own lists
    const blocked = g.blocked.reduce((n, v) => n + (v ? 1 : 0), 0);
    const water = new Set(), bush = new Set();
    for (const o of g.obstacles) if (o.kind === "water" || o.kind === "pond") for (let y = o.y / CELL; y < (o.y + o.h) / CELL; y++) for (let x = o.x / CELL; x < (o.x + o.w) / CELL; x++) water.add(y * COLS + x);
    for (const b of g.bushes) for (let y = b.y / CELL - 1; y < b.y / CELL + 1; y++) for (let x = b.x / CELL - 1; x < b.x / CELL + 1; x++) if (!g.blocked[y * COLS + x]) bush.add(y * COLS + x);
    const at = `${world} ${lv}`;
    assert.equal(p.type, g.levelInfo.type, `${at}: the type`);
    assert.equal(p.fallback, g.levelInfo.fallback, `${at}: the fallback flag`);
    assert.equal(p.cells.wall + p.cells.water, blocked, `${at}: wall + water cells = the game's blocked cells`);
    assert.equal(p.cells.water, water.size, `${at}: water cells`);
    assert.equal(p.cells.bush, bush.size, `${at}: bush cells`);
    assert.equal(p.cells.wall + p.cells.water + p.cells.bush + p.cells.free, COLS * ROWS, `${at}: every cell counted once`);
    assert.deepEqual(JSON.stringify(p.safeZone), JSON.stringify(g.safeZone), `${at}: the kids' house`);
    assert.deepEqual(JSON.stringify(p.dangerZone), JSON.stringify(g.dangerZone), `${at}: Dad's house`);
    assert.equal(p.obstacles.length, g.obstacles.length, `${at}: obstacles`);
    assert.equal(p.bushes.length, g.bushes.length, `${at}: bushes`);
    checked++;
  }
  assert.equal(checked, WORLDS.length * LEVELS.length);
});

// everything of a game but levelInfo (how long the level took to build: a clock)
const state = g => { const { levelInfo, ...rest } = g; return JSON.stringify(rest, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)); };
const play = (world, n, seed, between) => {
  const g = createGame({ world, n, players: 1, seed });
  withGame(g, () => autopilot(true, "careful"));
  for (let i = 0; i < 90; i++) step(g, DT);
  between?.();
  for (let i = 0; i < 90; i++) step(g, DT);
  return g;
};

test("a preview made while a game runs (or before it starts) changes nothing of that game or its level", () => {
  setProgress(null);
  clearLevelCache();
  const alone = play("park", 13, 5);
  // the same game, with the previews of its own level and of two others made in the middle of it (the level cache warm and cold)
  clearLevelCache();
  const mid = play("park", 13, 5, () => { levelPreview("park", 13); levelPreview("winter", 18); levelPreview("school", 20); });
  assert.ok(state(alone) === state(mid), "a game with previews made in the middle equals the game without");
  assert.equal(alone.rng.s, mid.rng.s, "the game's rng stream");
  assert.equal(alone.rng.draws, mid.rng.draws, "and the number of draws");
  // a level built after its preview is the level built without it
  clearLevelCache();
  const plain = createGame({ world: "city", n: 11, players: 1, seed: 3 });
  clearLevelCache();
  levelPreview("city", 11);
  const after = createGame({ world: "city", n: 11, players: 1, seed: 3 });
  assert.equal(JSON.stringify(after.obstacles), JSON.stringify(plain.obstacles), "the same walls");
  assert.equal(JSON.stringify(after.bushes), JSON.stringify(plain.bushes), "the same bushes");
  assert.equal(after.levelInfo.attempt, plain.levelInfo.attempt, "the same attempt of the generator");
  assert.equal(after.rng.s, plain.rng.s, "the same rng stream");
});

test("the preview does not touch the active game", () => {
  const g = createGame({ world: "beach", n: 4, players: 1, seed: 9 });
  withGame(g, () => {
    const before = state(g), draws = g.rng.draws;
    levelPreview("field", 12);
    assert.ok(state(g) === before, "the running game is unchanged");
    assert.equal(g.rng.draws, draws);
  });
});
