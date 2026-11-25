// SPEC-005: phone mode (camera follows the hero, mini-map, big controls).
// Phone tests run at 844×390 with touch + isMobile and ?phone=1; the desktop test checks that nothing changed.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const { textFloor, LANGS, openGame, step, frames, sharedPage, resetGame } = require("./helpers");

// SPEC-018: the ?phone=1 tests share one game page per screen setup (fixture `phonePage`: viewport, touch, mobile)
// instead of a fresh page each. Before every test the page gets its viewport back, a name input left open is closed
// and resetGame() puts the game back to a freshly opened one (menu, Park 1, fresh progress, English). page.sharedErrors
// is its error list (each test checks it; the fixture checks and clears it too). A test that asks for `page` (a fresh
// page) first closes the shared one: a second open game page would make it 3–5× slower.
const shared = sharedPage();
const test = base.test.extend({
  page: async ({ page }, use) => { await shared.close(); await use(page); },
  phonePage: async ({ browser, viewport, hasTouch, isMobile }, use) => {
    const s = await shared.get(browser, JSON.stringify([viewport, hasTouch, isMobile]), { viewport, hasTouch, isMobile }, p => openGame(p, { query: "?phone=1" }));
    const size = s.page.viewportSize();
    if (size.width !== viewport.width || size.height !== viewport.height) { await s.page.setViewportSize(viewport); await frames(s.page); }
    if (await s.page.locator("input.name-input").count()) await s.page.keyboard.press("Escape");
    await resetGame(s.page);
    s.page.sharedErrors = s.errors;
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
  }
});
test.afterAll(async () => { await shared.close(); });

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
    camera: window.__bb.camera, shake: window.__bb.shake, mode: window.__bb.mode
  }), DESKTOP_POINTS);
}

function expectDesktop(snap) {
  const all = JSON.stringify(snap);   // the whole snapshot in every failure message
  snap.screen.forEach((p, i) => {
    expect(close(p.x, DESKTOP_SCREEN[i].x, 0.01), `toScreen x of point ${i}: ${p.x} — ${all}`).toBe(true);
    expect(close(p.y, DESKTOP_SCREEN[i].y, 0.01), `toScreen y of point ${i}: ${p.y} — ${all}`).toBe(true);
  });
  for (const k of ["x", "y", "z"]) {
    expect(close(snap.camera.pos3[k], DESKTOP_CAMERA.pos3[k], 0.001), `camera pos3.${k} — ${all}`).toBe(true);
    expect(close(snap.camera.look3[k], DESKTOP_CAMERA.look3[k], 0.001), `camera look3.${k} — ${all}`).toBe(true);
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
    const itemEvery = await page.evaluate(() => {
      const b = window.__bb, saved = b.CFG.ITEM_EVERY;
      b.startGame(1);
      // nothing may shake the camera: a calm Big One who pushes nobody, no items (a banana slip shakes it too)
      Object.assign(b.big, { state: "look", timer: 999, stun: 999, noPush: 999 });
      b.items.length = 0; b.CFG.ITEM_EVERY = [999, 999];
      return saved;
    });
    await step(page, 2);
    await page.waitForFunction(() => window.__bb.shake === 0);
    await frames(page);
    const snapPlay = await snapshot(page);
    await page.evaluate(v => { window.__bb.CFG.ITEM_EVERY = v; }, itemEvery);   // restore the live CFG
    expectDesktop(snapPlay);                    // play
    expect(errors).toEqual([]);
  });

  // The first requestAnimationFrame timestamp can be earlier than performance.now() at start-up (seen under load):
  // a negative dt grew the camera shake in the menu. The first frame here gets a timestamp 5 s early.
  test("an early first frame timestamp does not shake the camera", async ({ page }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      let first = true;
      window.requestAnimationFrame = cb => raf(t => { const e = first; first = false; cb(e ? t - 5000 : t); });
    });
    const errors = await openGame(page);
    await frames(page);
    expect(await page.evaluate(() => window.__bb.shake)).toBe(0);
    expectDesktop(await snapshot(page));
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

    test(`phone mode fills the screen at ${vw}×${vh}`, async ({ phonePage: page }) => {
      const errors = page.sharedErrors;
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
      for (const m of ["home", "map", "story", "shop", "play", "pause", "win", "lose"]) {
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
    expect(Math.abs(ui.w - 420 * 667 / 375)).toBeLessThan(0.01);
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

// AC 3: follow camera. Level 1, 844×390. The Big One is stunned so nobody gets pushed.
// (on the shared phone page: `phonePage`)
async function phonePlay(page) {
  const errors = page.sharedErrors;
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); Object.assign(b.big, { state: "look", timer: 999, stun: 999 }); });
  return errors;
}
// pins everything that moves for the edge-arrow tests: the Big One calm and looking (no walking, no push), every bot
// resting in the house with a long rest (not "ok": no hugs that could win the level, nobody helps a downed friend up)
async function calmAll(page) {
  await page.evaluate(() => {
    const b = window.__bb;
    Object.assign(b.big, { state: "look", timer: 999, stun: 999 });
    for (const l of b.littles) if (l.kind !== "player") Object.assign(l, { state: "rest", restTimer: 999, moving: false, kx: 0, ky: 0 });
  });
}
// puts the hero at (x, y), not moving, and snaps the camera to him
async function placeHero(page, x, y) {
  await page.evaluate(([x, y]) => { const l = window.__bb.littles[0]; Object.assign(l, { x, y, kx: 0, ky: 0, moving: false }); window.__bb.camSnap(); }, [x, y]);
}
// logic steps + the camera (it runs in the main loop, not in update)
async function stepCam(page, seconds) {
  await page.evaluate(sec => { for (let i = 0; i < Math.round(sec * 60); i++) { window.__bb.update(1 / 60); window.__bb.updateCamera(1 / 60); } }, seconds);
}
const heroScreen = page => page.evaluate(() => { const l = window.__bb.littles[0]; return window.__bb.toScreen(l.x, l.y); });
const EPS = 0.5;

test.describe("phone camera", () => {
  test.use(PHONE_CTX);

  test("the camera follows the hero and stops at the map edges", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    // visible ground ≈ 10 rows tall (the bounding box of the visible trapezoid), width from the aspect
    let cam = await page.evaluate(() => window.__bb.camera);
    expect(cam.zoom).toBe(0);
    expect(Math.abs(cam.rect.h / 32 - 10)).toBeLessThan(0.5);
    expect(cam.rect.w / cam.rect.h).toBeGreaterThan(ui.cssW / ui.cssH * 0.9);
    expect(cam.rect.w / cam.rect.h).toBeLessThan(ui.cssW / ui.cssH * 1.2);
    // at the start the hero is in his house in the top-left corner: the view stops at the edge — 1 cell beyond it, more only
    // as far as needed to keep him clear of the screen side and the top bar (at most CAM_EDGE_MAX cells in all)
    const lim = await page.evaluate(() => window.__bb.CFG.CAM_EDGE_MAX * 32);   // never more than CAM_EDGE_MAX cells beyond the edge
    expect(cam.rect.x).toBeGreaterThanOrEqual(-lim - EPS); expect(cam.rect.x).toBeLessThanOrEqual(-32 + EPS);
    expect(cam.rect.y).toBeGreaterThanOrEqual(-lim - EPS); expect(cam.rect.y).toBeLessThanOrEqual(-32 + EPS);
    let s = await heroScreen(page);
    expect(s.x).toBeLessThan(ui.w / 3); expect(s.x).toBeGreaterThan(36 / ui.scale - EPS);
    expect(s.y).toBeLessThan(ui.h / 2);
    // walking down the clear column x = 560 in the middle: the hero stays in the centre third.
    // SPEC-018: deterministic — the bots rest (no bumps) and the walk is one evaluate (key down, logic + camera steps,
    // key up), so the real frame loop cannot add steps under load (it used to: flaky "under load")
    await calmAll(page);
    await placeHero(page, 560, 180);
    const walk = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0], key = down => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code: "KeyS" }));
      const at = [];
      key(true);
      try {
        for (let i = 0; i < 6; i++) {
          for (let k = 0; k < 15; k++) { b.update(1 / 60); b.updateCamera(1 / 60); }   // 0.25 s
          at.push(b.toScreen(l.x, l.y));
        }
        return { at, y: l.y, target: b.camera.target };
      } finally { key(false); }
    });
    walk.at.forEach((p, i) => {
      expect(p.x, `x at ${i}`).toBeGreaterThan(ui.w / 3); expect(p.x).toBeLessThan(ui.w * 2 / 3);
      expect(p.y, `y at ${i}`).toBeGreaterThan(ui.h / 3); expect(p.y).toBeLessThan(ui.h * 2 / 3);
    });
    expect(walk.y).toBeGreaterThan(330);                         // he really walked
    expect(walk.target.y).toBeGreaterThan(walk.y);               // look-ahead: the camera is ahead of him
    // bottom-right corner (inside the building): the view clamps at the map edge, hero off-centre towards the corner
    await placeHero(page, 880, 560);
    await stepCam(page, 2);
    cam = await page.evaluate(() => window.__bb.camera);
    expect(cam.rect.x + cam.rect.w).toBeLessThanOrEqual(960 + lim + EPS);
    expect(cam.rect.y + cam.rect.h).toBeLessThanOrEqual(640 + 32 + EPS);
    expect(cam.rect.x + cam.rect.w).toBeGreaterThan(960 + 32 - 2);   // at the edge, not short of it
    s = await heroScreen(page);
    expect(s.x).toBeGreaterThan(ui.w * 2 / 3); expect(s.x).toBeLessThan(ui.w - 36 / ui.scale + EPS);   // off-centre, but fully on screen
    expect(s.y).toBeGreaterThan(ui.h / 2);
    expect(errors).toEqual([]);
  });

  test("the camera smoothing does not depend on the frame rate", async ({ phonePage: page }) => {
    await phonePlay(page);
    const run = dt => page.evaluate(dt => {
      const b = window.__bb, l = b.littles[0];
      Object.assign(l, { x: 500, y: 250, moving: false }); b.camSnap();
      Object.assign(l, { x: 600, y: 400 });
      for (let i = 0; i < Math.round(0.5 / dt); i++) b.updateCamera(dt);
      return b.camera.target;
    }, dt);
    const a = await run(1 / 30), c = await run(1 / 120);
    expect(Math.abs(a.x - c.x)).toBeLessThan(0.5);
    expect(Math.abs(a.y - c.y)).toBeLessThan(0.5);
    expect(a.x).toBeGreaterThan(500 + 50);    // and it really moved most of the way (1 - e^-3 ≈ 95 %)
  });

  test("the camera stays on a downed or resting hero (no look-ahead)", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 480, 260);
    // walking right: the camera runs ahead of him
    await page.keyboard.down("KeyD");
    await stepCam(page, 1);
    let cam = await page.evaluate(() => window.__bb.camera);
    expect(cam.ahead.x).toBeGreaterThan(20);
    // pushed down while the key is still held: look-ahead drops, the camera settles on him
    // (one evaluate: the state change and the steps, so no real frame runs in between)
    const st = await page.evaluate(() => {
      const b = window.__bb, h = b.littles[0];
      Object.assign(h, { state: "down", downTimer: 18, rescue: 0 });
      for (let i = 0; i < 120; i++) { b.update(1 / 60); b.updateCamera(1 / 60); }
      return h.state;
    });
    expect(st).toBe("down");
    cam = await page.evaluate(() => window.__bb.camera);
    let l = await heroPos(page);
    expect(Math.hypot(cam.ahead.x, cam.ahead.y)).toBeLessThan(1);
    expect(Math.abs(cam.target.x - l.x)).toBeLessThan(3);
    expect(Math.abs(cam.target.y - l.y)).toBeLessThan(3);
    // resting in the house (top-left corner): no look-ahead, the view clamps there and he is on screen, not under the HUD
    await page.evaluate(() => { const b = window.__bb, z = b.safeZone; Object.assign(b.littles[0], { state: "rest", restTimer: 100, x: z.x + z.w / 2, y: z.y + z.h / 2 }); });
    await stepCam(page, 3);
    await page.keyboard.up("KeyD");
    cam = await page.evaluate(() => window.__bb.camera);
    expect(Math.hypot(cam.ahead.x, cam.ahead.y)).toBeLessThan(1);
    const s = await heroScreen(page), ui = await page.evaluate(() => window.__bb.uiSize);
    expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(ui.w); expect(s.y).toBeGreaterThan(0); expect(s.y).toBeLessThan(ui.h);
    expect(errors).toEqual([]);
  });

  test("a hero in a top-right house is not hidden under the mini-map, team chips or top bar", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.beach.unlocked = 20; b.world = "beach"; b.level = 12; b.startGame(1); Object.assign(b.big, { stun: 999 }); });   // rooms, the house top-right
    await frames(page);
    const d = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0];
      return { z: b.safeZone, feet: b.toScreen(l.x, l.y), head: b.toScreen(l.x, l.y, 72), mm: b.minimap, hud: b.hudRects, ui: b.uiSize };
    });
    expect(d.z.x).toBeGreaterThan(600); expect(d.z.y).toBeLessThan(100);        // the house really is top-right
    const team = d.hud.find(h => h.id === "team"), bar = d.hud.find(h => h.id === "hearts");
    const cx = Math.min(d.mm.x, team.x);   // SPEC-010: the chips plate is wider than the small mini-map
    const blocked = [{ x: cx, y: 0, w: d.ui.w - cx, h: team.y + team.h }, { x: 0, y: 0, w: d.ui.w, h: bar.y + bar.h }];
    for (const p of [d.feet, d.head]) for (const r of blocked) {
      expect(p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h, `hero point ${JSON.stringify(p)} under ${JSON.stringify(r)}`).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  test("the follow goal changes smoothly when the hero walks the top-right diagonal", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await frames(page);
    const r = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0], out = [];
      for (let k = 0; k <= 60; k++) {             // from the middle-right to the top-right corner, 4 px steps on each axis
        Object.assign(l, { x: 700 + k * 4, y: 260 - k * 4, moving: false });
        b.camSnap();                              // the camera goes straight to its follow goal
        out.push(b.camera.target);
      }
      return out;
    });
    let worst = 0;
    for (let i = 1; i < r.length; i++) worst = Math.max(worst, Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y));
    expect(worst, "largest jump of the camera goal for a 5.7 px step").toBeLessThan(20);
    expect(errors).toEqual([]);
  });

  test("after the win the camera zooms out to the whole map, the next level snaps back", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await page.evaluate(() => { window.__bb.mode = "win"; });
    const mid = await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__bb.updateCamera(1 / 60); return window.__bb.camera; });
    expect(mid.zoom).toBeGreaterThan(0); expect(mid.zoom).toBeLessThan(1);   // smooth, not a jump
    const cam = await page.evaluate(() => { for (let i = 0; i < 120; i++) window.__bb.updateCamera(1 / 60); return window.__bb.camera; });
    expect(cam.zoom).toBe(1);
    expect(cam.rect.x).toBeLessThanOrEqual(0); expect(cam.rect.y).toBeLessThanOrEqual(0);
    expect(cam.rect.x + cam.rect.w).toBeGreaterThanOrEqual(960); expect(cam.rect.y + cam.rect.h).toBeGreaterThanOrEqual(640);
    await page.evaluate(() => window.__bb.startGame(1));
    const next = await page.evaluate(() => window.__bb.camera);
    expect(next.zoom).toBe(0);
    expect(Math.abs(next.rect.h / 32 - 10)).toBeLessThan(0.5);
    await frames(page);
    expect(errors).toEqual([]);
  });
});

