// SPEC-008: seeded randomness, sim mode, the event log, autopilot and the balance CI sample.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { openSim, frames, sharedPage, resetGame, ROOT } = require("./helpers");

// two real animation frames without the sim guard of frames() (SPEC-023): the sim test below checks that frames pass
// and nothing is drawn
const rafs = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// SPEC-018: one game page for the file, opened in sim mode (?sim=1: nothing drawn, the frame loop does not play);
// resetGame() before each test, page errors and a changed CFG fail the test. A test that turns sim off turns it back on.
const shared = sharedPage();
const test = base.test.extend({
  page: async ({ browser }, use) => {
    const s = await shared.get(browser, "sim", { viewport: { width: 960, height: 640 } }, p => openSim(p));
    await resetGame(s.page);
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
    expect(await s.page.evaluate(() => window.__bb.sim().on), "the test leaves sim mode on").toBe(true);
  }
});
test.afterAll(async () => { await shared.close(); });

// ---------- AC 1: all gameplay randomness goes through one seeded rng() ----------
test("same seed, same game", { tag: "@fast" }, async ({ page }) => {
  // Math.random only in the helpers: the unseeded seed of rng() and the visual helper vrand()
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const uses = src.split("\n").map((s, i) => [i + 1, s]).filter(([, s]) => s.includes("Math.random") && !s.trim().startsWith("//"));
  const bad = uses.filter(([, s]) => !/^\s*(let rngNext = mulberry32\(|const vrand = )/.test(s)).map(([n, s]) => `index.html:${n}: ${s.trim()}`);
  expect(bad, "Math.random outside rng()/vrand():\n" + bad.join("\n")).toEqual([]);
  expect(uses.length).toBe(2);
  // the tests run with the strict guard (openGame): level/3D code that used the gameplay rng() throws here;
  // in normal play it falls back to vrand(), so a missed call never breaks a player's level start
  expect(await page.evaluate(() => window.__bb.strictRng)).toBe(true);

  // Each run: seedRandom + startGame (Park 5, one player + 4 bots) + simRun(60 s) in one evaluate (no frames in between);
  // the event log and where everybody ends up are compared. `noise` replaces Math.random during a run: particles, hearts
  // and camera shake may draw from it, gameplay must not. Run b also plays with sim mode off (particles, 3D build), so
  // normal play draws the same rng() sequence as sim mode.
  const runs = await page.evaluate(() => {
    const b = window.__bb, mathRandom = Math.random, r2 = v => Math.round(v * 100) / 100;
    const play = (seed, noise, simOn = true) => {
      if (noise) Math.random = noise;
      b.sim(simOn);
      try {
        b.seedRandom(seed);
        b.world = "park"; b.level = 5; b.startGame(1);
        const res = b.simRun(60, 1 / 30), ev = b.events;
        const where = [b.big.x, b.big.y, b.big.hp, ...b.littles.flatMap(l => [l.x, l.y, l.state])].map(v => typeof v === "number" ? r2(v) : v);
        return { res, events: JSON.stringify(ev), where: JSON.stringify(where), types: [...new Set(ev.map(e => e.type))] };
      } finally { Math.random = mathRandom; b.sim(true); }
    };
    let k = 0;
    const out = { a: play(12345), b: play(12345, () => (k = (k + 0.37) % 1), false), c: play(777) };
    b.seedRandom(); b.mode = "home";
    return out;
  });
  expect(runs.a.res.time, "simRun played the 60 s (or the level ended)").toBeGreaterThan(runs.a.res.ended ? 0 : 59.9);
  expect(runs.a.types.length, `things happened: ${runs.a.types}`).toBeGreaterThanOrEqual(3);
  expect(runs.b.events, "same seed, sim off and other visual randomness: the same events").toBe(runs.a.events);
  expect(runs.b.where).toBe(runs.a.where);
  expect(runs.c.events + runs.c.where, "another seed: another game").not.toBe(runs.a.events + runs.a.where);
});

// ---------- AC 2: sim mode ----------
test("sim mode draws nothing, plays no sound, the frame loop does not play; simRun plays a level", async ({ page }) => {
  const hugNow = () => page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0, hp: 9 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
    b.update(1 / 60);
  });
  const look = () => page.evaluate(() => ({ ...window.__bb.sim(), time: window.__bb.stats.time, mode: window.__bb.mode }));
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  // sim on (from ?sim=1): frames pass, nothing is drawn, the game does not move, a hug makes no sound
  const s0 = await look();
  await rafs(page); await rafs(page);
  await hugNow();
  const s1 = await look();
  expect(s0.on).toBe(true);
  expect(s1.mode).toBe("play");
  expect([s1.renders, s1.draws, s1.sounds]).toEqual([s0.renders, s0.draws, s0.sounds]);
  expect(s1.time - s0.time, "only the one update of the hug").toBeCloseTo(1 / 60, 5);
  // sim off: the same page draws, plays and makes sounds again
  await page.evaluate(() => { window.__bb.sim(false); });
  await frames(page); await frames(page);
  await hugNow();
  const s2 = await look();
  await page.evaluate(() => { window.__bb.sim(true); });
  expect(s2.on).toBe(false);
  expect(s2.renders).toBeGreaterThan(s1.renders);
  expect(s2.draws).toBeGreaterThan(s1.draws);
  expect(s2.sounds, "the hug sound was asked for").toBeGreaterThan(s1.sounds);
  expect(s2.time - s1.time).toBeGreaterThan(1 / 60 + 0.001);
  // simRun: plain data; stops when the level ends, otherwise after the given game time
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    b.startGame(1);
    out.short = b.simRun(2, 1 / 30);
    const big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0, hp: 1 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
    out.win = b.simRun(30);
    out.mode = b.mode; out.reward = !!b.lastReward && b.lastReward.win;
    b.mode = "home";
    return out;
  });
  expect(r.short.ended).toBe(false);
  expect(r.short.win).toBe(false);
  expect(r.short.time).toBeCloseTo(2, 5);
  expect(r.win.ended).toBe(true);
  expect(r.win.win).toBe(true);
  expect(r.win.time).toBeLessThan(2 + 5);                // the hug, the hug animation, then the win
  expect([r.mode, r.reward]).toEqual(["win", true]);
});

