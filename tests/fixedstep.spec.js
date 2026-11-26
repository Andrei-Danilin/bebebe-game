// SPEC-034: live play advances in fixed CFG.STEP steps from an accumulator, so the same inputs give the same game on any screen.
// The tests feed simulated frame times to the client's frame logic (__bb.frame(seconds) — the one function the live loop calls
// in play); sim mode: no drawing is needed for game logic.
const base = require("./pw");
const { expect } = base;
const { openSim, sharedPage, resetGame } = require("./helpers");

const shared = sharedPage();
const test = base.test.extend({
  page: async ({ browser }, use) => {
    const s = await shared.get(browser, "sim", { viewport: { width: 960, height: 640 } }, p => openSim(p));
    await resetGame(s.page);
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
  }
});
test.afterAll(async () => { await shared.close(); });

// one 20 s game of Park 5 at the given frame rate: the same seed, the same level; plain data back
const SECONDS = 20, RATES = [30, 60, 120, 144];
const playAt = (page, hz, autopilot) => page.evaluate(({ hz, sec, autopilot }) => {
  const b = window.__bb, r2 = v => v;   // exact: no rounding, the states must be equal bit for bit
  b.clearLevelCache(); b.autopilot(autopilot, "careful"); b.seedRandom(34);
  b.world = "park"; b.level = 5; b.startGame(1);
  const draws0 = b.rngDraws, frameTime = 1 / hz, frames = Math.round(sec * hz);
  for (let i = 0; i < frames; i++) b.frame(frameTime);
  const out = { time: b.stats.time, hugs: b.stats.hugs, hp: b.big.hp, mode: b.mode, draws: b.rngDraws - draws0,
    big: [b.big.x, b.big.y, b.big.dir, b.big.state].map(r2), littles: b.littles.map(l => [l.x, l.y, l.state, l.task].map(r2)), events: JSON.stringify(b.events) };
  b.autopilot(false, "careful"); b.mode = "home";
  return out;
}, { hz, sec: SECONDS, autopilot });

test("the same game at 30, 60, 120 and 144 Hz: positions, hearts and events are equal (autopilot)", async ({ page }) => {
  test.setTimeout(120_000);
  const runs = {};
  for (const hz of RATES) runs[hz] = await playAt(page, hz, true);
  const ref = runs[60];
  expect(ref.time, "20 s of game time").toBeCloseTo(SECONDS, 3);
  expect(ref.mode, "the level is still on").toBe("play");
  expect(JSON.parse(ref.events).length, "things happened").toBeGreaterThan(3);
  for (const hz of RATES) expect(runs[hz], `${hz} Hz plays the same game as 60 Hz`).toEqual(ref);
});

test("the same game at every frame rate with a held stick (keyboard)", async ({ page }) => {
  test.setTimeout(120_000);
  const runs = {};
  await page.keyboard.down("KeyD"); await page.keyboard.down("KeyS");
  try { for (const hz of RATES) runs[hz] = await playAt(page, hz, false); } finally { await page.keyboard.up("KeyD"); await page.keyboard.up("KeyS"); }
  const ref = runs[60];
  expect(ref.time).toBeCloseTo(SECONDS, 3);
  const start = await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 5; b.startGame(1); const p = [b.littles[0].x, b.littles[0].y]; b.mode = "home"; return p; });
  expect(Math.hypot(ref.littles[0][0] - start[0], ref.littles[0][1] - start[1]), "the held stick moved the hero").toBeGreaterThan(50);
  for (const hz of RATES) expect(runs[hz], `${hz} Hz plays the same game as 60 Hz`).toEqual(ref);
});
