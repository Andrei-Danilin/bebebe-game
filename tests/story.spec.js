// SPEC-022: Kostya's story in the game — the story texts (from docs/story.md), the story scenes (the start comic on the
// first launch, a picture before each boss level and before the first bonus level, the ending and the thank-you card),
// Dad's anger meter and the "kind again" win title.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const fs = require("fs");
const path = require("path");
const { LANGS, openGame, frames, softly, sharedPage, resetGame, ROOT } = require("./helpers");

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

// ---------- AC 13: every story text is rewritten from docs/story.md ----------
test("the story texts come from Kostya's story (docs/story.md)", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });   // texts only, nothing drawn
  const d = await page.evaluate(() => {
    const b = window.__bb;
    return { story: b.STORY.map(c => ({ id: c.id, text: c.text, captions: c.captions || null, boss: c.boss || null })),
      bossLine: Object.fromEntries(b.LANGS.map(l => [l, b.I18N[l].bossLine])) };
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

// ---------- SPEC-026 AC 12–15: Dad's lines in the comic's empty speech bubbles ----------
// Andrei's Russian lines; English and Spanish by Claude (spec table)
const BUBBLES = {
  ru: ["Ох, какой бардак!", "Ой, дети!", "Где мой кекс?!", "Это просто невозможно!!"],
  en: ["Oh, what a mess!", "Oh, kids!", "Where's my cupcake?!", "This is just impossible!!"],
  es: ["¡Uy, qué desorden!", "¡Ay, los chicos!", "¿¡Dónde está mi cupcake!?", "¡¡Esto es imposible!!"],
  pt: ["Nossa, que bagunça!", "Ai, as crianças!", "Cadê meu cupcake?!", "Isso é impossível!!"]   // SPEC-028 AC 5 ("simplesmente" cut for the phone Story page)
};
// the white regions of art/8_start.webp (1024×765) without the tails, measured for the spec and checked with sharp (SPEC-026)
const BUBBLE_PX = [[255, 28, 432, 115], [785, 43, 940, 130], [132, 412, 245, 490], [633, 396, 809, 480]];
test("SPEC-026: Dad's bubble lines (4 per language, Andrei's Russian in docs/story.md) and the bubble boxes in CFG", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });   // texts and numbers only
  const d = await page.evaluate(() => { const b = window.__bb, S = b.CFG.MENU_LOOK.scene; return { bubbles: b.STORY[0].bubbles, boxes: S.bubbles, panels: S.panels }; });
  expect(d.bubbles, "STORY[0].bubbles[lang][i], panel order").toEqual(BUBBLES);
  for (const line of BUBBLES.ru) expect(STORY_MD, `"${line}" is written in docs/story.md`).toContain(line);
  expect(d.boxes.length, "one box per panel").toBe(4);
  d.boxes.forEach(([x, y, w, h, tx, ty], i) => {
    const [px, py, pw, ph] = d.panels[i], [x0, y0, x1, y1] = BUBBLE_PX[i];
    expect([x, y, x + w, y + h].map((v, j) => Math.round(v * (j % 2 ? 765 : 1024))), `bubble ${i + 1} in image pixels`).toEqual([x0, y0, x1, y1]);
    expect(x >= px && y >= py && x + w <= px + pw && y + h <= py + ph, `bubble ${i + 1} inside panel ${i + 1}`).toBe(true);
    expect(tx >= px && tx <= px + pw && ty >= py && ty <= py + ph, `bubble ${i + 1}'s tail tip inside its panel`).toBe(true);
  });
  expect(errors).toEqual([]);
});