// SPEC-023 AC 5: a visual check on a sim page fails loudly — frames(), page.screenshot() and every piece of drawn
// state in __bb throw a "sim mode" error; with sim off the same reads work again.
test("drawing helpers and drawn state throw in sim mode", { tag: "@fast" }, async ({ page }) => {
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await expect(frames(page)).rejects.toThrow(/sim mode/);
  await expect(page.screenshot()).rejects.toThrow(/sim mode/);
  const reads = () => page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const k of b.SIM_DRAWN) {
      if (!(k in b)) { out[k] = "missing from __bb"; continue; }
      try { const v = b[k]; if (typeof v === "function") v.call(b, 0, 0); out[k] = "ok"; } catch (e) { out[k] = String(e.message || e); }
    }
    return out;
  });
  const inSim = await reads();
  expect(Object.keys(inSim).length).toBeGreaterThanOrEqual(20);
  expect(Object.entries(inSim).filter(([, v]) => !/^sim mode: __bb\.\w+ is drawn state/.test(v)).map(([k]) => k), "every drawn-state read throws in sim").toEqual([]);
  await page.evaluate(() => { window.__bb.sim(false); });
  await rafs(page);
  const drawn = await reads();
  await page.evaluate(() => { window.__bb.sim(true); });
  expect(Object.entries(drawn).filter(([, v]) => /sim mode/.test(v)).map(([k]) => k), "with sim off nothing throws the sim error").toEqual([]);
});

