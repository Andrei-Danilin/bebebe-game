// SPEC-043: every world has its own item next to the banana — shares and where they spawn (AC 1), the effect of each item (AC 2, 3), the bots and the
// autopilot (AC 4). Core tests: headless games at the fixed step, seeded.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, WORLDS, cellsOf, createGame, spawnItem, withGame } from "../../src/core/index.js";

// n spawns in a game of `world`, one at a time (the map is emptied between them); → { kind: count }
function sample(world, n, opts = {}) {
  const g = createGame({ world, n: 3, seed: 11, fx: false, ...opts });
  const out = {};
  withGame(g, () => {
    for (let i = 0; i < n; i++) { g.items = []; spawnItem(); for (const it of g.items) out[it.kind] = (out[it.kind] || 0) + 1; }
  });
  return { out, g };
}
const share = (out, k, n) => (out[k] || 0) / n;

// ================= AC 1: the table and the shares =================
test("CFG.WORLD_ITEM: park banana, field football, city cupcake, school plane, beach watermelon, winter snowball; every world has one", () => {
  assert.deepEqual(CFG.WORLD_ITEM, { park: "banana", field: "football", city: "cupcake", school: "plane", beach: "watermelon", winter: "snowball" });
  assert.deepEqual([...WORLDS].sort(), Object.keys(CFG.WORLD_ITEM).sort());
  assert.deepEqual(CFG.WORLD_ITEMS.shares, { boots: 0.3, cloak: 0.25, shield: 0.2, banana: 0.1, world: 0.15 });
});

test("shares: the Park spawns as before (boots .3, cloak .25, shield .2, banana .25, nothing else)", () => {
  const N = 1200, { out } = sample("park", N);
  assert.deepEqual(Object.keys(out).sort(), ["banana", "boots", "cloak", "shield"]);
  assert.ok(Math.abs(share(out, "boots", N) - 0.3) < 0.05 && Math.abs(share(out, "cloak", N) - 0.25) < 0.05 && Math.abs(share(out, "shield", N) - 0.2) < 0.05 && Math.abs(share(out, "banana", N) - 0.25) < 0.05, JSON.stringify(out));
});

for (const world of WORLDS.filter(w => w !== "park")) {
  test(`shares: ${world} spawns boots .3, cloak .25, shield .2, banana .1 and its ${CFG.WORLD_ITEM[world]} .15`, () => {
    const N = 1200, { out } = sample(world, N), own = CFG.WORLD_ITEM[world];
    assert.deepEqual(Object.keys(out).sort(), ["banana", "boots", "cloak", "shield", own].sort());
    const want = { boots: 0.3, cloak: 0.25, shield: 0.2, banana: 0.1, [own]: 0.15 };
    for (const [k, v] of Object.entries(want)) assert.ok(Math.abs(share(out, k, N) - v) < 0.05, `${world} ${k}: ${share(out, k, N)} vs ${v}`);
  });
}

test("shares: a practice game never spawns a world item; WORLD_ITEMS_ON 0 switches them off in every world", () => {
  for (const p of [2]) {
    const { out } = sample("field", 400, { practice: p });
    assert.ok(Object.keys(out).every(k => ["banana", "boots", "cloak", "shield"].includes(k)), JSON.stringify(out));
  }
  const on = CFG.WORLD_ITEMS_ON;
  CFG.WORLD_ITEMS_ON = 0;
  try {
    for (const w of WORLDS) assert.ok(Object.keys(sample(w, 300).out).every(k => ["banana", "boots", "cloak", "shield"].includes(k)), w);
  } finally { CFG.WORLD_ITEMS_ON = on; }
});

test("spawns: no item lies where a spray or a wave keeps Dad out (the Field's sprinklers, the Beach's waves)", () => {
  for (const world of ["field", "beach"]) {
    const { g } = sample(world, 1, {});
    assert.ok(g.trick && g.trick.keepsOut, `${world}: its trick keeps Dad out`);
    const bad = new Set(g.trick.pieces.flatMap(cellsOf));
    assert.ok(bad.size > 0);
    let seen = 0;
    withGame(g, () => {
      for (let i = 0; i < 600; i++) {
        g.items = []; spawnItem();
        for (const it of g.items) { seen++; assert.ok(!bad.has(Math.floor(it.y / CELL) * 30 + Math.floor(it.x / CELL)), `${world}: item at ${it.x},${it.y} in a trick cell`); }
      }
    });
    assert.ok(seen > 500, "the spawns still find places");
  }
});

test("spawns: the lying items (banana, watermelon, cupcake) last longer than the rest by CFG", () => {
  const g = createGame({ world: "city", n: 1, seed: 5, fx: false });
  withGame(g, () => {
    const lifes = {};
    for (let i = 0; i < 500; i++) { g.items = []; spawnItem(); for (const it of g.items) lifes[it.kind] = it.life; }
    assert.equal(lifes.banana, CFG.ITEM_LIFE + 8);
    assert.equal(lifes.cupcake, CFG.ITEM_LIFE + CFG.WORLD_ITEMS.lyingLife);
    assert.equal(lifes.boots, CFG.ITEM_LIFE);
  });
});
