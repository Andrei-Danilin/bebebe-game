// SPEC-020 AC 2: the asset loader and its fallbacks. Every sprite of assets/ is loaded and decoded once at start;
// art(name) is the picture or null, and null means "draw it with code as before" — so the game must work without art/
// (the claude.ai single page has no assets/ folder, a phone may lose a file).
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { LANGS, openGame, frames, step, gameSource } = require("./helpers");

const failedLoads = e => e.includes("Failed to load resource") || e.includes("ERR_");
const INDEX_SRC = gameSource();   // SPEC-011 AC 8c: src/** (the game code)

// SPEC-020 review: every art name the code can ask for exists — the tables (__bb.artTableNames) and the literal names in
// the game code (art("…"), drawArt…("…", …), ITEM_ART-like tables are covered by the first list)
test("every art name the game can draw is a sprite of the manifest @fast", async ({ page }) => {
  await openGame(page, { sim: true });                                     // names only, nothing drawn
  const r = await page.evaluate(() => ({ names: window.__bb.ART_NAMES, table: window.__bb.artTableNames() }));
  const lit = [...INDEX_SRC.matchAll(/\b(?:art|drawArt|drawArtFit|drawArtCover|drawArt9|iconButton|noteArt)\("([a-z0-9_]+)"/g)].map(m => m[1]);
  // and every quoted sprite-like name anywhere else in the game code (outside the generated ART_NAMES list)
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
  // SPEC-040 AC 1: done = the resident sprites settled (the others are asked for by the screens that draw them)
  // (bad: the resident sprites and the current world's map page, which main.js keeps asking for)
  expect(info).toMatchObject({ ok: 0, bad: info.resident + 1, done: true, loadingShown: false });
  expect(info.total).toBe((await page.evaluate(() => window.__bb.ART_NAMES)).length);
  expect(info.resident).toBe((await page.evaluate(() => window.__bb.ART_RESIDENT)).length);
  expect(asked, "only the logo is asked for: when it fails, the other sprites are not requested").toEqual(["logo.webp"]);
  expect(await page.evaluate(() => window.__bb.art("logo"))).toBe(null);
  await page.evaluate(() => window.__bb.resetArtUse());
  const seen = await everyScreen(page);
  expect(seen.map(s => s[1])).toEqual(["home", "map", "levelCard", "story", "shop", "shop", "shop", "shop", "play", "pause", "win", "lose", "home"]);
  expect(await page.evaluate(() => window.__bb.artUse), "no sprite drawn: every screen used its code drawing").toEqual({});
  expect(asked, "the screens asked for their pictures (story, tutorial, maps): none was requested from the network, the first failure is final").toEqual(["logo.webp"]);
  expect(await page.evaluate(() => window.__bb.artInfo), "nothing is loading or loaded").toMatchObject({ loaded: 0, pending: 0, bytes: 0 });
  // SPEC-027 2a: without the small icons the emoji are drawn as before (level card ✕ and 📖, the wardrobe's 🎲 and 👥)
  const card = await drawnTexts(page, () => { const b = window.__bb; b.toMap(); b.mode = "levelCard"; });
  expect(card.filter(t => t === "✕" || t === "📖")).toEqual(expect.arrayContaining(["✕", "📖"]));
  const wardrobe = await drawnTexts(page, () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; });
  expect(wardrobe.filter(t => t.includes("🎲") || t.includes("👥")).length).toBeGreaterThanOrEqual(2);
  // SPEC-026: the start comic without its picture (placeholder) writes no bubbles
  await page.evaluate(() => window.__bb.openScene("intro"));
  await frames(page);
  expect(await page.evaluate(() => { const i = window.__bb.sceneInfo; return [i.art, i.bubble]; })).toEqual(["placeholder", null]);
  await page.evaluate(() => window.__bb.sceneSkip());
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

// SPEC-040 AC 1: the resident sprites (scripts/assets.json "resident": true → ART_RESIDENT) load at start, with the current world's map background
test("the resident art loads once at start: every resident sprite decoded, the loading screen gone @fast", async ({ page }) => {
  const asked = [];
  await page.route(/\/assets\/[^/]+\.webp$/, route => { asked.push(route.request().url().split("/").pop().replace(".webp", "")); return route.continue(); });
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const r = await page.evaluate(() => {
    const b = window.__bb, info = b.artInfo;
    const bad = b.ART_RESIDENT.filter(n => { const img = b.art(n); return !img || !img.complete || !img.naturalWidth; });
    return { info, bad, resident: b.ART_RESIDENT, same: b.art("logo") === b.art("logo"), unknown: b.art("no_such_sprite"), logoW: b.art("logo").naturalWidth, version: b.artVersion, world: b.world };
  });
  expect(r.info).toMatchObject({ ok: r.info.resident, bad: 0, done: true, loadingShown: false, pending: 0 });
  expect(r.info.total).toBeGreaterThan(100);
  expect(r.info.resident, "some sprites are not resident").toBeLessThan(r.info.total);
  expect(r.bad).toEqual([]);
  expect(r.same, "one Image per sprite, decoded once").toBe(true);
  expect(r.unknown).toBe(null);
  expect(r.logoW).toBeGreaterThan(500);
  // the page asked for the resident sprites and the current world's map page (kept for the map) — nothing else
  await page.waitForFunction(() => window.__bb.artInfo.pending === 0);
  expect([...new Set(asked)].sort()).toEqual([...r.resident, "map_bg_" + r.world].sort());
  expect(r.info.loaded, "the resident sprites and the map page").toBe(r.info.resident + 1);
  expect(r.version, "artVersion counts the sprites that became ready (SPEC-021 reads it)").toBeGreaterThanOrEqual(r.info.resident);
  expect(errors).toEqual([]);
});

// SPEC-040 AC 1: a screen's pictures load when it first draws them and go when no screen draws them (LOOK.ART.releaseMs)
test("a story picture loads when its page opens and is released after the page closes; the map page follows the world", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const info = () => page.evaluate(() => window.__bb.artInfo);
  const home = await info();
  await page.evaluate(() => { window.__bb.CFG.ART.releaseMs = 300; });   // the test does not wait the 2 s of play
  // the story page: its chapter picture (art() is not called by the test: asking for a sprite loads it)
  await page.evaluate(() => { window.__bb.openStory("park", "home"); });
  await frames(page);                                                  // frames() also waits for what the frames asked for
  const story = await info();
  expect(story.loaded, "story_park came in").toBe(home.loaded + 1);
  expect(story.bytes - home.bytes, "its decoded size").toBe(1024 * 572 * 4);
  expect(await page.evaluate(() => window.__bb.artUse.story_park > 0)).toBe(true);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await page.waitForFunction(h => window.__bb.artInfo.loaded === h, home.loaded, { timeout: 10_000 });   // released
  expect((await info()).bytes).toBe(home.bytes);
  // the map page of the current world stays; a new world's page comes and the old one goes
  await page.evaluate(() => { window.__bb.world = "field"; });   // (selectWorld refuses a locked world)
  await page.waitForFunction(() => window.__bb.artInfo.pending === 0 && !!window.__bb.art("map_bg_field"));
  await page.waitForFunction(h => window.__bb.artInfo.loaded === h && !window.__bb.artInfo.pending, home.loaded, { timeout: 10_000 });
  expect(await page.evaluate(() => ({ field: !!window.__bb.art("map_bg_field"), loaded: window.__bb.artInfo.loaded }))).toEqual({ field: true, loaded: home.loaded });
  expect((await info()).bad).toBe(0);
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

// SPEC-027: every text the 2D layer writes (fillText and strokeText) in two frames after setup
async function drawnTexts(page, setup, arg) {
  if (setup) { await page.evaluate(setup, arg); await frames(page); }
  return page.evaluate(() => new Promise(res => {
    const proto = CanvasRenderingContext2D.prototype, of = proto.fillText, os = proto.strokeText, seen = new Set();
    proto.fillText = function (t, ...a) { seen.add(String(t)); return of.call(this, t, ...a); };
    proto.strokeText = function (t, ...a) { seen.add(String(t)); return os.call(this, t, ...a); };
    requestAnimationFrame(() => requestAnimationFrame(() => { proto.fillText = of; proto.strokeText = os; res([...seen]); }));
  }));
}

// SPEC-027 AC 2: the home buttons carry the 28_menu_icons pictures left of their label (the label stays, every language), the
// Progress tab its trophy, the Story buttons of the level card and the Story screen the open book; without those pictures — the
// old icons (21_icons_ui, the star tab)
test("home, the Progress tab and the Story buttons use the comic menu icons; the old icons are their fallback", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  for (const lang of LANGS) {
    const use = await drawn(page, l => { const b = window.__bb; b.setLang(l); b.toHome(); }, lang);
    expect(missing(use, ["menu_play", "menu_story", "menu_character"]), lang).toEqual([]);
    expect(["ui_play", "ui_story", "ui_bag"].filter(n => use[n]), lang + ": not the old icons").toEqual([]);
    const texts = await drawnTexts(page), L = await page.evaluate(l => window.__bb.I18N[l], lang);
    expect([L.play, L.story, L.character].filter(t => !texts.includes(t)), lang + ": the labels are drawn").toEqual([]);
  }
  await page.evaluate(() => window.__bb.setLang("en"));
  let use = await drawn(page, () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; });
  expect(missing(use, ["tab_progress"])).toEqual([]);
  use = await drawn(page, () => { const b = window.__bb; b.toMap(); b.mode = "levelCard"; });
  expect(missing(use, ["menu_story"]), "level card: the Story button").toEqual([]);
  expect(await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "card:story").text)).toBe("📖");
  await page.evaluate(() => { window.__bb.openStory("park", "home"); });
  await frames(page);                                                      // the chapter page's buttons, then its "How to play"
  use = await drawn(page, () => { window.__bb.tapButton("story:rules"); });
  expect(missing(use, ["menu_story"]), "Story screen: the Story button of the rules page").toEqual([]);
  expect(errors).toEqual([]);
  // without the new pictures: the old ones (a fresh page; the first one is closed — two game pages at once slow each other)
  const context = page.context();
  await page.close();
  const p2 = await context.newPage();
  await p2.route(/\/assets\/(menu_[a-z]+|tab_progress)\.webp$/, route => route.fulfill({ status: 404, body: "" }));
  const errors2 = await openGame(p2);
  await p2.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  use = await drawn(p2, () => { window.__bb.toHome(); });
  expect(missing(use, ["ui_play", "ui_story", "ui_bag"])).toEqual([]);
  use = await drawn(p2, () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; });
  expect(missing(use, ["star_gold"])).toEqual([]);
  use = await drawn(p2, () => { const b = window.__bb; b.toMap(); b.mode = "levelCard"; });
  expect(missing(use, ["ui_story"])).toEqual([]);
  expect(Object.keys(use).filter(n => n.startsWith("menu_") || n === "tab_progress")).toEqual([]);
  await p2.close();
  expect(errors2.filter(e => !failedLoads(e))).toEqual([]);
});

