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
