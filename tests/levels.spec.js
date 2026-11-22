// SPEC-002: level types. Level 1 stays the kids' drawing; levels 2+ cycle through six types;
// every generated level is fair (window.__bb.levelReport) and the same number always builds the same map.
const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const { openGame } = require("./helpers");

const LEVEL1 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "level1.json"), "utf8"));
const TYPE_ORDER = ["meadow", "maze", "village", "river", "rooms", "arena"];
// limits from the spec ("Fairness rules" and the type table)
const FREE_MIN = { classic: 0.5, meadow: 0.5, maze: 0.4, village: 0.5, river: 0.5, rooms: 0.4, arena: 0.5 };
const BUSH_MIN = { classic: 3, meadow: 7, maze: 2, village: 3, river: 4, rooms: 2, arena: 3 };

let errors;
test.beforeEach(async ({ page }) => { errors = await openGame(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

test("level 1 is still the kids' drawing", async ({ page }) => {
  const gen = await page.evaluate(() => { const g = window.__bb.generateLevel(1, 0); return JSON.parse(JSON.stringify({ items: g.items, small: g.small, big: g.big })); });
  expect(gen).toEqual(LEVEL1);
});

test("levels 2–13 follow the type order", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = [];
    for (let lv = 1; lv <= 13; lv++) out.push({ lv, type: b.levelType(lv), gen: b.generateLevel(lv, 0).type, report: b.levelReport(lv).type });
    return out;
  });
  expect(r[0]).toEqual({ lv: 1, type: "classic", gen: "classic", report: "classic" });
  for (const x of r.slice(1)) {
    const want = TYPE_ORDER[(x.lv - 2) % 6];
    expect(x, `level ${x.lv}`).toEqual({ lv: x.lv, type: want, gen: want, report: want });
  }
  expect(await page.evaluate(() => [61, 62, 99].map(lv => window.__bb.levelType(lv)))).toEqual(["arena", "meadow", "maze"]);
});

test("the same level number always builds the same map", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, same = [];
    const strip = rep => JSON.stringify({ ...rep, ms: 0 });
    for (let lv = 1; lv <= 13; lv++) {
      const a = JSON.stringify(b.generateLevel(lv, 0)), a2 = JSON.stringify(b.generateLevel(lv, 3));
      const ra = strip(b.levelReport(lv));
      b.level = lv === 13 ? 1 : lv + 1; b.startGame(1);   // another level running in between
      same.push({ lv, gen: a === JSON.stringify(b.generateLevel(lv, 0)), gen3: a2 === JSON.stringify(b.generateLevel(lv, 3)), report: ra === strip(b.levelReport(lv)) });
    }
    return same;
  });
  for (const x of r) expect(x, `level ${x.lv}`).toEqual({ lv: x.lv, gen: true, gen3: true, report: true });
});

test("levels 1–60 are fair and build fast", async ({ page }) => {
  test.setTimeout(120_000);
  const r = await page.evaluate(() => {
    const b = window.__bb, w = b.world;
    b.level = 1; b.startGame(1);
    const before = JSON.stringify({ o: w.obstacles, bl: w.blocked, s: b.safeZone, d: b.dangerZone });
    const out = [];
    for (let lv = 1; lv <= 60; lv++) out.push({ lv, ...b.levelReport(lv) });
    const after = JSON.stringify({ o: w.obstacles, bl: w.blocked, s: b.safeZone, d: b.dangerZone });
    return { out, untouched: before === after };
  });
  expect(r.untouched).toBe(true);   // the running game's world is left as it was
  const bad = [];
  for (const x of r.out) {
    const why = [];
    const want = x.lv === 1 ? "classic" : TYPE_ORDER[(x.lv - 2) % 6];
    if (x.type !== want) why.push(`type ${x.type}`);
    if (x.fallback !== false) why.push("fallback");
    if (x.smallReachAll !== true) why.push("Little Ones can't reach every free cell");
    if (x.bigReachAll !== true) why.push("the Big One can't reach every free cell");
    // level 1 is the kids' drawing: its houses face each other (path 8), the path rule is for generated levels
    if (x.type !== "classic" && !(x.housePath >= 18 && x.housePath <= 70)) why.push(`house path ${x.housePath}`);
    if (!(x.freeRatio >= FREE_MIN[x.type])) why.push(`free ${x.freeRatio}`);
    if (x.doorClear !== true) why.push("door not clear");
    if (x.type === "maze") { if (!(x.deadEnds.before > 0 && x.deadEnds.count <= Math.floor(x.deadEnds.before * 0.25))) why.push(`maze dead ends ${JSON.stringify(x.deadEnds)}`); }
    else if (!(x.deadEnds.longest <= 6)) why.push(`dead end ${x.deadEnds.longest} cells`);
    if (!(x.bushes >= BUSH_MIN[x.type])) why.push(`bushes ${x.bushes}`);
    if (!(x.ms < 200)) why.push(`${Math.round(x.ms)} ms`);
    if (why.length) bad.push(`level ${x.lv} (${x.type}, ${x.attempts} attempts): ${why.join(", ")}`);
  }
  expect(bad).toEqual([]);
});

