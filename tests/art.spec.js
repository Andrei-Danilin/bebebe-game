// SPEC-020 AC 2: the asset loader and its fallbacks. Every sprite of assets/ is loaded and decoded once at start;
// art(name) is the picture or null, and null means "draw it with code as before" — so the game must work without art/
// (the claude.ai single page has no assets/ folder, a phone may lose a file).
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames, step } = require("./helpers");

const failedLoads = e => e.includes("Failed to load resource") || e.includes("ERR_");
const fs = require("fs");
const path = require("path");
const INDEX_SRC = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// SPEC-020 review: every art name the code can ask for exists — the tables (__bb.artTableNames) and the literal names in
// index.html (art("…"), drawArt…("…", …), ITEM_ART-like tables are covered by the first list)
test("every art name the game can draw is a sprite of the manifest @fast", async ({ page }) => {
  await openGame(page, { sim: true });                                     // names only, nothing drawn
  const r = await page.evaluate(() => ({ names: window.__bb.ART_NAMES, table: window.__bb.artTableNames() }));
  const lit = [...INDEX_SRC.matchAll(/\b(?:art|drawArt|drawArtFit|drawArtCover|drawArt9|iconButton|noteArt)\("([a-z0-9_]+)"/g)].map(m => m[1]);
  // and every quoted sprite-like name anywhere else in index.html (outside the generated ART_NAMES list)
  const body = INDEX_SRC.slice(0, INDEX_SRC.indexOf("// art:start")) + INDEX_SRC.slice(INDEX_SRC.indexOf("// art:end"));
  const lit2 = [...body.matchAll(/"((?:stop|ui|phone|round|cloud|fx|item|icon|hat|pants|jacket|shop|world|map_bg|story|btn|star|heart|coin|menu|stamp)_[a-z]+(?:_[a-z]+)*)"/g)].map(m => m[1]);
  expect(r.table.length).toBeGreaterThan(40);
  expect(lit.length).toBeGreaterThan(15);
  expect(lit2.length).toBeGreaterThan(40);
  expect([...new Set([...r.table, ...lit, ...lit2])].filter(n => !r.names.includes(n))).toEqual([]);
});

// Every screen once (desktop): home, map, level card, story, the shop tabs, play, pause, win, lose.
async function everyScreen(page) {
  const seen = [];
  const show = async (name, fn, arg) => { await page.evaluate(fn, arg); await frames(page); seen.push([name, await page.evaluate(() => window.__bb.mode)]); };
  await show("home", () => { window.__bb.toHome(); });
  await show("map", () => { window.__bb.toMap(); });
  await show("levelCard", () => { window.__bb.mode = "levelCard"; });
  await show("story", () => { window.__bb.openStory("began", "home"); });
  for (const tab of ["progress", "items", "wardrobe", "upgrades"]) await show("shop", t => { const b = window.__bb; b.mode = "shop"; b.shopTab = t; }, tab);   // SPEC-026: + Progress
  await show("play", () => { window.__bb.startGame(1); });
  await step(page, 1);
  await show("pause", () => { window.__bb.mode = "pause"; });
  await show("win", () => { const b = window.__bb; b.startGame(1); b.giveReward(true); b.mode = "win"; });
  await show("lose", () => { const b = window.__bb; b.startGame(1); b.giveReward(false); b.mode = "lose"; });
  await show("home", () => { window.__bb.toHome(); });
  return seen;
}

test("the game works without art: assets/ missing → every screen draws as before, no errors", async ({ page }) => {
  const asked = [];
  await page.route(/\/assets\/[^/]+\.webp$/, route => { asked.push(route.request().url().split("/").pop()); return route.fulfill({ status: 404, body: "" }); });
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const info = await page.evaluate(() => window.__bb.artInfo);
  expect(info).toMatchObject({ ok: 0, bad: info.total, done: true, loadingShown: false });
  expect(info.total).toBe((await page.evaluate(() => window.__bb.ART_NAMES)).length);
  expect(asked, "only the logo is asked for: when it fails, the other sprites are not requested").toEqual(["logo.webp"]);
  expect(await page.evaluate(() => window.__bb.art("logo"))).toBe(null);
  await page.evaluate(() => window.__bb.resetArtUse());
  const seen = await everyScreen(page);
  expect(seen.map(s => s[1])).toEqual(["home", "map", "levelCard", "story", "shop", "shop", "shop", "shop", "play", "pause", "win", "lose", "home"]);
  expect(await page.evaluate(() => window.__bb.artUse), "no sprite drawn: every screen used its code drawing").toEqual({});
  expect(errors.filter(e => !failedLoads(e))).toEqual([]);
});

// SPEC-020 review: the same on a phone (667×375, ?phone=1): home, shop, play with effects and a stick touch, pause, win
test.describe("the game works without art on a phone", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  test("assets/ missing on a phone → code drawing everywhere, no errors", async ({ page }) => {
    await page.route(/\/assets\/[^/]+\.webp$/, route => route.fulfill({ status: 404, body: "" }));
    const errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
    await page.evaluate(() => window.__bb.resetArtUse());
    const seen = [];
    const show = async fn => { await page.evaluate(fn); await frames(page); seen.push(await page.evaluate(() => window.__bb.mode)); };
    await show(() => { window.__bb.toHome(); });
    await show(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "items"; });
    await show(() => {
      const b = window.__bb, c = document.getElementById("game"), r = c.getBoundingClientRect(), u = b.uiSize;
      b.startGame(1); b.progress.inv.kisses = 2;
      const big = b.big;
      b.fxBurst(big.x, big.y, "heart", "#ff4d8d", 3); b.fxBurst(big.x, big.y, "star", "#fde047", 3); b.fxBurst(big.x, big.y, "dust", "#e5d3a1", 3);
      b.popText(big.x, big.y - 40, b.I18N.en.bang, "#ffcc00", "bang");
      const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x * r.width / u.w, clientY: r.top + y * r.height / u.h, pointerId: 5, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      ev("pointerdown", u.w * 0.25, u.h * 0.6); ev("pointermove", u.w * 0.25 + 20, u.h * 0.6);
    });
    expect(await page.evaluate(() => window.__bb.stickMarks.length), "the stick is drawn (by code)").toBe(1);
    await show(() => { window.__bb.mode = "pause"; });
    await show(() => { const b = window.__bb; b.startGame(1); b.giveReward(true); b.mode = "win"; });
    expect(seen).toEqual(["home", "shop", "play", "pause", "win"]);
    expect(await page.evaluate(() => window.__bb.artUse), "no sprite drawn").toEqual({});
    expect(errors.filter(e => !failedLoads(e))).toEqual([]);
  });
});

