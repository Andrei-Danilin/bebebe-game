// SPEC-022: the bosses — level 20 of Park, Football field and City (more anger, a bit faster), School 20 the grumpiest dad
// with his wide push; bonus worlds have no boss; bots near the bosses. Logic only: one shared sim page.
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

// In-page helper: start a level, everybody far away and pinned (bots as players without controls), the Big One calm at (x, y) facing dir.
// The game rng is seeded BEFORE startGame too: the bots take their random lurk time and approach side (makeLittle) there, and an
// unseeded start made "the bot goes to help" fail on one Pages run (resetGame left the rng unseeded before SPEC-011)
async function scene(page, world, n, seed = 7) {
  await page.evaluate(([w, lv, sd]) => {
    const b = window.__bb;
    b.seedRandom(sd); b.world = w; b.level = lv; b.startGame(1); b.seedRandom(sd);
    window.__pin = () => b.littles.forEach((l, i) => { if (l.kind === "bot") { l.kind = "player"; l.controls = { up: [], down: [], left: [], right: [] }; } });
    window.__calm = (x, y, dir) => Object.assign(b.big, { x, y, dir, state: "look", timer: 999, lookSign: 0, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, hugCd: 0, path: [], moving: false });
    window.__park = () => b.littles.forEach((l, i) => Object.assign(l, { x: 120 + i * 30, y: 90, state: "ok", invuln: 0, hugCd: 0, hugAnim: 0, dizzy: 0, kx: 0, ky: 0, fx: { boots: 0, cloak: 0, shield: 0 } }));
  }, [world, n, seed]);
}

// ---------- AC 5, 6, 7: which levels have a boss, and his numbers ----------
test("boss levels have their boss", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = {};
    for (const w of b.WORLDS) for (const n of [19, 20]) {
      b.world = w; b.level = n; b.resetWorld(1);
      const d = b.difficulty(w, n), base = Math.min(C.BIG_HP_MAX, C.BIG_HP + Math.floor((n - 1) / C.HP_LEVELS_PER_HEART) + b.worldDifficulty(w) * C.HP_PER_WORLD);
      out[w + n] = { boss: b.bossFor(w, n), bigBoss: b.big.boss, maxHp: b.big.maxHp, hearts: d.hearts, base, chase: d.chase, search: d.search, patrol: d.patrol };
    }
    // the same level without the boss: what his speeds would be (levelBoost only)
    const plain = (w, n) => { const k = b.difficulty(w, n); return k; };
    out.cap = C.BIG_CHASE_MAX; out.extra = C.BOSS_EXTRA_HP; out.mainExtra = C.MAIN_BOSS_EXTRA_HP; out.speed = C.BOSS_SPEED; out.scaleCfg = C.BOSS_SCALE;
    out.normal19 = plain("park", 19);
    return out;
  });
  const soft = softly();
  soft([r.extra, r.mainExtra, r.speed, r.scaleCfg], "CFG").toEqual([2, 3, 5, 1.1]);
  for (const w of ["park", "field", "city", "school"]) {
    const x = r[w + "20"], extra = w === "school" ? r.mainExtra : r.extra;
    soft([x.boss, x.bigBoss], `${w} 20: the boss`).toEqual([w, w]);   // his look and size: story.spec "each boss wears his own look"
    soft(x.hearts, `${w} 20: anger = the level's hearts + ${extra}`).toBe(x.base + extra);
    soft(x.maxHp, `${w} 20: the Big One starts with it`).toBe(x.hearts);
    for (const k of ["chase", "search", "patrol"]) soft(x[k] <= r.cap, `${w} 20: ${k} ≤ BIG_CHASE_MAX`).toBe(true);
    const y = r[w + "19"];
    soft([y.boss, y.bigBoss, y.hearts], `${w} 19: no boss`).toEqual([null, null, y.base]);
  }
  for (const w of ["beach", "winter"]) {
    const x = r[w + "20"];
    soft([x.boss, x.bigBoss, x.hearts], `${w} 20: no boss in a bonus world`).toEqual([null, null, x.base]);
  }
  const park = r.park20;
  soft.done();
  // park 20's chase is the plain level-20 chase + 5 (capped)
  const plain20 = await page.evaluate(() => { const b = window.__bb, C = b.CFG; const save = C.BOSS_SPEED; C.BOSS_SPEED = 0; const d = b.difficulty("park", 20); C.BOSS_SPEED = save; return d; });
  expect(park.chase).toBeCloseTo(Math.min(r.cap, plain20.chase + 5), 5);
  expect(park.patrol).toBeCloseTo(Math.min(r.cap, plain20.patrol + 5), 5);
});

