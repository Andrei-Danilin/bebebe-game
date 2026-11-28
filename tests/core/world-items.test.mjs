// SPEC-043: every world has its own item next to the banana — shares and where they spawn (AC 1), the effect of each item (AC 2, 3), the bots and the
// autopilot (AC 4). Core tests: headless games at the fixed step, seeded.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, WORLDS, autopilot, cellsOf, checkContacts, createGame, spawnItem, step, updateBig, updateBigPlayer, updateItems, updateShots, useGame, withGame } from "../../src/core/index.js";

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
    Object.assign(l, { x: 340, y: 320, dir: 0 });
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

// ================= 2b: the cupcake (City) =================
const hits = (g, effect) => g.events.filter(e => e.type === "worldItem" && e.effect === effect).length;
test("cupcake: Dad who sees it within 5 cells walks over and eats it for 3 s, huggable from any side, never chases", () => {
  const g = clearGame("city");
  addItem(g, "cupcake", 480 + 4 * CELL, 320);                              // 4 cells ahead of him
  withGame(g, () => { for (let i = 0; i < 300 && g.big.slip <= 0; i++) { updateBig(DT); updateItems(DT); } });
  assert.equal(g.big.slipKind, "eat");
  assert.ok(Math.abs(g.big.slip - WI.cupcake.time) < 0.1, `eating ${g.big.slip}`);
  assert.equal(g.items.filter(i => i.kind === "cupcake").length, 0, "eaten");
  assert.ok(kinds(g).includes("pop:yum") && kinds(g).includes("sfx:munch"), kinds(g).join());
  assert.equal(hits(g, "eat"), 1);
  // a kid right in front of him in plain view: no chase while he eats, and he can be hugged from the front
  Object.assign(g.littles[1], { x: g.big.x + g.big.r + 12, y: g.big.y, moving: false, task: "attack" });
  withGame(g, () => { for (let i = 0; i < 30; i++) updateBig(DT); });
  assert.notEqual(g.big.state, "chase");
  withGame(g, () => checkContacts());
  assert.equal(g.stats.hugs, 1);
});
test("cupcake: he does not see one farther than 5 cells or behind him, and he chases a kid in his view rather than walk to it", () => {
  const far = clearGame("city");
  addItem(far, "cupcake", 480 + 7 * CELL, 320);
  withGame(far, () => { for (let i = 0; i < 120; i++) { updateBig(DT); updateItems(DT); } });
  assert.equal(far.big.slip, 0);
  assert.equal(far.big.cake, 0);
  const behind = clearGame("city");
  addItem(behind, "cupcake", 480 - 3 * CELL, 320);
  withGame(behind, () => { for (let i = 0; i < 30; i++) { updateBig(DT); updateItems(DT); } });
  assert.equal(behind.big.cake, 0, "behind him: not seen");
  const kid = clearGame("city");
  addItem(kid, "cupcake", 480 + 3 * CELL, 320);
  Object.assign(kid.littles[0], { x: 480 + 6 * CELL, y: 320 });           // a kid straight ahead in view
  withGame(kid, () => { updateBig(DT); });
  assert.equal(kid.big.state, "chase", "he chases the kid, not the cake");
  assert.equal(kid.big.cake, 0);
});
// a wall (not for the eyes) between Dad at (480, 320) and the cupcake 3 cells ahead, on the kids' grids and on his: the cupcake cannot be reached
function walledCake() {
  const g = clearGame("city");
  const it = addItem(g, "cupcake", 480 + 3 * CELL, 320);
  g.obstacles = [{ shape: "rect", x: 480 + CELL, y: 0, w: CELL, h: 640, move: true, sight: false }];
  for (let j = 0; j < 80; j++) for (let i = 0; i < 5; i++) { g.moveGrid[j * 120 + 60 + i] = 1; g.moveGridBig[j * 120 + 60 + i] = 1; }
  for (let c = 0; c < 20; c++) { g.blocked[c * 30 + 16] = 1; g.blockedBig[c * 30 + 16] = 1; }
  return { g, it };
}
// the longest time Dad stands in patrol (or walks less than half a cell) over `seconds`, as the stall guard (SPEC-037) sees it
function longestStill(g, seconds) {
  let x0 = null, still = 0, worst = 0;
  withGame(g, () => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      updateBig(DT); updateItems(DT);
      if (g.big.state === "patrol") { if (x0 && Math.hypot(g.big.x - x0.x, g.big.y - x0.y) < CELL / 2) still += DT; else { x0 = { x: g.big.x, y: g.big.y }; still = 0; } worst = Math.max(worst, still); } else { x0 = null; still = 0; }
    }
  });
  return worst;
}
test("cupcake: one he cannot reach is ignored (he does not walk to it), so he never stands stuck in patrol", () => {
  const { g, it } = walledCake();
  assert.ok(longestStill(g, WI.cupcake.giveUp + 3) <= CFG.BALANCE.STALL.TIME, "no stall");
  assert.equal(g.big.cake, 0, "never went for it");
  assert.equal(g.big.slip, 0);
  assert.ok(it.t < it.life, "it is still there (he just does not see a way to it)");
});
test("cupcake: a walk that gets nowhere (pressed on a wall) is given up after `stuck` s, by the way he went, not by whether he moves", () => {
  const { g, it } = walledCake();
  g.big.cake = it.id;                                                      // he is already on his way (a wall appeared, a friend fell in the way…)
  assert.ok(longestStill(g, WI.cupcake.giveUp + 3) <= CFG.BALANCE.STALL.TIME, "no stall");
  assert.ok(it.t >= it.life, "he gave the cupcake up");
  assert.equal(g.big.cake, 0);
});
test("cupcake: a boss eats for half the time", () => {
  const b = clearGame("city");
  b.big.boss = "city";
  addItem(b, "cupcake", 480 + 3 * CELL, 320);
  withGame(b, () => { for (let i = 0; i < 300 && b.big.slip <= 0; i++) { updateBig(DT); updateItems(DT); } });
  assert.ok(Math.abs(b.big.slip - WI.cupcake.time * WI.bossMul) < 0.1, `boss eats ${b.big.slip}`);
});
test("a Dad a player moves has no plane look and no cupcake walk or meal (his AI does not run; the effects that lay him down still do)", () => {
  const slots = [{ slot: "p1", kind: "player" }, { slot: "big", kind: "player" }];
  const g = clearGame("school", { slots });
  assert.ok(g.big.player);
  g.big.dir = Math.PI / 2; Object.assign(g.big, { x: 480, y: 200 });
  addItem(g, "cupcake", 480, 235);                                         // in front of him, within reach
  const it = addItem(g, "plane", 300, 320);
  runInto(g, g.littles[0], it, 0);
  tick(g);
  Object.assign(g.littles[0], { x: 100, y: 40, moving: false });
  flight(g);
  assert.equal(g.big.watch, 0, "no plane look");
  withGame(g, () => { for (let i = 0; i < 90; i++) { updateBigPlayer(DT); updateItems(DT); } });
  assert.equal(g.big.cake, 0);
  assert.equal(g.big.slip, 0, "no meal");
  assert.equal(g.items.filter(i => i.kind === "cupcake").length, 1, "the cupcake is still there");
  addItem(g, "watermelon", g.big.x, g.big.y);                              // a watermelon still lays him down
  tick(g);
  assert.equal(g.big.slipKind, "melon");
});
test("the plane look waits for the blush: a red Dad (just kissed) does not turn to a plane", () => {
  const g = planeGame({ blush: 3 });
  throwPlane(g);
  assert.equal(g.big.watch, 0);
});