// every intro page writes its line into its bubble, the text box inside the panel, never smaller than the captions' smallest size
// (SPEC-031: on the phone CFG.STORY_TEXT_MIN);
// the Story's "How it began" (the whole page) writes all four
async function bubbleProblems(page, phone) {
  const fails = [];
  for (const lang of LANGS) for (const scale of [1, 1.15]) {
    await page.evaluate(([l, s]) => { const b = window.__bb; b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; }, [lang, scale]);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(k => { const b = window.__bb; b.openScene("intro"); for (let j = 0; j < k; j++) b.sceneNext(); }, i);
      await frames(page);
      const d = await page.evaluate(() => ({ info: window.__bb.sceneInfo, min: window.__bb.CFG.STORY_TEXT_MIN, ui: window.__bb.uiSize, hud: window.__bb.hudRects }));
      const at = `${lang} ×${scale} intro page ${i + 1}`, q = d.info && d.info.bubble;
      if (!q) { fails.push(`${at}: no bubble`); continue; }
      if (q.text !== BUBBLES[lang][i]) fails.push(`${at}: bubble "${q.text}"`);
      const P = d.info.panel;
      if (!(q.x >= P.x - 0.5 && q.y >= P.y - 0.5 && q.x + q.w <= P.x + P.w + 0.5 && q.y + q.h <= P.y + P.h + 0.5)) fails.push(`${at}: text box ${JSON.stringify(q)} leaves the panel ${JSON.stringify(P)}`);
      if (q.rows > 2) fails.push(`${at}: ${q.rows} lines`);
      if (phone ? q.size * d.ui.scale < d.min - 0.01 : q.size < 14 - 0.01) fails.push(`${at}: text ${q.size} below the captions' smallest size`);
      if (q.own && !(q.bubble.x >= P.x - 0.5 && q.bubble.y >= P.y - 0.5 && q.bubble.x + q.bubble.w <= P.x + P.w + 0.5 && q.bubble.y + q.bubble.h <= P.y + P.h + 0.5))
        fails.push(`${at}: its own bubble leaves the panel`);
      const cap = d.hud.find(h => h.id === "scene:caption");
      if (cap && q.x < cap.x + cap.w && q.x + q.w > cap.x && q.y < cap.y + cap.h && q.y + q.h > cap.y) fails.push(`${at}: bubble on the caption`);
    }
    await page.evaluate(() => { const b = window.__bb; b.sceneSkip(); b.openStory("began", "home"); });
    await frames(page);
    const st = await page.evaluate(() => ({ info: window.__bb.storyInfo, buttons: window.__bb.buttonRects }));
    const bs = (st.info && st.info.bubbles) || [], at = `${lang} ×${scale} Story "How it began"`;
    if (bs.map(q => q.text).join("|") !== BUBBLES[lang].join("|")) fails.push(`${at}: bubbles ${JSON.stringify(bs.map(q => q.text))}`);
    for (const q of bs) {
      const P = q.panel, pic = st.info.pic;
      if (!(q.x >= P.x - 0.5 && q.y >= P.y - 0.5 && q.x + q.w <= P.x + P.w + 0.5 && q.y + q.h <= P.y + P.h + 0.5)) fails.push(`${at}: "${q.text}" leaves its panel`);
      if (q.rows > 2) fails.push(`${at}: "${q.text}" in ${q.rows} lines`);
      if (!(P.x >= pic.x - 0.5 && P.y >= pic.y - 0.5 && P.x + P.w <= pic.x + pic.w + 0.5 && P.y + P.h <= pic.y + pic.h + 0.5)) fails.push(`${at}: panel outside the picture`);
      for (const b of st.buttons) { const r = q.own ? q.bubble : q; if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) fails.push(`${at}: "${q.text}" under button ${b.id}`); }
    }
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); b.mode = "home"; });
  return fails;
}
test("SPEC-026: Dad's lines sit in the comic's bubbles (desktop)", async ({ desk: page }) => {
  const fails = await bubbleProblems(page, false);
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
});
test("SPEC-026: Dad's lines sit in the comic's bubbles (phone 667×375)", async ({ phonePage: page }) => {
  const fails = await bubbleProblems(page, true);
  expect(fails, fails.slice(0, 15).join("\n")).toEqual([]);
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
  expect(await page.evaluate(() => window.__bb.progress.seen.intro), "seen only when the player leaves it").toBe(false);
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
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene, window.__bb.progress.seen.intro])).toEqual(["home", null, true]);
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
  const none = { intro: false, boss_park: false, boss_field: false, boss_city: false, boss_school: false, bonus_beach: false, bonus_winter: false, ending: false, tutorial: false };   // SPEC-029: + tutorial
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
    window.__press = k => { window.__pads = [{ index: 0, mapping: "standard", axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
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
  // a first School 20 win paid by leaving through pause (the last hug done, Dad on his way home): the ending comes too
  await page.evaluate(() => {
    const b = window.__bb; b.progress.seen.ending = false; b.world = "school"; b.level = 20; b.startGame(1);
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0, hp: 1 });
    Object.assign(b.littles[0], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 466, y: 320 });
    for (let i = 0; i < 30; i++) b.update(1 / 60);
    b.mode = "pause"; b.toMap();
  });
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene && window.__bb.scene.id])).toEqual(["scene", "ending"]);
  await page.evaluate(() => window.__bb.sceneSkip());
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.progress.seen.ending])).toEqual(["map", true]);
  // one more ordinary win (seen): straight to the map
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
  soft(await page.evaluate(() => Object.values(window.__bb.progress.seen).some(Boolean)), "a replay from the Story does not count as the first showing").toBe(false);
  // V on the keyboard replays the chapter's scene; its last button goes back, it does not say Play
  await page.evaluate(() => window.__bb.openStory("park"));
  await frames(page);
  await page.keyboard.press("KeyV");
  await frames(page);
  soft(await page.evaluate(() => [window.__bb.mode, window.__bb.scene && window.__bb.scene.id, window.__bb.buttonRects.find(b => b.id === "scene:next").text]), "V: the park boss again").toEqual(["scene", "boss_park", "OK"]);
  await page.keyboard.press("Escape");
  soft.done();
});

