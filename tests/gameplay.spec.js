// Gameplay rules decided by the kids (see docs/game-design.md). Each test pins one rule.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const { openGame, step, setupHug, frames, sharedPage, resetGame, softly } = require("./helpers");

// SPEC-018: the tests share one game page (one per context kind: the touch tests get their own) instead of a fresh page
// each. Before every test resetGame() puts it back to a freshly opened game (storage, language, progress, names,
// gamepad stubs, level cache), then Park 1 starts as before; page errors fail the test that caused them.
// SPEC-023: rule tests that check only logic ask for `simPage` — a shared page in sim mode (no 3D, no drawing; the game
// moves only by step() / update). Tests that check what is drawn ask for `page` (rendered). A sim page draws nothing, so it
// may stay open next to the rendered one.
const shared = sharedPage(), sharedSim = sharedPage();
const fixture = (pages, sim) => async ({ browser, hasTouch }, use) => {
  const s = await pages.get(browser, (hasTouch ? "touch" : "desktop") + (sim ? "-sim" : ""), { viewport: { width: 960, height: 640 }, hasTouch }, p => openGame(p, { sim }));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
  await s.page.evaluate(() => { window.__bb.world = "park"; window.__bb.level = 1; window.__bb.startGame(1); });   // Park 1 is running
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
const test = base.test.extend({ page: fixture(shared, false), simPage: fixture(sharedSim, true) });
test.afterAll(async () => { await shared.close(); await sharedSim.close(); });
// SPEC-022: after the last hug (HUG_ANIM 1 s, kids' rule) the dad becomes kind and walks home (≤ KIND_WALK 3 s), then the win screen
const WIN_WAIT = 4.5;

test("a hug from behind takes one heart and shocks the Big One", { tag: "@fast" }, async ({ simPage: page }) => {
  const hp0 = await page.evaluate(() => window.__bb.big.hp);
  await setupHug(page);
  await step(page, 0.1);
  const s = await page.evaluate(() => ({ hp: window.__bb.big.hp, stun: window.__bb.big.stun, anim: window.__bb.littles[0].hugAnim }));
  expect(s.hp).toBe(hp0 - 1);
  expect(s.stun).toBeGreaterThan(2);       // HUG_STUN 2.5 s
  expect(s.anim).toBeGreaterThan(0);       // jumps on the back
});

test("seen from the front, a Little One is pushed and breaks a leg", { tag: "@fast" }, async ({ simPage: page }) => {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, slip: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", invuln: 0, x: 535, y: 320 });
  });
  await step(page, 0.2);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("down");
  expect(await page.evaluate(() => window.__bb.big.noPush)).toBeGreaterThan(1.5);   // rests after a push
});

// In-page helpers for the SPEC-003 tests. A timed scenario runs inside ONE page.evaluate: with software WebGL the
// real animation loop is slow, and every round trip between evaluates lets it advance the game a little.
async function installTestHelpers(page) {
  await page.evaluate(() => {
    const b = window.__bb;
    window.__t = {
      step(sec) { for (let i = 0; i < Math.round(sec * 60); i++) b.update(1 / 60); },
      // everyone except the listed Little Ones becomes a player without controls, far away (players never move by themselves)
      pin(keep) { b.littles.forEach((l, i) => { if (!keep.includes(i)) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40, state: "ok" }); }); },
      calm(x = 900, y = 600) { Object.assign(b.big, { x, y, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 0, pushCd: 0 }); },
      key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code })); }
    };
  });
}

test("rescue takes 3 seconds and drains when the helper leaves", { tag: "@fast" }, async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, L = b.littles, out = {};
    t.calm(); t.pin([0, 1]);
    Object.assign(L[0], { state: "down", downTimer: 15, x: 400, y: 300, kx: 0, ky: 0 });
    Object.assign(L[1], { kind: "player", controls: { up: [], down: [], left: [], right: [] }, state: "ok", x: 420, y: 300 });
    t.step(2.5); out.a = { st: L[0].state, r: L[0].rescue };          // 1 s is not enough any more
    Object.assign(L[1], { x: 600, y: 300 });
    t.step(1.0); out.b = { st: L[0].state, r: L[0].rescue };          // drains 1.5 per second
    Object.assign(L[1], { x: 420, y: 300 });
    t.step(1.8); out.c = L[0].state;
    t.step(0.3); out.d = L[0].state;
    return out;
  });
  expect(r.a.st).toBe("down");
  expect(r.a.r).toBeGreaterThan(2.4);
  expect(r.b.st).toBe("down");
  expect(r.b.r).toBeGreaterThan(0.9);               // 2.5 - 1.5 = 1.0
  expect(r.b.r).toBeLessThan(1.1);
  expect(r.c).toBe("down");
  expect(r.d).toBe("ok");
});

test("pushing the helper resets the rescue", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, L = b.littles;
    t.calm(); t.pin([0, 1]);
    Object.assign(L[0], { state: "down", downTimer: 15, x: 400, y: 300, kx: 0, ky: 0 });
    Object.assign(L[1], { kind: "player", controls: { up: [], down: [], left: [], right: [] }, state: "ok", invuln: 0, x: 420, y: 300 });
    t.step(1.5);
    const before = L[0].rescue;
    Object.assign(b.big, { x: 455, y: 300, dir: Math.PI, state: "look", timer: 9999 });
    b.update(1 / 60);
    return { before, helper: L[1].state, r: L[0].rescue };
  });
  expect(r.before).toBeGreaterThan(1.4);
  expect(r.helper).toBe("down");
  expect(r.r).toBe(0);
});

test("bots wait before they go to rescue", async ({ simPage: page }) => {
  await installTestHelpers(page);
  // 1 player + 4 bots; the Big One pushes the player
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, l = b.littles[0];
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, slip: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", invuln: 0, x: 535, y: 320 });
    b.update(1 / 60);
    const out = { st: l.state, wait: l.botWait, first: -1 };
    t.calm(900, 100);                                 // the Big One walks away: only the delay can hold the bots back
    const rescuers = () => b.littles.filter(q => q.kind === "bot" && q.task === "rescue").length;
    for (let i = 1; i <= 4 * 60 && out.first < 0; i++) { b.update(1 / 60); if (rescuers()) out.first = i / 60; }
    out.stillDown = l.state;
    return out;
  });
  expect(r.st).toBe("down");
  expect(r.wait).toBeGreaterThanOrEqual(1.9);
  expect(r.wait).toBeLessThanOrEqual(3);
  expect(r.first).toBeGreaterThan(r.wait - 0.1);    // nobody sets off before the delay is over…
  expect(r.first).toBeLessThan(r.wait + 0.2);       // …and a bot goes to help right after it
  expect(r.stillDown).toBe("down");
});

// SPEC-007 AC 1: the rest is 30 s (kids' decision); the rules text speaks in seconds, computed from REST_TIME
test("an unrescued Little One rests 30 seconds", { tag: "@fast" }, async ({ simPage: page }) => {
  expect(await page.evaluate(() => window.__bb.CFG.REST_TIME)).toBe(30);
  await page.evaluate(() => {
    const L = window.__bb.littles; Object.assign(window.__bb.big, { x: 900, y: 600, state: "look", timer: 9999 });
    Object.assign(L[0], { state: "down", downTimer: 0.05, x: 500, y: 300 });
  });
  await step(page, 0.2);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("home");
  await step(page, 25);
  const r = await page.evaluate(() => ({ st: window.__bb.littles[0].state, t: window.__bb.littles[0].restTimer }));
  expect(r.st).toBe("rest");
  expect(r.t).toBeLessThanOrEqual(30);
  expect(r.t).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");          // no game over
  await step(page, r.t - 0.5);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("rest");
  await step(page, 1);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("ok");
  expect(await page.evaluate(() => window.__bb.stats.rests)).toBeGreaterThanOrEqual(1);
  // the help line says the seconds in every language, from CFG.REST_TIME (no minutes, no hard-coded number)
  const lines = await page.evaluate(() => {
    const b = window.__bb, I = b.I18N, out = {}, line = l => I[l].rules(15).find(s => s.includes("15"));
    for (const l of ["en", "es", "ru"]) out[l] = line(l);
    b.CFG.REST_TIME = 45;
    for (const l of ["en", "es", "ru"]) out[l + "45"] = line(l);
    b.CFG.REST_TIME = 30;
    return out;
  });
  expect(lines.en).toContain("rest for 30 s");
  expect(lines.es).toContain("descansás 30 segundos");
  expect(lines.ru).toContain("отдыхаешь 30 сек");
  expect(lines.en45).toContain("rest for 45 s");
  expect(lines.es45).toContain("descansás 45 segundos");
  expect(lines.ru45).toContain("отдыхаешь 45 сек");
  for (const l of ["en", "es", "ru"]) expect(lines[l], l).not.toMatch(/min|мин/);
});

test("winning gives stars and coins, unlocks the next level and survives a reload", { tag: "@fast" }, async ({ simPage: page }) => {
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, WIN_WAIT);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("win");
  const r = await page.evaluate(() => window.__bb.lastReward);
  expect(r.stars).toBe(3);
  expect(r.coins).toBeGreaterThan(0);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const p = await page.evaluate(() => window.__bb.progress);
  expect(p.worlds.park.unlocked).toBe(2);
  expect(p.coins).toBe(r.coins);
  expect(p.worlds.park.stars["1"]).toBe(3);
  expect(p.worlds.park.won["1"], "SPEC-009: the first win is marked").toBe(true);
});

// ---------- SPEC-006: worlds, rewards, the end of a world ----------
// a win of the running level through a real hug (the Big One on his last heart)
async function winLevel(page) {
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, WIN_WAIT);
}

// ---------- SPEC-022 AC 4: Dad becomes kind and walks home, then the win screen ----------
// __bb.big.kind — he became kind (the walk home); __bb.bigMood() — "angry" (≥ 2/3 of his anger), "mid" (≥ 1/3), "kind"
test("the dad becomes kind and walks home before the win screen", { tag: "@fast" }, async ({ simPage: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.big.hp = 1; for (const l of b.littles.slice(1)) Object.assign(l, { x: 120, y: 120, state: "ok" }); });
  await setupHug(page);
  await step(page, 0.5);
  // the last hug plays to the end first (kids' rule): still playing, the Little One on his back, not kind yet
  let s = await page.evaluate(() => { const b = window.__bb; return { mode: b.mode, hp: b.big.hp, anim: b.littles[0].hugAnim > 0, kind: !!b.big.kind, mood: b.bigMood() }; });
  expect(s).toEqual({ mode: "play", hp: 0, anim: true, kind: false, mood: "kind" });
  await step(page, 0.6);
  // then he is kind: blushes, hearts burst, he walks to his house door; the friends cheer; the clock stops
  const d0 = await page.evaluate(() => {
    const b = window.__bb, ex = b.dangerZone.exits, big = b.big, near = Math.min(...ex.map(e => Math.hypot(e.x - big.x, e.y - big.y)));
    return { mode: b.mode, kind: big.kind, blush: big.blush, near, time: b.stats.time, cheer: b.texts.filter(t => t.text === b.I18N.en.cheer).length, wins: b.events.filter(e => e.type === "win").length };
  });
  expect([d0.mode, d0.kind, d0.blush, d0.wins], "kind is his own state (not a kiss blush; the cheeks come from it)").toEqual(["play", true, 0, 0]);
  expect(d0.cheer, "the friends cheer").toBeGreaterThanOrEqual(2);
  await step(page, 0.5);
  const d1 = await page.evaluate(() => { const b = window.__bb, big = b.big; return { mode: b.mode, near: Math.min(...b.dangerZone.exits.map(e => Math.hypot(e.x - big.x, e.y - big.y))), time: b.stats.time, moving: big.moving }; });
  if (d1.mode === "play") expect(d1.near, "he walks towards his house door").toBeLessThan(d0.near);
  expect(d1.time, "the clock is stopped during the walk (the fast star stays as it was)").toBeCloseTo(d0.time, 5);
  // on the way home he is calm: no "!" or 👂 over him, a calm cone, no banana slip
  const calm = await page.evaluate(() => {
    const b = window.__bb; b.big.noise = 99;
    b.items.push({ id: 9999, kind: "banana", x: b.big.x, y: b.big.y, t: 0, life: 30 });
    b.update(1 / 60);
    return { mark: b.bigMark, calm: b.bigCalm(), slip: b.big.slip };
  });
  if (d1.mode === "play") expect(calm).toEqual({ mark: "💗", calm: true, slip: 0 });
  // at most KIND_WALK seconds later: the win screen (rewards as before: a real win)
  const walk = await page.evaluate(() => { const b = window.__bb; let t = 0.5; while (b.mode === "play" && t < 10) { b.update(1 / 60); t += 1 / 60; } return { t, max: b.CFG.KIND_WALK, mode: b.mode, wins: b.events.filter(e => e.type === "win").length, reward: b.lastReward && b.lastReward.win }; });
  expect(walk.mode).toBe("win");
  expect(walk.t).toBeLessThanOrEqual(walk.max + 0.05);
  expect([walk.wins, walk.reward]).toEqual([1, true]);
});

test("leaving through pause during the walk home still pays the win", async ({ simPage: page }) => {
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 1.2);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.big.kind])).toEqual(["play", true]);
  await page.evaluate(() => { const b = window.__bb; b.mode = "pause"; b.toMap(); });
  const r = await page.evaluate(() => ({ mode: window.__bb.mode, wins: window.__bb.events.filter(e => e.type === "win").length, won: window.__bb.progress.worlds.park.won[1],
    paid: window.__bb.ledger().some(e => e.reason === "firstWin") }));
  expect(r).toEqual({ mode: "map", wins: 1, won: true, paid: true });
});

test("Dad's mood follows his anger: angry, mid, kind", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, m = hp => { b.big.maxHp = 9; b.big.hp = hp; return b.bigMood(); };
    return [m(9), m(6), m(5.5), m(3), m(2.5), m(0)];
  });
  expect(r).toEqual(["angry", "angry", "mid", "mid", "kind", "kind"]);
});

test("worlds unlock their own levels", async ({ page }) => {
  // a real first load with no save (the shared page would only show resetProgress())
  await page.evaluate(() => { for (const k of ["bebebe-progress", "bebebe-outfits", "bebebe-place"]) localStorage.removeItem(k); });
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level])).toEqual(["home", "park", 1]);
  const start = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  expect(Object.keys(start.worlds)).toEqual(["park", "field", "city", "school", "beach", "winter"]);   // SPEC-016: the story order
  for (const w of Object.keys(start.worlds)) expect(start.worlds[w], w).toEqual({ unlocked: 1, stars: {}, won: {} });   // every world open from the start
  expect(start.lastWorld).toBe("park");
  expect("unlocked" in start || "stars" in start).toBe(false);
  expect(await page.evaluate(() => window.__bb.CFG.STARS_PER_LEVEL)).toBe(3);
  // a win in School level 1 opens School 2 only, the stars stay in School
  await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.level = 1; b.startGame(1); });
  await winLevel(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("win");
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const p = await page.evaluate(() => ({ progress: window.__bb.progress, world: window.__bb.world, level: window.__bb.level }));
  expect(p.progress.worlds.school.unlocked).toBe(2);
  expect(p.progress.worlds.school.stars["1"]).toBeGreaterThanOrEqual(1);
  for (const w of ["park", "field", "city", "beach", "winter"]) expect(p.progress.worlds[w], w).toEqual({ unlocked: 1, stars: {}, won: {} });
  expect(p.progress.lastWorld).toBe("school");
  expect([p.world, p.level]).toEqual(["school", 2]);   // the map opens on the last world, at its newest level
  // SPEC-017: the map starts only the world's open levels — a later stop is locked and opens no card
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.beach.unlocked = 3; b.world = "beach"; b.level = 1; b.mode = "map"; });
  await frames(page);
  expect((await page.evaluate(() => window.__bb.mapInfo.stops.filter(q => !q.locked).map(q => q.n)))).toEqual([1, 2, 3]);
  const tapStop = async n => { await page.evaluate(k => window.__bb.tapButton("stop:" + k), n); await frames(page); return page.evaluate(() => [window.__bb.mode, window.__bb.levelCard && window.__bb.levelCard.n]); };
  expect(await tapStop(4)).toEqual(["map", null]);
  expect(await tapStop(3)).toEqual(["levelCard", 3]);
});