// SPEC-027 2a: with the art loaded no screen writes these emoji any more — 34_small_icons and the pictures the game already had
// replace them (desktop and phone: home, map, level card, every Character tab and the friends page, the Story screen, win / lose / pause)
const ARTED_EMOJI = ["👥", "🎲", "❓", "✏", "📦", "👂", "🗺", "✔", "✘", "✕", "🔒", "🩹", "💋", "⭐", "🪙", "📖"];
async function emojiLeft(page) {
  const screens = [
    ["home", () => { window.__bb.toHome(); }],
    ["map", () => { const b = window.__bb; Object.assign(b.progress.worlds.park, { unlocked: 3, won: { 1: true, 2: true }, stars: { 1: 3, 2: 1 } }); b.toMap(); }],
    ["level card", () => { const b = window.__bb; b.toMap(); b.mode = "levelCard"; }],
    ["progress", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; }],
    ["items", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "items"; b.progress.inv.kisses = 3; }],
    ["wardrobe (locked items)", () => { const b = window.__bb, W = b.wardrobe(); b.mode = "shop"; b.shopTab = "wardrobe"; b.progress.coins = 0;
      b.cycleOutfit("p1", "jacket", W.jacket.findIndex(q => q.id === "rainbow") - b.outfits.shown.p1.jacket); }],
    ["wardrobe (armed buy)", () => { const b = window.__bb; b.progress.coins = 999; b.buyLook("p1"); }],
    ["friends", () => { const b = window.__bb; b.resetOutfits(); b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "friends"; }],
    ["upgrades", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "upgrades"; b.progress.upgrades.fastFeet = 3; }],
    ["story", () => { window.__bb.openStory("park", "home"); }],
    ["story (closed chapter)", () => { window.__bb.openStory("ended", "home"); }],
    ["story rules", () => { window.__bb.tapButton("story:rules"); }],
    ["win", () => { const b = window.__bb; b.startGame(1); b.stats.playerHugs = 2; b.giveReward(true); b.mode = "win"; }],
    ["lose", () => { const b = window.__bb; b.startGame(1); b.giveReward(false); b.mode = "lose"; }],
    ["pause", () => { const b = window.__bb; b.startGame(1); b.mode = "pause"; }]
  ];
  const art = await page.evaluate(() => window.__bb.art("ui_dice") !== null && window.__bb.art("padlock") !== null);
  const left = [];
  for (const [name, fn] of screens) for (const t of await drawnTexts(page, fn)) for (const e of ARTED_EMOJI) if (t.includes(e)) left.push(name + ": " + t);
  await page.evaluate(() => { const b = window.__bb; b.resetOutfits(); b.wardrobePage = "looks"; b.toHome(); });
  return { art, left };
}
test("with the art loaded no screen writes an emoji that has a picture (34_small_icons and the older ones)", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const r = await emojiLeft(page);
  expect(r.art).toBe(true);
  expect(r.left).toEqual([]);
  expect(errors).toEqual([]);
});
test.describe("on a phone", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  test("with the art loaded no phone screen writes an emoji that has a picture (667)", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
    const r = await emojiLeft(page);
    expect(r.art).toBe(true);
    expect(r.left).toEqual([]);
    expect(errors).toEqual([]);
  });
});

