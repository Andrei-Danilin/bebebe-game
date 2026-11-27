// SPEC-043: every world has its own item next to the banana — shares and where they spawn (AC 1), the effect of each item (AC 2, 3), the bots and the
// autopilot (AC 4). Core tests: headless games at the fixed step, seeded.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, WORLDS, cellsOf, checkContacts, createGame, spawnItem, step, updateBig, updateItems, updateShots, useGame, withGame } from "../../src/core/index.js";

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

// ================= the effects (AC 2, 3) =================
const DT = CFG.STEP, WI = CFG.WORLD_ITEMS;
// a game of `world` on a cleared map (no walls, bushes, houses, trick): Dad at (480, 320) looking right and calm, the kids far away at the top
function clearGame(world = "field", opts = {}) {
  const g = createGame({ world, n: 2, seed: 3, ...opts });
  useGame(g);
  g.seeGrid.fill(0); g.moveGrid.fill(0); g.moveGridBig.fill(0); g.blocked.fill(0); g.blockedBig.fill(0); g.reachable.fill(1);
  g.bushes = []; g.obstacles = []; g.safeZone = null; g.dangerZone = null; g.trick = null;
  Object.assign(g.big, { x: 480, y: 320, dir: 0, state: "look", timer: 99, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, kind: false, hearCd: 0, noise: 0, hearLook: 99, boss: null, hp: 5, maxHp: 5, hugCd: 0 });
  g.littles.forEach((l, i) => { Object.assign(l, { x: 60 + 40 * i, y: 40, state: "ok", invuln: 0, dizzy: 0, moving: false, speedFrac: 0, path: [], dir: 0, hugCd: 0 }); l.fx.cloak = 0; l.fx.boots = 0; });
  g.items = []; g.shots = []; g.itemCd = 1e9;                       // no item of its own
  g.fx.length = 0;
  return g;
}
const addItem = (g, kind, x, y) => { const it = { id: ++g.itemSeq, kind, x, y, t: 0, life: CFG.ITEM_LIFE + 8 }; g.items.push(it); return it; };
const runInto = (g, l, it, dir, speedFrac = 1) => { Object.assign(l, { x: it.x, y: it.y, dir, moveDir: dir, moving: true, speedFrac }); };
const tick = (g, n = 1) => withGame(g, () => { for (let i = 0; i < n; i++) { updateItems(DT); updateShots(DT); } });
const kinds = g => g.fx.map(e => e.type + (e.key ? ":" + e.key : "") + (e.name ? ":" + e.name : ""));
// follows the last shot until it is gone → { path: [[x, y]…], hit }
function flight(g, max = 400) {
  const path = [];
  for (let i = 0; i < max && g.shots.length; i++) { path.push([g.shots[0].x, g.shots[0].y]); tick(g); }
  return path;
}
const length = path => path.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