// ---------- AC 6: the grumpiest dad's wide push ----------
test("the grumpiest dad pushes several kids at once", { tag: "@fast" }, async ({ simPage: page }) => {
  await scene(page, "school", 20);
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, L = b.littles, cell = 32;
    window.__pin(); window.__park(); window.__calm(480, 330, 0);
    // in front, within WIDE_PUSH_R: 0 touches him (the push), 1 and 2 near; 3 in front but too far; 4 behind him
    const at = [[480 + 34, 330], [480 + 60, 330 + 30], [480 + 40, 330 - 50], [480 + C.WIDE_PUSH_R * cell + 20, 330], [480 - 70, 330]];
    at.forEach(([x, y], i) => Object.assign(L[i], { x, y, dir: Math.PI }));
    const n0 = b.events.length, t0 = b.texts.length;
    b.update(1 / 60);
    const ev = b.events.slice(n0);
    return { states: L.map(l => l.state), pushes: ev.filter(e => e.type === "push").length, wide: ev.filter(e => e.type === "widePush").length,
      whoosh: b.texts.filter(t => t.text === b.I18N.en.whoosh).length, bams: b.texts.slice(t0).filter(t => t.text === b.I18N.en.bang).length,
      pushCd: b.big.pushCd, noPush: b.big.noPush, stand: C.WIDE_PUSH_STAND, recover: C.PUSH_RECOVER, ring: b.pushWaves.length };
  });
  expect(r.states).toEqual(["down", "down", "down", "ok", "ok"]);
  expect([r.pushes, r.wide, r.whoosh, r.bams], "one WHOOSH! for the whole push (no BAM! per kid)").toEqual([3, 1, 1, 0]);
  expect(r.ring, "a ring wave").toBe(1);
  // after a wide push he stands longer (a window to hug him); the kids' rest after any push (PUSH_RECOVER) still applies
  expect(r.pushCd).toBeCloseTo(r.stand, 5);
  expect(r.stand).toBeGreaterThan(await page.evaluate(() => window.__bb.CFG.PUSH_STAND));
  expect(r.noPush).toBeCloseTo(r.recover, 5);
  // standing after the wide push: a hug from behind works
  const hug = await page.evaluate(() => {
    const b = window.__bb, l = b.littles[4], hp = b.big.hp;
    Object.assign(l, { x: 480 - 34, y: 330, state: "ok", hugCd: 0 });
    b.update(1 / 60);
    return [hp, b.big.hp];
  });
  expect(hug[1]).toBe(hug[0] - 1);
});

test("after a wide push he stands longer than after a normal push; a park boss pushes one kid", async ({ simPage: page }) => {
  await scene(page, "park", 20);
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, L = b.littles;
    window.__pin(); window.__park(); window.__calm(480, 330, 0);
    Object.assign(L[0], { x: 480 + 34, y: 330 }); Object.assign(L[1], { x: 480 + 60, y: 330 + 30 });
    b.update(1 / 60);
    return { states: L.map(l => l.state), pushCd: b.big.pushCd, stand: C.PUSH_STAND, wide: C.WIDE_PUSH_STAND };
  });
  expect(r.states.slice(0, 2)).toEqual(["down", "ok"]);
  expect(r.pushCd).toBeCloseTo(r.stand, 5);
  expect(r.wide).toBe(1.5);
});

test("a shield blocks the wide push for its owner only", async ({ simPage: page }) => {
  await scene(page, "school", 20);
  const r = await page.evaluate(() => {
    const b = window.__bb, L = b.littles;
    window.__pin(); window.__park(); window.__calm(480, 330, 0);
    Object.assign(L[0], { x: 480 + 34, y: 330 }); Object.assign(L[1], { x: 480 + 60, y: 330 + 30, fx: { boots: 0, cloak: 0, shield: 5 } });
    b.update(1 / 60);
    return { states: L.map(l => l.state), shield: L[1].fx.shield, blocked: b.events.filter(e => e.type === "push" && e.blocked).length };
  });
  expect(r.states.slice(0, 2)).toEqual(["down", "ok"]);
  expect([r.shield, r.blocked]).toEqual([0, 1]);
  // everybody shielded: no WHOOSH, no ring, the normal stand after a shield
  const s = await page.evaluate(() => {
    const b = window.__bb, L = b.littles;
    window.__park(); window.__calm(480, 330, 0);
    Object.assign(L[0], { x: 480 + 34, y: 330, fx: { boots: 0, cloak: 0, shield: 5 } }); Object.assign(L[1], { x: 480 + 60, y: 330 + 30, fx: { boots: 0, cloak: 0, shield: 5 } });
    const t0 = b.texts.length, w0 = b.pushWaves.length;
    b.update(1 / 60);
    return { states: L.slice(0, 2).map(l => l.state), whoosh: b.texts.slice(t0).filter(t => t.text === b.I18N.en.whoosh).length, ring: b.pushWaves.length - w0, pushCd: b.big.pushCd, stand: b.CFG.PUSH_STAND };
  });
  expect([s.states, s.whoosh, s.ring]).toEqual([["ok", "ok"], 0, 0]);
  expect(s.pushCd).toBeCloseTo(s.stand, 5);
});

