// SPEC-005: phone mode (camera follows the hero, mini-map, big controls).
// Phone tests run at 844×390 with touch + isMobile and ?phone=1; the desktop test checks that nothing changed.
const { test, expect } = require("@playwright/test");
const { openGame, step, frames } = require("./helpers");

const PHONE_CTX = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true };

// Values captured on master (before SPEC-005) at the default 960×640 desktop viewport.
// World points [x, y, heightPx] → toScreen() in logic px.
const DESKTOP_POINTS = [[0, 0, 0], [960, 0, 0], [0, 640, 0], [960, 640, 0], [480, 320, 0], [480, 320, 64], [100, 500, 32], [800, 120, 0]];
const DESKTOP_SCREEN = [
  { x: 99.83715668718268, y: 85.14888227230031 },
  { x: 860.1628433128174, y: 85.14888227230031 },
  { x: 9.099697987318773, y: 588.5281544547659 },
  { x: 950.9003020126813, y: 588.5281544547659 },
  { x: 480, y: 310.00422517923886 },
  { x: 480, y: 282.98986603193464 },
  { x: 117.63620614419895, y: 448.20869186679033 },
  { x: 742.9417843159163, y: 164.20190787070385 }
];
// Camera in 3D units (1 unit = 1 cell): position and look-at target; target also in world px.
const DESKTOP_CAMERA = {
  pos3: { x: 15, y: 37.77867662558686, z: 29.64919718895682 },
  look3: { x: 15, y: 0, z: 10.4 },
  target: { x: 480, y: 332.8 }
};

const close = (a, b, eps) => Math.abs(a - b) <= eps;

async function snapshot(page) {
  return page.evaluate(pts => ({
    screen: pts.map(([x, y, h]) => window.__bb.toScreen(x, y, h)),
    camera: window.__bb.camera
  }), DESKTOP_POINTS);
}

function expectDesktop(snap) {
  snap.screen.forEach((p, i) => {
    expect(close(p.x, DESKTOP_SCREEN[i].x, 0.01), `toScreen x of point ${i}: ${p.x}`).toBe(true);
    expect(close(p.y, DESKTOP_SCREEN[i].y, 0.01), `toScreen y of point ${i}: ${p.y}`).toBe(true);
  });
  for (const k of ["x", "y", "z"]) {
    expect(close(snap.camera.pos3[k], DESKTOP_CAMERA.pos3[k], 0.001), `camera pos3.${k}: ${snap.camera.pos3[k]}`).toBe(true);
    expect(close(snap.camera.look3[k], DESKTOP_CAMERA.look3[k], 0.001), `camera look3.${k}: ${snap.camera.look3[k]}`).toBe(true);
  }
  expect(close(snap.camera.target.x, DESKTOP_CAMERA.target.x, 0.01)).toBe(true);
  expect(close(snap.camera.target.y, DESKTOP_CAMERA.target.y, 0.01)).toBe(true);
}

