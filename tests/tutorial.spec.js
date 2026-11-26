// SPEC-029: Dad starts with 5 hearts (one fewer on every ordinary level) and the tutorial — picture pages and two practice
// games after the intro comic on the first launch, with Skip, replayable from the Story's "How to play" page.
// Logic-only tests use a shared sim page; the first-launch tests open their own rendered page (the intro opens in frame()).
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const fs = require("fs");
const path = require("path");
const { LANGS, openGame, frames, step, sharedPage, resetGame, softly, putOldSave } = require("./helpers");

// a shared sim page (logic) and a shared rendered page (desktop, then phone); order: sim and fresh-page tests first, the rendered
// shared-page tests last (a rendered page left open slows every other test)
const sharedSim = sharedPage(), sharedDesk = sharedPage();
const fixture = (shared, key, opts) => async ({ browser }, use) => {
  const s = await shared.get(browser, key, { viewport: { width: 960, height: 640 } }, p => openGame(p, opts));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
// the phone page shares sharedDesk (one rendered page at a time): its tests come after the desktop ones
const fixtureOn = (shared, key, ctx, opts) => async ({ browser }, use) => {
  const s = await shared.get(browser, key, ctx, p => openGame(p, opts));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
const test = base.test.extend({ simPage: fixture(sharedSim, "sim", { sim: true }), desk: fixture(sharedDesk, "desk", {}),
  phone: fixtureOn(sharedDesk, "phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, { query: "?phone=1" }) });
test.afterAll(async () => { await sharedSim.close(); await sharedDesk.close(); });

// what the game is showing: the screen, the scene ({ id, page, pages }), the tutorial ({ step, page, game, back }), progress.seen
const state = page => page.evaluate(() => {
  const b = window.__bb;
  return { mode: b.mode, scene: b.scene, tutorial: b.tutorial, seen: { ...b.progress.seen }, players: b.littles.filter(l => l.kind === "player").length, maxHp: b.big.maxHp };
});
// the practice game is won the normal way: the player hugs Dad's last heart from behind, the hug and his walk home play out
async function winPractice(page) {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { hp: 1, state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, dir: 0 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: big.x - 34, y: big.y });
  });
  await step(page, 6);
}
const SHEETS = ["a", "b", "c"];

// ---------- AC 1: Dad starts with 5 hearts — one fewer on every ordinary level, the cap of 12 stays, bosses keep their extras ----------
test("Dad starts with 5 hearts: one fewer on every level", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, d = {};
    for (const w of b.WORLDS) d[w] = Array.from({ length: 20 }, (_, i) => b.difficulty(w, i + 1).hearts);
    b.world = "park"; b.level = 1; b.startGame(1);
    const park1 = b.big.maxHp;
    b.world = "park"; b.level = 1; b.resetWorld(1); b.mode = "home";
    return { hp: C.BIG_HP, max: C.BIG_HP_MAX, per: C.HP_LEVELS_PER_HEART, perWorld: C.HP_PER_WORLD, diff: C.WORLD_DIFFICULTY, d, park1,
      worlds: b.WORLDS, bosses: Object.fromEntries(b.WORLDS.map(w => [w, b.bossFor(w, 20)])) };
  });
  expect([r.hp, r.max, r.per, r.perWorld]).toEqual([5, 12, 4, 1]);
  // the four pinned levels (spec): Park 1, Park 20 (boss + 2), Field 1, School 20 (the grumpiest dad + 3, his base at the cap)
  expect([r.d.park[0], r.d.park[19], r.d.field[0], r.d.school[19]]).toEqual([5, 11, 6, 15]);
  expect(r.park1, "the game starts Park 1 with 5").toBe(5);
  // every ordinary level: the old count (6 + one per 4 levels + the world's difficulty) minus one, never above 12
  const soft = softly();
  for (const w of r.worlds) for (let n = 1; n <= 20; n++) {
    const old = 6 + Math.floor((n - 1) / 4) + r.diff[w], extra = r.bosses[w] && n === 20 ? (w === "school" ? 3 : 2) : 0;
    soft(r.d[w][n - 1], `${w} ${n}`).toBe(Math.min(12, old - 1) + extra);
  }
  soft.done();
});

// ---------- AC 2: the first launch — intro comic → tutorial → the Park map with level 1; seen.tutorial when it ends ----------
test("first launch: the intro comic, the tutorial, then the Park map with level 1", async ({ page }) => {
  const errors = await openGame(page, { intro: true, tutorial: true });   // the helpers skip both; this test is the first launch
  await page.waitForFunction(() => window.__bb.artInfo.done);
  await frames(page);
  let s = await state(page);
  expect([s.mode, s.scene && s.scene.id, s.tutorial]).toEqual(["scene", "intro", null]);
  await page.keyboard.press("Escape");                   // the intro skipped: the tutorial still comes — first the How to play card (SPEC-033 AC 1)
  await frames(page);
  s = await state(page);
  expect(s.scene).toEqual({ id: "tutorial_intro", page: 0, pages: 1 });
  expect(s.tutorial).toEqual({ step: "intro", page: 0, game: 0, hint: 0, back: "map" });
  expect([s.mode, s.seen.intro, s.seen.tutorial]).toEqual(["scene", true, false]);
  const card = await page.evaluate(() => { const b = window.__bb; return { btn: b.buttonRects.map(q => [q.id, q.text]).sort(), art: b.sceneInfo.art, name: b.sceneInfo.artName, hud: b.hudRects.filter(h => h.id.startsWith("scene:")).map(h => [h.id, h.text]), I: b.I18N.en }; });
  expect(card.btn, "Let's learn! and Skip").toEqual([["scene:next", "Let's learn! ▶"], ["scene:skip", "Skip"]]);
  expect([card.art, card.name], "the howto_card picture").toEqual(["image", "howto_card"]);
  expect(card.hud, "the title and the line").toEqual([["scene:title", card.I.howToPlay], ["scene:caption", card.I.tut.introLine]]);
  await page.keyboard.press("Enter");                    // Let's learn! → the tutorial pictures
  await frames(page);
  s = await state(page);
  expect(s.scene).toEqual({ id: "tutorial_a", page: 0, pages: 4 });
  expect(s.tutorial).toEqual({ step: "a", page: 0, game: 0, hint: 0, back: "map" });
  const cap = await page.evaluate(() => [window.__bb.sceneInfo.caption, window.__bb.I18N.en.tut.a(window.__bb.I18N.en.tut.tiptoeKey)[0]]);
  expect(cap[0], "a caption under the panel").toBe(cap[1]);
  // Next through page A (four panels) → practice game 1: one player, Dad with 3 hearts
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Enter"); await frames(page); }
  s = await state(page);
  expect([s.mode, s.tutorial.step, s.tutorial.game, s.players, s.maxHp]).toEqual(["play", "game1", 1, 1, 3]);
  await winPractice(page);
  await frames(page);
  s = await state(page);
  expect([s.mode, s.scene && s.scene.id, s.tutorial.step]).toEqual(["scene", "tutorial_b", "b"]);
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Enter"); await frames(page); }   // pages B and C
  s = await state(page);
  expect([s.mode, s.tutorial.step, s.tutorial.game, s.players, s.maxHp]).toEqual(["play", "game2", 2, 1, 5]);
  await winPractice(page);
  await frames(page);
  s = await state(page);
  expect([s.mode, s.scene && s.scene.id, s.tutorial.step, s.seen.tutorial]).toEqual(["scene", "tutorial_ready", "ready", false]);
  expect(await page.evaluate(() => window.__bb.sceneInfo.caption)).toBe("You're ready! Let's make the dads kind again!");
  await page.keyboard.press("Enter");
  await frames(page);
  s = await state(page);
  expect([s.mode, s.tutorial, s.seen.tutorial]).toEqual(["map", null, true]);
  expect(await page.evaluate(() => { const m = window.__bb.mapInfo; return [m.world, m.sel, m.stops.find(q => q.sel).n]; }), "the Park map, level 1 highlighted").toEqual(["park", 1, 1]);
  // saved: after a reload the game opens on the home screen, no intro and no tutorial
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true && window.__bb.artInfo.done);
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.tutorial, window.__bb.progress.seen.tutorial])).toEqual(["home", null, true]);
  expect(errors).toEqual([]);
});

// ---------- AC 6: a missing tutorial picture — each panel is built from existing art on paper (a figure and the item icons) ----------
test("tutorial pages without their pictures: every panel draws a figure and its icons, never the comic-soon placeholder", async ({ page }) => {
  await page.route(/\/assets\/tutorial_[abc]\.webp$/, route => route.fulfill({ status: 404, body: "" }));
  const errors = await openGame(page, { query: "?phone=1" });
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const soft = softly();
  for (const sh of ["a", "b", "c"]) for (let pg = 0; pg < 4; pg++) {
    await page.evaluate(([s, p]) => { const b = window.__bb; b.resetMenus(); b.mode = "home"; b.openTutorial("map", s); for (let i = 0; i < p; i++) b.sceneNext(); }, [sh, pg]);
    await frames(page);
    const d = await page.evaluate(() => ({ info: window.__bb.sceneInfo, soon: window.__bb.hudRects.some(h => h.id === "story:soon"), cap: window.__bb.hudRects.find(h => h.id === "scene:caption") }));
    const at = `${sh}${pg + 1}`;
    soft(d.info && d.info.art, `${at}: built from other art`).toBe("fallback");
    soft(d.info && d.info.pieces.length >= 2, `${at}: a figure and an icon (${d.info && d.info.pieces})`).toBe(true);
    soft(d.info && d.info.pieces.some(q => /^(item_|icon_|fx_|ui_|menu_)/.test(q)), `${at}: an item or effect icon`).toBe(true);
    soft(d.info && d.info.pieces.some(q => /^story_|^figure$/.test(q)), `${at}: a kid or Dad figure`).toBe(true);
    soft(d.soon, `${at}: no comic-soon placeholder`).toBe(false);
    soft(!!(d.cap && d.cap.text), `${at}: the caption`).toBe(true);
  }
  soft.done();
  expect(errors.filter(e => !e.includes("Failed to load resource")), "only the 404s of the missing pictures").toEqual([]);
});

