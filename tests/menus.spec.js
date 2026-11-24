// SPEC-017: the menus — the minimal home screen, the level map and the level card, the story (and "How to play"),
// the shop with the Wardrobe tab, the end-screen flows; desktop and phone 667×375 (fonts ×1 and ×1.15).
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const { openGame, frames, sharedPage, resetGame, ROOT } = require("./helpers");
const fs = require("fs");
const path = require("path");

// SPEC-018: one game page per screen setup (desktop 960×640, phone 667×375); resetGame() before each test,
// page errors and a changed CFG fail the test. At most one shared page is open (sharedPage closes the other one).
const shared = sharedPage();
const fixture = (key, ctx, query = "") => async ({ browser }, use) => {
  const s = await shared.get(browser, key, ctx, p => openGame(p, { query }));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
const test = base.test.extend({
  page: fixture("desktop", { viewport: { width: 960, height: 640 } }),
  phonePage: fixture("phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, "?phone=1")
});
test.afterAll(async () => { await shared.close(); });

const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad - 0.01 && a.x + a.w + pad > b.x + 0.01 && a.y < b.y + b.h + pad - 0.01 && a.y + a.h + pad > b.y + 0.01;
const HOME_BUTTONS = ["home:lang", "home:play", "home:shop", "home:sound", "home:story"];
const all20 = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));

// a real click on a button registered this frame (by id), desktop or phone
async function click(page, id) {
  await frames(page);
  const at = await page.evaluate(k => {
    const b = window.__bb, q = b.buttonRects.find(r => r.id === k), c = document.getElementById("game").getBoundingClientRect(), s = c.width / b.uiSize.w;
    return q && { x: c.left + (q.x + q.w / 2) * s, y: c.top + (q.y + q.h / 2) * s };
  }, id);
  expect(at, `button ${id}`).toBeTruthy();
  await page.mouse.click(at.x, at.y);
  await frames(page);
}
const screen = page => page.evaluate(() => { const b = window.__bb; return { mode: b.mode, ids: b.buttonRects.map(q => q.id), texts: b.buttonRects.map(q => q.text), hud: b.hudRects, names: b.buttonNames }; });

// what is wrong with a phone screen: buttons ≥ 44×44 CSS px, ≥ 8 px apart, inside; texts inside their boxes; nothing on anything
function phoneProblems(at, d) {
  const s = d.ui.scale, out = [], inside = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= d.ui.w + 0.01 && r.y + r.h <= d.ui.h + 0.01;
  for (const b of d.buttons) {
    const id = b.id || b.text;
    if (b.w * s < 44 - 0.01 || b.h * s < 44 - 0.01) out.push(`${at}: button ${id} ${b.w * s}×${b.h * s} CSS px`);
    if (!inside(b)) out.push(`${at}: button ${id} outside`);
    if (b.textW !== undefined && b.textW > b.w + 0.5) out.push(`${at}: button ${id} text ${b.textW} wider than ${b.w}`);
    if (/…/.test(b.text || "")) out.push(`${at}: button ${id} text cut "${b.text}"`);
    for (const h of d.hud) if (overlaps(b, h)) out.push(`${at}: button ${id} on ${h.id}`);
  }
  d.buttons.forEach((a, i) => d.buttons.slice(i + 1).forEach(b => { if (overlaps(a, b, 8 / s - 0.01)) out.push(`${at}: ${a.id || a.text} and ${b.id || b.text} closer than 8 CSS px`); }));
  d.hud.forEach((a, i) => {
    if (!inside(a)) out.push(`${at}: ${a.id} outside ${JSON.stringify(a)}`);
    if (a.textW !== undefined && a.textW > a.w + 0.5) out.push(`${at}: ${a.id} text ${a.textW} wider than its box ${a.w}`);
    if (/…/.test(a.text || "")) out.push(`${at}: ${a.id} text cut "${a.text}"`);
    d.hud.slice(i + 1).forEach(b => { if (overlaps(a, b)) out.push(`${at}: ${a.id} on ${b.id}`); });
  });
  for (const [cat, px] of Object.entries(d.texts)) if (px * s < (cat === "drawn" ? d.min.hint : d.min[cat]) - 0.01) out.push(`${at}: smallest ${cat} text ${px * s} CSS px`);
  return out;
}

