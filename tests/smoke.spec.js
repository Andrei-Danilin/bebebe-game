// Smoke tests: the game loads, every screen and place renders, nothing throws.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { LANGS, openGame, step, frames, titleSeed, gameSource, ROOT } = require("./helpers");
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
const LOGIC_GETTERS = ["errorLog", "mode", "muted", "wardrobePage", "littles", "big", "stats", "level", "world", "toast", "openedWorld", "worldBanner", "items", "progress",
  "lastReward", "upgrades", "shopTab", "outfits", "events", "rngDraws", "strictRng", "shake", "sticks", "uiSize", "names", "stars",
  "dangerZone", "safeZone", "texts", "kisses", "bigMark", "levelInfo", "banner", "artInfo", "artVersion", "scene", "pushWaves", "lang",   // SPEC-028: lang
  "tutorial", "tutorialMapRect",    // SPEC-029: the tutorial state, the practice map
  "textFloors",                     // SPEC-031: phone text floors (reads CFG only)
  "game", "screenState"];           // SPEC-012: the active game (plain data); the menus' screen state (AC 1f)
test("every __bb getter is drawn state (SIM_DRAWN) or listed logic state", async ({ page }) => {
  const errors = await openGame(page, { sim: true });   // descriptors only, nothing drawn is read
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
  // seeded, and the bots pinned far away as players without controls (like __t.pin([0]) in gameplay.spec.js): the same scene every run
  await page.evaluate(() => {
    const b = window.__bb; b.seedRandom(23); b.world = "park"; b.level = 1; b.startGame(1);
    b.littles.forEach((l, i) => { if (i) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40, state: "ok" }); });
  });
  await scene("kiss", () => {
    const b = window.__bb, l = b.littles[0]; Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 0, pushCd: 0 });
    b.progress.inv.kisses = 3; Object.assign(l, { state: "ok", x: 480, y: 320, kissCd: 0, invuln: 0 });
    b.throwKiss(0); b.update(1 / 60);
    return b.kisses.length;
  });
  await scene("blush", () => { const b = window.__bb; b.big.blush = 2; b.update(1 / 60); return b.big.blush > 0; });
  // in his house: drawn once with the countdown running (dangerT ≈ 4.5 s), then thrown out
  await scene("inHouse", () => {
    const b = window.__bb, l = b.littles[0], z = b.dangerZone; Object.assign(b.big, { x: 900, y: 100, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 0, pushCd: 0 });
    Object.assign(l, { state: "ok", x: z.x + z.w / 2, y: z.y + z.h / 2, invuln: 0 });
    for (let i = 0; i < 4.5 * 60; i++) b.update(1 / 60);
    return Math.round(l.dangerT * 10) / 10;
  });
  await scene("throwOut", () => {
    const b = window.__bb, l = b.littles[0];
    for (let i = 0; i < 0.7 * 60; i++) b.update(1 / 60);
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
  expect(seen.inHouse).toBeGreaterThan(4);
  expect(seen).toMatchObject({ kiss: 1, blush: true, throwOut: true, down: "down", kit: true, star: true });
  expect(new Set([1, 2, 5, 8, 11, 14, 17].map(n => seen["type" + n])).size, "every level type was built").toBe(7);
  expect(errors).toEqual([]);
});