// ---------- AC 4: the event log ----------
test("the event log records gameplay and every coin change", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = {};
    b.seedRandom(808);
    let seen = 0;
    const news = () => { const e = b.events; const n = e.slice(seen); seen = e.length; return n.map(({ t, ...rest }) => rest); };
    const calm = (x = 900, y = 600) => Object.assign(b.big, { x, y, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 999, pushCd: 0, hugCd: 0, blush: 0, hp: 9 });
    const steps = (sec, dt = 1 / 60) => { for (let i = 0; i < Math.round(sec / dt); i++) b.update(dt); };
    // shop (the log still holds the last level until the next one starts): three buys, one with too few coins (no event)
    b.mode = "home"; b.progress.coins = 100; seen = b.events.length;
    b.buyKisses(); b.buyGloves("mittens"); b.buyRescueKit(); b.buyGloves("mega");
    out.buys = news(); out.coinsAfterBuys = b.progress.coins;
    // a level start clears the log
    b.world = "park"; b.level = 1; b.startGame(1); seen = 0;
    const L = b.littles;
    out.start = b.events.length;
    // everybody but player 1 becomes a player without controls, far away: only what the test sets up happens
    L.forEach((l, i) => { if (i) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40, state: "ok" }); });
    calm();
    // hug with mittens (power 2)
    Object.assign(b.big, { x: 500, y: 320, dir: 0, noPush: 0 });
    Object.assign(L[0], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 466, y: 320 });
    b.update(1 / 60);
    out.hug = news();
    steps(C.HUG_ANIM + 0.1); calm(); news(); Object.assign(L[0], { x: 860, y: 20, hugAnim: 0, kx: 0, ky: 0 });
    // a push: down; a push into a shield: blocked, nobody falls
    Object.assign(b.big, { x: 500, y: 320, dir: 0, noPush: 0 });
    Object.assign(L[1], { state: "ok", invuln: 0, x: 535, y: 320, kx: 0, ky: 0 });
    b.update(1 / 60);
    out.push = news();
    Object.assign(L[1], { x: 400, y: 450, kx: 0, ky: 0, downTimer: 15 });
    Object.assign(b.big, { noPush: 0, pushCd: 0, x: 500, y: 320, dir: 0 });
    Object.assign(L[2], { state: "ok", invuln: 0, x: 535, y: 320, kx: 0, ky: 0 }); L[2].fx.shield = 5;
    b.update(1 / 60);
    out.shield = news();
    calm(); Object.assign(L[2], { x: 860, y: 140, kx: 0, ky: 0 });
    // a friend stands by the fallen one: rescued after RESCUE_TIME
    Object.assign(L[3], { state: "ok", x: 420, y: 450, kx: 0, ky: 0 });
    steps(C.RESCUE_TIME + 0.2);
    out.rescue = news();
    Object.assign(L[3], { x: 860, y: 180 });
    // nobody helps: rest, then back
    Object.assign(L[4], { state: "down", downTimer: 0.05, x: 500, y: 300, kx: 0, ky: 0 });
    steps(0.1);
    Object.assign(L[4], { state: "rest", restTimer: 0.05 });
    steps(0.1);
    out.rest = news();
    Object.assign(L[4], { x: 860, y: 220 });
    // air kisses: from behind him (hit), and away from him (miss)
    Object.assign(b.big, { x: 200, y: 228, dir: 0 }); b.big.noPush = 999;
    Object.assign(L[0], { x: 150, y: 228, dir: 0, state: "ok", invuln: 0, hugAnim: 0, kissCd: 0, dizzy: 0 });
    b.throwKiss(0); steps(0.5);
    out.kissHit = news();
    calm(); Object.assign(L[0], { x: 270, y: 48, dir: 0, kissCd: 0 });
    b.throwKiss(0); steps(1.5);
    out.kissMiss = news();
    // a rescue kit
    Object.assign(L[0], { state: "down", downTimer: 10, x: 600, y: 450, kx: 0, ky: 0 });
    out.kitUsed = b.useRescueKit(0);
    out.kit = news();
    // a bonus star and an item picked up, a banana under the Big One
    Object.assign(L[0], { x: 600, y: 450, invuln: 0, kissCd: 0 });
    b.spawnStar(600, 450);
    b.items.length = 0; b.items.push({ id: 991, kind: "boots", x: 600, y: 450, t: 0, life: 30 });
    b.update(1 / 60);
    out.pick = news();
    b.items.length = 0; b.items.push({ id: 992, kind: "banana", x: b.big.x + 3, y: b.big.y, t: 0, life: 30 });
    b.update(1 / 60);
    out.slip = news();
    calm();
    // 5 s in the Big One's house: thrown out
    const z = b.dangerZone;
    Object.assign(L[0], { state: "ok", x: z.x + z.w / 2, y: z.y + z.h / 2, dangerT: C.DANGER_TIME - 0.001, kx: 0, ky: 0, dizzy: 0 });
    b.update(1 / 60);
    out.thrown = news();
    // the cap: the newest events stay
    const max0 = C.EVENT_LOG_MAX; C.EVENT_LOG_MAX = 3;
    Object.assign(L[0], { x: 600, y: 450, dizzy: 0 });
    for (let i = 0; i < 4; i++) b.spawnStar(600, 450);
    b.update(1 / 60);
    out.capped = b.events.map(e => e.type);
    C.EVENT_LOG_MAX = max0;
    seen = b.events.length;
    // the win: the reward parts explain the total, coins events = the change of progress.coins
    const coins0 = b.progress.coins;
    Object.assign(b.big, { x: 500, y: 320, dir: 0, noPush: 0, hp: 1 });
    Object.assign(L[0], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 466, y: 320 });
    for (let i = 0; i < 600 && b.mode === "play"; i++) b.update(1 / 60);
    out.win = news();
    out.reward = { coins: b.lastReward.coins, starCoins: b.lastReward.starCoins, parts: b.lastReward.parts, gained: b.progress.coins - coins0 };
    // leaving early: giveReward(false) pays the hugs; parts too
    b.startGame(1); seen = 0;
    b.stats.playerHugs = 2; b.stats.starCoins = 3;
    const coins1 = b.progress.coins;
    b.giveReward(false);
    out.leave = news();
    out.leaveReward = { coins: b.lastReward.coins, parts: b.lastReward.parts, gained: b.progress.coins - coins1 };
    out.tNumber = b.events.every(e => typeof e.t === "number");
    b.mode = "home";
    return out;
  });
  const sum = parts => parts.reduce((s, p) => s + p.amount, 0);
  const G = { mittens: 30, mega: 60, kisses: 20, rescues: 15 };
  expect(r.buys).toEqual([
    { type: "coins", reason: "buy:kisses", amount: -G.kisses },
    { type: "coins", reason: "buy:mittens", amount: -G.mittens },
    { type: "coins", reason: "buy:rescues", amount: -G.rescues }]);
  expect(r.coinsAfterBuys).toBe(100 - 20 - 30 - 15);
  expect(r.start).toBe(0);
  expect(r.hug).toEqual([{ type: "hug", power: 2, who: 0, kind: "player" }]);
  expect(r.push).toEqual([{ type: "push", who: 1, blocked: false }, { type: "down", who: 1, kind: "player" }]);
  expect(r.shield).toEqual([{ type: "push", who: 2, blocked: true }]);
  expect(r.rescue).toEqual([{ type: "rescued", who: 1, by: "player" }]);
  expect(r.rest).toEqual([{ type: "rest", who: 4 }, { type: "back", who: 4 }]);
  expect(r.kissHit).toEqual([{ type: "kiss", who: 0, result: "hit", blush: true }]);
  expect(r.kissMiss).toEqual([{ type: "kiss", who: 0, result: "miss" }]);
  expect(r.kitUsed).toBe(true);
  expect(r.kit).toEqual([{ type: "kit", who: 0 }]);
  expect(r.pick).toEqual([{ type: "item", kind: "boots", who: 0 }, { type: "star", who: 0 }, { type: "coins", reason: "star", amount: 3 }]);
  expect(r.slip).toEqual([{ type: "slip" }]);
  expect(r.thrown).toEqual([{ type: "thrownOut", who: 0 }]);
  expect(r.capped).toEqual(["coins", "star", "coins"]);
  expect(r.win.map(e => e.type)).toEqual(["hug", "win", ...r.win.filter(e => e.type === "coins").map(() => "coins")]);
  const winCoins = r.win.filter(e => e.type === "coins");
  expect(winCoins.length).toBeGreaterThan(0);
  expect(r.reward.parts.map(p => p.reason)).toContain("firstWin");   // SPEC-009: the first win of Park 1
  expect(r.reward.parts.every(p => p.amount !== 0)).toBe(true);
  expect(sum(r.reward.parts), "lastReward.coins = the sum of its parts").toBe(r.reward.coins);
  expect(sum(winCoins), "coins events = the change of progress.coins").toBe(r.reward.gained);
  expect(r.reward.gained).toBe(r.reward.coins - r.reward.starCoins);
  expect(winCoins.map(e => ({ reason: e.reason, amount: e.amount })), "coins events = the parts without the stars (paid at pickup)")
    .toEqual(r.reward.parts.filter(p => p.reason !== "star"));
  expect(r.leave).toEqual([{ type: "coins", reason: "hugs", amount: 2 }]);   // SPEC-009: REWARD.PER_HUG 1
  expect(r.leaveReward).toEqual({ coins: 5, parts: [{ reason: "hugs", amount: 2 }, { reason: "star", amount: 3 }], gained: 2 });
  expect(r.tNumber).toBe(true);
});

