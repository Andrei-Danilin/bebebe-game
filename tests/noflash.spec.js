// SPEC-048: no flashes between screens. A screen opens only when its big pictures are ready (at most LOOK.ART_WAIT s: then its fallback and a fade-in), the next
// screen's pictures load while the current one is on, the "New here!" card comes after Play and never shares the screen with the level card, the Dad's anger plate has
// the same padding on both sides and Dad's name tag stays off the team chips. The transition tests run on a phone viewport with an empty cache, a 4x CPU slowdown
// (CDP Emulation.setCPUThrottlingRate) and a slow network (each big picture waits SLOW_MS), with the game's frame recorder (__bb.recordFrames / __bb.frameLog).
const { test, expect } = require("./pw");
const { openGame, frames, step } = require("./helpers");

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