// ---------- SPEC-033 AC 2: the How to play card — the picture howto_card, or the A1 panel of tutorial_a when it is missing ----------
test("How to play card: howto_card when it exists, the A1 panel of tutorial_a on paper when not", async ({ page }) => {
  await page.route(/\/assets\/howto_card\.webp$/, route => route.fulfill({ status: 404, body: "" }));
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done);
  await page.evaluate(() => { const b = window.__bb; b.progress.seen.tutorial = false; b.openFirstTutorial(); });
  await frames(page);
  const d = await page.evaluate(() => ({ info: window.__bb.sceneInfo, panel: window.__bb.CFG.MENU_LOOK.scene.panels[0] }));
  expect([d.info.art, d.info.artName, d.info.crop], "the kid hugging Dad from behind, A1").toEqual(["image", "tutorial_a", d.panel]);
  await page.evaluate(() => window.__bb.tutorialSkip());
  expect(errors.filter(e => !e.includes("Failed to load resource")), "only the 404 of the missing picture").toEqual([]);
});

// ---------- SPEC-033 AC 3: the card fits 568×320, 667×375 and 1280×720 in every language (and with wider fonts, like CI) ----------
// Runs in the page: title and line inside the screen, nothing cut, no overlap with the picture and the buttons → problem list
function cardFitCases([langs, scales]) {
  const b = window.__bb, ui = b.uiSize, out = [];
  const ov = (a, c) => a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5;
  const inside = a => a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= ui.w + 0.5 && a.y + a.h <= ui.h + 0.5;
  for (const lang of langs) for (const sc of scales) {
    const at = `${lang} ×${sc}`;
    b.setLang(lang); b.CFG.TEXT_TEST_SCALE = sc; b.resetMenus(); b.openScene("tutorial_intro", null, { mark: false, skip: () => {} }); b.drawNow();
    const I = b.I18N[lang], info = b.sceneInfo, hud = b.hudRects, title = hud.find(h => h.id === "scene:title"), line = hud.find(h => h.id === "scene:caption");
    if (!title || !line || !info || !info.picBox) { out.push(`${at}: nothing drawn`); continue; }
    if (title.text !== I.howToPlay || line.text !== I.tut.introLine) out.push(`${at}: text cut "${title.text}" / "${line.text}"`);
    if (b.textOverflows.length) out.push(`${at}: overflows ${JSON.stringify(b.textOverflows)}`);
    if (info.fit !== true) out.push(`${at}: does not fit`);
    if (!(title.size > line.size)) out.push(`${at}: the title is not bigger than the line`);
    const btn = Object.fromEntries(b.buttonRects.map(q => [q.id, q]));
    if (!btn["scene:next"] || btn["scene:next"].text !== I.tut.introGo + " ▶" || !btn["scene:skip"]) out.push(`${at}: buttons ${Object.keys(btn)}`);
    const boxes = [["title", title], ["line", line], ["picture", info.picBox], ...Object.entries(btn)];
    for (const [n, r] of boxes) if (!inside(r)) out.push(`${at}: ${n} off the screen`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (ov(boxes[i][1], boxes[j][1])) out.push(`${at}: ${boxes[i][0]} over ${boxes[j][0]}`);
    if (!(info.picBox.h >= ui.h * 0.35)) out.push(`${at}: the picture is only ${Math.round(info.picBox.h)} of ${Math.round(ui.h)} high`);
  }
  b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); b.resetMenus();
  return out;
}
async function resizeTo(page, [w, h]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction(([vw, vh]) => window.innerWidth === vw && window.innerHeight === vh, [w, h]);
  await frames(page);
}
test("How to play card fits 568×320, 667×375 and 1280×720 in every language", async ({ browser }) => {
  test.slow();
  const fails = [], errors = [];
  for (const [sizes, phone] of [[[[568, 320], [667, 375]], true], [[[1280, 720]], false]]) {
    const ctx = await browser.newContext({ viewport: { width: sizes[0][0], height: sizes[0][1] }, hasTouch: phone, isMobile: phone });
    try {
      const page = await ctx.newPage();
      errors.push(...await openGame(page, phone ? { query: "?phone=1" } : {}));
      await page.waitForFunction(() => window.__bb.artInfo.done);
      for (const sz of sizes) {
        await resizeTo(page, sz);
        fails.push(...(await page.evaluate(cardFitCases, [LANGS, [1, 1.15]])).map(f => `${sz.join("×")} ${f}`));
      }
    } finally { await ctx.close(); }
  }
  expect(fails, fails.slice(0, 20).join("\n")).toEqual([]);
  expect(errors).toEqual([]);
});

// ---------- AC 2: an old save that has already seen the intro — the tutorial does not open by itself ----------
test("an old save that has seen the intro does not open the tutorial by itself", async ({ page }) => {
  const errors = await openGame(page, { intro: true, tutorial: true });
  await putOldSave(page, { "bebebe-progress": { coins: 12, seen: { intro: true } } });   // SPEC-025: an old device's save
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true && window.__bb.artInfo.done);
  await frames(page);
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene, window.__bb.tutorial, window.__bb.progress.seen.tutorial])).toEqual(["home", null, null, false]);
  // it is offered on the Story's "How to play" page
  await page.evaluate(() => window.__bb.openStory("began", "home"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("story:rules"));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.buttonRects.map(q => q.id))).toContain("story:practice");
  expect(errors).toEqual([]);
});

// ---------- AC 2: the save shape — seen.tutorial merges with the defaults; who gets the tutorial by itself ----------
test("progress.seen.tutorial: old saves load without it, only true counts", { tag: "@fast" }, async ({ simPage: page }) => {
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saves", "pre-spec-029.json"), "utf8")).keys["bebebe-progress"];
  const r = await page.evaluate(save => {
    const b = window.__bb, seen = s => b.loadProgress(s).seen;
    return { old: [seen(save).intro, seen(save).tutorial], none: seen(null).tutorial, yes: seen({ seen: { tutorial: true } }).tutorial,
      junk: [seen({ seen: { tutorial: "yes" } }).tutorial, seen({ seen: "oops" }).tutorial],
      // the tutorial opens by itself only on a real first launch: the intro not seen yet and no level won anywhere
      first: [b.firstTutorial(b.loadProgress(null)), b.firstTutorial(b.loadProgress({ seen: { intro: true } })), b.firstTutorial(b.loadProgress(save)),
        b.firstTutorial(b.loadProgress({ ...save, seen: {} })), b.firstTutorial(b.loadProgress({ seen: { tutorial: true } }))],
      steps: b.TUTORIAL_STEPS, cfg: b.CFG.TUTORIAL };
  }, old);
  expect(r.old, "pre-SPEC-029 save: intro seen, tutorial not").toEqual([true, false]);
  expect([r.none, r.yes, ...r.junk]).toEqual([false, true, false, false]);
  expect(r.first, "fresh, seen intro, old save, old save without seen (plays already), tutorial seen").toEqual([true, false, false, false, false]);
  expect(r.steps).toEqual(["a", "game1", "b", "c", "game2", "ready"]);
  expect(r.cfg).toMatchObject({ hearts1: 3, hearts2: 5, speedMult: 0.6, pushCooldownMult: 2, itemEvery: 3, itemMax: 6, bananaShare: 0.4, kisses: 5, kits: 1, bothDownStand: 3, hintTimeout: 12 });
});

// ---------- AC 5, 7: the pages — four panels per sheet, a caption each (A4 follows the device), the last page ----------
test("tutorial pages: four panels per sheet with captions in every language", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const l of b.LANGS) {
      b.setLang(l); out[l] = {};
      for (const id of ["tutorial_a", "tutorial_b", "tutorial_c", "tutorial_ready"]) {
        b.openScene(id);
        out[l][id] = { pages: b.scene.pages, texts: b.scenePages(id).map(q => q.text) };
      }
    }
    b.setLang("en"); b.sceneSkip(); b.mode = "home";
    return { out, I: { a4touch: b.I18N.en.tut.a(b.I18N.en.tut.tiptoeTouch)[3] } };
  });
  const soft = softly();
  for (const [l, o] of Object.entries(r.out)) {
    for (const sh of SHEETS) {
      soft(o["tutorial_" + sh].pages, `${l} ${sh}: 4 panels`).toBe(4);
      for (const t of o["tutorial_" + sh].texts) soft(typeof t === "string" && t.length > 10, `${l} ${sh}: caption "${t}"`).toBe(true);
    }
    soft(o.tutorial_ready.pages, `${l} ready: one page`).toBe(1);
  }
  soft(r.out.en.tutorial_a.texts[0], "A1").toBe("Sneak up behind Dad and hug him! Every hug takes away one angry heart.");
  soft(r.out.en.tutorial_a.texts[3], "A4 on the keyboard").toBe("Dad hears running behind him. Close to him, tiptoe! (hold Shift)");
  soft(r.I.a4touch, "A4 on the phone").toBe("Dad hears running behind him. Close to him, tiptoe! (tap 👣)");   // SPEC-032 AC 1: the 👣 button
  soft(r.out.en.tutorial_c.texts[3], "C4").toBe("Win levels, get coins, and buy all this in Character!");
  soft.done();
});

