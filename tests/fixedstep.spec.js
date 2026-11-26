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

// AC 5: a slow device is not penalised. 20 Hz (0.05 s frames): 3 steps a frame, game time = real time. 4 Hz (0.25 s frames):
// capped at MAX_STEPS = 8 steps a frame, the rest dropped, and nothing breaks.
test("a slow device: 20 Hz keeps up with real time, 4 Hz is capped at 8 steps a frame", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = {};
    b.clearLevelCache(); b.autopilot(true, "careful"); b.seedRandom(5);
    b.world = "park"; b.level = 5; b.startGame(1);
    const perFrame = (hz, frames) => {
      const steps = [];
      for (let i = 0; i < frames; i++) { const t0 = b.stats.time; b.frame(1 / hz); steps.push(Math.round((b.stats.time - t0) / C.STEP)); }
      return steps;
    };
    const t0 = b.stats.time;
    out.slow20 = perFrame(20, 100);                       // 5 s of real time
    out.time20 = b.stats.time - t0;
    const t1 = b.stats.time;
    out.slow4 = perFrame(4, 20);                          // 5 s of real time
    out.time4 = b.stats.time - t1;
    out.long = perFrame(0.1, 2);                          // a 10 s frame (a tab coming back): counts as MAX_FRAME, 8 steps
    out.sane = [b.big.x, b.big.y, ...b.littles.flatMap(l => [l.x, l.y])].every(Number.isFinite) && b.mode === "play";
    out.max = [C.MAX_STEPS, C.STEP];
    b.autopilot(false, "careful"); b.mode = "home";
    return out;
  });
  expect(r.slow20.every(n => n === 3), `20 Hz: 3 steps every frame (${r.slow20.slice(0, 6)}…)`).toBe(true);
  expect(r.time20, "20 Hz: 5 s of game time in 5 s of real time").toBeCloseTo(5, 6);
  expect(r.slow4.every(n => n === r.max[0]), `4 Hz: ${r.max[0]} steps every frame`).toBe(true);
  expect(r.time4, "4 Hz: the game runs slower than real time, capped").toBeCloseTo(20 * r.max[0] * r.max[1], 6);
  expect(r.long, "a very long frame counts as MAX_FRAME and runs at most MAX_STEPS steps").toEqual([8, 8]);
  expect(r.sane, "nothing broke: finite positions, the level goes on").toBe(true);
});

// AC 1: pause and menus add nothing to the accumulator (the live loop does not feed the frame in them; a rendered page)
test("pause adds no game time and no catch-up when play goes on", async ({ page }) => {
  await page.evaluate(() => { const b = window.__bb; b.sim(false); });
  try {
    await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 5; b.startGame(1); });
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => { const b = window.__bb; b.mode = "pause"; return b.stats.time; });
    await page.waitForTimeout(700);
    const t2 = await page.evaluate(() => window.__bb.stats.time);
    expect(t2, "a paused game does not move").toBe(t1);
    await page.evaluate(() => { window.__bb.mode = "play"; });
    await page.waitForTimeout(150);
    const t3 = await page.evaluate(() => { const b = window.__bb; b.mode = "home"; return b.stats.time; });
    expect(t3 - t2, "no catch-up of the 0.7 s pause: only the 0.15 s since play went on (plus a frame)").toBeLessThan(0.15 + 0.3);
    expect(t3 - t2).toBeGreaterThan(0);
  } finally { await page.evaluate(() => { window.__bb.sim(true); window.__bb.mode = "home"; }); }
});