// ---------- AC 1: the home screen ----------
test("home is minimal", async ({ page }) => {
  await frames(page);
  let d = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG;
    return { mode: b.mode, ids: b.buttonRects.map(q => q.id), texts: b.buttonRects.map(q => q.text), hud: b.hudRects, done0: b.I18N.en.worldsDone(0, b.MAIN_WORLDS.length),
      max: C.STARS_PER_LEVEL * b.levelsPerWorld() * b.MAIN_WORLDS.length, mains: b.MAIN_WORLDS.length, modes: b.MODES };
  });
  expect(d.mode, "the game opens on the home screen").toBe("home");
  expect(d.max, "STARS_PER_LEVEL × levels × main worlds").toBe(240);
  expect([...d.ids].sort(), "buttons: Play, Story, Shop and the two small icons — nothing else").toEqual(HOME_BUTTONS);
  expect(d.hud.map(h => h.id).sort(), "the title, the progress, the bonus badges and the coins — no items yet").toEqual(["coins", "home:bonus:beach", "home:bonus:winter", "home:stars", "home:title", "home:worlds"]);
  const hud = id => d.hud.find(h => h.id === id);
  expect(hud("home:stars").text).toBe(`⭐ 0 / ${d.max}`);
  expect(hud("home:worlds").text).toBe(d.done0);
  expect(d.done0).toBe("Worlds finished: 0 / 4");
  expect([hud("home:bonus:beach").open, hud("home:bonus:winter").open], "both bonus worlds locked").toEqual([false, false]);
  expect(hud("home:bonus:beach").text).toContain("🔒");
  expect(hud("coins").text).toBe("0");
  expect(d.texts.some(t => /Skins|🎨/.test(t)), "no Skins button").toBe(false);
  expect(d.modes, "no skins / names modes").toEqual(["home", "map", "levelCard", "story", "shop", "play", "pause", "win", "lose"]);
  // the big buttons, the language and sound icons small, in a corner (top right)
  const r = await page.evaluate(() => window.__bb.buttonRects);
  const btn = id => r.find(q => q.id === id), play = btn("home:play");
  for (const id of ["home:story", "home:shop"]) expect(btn(id).w * btn(id).h, `${id} smaller than Play`).toBeLessThan(play.w * play.h);
  for (const id of ["home:lang", "home:sound"]) {
    expect(btn(id).w * btn(id).h, `${id} small`).toBeLessThan(btn("home:story").w * btn("home:story").h);
    expect(btn(id).x, `${id} on the right`).toBeGreaterThan(480);
    expect(btn(id).y, `${id} at the top`).toBeLessThan(play.y);
  }

  // progress: stars of the main worlds only, finished worlds (all 20 won), owned items with counts > 0 only, coins
  await page.evaluate(() => {
    const b = window.__bb, p = b.progress;
    Object.assign(p.worlds.park, { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])), stars: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3])) });
    Object.assign(p.worlds.field, { unlocked: 2, won: { 1: true }, stars: { 1: 2 } });
    Object.assign(p.inv, { mittens: 3, mega: 0, kisses: 2, rescues: 0 }); p.coins = 77;
  });
  await frames(page);
  d = await page.evaluate(() => ({ hud: window.__bb.hudRects, ids: window.__bb.buttonRects.map(q => q.id) }));
  expect(d.hud.find(h => h.id === "home:stars").text).toBe("⭐ 62 / 240");
  expect(d.hud.find(h => h.id === "home:worlds").text).toBe("Worlds finished: 1 / 4");
  expect(d.hud.filter(h => h.id.startsWith("home:inv:")).map(h => [h.id, h.text])).toEqual([["home:inv:mittens", "×3"], ["home:inv:kisses", "×2"]]);
  expect(d.hud.find(h => h.id === "coins").text).toBe("77");
  expect([...d.ids].sort()).toEqual(HOME_BUTTONS);
  // every main level won: the bonus badges open
  await page.evaluate(() => { const b = window.__bb; for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) }); });
  await frames(page);
  d = await page.evaluate(() => ({ hud: window.__bb.hudRects }));
  expect(["beach", "winter"].map(w => d.hud.find(h => h.id === "home:bonus:" + w).open)).toEqual([true, true]);
  expect(d.hud.find(h => h.id === "home:bonus:beach").text).not.toContain("🔒");
  expect(d.hud.find(h => h.id === "home:worlds").text).toBe("Worlds finished: 4 / 4");
  // the texts in every language
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => { const I = window.__bb.I18N[l]; return [I.play, I.story, I.shop, I.map, I.home, I.worldsDone(2, 4)]; }))).toEqual([
    ["Play", "Story", "Shop", "Map", "Home", "Worlds finished: 2 / 4"],
    ["Jugar", "Historia", "Tienda", "Mapa", "Inicio", "Mundos terminados: 2 / 4"],
    ["Играть", "История", "Магазин", "Карта", "Главная", "Пройдено миров: 2 / 4"]]);

  // the buttons: Play → the map, Story, Shop; Escape goes back home; Enter = Play; the icons switch language and sound
  await click(page, "home:play");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  await click(page, "home:story");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("story");
  await page.keyboard.press("Escape");
  await page.keyboard.press("KeyS");                                       // S = Story
  expect(await page.evaluate(() => window.__bb.mode)).toBe("story");
  await page.keyboard.press("Escape");
  await click(page, "home:shop");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.shopTab])).toEqual(["shop", "items"]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await click(page, "home:lang");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("es");
  const m0 = await page.evaluate(() => window.__bb.muted);
  await click(page, "home:sound");
  expect(await page.evaluate(() => window.__bb.muted)).toBe(!m0);
  await click(page, "home:sound");
  // the gamepad: A = Play
  await page.evaluate(() => {
    window.__press = k => { window.__pads = [{ index: 0, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
    window.__press(-1);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  await frames(page);
  await page.evaluate(() => window.__press(0));
  await frames(page);
  await page.evaluate(() => window.__press(-1));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
});

test("home fits a phone in every language, also with wider fonts", async ({ phonePage: page }) => {
  const fails = [];
  for (const lang of ["en", "es", "ru"]) for (const scale of [1, 1.15]) for (const rich of [false, true]) {
    await page.evaluate(([l, s, r]) => {
      const b = window.__bb; b.setProgress(null); b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.mode = "home";
      if (r) {   // everything shown: four item kinds with two-digit counts, a big coin number, the bonus worlds open
        Object.assign(b.progress.inv, { mittens: 12, mega: 10, kisses: 15, rescues: 11 }); b.progress.coins = 12345;
        for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) });
      }
    }, [lang, scale, rich]);
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { mode: b.mode, buttons: b.buttonRects, hud: b.hudRects, ui: b.uiSize, texts: b.textSizes, min: b.CFG.PHONE_TEXT }; });
    const at = `${lang} ×${scale} ${rich ? "rich" : "fresh"}`;
    if ([...d.buttons.map(q => q.id)].sort().join() !== HOME_BUTTONS.join()) fails.push(`${at}: buttons ${d.buttons.map(q => q.id)}`);
    if (rich && d.hud.filter(h => h.id.startsWith("home:inv:")).length !== 4) fails.push(`${at}: not four item counts`);
    fails.push(...phoneProblems(at, d));
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setProgress(null); b.setLang("en"); });
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
});

