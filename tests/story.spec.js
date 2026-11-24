// SPEC-022: Kostya's story in the game — the story texts (from docs/story.md), the story scenes (the start comic on the
// first launch, a picture before each boss level and before the first bonus level, the ending and the thank-you card),
// Dad's anger meter and the "kind again" win title.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const fs = require("fs");
const path = require("path");
const { openGame, frames, softly, sharedPage, resetGame, ROOT } = require("./helpers");

// one rendered game page for the scene tests (resetGame before each); the fresh-page tests come first in the file
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
  desk: fixture("desktop", { viewport: { width: 960, height: 640 } }),
  phonePage: fixture("phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, "?phone=1")
});
test.afterAll(async () => { await shared.close(); });

const STORY_MD = fs.readFileSync(path.join(ROOT, "docs", "story.md"), "utf8");
const LANGS = ["en", "es", "ru"];

// ---------- AC 13: every story text is rewritten from docs/story.md ----------
test("the story texts come from Kostya's story (docs/story.md)", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });   // texts only, nothing drawn
  const d = await page.evaluate(() => {
    const b = window.__bb;
    return { story: b.STORY.map(c => ({ id: c.id, text: c.text, captions: c.captions || null, boss: c.boss || null })),
      bossLine: Object.fromEntries(["en", "es", "ru"].map(l => [l, b.I18N[l].bossLine])) };
  });
  const soft = softly(), by = id => d.story.find(c => c.id === id);
  // the start comic: four captions (one per panel of 8_start), in every language, Kostya's words in Russian
  const began = by("began");
  soft(!!began.captions, "began has captions").toBe(true);
  for (const l of LANGS) soft(began.captions && began.captions[l].length, `began captions ${l}`).toBe(4);
  const ru = began.captions ? began.captions.ru : [];
  ["пришёл с работы", "сбивают его с ног", "любимое пирожное", "в кафе"].forEach((w, i) => {
    soft(ru[i] || "", `caption ${i + 1} (ru) has Kostya's "${w}"`).toContain(w);
    soft(STORY_MD, `"${w}" is in docs/story.md`).toContain(w);
  });
  // the ending: "они вместе с детьми сидят за столом и кушают пирожные"
  soft(by("ended").text.ru, "the ending (ru)").toContain("сидят за столом и кушают пирожные");
  // the world chapters and the boss lines: the School holds the grumpiest dad; the other bosses are each world's main dad
  for (const w of ["park", "field", "city", "school"]) for (const l of LANGS) soft(typeof (by(w).boss || {})[l], `${w} boss line ${l}`).toBe("string");
  for (const w of ["beach", "winter"]) soft(by(w).boss, `${w}: no boss in the bonus worlds`).toBeNull();
  soft(by("school").boss.ru, "the school boss (ru)").toContain("самый злой папа");
  soft(by("school").boss.ru, "the school boss's power (ru)").toContain("сразу нескольких детей");
  for (const w of ["park", "field", "city"]) {
    soft(by(w).boss.ru, `${w} boss (ru) is the world's main dad`).toContain("главный папа");
    soft(by(w).boss.ru.includes("самый злой"), `${w} boss (ru) is not the grumpiest dad`).toBe(false);
    soft(by(w).boss.en.includes("grumpiest"), `${w} boss (en) is not the grumpiest dad`).toBe(false);
  }
  // the level card's boss line: one per main world, the same meaning
  for (const l of LANGS) soft(Object.keys(d.bossLine[l]).sort(), `bossLine ${l}`).toEqual(["city", "field", "park", "school"]);
  soft(d.bossLine.ru.school, "bossLine school (ru)").toContain("Самый злой папа");
  for (const w of ["park", "field", "city"]) soft(d.bossLine.ru[w].includes("злой"), `bossLine ${w} (ru)`).toBe(false);
  // Claude's SPEC-017 wording ("grumpy dads", "ворчливые папы") is gone: Kostya's dads are angry ("злые")
  for (const c of d.story) for (const l of LANGS) soft(/ворчлив|gruñon|grumpy dads/i.test(c.text[l]), `${c.id} ${l}: no SPEC-017 wording`).toBe(false);
  soft.done();
  expect(errors).toEqual([]);
});

