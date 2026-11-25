// SPEC-025 AC 7c, 7d, 7e: input that cannot do two things at once or fire on its own.
// - AC 7c: no unhandled promise rejection in normal use (audio resume, fullscreen; the fullscreen act runs on pointerup);
// - AC 7d: a tap runs a button only if it belongs to the screen shown now (generations of the button list); nextLevel() never
//   goes past `unlocked`;
// - AC 7e: gamepads by Gamepad.index, players in the order the pads first connected; a pad lost during play pauses; the first
//   poll after a (re)connect fires no button edges; pads without the standard mapping are not used for buttons.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames, step, setupHug } = require("./helpers");

// CSS point of the centre of button `id` of this frame
const centre = (page, id) => page.evaluate(k => {
  const b = window.__bb, q = b.buttonRects.find(r => r.id === k), c = document.getElementById("game").getBoundingClientRect(), s = c.width / b.uiSize.w;
  return q ? { x: c.left + (q.x + q.w / 2) * s, y: c.top + (q.y + q.h / 2) * s } : null;
}, id);
// two pointerdowns (+ ups) on one point inside one task: one frame, one button list
const doubleTap = (page, at) => page.evaluate(p => {
  const cv = document.getElementById("game");
  for (const id of [11, 12]) cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: id, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerType: "touch", isPrimary: id === 11 }));
  for (const id of [11, 12]) cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: id, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerType: "touch" }));
}, at);

test("two taps in one frame on Next play the next level once", { tag: "@fast" }, async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__bb.startGame(1); window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 4.5);
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level, window.__bb.progress.worlds.park.unlocked])).toEqual(["win", 1, 2]);
  const next = await page.evaluate(() => window.__bb.buttonRects.find(r => r.id === "nextLevel").id);
  await doubleTap(page, await centre(page, next));
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level])).toEqual(["play", 2]);
});

test("nextLevel never goes past the unlocked level", async ({ page }) => {
  await openGame(page, { sim: true });
  // level 1 won (unlocked 2), but the test pretends the player is on level 2 already: Next would open level 3, which is locked
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.park.unlocked = 2; b.level = 2; b.mode = "win"; });
  await page.evaluate(() => { window.__bb.nextLevel(); });
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level])).toEqual(["map", 2]);
});

test("two taps in one frame on a wardrobe price arm it, they do not buy", async ({ page }) => {
  await openGame(page);
  const W = await page.evaluate(() => window.__bb.wardrobe());
  const n = W.hat.findIndex(q => q.id === "crown") - W.hat.findIndex(q => q.id === "cap");
  await page.evaluate(k => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.progress.coins = 500; b.cycleOutfit("p1", "hat", k); }, n);
  await frames(page);
  await doubleTap(page, await centre(page, "buy-look:p1"));
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.progress.owned.hats, window.__bb.progress.coins])).toEqual([[], 500]);
  expect(await page.evaluate(() => window.__bb.hudRects.map(h => h.id))).toContain("look-note:p1");   // "Tap again to buy"
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a session makes no unhandled promise rejection; fullscreen runs on pointerup", async ({ page }) => {
    await page.addInitScript(() => {
      window.__rejections = []; addEventListener("unhandledrejection", e => window.__rejections.push(String(e.reason)));
      // which event runs the fullscreen request (the real one may refuse headless: its promise must be caught either way)
      window.__fsCalls = [];
      const real = Element.prototype.requestFullscreen;
      Element.prototype.requestFullscreen = function (...a) { window.__fsCalls.push(window.event && window.event.type); return real.apply(this, a); };
    });
    const errors = await openGame(page);
    await frames(page);
    const tap = async id => { const p = await centre(page, id); await page.touchscreen.tap(p.x, p.y); await frames(page); };
    await tap("home:sound"); await tap("home:sound");                    // sound off and on (the audio context starts)
    await page.evaluate(() => { window.__bb.openMap(); });
    await frames(page);
    await page.evaluate(() => { window.__bb.startGame(1); });
    await frames(page);
    // the fullscreen button: its act on the finger's release (pointerup is a user activation, a touch pointerdown is not)
    const p = await centre(page, "toggleFullscreen");
    expect(p, "the fullscreen button").not.toBeNull();
    await page.touchscreen.tap(p.x, p.y);
    await frames(page);
    await page.touchscreen.tap(p.x, p.y);
    await frames(page);
    await page.keyboard.press("Escape");                                 // pause
    await frames(page);
    await page.evaluate(() => { window.__bb.toMap(); });
    await frames(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__rejections)).toEqual([]);
    const calls = await page.evaluate(() => window.__fsCalls);
    expect(calls.length, "the fullscreen button was pressed").toBeGreaterThan(0);
    expect(calls.every(t => t === "pointerup"), `run on pointerup: ${calls}`).toBe(true);
    expect(await page.evaluate(() => window.__bb.errorLog)).toEqual([]);
    expect(errors.filter(e => !/fullscreen/i.test(e))).toEqual([]);
  });
});