test("the reward grows with the world", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    const win = (w, n, st) => { b.world = w; b.level = n; b.startGame(1); Object.assign(b.stats, st); b.giveReward(true); return { ...b.lastReward }; };
    const quick = { time: 10, rests: 0, playerHugs: 2, starCoins: 3 };
    out.park = win("park", 5, quick); out.winter = win("winter", 5, quick);
    // 150 s: too slow for Park 5 (135 s), still fast in Winter 5 (175 s: difficulty 4, SPEC-016)
    out.parkSlow = win("park", 5, { ...quick, time: 150 }); out.winterSlow = win("winter", 5, { ...quick, time: 150 });
    // many rests: the first-win floor, then the new stars, star coins and hugs on top
    out.floor = win("school", 5, { ...quick, rests: 30 });
    out.cfg = { perWorld: b.REWARD.PER_WORLD, fastPerWorld: b.CFG.FAST_PER_WORLD };
    out.R = { ...b.REWARD };
    return out;
  });
  const R = r.R, base = w => R.BASE + R.PER_LEVEL * 5 + R.PER_WORLD * w;   // w — the difficulty index (SPEC-016: Winter 4)
  expect(r.cfg.fastPerWorld).toBe(10);
  // SPEC-009: each run is a first win (its own world): base + 3 new stars + 2 hugs, then + 3 star coins
  expect(r.park.coins).toBe(base(0) + 3 * R.NEW_STAR + 2 * R.PER_HUG + 3);
  expect(r.winter.coins).toBe(base(4) + 3 * R.NEW_STAR + 2 * R.PER_HUG + 3);
  expect(r.winter.coins - r.park.coins).toBe(4 * r.cfg.perWorld);
  expect([r.park.target, r.winter.target]).toEqual([135, 175]);   // FAST_TIME(n) + difficulty × 10 s
  expect([r.parkSlow.fast, r.winterSlow.fast]).toEqual([false, true]);
  // the slow runs are replays of those levels: half the base, no new star (all 3 were earned the first time)
  expect(r.parkSlow.parts[0]).toEqual({ reason: "replay", amount: Math.floor(base(0) / 2) });
  expect(r.winterSlow.coins - r.parkSlow.coins).toBe(Math.floor(base(4) / 2) - Math.floor(base(0) / 2));
  expect(r.floor.coins).toBe(R.FIRST_MIN + 2 * R.NEW_STAR + 2 * R.PER_HUG + 3);   // floor + 2 new stars (fast, no nobody-out) + hugs + star coins
});

test("winning level 20 finishes the world", async ({ page }) => {
  // "next level" goes on in the same world
  await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.level = 3; b.startGame(1); });
  await winLevel(page);
  await frames(page);
  const mid = await page.evaluate(() => ({ mode: window.__bb.mode, buttons: window.__bb.buttonNames, done: window.__bb.lastReward.worldDone }));
  expect(mid.mode).toBe("win");
  expect(mid.buttons).toContain("nextLevel");
  expect(mid.done).toBe(false);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world, window.__bb.level])).toEqual(["play", "school", 4]);
  // level 20: the world is done, the win screen offers the map instead of a next level (SPEC-017)
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.school.unlocked = 20; b.progress.seen.ending = true; b.level = 20; b.startGame(1); });   // SPEC-022: the ending was seen
  await winLevel(page);
  await frames(page);
  const end = await page.evaluate(() => ({ mode: window.__bb.mode, buttons: window.__bb.buttonNames, line: window.__bb.winLine, reward: window.__bb.lastReward, unlocked: window.__bb.progress.worlds.school.unlocked }));
  expect(end.mode).toBe("win");
  expect(end.reward.worldDone).toBe(true);
  expect(end.line).toBe("You finished the School!");
  expect(end.buttons).not.toContain("nextLevel");
  expect(end.buttons).toContain("toMap");
  expect(end.unlocked).toBe(20);
  // the texts in every language
  const I = await page.evaluate(() => { const I = window.__bb.I18N; return ["en", "es", "ru"].map(l => [I[l].worlds, ...["school", "park", "winter", "beach", "field", "city"].map(w => I[l].worldDone(I[l].worlds[w], w))]); });
  expect(I[0][0]).toEqual({ park: "Park", field: "Football field", city: "City", school: "School", beach: "Beach", winter: "Winter" });
  expect(I[1][0]).toEqual({ park: "Parque", field: "Cancha", city: "Ciudad", school: "Escuela", beach: "Playa", winter: "Invierno" });
  expect(I[2][0]).toEqual({ park: "Парк", field: "Футбольное поле", city: "Город", school: "Школа", beach: "Пляж", winter: "Зима" });
  expect(I.map(x => x[2])).toEqual(["You finished the Park!", "¡Terminaste Parque!", "Парк пройден!"]);
  // the gender comes from the world key (SPEC-016: the field is neuter)
  expect(I[2].slice(1)).toEqual(["Школа пройдена!", "Парк пройден!", "Зима пройдена!", "Пляж пройден!", "Футбольное поле пройдено!", "Город пройден!"]);
  for (const lang of ["es", "ru"]) {
    await page.evaluate(l => window.__bb.setLang(l), lang);
    await frames(page);
    expect(await page.evaluate(() => window.__bb.winLine)).toBe(I[lang === "es" ? 1 : 2][1]);
  }
  // Enter (like the button) goes to the map, still in this world
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world])).toEqual(["map", "school"]);
});

test("each rest takes coins from the level reward", async ({ simPage: page }) => {
  await page.evaluate(() => { window.__bb.stats.rests = 2; window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, WIN_WAIT);
  const r = await page.evaluate(() => window.__bb.lastReward);
  expect(r.parts.find(p => p.reason === "rests")).toEqual({ reason: "rests", amount: -6 });   // COINS_PER_REST 3 × 2
  expect(r.stars).toBe(2);                 // no "nobody had to rest" star
});

test("warm mittens: bought in the shop, a hug takes 2 hearts and uses a charge", async ({ simPage: page }) => {
  await page.evaluate(() => { window.__bb.progress.coins = 30; window.__bb.buyGloves("mittens"); window.__bb.setEquip(0, "mittens"); window.__bb.startGame(1); });
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(0);
  const hp0 = await page.evaluate(() => window.__bb.big.hp);
  await setupHug(page);
  await step(page, 0.1);
  expect(await page.evaluate(() => window.__bb.big.hp)).toBe(hp0 - 2);
  expect(await page.evaluate(() => window.__bb.progress.inv.mittens)).toBe(2);
});

// SPEC-008 AC 10: every shop card has a buy test
test("buying mega mittens: 3 charges, a hug takes 3 hearts", async ({ simPage: page }) => {
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 65; b.buyGloves("mega"); b.setEquip(0, "mega"); b.startGame(1); });
  expect(await page.evaluate(() => [window.__bb.progress.coins, window.__bb.progress.inv.mega])).toEqual([5, 3]);
  const hp0 = await page.evaluate(() => window.__bb.big.hp);
  await setupHug(page);
  await step(page, 0.1);
  expect(await page.evaluate(() => window.__bb.big.hp)).toBe(hp0 - 3);
  expect(await page.evaluate(() => window.__bb.progress.inv.mega)).toBe(2);
});

test("not enough coins: nothing is bought", async ({ simPage: page }) => {
  await page.evaluate(() => { window.__bb.progress.coins = 10; window.__bb.buyGloves("mega"); });
  const p = await page.evaluate(() => window.__bb.progress);
  expect(p.coins).toBe(10);
  expect(p.inv.mega).toBe(0);
});

test("the Big One never enters the Little Ones' house", async ({ simPage: page }) => {
  // the house is the safe zone: 60 s of normal play, the Big One's centre is never inside it
  const n = await page.evaluate(() => {
    let inside = 0; const b = window.__bb;
    for (let i = 0; i < 60 * 60; i++) { b.update(1 / 60); if (b.inSafe(b.big)) inside++; }
    return inside;
  });
  expect(n).toBe(0);
});

test("a banana makes the Big One slip; he can be hugged from the front", async ({ simPage: page }) => {
  await page.evaluate(() => {
    const b = window.__bb; Object.assign(b.big, { state: "look", timer: 999, x: 500, y: 320, dir: 0, stun: 0, slip: 0 });
    b.items.length = 0; b.items.push({ id: 999, kind: "banana", x: 503, y: 321, t: 0, life: 30 });
  });
  await step(page, 0.1);
  expect(await page.evaluate(() => window.__bb.big.slip)).toBeGreaterThan(2);
  const hp0 = await page.evaluate(() => window.__bb.big.hp);
  await page.evaluate(() => { const l = window.__bb.littles[0]; Object.assign(l, { state: "ok", hugCd: 0, invuln: 0, x: 534, y: 320 }); window.__bb.big.hugCd = 0; });
  await step(page, 0.1);
  expect(await page.evaluate(() => window.__bb.big.hp)).toBe(hp0 - 1);
});

test("picking up speed boots makes a Little One faster for a while", async ({ simPage: page }) => {
  await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0]; Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 999 });
    Object.assign(l, { state: "ok", x: 400, y: 300 });
    b.items.length = 0; b.items.push({ id: 998, kind: "boots", x: 405, y: 300, t: 0, life: 30 });
  });
  await step(page, 0.1);
  expect(await page.evaluate(() => window.__bb.littles[0].fx.boots)).toBeGreaterThan(5);
});

// ---------- The Big One's house is dangerous (SPEC-003) ----------
const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };

test("the Big One's house is a danger zone", async ({ simPage: page }) => {
  for (let lv = 1; lv <= 5; lv++) {
    const r = await page.evaluate(v => {
      const b = window.__bb; b.level = v; b.startGame(1);
      const z = b.dangerZone, gen = b.generateLevel("park", v, 0);
      const d = gen.items.find(it => it.t === "danger"), dark = gen.items.find(it => it.t === "floor" && it.kind === "dark");
      return { z, d, dark, inside: b.inDanger({ x: z.x + z.w / 2, y: z.y + z.h / 2 }), safe: b.inDanger({ x: b.safeZone.x + b.safeZone.w / 2, y: b.safeZone.y + b.safeZone.h / 2 }) };
    }, lv);
    expect(r.d).toBeTruthy();
    expect([r.d.x, r.d.y, r.d.w, r.d.h]).toEqual([r.dark.x, r.dark.y, r.dark.w, r.dark.h]);   // the floor area, mirrored with the rest
    expect(r.inside).toBe(true);
    expect(r.safe).toBe(false);
  }
  // level 1's other items stay exactly as before the spec
  const items = await page.evaluate(() => JSON.stringify(window.__bb.generateLevel("park", 1, 0).items.filter(it => it.t !== "danger")));
  expect(fnv(items)).toBe("78645e45");
});

test("staying 5 s in the Big One's house throws you out", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, l = b.littles[0], z = b.dangerZone, out = {};
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    t.calm(900, 100); t.pin([0]);
    // leaving resets the timer at once
    Object.assign(l, { state: "ok", x: cx, y: cy, invuln: 0 });
    t.step(3); out.t3 = l.dangerT;
    Object.assign(l, { x: 480, y: 320 });
    b.update(1 / 60); out.left = l.dangerT;
    // 5 s inside → thrown out of the door, dizzy, leg fine
    Object.assign(l, { x: cx, y: cy });
    t.step(4.9); out.before = { in: b.inDanger(l), dz: l.dizzy };
    t.step(0.2);
    out.after = { in: b.inDanger(l), st: l.state, dz: l.dizzy, dt: l.dangerT, ex: Math.min(...z.exits.map(e => Math.hypot(e.x - l.x, e.y - l.y))), texts: b.texts.map(q => q.text) };
    // dizzy: cannot move and cannot be pushed
    const x0 = l.x;
    t.key("KeyD", true); t.step(0.4); t.key("KeyD", false);
    out.moved = Math.abs(l.x - x0);
    Object.assign(b.big, { x: l.x - 34, y: l.y, dir: 0, state: "look", timer: 9999 });
    t.step(0.3); out.pushed = l.state;
    t.calm(900, 100);
    t.step(1.5); out.dizzyEnd = l.dizzy;
    return out;
  });
  expect(r.t3).toBeGreaterThan(2.9);
  expect(r.left).toBe(0);
  expect(r.before.in).toBe(true);
  expect(r.before.dz).toBe(0);
  expect(r.after.in).toBe(false);
  expect(r.after.st).toBe("ok");
  expect(r.after.dz).toBeGreaterThan(1.7);
  expect(r.after.dt).toBe(0);
  expect(r.after.ex).toBeLessThan(48);              // on the free cell 2 cells outside a door
  expect(r.after.texts).toContain("Get out of my house!");
  expect(r.moved).toBeLessThan(0.5);
  expect(r.pushed).toBe("ok");
  expect(r.dizzyEnd).toBe(0);
});

test("downed Little Ones have no house timer, the shield does not help", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, l = b.littles[0], z = b.dangerZone, out = {};
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    t.calm(900, 100); t.pin([0]);
    Object.assign(l, { state: "down", downTimer: 15, x: cx, y: cy, kx: 0, ky: 0 });
    t.step(6); out.down = { st: l.state, dt: l.dangerT, in: b.inDanger(l) };
    Object.assign(l, { state: "ok", x: cx, y: cy }); l.fx.shield = 25;
    t.step(5.1); out.shield = { in: b.inDanger(l), dz: l.dizzy };
    return out;
  });
  expect(r.down.st).toBe("down");
  expect(r.down.dt).toBe(0);
  expect(r.down.in).toBe(true);
  expect(r.shield.in).toBe(false);
  expect(r.shield.dz).toBeGreaterThan(1.5);
});

test("bots don't linger in the Big One's house", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, z = b.dangerZone;
    Object.assign(b.big, { x: 480, y: 320, state: "look", timer: 3 });
    const bots = b.littles.filter(l => l.kind === "bot");
    bots.slice(0, 2).forEach((l, i) => Object.assign(l, { x: z.x + z.w / 2 + (i ? 20 : -20), y: z.y + z.h / 2 }));
    let thrown = 0, maxT = 0, leftAt = -1;
    for (let i = 0; i < 60 * 60; i++) {
      b.update(1 / 60);
      for (const l of bots) { if (l.dizzy > 0) thrown++; maxT = Math.max(maxT, l.dangerT); }
      if (leftAt < 0 && bots.slice(0, 2).every(l => !b.inDanger(l))) leftAt = i / 60;
    }
    return { thrown, maxT, leftAt };
  });
  expect(r.thrown).toBe(0);
  expect(r.maxT).toBeLessThan(5);
  expect(r.leftAt).toBeGreaterThanOrEqual(0);
  expect(r.leftAt).toBeLessThan(4.5);
});