// Touch helper: dispatches pointer events (pointerType "touch") at UI points, converted to CSS px with uiSize.
async function touch(page, type, x, y, id = 7) {
  await page.evaluate(([type, x, y, id]) => {
    const c = document.getElementById("game"), bb = c.getBoundingClientRect(), s = window.__bb.uiSize.scale;
    c.dispatchEvent(new PointerEvent(type, { clientX: bb.left + x * s, clientY: bb.top + y * s, pointerId: id, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
  }, [type, x, y, id]);
}
const heroPos = page => page.evaluate(() => ({ x: window.__bb.littles[0].x, y: window.__bb.littles[0].y }));

test.describe("phone controls", () => {
  test.use(PHONE_CTX);

  test("joystick appears under the finger on the left only", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    await frames(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    const R = await page.evaluate(() => window.__bb.stickR());
    expect(Math.abs(R * ui.scale - 60)).toBeLessThan(0.01);          // base radius 60 CSS px
    // left part: the stick is created under the finger
    await touch(page, "pointerdown", 150, 300);
    let st = await page.evaluate(() => window.__bb.sticks);
    expect(st.length).toBe(1);
    expect(Math.abs(st[0].ox - 150)).toBeLessThan(0.5); expect(Math.abs(st[0].oy - 300)).toBeLessThan(0.5);
    await touch(page, "pointermove", 150 + R * 0.6, 300);           // a bit to the right
    // one evaluate, so the real frame loop does not add steps in between
    const walk = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0], x0 = l.x, y0 = l.y, C = b.CFG;
      for (let i = 0; i < 30; i++) b.update(1 / 60);
      return { dx: l.x - x0, dy: l.y - y0, share: 0.6 < C.TIPTOE_MAX ? C.TIPTOE_MULT * 0.6 / C.TIPTOE_MAX : 0.6 };   // SPEC-019: tilt below the ring tiptoes
    });
    expect(walk.dx).toBeGreaterThan(150 * 0.5 * walk.share - 2);       // he walks right at the speed the stick says
    expect(walk.dx).toBeLessThan(150 * 0.5 * walk.share + 2);
    expect(Math.abs(walk.dy)).toBeLessThan(2);
    let p0, p1;
    // a far drag: the base follows the finger
    await touch(page, "pointermove", 150 + 300, 300);
    st = await page.evaluate(() => window.__bb.sticks);
    expect(st[0].ox).toBeGreaterThan(250);
    expect(Math.abs(Math.hypot(st[0].x - st[0].ox, st[0].y - st[0].oy) - R * 1.6)).toBeLessThan(0.5);
    await touch(page, "pointerup", 450, 300);
    expect(await page.evaluate(() => window.__bb.sticks.length)).toBe(0);
    // right part, not on a button: nothing
    p0 = await heroPos(page);
    await touch(page, "pointerdown", ui.w * 0.8, 200, 8);
    await touch(page, "pointermove", ui.w * 0.8 - 60, 200, 8);
    expect(await page.evaluate(() => window.__bb.sticks.length)).toBe(0);
    await step(page, 0.5);
    p1 = await heroPos(page);
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(3);    // a stick would move him ≥ 20 px (3: a bot may bump him)
    await touch(page, "pointerup", ui.w * 0.8 - 60, 200, 8);
    // buttons win over the stick: the kiss button (right) and the pause button inside the stick zone.
    // SPEC-010: the smaller mini-map lets the top bar's timer + pause group sit a bit further right (centred in the
    // free space), just past STICK_ZONE at 844 px, so the zone is widened here to cover the pause button (restored below)
    await page.evaluate(() => { window.__bb.progress.inv.kisses = 5; });
    await frames(page);
    const rects = await page.evaluate(() => window.__bb.buttonRects);
    const kiss = rects.find(r => r.id === "kiss:0"), pause = rects.find(r => r.text === "II");
    const zone0 = await page.evaluate(() => window.__bb.CFG.STICK_ZONE);
    const zone = Math.max(zone0, (pause.x + pause.w) / ui.w + 0.02);
    await page.evaluate(z => { window.__bb.CFG.STICK_ZONE = z; }, zone);
    try {
      expect(pause.x + pause.w / 2).toBeLessThan(ui.w * zone);
      expect(kiss.x).toBeGreaterThan(ui.w * zone);
      await touch(page, "pointerdown", kiss.x + kiss.w / 2, kiss.y + kiss.h / 2, 9);
      expect(await page.evaluate(() => window.__bb.sticks.length)).toBe(0);
      await touch(page, "pointerup", kiss.x + kiss.w / 2, kiss.y + kiss.h / 2, 9);
      await touch(page, "pointerdown", pause.x + pause.w / 2, pause.y + pause.h / 2, 10);
      expect(await page.evaluate(() => window.__bb.sticks.length)).toBe(0);
      expect(await page.evaluate(() => window.__bb.mode)).toBe("pause");
      await touch(page, "pointerup", pause.x + pause.w / 2, pause.y + pause.h / 2, 10);
    } finally {
      await page.evaluate(z => { window.__bb.CFG.STICK_ZONE = z; }, zone0);
    }
    expect(errors).toEqual([]);
  });

  test("phones play with one player", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    const en = await page.evaluate(() => window.__bb.I18N.en);
    await frames(page);
    let texts = (await page.evaluate(() => window.__bb.buttonRects)).map(r => r.text);
    expect(texts).toContain("▶ " + en.play);                      // only "Play"
    expect(texts).not.toContain(en.onePlayer);
    expect(texts).not.toContain(en.twoPlayers);
    // startGame(2) falls back to one player
    await page.evaluate(() => window.__bb.startGame(2));
    let players = await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "player").length);
    expect(players).toBe(1);
    expect(await page.evaluate(() => window.__bb.littles.length)).toBe(5);
    // key 2 on the level card too (SPEC-017: the card has one Play button on a phone)
    await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.mode = "map"; });
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("stop:1"));
    await page.keyboard.press("Digit2");
    expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
    players = await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "player").length);
    expect(players).toBe(1);
    // the kiss button is in the one-player place (bottom right)
    await page.evaluate(() => { window.__bb.progress.inv.kisses = 5; });
    await frames(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    const kisses = (await page.evaluate(() => window.__bb.buttonRects)).filter(r => r.id.startsWith("kiss:"));
    expect(kisses.map(k => k.id)).toEqual(["kiss:0"]);
    expect(kisses[0].x).toBeGreaterThan(ui.w / 2);
    // the shop's Wardrobe tab: Player 1 and the Big One, no Player 2
    await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "wardrobe"; });
    await frames(page);
    const ids = (await page.evaluate(() => window.__bb.buttonRects)).map(r => r.id);
    expect(ids).toContain("name:p1"); expect(ids).toContain("name:big"); expect(ids).not.toContain("name:p2");
    expect(await page.evaluate(() => window.__bb.skinPanels().map(p => p.key))).toEqual(["p1", "big"]);
    // shop, Items tab: "who wears what" only for Player 1
    await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "items"; });
    await frames(page);
    texts = (await page.evaluate(() => window.__bb.buttonRects)).map(r => r.text);
    expect(texts.filter(t => t === en.none).length).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe("desktop touch", () => {
  test.use({ hasTouch: true });

  test("off the phone, two players and the right-half stick stay as before", async ({ page }) => {
    const errors = await openGame(page);
    const en = await page.evaluate(() => window.__bb.I18N.en);
    await page.evaluate(() => { window.__bb.mode = "map"; });   // SPEC-017: the 1/2 players choice is on the level card
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("stop:1"));
    await frames(page);
    expect((await page.evaluate(() => window.__bb.buttonRects)).map(r => r.text)).toContain(en.twoPlayers);
    await page.evaluate(() => window.__bb.startGame(2));
    expect(await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "player").length)).toBe(2);
    expect(await page.evaluate(() => window.__bb.stickR())).toBe(55);
    await touch(page, "pointerdown", 800, 400);                       // right half → player 2's stick
    const st = await page.evaluate(() => window.__bb.sticks);
    expect(st.length).toBe(1); expect(st[0].player).toBe(1);
    await touch(page, "pointerup", 800, 400);
    await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "wardrobe"; });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.skinPanels().map(p => p.key))).toEqual(["p1", "p2", "big"]);
    expect(errors).toEqual([]);
  });
});

