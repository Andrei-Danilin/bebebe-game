// SPEC-042 AC 5 / 6, the 3D and the texts of the first two tricks: the Park's puddles are decals in the map, the Field's sprays are animated
// groups that show only while a sprinkler drips or sprays and are never batched; the SPLASH pop is in four languages; practice has none of it.
// (The rules are in tests/core/tricks-park-field.test.mjs.)
const { test, expect } = require("./pw");
const { openGame, frames } = require("./helpers");

test("the Park's puddles are in the 3D map: three parts each, and none in the practice map", async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const b = window.__bb;
    b.world = "park"; b.level = 3; b.startGame(1);
    return { n: b.trick.pieces.length, mesh: b.trickMeshes() };
  });
  await frames(page);
  expect(r.n).toBeGreaterThanOrEqual(3);
  expect(r.n).toBeLessThanOrEqual(5);
  expect(r.mesh.puddles, "3 parts a puddle: rim, water, shine").toBe(r.n * 3);
  expect(r.mesh.sprays).toEqual([]);
  const sprinklerWorld = await page.evaluate(() => { const b = window.__bb; b.world = "field"; b.level = 3; b.startGame(1); return b.trickMeshes().puddles; });
  expect(sprinklerWorld, "no puddles in the Field").toBe(0);
  const practice = await page.evaluate(() => { const b = window.__bb; b.tutorialSkip(); b.seedRandom(3); b.openTutorial("map", "game1"); return { trick: b.trick, mesh: b.trickMeshes() }; });
  expect(practice.trick).toBeNull();
  expect(practice.mesh).toEqual({ puddles: 0, rings: 0, waves: [], prints: null, trucks: [], sprays: [] });
  expect(errors).toEqual([]);
});

test("the Field's sprays are animated groups, shown while a sprinkler drips or sprays, and never batched", async ({ page }) => {
  const errors = await openGame(page);
  const n = await page.evaluate(() => { const b = window.__bb; b.world = "field"; b.level = 4; b.startGame(1); return b.trick.pieces.length; });
  await frames(page);
  const at = async t => {
    await page.evaluate(t0 => { window.__bb.trick.t = t0; }, t);
    await frames(page);
    return page.evaluate(() => ({ t: window.__bb.trick.t, m: window.__bb.trickMeshes(), pieces: window.__bb.trick.pieces, cfg: window.__bb.CFG.TRICKS.sprinklers }));
  };
  const first = await at(0.5);
  expect(first.m.rings, "a ring of reach per sprinkler").toBe(n);
  expect(first.m.sprays.length).toBe(n);
  expect(first.m.sprays.every(s => !s.batched), "the sprays are drawn by themselves").toBe(true);
  // every sprinkler is shown exactly when its phase is not off; the wet ground only in the spray
  for (const t of [3, 9, 14.3, 16, 19.5, 21, 30]) {
    const r = await at(t), c = r.cfg;
    for (const s of r.m.sprays) {
      const u = (((r.t + r.pieces[s.i].off) % c.cycle) + c.cycle) % c.cycle, phase = u >= c.cycle - c.spray ? "spray" : u >= c.cycle - c.spray - c.warn ? "drip" : "off";
      expect(s.on, `sprinkler ${s.i} at ${t}: ${phase}`).toBe(phase !== "off");
      expect(s.wet, `wet ground of ${s.i} at ${t}`).toBe(phase === "spray");
    }
  }
  expect(errors).toEqual([]);
});

test("SPLASH is a pop text in all four languages", async ({ page }) => {
  await openGame(page, { sim: true });   // data only: nothing is drawn
  const t = await page.evaluate(() => Object.fromEntries(["en", "es", "pt", "ru"].map(l => [l, window.__bb.I18N[l].splash])));
  expect(Object.values(t).every(v => typeof v === "string" && v.length > 1), JSON.stringify(t)).toBe(true);
  expect(new Set(Object.values(t)).size, "four different words").toBe(4);
});

