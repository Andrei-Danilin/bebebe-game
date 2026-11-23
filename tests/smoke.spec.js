// Smoke tests: the game loads, every screen and place renders, nothing throws.
const { test, expect } = require("@playwright/test");
const { openGame, step, ROOT } = require("./helpers");
const fs = require("fs");
const path = require("path");

test("loads to the home screen without errors", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
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
