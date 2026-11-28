// SPEC-048: no flashes between screens. A screen opens only when its big pictures are ready (at most LOOK.ART_WAIT s: then its fallback and a fade-in), the next
// screen's pictures load while the current one is on, the "New here!" card comes after Play and never shares the screen with the level card, the Dad's anger plate has
// the same padding on both sides and Dad's name tag stays off the team chips. The transition tests run on a phone viewport with an empty cache, a 4x CPU slowdown
// (CDP Emulation.setCPUThrottlingRate) and a slow network (each big picture waits SLOW_MS), with the game's frame recorder (__bb.recordFrames / __bb.frameLog).
const { test, expect } = require("./pw");
const { openGame, step } = require("./helpers");

const PHONE = { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true };
const SLOW_MS = 250;                                  // under LOOK.ART_WAIT (600 ms): every picture is reachable within the wait
// the big (lazy) pictures: the sheets, the story comics, the tip sheets, the map pages, the houses of the level card and the tip's icons
const BIG = /\/assets\/(tutorial_|howto_card|story_|tips_|map_bg_|house_|ui_(puddle|sprinkler|truck|bell|wave|snowprints)|item_(football|paperplane|watermelon|snowball))[a-z_]*\.webp$/;

// a slow network for the big pictures (delay, then the file) — set before the page opens
async function slowNet(page, ms = SLOW_MS) {
  await page.route(BIG, async route => { await new Promise(r => setTimeout(r, ms)); await route.continue(); });
}
async function slowCpu(page, rate = 4) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}
// everything that was asked for is in and the held screen (if any) is through, then a few more frames
const settle = page => page.evaluate(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(r));
  await raf(); await raf();
  for (const t0 = performance.now(); performance.now() - t0 < 15000;) { const a = window.__bb.artInfo; if (a.pending === 0 && !a.holding) break; await raf(); }
  for (let i = 0; i < 4; i++) await raf();
});
const press = async (page, key) => { await page.keyboard.press(key); await settle(page); };
// the practice game is won the normal way (as tutorial.spec.js does)
async function winPractice(page) {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { hp: 1, state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, dir: 0 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: big.x - 34, y: big.y });
  });
  await step(page, 6);
  await page.waitForFunction(() => window.__bb.mode === "scene", null, { timeout: 15000 });
  await settle(page);
}
// the screens the recorder saw, one per change
const changes = log => log.map(f => f.screen).filter((s, i, a) => i === 0 || s !== a[i - 1]);
// the drawn frames that lacked a picture, counted per screen and picture ("scene:tutorial_b:0 lacked tutorial_b × 5")
function missingFrames(log) {
  const n = new Map();
  for (const f of log) if (!f.held && f.missing.length && !f.late) { const k = `${f.screen} lacked ${f.missing.join()}`; n.set(k, (n.get(k) || 0) + 1); }
  return [...n].map(([k, c]) => `${k} × ${c}`);
}

test.describe("phone 667×375, empty cache, 4× CPU, slow network", () => {
  test.use(PHONE);

  test("the first launch path: no frame of a screen without its picture, and one clean change per screen", async ({ page }) => {
    test.setTimeout(180_000);
    await slowNet(page);
    const errors = await openGame(page, { intro: true, tutorial: true, query: "?phone=1", quality: "low" });
    await page.waitForFunction(() => window.__bb.artInfo.resident === window.__bb.artInfo.ok + window.__bb.artInfo.bad || window.__bb.artInfo.done, null, { timeout: 30000 });
    await slowCpu(page);
    await page.evaluate(() => window.__bb.recordFrames(true));
    await page.waitForFunction(() => window.__bb.mode === "scene", null, { timeout: 30000 });   // the intro comic opens by itself
    await settle(page);
    for (let i = 0; i < 4; i++) await press(page, "Enter");             // How it began: four panels → the How to play card
    await press(page, "Enter");                                          // Let's learn! → page A
    for (let i = 0; i < 4; i++) await press(page, "Enter");             // A1…A4 → practice game 1
    await winPractice(page);                                             // → page B
    for (let i = 0; i < 4; i++) await press(page, "Enter");             // B1…B4 → page C (the power-ups page → the kisses page)
    for (let i = 0; i < 4; i++) await press(page, "Enter");             // C1…C4 → practice game 2
    await winPractice(page);                                             // → the last page
    await press(page, "Enter");                                          // → the map
    const log = await page.evaluate(() => { const b = window.__bb; b.recordFrames(false); return b.frameLog; });
    expect(missingFrames(log), "frames drawn without a listed picture while it could be had within the wait").toEqual([]);
    const want = ["scene:intro:0", "scene:intro:1", "scene:intro:2", "scene:intro:3", "scene:tutorial_intro:0",
      ...[0, 1, 2, 3].map(i => `scene:tutorial_a:${i}`), "play", ...[0, 1, 2, 3].map(i => `scene:tutorial_b:${i}`), ...[0, 1, 2, 3].map(i => `scene:tutorial_c:${i}`),
      "play", "scene:tutorial_ready:0", "map:park"];
    const got = changes(log), at = got.indexOf("scene:intro:0");
    expect(got.slice(at), "the screens, each shown once, in order — no third screen between two").toEqual(want);
    expect(errors).toEqual([]);
  });
});