test("the City's ice-cream truck is an animated group: one per level, not batched, and the picture follows the core", async ({ page }) => {
  const errors = await openGame(page);
  const r0 = await page.evaluate(() => { const b = window.__bb; b.world = "city"; b.level = 4; b.startGame(1); b.big.stun = 99; return { t: b.trick, m: b.trickMeshes() }; });
  await frames(page);
  expect(r0.t.name).toBe("truck");
  expect(r0.m.trucks.length).toBe(1);
  expect(r0.m.trucks[0].batched, "the truck is drawn by itself").toBe(false);
  expect(r0.m.puddles + r0.m.sprays.length).toBe(0);
  // the game is frozen (pause) in the same evaluate that reads the core: the frames that draw the picture then show exactly this state (a live truck keeps driving
  // between the read and the mesh, and a slow software frame widens the gap)
  const r1 = await page.evaluate(() => { const b = window.__bb; for (let i = 0; i < 90; i++) b.update(1 / 60); const st = { ...b.trick.st }; b.mode = "pause"; return { st, nodes: b.trick.pieces[0].nodes.length }; });
  await frames(page);
  const m = await page.evaluate(() => window.__bb.trickMeshes());
  expect(Math.hypot(m.trucks[0].x - r1.st.x, m.trucks[0].y - r1.st.y), "drawn where the core has it (frozen: the same state)").toBeLessThan(12);
  expect(r1.nodes).toBeGreaterThanOrEqual(16);
  expect(errors).toEqual([]);
});

// ---------- SPEC-042 AC 8: the school bell in the HUD; AC 10: the footprints' pool ----------
async function bellAt(page, t) {
  await page.evaluate(t0 => { window.__bb.trick.t = t0; }, t);
  await frames(page);
  return page.evaluate(() => ({ ...window.__bb.bellHud, ui: window.__bb.uiSize, over: window.__bb.textOverflows, timer: window.__bb.hudRects.filter(r => r.id === "timer" || r.id === "hearts") }));
}
const bellChecks = (label, state) => {
  test(`the school bell in the HUD: the warning shows 2, 1 and the ring says Freeze! in every language, inside the screen and clear of the timer (${label})`, async ({ page }) => {
    const errors = await openGame(page, state.query ? { query: state.query } : {});
    await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.level = 3; b.startGame(1); b.big.stun = 99; });
    await frames(page);
    expect((await bellAt(page, 10)).bell, "quiet: no bell").toBeNull();
    for (const lang of ["en", "es", "pt", "ru"]) {
      await page.evaluate(l => window.__bb.setLang(l), lang);
      for (const [t, phase, count] of [[25.3, "warn", 2], [26.3, "warn", 1], [28, "ring", 0]]) {
        const r = await bellAt(page, t);
        expect(r.bell, `${lang} at ${t}`).not.toBeNull();
        expect([r.bell.phase, r.bell.count]).toEqual([phase, count]);
        expect(r.bell.x).toBeGreaterThanOrEqual(0); expect(r.bell.y).toBeGreaterThanOrEqual(0);
        expect(r.bell.x + r.bell.w).toBeLessThanOrEqual(r.ui.w); expect(r.bell.y + r.bell.h).toBeLessThanOrEqual(r.ui.h);
        for (const q of r.timer) expect(r.bell.y >= q.y + q.h - 1 || r.bell.x >= q.x + q.w - 1 || r.bell.x + r.bell.w <= q.x + 1, `${lang}: the bell plate overlaps ${q.id}`).toBe(true);
        expect(r.over, `${lang} at ${t}: text that does not fit`).toEqual([]);
        if (phase === "ring") expect(r.bell.text).toBe(await page.evaluate(l => window.__bb.I18N[l].freeze, lang));
      }
    }
    expect(errors).toEqual([]);
  });
  test(`the Freeze! banner shows on the first ring of a level only, fits, and fades (${label})`, async ({ page }) => {
    const errors = await openGame(page, state.query ? { query: state.query } : {});
    await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.level = 3; b.startGame(1); b.big.stun = 99; b.trick.t = 26.99; b.update(1 / 60); });   // the ring starts
    await frames(page);
    const first = await page.evaluate(() => ({ ...window.__bb.bellHud, ui: window.__bb.uiSize, over: window.__bb.textOverflows }));
    expect(first.freezeT).toBeGreaterThan(1);
    expect(first.freeze, "the banner").not.toBeNull();
    expect(first.freeze.x).toBeGreaterThanOrEqual(0); expect(first.freeze.x + first.freeze.w).toBeLessThanOrEqual(first.ui.w);
    expect(first.freeze.y + first.freeze.h).toBeLessThanOrEqual(first.ui.h);
    expect(first.over).toEqual([]);
    await page.evaluate(() => { const b = window.__bb; for (let i = 0; i < 130; i++) b.update(1 / 60); });
    await frames(page);
    expect((await page.evaluate(() => window.__bb.bellHud)).freeze, "faded").toBeNull();
    // the second ring: no banner
    await page.evaluate(() => { const b = window.__bb; b.trick.t = 40; b.update(1 / 60); b.trick.t = 56.99; b.update(1 / 60); });
    await frames(page);
    const second = await page.evaluate(() => ({ ...window.__bb.bellHud, rings: window.__bb.trick.st.rings }));
    expect(second.rings).toBe(2);
    expect(second.freeze).toBeNull();
    expect(errors).toEqual([]);
  });
};
test.describe("school bell, desktop", () => { bellChecks("960×640", {}); });
test.describe("school bell, phone 667", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  bellChecks("phone 667×375", { query: "?phone=1" });
});