// AC 6–7: mini-map and edge arrows.
const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const kindsOf = mm => new Set(mm.markers.map(m => m.kind));
// puts one bonus star, one item (a shield) and a downed bot (littles[1]) on fixed free cells far from everyone, and
// checks they are there. The random star/item spawns could land next to the hero and be picked up, or find no spot
// (CI flake "Error: star"); a downed bot left next to the others was helped up (RESCUE_TIME) when the machine was slow.
// botWait keeps the bots from walking over to rescue him.
async function pinMarkers(page) {
  const r = await page.evaluate(() => {
    const b = window.__bb, g = b.grid, C = g.CELL, who = [...b.littles, b.big], spots = [];
    for (let cy = 1; cy < g.ROWS - 1 && spots.length < 3; cy++) for (let cx = 1; cx < g.COLS - 1 && spots.length < 3; cx++) {
      const p = { x: (cx + 0.5) * C, y: (cy + 0.5) * C };
      if (g.blocked[cy * g.COLS + cx] || b.inSafe(p) || who.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 160)) continue;
      if (spots.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 5 * C)) continue;
      spots.push(p);
    }
    if (spots.length < 3) return null;
    const [st, it, dn] = spots;
    b.spawnStar(st.x, st.y);
    b.items.push({ id: 9999, kind: "shield", x: it.x, y: it.y, t: 0, life: 999 });
    Object.assign(b.littles[1], { x: dn.x, y: dn.y, state: "down", downTimer: 18, rescue: 0, botWait: 999, moving: false });
    return { stars: b.stars.length, items: b.items.filter(q => q.id === 9999).length, down: b.littles[1].state };
  });
  expect(r, "three free cells for the star, the item and the downed bot").not.toBeNull();
  expect(r.stars, "the star is on the map").toBeGreaterThanOrEqual(1);
  expect(r.items, "the item is on the map").toBe(1);
  expect(r.down).toBe("down");
}

test.describe("phone mini-map", () => {
  test.use(PHONE_CTX);

  test("mini-map shows the level and everyone on it", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    await frames(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    let mm = await page.evaluate(() => window.__bb.minimap);
    expect(mm).toBeTruthy();
    // top-right, inside the UI (which is inside the safe area), CFG.MINIMAP_W of the width (SPEC-010: 18 %), 3:2
    expect(mm.x + mm.w).toBeLessThanOrEqual(ui.w); expect(mm.x + mm.w).toBeGreaterThan(ui.w - 20);
    expect(mm.y).toBeGreaterThanOrEqual(0); expect(mm.y).toBeLessThan(20);
    expect(Math.abs(mm.w - (await page.evaluate(() => window.__bb.CFG.MINIMAP_W)) * ui.w)).toBeLessThan(1);
    expect(Math.abs(mm.w / mm.h - 1.5)).toBeLessThan(0.01);
    for (const k of ["hero", "bot", "big", "cone", "view"]) expect(kindsOf(mm).has(k), k).toBe(true);
    const hero = mm.markers.find(m => m.kind === "hero");
    expect(Math.abs(hero.x - (mm.x + 560 * mm.w / 960))).toBeLessThan(1);
    expect(Math.abs(hero.y - (mm.y + 300 * mm.h / 640))).toBeLessThan(1);
    expect(mm.markers.filter(m => m.kind === "bot").length).toBe(4);
    // a star, an item and a downed bot appear (pinned: random spawns made this flaky on CI)
    await pinMarkers(page);
    await frames(page);
    mm = await page.evaluate(() => window.__bb.minimap);
    for (const k of ["star", "item", "downed"]) expect(kindsOf(mm).has(k), k).toBe(true);
    // nothing in the HUD sits on the mini-map
    const rects = await page.evaluate(() => window.__bb.buttonRects);
    for (const r of rects) expect(overlaps(r, mm), `button ${r.id} ${r.text}`).toBe(false);
    for (const r of await page.evaluate(() => window.__bb.hudRects)) expect(overlaps(r, mm), `hud ${r.id}`).toBe(false);
    // the base layer is cached: not redrawn every frame, redrawn for a new level or place
    const b0 = mm.baseDraws;
    for (let i = 0; i < 5; i++) await frames(page);
    expect(await page.evaluate(() => window.__bb.minimap.baseDraws)).toBe(b0);
    await page.evaluate(() => window.__bb.startGame(1));            // same level again: same picture
    await frames(page);
    expect(await page.evaluate(() => window.__bb.minimap.baseDraws)).toBe(b0);
    await page.evaluate(() => { window.__bb.level = 3; window.__bb.startGame(1); });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.minimap.baseDraws)).toBe(b0 + 1);
    await page.evaluate(() => { window.__bb.world = "beach"; window.__bb.startGame(1); });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.minimap.baseDraws)).toBe(b0 + 2);
    expect(errors).toEqual([]);
  });

  // SPEC-010 AC 1: smaller (18 % of the UI width, was 26 %), 3:2, the same margin; the HUD and buttons keep clear of it
  test("the mini-map is smaller", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    for (const [vw, vh] of [[844, 390], [667, 375], [932, 430]]) {
      await page.setViewportSize({ width: vw, height: vh });
      await frames(page); await frames(page);
      const d = await page.evaluate(() => { const b = window.__bb; return { ui: b.uiSize, mm: b.minimap, cfg: b.CFG, buttons: b.buttonRects, hud: b.hudRects }; });
      const at = `${vw}×${vh}`;
      expect(d.cfg.MINIMAP_W, at).toBe(0.18);
      expect(d.cfg.MINIMAP_MARGIN, at).toBe(8);
      expect(Math.abs(d.mm.w - 0.18 * d.ui.w), `${at}: width 18 %`).toBeLessThan(1);
      expect(Math.abs(d.mm.w / d.mm.h - 1.5), `${at}: 3:2`).toBeLessThan(0.01);
      expect(d.mm.y, `${at}: top margin`).toBe(8);
      expect(Math.abs(d.ui.w - (d.mm.x + d.mm.w) - 8), `${at}: right margin`).toBeLessThan(0.01);
      for (const r of d.buttons) expect(overlaps(r, d.mm), `${at}: button ${r.id}`).toBe(false);
      for (const r of d.hud) expect(overlaps(r, d.mm), `${at}: hud ${r.id}`).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  // SPEC-010 AC 3: the markers stay the same (count and kind), every dot at least 3 UI px in radius
  test("the mini-map markers stay the same and readable", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    await pinMarkers(page);
    await frames(page);
    const mm = await page.evaluate(() => window.__bb.minimap);
    const count = k => mm.markers.filter(m => m.kind === k).length;
    expect([...kindsOf(mm)].sort()).toEqual(["big", "bot", "cone", "downed", "hero", "item", "star", "view"]);
    expect({ cone: count("cone"), view: count("view"), big: count("big"), hero: count("hero"), bot: count("bot"), downed: count("downed") })
      .toEqual({ cone: 1, view: 1, big: 1, hero: 1, bot: 3, downed: 1 });
    expect(count("star")).toBeGreaterThanOrEqual(1); expect(count("item")).toBeGreaterThanOrEqual(1);
    for (const m of mm.markers.filter(m => m.kind !== "cone" && m.kind !== "view")) expect(m.r, `${m.kind} dot radius`).toBeGreaterThanOrEqual(3);
    expect(errors).toEqual([]);
  });

  // SPEC-010 AC 4: the hero's or the Big One's screen point inside the mini-map (+ 12 UI px) fades the whole
  // mini-map to MINIMAP_UNDER_ALPHA within ~0.2 s; it comes back when they leave. One evaluate per phase:
  // the frame loop does not run in between, so the camera stays put and the fade is stepped by hand.
  test("the mini-map fades when someone is under it", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    await page.evaluate(() => { Object.assign(window.__bb.big, { x: 300, y: 400 }); });
    await frames(page);
    const cfg = await page.evaluate(() => window.__bb.CFG);
    expect(cfg.MINIMAP_UNDER_ALPHA).toBe(0.2);
    expect(cfg.MINIMAP_UNDER_PAD).toBe(12);
    expect((await page.evaluate(() => window.__bb.minimap)).alpha).toBe(1);
    // moves `who` to a world point whose screen point is inside the mini-map rect grown by `pad`, steps the fade
    const phase = (who, mode, secs) => page.evaluate(([who, mode, secs]) => {
      const b = window.__bb, mm = b.minimap, pad = b.CFG.MINIMAP_UNDER_PAD, o = who === "big" ? b.big : b.littles[0];
      const inside = (s, g) => s.x > mm.x - g && s.x < mm.x + mm.w + g && s.y > mm.y - g && s.y < mm.y + mm.h + g;
      let spot = null;
      if (mode === "away") spot = who === "big" ? { x: 300, y: 400 } : { x: 560, y: 300 };
      else {
        search: for (let y = 4; y < 640; y += 4) for (let x = 4; x < 960; x += 4) {
          const s = b.toScreen(x, y);
          // "in": well inside the rect; "pad": outside the rect, inside its 12 px margin
          if (mode === "in" ? inside(s, -4) : inside(s, pad - 3) && !inside(s, 1)) { spot = { x, y }; break search; }
        }
      }
      if (!spot) return null;
      Object.assign(o, spot);
      const a = [];
      for (let i = 0; i < Math.round(secs * 60); i++) { b.updateMinimapFade(1 / 60); a.push(b.minimapAlpha); }
      return { a, s: b.toScreen(o.x, o.y) };
    }, [who, mode, secs]);
    for (const who of ["big", "hero"]) {
      let r = await phase(who, "in", 0.25);
      expect(r, `${who}: a spot under the mini-map`).not.toBeNull();
      expect(r.a[2], `${who}: starts fading at once`).toBeLessThan(1);
      expect(r.a[Math.round(0.22 * 60)], `${who}: faded within ~0.2 s`).toBeLessThanOrEqual(0.2 + 1e-6);
      expect(r.a[r.a.length - 1]).toBeCloseTo(0.2, 5);
      r = await phase(who, "away", 0.25);
      expect(r.a[Math.round(0.22 * 60)], `${who}: back within ~0.2 s`).toBeGreaterThanOrEqual(1 - 1e-6);
      r = await phase(who, "pad", 0.25);
      expect(r, `${who}: a spot in the 12 px margin`).not.toBeNull();
      expect(r.a[r.a.length - 1], `${who}: the margin counts as under`).toBeCloseTo(0.2, 5);
      await phase(who, "away", 0.25);
    }
    // the drawn mini-map reports the alpha it used
    await page.evaluate(() => { const b = window.__bb; Object.assign(b.big, { x: 300, y: 400 }); for (let i = 0; i < 30; i++) b.updateMinimapFade(1 / 60); });
    await frames(page);
    expect((await page.evaluate(() => window.__bb.minimap)).alpha).toBe(1);
    expect(errors).toEqual([]);
  });

  test("edge arrows point to the off-screen Big One and downed friends", async ({ phonePage: page }) => {
    // SPEC-018: the "~15 s GPU stall after each teleport" this test used to have was Playwright serializing the Big One /
    // the Little One that an Object.assign evaluate without braces returned; the teleports now return nothing.
    // SPEC-010: deterministic — the bots used to hug the stunned Big One over the minutes this test runs (and could win
    // the level: no arrows outside "play") or walk over and help the downed friend up; now they all rest (calmAll)
    const errors = await phonePlay(page);
    await calmAll(page);
    await placeHero(page, 560, 300);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    // the Big One far away in the bottom-left: one red arrow at the edge, towards him
    await page.evaluate(() => { Object.assign(window.__bb.big, { x: 60, y: 600 }); });
    await frames(page);
    let r = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0];
      return { arrows: b.edgeArrows, hs: b.toScreen(l.x, l.y), ts: b.toScreen(b.big.x, b.big.y), mm: b.minimap, buttons: b.buttonRects };
    });
    expect(r.ts.x < 0 || r.ts.x > ui.w || r.ts.y < 0 || r.ts.y > ui.h).toBe(true);   // really off screen
    let big = r.arrows.filter(a => a.kind === "big");
    expect(big.length).toBe(1);
    const want = Math.atan2(r.ts.y - r.hs.y, r.ts.x - r.hs.x);
    expect(Math.abs(big[0].angle - want)).toBeLessThan(0.01);
    const edgeDist = a => Math.min(a.x, ui.w - a.x, a.y, ui.h - a.y);
    expect(edgeDist(big[0])).toBeLessThan(40);                                         // at the screen edge
    const toArrow = Math.atan2(big[0].y - r.hs.y, big[0].x - r.hs.x);
    expect(Math.abs(toArrow - want)).toBeLessThan(0.35);                               // on the side facing him
    // bring him on screen: no arrow
    await page.evaluate(() => { Object.assign(window.__bb.big, { x: 620, y: 330 }); });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.edgeArrows.filter(a => a.kind === "big").length)).toBe(0);
    // a downed bot off screen in the top-right (where the mini-map is): a green arrow, clear of the mini-map and buttons
    await page.evaluate(() => { Object.assign(window.__bb.littles[1], { x: 900, y: 40, state: "down", downTimer: 999, rescue: 0, botWait: 999 }); });
    await frames(page);
    r = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0];
      return { arrows: b.edgeArrows, hs: b.toScreen(l.x, l.y), ts: b.toScreen(b.littles[1].x, b.littles[1].y), mm: b.minimap, buttons: b.buttonRects,
        why: { mode: b.mode, hp: b.big.hp, hero: l.state, friend: b.littles[1].state } };
    });
    expect(r.ts.y).toBeLessThan(0);
    const down = r.arrows.filter(a => a.kind === "downed");
    expect(down.length, JSON.stringify(r.why)).toBe(1);
    expect(Math.abs(down[0].angle - Math.atan2(r.ts.y - r.hs.y, r.ts.x - r.hs.x))).toBeLessThan(0.01);
    // a downed friend on screen but under the mini-map also gets an arrow
    const best = await page.evaluate(() => {
      const b = window.__bb, mm = b.minimap;
      // a world point whose screen point is inside the mini-map
      grid: for (let y = 16; y < 640; y += 16) for (let x = 16; x < 960; x += 16) {
        const s = b.toScreen(x, y);
        if (s.x > mm.x + 10 && s.x < mm.x + mm.w - 10 && s.y > mm.y + 10 && s.y < mm.y + mm.h - 10) {
          Object.assign(b.littles[1], { x: 900, y: 40, state: "rest", restTimer: 999 });
          Object.assign(b.littles[2], { x, y, state: "down", downTimer: 999, rescue: 0, botWait: 999 });
          return { x, y };
        }
      }
      return null;
    });
    expect(best).not.toBeNull();
    await frames(page);
    r = await page.evaluate(() => {
      const b = window.__bb, f = b.littles[2];
      return { arrows: b.edgeArrows, mm: b.minimap, buttons: b.buttonRects, fs: b.toScreen(f.x, f.y), ui: b.uiSize, st: f.state };
    });
    expect(r.st).toBe("down");
    expect(r.fs.x > 0 && r.fs.x < r.ui.w && r.fs.y > 0 && r.fs.y < r.ui.h, "the friend is on screen").toBe(true);
    expect(r.fs.x > r.mm.x && r.fs.x < r.mm.x + r.mm.w && r.fs.y > r.mm.y && r.fs.y < r.mm.y + r.mm.h, "…but under the mini-map").toBe(true);
    expect(r.arrows.filter(a => a.kind === "downed").length, "an arrow for the friend under the mini-map").toBe(1);
    for (const a of r.arrows) {
      const box = { x: a.x - a.r, y: a.y - a.r, w: 2 * a.r, h: 2 * a.r };
      expect(overlaps(box, r.mm), "arrow on the mini-map").toBe(false);
      for (const bt of r.buttons) expect(overlaps(box, bt), `arrow on button ${bt.id}`).toBe(false);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.w).toBeLessThanOrEqual(ui.w);
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.h).toBeLessThanOrEqual(ui.h);
    }
    expect(errors).toEqual([]);
  });
});