// ---------- Bonus stars (SPEC-003) ----------
test("bonus stars appear and disappear", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, out = {};
    b.startGame(1);                                   // fresh timers, all in this evaluate
    out.start = b.stars.length;
    t.step(9.5); out.at95 = b.stars.length;           // the first one comes after 10–15 s
    t.step(6); out.at155 = b.stars.length;
    let maxStars = 0, maxItems = 0;
    for (let i = 0; i < 60 * 60; i++) { b.update(1 / 60); maxStars = Math.max(maxStars, b.stars.length); maxItems = Math.max(maxItems, b.items.length); }
    Object.assign(out, { maxStars, maxItems, starInItems: b.items.some(it => it.kind === "star") });
    b.stars.length = 0; const id = b.spawnStar().id;
    t.step(11.8); out.alive = b.stars.some(s => s.id === id);
    t.step(0.3); out.gone = !b.stars.some(s => s.id === id);   // lives 12 s
    return out;
  });
  expect(r.start).toBe(0);
  expect(r.at95).toBe(0);
  expect(r.at155).toBeGreaterThanOrEqual(1);
  expect(r.maxStars).toBeLessThanOrEqual(2);
  expect(r.maxItems).toBeLessThanOrEqual(3);
  expect(r.starInItems).toBe(false);
  expect(r.alive).toBe(true);
  expect(r.gone).toBe(true);
});

test("stars spawn only in fair places", async ({ simPage: page }) => {
  const bad = await page.evaluate(() => {
    const b = window.__bb, out = [];
    for (let lv = 1; lv <= 5; lv++) {
      b.level = lv; b.startGame(1);
      const { COLS, ROWS, CELL } = b.grid, blocked = b.grid.blocked, sz = b.safeZone;
      // reachable cells from the Little Ones' spawn
      const seen = new Uint8Array(COLS * ROWS), s0 = Math.floor(b.littles[0].y / CELL) * COLS + Math.floor(b.littles[0].x / CELL), q = [s0]; seen[s0] = 1;
      while (q.length) { const i = q.pop(), cx = i % COLS, cy = (i / COLS) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue; const j = ny * COLS + nx; if (!blocked[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
      for (let k = 0; k < 20; k++) {
        b.stars.length = 0; b.items.length = 0;
        for (let n = 0; n < 3; n++) b.spawnItem();
        b.spawnStar(); b.spawnStar();
        if (b.stars.length !== 2) { out.push(`lv${lv}: ${b.stars.length} stars`); continue; }
        const cellOf = p => Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL);
        if (cellOf(b.stars[0]) === cellOf(b.stars[1])) out.push(`lv${lv}: two stars in one cell`);
        for (const st of b.stars) {
          const c = cellOf(st);
          const dx = Math.max(sz.x - st.x, 0, st.x - (sz.x + sz.w)), dy = Math.max(sz.y - st.y, 0, st.y - (sz.y + sz.h));
          if (blocked[c]) out.push(`lv${lv}: in a wall`);
          if (!seen[c]) out.push(`lv${lv}: unreachable`);
          if (b.inSafe(st)) out.push(`lv${lv}: in the safe house`);
          if (b.inDanger(st)) out.push(`lv${lv}: in the Big One's house`);
          const dz = b.dangerZone, m = 2 * CELL;                         // walls and doorway cells of his house too
          if (st.x > dz.x - m && st.x < dz.x + dz.w + m && st.y > dz.y - m && st.y < dz.y + dz.h + m) out.push(`lv${lv}: in the Big One's doorway`);
          if (Math.hypot(dx, dy) < 6 * CELL) out.push(`lv${lv}: too close to the house`);
          if (b.items.some(it => cellOf(it) === c)) out.push(`lv${lv}: on an item`);
        }
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test("only players pick up stars", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, out = {};
    t.calm(900, 100);
    const c0 = b.progress.coins;
    b.stars.length = 0; b.spawnStar(480, 330);
    const bots = b.littles.filter(l => l.kind === "bot");
    Object.assign(bots[0], { x: 480, y: 330, state: "ok" });          // a bot stands on it
    b.update(1 / 60); out.bot = b.stars.length;
    bots.forEach((l, i) => Object.assign(l, { x: 700, y: 100 + i * 40 }));
    Object.assign(b.big, { x: 480, y: 330, state: "look", timer: 9999 });   // the Big One walks over it
    b.update(1 / 60); out.big = b.stars.length;
    t.calm(900, 100);
    Object.assign(b.littles[0], { x: 490, y: 330, state: "ok" });     // the player takes it
    b.update(1 / 60);
    Object.assign(out, { n: b.stars.length, sc: b.stats.starCoins, dc: b.progress.coins - c0, texts: b.texts.map(q => q.text) });
    return out;
  });
  expect(r.bot).toBe(1);
  expect(r.big).toBe(1);
  expect(r.n).toBe(0);
  expect(r.sc).toBe(3);
  expect(r.dc).toBe(3);
  expect(r.texts).toContain("+3");
});

test("star coins are added to the reward", async ({ page }) => {
  await installTestHelpers(page);
  const take = () => page.evaluate(() => {
    const b = window.__bb; window.__t.calm(900, 100);
    b.stars.length = 0; b.spawnStar(480, 330); Object.assign(b.littles[0], { x: 480, y: 330, state: "ok" });
    b.update(1 / 60);
    return b.progress.coins;
  });
  // a level that ends without a win keeps the star coins
  expect(await take()).toBe(3);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(3);
  // a win: the rest penalty brings the first-win line down to the floor, the star coins come on top
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await installTestHelpers(page);
  expect(await take()).toBe(6);
  await page.evaluate(() => { window.__bb.stats.rests = 10; window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, WIN_WAIT);
  const r = await page.evaluate(() => ({ ...window.__bb.lastReward, R: { ...window.__bb.REWARD } }));
  const part = k => (r.parts.find(p => p.reason === k) || { amount: 0 }).amount;
  expect(r.starCoins).toBe(3);
  expect(part("firstWin") + part("rests")).toBe(r.R.FIRST_MIN);   // SPEC-009: the floor of a first win
  expect(part("star")).toBe(3);                                     // star coins on top
  expect(r.coins).toBe(r.R.FIRST_MIN + part("newStars") + part("hugs") + 3);
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(3 + r.coins);
  // a lost level: the reward keeps the star coins apart, nothing is counted twice
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await installTestHelpers(page);
  const before = await page.evaluate(() => window.__bb.progress.coins);
  expect(await take()).toBe(before + 3);
  const lost = await page.evaluate(() => { const b = window.__bb; b.stats.playerHugs = 2; b.giveReward(false); b.mode = "lose"; return { r: b.lastReward, coins: b.progress.coins }; });
  expect(lost.r.win).toBe(false);
  expect(lost.r.starCoins).toBe(3);
  const PH = await page.evaluate(() => window.__bb.REWARD.PER_HUG);
  expect(lost.r.coins).toBe(2 * PH + 3);            // hugs + star coins
  expect(lost.coins).toBe(before + 3 + 2 * PH);
  await page.waitForTimeout(300);                   // the lose screen draws without errors
});

test("a danger zone without exits throws out to the nearest free cell", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, l = b.littles[0], z = b.dangerZone;
    t.calm(900, 100); t.pin([0]);
    z.exits.length = 0;                               // e.g. a future level type that forgets the exits
    Object.assign(l, { state: "ok", x: z.x + z.w / 2, y: z.y + z.h / 2, invuln: 0 });
    t.step(5.1);
    const d = Math.hypot(Math.max(z.x - l.x, 0, l.x - z.x - z.w), Math.max(z.y - l.y, 0, l.y - z.y - z.h));
    return { in: b.inDanger(l), dz: l.dizzy, d };
  });
  expect(r.in).toBe(false);
  expect(r.dz).toBeGreaterThan(1.5);
  expect(r.d).toBeLessThan(3 * 32);                 // right next to the house, not the map centre
});

// ---------- Air kisses (SPEC-004) ----------
// The thrower stands outside the Little Ones' house, next to its right wall (level 1: wall x 192..224, row 1 is y 32..64).
const KISS_SPOT = { x: 270, y: 48 };

test("buying air kisses", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = [];
    b.progress.coins = 45;
    for (let i = 0; i < 3; i++) { b.buyKisses(); out.push([b.progress.coins, b.progress.inv.kisses]); }
    return out;
  });
  expect(r).toEqual([[25, 5], [5, 10], [5, 10]]);    // 20 coins for 5; the third time there are not enough coins
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => window.__bb.progress.inv.kisses)).toBe(10);
  const after = await page.evaluate(() => { const b = window.__bb; b.resetProgress(); b.resetProgress(); return b.progress.inv; });
  expect(after.kisses).toBe(0);
});

// SPEC-018: one real reload per save test (localStorage → the start code → progress); the other saves go through
// __bb.loadProgress, the same pure merge the start code runs on the parsed save (a reload is ~3 s each)
const loadSave = (page, save) => page.evaluate(v => window.__bb.loadProgress(JSON.parse(v)), JSON.stringify(save));

test("old saves get 0 kisses", async ({ simPage: page }) => {
  const old = inv => ({ unlocked: 3, stars: { 1: 2 }, coins: 12, inv, equip: ["mittens", "none"] });
  await page.evaluate(v => localStorage.setItem("bebebe-progress", JSON.stringify(v)), old({ mittens: 1, mega: 0 }));
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const p = await page.evaluate(() => window.__bb.progress);
  expect(p.inv).toEqual({ mittens: 1, mega: 0, kisses: 0, rescues: 0 });
  expect(p.coins).toBe(12);
  expect(p.worlds.park.unlocked).toBe(3);
  expect((await loadSave(page, old({ mittens: 1, mega: 0, kisses: "lots" }))).inv.kisses).toBe(0);   // broken data never throws
  expect((await loadSave(page, old({ mittens: 1, mega: 0, kisses: -3 }))).inv.kisses).toBe(0);
  expect((await loadSave(page, old({ mittens: 1, mega: 0, kisses: 7 }))).inv.kisses).toBe(7);
});

// ---------- SPEC-016 AC 5: the bonus worlds (Beach, Winter) open after every level of the main worlds is won ----------
test("bonus worlds open after all main levels", async ({ page }) => {
  // fresh progress: Beach and Winter are locked; the map refuses them (selectWorld, ←/→, a tap on the tab)
  const fresh = await page.evaluate(() => {
    const b = window.__bb;
    b.world = "school"; b.level = 1; b.mode = "map";
    const out = { unlocked: b.bonusUnlocked(), open: b.WORLDS.map(w => b.bonusOpen(w)) };
    b.selectWorld("beach"); out.select = b.world;
    return out;
  });
  expect(fresh).toEqual({ unlocked: false, open: [true, true, true, true, false, false], select: "school" });
  await frames(page);
  const keys = [];
  for (const k of ["ArrowRight", "ArrowLeft"]) { await page.keyboard.press(k); keys.push(await page.evaluate(() => window.__bb.world)); }
  expect(keys, "→ from the School wraps to the Park, ← goes back: the locked bonus worlds are skipped").toEqual(["park", "school"]);
  await frames(page);
  const tap = await page.evaluate(() => {
    const q = window.__bb.buttonRects.find(r => r.id === "maptab:winter"), c = document.getElementById("game").getBoundingClientRect();
    return q && { x: c.left + (q.x + q.w / 2) * c.width / 960, y: c.top + (q.y + q.h / 2) * c.height / 640 };
  });
  expect(tap, "the locked Winter tab is still drawn").toBeTruthy();
  await page.mouse.click(tap.x, tap.y);
  expect(await page.evaluate(() => window.__bb.world), "a tap on a locked tab changes nothing").toBe("school");

  // every main level won except City 20: still locked; the win of City 20 opens them and says so — once
  const before = await page.evaluate(() => {
    const b = window.__bb, all = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
    for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: all(), stars: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 1])) });
    delete b.progress.worlds.city.won[20]; delete b.progress.worlds.city.stars[20];
    return b.bonusUnlocked();
  });
  expect(before).toBe(false);
  const win = async (w, n) => {
    await page.evaluate(([wd, lv]) => {
      const b = window.__bb; b.world = wd; b.level = lv; b.startGame(1);
      Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }); b.giveReward(true); b.mode = "win";
    }, [w, n]);
    await frames(page);
    return page.evaluate(() => ({ flag: window.__bb.lastReward.bonusUnlocked === true, note: window.__bb.bonusNote, unlocked: window.__bb.bonusUnlocked() }));
  };
  const first = await win("city", 20);
  expect(first.flag).toBe(true);
  expect(first.unlocked).toBe(true);
  expect(first.note && first.note.text, "the win screen says so").toBe("🎁 Bonus worlds unlocked!");
  const again = await win("city", 20), later = await win("park", 7);
  expect([again.flag, again.note, later.flag, later.note], "only the win that completes the 80th main level shows it").toEqual([false, null, false, null]);
  // the map lets you in now: → from the School goes to the Beach, a tab tap picks the Winter
  await page.evaluate(() => { const b = window.__bb; b.mode = "map"; b.world = "school"; b.level = 1; });
  await frames(page);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.__bb.world)).toBe("beach");
  await page.evaluate(() => window.__bb.tapButton("maptab:winter"));
  expect(await page.evaluate(() => window.__bb.world)).toBe("winter");

  // review fix: Beach open through its own progress, then the progress is reset — the Beach is locked again: back to the Park
  const reset = await page.evaluate(() => {
    const b = window.__bb; b.setProgress({ worlds: { beach: { unlocked: 3 } } }); b.mode = "map"; b.world = "park";
    b.selectWorld("beach"); const before = b.world;
    b.resetProgress(); b.resetProgress();                  // two calls, like the button
    return { before, after: b.world, last: b.progress.lastWorld };
  });
  expect(reset).toEqual({ before: "beach", after: "park", last: "park" });
  // a saved lastWorld that is a locked bonus world opens on the Park; one with progress there stays
  expect((await loadSave(page, { lastWorld: "winter" })).lastWorld).toBe("park");
  expect((await loadSave(page, { lastWorld: "beach", worlds: { beach: { unlocked: 3 } } })).lastWorld).toBe("beach");
  await page.evaluate(() => { localStorage.setItem("bebebe-progress", JSON.stringify({ lastWorld: "winter", coins: 4 })); });
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => [window.__bb.world, window.__bb.progress.lastWorld])).toEqual(["park", "park"]);
  // the texts in every language
  expect(await page.evaluate(() => ["en", "es", "ru"].map(l => [window.__bb.I18N[l].bonus, window.__bb.I18N[l].bonusUnlocked])))
    .toEqual([["Bonus", "Bonus worlds unlocked!"], ["Bonus", "¡Se abrieron los mundos bonus!"], ["Бонус", "Открылись бонусные миры!"]]);
});