// ---------- AC 1, 2: the hearts bar is Dad's anger meter ----------
// hudRects "hearts" = the meter's plate, with the drawn label (label, labelX, labelW); the clouds are the SPEC-020 heart clouds (artUse)
const meter = page => page.evaluate(() => {
  const b = window.__bb, plate = b.hudRects.find(q => q.id === "hearts"), timer = b.hudRects.find(q => q.id === "timer");
  return { plate, timer, lab: plate && { text: plate.label, x: plate.labelX, w: plate.labelW }, use: b.artUse };
});
async function meterCheck(page) {
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const soft = softly();
  // with this machine's fonts and with the wider CI / iPhone fonts (CFG.TEXT_TEST_SCALE 1.15, like the other phone fit tests)
  for (const scale of [1, 1.15]) for (const lang of LANGS) {
    for (const [hearts, typed] of [[3, ""], [15, ""], [15, "Max"]]) {
      await page.evaluate(([l, n, t, s]) => {
        const b = window.__bb; b.CFG.TEXT_TEST_SCALE = s; b.setLang(l); b.setName("big", t); b.world = "park"; b.level = 1; b.startGame(1);
        Object.assign(b.big, { maxHp: n, hp: n - 1.5, state: "look", timer: 999 }); b.resetArtUse();
      }, [lang, hearts, typed, scale]);
      await frames(page);
      const m = await meter(page), I = await page.evaluate(l => { const T = window.__bb.I18N[l]; return { anger: T.anger, of: T.angerOf("Max") }; }, lang);
      const at = `${lang} ${hearts} hearts${typed ? " typed" : ""} ×${scale}`;
      soft(m.lab && m.lab.text, `${at}: the label`).toBe(typed ? I.of : I.anger);
      soft(m.lab && m.plate && m.lab.x >= m.plate.x && m.lab.x + m.lab.w <= m.plate.x + m.plate.w + 0.5, `${at}: the label inside the plate`).toBe(true);
      if (!typed) soft(/…/.test(m.lab ? m.lab.text : ""), `${at}: the label is not cut`).toBe(false);
      if (m.timer && m.plate) soft(m.plate.x + m.plate.w <= m.timer.x + 0.5, `${at}: the plate stays left of the timer`).toBe(true);
      // the clouds: full, one half (pale) and the lost ones out
      soft([m.use.cloud_heart_full, m.use.cloud_heart_half, m.use.cloud_heart_empty].map(v => (v || 0) > 0), `${at}: full, half and out clouds`).toEqual([true, true, true]);
    }
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setName("big", ""); b.setLang("en"); });
  const T = await page.evaluate(() => window.__bb.LANGS.map(l => [window.__bb.I18N[l].anger, window.__bb.I18N[l].defaultBig]));
  expect(T).toEqual([["Dad's anger", "Dad"], ["Enojo de papá", "Papá"], ["Papai bravo", "Papai"], ["Злость папы", "Папа"]]);
  soft.done();
}
test("the anger meter shows Dad's anger (desktop)", { tag: "@fast" }, async ({ desk: page }) => meterCheck(page));

