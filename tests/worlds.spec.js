// SPEC-030: the main worlds open one after another (Park → Football field → City → School; each when the previous one is
// finished), the bonus worlds after all four (unchanged); old saves keep every world they played. One function decides:
// __bb.worldOpen(world, p) → { open, reason }.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { textFloor, LANGS, openGame, frames, softly, sharedPage, resetGame, putOldSave } = require("./helpers");

// shared pages: one sim page, and one rendered page per setup (desktop, phone 667×375; one open at a time); resetGame() before each
// test; page errors and a changed CFG fail it
const shared = sharedPage(), sharedSim = sharedPage();
const fixture = (key, ctx, opts) => async ({ browser }, use) => {
  const s = await (opts.sim ? sharedSim : shared).get(browser, key, ctx, p => openGame(p, opts));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
const test = base.test.extend({
  simPage: fixture("worlds-sim", { viewport: { width: 960, height: 640 } }, { sim: true }),
  page: fixture("worlds-desktop", { viewport: { width: 960, height: 640 } }, {}),
  phonePage: fixture("worlds-phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, { query: "?phone=1" })
});
test.afterAll(async () => { await shared.close(); await sharedSim.close(); });

const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
const SAVES_DIR = path.join(__dirname, "fixtures", "saves");
const save = n => JSON.parse(fs.readFileSync(path.join(SAVES_DIR, n + ".json"), "utf8"));
// in the page: every level 1…n of a world won (the world finished when n = 20)
const WON = "n => ({ unlocked: Math.min(20, n + 1), won: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, true])), stars: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1])) })";

// ---------- AC 1–3: one place decides; the rule; old saves ----------
test("worldOpen gives every reason: start, previous, bonus, played, locked", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(src => {
    const b = window.__bb, won = new Function("return " + src)();
    const reasons = p => Object.fromEntries(b.WORLDS.map(w => [w, b.worldOpen(w, p).reason]));
    const L = b.loadProgress, out = {};
    out.fresh = reasons(L(null));
    out.park = reasons(L({ worlds: { park: won(20) } }));
    out.parkField = reasons(L({ worlds: { park: won(20), field: won(20) } }));
    out.three = reasons(L({ worlds: { park: won(20), field: won(20), city: won(20) } }));
    out.all = reasons(L({ worlds: { park: won(20), field: won(20), city: won(20), school: won(20) } }));
    // played: a win in the City with the Field not finished; the Beach with its own progress (SPEC-016, unchanged)
    out.played = reasons(L({ worlds: { park: won(4), city: won(1), beach: { unlocked: 3 } } }));
    // level 20 of the Park is not enough while another Park level is not won (finished = every level won, level 20 is the last)
    out.notAll = b.worldOpen("field", L({ worlds: { park: { unlocked: 20, won: { 20: true } } } })).reason;
    // open is the same as reason !== "locked"; a locked world says what it needs (the main world before it, or null); the current
    // progress is the default
    out.shape = b.WORLDS.every(w => { const o = b.worldOpen(w); return Object.keys(o).sort().join() === (o.open ? "open,reason" : "needs,open,reason") && o.open === (o.reason !== "locked"); });
    out.needs = b.WORLDS.map(w => b.worldOpen(w, L(null)).needs ?? null);
    // partial or broken progress never throws; an unknown world is locked
    out.partial = [b.worldOpen("field", {}).reason, b.worldOpen("field", { worlds: { park: {} } }).reason, b.worldOpen("moon").reason, b.worldOpen("park", null).reason];
    out.noBonusOpen = typeof b.bonusOpen;
    return out;
  }, WON);
  expect(r.fresh).toEqual({ park: "start", field: "locked", city: "locked", school: "locked", beach: "locked", winter: "locked" });
  expect(r.park).toEqual({ park: "start", field: "previous", city: "locked", school: "locked", beach: "locked", winter: "locked" });
  expect(r.parkField).toEqual({ park: "start", field: "previous", city: "previous", school: "locked", beach: "locked", winter: "locked" });
  expect(r.three).toEqual({ park: "start", field: "previous", city: "previous", school: "previous", beach: "locked", winter: "locked" });
  expect(r.all).toEqual({ park: "start", field: "previous", city: "previous", school: "previous", beach: "bonus", winter: "bonus" });
  expect(r.played).toEqual({ park: "start", field: "locked", city: "played", school: "locked", beach: "played", winter: "locked" });
  expect(r.notAll).toBe("locked");
  expect(r.shape).toBe(true);
  expect(r.needs).toEqual([null, "park", "field", "city", null, null]);
  expect(r.partial).toEqual(["locked", "locked", "locked", "start"]);
  expect(r.noBonusOpen, "bonusOpen is replaced by worldOpen").toBe("undefined");
});

test("old saves keep every world they played; the Park 3 / Field 5 / City 1 save opens three worlds, not the School", async ({ simPage: page }) => {
  const names = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));
  const soft = softly();
  for (const n of names) {
    const f = save(n), raw = f.keys["bebebe-progress"];
    if (raw === undefined) continue;
    const r = await page.evaluate(s => {
      const b = window.__bb, p = b.loadProgress(typeof s === "string" ? JSON.parse(s) : s);
      const has = w => { const v = p.worlds[w]; return v.unlocked > 1 || Object.keys(v.won).length > 0 || Object.keys(v.stars).length > 0; };
      return { lost: b.WORLDS.filter(w => has(w) && !b.worldOpen(w, p).open), last: p.lastWorld, lastOpen: b.worldOpen(p.lastWorld, p).open,
        reasons: Object.fromEntries(b.WORLDS.map(w => [w, b.worldOpen(w, p).reason])) };
    }, raw);
    soft(r.lost, `${n}: every world with progress stays open`).toEqual([]);
    soft(r.lastOpen, `${n}: the menu opens on an open world (${r.last})`).toBe(true);
    if (f.expect.open) soft(r.reasons, `${n}: reasons`).toEqual(f.expect.open);
  }
  soft.done();
  // the spec's save loaded from localStorage at start: the menu is on the Park (the saved School is locked)
  const f = save("pre-spec-030");
  await putOldSave(page, { "bebebe-progress": f.keys["bebebe-progress"] });   // SPEC-025: an old device's save
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const start = await page.evaluate(() => ({ world: window.__bb.world, last: window.__bb.progress.lastWorld,
    open: window.__bb.WORLDS.filter(w => window.__bb.worldOpen(w).open) }));
  expect(start).toEqual({ world: "park", last: "park", open: ["park", "field", "city"] });
});

