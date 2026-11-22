// Gameplay rules decided by the kids (see docs/game-design.md). Each test pins one rule.
const { test, expect } = require("@playwright/test");
const { openGame, step, setupHug, frames } = require("./helpers");

test.beforeEach(async ({ page }) => {
  page.errors = await openGame(page);
  await page.evaluate(() => { window.__bb.world = "park"; window.__bb.level = 1; window.__bb.startGame(1); });
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test("a hug from behind takes one heart and shocks the Big One", async ({ page }) => {
  const hp0 = await page.evaluate(() => window.__bb.big.hp);
  await setupHug(page);
  await step(page, 0.1);
  const s = await page.evaluate(() => ({ hp: window.__bb.big.hp, stun: window.__bb.big.stun, anim: window.__bb.littles[0].hugAnim }));
  expect(s.hp).toBe(hp0 - 1);
  expect(s.stun).toBeGreaterThan(2);       // HUG_STUN 2.5 s
  expect(s.anim).toBeGreaterThan(0);       // jumps on the back
});

test("seen from the front, a Little One is pushed and breaks a leg", async ({ page }) => {
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

test("rescue takes 3 seconds and drains when the helper leaves", async ({ page }) => {
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

test("pushing the helper resets the rescue", async ({ page }) => {
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

test("bots wait before they go to rescue", async ({ page }) => {
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

test("not rescued in time: limps home, rests 2 minutes, comes back", async ({ page }) => {
  await page.evaluate(() => {
    const L = window.__bb.littles; Object.assign(window.__bb.big, { x: 900, y: 600, state: "look", timer: 9999 });
    Object.assign(L[0], { state: "down", downTimer: 0.05, x: 500, y: 300 });
  });
  await step(page, 0.2);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("home");
  await step(page, 25);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("rest");
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");          // no game over
  await step(page, 121);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("ok");
  expect(await page.evaluate(() => window.__bb.stats.rests)).toBeGreaterThanOrEqual(1);
});

test("winning gives stars and coins, unlocks the next level and survives a reload", async ({ page }) => {
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 1.5);
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
});

// ---------- SPEC-006: worlds, rewards, the end of a world ----------
// a win of the running level through a real hug (the Big One on his last heart)
async function winLevel(page) {
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 1.5);
}

test("worlds unlock their own levels", async ({ page }) => {
  const start = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  expect(Object.keys(start.worlds)).toEqual(["park", "school", "beach", "winter"]);
  for (const w of Object.keys(start.worlds)) expect(start.worlds[w], w).toEqual({ unlocked: 1, stars: {} });   // every world open from the start
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
  for (const w of ["park", "beach", "winter"]) expect(p.progress.worlds[w], w).toEqual({ unlocked: 1, stars: {} });
  expect(p.progress.lastWorld).toBe("school");
  expect([p.world, p.level]).toEqual(["school", 2]);   // the menu opens on the last world, at its newest level
  // the menu's level arrows move inside the current world's open levels
  const arrows = await page.evaluate(() => {
    const b = window.__bb; b.world = "beach"; b.level = 1; b.mode = "menu";
    b.progress.worlds.beach.unlocked = 3;
    const out = [];
    for (let i = 0; i < 4; i++) { b.changeLevel(1); out.push(b.level); }
    return out;
  });
  expect(arrows).toEqual([2, 3, 3, 3]);
});

test("the reward grows with the world", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    const win = (w, n, st) => { b.world = w; b.level = n; b.startGame(1); Object.assign(b.stats, st); b.giveReward(true); return { ...b.lastReward }; };
    const quick = { time: 10, rests: 0, playerHugs: 2, starCoins: 3 };
    out.park = win("park", 5, quick); out.winter = win("winter", 5, quick);
    // 150 s: too slow for Park 5 (135 s), still fast in Winter 5 (165 s)
    out.parkSlow = win("park", 5, { ...quick, time: 150 }); out.winterSlow = win("winter", 5, { ...quick, time: 150 });
    // many rests: the floor, then the star coins on top
    out.floor = win("winter", 5, { ...quick, rests: 30 });
    out.cfg = { perWorld: b.CFG.COINS_PER_WORLD, fastPerWorld: b.CFG.FAST_PER_WORLD };
    return out;
  });
  expect(r.cfg).toEqual({ perWorld: 10, fastPerWorld: 10 });
  // COINS_WIN 10 + 5 × 5 + nobody out 10 + fast 10 + 2 hugs × 2 = 59 (+ w × 10), then + 3 star coins
  expect(r.park.coins).toBe(59 + 3);
  expect(r.winter.coins).toBe(59 + 30 + 3);
  expect(r.winter.coins - r.park.coins).toBe(30);
  expect([r.park.target, r.winter.target]).toEqual([135, 165]);   // FAST_TIME(n) + w × 10 s
  expect([r.parkSlow.fast, r.winterSlow.fast]).toEqual([false, true]);
  expect(r.winterSlow.coins - r.parkSlow.coins).toBe(30 + 10);   // the world bonus and the fast bonus
  expect(r.floor.coins).toBe(5 + 3);                              // COINS_MIN_WIN + star coins
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
  // level 20: the world is done, the win screen offers the menu instead of a next level
  await page.evaluate(() => { const b = window.__bb; b.progress.worlds.school.unlocked = 20; b.level = 20; b.startGame(1); });
  await winLevel(page);
  await frames(page);
  const end = await page.evaluate(() => ({ mode: window.__bb.mode, buttons: window.__bb.buttonNames, line: window.__bb.winLine, reward: window.__bb.lastReward, unlocked: window.__bb.progress.worlds.school.unlocked }));
  expect(end.mode).toBe("win");
  expect(end.reward.worldDone).toBe(true);
  expect(end.line).toBe("You finished the School!");
  expect(end.buttons).not.toContain("nextLevel");
  expect(end.buttons).toContain("toMenu");
  expect(end.unlocked).toBe(20);
  // the texts in every language
  const I = await page.evaluate(() => { const I = window.__bb.I18N; return ["en", "es", "ru"].map(l => [I[l].worlds, I[l].worldDone(I[l].worlds.school, "school"), I[l].worldDone(I[l].worlds.park, "park"), I[l].worldDone(I[l].worlds.winter, "winter"), I[l].worldDone(I[l].worlds.beach, "beach")]); });
  expect(I[0][0]).toEqual({ park: "Park", school: "School", beach: "Beach", winter: "Winter" });
  expect(I[1][0]).toEqual({ park: "Parque", school: "Escuela", beach: "Playa", winter: "Invierno" });
  expect(I[2][0]).toEqual({ park: "Парк", school: "Школа", beach: "Пляж", winter: "Зима" });
  expect(I.map(x => x[2])).toEqual(["You finished the Park!", "¡Terminaste Parque!", "Парк пройден!"]);
  expect(I[2].slice(1)).toEqual(["Школа пройдена!", "Парк пройден!", "Зима пройдена!", "Пляж пройден!"]);   // the gender comes from the world key
  for (const lang of ["es", "ru"]) {
    await page.evaluate(l => window.__bb.setLang(l), lang);
    await frames(page);
    expect(await page.evaluate(() => window.__bb.winLine)).toBe(I[lang === "es" ? 1 : 2][1]);
  }
  // Enter (like the button) goes to the menu, still in this world
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world])).toEqual(["menu", "school"]);
});

test("each rest takes coins from the level reward", async ({ page }) => {
  await page.evaluate(() => { window.__bb.stats.rests = 2; window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 1.5);
  const r = await page.evaluate(() => window.__bb.lastReward);
  expect(r.penalty).toBe(6);
  expect(r.stars).toBe(2);                 // no "nobody had to rest" star
});

test("warm mittens: bought in the shop, a hug takes 2 hearts and uses a charge", async ({ page }) => {
  await page.evaluate(() => { window.__bb.progress.coins = 30; window.__bb.buyGloves("mittens"); window.__bb.setEquip(0, "mittens"); window.__bb.startGame(1); });
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(0);
  const hp0 = await page.evaluate(() => window.__bb.big.hp);
  await setupHug(page);
  await step(page, 0.1);
  expect(await page.evaluate(() => window.__bb.big.hp)).toBe(hp0 - 2);
  expect(await page.evaluate(() => window.__bb.progress.inv.mittens)).toBe(2);
});

test("not enough coins: nothing is bought", async ({ page }) => {
  await page.evaluate(() => { window.__bb.progress.coins = 10; window.__bb.buyGloves("mega"); });
  const p = await page.evaluate(() => window.__bb.progress);
  expect(p.coins).toBe(10);
  expect(p.inv.mega).toBe(0);
});

test("the Big One never enters the Little Ones' house", async ({ page }) => {
  // the house is the safe zone: 60 s of normal play, the Big One's centre is never inside it
  const n = await page.evaluate(() => {
    let inside = 0; const b = window.__bb;
    for (let i = 0; i < 60 * 60; i++) { b.update(1 / 60); if (b.inSafe(b.big)) inside++; }
    return inside;
  });
  expect(n).toBe(0);
});

test("a banana makes the Big One slip; he can be hugged from the front", async ({ page }) => {
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

test("picking up speed boots makes a Little One faster for a while", async ({ page }) => {
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

test("the Big One's house is a danger zone", async ({ page }) => {
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

test("staying 5 s in the Big One's house throws you out", async ({ page }) => {
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

test("downed Little Ones have no house timer, the shield does not help", async ({ page }) => {
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

test("bots don't linger in the Big One's house", async ({ page }) => {
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
test("bonus stars appear and disappear", async ({ page }) => {
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

test("stars spawn only in fair places", async ({ page }) => {
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

test("only players pick up stars", async ({ page }) => {
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
  // a win: the rest penalty brings the reward down to the floor, the star coins come on top
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await installTestHelpers(page);
  expect(await take()).toBe(6);
  await page.evaluate(() => { window.__bb.stats.rests = 10; window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 1.5);
  const r = await page.evaluate(() => window.__bb.lastReward);
  expect(r.starCoins).toBe(3);
  expect(r.coins).toBe(5 + 3);                      // COINS_MIN_WIN + star coins
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(3 + 8);
  // a lost level: the reward keeps the star coins apart, nothing is counted twice
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await installTestHelpers(page);
  expect(await take()).toBe(14);
  const lost = await page.evaluate(() => { const b = window.__bb; b.stats.playerHugs = 2; b.giveReward(false); b.mode = "lose"; return { r: b.lastReward, coins: b.progress.coins }; });
  expect(lost.r.win).toBe(false);
  expect(lost.r.starCoins).toBe(3);
  expect(lost.r.coins).toBe(2 * 2 + 3);             // hugs + star coins
  expect(lost.coins).toBe(14 + 4);
  await page.waitForTimeout(300);                   // the lose screen draws without errors
});

test("a danger zone without exits throws out to the nearest free cell", async ({ page }) => {
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

test("buying air kisses", async ({ page }) => {
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

test("old saves get 0 kisses", async ({ page }) => {
  const load = async inv => {
    await page.evaluate(v => localStorage.setItem("bebebe-progress", JSON.stringify({ unlocked: 3, stars: { 1: 2 }, coins: 12, inv: v, equip: ["mittens", "none"] })), inv);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true);
    return page.evaluate(() => window.__bb.progress);
  };
  const p = await load({ mittens: 1, mega: 0 });
  expect(p.inv).toEqual({ mittens: 1, mega: 0, kisses: 0 });
  expect(p.coins).toBe(12);
  expect(p.worlds.park.unlocked).toBe(3);
  expect((await load({ mittens: 1, mega: 0, kisses: "lots" })).inv.kisses).toBe(0);   // broken data never throws
  expect((await load({ mittens: 1, mega: 0, kisses: -3 })).inv.kisses).toBe(0);
  expect((await load({ mittens: 1, mega: 0, kisses: 7 })).inv.kisses).toBe(7);
});

// SPEC-006 AC 7
test("old saves move into the Park", async ({ page }) => {
  const load = async save => {
    await page.evaluate(v => localStorage.setItem("bebebe-progress", JSON.stringify(v)), save);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true);
    return page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  };
  const inv = { mittens: 2, mega: 1, kisses: 4 };
  await page.evaluate(() => window.__bb.setName("p1", "Mila"));
  const p = await load({ unlocked: 23, stars: { 1: 3, 5: 2, 21: 1 }, coins: 140, inv, equip: ["mega", "mittens"] });
  expect(p.worlds.park).toEqual({ unlocked: 20, stars: { 1: 3, 5: 2 } });   // level 21 is dropped
  for (const w of ["school", "beach", "winter"]) expect(p.worlds[w], w).toEqual({ unlocked: 1, stars: {} });
  expect(p.coins).toBe(140);
  expect(p.inv).toEqual(inv);
  expect(p.equip).toEqual(["mega", "mittens"]);
  expect(await page.evaluate(() => window.__bb.names.p1)).toBe("Mila");
  // the migration happens once: the saved progress now has the worlds and loads the same again
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("bebebe-progress")));
  expect("unlocked" in saved || "stars" in saved, "the old flat fields are gone from the save").toBe(false);
  expect(saved.worlds).toEqual(p.worlds);
  const again = await load(saved);
  expect(again.worlds).toEqual(p.worlds);
  expect(again.coins).toBe(140);
  // a save with neither worlds nor old levels gets the fresh structure
  const fresh = await load({ coins: 7 });
  for (const w of ["park", "school", "beach", "winter"]) expect(fresh.worlds[w], w).toEqual({ unlocked: 1, stars: {} });
  expect(fresh.coins).toBe(7);
  expect(fresh.lastWorld).toBe("park");
  // a save with worlds merges with the defaults; broken values never throw
  const part = await load({ coins: 3, lastWorld: "moon", worlds: { beach: { unlocked: 7, stars: { 2: 3, 30: 2 } }, winter: "junk", school: { unlocked: 99 } } });
  expect(part.worlds).toEqual({ park: { unlocked: 1, stars: {} }, school: { unlocked: 20, stars: {} }, beach: { unlocked: 7, stars: { 2: 3 } }, winter: { unlocked: 1, stars: {} } });
  expect(part.lastWorld).toBe("park");
  expect((await load({ coins: 1, lastWorld: "winter" })).lastWorld).toBe("winter");
  // a stale page wrote both worlds and the old flat fields: the flat ones merge into the Park (higher unlocked, best stars), then go away
  const both = await load({ coins: 9, worlds: { park: { unlocked: 4, stars: { 1: 1, 2: 3 } }, school: { unlocked: 2, stars: {} } }, unlocked: 6, stars: { 1: 3, 2: 1, 25: 3 } });
  expect(both.worlds.park).toEqual({ unlocked: 6, stars: { 1: 3, 2: 3 } });
  expect(both.worlds.school).toEqual({ unlocked: 2, stars: {} });
  expect(both.coins).toBe(9);
  const bothSaved = JSON.parse(await page.evaluate(() => localStorage.getItem("bebebe-progress")));
  expect("unlocked" in bothSaved || "stars" in bothSaved).toBe(false);
  expect(bothSaved.worlds.park).toEqual({ unlocked: 6, stars: { 1: 3, 2: 3 } });
  const lower = await load({ worlds: { park: { unlocked: 9, stars: { 3: 3 } } }, unlocked: 2, stars: { 3: 1 } });
  expect(lower.worlds.park).toEqual({ unlocked: 9, stars: { 3: 3 } });   // the newer world data is never lowered
});

test("throwing spends a kiss and has a cooldown", async ({ page }) => {
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

test("the gamepad d-pad up/down switches worlds in the menu", async ({ page }) => {
  await page.evaluate(() => {
    const b = window.__bb; b.mode = "menu";
    window.__press = k => { window.__pads = [{ index: 0, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
    window.__press(-1);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  const press = async k => { await page.evaluate(n => window.__press(n), k); await frames(page); await page.evaluate(() => window.__press(-1)); await frames(page); };
  await press(13);                                                  // d-pad down: next world
  expect(await page.evaluate(() => window.__bb.world)).toBe("school");
  await press(12);                                                  // d-pad up: previous world
  expect(await page.evaluate(() => window.__bb.world)).toBe("park");
  await press(12);                                                  // wraps around
  expect(await page.evaluate(() => window.__bb.world)).toBe("winter");
  // on the pause and win screens the d-pad up/down changes nothing
  for (const m of ["pause", "win"]) {
    await page.evaluate(v => { window.__bb.mode = v; }, m);
    await press(13); await press(12);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.world]), m).toEqual([m, "winter"]);
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

test("no kisses from the safe house", async ({ page }) => {
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

test("kisses stop at walls and fly over ponds", async ({ page }) => {
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

test("trees, rocks and the map edge stop kisses; bushes do not", async ({ page }) => {
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

test("a kiss never hits the Big One through a wall", async ({ page }) => {
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

test("a kiss takes half a heart and makes him blush", async ({ page }) => {
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

test("kisses during shock or blush do no damage", async ({ page }) => {
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

test("a blushing Big One can be hugged", async ({ page }) => {
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

test("the last half heart by a kiss wins the level", async ({ page }) => {
  await kissScene(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, t = window.__t;
    b.big.hp = 0.5;
    t.kissHim();
    const hp = b.big.hp, n = b.progress.inv.kisses;
    b.littles[0].kissCd = 0;
    const again = b.throwKiss(0), n2 = b.progress.inv.kisses;   // the level is already won: nothing is spent
    t.step(1.5);
    return { hp, mode: b.mode, reward: b.lastReward, again, spent: n - n2 };
  });
  expect(r.again).toBe(false);
  expect(r.spent).toBe(0);
  expect(r.hp).toBe(0);
  expect(r.mode).toBe("win");
  expect(r.reward.win).toBe(true);
  expect(r.reward.stars).toBeGreaterThanOrEqual(1);
});

test("hearts bar shows half hearts", async ({ page }) => {
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

test("the shop shows three cards in one row", async ({ page }) => {
  for (const lang of ["en", "es", "ru"]) {
    await page.evaluate(l => { window.__bb.setLang(l); window.__bb.mode = "shop"; }, lang);
    await frames(page);
    const rects = await page.evaluate(() => window.__bb.buttonRects.filter(q => q.id.startsWith("buy:")));
    expect(rects.map(q => q.id)).toEqual(["buy:mittens", "buy:mega", "buy:kisses"]);
    expect(new Set(rects.map(q => q.y)).size).toBe(1);
    for (let i = 1; i < 3; i++) expect(rects[i].x).toBeGreaterThan(rects[i - 1].x + rects[i - 1].w);
    expect(rects[0].x).toBeGreaterThan(80);
    expect(rects[2].x + rects[2].w).toBeLessThan(880);
  }
  await page.evaluate(() => { window.__bb.progress.coins = 20; });
  await frames(page);
  const buy = await page.evaluate(() => {
    const q = window.__bb.buttonRects.find(r => r.id === "buy:kisses"), c = document.getElementById("game").getBoundingClientRect();
    return { x: c.left + (q.x + q.w / 2) * c.width / 960, y: c.top + (q.y + q.h / 2) * c.height / 640 };
  });
  await page.mouse.click(buy.x, buy.y);
  expect(await page.evaluate(() => window.__bb.progress.inv.kisses)).toBe(5);
});