// ---------- AC 10: one shop with tabs Items · Wardrobe · Upgrades ----------
test("the shop holds the wardrobe", async ({ page }) => {
  // no skins / names modes any more
  expect(await page.evaluate(() => { const b = window.__bb; b.mode = "skins"; const a = b.mode; b.mode = "names"; return [a, b.mode]; })).toEqual(["home", "home"]);
  await page.evaluate(() => { window.__bb.mode = "shop"; });
  await frames(page);
  let d = await page.evaluate(() => window.__bb.buttonRects.filter(q => String(q.id).startsWith("tab:")));
  expect(d.map(q => q.id), "three tabs in this order").toEqual(["tab:items", "tab:wardrobe", "tab:upgrades"]);
  expect(d[0].x < d[1].x && d[1].x < d[2].x).toBe(true);
  expect(d.map(q => q.text)).toEqual(["🛒 Items", "👕 Wardrobe", "⭐ Upgrades"]);
  // ← → (and the d-pad) cycle the three tabs
  const tabs = [];
  for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft"]) { await page.keyboard.press(k); tabs.push(await page.evaluate(() => window.__bb.shopTab)); }
  expect(tabs).toEqual(["wardrobe", "upgrades", "items", "upgrades"]);
  expect(await page.evaluate(() => { const b = window.__bb; b.shopTab = "wardrobe"; return b.shopTab; }), "__bb.shopTab accepts wardrobe").toBe("wardrobe");
  // the wardrobe: three previews, cycling arrows, dice, names, the friends button, the coins
  await frames(page);
  let s = await screen(page);
  expect(s.ids).toEqual(expect.arrayContaining(["name:p1", "name:p2", "name:big", "random:p1", "random:p2", "openFriends", "cycle:p1:hat:1", "cycle:p2:pants:-1", "cycle:big:look:1"]));
  expect(s.hud.map(h => h.id)).toContain("coins");
  expect(await page.evaluate(() => window.__bb.skinPanels().map(p => p.key))).toEqual(["p1", "p2", "big"]);
  const hat0 = await page.evaluate(() => window.__bb.outfits.shown.p1.hat);
  await click(page, "cycle:p1:hat:1");
  expect(await page.evaluate(() => window.__bb.outfits.shown.p1.hat)).toBe(hat0 + 1);
  await click(page, "cycle:p1:hat:-1");
  // the SPEC-009 try-on: a locked crown with no coins — "Buy" in place of the name; another tab ends the try-on
  const W = await page.evaluate(() => window.__bb.wardrobe()), crown = W.hat.findIndex(q => q.id === "crown");
  await page.evaluate(n => { const b = window.__bb; b.progress.coins = 0; b.cycleOutfit("p1", "hat", n - b.outfits.shown.p1.hat); }, crown);
  await frames(page);
  s = await screen(page);
  expect(s.ids).toContain("buy-look:p1");
  expect(s.ids).not.toContain("name:p1");
  await click(page, "tab:items");
  expect(await page.evaluate(() => { const o = window.__bb.outfits; return [o.shown.p1.hat, o.saved.p1.hat]; }), "leaving the tab ends the try-on").toEqual([hat0, hat0]);
  // the friends sub-page keeps a try-on; Escape goes back to the outfits, then out of the shop (which ends it)
  await click(page, "tab:wardrobe");
  await page.evaluate(n => { const b = window.__bb; b.cycleOutfit("p1", "hat", n - b.outfits.shown.p1.hat); }, crown);
  await click(page, "openFriends");
  s = await screen(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.shopTab, window.__bb.wardrobePage])).toEqual(["shop", "wardrobe", "friends"]);
  expect(s.ids.filter(id => String(id).startsWith("name:"))).toEqual(["name:bot1", "name:bot2", "name:bot3", "name:bot4"]);
  expect(s.ids).toEqual(expect.arrayContaining(["tab:items", "tab:wardrobe", "tab:upgrades", "backToWardrobe"]));
  expect(await page.evaluate(() => window.__bb.outfits.shown.p1.hat), "still trying on with Friends open").toBe(crown);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.wardrobePage])).toEqual(["shop", "looks"]);
  await click(page, "openFriends");
  await click(page, "tab:wardrobe");
  expect(await page.evaluate(() => window.__bb.wardrobePage), "the tab button goes back to the outfits").toBe("looks");
  await click(page, "openFriends");
  await click(page, "backToWardrobe");
  expect(await page.evaluate(() => [window.__bb.wardrobePage, window.__bb.outfits.shown.p1.hat])).toEqual(["looks", crown]);
  await page.keyboard.press("Escape");
  await frames(page);
  expect(await page.evaluate(() => { const b = window.__bb; return [b.mode, b.outfits.shown.p1.hat, b.outfits.saved.p1.hat]; }), "leaving the shop ends it").toEqual(["home", hat0, hat0]);
  // the buy flow still works in the tab: tap twice with enough coins
  await page.evaluate(n => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.progress.coins = 200; b.cycleOutfit("p1", "hat", n - b.outfits.shown.p1.hat); }, crown);
  await click(page, "buy-look:p1");
  await click(page, "buy-look:p1");
  expect(await page.evaluate(() => [window.__bb.progress.owned.hats, window.__bb.outfits.saved.p1.hat])).toEqual([["crown"], crown]);
  // R = a random outfit (only owned items); the next visit opens on Items
  await page.keyboard.press("KeyR");
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await frames(page);
  await page.evaluate(() => { window.__bb.mode = "shop"; });
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.shopTab, window.__bb.wardrobePage])).toEqual(["items", "looks"]);
  // the new tab's name in every language
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => [window.__bb.I18N[l].itemsTab, window.__bb.I18N[l].wardrobeTab, window.__bb.I18N[l].upgradesTab])))
    .toEqual([["Items", "Wardrobe", "Upgrades"], ["Cosas", "Ropa", "Mejoras"], ["Вещи", "Гардероб", "Улучшения"]]);
});