test("Winter's footprints are one pooled instanced mesh made with the map: none shown at the start, count follows the game, never batched", async ({ page }) => {
  const errors = await openGame(page);
  const r0 = await page.evaluate(() => { const b = window.__bb; b.world = "winter"; b.level = 3; b.startGame(1); b.big.stun = 99; return { name: b.trick.name, m: b.trickMeshes(), max: b.CFG.TRICKS.footprints.max }; });
  await frames(page);
  expect(r0.name).toBe("footprints");
  expect(r0.m.prints).toEqual({ shown: 0, room: r0.max, batched: false });
  // the kid runs: prints appear in the core and in the pool
  await page.evaluate(() => { const b = window.__bb, l = b.littles[0]; Object.assign(l, { x: 480, y: 300 }); });
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(() => window.__bb.trick.st.prints.length >= 4, null, { timeout: 8000 });
  await page.keyboard.up("ArrowRight");
  await frames(page);
  const r1 = await page.evaluate(() => ({ core: window.__bb.trick.st.prints.length, m: window.__bb.trickMeshes().prints }));
  expect(r1.m.shown).toBe(Math.min(r1.core, r0.max));
  expect(r1.m.batched).toBe(false);
  expect(errors).toEqual([]);
});

test("the Beach's waves: a wet-sand strip per band (batched), and a water sheet per strip that is its own group, shown and sized by the wave", async ({ page }) => {
  const errors = await openGame(page);
  const r0 = await page.evaluate(() => { const b = window.__bb; b.world = "beach"; b.level = 4; b.startGame(1); b.big.stun = 99; return { n: b.trick.pieces.length, d: b.CFG.TRICKS.waves.depth, off: b.trick.meta.off, m: b.trickMeshes() }; });
  await frames(page);
  expect(r0.n).toBeGreaterThan(0);
  expect(r0.m.waves.length).toBe(r0.n);
  expect(r0.m.waves.every(w => !w.batched), "the water is drawn by itself").toBe(true);
  const at = async t => { await page.evaluate(t0 => { window.__bb.trick.t = t0; }, t - r0.off + 40);   // t — where in the cycle the wave is (the band has its own phase)
    await frames(page); return page.evaluate(() => window.__bb.trickMeshes().waves); };
  for (const w of await at(5)) expect([w.on, w.k]).toEqual([false, 0]);
  for (const w of await at(17)) { expect(w.on).toBe(true); expect(w.k).toBeCloseTo(r0.d, 1); }
  for (const w of await at(14.3)) { expect(w.on).toBe(true); expect(w.k).toBeGreaterThan(0); expect(w.k).toBeLessThan(r0.d); }
  expect(errors).toEqual([]);
});