// SPEC-006 AC 7
test("old saves move into the Park", { tag: "@fast" }, async ({ simPage: page }) => {
  const load = async save => {
    await page.evaluate(v => localStorage.setItem("bebebe-progress", JSON.stringify(v)), save);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true);
    return page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  };
  const inv = { mittens: 2, mega: 1, kisses: 4 };
  await page.evaluate(() => window.__bb.setName("p1", "Mila"));
  const p = await load({ unlocked: 23, stars: { 1: 3, 5: 2, 21: 1 }, coins: 140, inv, equip: ["mega", "mittens"] });
  expect(p.worlds.park).toEqual({ unlocked: 20, stars: { 1: 3, 5: 2 }, won: { 1: true, 5: true } });   // level 21 is dropped
  for (const w of ["field", "city", "school", "beach", "winter"]) expect(p.worlds[w], w).toEqual({ unlocked: 1, stars: {}, won: {} });
  expect(p.coins).toBe(140);
  expect(p.inv).toEqual({ ...inv, rescues: 0 });      // SPEC-007: saves without rescue kits get 0
  expect(p.equip).toEqual(["mega", "mittens"]);
  expect(await page.evaluate(() => window.__bb.names.p1)).toBe("Mila");
  // the migration happens once: the saved progress now has the worlds and loads the same again
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("bebebe-progress")));
  expect("unlocked" in saved || "stars" in saved, "the old flat fields are gone from the save").toBe(false);
  expect(saved.worlds).toEqual(p.worlds);
  const again = await loadSave(page, saved);
  expect(again.worlds).toEqual(p.worlds);
  expect(again.coins).toBe(140);
  // a save with neither worlds nor old levels gets the fresh structure
  const fresh = await loadSave(page, { coins: 7 });
  for (const w of ["park", "field", "city", "school", "beach", "winter"]) expect(fresh.worlds[w], w).toEqual({ unlocked: 1, stars: {}, won: {} });
  expect(fresh.coins).toBe(7);
  expect(fresh.lastWorld).toBe("park");
  // a save with worlds merges with the defaults; broken values never throw
  const part = await loadSave(page, { coins: 3, lastWorld: "moon", worlds: { beach: { unlocked: 7, stars: { 2: 3, 30: 2 } }, winter: "junk", school: { unlocked: 99 } } });
  expect(part.worlds).toEqual({ park: { unlocked: 1, stars: {}, won: {} }, field: { unlocked: 1, stars: {}, won: {} }, city: { unlocked: 1, stars: {}, won: {} },
    school: { unlocked: 20, stars: {}, won: {} }, beach: { unlocked: 7, stars: { 2: 3 }, won: { 2: true } }, winter: { unlocked: 1, stars: {}, won: {} } });
  expect(part.lastWorld).toBe("park");
  // SPEC-016: the only change here — "winter" is now a bonus world, locked without Winter progress, so it opens on the Park
  expect((await loadSave(page, { coins: 1, lastWorld: "winter" })).lastWorld).toBe("park");
  expect((await loadSave(page, { coins: 1, lastWorld: "school" })).lastWorld).toBe("school");
  // a stale page wrote both worlds and the old flat fields: the flat ones merge into the Park (higher unlocked, best stars), then go away
  const both = await load({ coins: 9, worlds: { park: { unlocked: 4, stars: { 1: 1, 2: 3 } }, school: { unlocked: 2, stars: {} } }, unlocked: 6, stars: { 1: 3, 2: 1, 25: 3 } });
  expect(both.worlds.park).toEqual({ unlocked: 6, stars: { 1: 3, 2: 3 }, won: { 1: true, 2: true } });
  expect(both.worlds.school).toEqual({ unlocked: 2, stars: {}, won: {} });
  expect(both.coins).toBe(9);
  const bothSaved = JSON.parse(await page.evaluate(() => localStorage.getItem("bebebe-progress")));
  expect("unlocked" in bothSaved || "stars" in bothSaved).toBe(false);
  expect(bothSaved.worlds.park).toEqual({ unlocked: 6, stars: { 1: 3, 2: 3 }, won: { 1: true, 2: true } });
  const lower = await loadSave(page, { worlds: { park: { unlocked: 9, stars: { 3: 3 } } }, unlocked: 2, stars: { 3: 1 } });
  expect(lower.worlds.park).toEqual({ unlocked: 9, stars: { 3: 3 }, won: { 3: true } });   // the newer world data is never lowered
});

test("throwing spends a kiss and has a cooldown", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(spot => {
    const b = window.__bb, t = window.__t, l = b.littles[0], out = {};
    b.progress.inv.kisses = 3;
    out.bot = b.throwKiss(1);                         // bots never throw
    t.calm(); b.big.noPush = 999; t.pin([0]);
    Object.assign(l, { ...spot, dir: 0, state: "ok", hugAnim: 0, dizzy: 0, kissCd: 0 });
    out.first = b.throwKiss(0); out.n1 = b.progress.inv.kisses; out.cd = l.kissCd; out.flying = b.kisses.length;
    out.second = b.throwKiss(0); out.n2 = b.progress.inv.kisses;
    t.step(1.05);
    out.third = b.throwKiss(0); out.n3 = b.progress.inv.kisses;
    t.step(1.05); out.flyingEnd = b.kisses.length; out.n4 = b.progress.inv.kisses;   // a miss is still spent
    l.kissCd = 0;
    l.dizzy = 1; out.dizzy = b.throwKiss(0); l.dizzy = 0;
    l.hugAnim = 0.5; out.hugging = b.throwKiss(0); l.hugAnim = 0;
    l.state = "down"; out.down = b.throwKiss(0); l.state = "ok";
    out.n5 = b.progress.inv.kisses;
    b.progress.inv.kisses = 0; out.none = b.throwKiss(0);
    return out;
  }, KISS_SPOT);
  expect(r.bot).toBe(false);
  expect(r.first).toBe(true);
  expect(r.n1).toBe(2);
  expect(r.cd).toBeCloseTo(1, 5);
  expect(r.flying).toBe(1);
  expect(r.second).toBe(false);
  expect(r.n2).toBe(2);
  expect(r.third).toBe(true);
  expect(r.n3).toBe(1);
  expect(r.flyingEnd).toBe(0);
  expect(r.n4).toBe(1);
  expect([r.dizzy, r.hugging, r.down]).toEqual([false, false, false]);
  expect(r.n5).toBe(1);
  expect(r.none).toBe(false);
});

test("kiss keys for one and two players", async ({ page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(spot => {
    const b = window.__bb, t = window.__t, out = {};
    const press = code => { t.key(code, true); t.key(code, false); };
    const ready = () => { t.calm(); b.big.noPush = 999; b.littles.forEach((l, i) => { if (l.kind === "player") Object.assign(l, { x: spot.x, y: spot.y + i * 60, dir: 0, kissCd: 0 }); }); };
    b.progress.inv.kisses = 20;
    ready();
    press("KeyE"); out.e1 = b.kisses.map(k => k.owner);
    ready(); press("Space"); out.space1 = b.kisses.map(k => k.owner);
    b.startGame(2); b.kisses.length = 0; ready();
    press("KeyE"); out.e2 = b.kisses.map(k => k.owner);
    ready(); press("Enter"); out.enter2 = b.kisses.map(k => k.owner);
    ready(); press("NumpadEnter"); out.numEnter2 = b.kisses.map(k => k.owner);
    ready(); press("Space"); out.space2 = b.kisses.length;      // Space is a one-player key
    out.left = b.progress.inv.kisses;
    return out;
  }, KISS_SPOT);
  expect(r.e1).toEqual([0]);
  expect(r.space1).toEqual([0, 0]);
  expect(r.e2).toEqual([0]);
  expect(r.enter2).toEqual([0, 1]);
  expect(r.numEnter2).toEqual([0, 1, 1]);
  expect(r.space2).toBe(3);
  expect(r.left).toBe(15);
  // gamepad: button 2 (X on Xbox, □ on PlayStation); the second pad is player 2 in a two-player game
  await page.evaluate(() => {
    const b = window.__bb; b.big.noPush = 999;
    b.littles.forEach(l => { l.kissCd = 0; });
    const pad = (i, on) => ({ index: i, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: on && k === 2, value: 0 })) });
    window.__pads = [pad(0, false), pad(1, true)];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  await page.waitForFunction(() => window.__bb.progress.inv.kisses === 14);
  expect(await page.evaluate(() => window.__bb.littles[1].kissCd > 0 && window.__bb.littles[0].kissCd === 0)).toBe(true);
});

test("the gamepad d-pad left/right and the shoulder buttons switch worlds on the map", async ({ page }) => {
  await page.evaluate(() => {
    const b = window.__bb; b.mode = "map";
    window.__press = k => { window.__pads = [{ index: 0, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
    window.__press(-1);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  const press = async k => { await page.evaluate(n => window.__press(n), k); await frames(page); await page.evaluate(() => window.__press(-1)); await frames(page); };
  // SPEC-016: worlds in the story order (park, field, city, school, then the bonus beach, winter), the locked bonus ones skipped
  // SPEC-017: d-pad ←/→ and the shoulder buttons (CFG.PAD_PREV_WORLD / PAD_NEXT_WORLD) switch worlds; ↑/↓ pick a level stop
  await press(15);                                                  // d-pad right: next world
  expect(await page.evaluate(() => window.__bb.world)).toBe("field");
  await press(14);                                                  // d-pad left: previous world
  expect(await page.evaluate(() => window.__bb.world)).toBe("park");
  await press(14);                                                  // wraps around, past the locked Winter and Beach
  expect(await page.evaluate(() => window.__bb.world)).toBe("school");
  await press(await page.evaluate(() => window.__bb.CFG.PAD_NEXT_WORLD));
  expect(await page.evaluate(() => window.__bb.world)).toBe("park");
  await press(await page.evaluate(() => window.__bb.CFG.PAD_PREV_WORLD));
  expect(await page.evaluate(() => window.__bb.world)).toBe("school");
  // on the pause and win screens the d-pad changes nothing
  for (const m of ["pause", "win"]) {
    await page.evaluate(v => { window.__bb.mode = v; }, m);
    await press(15); await press(14); await press(13); await press(12);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world]), m).toEqual([m, "school"]);
  }
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("touch kiss button does not move the player", async ({ page }) => {
    await installTestHelpers(page);
    await page.evaluate(spot => {
      const b = window.__bb, t = window.__t;
      b.progress.inv.kisses = 5; t.calm(); b.big.noPush = 999; t.pin([0]);
      Object.assign(b.littles[0], { ...spot, dir: 0, kissCd: 0 });
    }, KISS_SPOT);
    await frames(page);
    const rect = await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "kiss:0"));
    expect(rect).toBeTruthy();
    expect(rect.x).toBeGreaterThan(960 / 2);          // one player: bottom right
    expect(rect.y).toBeGreaterThan(640 / 2);
    expect(rect.w).toBeGreaterThanOrEqual(60);
    const r = await page.evaluate(rc => {
      const b = window.__bb, c = document.getElementById("game"), bb = c.getBoundingClientRect(), l = b.littles[0];
      const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: bb.left + x * bb.width / 960, clientY: bb.top + y * bb.height / 640, pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      const cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2, x0 = l.x, y0 = l.y;
      ev("pointerdown", cx, cy);
      ev("pointermove", cx - 140, cy - 80);           // the finger slides off the button: still no joystick
      window.__t.step(0.5);
      const out = { moved: Math.hypot(l.x - x0, l.y - y0), left: b.progress.inv.kisses };
      ev("pointerup", cx - 140, cy - 80);
      return out;
    }, rect);
    expect(r.moved).toBeLessThan(0.5);
    expect(r.left).toBe(4);
    // no kisses: no button
    await page.evaluate(() => { window.__bb.progress.inv.kisses = 0; });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.buttonRects.some(q => q.id.startsWith("kiss:")))).toBe(false);
    // two players: player 1 bottom left, player 2 bottom right
    await page.evaluate(() => { const b = window.__bb; b.startGame(2); b.progress.inv.kisses = 5; });
    await frames(page);
    const two = await page.evaluate(() => window.__bb.buttonRects.filter(q => q.id.startsWith("kiss:")));
    const p1 = two.find(q => q.id === "kiss:0"), p2 = two.find(q => q.id === "kiss:1");
    expect(p1.x + p1.w).toBeLessThan(960 / 2);
    expect(p2.x).toBeGreaterThan(960 / 2);
    expect(Math.min(p1.y, p2.y)).toBeGreaterThan(640 / 2);
  });
});

test("no kisses from the safe house", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, l = b.littles[0], z = b.safeZone;
    t.calm(); t.pin([0]);
    b.progress.inv.kisses = 3;
    Object.assign(l, { x: z.x + z.w / 2, y: z.y + z.h / 2, dir: 0, kissCd: 0 });
    const ok = b.throwKiss(0);
    return { ok, n: b.progress.inv.kisses, flying: b.kisses.length, cd: l.kissCd, texts: b.texts.map(q => q.text), want: b.I18N.en.noKissHome };
  });
  expect(r.ok).toBe(false);
  expect(r.n).toBe(3);
  expect(r.flying).toBe(0);
  expect(r.cd).toBe(0);
  expect(r.texts).toContain(r.want);
});

test("kisses stop at walls and fly over ponds", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const wall = await page.evaluate(spot => {
    const b = window.__bb, t = window.__t, l = b.littles[0];
    t.calm(); b.big.noPush = 999; t.pin([0]);
    b.progress.inv.kisses = 5;
    Object.assign(l, { ...spot, dir: Math.PI, kissCd: 0 });   // facing the house wall (x 192..224)
    b.throwKiss(0);
    let minX = Infinity, life = 0;
    for (let i = 0; i < 60 && b.kisses.length; i++) { minX = Math.min(minX, b.kisses[0].x); b.update(1 / 60); life = (i + 1) / 60; }
    return { minX, life, left: b.kisses.length };
  }, KISS_SPOT);
  expect(wall.left).toBe(0);
  expect(wall.life).toBeLessThan(0.3);               // the full range (224 px) would take 0.53 s
  expect(wall.minX).toBeGreaterThan(210);
  const pond = await page.evaluate(() => {
    const b = window.__bb, t = window.__t;
    b.level = 1; b.startGame(1);                      // level 1 (the kids' drawing, fixed by tests/fixtures/level1.json) has a pond
    const p = b.grid.obstacles.find(o => o.kind === "pond");
    if (!p) return null;
    const l = b.littles[0], y = p.y + p.h / 2;
    t.calm(p.x + 64, p.y > 320 ? 60 : 580); b.big.noPush = 999; t.pin([0]);
    b.progress.inv.kisses = 5;
    Object.assign(l, { x: p.x - 18, y, dir: 0, kissCd: 0, state: "ok" });
    b.throwKiss(0);
    let maxX = -Infinity;
    for (let i = 0; i < 60 && b.kisses.length; i++) { maxX = Math.max(maxX, b.kisses[0].x); b.update(1 / 60); }
    return { maxX, end: p.x + p.w };
  });
  expect(pond).not.toBeNull();
  expect(pond.maxX).toBeGreaterThan(pond.end);       // flew over the whole pond
});

