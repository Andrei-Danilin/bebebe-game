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
async function phonePlay(page) {
  const errors = await openGame(page, { query: "?phone=1" });
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); Object.assign(b.big, { state: "look", timer: 999, stun: 999 }); });
  return errors;
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

  test("the camera follows the hero and stops at the map edges", async ({ page }) => {
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
    // walking down the clear column x = 560 in the middle: the hero stays in the centre third
    await placeHero(page, 560, 180);
    await page.keyboard.down("KeyS");
    for (let i = 0; i < 6; i++) {
      await stepCam(page, 0.25);
      s = await heroScreen(page);
      expect(s.x, `x at ${i}`).toBeGreaterThan(ui.w / 3); expect(s.x).toBeLessThan(ui.w * 2 / 3);
      expect(s.y, `y at ${i}`).toBeGreaterThan(ui.h / 3); expect(s.y).toBeLessThan(ui.h * 2 / 3);
    }
    const walked = await page.evaluate(() => window.__bb.littles[0].y);
    expect(walked).toBeGreaterThan(330);                         // he really walked
    cam = await page.evaluate(() => window.__bb.camera);
    expect(cam.target.y).toBeGreaterThan(walked);                // look-ahead: the camera is ahead of him
    await page.keyboard.up("KeyS");
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

  test("the camera smoothing does not depend on the frame rate", async ({ page }) => {
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

  test("the camera stays on a downed or resting hero (no look-ahead)", async ({ page }) => {
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

  test("a hero in a top-right house is not hidden under the mini-map, team chips or top bar", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.beach.unlocked = 20; b.world = "beach"; b.level = 12; b.startGame(1); Object.assign(b.big, { stun: 999 }); });   // rooms, the house top-right
    await frames(page);
    const d = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0];
      return { z: b.safeZone, feet: b.toScreen(l.x, l.y), head: b.toScreen(l.x, l.y, 72), mm: b.minimap, hud: b.hudRects, ui: b.uiSize };
    });
    expect(d.z.x).toBeGreaterThan(600); expect(d.z.y).toBeLessThan(100);        // the house really is top-right
    const team = d.hud.find(h => h.id === "team"), bar = d.hud.find(h => h.id === "hearts");
    const blocked = [{ x: d.mm.x, y: 0, w: d.ui.w - d.mm.x, h: team.y + team.h }, { x: 0, y: 0, w: d.ui.w, h: bar.y + bar.h }];
    for (const p of [d.feet, d.head]) for (const r of blocked) {
      expect(p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h, `hero point ${JSON.stringify(p)} under ${JSON.stringify(r)}`).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  test("the follow goal changes smoothly when the hero walks the top-right diagonal", async ({ page }) => {
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

  test("after the win the camera zooms out to the whole map, the next level snaps back", async ({ page }) => {
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

  test("joystick appears under the finger on the left only", async ({ page }) => {
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
      const b = window.__bb, l = b.littles[0], x0 = l.x, y0 = l.y;
      for (let i = 0; i < 30; i++) b.update(1 / 60);
      return { dx: l.x - x0, dy: l.y - y0 };
    });
    expect(walk.dx).toBeGreaterThan(150 * 0.5 * 0.6 - 2);             // he walks right at the speed the stick says (as today)
    expect(walk.dx).toBeLessThan(150 * 0.5 * 0.6 + 2);
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
    // buttons win over the stick: the kiss button (right) and the pause button (left part of the screen)
    await page.evaluate(() => { window.__bb.progress.inv.kisses = 5; });
    await frames(page);
    const rects = await page.evaluate(() => window.__bb.buttonRects);
    const kiss = rects.find(r => r.id === "kiss:0"), pause = rects.find(r => r.text === "II");
    expect(pause.x + pause.w / 2).toBeLessThan(ui.w * 0.55);
    await touch(page, "pointerdown", kiss.x + kiss.w / 2, kiss.y + kiss.h / 2, 9);
    expect(await page.evaluate(() => window.__bb.sticks.length)).toBe(0);
    await touch(page, "pointerup", kiss.x + kiss.w / 2, kiss.y + kiss.h / 2, 9);
    await touch(page, "pointerdown", pause.x + pause.w / 2, pause.y + pause.h / 2, 10);
    expect(await page.evaluate(() => window.__bb.sticks.length)).toBe(0);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("pause");
    await touch(page, "pointerup", pause.x + pause.w / 2, pause.y + pause.h / 2, 10);
    expect(errors).toEqual([]);
  });

  test("phones play with one player", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
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
    // key 2 in the menu too
    await page.evaluate(() => { window.__bb.mode = "menu"; });
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
    // skins: Player 1 and the Big One, no Player 2
    await page.evaluate(() => { window.__bb.mode = "skins"; });
    await frames(page);
    const ids = (await page.evaluate(() => window.__bb.buttonRects)).map(r => r.id);
    expect(ids).toContain("name:p1"); expect(ids).toContain("name:big"); expect(ids).not.toContain("name:p2");
    expect(await page.evaluate(() => window.__bb.skinPanels().map(p => p.key))).toEqual(["p1", "big"]);
    // shop: "who wears what" only for Player 1
    await page.evaluate(() => { window.__bb.mode = "shop"; });
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
    await frames(page);
    expect((await page.evaluate(() => window.__bb.buttonRects)).map(r => r.text)).toContain(en.twoPlayers);
    await page.evaluate(() => window.__bb.startGame(2));
    expect(await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "player").length)).toBe(2);
    expect(await page.evaluate(() => window.__bb.stickR())).toBe(55);
    await touch(page, "pointerdown", 800, 400);                       // right half → player 2's stick
    const st = await page.evaluate(() => window.__bb.sticks);
    expect(st.length).toBe(1); expect(st[0].player).toBe(1);
    await touch(page, "pointerup", 800, 400);
    await page.evaluate(() => { window.__bb.mode = "skins"; });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.skinPanels().map(p => p.key))).toEqual(["p1", "p2", "big"]);
    expect(errors).toEqual([]);
  });
});

