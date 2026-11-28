// SPEC-047 AC 9 / 10 (step 4): the Music and Sounds switches (home screen, keys N and M, the grown-ups page), kept in the save as
// settings.music / settings.sfx (an old `muted: true` turns both off), the iPhone audio session, the music pausing in the background,
// and a key or the pad's A pressing a menu button sounding like a tap.
const { test, expect } = require("./pw");
const { openGame, reloadGame, frames, storedSave } = require("./helpers");

const settings = page => page.evaluate(() => window.__bb.audio.settings);
const button = (page, id) => page.evaluate(k => window.__bb.buttonRects.find(q => q.id === k) || null, id);
async function gesture(page) {
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => { const a = window.__bb.audioContext(); return !!a && a.state === "running"; });
}
const hide = page => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
});
const show = page => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
});
const mark = page => page.evaluate(() => { const l = window.__bb.audio.log; return l.length ? l[l.length - 1].n : 0; });
const since = (page, n) => page.evaluate(n0 => window.__bb.audio.log.filter(e => e.n > n0), n);

test("the home screen has a Music and a Sounds switch; each is saved and comes back after a reload", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__bb.toHome());
  await frames(page);
  expect((await button(page, "home:music")) && (await button(page, "home:sound")), "both buttons").toBeTruthy();
  expect(await settings(page), "both on at first").toEqual({ music: true, sfx: true });
  expect((await storedSave(page)).settings, "nothing stored until a switch is touched").toBeUndefined();
  await page.evaluate(() => window.__bb.tapButton("home:music"));
  expect(await settings(page)).toEqual({ music: false, sfx: true });
  expect((await storedSave(page)).settings).toEqual({ music: false, sfx: true });
  await reloadGame(page);
  expect(await settings(page), "the music stays off after a reload").toEqual({ music: false, sfx: true });
  expect(await page.evaluate(() => window.__bb.muted), "the sounds are on").toBe(false);
  await page.evaluate(() => window.__bb.tapButton("home:sound"));
  await reloadGame(page);
  expect(await settings(page)).toEqual({ music: false, sfx: false });
  expect(await page.evaluate(() => window.__bb.muted)).toBe(true);
  await page.evaluate(() => { window.__bb.tapButton("home:music"); window.__bb.tapButton("home:sound"); });
  await reloadGame(page);
  expect(await settings(page)).toEqual({ music: true, sfx: true });
  expect((await storedSave(page)).settings).toEqual({ music: true, sfx: true });
});

test("keys M (sounds) and N (music) toggle the switches on any screen", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__bb.toHome());
  await page.keyboard.press("KeyM");
  expect(await settings(page)).toEqual({ music: true, sfx: false });
  await page.keyboard.press("KeyN");
  expect(await settings(page)).toEqual({ music: false, sfx: false });
  await page.evaluate(() => window.__bb.openMap());
  await page.keyboard.press("KeyM"); await page.keyboard.press("KeyN");
  expect(await settings(page)).toEqual({ music: true, sfx: true });
  expect((await storedSave(page)).settings).toEqual({ music: true, sfx: true });
});

// SPEC-048 regression (master's Pages run): a screen waits for its picture (artHolding drops navigation keys), but M / N / L change no screen: they always work
test("keys M, N and L work while a screen waits for its picture; navigation keys do not", async ({ page }) => {
  await page.route(/\/assets\/map_bg_[a-z]*\.webp$/, async route => { await new Promise(r => setTimeout(r, 2500)); await route.continue(); });   // the map page arrives late
  await openGame(page);
  const wait = await page.evaluate(() => window.__bb.CFG.ART_WAIT);
  await page.evaluate(() => { window.__bb.CFG.ART_WAIT = 4; window.__bb.openMap(); });
  try {
    expect(await page.evaluate(() => window.__bb.artInfo.holding), "the map is held for its picture").toBe(true);
    await page.keyboard.press("KeyM");
    expect(await settings(page), "M works during the hold").toEqual({ music: true, sfx: false });
    await page.keyboard.press("KeyN");
    expect(await settings(page), "N works during the hold").toEqual({ music: false, sfx: false });
    const lang = await page.evaluate(() => window.__bb.lang);
    await page.keyboard.press("KeyL");
    expect(await page.evaluate(() => window.__bb.lang), "L (the language) works during the hold").not.toBe(lang);
    expect(await page.evaluate(() => window.__bb.artInfo.holding), "still held: no screen changed").toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.__bb.mode), "a navigation key is still dropped by the hold").toBe("map");
  } finally { await page.evaluate(w => { window.__bb.CFG.ART_WAIT = w; }, wait); }
});