test("the wardrobe tab works and fits on a phone, also with wider fonts", async ({ phonePage: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; });
  await frames(page);
  const s = await screen(page);
  expect(s.ids).toEqual(expect.arrayContaining(["tab:items", "tab:wardrobe", "tab:upgrades", "name:p1", "name:big", "random:p1", "openFriends", "cycle:p1:hat:1", "cycle:big:look:-1"]));
  expect(s.ids).not.toContain("name:p2");
  expect(await page.evaluate(() => window.__bb.skinPanels().map(p => p.key))).toEqual(["p1", "big"]);
  const fails = [];
  for (const lang of ["en", "es", "ru"]) for (const scale of [1, 1.15]) for (const st of ["looks", "poor", "armed", "friends"]) {
    await page.evaluate(([l, sc, state]) => {
      const b = window.__bb, W = b.wardrobe(), to = (slot, k, id) => b.cycleOutfit("p1", slot, W[k].findIndex(q => q.id === id) - b.outfits.shown.p1[slot]);
      b.setLang(l); b.CFG.TEXT_TEST_SCALE = sc; b.resetOutfits(); b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = state === "friends" ? "friends" : "looks";
      b.progress.coins = state === "armed" ? 9999 : 10;
      if (state === "poor" || state === "armed") { to("hat", "hat", "viking"); to("jacket", "jacket", "cape"); b.cycleBig(W.big.findIndex(q => q.id === "captain") - b.outfits.shown.big); }
      if (state === "armed") b.buyLook("p1");
    }, [lang, scale, st]);
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { buttons: b.buttonRects, hud: b.hudRects, ui: b.uiSize, texts: b.textSizes, min: b.CFG.PHONE_TEXT, previews: b.skinPanels(), page: b.wardrobePage }; });
    const at = `${lang} ×${scale} ${st}`;
    fails.push(...phoneProblems(at, d));
    if (st !== "friends") {
      for (const h of d.hud.filter(q => q.id.startsWith("look-note:"))) for (const pv of d.previews) if (overlaps(h, pv)) fails.push(`${at}: ${h.id} covers the ${pv.key} preview`);
      for (const pv of d.previews) for (const b of d.buttons) if (overlaps(pv, b)) fails.push(`${at}: button ${b.id} on the ${pv.key} preview`);
    } else if (d.buttons.filter(q => String(q.id).startsWith("name:bot")).length !== 4) fails.push(`${at}: not four friends`);
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); b.resetOutfits(); b.mode = "home"; });
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
});

// ---------- AC 11: the end screens and the pause lead to the map, the shop and home ----------
test("win, lose and pause lead to the map, the shop and home", async ({ page }) => {
  // the screen's own buttons (the desktop HUD's pause and full-screen buttons are drawn under the end screens too)
  const end = async (setup) => {
    await page.evaluate(setup); await frames(page);
    return page.evaluate(() => { const r = window.__bb.buttonRects.filter(q => q.text !== "II" && q.id !== "toggleFullscreen"); return { mode: window.__bb.mode, names: r.map(q => q.id), texts: r.map(q => q.text) }; });
  };
  // win in the middle of a world: Next level · Map · Shop
  let e = await end(() => { const b = window.__bb; b.world = "city"; b.level = 3; b.startGame(1); b.giveReward(true); b.mode = "win"; });
  const I = await page.evaluate(() => { const L = window.__bb.I18N.en; return { next4: L.next(4), map: L.map, shop: L.shop, again: L.again, resume: L.resume, home: L.home }; });
  expect(e.names).toEqual(["nextLevel", "toMap", "shopAfterWin"]);
  expect(e.texts).toEqual([I.next4, "🗺 " + I.map, "🛒 " + I.shop]);
  await click(page, "toMap");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world])).toEqual(["map", "city"]);
  // win → Shop: the next level is picked, the shop's OK goes back to the map
  e = await end(() => { const b = window.__bb; b.world = "city"; b.level = 3; b.startGame(1); b.giveReward(true); b.mode = "win"; });
  await click(page, "shopAfterWin");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level])).toEqual(["shop", 4]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode), "back from the shop to the map").toBe("map");
  // the last level of a world: Map · Shop (no next level); Enter = Map
  e = await end(() => { const b = window.__bb; b.world = "city"; b.progress.worlds.city.unlocked = 20; b.level = 20; b.startGame(1); b.giveReward(true); b.mode = "win"; });
  expect(e.names).toEqual(["toMap", "shopAfterWin"]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world])).toEqual(["map", "city"]);
  // lose: Try again · Shop · Map; Escape = Map
  e = await end(() => { const b = window.__bb; b.world = "park"; b.level = 2; b.startGame(1); b.giveReward(false); b.mode = "lose"; });
  expect(e.names).toEqual(["retryLevel", "shopAfterLose", "toMap"]);
  expect(e.texts).toEqual([I.again, "🛒 " + I.shop, "🗺 " + I.map]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  await end(() => { const b = window.__bb; b.world = "park"; b.level = 2; b.startGame(1); b.giveReward(false); b.mode = "lose"; });
  await click(page, "retryLevel");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level])).toEqual(["play", "park", 2]);
  // pause: Continue · Map · Home; Escape = continue, Q = Map; the Home button goes home
  e = await end(() => { const b = window.__bb; b.startGame(1); b.mode = "pause"; });
  expect(e.names).toEqual(["resumeGame", "toMap", "toHome"]);
  expect(e.texts).toEqual([I.resume, "🗺 " + I.map, "🏠 " + I.home]);
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => window.__bb.I18N[l].resume))).toEqual(["Continue", "Seguir", "Продолжить"]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
  await page.evaluate(() => { window.__bb.mode = "pause"; });
  await page.keyboard.press("KeyQ");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  await end(() => { const b = window.__bb; b.startGame(1); b.mode = "pause"; });
  await click(page, "toHome");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  // after a level the ring starts on the bouncing next level again (the stop picked before the level is forgotten)
  await page.evaluate(() => { const b = window.__bb; b.setProgress(null); b.world = "park"; b.mode = "map"; });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("stop:1"));
  await click(page, "card:1");
  await end(() => { const b = window.__bb; b.giveReward(true); b.mode = "win"; });
  await click(page, "toMap");
  await page.keyboard.press("Enter");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.levelCard && window.__bb.levelCard.n]), "win → Map → Enter: the next level's card").toEqual(["levelCard", 2]);
});

