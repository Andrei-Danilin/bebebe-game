// Gameplay rules decided by the kids (see docs/game-design.md). Each test pins one rule.
const { test, expect } = require("@playwright/test");
const { openGame, step, setupHug } = require("./helpers");

test.beforeEach(async ({ page }) => {
  page.errors = await openGame(page);
  await page.evaluate(() => { window.__bb.placeSel = "park"; window.__bb.level = 1; window.__bb.startGame(1); });
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

test("a friend standing next to a downed Little One for 1 s rescues him", async ({ page }) => {
  await page.evaluate(() => {
    const L = window.__bb.littles; window.__bb.big.x = 900; window.__bb.big.y = 600; window.__bb.big.state = "look"; window.__bb.big.timer = 999;
    Object.assign(L[0], { state: "down", downTimer: 10, x: 400, y: 300, kx: 0, ky: 0 });
    Object.assign(L[1], { state: "ok", x: 420, y: 300 });
  });
  await page.evaluate(() => { window.__bb.littles[1].kind = "player"; window.__bb.littles[1].controls = { up: [], down: [], left: [], right: [] }; });
  await step(page, 1.3);
  expect(await page.evaluate(() => window.__bb.littles[0].state)).toBe("ok");
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
  expect(p.unlocked).toBe(2);
  expect(p.coins).toBe(r.coins);
  expect(p.stars["1"]).toBe(3);
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
