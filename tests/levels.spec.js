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

// Flood fill over cells that are not solid; returns the reached grid. solid[y][x] === true blocks.
function flood(solid, start) {
  const seen = Array.from({ length: 20 }, () => Array(30).fill(false)), q = [start];
  if (solid[start[1]][start[0]]) return seen;
  seen[start[1]][start[0]] = true;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 30 || ny >= 20 || seen[ny][nx] || solid[ny][nx]) continue;
      seen[ny][nx] = true; q.push([nx, ny]);
    }
  }
  return seen;
}
const front = d => [d.x + d.dx, d.y + d.dy];   // first cell in front of a house door (gen.doors)
const SOLID = ["wall", "cottage", "pond", "water", "tree", "rock"];

test("river has bridges and the houses on opposite banks", async ({ page }) => {
  const levels = await levelsOf(page, "river");
  expect(levels.map(x => x.lv)).toEqual([5, 11, 17, 23, 29, 35, 41, 47, 53, 59]);
  let verticals = 0;
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    expect(r.fallback, at).toBe(false);
    const water = cellsOf(gen, it => it.t === "water"), bridge = cellsOf(gen, it => it.t === "floor" && it.kind === "bridge");
    const river = (x, y) => water[y][x] || bridge[y][x];
    const vertical = !water.some(row => row[0]) && !water.some(row => row[29]);
    if (vertical) verticals++;
    // from one map edge to the opposite one: every line across the river has one run of 2–3 river cells
    const along = vertical ? 20 : 30, tops = [];
    for (let p = 0; p < along; p++) {
      const across = [];
      for (let q = 0; q < (vertical ? 30 : 20); q++) if (vertical ? river(q, p) : river(p, q)) across.push(q);
      expect(across.length >= 2 && across.length <= 3 && across[across.length - 1] - across[0] === across.length - 1, `${at}: river at ${p}: ${across}`).toBe(true);
      tops.push(across[0]);
    }
    for (let p = 1; p < along; p++) expect(Math.abs(tops[p] - tops[p - 1]), `${at}: meander at ${p}`).toBeLessThanOrEqual(1);
    // 2–3 bridges, 2–3 cells wide, no water under them
    const bridges = gen.items.filter(it => it.t === "floor" && it.kind === "bridge");
    expect(inRange(bridges.length, [2, 3]), `${at}: ${bridges.length} bridges`).toBe(true);
    for (const b of bridges) {
      expect(inRange(vertical ? b.h : b.w, [2, 3]), `${at}: bridge ${JSON.stringify(b)}`).toBe(true);
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) expect(water[y][x], `${at}: water under bridge`).toBe(false);
    }
    // the houses on opposite banks: without bridges the Little Ones' door can't reach the Big One's door; with them it can
    const solid = cellsOf(gen, it => SOLID.includes(it.t));
    const noBridge = solid.map((row, y) => row.map((v, x) => v || bridge[y][x]));
    const s = front(gen.doors.small[0]), bd = front(gen.doors.big[0]);
    expect(flood(noBridge, s)[bd[1]][bd[0]], `${at}: banks joined without a bridge`).toBe(false);
    expect(flood(solid, s)[bd[1]][bd[0]], `${at}: bridges don't join the banks`).toBe(true);
    // bushes on both banks
    const bush = gen.items.filter(it => it.t === "bush"), reachS = flood(noBridge, s);
    expect(inRange(bush.length, bushRange(4, [6, 8], tier)), `${at}: ${bush.length} bushes`).toBe(true);
    expect(bush.some(q => reachS[q.y][q.x]) && bush.some(q => !reachS[q.y][q.x]), `${at}: bushes on both banks`).toBe(true);
    expect(inRange(count(gen, it => it.t === "tree"), [5, 8]) && inRange(count(gen, it => it.t === "rock"), [1, 3]), at).toBe(true);
  }
  expect(verticals, "some rivers run top to bottom").toBeGreaterThan(0);
  expect(verticals, "some rivers run left to right").toBeLessThan(levels.length);
  // in the game: water blocks walking but not sight (the Big One sees across, kisses fly over)
  const o = await page.evaluate(() => {
    const b = window.__bb; b.level = 5; b.startGame(1);
    const w = b.world, o = w.obstacles.find(q => q.kind === "water");
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    return { move: o.move, sight: o.sight, see: w.seeSolid(cx, cy), blocked: w.blocked[Math.floor(cy / w.CELL) * w.COLS + Math.floor(cx / w.CELL)] };
  });
  expect(o).toEqual({ move: true, sight: false, see: false, blocked: 1 });
});