// SPEC-010 review: the team chips plate (5 chips) is wider than the small mini-map and sticks out to its left
// (≈ 62 UI px at 667×375); a downed friend under that part of the plate is hidden too and gets an edge arrow
test.describe("phone mini-map 667×375", () => {
  test.use({ ...PHONE_CTX, viewport: { width: 667, height: 375 } });

  test("a downed friend under the team chips left of the mini-map gets an edge arrow", async ({ phonePage: page }) => {
    const errors = await phonePlay(page);
    await calmAll(page);
    await placeHero(page, 200, 500);
    await frames(page);
    const spot = await page.evaluate(() => {
      const b = window.__bb, mm = b.minimap, tr = b.hudRects.find(h => h.id === "team");
      if (!(tr.x < mm.x - 8)) return { wide: false, tr, mm };
      for (let y = 4; y < 640; y += 4) for (let x = 4; x < 960; x += 4) {
        const s = b.toScreen(x, y);
        if (s.x > tr.x + 4 && s.x < mm.x - 4 && s.y > tr.y + 4 && s.y < tr.y + tr.h - 4) {
          Object.assign(b.littles[2], { x, y, state: "down", downTimer: 999, rescue: 0, botWait: 999, moving: false });
          return { wide: true, x, y };
        }
      }
      return { wide: true, x: null };
    });
    expect(spot.wide, `the chips plate sticks out left of the mini-map: ${JSON.stringify(spot)}`).toBe(true);
    expect(spot.x, "a world point under that part of the plate").not.toBeNull();
    await frames(page);
    const r = await page.evaluate(() => {
      const b = window.__bb, f = b.littles[2];
      return { arrows: b.edgeArrows, fs: b.toScreen(f.x, f.y), mm: b.minimap, tr: b.hudRects.find(h => h.id === "team"), st: f.state, mode: b.mode };
    });
    expect(r.mode).toBe("play"); expect(r.st).toBe("down");
    expect(r.fs.x > r.tr.x && r.fs.x < r.mm.x && r.fs.y > r.tr.y && r.fs.y < r.tr.y + r.tr.h, "under the plate, left of the mini-map").toBe(true);
    expect(r.arrows.filter(a => a.kind === "downed").length, "an arrow for the friend under the chips").toBe(1);
    expect(errors).toEqual([]);
  });
});

test("desktop has no mini-map and no edge arrows", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); Object.assign(b.littles[1], { state: "down", downTimer: 18 }); });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.minimap)).toBe(null);
  expect(await page.evaluate(() => window.__bb.edgeArrows)).toEqual([]);
  expect(errors).toEqual([]);
});

