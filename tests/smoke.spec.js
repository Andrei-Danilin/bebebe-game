// Smoke tests: the game loads, every screen and place renders, nothing throws.
const { test, expect } = require("@playwright/test");
const { openGame, step, ROOT } = require("./helpers");
const fs = require("fs");
const path = require("path");

test("loads to the menu without errors", async ({ page }) => {
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

// Safari before iOS 16.4 cannot parse a regex lookbehind: the whole module fails with a SyntaxError and the game does
// not start at all (older iPads). Keep (?<= and (?<! out of index.html.
test("index.html has no regex lookbehind (older iPads)", () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  expect(src.includes("(?<="), "(?<= in index.html").toBe(false);
  expect(src.includes("(?<!"), "(?<! in index.html").toBe(false);
});