test("rooms all have doors and the building has loops", async ({ page }) => {
  const levels = await levelsOf(page, "rooms");
  expect(levels.map(x => x.lv)).toEqual([6, 12, 18, 24, 30, 36, 42, 48, 54, 60]);
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    expect(r.fallback, at).toBe(false);
    expect([...new Set(gen.items.filter(it => it.t === "wall").map(it => it.kind))].sort(), at).toEqual(["bighome", "build", "home"]);
    const wall = cellsOf(gen, it => it.t === "wall"), { rooms, doors } = gen.meta.areas;
    const roomAt = (x, y) => rooms.findIndex(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    expect(rooms.length, at).toBeGreaterThanOrEqual(3);
    for (const q of rooms) {
      expect(q.w >= 4 && q.h >= 4, `${at}: room ${JSON.stringify(q)}`).toBe(true);
      const inside = [];
      for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (wall[y][x]) inside.push(`${x},${y}`);
      expect(inside, `${at}: walls inside room ${JSON.stringify(q)}`).toEqual([]);
    }
    // doors are 2-cell gaps in the walls; each side is a room (index) or a yard ("small" / "big")
    for (const d of doors) {
      expect(d.w * d.h, at).toBe(2);
      const vert = d.w === 1;
      for (let k = 0; k < 2; k++) {
        const x = d.x + (vert ? 0 : k), y = d.y + (vert ? k : 0);
        expect(wall[y][x], `${at}: door ${JSON.stringify(d)} is walled`).toBe(false);
        const sides = vert ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]];
        for (const [sx, sy] of sides) expect(wall[sy][sx], `${at}: door ${JSON.stringify(d)} opens on a wall`).toBe(false);
        const rs = sides.map(([sx, sy]) => roomAt(sx, sy));
        const ab = [d.a, d.b].map(v => typeof v === "number" ? v : -1);
        expect(rs.slice().sort(), `${at}: door ${JSON.stringify(d)} sides`).toEqual(ab.slice().sort());
      }
    }
    // every room has a door, ≥ 3 outside doors, everything connected, and some door can be removed (a loop)
    for (let k = 0; k < rooms.length; k++) expect(doors.some(d => d.a === k || d.b === k), `${at}: room ${k} without a door`).toBe(true);
    expect(doors.filter(d => typeof d.a !== "number" || typeof d.b !== "number").length, at).toBeGreaterThanOrEqual(3);
    const nodes = [...rooms.map((_, k) => k), "small", "big"];
    const connected = list => {
      const seen = new Set(["small"]), q = ["small"];
      while (q.length) { const n = q.pop(); for (const d of list) for (const [u, v] of [[d.a, d.b], [d.b, d.a]]) if (u === n && !seen.has(v)) { seen.add(v); q.push(v); } }
      return nodes.every(n => seen.has(n));
    };
    expect(connected(doors), `${at}: building not connected`).toBe(true);
    expect(doors.some((d, k) => connected(doors.filter((_, j) => j !== k))), `${at}: no loop`).toBe(true);
    // plants inside rooms, rocks only in big rooms, no trees
    const bush = gen.items.filter(it => it.t === "bush");
    expect(inRange(bush.length, bushRange(2, [3, 5], tier)), `${at}: ${bush.length} bushes`).toBe(true);
    for (const q of bush) expect(roomAt(q.x, q.y) >= 0 && roomAt(q.x, q.y) === roomAt(q.x + 1, q.y + 1), `${at}: bush outside rooms`).toBe(true);
    for (const q of gen.items.filter(it => it.t === "rock")) { const k = roomAt(q.x, q.y); expect(k >= 0 && rooms[k].w * rooms[k].h >= 30, `${at}: rock outside a big room`).toBe(true); }
    expect(inRange(count(gen, it => it.t === "rock"), [2, 4]), at).toBe(true);
    expect(count(gen, it => it.t === "tree"), at).toBe(0);
  }
});