test("every screen draws without errors", async ({ page }) => {
  const errors = await openGame(page);
  // SPEC-017: home, map, story, the shop's three tabs and the friends page
  for (const [m, tab, pg] of [["home"], ["map"], ["story"], ["shop", "progress"], ["shop", "items"], ["shop", "wardrobe"], ["shop", "wardrobe", "friends"], ["shop", "upgrades"], ["home"]]) {
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

for (const lang of LANGS) {
  test(`language ${lang}: home, map, story, the shop tabs and friends draw`, async ({ page }) => {
    const errors = await openGame(page, { lang });
    for (const [m, tab, pg] of [["home"], ["map"], ["story"], ["shop", "progress"], ["shop", "items"], ["shop", "wardrobe"], ["shop", "wardrobe", "friends"], ["shop", "upgrades"]]) {
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

// SPEC-023: every spec file takes test/expect from ./pw (failure screenshots on CI). Allowed exceptions, with the reason:
// - assets.spec.js: Node-only (the art pipeline, no page) — ./pw's auto failureShots fixture needs the browser, so it would
//   launch one for nothing.
const PW_EXCEPTIONS = ["assets.spec.js"];
test("every spec file uses ./pw (or is a listed Node-only exception)", { tag: "@fast" }, () => {
  const dir = path.join(ROOT, "tests");
  const bad = fs.readdirSync(dir).filter(f => f.endsWith(".spec.js") && !PW_EXCEPTIONS.includes(f))
    .filter(f => !/require\("\.\/pw"\)/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  expect(bad).toEqual([]);
  for (const f of PW_EXCEPTIONS) expect(fs.readFileSync(path.join(dir, f), "utf8"), f + " is Node-only: no page fixture").not.toMatch(/\{\s*page\s*\}/);
});

// Safari before iOS 16.4 cannot parse a regex lookbehind: the whole module fails with a SyntaxError and the game does
// not start at all (older iPads). Keep (?<= and (?<! out of the game code (SPEC-011 AC 8c: src/**).
test("the game code has no regex lookbehind (older iPads)", { tag: "@fast" }, () => {
  const src = gameSource();
  expect(src.includes("(?<="), "(?<= in the game code").toBe(false);
  expect(src.includes("(?<!"), "(?<! in the game code").toBe(false);
});

// SPEC-011 AC 8d: every test game is seeded before it starts, so a test plays the same game on every run (an unseeded start
// made "bots keep out of the grumpiest dad's front…" fail on one Pages run). openGame / openGameHttp / resetGame / reloadGame
// seed from the test title (helpers.js testSeed()). This scan finds the ways around it in the test code: in the innermost
// { } block of a startGame( / resetWorld( call
// - the last seedRandom( before it is seedRandom() (unseeded), or
// - there is no seedRandom( before it but a seeded one after it (the seed meant for this game came after the start), or
// - a page.reload( / page.goto( comes before it with no seeded seedRandom( in between (the reloaded game is unseeded:
//   use reloadGame(page)).
// Strings, template literals, comments and regex literals are blanked first, so text about these calls is not code.
function codeOnly(src) {
  const out = src.split(""), blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0, prev = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i), j = e < 0 ? src.length : e; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2), j = e < 0 ? src.length : e + 2; blank(i, j); i = j; continue; }
    if (c === "\"" || c === "'" || c === "`" || (c === "/" && (prev === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)))) {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        else if (c === "/" && src[j] === "[") while (j < src.length && src[j] !== "]") { if (src[j] === "\\") j++; j++; }
        j++;
      }
      blank(i + 1, j); prev = c; i = j + 1; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join("");
}
function unseededStarts(src) {
  const code = codeOnly(src), blocks = [], open = [], bad = [];
  for (let i = 0; i < code.length; i++) { if (code[i] === "{") open.push(i); else if (code[i] === "}" && open.length) blocks.push([open.pop(), i]); }
  const around = p => blocks.filter(([a, b]) => a < p && p < b);
  const find = (re, a, b) => [...code.slice(a, b).matchAll(re)].map(m => ({ at: a + m.index, empty: m[1] === ")" }));
  const seedsIn = (a, b) => find(/\bseedRandom\(\s*(\)?)/g, a, b);
  const line = p => src.slice(0, p).split("\n").length;
  for (const m of code.matchAll(/\b(?:startGame|resetWorld)\(/g)) {
    const outer = around(m.index), [a, b] = outer.sort((x, y) => y[0] - x[0])[0] || [0, code.length];
    const seeds = seedsIn(a, b), last = seeds.filter(s => s.at < m.index).pop();
    if (last && last.empty) bad.push(`${line(m.index)}: starts after seedRandom() (unseeded)`);
    else if (!last && seeds.some(s => s.at > m.index && !s.empty)) bad.push(`${line(m.index)}: seeds only after the start`);
    for (const [x] of outer) for (const r of find(/\.(?:reload|goto)\(()/g, x, m.index)) {
      if (!seedsIn(r.at, m.index).some(s => !s.empty)) bad.push(`${line(m.index)}: starts after the reload/goto at line ${line(r.at)} with no seed in between (reloadGame)`);
    }
  }
  return [...new Set(bad)];
}
test("every test seeds before it starts a game", { tag: "@fast" }, () => {
  const dir = path.join(ROOT, "tests"), bad = [];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".js"))) {
    for (const b of unseededStarts(fs.readFileSync(path.join(dir, f), "utf8"))) bad.push(`${f}:${b}`);
  }
  expect(bad, bad.join("\n")).toEqual([]);
  // the helpers seed every page they open, reset or reload with the test's seed
  const helpers = fs.readFileSync(path.join(dir, "helpers.js"), "utf8").replace(/\r\n/g, "\n");
  for (const fn of ["openGame", "openGameHttp", "reloadGame"]) {
    const body = helpers.slice(helpers.indexOf(`async function ${fn}(`), helpers.indexOf("\n}\n", helpers.indexOf(`async function ${fn}(`)));
    expect(body, `${fn} seeds the page`).toContain("seedGame(page)");
  }
  const reset = helpers.slice(helpers.indexOf("async function resetGame("), helpers.indexOf("\n}\n", helpers.indexOf("async function resetGame(")));
  expect(reset, "resetGame seeds from the test title").toContain("testSeed()");
  expect(reset, "resetGame seeds from the test title").not.toContain("seedRandom()");
  // the scan catches the bad forms and leaves the good ones alone
  const s = "await page.ev" + "aluate(() => { const b = window.__bb; ";
  expect(unseededStarts(s + "b.startGame(1); b.seedRandom(5); });")).toHaveLength(1);                  // seed after the start
  expect(unseededStarts(s + "b.resetWorld(1); b.mode = \"home\"; b.seedRandom(29); });")).toHaveLength(1);
  expect(unseededStarts(s + "b.seedRandom(); b.startGame(1); });")).toHaveLength(1);                     // unseeded
  const t = (...bodies) => bodies.map(x => "test(\"x\", async () => { " + x + " });").join("\n");   // the scan sees tests as blocks
  const reload = "await page.rel" + "oad();\n", ev = "await page.ev" + "aluate(() => { ";
  expect(unseededStarts(t(reload + ev + "window.__bb.startGame(1); });"))).toHaveLength(1);                 // a reloaded game is unseeded
  expect(unseededStarts(s + "b.seedRandom(5); b.startGame(1); b.seedRandom(5); });")).toEqual([]);      // seeded before and after
  expect(unseededStarts(s + "b.startGame(1); for (;;) b.update(1 / 60); });")).toEqual([]);             // the page's seed (openGame)
  expect(unseededStarts(s + "b.startGame(1); b.seedRandom(); });")).toEqual([]);                         // unseeding after a game
  expect(unseededStarts(t(reload + ev + "window.__bb.seedRandom(3); window.__bb.startGame(1); });"))).toEqual([]);
  expect(unseededStarts(t(reload, ev + "window.__bb.startGame(1); });"))).toEqual([]);                      // another test's reload
  expect(unseededStarts(s + "const t = \"startGame(1) seedRandom(5)\"; /* startGame( */ });")).toEqual([]);   // text, not code
});

// SPEC-011 AC 8d: openGame seeds the page with the test's seed (the same game as seedRandom(seed) + the same start)
test("openGame seeds the game rng from the test title", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const info = test.info(), seed = titleSeed(info.file, info.titlePath.slice(1));
  expect(info.annotations.find(a => a.type === "seed"), "the seed is recorded for the failure print").toEqual({ type: "seed", description: String(seed) });
  const r = await page.evaluate(s => {
    const b = window.__bb, start = () => { b.world = "park"; b.level = 1; b.startGame(1); return JSON.stringify(b.littles.map(l => Object.entries(l).filter(([, v]) => typeof v === "number"))); };
    const first = start();
    b.seedRandom(s);
    return { first, again: start() };
  }, seed);
  expect(r.first, "the first game after openGame = a game started from seedRandom(seed)").toBe(r.again);
  expect(await page.evaluate(() => window.__bbSeed), "the boot is seeded too (init script)").toBe(seed);
  expect(errors).toEqual([]);
});