// a real finger on the button `id` of the frame drawn now
async function tap(page, id) {
  const at = await page.evaluate(k => {
    const b = window.__bb, q = b.buttonRects.find(r => r.id === k), c = document.getElementById("game").getBoundingClientRect(), s = b.uiSize.scale;
    return q && { x: c.left + (q.x + q.w / 2) * s, y: c.top + (q.y + q.h / 2) * s };
  }, id);
  expect(at, `button ${id} is on screen`).toBeTruthy();
  await page.touchscreen.tap(at.x, at.y);
}
const shownAt = (log, screen) => log.find(f => f.screen === screen && !f.held);

test.describe("the tip card after Play", () => {
  test.use(PHONE);

  test("level card → Play → the tip card alone and complete in one frame → OK → the level", async ({ page }) => {
    test.setTimeout(120_000);
    await slowNet(page);
    const errors = await openGame(page, { query: "?phone=1", quality: "low", tips: true });
    await page.evaluate(() => { window.__bb.mode = "map"; });
    await settle(page);
    await slowCpu(page);
    await page.evaluate(() => { window.__bb.recordFrames(true); });
    await page.evaluate(() => window.__bb.showCard(1));
    await settle(page);
    await tap(page, "card:play");
    await settle(page);
    const tip = await page.evaluate(() => ({ open: window.__bb.tipCard.open, play: window.__bb.tipCard.play, mode: window.__bb.mode, card: window.__bb.levelCard, ids: window.__bb.buttonRects.map(q => q.id) }));
    expect([tip.open, tip.play, tip.mode], "Play opens the tip, the level has not started").toEqual(["park", 1, "levelCard"]);
    expect(tip.card, "no level card drawn with it").toBeNull();
    expect(tip.ids.filter(i => i.startsWith("card:")), "none of its buttons").toEqual([]);
    await tap(page, "tip:ok");
    await settle(page);
    const log = await page.evaluate(() => { const b = window.__bb; b.recordFrames(false); return b.frameLog; });
    expect(missingFrames(log), "the tip card is never drawn without its picture").toEqual([]);
    expect(changes(log), "one change each: the card, the tip on its own, the level").toEqual(["map:park", "levelCard:park:1", "tip:park", "play"]);
    expect(errors).toEqual([]);
  });
});

