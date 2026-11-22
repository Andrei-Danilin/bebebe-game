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

// ---------- The Big One's house is dangerous (SPEC-003) ----------
const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };

test("the Big One's house is a danger zone", async ({ page }) => {
  for (let lv = 1; lv <= 5; lv++) {
    const r = await page.evaluate(v => {
      const b = window.__bb; b.level = v; b.startGame(1);
      const z = b.dangerZone, gen = b.generateLevel(v, 0);
      const d = gen.items.find(it => it.t === "danger"), dark = gen.items.find(it => it.t === "floor" && it.kind === "dark");
      return { z, d, dark, inside: b.inDanger({ x: z.x + z.w / 2, y: z.y + z.h / 2 }), safe: b.inDanger({ x: b.safeZone.x + b.safeZone.w / 2, y: b.safeZone.y + b.safeZone.h / 2 }) };
    }, lv);
    expect(r.d).toBeTruthy();
    expect([r.d.x, r.d.y, r.d.w, r.d.h]).toEqual([r.dark.x, r.dark.y, r.dark.w, r.dark.h]);   // the floor area, mirrored with the rest
    expect(r.inside).toBe(true);
    expect(r.safe).toBe(false);
  }
  // level 1's other items stay exactly as before the spec
  const items = await page.evaluate(() => JSON.stringify(window.__bb.generateLevel(1, 0).items.filter(it => it.t !== "danger")));
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
      const { COLS, ROWS, CELL } = b.world, blocked = b.world.blocked, sz = b.safeZone;
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
  await page.evaluate(() => { const b = window.__bb; b.placeSel = "park"; b.level = 1; b.startGame(1); });
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
  await page.evaluate(() => { const b = window.__bb; b.placeSel = "park"; b.level = 1; b.startGame(1); });
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