// AC 6–7: mini-map and edge arrows.
const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const kindsOf = mm => new Set(mm.markers.map(m => m.kind));

test.describe("phone mini-map", () => {
  test.use(PHONE_CTX);

  test("mini-map shows the level and everyone on it", async ({ page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    await frames(page);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    let mm = await page.evaluate(() => window.__bb.minimap);
    expect(mm).toBeTruthy();
    // top-right, inside the UI (which is inside the safe area), 26 % of the width, 3:2
    expect(mm.x + mm.w).toBeLessThanOrEqual(ui.w); expect(mm.x + mm.w).toBeGreaterThan(ui.w - 20);
    expect(mm.y).toBeGreaterThanOrEqual(0); expect(mm.y).toBeLessThan(20);
    expect(Math.abs(mm.w - 0.26 * ui.w)).toBeLessThan(1);
    expect(Math.abs(mm.w / mm.h - 1.5)).toBeLessThan(0.01);
    for (const k of ["hero", "bot", "big", "cone", "view"]) expect(kindsOf(mm).has(k), k).toBe(true);
    const hero = mm.markers.find(m => m.kind === "hero");
    expect(Math.abs(hero.x - (mm.x + 560 * mm.w / 960))).toBeLessThan(1);
    expect(Math.abs(hero.y - (mm.y + 300 * mm.h / 640))).toBeLessThan(1);
    expect(mm.markers.filter(m => m.kind === "bot").length).toBe(4);
    // a star, an item and a downed bot appear
    await page.evaluate(() => { const b = window.__bb; b.spawnStar(); b.spawnItem(); Object.assign(b.littles[1], { state: "down", downTimer: 18, rescue: 0 }); });
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

  test("edge arrows point to the off-screen Big One and downed friends", async ({ page }) => {
    // Each teleport (the Big One, a downed bot) costs a ~15 s GPU stall in SwiftShader on the next frame —
    // on desktop too, not caused by the phone code — so this test gets the slow timeout.
    test.slow();
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    // the Big One far away in the bottom-left: one red arrow at the edge, towards him
    await page.evaluate(() => Object.assign(window.__bb.big, { x: 60, y: 600 }));
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
    await page.evaluate(() => Object.assign(window.__bb.big, { x: 620, y: 330 }));
    await frames(page);
    expect(await page.evaluate(() => window.__bb.edgeArrows.filter(a => a.kind === "big").length)).toBe(0);
    // a downed bot off screen in the top-right (where the mini-map is): a green arrow, clear of the mini-map and buttons
    await page.evaluate(() => Object.assign(window.__bb.littles[1], { x: 900, y: 40, state: "down", downTimer: 18, rescue: 0 }));
    await frames(page);
    r = await page.evaluate(() => {
      const b = window.__bb, l = b.littles[0];
      return { arrows: b.edgeArrows, hs: b.toScreen(l.x, l.y), ts: b.toScreen(b.littles[1].x, b.littles[1].y), mm: b.minimap, buttons: b.buttonRects };
    });
    expect(r.ts.y).toBeLessThan(0);
    const down = r.arrows.filter(a => a.kind === "downed");
    expect(down.length).toBe(1);
    expect(Math.abs(down[0].angle - Math.atan2(r.ts.y - r.hs.y, r.ts.x - r.hs.x))).toBeLessThan(0.01);
    // a downed friend on screen but under the mini-map also gets an arrow
    const best = await page.evaluate(() => {
      const b = window.__bb, mm = b.minimap;
      // a world point whose screen point is inside the mini-map
      grid: for (let y = 16; y < 640; y += 16) for (let x = 16; x < 960; x += 16) {
        const s = b.toScreen(x, y);
        if (s.x > mm.x + 10 && s.x < mm.x + mm.w - 10 && s.y > mm.y + 10 && s.y < mm.y + mm.h - 10) {
          Object.assign(b.littles[1], { x: 900, y: 40, state: "ok" });
          Object.assign(b.littles[2], { x, y, state: "down", downTimer: 18, rescue: 0 });
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
  pause: async page => {
    await page.evaluate(() => { const b = window.__bb; b.startGame(1); b.stats.time = 30; b.mode = "pause"; });
  },
  menu: async page => {
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.park.unlocked = 10; b.level = 5; b.progress.worlds.park.stars[5] = 2; b.resetWorld(1); b.mode = "menu"; });
  },
  skins: async page => { await page.evaluate(() => { window.__bb.mode = "skins"; }); },
  names: async page => { await page.evaluate(() => { window.__bb.mode = "names"; }); },
  shop: async page => { await page.evaluate(() => { const b = window.__bb; b.progress.coins = 25; b.mode = "shop"; }); },
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

function checkPhoneScreen(name, d, minText) {
  const s = d.ui.scale, cssPad = px => px / s - 0.01;
  const inside = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= d.ui.w + 0.01 && r.y + r.h <= d.ui.h + 0.01;
  expect(d.buttons.length, `${name}: some buttons`).toBeGreaterThan(0);
  for (const b of d.buttons) {
    const id = `${name}: button ${b.id || ""} ${b.text || ""}`;
    expect(b.w * s, `${id} width`).toBeGreaterThanOrEqual(44 - 0.01);
    expect(b.h * s, `${id} height`).toBeGreaterThanOrEqual(44 - 0.01);
    expect(inside(b), `${id} inside the screen`).toBe(true);
    if (b.textW !== undefined) expect(b.textW, `${id} text wider than the button`).toBeLessThanOrEqual(b.w + 0.5);
    if (d.mm) expect(overlaps(b, d.mm), `${id} on the mini-map`).toBe(false);
    for (const h of d.hud) expect(overlaps(b, h), `${id} on ${h.id}`).toBe(false);
  }
  d.buttons.forEach((a, i) => d.buttons.slice(i + 1).forEach(b =>
    expect(overlaps(a, b, cssPad(8)), `${name}: ${a.id || a.text} and ${b.id || b.text} closer than 8 CSS px`).toBe(false)));
  d.hud.forEach((a, i) => {
    expect(inside(a), `${name}: ${a.id} inside the screen`).toBe(true);
    if (d.mm) expect(overlaps(a, d.mm), `${name}: ${a.id} on the mini-map`).toBe(false);
    d.hud.slice(i + 1).forEach(b => expect(overlaps(a, b), `${name}: ${a.id} on ${b.id}`).toBe(false));
  });
  for (const [cat, px] of Object.entries(d.texts)) expect(px * s, `${name}: smallest ${cat} text`).toBeGreaterThanOrEqual((cat === "drawn" ? minText.hint : minText[cat]) - 0.01);
  if (d.texts.main || d.texts.title) expect(d.texts.drawn, `${name}: drawn text sizes recorded`).toBeTruthy();
}

for (const [vw, vh] of PHONE_SIZES) {
  test.describe(`phone sizes ${vw}×${vh}`, () => {
    test.use({ ...PHONE_CTX, viewport: { width: vw, height: vh } });

    test(`every phone button is big enough at ${vw}×${vh}`, async ({ page }) => {
      test.slow();
      const errors = await openGame(page, { query: "?phone=1" });
      const minText = await page.evaluate(() => window.__bb.CFG.PHONE_TEXT);
      for (const [name0, setup] of (vw === 667 ? ["en", "es", "ru"] : ["en"]).flatMap(lg => Object.entries(PHONE_SCENES).map(([n, f]) => [lg + " " + n, async pg => { await pg.evaluate(l => window.__bb.setLang(l), lg); await f(pg); }]))) {
        const name = name0.split(" ")[1], label = name0;
        await setup(page);
        await frames(page);
        const d = await page.evaluate(() => {
          const b = window.__bb, l = b.littles[0];
          return { ui: b.uiSize, buttons: b.buttonRects, hud: b.hudRects, mm: b.minimap, texts: b.textSizes, banner: b.bannerRect,
            hero: b.toScreen(l.x, l.y), head: b.toScreen(l.x, l.y, 72), mode: b.mode, typeLabel: b.typeLabel };
        });
        expect(d.mode, label).toBe(name === "rest" || name === "long" ? "play" : name);
        checkPhoneScreen(label, d, minText);
        expect(d.texts.main || d.texts.title, `${label}: texts recorded`).toBeTruthy();
        if (name === "menu") {
          const L = d.typeLabel;
          expect(L, `${label}: type label`).toBeTruthy();
          expect(L.y).toBeGreaterThanOrEqual(L.rulesBottom + 2);
          expect(L.size * d.ui.scale).toBeGreaterThanOrEqual(15 - 0.01);
          for (const q of d.buttons) expect(overlaps(L, q), `${label}: type label on ${q.id || q.text}`).toBe(false);
          expect(d.buttons.map(q => q.text)).toEqual(expect.arrayContaining(["◀"]));
          // SPEC-006: four world cards, each a button of at least 44×44 CSS px (checked above), the type label under them
          const cards = d.buttons.filter(q => String(q.id).startsWith("world:"));
          expect(cards.map(q => q.id), label).toEqual(["world:park", "world:school", "world:beach", "world:winter"]);
          expect(L.y, `${label}: type label under the world cards`).toBeGreaterThanOrEqual(Math.max(...cards.map(q => q.y + q.h)));
        }
        if (name === "shop") expect(d.buttons.map(q => q.id)).toEqual(expect.arrayContaining(["buy:mittens", "buy:mega", "buy:kisses"]));
        if (name === "skins") expect(d.buttons.map(q => q.id)).toEqual(expect.arrayContaining(["name:p1", "name:big"]));
        if (name === "names") expect(d.buttons.filter(q => String(q.id).startsWith("name:bot")).length).toBe(4);
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
          for (const p of [d.hero, d.head]) expect(p.x >= d.banner.x && p.x <= d.banner.x + d.banner.w && p.y >= d.banner.y && p.y <= d.banner.y + d.banner.h).toBe(false);
        }
        if (name === "rest") expect(d.hud.map(h => h.id)).toContain("rest");
        if (name === "pause") expect(d.buttons.length).toBeGreaterThanOrEqual(3);
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe("phone menus", () => {
  test.use(PHONE_CTX);

  test("tapping a world card selects that world", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.winter.unlocked = 5; b.progress.worlds.winter.stars = { 1: 2, 4: 3 }; b.mode = "menu"; });
    await frames(page);
    const at = await page.evaluate(() => {
      const b = window.__bb, q = b.buttonRects.find(r => r.id === "world:winter"), c = document.getElementById("game").getBoundingClientRect(), s = c.width / b.uiSize.w;
      return { x: c.left + (q.x + q.w / 2) * s, y: c.top + (q.y + q.h / 2) * s, stars: b.worldCards.find(k => k.world === "winter").stars };
    });
    expect(at.stars).toBe("⭐ 5/60");
    await page.touchscreen.tap(at.x, at.y);
    await frames(page);
    expect(await page.evaluate(() => [window.__bb.world, window.__bb.level, window.__bb.progress.lastWorld, window.__bb.worldCards.find(k => k.selected).world])).toEqual(["winter", 5, "winter", "winter"]);
    expect(errors).toEqual([]);
  });

  test("tapping the real menu Play button starts a one-player game", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await frames(page);
    const r = await page.evaluate(() => ({ ui: window.__bb.uiSize, play: window.__bb.buttonRects.find(q => q.text === "▶ " + window.__bb.I18N.en.play) }));
    expect(r.play).toBeTruthy();
    await page.touchscreen.tap((r.play.x + r.play.w / 2) * r.ui.scale, (r.play.y + r.play.h / 2) * r.ui.scale);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
    expect(await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "player").length)).toBe(1);
    expect(errors).toEqual([]);
  });

  test("tapping a name on the skins screen opens a big enough input right over it", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.evaluate(() => { window.__bb.mode = "skins"; });
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

  test("the name input stays open and over its label when the keyboard shrinks the page", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.evaluate(() => { window.__bb.mode = "skins"; });
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

  test("the install hint fits the phone menu on iPhone Safari", async ({ browser }) => {
    const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const ctx = await browser.newContext({ ...PHONE_CTX, viewport: { width: 667, height: 375 }, userAgent: IPHONE_UA });
    const page = await ctx.newPage();
    const errors = await openGame(page, { query: "?phone=1" });
    const minText = await page.evaluate(() => window.__bb.CFG.PHONE_TEXT);
    for (const lang of ["en", "es", "ru"]) {
      await page.evaluate(l => window.__bb.setLang(l), lang);
      await frames(page);
      const d = await page.evaluate(() => { const b = window.__bb; return { ui: b.uiSize, buttons: b.buttonRects, hud: b.hudRects, mm: b.minimap, texts: b.textSizes, shown: b.installHintShown }; });
      expect(d.shown, lang).toBe(true);
      checkPhoneScreen("menu " + lang, d, minText);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe("phone portrait", () => {
  test.use({ ...PHONE_CTX, viewport: { width: 390, height: 844 } });

  test("the rotate overlay is big and nothing behind it can be tapped", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await frames(page);
    const d = await page.evaluate(() => ({ ui: window.__bb.uiSize, shown: window.__bb.rotateShown, texts: window.__bb.textSizes, buttons: window.__bb.buttonRects }));
    expect(d.shown).toBe(true);
    expect(d.texts.title * d.ui.scale).toBeGreaterThanOrEqual(24 - 0.01);
    expect(d.buttons).toEqual([]);
    expect(errors).toEqual([]);
  });
});