// ---------- AC 3–5: the level map ----------
// __bb.mapInfo (drawn this frame) = { world, sel, done, tabs: [{ world, locked, selected, x, y, w, h }], stops: [{ n, stars, locked,
// next, boss, sel, x, y, w, h, badge }] }; __bb.toast = { text } or null; __bb.levelCard = { world, n, title, type } on the card
const mapInfo = page => page.evaluate(() => window.__bb.mapInfo);
const padStub = page => page.evaluate(() => {
  window.__press = k => { window.__pads = [{ index: 0, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
  window.__press(-1);
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
});
const pad = async (page, k) => { await page.evaluate(n => window.__press(n), k); await frames(page); await page.evaluate(() => window.__press(-1)); await frames(page); };

test("the map switches worlds", { tag: "@fast" }, async ({ page }) => {
  // opens on progress.lastWorld
  await page.evaluate(() => {
    const b = window.__bb, p = b.progress.worlds;
    Object.assign(p.park, { unlocked: 3, won: { 1: true, 2: true }, stars: { 1: 3, 2: 2 } }); Object.assign(p.school, { unlocked: 4, won: { 1: true }, stars: { 1: 1 } });
    b.progress.lastWorld = "school";
  });
  await click(page, "home:play");
  let m = await mapInfo(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  expect(m.world).toBe("school");
  // six tabs in the story order, the bonus ones locked; the back button and the coins
  expect(m.tabs.map(t => [t.world, t.locked])).toEqual([["park", false], ["field", false], ["city", false], ["school", false], ["beach", true], ["winter", true]]);
  expect(m.tabs.map(t => t.selected)).toEqual([false, false, false, true, false, false]);
  let s = await screen(page);
  expect(s.ids).toEqual(expect.arrayContaining(["back:home", "maptab:park", "maptab:field", "maptab:city", "maptab:school", "maptab:beach", "maptab:winter"]));
  expect(s.hud.map(h => h.id)).toEqual(expect.arrayContaining(["coins", "map:title"]));
  expect(s.hud.find(h => h.id === "map:title").text).toContain("School");
  expect(m.tabs.every((t, i) => !i || t.x > m.tabs[i - 1].x), "tabs left to right").toBe(true);
  // a tab click selects the world (and remembers it); a locked bonus tab only says why
  await click(page, "maptab:park");
  expect(await page.evaluate(() => [window.__bb.world, window.__bb.progress.lastWorld, JSON.parse(localStorage.getItem("bebebe-progress")).lastWorld])).toEqual(["park", "park", "park"]);
  await click(page, "maptab:beach");
  expect(await page.evaluate(() => [window.__bb.world, window.__bb.toast && window.__bb.toast.text])).toEqual(["park", "Win all levels of the main worlds to open"]);
  s = await screen(page);
  expect(s.hud.map(h => h.id)).toContain("toast");
  // ←/→ walk the worlds in the story order (round), skipping the locked bonus ones
  const seq = [];
  for (const k of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) { await page.keyboard.press(k); seq.push(await page.evaluate(() => window.__bb.world)); }
  expect(seq).toEqual(["field", "city", "field", "park", "school"]);
  // the gamepad: D-pad ←/→ and the shoulder buttons (CFG.PAD_PREV_WORLD / PAD_NEXT_WORLD)
  const C = await page.evaluate(() => [window.__bb.CFG.PAD_PREV_WORLD, window.__bb.CFG.PAD_NEXT_WORLD]);
  expect(C).toEqual([4, 5]);
  await padStub(page);
  const ps = [];
  for (const k of [15, 14, C[1], C[0], C[0]]) { await pad(page, k); ps.push(await page.evaluate(() => window.__bb.world)); }
  expect(ps).toEqual(["park", "school", "park", "school", "city"]);
  // every main level won: the bonus tabs open, → from the School goes to the Beach
  await page.evaluate(() => { const b = window.__bb; for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) }); b.selectWorld("school"); });
  await frames(page);
  m = await mapInfo(page);
  expect(m.tabs.map(t => t.locked)).toEqual([false, false, false, false, false, false]);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.__bb.world)).toBe("beach");
  // a finished world: the map opens on the first world with an unwon level instead
  await page.evaluate(() => { const b = window.__bb; b.progress.lastWorld = "park"; b.mode = "home"; });
  await click(page, "home:play");
  expect(await page.evaluate(() => window.__bb.world), "Park, Field, City, School all won: the Beach").toBe("beach");
  // back home: the button and Escape
  await click(page, "back:home");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  // the gamepad walk: A on home → the map, A → the next level's card, Y → its story chapter, B back to the card, the map, home
  await page.evaluate(() => { const b = window.__bb; b.setProgress(null); b.progress.lastWorld = "park"; b.resetMenus(); b.mode = "home"; });
  const walk = [];
  for (const k of [0, 0, 3, 1, 1, 1]) { await pad(page, k); walk.push(await page.evaluate(() => window.__bb.mode)); }
  expect(walk).toEqual(["map", "levelCard", "story", "levelCard", "map", "home"]);
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => window.__bb.I18N[l].lockedBonus))).toEqual([
    "Win all levels of the main worlds to open", "Ganá todos los niveles de los mundos principales para abrirlo", "Пройди все уровни основных миров, чтобы открыть"]);
});