// Every level of one type in 2–60 as the game accepts it: the fairness report and the accepted map (attempt = attempts - 1).
async function levelsOf(page, type) {
  return page.evaluate(t => {
    const b = window.__bb, out = [];
    for (let lv = 2; lv <= 60; lv++) if (b.levelType(lv) === t) {
      const r = b.levelReport(lv);
      out.push({ lv, tier: Math.floor((lv - 2) / 6), r, gen: b.generateLevel(lv, r.attempts - 1) });
    }
    return out;
  }, type);
}
const count = (gen, pred) => gen.items.filter(pred).length;
const inRange = (n, [a, b]) => n >= a && n <= b;
const bushRange = (min, [a, b], tier) => [Math.max(min, a - tier), Math.max(min, b - tier)];
// cells of the map covered by items that match pred
function cellsOf(gen, pred) {
  const g = Array.from({ length: 20 }, () => Array(30).fill(false));
  for (const it of gen.items) if (pred(it)) for (let y = it.y; y < it.y + (it.h || 1); y++) for (let x = it.x; x < it.x + (it.w || 1); x++) if (y >= 0 && y < 20 && x >= 0 && x < 30) g[y][x] = true;
  return g;
}
const houseCorners = gen => {
  const s = gen.items.find(it => it.t === "safe"), d = gen.items.find(it => it.t === "danger");
  return { small: [s.x < 15, s.y < 10], big: [d.x < 15, d.y < 10] };
};

test("meadow is open with bushes", async ({ page }) => {
  const levels = await levelsOf(page, "meadow");
  expect(levels.map(x => x.lv)).toEqual([2, 8, 14, 20, 26, 32, 38, 44, 50, 56]);
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    expect(r.fallback, at).toBe(false);
    expect([...new Set(gen.items.filter(it => it.t === "wall").map(it => it.kind))].sort(), at).toEqual(["bighome", "home"]);
    expect(count(gen, it => it.t === "cottage" || it.t === "water"), at).toBe(0);
    const bushes = count(gen, it => it.t === "bush");
    expect(inRange(bushes, bushRange(7, [10, 12], tier)), `${at}: ${bushes} bushes`).toBe(true);
    expect(inRange(count(gen, it => it.t === "tree"), [6, 9]), at).toBe(true);
    expect(inRange(count(gen, it => it.t === "rock"), [2, 4]), at).toBe(true);
    expect(inRange(count(gen, it => it.t === "pond"), [0, 2]), at).toBe(true);
    const c = houseCorners(gen);   // open type: the houses are on the diagonal
    expect(c.small[0] !== c.big[0] && c.small[1] !== c.big[1], at).toBe(true);
  }
});