test("the art loads once at start: every sprite decoded, the loading screen gone @fast", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const r = await page.evaluate(() => {
    const b = window.__bb, info = b.artInfo;
    const bad = b.ART_NAMES.filter(n => { const img = b.art(n); return !img || !img.complete || !img.naturalWidth; });
    return { info, bad, same: b.art("logo") === b.art("logo"), unknown: b.art("no_such_sprite"), logoW: b.art("logo").naturalWidth, version: b.artVersion };
  });
  expect(r.info).toMatchObject({ ok: r.info.total, bad: 0, done: true, loadingShown: false });
  expect(r.info.total).toBeGreaterThan(100);
  expect(r.bad).toEqual([]);
  expect(r.same, "one Image per sprite, decoded once").toBe(true);
  expect(r.unknown).toBe(null);
  expect(r.logoW).toBeGreaterThan(500);
  expect(r.version, "artVersion counts the sprites that became ready (SPEC-021 reads it)").toBe(r.info.total);
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
  // home: notebook page, logo, paper buttons with their 21_icons_ui pictures (SPEC-026: Character = the bag until SPEC-027),
  // globe + sound icons; the bonus badges, coins and items moved to the Character's Progress page (SPEC-026)
  let use = await drawn(page, () => { const b = window.__bb; b.toHome(); Object.assign(b.progress.inv, { mittens: 2, mega: 1, kisses: 3, rescues: 1 }); b.progress.coins = 5; });
  expect(missing(use, ["menu_bg", "logo", "btn_green", "btn_pink", "btn_orange", "ui_globe", "ui_sound_on", "ui_play", "ui_story", "ui_bag"])).toEqual([]);
  expect(["world_beach", "item_coin", "item_mittens"].filter(n => use[n]), "no progress on the home screen").toEqual([]);
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
  // SPEC-026: Character · Progress — world badges, item and upgrade pictures, the star tab, the padlock of a locked bonus world
  use = await drawn(page, () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; });
  expect(missing(use, ["star_gold", "world_park", "world_winter", "padlock", "item_mittens", "icon_bandaid", "shop_fast_feet", "coin_badge"])).toEqual([]);
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