// ---------- AC 3: the autopilot ----------
// The autopilot decides from what a player sees and acts only through the player's own paths: the movement that
// inputFor(l) returns, and the kiss and kit buttons. Each step, its decision (__bb.autoThink) must leave the world as it
// was: the Big One, the bots, the players, items, stars, CFG, progress, stats, the event log — and it draws no gameplay
// randomness (__bb.rngDraws), so the seeded sequence of a level is the game's own.
test("the autopilot plays only through the players' inputs", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = { changed: [], styles: {} };
    const snap = () => JSON.stringify({ big: b.big, littles: b.littles, items: b.items, stars: b.stars, kisses: b.kisses, CFG: b.CFG,
      progress: b.progress, stats: b.stats, events: b.events.length, mode: b.mode, rngDraws: b.rngDraws });   // it draws no gameplay randomness either
    for (const style of ["careful", "reckless"]) {
      b.seedRandom(4242);
      out.styles[style] = b.autopilot(true, style);
      b.world = "park"; b.level = 3; b.startGame(1);
      const p = b.littles[0], x0 = p.x, y0 = p.y;
      let walked = 0, px = p.x, py = p.y;
      // SPEC-019: the reckless player is heard and pushed more often now — it gets up to 180 s for its first hugs
      const steps = (style === "reckless" ? 180 : 90) * 30;
      for (let i = 0; i < steps && b.mode === "play"; i++) {
        const before = snap();
        b.autoThink(1 / 30);
        if (snap() !== before && out.changed.length < 3) out.changed.push(`${style} step ${i}`);
        b.update(1 / 30);
        walked += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y;
      }
      out[style] = { walked, moved: Math.hypot(p.x - x0, p.y - y0), hugs: b.events.filter(e => e.type === "hug" && e.kind === "player").length };
    }
    // off: the player stands still
    out.off = b.autopilot(false);
    b.seedRandom(4242); b.startGame(1);
    const p = b.littles[0], x0 = p.x, y0 = p.y;
    b.simRun(5);
    out.offMoved = Math.hypot(p.x - x0, p.y - y0);
    b.seedRandom(); b.mode = "home";
    return out;
  });
  expect(r.changed, "autoThink changed the world").toEqual([]);
  expect(r.styles).toEqual({ careful: { on: true, style: "careful" }, reckless: { on: true, style: "reckless" } });
  expect(r.off, "off keeps the last style").toEqual({ on: false, style: "reckless" });
  for (const s of ["careful", "reckless"]) {
    expect(r[s].walked, `${s}: the player walks`).toBeGreaterThan(300);
    expect(r[s].hugs, `${s}: the player hugs the Big One`).toBeGreaterThan(0);
  }
  expect(r.offMoved).toBe(0);
});