// ---------- SPEC-029 step 3: practice game 1 — rescue and hug (AC 8–12, 17) ----------
// in-page: start practice game 1 (from the menu, optionally with two players set), seeded (SPEC-011 AC 8d: before the
// resetWorld too; the practice game itself still starts from seed 29)
const game1 = (page, players = 1) => page.evaluate(n => {
  const b = window.__bb; b.seedRandom(29); b.resetWorld(n); b.mode = "home"; b.seedRandom(29); b.openTutorial("map", "game1");
}, players);
// in-page: step until cond() or the time runs out (sec of game time); → seconds used
const stepUntil = (page, cond, max) => page.evaluate(([c, m]) => {
  const b = window.__bb, f = new Function("b", "return " + c);
  let t = 0;
  for (; t < m && !f(b); t += 1 / 60) b.update(1 / 60);
  return t;
}, [cond, max]);

test("practice game 1: one player and one bot, a slow Dad with 3 hearts on the small fixed map", { tag: "@fast" }, async ({ simPage: page }) => {
  const before = await page.evaluate(() => { const b = window.__bb; return { park1: b.difficulty("park", 1), coins: b.progress.coins, ledger: b.ledger().length }; });
  await game1(page, 2);                                  // two players set in the menu: the practice still has one
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, map = b.tutorialMapRect, cells = b.grid.COLS * b.grid.ROWS;
    const out = { kinds: b.littles.map(l => l.kind), maxHp: b.big.maxHp, hp: b.big.hp, boss: b.big.boss, speeds: b.bigSpeeds(), mult: C.TUTORIAL.speedMult,
      map, area: map.w * map.h / cells, world: b.worldState(), level: b.levelInfo, label: b.timerText(), safe: b.safeZone, danger: b.dangerZone, cell: b.grid.CELL };
    // every cell the kids can reach is inside the meadow
    out.outside = 0; out.reach = 0;
    const st = JSON.parse(out.world).reachable;
    for (let i = 0; i < st.length; i++) if (st[i] === "1") { out.reach++; const x = i % b.grid.COLS, y = Math.floor(i / b.grid.COLS); if (x < map.x || y < map.y || x >= map.x + map.w || y >= map.y + map.h) out.outside++; }
    return out;
  });
  expect(r.kinds, "AC 8: one player, one bot").toEqual(["player", "bot"]);
  expect([r.maxHp, r.hp, r.boss], "AC 9: 3 hearts, no boss").toEqual([3, 3, null]);
  for (const k of ["chase", "search", "patrol"]) expect(r.speeds[k], `AC 9: ${k} = 0.6 × Park 1`).toBeCloseTo(before.park1[k] * r.mult, 6);
  expect(r.area, "about half the Park 1 area").toBeGreaterThan(0.45);
  expect(r.area).toBeLessThan(0.55);
  expect(r.outside, "the kids reach only the meadow").toBe(0);
  const inMap = z => z.x >= r.map.x * r.cell && z.y >= r.map.y * r.cell && z.x + z.w <= (r.map.x + r.map.w) * r.cell && z.y + z.h <= (r.map.y + r.map.h) * r.cell;
  expect([inMap(r.safe), inMap(r.danger)], "the kids' house and Dad's house are on the meadow").toEqual([true, true]);
  expect(r.label, "the HUD says Practice, not a level").toBe("Practice");
  // the same map every time: a restart and a new start build it again exactly
  const again = await page.evaluate(() => { const b = window.__bb; b.tutorialSkip(); b.seedRandom(3); b.openTutorial("map", "game1"); return b.worldState(); });
  expect(again === r.world, "the practice map is fixed").toBe(true);
  // no stars, items, bananas or coins: 40 s of play
  const s = await page.evaluate(() => { const b = window.__bb; let items = 0, stars = 0; for (let i = 0; i < 40 * 60; i++) { b.update(1 / 60); items += b.items.length; stars += b.stars.length; } return { items, stars, coins: b.progress.coins, ledger: b.ledger().length }; });
  expect(s).toEqual({ items: 0, stars: 0, coins: before.coins, ledger: before.ledger });
});

test("practice game 1 script: the bot is pushed at the start and waits, the player rescues, sneaks and hugs 3 times", async ({ simPage: page }) => {
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.progress.inv, { mittens: 3, kisses: 4, rescues: 2 }); b.progress.equip[0] = "mittens"; });
  const inv0 = await page.evaluate(() => JSON.stringify(window.__bb.progress.inv));
  await game1(page);
  expect(await page.evaluate(() => window.__bb.tutorial.hint), "no hint before the friend falls").toBe(0);
  // AC 10: the bot runs straight at Dad and is pushed (Dad turns to it)
  const t = await stepUntil(page, "b.littles[1].state === 'down'", 20);
  expect(t, "the bot is pushed within 20 s").toBeLessThan(20);
  const ev = await page.evaluate(() => window.__bb.events.filter(e => e.type === "push").map(e => [e.who, e.blocked]));
  expect(ev, "the first push is the bot's").toEqual([[1, false]]);
  expect(await page.evaluate(() => window.__bb.tutorial.hint), "hint 1: rescue the friend").toBe(1);
  // AC 10, 12: down without a timer — 60 s later still down (the player stays in the house)
  await page.evaluate(() => { for (let i = 0; i < 60 * 60; i++) window.__bb.update(1 / 60); });
  expect(await page.evaluate(() => [window.__bb.littles[1].state, window.__bb.events.some(e => e.type === "rest")])).toEqual(["down", false]);
  // the player stands next to the bot (Dad calm, far away): rescued
  await page.evaluate(() => {
    const b = window.__bb, bot = b.littles[1], p = b.littles[0];
    Object.assign(b.big, { state: "look", timer: 999, x: 560, y: 64, dir: 0, noPush: 0, pushCd: 0 });
    Object.assign(p, { x: bot.x + 20, y: bot.y, state: "ok", kx: 0, ky: 0 });
  });
  await stepUntil(page, "b.littles[1].state === 'ok'", 5);
  expect(await page.evaluate(() => [window.__bb.littles[1].state, window.__bb.events.filter(e => e.type === "rescued").map(e => e.by)])).toEqual(["ok", ["player"]]);
  expect(await page.evaluate(() => window.__bb.tutorial.hint), "hint 2: sneak behind Dad").toBe(2);
  // behind Dad within hug range → hint 3
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, p = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, x: 400, y: 250, dir: 0, lookSign: 0 });
    Object.assign(p, { x: 400 - 60, y: 250, state: "ok", kx: 0, ky: 0 });
  });
  await page.evaluate(() => window.__bb.update(1 / 60));
  expect(await page.evaluate(() => window.__bb.tutorial.hint), "hint 3: hug 3 times").toBe(3);
  // three hugs, one heart each (no mittens in the practice), then the kind moment and page B
  const hearts = [];
  for (let i = 0; i < 3; i++) {
    hearts.push(await page.evaluate(() => {
      const b = window.__bb, big = b.big, l = b.littles[0];
      Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, x: 400, y: 250, dir: 0, lookSign: 0 });
      Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 400 - 34, y: 250 });
      b.update(1 / 60);
      return b.big.hp;
    }));
    if (i < 2) await page.evaluate(() => { for (let k = 0; k < 150; k++) window.__bb.update(1 / 60); });
  }
  expect(hearts, "each hug takes one heart").toEqual([2, 1, 0]);
  await stepUntil(page, "b.mode !== 'play'", 8);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene && window.__bb.scene.id, window.__bb.tutorial.step])).toEqual(["scene", "tutorial_b", "b"]);
  expect(await page.evaluate(() => JSON.stringify(window.__bb.progress.inv)), "AC 17: mittens, kisses and kits untouched").toBe(inv0);
});

