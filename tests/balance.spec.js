// SPEC-008: seeded randomness, sim mode, autopilot and the balance CI sample.
const base = require("@playwright/test");
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { openGame, sharedPage, resetGame, ROOT } = require("./helpers");

// SPEC-018: one game page for the file; resetGame() before each test, page errors and a changed CFG fail the test.
const shared = sharedPage();
const test = base.test.extend({
  page: async ({ browser }, use) => {
    const s = await shared.get(browser, "balance", { viewport: { width: 960, height: 640 } }, p => openGame(p));
    await resetGame(s.page);
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
  }
});
test.afterAll(async () => { await shared.close(); });

// ---------- AC 1: all gameplay randomness goes through one seeded rng() ----------
test("same seed, same game", { tag: "@fast" }, async ({ page }) => {
  // Math.random only in the helpers: the unseeded seed of rng() and the visual helper vrand()
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const uses = src.split("\n").map((s, i) => [i + 1, s]).filter(([, s]) => s.includes("Math.random") && !s.trim().startsWith("//"));
  const bad = uses.filter(([, s]) => !/^\s*(let rng = mulberry32\(|const vrand = )/.test(s)).map(([n, s]) => `index.html:${n}: ${s.trim()}`);
  expect(bad, "Math.random outside rng()/vrand():\n" + bad.join("\n")).toEqual([]);
  expect(uses.length).toBe(2);

  // Each run: seed, start Park 5 with one player + 4 bots, play 60 s of game time at 1/30 s in one evaluate (no frames
  // in between) and write down the world every second. `noise` replaces Math.random during the run: particles, hearts
  // and camera shake may draw from it, gameplay must not — so a run with other Math.random values plays the same.
  const runs = await page.evaluate(() => {
    const b = window.__bb, mathRandom = Math.random;
    const r2 = v => Math.round(v * 100) / 100;
    const play = (seed, noise) => {
      if (noise) Math.random = noise;
      try {
        b.seedRandom(seed);
        b.world = "park"; b.level = 5; b.startGame(1);
        const trace = [];
        let items = 0;
        for (let i = 1; i <= 60 * 30; i++) {
          b.update(1 / 30);
          if (i % 30) continue;
          const big = b.big;
          items = Math.max(items, b.items.length + b.stars.length);
          trace.push([r2(big.x), r2(big.y), big.state, big.hp, ...b.littles.flatMap(l => [r2(l.x), r2(l.y), l.state, l.task]),
            ...b.items.map(it => `${it.kind}@${r2(it.x)},${r2(it.y)}`), ...b.stars.map(s => `star@${r2(s.x)},${r2(s.y)}`)]);
        }
        return { trace: JSON.stringify(trace), items, hp: b.big.hp, maxHp: b.big.maxHp };
      } finally { Math.random = mathRandom; }
    };
    let k = 0;
    const out = { a: play(12345), b: play(12345, () => (k = (k + 0.37) % 1)), c: play(777) };
    b.seedRandom(); b.mode = "menu";
    return out;
  });
  expect(runs.a.items, "items or stars appeared during the run").toBeGreaterThan(0);
  expect(runs.b.trace, "same seed, other visual randomness: the same game").toBe(runs.a.trace);
  expect(runs.c.trace, "another seed: another game").not.toBe(runs.a.trace);
});
