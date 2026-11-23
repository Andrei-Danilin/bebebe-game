// SPEC-017: the menus — the minimal home screen, the shop with the Wardrobe tab, the end-screen flows.
// (The level map, the level card and the story screen come in the next steps of the spec.)
const base = require("@playwright/test");
const { expect } = base;
const { openGame, frames, sharedPage, resetGame } = require("./helpers");

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
test("home is minimal", { tag: "@fast" }, async ({ page }) => {
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
});
