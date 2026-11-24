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

// AC 3 + 8: the ground of every world is painted with diagonal felt-tip strokes (seeded canvas strokes, not a flat colour per
// cell) and keeps its THEMES colour underneath; walls, houses, cottages and roofs are hatched on their shade side
test("every world's ground has diagonal marker strokes over its THEMES colour; walls and roofs are hatched", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const w of b.WORLDS) for (const lv of [1, 5]) {             // walls and houses (1), cottages with roofs (5)
      b.world = w; b.level = lv; b.startGame(1);
      const L = b.look3D();
      if (lv === 1) out[w] = { ground: L.ground, g1: b.THEMES[w].g1, g2: b.THEMES[w].g2 };
      out[w]["hatch" + lv] = L.hatch;
    }
    return out;
  });
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  for (const [w, q] of Object.entries(r)) {
    expect(q.ground.colors, `${w}: colours inside a cell`).toBeGreaterThanOrEqual(6);
    expect(q.ground.diag, `${w}: strokes run diagonally (change along / across)`).toBeGreaterThan(1.15);
    expect(Math.min(dist(q.ground.mean, hex(q.g1)), dist(q.ground.mean, hex(q.g2))), `${w}: ground stays its THEMES colour`).toBeLessThan(40);
    for (const lv of [1, 5]) {
      expect(q["hatch" + lv].pieces, `${w} ${lv}: walls found`).toBeGreaterThan(0);
      expect(q["hatch" + lv].plain, `${w} ${lv}: walls without hatching`).toEqual([]);
    }
  }
  await frames(page);                                       // the hatching shader compiles and draws without errors
  expect(errors).toEqual([]);
});

// AC 8: Winter's maze walls are clearly darker than the snow (contrast ratio of their THEMES colours): the sides, and the
// tops the camera mostly sees (before SPEC-021: #dbe8f6 walls with white snow caps — 1.2 and 1.0)
test("winter maze walls stand out from the snow", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const t = await page.evaluate(() => window.__bb.THEMES.winter);
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  expect(ratio(t.maze.wall, t.g1)).toBeGreaterThan(1.8);
  expect(ratio(t.maze.wall, t.g2)).toBeGreaterThan(1.8);
  expect(ratio(t.maze.cap, t.g1)).toBeGreaterThan(1.5);
  expect(errors).toEqual([]);
});

// no leak: building levels one after another does not pile up textures or geometries in the renderer
test("switching levels keeps the renderer's texture and geometry count flat", async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(async () => {
    const b = window.__bb, seen = [], tick = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    for (const [w, lv] of [["park", 1], ["winter", 5], ["city", 8], ["park", 1], ["winter", 5], ["city", 8], ["park", 1]]) {
      b.world = w; b.level = lv; b.startGame(1); await tick();
      seen.push(b.look3D().memory);
    }
    return seen;
  });
  expect(r[6].textures).toBeLessThanOrEqual(r[3].textures);
  expect(r[6].geometries).toBeLessThanOrEqual(r[3].geometries + 2);
  expect(errors).toEqual([]);
});