// The autopilot presses the player's buttons when it has stock: 🩹 when lying long with nobody helping, 💋 when it
// faces the Big One near enough to hit (balance runs start with an empty inventory, so they never get here)
test("the careful autopilot uses rescue kits and air kisses when it has them", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = {};
    b.autopilot(true, "careful"); b.world = "park"; b.level = 1; b.startGame(1);
    Object.assign(b.progress.inv, { kisses: 5, rescues: 3 });
    const L = b.littles, p = L[0];
    L.forEach((l, i) => { if (i) Object.assign(l, { x: 860, y: 60 + i * 40 }); });   // bots far away: nobody else rescues
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 999, pushCd: 0, hugCd: 0, blush: 0 });
    // lying, but not long yet: waits for friends
    Object.assign(p, { state: "down", downTimer: C.DOWN_TIME - 1, rescue: 0, x: 600, y: 450 });
    b.autoThink(1 / 60); out.early = [p.state, b.progress.inv.rescues];
    Object.assign(p, { downTimer: C.DOWN_TIME - C.AUTOPILOT.kitWait - 0.5 });
    b.autoThink(1 / 60); out.kit = [p.state, b.progress.inv.rescues, b.events.filter(e => e.type === "kit").length];
    // behind the Big One, facing him, within reach: a kiss
    Object.assign(b.big, { x: 200, y: 228, dir: 0 });
    Object.assign(p, { state: "ok", x: 120, y: 228, dir: 0, invuln: 0, hugAnim: 0, dizzy: 0, kissCd: 0 });
    b.autoThink(1 / 60); out.kiss = [b.progress.inv.kisses, b.kisses.length];
    b.autopilot(false); b.mode = "home";
    return out;
  });
  expect(r.early).toEqual(["down", 3]);
  expect(r.kit).toEqual(["ok", 2, 1]);
  expect(r.kiss).toEqual([4, 1]);
});