// ---------- AC 7e: gamepads ----------
// window.__pads: the stubbed list navigator.getGamepads() returns; pad(index, pressed buttons, mapping)
async function stubPads(page) {
  await page.evaluate(() => {
    window.__pad = (index, down = [], mapping = "standard", id = "pad") => ({ index, id, mapping, connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: down.includes(k), value: down.includes(k) ? 1 : 0 })) });
    window.__pads = [];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
}
const kissed = page => page.evaluate(() => window.__bb.littles.slice(0, 2).map(l => l.kissCd > 0));

test("gamepads by index: a pad lost in a 2-player game pauses, comes back in another slot for the same player", { tag: "@fast" }, async ({ page }) => {
  await openGame(page);
  await stubPads(page);
  await page.evaluate(() => { window.__pads = [window.__pad(0, [], "standard", "A"), window.__pad(1, [], "standard", "B")]; });
  await frames(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.inv.kisses = 9; b.startGame(2); b.big.noPush = 999; b.big.state = "look"; b.big.timer = 999; b.littles.forEach((l, i) => { Object.assign(l, { kissCd: 0, x: 400 + i * 80, y: 320 }); }); });   // out of the house: no kisses from there
  await frames(page);
  // pad 0 drops: the game pauses; pad 1 still belongs to player 2
  await page.evaluate(() => { window.__pads = [null, window.__pad(1, [], "standard", "B")]; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode), "a player lost his pad").toBe("pause");
  await page.evaluate(() => { window.__bb.mode = "play"; window.__pads = [null, window.__pad(1, [2], "standard", "B")]; });   // X = kiss
  await frames(page);
  expect(await kissed(page), "pad 1 is still player 2").toEqual([false, true]);
  // pad A comes back at index 2: player 1 again, and a button held while it reconnects fires nothing
  await page.evaluate(() => { window.__bb.littles.forEach(l => { l.kissCd = 0; }); window.__pads = [null, window.__pad(1, [], "standard", "B"), window.__pad(2, [2], "standard", "A")]; });
  await frames(page);
  expect(await kissed(page), "held at reconnect: no edge").toEqual([false, false]);
  await page.evaluate(() => { window.__pads[2] = window.__pad(2, [], "standard", "A"); });
  await frames(page);
  await page.evaluate(() => { window.__pads[2] = window.__pad(2, [2], "standard", "A"); });
  await frames(page);
  expect(await kissed(page), "the reconnected pad drives player 1").toEqual([true, false]);
  await page.evaluate(() => { window.__pads = []; delete navigator.getGamepads; });
});

test("a button held while a pad reconnects on the win screen does not press Next; non-standard pads press nothing", async ({ page }) => {
  await openGame(page);
  await stubPads(page);
  await page.evaluate(() => { window.__pads = [window.__pad(0)]; });
  await frames(page);
  await page.evaluate(() => { window.__bb.startGame(1); window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 4.5);
  await page.evaluate(() => { window.__pads = []; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode), "the pad was lost after the win: no pause").toBe("win");
  await page.evaluate(() => { window.__pads = [window.__pad(0, [0])]; });   // A held while it comes back
  await frames(page); await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level])).toEqual(["win", 1]);
  // a pad without the standard mapping: A means nothing
  await page.evaluate(() => { window.__pads = [window.__pad(0, [], "standard"), window.__pad(1, [], "")]; });
  await frames(page);
  await page.evaluate(() => { window.__pads = [window.__pad(0, [], "standard"), window.__pad(1, [0], "")]; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("win");
  // the standard one: A = Next
  await page.evaluate(() => { window.__pads = [window.__pad(0, [0], "standard"), window.__pad(1, [], "")]; });
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level])).toEqual(["play", 2]);
  await page.evaluate(() => { window.__pads = []; delete navigator.getGamepads; });
});
