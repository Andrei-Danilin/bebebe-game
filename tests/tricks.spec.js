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
  expect(practice.mesh).toEqual({ puddles: 0, rings: 0, trucks: [], sprays: [] });
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
  await openGame(page);
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
  const r1 = await page.evaluate(() => { const b = window.__bb; for (let i = 0; i < 90; i++) b.update(1 / 60); return { st: { ...b.trick.st }, nodes: b.trick.pieces[0].nodes.length }; });
  await frames(page);
  const m = await page.evaluate(() => window.__bb.trickMeshes());
  expect(Math.hypot(m.trucks[0].x - r1.st.x, m.trucks[0].y - r1.st.y), "drawn where the core has it (a few live steps apart)").toBeLessThan(12);
  expect(r1.nodes).toBeGreaterThanOrEqual(16);
  expect(errors).toEqual([]);
});