// SPEC-020 fix: per text drawn in two frames of play — fill colour, and outline colour / width if it was stroked
// (canvas gives colours back as "#rrggbb" or "rgba(r, g, b, a)")
async function hudTexts(page) {
  return page.evaluate(() => new Promise(res => {
    const proto = CanvasRenderingContext2D.prototype, of = proto.fillText, os = proto.strokeText, seen = new Map();
    const rec = t => { t = String(t); if (!seen.has(t)) seen.set(t, { text: t }); return seen.get(t); };
    proto.strokeText = function (t, ...a) { Object.assign(rec(t), { stroke: String(this.strokeStyle), lw: this.lineWidth }); return os.call(this, t, ...a); };
    proto.fillText = function (t, ...a) { Object.assign(rec(t), { fill: String(this.fillStyle), size: parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [])[1]) }); return of.call(this, t, ...a); };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      proto.fillText = of; proto.strokeText = os;
      const b = window.__bb;
      res({ list: [...seen.values()], lv: b.I18N.en.lvShort, bigName: b.names.big });
    }));
  }));
}
const lum = c => {
  const m = /^#([0-9a-f]{6})$/i.exec(c), n = m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : (/rgba?\(([^)]+)\)/.exec(c) || [, "255,255,255"])[1].split(",").map(Number);
  return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
};
// dark text (brightness < 0.35) with a dark (< 0.5) or thick (> 0.2 of the size) outline → "text fill/stroke@width"
const smeared = list => list.filter(t => t.fill && t.stroke && lum(t.fill) < 0.35 && (lum(t.stroke) < 0.5 || t.lw > t.size * 0.2))
  .map(t => `${t.text} ${t.fill}/${t.stroke}@${t.lw}`);