// ================= 2a: the football (Field) =================
test("football: a kid who runs into it sends it rolling 6 cells in his run direction (tiptoe too), then it is gone", () => {
  for (const [dir, sf] of [[0, 1], [Math.PI / 2, 1], [Math.PI, CFG.TIPTOE_MULT], [-0.7, CFG.TIPTOE_MULT]]) {
    const g = clearGame("field");
    Object.assign(g.big, { x: 40, y: 600 });                           // out of the way
    const it = addItem(g, "football", 300, 300), l = g.littles[0];
    runInto(g, l, it, dir, sf);
    tick(g);
    assert.equal(g.shots.length, 1, "launched");
    assert.equal(g.items.length, 0, "the football on the ground is spent");
    const s = g.shots[0];
    assert.ok(Math.abs(s.dx - Math.cos(dir)) < 1e-9 && Math.abs(s.dy - Math.sin(dir)) < 1e-9, "the kid's direction");
    const path = flight(g);
    assert.ok(Math.abs(length(path) - WI.football.cells * CELL) < 16, `dir ${dir}: rolled ${length(path)} px`);
    assert.equal(g.shots.length, 0);
  }
});
test("football: only a kid who is moving launches it; one standing on it does not", () => {
  const g = clearGame("field");
  const it = addItem(g, "football", 300, 300);
  Object.assign(g.littles[0], { x: 300, y: 300, moving: false });
  tick(g, 5);
  assert.equal(g.shots.length, 0);
  assert.equal(g.items.length, 1, "still lies there");
  void it;
});
test("football: it bounces off a wall once (the direction turns, the distance is the same), the second wall stops it", () => {
  const g = clearGame("field");
  Object.assign(g.big, { x: 40, y: 600 });
  for (let j = 0; j < 80; j++) { g.moveGrid[j * 120 + 60] = 1; g.moveGrid[j * 120 + 20] = 1; }   // two vertical walls at x = 480 and x = 160 (FINE 8 px)
  const it = addItem(g, "football", 400, 300), l = g.littles[0];
  runInto(g, l, it, 0);
  tick(g);
  const path = flight(g);
  const xs = path.map(p => p[0]);
  assert.ok(Math.max(...xs) < 484, "stopped by the wall at 480, then turned");
  assert.ok(xs.at(-1) < 400, "it came back");
  assert.ok(xs.at(-1) > 170, "…but the left wall stopped it before it got through");
  assert.equal(g.shots.length, 0);
});
test("football: it hits Dad — he is stunned 1.5 s (a pop and a sound), huggable from any side, and never chases in that time", () => {
  const g = clearGame("field");
  const it = addItem(g, "football", 300, 320), l = g.littles[0];
  runInto(g, l, it, 0);                                                  // rolls right, Dad stands at 480
  tick(g);
  Object.assign(l, { x: 100, y: 40, moving: false });
  flight(g);
  assert.ok(Math.abs(g.big.slip - WI.football.time) < 0.1, `slip ${g.big.slip}`);
  assert.equal(g.big.slipKind, "ball");
  assert.ok(kinds(g).includes("pop:bonk") && kinds(g).includes("sfx:bonk"), kinds(g).join());
  assert.equal(g.events.filter(e => e.type === "worldItem" && e.effect === "hit").length, 1);
  // he stands there; a kid in front of him in plain view: he does not chase, and the kid hugs him from the front
  Object.assign(g.littles[1], { x: g.big.x + g.big.r + 12, y: g.big.y, moving: false, task: "attack" });
  withGame(g, () => { for (let i = 0; i < 20; i++) updateBig(DT); });
  assert.notEqual(g.big.state, "chase");
  withGame(g, () => checkContacts());
  assert.equal(g.stats.hugs, 1, "huggable from the front");
  assert.equal(g.big.slip, 0, "the hug ends it");
});
test("football: Dad is back to himself after the time (look first), and a ball that passes a lying Dad does nothing", () => {
  const g = clearGame("field");
  Object.assign(g.big, { x: 480, y: 320 });
  withGame(g, () => { g.big.slip = 0; });
  const it = addItem(g, "football", 300, 320);
  runInto(g, g.littles[0], it, 0);
  tick(g);
  Object.assign(g.littles[0], { x: 100, y: 40, moving: false });
  flight(g);
  withGame(g, () => { for (let i = 0; i < Math.ceil(WI.football.time / DT) + 2; i++) updateBig(DT); });
  assert.ok(g.big.slip <= 0, "over");
  assert.equal(g.big.state, "look");
  // already lying: a second ball goes on through
  g.big.slip = 2;
  const it2 = addItem(g, "football", 300, 320);
  runInto(g, g.littles[0], it2, 0);
  tick(g);
  Object.assign(g.littles[0], { x: 100, y: 40, moving: false });
  flight(g);
  assert.ok(g.big.slip <= 2 && g.events.filter(e => e.type === "worldItem" && e.effect === "hit").length === 1, "no second hit");
});
test("football: a boss (level 20) is stunned for half the time; a practice game has no effect at all", () => {
  const g = clearGame("field");
  g.big.boss = "field";
  const it = addItem(g, "football", 300, 320);
  runInto(g, g.littles[0], it, 0);
  tick(g);
  Object.assign(g.littles[0], { x: 100, y: 40, moving: false });
  flight(g);
  assert.ok(Math.abs(g.big.slip - WI.football.time * WI.bossMul) < 0.1, `boss slip ${g.big.slip}`);
  const p = clearGame("field", { practice: 2 });
  const it2 = addItem(p, "football", 300, 300);
  runInto(p, p.littles[0], it2, 0);
  tick(p, 3);
  assert.equal(p.shots.length, 0);
  assert.equal(p.items.length, 1);
});
test("football: it lies ITEM_LIFE s and is gone", () => {
  const g = clearGame("field");
  const it = addItem(g, "football", 300, 300);
  it.life = CFG.ITEM_LIFE;
  tick(g, Math.ceil(CFG.ITEM_LIFE / DT) + 2);
  assert.equal(g.items.length, 0);
});
test("football: a bot and the careful autopilot run through a football that lies near Dad, in line behind him, and bonk him", () => {
  for (const who of ["bot", "autopilot"]) {
    const g = clearGame("field");
    g.big.hearLook = 99;                                                 // he stands looking right, away from the kids
    addItem(g, "football", 400, 320);
    const l = who === "bot" ? g.littles.find(q => q.kind === "bot") : g.littles[0];
    Object.assign(l, { x: 330, y: 320, dir: 0 });
    g.littles.forEach(q => { if (q !== l) Object.assign(q, { x: 60 + 40 * q.id, y: 40 }); });
    if (who === "autopilot") { g.autoOn = true; g.autoStyle = "careful"; }
    for (let i = 0; i < 240 && !g.events.some(e => e.type === "worldItem" && e.effect === "hit"); i++) step(g, DT);
    assert.ok(g.events.some(e => e.type === "worldItem" && e.effect === "launch" && e.who === l.id), `${who} launched it`);
    assert.ok(g.events.some(e => e.type === "worldItem" && e.effect === "hit"), `${who} hit Dad`);
    assert.equal(g.big.slipKind, "ball");
  }
});
test("football: the autopilot does not pick a football up on its own (a world item is not a pickup), and the reckless one ignores it", () => {
  const g = clearGame("field");
  g.big.hearLook = 99;
  addItem(g, "football", 700, 320);                                       // 220 px from Dad: beyond the flight
  Object.assign(g.littles[0], { x: 640, y: 320 });
  g.autoOn = true; g.autoStyle = "careful";
  for (let i = 0; i < 60; i++) step(g, DT);
  assert.equal(g.events.filter(e => e.type === "worldItem").length, 0);
});
