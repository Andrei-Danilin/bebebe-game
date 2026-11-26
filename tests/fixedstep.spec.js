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

// AC 1: pause and menus add nothing to the accumulator. First the frame function (sim, simulated frame times), then the real loop
// (a rendered page: the frames that pass while paused change nothing; no wait decides a pass)
test("outside play a frame adds nothing: no steps, no accumulator", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, S = b.CFG.STEP, out = {};
    b.world = "park"; b.level = 5; b.startGame(1);
    out.start = b.acc;
    b.frame(S * 0.4);                                         // 0 steps: the remainder grows
    out.afterPlay = b.acc;
    const t0 = b.stats.time;
    for (const mode of ["pause", "home", "map", "shop"]) { b.mode = mode; for (let i = 0; i < 5; i++) b.frame(1); }
    out.same = b.acc === out.afterPlay && b.stats.time === t0;
    b.mode = "play";
    for (let i = 0; i < 50; i++) { b.frame(0.013); out.max = Math.max(out.max || 0, b.acc); }
    out.S = S; out.moved = b.stats.time > t0;
    b.mode = "home";
    return out;
  });
  expect(r.start, "a new game starts a quarter step in (CFG.STEP_PHASE)").toBeCloseTo(0.25 * r.S, 12);
  expect(r.afterPlay).toBeCloseTo(0.65 * r.S, 12);
  expect(r.same, "pause and menus: the accumulator and the game time stay put").toBe(true);
  expect(r.max, "the accumulator is always less than a step after a frame").toBeLessThan(r.S);
  expect(r.moved).toBe(true);
});

test("the real loop feeds nothing while paused (rendered page)", async ({ page }) => {
  await page.evaluate(() => { window.__bb.sim(false); });
  try {
    await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 5; b.startGame(1); });
    await page.waitForFunction(() => window.__bb.stats.time > 0.05, null, { timeout: 30_000, polling: 50 });
    const before = await page.evaluate(() => { const b = window.__bb; b.mode = "pause"; return { acc: b.acc, time: b.stats.time, rafs: b.sim().renders }; });
    await page.waitForFunction(r => window.__bb.sim().renders >= r + 5, before.rafs, { timeout: 30_000, polling: 50 });   // frames passed while paused
    const during = await page.evaluate(() => ({ acc: window.__bb.acc, time: window.__bb.stats.time }));
    expect(during, "frames in pause change neither the accumulator nor the game time").toEqual({ acc: before.acc, time: before.time });
    await page.evaluate(() => { window.__bb.mode = "play"; });
    await page.waitForFunction(t => window.__bb.stats.time > t, before.time, { timeout: 30_000, polling: 50 });
    const after = await page.evaluate(() => { const b = window.__bb; b.mode = "home"; return { acc: b.acc, S: b.CFG.STEP }; });
    expect(after.acc, "back in play: less than a step in the accumulator").toBeLessThan(after.S);
  } finally { await page.evaluate(() => { window.__bb.sim(true); window.__bb.mode = "home"; }); }
});

// AC 1: the devices are read once and apply to every step of the frame; a one-shot button fires at the first step only
test("a 💋 flag fires once in a frame of two steps; a result ends the frame's stepping", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, S = b.CFG.STEP, out = {};
    b.progress.inv.kisses = 3;
    b.world = "park"; b.level = 5; b.startGame(1);
    const big = b.big, p = b.littles[0];
    Object.assign(big, { state: "look", timer: 9999, stun: 0, x: 900, y: 600, dir: Math.PI / 2, noPush: 999 });
    Object.assign(p, { x: 300, y: 300, dir: 0, kissCd: 0, state: "ok" });
    b.game.inputs.p1.kiss = true;
    b.frame(2 * S);                                           // two steps
    out.kisses = b.events.filter(e => e.type === "spent" && e.kind === "kiss").length;
    out.left = b.progress.inv.kisses;
    out.flag = b.game.inputs.p1.kiss;
    // a win decided on the first step: the frame's other steps do not run (the little one's invuln counts every step)
    b.mode = "play";
    const q = b.littles[1];
    q.invuln = 1;
    b.big.kind = true; b.game.pendingWin = 0.0001;            // the next step wins: result → the win screen
    b.frame(6 * S);
    out.stepsAfterResult = Math.round((1 - q.invuln) / S);
    out.mode = b.mode;
    b.mode = "home";
    return out;
  });
  expect(r.kisses, "one kiss for the one press").toBe(1);
  expect(r.left, "one kiss spent").toBe(2);
  expect(r.flag, "the flag was consumed").toBe(false);
  expect(r.mode, "the win screen").toBe("win");
  expect(r.stepsAfterResult, "the other five steps of the frame did not run").toBe(1);
});

// the live path and the sim path are one: N frames of one step each = simRun of N steps on the same seed
test("N frames of one step give the same game as simRun of N steps", async ({ page }) => {
  const run = (live) => page.evaluate(({ live }) => {
    const b = window.__bb, S = b.CFG.STEP, N = 900;
    b.clearLevelCache(); b.autopilot(true, "careful"); b.seedRandom(77);
    const draws0 = b.rngDraws;
    b.world = "park"; b.level = 5; b.startGame(1);
    if (live) for (let i = 0; i < N; i++) b.frame(S); else b.simRun(N * S);
    const out = { time: b.stats.time, draws: b.rngDraws - draws0, big: [b.big.x, b.big.y, b.big.hp, b.big.state], littles: b.littles.map(l => [l.x, l.y, l.state, l.task]), events: JSON.stringify(b.events) };
    b.autopilot(false, "careful"); b.mode = "home";
    return out;
  }, { live });
  const a = await run(true), b = await run(false);
  expect(JSON.parse(a.events).length, "things happened").toBeGreaterThan(3);
  expect(a, "frames of one step = simRun").toEqual(b);
});