test("level stops show number, stars and locks", async ({ page }) => {
  await page.evaluate(() => {
    const b = window.__bb, p = b.progress.worlds.park;
    Object.assign(p, { unlocked: 5, won: { 1: true, 2: true, 3: true, 4: true }, stars: { 1: 3, 2: 2, 3: 1, 4: 2 } });
    b.world = "park"; b.mode = "map";
  });
  await frames(page);
  let m = await mapInfo(page);
  expect(m.stops.map(q => q.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(m.stops.map(q => q.stars)).toEqual([3, 2, 1, 2, ...Array(16).fill(0)]);
  expect(m.stops.filter(q => q.locked).map(q => q.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 6));
  expect(m.stops.filter(q => q.next).map(q => q.n), "the next unwon level bounces").toEqual([5]);
  expect(m.stops.filter(q => q.boss).map(q => q.n)).toEqual([20]);
  expect(m.stops[19].w).toBeGreaterThan(m.stops[0].w * 1.1);
  expect(m.stops[19].badge.text).toBe("Boss");
  expect(m.done).toBe(false);
  // serpentine: four rows of five; the 1st and 3rd go left to right, the 2nd and 4th right to left
  const cx = q => q.x + q.w / 2, cy = q => q.y + q.h / 2, st = m.stops, layout = [];
  for (let r = 0; r < 4; r++) for (let i = 1; i < 5; i++) {
    const a = st[r * 5 + i - 1], b = st[r * 5 + i];
    if (Math.abs(cy(a) - cy(b)) > 0.5) layout.push(`${b.n} not on the row of ${a.n}`);
    if (r % 2 === 0 ? cx(b) <= cx(a) : cx(b) >= cx(a)) layout.push(`${b.n} on the wrong side of ${a.n}`);
  }
  for (let r = 1; r < 4; r++) if (cy(st[r * 5]) <= cy(st[r * 5 - 1])) layout.push(`row ${r + 1} not under row ${r}`);
  st.forEach((a, i) => st.slice(i + 1).forEach(b => { if (overlaps(a, b)) layout.push(`${a.n} on ${b.n}`); }));
  expect(layout).toEqual([]);
  // the keyboard: ↑/↓ move a ring between the stops (it starts on the next level); Enter opens the card, a locked stop says why
  expect(m.sel).toBe(5);
  await page.keyboard.press("ArrowUp");
  await frames(page);
  expect((await mapInfo(page)).sel).toBe(4);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await frames(page);
  expect((await mapInfo(page)).stops.find(q => q.sel).n).toBe(6);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.toast && window.__bb.toast.text])).toEqual(["map", "Win level 5 first"]);
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.levelCard && window.__bb.levelCard.n])).toEqual(["levelCard", 5]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  // a tap on a locked stop: "Win level n − 1 first", no card; on an open one: the card, and its Play starts that level
  await click(page, "stop:7");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.toast.text])).toEqual(["map", "Win level 6 first"]);
  await click(page, "stop:3");
  const card = await page.evaluate(() => ({ mode: window.__bb.mode, card: window.__bb.levelCard, ids: window.__bb.buttonRects.map(q => q.id) }));
  expect(card.mode).toBe("levelCard");
  expect(card.card).toMatchObject({ world: "park", n: 3, title: "Park · Level 3", type: "Meadow" });
  expect(card.ids, "only the card's buttons while it is open").toEqual(expect.arrayContaining(["card:1", "card:2", "card:close"]));
  expect(card.ids.some(id => String(id).startsWith("stop:"))).toBe(false);
  await click(page, "card:close");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  await click(page, "stop:3");
  await click(page, "card:2");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level, window.__bb.littles.filter(l => l.kind === "player").length])).toEqual(["play", "park", 3, 2]);
  // a finished world: the "done" stamp, nothing bounces
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.progress.worlds.park, { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) }); b.mode = "map"; });
  await frames(page);
  m = await mapInfo(page);
  const hud = await page.evaluate(() => window.__bb.hudRects);
  expect(m.done).toBe(true);
  expect(m.stops.filter(q => q.next)).toEqual([]);
  expect(hud.find(h => h.id === "map:done").text).toBe("✔ Done!");
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => { const I = window.__bb.I18N[l]; return [I.lockedLevel(6), I.boss, I.done]; }))).toEqual([
    ["Win level 6 first", "Boss", "✔ Done!"], ["Primero ganá el nivel 6", "Jefe", "✔ ¡Listo!"], ["Сначала пройди уровень 6", "Босс", "✔ Пройдено!"]]);
});

test("the map fits a phone and swipes between worlds", async ({ phonePage: page }) => {
  test.setTimeout(180_000);   // 27 map screens in software WebGL (~70 s locally)
  const fails = [];
  // ×1.3 for the toast: CI's Linux fonts are wider than ×1.15 of the local ones (the long lockedBonus line wraps, never cut)
  const runs = ["en", "es", "ru"].flatMap(l => [1, 1.15].flatMap(s => ["fresh", "done", "toast", "card"].map(st => [l, s, st])).concat([[l, 1.3, "toast"]]));
  for (const [lang, scale, st] of runs) {
    await page.evaluate(([l, s, state]) => {
      const b = window.__bb; b.setProgress(null); b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.resetMenus();
      const all = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
      Object.assign(b.progress.worlds.field, { unlocked: 9, won: { 1: true, 2: true }, stars: { 1: 3, 2: 1 } });
      if (state === "done") for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: all(), stars: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3])) });
      b.world = "field"; b.mode = "map";
    }, [lang, scale, st]);
    await frames(page);
    if (st === "toast") await page.evaluate(() => window.__bb.tapButton("maptab:winter"));
    if (st === "card") await page.evaluate(() => window.__bb.tapButton("stop:2"));
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { mode: b.mode, buttons: b.buttonRects, hud: b.hudRects, ui: b.uiSize, texts: b.textSizes, min: b.CFG.PHONE_TEXT, m: b.mapInfo, toast: b.toast }; });
    const at = `${lang} ×${scale} ${st}`;
    fails.push(...phoneProblems(at, d));
    if (st === "card") { if (d.mode !== "levelCard" || !d.buttons.some(q => q.id === "card:play") || d.buttons.some(q => q.id === "card:2")) fails.push(`${at}: the phone card has one Play button`); continue; }
    if (d.m.stops.length !== 20) fails.push(`${at}: ${d.m.stops.length} stops`);
    for (const q of d.m.stops) {
      if (q.w * d.ui.scale < 44 - 0.01 || q.h * d.ui.scale < 44 - 0.01) fails.push(`${at}: stop ${q.n} ${q.w * d.ui.scale} CSS px`);
      if (q.badge && (q.badge.textW > q.badge.w + 0.5 || q.badge.size * d.ui.scale < d.min.hint - 0.01)) fails.push(`${at}: boss badge ${JSON.stringify(q.badge)}`);
    }
    const th = d.hud.find(h => h.id === "toast");
    if (st === "toast" && !(d.toast && th)) fails.push(`${at}: no toast`);
    else if (st === "toast" && (th.text !== d.toast.text || (th.rows || [th.text]).length > 2)) fails.push(`${at}: toast ${JSON.stringify(th)}: the whole text in one or two rows`);
    if (st === "done" && !d.hud.some(h => h.id === "map:done")) fails.push(`${at}: no done stamp`);
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setProgress(null); b.setLang("en"); b.resetMenus(); b.mode = "map"; b.world = "park"; });
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
  // a swipe left goes to the next world, right to the previous one; a short move is a tap
  const swipe = async (x0, x1, y) => {
    await page.evaluate(([a, b, yy]) => {
      const c = document.getElementById("game"), bb = c.getBoundingClientRect(), s = window.__bb.uiSize.scale;
      const ev = (type, x) => c.dispatchEvent(new PointerEvent(type, { clientX: bb.left + x * s, clientY: bb.top + yy * s, pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      ev("pointerdown", a); ev("pointermove", (a + b) / 2); ev("pointermove", b); ev("pointerup", b);
    }, [x0, x1, y]);
    await frames(page);
    return page.evaluate(() => window.__bb.world);
  };
  const ui = await page.evaluate(() => window.__bb.uiSize);
  expect(await swipe(ui.w * 0.7, ui.w * 0.3, ui.h * 0.6)).toBe("field");
  expect(await swipe(ui.w * 0.3, ui.w * 0.7, ui.h * 0.6)).toBe("park");
  expect(await swipe(ui.w * 0.3, ui.w * 0.7, ui.h * 0.6), "round, past the locked bonus worlds").toBe("school");
  expect(await swipe(ui.w * 0.5, ui.w * 0.5 + 3, ui.h * 0.6)).toBe("school");
});

// ---------- AC 6, 7, 2: the level card ----------
// __bb.levelCard = { world, n, title, type, line } (the card drawn this frame); hudRects card:title, card:type, card:line
test("the level card starts the level", async ({ page }) => {
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.park.unlocked = 20; b.progress.worlds.park.stars = { 8: 2 }; b.world = "park"; b.mode = "map"; });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("stop:8"));
  await frames(page);
  let d = await page.evaluate(() => ({ card: window.__bb.levelCard, ids: window.__bb.buttonRects.map(q => q.id), hud: window.__bb.hudRects, lines: window.__bb.I18N.en.typeLines, boss: window.__bb.I18N.en.bossLine }));
  expect(d.card).toEqual({ world: "park", n: 8, title: "Park · Level 8", type: "River with bridges", line: d.lines.river, stars: 2 });
  expect(d.hud.find(h => h.id === "card:line").text).toBe(d.lines.river);
  expect([...d.ids].sort(), "desktop: 1 or 2 players, the story, close").toEqual(["card:1", "card:2", "card:close", "card:story"]);
  // level 20: the boss line
  await page.keyboard.press("Escape");
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("stop:20"));
  await frames(page);
  d = await page.evaluate(() => ({ card: window.__bb.levelCard }));
  expect(d.card).toMatchObject({ n: 20, type: "Maze", line: await page.evaluate(() => window.__bb.I18N.en.bossLine) });
  // 📖 opens the world's story chapter; back from the story returns to the card
  await click(page, "card:story");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.chapter])).toEqual(["story", "park"]);
  await page.keyboard.press("Escape");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.levelCard.n])).toEqual(["levelCard", 20]);
  // Play = startGame: that world and level, the level banner, one or two players
  await click(page, "card:1");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level, window.__bb.littles.filter(l => l.kind === "player").length, window.__bb.banner.text]))
    .toEqual(["play", "park", 20, 1, "Park · Level 20: Maze"]);
  // the texts: a line for every level type and the boss line, in every language
  const T = await page.evaluate(() => ["en", "es", "ru"].map(l => { const I = window.__bb.I18N[l]; return { keys: Object.keys(I.typeLines).sort(), types: Object.keys(I.types).sort(), ok: Object.values(I.typeLines).every(s => typeof s === "string" && s.length > 8), boss: I.bossLine }; }));
  for (const t of T) { expect(t.keys).toEqual(t.types); expect(t.ok).toBe(true); expect(t.boss.length).toBeGreaterThan(8); }
});