test("practice game 1 cannot be lost: the bot rescues the player, both down stand up at the kids' house after 3 s", async ({ simPage: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.progress.inv.kisses = 3; b.progress.inv.rescues = 2; });
  await game1(page);
  await stepUntil(page, "b.littles[1].state === 'down'", 20);
  // no kisses and no rescue kit in the practice (the real stock is not used)
  const k = await page.evaluate(() => { const b = window.__bb, p = b.littles[0]; p.state = "ok"; const kiss = b.throwKiss(0); p.state = "down"; const kit = b.useRescueKit(0); return [kiss, kit, b.progress.inv.kisses, b.progress.inv.rescues]; });
  expect(k).toEqual([false, false, 3, 2]);
  // both down (the player just fell, see above): after bothDownStand seconds both stand at the kids' house
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.littles[0], { x: 300, y: 300 }); Object.assign(b.big, { state: "look", timer: 999, x: 560, y: 64 }); });
  await page.evaluate(() => { for (let i = 0; i < Math.round(2.9 * 60); i++) window.__bb.update(1 / 60); });
  expect(await page.evaluate(() => window.__bb.littles.map(l => l.state)), "2.9 s: still down").toEqual(["down", "down"]);
  await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__bb.update(1 / 60); });
  const up = await page.evaluate(() => window.__bb.littles.map(l => [l.state, window.__bb.inSafe(l)]));
  expect(up, "3 s: both up in the kids' house").toEqual([["ok", true], ["ok", true]]);
  // the player falls alone: the bot comes and helps (normal bot rescue), however long it takes
  await page.evaluate(() => {
    const b = window.__bb;
    Object.assign(b.big, { state: "look", timer: 999, x: 560, y: 64, dir: 0, lookSign: 0, noPush: 999 });
    Object.assign(b.littles[0], { state: "down", downTimer: 0, x: 300, y: 300, rescue: 0, botWait: 0 });
  });
  const t = await stepUntil(page, "b.littles[0].state === 'ok'", 30);
  expect(t).toBeLessThan(30);
  expect(await page.evaluate(() => window.__bb.events.filter(e => e.type === "rescued").at(-1))).toMatchObject({ who: 0, by: "bot" });
});

test("practice game 1: the friend falls again → hint 1 again; the bot does not hug; the script ends after scriptMax", async ({ simPage: page }) => {
  await game1(page);
  await stepUntil(page, "b.littles[1].state === 'down'", 20);
  await page.evaluate(() => { const b = window.__bb; b.littles[1].state = "ok"; b.update(1 / 60); });
  expect(await page.evaluate(() => window.__bb.tutorial.hint), "rescued: 2").toBe(2);
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.littles[1], { state: "down" }); b.update(1 / 60); });
  expect(await page.evaluate(() => window.__bb.tutorial.hint), "fell again: back to 1").toBe(1);
  // after the script the bot plays as a bot (flee, lurk, rescue) but never attacks or hugs Dad
  const r = await page.evaluate(() => {
    const b = window.__bb, tasks = new Set(); b.littles[1].state = "ok";
    Object.assign(b.littles[0], { x: 80, y: 90 });                 // the player stays in the house
    for (let i = 0; i < 60 * 60; i++) { b.update(1 / 60); tasks.add(b.littles[1].task); }
    return { tasks: [...tasks], hugs: b.events.filter(e => e.type === "hug").length };
  });
  expect(r.tasks).not.toContain("attack");
  expect(r.tasks).not.toContain("wait");
  expect(r.hugs, "only the player hugs in practice game 1").toBe(0);
  // a bot that never reaches Dad: the script ends after scriptMax seconds and the hints start at 2
  await game1(page);
  const s = await page.evaluate(() => {
    const b = window.__bb, bot = b.littles[1], max = b.CFG.TUTORIAL.scriptMax;
    bot.kind = "player"; bot.controls = { up: [], down: [], left: [], right: [] };   // pinned in the house
    for (let i = 0; i < Math.round((max - 0.5) * 60); i++) b.update(1 / 60);
    const before = b.tutorial.hint;
    for (let i = 0; i < 60; i++) b.update(1 / 60);
    return { before, after: b.tutorial.hint, max };
  });
  expect([s.max, s.before, s.after]).toEqual([8, 0, 2]);
});

test("AC 17: a real Park 1 after practice game 1 has its own numbers", async ({ simPage: page }) => {
  const park = () => page.evaluate(() => {
    const b = window.__bb; b.seedRandom(5); b.world = "park"; b.level = 1; b.startGame(1); b.seedRandom(5);   // SPEC-011 AC 8d: seeded before the start too
    const out = { speeds: b.bigSpeeds(), hp: b.big.maxHp, kinds: b.littles.map(l => l.kind), world: b.worldState(), type: b.levelInfo.type, label: b.timerText() };
    for (let i = 0; i < 20 * 60; i++) b.update(1 / 60);
    out.items = b.events.filter(e => e.type === "item" || e.type === "slip").length + b.items.length;
    b.progress.inv.kisses = 1; b.littles[0].state = "ok"; b.littles[0].kissCd = 0;
    Object.assign(b.littles[0], { x: 300, y: 300 });
    out.kiss = b.throwKiss(0); out.kissesLeft = b.progress.inv.kisses;
    b.mode = "home";
    return out;
  });
  const a = await park();
  await game1(page, 2);
  await page.evaluate(() => { for (let i = 0; i < 10 * 60; i++) window.__bb.update(1 / 60); window.__bb.tutorialSkip(); });
  const z = await park();
  expect(z.speeds).toEqual(a.speeds);
  expect([z.hp, z.kinds.length, z.kinds.filter(k => k === "bot").length, z.type]).toEqual([5, 5, 4, "classic"]);
  expect(z.world === a.world, "the Park 1 map").toBe(true);
  expect(z.label).toMatch(/^Lv\. 1 /);
  expect(z.items, "items appear in Park 1").toBeGreaterThan(0);
  expect([z.kiss, z.kissesLeft], "the real kiss stock works again").toEqual([true, 0]);
});

// ---------- SPEC-029 step 4: practice game 2 — items, banana, kisses, rescue kit (AC 13–16, 17) ----------
const game2 = (page, seed = 31) => page.evaluate(s => { const b = window.__bb; b.seedRandom(s); b.resetWorld(1); b.mode = "home"; b.seedRandom(s); b.openTutorial("map", "game2"); }, seed);
// in-page: everybody still (the bot as a player without controls, the player in the house), Dad calm and standing
const PIN = `(() => { const b = window.__bb;
  b.littles.forEach(l => { if (l.kind === "bot") { l.kind = "player"; l.controls = { up: [], down: [], left: [], right: [] }; } });
  Object.assign(b.big, { state: "look", timer: 9999, lookSign: 0, noPush: 9999, x: 560, y: 64, dir: 0 }); })()`;

test("practice game 2: one player, one bot, Dad with 5 hearts, slow and weak (push cooldown × 2)", { tag: "@fast" }, async ({ simPage: page }) => {
  const park1 = await page.evaluate(() => window.__bb.difficulty("park", 1));
  await game2(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = { kinds: b.littles.map(l => l.kind), hp: b.big.maxHp, speeds: b.bigSpeeds(), map: b.worldState() };
    // a push: the cooldown after it is PUSH_RECOVER × pushCooldownMult
    const l = b.littles[0];
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, hugCd: 0, x: 400, y: 250, dir: 0 });
    Object.assign(l, { state: "ok", invuln: 0, dizzy: 0, x: 400 + 34, y: 250, fx: { boots: 0, cloak: 0, shield: 0 } });
    b.update(1 / 60);
    out.pushed = l.state; out.noPush = b.big.noPush; out.want = C.PUSH_RECOVER * C.TUTORIAL.pushCooldownMult;
    b.tutorialSkip(); b.openTutorial("map", "game1"); out.map1 = b.worldState(); b.tutorialSkip();
    return out;
  });
  expect(r.kinds).toEqual(["player", "bot"]);
  expect(r.hp).toBe(5);
  for (const k of ["chase", "search", "patrol"]) expect(r.speeds[k], k).toBeCloseTo(park1[k] * 0.6, 6);
  expect(r.pushed).toBe("down");
  expect(r.noPush, "push cooldown doubled").toBeCloseTo(r.want, 4);
  expect(r.map === r.map1, "the same map as practice game 1").toBe(true);
});

test("practice game 2: a new item every 3 s while fewer than 6, bananas 40 %, two bananas on the map most of the time", async ({ simPage: page }) => {
  await game2(page);
  await page.evaluate(PIN);
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG.TUTORIAL, counts = [];
    for (let i = 0; i < 30; i++) b.update(1 / 60);       // half a second off the spawn moments
    for (let s = 1; s <= 7; s++) { for (let i = 0; i < Math.round(C.itemEvery * 60); i++) b.update(1 / 60); counts.push(b.items.length); }
    // where they are: on the meadow, never behind the hedge
    const m = b.tutorialMapRect, cell = b.grid.CELL;
    const outside = b.items.filter(it => it.x > (m.x + m.w) * cell || it.y > (m.y + m.h) * cell).length;
    return { counts, outside, every: C.itemEvery, max: C.itemMax };
  });
  expect(r.counts, "one more every 3 s, then never more than 6").toEqual([1, 2, 3, 4, 5, 6, 6]);
  expect(r.outside).toBe(0);
  // the share of kinds over many spawns (seeded) while 2 bananas lie on the map: bananas ≈ 40 %, the others ≈ 20 % each;
  // with fewer than bananaMin (2) bananas on the map the next item is a banana
  const share = await page.evaluate(() => {
    const b = window.__bb, n = {}, two = [{ id: -1, kind: "banana", x: 900, y: 600, t: 0, life: 999 }, { id: -2, kind: "banana", x: 900, y: 500, t: 0, life: 999 }];
    let all = 0;
    for (let k = 0; k < 600; k++) { b.items.length = 0; b.items.push(...two); b.spawnItem(); const it = b.items[2]; if (it) { n[it.kind] = (n[it.kind] || 0) + 1; all++; } }
    const low = [];
    for (let k = 0; k < 20; k++) { b.items.length = 0; b.items.push(two[0]); b.spawnItem(); low.push(b.items[1] && b.items[1].kind); }
    b.items.length = 0;
    return { ...Object.fromEntries(Object.entries(n).map(([kk, v]) => [kk, v / all])), low: [...new Set(low)], min: b.CFG.TUTORIAL.bananaMin };
  });
  expect([share.low, share.min], "one banana on the map: the next is a banana").toEqual([["banana"], 2]);
  expect(share.banana).toBeGreaterThan(0.34); expect(share.banana).toBeLessThan(0.46);
  for (const k of ["boots", "cloak", "shield"]) { expect(share[k], k).toBeGreaterThan(0.15); expect(share[k], k).toBeLessThan(0.25); }
  // a simulated minute of real play (normal bot, Dad patrolling, the player idle): at least 2 bananas on the map ≥ 60 % of the time
  await game2(page, 7);
  const t2 = await page.evaluate(() => {
    const b = window.__bb; let two = 0, n = 0;
    for (let i = 0; i < 60 * 60 && b.mode === "play"; i++) { b.update(1 / 60); if (i >= 9 * 60) { n++; if (b.items.filter(it => it.kind === "banana").length >= 2) two++; } }
    return two / Math.max(1, n);
  });
  expect(t2, "time with ≥ 2 bananas (after the first 9 s; measured 0.90–1.00 over 20 seeds)").toBeGreaterThanOrEqual(0.75);
});

