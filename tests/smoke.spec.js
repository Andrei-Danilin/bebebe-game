// Smoke tests: the game loads, every screen and place renders, nothing throws.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, step, frames, ROOT } = require("./helpers");
const fs = require("fs");
const path = require("path");

test("loads to the home screen without errors", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  expect(errors).toEqual([]);
});

// SPEC-023 AC 5: every getter of window.__bb is either drawn state (in __bb.SIM_DRAWN: throws in sim mode) or on this
// list of logic state that a sim test may read. A new getter must be put in one of the two, so a drawn one can't slip past
// the sim guard.
const LOGIC_GETTERS = ["mode", "muted", "wardrobePage", "littles", "big", "stats", "level", "world", "toast", "items", "progress",
  "lastReward", "upgrades", "shopTab", "outfits", "events", "rngDraws", "strictRng", "shake", "sticks", "uiSize", "names", "stars",
  "dangerZone", "safeZone", "texts", "kisses", "bigMark", "levelInfo", "banner"];
test("every __bb getter is drawn state (SIM_DRAWN) or listed logic state", async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptors(window.__bb);   // descriptors only: no getter runs
    return { getters: Object.keys(d).filter(k => d[k].get), all: Object.keys(d), drawn: window.__bb.SIM_DRAWN };
  });
  expect(r.getters.filter(k => !r.drawn.includes(k) && !LOGIC_GETTERS.includes(k)), "getters in neither SIM_DRAWN nor LOGIC_GETTERS").toEqual([]);
  expect(r.drawn.filter(k => LOGIC_GETTERS.includes(k)), "in both lists").toEqual([]);
  expect(r.drawn.filter(k => !r.all.includes(k)), "SIM_DRAWN names missing from __bb").toEqual([]);
  expect(LOGIC_GETTERS.filter(k => !r.getters.includes(k)), "LOGIC_GETTERS that are no getter of __bb").toEqual([]);
  expect(errors).toEqual([]);
});

// SPEC-023: the rule tests moved to sim pages no longer draw the states they build. This one rendered test builds them —
// an air kiss in flight, a blushing Big One, a throw-out of his house, a downed Little One and a rescue kit, a bonus star,
// every level type — and draws real frames of each: nothing may throw while drawing them.
test("the gameplay states the sim tests build draw without errors", async ({ page }) => {
  const errors = await openGame(page);
  const seen = {};
  const scene = async (name, fn, arg) => { seen[name] = await page.evaluate(fn, arg); await frames(page); await frames(page); };
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await scene("kiss", () => {
    const b = window.__bb, l = b.littles[0]; Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 0, pushCd: 0 });
    b.progress.inv.kisses = 3; Object.assign(l, { state: "ok", x: 480, y: 320, kissCd: 0, invuln: 0 });
    b.throwKiss(0); b.update(1 / 60);
    return b.kisses.length;
  });
  await scene("blush", () => { const b = window.__bb; b.big.blush = 2; b.update(1 / 60); return b.big.blush > 0; });
  await scene("throwOut", () => {
    const b = window.__bb, l = b.littles[0], z = b.dangerZone; Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 0, pushCd: 0 });
    Object.assign(l, { state: "ok", x: z.x + z.w / 2, y: z.y + z.h / 2, invuln: 0 });
    for (let i = 0; i < 5.2 * 60; i++) b.update(1 / 60);
    return b.inDanger(l) === false && l.dizzy > 0;
  });
  await scene("down", () => {
    const b = window.__bb, l = b.littles[0];
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, slip: 0, blush: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", invuln: 0, dizzy: 0, x: 535, y: 320 });
    for (let i = 0; i < 12; i++) b.update(1 / 60);
    return l.state;
  });
  await scene("kit", () => { const b = window.__bb; Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 0, pushCd: 0 }); b.progress.inv.rescues = 1; const ok = b.useRescueKit(0); b.update(1 / 60); return ok; });
  await scene("star", () => { const b = window.__bb; b.spawnStar(300, 200); b.update(1 / 60); return b.stars.length > 0; });
  for (const lv of [1, 2, 5, 8, 11, 14, 17]) {          // one level of every type (as in levels.spec "every world dresses every level type")
    await scene("type" + lv, n => { const b = window.__bb; b.level = n; b.startGame(1); for (let i = 0; i < 30; i++) b.update(1 / 60); return b.levelInfo.type; }, lv);
  }
  expect(seen).toMatchObject({ kiss: 1, blush: true, throwOut: true, down: "down", kit: true, star: true });
  expect(new Set([1, 2, 5, 8, 11, 14, 17].map(n => seen["type" + n])).size, "every level type was built").toBe(7);
  expect(errors).toEqual([]);
});