test("trees, rocks and the map edge stop kisses; bushes do not", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(spot => {
    const b = window.__bb, t = window.__t, l = b.littles[0], w = b.grid, out = {};
    t.calm(900, 600); b.big.noPush = 999; t.pin([0]);
    b.progress.inv.kisses = 20;
    // flies from (x, y) along dir; returns how far it got and how long it lived
    const fly = (x, y, dir) => {
      Object.assign(l, { x, y, dir, kissCd: 0, state: "ok" });
      if (!b.throwKiss(0)) return null;
      const k = b.kisses[b.kisses.length - 1], path = [];
      for (let i = 0; i < 60 && b.kisses.includes(k); i++) { path.push({ x: k.x, y: k.y }); b.update(1 / 60); }
      return { path, alive: b.kisses.includes(k) };
    };
    const clear = (x1, x2, y) => { for (let x = x1; x <= x2; x += 2) if (w.seeSolid(x, y)) return false; return true; };
    for (const kind of ["tree", "rock"]) {
      const o = w.obstacles.find(q => q.kind === kind && q.x > 120 && !b.inSafe(q) && clear(q.x - 70, q.x - 28, q.y) && Math.hypot(q.x - b.big.x, q.y - b.big.y) > 150);
      if (!o) { out[kind] = "none"; continue; }
      const f = fly(o.x - 60, o.y, 0);
      out[kind] = { alive: f.alive, maxX: Math.max(...f.path.map(p => p.x)), edge: o.x - o.r, frames: f.path.length };
    }
    const bush = w.bushes.find(q => clear(q.x - 70, q.x + 70, q.y) && !b.inSafe({ x: q.x - 60, y: q.y }) && Math.hypot(q.x - b.big.x, q.y - b.big.y) > 150);
    if (bush) { const f = fly(bush.x - 60, bush.y, 0); out.bush = { maxX: Math.max(...f.path.map(p => p.x)), far: bush.x + bush.r }; } else out.bush = "none";
    const e = fly(spot.x, 16, -Math.PI / 2);          // up, into the top edge of the map
    out.edge = { alive: e.alive, frames: e.path.length, minY: Math.min(...e.path.map(p => p.y)) };
    return out;
  }, KISS_SPOT);
  for (const kind of ["tree", "rock"]) {
    expect(r[kind]).not.toBe("none");
    expect(r[kind].alive).toBe(false);
    expect(r[kind].maxX).toBeLessThan(r[kind].edge + 2);   // stopped at the trunk/stone
    expect(r[kind].frames).toBeLessThan(10);
  }
  expect(r.bush).not.toBe("none");
  expect(r.bush.maxX).toBeGreaterThan(r.bush.far);   // flew through the bush
  expect(r.edge.alive).toBe(false);
  expect(r.edge.frames).toBeLessThan(4);
  expect(r.edge.minY).toBeGreaterThanOrEqual(0);
});

test("a kiss never hits the Big One through a wall", async ({ simPage: page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(spot => {
    const b = window.__bb, t = window.__t, big = b.big, l = b.littles[0];
    t.pin([0]);
    // he stands pressed against the far side of the house wall (x 192..224); the kiss comes from the other side
    Object.assign(big, { x: 206, y: spot.y, dir: Math.PI, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 999, pushCd: 0, hugCd: 0, blush: 0 });
    b.progress.inv.kisses = 5;
    Object.assign(l, { x: 252, y: spot.y, dir: Math.PI, kissCd: 0, state: "ok" });
    const hp0 = big.hp;
    b.throwKiss(0);
    for (let i = 0; i < 30 && b.kisses.length; i++) b.update(1 / 60);
    return { lost: hp0 - big.hp, blush: big.blush, flying: b.kisses.length };
  }, KISS_SPOT);
  expect(r).toEqual({ lost: 0, blush: 0, flying: 0 });
});

// Thrower 50 px behind the Big One (he faces away), so the kiss reaches him in a frame or two. Level 1: the strip under the
// Little Ones' house (rows 6–7, x 0..288) is always free (the pond is near the map centre).
async function kissScene(page) {
  await installTestHelpers(page);
  await page.evaluate(() => {
    const t = window.__t;
    t.kissHim = () => {
      const b = window.__bb, big = b.big, l = b.littles[0];
      Object.assign(l, { x: big.x - 50, y: big.y, dir: 0, state: "ok", invuln: 0, hugAnim: 0, kissCd: 0 });
      b.throwKiss(0);
      for (let i = 0; i < 30 && b.kisses.length; i++) b.update(1 / 60);
    };
    t.pin([0]);
    Object.assign(window.__bb.big, { x: 200, y: 228, dir: 0, state: "look", timer: 9999, stun: 0, stunFace: 0, stunTurn: 0, slip: 0, noPush: 0, pushCd: 0, hugCd: 0 });
    window.__bb.progress.inv.kisses = 10;
  });
}

test("a kiss takes half a heart and makes him blush", async ({ simPage: page }) => {
  await kissScene(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, big = b.big, l = b.littles[0], out = {};
    const hp0 = big.hp;
    t.kissHim();
    out.lost = hp0 - big.hp; out.blush = big.blush; out.texts = b.texts.map(q => q.text);
    const x0 = big.x, y0 = big.y;
    Object.assign(b.littles[1], { x: big.x + 35, y: big.y, state: "ok", invuln: 0, hugCd: 99 });   // right in front of him
    t.step(1.0);
    out.moved = Math.hypot(big.x - x0, big.y - y0); out.front = b.littles[1].state;
    Object.assign(b.littles[1], { x: 860, y: 600 });
    for (let i = 0; i < 60 && big.blush > 0; i++) b.update(1 / 60);
    out.state = big.state; out.lastSeen = big.lastSeen; out.thrower = { x: l.x, y: l.y };
    const facing = () => Math.abs(Math.atan2(Math.sin(Math.atan2(l.y - big.y, l.x - big.x) - big.dir), Math.cos(Math.atan2(l.y - big.y, l.x - big.x) - big.dir)));
    out.faceNow = facing();
    l.invuln = 99;                                    // he may chase, but must not push the thrower during the check
    const d0 = Math.hypot(l.x - big.x, l.y - big.y);
    t.step(5 / 60);
    out.faceLater = facing(); out.closer = d0 - Math.hypot(l.x - big.x, l.y - big.y);
    return out;
  });
  expect(r.faceNow).toBeLessThan(0.2);               // turned to the thrower (he threw from behind)
  expect(r.faceLater).toBeLessThan(0.6);
  expect(r.closer).toBeGreaterThanOrEqual(0);        // and does not walk away from him
  expect(r.lost).toBe(0.5);
  expect(r.blush).toBeGreaterThan(1.4);
  expect(r.texts).toContain("Mwah!");
  expect(r.texts).toContain("So shy!");
  expect(r.moved).toBe(0);                           // stands still
  expect(r.front).toBe("ok");                        // and pushes nobody
  expect(r.state).toBe("chase");                     // then goes after the thrower
  expect(Math.hypot(r.lastSeen.x - r.thrower.x, r.lastSeen.y - r.thrower.y)).toBeLessThan(1);
});

test("kisses during shock or blush do no damage", async ({ simPage: page }) => {
  await kissScene(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, big = b.big, out = {};
    const hp0 = big.hp;
    big.stun = 2; t.kissHim();
    out.shock = { lost: hp0 - big.hp, blush: big.blush, flying: b.kisses.length };
    big.stun = 0; t.kissHim();
    out.first = hp0 - big.hp;
    const bl = big.blush;
    t.kissHim();
    out.second = { lost: hp0 - big.hp, refreshed: big.blush > bl };
    t.step(2);                                        // the blush is over
    const hp1 = big.hp;
    Object.assign(big, { stun: 0, hugCd: 0.2, blush: 0, state: "look", timer: 9999, x: 200, y: 228, dir: 0 });   // the last 0.3 s after a hug's shock
    t.kissHim();
    out.hugCd = { lost: hp1 - big.hp, blush: big.blush };
    return out;
  });
  expect(r.hugCd).toEqual({ lost: 0, blush: 0 });
  expect(r.shock).toEqual({ lost: 0, blush: 0, flying: 0 });
  expect(r.first).toBe(0.5);
  expect(r.second).toEqual({ lost: 0.5, refreshed: false });
});

test("a blushing Big One can be hugged", async ({ simPage: page }) => {
  await kissScene(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, big = b.big, l = b.littles[0];
    const hp0 = big.hp;
    t.kissHim();
    const blush = big.blush;
    Object.assign(l, { x: big.x - 34, y: big.y, hugCd: 0, kx: 0, ky: 0 });   // right behind him
    b.update(1 / 60);
    return { blush, lost: hp0 - big.hp, after: big.blush, stun: big.stun, anim: l.hugAnim };
  });
  expect(r.blush).toBeGreaterThan(1);
  expect(r.lost).toBe(1.5);
  expect(r.after).toBe(0);
  expect(r.stun).toBeGreaterThan(2);
  expect(r.anim).toBeGreaterThan(0);
});

test("the last half heart by a kiss wins the level", async ({ simPage: page }) => {
  await kissScene(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t;
    b.big.hp = 0.5;
    t.kissHim();
    const hp = b.big.hp, n = b.progress.inv.kisses;
    b.littles[0].kissCd = 0;
    const again = b.throwKiss(0), n2 = b.progress.inv.kisses;   // the level is already won: nothing is spent
    t.step(4.5);                                                 // SPEC-022: + the walk home
    return { hp, mode: b.mode, reward: b.lastReward, again, spent: n - n2 };
  });
  expect(r.again).toBe(false);
  expect(r.spent).toBe(0);
  expect(r.hp).toBe(0);
  expect(r.mode).toBe("win");
  expect(r.reward.win).toBe(true);
  expect(r.reward.stars).toBeGreaterThanOrEqual(1);
});

test("hearts bar shows half hearts", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, f = b.heartFill, big = b.big, out = {};
    out.fill = [f(0, 2.5), f(1, 2.5), f(2, 2.5), f(3, 2.5), f(5, 6), f(0, 0), f(0, 0.5)];
    out.lose = [2.5, 0.5, 0, 3].map(b.fmtHearts);
    big.hp = big.maxHp - 0.5; out.boostHalf = b.bigBoost();
    big.hp = big.maxHp - 1.5; out.boostOneHalf = b.bigBoost();
    big.hp = big.maxHp; out.boost0 = b.bigBoost();
    return out;
  });
  expect(r.fill).toEqual([1, 1, 0.5, 0, 1, 0, 0.5]);
  expect(r.lose).toEqual(["2½", "½", "0", "3"]);       // "Hearts taken" on the lose screen
  expect(r.boost0).toBe(0);                          // level 1
  expect(r.boostHalf).toBe(0);                       // half a heart is not a whole heart lost
  expect(r.boostOneHalf).toBe(4);                    // one whole heart: BIG_SPEED_PER_HIT
});

// SPEC-007 AC 3: a fourth card, the rescue kit
test("the shop shows four cards in one row", { tag: "@fast" }, async ({ page }) => {
  for (const lang of ["en", "es", "ru"]) {
    await page.evaluate(l => { window.__bb.setLang(l); window.__bb.mode = "shop"; }, lang);
    await frames(page);
    const rects = await page.evaluate(() => window.__bb.buttonRects.filter(q => q.id.startsWith("buy:")));
    expect(rects.map(q => q.id)).toEqual(["buy:mittens", "buy:mega", "buy:kisses", "buy:rescues"]);
    expect(new Set(rects.map(q => q.y)).size).toBe(1);
    for (let i = 1; i < 4; i++) expect(rects[i].x).toBeGreaterThan(rects[i - 1].x + rects[i - 1].w);
    expect(rects[0].x).toBeGreaterThan(40);                // inside the shop panel (880 px wide)
    expect(rects[3].x + rects[3].w).toBeLessThan(920);
    for (const q of rects) expect(q.textW, `${lang}: ${q.id} text fits`).toBeLessThanOrEqual(q.w + 0.5);
  }
  const click = async id => {
    const buy = await page.evaluate(k => {
      const q = window.__bb.buttonRects.find(r => r.id === k), c = document.getElementById("game").getBoundingClientRect();
      return { x: c.left + (q.x + q.w / 2) * c.width / 960, y: c.top + (q.y + q.h / 2) * c.height / 640 };
    }, id);
    await page.mouse.click(buy.x, buy.y);
  };
  await page.evaluate(() => { window.__bb.progress.coins = 70; });   // SPEC-026: kisses 20 + kits 50
  await frames(page);
  await click("buy:kisses");
  expect(await page.evaluate(() => window.__bb.progress.inv.kisses)).toBe(5);
  await frames(page);
  await click("buy:rescues");
  expect(await page.evaluate(() => [window.__bb.progress.inv.rescues, window.__bb.progress.coins])).toEqual([3, 0]);
});

// ---------- Rescue kit 🩹 (SPEC-007) ----------
// The downed player stands in the open, the Big One is calm and far away, everyone else is pinned (no rescuers).
async function downPlayer(page, state = "down") {
  await installTestHelpers(page);
  await page.evaluate(st => {
    const b = window.__bb, t = window.__t, l = b.littles[0], z = b.safeZone;
    t.calm(); b.big.noPush = 999; t.pin([0]);
    const spot = st === "rest" ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : { x: 500, y: 300 };
    Object.assign(l, { ...spot, state: st, downTimer: st === "down" ? 10 : 0, rescue: st === "down" ? 1.5 : 0, restTimer: st === "rest" ? 20 : 0,
      kx: 0, ky: 0, invuln: 0, restSpot: { ...spot }, path: st === "home" ? [{ x: 100, y: 100 }] : [] });
    if (st !== "down") b.stats.rests = 1;            // home/rest: the rest was already counted when he gave up waiting
  }, state);
}

test("buying rescue kits", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = [];
    out.push([b.RESCUE_KIT.price, b.RESCUE_KIT.pack]);
    b.progress.coins = 110;
    for (let i = 0; i < 3; i++) { b.buyRescueKit(); out.push([b.progress.coins, b.progress.inv.rescues]); }
    return out;
  });
  expect(r).toEqual([[50, 3], [60, 3], [10, 6], [10, 6]]);   // SPEC-026: 50 coins for 3; the third time there are not enough coins
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => window.__bb.progress.inv.rescues)).toBe(6);
  const after = await page.evaluate(() => { const b = window.__bb; b.resetProgress(); b.resetProgress(); return b.progress.inv; });
  expect(after.rescues).toBe(0);
});

test("old saves get 0 kits", async ({ simPage: page }) => {
  const load = async save => {
    await page.evaluate(v => localStorage.setItem("bebebe-progress", JSON.stringify(v)), save);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true);
    return page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  };
  // a save from before SPEC-007 (worlds, kisses, no kits)
  const old = { worlds: { park: { unlocked: 4, stars: { 1: 3 } } }, lastWorld: "park", coins: 21, inv: { mittens: 2, mega: 1, kisses: 5 }, equip: ["mittens", "none"] };
  const p = await load(old);
  expect(p.inv).toEqual({ mittens: 2, mega: 1, kisses: 5, rescues: 0 });
  expect(p.coins).toBe(21);
  expect(p.worlds.park.unlocked).toBe(4);
  expect((await loadSave(page, { ...old, inv: { ...old.inv, rescues: "lots" } })).inv.rescues).toBe(0);   // broken data never throws
  expect((await loadSave(page, { ...old, inv: { ...old.inv, rescues: -2 } })).inv.rescues).toBe(0);
  expect((await loadSave(page, { ...old, inv: { ...old.inv, rescues: 2.7 } })).inv.rescues).toBe(2);
  expect((await loadSave(page, { ...old, inv: { ...old.inv, rescues: 4 } })).inv.rescues).toBe(4);
  expect((await loadSave(page, { ...old, inv: "junk" })).inv).toEqual({ mittens: 0, mega: 0, kisses: 0, rescues: 0 });
});