test("practice game 2: 5 kisses and 1 rescue kit for this game only — the real stock and the save do not change", async ({ simPage: page }) => {
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.progress.inv, { kisses: 2, rescues: 3 }); });
  const save0 = await page.evaluate(() => { window.__bb.save.flush(); return [JSON.stringify(window.__bb.progress.inv), localStorage.getItem("bebebe-save")]; });
  await game2(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0], kiss = [];
    Object.assign(b.big, { state: "look", timer: 9999, noPush: 9999, x: 560, y: 64 });
    for (let i = 0; i < 6; i++) { Object.assign(l, { state: "ok", kissCd: 0, x: 300, y: 300, dir: Math.PI }); kiss.push(b.throwKiss(0)); }
    const kit = [];
    for (let i = 0; i < 2; i++) { Object.assign(l, { state: "down" }); kit.push(b.useRescueKit(0)); }
    b.save.flush();
    return { kiss, kit, inv: JSON.stringify(b.progress.inv), stored: localStorage.getItem("bebebe-save") };
  });
  expect(r.kiss, "5 kisses, then none").toEqual([true, true, true, true, true, false]);
  expect(r.kit, "1 kit, then none").toEqual([true, false]);
  expect([r.inv, r.stored], "the real stock and the save are untouched").toEqual(save0);
});

test("practice game 2 hints: item, banana, kiss — one at a time, each until done or 12 s; the kit after the first fall", async ({ simPage: page }) => {
  await game2(page);
  await page.evaluate(PIN);
  const hint = () => page.evaluate(() => window.__bb.tutorial.hint);
  const run = s => page.evaluate(sec => { for (let i = 0; i < Math.round(sec * 60); i++) window.__bb.update(1 / 60); }, s);
  expect(await hint(), "1: grab an item").toBe(1);
  await run(11.8);
  expect(await hint(), "still 1 before 12 s").toBe(1);
  await run(0.3);
  expect(await hint(), "12 s: 2 — lead Dad onto a banana").toBe(2);
  // Dad slips on a banana → 3
  await page.evaluate(() => { const b = window.__bb; b.big.noPush = 0; b.items.push({ id: 999, kind: "banana", x: b.big.x, y: b.big.y, t: 0, life: 99 }); b.update(1 / 60); b.update(1 / 60); });
  expect(await hint(), "slipped: 3 — send a kiss").toBe(3);
  // the player falls (first time): 4 — the rescue kit, instead of the usual kit hint
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.littles[0], { state: "down", x: 300, y: 300 }); b.update(1 / 60); });
  expect(await hint(), "first fall: 4 — the kit").toBe(4);
  await page.evaluate(() => { window.__bb.useRescueKit(0); window.__bb.update(1 / 60); });
  expect(await hint(), "kit used: back to 3").toBe(3);
  await page.evaluate(() => { const b = window.__bb, l = b.littles[0]; Object.assign(l, { state: "ok", kissCd: 0, x: 300, y: 300, dir: Math.PI }); b.throwKiss(0); b.update(1 / 60); });
  expect(await hint(), "kiss sent: no more hints").toBe(0);
  // a grabbed item ends hint 1 at once (a fresh start)
  await game2(page);
  await page.evaluate(PIN);
  await page.evaluate(() => { const b = window.__bb, l = b.littles[0]; Object.assign(l, { x: 300, y: 300 }); b.items.push({ id: 998, kind: "boots", x: 300, y: 300, t: 0, life: 99 }); b.update(1 / 60); b.update(1 / 60); });
  expect(await hint(), "item grabbed: 2").toBe(2);
  // the texts follow the device (keyboard here)
  const t = await page.evaluate(() => { const T = window.__bb.I18N.en.tut; return [T.g2kiss(T.kissKey), T.g2kit(T.kitKey), T.g2item, T.g2banana]; });
  expect(t).toEqual(["Send an air kiss 💋 (press E)", "Use the rescue kit 🩹 to get up! (press Q)", "Grab an item!", "Lead Dad onto a banana!"]);
});

test("practice game 2: hearts gone → You're ready → the level map (replay: the Story); both down stand up", async ({ simPage: page }) => {
  await game2(page);
  // no-lose as in game 1: both down stand up at the kids' house after 3 s
  await page.evaluate(() => { const b = window.__bb; Object.assign(b.big, { state: "look", timer: 9999, noPush: 9999, x: 560, y: 64 }); b.littles.forEach((l, i) => Object.assign(l, { state: "down", x: 300 + i * 40, y: 300 })); });
  await page.evaluate(() => { for (let i = 0; i < 3.1 * 60; i++) window.__bb.update(1 / 60); });
  expect(await page.evaluate(() => window.__bb.littles.map(l => [l.state, window.__bb.inSafe(l)]))).toEqual([["ok", true], ["ok", true]]);
  for (const back of ["map", "story"]) {
    await page.evaluate(bk => {
      const b = window.__bb; b.resetMenus(); b.mode = "home"; b.openTutorial(bk, "game2");
      const big = b.big, l = b.littles[0];
      Object.assign(big, { hp: 1, state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, x: 400, y: 250, dir: 0 });
      Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 400 - 34, y: 250 });
      for (let i = 0; i < 8 * 60 && b.mode === "play"; i++) b.update(1 / 60);
    }, back);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene && window.__bb.scene.id]), back).toEqual(["scene", "tutorial_ready"]);
    expect(await page.evaluate(() => window.__bb.scenePages("tutorial_ready")[0].text)).toBe("You're ready! Let's make the dads kind again!");
    await page.evaluate(() => window.__bb.sceneNext());
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.tutorial]), back).toEqual([back, null]);
  }
});

test("AC 17: the whole tutorial changes nothing but seen.tutorial; a real Park 1 afterwards has its normal items and cooldowns", async ({ simPage: page }) => {
  const before = await page.evaluate(() => {
    const b = window.__bb; Object.assign(b.progress, { coins: 77 }); Object.assign(b.progress.inv, { kisses: 3, rescues: 1, mittens: 2, mega: 1 });
    b.progress.equip[0] = "mega"; b.progress.worlds.park.unlocked = 4; b.progress.seen.tutorial = false;
    return { p: JSON.parse(JSON.stringify(b.progress)), ledger: b.ledger().length };
  });
  // the whole tutorial: pages, game 1 (played a little, then won), pages, game 2 played with the autopilot for 40 s, then won
  await page.evaluate(() => {
    const b = window.__bb, win = () => {
      const big = b.big, l = b.littles[0];
      Object.assign(big, { hp: 1, state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, x: 400, y: 250, dir: 0 });
      Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 400 - 34, y: 250 });
      for (let i = 0; i < 8 * 60 && b.mode === "play"; i++) b.update(1 / 60);
    };
    b.mode = "home"; b.seedRandom(11); b.openTutorial("map");
    for (let i = 0; i < 4; i++) b.sceneNext();
    for (let i = 0; i < 20 * 60; i++) b.update(1 / 60);
    win();
    for (let i = 0; i < 8; i++) b.sceneNext();
    b.autopilot(true, "careful");
    for (let i = 0; i < 40 * 60 && b.mode === "play"; i++) b.update(1 / 60);
    b.autopilot(false);
    if (b.mode === "play") win();
    b.sceneNext();
  });
  const after = await page.evaluate(() => { const b = window.__bb; return { mode: b.mode, p: JSON.parse(JSON.stringify(b.progress)), ledger: b.ledger().length, stored: (b.save.flush(), JSON.parse(localStorage.getItem("bebebe-save")).progress) }; });
  expect(after.mode).toBe("map");
  expect(after.p.seen.tutorial).toBe(true);
  expect({ ...after.p, seen: { ...after.p.seen, tutorial: false } }, "the save is the same except seen.tutorial").toEqual(before.p);
  expect({ ...after.stored, seen: { ...after.stored.seen, tutorial: false } }, "stored too").toEqual(before.p);
  expect(after.ledger, "no economy entries").toBe(before.ledger);
  // a real Park 1: its own item rate and max, its own push cooldown
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG; b.seedRandom(5); b.world = "park"; b.level = 1; b.startGame(1); b.seedRandom(5);   // SPEC-011 AC 8d: seeded before the start too
    let most = 0;
    b.littles.forEach(l => { if (l.kind === "bot") { l.kind = "player"; l.controls = { up: [], down: [], left: [], right: [] }; } });
    Object.assign(b.big, { state: "look", timer: 9999, lookSign: 0, noPush: 9999 });
    for (let i = 0; i < 60 * 60; i++) { b.update(1 / 60); most = Math.max(most, b.items.length); }
    const first = b.items.length;
    const l = b.littles[0];
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, hugCd: 0, x: 400, y: 250, dir: 0 });
    Object.assign(l, { state: "ok", invuln: 0, dizzy: 0, x: 400 + 34, y: 250, fx: { boots: 0, cloak: 0, shield: 0 } });
    b.update(1 / 60);
    const out = { most, max: C.ITEM_MAX, noPush: b.big.noPush, recover: C.PUSH_RECOVER, hp: b.big.maxHp, kinds: b.littles.length, first };
    b.mode = "home";
    return out;
  });
  expect(r.most, "never more than ITEM_MAX items").toBeLessThanOrEqual(r.max);
  expect(r.most, "items do appear").toBeGreaterThan(0);
  expect(r.noPush, "the normal push cooldown").toBeCloseTo(r.recover, 4);
  expect([r.hp, r.kinds]).toEqual([5, 5]);
});