test("every screen draws without errors", async ({ page }) => {
  const errors = await openGame(page);
  // SPEC-017: home, map, story, the shop's three tabs and the friends page
  for (const [m, tab, pg] of [["home"], ["map"], ["story"], ["shop", "items"], ["shop", "wardrobe"], ["shop", "wardrobe", "friends"], ["shop", "upgrades"], ["home"]]) {
    await page.evaluate(([v, t, f]) => { const b = window.__bb; b.mode = v; if (t) b.shopTab = t; if (f) b.wardrobePage = f; }, [m, tab, pg]);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.__bb.startGame(2));
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = window.__bb; b.mode = "map"; });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__bb.tapButton("stop:1"));             // SPEC-017: the level card over the map
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__bb.startGame(2));
  for (const m of ["pause", "win", "lose", "play"]) {
    await page.evaluate(v => { window.__bb.mode = v; }, m);
    await page.waitForTimeout(150);
  }
  expect(errors).toEqual([]);
});

for (const place of ["park", "beach", "winter", "school"]) {
  test(`world ${place}: builds and plays 20 s without errors`, async ({ page }) => {
    const errors = await openGame(page);
    await page.evaluate(p => { window.__bb.world = p; window.__bb.level = 1; window.__bb.startGame(1); }, place);
    await step(page, 20);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
    expect(errors).toEqual([]);
  });
}

for (const lang of ["en", "es", "ru"]) {
  test(`language ${lang}: home, map, story, the shop tabs and friends draw`, async ({ page }) => {
    const errors = await openGame(page, { lang });
    for (const [m, tab, pg] of [["home"], ["map"], ["story"], ["shop", "items"], ["shop", "wardrobe"], ["shop", "wardrobe", "friends"], ["shop", "upgrades"]]) {
      await page.evaluate(([v, t, f]) => { const b = window.__bb; b.mode = v; if (t) b.shopTab = t; if (f) b.wardrobePage = f; }, [m, tab, pg]);
      await page.waitForTimeout(120);
    }
    expect(errors).toEqual([]);
  });
}

// SPEC-018: an evaluate whose arrow body is an expression returns its value to the test. Object.assign(littles[i], …)
// returns the Little One, so Playwright serializes him with his 3D parts: 11–15 s per call. Mutating bodies go in braces.
test("tests never return game objects from evaluate", { tag: "@fast" }, () => {
  const dir = path.join(ROOT, "tests"), bad = [];
  // the whole file text is scanned, so \s also crosses line breaks; `async` arrows count too
  const arrow = String.raw`evaluate\(\s*(?:async\s+)?(?:\([^()]*\)|\w+)\s*=>\s*`;
  const pick = String.raw`(?:\[[^\]]*\]|\.find\((?:[^()]|\([^()]*\))*\))?`;   // littles[0], littles.find(l => …)
  const patterns = [
    new RegExp(arrow + String.raw`Object\.assign\(`, "g"),                                                   // returns its target
    new RegExp(arrow + String.raw`window\.__bb\.(?:big|littles|items|stars|kisses)` + pick + String.raw`\s*[,)]`, "g")   // a game object as is
  ];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const re of patterns) for (const m of src.matchAll(re)) {
      bad.push(`${f}:${src.slice(0, m.index).split("\n").length}: ${m[0].replace(/\s+/g, " ")}`);
    }
  }
  expect(bad, bad.join("\n")).toEqual([]);
  // the guard itself catches the old forms and leaves the braced one alone ("ev" + "aluate": this file is scanned too)
  const ev = "await page.ev" + "aluate(", hit = (k, s) => { patterns[k].lastIndex = 0; return patterns[k].test(s); };
  expect(hit(0, ev + "() => Object.assign(window.__bb.big, { x: 1 }));")).toBe(true);
  expect(hit(0, ev + "() =>\n    Object.assign(window.__bb.big, { x: 1 }));")).toBe(true);                // over two lines
  expect(hit(0, ev + "async () => Object.assign(window.__bb.big, { x: 1 }));")).toBe(true);
  expect(hit(0, ev + "v => Object.assign(window.__bb.littles[v], { x: 1 }), 2);")).toBe(true);
  expect(hit(0, ev + "() => { Object.assign(window.__bb.big, { x: 1 }); });")).toBe(false);
  expect(hit(1, ev + "() => window.__bb.littles[0]);")).toBe(true);
  expect(hit(1, ev + "() => window.__bb.littles.find(l => l.kind === \"bot\"));")).toBe(true);
  expect(hit(1, ev + "async () => window.__bb.big);")).toBe(true);
  expect(hit(1, ev + "() => window.__bb.littles[0].state);")).toBe(false);
  expect(hit(1, ev + "() => window.__bb.littles.find(l => l.kind === \"bot\").x);")).toBe(false);
});

// Safari before iOS 16.4 cannot parse a regex lookbehind: the whole module fails with a SyntaxError and the game does
// not start at all (older iPads). Keep (?<= and (?<! out of index.html.
test("index.html has no regex lookbehind (older iPads)", { tag: "@fast" }, () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  expect(src.includes("(?<="), "(?<= in index.html").toBe(false);
  expect(src.includes("(?<!"), "(?<! in index.html").toBe(false);
});
