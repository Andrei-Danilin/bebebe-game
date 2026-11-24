// SPEC-029: Dad starts with 5 hearts (one fewer on every ordinary level) and the tutorial — picture pages and two practice
// games after the intro comic on the first launch, with Skip, replayable from the Story's "How to play" page.
// Logic-only tests use a shared sim page; the first-launch tests open their own rendered page (the intro opens in frame()).
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const fs = require("fs");
const path = require("path");
const { openGame, frames, step, sharedPage, resetGame, softly } = require("./helpers");

// a shared sim page (logic) and a shared rendered desktop page (buttons); the fresh-page tests come first in the file
const sharedSim = sharedPage(), sharedDesk = sharedPage();
const fixture = (shared, key, opts) => async ({ browser }, use) => {
  const s = await shared.get(browser, key, { viewport: { width: 960, height: 640 } }, p => openGame(p, opts));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
const test = base.test.extend({ simPage: fixture(sharedSim, "sim", { sim: true }), desk: fixture(sharedDesk, "desk", {}) });
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
  await page.keyboard.press("Escape");                   // the intro skipped: the tutorial still comes
  await frames(page);
  s = await state(page);
  expect(s.scene).toEqual({ id: "tutorial_a", page: 0, pages: 4 });
  expect(s.tutorial).toEqual({ step: "a", page: 0, game: 0, back: "map" });
  expect([s.mode, s.seen.intro, s.seen.tutorial]).toEqual(["scene", true, false]);
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

// ---------- AC 2: an old save that has already seen the intro — the tutorial does not open by itself ----------
test("an old save that has seen the intro does not open the tutorial by itself", async ({ page }) => {
  const errors = await openGame(page, { intro: true, tutorial: true });
  await page.evaluate(() => { localStorage.setItem("bebebe-progress", JSON.stringify({ coins: 12, seen: { intro: true } })); });
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

// ---------- AC 4: Practice on the "How to play" page replays the whole tutorial and ends back on the Story ----------
test("Practice on the How-to-play page replays the tutorial and ends back on the Story", async ({ desk: page }) => {
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
  expect([s.mode, s.scene && s.scene.id, s.tutorial]).toEqual(["scene", "tutorial_a", { step: "a", page: 0, game: 0, back: "story" }]);
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.__bb.sceneNext());
  s = await state(page);
  expect([s.mode, s.tutorial.game, s.players], "one player, also with two players set").toEqual(["play", 1, 1]);
  await winPractice(page);
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__bb.sceneNext());
  expect((await state(page)).tutorial.game).toBe(2);
  await winPractice(page);
  expect((await state(page)).tutorial.step).toBe("ready");
  await page.evaluate(() => window.__bb.sceneNext());
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
  // Skip on a replay: the same, back on the Story
  await page.evaluate(() => window.__bb.tapButton("story:practice"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("scene:skip"));
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo.page, window.__bb.tutorial])).toEqual(["story", "rules", null]);
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
  soft(r.I.a4touch, "A4 on the phone").toBe("Dad hears running behind him. Close to him, tiptoe! (push the stick just a little)");
  soft(r.out.en.tutorial_c.texts[3], "C4").toBe("Win levels, get coins, and buy all this in Character!");
  soft.done();
});