// ---------- AC 5, 6: the pictures — one panel of tutorial_a/b/c per page (the intro's quarters), the ready page shows story_win ----------
test("tutorial pages show their panel of tutorial_a/b/c; the ready page a picture", async ({ desk: page }) => {
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const soft = softly();
  const panels = await page.evaluate(() => window.__bb.CFG.MENU_LOOK.scene.panels);
  for (const sh of ["a", "b", "c"]) for (let pg = 0; pg < 4; pg++) {
    await page.evaluate(([s, p]) => { const b = window.__bb; b.resetMenus(); b.mode = "home"; b.openTutorial("map", s); for (let i = 0; i < p; i++) b.sceneNext(); b.resetArtUse(); }, [sh, pg]);
    await frames(page);
    const d = await page.evaluate(() => ({ info: window.__bb.sceneInfo, use: window.__bb.artUse }));
    soft([d.info.art, d.info.crop], `${sh}${pg + 1}`).toEqual(["image", panels[pg]]);
    soft(!!d.use["tutorial_" + sh], `${sh}${pg + 1}: tutorial_${sh} drawn`).toBe(true);
  }
  await page.evaluate(() => { const b = window.__bb; b.resetMenus(); b.mode = "home"; b.openTutorial("map", "ready"); b.resetArtUse(); });
  await frames(page);
  const r = await page.evaluate(() => ({ info: window.__bb.sceneInfo, use: window.__bb.artUse, names: window.__bb.artTableNames(), all: window.__bb.ART_NAMES }));
  soft([r.info.art, !!r.use.story_win], "ready: story_win").toEqual(["image", true]);
  for (const n of ["tutorial_a", "tutorial_b", "tutorial_c", "story_win"]) { soft(r.names.includes(n), `artTableNames has ${n}`).toBe(true); soft(r.all.includes(n), `ART_NAMES has ${n}`).toBe(true); }
  await page.evaluate(() => window.__bb.tutorialSkip());
  soft.done();
});

// ---------- AC 3: Skip on every page and in both practice games (pause menu and corner button) → the Park map, seen ----------
test("Skip from every tutorial step goes to the Park map and sets seen.tutorial", async ({ desk: page }) => {
  const soft = softly();
  const at = async (from, pg = 0) => {
    await page.evaluate(([f, p]) => { const b = window.__bb; b.progress.seen.tutorial = false; b.mode = "home"; b.openTutorial("map", f); for (let i = 0; i < p; i++) b.sceneNext(); }, [from, pg]);
    await frames(page);
  };
  const ended = async how => {
    await frames(page);
    const s = await state(page);
    soft([s.mode, s.tutorial, s.seen.tutorial], how).toEqual(["map", null, true]);
    soft(await page.evaluate(() => window.__bb.mapInfo && [window.__bb.mapInfo.world, window.__bb.mapInfo.sel]), `${how}: the Park map, level 1`).toEqual(["park", 1]);
  };
  for (const sh of SHEETS) for (const pg of [0, 3]) {
    await at(sh, pg);
    const s = await state(page);
    soft([s.mode, s.scene && s.scene.id, s.scene && s.scene.page], `page ${sh}${pg + 1}`).toEqual(["scene", "tutorial_" + sh, pg]);
    soft(await page.evaluate(() => window.__bb.buttonRects.map(q => q.id).sort()), `page ${sh}${pg + 1}: buttons`).toEqual(["scene:next", "scene:skip"]);
    soft(await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "scene:next").text), `page ${sh}${pg + 1}: the tutorial goes on`).toBe("Next ▶");
    soft(await page.evaluate(() => window.__bb.tapButton("scene:skip")), `page ${sh}${pg + 1}: Skip`).toBe(true);
    await ended(`Skip on page ${sh}${pg + 1}`);
  }
  await at("a", 1);
  await page.keyboard.press("Escape");                   // Escape on a page = Skip
  await ended("Escape on page a2");
  await at("ready");
  soft(await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "scene:next").text), "ready: the last button").toBe("OK");
  soft(await page.evaluate(() => window.__bb.tapButton("scene:skip")), "ready: Skip").toBe(true);
  await ended("Skip on the last page");
  for (const g of ["game1", "game2"]) {
    await at(g);
    soft((await state(page)).mode, `${g} plays`).toBe("play");
    soft(await page.evaluate(() => window.__bb.tapButton("tutorial:skip")), `${g}: the corner Skip button`).toBe(true);
    await ended(`${g}: corner Skip`);
    await at(g);
    await page.keyboard.press("Escape");                 // pause
    await frames(page);
    soft(await page.evaluate(() => window.__bb.buttonRects.filter(q => q.text !== "II" && q.id !== "toggleFullscreen").map(q => q.id)), `${g}: pause menu`).toEqual(["resumeGame", "restartTutorialGame", "tutorialSkip"]);
    soft(await page.evaluate(() => window.__bb.tapButton("tutorialSkip")), `${g}: Skip in the pause menu`).toBe(true);
    await ended(`${g}: pause Skip`);
  }
  soft.done();
});

// ---------- SPEC-033 AC 1: Skip on the card skips the whole tutorial; Let's learn! goes to A1; Practice and Pictures never show the card ----------
test("How to play card: Skip skips the whole tutorial, Let's learn! starts page A1", async ({ desk: page }) => {
  const at = async () => {
    await page.evaluate(() => { const b = window.__bb; b.progress.seen.tutorial = false; b.mode = "home"; b.openFirstTutorial(); });
    await frames(page);
  };
  await at();
  let s = await state(page);
  expect([s.mode, s.scene, s.tutorial.step]).toEqual(["scene", { id: "tutorial_intro", page: 0, pages: 1 }, "intro"]);
  expect(await page.evaluate(() => window.__bb.tapButton("scene:skip"))).toBe(true);
  await frames(page);
  s = await state(page);
  expect([s.mode, s.tutorial, s.seen.tutorial], "Skip: the Park map, tutorial seen").toEqual(["map", null, true]);
  await at();
  await page.keyboard.press("Escape");                   // Escape = Skip
  await frames(page);
  s = await state(page);
  expect([s.mode, s.tutorial, s.seen.tutorial]).toEqual(["map", null, true]);
  await at();
  expect(await page.evaluate(() => window.__bb.tapButton("scene:next"))).toBe(true);
  await frames(page);
  s = await state(page);
  expect([s.mode, s.scene, s.tutorial.step]).toEqual(["scene", { id: "tutorial_a", page: 0, pages: 4 }, "a"]);
  await page.evaluate(() => window.__bb.tutorialSkip());
});
test("How to play card: Practice, Pictures and a plain openTutorial do not show it", async ({ desk: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    b.progress.seen.tutorial = true; b.openStory("began", "home");
    b.openPractice(); out.practice = [b.mode, b.scene, b.tutorial.step];
    b.tutorialSkip();
    b.openPictures(); out.pictures = [b.mode, b.scene && b.scene.id];
    b.sceneSkip();
    b.mode = "home"; b.openTutorial("story"); out.again = [b.mode, b.scene && b.scene.id, b.tutorial.step];
    b.tutorialSkip();
    out.steps = b.TUTORIAL_STEPS;
    return out;
  });
  expect(r.practice, "Practice: game 1 at once").toEqual(["play", null, "game1"]);
  expect(r.pictures, "Pictures: the viewer").toEqual(["scene", "tutorial_pics"]);
  expect(r.again, "a review from How to play starts at page A").toEqual(["scene", "tutorial_a", "a"]);
  expect(r.steps).not.toContain("intro");
});