test("locked worlds cannot be chosen; Play opens an open world; Reset leaves only the Park; chapters follow worldOpen", async ({ simPage: page }) => {
  const r = await page.evaluate(src => {
    const b = window.__bb, won = new Function("return " + src)(), out = {};
    const chapters = () => b.STORY.filter(c => b.WORLDS.includes(c.id)).filter(c => b.chapterOpen(c)).map(c => c.id);
    // fresh: only the Park; selectWorld refuses the others (the debug setter world = … still goes anywhere: tests, balance)
    b.mode = "map"; b.selectWorld("field"); out.select = b.world;
    out.chaptersFresh = chapters();
    b.world = "school"; out.debug = b.world; b.world = "park";
    // Play (continue): a saved locked world opens the Park; a finished Park opens the Field (the first open world not finished)
    b.setProgress({ lastWorld: "city" }); b.mode = "home"; b.openMap(); out.lockedLast = b.world;
    b.setProgress({ lastWorld: "park", worlds: { park: won(20) } }); b.mode = "home"; b.openMap(); out.parkDone = b.world;
    out.chaptersPark = chapters();
    b.progress.lastWorld = "school"; b.mode = "home"; b.openMap(); out.lockedRuntime = b.world;
    // Reset: everything was open, the City selected → only the Park, the menu on it
    b.setProgress({ worlds: { park: won(20), field: won(20), city: won(20), school: won(20), beach: won(2) } });
    b.mode = "map"; b.selectWorld("city"); out.before = b.world;
    b.resetProgress();
    out.reset = { world: b.world, last: b.progress.lastWorld, open: b.WORLDS.filter(w => b.worldOpen(w).open), chapters: chapters() };
    b.mode = "home";
    return out;
  }, WON);
  expect(r).toEqual({ select: "park", chaptersFresh: ["park"], debug: "school", lockedLast: "park", parkDone: "field", chaptersPark: ["park", "field"],
    lockedRuntime: "field", before: "city", reset: { world: "park", last: "park", open: ["park"], chapters: ["park"] } });
});