// ---------- AC 4: the win screen says "Dad is kind again!" (bosses: the boss's name) ----------
async function winTitles(page) {
  const soft = softly(), want = {
    en: { dad: "Dad is kind again!", max: "Max is kind again!", park: "The park boss is kind again!", school: "The grumpiest dad is kind again!" },
    es: { dad: "¡Papá volvió a ser bueno!", max: "¡Max volvió a ser bueno!", park: "¡El jefe del parque volvió a ser bueno!", school: "¡El papá más enojado volvió a ser bueno!" },
    pt: { dad: "Papai ficou bonzinho!", max: "Max ficou bonzinho!", park: "O chefe do parque ficou bonzinho!", school: "O papai mais bravo ficou bonzinho!" },   // SPEC-028
    ru: { dad: "Папа снова добрый!", max: "Max снова добрый!", park: "Босс парка снова добрый!", school: "Самый злой папа снова добрый!" } };
  for (const lang of LANGS) for (const [key, world, n, typed] of [["dad", "park", 3, ""], ["max", "city", 5, "Max"], ["park", "park", 20, ""], ["school", "school", 20, "Max"], ["dad", "winter", 20, ""]]) {
    await page.evaluate(([l, w, lv, t]) => {
      const b = window.__bb; b.setLang(l); b.setName("big", t); b.progress.seen.ending = true; b.world = w; b.progress.worlds[w].unlocked = 20; b.level = lv; b.startGame(1);
      b.big.hp = 0; b.giveReward(true); b.mode = "win";
    }, [lang, world, n, typed]);
    await frames(page);
    const t = await page.evaluate(() => window.__bb.hudRects.find(h => h.id === "win:title"));
    soft(t && t.text, `${lang} ${world} ${n}${typed ? " typed" : ""}`).toBe(want[lang][key]);
    soft(t && t.x >= 0 && t.x + t.w <= (await page.evaluate(() => window.__bb.uiSize.w)), `${lang} ${world} ${n}: the title inside the screen`).toBe(true);
  }
  await page.evaluate(() => window.__bb.setName("big", ""));
  soft.done();
}
test("the win title: Dad is kind again (desktop)", async ({ desk: page }) => winTitles(page));

// ---------- AC 3: Dad's mood on his face and over his head ----------
// __bb.moodInfo (drawn) = { mood, face (the head colour), sprites (drawn this frame), cloud (its size) }
test("Dad's mood shows: angry red with steam and a dark cloud, mid orange-pink with less steam, kind pink with hearts", async ({ desk: page }) => {
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const look = await page.evaluate(() => window.__bb.CFG.MOOD_LOOK.face);
  const soft = softly();
  const moodAt = async (world, n, frac, extra = "") => {
    await page.evaluate(([w, lv, f]) => {
      const b = window.__bb; b.world = w; b.level = lv; b.startGame(1);
      Object.assign(b.big, { hp: Math.round(b.big.maxHp * f * 2) / 2, state: "look", timer: 999, x: 480, y: 330 });
    }, [world, n, frac]);
    await frames(page);
    return page.evaluate(() => window.__bb.moodInfo);
  };
  let m = await moodAt("park", 3, 1);
  soft([m.mood, m.face], "full anger").toEqual(["angry", look.angry]);
  soft(m.sprites.filter(s => s.startsWith("fx_steam")).length, "steam from both ears").toBe(2);
  soft(m.sprites.includes("fx_storm_cloud"), "a dark cloud").toBe(true);
  m = await moodAt("park", 3, 0.5);
  soft([m.mood, m.face], "half").toEqual(["mid", look.mid]);
  soft(m.sprites.filter(s => s.startsWith("fx_steam")).length, "less steam").toBe(1);
  soft(m.sprites.includes("fx_storm_cloud"), "no cloud").toBe(false);
  m = await moodAt("park", 3, 0.2);
  soft([m.mood, m.face], "low").toEqual(["kind", look.kind]);
  soft(m.sprites, "hearts instead of steam").toEqual(["fx_hearts"]);
  // a costume that is not a human face (the ogre) keeps its colour; the steam still shows
  await page.evaluate(() => { const b = window.__bb; while (b.wardrobe().big[b.outfits.shown.big].id !== "ogre") b.cycleBig(1); });
  m = await moodAt("park", 3, 1);
  const ogre = await page.evaluate(() => window.__bb.model("big").faceBase);
  soft([m.mood, m.face], "the ogre: angry, green as ever").toEqual(["angry", ogre]);
  soft(m.sprites.includes("fx_storm_cloud"), "the ogre: the cloud still shows").toBe(true);
  await page.evaluate(() => { const b = window.__bb; while (b.wardrobe().big[b.outfits.shown.big].id !== "dad") b.cycleBig(1); });
  // the grumpiest dad has the biggest cloud
  const a = await moodAt("park", 20, 1), s = await moodAt("school", 20, 1);
  soft(s.cloud > a.cloud, `the grumpiest dad's cloud (${s.cloud}) is bigger than the park boss's (${a.cloud})`).toBe(true);
  // the blush of a kiss still works on top (the emissive of the face), and lying after a banana shows nothing over his head
  const k = await page.evaluate(() => { const b = window.__bb; b.big.blush = 2; return 0; });
  await frames(page);
  soft(await page.evaluate(() => window.__bb.model("big").cheeks.visible), "blush cheeks on top of the mood").toBe(true);
  await page.evaluate(() => { const b = window.__bb; b.big.blush = 0; b.big.slip = 2; });
  await frames(page);
  soft((await page.evaluate(() => window.__bb.moodInfo)).sprites, "lying: nothing over his head").toEqual([]);
  soft.done();
});