// ---------- AC 4 (SPEC-032 AC 8): Practice on the "How to play" page runs only the two practice games, back on the Story ----------
test("Practice on the How-to-play page runs only the two practice games and ends back on the Story", async ({ desk: page }) => {
  const before = await page.evaluate(() => {
    const b = window.__bb; b.progress.seen.tutorial = true; b.progress.coins = 40; b.progress.inv.kisses = 2;
    b.world = "city"; b.level = 3; b.resetWorld(2); b.openStory("began", "home");
    return { progress: JSON.stringify(b.progress), ledger: b.ledger().length, world: b.world, level: b.level };
  });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("story:rules"));
  await frames(page);
  const btn = await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "story:practice"));
  expect(btn && btn.text).toContain("Practice");
  await page.evaluate(() => window.__bb.tapButton("story:practice"));
  await frames(page);
  let s = await state(page);
  expect([s.mode, s.scene, s.tutorial.game, s.tutorial.back, s.players], "game 1 at once, one player, also with two players set").toEqual(["play", null, 1, "story", 1]);
  await winPractice(page);
  s = await state(page);
  expect([s.mode, s.scene, s.tutorial.game], "game 2 at once: no picture pages in between").toEqual(["play", null, 2]);
  await winPractice(page);
  await frames(page);
  const after = await page.evaluate(() => {
    const b = window.__bb;
    return { mode: b.mode, page: b.storyInfo && b.storyInfo.page, tutorial: b.tutorial, progress: JSON.stringify(b.progress), ledger: b.ledger().length,
      world: b.world, level: b.level, players: b.littles.filter(l => l.kind === "player").length };
  });
  expect([after.mode, after.page, after.tutorial], "back on the How to play page").toEqual(["story", "rules", null]);
  expect(after.progress, "AC 17: no coins, stars, levels or stock changed").toBe(before.progress);
  expect(after.ledger, "AC 17: no economy entries").toBe(before.ledger);
  expect([after.world, after.level, after.players], "the menu's world, level and players are back").toEqual([before.world, before.level, 2]);
  // Skip works as today: from the game's corner button, back on the Story
  await page.evaluate(() => window.__bb.tapButton("story:practice"));
  await frames(page);
  expect((await state(page)).tutorial.game).toBe(1);
  await page.evaluate(() => window.__bb.tapButton("tutorial:skip"));
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.page, window.__bb.tutorial])).toEqual(["story", "rules", null]);
});

// ---------- SPEC-032 AC 8: Pictures — the tutorial picture pages A1…C4 as a viewer (Next / Back / dots), back to How to play ----------
test("Pictures shows the 12 tutorial pages with Next and Back, then returns to How to play", async ({ desk: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.progress.seen.tutorial = true; b.openStory("began", "home"); });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("story:rules"));
  await frames(page);
  const btn = await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "story:pictures"));
  expect(btn && btn.text).toContain(await page.evaluate(() => window.__bb.I18N.en.pictures));
  await page.evaluate(() => window.__bb.tapButton("story:pictures"));
  await frames(page);
  const s = await state(page);
  expect([s.mode, s.scene, s.tutorial]).toEqual(["scene", { id: "tutorial_pics", page: 0, pages: 12 }, null]);
  // the pages are the sheets' panels in order: A1…A4, B1…B4, C1…C4 (the captions of the first launch)
  const want = await page.evaluate(() => ["a", "b", "c"].flatMap(sh => window.__bb.tutorialPages(sh).map(p => p.text)));
  const seen = [], drawn = [];
  for (let i = 0; i < 12; i++) {
    await frames(page);
    const d = await page.evaluate(() => ({ info: window.__bb.sceneInfo, ids: window.__bb.buttonRects.map(q => q.id) }));
    seen.push(d.info.caption); drawn.push(d.ids.includes("scene:back") && d.ids.includes("scene:next") && !d.ids.includes("scene:skip"));
    if (i < 11) await page.evaluate(() => window.__bb.tapButton("scene:next"));
  }
  expect(seen).toEqual(want);
  expect(drawn.every(Boolean), "Back and Next on every page, no Skip").toBe(true);
  // Back: the page before; on the first page it returns to How to play
  await page.evaluate(() => window.__bb.tapButton("scene:back"));
  expect((await state(page)).scene.page).toBe(10);
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("scene:next"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("scene:next"));   // the last page's Next: back to How to play
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.page, window.__bb.scene])).toEqual(["story", "rules", null]);
  await page.evaluate(() => window.__bb.tapButton("story:pictures"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("scene:back"));
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.page])).toEqual(["story", "rules"]);
  // Escape returns too
  await page.evaluate(() => window.__bb.tapButton("story:pictures"));
  await frames(page);
  await page.keyboard.press("Escape");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.page])).toEqual(["story", "rules"]);
});

// ---------- SPEC-032 AC 7: the How to play page — rules with art icons on the left, tutorial_a on the right, controls under them ----------
async function rulesLayout(page, phone) {
  const soft = softly();
  for (const l of ["en", "es", "pt", "ru"]) for (const scale of [1, 1.15]) {
    await page.evaluate(([lang, sc]) => { const b = window.__bb; b.setLang(lang); b.CFG.TEXT_TEST_SCALE = sc; b.openStory("began", "home"); }, [l, scale]);
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("story:rules"));
    await frames(page);
    await page.evaluate(() => window.__bb.resetArtUse());
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { info: b.storyInfo, hud: b.hudRects, buttons: b.buttonRects, use: b.artUse, over: b.textOverflows, ui: b.uiSize, n: b.I18N[b.lang].rules(b.CFG.DOWN_TIME).length, iconMin: b.CFG.MENU_LOOK.story.rules.iconMin }; });
    const at = `${l} ×${scale}`, hit = (a, q) => a.x < q.x + q.w - 0.5 && q.x < a.x + a.w - 0.5 && a.y < q.y + q.h - 0.5 && q.y < a.y + a.h - 0.5;
    const rules = d.hud.filter(h => /^rules:\d+$/.test(h.id)), icons = d.hud.filter(h => h.id.startsWith("rulesIcon:")), pic = d.info.picBox;
    soft([rules.length, icons.length], `${at}: every rule with its icon`).toEqual([d.n, d.n]);
    for (const n of ["heart_full", "ui_eyes", "shop_quick_help", "ui_timer", "house_kids", "item_banana", "ui_tiptoe", "tutorial_a"]) soft(!!d.use[n], `${at}: ${n} drawn`).toBe(true);
    soft(d.info.art, `${at}: the picture`).toBe("tutorial_a");
    for (const ic of icons) {
      const r = rules.find(q => q.id === "rules:" + ic.id.split(":")[1]);
      // about 1.6 × the text; at the text floor (wide fonts, a phone) it may shrink to CFG.MENU_LOOK.story.rules.iconMin
      soft(ic.h / r.size < 1.65 && (ic.h / r.size > 1.55 || ic.h / r.size >= d.iconMin - 0.01), `${at}: ${ic.id} ${ic.h.toFixed(1)} ≈ 1.6 × ${r.size}`).toBe(true);
      soft(ic.x + ic.w <= r.x + 0.5, `${at}: ${ic.id} left of its text`).toBe(true);
    }
    for (const r of [...rules, ...icons]) soft(r.x + r.w <= pic.x + 0.5, `${at}: ${r.id} left of the picture`).toBe(true);
    const ctl = d.hud.filter(h => h.id.startsWith("controls:"));
    soft(ctl.map(h => h.id), `${at}: controls`).toEqual(phone ? ["controls:touch"] : ["controls:0", "controls:1"]);
    const lastRule = rules.at(-1);
    for (const c of ctl) soft(c.y >= Math.min(lastRule.y + lastRule.h, pic.y + pic.h) - 0.5, `${at}: ${c.id} under the rules or the picture`).toBe(true);
    const pics = d.buttons.find(q => q.id === "story:pictures"), prac = d.buttons.find(q => q.id === "story:practice");
    soft(!!pics && !!prac && pics.x + pics.w <= prac.x + 0.5 && prac.x + prac.w > d.ui.w * 0.75, `${at}: Pictures, Practice at the bottom right`).toBe(true);
    const boxes = [...rules, ...icons, ...ctl, { id: "picture", ...pic }, ...d.buttons.filter(q => q.id.startsWith("story:"))];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) soft(hit(boxes[i], boxes[j]), `${at}: ${boxes[i].id} over ${boxes[j].id}`).toBe(false);
    for (const q of boxes) soft(q.x >= -0.5 && q.y >= -0.5 && q.x + q.w <= d.ui.w + 0.5 && q.y + q.h <= d.ui.h + 0.5, `${at}: ${q.id} on screen`).toBe(true);
    soft(d.over, `${at}: every text fits`).toEqual([]);
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); });
  soft.done();
}
test("How to play: rules with art icons, the tutorial picture, controls, Pictures and Practice (desktop)", async ({ desk: page }) => {
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  await rulesLayout(page, false);
});

