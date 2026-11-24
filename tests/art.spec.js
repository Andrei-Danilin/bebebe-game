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
  await page.evaluate(() => window.__bb.resetArtUse());
  const seen = await everyScreen(page);
  expect(seen.map(s => s[1])).toEqual(["home", "map", "levelCard", "story", "shop", "shop", "shop", "play", "pause", "win", "lose", "home"]);
  expect(await page.evaluate(() => window.__bb.artUse), "no sprite drawn: every screen used its code drawing").toEqual({});
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

// SPEC-020 step 3 (AC 3, AC 4, AC 5 level card): which sprites a screen drew this frame (__bb.artUse counts drawImage per name)
async function drawn(page, setup, arg) {
  await page.evaluate(setup, arg);
  await frames(page);
  await page.evaluate(() => window.__bb.resetArtUse());
  await frames(page);
  return page.evaluate(() => window.__bb.artUse);
}
const missing = (use, names) => names.filter(n => !use[n]);

test("home, level map and level card are drawn with the art", async ({ page }) => {
  const errors = await openGame(page, { lang: "ru" });
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  // home: notebook page, logo, paper buttons, globe + sound icons, bonus world badges, drawn coin and items
  let use = await drawn(page, () => { const b = window.__bb; b.toHome(); Object.assign(b.progress.inv, { mittens: 2, mega: 1, kisses: 3, rescues: 1 }); b.progress.coins = 5; });
  expect(missing(use, ["menu_bg", "logo", "btn_green", "btn_pink", "btn_orange", "ui_globe", "ui_sound_on", "world_beach", "world_winter",
    "item_coin", "item_mittens", "item_mega_mittens", "item_kiss", "icon_bandaid"])).toEqual([]);
  use = await drawn(page, () => { window.__bb.tapButton("home:sound"); });
  expect(missing(use, ["ui_sound_off"])).toEqual([]);
  await page.evaluate(() => window.__bb.tapButton("home:sound"));
  // map: the world's page, stops (empty with a number, the current one glowing, locked, the boss), stars, the done stamp,
  // world tabs, the coin plate, the paper back button
  use = await drawn(page, () => { const b = window.__bb; b.world = "park"; Object.assign(b.progress.worlds.park, { unlocked: 3, won: { 1: true, 2: true }, stars: { 1: 3, 2: 1 } }); b.toMap(); });
  expect(missing(use, ["map_bg_park", "stop_empty", "stop_current", "stop_locked", "stop_boss", "star_gold", "star_empty", "stamp_done",
    "world_park", "world_field", "world_city", "world_school", "world_beach", "world_winter", "padlock", "coin_badge", "btn_grey"])).toEqual([]);
  use = await drawn(page, () => { const b = window.__bb; b.tapButton("maptab:field"); });
  expect(missing(use, ["map_bg_field"])).toEqual([]);
  // level card: a paper panel (notebook paper), drawn stars, paper buttons
  use = await drawn(page, () => { const b = window.__bb; b.world = "park"; b.tapButton("stop:1"); });
  expect(await page.evaluate(() => window.__bb.mode)).toBe("levelCard");
  expect(missing(use, ["menu_bg", "star_gold", "btn_green", "btn_pink", "btn_grey"])).toEqual([]);
  expect(errors).toEqual([]);
});

// SPEC-020 step 4 (AC 5): paper panels and drawn icons on the map frame, shop tabs, story, win / lose / pause
test("shop, story and the end screens are drawn with the art", async ({ page }) => {
  const errors = await openGame(page, { lang: "ru" });
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  let use = await drawn(page, () => { window.__bb.toMap(); });
  expect(missing(use, ["menu_bg"]), "the map's outer frame is paper").toEqual([]);
  // shop · items: paper frame, tab icons, item pictures (v1/staff, 12_icons), drawn coins, paper buttons
  use = await drawn(page, () => { const b = window.__bb; b.progress.coins = 40; b.mode = "shop"; b.shopTab = "items"; });
  expect(missing(use, ["menu_bg", "shop_items", "shop_wardrobe", "shop_upgrades", "item_mittens", "item_mega_mittens", "item_kiss", "icon_bandaid",
    "item_coin", "coin_badge", "btn_green", "btn_orange"])).toEqual([]);
  // shop · wardrobe: thumbnails of the worn items that have a drawing (cap, green hoodie, jeans) next to the 3D preview
  use = await drawn(page, () => {
    const b = window.__bb, W = b.wardrobe(), cur = b.outfits.shown.p1;
    b.mode = "shop"; b.shopTab = "wardrobe";
    for (const [sl, id] of [["hat", "cap"], ["jacket", "hoodie"], ["pants", "jeans"]]) b.cycleOutfit("p1", sl, W[sl].findIndex(q => q.id === id) - cur[sl]);
  });
  expect(missing(use, ["hat_cap", "jacket_hoodie", "pants_jeans", "btn_grey"])).toEqual([]);
  // shop · upgrades: the 22_icons_shop pictures
  use = await drawn(page, () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "upgrades"; });
  expect(missing(use, ["shop_fast_feet", "shop_long_items", "shop_quick_help"])).toEqual([]);
  // story: the chapter comics in a paper frame
  use = await drawn(page, () => { window.__bb.openStory("began", "home"); });
  expect(missing(use, ["menu_bg", "story_start"])).toEqual([]);
  expect(await page.evaluate(() => window.__bb.storyInfo.art)).toBe("image");
  use = await drawn(page, () => { window.__bb.openStory("park", "home"); });
  expect(missing(use, ["story_park"])).toEqual([]);
  // win, lose, pause: on a paper sheet; the win screen's stars and coin are drawn
  use = await drawn(page, () => { const b = window.__bb; b.startGame(1); b.stats.playerHugs = 2; b.giveReward(true); b.mode = "win"; });
  expect(missing(use, ["menu_bg", "item_coin", "btn_green"]).concat(use.star_gold || use.star_empty ? [] : ["star"])).toEqual([]);
  use = await drawn(page, () => { const b = window.__bb; b.startGame(1); b.giveReward(false); b.mode = "lose"; });
  expect(missing(use, ["menu_bg", "btn_orange"])).toEqual([]);
  use = await drawn(page, () => { const b = window.__bb; b.startGame(1); b.mode = "pause"; });
  expect(missing(use, ["menu_bg", "btn_green", "btn_grey"])).toEqual([]);
  expect(errors).toEqual([]);
});
