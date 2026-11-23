// Smoke tests: the game loads, every screen and place renders, nothing throws.
const { test, expect } = require("@playwright/test");
const { openGame, step, ROOT } = require("./helpers");
const fs = require("fs");
const path = require("path");

test("loads to the menu without errors", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("menu");
  expect(errors).toEqual([]);
});

test("every screen draws without errors", async ({ page }) => {
  const errors = await openGame(page);
  for (const m of ["skins", "names", "shop", "menu"]) {
    await page.evaluate(v => { window.__bb.mode = v; }, m);
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
  test(`language ${lang}: menu, skins, friends and shop draw`, async ({ page }) => {
    const errors = await openGame(page, { lang });
    for (const m of ["menu", "skins", "names", "shop"]) {
      await page.evaluate(v => { window.__bb.mode = v; }, m);
      await page.waitForTimeout(120);
    }
    expect(errors).toEqual([]);
  });
}

// SPEC-018: an evaluate whose arrow body is an expression returns its value to the test. Object.assign(littles[i], …)
// returns the Little One, so Playwright serializes him with his 3D parts: 11–15 s per call. Mutating bodies go in braces.
test("tests never return game objects from evaluate", { tag: "@fast" }, () => {
  const dir = path.join(ROOT, "tests"), bad = [];
  const arrow = String.raw`evaluate\(\s*(?:\([^()]*\)|\w+)\s*=>\s*`;
  const patterns = [
    new RegExp(arrow + String.raw`Object\.assign\(`),                                                   // returns its target
    new RegExp(arrow + String.raw`window\.__bb\.(?:big|littles|items|stars|kisses)(?:\[[^\]]*\])?\s*[,)]`)   // a game object as is
  ];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".js"))) {
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
      if (patterns.some(re => re.test(line))) bad.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(bad, bad.join("\n")).toEqual([]);
  // the guard itself catches the old form and leaves the braced one alone ("ev" + "aluate": this file is scanned too)
  const ev = "await page.ev" + "aluate(() => ";
  expect(patterns[0].test(ev + "Object.assign(window.__bb.big, { x: 1 }));")).toBe(true);
  expect(patterns[0].test(ev + "{ Object.assign(window.__bb.big, { x: 1 }); });")).toBe(false);
  expect(patterns[1].test(ev + "window.__bb.littles[0]);")).toBe(true);
  expect(patterns[1].test(ev + "window.__bb.littles[0].state);")).toBe(false);
});

// Safari before iOS 16.4 cannot parse a regex lookbehind: the whole module fails with a SyntaxError and the game does
// not start at all (older iPads). Keep (?<= and (?<! out of index.html.
test("index.html has no regex lookbehind (older iPads)", { tag: "@fast" }, () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  expect(src.includes("(?<="), "(?<= in index.html").toBe(false);
  expect(src.includes("(?<!"), "(?<! in index.html").toBe(false);
});
