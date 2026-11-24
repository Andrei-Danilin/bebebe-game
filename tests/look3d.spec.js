// SPEC-021: the 3D world in the comic style of art/ — thick black wobbly outlines, flat 2-tone colours, light soft
// shadows, a paper grain over the picture. Rendered pages only (the 3D scene is not built in sim mode); the scene is read
// through __bb.look3D() (drawn state, in SIM_DRAWN).
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames } = require("./helpers");

const play = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.world = w; b.level = n; b.startGame(1); }, [world, level]);

// AC 1: black (#1b1b1b), about 2× the old thickness (the hull grows by k × the thickness each part asks for), a seeded
// per-object wobble (the same level is drawn the same way again), CFG.OUTLINE_WOBBLE switches the wobble off
test("outlines are black #1b1b1b, twice as thick, with a seeded wobble that CFG.OUTLINE_WOBBLE turns off @fast", async ({ page }) => {
  const errors = await openGame(page);
  await play(page, "park", 1);
  await frames(page);
  const a = await page.evaluate(() => window.__bb.look3D().outline);
  expect(a.colors).toEqual(["#1b1b1b"]);
  expect(a.hulls).toBeGreaterThan(100);                    // characters, houses, walls, trees, rocks
  expect(a.k).toBeGreaterThan(1.8);
  expect(a.k).toBeLessThan(2.2);                           // the median is about 2× (the wobble moves single hulls)
  expect(a.spread).toBeGreaterThan(0.1);                   // not machine-perfect
  expect(a.shifted).toBeGreaterThan(0.5);                  // most hulls sit a little off-centre: one side a bit thicker
  for (const kind of ["home", "bighome", "tree", "rock"]) expect(a.kinds[kind], kind).toBeGreaterThan(0);
  // seeded: another level and back → the same map outlines
  await play(page, "park", 2);
  await play(page, "park", 1);
  await frames(page);
  expect((await page.evaluate(() => window.__bb.look3D().outline)).mapSig).toBe(a.mapSig);
  // wobble off → every hull exactly k × its thickness, centred
  const b = await page.evaluate(() => {
    const bb = window.__bb; bb.CFG.OUTLINE_WOBBLE = false;
    bb.world = "park"; bb.level = 2; bb.startGame(1);
    const r = bb.look3D().outline;
    bb.CFG.OUTLINE_WOBBLE = true; bb.level = 1; bb.startGame(1);
    return r;
  });
  expect(b.spread).toBeLessThan(1e-6);
  expect(b.shifted).toBe(0);
  expect(b.k).toBeCloseTo(await page.evaluate(() => window.__bb.CFG.OUTLINE_LOOK.k), 5);
  expect(errors).toEqual([]);
});

// AC 2: every world material is a toon material on a 2-tone gradient (light / shade) or an unlit one — nothing with a
// specular highlight; the sun's shadows are lighter and softer than before (intensity < 1, a blur radius)
test("world materials are flat: a 2-tone toon gradient, no specular, light soft shadows @fast", async ({ page }) => {
  const errors = await openGame(page);
  for (const w of ["park", "winter"]) {
    await play(page, w, 5);
    await frames(page);
    const r = await page.evaluate(() => window.__bb.look3D());
    expect(r.tones, w).toBe(2);
    expect(r.materials.filter(t => t !== "MeshToonMaterial" && t !== "MeshBasicMaterial"), w).toEqual([]);
    expect(r.toonOffGradient, w).toBe(0);                  // every toon material uses the 2-tone gradient
    expect(r.shadow.intensity, w).toBeLessThan(0.75);
    expect(r.shadow.radius, w).toBeGreaterThan(1.5);
  }
  expect(errors).toEqual([]);
});

// AC 4: a paper grain over the 3D (under the UI layer), multiply, ~0.08 opacity, made once; CFG.PAPER_GRAIN hides it
test("a paper grain lies over the 3D (multiply, ~0.08) and CFG.PAPER_GRAIN switches it off @fast", async ({ page }) => {
  const errors = await openGame(page);
  await play(page, "park", 1);
  await frames(page);
  const on = await page.evaluate(() => window.__bb.look3D().paper);
  expect(on.shown).toBe(true);
  expect(on.blend).toBe("multiply");
  expect(on.alpha).toBeGreaterThan(0.04);
  expect(on.alpha).toBeLessThan(0.15);
  expect(on.order).toEqual(["gl", "paper", "game"]);       // over the 3D, under the 2D interface
  expect(on.made).toBe(1);
  const off = await page.evaluate(async () => {
    const b = window.__bb; b.CFG.PAPER_GRAIN = false;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const p = b.look3D().paper; b.CFG.PAPER_GRAIN = true;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { p, again: b.look3D().paper };
  });
  expect(off.p.shown).toBe(false);
  expect(off.again.shown).toBe(true);
  expect(off.again.made).toBe(1);                          // generated once, not per switch
  expect(errors).toEqual([]);
});