// AC 9, 11, 12: phone sizes. Data-driven: each scene sets up a screen; step 6b adds the menus.
const PHONE_SIZES = [[667, 375], [844, 390], [932, 430]];
const PHONE_SCENES = {
  // play with everything on: banner, touch hint, kiss button, mittens, a downed bot (arrow), a pop text
  play: async page => {
    await page.evaluate(() => {
      window.__bb.resetBannerTimer();       // a restart within BANNER_REPEAT (1 s) would show no banner
      const b = window.__bb;
      b.progress.inv.kisses = 5; b.progress.inv.mittens = 3; b.progress.equip[0] = "mittens";
      b.startGame(1);
      Object.assign(b.big, { state: "look", timer: 999, stun: 999 });
    });
  },
  // Winter 13 (rooms), a long Big One name and 12 hearts (one and a half lost)
  long: async page => {
    await page.evaluate(() => {
      const b = window.__bb; b.resetBannerTimer();
      b.progress.worlds.winter.unlocked = 20; b.world = "winter"; b.level = 13; b.setName("big", "Великолепный"); b.progress.inv.kisses = 5;
      b.startGame(1); Object.assign(b.big, { state: "look", timer: 999, stun: 999 });
      b.big.hp = b.big.maxHp - 1.5;
    });
  },
  // the hero is resting in the house: the resting bar
  rest: async page => {
    await page.evaluate(() => {
      const b = window.__bb;
      b.progress.inv.kisses = 5; b.startGame(1);
      Object.assign(b.big, { state: "look", timer: 999, stun: 999 });
      b.stats.time = 30;
      Object.assign(b.littles[0], { state: "rest", restTimer: 100 });
    });
  },
  // SPEC-007: the hero was pushed and owns kits: the 🩹 button in the kiss button's place, the first-time hint, mittens
  down: async page => {
    await page.evaluate(() => {
      const b = window.__bb; b.resetBannerTimer();
      b.progress.inv.kisses = 5; b.progress.inv.mittens = 3; b.progress.equip[0] = "mittens"; b.progress.inv.rescues = 3;
      b.startGame(1);
      const l = b.littles[0];
      Object.assign(b.big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, slip: 0, blush: 0, hugCd: 0, x: 465, y: 320, dir: 0 });
      Object.assign(l, { state: "ok", invuln: 0, dizzy: 0, x: 500, y: 320, kx: 0, ky: 0 });
      for (let i = 0; i < 12 && l.state === "ok"; i++) b.update(1 / 60);
      Object.assign(b.big, { x: 900, y: 600, stun: 999 });
      b.camSnap();
    });
  },
  pause: async page => {
    await page.evaluate(() => { const b = window.__bb; b.startGame(1); b.stats.time = 30; b.mode = "pause"; });
  },
  // SPEC-017: the home screen with every badge shown (four item kinds, the bonus worlds open, a long coin number)
  home: async page => {
    await page.evaluate(() => {
      const b = window.__bb; b.mode = "home";
      Object.assign(b.progress.inv, { mittens: 12, mega: 10, kisses: 15, rescues: 11 }); b.progress.coins = 12345;
      for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) });
    });
  },
  // SPEC-017: the level map (Park 10 open, 4 stars won) and the level card of level 5
  map: async page => {
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.park.unlocked = 10; b.progress.worlds.park.won = { 1: true, 2: true, 3: true, 4: true }; b.progress.worlds.park.stars[4] = 2; b.world = "park"; b.mode = "map"; });
  },
  card: async page => {
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.park.unlocked = 10; b.world = "park"; b.mode = "map"; b.resetMenus(); });
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("stop:5"));
  },
  // SPEC-009: a locked hat tried on (Buy button in place of the name label, "not enough coins" on the preview) — SPEC-017: the shop's Wardrobe tab
  wardrobe: async page => {
    await page.evaluate(() => { const b = window.__bb, W = b.wardrobe(); b.mode = "shop"; b.shopTab = "wardrobe"; b.progress.coins = 10; b.cycleOutfit("p1", "hat", W.hat.findIndex(q => q.id === "crown") - b.outfits.shown.p1.hat); });
  },
  friends: async page => { await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "friends"; }); },
  // SPEC-017: a story chapter (picture placeholder and text) and the "How to play" page (the rules lines and the touch hint)
  story: async page => { await page.evaluate(() => { window.__bb.openStory("began", "home"); }); },
  rules: async page => {
    await page.evaluate(() => { window.__bb.openStory("park", "home"); });
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("story:rules"));
  },
  // 10 coins: "not enough coins" under all four cards (SPEC-007: the tightest card layout)
  shop: async page => { await page.evaluate(() => { const b = window.__bb; b.progress.coins = 10; b.mode = "shop"; }); },
  // SPEC-026: Character → Progress with everything counted (items, upgrades, a bonus world open, a long coin number) and its Reset armed
  progress: async page => {
    await page.evaluate(() => {
      const b = window.__bb; b.mode = "home";
      Object.assign(b.progress.inv, { mittens: 12, mega: 10, kisses: 15, rescues: 11 }); b.progress.coins = 12345;
      Object.assign(b.progress.upgrades, { fastFeet: 3, longItems: 2, quickHelp: 1 }); b.progress.worlds.beach.won = { 1: true };
    });
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("home:shop"));     // the real button: Character opens on Progress
    await frames(page);
    await page.evaluate(() => window.__bb.tapButton("progress:reset"));
  },
  win: async page => {
    await page.evaluate(() => {
      const b = window.__bb; b.startGame(1);
      Object.assign(b.stats, { time: 50, starCoins: 3, rests: 1 });
      b.giveReward(true); b.mode = "win";
    });
  },
  lose: async page => {
    await page.evaluate(() => { const b = window.__bb; b.startGame(1); b.stats.starCoins = 3; b.stats.playerHugs = 2; b.giveReward(false); b.mode = "lose"; });
  }
};

// what is wrong with a phone screen (SPEC-018: a list of problems and one expect per test, not thousands of expects —
// each Playwright expect records a step, which made the 667 test take 44 s)
function phoneScreenProblems(name, d, minText) {
  const s = d.ui.scale, cssPad = px => px / s - 0.01, out = [], check = (ok, what) => { if (!ok) out.push(`${name}: ${what}`); };
  const inside = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= d.ui.w + 0.01 && r.y + r.h <= d.ui.h + 0.01;
  check(d.buttons.length > 0, "some buttons");
  for (const b of d.buttons) {
    const id = `button ${b.id || ""} ${b.text || ""}`;
    check(b.w * s >= 44 - 0.01, `${id} width ${b.w * s} CSS px`);
    check(b.h * s >= 44 - 0.01, `${id} height ${b.h * s} CSS px`);
    check(inside(b), `${id} inside the screen ${JSON.stringify(b)}`);
    if (b.textW !== undefined) check(b.textW <= b.w + 0.5, `${id} text ${b.textW} wider than the button ${b.w}`);
    if (d.mm) check(!overlaps(b, d.mm), `${id} on the mini-map`);
    for (const h of d.hud) check(!overlaps(b, h), `${id} on ${h.id}`);
  }
  d.buttons.forEach((a, i) => d.buttons.slice(i + 1).forEach(b =>
    check(!overlaps(a, b, cssPad(8)), `${a.id || a.text} and ${b.id || b.text} closer than 8 CSS px`)));
  d.hud.forEach((a, i) => {
    check(inside(a), `${a.id} inside the screen ${JSON.stringify(a)}`);
    if (d.mm) check(!overlaps(a, d.mm), `${a.id} on the mini-map`);
    d.hud.slice(i + 1).forEach(b => check(!overlaps(a, b), `${a.id} on ${b.id}`));
  });
  for (const [cat, px] of Object.entries(d.texts)) check(px * s >= textFloor(minText, cat) - 0.01, `smallest ${cat} text ${px * s} CSS px`);
  if (d.texts.main || d.texts.title) check(!!d.texts.drawn, "drawn text sizes recorded");
  return out;
}