test("maze has 2-wide corridors and few dead ends", async ({ page }) => {
  const levels = await levelsOf(page, "maze");
  expect(levels.map(x => x.lv)).toEqual([3, 9, 15, 21, 27, 33, 39, 45, 51, 57]);
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    expect(r.fallback, at).toBe(false);
    const maze = gen.items.filter(it => it.t === "wall" && it.kind === "maze");
    expect(maze.length, at).toBeGreaterThan(10);
    for (const w of maze) expect(w.w === 1 || w.h === 1, `${at}: wall ${JSON.stringify(w)}`).toBe(true);
    const mz = cellsOf(gen, it => it.t === "wall" && it.kind === "maze");
    const solid = cellsOf(gen, it => ["wall", "cottage", "pond", "water", "tree", "rock"].includes(it.t));
    // walls are 1 cell thick: no 2×2 block of maze wall
    const thick = [];
    for (let y = 0; y < 19; y++) for (let x = 0; x < 29; x++) if (mz[y][x] && mz[y][x + 1] && mz[y + 1][x] && mz[y + 1][x + 1]) thick.push(`${x},${y}`);
    expect(thick, `${at}: thick maze walls`).toEqual([]);
    // corridors are 2 wide: no free run of exactly 1 cell between two maze walls (rows and columns)
    const narrow = [];
    for (let y = 0; y < 20; y++) for (let x = 1; x < 29; x++) if (!solid[y][x] && mz[y][x - 1] && mz[y][x + 1]) narrow.push(`${x},${y} row`);
    for (let x = 0; x < 30; x++) for (let y = 1; y < 19; y++) if (!solid[y][x] && mz[y - 1][x] && mz[y + 1][x]) narrow.push(`${x},${y} column`);
    expect(narrow, at).toEqual([]);
    // braided: at most a quarter of the perfect maze's dead ends are left
    expect(r.deadEnds.before, at).toBeGreaterThan(0);
    expect(r.deadEnds.count, `${at}: ${JSON.stringify(r.deadEnds)}`).toBeLessThanOrEqual(Math.floor(r.deadEnds.before * 0.25));
    // 1–2 open plazas of 4×4 to 5×5 without maze walls
    const plazas = gen.meta.areas.plazas;
    expect(inRange(plazas.length, [1, 2]), at).toBe(true);
    for (const q of plazas) {
      expect(inRange(q.w, [4, 5]) && inRange(q.h, [4, 5]), `${at}: plaza ${JSON.stringify(q)}`).toBe(true);
      const inPlaza = [];
      for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (mz[y][x]) inPlaza.push(`${x},${y}`);
      expect(inPlaza, `${at}: maze walls in plaza ${JSON.stringify(q)}`).toEqual([]);
    }
    const bushes = count(gen, it => it.t === "bush"), trees = count(gen, it => it.t === "tree");
    expect(inRange(bushes, bushRange(2, [3, 4], tier)), `${at}: ${bushes} bushes`).toBe(true);
    expect(trees <= Math.min(2, plazas.length), at).toBe(true);
    expect(count(gen, it => it.t === "rock" || it.t === "pond"), at).toBe(0);
  }
});

test("village has cottages, streets and a square", async ({ page }) => {
  const levels = await levelsOf(page, "village");
  expect(levels.map(x => x.lv)).toEqual([4, 10, 16, 22, 28, 34, 40, 46, 52, 58]);
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    expect(r.fallback, at).toBe(false);
    const cot = gen.items.filter(it => it.t === "cottage");
    expect(inRange(cot.length, [5, 8]), `${at}: ${cot.length} cottages`).toBe(true);
    for (const c of cot) {
      const [a, b] = [Math.min(c.w, c.h), Math.max(c.w, c.h)];
      expect(inRange(a, [3, 4]) && inRange(b, [3, 5]), `${at}: cottage ${JSON.stringify(c)}`).toBe(true);
    }
    // streets: no two cottages closer than 2 cells
    for (let i = 0; i < cot.length; i++) for (let j = i + 1; j < cot.length; j++) {
      const p = cot[i], q = cot[j], gap = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w), q.y - (p.y + p.h), p.y - (q.y + q.h));
      expect(gap, `${at}: cottages ${i} and ${j}`).toBeGreaterThanOrEqual(2);
    }
    // the square with a 2×2 fountain in it
    const sq = gen.items.find(it => it.t === "floor" && it.kind === "square");
    expect(sq, at).toBeTruthy();
    expect(inRange(sq.w, [5, 6]) && inRange(sq.h, [4, 5]), at).toBe(true);
    const f = gen.items.find(it => it.t === "pond" && it.w === 2 && it.h === 2 && it.x >= sq.x && it.y >= sq.y && it.x + 2 <= sq.x + sq.w && it.y + 2 <= sq.y + sq.h);
    expect(f, `${at}: fountain`).toBeTruthy();
    const bushes = count(gen, it => it.t === "bush");
    expect(inRange(bushes, bushRange(3, [5, 7], tier)), `${at}: ${bushes} bushes`).toBe(true);
    expect(inRange(count(gen, it => it.t === "tree"), [3, 6]), at).toBe(true);
    expect(inRange(count(gen, it => it.t === "rock"), [0, 2]), at).toBe(true);
  }
  // in the game a cottage blocks walking and sight (so air kisses stop at it too)
  const o = await page.evaluate(() => {
    const b = window.__bb; b.level = 4; b.startGame(1);
    const c = b.world.obstacles.find(q => q.kind === "cottage");
    return c && { move: c.move, sight: c.sight, see: b.world.seeSolid(c.x + c.w / 2, c.y + c.h / 2) };
  });
  expect(o).toEqual({ move: true, sight: true, see: true });
});