test("arena has a ring with gaps", async ({ page }) => {
  const levels = await levelsOf(page, "arena");
  expect(levels.map(x => x.lv)).toEqual([7, 13, 19, 25, 31, 37, 43, 49, 55]);
  let withHalf = 0;
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    expect(r.fallback, at).toBe(false);
    const { block: [bl], ring: [rg], gaps, halfGaps } = gen.meta.areas;
    const arena = cellsOf(gen, it => it.t === "wall" && it.kind === "arena");
    // the central block is one solid arena wall 4–6 × 4
    expect(gen.items.some(it => it.t === "wall" && it.kind === "arena" && it.x === bl.x && it.y === bl.y && it.w === bl.w && it.h === bl.h), at).toBe(true);
    expect(inRange(bl.w, [4, 6]) && bl.h === 4, `${at}: block ${JSON.stringify(bl)}`).toBe(true);
    // the ring is 3 cells away from the block
    expect([rg.x, rg.y, rg.w, rg.h], at).toEqual([bl.x - 4, bl.y - 4, bl.w + 8, bl.h + 8]);
    // 3–4 gaps 2–3 wide; every other ring cell is an arena wall
    expect(inRange(gaps.length, [3, 4]), at).toBe(true);
    const inGap = (x, y) => gaps.some(g => x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h);
    for (const g of gaps) expect(inRange(g.w * g.h, [2, 3]) && (g.w === 1 || g.h === 1), `${at}: gap ${JSON.stringify(g)}`).toBe(true);
    const ringBad = [];
    for (let x = rg.x; x < rg.x + rg.w; x++) for (const y of [rg.y, rg.y + rg.h - 1]) if (arena[y][x] === inGap(x, y)) ringBad.push(`${x},${y}`);
    for (let y = rg.y; y < rg.y + rg.h; y++) for (const x of [rg.x, rg.x + rg.w - 1]) if (arena[y][x] === inGap(x, y)) ringBad.push(`${x},${y}`);
    expect(ringBad, `${at}: ring cells`).toEqual([]);
    // the ring corridor is reachable from outside through every single gap
    const solid = cellsOf(gen, it => SOLID.includes(it.t)), s = front(gen.doors.small[0]);
    for (const g of gaps) {
      const only = solid.map((row, y) => row.map((v, x) => v || (inGap(x, y) && !(x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h))));
      expect(flood(only, s)[bl.y - 2][bl.x + 1], `${at}: corridor not reached through gap ${JSON.stringify(g)}`).toBe(true);
    }
    // bushes in the ring corridor, trees outside
    const bush = gen.items.filter(it => it.t === "bush");
    expect(inRange(bush.length, bushRange(3, [4, 6], tier)), `${at}: ${bush.length} bushes`).toBe(true);
    for (const q of bush) expect(q.x > rg.x && q.y > rg.y && q.x + 1 < rg.x + rg.w - 1 && q.y + 1 < rg.y + rg.h - 1, `${at}: bush outside the ring`).toBe(true);
    for (const q of gen.items.filter(it => it.t === "tree")) expect(q.x < rg.x || q.y < rg.y || q.x >= rg.x + rg.w || q.y >= rg.y + rg.h, `${at}: tree inside the ring`).toBe(true);
    expect(inRange(count(gen, it => it.t === "tree"), [4, 7]) && inRange(count(gen, it => it.t === "rock"), [0, 2]), at).toBe(true);
    if (halfGaps.length) { withHalf++; expect(halfGaps.length, at).toBe(2); }
  }
  expect(withHalf, "some arenas have a half-ring").toBeGreaterThan(0);
  expect(withHalf, "some arenas have none").toBeLessThan(levels.length);
});

test("the game starts exactly the level that levelReport checks", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, w = b.world, C = w.CELL, out = [];
    // obstacles the game should build from a generated map
    const expected = gen => gen.items.flatMap(it => {
      if (["wall", "cottage", "water", "pond"].includes(it.t)) return [{ kind: it.t === "wall" ? it.kind : it.t, x: it.x * C, y: it.y * C, w: it.w * C, h: it.h * C }];
      if (it.t === "tree" || it.t === "rock") return [{ kind: it.t, x: it.x * C + 16, y: it.y * C + 16 }];
      return [];
    });
    const key = list => list.map(o => JSON.stringify([o.kind, o.x, o.y, o.w || 0, o.h || 0])).sort().join("|");
    for (const lv of [1, 2, 3, 4, 5, 6, 7, 27, 34]) {
      b.level = lv; b.startGame(1);
      const info = { ...b.levelInfo }, rep = b.levelReport(lv), gen = b.generateLevel(lv, rep.attempts - 1);
      const same = key(w.obstacles) === key(expected(gen));
      const spawns = b.littles.map(l => [l.x / C, l.y / C]);
      out.push({ lv, info, attempts: rep.attempts, type: rep.type, same, spawnsOk: JSON.stringify(spawns) === JSON.stringify(gen.small), bigOk: b.big.x / C === gen.big[0] && b.big.y / C === gen.big[1] });
    }
    return out;
  });
  for (const x of r) {
    const at = `level ${x.lv}`;
    expect(x.info.lv, at).toBe(x.lv);
    expect(x.info.type, at).toBe(x.type);
    expect(x.info.fallback, at).toBe(false);
    expect(x.info.attempt, at).toBe(x.attempts - 1);
    expect(x.same, `${at}: obstacles differ from generateLevel(lv, attempt)`).toBe(true);
    expect(x.spawnsOk && x.bigOk, `${at}: spawns`).toBe(true);
    expect(x.info.ms, `${at}: level build ms`).toBeLessThan(200);
  }
  expect(r.find(x => x.lv === 27).info.attempt, "level 27 needs a retry, the game takes the same one").toBeGreaterThan(0);
  expect(r.find(x => x.lv === 1).info.attempt, "level 1 is attempt 0").toBe(0);
});

test("a level with no fair layout falls back and warns", async ({ page }) => {
  const warns = [];
  page.on("console", m => { if (m.type() === "warning") warns.push(m.text()); });
  const r = await page.evaluate(() => {
    const b = window.__bb, keep = b.CFG.HOUSE_PATH;
    b.CFG.HOUSE_PATH = [999, 1000];   // no generated level can pass rule 3
    try {
      b.level = 2; b.startGame(1);
      for (let i = 0; i < 120; i++) b.update(1 / 60);   // the fallback level still plays
      return { info: { ...b.levelInfo }, mode: b.mode, littles: b.littles.length };
    } finally { b.CFG.HOUSE_PATH = keep; }
  });
  expect(r.info.fallback).toBe(true);
  expect(r.info.attempt).toBe(39);
  expect(r.mode).toBe("play");
  expect(r.littles).toBe(5);
  expect(warns.some(t => t.includes("level 2") && t.includes("housePath"))).toBe(true);
});