test("a kit gets a downed player up at once", async ({ simPage: page }) => {
  await downPlayer(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0], out = {};
    b.progress.inv.rescues = 2;
    const x0 = l.x, y0 = l.y;
    out.ok = b.useRescueKit(0);
    out.l = { state: l.state, invuln: l.invuln, rescue: l.rescue, downTimer: l.downTimer, restTimer: l.restTimer, path: l.path.length, moved: Math.hypot(l.x - x0, l.y - y0) };
    out.left = b.progress.inv.rescues;
    out.saved = JSON.parse(localStorage.getItem("bebebe-progress")).inv.rescues;
    out.texts = b.texts.map(q => q.text); out.want = b.I18N.en.kitUsed;
    out.kitInvuln = b.CFG.KIT_INVULN;
    out.again = b.useRescueKit(0);                       // already up: nothing happens, no kit spent
    out.left2 = b.progress.inv.rescues;
    return out;
  });
  expect(r.ok).toBe(true);
  expect(r.kitInvuln).toBe(2);
  expect(r.l).toEqual({ state: "ok", invuln: 2, rescue: 0, downTimer: 0, restTimer: 0, path: 0, moved: 0 });
  expect(r.left).toBe(1);
  expect(r.saved).toBe(1);
  expect(r.texts).toContain(r.want);
  expect(r.again).toBe(false);
  expect(r.left2).toBe(1);
  // bots never use kits; no kits — nothing happens
  const n = await page.evaluate(() => {
    const b = window.__bb, out = {};
    b.startGame(1);
    const bi = b.littles.findIndex(q => q.kind === "bot");
    Object.assign(b.littles[bi], { state: "down", downTimer: 10 });
    b.progress.inv.rescues = 2;
    out.bot = b.useRescueKit(bi); out.botState = b.littles[bi].state; out.left = b.progress.inv.rescues;
    Object.assign(b.littles[0], { state: "down", downTimer: 10 });
    b.progress.inv.rescues = 0;
    out.none = b.useRescueKit(0); out.noneState = b.littles[0].state; out.noneLeft = b.progress.inv.rescues;
    out.missing = b.useRescueKit(7);
    return out;
  });
  expect(n).toEqual({ bot: false, botState: "down", left: 2, none: false, noneState: "down", noneLeft: 0, missing: false });
});

test("a kit ends limping home", async ({ simPage: page }) => {
  await downPlayer(page, "home");
  const r = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0];
    b.progress.inv.rescues = 1;
    const x0 = l.x, y0 = l.y, ok = b.useRescueKit(0);
    const now = { ok, state: l.state, invuln: l.invuln, path: l.path.length, moved: Math.hypot(l.x - x0, l.y - y0), left: b.progress.inv.rescues, rests: b.stats.rests };
    window.__t.step(1);
    now.later = l.state; now.rests2 = b.stats.rests;
    return now;
  });
  expect(r).toEqual({ ok: true, state: "ok", invuln: 2, path: 0, moved: 0, left: 0, rests: 1, later: "ok", rests2: 1 });
});

test("a kit ends the rest", async ({ simPage: page }) => {
  await downPlayer(page, "rest");
  const r = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0];
    b.progress.inv.rescues = 3;
    const x0 = l.x, y0 = l.y, ok = b.useRescueKit(0);
    const now = { ok, state: l.state, invuln: l.invuln, restTimer: l.restTimer, moved: Math.hypot(l.x - x0, l.y - y0), left: b.progress.inv.rescues, rests: b.stats.rests, home: b.inSafe(l) };
    window.__t.step(0.5);
    now.later = l.state;
    return now;
  });
  // inside the house he simply walks out: up where he rested; the rest already counted stays counted
  expect(r).toEqual({ ok: true, state: "ok", invuln: 2, restTimer: 0, moved: 0, left: 2, rests: 1, home: true, later: "ok" });
});

test("a kit while down keeps the nobody-out star", async ({ simPage: page }) => {
  await downPlayer(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0];
    b.progress.inv.rescues = 1;
    b.useRescueKit(0);
    window.__t.step(12);                                   // longer than the down timer was: he is not sent home
    const out = { state: l.state, rests: b.stats.rests };
    b.giveReward(true);
    out.nobodyOut = b.lastReward.nobodyOut; out.penalty = b.lastReward.parts.some(p => p.reason === "rests"); out.stars = b.lastReward.stars;
    return out;
  });
  expect(r.state).toBe("ok");
  expect(r.rests).toBe(0);
  expect(r.nobodyOut).toBe(true);
  expect(r.penalty, "no rests line (SPEC-009)").toBe(false);
  expect(r.stars).toBeGreaterThanOrEqual(2);
});

test("kit keys for one and two players", async ({ page }) => {
  await installTestHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t, out = {};
    const press = code => { t.key(code, true); t.key(code, false); };
    const down = (...ids) => ids.forEach(i => Object.assign(b.littles[i], { state: "down", downTimer: 10, rescue: 0 }));
    out.pad = b.CFG.PAD_KIT;
    b.progress.inv.rescues = 20;
    t.calm(); t.pin([0]); down(0);
    press("ShiftRight"); out.shift1 = [b.littles[0].state, b.progress.inv.rescues];      // Right Shift is the key of player 2
    press("KeyQ"); out.q1 = [b.littles[0].state, b.progress.inv.rescues];
    press("KeyQ"); out.qOk = b.progress.inv.rescues;                                     // on his feet: nothing spent
    b.startGame(2); t.calm(); t.pin([0, 1]); down(0, 1);
    press("ShiftLeft"); out.shiftLeft = b.littles.slice(0, 2).map(l => l.state);
    press("ShiftRight"); out.shift2 = b.littles.slice(0, 2).map(l => l.state);
    press("KeyQ"); out.q2 = b.littles.slice(0, 2).map(l => l.state);
    out.left = b.progress.inv.rescues;
    down(0, 1);
    return out;
  });
  expect(r.pad).toBe(3);
  expect(r.shift1).toEqual(["down", 20]);
  expect(r.q1).toEqual(["ok", 19]);
  expect(r.qOk).toBe(19);
  expect(r.shiftLeft).toEqual(["down", "down"]);
  expect(r.shift2).toEqual(["down", "ok"]);
  expect(r.q2).toEqual(["ok", "ok"]);
  expect(r.left).toBe(17);
  // gamepad: button 3 (Y on Xbox, triangle on PlayStation); the second pad is player 2 in a two-player game
  await page.evaluate(() => {
    const pad = (i, on) => ({ index: i, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: on && k === 3, value: 0 })) });
    window.__pads = [pad(0, false), pad(1, true)];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  await page.waitForFunction(() => window.__bb.progress.inv.rescues === 16);
  expect(await page.evaluate(() => window.__bb.littles.slice(0, 2).map(l => l.state))).toEqual(["down", "ok"]);
  // one player: the first pad
  await page.evaluate(() => {
    const b = window.__bb; window.__pads = [];
    b.startGame(1); window.__t.calm(); window.__t.pin([0]);
    Object.assign(b.littles[0], { state: "down", downTimer: 10 });
  });
  await frames(page);
  await page.evaluate(() => { window.__pads = [{ index: 0, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: k === 3, value: 0 })) }]; });
  await page.waitForFunction(() => window.__bb.progress.inv.rescues === 15);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("ok");
  await page.evaluate(() => { window.__pads[0].buttons.forEach(btn => { btn.pressed = false; }); });   // shared page: release the pad
  await frames(page);
});

// pushes player 1 for real: the Big One right in front of him, looking at him
async function pushPlayer(page) {
  await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0];
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, slip: 0, blush: 0, hugCd: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", invuln: 0, dizzy: 0, hugAnim: 0, x: 535, y: 320, kx: 0, ky: 0 });
    for (let i = 0; i < 12 && l.state === "ok"; i++) b.update(1 / 60);
    Object.assign(b.big, { x: 900, y: 600, stun: 999 });
  });
  await frames(page);
}

test("the kit hint shows the first time a player goes down with kits, once per level", async ({ page }) => {
  await installTestHelpers(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.inv.rescues = 0; window.__t.pin([0]); });
  await pushPlayer(page);                                    // no kits: no hint (and the one hint is still to come)
  expect(await page.evaluate(() => [window.__bb.littles[0].state, window.__bb.kitHint])).toEqual(["down", null]);
  await page.evaluate(() => { const b = window.__bb; b.littles[0].state = "ok"; b.progress.inv.rescues = 2; });
  await pushPlayer(page);
  const h = await page.evaluate(() => ({ st: window.__bb.littles[0].state, hint: window.__bb.kitHint, want: window.__bb.I18N.en.kitHint }));
  expect(h.st).toBe("down");
  expect(h.hint && h.hint.text).toContain(h.want);
  await page.evaluate(() => window.__bb.useRescueKit(0));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.kitHint)).toBe(null);       // up again: the hint is gone
  await pushPlayer(page);
  expect(await page.evaluate(() => [window.__bb.littles[0].state, window.__bb.kitHint])).toEqual(["down", null]);   // once per level
  await page.evaluate(() => { window.__bb.startGame(1); window.__t.pin([0]); });
  await pushPlayer(page);
  expect(await page.evaluate(() => window.__bb.kitHint && window.__bb.kitHint.text)).toContain(h.want);   // a new level: again
  await step(page, (await page.evaluate(() => window.__bb.CFG.KIT_HINT_TIME)) + 0.1);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.kitHint)).toBe(null);       // and it is short
});

test.describe("rescue kit on a touch screen", () => {
  test.use({ hasTouch: true });

  test("the kit button shows only when it can be used", async ({ page }) => {
    await installTestHelpers(page);
    const ids = () => page.evaluate(() => window.__bb.buttonRects.filter(q => /^(kit|kiss):/.test(q.id)).map(q => ({ id: q.id, x: q.x, y: q.y, w: q.w, h: q.h })));
    await page.evaluate(() => { const b = window.__bb; b.progress.inv.kisses = 5; b.progress.inv.rescues = 2; window.__t.calm(); window.__t.pin([0]); });
    await frames(page);
    const ok = await ids();
    expect(ok.map(q => q.id)).toEqual(["kiss:0"]);                       // on his feet: the kiss button
    for (const st of ["down", "home", "rest"]) {
      await page.evaluate(s => { Object.assign(window.__bb.littles[0], { state: s, downTimer: 10, restTimer: 20, restSpot: { x: 500, y: 300 }, x: 500, y: 300 }); }, st);
      await frames(page);
      const q = await ids();
      expect(q.map(v => v.id), st).toEqual(["kit:0"]);                   // in the place of the kiss button
      expect([q[0].x, q[0].y, q[0].w, q[0].h], st).toEqual([ok[0].x, ok[0].y, ok[0].w, ok[0].h]);
    }
    // a bot lying down gets no button
    await page.evaluate(() => { const b = window.__bb; b.littles[0].state = "ok"; Object.assign(b.littles[3], { kind: "bot", state: "down", downTimer: 10 }); });
    await frames(page);
    expect((await ids()).map(q => q.id)).toEqual(["kiss:0"]);
    // a tap on it gets him up and never starts a joystick
    await page.evaluate(() => { Object.assign(window.__bb.littles[0], { state: "down", downTimer: 10, x: 500, y: 300 }); });
    await frames(page);
    const rect = (await ids())[0];
    const r = await page.evaluate(rc => {
      const b = window.__bb, c = document.getElementById("game"), bb = c.getBoundingClientRect(), l = b.littles[0];
      const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: bb.left + x * bb.width / 960, clientY: bb.top + y * bb.height / 640, pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      const cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2;
      ev("pointerdown", cx, cy);
      ev("pointermove", cx - 140, cy - 80);
      const out = { state: l.state, left: b.progress.inv.rescues, sticks: b.sticks.length };
      ev("pointerup", cx - 140, cy - 80);
      return out;
    }, rect);
    expect(r).toEqual({ state: "ok", left: 1, sticks: 0 });
    // no kits: no kit button (the kiss button stays)
    await page.evaluate(() => { const b = window.__bb; b.progress.inv.rescues = 0; Object.assign(b.littles[0], { state: "down", downTimer: 10 }); });
    await frames(page);
    expect((await ids()).map(q => q.id)).toEqual(["kiss:0"]);
    // two players: each on his own side, in the place of his kiss button
    await page.evaluate(() => {
      const b = window.__bb; b.startGame(2); window.__t.calm(); window.__t.pin([0, 1]);
      b.progress.inv.kisses = 5; b.progress.inv.rescues = 2;
      Object.assign(b.littles[0], { state: "down", downTimer: 10 });
    });
    await frames(page);
    const two = await ids();
    expect(two.map(q => q.id).sort()).toEqual(["kiss:1", "kit:0"]);
    const k0 = two.find(q => q.id === "kit:0"), k1 = two.find(q => q.id === "kiss:1");
    expect(k0.x + k0.w).toBeLessThan(960 / 2);
    expect(k1.x).toBeGreaterThan(960 / 2);
  });
});

// review fix 2: the double tap on the shared slot — the 💋 that appears there does not fire at once
test("a kit does not throw an air kiss right after", async ({ simPage: page }) => {
  await downPlayer(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[0], out = {};
    b.progress.inv.rescues = 1; b.progress.inv.kisses = 3;
    Object.assign(l, { x: 270, y: 48, dir: 0, kissCd: 0 });   // outside the house: kisses are allowed here
    out.used = b.useRescueKit(0);
    out.lock = b.CFG.KIT_SLOT_LOCK;
    out.kiss = b.throwKiss(0); out.kisses = b.progress.inv.kisses;
    return out;
  });
  expect(r).toEqual({ used: true, lock: 0.6, kiss: false, kisses: 3 });
  await step(page, 0.65);
  expect(await page.evaluate(() => [window.__bb.throwKiss(0), window.__bb.progress.inv.kisses])).toEqual([true, 2]);
});

test.describe("rescue kit while paused or winning", () => {
  test.use({ hasTouch: true });

  // review fix 1: one rule for the button, the hint and useRescueKit
  test("no kit while paused or while the win is coming", async ({ page }) => {
    await downPlayer(page);
    const kitButton = () => page.evaluate(() => window.__bb.buttonRects.some(q => q.id === "kit:0"));
    await page.evaluate(() => { window.__bb.progress.inv.rescues = 2; });
    await frames(page);
    expect(await kitButton()).toBe(true);                                    // in play: the button is there
    await page.evaluate(() => { window.__bb.mode = "pause"; });
    await frames(page);
    expect(await kitButton(), "paused: no button").toBe(false);
    expect(await page.evaluate(() => [window.__bb.useRescueKit(0), window.__bb.littles[0].state, window.__bb.progress.inv.rescues])).toEqual([false, "down", 2]);
    // two players: player 2 gives the last hug (pendingWin = HUG_ANIM), player 1 lies down
    await page.evaluate(() => {
      const b = window.__bb, t = window.__t;
      b.startGame(2); t.calm(); t.pin([0, 1]);
      b.progress.inv.rescues = 2;
      Object.assign(b.littles[0], { state: "down", downTimer: 10, x: 300, y: 500 });
      Object.assign(b.big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, x: 500, y: 320, dir: 0, hp: 1 });
      Object.assign(b.littles[1], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
      b.update(1 / 60);
    });
    const w = await page.evaluate(() => ({ hp: window.__bb.big.hp, mode: window.__bb.mode, used: window.__bb.useRescueKit(0), state: window.__bb.littles[0].state, left: window.__bb.progress.inv.rescues }));
    expect(w).toEqual({ hp: 0, mode: "play", used: false, state: "down", left: 2 });
    await frames(page);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.buttonRects.some(q => q.id === "kit:0")]), "win coming: no button").toEqual(["play", false]);
  });
});