// ---------- AC 5: a win that opens a world — the map goes there with a banner, once ----------
test("winning a world's level 20 for the first time opens the next world: the map switches to it and says so", async ({ simPage: page }) => {
  const r = await page.evaluate(src => {
    const b = window.__bb, won = new Function("return " + src)(), out = {};
    const win = (w, n) => { b.world = w; b.level = n; b.startGame(1); Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }); b.giveReward(true); b.mode = "win"; return b.lastReward.worldOpened; };
    const at = () => ({ mode: b.mode, world: b.world, banner: b.worldBanner && b.worldBanner.text, pending: b.openedWorld });
    // the win screen's Map: Park 20 → the Field
    b.setProgress({ worlds: { park: won(19) } });
    out.parkWin = win("park", 20); out.onWin = at();
    b.toMap(); out.map = at();
    out.chapter = b.chapterOpen(b.STORY.find(c => c.id === "field"));
    out.again = win("park", 20); b.toMap(); out.mapAgain = at();
    // the shop after the win, then Done: Field 20 → the City
    b.setProgress({ worlds: { park: won(20), field: won(19) } });
    out.fieldWin = win("field", 20); b.shopAfterWin(); out.shop = at(); b.closeShop(); out.afterShop = at();
    // home, then Play: City 20 → the School
    b.setProgress({ worlds: { park: won(20), field: won(20), city: won(19) } });
    out.cityWin = win("city", 20); b.toHome(); out.home = at(); b.openMap(); out.play = at();
    // School 20 opens no main world (the bonus worlds have their own note); the ending comes first
    b.setProgress({ worlds: { park: won(20), field: won(20), city: won(20), school: won(19) } });
    out.schoolWin = win("school", 20); out.bonus = b.lastReward.bonusUnlocked; b.toMap(); out.ending = at();
    b.sceneSkip(); out.afterEnding = at();
    // an old save that already played the Field: finishing the Park opens nothing new
    b.setProgress({ worlds: { park: won(19), field: won(3) } });
    out.played = win("park", 20);
    b.mode = "home";
    return out;
  }, WON);
  expect(r.parkWin).toBe("field");
  expect(r.onWin, "the win screen first; the map switches later").toEqual({ mode: "win", world: "park", banner: null, pending: "field" });
  expect(r.map).toEqual({ mode: "map", world: "field", banner: "The Football field is open!", pending: null });
  expect(r.chapter, "the Field's story chapter opens").toBe(true);
  expect([r.again, r.mapAgain.banner, r.mapAgain.world], "a second win of Park 20 opens nothing").toEqual([null, null, "park"]);
  expect(r.fieldWin).toBe("city");
  expect(r.shop.mode).toBe("shop");
  expect(r.afterShop).toEqual({ mode: "map", world: "city", banner: "The City is open!", pending: null });
  expect(r.cityWin).toBe("school");
  expect(r.home).toEqual({ mode: "home", world: "city", banner: null, pending: "school" });
  expect(r.play).toEqual({ mode: "map", world: "school", banner: "The School is open!", pending: null });
  expect([r.schoolWin, r.bonus, r.ending.mode], "School 20: the bonus note, the ending scene first").toEqual([null, true, "scene"]);
  expect(r.afterEnding.mode).toBe("map");
  expect(r.played).toBe(null);
});