// ---------- AC 4 (looks): on the way home he smiles, blushes, waves and hearts fly ----------
test("the kind dad smiles, blushes and waves on his way home", async ({ desk: page }) => {
  await page.waitForFunction(() => window.__bb.artInfo.done);
  await page.evaluate(() => {
    const b = window.__bb; b.world = "park"; b.level = 3; b.startGame(1);
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0, hp: 1 });
    Object.assign(b.littles[0], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 466, y: 320 });
    for (let i = 0; i < 70; i++) b.update(1 / 60);      // the last hug (1 s), then he is kind
    b.mode = "pause";                                     // hold the moment (no logic), keep drawing
  });
  await frames(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, m = b.model("big");
    return { kind: b.big.kind, cheeks: m.cheeks.visible, smile: Math.abs(Math.abs(m.face.mouth.rotation.z) - Math.PI) < 0.01, wave: m.arms[0].rotation.z,
      face: "#" + m.headMat.color.getHexString(), base: m.faceBase, mood: b.moodInfo.mood, sprites: b.moodInfo.sprites };
  });
  expect(r.kind).toBe(true);
  expect([r.cheeks, r.smile], "blushes and smiles").toEqual([true, true]);
  expect(r.wave, "one arm up, waving").toBeLessThan(-1.5);
  expect([r.mood, r.face], "his own face colour again").toEqual(["happy", r.base]);
  expect(r.sprites).toContain("fx_hearts");
  await page.evaluate(() => { window.__bb.mode = "play"; });
});

// ---------- AC 5, 6 (looks): each boss wears his own look, built on the dad, a bit bigger ----------
test("each boss wears his own look on the dad model, a bit bigger", async ({ desk: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    b.cycleBig(1);                                        // another Big One look chosen in the wardrobe: bosses still wear theirs
    for (const [w, n] of [["park", 20], ["field", 20], ["city", 20], ["school", 20], ["park", 19], ["beach", 20]]) { b.world = w; b.level = n; b.startGame(1); out[w + n] = b.bigLook(); }
    out.looks = JSON.parse(JSON.stringify(b.BOSS_LOOKS)); out.k = b.CFG.BOSS_SCALE;
    return out;
  });
  const soft = softly(), base = r.park19.scale;
  for (const w of ["park", "field", "city", "school"]) {
    const x = r[w + "20"], L = r.looks[w];
    soft([x.look, x.boss], `${w} 20: the dad as the boss`).toEqual(["dad", w]);
    soft(x.parts, `${w} 20: his parts`).toEqual(L.parts);
    soft(x.shirt, `${w} 20: his shirt`).toBe(L.shirt);
    soft(x.scale, `${w} 20: bigger by BOSS_SCALE`).toBeCloseTo(base * r.k, 5);
  }
  soft([r.park19.boss, r.park19.parts], "park 19: no boss look").toEqual([null, []]);
  soft([r.beach20.boss, r.beach20.parts], "beach 20: no boss in a bonus world").toEqual([null, []]);
  soft.done();
  await page.evaluate(() => window.__bb.cycleBig(-1));
});

// ---------- the phone tests last (one shared rendered page at a time: desktop first, then phone) ----------
test("the anger meter shows Dad's anger (phone 667×375)", async ({ phonePage: page }) => meterCheck(page));
test("the win title: Dad is kind again (phone 667×375)", async ({ phonePage: page }) => winTitles(page));

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