// the hint banner: drawn (desktop and phone 667×375), the device's controls, not on the corner Skip; the HUD label
async function hintBanner(page, touch) {
  const soft = softly(), scale0 = await page.evaluate(() => window.__bb.CFG.TEXT_TEST_SCALE);
  for (const l of ["en", "es", "pt", "ru"]) {
    await page.evaluate(lang => {
      const b = window.__bb; b.setLang(lang); b.CFG.TEXT_TEST_SCALE = 1.3; b.resetWorld(1); b.mode = "home"; b.openTutorial("map", "game1");
      b.littles[1].state = "down"; b.update(1 / 60);       // hint 1
    }, l);
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { hint: b.tutorialHint, buttons: b.buttonRects, hud: b.hudRects, over: b.textOverflows, h: b.tutorial.hint, I: b.I18N[b.lang].tut }; });
    soft(d.h, `${l}: hint 1`).toBe(1);
    soft(d.hint && d.hint.text, `${l}: the text`).toBe(d.I.g1rescue);
    const hit = (a, q) => a.x < q.x + q.w && q.x < a.x + a.w && a.y < q.y + q.h && q.y < a.y + a.h;
    const sk = d.buttons.find(q => q.id === "tutorial:skip");
    soft(!!sk, `${l}: Skip`).toBe(true);
    if (d.hint) for (const q of [...d.buttons, ...d.hud.filter(r => r.id !== "tutorialHint")]) soft(hit(d.hint, q), `${l}: hint on ${q.id}`).toBe(false);
    soft(d.over, `${l}: text fits`).toEqual([]);
  }
  // practice game 2: its four hints (12 s each, then the first fall), every language at ×1.3
  for (const l of ["en", "es", "pt", "ru"]) {
    await page.evaluate(lang => {
      const b = window.__bb; b.setLang(lang); b.CFG.TEXT_TEST_SCALE = 1.3; b.resetMenus(); b.mode = "home"; b.openTutorial("map", "game2");
      b.littles.forEach(q => { if (q.kind === "bot") { q.kind = "player"; q.controls = { up: [], down: [], left: [], right: [] }; } });
      Object.assign(b.big, { state: "look", timer: 9999, lookSign: 0, noPush: 9999, x: 560, y: 64 });
    }, l);
    for (const h of [1, 2, 3, 4]) {
      await page.evaluate(hh => {
        const b = window.__bb;
        if (hh === 4) Object.assign(b.littles[0], { state: "down", x: 300, y: 300 });
        if (hh > 1 && hh < 4) for (let i = 0; i < 12.1 * 60; i++) b.update(1 / 60);
        b.update(1 / 60);
      }, h);
      await frames(page);
      const d = await page.evaluate(() => { const b = window.__bb; return { hint: b.tutorialHint, buttons: b.buttonRects, hud: b.hudRects, over: b.textOverflows, h: b.tutorial.hint }; });
      soft(d.h, `${l} game 2: hint ${h}`).toBe(h);
      soft(!!d.hint, `${l} game 2 hint ${h}: drawn`).toBe(true);
      const hit = (a, q) => a.x < q.x + q.w && q.x < a.x + a.w && a.y < q.y + q.h && q.y < a.y + a.h;
      if (d.hint) for (const q of [...d.buttons, ...d.hud.filter(r => r.id !== "tutorialHint")]) soft(hit(d.hint, q), `${l} game 2 hint ${h} on ${q.id}`).toBe(false);
      soft(d.over, `${l} game 2 hint ${h}: text fits`).toEqual([]);
    }
  }
  await page.evaluate(() => { const b = window.__bb; b.resetMenus(); b.mode = "home"; b.openTutorial("map", "game1"); b.littles[1].state = "down"; b.update(1 / 60); });
  await page.evaluate(s => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = s; b.setLang("en"); b.littles[1].state = "ok"; b.update(1 / 60); }, scale0);
  await frames(page);
  soft(await page.evaluate(() => window.__bb.tutorialHint && window.__bb.tutorialHint.text), "hint 2 with the device's controls")
    .toBe(`Now sneak behind Dad — tiptoe close to him! (${touch ? "tap 👣" : "hold Shift"})`);
  await page.evaluate(() => window.__bb.tutorialSkip());
  soft.done();
}
test("practice hint banners on the desktop: hint style, they fit, clear of the buttons", async ({ desk: page }) => { await hintBanner(page, false); });
test("practice hint banners on the phone 667×375: they fit, clear of the buttons", async ({ phone: page }) => { await hintBanner(page, true); });
// SPEC-032 AC 7: the How to play page fits the phone 667×375 (touch line only, no keyboard line)
test("How to play fits the phone 667×375: rules with art icons, the picture, the touch line, Pictures and Practice", async ({ phone: page }) => {
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  await rulesLayout(page, true);
});

// CI fonts are wider: the team chips leave room for labels ("Me", "B", 1, 2, a count, z, !) up to CFG.PHONE_CHIP_FONT (1.3) wider
test("team chips fit their labels with wide fonts (phone 667×375, a level and the practice)", async ({ phone: page }) => {
  const soft = softly(), scale0 = await page.evaluate(() => window.__bb.CFG.TEXT_TEST_SCALE);
  for (const l of ["en", "es", "pt", "ru"]) for (const where of ["park", "practice"]) {
    await page.evaluate(([lang, w]) => {
      const b = window.__bb; b.setLang(lang); b.CFG.TEXT_TEST_SCALE = b.CFG.PHONE_CHIP_FONT; b.resetMenus(); b.mode = "home";
      if (w === "park") { b.world = "park"; b.level = 1; b.startGame(1); } else b.openTutorial("map", "game1");
      Object.assign(b.big, { state: "look", timer: 999 });
    }, [l, where]);
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb, I = b.I18N[b.lang]; return { over: b.textOverflows, labels: [I.me, I.botChip, "!", "z", "1", "2"] }; });
    soft(d.over.filter(o => d.labels.includes(o.text) || /^\d+$/.test(o.text)), `${l} ${where}: chip labels`).toEqual([]);
  }
  // the chips' size does not follow the test's font scale (the camera and the level banner keep their room while a test widens fonts)
  const teamW = [];
  for (const k of [1, 1.5]) {
    await page.evaluate(kk => { const b = window.__bb; b.setLang("en"); b.CFG.TEXT_TEST_SCALE = kk; b.resetMenus(); b.mode = "home"; b.world = "park"; b.level = 1; b.startGame(1); }, k);
    await frames(page);
    teamW.push(await page.evaluate(() => window.__bb.hudRects.find(h => h.id === "team").w));
  }
  soft(teamW[1], "team chips at font ×1.5 = at ×1").toBe(teamW[0]);
  await page.evaluate(s => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = s; b.setLang("en"); b.resetMenus(); b.mode = "home"; }, scale0);
  soft.done();
});

// AC 5: every tutorial caption fits on the phone with wide fonts (×1.3), inside its column and clear of the buttons
test("tutorial captions fit the phone 667×375 in every language (×1.3)", async ({ phone: page }) => {
  const soft = softly(), scale0 = await page.evaluate(() => window.__bb.CFG.TEXT_TEST_SCALE);
  for (const l of ["en", "es", "pt", "ru"]) for (const [st, n] of [["a", 4], ["b", 4], ["c", 4], ["ready", 1]]) for (let pg = 0; pg < n; pg++) {
    await page.evaluate(([lang, s, p]) => {
      const b = window.__bb; b.setLang(lang); b.CFG.TEXT_TEST_SCALE = 1.3; b.resetMenus(); b.mode = "home"; b.openTutorial("map", s);
      for (let i = 0; i < p; i++) b.sceneNext();
    }, [l, st, pg]);
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb; return { over: b.textOverflows, cap: b.hudRects.find(h => h.id === "scene:caption"), buttons: b.buttonRects, ui: b.uiSize, info: b.sceneInfo }; });
    const at = `${l} ${st}${pg + 1}`, c = d.cap;
    soft(d.over, `${at}: fits`).toEqual([]);
    soft(!!c && c.text === d.info.caption, `${at}: the caption`).toBe(true);
    if (c) {
      soft(c.x >= 0 && c.y >= 0 && c.x + c.w <= d.ui.w && c.y + c.h <= d.ui.h, `${at}: on the screen`).toBe(true);
      soft(!d.info.panel || c.x >= d.info.panel.x + d.info.panel.w, `${at}: right of the picture`).toBe(true);
      for (const q of d.buttons) soft(c.x < q.x + q.w && q.x < c.x + c.w && c.y < q.y + q.h && q.y < c.y + c.h, `${at}: on ${q.id}`).toBe(false);
    }
  }
  await page.evaluate(s => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = s; b.setLang("en"); b.resetMenus(); b.mode = "home"; }, scale0);
  soft.done();
});

// AC 18: phone 667×375 pictures of one page per sheet and both practice games (attached to the report)
test("tutorial screenshots for the report (phone 667×375)", async ({ phone: page }, testInfo) => {
  for (const [name, step, pg] of [["a1", "a", 0], ["b1", "b", 0], ["c1", "c", 0], ["game1", "game1", 0], ["game2", "game2", 0]]) {
    await page.evaluate(([s, p]) => {
      const b = window.__bb; b.resetMenus(); b.mode = "home"; b.seedRandom(8); b.openTutorial("map", s);
      for (let i = 0; i < p; i++) b.sceneNext();
      if (s === "game1") for (let i = 0; i < 10 * 60 && b.littles[1].state !== "down"; i++) b.update(1 / 60);
      if (s === "game2") for (let i = 0; i < 19 * 60; i++) b.update(1 / 60);
    }, [step, pg]);
    await frames(page);
    const file = testInfo.outputPath(`tutorial-${name}-667.png`);
    await page.screenshot({ path: file });
    await testInfo.attach(`tutorial-${name}-667`, { path: file, contentType: "image/png" });
  }
  await page.evaluate(() => window.__bb.tutorialSkip());
});