for (const [vw, vh] of PHONE_SIZES) {
  test.describe(`phone sizes ${vw}×${vh}`, () => {
    test.use({ ...PHONE_CTX, viewport: { width: vw, height: vh } });

    // SPEC-016 AC 8: six worlds, the bonus ones locked and open (SPEC-017: the level map's tabs, ≥ 44 CSS px, 🔒 on a locked one)
    test(`the world tabs and the bonus note fit at ${vw}×${vh}`, async ({ phonePage: page }) => {
      const minText = await page.evaluate(() => window.__bb.textFloors);   // SPEC-031: + the story text floor
      const fails = [];
      for (const open of [false, true]) {
        await page.evaluate(o => {
          const b = window.__bb; b.setProgress(null);
          if (o) for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) });
          b.world = "park"; b.mode = "map";
        }, open);
        await frames(page);
        const d = await page.evaluate(() => ({ tabs: window.__bb.buttonRects.filter(q => String(q.id).startsWith("maptab:")), ui: window.__bb.uiSize }));
        const label = `${vw}×${vh} ${open ? "open" : "locked"}`;
        if (d.tabs.map(q => q.id).join() !== ["park", "field", "city", "school", "beach", "winter"].map(w => "maptab:" + w).join()) fails.push(`${label}: tabs ${d.tabs.map(q => q.id)}`);
        for (const q of d.tabs) if (q.w * d.ui.scale < 44 - 0.01 || q.h * d.ui.scale < 44 - 0.01) fails.push(`${label} ${q.id}: ${q.w * d.ui.scale}×${q.h * d.ui.scale} CSS px`);
        const locks = d.tabs.slice(4).map(q => q.text === "🔒");
        if (locks.join() !== [!open, !open].join()) fails.push(`${label}: bonus tabs ${d.tabs.slice(4).map(q => q.text)}`);
      }
      // the one-time "Bonus worlds unlocked!" note on the win screen: inside the screen, off the buttons, readable — measured with
      // the real font width and with a 15 % wider one (CFG.TEXT_TEST_SCALE, like CI's Linux fonts: the Spanish note was cut there)
      for (const lang of LANGS) for (const fs of [1, 1.15]) {
        await page.evaluate(([l, f]) => {
          const b = window.__bb, all = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
          b.setProgress(null); b.setLang(l);
          for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: all() });
          delete b.progress.worlds.city.won[20];
          b.world = "city"; b.level = 20; b.startGame(1);
          Object.assign(b.stats, { playerHugs: 2, rests: 1, time: 9999, starCoins: 3 }); b.giveReward(true); b.mode = "win";
          b.CFG.TEXT_TEST_SCALE = f;
        }, [lang, fs]);
        await frames(page);
        const w = await page.evaluate(() => {
          const b = window.__bb, n = b.bonusNote, c = document.createElement("canvas").getContext("2d");
          let textW = 0;
          if (n) { c.font = `900 ${n.size}px system-ui, "Segoe UI", sans-serif`; textW = c.measureText(n.text).width * b.CFG.TEXT_TEST_SCALE; }
          return { note: n, textW, buttons: b.buttonRects, hud: b.hudRects, ui: b.uiSize, panel: b.winPanel };
        });
        const label = `${vw}×${vh} ${lang} win font ×${fs}`;
        if (!w.note) { fails.push(`${label}: no bonus note`); continue; }
        const n = w.note;
        if (!(n.x >= 0 && n.y >= 0 && n.x + n.w <= w.ui.w && n.y + n.h <= w.ui.h)) fails.push(`${label}: note outside the screen ${JSON.stringify(n)}`);
        if (w.textW > n.w + 0.5) fails.push(`${label}: note text ${w.textW.toFixed(1)} wider than its box ${n.w.toFixed(1)}`);
        if (w.panel && overlaps(n, w.panel)) fails.push(`${label}: note on the reward lines`);
        if (n.size * w.ui.scale < minText.main - 0.01) fails.push(`${label}: note text ${n.size * w.ui.scale} CSS px`);
        for (const q of w.buttons) if (overlaps(n, q)) fails.push(`${label}: note on button ${q.id || q.text}`);
        for (const q of w.hud) if (q.id !== "bonus-note" && overlaps(n, q)) fails.push(`${label}: note on ${q.id}`);
      }
      await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.mode = "home"; b.setProgress(null); b.setLang("en"); b.world = "park"; b.level = 1; });
      expect(fails).toEqual([]);
    });

    test(`every phone button is big enough at ${vw}×${vh}`, { tag: vw === 844 ? "@fast" : [] }, async ({ phonePage: page }) => {
      test.slow();
      const errors = page.sharedErrors;
      const minText = await page.evaluate(() => window.__bb.textFloors);   // SPEC-031: + the story text floor
      const fails = [];
      for (const [name0, setup] of (vw === 667 ? LANGS : ["en"]).flatMap(lg => Object.entries(PHONE_SCENES).map(([n, f]) => [lg + " " + n, async pg => { await pg.evaluate(l => window.__bb.setLang(l), lg); await f(pg); }]))) {
        const name = name0.split(" ")[1], label = name0;
        await setup(page);
        await frames(page);
        const d = await page.evaluate(() => {
          const b = window.__bb, l = b.littles[0];
          return { ui: b.uiSize, buttons: b.buttonRects, hud: b.hudRects, mm: b.minimap, texts: b.textSizes, banner: b.bannerRect,
            hero: b.toScreen(l.x, l.y), head: b.toScreen(l.x, l.y, 72), mode: b.mode };
        });
        expect(d.mode, label).toBe(name === "rest" || name === "long" || name === "down" ? "play" : name === "wardrobe" || name === "friends" || name === "progress" ? "shop" : name === "card" ? "levelCard" : name === "rules" ? "story" : name);
        fails.push(...phoneScreenProblems(label, d, minText));
        expect(d.texts.main || d.texts.title, `${label}: texts recorded`).toBeTruthy();
        if (name === "map") {
          // SPEC-017: back, six world tabs in the story order, 20 level stops of at least 44 CSS px (sizes and gaps checked above)
          const ids = d.buttons.map(q => String(q.id));
          expect(ids.filter(id => id.startsWith("maptab:")), label).toEqual(["maptab:park", "maptab:field", "maptab:city", "maptab:school", "maptab:beach", "maptab:winter"]);
          expect(ids.filter(id => id.startsWith("stop:")).length, label).toBe(20);
          expect(ids).toContain("back:home");
        }
        if (name === "card") expect(d.buttons.map(q => q.id)).toEqual(expect.arrayContaining(["card:play", "card:story", "card:close"]));
        if (name === "story") expect(d.hud.map(h => h.id)).toEqual(expect.arrayContaining(["story:title", "story:text"]));   // SPEC-020: the comic, not the placeholder
        if (name === "rules") expect(d.hud.filter(h => h.id.startsWith("rules:")).length).toBe(7);
        if (name === "shop") expect(d.buttons.map(q => q.id)).toEqual(expect.arrayContaining(["buy:mittens", "buy:mega", "buy:kisses", "buy:rescues"]));
        if (name === "wardrobe") expect(d.buttons.map(q => q.id)).toEqual(expect.arrayContaining(["tab:wardrobe", "buy-look:p1", "name:big", "random:p1", "openFriends"]));
        if (name === "friends") expect(d.buttons.filter(q => String(q.id).startsWith("name:bot")).length).toBe(4);
        if (name === "progress") {   // SPEC-026: four tabs, Reset (armed) on the page, the numbers drawn, the 3D look free
          expect(d.buttons.map(q => q.id).filter(id => String(id).startsWith("tab:")), label).toEqual(["tab:progress", "tab:items", "tab:wardrobe", "tab:upgrades"]);
          expect(d.buttons.map(q => q.id), label).toContain("progress:reset");
          expect(d.hud.map(h => h.id), label).toEqual(expect.arrayContaining(["progress:stars", "progress:worlds", "progress:bag:rescues", "progress:upg:fastFeet", "progress:clothes", "coins"]));
        }
        if (name === "home") expect(d.buttons.map(q => q.id).sort()).toEqual(["home:lang", "home:play", "home:shop", "home:sound", "home:story"]);
        if (name === "play") {
          expect(d.texts.main, "play: main texts recorded").toBeTruthy();
          expect(d.texts.hint, "play: hint text recorded").toBeTruthy();
          // the kiss button ≈ 80 CSS px, bottom right
          const kiss = d.buttons.find(b => b.id === "kiss:0");
          expect(Math.abs(kiss.w * d.ui.scale - 80)).toBeLessThan(1);
          expect(kiss.x).toBeGreaterThan(d.ui.w / 2); expect(kiss.y).toBeGreaterThan(d.ui.h / 2);
          expect(d.hud.map(h => h.id)).toEqual(expect.arrayContaining(["hearts", "timer", "team", "gloves"]));
          // the level banner shows and does not cover the hero (feet or name)
          expect(d.banner, "banner shown").toBeTruthy();
          expect(d.texts.title * d.ui.scale).toBeGreaterThanOrEqual(24 - 0.01);
          for (const p of [d.hero, d.head]) expect(p.x >= d.banner.x && p.x <= d.banner.x + d.banner.w && p.y >= d.banner.y && p.y <= d.banner.y + d.banner.h, `${label}: banner on the hero`).toBe(false);
        }
        if (name === "rest") expect(d.hud.map(h => h.id)).toContain("rest");
        if (name === "down") {
          // the 🩹 button ≈ 80 CSS px in the kiss button's place (bottom right), in buttonRects (the banner avoids those)
          const kit = d.buttons.find(b => b.id === "kit:0");
          expect(kit, `${label}: kit button`).toBeTruthy();
          expect(d.buttons.some(b => b.id === "kiss:0"), `${label}: no kiss button while down`).toBe(false);
          expect(Math.abs(kit.w * d.ui.scale - 80)).toBeLessThan(1);
          expect(kit.x).toBeGreaterThan(d.ui.w / 2); expect(kit.y).toBeGreaterThan(d.ui.h / 2);
          expect(d.hud.map(h => h.id)).toEqual(expect.arrayContaining(["gloves", "kitHint"]));
        }
        if (name === "pause") expect(d.buttons.length).toBeGreaterThanOrEqual(3);
      }
      expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

// SPEC-006 AC 13: the level banner on a phone never covers the hero (CI fonts are wider than Windows ones).
// One page per phone size; world, language, hero position and the font scale are set through __bb, no reloads.
// The hero's screen rect: feet to the name above the head (CFG.NAME_TAG + __bb.nameTagH(), as drawMarkers draws it),
// as wide as his body or his name. The whole matrix runs again with a simulated 15 % wider banner font.
const BANNER_LEVELS = [1, 10];   // "Our drawing" and a two-digit level with the longest type text ("River with bridges" / "Река с мостиками")

// SPEC-018: which (world, level, language) the banner test measures, instead of every combination.
// The banner's place depends on the map (the hero's start), on its text and on the hero's rect — which includes his
// default name, also per language ("Player 1" / "Jugador 1" / "Игрок 1"). placePhoneBanner tries the full text and then
// the short one at every height, so no single width orders the cases; the plan keeps the extremes of both widths:
// - level 10 (a generated map: the hero starts somewhere else in every world): all four worlds, each in the language
//   with the widest banner text, the narrowest banner text and the widest hero name;
// - level 1 (the kids' drawing: the same map and hero start in every world, only the world name changes the text):
//   Park in every language (park 1 en is the case that failed on CI), plus the widest and the narrowest
//   (world, language) banner text over all twelve.
// Widths are measured in the page with the game's fonts, so a machine with wider fonts (CI) picks its own extremes.
// Every case still runs at both hero positions and both font scales.
async function bannerPlan(page) {
  return page.evaluate(([W, levels]) => {
    const b = window.__bb, ctx = document.createElement("canvas").getContext("2d"), LANGS = b.LANGS;
    const width = (w, n, lg) => { const I = b.I18N[lg]; ctx.font = `900 30px system-ui, "Segoe UI", sans-serif`; return ctx.measureText(I.levelIntro(I.worlds[w], n, I.types[b.levelType(w, n)])).width; };
    const nameW = lg => { ctx.font = `900 30px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`; return ctx.measureText(b.I18N[lg].player1).width; };
    const plan = [], add = (world, n, lang) => { if (!plan.some(p => p.world === world && p.n === n && p.lang === lang)) plan.push({ world, n, lang }); };
    const extremes = list => { list.sort((a, c) => a.wd - c.wd); return [list[list.length - 1], list[0]]; };
    const widestName = LANGS.slice().sort((a, c) => nameW(c) - nameW(a))[0];
    for (const n of levels) {
      if (n === 1) {
        for (const lg of LANGS) add("park", 1, lg);
        for (const x of extremes(W.flatMap(w => LANGS.map(lg => ({ w, lg, wd: width(w, 1, lg) }))))) add(x.w, 1, x.lg);
      } else {
        for (const w of W) {
          for (const x of extremes(LANGS.map(lg => ({ w, lg, wd: width(w, n, lg) })))) add(w, n, x.lg);
          add(w, n, widestName);
        }
      }
    }
    return { plan, widestName };
  }, [["park", "field", "city", "school", "beach", "winter"], BANNER_LEVELS]);   // SPEC-016: six worlds
}

// starts world w, level lv with 💋 and mittens bottom right and a calm Big One; remembers the hero's start
async function startBannerLevel(page, w, lv) {
  await page.evaluate(([w, lv]) => {
    const b = window.__bb;
    b.progress.inv.kisses = 5; b.progress.inv.mittens = 3; b.progress.equip[0] = "mittens";
    b.progress.worlds[w].unlocked = 20; b.world = w; b.level = lv; b.startGame(1);
    Object.assign(b.big, { state: "look", timer: 999, stun: 999, noPush: 999 });
    const l = b.littles[0]; window.__heroStart = { x: l.x, y: l.y };
  }, [w, lv]);
}

// sets language, hero position and font scale, shows the banner again, lets the game draw two frames and measures —
// all in one evaluate, so the banner cannot time out in between
function measureBanner(page, lang, pos, fontScale) {
  return page.evaluate(async ([lg, ps, fs]) => {
    let b = window.__bb, l = b.littles[0];
    b.setLang(lg);
    if (ps === "start") Object.assign(l, window.__heroStart);
    else Object.assign(l, { x: b.grid.COLS * b.grid.CELL / 2, y: b.grid.ROWS * b.grid.CELL / 2 });
    Object.assign(l, { vx: 0, vy: 0 });
    b.camSnap();
    b.CFG.TEXT_TEST_SCALE = fs;
    b.stats.time = 0;                       // the touch hint is on screen (first 5 s)
    b.resetBannerTimer(); b.showBanner();
    b.banner.t = b.CFG.BANNER_TIME / 2;     // fully shown
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    b = window.__bb; l = b.littles[0];
    const s = b.uiSize.scale, P = b.CFG.PHONE_BANNER, T = b.CFG.NAME_TAG;
    const feet = b.toScreen(l.x, l.y), head = b.toScreen(l.x, l.y, b.nameTagH());   // SPEC-021: above the bigger head
    const side = P.heroSide * Math.max(Math.abs(b.toScreen(l.x + l.r, l.y).x - feet.x), Math.abs(b.toScreen(l.x + l.r, l.y, b.nameTagH()).x - head.x));
    const ctx = document.createElement("canvas").getContext("2d"), nameSize = Math.max(T.size, b.CFG.PHONE_TEXT.main / s);
    ctx.font = `900 ${nameSize}px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;
    const nameW = ctx.measureText(b.nameOf(l)).width + Math.max(3, nameSize / 4.5);
    const x0 = Math.min(feet.x - side, head.x - nameW / 2), x1 = Math.max(feet.x + side, head.x + nameW / 2);
    const y0 = head.y - T.up - nameSize * P.heroText, y1 = feet.y + side * P.heroFeet;
    const r = b.bannerRect;
    let textW = 0;
    if (r) { ctx.font = `900 ${r.size}px system-ui, "Segoe UI", sans-serif`; textW = ctx.measureText(r.text).width * b.CFG.TEXT_TEST_SCALE; }
    return { ui: b.uiSize, banner: r, textW, hero: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, feet,
      mm: b.minimap, hud: b.hudRects, buttons: b.buttonRects, mode: b.mode, fullText: b.banner && b.banner.text, shortText: b.banner && b.banner.short, tinyText: b.banner && b.banner.tiny,
      state: { t: b.banner && b.banner.t, alpha: b.bannerAlpha(), time: b.stats.time } };
  }, [lang, pos, fontScale]);
}

// what is wrong with a drawn banner: off screen, text under 24 CSS px or wider than its plate, closer than 8 CSS px
// to the hero, the mini-map, a HUD plate or a button
function bannerProblems(d, pos) {
  const s = d.ui.scale, pad = 8 / s - 0.01, B = d.banner, out = [];
  const check = (ok, what) => { if (!ok) out.push(what); };
  check(B.x >= -0.01 && B.y >= -0.01 && B.x + B.w <= d.ui.w + 0.01 && B.y + B.h <= d.ui.h + 0.01, "inside the screen");
  check(B.size * s >= 24 - 0.01, `text ${B.size * s} CSS px, under 24`);
  check(d.textW <= B.w + 0.5, `text ${d.textW.toFixed(1)} wider than the banner ${B.w.toFixed(1)}`);
  check(B.text === { full: d.fullText, short: d.shortText, tiny: d.tinyText }[B.variant], `text "${B.text}" is not the ${B.variant} one`);
  check(B.short === (B.variant !== "full"), `short flag ${B.short} for the ${B.variant} text`);
  if (pos === "centre") check(Math.abs(d.feet.x - d.ui.w / 2) < d.ui.w * 0.2 && Math.abs(d.feet.y - d.ui.h / 2) < d.ui.h * 0.25, `hero not near the centre ${JSON.stringify(d.feet)}`);
  check(!overlaps(B, d.hero, pad), `closer than 8 CSS px to the hero ${JSON.stringify(d.hero)}`);
  check(!d.mm || !overlaps(B, d.mm, pad), "closer than 8 CSS px to the mini-map");
  for (const h of d.hud) check(!overlaps(B, h, pad), `closer than 8 CSS px to ${h.id} ${JSON.stringify(h)}`);
  for (const q of d.buttons) check(!overlaps(B, q, pad), `closer than 8 CSS px to button ${q.id}`);
  return out;
}

for (const [vw, vh] of PHONE_SIZES) {
  test.describe(`phone banner ${vw}×${vh}`, () => {
    test.use({ ...PHONE_CTX, viewport: { width: vw, height: vh } });

    test(`the phone banner never covers the hero (${vw}×${vh})`, async ({ phonePage: page }) => {
      test.slow();
      const errors = page.sharedErrors;
      const fails = [];
      let cases = 0;
      const { plan, widestName } = await bannerPlan(page);
      // the plan keeps the CI case (park 1 en), level 1 in every language, every world at level 10 in at least two
      // languages including the one with the widest hero name
      const at = JSON.stringify(plan);
      expect(plan.some(p => p.world === "park" && p.n === 1 && p.lang === "en"), at).toBe(true);
      for (const lg of LANGS) expect(plan.some(p => p.n === 1 && p.lang === lg), `level 1 in ${lg}: ${at}`).toBe(true);
      for (const w of ["park", "field", "city", "school", "beach", "winter"]) {
        const langs = plan.filter(p => p.world === w && p.n === 10).map(p => p.lang);
        expect(langs.length, `${w} 10: ${at}`).toBeGreaterThanOrEqual(2);
        expect(langs, `${w} 10 has the widest hero name (${widestName}): ${at}`).toContain(widestName);
      }
      try {
        for (const world of ["park", "field", "city", "school", "beach", "winter"]) for (const n of BANNER_LEVELS) {
          const langs = plan.filter(p => p.world === world && p.n === n).map(p => p.lang);
          if (!langs.length) continue;
          await startBannerLevel(page, world, n);
          for (const lang of langs) for (const pos of ["start", "centre"]) for (const fontScale of [1, 1.15]) {
            const label = `${vw}×${vh} ${world} ${n} ${lang} hero at ${pos} font ×${fontScale}`;
            const d = await measureBanner(page, lang, pos, fontScale);
            cases++;
            if (d.mode !== "play" || !d.banner) { fails.push(`${label}: banner shown (mode ${d.mode}, ${JSON.stringify(d.state)})`); continue; }
            for (const p of bannerProblems(d, pos)) fails.push(`${label}: ${p} — banner ${JSON.stringify(d.banner)}`);
          }
        }
      } finally {
        await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; });
      }
      expect(cases).toBe(plan.length * 2 * 2);
      expect(errors).toEqual([]);
      expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
    });
  });
}

// The short text and the skip: the font is made wider step by step until the full text fits nowhere and the short
// one is used (levelIntroShort), then (SPEC-016) the shortest one without the world (levelIntroTiny), then so wide that nothing
// fits: no banner at all, never a text spilling off its plate. Also with the longest world name (Football field, Russian).
test.describe("phone banner too wide", () => {
  test.use({ ...PHONE_CTX, viewport: { width: 667, height: 375 } });

  test("the phone banner switches to the short text, and is skipped when nothing fits", async ({ phonePage: page }) => {
    test.slow();
    const errors = page.sharedErrors;
    const fails = [];
    try {
      for (const [world, n, langs] of [["park", 11, LANGS], ["field", 10, ["ru"]]]) {
      await startBannerLevel(page, world, n);
      for (const lang of langs) for (const pos of ["start", "centre"]) {
        const label = `${world} ${n} ${lang} hero at ${pos}`;
        let short = null;
        for (let k = 1; k <= 2.5 && !short; k = Math.round((k + 0.05) * 100) / 100) {
          const d = await measureBanner(page, lang, pos, k);
          if (!d.banner) { fails.push(`${label} font ×${k}: no banner before the short text was used`); break; }
          if (d.banner.short) short = { k, d };
        }
        if (!short) { fails.push(`${label}: the short text was never used`); continue; }
        expect(short.d.banner.text, label).toBe(short.d.shortText);
        expect(short.d.shortText, label).not.toBe(short.d.fullText);
        for (const p of bannerProblems(short.d, pos)) fails.push(`${label} font ×${short.k} (short): ${p} — banner ${JSON.stringify(short.d.banner)}`);
        // SPEC-016: wider still — the shortest text (no world name) comes before the skip
        let tiny = null;
        for (let k = short.k; k <= 2.5 && !tiny; k = Math.round((k + 0.05) * 100) / 100) {
          const d = await measureBanner(page, lang, pos, k);
          if (!d.banner) { fails.push(`${label} font ×${k}: no banner before the shortest text was used`); break; }
          if (d.banner.variant === "tiny") tiny = { k, d };
        }
        if (!tiny) fails.push(`${label}: the shortest text was never used`);
        else for (const p of bannerProblems(tiny.d, pos)) fails.push(`${label} font ×${tiny.k} (tiny): ${p} — banner ${JSON.stringify(tiny.d.banner)}`);
        const d = await measureBanner(page, lang, pos, 3);
        expect(d.mode, label).toBe("play");
        if (d.banner) fails.push(`${label} font ×3: a banner is shown though nothing fits — ${JSON.stringify(d.banner)}`);
      }
      }
    } finally {
      await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; });
    }
    expect(errors).toEqual([]);
    expect(fails, fails.join("\n")).toEqual([]);
  });
});

test.describe("phone menus", () => {
  test.use(PHONE_CTX);

  test("tapping a world tab selects that world", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.winter.unlocked = 5; b.progress.worlds.winter.stars = { 1: 2, 4: 3 }; b.world = "park"; b.mode = "map"; });
    await frames(page);
    const at = await page.evaluate(() => {
      const b = window.__bb, q = b.buttonRects.find(r => r.id === "maptab:winter"), c = document.getElementById("game").getBoundingClientRect(), s = c.width / b.uiSize.w;
      return { x: c.left + (q.x + q.w / 2) * s, y: c.top + (q.y + q.h / 2) * s };
    });
    await page.touchscreen.tap(at.x, at.y);
    await frames(page);
    expect(await page.evaluate(() => [window.__bb.world, window.__bb.level, window.__bb.progress.lastWorld, window.__bb.mapInfo.tabs.find(k => k.selected).world])).toEqual(["winter", 5, "winter", "winter"]);
    expect(await page.evaluate(() => window.__bb.hudRects.find(h => h.id === "map:title").text)).toBe("❄️ Winter  ⭐ 5/60");
    expect(errors).toEqual([]);
  });

  // SPEC-017: Play on the home screen, the bouncing next level on the map, Play on its card — real taps
  test("tapping the real Play buttons starts a one-player game", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    const tap = async find => {
      await frames(page);
      const r = await page.evaluate(f => ({ ui: window.__bb.uiSize, q: window.__bb.buttonRects.find(q => q.id === f) }), find);
      expect(r.q, find).toBeTruthy();
      await page.touchscreen.tap((r.q.x + r.q.w / 2) * r.ui.scale, (r.q.y + r.q.h / 2) * r.ui.scale);
    };
    await tap("home:play");
    expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
    await frames(page);
    const next = await page.evaluate(() => window.__bb.mapInfo.stops.find(q => q.next).n);
    await tap("stop:" + next);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("levelCard");
    await tap("card:play");
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.level])).toEqual(["play", next]);
    expect(await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "player").length)).toBe(1);
    expect(errors).toEqual([]);
  });

  test("tapping a name in the wardrobe tab opens a big enough input right over it", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "wardrobe"; });
    await frames(page);
    const r = await page.evaluate(() => ({ ui: window.__bb.uiSize, rect: window.__bb.buttonRects.find(q => q.id === "name:p1") }));
    const s = r.ui.scale;
    await page.touchscreen.tap((r.rect.x + r.rect.w / 2) * s, (r.rect.y + r.rect.h / 2) * s);
    const input = page.locator("input.name-input");
    await expect(input).toHaveCount(1);
    const box = await input.boundingBox(), canvasBox = await page.locator("#game").boundingBox();
    expect(Math.abs(box.x - canvasBox.x - r.rect.x * s)).toBeLessThan(1.5);
    expect(Math.abs(box.y - canvasBox.y - r.rect.y * s)).toBeLessThan(1.5);
    expect(Math.abs(box.width - r.rect.w * s)).toBeLessThan(1.5);
    expect(Math.abs(box.height - r.rect.h * s)).toBeLessThan(1.5);
    const font = await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(font).toBeGreaterThanOrEqual(16);
    expect(errors).toEqual([]);
  });

  test("the name input stays open and over its label when the keyboard shrinks the page", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "wardrobe"; });
    await frames(page);
    let r = await page.evaluate(() => ({ ui: window.__bb.uiSize, rect: window.__bb.buttonRects.find(q => q.id === "name:p1") }));
    await page.touchscreen.tap((r.rect.x + r.rect.w / 2) * r.ui.scale, (r.rect.y + r.rect.h / 2) * r.ui.scale);
    const input = page.locator("input.name-input");
    await expect(input).toHaveCount(1);
    await page.setViewportSize({ width: 844, height: 250 });   // Android: the keyboard makes the page shorter
    await frames(page); await frames(page);
    await expect(input).toHaveCount(1);
    r = await page.evaluate(() => ({ ui: window.__bb.uiSize, rect: window.__bb.buttonRects.find(q => q.id === "name:p1") }));
    const box = await input.boundingBox(), cv = await page.locator("#game").boundingBox(), s = r.ui.scale;
    expect(Math.abs(box.x - cv.x - r.rect.x * s)).toBeLessThan(1.5);
    expect(Math.abs(box.y - cv.y - r.rect.y * s)).toBeLessThan(1.5);
    expect(Math.abs(box.width - r.rect.w * s)).toBeLessThan(1.5);
    expect(Math.abs(box.height - r.rect.h * s)).toBeLessThan(1.5);
    expect(errors).toEqual([]);
  });
});

test.describe("phone portrait", () => {
  test.use({ ...PHONE_CTX, viewport: { width: 390, height: 844 } });

  test("the rotate overlay is big and nothing behind it can be tapped", async ({ phonePage: page }) => {
    const errors = page.sharedErrors;
    await frames(page);
    const d = await page.evaluate(() => ({ ui: window.__bb.uiSize, shown: window.__bb.rotateShown, texts: window.__bb.textSizes, buttons: window.__bb.buttonRects }));
    expect(d.shown).toBe(true);
    expect(d.texts.title * d.ui.scale).toBeGreaterThanOrEqual(24 - 0.01);
    expect(d.buttons).toEqual([]);
    expect(errors).toEqual([]);
  });
});

// SPEC-007 AC 10: the phone shop cards never overlap, also with wider fonts (CI and iPhone fonts are wider than Windows).
// The font scale (CFG.TEXT_TEST_SCALE) multiplies the measured width of every phone pRows text, like the banner test.
// Card parts are recorded in hudRects: card-pic, card-name, card-desc, card-pack, card-have, card-badge, card-no.
// __bb.shopLayout.step is how far the layout had to give way: 0 everything, 1 "you have" as a badge, 2 and the short
// pack, 3 description/name cut, 4 the last step. A wider font never makes it go back.
const SHOP_KINDS = ["mittens", "mega", "kisses", "rescues"];
function shopProblems(d, label) {
  const out = [], s = d.ui.scale, push = (ok, what) => { if (!ok) out.push(`${label}: ${what}`); };
  push(d.mode === "shop", `mode ${d.mode}`);
  push(!!d.layout, "no shopLayout");
  const parts = d.hud.filter(h => /^card-/.test(h.id)), buys = d.buttons.filter(q => String(q.id).startsWith("buy:"));
  push(buys.length === 4, `${buys.length} buy buttons`);
  // each card's column: between the midpoints to the neighbour cards' buy buttons
  const cx = buys.map(q => q.x + q.w / 2), cols = cx.map((x, i) => [i ? (cx[i - 1] + x) / 2 : 0, i < 3 ? (x + cx[i + 1]) / 2 : d.ui.w]);
  SHOP_KINDS.forEach((k, i) => {
    const mine = parts.filter(p => p.id.endsWith(":" + k)), has = id => mine.some(p => p.id === `card-${id}:${k}`);
    for (const id of ["pic", "name", "pack"]) push(has(id), `${k}: no ${id}`);
    push(has("have") || has("badge"), `${k}: neither "you have" nor a badge`);
    push(has("no") === d.poor[i], `${k}: "not enough coins" ${d.poor[i] ? "missing" : "shown"}`);
    for (const p of mine) {
      push(p.x >= cols[i][0] - 0.01 && p.x + p.w <= cols[i][1] + 0.01, `${p.id} leaves its card ${JSON.stringify(p)}`);
      push(p.y >= -0.01 && p.y + p.h <= d.ui.h + 0.01, `${p.id} off the screen`);
    }
  });
  parts.forEach((a, i) => {
    parts.slice(i + 1).forEach(b => push(!overlaps(a, b), `${a.id} on ${b.id} ${JSON.stringify(a)} ${JSON.stringify(b)}`));
    for (const q of buys) push(!overlaps(a, q), `${a.id} on ${q.id}`);
  });
  for (const cat of ["main", "hint"]) push(d.texts[cat] && d.texts[cat] * s >= d.min[cat] - 0.01, `smallest ${cat} text ${d.texts[cat] * s} CSS px`);
  return out;
}

const SHOP_SCALES = [1, 1.15, 1.3];
// SPEC-018: 10 coins ("not enough coins" under all four cards: the tightest cards) runs at every font scale; 999 coins
// at ×1 (and ×1.3 at 667, a spot check of the widest font without that row) — it checks that "not enough coins" is gone
// and, at 932 en, that nothing gives way. A wider font with 999 coins
// lays out the same card texts with no more in the way than with 10 coins, so those cases found nothing the 10-coin ones miss.
// Every language at every size stays (the es shop at 667 ×1.15 is the case that once failed).
for (const [vw, vh] of PHONE_SIZES) {
  test.describe(`phone shop ${vw}×${vh}`, () => {
    test.use({ ...PHONE_CTX, viewport: { width: vw, height: vh } });

    test(`the phone shop fits with wider fonts (${vw}×${vh})`, async ({ phonePage: page }) => {
      test.slow();
      const errors = page.sharedErrors;
      const fails = [];
      let cases = 0;
      try {
        for (const lang of LANGS) for (const coins of [10, 999]) {
          let lastStep = -1;
          for (const fontScale of coins === 10 ? SHOP_SCALES : vw === 667 ? [1, 1.3] : [1]) {
            const d = await page.evaluate(async ([lg, cn, fs]) => {
              const b = window.__bb;
              b.setLang(lg); b.CFG.TEXT_TEST_SCALE = fs;
              Object.assign(b.progress, { coins: cn }); Object.assign(b.progress.inv, { mittens: 0, mega: 1, kisses: 12, rescues: 3 });
              b.mode = "shop";
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              // which cards cannot be bought: from the real prices
              const prices = [b.GLOVES.mittens.price, b.GLOVES.mega.price, b.KISSES.price, b.RESCUE_KIT.price], L = b.I18N[lg];
              const fullPacks = [L.pack(b.GLOVES.mittens.charges), L.pack(b.GLOVES.mega.charges), L.kissPack(b.KISSES.pack), L.kitPack(b.RESCUE_KIT.pack)];
              return { ui: b.uiSize, hud: b.hudRects, buttons: b.buttonRects, texts: b.textSizes, min: b.textFloors, mode: b.mode,
                layout: b.shopLayout, poor: prices.map(p => cn < p), fullPacks };
            }, [lang, coins, fontScale]);
            const label = `${vw}×${vh} ${lang} ${coins} coins font ×${fontScale}`;
            cases++;
            fails.push(...shopProblems(d, label));
            if (!d.layout) continue;
            if (d.layout.step < lastStep) fails.push(`${label}: step ${d.layout.step} went back from ${lastStep}`);
            lastStep = d.layout.step;
            // a wide phone with real widths: nothing gives way — "you have" as text, the full pack text, no badge
            if (vw === 932 && lang === "en" && fontScale === 1) {
              const ids = d.hud.map(h => h.id);
              if (d.layout.step !== 0) fails.push(`${label}: step ${d.layout.step}, want 0`);
              for (const k of SHOP_KINDS) {
                if (!ids.includes("card-have:" + k)) fails.push(`${label}: no "you have" text for ${k}`);
                if (ids.includes("card-badge:" + k)) fails.push(`${label}: a badge for ${k}`);
              }
              if (d.layout.short || JSON.stringify(d.layout.packs) !== JSON.stringify(d.fullPacks)) fails.push(`${label}: packs ${JSON.stringify(d.layout.packs)}`);
            }
          }
        }
      } finally {
        await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; });
      }
      expect(cases).toBe(LANGS.length * (SHOP_SCALES.length + (vw === 667 ? 2 : 1)));
      expect(errors).toEqual([]);
      expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
    });
  });
}

// SPEC-019 AC 6: the first-time "Dad heard you running!" hint on a phone (the touch text, no keyboard key): two rows at most,
// inside the screen, off the buttons, the mini-map and the other plates (here with the kit hint and the touch hint too),
// nothing cut — en/es/ru with the real font width and a 15 % wider one (CFG.TEXT_TEST_SCALE).
test.describe("phone heard hint 667×375", () => {
  test.use({ ...PHONE_CTX, viewport: { width: 667, height: 375 } });

  test("the heard hint fits a phone in every language", async ({ phonePage: page }) => {
    const minText = await page.evaluate(() => window.__bb.textFloors);   // SPEC-031: + the story text floor
    const fails = [];
    for (const lang of LANGS) for (const fs of [1, 1.15]) {
      const d = await page.evaluate(async ([lg, f]) => {
        const b = window.__bb, g = b.grid;
        b.setLang(lg); b.CFG.TEXT_TEST_SCALE = f;
        Object.assign(b.progress.inv, { kisses: 5, mittens: 3, rescues: 3 }); b.progress.equip[0] = "mittens";
        b.startGame(1);
        const big = b.big;
        const l = b.littles[0], key = (c, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code: c }));
        b.littles.forEach((q, i) => { if (i) Object.assign(q, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40 }); });
        // the hero runs right behind the Big One (open ground, no wall in between) until he turns: the heard hint
        const free = (x, y) => !g.seeSolid(x, y) && !b.inSafe({ x, y }) && !b.inDanger({ x, y });
        let p = null;
        for (let cy = 4; cy < g.ROWS - 4 && !p; cy++) for (let cx = 6; cx < g.COLS - 2 && !p; cx++) {
          const q = { x: (cx + 0.5) * g.CELL, y: (cy + 0.5) * g.CELL };
          let ok = true;
          for (let s = 0; s <= 25 && ok; s++) ok = free(q.x - s * 4, q.y);
          if (ok) p = q;
        }
        Object.assign(big, { x: p.x, y: p.y, dir: 0, state: "look", timer: 999, lookSign: 0, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 999, hugCd: 0, noise: 0, hearCd: 0 });
        key("KeyS", true);
        for (let i = 0; i < 90 && big.hearCd <= 0; i++) { Object.assign(l, { x: p.x - 100, y: p.y, kx: 0, ky: 0 }); b.update(1 / 60); }
        key("KeyS", false);
        const heard = big.hearCd > 0;
        // then he is pushed (the kit hint and the 🩹 button) in the first seconds (the touch hint)
        Object.assign(big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, x: 465, y: 320, dir: 0 });
        Object.assign(l, { state: "ok", invuln: 0, dizzy: 0, x: 500, y: 320, kx: 0, ky: 0 });
        for (let i = 0; i < 12 && l.state === "ok"; i++) b.update(1 / 60);
        Object.assign(big, { x: 900, y: 600, stun: 999 });
        b.stats.time = 1; b.camSnap();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const hint = b.heardHint, c = document.createElement("canvas").getContext("2d");
        let rowsW = [];
        if (hint && hint.rect) { c.font = `800 ${hint.rect.size}px system-ui, "Segoe UI", sans-serif`; rowsW = hint.rect.rows.map(q => c.measureText(q).width * f); }
        return { heard, down: l.state, hint, rowsW, want: b.I18N[lg].heardHintTouch, ui: b.uiSize, buttons: b.buttonRects, hud: b.hudRects, mm: b.minimap, texts: b.textSizes };
      }, [lang, fs]);
      const label = `${lang} ×${fs}`;
      if (!d.heard || d.down !== "down") { fails.push(`${label}: setup heard ${d.heard}, hero ${d.down}`); continue; }
      if (!d.hint || !d.hint.rect) { fails.push(`${label}: no heard hint drawn`); continue; }
      const R = d.hint.rect;
      if (d.hint.text !== d.want) fails.push(`${label}: text "${d.hint.text}" is not the touch one`);
      if (R.rows.length > 2) fails.push(`${label}: ${R.rows.length} rows`);
      if (R.rows.join(" ") !== d.want) fails.push(`${label}: rows cut "${R.rows.join(" ")}"`);
      for (const w of d.rowsW) if (w > R.w + 0.5) fails.push(`${label}: row ${w.toFixed(1)} wider than the plate ${R.w.toFixed(1)}`);
      if (R.size * d.ui.scale < minText.main - 0.01) fails.push(`${label}: text ${R.size * d.ui.scale} CSS px`);
      for (const id of ["heardHint", "kitHint", "hint"]) if (!d.hud.some(h => h.id === id)) fails.push(`${label}: no ${id} plate`);
      fails.push(...phoneScreenProblems(label, d, minText));
    }
    await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); });
    expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
  });
});