// ---------- AC 8: bots near the bosses ----------
// SPEC-011 AC 8d: the bot's start values (lurk time, approach side) are random, so the claim is checked over SEEDS seeds
// with a bound and a margin, not on one seed: never in his front (a hard 0 on every seed), and it comes to help within
// 10 s on at least HELP_MIN of the seeds (measured on 40 other seeds: never in front, every one came, within 0.9–3.0 s)
const SEEDS = [7, 11, 23, 42, 101, 202, 303, 404, 505, 606], HELP_MIN = 8;
test("bots keep out of the grumpiest dad's front when he is not standing", async ({ simPage: page }) => {
  const runs = [];
  for (const seed of SEEDS) {
    await scene(page, "school", 20, seed);
    const r = await page.evaluate(() => {
      const b = window.__bb, C = b.CFG, L = b.littles, cell = 32, a = 70 * Math.PI / 180;
      window.__park(); window.__calm(480, 330, 0);
      // player 1 lies 70° to the side in front of him (outside his 90° view, inside the wide push's 180°): a bot comes to help
      Object.assign(L[0], { x: 480 + Math.cos(a) * 70, y: 330 + Math.sin(a) * 70, state: "down", downTimer: 60, botWait: 0, rescue: 0 });
      for (const l of L.slice(2)) Object.assign(l, { x: 60, y: 600 });
      const bot = L[1]; Object.assign(bot, { x: 700, y: 520, task: "idle", fleeT: 0, lurkT: 0 });
      const inFront = () => { const dx = bot.x - b.big.x, dy = bot.y - b.big.y; return Math.hypot(dx, dy) < C.WIDE_PUSH_R * cell && Math.abs(Math.atan2(dy, dx)) < Math.PI / 2; };
      let inside = 0;
      for (let i = 0; i < 180; i++) { window.__calm(480, 330, 0); b.update(1 / 60); if (inFront()) inside++; }
      // standing after a push: now it may come and help. Up to 10 s: with a far approach side (bot.offset) the bot walks round the
      // long way — 60 start states took 1–7.6 s (300 frames were too short for 3 of them)
      let came = false;
      for (let i = 0; i < 600 && !came; i++) { window.__calm(480, 330, 0); b.big.pushCd = 1; b.update(1 / 60); came = L[0].rescue > 0 || L[0].state === "ok"; }
      return { inside, state: bot.state, task: bot.task, came };
    });
    runs.push({ seed, ...r });
  }
  const all = JSON.stringify(runs);
  expect(runs.filter(r => r.state !== "ok"), "the bot is never pushed: " + all).toEqual([]);
  expect(runs.filter(r => r.inside > 0), "frames the bot spent in his front: " + all).toEqual([]);
  expect(runs.filter(r => r.came).length, `while he stands after a push, the bot goes to help (≥ ${HELP_MIN} of ${SEEDS.length} seeds): ${all}`).toBeGreaterThanOrEqual(HELP_MIN);
});

test("bots still go after the bosses (no stuck bots on boss levels)", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const w of ["park", "school"]) {
      b.seedRandom(11); b.world = w; b.level = 20; b.startGame(1); b.seedRandom(11);   // seeded before the start too (the bots' random start values)
      const p = b.littles[0]; Object.assign(p, { x: 60, y: 60 }); p.controls = { up: [], down: [], left: [], right: [] };   // the player stays home
      let attacks = 0;
      const still = b.littles.map(() => 0), last = b.littles.map(l => ({ x: l.x, y: l.y })), maxStill = b.littles.map(() => 0);
      for (let i = 0; i < 60 * 90 && b.mode === "play"; i++) {
        b.update(1 / 60);
        b.littles.forEach((l, k) => {
          if (l.kind !== "bot") return;
          if (l.task === "attack") attacks++;
          // waiting for its turn at the lurk point is by design; any other task standing still is a stuck bot
          const moved = Math.hypot(l.x - last[k].x, l.y - last[k].y) > 0.5 || l.state !== "ok" || l.task === "lurk";
          still[k] = moved ? 0 : still[k] + 1 / 60; maxStill[k] = Math.max(maxStill[k], still[k]); last[k] = { x: l.x, y: l.y };
        });
      }
      out[w] = { attacks, maxStill: Math.max(...maxStill.slice(1)) };
    }
    return out;
  });
  for (const w of ["park", "school"]) {
    expect(r[w].attacks, `${w} 20: the bots sneak up on the boss`).toBeGreaterThan(0);
    expect(r[w].maxStill, `${w} 20: no bot stands still for long (${JSON.stringify(r[w])})`).toBeLessThan(5);
  }
});