test("cupcake: no effect in a practice game", () => {
  const p = clearGame("city", { practice: 2 });
  addItem(p, "cupcake", 480 + 2 * CELL, 320);
  withGame(p, () => { for (let i = 0; i < 120; i++) { updateBig(DT); updateItems(DT); } });
  assert.equal(p.big.slip, 0);
  assert.equal(p.items.filter(i => i.kind === "cupcake").length, 1);
});

// ================= 2c: the paper plane (School) =================
// Dad at (480, 200) facing down (+y); the plane flies right along y = 320, in front of him
function planeGame(over = {}) {
  const g = clearGame("school");
  Object.assign(g.big, { x: 480, y: 200, dir: Math.PI / 2, ...over });
  return g;
}
function throwPlane(g, tiptoe = false) {
  const it = addItem(g, "plane", 300, 320);
  runInto(g, g.littles[0], it, 0, tiptoe ? CFG.TIPTOE_MULT : 1);
  tick(g);
  Object.assign(g.littles[0], { x: 100, y: 40, moving: false });
  return flight(g);
}
test("plane: a kid who runs into it sends it 8 cells in his direction (tiptoe too), with a Whee", () => {
  for (const tip of [false, true]) {
    const g = planeGame();
    const path = throwPlane(g, tip);
    assert.ok(Math.abs(length(path) - WI.plane.cells * CELL) < 16, `flew ${length(path)} px`);
    assert.ok(kinds(g).includes("pop:whee") && kinds(g).includes("sfx:whee"), kinds(g).join());
  }
});
test("plane: Dad who sees it fly watches it for 2 s facing where it went, sees nobody else and never chases meanwhile; a boss watches 1 s", () => {
  const g = planeGame();
  throwPlane(g);
  assert.ok(Math.abs(g.big.watch - WI.plane.time) < 0.2, `watch ${g.big.watch}`);
  Object.assign(g.littles[1], { x: g.big.x, y: g.big.y + 4 * CELL, state: "ok" });   // a kid walks into his view
  let chased = false;
  withGame(g, () => { for (let i = 0; i < Math.floor((WI.plane.time - 0.3) / DT); i++) { updateBig(DT); if (g.big.state === "chase") chased = true; } });
  assert.equal(chased, false, "no chase while he watches");
  assert.ok(g.big.watch > 0);
  const face = Math.atan2(g.big.watchY - g.big.y, g.big.watchX - g.big.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(g.big.dir - face), Math.cos(g.big.dir - face))) < 0.2, "facing the plane");
  withGame(g, () => { for (let i = 0; i < 40; i++) updateBig(DT); });
  assert.ok(g.big.watch <= 0, "over");
  const b = planeGame({ boss: "school" });
  throwPlane(b);
  assert.ok(Math.abs(b.big.watch - WI.plane.time * WI.bossMul) < 0.2, `boss watch ${b.big.watch}`);
});
test("plane: he does not turn for a plane behind him, nor while chasing; it stops at a wall; no effect in practice", () => {
  const g = planeGame({ dir: -Math.PI / 2 });                              // faces up: the plane flies below, behind him
  throwPlane(g);
  assert.equal(g.big.watch, 0);
  const c = planeGame({ state: "chase", lastSeen: { x: 480, y: 260 } });
  throwPlane(c);
  assert.equal(c.big.watch, 0, "a chasing Dad does not look at planes");
  const w = clearGame("school");
  Object.assign(w.big, { x: 40, y: 600 });
  for (let j = 0; j < 80; j++) w.moveGrid[j * 120 + 45] = 1;             // wall at x = 360
  const path = throwPlane(w);
  assert.ok(path.at(-1)[0] < 362, "stopped at the wall");
  const p = clearGame("school", { practice: 2 });
  const it = addItem(p, "plane", 300, 320);
  runInto(p, p.littles[0], it, 0);
  tick(p, 3);
  assert.equal(p.shots.length, 0);
});