// ---------- AC 8, 9: the story ----------
// __bb.STORY — the chapters { id, image, text: { en, es, ru } }; __bb.storyInfo = { chapter, index, locked, page, title, text, art }
test("story chapters unlock with progress", async ({ page }) => {
  const S = await page.evaluate(() => window.__bb.STORY.map(c => ({ id: c.id, image: c.image, langs: Object.keys(c.text).sort() })));
  expect(S.map(c => c.id)).toEqual(["began", "park", "field", "city", "school", "beach", "winter", "ended"]);
  for (const c of S) expect(c.langs, c.id).toEqual(["en", "es", "ru"]);
  await click(page, "home:story");
  const walk = async () => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      await frames(page);
      const s = await page.evaluate(() => window.__bb.storyInfo);
      out.push([s.chapter, s.locked]);
      await page.keyboard.press("ArrowRight");
    }
    return out;
  };
  // fresh: the beginning and the four main worlds; the bonus worlds and the ending show 🔒
  expect(await walk()).toEqual([["began", false], ["park", false], ["field", false], ["city", false], ["school", false], ["beach", true], ["winter", true], ["ended", true]]);
  await frames(page);
  let s = await page.evaluate(() => window.__bb.storyInfo);
  expect(s.chapter, "→ on the last chapter stays there").toBe("ended");
  expect(s.text, "a hidden chapter does not tell its text").not.toBe(await page.evaluate(() => window.__bb.STORY[7].text.en));
  expect(s.title).toContain("🔒");
  // School 20 won: the ending opens (the bonus worlds still locked)
  await page.evaluate(() => { window.__bb.progress.worlds.school.won[20] = true; });
  await frames(page);
  s = await page.evaluate(() => window.__bb.storyInfo);
  expect([s.chapter, s.locked, s.text]).toEqual(["ended", false, await page.evaluate(() => window.__bb.STORY[7].text.en)]);
  // every main level won: the bonus chapters open
  await page.evaluate(() => { const b = window.__bb; for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) }); });
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowLeft");
  expect((await walk()).map(x => x[1])).toEqual(Array(8).fill(false));
  // the picture (SPEC-020): the chapter's comic from assets/ (art); a chapter's own image path wins: broken → the placeholder, no error
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowLeft");
  await frames(page);
  s = await page.evaluate(() => ({ info: window.__bb.storyInfo, hud: window.__bb.hudRects }));
  expect([s.info.chapter, s.info.art]).toEqual(["began", "image"]);
  expect(s.hud.some(h => h.id === "story:soon"), "no placeholder while the comic is there").toBe(false);
  // storyInfo.load: the picture loader's state ("none" — no picture yet, "loading", "bad", "ok")
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  try {
    await page.evaluate(() => { window.__bb.STORY[0].image = "data:image/webp;base64,AAAA"; });
    await page.waitForFunction(() => { const s = window.__bb.storyInfo; return s && s.load === "bad"; });
    s = await page.evaluate(() => ({ info: window.__bb.storyInfo, hud: window.__bb.hudRects }));
    expect(s.info.art, "a broken picture: the placeholder").toBe("placeholder");
    expect(s.hud.some(h => h.id === "story:soon")).toBe(true);
    await page.evaluate(p => { window.__bb.STORY[0].image = p; }, PNG);
    await page.waitForFunction(() => { const s = window.__bb.storyInfo; return s && s.load === "ok" && s.art === "image"; });
  } finally { await page.evaluate(() => { window.__bb.STORY[0].image = null; }); }
  // the rules page: every rules line and the controls; back to the chapters; Escape goes home
  await click(page, "story:rules");
  s = await page.evaluate(() => ({ info: window.__bb.storyInfo, hud: window.__bb.hudRects, rules: window.__bb.I18N.en.rules(window.__bb.CFG.DOWN_TIME), I: window.__bb.I18N.en }));
  expect(s.info.page).toBe("rules");
  expect(s.hud.filter(h => h.id.startsWith("rules:")).map(h => h.text)).toEqual(s.rules);
  expect(s.hud.filter(h => h.id.startsWith("controls:")).map(h => h.text)).toEqual([s.I.controls1, s.I.controls2]);
  expect(s.hud.find(h => h.id === "story:title").text).toContain(s.I.howToPlay);
  await page.keyboard.press("Escape");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.page]), "Escape on the rules page: back to the chapters").toEqual(["story", "chapters"]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  // the titles in every language
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => { const I = window.__bb.I18N[l]; return [I.chapters.began, I.chapters.ended, I.howToPlay]; }))).toEqual([
    ["How it began", "How it ended", "How to play"], ["Cómo empezó", "Cómo terminó", "Cómo se juega"], ["Как всё началось", "Как всё закончилось", "Как играть"]]);
});

