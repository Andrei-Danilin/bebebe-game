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
    // at the start the hero is in his house in the top-left corner: the view clamps there
    expect(cam.rect.x).toBeGreaterThanOrEqual(-32 - EPS);
    expect(cam.rect.y).toBeGreaterThanOrEqual(-32 - EPS);
    let s = await heroScreen(page);
    expect(s.x).toBeLessThan(ui.w / 3);
    expect(s.y).toBeLessThan(ui.h / 2);
    // walking down the clear column x = 560 in the middle: the hero stays in the centre third
    await placeHero(page, 560, 180);
    await page.keyboard.down("KeyS");
    for (let i = 0; i < 6; i++) {
      await step(page, 0.25);
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
    await step(page, 2);
    cam = await page.evaluate(() => window.__bb.camera);
    expect(cam.rect.x + cam.rect.w).toBeLessThanOrEqual(960 + 32 + EPS);
    expect(cam.rect.y + cam.rect.h).toBeLessThanOrEqual(640 + 32 + EPS);
    expect(cam.rect.x + cam.rect.w).toBeGreaterThan(960 + 32 - 2);   // clamped, not short of the edge
    s = await heroScreen(page);
    expect(s.x).toBeGreaterThan(ui.w * 2 / 3);
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

  test("the camera stays on a downed hero", async ({ page }) => {
    const errors = await phonePlay(page);
    await placeHero(page, 560, 300);
    await page.evaluate(() => Object.assign(window.__bb.littles[0], { state: "down", downTimer: 18, rescue: 0 }));
    await step(page, 2);
    const cam = await page.evaluate(() => window.__bb.camera), l = await page.evaluate(() => ({ x: window.__bb.littles[0].x, y: window.__bb.littles[0].y }));
    expect(Math.abs(cam.target.x - l.x)).toBeLessThan(3);
    expect(Math.abs(cam.target.y - l.y)).toBeLessThan(3);
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
    expect(texts).toContain(en.onePlayer);
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
