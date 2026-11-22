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