// SPEC-032 AC 18–20: with the art loaded no screen draws an emoji as text — every one has its picture (EMOJI_ART: the older art
// and sheet 35). Home, map (also the world tabs and a locked world), level card, Character (every tab, the friends page), Story,
// How to play, Pictures, win, lose, pause, the HUD with Dad's marks, the phone controls. Allow-list: each entry says why.
const EMOJI_OK = {
  "▶": "the Play / Next / ▶ arrow is a navigation glyph drawn in the button's ink (font text, not a picture)",
  "◀": "the Back / previous arrow, the same navigation glyph as ▶",
  "⏭": "the practice's Skip button (SPEC-029): a navigation glyph like ▶; no skip picture in our sheets yet (BACKLOG: draw one)"
};
const ANY_EMOJI = /\p{Extended_Pictographic}/gu;
async function anyEmojiLeft(page, phone) {
  const screens = [
    ["home", () => { window.__bb.toHome(); }],
    ["home muted", () => { window.__bb.tapButton("home:sound"); }],
    ["home sound", () => { window.__bb.tapButton("home:sound"); }],
    ["map", () => { const b = window.__bb; Object.assign(b.progress.worlds.park, { unlocked: 3, won: { 1: true, 2: true }, stars: { 1: 3, 2: 1 } }); b.toMap(); }],
    ["map bonus world", () => { const b = window.__bb; for (const w of b.WORLDS) b.progress.worlds[w].unlocked = Math.max(1, b.progress.worlds[w].unlocked); b.world = "beach"; b.toMap(); }],
    ["level card", () => { const b = window.__bb; b.world = "park"; b.toMap(); b.mode = "levelCard"; }],
    ["progress", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; }],
    ["items", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "items"; b.progress.inv.kisses = 3; }],
    ["wardrobe", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; }],
    ["friends", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "friends"; }],
    ["upgrades", () => { const b = window.__bb; b.wardrobePage = "looks"; b.mode = "shop"; b.shopTab = "upgrades"; }],
    ["story began", () => { window.__bb.openStory("began", "home"); }],
    ["story park", () => { window.__bb.openStory("park", "home"); }],
    ["story ended", () => { window.__bb.openStory("ended", "home"); }],
    ["how to play", () => { window.__bb.tapButton("story:rules"); }],
    ["pictures", () => { window.__bb.openPictures(); }],
    ["win", () => { const b = window.__bb; b.startGame(1); Object.assign(b.stats, { playerHugs: 2, rests: 1 }); b.giveReward(true); b.mode = "win"; }],
    ["win replay", () => { const b = window.__bb; b.startGame(1); Object.assign(b.stats, { playerHugs: 2, rests: 1 }); b.giveReward(true); b.mode = "win"; }],
    ["lose", () => { const b = window.__bb; b.startGame(1); b.giveReward(false); b.mode = "lose"; }],
    ["pause", () => { const b = window.__bb; b.startGame(1); b.mode = "pause"; }],
    ["play", () => { const b = window.__bb; b.startGame(1); b.progress.inv.kisses = 3; b.progress.inv.rescues = 1; }],
    ["play: rest", () => { const b = window.__bb; Object.assign(b.littles[0], { state: "rest", restTimer: 9 }); }],
    ["play: kind dad", () => { const b = window.__bb; b.littles[0].state = "ok"; b.big.kind = true; }],
    ["play: slipping dad", () => { const b = window.__bb; Object.assign(b.big, { kind: false, slip: 2 }); }],
    ["play: eating dad", () => { const b = window.__bb; Object.assign(b.big, { kind: false, slip: 2, slipKind: "eat" }); }],   // SPEC-043: the marks of the world items' states
    ["play: sliding dad", () => { const b = window.__bb; Object.assign(b.big, { slip: 2, slipKind: "melon" }); }],
    ["play: frozen dad", () => { const b = window.__bb; Object.assign(b.big, { slip: 2, slipKind: "freeze" }); }],
    ["play: bonked dad", () => { const b = window.__bb; Object.assign(b.big, { slip: 2, slipKind: "ball" }); }],
    ["play: watching dad", () => { const b = window.__bb; Object.assign(b.big, { slip: 0, watch: 2 }); }],
    ["play: dad walking to a cupcake", () => { const b = window.__bb; Object.assign(b.big, { watch: 0, cake: 5 }); }],
    ["play: blushing dad", () => { const b = window.__bb; Object.assign(b.big, { slip: 0, cake: 0, slipKind: "banana", blush: 2 }); }],
    ["play: resting dad", () => { const b = window.__bb; Object.assign(b.big, { blush: 0, noPush: 5 }); }],
    ["play: chasing dad", () => { const b = window.__bb; Object.assign(b.big, { noPush: 0, state: "chase" }); }],
    ["play: a friend down", () => { const b = window.__bb; Object.assign(b.littles[1], { state: "down", downTimer: 15 }); Object.assign(b.big, { state: "look", timer: 999 }); }],
    ["play: tutorial", () => { const b = window.__bb; b.openTutorial("map", "game1"); }],
    ["world banner", () => { const b = window.__bb; b.resetMenus(); b.world = "park"; b.progress.worlds.park.unlocked = 20; b.level = 20; b.startGame(1); b.giveReward(true); b.toMap(); }],
    ["bonus unlocked", () => { const b = window.__bb; b.resetMenus(); b.world = "park"; b.level = 1; b.startGame(1); b.giveReward(true); b.mode = "win"; }]
  ];
  const left = [];
  for (const [name, fn] of screens) for (const t of await drawnTexts(page, fn)) for (const e of t.match(ANY_EMOJI) || []) if (!EMOJI_OK[e]) left.push(`${name}: ${e} in "${t}"`);
  await page.evaluate(() => { const b = window.__bb; b.resetMenus(); b.resetOutfits(); b.toHome(); });
  return [...new Set(left)];
}
test("SPEC-032: with the art loaded no screen draws an emoji as text (allow-list with reasons)", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  expect(await anyEmojiLeft(page, false)).toEqual([]);
  expect(errors).toEqual([]);
});
test.describe("on a phone (SPEC-032)", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  test("SPEC-032: with the art loaded no phone screen draws an emoji as text (667)", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
    expect(await anyEmojiLeft(page, true)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test("home, level map and level card are drawn with the art", async ({ page }) => {
  const errors = await openGame(page, { lang: "ru" });
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  // home: notebook page, logo, paper buttons with their 28_menu_icons pictures (SPEC-027; the 21_icons_ui ones are their fallback),
  // globe + sound icons; the bonus badges, coins and items moved to the Character's Progress page (SPEC-026)
  let use = await drawn(page, () => { const b = window.__bb; b.toHome(); Object.assign(b.progress.inv, { mittens: 2, mega: 1, kisses: 3, rescues: 1 }); b.progress.coins = 5; });
  expect(missing(use, ["menu_bg", "logo", "btn_green", "btn_pink", "btn_orange", "ui_globe", "ui_sound_on", "menu_play", "menu_story", "menu_character"])).toEqual([]);
  expect(["world_beach", "item_coin", "item_mittens"].filter(n => use[n]), "no progress on the home screen").toEqual([]);
  use = await drawn(page, () => { window.__bb.tapButton("home:sound"); });
  expect(missing(use, ["ui_sound_off"])).toEqual([]);
  await page.evaluate(() => window.__bb.tapButton("home:sound"));
  // map: the world's page, stops (empty with a number, the current one glowing, locked, the boss), stars, the done stamp,
  // world tabs, the coin plate, the paper back button
  use = await drawn(page, () => { const b = window.__bb; b.world = "park"; Object.assign(b.progress.worlds.park, { unlocked: 3, won: { 1: true, 2: true }, stars: { 1: 3, 2: 1 } }); b.toMap(); });
  expect(missing(use, ["map_bg_park", "stop_empty", "stop_current", "stop_locked", "stop_boss", "star_gold", "star_empty", "stamp_done",
    "world_park", "world_field", "world_city", "world_school", "world_beach", "world_winter", "padlock", "coin_badge", "btn_grey"])).toEqual([]);
  use = await drawn(page, () => { const b = window.__bb; b.progress.worlds.field.unlocked = 2; b.tapButton("maptab:field"); });   // SPEC-030: a played Field is open
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
  const m = /^#([0-9a-f]{6})$/i.exec(c), n = m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : (/rgba?\(([^)]+)\)/.exec(c) || [null, "255,255,255"])[1].split(",").map(Number);
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

// SPEC-030 AC 8–9 (done in SPEC-027), SPEC-032 AC 6: each home button — the icon fully inside the painted button, its left edge
// btnIconGap (0.3) × the button height from the button art's *visible* left edge (the painted sticker, not its transparent margin;
// homeInfo.buttons[].vis), icon height btnIcon (0.8) × the button height, vertically centred; the label centred in the whole button,
// or (a long label, after shrinking) shifted right just enough to clear the icon plus btnLabelGap × the height. Every language of I18N
// (the spec asks en and pt), phone 667×375 and desktop 1280×720
for (const [name, ctx] of [["667×375 phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, query: "?phone=1" }],
  ["1280×720 desktop", { viewport: { width: 1280, height: 720 }, query: "" }]]) {
  test.describe(name, () => {
    test.use({ viewport: ctx.viewport, hasTouch: !!ctx.hasTouch, isMobile: !!ctx.isMobile });
    test(`home buttons: icon at the left, label centred, no overlap, every language (${name})`, async ({ page }) => {
      const errors = await openGame(page, { query: ctx.query });
      await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
      const langs = await page.evaluate(() => Object.keys(window.__bb.I18N));
      expect(langs).toEqual(expect.arrayContaining(["en", "ru"]));
      const bad = [];
      for (const lang of langs) {
        await page.evaluate(l => { const b = window.__bb; b.setLang(l); b.toHome(); }, lang);
        await frames(page);
        const r = await page.evaluate(() => ({ info: window.__bb.homeInfo, D: window.__bb.CFG.MENU_LOOK.home }));
        const btns = r.info.buttons, D = r.D;
        if (btns.map(b => b.id).join() !== "home:play,home:story,home:shop") bad.push(`${lang}: buttons ${btns.map(b => b.id)}`);
        for (const b of btns) {
          const at = `${lang} ${b.id}`, near = (p, q) => Math.abs(p - q) < 0.5, v = b.vis, ic = b.icon;
          if (!v || v.x < b.x - 0.01 || v.x > b.x + b.h * 0.2) { bad.push(`${at}: no visible box ${JSON.stringify(v)}`); continue; }
          if (ic.x < v.x || ic.y < v.y || ic.x + ic.w > v.x + v.w || ic.y + ic.h > v.y + v.h) bad.push(`${at}: icon ${JSON.stringify(ic)} not inside the painted button ${JSON.stringify(v)}`);
          if (ic.x - v.x < D.btnIconGap * b.h - 0.5 || !near(ic.x - v.x, D.btnIconGap * b.h)) bad.push(`${at}: gap ${(ic.x - v.x).toFixed(1)} ≠ ${D.btnIconGap} × ${b.h}`);
          if (!near(ic.h, D.btnIcon * b.h)) bad.push(`${at}: icon height ${ic.h} ≠ ${D.btnIcon} × ${b.h}`);
          if (!near(ic.y + ic.h / 2, b.y + b.h / 2)) bad.push(`${at}: icon not vertically centred`);
          if (!b.label.shifted && !near(b.label.cx, b.x + b.w / 2)) bad.push(`${at}: label centre ${b.label.cx} ≠ ${b.x + b.w / 2}`);
          if (b.label.x < ic.x + ic.w - 0.5) bad.push(`${at}: label on the icon`);
          if (b.label.shifted && !near(b.label.x, ic.x + ic.w + D.btnLabelGap * b.h)) bad.push(`${at}: shifted further than needed`);
          if (b.label.x + b.label.w > v.x + v.w + 0.5) bad.push(`${at}: label out of the button`);
        }
      }
      expect(bad).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