test("an old save with muted: true turns both off; settings, when there, win; unknown settings are kept", async ({ page }) => {
  await openGame(page);
  const put = fn => page.evaluate(f => { const s = JSON.parse(localStorage.getItem("bebebe-save")); new Function("s", f)(s); localStorage.setItem("bebebe-save", JSON.stringify(s)); }, fn);
  await page.evaluate(() => window.__bb.save.flush());
  await put("delete s.settings; s.muted = true;");
  await reloadGame(page);
  expect(await settings(page), "muted: true → both off").toEqual({ music: false, sfx: false });
  expect((await storedSave(page)).muted, "the old field is written back as it was").toBe(true);
  await put("s.settings = { music: true, sfx: false, future: 7 };");
  await reloadGame(page);
  expect(await settings(page), "settings win over muted").toEqual({ music: true, sfx: false });
  await page.evaluate(() => window.__bb.tapButton("home:music"));
  expect((await storedSave(page)).settings, "a field of a later version stays").toEqual({ music: false, sfx: false, future: 7 });
  await put("delete s.muted; s.settings = { music: 5, sfx: 'no' };");
  await reloadGame(page);
  expect(await settings(page), "only false turns a switch off").toEqual({ music: true, sfx: true });
});

test("sounds off: nothing is logged as played; music off: no track — each switch is its own", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await page.waitForFunction(() => window.__bb.audio.track === "theme", null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__bb.audio.loaded.includes("hug"), null, { timeout: 30_000 });
  await page.keyboard.press("KeyM");                                            // the sounds off: the music goes on
  const n = await mark(page);
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); b.game.fx.push({ type: "sfx", name: "hug" }); b.update(b.CFG.STEP); });
  expect(await since(page, n), "nothing played").toEqual([]);
  expect(await page.evaluate(() => window.__bb.audio.track), "the music is not a sound").toBe("theme");
  await page.keyboard.press("KeyN");                                            // the music off too
  await page.waitForFunction(() => window.__bb.audio.track === null, null, { timeout: 10_000 });
  await page.keyboard.press("KeyM");                                            // the sounds on, the music still off
  await page.waitForTimeout(100);
  await page.evaluate(() => { const b = window.__bb; b.game.fx.push({ type: "sfx", name: "hug" }); b.update(b.CFG.STEP); });
  expect((await since(page, n)).map(e => e.name), "sounds on: the hug plays").toEqual(["hug"]);
  expect(await page.evaluate(() => window.__bb.audio.track), "music off: no track").toBe(null);
});

test("the grown-ups page has both switches, with the words of the spec in every language", async ({ page }) => {
  await openGame(page);
  const open = () => page.evaluate(() => { window.__bb.mode = "story"; window.__bb.grownUps.open(); }).then(() => page.evaluate(() => {
    const g = window.__bb.grownUps.gate, want = g.a * g.b;
    [...document.querySelectorAll("#gate button[data-act=answer]")].find(b => Number(b.textContent) === want).click();
  }));
  await open();
  const label = act => page.evaluate(a => document.querySelector(`#grownups [data-act="${a}"]`).textContent, act);
  expect([await label("music"), await label("sounds")]).toEqual(["Music: on", "Sounds: on"]);
  await page.click('#grownups [data-act="music"]');
  expect([await label("music"), await label("sounds")], "the page is drawn again").toEqual(["Music: off", "Sounds: on"]);
  await page.click('#grownups [data-act="sounds"]');
  expect(await settings(page)).toEqual({ music: false, sfx: false });
  expect([await label("music"), await label("sounds")]).toEqual(["Music: off", "Sounds: off"]);
  expect((await storedSave(page)).settings).toEqual({ music: false, sfx: false });
  const words = await page.evaluate(() => Object.fromEntries(["en", "es", "pt", "ru"].map(l => { const I = window.__bb.I18N[l]; return [l, [I.musicOn, I.musicOff, I.soundsOn, I.soundsOff]]; })));
  expect(words).toEqual({
    en: ["Music: on", "Music: off", "Sounds: on", "Sounds: off"],
    es: ["Música: sí", "Música: no", "Sonidos: sí", "Sonidos: no"],
    pt: ["Música: ligada", "Música: desligada", "Sons: ligados", "Sons: desligados"],
    ru: ["Музыка: вкл", "Музыка: выкл", "Звуки: вкл", "Звуки: выкл"]
  });
});