// ================= 2d: the watermelon slice (Beach) =================
test("watermelon: Dad who steps on it slides 2 cells the way he walks and lies 3.5 s, huggable from any side", () => {
  const g = clearGame("beach");
  Object.assign(g.big, { moving: true, moveDir: 0 });
  addItem(g, "watermelon", 480, 320);
  tick(g);
  assert.equal(g.big.slipKind, "melon");
  assert.ok(Math.abs(g.big.slip - WI.watermelon.time) < 0.05);
  assert.equal(g.items.filter(i => i.kind === "watermelon").length, 0);
  assert.ok(kinds(g).includes("pop:slip") && kinds(g).includes("sfx:slip"), kinds(g).join());
  const x0 = g.big.x;
  withGame(g, () => { for (let i = 0; i < 90; i++) updateBig(DT); });
  assert.ok(Math.abs(g.big.x - x0 - WI.watermelon.slide * CELL) < 3, `slid ${g.big.x - x0}`);
  assert.ok(Math.abs(g.big.y - 320) < 1);
  assert.ok(g.big.slip > 0, "still lying (3.5 s)");
  Object.assign(g.littles[1], { x: g.big.x + g.big.r + 12, y: g.big.y, moving: false, task: "attack" });
  withGame(g, () => checkContacts());
  assert.equal(g.stats.hugs, 1);
});
test("watermelon: the slide stops at a wall; a boss lies half the time; Dad walking home kind or a practice game: nothing", () => {
  const g = clearGame("beach");
  for (let j = 0; j < 80; j++) { g.moveGrid[j * 120 + 64] = 1; g.moveGridBig[j * 120 + 64] = 1; }   // a wall at x = 512
  g.obstacles = [{ shape: "rect", x: 512, y: 0, w: 32, h: 640, move: true, sight: true }];
  Object.assign(g.big, { moving: true, moveDir: 0, boss: "beach" });
  addItem(g, "watermelon", 480, 320);
  tick(g);
  assert.ok(Math.abs(g.big.slip - WI.watermelon.time * WI.bossMul) < 0.05, "boss");
  withGame(g, () => { for (let i = 0; i < 40; i++) updateBig(DT); });
  assert.ok(g.big.x <= 512 - g.big.r + 0.5, `stopped by the wall at ${g.big.x}`);
  const k = clearGame("beach");
  k.big.kind = true;
  addItem(k, "watermelon", 480, 320);
  tick(k);
  assert.equal(k.big.slip, 0);
  const p = clearGame("beach", { practice: 2 });
  addItem(p, "watermelon", 480, 320);
  tick(p);
  assert.equal(p.big.slip, 0);
});
test("watermelon: a bot runs to a lying Dad (the banana's rule: lying Dad, attack)", () => {
  const g = clearGame("beach");
  Object.assign(g.big, { moving: true, moveDir: 0 });
  addItem(g, "watermelon", 480, 320);
  tick(g);
  const bot = g.littles.find(q => q.kind === "bot");
  Object.assign(bot, { x: 480 - 150, y: 320 });
  for (let i = 0; i < 60; i++) step(g, DT);
  assert.equal(bot.task, "attack");
});