// ---------- SPEC-019: tiptoe or the Big One hears running kids ----------
// In-page helpers: h.calm(p, dir) parks the Big One at p looking along dir (no spin: lookSign 0, nothing blocks him);
// h.open() finds a spot (Park 2, which they start) where every point 60/100/150 px around is free and in plain sight (no wall, safe house or his house);
// h.run(sec, i, spot, codes, each) holds the keys and puts Little One i back on spot before every frame (running in place;
// spot may be a function, each(frame) === false stops); h.speed(i, codes, spot) — his speed over 6 frames as a share of
// PLAYER_SPEED and isRunning; h.up() releases every key the helpers press.
async function installHearHelpers(page) {
  await installTestHelpers(page);
  await page.evaluate(() => {
    const b = window.__bb, t = window.__t, g = b.grid, C = b.CFG;
    b.level = 2; b.startGame(1);                                   // Park 2 (meadow): open ground 150 px around a spot
    const CODES = ["KeyD", "KeyS", "KeyA", "KeyW", "ArrowRight", "ArrowDown", "ShiftLeft", "ShiftRight", "ControlRight", "ControlLeft"];
    const free = (x, y) => !g.seeSolid(x, y) && !g.blocked[((y / g.CELL) | 0) * g.COLS + ((x / g.CELL) | 0)] && !b.inSafe({ x, y }) && !b.inDanger({ x, y });
    const clear = (a, q) => { const n = Math.ceil(Math.hypot(q.x - a.x, q.y - a.y) / 4); for (let i = 0; i <= n; i++) if (!free(a.x + (q.x - a.x) * i / n, a.y + (q.y - a.y) * i / n)) return false; return true; };
    window.__h = {
      CODES, free, clear,
      calm(p, dir = 0) { Object.assign(b.big, { x: p.x, y: p.y, dir, state: "look", timer: 9999, lookSign: 0, stun: 0, slip: 0, blush: 0, noPush: 0, pushCd: 0, hugCd: 0, noise: 0, hearCd: 0, path: [] }); },
      open() {
        for (let cy = 5; cy < g.ROWS - 5; cy++) for (let cx = 5; cx < g.COLS - 5; cx++) {
          const p = { x: (cx + 0.5) * g.CELL, y: (cy + 0.5) * g.CELL };
          let ok = free(p.x, p.y);
          for (const r of [60, 100, 150]) for (let k = 0; k < 16 && ok; k++) ok = clear(p, { x: p.x + Math.cos(k * Math.PI / 8) * r, y: p.y + Math.sin(k * Math.PI / 8) * r });
          if (ok) return p;
        }
        return null;
      },
      key: t.key,
      up() { for (const c of CODES) t.key(c, false); },
      run(sec, i, spot, codes = ["KeyS"], each) {
        const l = b.littles[i];
        for (const c of codes) t.key(c, true);
        for (let f = 0; f < Math.round(sec * 60); f++) {
          if (spot) Object.assign(l, typeof spot === "function" ? spot() : spot, { kx: 0, ky: 0 });
          b.update(1 / 60);
          if (each && each(f) === false) break;
        }
        for (const c of codes) t.key(c, false);
      },
      speed(i, codes, spot, n = 6) {
        const l = b.littles[i];
        Object.assign(l, spot, { kx: 0, ky: 0, state: "ok", hugAnim: 0, dizzy: 0 });
        for (const c of codes) t.key(c, true);
        const x0 = l.x, y0 = l.y;
        for (let f = 0; f < n; f++) b.update(1 / 60);
        const run = b.isRunning(i);
        for (const c of codes) t.key(c, false);
        return { share: +(Math.hypot(l.x - x0, l.y - y0) / (C.PLAYER_SPEED * n / 60)).toFixed(3), run };
      }
    };
  });
}

test("tiptoe with Shift, stick tilt and gamepad", { tag: "@fast" }, async ({ page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, t = window.__t, C = b.CFG, out = {};
    const spot = h.open();
    h.calm({ x: 900, y: 600 }); b.big.noPush = 999; b.big.stun = 999; t.pin([0]);
    out.max = C.TIPTOE_MAX; out.mult = C.TIPTOE_MULT;
    out.full1 = h.speed(0, ["KeyD"], spot);
    out.shiftL1 = h.speed(0, ["KeyD", "ShiftLeft"], spot);
    out.shiftR1 = h.speed(0, ["KeyD", "ShiftRight"], spot);
    out.arrowShift1 = h.speed(0, ["ArrowRight", "ShiftRight"], spot);
    b.littles[0].fx.boots = 5;
    out.boots = h.speed(0, ["KeyD"], spot);
    out.bootsTip = h.speed(0, ["KeyD", "ShiftLeft"], spot);
    b.littles[0].fx.boots = 0;
    Object.assign(b.littles[0], spot); h.key("ShiftLeft", true); b.update(1 / 60); h.key("ShiftLeft", false);
    out.still = b.isRunning(0);
    // two players: P1 left Shift, P2 "/" (Slash); right Shift stays P2's kit key and Ctrl tiptoes nobody (no browser shortcuts)
    b.startGame(2); h.calm({ x: 900, y: 600 }); b.big.noPush = 999; b.big.stun = 999; t.pin([0, 1]);
    out.p1ShiftL = h.speed(0, ["KeyD", "ShiftLeft"], spot);
    out.p1ShiftR = h.speed(0, ["KeyD", "ShiftRight"], spot);
    out.p1CtrlR = h.speed(0, ["KeyD", "ControlRight"], spot);
    out.p1Slash = h.speed(0, ["KeyD", "Slash"], spot);
    Object.assign(b.littles[0], { x: 860, y: 40 });                 // out of player 2's way
    out.p2Slash = h.speed(1, ["ArrowRight", "Slash"], spot);
    out.p2CtrlR = h.speed(1, ["ArrowRight", "ControlRight"], spot);
    out.p2ShiftR = h.speed(1, ["ArrowRight", "ShiftRight"], spot);
    out.p2ShiftL = h.speed(1, ["ArrowRight", "ShiftLeft"], spot);
    b.progress.inv.rescues = 1;
    Object.assign(b.littles[1], { state: "down", downTimer: 10 });
    h.key("ShiftRight", true); h.key("ShiftRight", false);
    out.kit2 = [b.littles[1].state, b.progress.inv.rescues];
    out.bots = b.littles.map((l, i) => typeof b.isRunning(i));
    h.up();
    return out;
  });
  expect(r.mult).toBeGreaterThanOrEqual(0.5);                       // the CFG values themselves: invariants.spec.js
  expect(r.mult).toBeLessThan(r.max);
  expect(r.full1).toEqual({ share: 1, run: true });
  const soft = softly();
  for (const k of ["shiftL1", "shiftR1", "arrowShift1", "p1ShiftL", "p2Slash"]) soft(r[k], k).toEqual({ share: r.mult, run: false });
  for (const k of ["p1ShiftR", "p1CtrlR", "p1Slash", "p2ShiftR", "p2ShiftL", "p2CtrlR"]) soft(r[k], k).toEqual({ share: 1, run: true });
  soft.done();
  expect(r.boots).toEqual({ share: 1.55, run: true });
  expect(r.bootsTip.share).toBeCloseTo(r.mult * 1.55, 2);           // tiptoe = TIPTOE_MULT × boots speed, silent
  expect(r.bootsTip.run).toBe(false);
  expect(r.still).toBe(false);
  expect(r.kit2).toEqual(["ok", 0]);
  expect(r.bots).toEqual(Array(5).fill("boolean"));
  // gamepad: a small tilt (0.4 < TIPTOE_MAX) tiptoes at a share of the tiptoe speed, a full one (0.95) runs
  const pad = async ax => {
    await page.evaluate(a => {
      const b = window.__bb; b.startGame(1); window.__h.calm({ x: 900, y: 600 }); b.big.noPush = 999; b.big.stun = 999; window.__t.pin([0]);
      window.__pads = [{ index: 0, axes: [a, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }];
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
    }, ax);
    await frames(page);
    return page.evaluate(() => window.__h.speed(0, [], window.__h.open()));
  };
  expect(await pad(0.4)).toEqual({ share: +(r.mult * 0.4 / r.max).toFixed(3), run: false });
  expect(await pad(0.95)).toEqual({ share: 0.95, run: true });
  await page.evaluate(() => { window.__pads = []; });
  await frames(page);
});

test.describe("tiptoe on a touch screen", () => {
  test.use({ hasTouch: true });

  test("tiptoe with a small push on the touch stick, and the stick shows the tiptoe ring", async ({ page }) => {
    await installHearHelpers(page);
    const r = await page.evaluate(() => {
      const b = window.__bb, h = window.__h, c = document.getElementById("game"), bb = c.getBoundingClientRect();
      const spot = h.open();
      h.calm({ x: 900, y: 600 }); b.big.noPush = 999; b.big.stun = 999; window.__t.pin([0]);
      const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: bb.left + x * bb.width / 960, clientY: bb.top + y * bb.height / 640, pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
      const R = b.stickR(), out = { R, mult: b.CFG.TIPTOE_MULT, max: b.CFG.TIPTOE_MAX };
      ev("pointerdown", 300, 400);
      ev("pointermove", 300 + 0.4 * R, 400); out.small = h.speed(0, [], spot);
      ev("pointermove", 300 + 0.95 * R, 400); out.big = h.speed(0, [], spot);
      return out;
    });
    expect(r.small).toEqual({ share: +(r.mult * 0.4 / r.max).toFixed(3), run: false });
    expect(r.big).toEqual({ share: 0.95, run: true });
    await frames(page);
    const marks = await page.evaluate(() => window.__bb.stickMarks);
    expect(marks.length).toBe(1);
    expect(marks[0].ring).toBeCloseTo(marks[0].R * r.max, 5);              // the inner ring at TIPTOE_MAX of the radius
    await page.evaluate(() => {
      const c = document.getElementById("game");
      c.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 0, pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
    });
  });
});

test("the Big One turns when a kid runs behind him", { tag: "@fast" }, async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, C = b.CFG, big = b.big, out = {};
    const p = h.open(), behind = { x: p.x - 100, y: p.y };
    out.cfg = [C.HEAR_RADIUS, C.NOISE_RATE, C.NOISE_DECAY, C.NOISE_TURN, C.NOISE_WARN, C.HEAR_WALL, C.HEAR_TURN_TIME, C.HEAR_COOLDOWN, C.HEAR_LOOK];
    window.__t.pin([0]);
    // noPush: he does not chase anyone (💦 above him), but he still hears (only the push stand blocks hearing)
    h.calm(p, 0); big.noPush = 999;
    const fr = C.NOISE_WARN / C.NOISE_RATE * 60, early = Math.floor(fr) - 1, warn = Math.ceil(fr) + 1;   // frames: just under / over 👂
    h.run(early / 60, 0, behind);
    out.early = { noise: +big.noise.toFixed(3), mark: b.bigMark, cd: big.hearCd, want: early / 60 * C.NOISE_RATE };
    h.run((warn - early) / 60, 0, behind);
    out.warn = { noise: +big.noise.toFixed(3), mark: b.bigMark, dir: big.dir, want: warn / 60 * C.NOISE_RATE };
    let at = 0;
    h.run(1, 0, behind, ["KeyS"], f => { if (big.hearCd > 0) { at = (warn + f + 1) / 60; return false; } });
    out.turn = { at: +at.toFixed(3), noise: big.noise, cd: big.hearCd, state: big.state, mark: b.bigMark, want: C.NOISE_TURN / C.NOISE_RATE, cdWant: C.HEAR_COOLDOWN };
    const face = Math.atan2(behind.y - p.y, behind.x - p.x), off = () => Math.abs(Math.atan2(Math.sin(big.dir - face), Math.cos(big.dir - face)));
    const tf = Math.round(C.HEAR_TURN_TIME * 60);                  // frames of the turn
    for (let i = 0; i < Math.floor(tf / 2) - 1; i++) b.update(1 / 60);
    out.half = off();
    for (let i = 0; i < tf; i++) b.update(1 / 60);
    out.done = off();
    big.lookSign = 1;                                              // holds that way (no spin) for HEAR_LOOK seconds
    const d0 = big.dir;
    for (let i = 0; i < 40; i++) b.update(1 / 60);
    out.hold = { moved: Math.abs(big.dir - d0), state: big.state, mark: b.bigMark };
    // outside the cone only: running in front of him is never noise
    h.calm(p, 0); big.noPush = 999;
    h.run(1, 0, { x: p.x + 100, y: p.y + 40 });
    out.front = big.noise;
    // the radius: 5 cells
    h.calm(p, 0); big.noPush = 999;
    const short = Math.floor(C.NOISE_TURN / C.NOISE_RATE * 60 * 0.7) / 60;   // runs that stay under the turn
    h.run(short, 0, { x: p.x - C.HEAR_RADIUS * b.grid.CELL - 8, y: p.y });
    out.far = big.noise;
    h.calm(p, 0); big.noPush = 999;
    h.run(short, 0, { x: p.x - C.HEAR_RADIUS * b.grid.CELL + 8, y: p.y });
    out.near = { noise: +big.noise.toFixed(3), want: short * C.NOISE_RATE };
    // decay only when nobody makes noise
    h.calm(p, 0); big.noPush = 999;
    h.run(short, 0, behind);
    Object.assign(b.littles[0], behind);
    for (let i = 0; i < 6; i++) b.update(1 / 60);
    out.decay = { noise: +big.noise.toFixed(3), want: short * C.NOISE_RATE - C.NOISE_DECAY * 0.1 };
    h.up();
    return out;
  });
  const [rad, rate, decay, turn, warn, wall, turnTime, cd, look] = r.cfg;
  expect([rad, rate, wall, look]).toEqual([5, 1, 0.5, [1, 1.5]]);   // as in the spec (the others were tuned by the balance run)
  expect(cd).toBeGreaterThan(turnTime);
  expect(warn).toBeLessThan(turn);
  expect(decay).toBeGreaterThan(0);
  expect(turnTime).toBeGreaterThan(0);
  expect(r.early.noise).toBeCloseTo(r.early.want, 2);
  expect(r.early.mark).toBe("💦");                                  // resting after a push (noPush), no ear yet
  expect(r.early.cd).toBe(0);
  expect(r.warn.noise).toBeCloseTo(r.warn.want, 2);
  expect(r.warn.mark).toBe("👂");                                  // a fair warning at 0.3
  expect(r.warn.dir).toBe(0);                                       // not turned yet
  expect(Math.abs(r.turn.at - r.turn.want)).toBeLessThan(0.04);     // NOISE_TURN / NOISE_RATE seconds of running
  expect(r.turn).toMatchObject({ noise: 0, cd: r.turn.cdWant, state: "look", mark: "❓" });
  expect(r.half).toBeGreaterThan(0.5);                              // turning over HEAR_TURN_TIME, not at once
  expect(r.done).toBeLessThan(0.05);                                // faces the runner (where he was that frame: 2.5 px further down)
  expect(r.hold.moved).toBeLessThan(1e-9);
  expect(r.hold.state).toBe("look");
  expect(r.hold.mark).toBe("❓");
  expect(r.front).toBe(0);
  expect(r.far).toBe(0);
  expect(r.near.noise).toBeCloseTo(r.near.want, 2);
  expect(r.decay.noise).toBeCloseTo(r.decay.want, 2);
});