// ---------- AC 9, 12: the start comic on the very first launch ----------
// __bb.scene = { id, page, pages } or null (logic); __bb.sceneInfo = what the scene screen drew this frame (drawn):
// { id, page, pages, art: "image" | "placeholder" | "thanks", caption, crop }
const sceneOf = page => page.evaluate(() => ({ mode: window.__bb.mode, scene: window.__bb.scene, info: window.__bb.sceneInfo }));
test("the first launch shows the start comic once", async ({ page }) => {
  const errors = await openGame(page, { intro: true });   // the tests' helpers skip the intro; this test is the first launch
  await page.waitForFunction(() => window.__bb.artInfo.done);
  await frames(page);
  let s = await sceneOf(page);
  expect([s.mode, s.scene && s.scene.id, s.scene && s.scene.page, s.scene && s.scene.pages]).toEqual(["scene", "intro", 0, 4]);
  const caps = await page.evaluate(() => window.__bb.STORY[0].captions.en);
  expect(s.info).toMatchObject({ id: "intro", page: 0, art: "image", caption: caps[0] });
  const crop0 = s.info.crop;
  expect(await page.evaluate(() => window.__bb.progress.seen.intro), "seen as soon as it is shown").toBe(true);
  // Enter = next panel (each its own caption and its own part of 8_start)
  await page.keyboard.press("Enter");
  await frames(page);
  s = await sceneOf(page);
  expect([s.info.page, s.info.caption]).toEqual([1, caps[1]]);
  expect(s.info.crop).not.toEqual(crop0);
  // the buttons: Skip and Next; Escape skips the rest → home
  expect((await page.evaluate(() => window.__bb.buttonRects.map(b => b.id))).sort()).toEqual(["scene:next", "scene:skip"]);
  await page.keyboard.press("Escape");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene])).toEqual(["home", null]);
  // saved: after a reload the game opens on the home screen
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.progress.seen.intro])).toEqual(["home", true]);
  expect(errors).toEqual([]);
});

test("progress.seen: old saves load with every scene unseen, a broken one too", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saves", "pre-spec-022.json"), "utf8"));
  const r = await page.evaluate(save => {
    const b = window.__bb, plain = v => JSON.parse(JSON.stringify(v));
    return { old: plain(b.loadProgress(save).seen), broken: plain(b.loadProgress({ ...save, seen: "oops" }).seen),
      mixed: plain(b.loadProgress({ ...save, seen: { intro: true, boss_park: 1, ending: "yes", nonsense: true } }).seen), fresh: plain(b.loadProgress(null).seen) };
  }, f.keys["bebebe-progress"]);
  const none = { intro: false, boss_park: false, boss_field: false, boss_city: false, boss_school: false, bonus_beach: false, bonus_winter: false, ending: false };
  expect(r.old).toEqual(none);
  expect(r.broken).toEqual(none);
  expect(r.fresh).toEqual(none);
  expect(r.mixed, "only true counts; unknown keys are dropped").toEqual({ ...none, intro: true });
  expect(errors).toEqual([]);
});

// ---------- AC 10, 12: the boss picture before a boss level, the bonus picture before the first bonus level ----------
const winNow = page => page.evaluate(() => { const b = window.__bb; b.big.hp = 0; b.giveReward(true); b.mode = "win"; });
test("a boss level shows its boss picture the first time", { tag: "@fast" }, async ({ desk: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.park.unlocked = 20; b.world = "park"; b.openMap(); });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("stop:20"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("card:1"));
  await frames(page);
  let s = await sceneOf(page);
  const line = await page.evaluate(() => window.__bb.STORY.find(c => c.id === "park").boss.en);
  expect([s.mode, s.scene.id, s.scene.pages]).toEqual(["scene", "boss_park", 1]);
  expect(s.info).toMatchObject({ id: "boss_park", caption: line });
  expect(await page.evaluate(() => window.__bb.buttonRects.find(b => b.id === "scene:next").text)).toContain("Play");
  // Play (Enter) starts the boss level
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level, window.__bb.progress.seen.boss_park])).toEqual(["play", "park", 20, true]);
  // the second time: straight into the level
  await page.evaluate(() => window.__bb.toMap());
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("stop:20"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("card:1"));
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
  // level 20 of the field from the win screen of 19 ("Next level"): its own boss scene; Skip plays too
  await page.evaluate(() => { const b = window.__bb; b.world = "field"; b.progress.worlds.field.unlocked = 20; b.level = 19; b.startGame(1); });
  await winNow(page);
  await frames(page);
  await page.keyboard.press("Enter");                       // the win screen's Next level
  await frames(page);
  s = await sceneOf(page);
  expect([s.mode, s.scene && s.scene.id]).toEqual(["scene", "boss_field"]);
  await page.evaluate(() => window.__bb.tapButton("scene:skip"));
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level])).toEqual(["play", "field", 20]);
});

test("a bonus world shows its picture before its first level; gamepad A goes on", async ({ desk: page }) => {
  await page.evaluate(() => {
    const b = window.__bb, all = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
    for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: { ...all } });
    b.openMap(); b.selectWorld("winter");
  });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("stop:1"));
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("card:1"));
  await frames(page);
  const s = await sceneOf(page);
  expect([s.mode, s.scene.id, s.info.caption]).toEqual(["scene", "bonus_winter", await page.evaluate(() => window.__bb.STORY.find(c => c.id === "winter").text.en)]);
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
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level, window.__bb.progress.seen.bonus_winter])).toEqual(["play", "winter", 1, true]);
  // the level-20 stop of a bonus world has no boss badge (AC 7), its card no boss line
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.winter.unlocked = 20; b.toMap(); });
  await frames(page);
  const stop = await page.evaluate(() => window.__bb.mapInfo.stops.find(q => q.n === 20));
  expect([stop.boss, stop.badge || null]).toEqual([false, null]);
  await page.evaluate(() => window.__bb.tapButton("stop:20"));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.levelCard.line)).toBe(await page.evaluate(() => window.__bb.I18N.en.typeLines.maze));
});