test("on iPhone the audio session is ambient (the silent switch mutes the game) — set when the engine starts, not before", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "audioSession", { configurable: true, value: { type: "auto" } }); });
  await openGame(page);
  expect(await page.evaluate(() => navigator.audioSession.type), "untouched before a gesture").toBe("auto");
  await gesture(page);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe("ambient");
});

test("the background pauses the music elements and suspends the context; the first gesture plays both again; a hidden tab starts nothing", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await page.waitForFunction(() => window.__bb.audio.track === "theme", null, { timeout: 20_000 });
  const time = () => page.evaluate(() => window.__bb.audio.music.time);
  const t0 = await time();
  await page.waitForFunction(t => window.__bb.audio.music.time > t + 0.4, t0, { timeout: 10_000 });
  await hide(page);
  await page.waitForFunction(() => window.__bb.audio.musicPaused && window.__bb.audioContext().state === "suspended");
  const t1 = await time();
  await page.waitForTimeout(700);
  expect(await time(), "the element does not run in the background").toBeCloseTo(t1, 1);
  expect(await page.evaluate(() => window.__bb.audio.track), "it is still the track of the screen").toBe("theme");
  await show(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__bb.audio.musicPaused), "no gesture yet: still paused").toBe(true);
  expect(await time(), "and still silent").toBeCloseTo(t1, 1);
  await page.mouse.click(5, 5);                                                 // the first gesture
  await page.waitForFunction(() => !window.__bb.audio.musicPaused && window.__bb.audioContext().state === "running");
  await page.waitForFunction(t => window.__bb.audio.music.time > t + 0.4, t1, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__bb.audio.track)).toBe("theme");
});

test("Enter and the pad's A pressing a menu button sound like a tap", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await page.waitForFunction(() => window.__bb.audio.loaded.includes("tap"), null, { timeout: 30_000 });
  await page.evaluate(() => window.__bb.toHome());
  await frames(page);
  let n = await mark(page);
  await page.keyboard.press("Enter");                                           // Play
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  expect((await since(page, n)).map(e => e.name)).toEqual(["tap"]);
  await page.evaluate(() => window.__bb.toHome());
  await frames(page);
  await page.waitForTimeout(100);
  n = await mark(page);
  await page.evaluate(() => {
    window.__press = k => { window.__pads = [{ index: 0, mapping: "standard", axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
    window.__press(-1);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  await frames(page);
  await page.evaluate(() => window.__press(0));                                 // A
  await frames(page);
  await page.evaluate(() => window.__press(-1));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
  expect((await since(page, n)).map(e => e.name)).toEqual(["tap"]);
});

// the three corner icons of the home screen (language, music, sounds) fit: no overlap, inside the screen, above the column, clear of the title.
// 667×375 is the smallest phone the tests draw; CI draws text with a wider font (PW_FONT=ci reproduces it)
for (const [w, h] of [[667, 375], [844, 390]]) {
  test.describe(`home corner icons ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test(`language, music and sounds fit beside the title and the column (${w})`, async ({ page }) => {
      await openGame(page, { query: "?phone=1" });
      await page.evaluate(() => window.__bb.toHome());
      await frames(page); await frames(page);
      const d = await page.evaluate(() => ({ b: window.__bb.buttonRects, hud: window.__bb.hudRects, ui: window.__bb.uiSize, off: window.__bb.audio.settings }));
      const rect = id => d.b.find(q => q.id === id), icons = ["home:lang", "home:music", "home:sound"].map(rect), play = rect("home:play"), title = d.hud.find(q => q.id === "home:title");
      expect(icons.every(Boolean), "three icons").toBe(true);
      const hit = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
      for (let i = 0; i < 3; i++) {
        expect(icons[i].x, "inside the screen (left)").toBeGreaterThanOrEqual(0);
        expect(icons[i].x + icons[i].w, "inside the screen (right)").toBeLessThanOrEqual(d.ui.w + 0.5);
        expect(icons[i].w * d.ui.scale, `icon ${i} is at least 40 css px wide`).toBeGreaterThanOrEqual(40);
        expect(icons[i].h * d.ui.scale, `icon ${i} is at least 40 css px high`).toBeGreaterThanOrEqual(40);
        expect(icons[i].y + icons[i].h, "above the column").toBeLessThanOrEqual(play.y + 0.5);
        for (let j = i + 1; j < 3; j++) expect(hit(icons[i], icons[j]), `icons ${i} and ${j} do not overlap`).toBe(false);
        if (title) expect(hit(icons[i], title), `icon ${i} clear of the title`).toBe(false);
      }
      // the order: language, music, sounds from the left
      expect(icons[0].x < icons[1].x && icons[1].x < icons[2].x).toBe(true);
    });
  });
}
