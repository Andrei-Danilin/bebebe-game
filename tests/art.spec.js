// SPEC-020 AC 2: the asset loader and its fallbacks. Every sprite of assets/ is loaded and decoded once at start;
// art(name) is the picture or null, and null means "draw it with code as before" — so the game must work without art/
// (the claude.ai single page has no assets/ folder, a phone may lose a file).
const { test, expect } = require("@playwright/test");
const { openGame, frames, step } = require("./helpers");

const failedLoads = e => e.includes("Failed to load resource") || e.includes("ERR_");

// Every screen once (desktop): home, map, level card, story, the shop tabs, play, pause, win, lose.
async function everyScreen(page) {
  const seen = [];
  const show = async (name, fn, arg) => { await page.evaluate(fn, arg); await frames(page); seen.push([name, await page.evaluate(() => window.__bb.mode)]); };
  await show("home", () => { window.__bb.toHome(); });
  await show("map", () => { window.__bb.toMap(); });
  await show("levelCard", () => { window.__bb.mode = "levelCard"; });
  await show("story", () => { window.__bb.openStory("began", "home"); });
  for (const tab of ["items", "wardrobe", "upgrades"]) await show("shop", t => { const b = window.__bb; b.mode = "shop"; b.shopTab = t; }, tab);
  await show("play", () => { window.__bb.startGame(1); });
  await step(page, 1);
  await show("pause", () => { window.__bb.mode = "pause"; });
  await show("win", () => { const b = window.__bb; b.startGame(1); b.giveReward(true); b.mode = "win"; });
  await show("lose", () => { const b = window.__bb; b.startGame(1); b.giveReward(false); b.mode = "lose"; });
  await show("home", () => { window.__bb.toHome(); });
  return seen;
}

test("the game works without art: assets/ missing → every screen draws as before, no errors", async ({ page }) => {
  await page.route(/\/assets\/[^/]+\.webp$/, route => route.fulfill({ status: 404, body: "" }));
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const info = await page.evaluate(() => window.__bb.artInfo);
  expect(info).toMatchObject({ ok: 0, bad: info.total, done: true, loadingShown: false });
  expect(info.total).toBe((await page.evaluate(() => window.__bb.ART_NAMES)).length);
  expect(await page.evaluate(() => window.__bb.art("logo"))).toBe(null);
  const seen = await everyScreen(page);
  expect(seen.map(s => s[1])).toEqual(["home", "map", "levelCard", "story", "shop", "shop", "shop", "play", "pause", "win", "lose", "home"]);
  expect(errors.filter(e => !failedLoads(e))).toEqual([]);
});

test("the art loads once at start: every sprite decoded, the loading screen gone @fast", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const r = await page.evaluate(() => {
    const b = window.__bb, info = b.artInfo;
    const bad = b.ART_NAMES.filter(n => { const img = b.art(n); return !img || !img.complete || !img.naturalWidth; });
    return { info, bad, same: b.art("logo") === b.art("logo"), unknown: b.art("no_such_sprite"), logoW: b.art("logo").naturalWidth };
  });
  expect(r.info).toMatchObject({ ok: r.info.total, bad: 0, done: true, loadingShown: false });
  expect(r.info.total).toBeGreaterThan(100);
  expect(r.bad).toEqual([]);
  expect(r.same, "one Image per sprite, decoded once").toBe(true);
  expect(r.unknown).toBe(null);
  expect(r.logoW).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});