test("story, rules and the level card fit a phone, also with wider fonts", async ({ phonePage: page }) => {
  const fails = [];
  for (const lang of ["en", "es", "ru"]) for (const scale of [1, 1.15]) for (const st of ["began", "park", "ended", "rules", "card8", "card20"]) {
    await page.evaluate(([l, s, state]) => {
      const b = window.__bb; b.setProgress(null); b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.resetMenus();
      b.progress.worlds.park.unlocked = 20; b.world = "park";
      if (state.startsWith("card")) b.mode = "map";
      else b.openStory(state === "rules" ? "began" : state, "home");
    }, [lang, scale, st]);
    await frames(page);
    if (st === "rules") await page.evaluate(() => window.__bb.tapButton("story:rules"));
    if (st.startsWith("card")) await page.evaluate(n => window.__bb.tapButton("stop:" + n), st.slice(4));
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { mode: b.mode, buttons: b.buttonRects, hud: b.hudRects, ui: b.uiSize, texts: b.textSizes, min: b.CFG.PHONE_TEXT, info: b.storyInfo, card: b.levelCard, rules: b.I18N[document.documentElement.lang].rules(b.CFG.DOWN_TIME).length }; });
    const at = `${lang} ×${scale} ${st}`;
    fails.push(...phoneProblems(at, d));
    if (st.startsWith("card")) {
      if (!d.card || [...d.buttons.map(q => q.id)].sort().join() !== "card:close,card:play,card:story") fails.push(`${at}: card buttons ${d.buttons.map(q => q.id)}`);
      if (!d.hud.some(h => h.id === "card:line")) fails.push(`${at}: no type line`);
    } else if (st === "rules") {
      if (d.hud.filter(h => h.id.startsWith("rules:")).length !== d.rules) fails.push(`${at}: not ${d.rules} rules lines`);
      if (!d.hud.some(h => h.id === "controls:touch")) fails.push(`${at}: no touch hint`);
    } else {
      if (!d.info || d.info.chapter !== st) fails.push(`${at}: chapter ${d.info && d.info.chapter}`);
      if (st !== "ended" && !d.hud.some(h => h.id === "story:text")) fails.push(`${at}: no text`);
    }
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setProgress(null); b.setLang("en"); b.resetMenus(); b.openStory("began", "home"); });
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
  // a swipe left: the next chapter; right: back
  await frames(page);
  const ui = await page.evaluate(() => window.__bb.uiSize);
  const swipe = async (x0, x1) => {
    await page.evaluate(([a, b, yy]) => {
      const c = document.getElementById("game"), bb = c.getBoundingClientRect(), s = window.__bb.uiSize.scale;
      const ev = (type, x) => c.dispatchEvent(new PointerEvent(type, { clientX: bb.left + x * s, clientY: bb.top + yy * s, pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      ev("pointerdown", a); ev("pointermove", b); ev("pointerup", b);
    }, [x0, x1, ui.h * 0.5]);
    await frames(page);
    return page.evaluate(() => window.__bb.storyInfo.chapter);
  };
  expect(await swipe(ui.w * 0.7, ui.w * 0.3)).toBe("park");
  expect(await swipe(ui.w * 0.3, ui.w * 0.7)).toBe("began");
});

// review fix: an object literal keeps only the last of two equal keys, silently (MENU_LOOK had a colour `story` and the
// story-screen sizes `story`: the buttons got an object for a colour). No key twice on any level of CFG.MENU_LOOK.
test("CFG.MENU_LOOK has no key twice", () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), at = src.indexOf("MENU_LOOK: {");
  expect(at).toBeGreaterThan(0);
  const dups = [], stack = [new Set()];
  let i = src.indexOf("{", at) + 1, expectKey = true;
  for (; i < src.length && stack.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { const q = ch; i++; while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1; expectKey = false; continue; }
    if (ch === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (ch === "{") { stack.push(new Set()); expectKey = true; continue; }
    if (ch === "}") { stack.pop(); expectKey = false; continue; }
    if (ch === "[" || ch === "(") { let d = 1; i++; while (i < src.length && d) { if ("[(".includes(src[i])) d++; else if ("])".includes(src[i])) d--; i++; } i--; expectKey = false; continue; }
    if (ch === ",") { expectKey = true; continue; }
    if (expectKey && /[A-Za-z_$]/.test(ch)) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i, i + 64));
      if (m) { const top = stack[stack.length - 1]; if (top.has(m[1])) dups.push(m[1]); top.add(m[1]); i += m[0].length - 1; }
      expectKey = false;
    }
  }
  expect(dups).toEqual([]);
});