// ---------- AC 4: locked world tabs on the map ----------
test("locked world tabs: padlock and dimmed, a tap says which world to finish, arrows skip them; the banner is drawn", async ({ page }) => {
  await page.evaluate(() => { const b = window.__bb; b.mode = "map"; });
  await frames(page);
  const d = await page.evaluate(() => {
    const b = window.__bb;
    return { tabs: b.mapInfo.tabs.map(t => [t.world, t.locked]), texts: b.WORLDS.map(w => (b.buttonRects.find(q => q.id === "maptab:" + w) || {}).text) };
  });
  expect(d.tabs).toEqual([["park", false], ["field", true], ["city", true], ["school", true], ["beach", true], ["winter", true]]);
  expect(d.texts.slice(1), "a padlock on every locked tab").toEqual(Array(5).fill("🔒"));
  const tap = async w => page.evaluate(k => { const b = window.__bb; b.tapButton("maptab:" + k); return [b.world, b.toast && b.toast.text]; }, w);
  expect(await tap("field")).toEqual(["park", "Finish the Park to open the Football field!"]);
  expect(await tap("city")).toEqual(["park", "Finish the Football field to open the City!"]);
  expect(await tap("school")).toEqual(["park", "Finish the City to open the School!"]);
  expect(await tap("winter")).toEqual(["park", "Win all levels of the main worlds to open"]);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.hudRects.some(h => h.id === "toast"))).toBe(true);
  // arrows: with only the Park open they stay; with the Park finished → the Field, → again wraps to the Park (City … Winter locked)
  const keys = async list => { const out = []; for (const k of list) { await page.keyboard.press(k); out.push(await page.evaluate(() => window.__bb.world)); } return out; };
  expect(await keys(["ArrowRight", "ArrowLeft"])).toEqual(["park", "park"]);
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.progress.worlds.park, { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) }); });
  expect(await keys(["ArrowRight", "ArrowRight", "ArrowLeft"])).toEqual(["field", "park", "field"]);
  // the banner after the win that opened the City: drawn in the title row of the map page, the title hidden while it shows
  await page.evaluate(() => {
    const b = window.__bb;
    Object.assign(b.progress.worlds.field, { unlocked: 20, won: Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, true])) });
    b.world = "field"; b.level = 20; b.startGame(1); Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }); b.giveReward(true); b.mode = "win";
    b.toMap();
  });
  await frames(page);
  const ban = await page.evaluate(() => { const b = window.__bb, h = b.hudRects; return { world: b.world, banner: h.find(q => q.id === "world-opened"), title: h.some(q => q.id === "map:title"), ui: b.uiSize }; });
  expect(ban.world).toBe("city");
  expect(ban.banner && ban.banner.text).toBe("🎉 The City is open!");
  expect(ban.title, "the banner takes the title's place").toBe(false);
  expect(ban.banner.x >= 0 && ban.banner.x + ban.banner.w <= ban.ui.w, "inside the screen").toBe(true);
  // it goes away by itself (CFG.MENU_LOOK.map.openedTime), then the title is back
  // (advanced through the logic: CFG.MENU_LOOK.map.openedTime in game time would be ~70 software frames on CI)
  expect(await page.evaluate(() => { const b = window.__bb; const t = b.worldBanner.t; b.mapTick(t - 0.05); const on = !!b.worldBanner; b.mapTick(0.1); return [on, b.worldBanner]; })).toEqual([true, null]);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.hudRects.some(q => q.id === "map:title"))).toBe(true);
  // switching to another world, going home or starting a level takes the banner (and a pending switch) away
  const gone = await page.evaluate(() => {
    const b = window.__bb, all = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])), out = [];
    const open = () => { Object.assign(b.progress.worlds.city, { unlocked: 20, won: { ...all } }); delete b.progress.worlds.city.won[20];
      b.world = "city"; b.level = 20; b.startGame(1); Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }); b.giveReward(true); b.mode = "win"; };
    open(); b.toMap(); out.push(b.world, !!b.worldBanner); b.selectWorld("park"); out.push(!!b.worldBanner);
    b.setProgress({ worlds: { park: { unlocked: 20, won: { ...all } }, field: { unlocked: 20, won: { ...all } } } });
    open(); b.toMap(); b.toHome(); out.push(!!b.worldBanner);
    b.setProgress({ worlds: { park: { unlocked: 20, won: { ...all } }, field: { unlocked: 20, won: { ...all } } } });
    open(); out.push(b.openedWorld); b.startGame(1); out.push(b.openedWorld);
    return out;
  });
  expect(gone).toEqual(["school", true, false, false, "school", null]);
  await page.evaluate(() => { window.__bb.mode = "home"; });
});