test("tiptoeing behind him is silent", async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, big = b.big, l = b.littles[0], out = {};
    const p = h.open(), behind = { x: p.x - 100, y: p.y };
    window.__t.pin([0]);
    h.calm(p, 0); big.noPush = 999;
    h.run(2, 0, behind, ["KeyS", "ShiftLeft"]);
    out.tiptoe = [big.noise, big.hearCd, big.dir];
    l.fx.cloak = 5;                                                 // invisible: silent too
    h.calm(p, 0); big.noPush = 999;
    h.run(1, 0, behind);
    out.cloak = big.noise;
    l.fx.cloak = 0;
    // in the safe house: silent (the Big One right outside it, looking away)
    const z = b.safeZone, inside = { x: z.x + z.w / 2, y: z.y + z.h / 2 };
    let outside = null;
    for (const rr of [70, 100, 130]) for (let k = 0; k < 32 && !outside; k++) {
      const q = { x: inside.x + Math.cos(k * Math.PI / 16) * rr, y: inside.y + Math.sin(k * Math.PI / 16) * rr };
      if (h.free(q.x, q.y)) outside = q;
    }
    h.calm(outside, Math.atan2(outside.y - inside.y, outside.x - inside.x)); big.noPush = 999;
    h.run(1, 0, inside);
    out.safe = big.noise;
    // through a wall: half the noise
    let wall = null;
    const c = b.grid.CELL;
    for (let cy = 2; cy < b.grid.ROWS - 2 && !wall; cy++) for (let cx = 3; cx < b.grid.COLS - 3 && !wall; cx++) {
      const a = { x: (cx - 1.5) * c, y: (cy + 0.5) * c }, q = { x: (cx + 2.5) * c, y: (cy + 0.5) * c };
      if (b.grid.seeSolid((cx + 0.5) * c, (cy + 0.5) * c) && h.free(a.x, a.y) && h.free(q.x, q.y)) wall = { a, q };
    }
    h.calm(wall.a, Math.PI); big.noPush = 999;                     // looks away from the wall, the kid runs on the other side
    const wt = Math.floor(b.CFG.NOISE_TURN / b.CFG.NOISE_RATE * 60) / 60;   // at full rate this would turn him; through the wall it is half
    h.run(wt, 0, wall.q);
    out.wall = { noise: +big.noise.toFixed(3), want: wt * b.CFG.NOISE_RATE * b.CFG.HEAR_WALL, cd: big.hearCd };
    // a hug from behind after tiptoeing works as before
    h.calm(p, 0);
    Object.assign(l, { x: p.x - 90, y: p.y, hugCd: 0, invuln: 0 });
    const hp0 = big.hp;
    h.run(1.5, 0, null, ["KeyD", "ShiftLeft"], () => big.hp === hp0);
    out.hug = [hp0 - big.hp, big.hearCd];
    h.up();
    return out;
  });
  expect(r.tiptoe).toEqual([0, 0, 0]);
  expect(r.cloak).toBe(0);
  expect(r.safe).toBe(0);
  expect(r.wall.noise).toBeCloseTo(r.wall.want, 2);
  expect(r.wall.cd).toBe(0);
  expect(r.hug).toEqual([1, 0]);
});

test("no hearing while stunned or blushing", async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, out = {};
    let big = b.big;
    const p = h.open(), behind = { x: p.x - 100, y: p.y };
    window.__t.pin([0]);
    for (const [k, v] of [["stun", 2], ["blush", 1.5], ["slip", 2], ["pushCd", 0.9]]) {
      h.calm(p, 0); big.noise = 0.5; big[k] = v;
      h.run(0.5, 0, behind);
      out[k] = [big.noise, big.hearCd];
    }
    // searching for the kid he just lost: he still hears (run decision, SPEC-019 AC 5 balance)
    h.calm(p, 0);
    Object.assign(big, { state: "search", lastSeen: { x: p.x + 150, y: p.y } });
    let searched = 0;
    h.run(0.5, 0, () => ({ x: big.x - Math.cos(big.dir) * 100, y: big.y - Math.sin(big.dir) * 100 }), ["KeyS"], () => big.state === "search" && ++searched > 0);
    out.search = big.hearCd > 0;                                  // he turned on the noise
    out.searched = searched;
    // the final hug: player 1 hugs the last heart, player 2 runs behind him while the win is coming
    b.startGame(2); window.__t.pin([0, 1]); big = b.big;
    h.calm(p, 0); big.hp = 1;
    Object.assign(b.littles[0], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, x: p.x - 34, y: p.y });
    b.update(1 / 60);
    out.winComing = big.hp === 0 && b.mode === "play";
    h.run(0.6, 1, behind, ["ArrowDown"], () => b.mode === "play");
    out.final = [big.noise, big.hearCd];
    h.up();
    return out;
  });
  const soft = softly();
  for (const k of ["stun", "blush", "slip", "pushCd"]) soft(r[k], k).toEqual([0, 0]);
  soft.done();
  expect(r.search, "he hears while searching").toBe(true);
  expect(r.searched).toBeGreaterThan(10);                          // he was searching while the kid ran
  expect(r.winComing).toBe(true);
  expect(r.final).toEqual([0, 0]);
});

test("cooldown after a turn", async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, big = b.big, turns = [];
    const p = h.open();
    window.__t.pin([0]);
    h.calm(p, 0); big.noPush = 999;
    let last = 0;
    // the kid keeps running behind him (behind his current facing) long enough for two turns
    const C = b.CFG, first = C.NOISE_TURN / C.NOISE_RATE, total = first + C.HEAR_COOLDOWN + first + 0.5;
    h.run(total, 0, () => ({ x: big.x - Math.cos(big.dir) * 100, y: big.y - Math.sin(big.dir) * 100 }), ["KeyS"], f => {
      if (big.hearCd > last + 1e-9) turns.push(+((f + 1) / 60).toFixed(3));
      last = big.hearCd;
    });
    h.up();
    return { turns, first, cd: C.HEAR_COOLDOWN };
  });
  const gap = r.cd + r.first;                                       // the cooldown from the turn, then the noise again
  expect(r.turns.length).toBe(2);
  expect(Math.abs(r.turns[0] - r.first)).toBeLessThan(0.04);
  expect(r.turns[1] - r.turns[0]).toBeGreaterThanOrEqual(gap - 0.05);
  expect(r.turns[1] - r.turns[0]).toBeLessThan(gap + 0.1);
});

test("noise turn leads to a chase", async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, big = b.big, l = b.littles[0], out = {};
    const p = h.open(), behind = { x: p.x - 120, y: p.y };
    window.__t.pin([0]);
    h.calm(p, 0);
    h.run(1, 0, behind, ["KeyS"], () => big.hearCd <= 0);          // runs until he hears
    out.heard = big.hearCd > 0;
    Object.assign(l, behind, { kx: 0, ky: 0 });
    for (let i = 0; i < 40 && big.state !== "chase"; i++) b.update(1 / 60);
    out.chase = big.state;
    for (let i = 0; i < 240 && l.state === "ok"; i++) b.update(1 / 60);
    out.pushed = l.state;
    h.up();
    return out;
  });
  expect(r).toEqual({ heard: true, chase: "chase", pushed: "down" });
});

test("the heard hint shows once per level, only for players", async ({ page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, I = b.I18N.en, out = {};
    let big = b.big;
    const p = h.open();
    // a bot running behind him (to rescue a friend) makes him turn: no hint
    window.__t.pin([1, 2]);
    h.calm(p, 0); big.noPush = 999;
    Object.assign(b.littles[1], { kind: "bot", state: "ok", x: p.x - 100, y: p.y - 70 });
    Object.assign(b.littles[2], { kind: "bot", state: "down", downTimer: 15, botWait: 0, x: p.x - 100, y: p.y + 90 });
    for (let i = 0; i < 90 && big.hearCd <= 0; i++) b.update(1 / 60);
    out.bot = [big.hearCd > 0, b.heardHint];
    // a player: the hint with his key (one player: Shift)
    b.startGame(1); window.__t.pin([0]); big = b.big;
    h.calm(p, 0); big.noPush = 999;
    h.run(1, 0, { x: p.x - 100, y: p.y }, ["KeyS"], () => big.hearCd <= 0);
    out.p1 = b.heardHint && b.heardHint.text;
    // once per level: the next turn shows nothing
    b.update(b.CFG.HEAR_HINT_TIME + 0.1);
    out.gone = b.heardHint;
    h.calm(p, 0); big.noPush = 999;
    h.run(1, 0, { x: p.x - 100, y: p.y }, ["KeyS"], () => big.hearCd <= 0);
    out.again = [big.hearCd > 0, b.heardHint];
    // two players: player 2's key is right Ctrl
    b.startGame(2); window.__t.pin([0, 1]); big = b.big;
    h.calm(p, 0); big.noPush = 999;
    h.run(1, 1, { x: p.x - 100, y: p.y }, ["ArrowDown"], () => big.hearCd <= 0);
    out.p2 = b.heardHint && b.heardHint.text;
    out.want = [I.heardHint(I.heardKey1), I.heardHint(I.heardKey2)];
    h.up();
    return out;
  });
  expect(r.bot).toEqual([true, null]);
  expect(r.p1).toBe(r.want[0]);
  expect(r.gone).toBe(null);
  expect(r.again).toEqual([true, null]);
  expect(r.p2).toBe(r.want[1]);
});

// SPEC-019 AC 4: bots sneaking up (attack) or waiting near him (lurk) tiptoe within HEAR_RADIUS + 1 cells; fleeing and
// rescuing bots run (even near him); far away they move as before
test("bots tiptoe near the Big One", async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, C = b.CFG, near = (C.HEAR_RADIUS + C.TIPTOE_NEAR) * b.grid.CELL, hear = C.HEAR_RADIUS * b.grid.CELL, out = { bad: [], seen: {} };
    const p = h.open();
    const watch = (sec, label) => {
      for (let f = 0; f < Math.round(sec * 60); f++) {
        b.update(1 / 60);
        b.littles.forEach((l, i) => {
          if (l.kind !== "bot" || !l.moving || l.state !== "ok") return;
          const d = Math.hypot(l.x - b.big.x, l.y - b.big.y), close = d <= near, key = `${l.task}:${close ? "near" : "far"}`;
          if (Math.abs(d - near) < 5 || Math.abs(d - hear) < 5) return;   // it decided before this frame's step (≤ 3.5 px)
          out.seen[key] = (out.seen[key] || 0) + 1;
          const want = { attack: close ? C.TIPTOE_MULT : 1, lurk: d <= hear ? C.TIPTOE_MULT : C.BOT_LURK_MULT, flee: 1, rescue: 1 }[l.task];
          if (want !== undefined && Math.abs(l.speedFrac - want) > 1e-9 && out.bad.length < 5) out.bad.push(`${label} bot ${i} ${key} frac ${l.speedFrac}`);
          if (want !== undefined && b.isRunning(i) !== (want >= C.TIPTOE_MAX) && out.bad.length < 5) out.bad.push(`${label} bot ${i} ${key} running ${b.isRunning(i)}`);
        });
      }
    };
    // calm (resting after a push: he sees nobody, nobody flees): the bots wait behind him and take turns sneaking up
    b.seedRandom(19);
    b.littles[0].x = b.safeZone.x + b.safeZone.w / 2; b.littles[0].y = b.safeZone.y + b.safeZone.h / 2;
    h.calm(p, 0); b.big.noPush = 999; b.big.hugCd = 999;               // no hugs: they keep trying
    watch(20, "calm");
    // he looks at a bot close by: it flees, running
    h.calm(p, 0);
    Object.assign(b.littles[1], { state: "ok", x: p.x + 90, y: p.y, fleeT: 0, invuln: 99 });
    watch(0.5, "flee");
    // a downed friend right behind him: the rescuer runs
    h.calm(p, 0); b.big.noPush = 999;
    Object.assign(b.littles[2], { state: "down", downTimer: 15, botWait: 0, rescue: 0, x: p.x - 60, y: p.y });
    watch(3, "rescue");
    b.seedRandom();
    return out;
  });
  expect(r.bad).toEqual([]);
  const soft = softly();
  for (const k of ["attack:near", "lurk:near", "flee:near", "rescue:near"]) soft(r.seen[k] || 0, `${k} frames ${JSON.stringify(r.seen)}`).toBeGreaterThan(0);
  soft.done();
});

// SPEC-019: the careful autopilot tiptoes behind or beside him within HEAR_RADIUS + 1 cells while he can hear; in front of him,
// far away or while he is stunned it runs; the reckless one always runs. Only through its stick (autoMove).
test("the careful autopilot tiptoes near his back, the reckless one runs", async ({ simPage: page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, h = window.__h, C = b.CFG, out = {};
    const p = h.open(), l = b.littles[0];
    window.__t.pin([0]);
    const len = (style, spot, setup) => {
      b.autopilot(true, style);
      h.calm(p, 0); if (setup) setup();
      Object.assign(l, spot, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, dizzy: 0 });
      b.autoThink(1 / 60);
      const st = b.autoStick(0), m = st ? Math.hypot(st.x, st.y) : 0;
      b.autopilot(false);
      return +m.toFixed(3);
    };
    out.behind = len("careful", { x: p.x - 150, y: p.y });
    out.side = len("careful", { x: p.x, y: p.y + 150 });
    out.far = len("careful", { x: p.x - 150, y: p.y }, () => { b.big.x += 60; });   // 210 px > 6 cells
    out.front = len("careful", { x: p.x + 150, y: p.y });
    out.stunned = len("careful", { x: p.x - 150, y: p.y }, () => { b.big.stun = 2; });
    out.reckless = len("reckless", { x: p.x - 150, y: p.y });
    out.mult = C.TIPTOE_MULT;
    return out;
  });
  expect(r.behind).toBeLessThanOrEqual(r.mult);
  expect(r.behind).toBeGreaterThan(0);
  expect(r.side).toBeLessThanOrEqual(r.mult);
  expect(r.side).toBeGreaterThan(0);
  const soft = softly();
  for (const k of ["far", "front", "stunned", "reckless"]) soft(r[k], k).toBe(1);
  soft.done();
});

// SPEC-019 AC 7: the "tap-tap" lines at the feet of a kid he can hear (running near him, out of his view); none on tiptoe
test("tap-tap lines show at the feet of a kid running near him, not on tiptoe", async ({ page }) => {
  await installHearHelpers(page);
  const r = await page.evaluate(async () => {
    const b = window.__bb, h = window.__h, out = {};
    const p = h.open(), l = b.littles[0];
    window.__t.pin([0]);
    const look = async codes => {
      h.calm(p, 0); b.big.noPush = 999;
      Object.assign(l, { x: p.x - 100, y: p.y, kx: 0, ky: 0 });
      for (const c of codes) h.key(c, true);
      for (let i = 0; i < 5; i++) b.update(1 / 60);
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const lines = b.tapLines;
      h.up();
      return lines;
    };
    out.run = await look(["KeyS"]);
    out.tiptoe = await look(["KeyS", "ShiftLeft"]);
    out.still = await look([]);
    return out;
  });
  expect(r.run).toEqual([0]);
  expect(r.tiptoe).toEqual([]);
  expect(r.still).toEqual([]);
});