// SPEC-020 step 5 (AC 6–8): the HUD, the effects and the phone controls are drawn with the art
test("HUD, effects and the desktop pause / fullscreen buttons are drawn with the art", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const use = await drawn(page, () => {
    const b = window.__bb;
    b.startGame(1);
    Object.assign(b.progress.inv, { mittens: 2, kisses: 3, rescues: 1 }); b.setEquip(0, "mittens");
    const big = b.big;                                                     // (setEquip restarts the level: a new Big One)
    big.hp = big.maxHp - 1.5;                                              // full, half and empty hearts
    b.fxBurst(big.x, big.y, "heart", "#ff4d8d", 3); b.fxBurst(big.x, big.y, "star", "#fde047", 3); b.fxBurst(big.x, big.y, "dust", "#e5d3a1", 3);
    b.popText(big.x, big.y - 40, b.I18N.en.bang, "#ffcc00", "bang");
  });
  expect(missing(use, ["cloud_heart_full", "cloud_heart_half", "cloud_heart_empty", "round_pause", "ui_fullscreen", "item_mittens", "item_kiss", "icon_bandaid",
    "heart_full", "fx_sparkle", "fx_dust", "fx_burst_red"])).toEqual([]);
  expect(await page.evaluate(() => window.__bb.buttonNames)).toContain("toggleFullscreen");
  // SPEC-020 fix: the HUD texts sit on light plates — dark text (timer, item counts, the red name) has no dark outline (it made a
  // blob); before the fix the timer was strokeText'd with OUT. They may keep a thin light halo.
  const tx = await hudTexts(page);
  expect(tx.list.find(t => t.text.startsWith(tx.lv)), "the timer is drawn").toBeTruthy();
  expect(tx.list.find(t => /^×\d/.test(t.text)), "the item counts are drawn").toBeTruthy();
  expect(tx.list.find(t => t.text === tx.bigName), "the Big One's name is drawn").toBeTruthy();
  expect(smeared(tx.list), "dark HUD texts drawn with a dark outline").toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("phone controls with the art", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  test("joystick, kiss, kit and pause buttons are the 25_phone_controls pictures, same hit sizes", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
    let use = await drawn(page, () => {
      const b = window.__bb, c = document.getElementById("game"), r = c.getBoundingClientRect(), u = b.uiSize;
      b.startGame(1); b.progress.inv.kisses = 2;
      const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x * r.width / u.w, clientY: r.top + y * r.height / u.h, pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      ev("pointerdown", u.w * 0.25, u.h * 0.6); ev("pointermove", u.w * 0.25 + 20, u.h * 0.6);
    });
    expect(missing(use, ["phone_stick_base", "phone_stick_knob", "phone_kiss", "phone_pause", "ui_fullscreen"])).toEqual([]);
    const d = await page.evaluate(() => { const b = window.__bb; return { buttons: b.buttonRects, s: b.uiSize.scale, marks: b.stickMarks }; });
    for (const id of ["kiss:0"]) { const q = d.buttons.find(x => x.id === id); expect(Math.min(q.w, q.h) * d.s, id).toBeGreaterThanOrEqual(44); }
    for (const q of d.buttons) expect(Math.min(q.w, q.h) * d.s, String(q.id || q.text)).toBeGreaterThanOrEqual(44 - 0.01);
    expect(d.marks.length, "the tiptoe ring is still drawn on the drawn base").toBe(1);
    // the kit button while the hero is down
    use = await drawn(page, () => { const b = window.__bb, l = b.littles[0]; b.progress.inv.rescues = 1; l.state = "down"; l.downTimer = 10; });
    expect(missing(use, ["phone_kit"])).toEqual([]);
    // SPEC-020 fix: the same rule as the desktop HUD — the red name on its plate has no dark outline
    const tx = await hudTexts(page);
    expect(tx.list.find(t => t.text === tx.bigName), "the Big One's name is drawn").toBeTruthy();
    expect(smeared(tx.list), "dark HUD texts drawn with a dark outline").toEqual([]);
    expect(errors).toEqual([]);
  });
});

// a sim page (balance, logic tests) loads no sprite and does not keep the loading screen
test("a sim page requests no sprites @fast", async ({ page }) => {
  let asked = 0;
  await page.route(/\/assets\/[^/]+\.webp$/, route => { asked++; return route.continue(); });
  await openGame(page, { sim: true });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ info: window.__bb.artInfo, loading: !!document.getElementById("loading") }));
  expect(asked).toBe(0);
  expect(r.info).toMatchObject({ ok: 0, bad: 0, done: false, loadingShown: false });
  expect(r.loading).toBe(false);
});

// AC 10: on a cold cache the loading screen paints within 1 s (plain HTML with its own paper background, before three.js and
// the art). first-paint is that screen; first-contentful-paint is about 2 s here on master too (software rendering), so not used
test("the loading screen shows within 1 s on a cold cache @fast", async ({ page }) => {
  await openGame(page);
  const fp = await page.evaluate(() => (performance.getEntriesByType("paint").find(e => e.name === "first-paint") || {}).startTime);
  expect(fp).toBeGreaterThan(0);
  expect(fp).toBeLessThan(1000);
});
