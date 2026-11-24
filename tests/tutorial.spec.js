// SPEC-029: Dad starts with 5 hearts (one fewer on every ordinary level) and the tutorial — picture pages and two practice
// games after the intro comic on the first launch, with Skip, replayable from the Story's "How to play" page.
// Logic-only tests use a shared sim page; the first-launch tests open their own rendered page (the intro opens in frame()).
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const { openGame, sharedPage, resetGame, softly } = require("./helpers");

const sharedSim = sharedPage();
const test = base.test.extend({
  simPage: async ({ browser }, use) => {
    const s = await sharedSim.get(browser, "sim", { viewport: { width: 960, height: 640 } }, p => openGame(p, { sim: true }));
    await resetGame(s.page);
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
  }
});
test.afterAll(async () => { await sharedSim.close(); });

// ---------- AC 1: Dad starts with 5 hearts — one fewer on every ordinary level, the cap of 12 stays, bosses keep their extras ----------
test("Dad starts with 5 hearts: one fewer on every level", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, d = {};
    for (const w of b.WORLDS) d[w] = Array.from({ length: 20 }, (_, i) => b.difficulty(w, i + 1).hearts);
    b.world = "park"; b.level = 1; b.startGame(1);
    const park1 = b.big.maxHp;
    b.world = "park"; b.level = 1; b.resetWorld(1); b.mode = "home";
    return { hp: C.BIG_HP, max: C.BIG_HP_MAX, per: C.HP_LEVELS_PER_HEART, perWorld: C.HP_PER_WORLD, diff: C.WORLD_DIFFICULTY, d, park1,
      worlds: b.WORLDS, bosses: Object.fromEntries(b.WORLDS.map(w => [w, b.bossFor(w, 20)])) };
  });
  expect([r.hp, r.max, r.per, r.perWorld]).toEqual([5, 12, 4, 1]);
  // the four pinned levels (spec): Park 1, Park 20 (boss + 2), Field 1, School 20 (the grumpiest dad + 3, his base at the cap)
  expect([r.d.park[0], r.d.park[19], r.d.field[0], r.d.school[19]]).toEqual([5, 11, 6, 15]);
  expect(r.park1, "the game starts Park 1 with 5").toBe(5);
  // every ordinary level: the old count (6 + one per 4 levels + the world's difficulty) minus one, never above 12
  const soft = softly();
  for (const w of r.worlds) for (let n = 1; n <= 20; n++) {
    const old = 6 + Math.floor((n - 1) / 4) + r.diff[w], extra = r.bosses[w] && n === 20 ? (w === "school" ? 3 : 2) : 0;
    soft(r.d[w][n - 1], `${w} ${n}`).toBe(Math.min(12, old - 1) + extra);
  }
  soft.done();
});