// ---------- AC 6: the Progress page and the Story screen follow worldOpen ----------
test("the Progress page shows the padlock on locked main worlds and the finish line of the next one; the Story says the same", async ({ page }) => {
  await page.evaluate(() => {
    const b = window.__bb; b.setProgress({ worlds: { park: { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) } } });
    b.mode = "shop"; b.shopTab = "progress";
  });
  await frames(page);
  const d = await page.evaluate(() => { const b = window.__bb; return { info: b.progressInfo, hud: b.hudRects, I: b.I18N.en }; });
  expect(d.info.worlds.map(q => [q.world, q.open, q.reason])).toEqual([["park", true, "start"], ["field", true, "previous"], ["city", false, "locked"],
    ["school", false, "locked"], ["beach", false, "locked"], ["winter", false, "locked"]]);
  const ids = d.hud.map(h => h.id);
  expect(ids.filter(id => id.startsWith("progress:lock:"))).toEqual(["progress:lock:city", "progress:lock:school", "progress:lock:beach", "progress:lock:winter"]);
  const text = id => (d.hud.find(h => h.id === id) || {}).text;
  expect(text("progress:lockText"), "under the rows: the next main world to open").toBe("Finish the Football field to open the City!");
  expect(text("progress:lockNote"), "the bonus note stays").toBe(d.I.lockedBonus);
  // the Story: a locked main world's chapter is locked and says which world to finish
  await page.evaluate(() => { window.__bb.openStory("city", "home"); });
  await frames(page);
  const s = await page.evaluate(() => ({ info: window.__bb.storyInfo, text: (window.__bb.hudRects.find(h => h.id === "story:locked") || {}).text }));
  expect([s.info.locked, s.text]).toEqual([true, "Finish the Football field to open the City!"]);
  await page.evaluate(() => { const b = window.__bb; b.setProgress(null); b.mode = "home"; });
});

// ---------- texts: four languages, articles and gender per world ----------
test("lock and opened texts in every language", { tag: "@fast" }, async ({ simPage: page }) => {
  const t = await page.evaluate(() => Object.fromEntries(window.__bb.LANGS.map(l => {
    const I = window.__bb.I18N[l];
    return [l, [I.lockedWorld("park", "field"), I.lockedWorld("field", "city"), I.lockedWorld("city", "school"),
      I.worldOpened("field"), I.worldOpened("city"), I.worldOpened("school")]];
  })));
  expect(t).toEqual({
    en: ["Finish the Park to open the Football field!", "Finish the Football field to open the City!", "Finish the City to open the School!",
      "The Football field is open!", "The City is open!", "The School is open!"],
    es: ["¡Terminá el Parque para abrir la Cancha!", "¡Terminá la Cancha para abrir la Ciudad!", "¡Terminá la Ciudad para abrir la Escuela!",
      "¡La Cancha está abierta!", "¡La Ciudad está abierta!", "¡La Escuela está abierta!"],
    pt: ["Termine o Parque para abrir o Campo de futebol!", "Termine o Campo de futebol para abrir a Cidade!", "Termine a Cidade para abrir a Escola!",
      "O Campo de futebol está aberto!", "A Cidade está aberta!", "A Escola está aberta!"],
    ru: ["Пройди Парк, чтобы открыть Футбольное поле!", "Пройди Футбольное поле, чтобы открыть Город!", "Пройди Город, чтобы открыть Школу!",
      "Футбольное поле открыто!", "Город открыт!", "Школа открыта!"]
  });
});