test.describe("desktop", () => {
  test("desktop camera and layout are unchanged", async ({ page }) => {
    const errors = await openGame(page);
    expect(await page.evaluate(() => window.__bb.phone)).toBe(false);
    await frames(page);
    expectDesktop(await snapshot(page));        // menu
    await page.evaluate(() => {
      const b = window.__bb;
      b.startGame(1);
      Object.assign(b.big, { state: "look", timer: 999 });   // спокойный Большой — без тряски камеры
    });
    await step(page, 2);
    await frames(page);
    expectDesktop(await snapshot(page));        // play
    expect(errors).toEqual([]);
  });

  test("?phone=0 keeps desktop mode", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=0" });
    expect(await page.evaluate(() => window.__bb.phone)).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe("phone detection", () => {
  test.use(PHONE_CTX);

  test("?phone=1 turns phone mode on", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    expect(await page.evaluate(() => window.__bb.phone)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("a touch device with a small screen is a phone without the query", async ({ page }) => {
    const errors = await openGame(page);
    const s = await page.evaluate(() => ({ w: screen.width, h: screen.height }));
    expect(Math.min(s.w, s.h)).toBeLessThanOrEqual(500);   // Playwright's screen follows the viewport
    expect(await page.evaluate(() => window.__bb.phone)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("?phone=0 overrides a phone-sized touch device", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=0" });
    expect(await page.evaluate(() => window.__bb.phone)).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe("tablet", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("an iPad-sized touch screen is not a phone", async ({ page }) => {
    await openGame(page);
    expect(await page.evaluate(() => window.__bb.phone)).toBe(false);
  });
});

// AC 2: in phone mode both canvases fill playArea() (no letterbox), the UI layer has its own size (PHONE_UI_H × aspect).
for (const [vw, vh] of [[667, 375], [844, 390], [932, 430]]) {
  test.describe(`phone ${vw}×${vh}`, () => {
    test.use({ ...PHONE_CTX, viewport: { width: vw, height: vh } });

    test(`phone mode fills the screen at ${vw}×${vh}`, async ({ page }) => {
      const errors = await openGame(page, { query: "?phone=1" });
      await frames(page);
      // playArea() = body minus safe-area padding (no insets in the test browser → the viewport)
      const area = await page.evaluate(() => {
        const b = document.body, cs = getComputedStyle(b);
        return { w: b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) };
      });
      expect(area).toEqual({ w: vw, h: vh });
      for (const sel of ["#game", "#gl"]) {
        const box = await page.locator(sel).boundingBox();
        expect(Math.abs(box.x), `${sel} x`).toBeLessThanOrEqual(1);
        expect(Math.abs(box.y), `${sel} y`).toBeLessThanOrEqual(1);
        expect(Math.abs(box.width - area.w), `${sel} width ${box.width}`).toBeLessThanOrEqual(1);
        expect(Math.abs(box.height - area.h), `${sel} height ${box.height}`).toBeLessThanOrEqual(1);
      }
      const ui = await page.evaluate(() => window.__bb.uiSize);
      expect(ui.h).toBe(420);
      expect(Math.abs(ui.w - 420 * ui.cssW / ui.cssH)).toBeLessThanOrEqual(1);
      expect(Math.abs(ui.cssW - vw)).toBeLessThanOrEqual(1);
      expect(Math.abs(ui.cssH - vh)).toBeLessThanOrEqual(1);
      expect(Math.abs(ui.scale - ui.cssW / ui.w)).toBeLessThan(1e-9);
      // 3D follows the canvas shape: no stretching
      const cam = await page.evaluate(() => window.__bb.camera);
      expect(Math.abs(cam.aspect - ui.cssW / ui.cssH)).toBeLessThan(1e-6);
      // pointers map CSS px → UI px
      for (const [cx, cy] of [[0, 0], [vw / 2, vh / 2], [vw - 1, vh - 1], [100, 300]]) {
        const p = await page.evaluate(([x, y]) => window.__bb.toGame({ clientX: x, clientY: y }), [cx, cy]);
        expect(Math.abs(p.x - cx * ui.w / ui.cssW), `x of ${cx}`).toBeLessThan(0.01);
        expect(Math.abs(p.y - cy * ui.h / ui.cssH), `y of ${cy}`).toBeLessThan(0.01);
      }
      // a real tap on the pause button (UI rect → CSS px) hits it
      await page.evaluate(() => { window.__bb.startGame(1); });
      await frames(page);
      const pause = (await page.evaluate(() => window.__bb.buttonRects)).find(b => b.text === "II");
      await page.touchscreen.tap((pause.x + pause.w / 2) * ui.scale, (pause.y + pause.h / 2) * ui.scale);
      expect(await page.evaluate(() => window.__bb.mode)).toBe("pause");
      // every screen draws without errors (layouts come in step 6)
      for (const m of ["menu", "skins", "names", "shop", "play", "pause", "win", "lose"]) {
        await page.evaluate(v => { window.__bb.mode = v; }, m);
        await frames(page);
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe("phone resize", () => {
  test.use(PHONE_CTX);

  test("the UI size follows a resize of the phone screen", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.setViewportSize({ width: 667, height: 375 });
    await frames(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    expect(ui.h).toBe(420);
    expect(ui.w).toBe(Math.round(420 * 667 / 375));
    expect(Math.abs(ui.cssW - 667)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

test.describe("desktop UI size", () => {
  test("desktop UI space is the world size", async ({ page }) => {
    await openGame(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    expect({ w: ui.w, h: ui.h }).toEqual({ w: 960, h: 640 });
    expect(ui.cssW).toBe(960); expect(ui.cssH).toBe(640); expect(ui.scale).toBe(1);
  });
});