// ---------- AC 14: the CI sample of the balance report ----------
// The 12 levels of CFG.BALANCE.CI_LEVELS (an early level and a maze level per world; SPEC-016: six worlds), 1 seed, careful autopilot, played
// exactly like `npm run balance` (runLevel from scripts/balance.js), with wide bounds: won within the time limit,
// no 2-minute stretch without any event (stuck), the event log not overflowing, no page errors (the fixture).
const { runLevel } = require("../scripts/balance.js");
const { readValue } = require("../scripts/docs-numbers.js");
const CFG_SRC = readValue(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), "CFG"), BAL = CFG_SRC.BALANCE;
// SPEC-008 AC 14 (SPEC-016: six worlds): every world has at least an early and a maze level in the sample. Read from the source,
// no page; the worlds are the keys of CFG.WORLD_DIFFICULTY (levels.spec.js checks they are exactly WORLDS)
test("the CI sample has two levels in every world", { tag: "@fast" }, () => {
  const per = Object.fromEntries(Object.keys(CFG_SRC.WORLD_DIFFICULTY).map(w => [w, BAL.CI_LEVELS.filter(([cw]) => cw === w).map(([, n]) => n)]));
  const bad = Object.entries(per).filter(([, ns]) => !(ns.length >= 2 && ns.some(n => n >= BAL.EARLY[0] && n <= BAL.EARLY[1]) && ns.some(n => n >= BAL.MAZE[0] && n <= BAL.MAZE[1])));
  expect(bad, "worlds without an early and a maze level").toEqual([]);
  expect(BAL.CI_LEVELS.every(([w]) => w in per), "every CI level is in a known world").toBe(true);
});
for (const [world, n] of BAL.CI_LEVELS) {
  test(`balance sample: ${world} ${n} is won in time and nothing gets stuck`, async ({ page }) => {
    const r = await page.evaluate(runLevel, { world, n, style: "careful", seed: 2026 });
    expect(r.win, `${world} ${n}: won (ended ${r.ended}, ${Math.round(r.time)} s)`).toBe(true);
    expect(r.time).toBeLessThanOrEqual(BAL.TIME_LIMIT);
    expect(r.maxGap, "the longest stretch without any event").toBeLessThan(120);
    expect(r.logFull).toBe(false);
    expect(r.coins, "coins were earned").toBeGreaterThan(0);
  });
}

// runLevel can start from a save (SPEC-009 plays a pass with bought things): the preset is loaded, and the autopilot uses it
test("a balance run can start from a progress preset", async ({ page }) => {
  const fresh = await page.evaluate(runLevel, { world: "park", n: 5, style: "careful", seed: 2026 });
  const stocked = await page.evaluate(runLevel, { world: "park", n: 5, style: "careful", seed: 2026, progress: { coins: 50, inv: { kisses: 5, rescues: 3 } } });
  expect(fresh.kisses, "nothing bought: no kisses").toBe(0);
  expect(stocked.kisses, "with kisses in stock the autopilot throws them").toBeGreaterThan(0);
  // the run counts only the coins it earned; the preset's 50 stay in progress on top of them
  expect(await page.evaluate(() => window.__bb.progress.coins), "preset coins + the coins this run earned").toBe(50 + stocked.coins);
});