test.describe("a picture that is slow, late or gone", () => {
  test.use(PHONE);

  test("a failed picture never blocks: howto_card 404 shows the card with its fallback within ART_WAIT", async ({ page }) => {
    await page.route(/\/assets\/howto_card\.webp$/, route => route.fulfill({ status: 404, body: "" }));
    const errors = await openGame(page, { query: "?phone=1", quality: "low" });
    await slowCpu(page);
    const r = await page.evaluate(async () => {
      const b = window.__bb, wait = b.CFG.ART_WAIT * 1000;
      b.recordFrames(true);
      const t0 = performance.now();
      b.openFirstTutorial();
      for (let i = 0; i < 400 && !b.frameLog.some(f => f.screen === "scene:tutorial_intro:0" && !f.held); i++) await new Promise(r => requestAnimationFrame(r));
      const log = b.frameLog, f = log.find(q => q.screen === "scene:tutorial_intro:0" && !q.held);
      return { ms: f ? f.t - t0 : null, wait, f, art: b.sceneInfo && b.sceneInfo.art };
    });
    expect(r.f, "the card was drawn").toBeTruthy();
    expect(r.ms, `shown ${r.ms} ms after the change`).toBeLessThanOrEqual(r.wait + 500);   // (+ the slowed CPU's frame)
    expect(r.f.missing, "a failed picture is not missing: the screen has its fallback").toEqual([]);
    expect(["fallback", "placeholder"]).toContain(r.art);
    expect(errors.filter(e => !/howto_card|Failed to load resource|404/.test(e))).toEqual([]);
  });

  test("a picture later than ART_WAIT: the new screen shows with its fallback at ART_WAIT, then the picture fades in over ART_FADE (never a hard pop)", async ({ page }) => {
    await slowNet(page, 1400);
    const errors = await openGame(page, { query: "?phone=1", quality: "low" });
    const r = await page.evaluate(async () => {
      const b = window.__bb, wait = b.CFG.ART_WAIT * 1000;
      b.recordFrames(true);
      const t0 = performance.now();
      b.openFirstTutorial();
      for (let i = 0; i < 600 && !(b.sceneInfo && b.sceneInfo.art === "image" && b.frameLog.at(-1).fade === 1); i++) await new Promise(r => requestAnimationFrame(r));
      return { wait, fade: b.CFG.ART_FADE * 1000, t0, log: b.frameLog, art: b.sceneInfo && b.sceneInfo.art };
    });
    const first = shownAt(r.log, "scene:tutorial_intro:0");
    expect(first, "the card was drawn").toBeTruthy();
    expect(first.late, "drawn when the wait ran out, with the picture missing").toBe(true);
    expect(first.t - r.t0, "after ART_WAIT, not before and not much after").toBeGreaterThanOrEqual(r.wait - 50);
    expect(first.t - r.t0).toBeLessThanOrEqual(r.wait + 300);
    expect(r.log.filter(f => f.held).length, "the old screen stayed on meanwhile").toBeGreaterThan(0);
    expect(r.art, "the picture came").toBe("image");
    const fades = r.log.filter(f => !f.held && f.screen === "scene:tutorial_intro:0" && f.missing.length === 0).map(f => f.fade);
    expect(fades.some(f => f > 0 && f < 1), `a frame between nothing and full (${fades.join()})`).toBe(true);
    expect(fades, "it only grows").toEqual([...fades].sort((a, b) => a - b));
    expect(errors).toEqual([]);
  });

  test("a double tap or key during a wait goes to nothing: no page is skipped", async ({ page }) => {
    test.setTimeout(90_000);
    await page.route(/\/assets\/tutorial_c\.webp$/, async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
    const errors = await openGame(page, { query: "?phone=1", quality: "low" });
    await page.evaluate(() => { const b = window.__bb; b.openTutorial("map", "b"); for (let i = 0; i < 3; i++) b.sceneNext(); });   // B4 (the sheet of C is on its way)
    await page.waitForFunction(() => window.__bb.sceneInfo && window.__bb.sceneInfo.art === "image" && window.__bb.artInfo.holding === false, null, { timeout: 10000 });   // B4 is drawn (not frames(): it would wait for C's slow sheet too)
    const page0 = await page.evaluate(() => window.__bb.scene);
    expect([page0.id, page0.page]).toEqual(["tutorial_b", 3]);
    await tap(page, "scene:next");                                     // → C1: the sheet is not in, the wait starts
    await page.waitForFunction(() => window.__bb.artInfo.holding, null, { timeout: 3000 });
    await tap(page, "scene:next");                                     // the double tap: goes to nothing
    await page.keyboard.press("Enter");                                // and so does a key
    await page.keyboard.press("Space");
    await settle(page);
    const s = await page.evaluate(() => ({ scene: window.__bb.scene, art: window.__bb.sceneInfo.art }));
    expect([s.scene.id, s.scene.page], "still on the first page of C").toEqual(["tutorial_c", 0]);
    await press(page, "Enter");                                        // a press after the change goes on as usual
    expect(await page.evaluate(() => window.__bb.scene.page)).toBe(1);
    expect(errors).toEqual([]);
  });
});