// ---------- AC 11: the ending after the first School 20 win, then the thank-you card ----------
test("the first School 20 win shows the ending and the thank-you card", async ({ desk: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.progress.worlds.school.unlocked = 20; b.level = 20; b.startGame(1); });
  await winNow(page);
  await frames(page);
  await page.keyboard.press("Enter");                        // after level 20 the green button goes to the map — first the ending
  await frames(page);
  let s = await sceneOf(page);
  const ended = await page.evaluate(() => window.__bb.STORY.find(c => c.id === "ended").text.en);
  expect([s.mode, s.scene.id, s.scene.pages, s.info.caption]).toEqual(["scene", "ending", 2, ended]);
  expect(s.info.art).toBe("image");
  await page.keyboard.press("Enter");
  await frames(page);
  s = await sceneOf(page);
  expect(s.info).toMatchObject({ page: 1, art: "thanks" });
  const texts = await page.evaluate(() => window.__bb.hudRects.filter(h => h.id.startsWith("scene:")).map(h => h.text));
  expect(texts).toEqual(expect.arrayContaining(["Thank you for playing!", "Made by Kostya and Dad"]));
  await page.keyboard.press("Enter");
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.progress.seen.ending])).toEqual(["map", true]);
  // the second win: straight to the map
  await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.level = 20; b.startGame(1); });
  await winNow(page);
  await frames(page);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
});

// ---------- AC 9–11: every scene can be watched again from the Story ----------
test("every scene can be watched again from the Story", async ({ desk: page }) => {
  await page.evaluate(() => {
    const b = window.__bb, all = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
    for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: { ...all } });
  });
  const soft = softly();
  for (const [ch, id] of [["began", "intro"], ["park", "boss_park"], ["field", "boss_field"], ["city", "boss_city"], ["school", "boss_school"], ["beach", "bonus_beach"], ["winter", "bonus_winter"], ["ended", "ending"]]) {
    await page.evaluate(c => window.__bb.openStory(c), ch);
    await frames(page);
    soft(await page.evaluate(() => window.__bb.tapButton("story:scene")), `${ch}: the picture is a button`).toBe(true);
    await frames(page);
    const s = await sceneOf(page);
    soft([s.mode, s.scene && s.scene.id], ch).toEqual(["scene", id]);
    await page.keyboard.press("Escape");
    await frames(page);
    soft(await page.evaluate(() => [window.__bb.mode, window.__bb.storyInfo && window.__bb.storyInfo.chapter]), `${ch}: back to its chapter`).toEqual(["story", ch]);
  }
  soft.done();
});

// ---------- AC 12: the scenes on a phone (667×375): big buttons, everything inside, nothing on anything ----------
test("the scenes fit a 667×375 phone", async ({ phonePage: page }) => {
  const soft = softly();
  for (const lang of LANGS) for (const [id, n] of [["intro", 4], ["boss_school", 1], ["bonus_beach", 1], ["ending", 2]]) for (let i = 0; i < n; i++) {
    await page.evaluate(([l, sid, k]) => { const b = window.__bb; b.setLang(l); b.openScene(sid); for (let j = 0; j < k; j++) b.sceneNext(); }, [lang, id, i]);
    await frames(page);
    const d = await page.evaluate(() => ({ ui: window.__bb.uiSize, buttons: window.__bb.buttonRects, hud: window.__bb.hudRects, info: window.__bb.sceneInfo }));
    const at = `${lang} ${id} page ${i}`, sc = d.ui.scale, inside = r => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= d.ui.w + 0.5 && r.y + r.h <= d.ui.h + 0.5;
    soft(d.info && d.info.page, `${at}: drawn`).toBe(i);
    for (const b of d.buttons) {
      soft(b.w * sc >= 44 - 0.01 && b.h * sc >= 44 - 0.01, `${at}: button ${b.id} ≥ 44×44 CSS px (${b.w * sc}×${b.h * sc})`).toBe(true);
      soft(inside(b), `${at}: button ${b.id} inside`).toBe(true);
      soft(/…/.test(b.text || ""), `${at}: button ${b.id} text not cut`).toBe(false);
    }
    for (const h of d.hud.filter(q => q.id.startsWith("scene:"))) {
      soft(inside(h), `${at}: ${h.id} inside`).toBe(true);
      soft(/…/.test(h.text || ""), `${at}: ${h.id} text not cut`).toBe(false);
      for (const b of d.buttons) soft(h.x < b.x + b.w && h.x + h.w > b.x && h.y < b.y + b.h && h.y + h.h > b.y, `${at}: ${h.id} on button ${b.id}`).toBe(false);
    }
    await page.evaluate(() => window.__bb.sceneSkip());
  }
  soft.done();
});