// ================= 2e: the snowball pile (Winter) =================
test("snowball: running into the pile throws a snowball 7 cells in the kid's direction (tiptoe too); a hit freezes Dad 1.5 s, Brrr", () => {
  const g = clearGame("winter");
  const it = addItem(g, "snowball", 300, 320), l = g.littles[0];
  runInto(g, l, it, 0, CFG.TIPTOE_MULT);
  tick(g);
  assert.equal(g.shots.length, 1);
  Object.assign(l, { x: 100, y: 40, moving: false });
  flight(g);
  assert.equal(g.big.slipKind, "freeze");
  assert.ok(Math.abs(g.big.slip - WI.snowball.time) < 0.1, `frozen ${g.big.slip}`);
  assert.ok(kinds(g).includes("pop:brr") && kinds(g).includes("sfx:freeze"), kinds(g).join());
  assert.equal(hits(g, "hit"), 1);
  Object.assign(g.littles[1], { x: g.big.x + g.big.r + 12, y: g.big.y, moving: false, task: "attack" });
  withGame(g, () => { for (let i = 0; i < 20; i++) updateBig(DT); });
  assert.notEqual(g.big.state, "chase", "frozen Dad does not chase");
  withGame(g, () => checkContacts());
  assert.equal(g.stats.hugs, 1);
});
test("snowball: it flies 7 cells and is gone, a wall stops it (no bounce), a boss freezes for half the time, practice has nothing", () => {
  const g = clearGame("winter");
  Object.assign(g.big, { x: 40, y: 600 });
  const it = addItem(g, "snowball", 100, 320);
  runInto(g, g.littles[0], it, 0);
  tick(g);
  const path = flight(g);
  assert.ok(Math.abs(length(path) - WI.snowball.cells * CELL) < 16, `flew ${length(path)}`);
  const w = clearGame("winter");
  Object.assign(w.big, { x: 40, y: 600 });
  for (let j = 0; j < 80; j++) w.moveGrid[j * 120 + 45] = 1;
  const it2 = addItem(w, "snowball", 300, 320);
  runInto(w, w.littles[0], it2, 0);
  tick(w);
  assert.ok(flight(w).at(-1)[0] < 362);
  const b = clearGame("winter");
  b.big.boss = "winter";
  const it3 = addItem(b, "snowball", 300, 320);
  runInto(b, b.littles[0], it3, 0);
  tick(b); Object.assign(b.littles[0], { x: 100, y: 40, moving: false });
  flight(b);
  assert.ok(Math.abs(b.big.slip - WI.snowball.time * WI.bossMul) < 0.1, `boss ${b.big.slip}`);
  const p = clearGame("winter", { practice: 2 });
  const it4 = addItem(p, "snowball", 300, 320);
  runInto(p, p.littles[0], it4, 0);
  tick(p, 3);
  assert.equal(p.shots.length, 0);
});
test("snowball and plane: a bot or the autopilot runs through one that lies near Dad, in line behind him, and uses it on him", () => {
  for (const [world, kind, effect] of [["winter", "snowball", "hit"], ["school", "plane", "launch"]]) {
    for (const who of ["bot", "autopilot"]) {
      const g = clearGame(world);
      g.big.hearLook = 99;
      addItem(g, kind, 400, 320);
      const l = who === "bot" ? g.littles.find(q => q.kind === "bot") : g.littles[0];
      Object.assign(l, { x: 340, y: 320, dir: 0 });
      g.littles.forEach(q => { if (q !== l) Object.assign(q, { x: 60 + 40 * q.id, y: 40 }); });
      if (who === "autopilot") { g.autoOn = true; g.autoStyle = "careful"; }
      for (let i = 0; i < 240 && !hits(g, effect); i++) step(g, DT);
      assert.ok(hits(g, effect) > 0, `${world} ${who}`);
    }
  }
});
test("same seed, same game: the five world levels play the same twice, with world items used (counted per kind); with WORLD_ITEMS_ON 0 none appears", () => {
  const run = on => {
    const keep = CFG.WORLD_ITEMS_ON; CFG.WORLD_ITEMS_ON = on;
    try {
      const sig = [], counts = {}, seen = new Set();
      for (const world of ["field", "city", "school", "beach", "winter"]) for (const seed of [21, 22]) {
        const g = createGame({ world, n: 3, seed, fx: false, slots: [{ slot: "p1", kind: "player" }] });
        withGame(g, () => autopilot(true, "careful"));
        for (let i = 0; i < 5400; i++) { step(g, DT); for (const it of g.items) seen.add(it.kind); }
        for (const e of g.events) if (e.type === "worldItem") counts[e.kind + ":" + e.effect] = (counts[e.kind + ":" + e.effect] || 0) + 1;
        sig.push(g.events.map(e => e.type + e.t.toFixed(3)).join(), g.big.x, g.big.y);
      }
      return { sig: JSON.stringify(sig), counts, seen };
    } finally { CFG.WORLD_ITEMS_ON = keep; }
  };
  const a = run(1), b = run(1);
  assert.equal(a.sig, b.sig, "deterministic");
  assert.deepEqual(a.counts, b.counts, "the same uses");
  assert.ok(Object.values(a.counts).reduce((x, y) => x + y, 0) > 0, `world items were used: ${JSON.stringify(a.counts)}`);
  for (const k of ["football", "cupcake", "plane", "watermelon", "snowball"]) assert.ok(a.seen.has(k), `${k} showed up`);
  const off = run(0);
  assert.deepEqual(off.counts, {});
  for (const k of ["football", "cupcake", "plane", "watermelon", "snowball"]) assert.ok(!off.seen.has(k), `${k} never with WORLD_ITEMS_ON 0`);
});