// ---------- phone 667×375: the toasts, the banner and the Progress lines fit (fonts ×1.3 = CI's wider fonts) ----------
test("phone 667: lock toasts, the opened banner and the Progress lines fit in every language at fonts ×1.3", async ({ phonePage: page }) => {
  test.setTimeout(180_000);
  const fails = [];
  const check = (at, d, ids) => {
    const s = d.ui.scale, inside = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= d.ui.w + 0.01 && r.y + r.h <= d.ui.h + 0.01;
    for (const id of ids) {
      const h = d.hud.find(q => q.id === id);
      if (!h) { fails.push(`${at}: no ${id}`); continue; }
      if (h.text !== d.want[id]) fails.push(`${at}: ${id} "${h.text}" ≠ "${d.want[id]}"`);
      if (!inside(h)) fails.push(`${at}: ${id} outside`);
      if (h.textW !== undefined && h.textW > h.w + 0.5) fails.push(`${at}: ${id} text ${h.textW} wider than ${h.w}`);
      for (const b of d.buttons) if (h.x < b.x + b.w - 0.01 && h.x + h.w > b.x + 0.01 && h.y < b.y + b.h - 0.01 && h.y + h.h > b.y + 0.01) fails.push(`${at}: ${id} on button ${b.id || b.text}`);
    }
    for (const [cat, px] of Object.entries(d.texts)) if (px * s < textFloor(d.min, cat) - 0.01) fails.push(`${at}: smallest ${cat} text ${px * s} CSS px`);
  };
  const grab = want => page.evaluate(w => { const b = window.__bb; return { hud: b.hudRects, buttons: b.buttonRects, ui: b.uiSize, texts: b.textSizes, min: b.textFloors, want: w }; }, want);
  for (const lang of LANGS) {
    // the toasts of the three locked main worlds (fresh progress) and the banner of each opened world
    for (const w of ["field", "city", "school"]) {
      const want = await page.evaluate(([l, k]) => { const b = window.__bb; b.setProgress(null); b.setLang(l); b.CFG.TEXT_TEST_SCALE = 1.3; b.resetMenus(); b.world = "park"; b.mode = "map"; return { toast: b.I18N[l].lockedWorld(b.MAIN_WORLDS[b.MAIN_WORLDS.indexOf(k) - 1], k) }; }, [lang, w]);
      await frames(page);
      await page.evaluate(k => window.__bb.tapButton("maptab:" + k), w);
      await frames(page);
      check(`${lang} toast ${w}`, await grab(want), ["toast"]);
      const want2 = await page.evaluate(k => {
        const b = window.__bb, i = b.MAIN_WORLDS.indexOf(k), all = Object.fromEntries(Array.from({ length: 20 }, (_, j) => [j + 1, true]));
        b.resetMenus(); b.setProgress(null);
        for (const p of b.MAIN_WORLDS.slice(0, i)) Object.assign(b.progress.worlds[p], { unlocked: 20, won: { ...all } });
        delete b.progress.worlds[b.MAIN_WORLDS[i - 1]].won[20];
        b.world = b.MAIN_WORLDS[i - 1]; b.level = 20; b.startGame(1); Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }); b.giveReward(true); b.mode = "win"; b.toMap();
        return { "world-opened": "🎉 " + b.I18N[b.lang].worldOpened(k) };
      }, w);
      await frames(page);
      check(`${lang} banner ${w}`, await grab(want2), ["world-opened"]);
    }
    // the Progress page with three locked main worlds
    const want = await page.evaluate(l => {
      const b = window.__bb; b.resetMenus(); b.setProgress(null); b.mode = "shop"; b.shopTab = "progress";
      return { "progress:lockText": b.I18N[l].lockedWorld("park", "field"), "progress:lockNote": b.I18N[l].lockedBonus };
    }, lang);
    await frames(page);
    const d = await grab(want);
    check(`${lang} progress`, d, Object.keys(want));
    // the two notes under the rows: below the last row, one under the other, not overlapping
    const [t, n, ic] = ["progress:lockText", "progress:lockNote", "progress:icon:winter"].map(id => d.hud.find(q => q.id === id));
    if (t && n && ic && !(t.y >= ic.y + ic.h - 0.5 && n.y >= t.y + t.h - 0.5)) fails.push(`${lang} progress: notes ${JSON.stringify([t, n, ic])}`);
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setProgress(null); b.setLang("en"); b.resetMenus(); b.mode = "home"; });
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
});
