// SPEC-008: invariants — rules that must always hold, whatever numbers later specs set: speeds, rescue timings,
// rewards that add up, saves that load, a complete shop, docs numbers generated from the code.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { LANGS, openGame, frames, softly, sharedPage, resetGame, ROOT } = require("./helpers");
const docsNumbers = require("../scripts/docs-numbers.js");

// SPEC-018: one game page for the file; resetGame() before each test, page errors and a changed CFG fail the test.
// SPEC-023: the invariants check logic and numbers — `simPage` (sim mode: nothing drawn); the shop test needs drawn
// buttons — `page` (rendered).
const shared = sharedPage(), sharedSim = sharedPage();
const fixture = sim => async ({ browser }, use) => {
    const s = await (sim ? sharedSim : shared).get(browser, sim ? "invariants-sim" : "invariants", { viewport: { width: 960, height: 640 } }, p => openGame(p, { sim }));
    await resetGame(s.page);
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
};
const test = base.test.extend({ page: fixture(false), simPage: fixture(true) });
test.afterAll(async () => { await shared.close(); await sharedSim.close(); });

// SPEC-016: six worlds in the story order; coins and speeds follow the difficulty index, not the place in the list
const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
const DIFFICULTY = { park: 0, field: 1, city: 2, school: 3, beach: 3, winter: 4 };
const DOC = path.join(ROOT, "docs", "game-design.md");
const INDEX = path.join(ROOT, "index.html");

// ---------- AC 5: speeds ----------
test("the Big One never outruns a player, patrols slower than he chases, bots outrun his search", async ({ simPage: page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb, C = b.CFG, rows = [];
    for (const w of W) for (let n = 1; n <= 20; n++) {
      const hearts = b.difficulty(w, n).hearts;
      for (let lost = 0; lost < hearts; lost++) rows.push({ at: `${w} ${n} lost ${lost}`, ...b.difficulty(w, n, lost) });
    }
    return { rows, cap: C.BIG_CHASE_MAX, player: C.PLAYER_SPEED, bot: C.BOT_SPEED, park1: b.difficulty("park", 1).search };
  }, WORLDS);
  expect(r.rows.length).toBeGreaterThan(120 * 6);
  expect(r.cap).toBeLessThan(r.player);
  expect(r.bot, "a bot outruns the Big One searching on Park 1").toBeGreaterThan(r.park1);
  const soft = softly();
  for (const x of r.rows) {
    soft(x.chase, `${x.at}: chase`).toBeLessThanOrEqual(r.cap + 1e-9);
    soft(x.search, `${x.at}: search`).toBeLessThanOrEqual(r.cap + 1e-9);
    soft(x.patrol, `${x.at}: patrol slower than chase`).toBeLessThan(x.chase);
  }
  soft.done();
});

// SPEC-019 AC 8: tiptoeing is never painfully slow (≥ half of the player speed) and always below the running line
test("tiptoe speed is at least half the player speed and below the running line", async ({ simPage: page }) => {
  const r = await page.evaluate(() => { const C = window.__bb.CFG; return { mult: C.TIPTOE_MULT, max: C.TIPTOE_MAX, player: C.PLAYER_SPEED }; });
  expect(r.mult * r.player).toBeGreaterThanOrEqual(0.5 * r.player);
  expect(r.mult).toBeLessThan(r.max);
  expect(r.max).toBeLessThan(1);
});

// ---------- AC 6: rescue is possible ----------
test("a friend can always arrive in time, and a Little One just stood up is not pushed at once", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, g = b.grid;
    const out = { down: C.DOWN_TIME, delay: Math.max(...C.BOT_RESCUE_DELAY), rescue: C.RESCUE_TIME, bot: C.BOT_SPEED,
      quarter: Math.hypot(g.COLS * g.CELL, g.ROWS * g.CELL) / 4, kit: C.KIT_INVULN, afterRescue: C.INVULN_AFTER_RESCUE, stand: C.PUSH_STAND };
    // the stand after a push is CFG.PUSH_STAND (with and without a shield)
    const keep = C.PUSH_STAND;
    try {
      C.PUSH_STAND = 0.7;
      const pushAt = shield => {
        b.world = "park"; b.level = 1; b.startGame(1);
        const big = b.big, l = b.littles[0];
        Object.assign(big, { state: "look", timer: 999, stun: 0, noPush: 0, pushCd: 0, slip: 0, x: 500, y: 320, dir: 0 });
        Object.assign(l, { state: "ok", invuln: 0, x: 535, y: 320 }); l.fx.shield = shield;
        b.update(1 / 60);
        return { st: l.state, pushCd: big.pushCd };
      };
      out.pushed = pushAt(0); out.shielded = pushAt(5);
    } finally { C.PUSH_STAND = keep; b.mode = "home"; }
    return out;
  });
  expect(r.stand).toBe(0.9);
  expect(r.down, "DOWN_TIME > bot delay + rescue + a quarter of the map at bot speed")
    .toBeGreaterThan(r.delay + r.rescue + r.quarter / r.bot);
  expect(r.kit).toBeGreaterThanOrEqual(r.stand);
  expect(r.afterRescue).toBeGreaterThanOrEqual(r.stand);
  expect(r.pushed.st).toBe("down");
  expect(r.pushed.pushCd).toBeCloseTo(0.7, 6);            // the push comes after the Big One's own update
  expect(r.shielded.st).toBe("ok");
  expect(r.shielded.pushCd).toBeCloseTo(0.7, 6);
});

// ---------- AC 8: rewards add up ----------
test("rewards add up, coins never go negative, inventory stays whole", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = { runs: [], buys: [], inv: [] };
    const fresh = () => { b.resetProgress(); b.resetProgress(); };
    // prev = the level's stars before (SPEC-009: > 0 → won before, a replay)
    const run = (name, world, n, st, win = true, prev = 0) => {
      fresh(); b.world = world; b.level = n;
      if (prev) { b.progress.worlds[world].won[n] = true; b.progress.worlds[world].stars[n] = prev; }
      b.startGame(1);
      Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 30, starCoins: 0 }, st);
      const c0 = b.progress.coins;
      b.giveReward(win);
      const lr = b.lastReward;
      out.runs.push({ name, world, n, prev, st: { ...b.stats }, win, coins: lr.coins, starCoins: lr.starCoins, parts: lr.parts, fast: lr.fast,
        target: lr.target, gained: b.progress.coins - c0, after: b.progress.coins });
    };
    for (const [w, n] of [["park", 5], ["winter", 17]]) {
      run("no rests", w, n, { playerHugs: 3 });
      run("2 rests", w, n, { playerHugs: 1, rests: 2 });
      run("fast", w, n, { time: 10 });
      run("slow", w, n, { time: 9999 });
      run("star coins", w, n, { playerHugs: 2, starCoins: 6 });
      run("leaving early", w, n, { playerHugs: 2, starCoins: 3 }, false);
      run("floor", w, n, { rests: 100, time: 9999, starCoins: 3 });
      run("replay", w, n, { playerHugs: 2, time: 10 }, true, 1);
      run("replay floor", w, n, { rests: 100, time: 9999, starCoins: 3 }, true, 3);
    }
    // too few coins: nothing changes; exactly enough: coins reach 0, never below
    const shop = [["mittens", () => b.buyGloves("mittens"), b.GLOVES.mittens.price, b.GLOVES.mittens.charges],
      ["mega", () => b.buyGloves("mega"), b.GLOVES.mega.price, b.GLOVES.mega.charges],
      ["kisses", () => b.buyKisses(), b.KISSES.price, b.KISSES.pack], ["rescues", () => b.buyRescueKit(), b.RESCUE_KIT.price, b.RESCUE_KIT.pack]];
    for (const [k, buy, price, pack] of shop) {
      fresh(); b.progress.coins = price - 1;
      const before = JSON.stringify(b.progress); buy();
      const poor = JSON.stringify(b.progress) === before;
      b.progress.coins = price; const have = b.progress.inv[k]; buy();
      out.buys.push({ k, poor, coins: b.progress.coins, got: b.progress.inv[k] - have, pack });
    }
    // spending: kisses, kits and glove charges stop at 0
    const invNow = at => out.inv.push({ at, ...b.progress.inv });
    fresh(); b.world = "park"; b.level = 1; b.startGame(1);
    Object.assign(b.progress.inv, { kisses: 1, rescues: 1, mittens: 1 }); b.progress.equip[0] = "mittens";
    const l = b.littles[0];
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, noPush: 999 });
    Object.assign(l, { x: 270, y: 48, dir: 0, state: "ok", hugAnim: 0, dizzy: 0, kissCd: 0 });
    out.kiss = [b.throwKiss(0)]; l.kissCd = 0; out.kiss.push(b.throwKiss(0)); invNow("kisses");
    Object.assign(l, { state: "down", downTimer: 10 }); out.kit = [b.useRescueKit(0)];
    Object.assign(l, { state: "down", downTimer: 10 }); out.kit.push(b.useRescueKit(0)); invNow("kits");
    out.hearts = [];
    for (let i = 0; i < 2; i++) {
      Object.assign(b.big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, blush: 0, x: 500, y: 320, dir: 0, hp: 9 });
      Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 466, y: 320 });
      b.update(1 / 60); out.hearts.push(9 - b.big.hp);
    }
    invNow("gloves");
    b.mode = "home";
    return { out, C: { REST: C.COINS_PER_REST }, R: { ...b.REWARD } };
  });
  const { out, C, R } = r, soft = softly(), sum = p => p.reduce((s, x) => s + x.amount, 0);
  expect(out.runs.length).toBe(18);
  // SPEC-009: first win = base, replay = half the base, minus the rests down to the floor; + new stars, hugs, star coins
  // SPEC-026: the level line and the new-star line × WIN_SCALE, each rounded (the floors, hugs and star coins unchanged)
  const scaled = v => Math.round(Number((v * R.WIN_SCALE).toFixed(6)));
  const winCoins = x => {
    const wi = DIFFICULTY[x.world], base = R.BASE + R.PER_LEVEL * x.n + R.PER_WORLD * wi, first = !x.prev;
    const min = first ? R.FIRST_MIN : R.REPLAY_MIN, line = Math.max(scaled(first ? base : Math.floor(base / 2)), min);
    const stars = 1 + (x.st.rests ? 0 : 1) + (x.fast ? 1 : 0);
    return line - Math.min(x.st.rests * C.REST, line - min) + scaled(Math.max(0, stars - x.prev) * R.NEW_STAR) + x.st.playerHugs * R.PER_HUG + x.st.starCoins;
  };
  for (const x of out.runs) {
    const at = `${x.world} ${x.n} ${x.name}`;
    const expected = x.win ? winCoins(x) : x.st.playerHugs * R.PER_HUG + x.st.starCoins;
    soft(x.coins, `${at}: the total`).toBe(expected);
    soft(sum(x.parts), `${at}: lastReward.coins = the sum of its parts`).toBe(x.coins);
    soft(x.coins, `${at}: never negative`).toBeGreaterThanOrEqual(0);
    soft(x.gained, `${at}: progress.coins grows by coins − star coins (paid at pickup)`).toBe(x.coins - x.starCoins);
    soft(x.after, `${at}: progress.coins never negative`).toBeGreaterThanOrEqual(0);
    soft(x.parts.find(p => p.reason === "star")?.amount ?? 0, `${at}: the star part`).toBe(x.st.starCoins);
    if (x.win) soft(x.fast, `${at}: fast = within the target`).toBe(x.st.time <= x.target);
  }
  const part = (x, k) => x.parts.find(p => p.reason === k)?.amount ?? 0;
  for (const x of out.runs.filter(x => x.name.endsWith("floor"))) {
    const first = x.name === "floor", min = first ? R.FIRST_MIN : R.REPLAY_MIN;
    soft(part(x, first ? "firstWin" : "replay") + part(x, "rests"), `${x.world} ${x.name}: the rests line stops at the floor`).toBe(min);
    soft(part(x, "rests"), `${x.world} ${x.name}: a rests line`).toBeLessThan(0);
  }
  for (const x of out.runs.filter(x => x.win)) soft(part(x, x.prev ? "replay" : "firstWin"), `${x.world} ${x.n} ${x.name}: first win or replay line`).toBeGreaterThan(0);
  soft(out.runs.filter(x => x.name === "fast").every(x => x.fast), "the fast runs are fast").toBe(true);
  soft(out.runs.filter(x => x.name === "slow").every(x => !x.fast), "the slow runs are slow").toBe(true);
  for (const x of out.buys) {
    soft(x.poor, `${x.k}: too few coins change nothing`).toBe(true);
    soft(x.coins, `${x.k}: exactly enough → 0 coins`).toBe(0);
    soft(x.got, `${x.k}: one pack`).toBe(x.pack);
  }
  soft(out.kiss, "one kiss, then none").toEqual([true, false]);
  soft(out.kit, "one kit, then none").toEqual([true, false]);
  soft(out.hearts, "one mitten charge (2 hearts), then a normal hug").toEqual([2, 1]);
  for (const s of out.inv) for (const k of ["mittens", "mega", "kisses", "rescues"]) {
    soft(Number.isInteger(s[k]) && s[k] >= 0, `after ${s.at}: inv.${k} = ${s[k]} is a whole number ≥ 0`).toBe(true);
  }
  soft(out.inv.at(-1), "everything spent").toEqual({ at: "gloves", mittens: 0, mega: 0, kisses: 0, rescues: 0 });
  soft.done();
});

// ---------- AC 9: saves ----------
// A fixture is a snapshot of all bebebe-* keys (`keys`: a string is stored as is, an object as JSON) and what it loads
// into (`expect`: progress in the current shape, the outfits and the typed names). SPEC-009 reuses them. An old save is
// checked with toMatchObject (a later spec may add fields with defaults without rewriting history); current.json exactly.
const SAVES = ["pre-spec-003", "pre-spec-004", "pre-spec-006", "pre-spec-007", "stale-tab", "pre-spec-009", "pre-spec-016", "pre-spec-022", "pre-spec-026", "pre-spec-029", "pre-spec-030", "current"];
const save = n => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saves", n + ".json"), "utf8"));
const asStored = keys => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));

test("every known save shape loads into the current one and round-trips", async ({ simPage: page }) => {
  const soft = softly();
  for (const n of SAVES) {
    const f = save(n);
    const r = await page.evaluate(raw => {
      const b = window.__bb, p = b.loadProgress(JSON.parse(raw)), again = b.loadProgress(JSON.parse(JSON.stringify(p)));
      return { p: JSON.parse(JSON.stringify(p)), again: JSON.parse(JSON.stringify(again)) };
    }, asStored(f.keys)["bebebe-progress"]);
    if (n === "current") soft(r.p, `${n}: loads unchanged`).toEqual(f.expect.progress);
    else {
      soft(r.p, `${n}: loads into the current shape`).toMatchObject(f.expect.progress);
      soft(Object.keys(r.p).sort(), `${n}: no old or extra top-level fields`).toEqual(Object.keys(save("current").expect.progress).sort());
      soft(r.p.worlds, `${n}: worlds exactly`).toEqual(f.expect.progress.worlds);
    }
    soft(r.again, `${n}: loading it again changes nothing`).toEqual(r.p);
    for (const [k, v] of Object.entries(r.p.inv)) soft(Number.isInteger(v) && v >= 0, `${n}: inv.${k} = ${v}`).toBe(true);
    soft(Object.keys(f.keys).every(k => k.startsWith("bebebe-")), `${n}: only bebebe-* keys`).toBe(true);
  }
  soft.done();
});

// ---------- SPEC-016 AC 7: old saves get the Football field and the City ----------
test("old saves get the new worlds", async ({ simPage: page }) => {
  const won = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, true]));
  const stars = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1 + (i % 3)]));
  const fresh = { unlocked: 1, stars: {}, won: {} };
  // the spec's save: Park 20 won, School 5, Beach 3 (four worlds, as before SPEC-016)
  const old = { worlds: { park: { unlocked: 20, stars: stars(20), won: won(20) }, school: { unlocked: 6, stars: stars(5), won: won(5) },
    beach: { unlocked: 4, stars: stars(3), won: won(3) }, winter: { unlocked: 1, stars: {}, won: {} } }, lastWorld: "beach", coins: 120 };
  const r = await page.evaluate(([s, more]) => {
    const b = window.__bb, plain = v => JSON.parse(JSON.stringify(v)), p = b.loadProgress(s);
    const has = typeof b.worldOpen === "function" && typeof b.bonusUnlocked === "function", open = (w, q) => b.worldOpen(w, q).open;
    const out = { p: plain(p), keys: Object.keys(p.worlds), again: plain(b.loadProgress(plain(p))), has };
    if (has) {
      out.unlocked = b.bonusUnlocked(p);
      out.open = Object.fromEntries(b.WORLDS.map(w => [w, open(w, p)]));
      // "has progress" = unlocked > 1, or any won or stars entry in that world
      out.more = more.map(m => open("winter", b.loadProgress({ worlds: { winter: m } })));
      // a partial progress object (no worlds, a world without fields) never throws: nothing won, no progress
      out.partial = [b.bonusUnlocked({}), open("beach", {}), open("beach", { worlds: { beach: {} } }), open("winter", { worlds: { winter: { unlocked: 3 } } })];
    }
    return out;
  }, [old, [{ unlocked: 2 }, { stars: { 4: 1 } }, { won: { 7: true } }, { unlocked: 1, stars: {}, won: {} }, "junk"]]);
  expect(r.keys).toEqual(WORLDS);
  const soft = softly();
  for (const w of ["park", "school", "beach", "winter"]) soft(r.p.worlds[w], `${w} unchanged`).toEqual(old.worlds[w]);
  for (const w of ["field", "city"]) soft(r.p.worlds[w], `${w} fresh`).toEqual(fresh);
  soft.done();
  expect([r.p.lastWorld, r.p.coins]).toEqual(["beach", 120]);
  expect(r.again, "loading it again changes nothing").toEqual(r.p);
  expect(r.has, "__bb.worldOpen and __bb.bonusUnlocked").toBe(true);
  expect(r.unlocked, "Field and City are new: not every main level is won").toBe(false);
  // SPEC-030: Park open, Field open (the Park is finished), City locked (new, the Field not finished), School and Beach played
  // (they stay open); Winter has no progress and is locked
  expect(r.open).toEqual({ park: true, field: true, city: false, school: true, beach: true, winter: false });
  expect(r.more).toEqual([true, true, true, false, false]);
  expect(r.partial).toEqual([false, false, false, true]);
});

test("a whole old save starts the game: progress moves, outfits and names load, the game writes them back the same", async ({ simPage: page }) => {
  const f = save("pre-spec-006");
  await page.evaluate(keys => { localStorage.clear(); localStorage.setItem("bb-test-init", "1"); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, asStored(f.keys));
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const r = await page.evaluate(() => {
    const b = window.__bb, ls = k => JSON.parse(localStorage.getItem(k) || "null");
    const out = { progress: JSON.parse(JSON.stringify(b.progress)), written: ls("bebebe-progress"), shown: b.names };
    // the game saves what it loaded: an outfit there and back, a name set to itself, a progress save
    b.cycleOutfit("p1", "hair", 1); b.cycleOutfit("p1", "hair", -1);
    b.setName("p1", b.names.p1);
    b.world = "school"; b.selectWorld("park");   // SPEC-030: the School may be locked — the debug setter, then back to the (open) Park: a save
    out.outfits = ls("bebebe-outfits"); out.names = ls("bebebe-names"); out.saved = ls("bebebe-progress");
    return out;
  });
  expect(r.progress).toMatchObject(f.expect.progress);
  expect(r.progress.owned, "SPEC-009: the worn crown and Robot are owned").toEqual(f.expect.owned);
  expect(r.written, "the migration wrote the new shape back").toMatchObject(f.expect.progress);
  expect([r.shown.p1, r.shown.p2, r.shown.big]).toEqual([f.expect.names.p1, f.expect.names.p2, f.expect.names.big]);
  expect(r.outfits).toEqual({ ...f.expect.outfits, v: 2 });   // SPEC-021: the outfits shape carries its version
  expect(r.names).toEqual(f.expect.names);
  expect(r.saved).toEqual(r.progress);
});

// ---------- AC 10: shop and texts ----------
test("every shop item has a price, a pack, a picture, texts in every language, a buy button and a buy test", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const l of b.LANGS) { b.setLang(l); out[l] = b.shopCards(); }
    b.setLang("en"); b.mode = "shop";
    return out;
  });
  await frames(page);
  const ids = await page.evaluate(() => { const v = window.__bb.buttonRects.map(q => q.id); window.__bb.mode = "home"; return v; });
  // buy tests: a test in gameplay.spec.js titled "buying …" or "… bought in the shop …" that buys the card (or clicks its button)
  const gp = fs.readFileSync(path.join(__dirname, "gameplay.spec.js"), "utf8");
  const tests = gp.split(/\ntest\(/).slice(1).map(s => ({ title: (s.match(/^\s*(["'`])(.*?)\1/) || [])[2] || "", body: s }));
  const buyTests = tests.filter(t => /\bbuying\b|\bbought in the shop\b/i.test(t.title));
  const soft = softly();
  expect(r.en.map(c => c.k)).toEqual(["mittens", "mega", "kisses", "rescues"]);
  for (const c of r.en) {
    soft(Object.values(c).every(v => typeof v !== "function" && typeof v !== "object"), `${c.k}: plain data`).toBe(true);
    soft(c.price, `${c.k}: price`).toBeGreaterThan(0);
    soft(c.packN, `${c.k}: pack`).toBeGreaterThan(0);
    soft(c.picture, `${c.k}: a picture`).toBe(true);
    for (const l of LANGS) {
      const cl = r[l].find(q => q.k === c.k);
      soft(typeof cl.name === "string" && cl.name.trim().length > 0, `${c.k} ${l}: name`).toBe(true);
      soft(typeof cl.desc === "string" && cl.desc.trim().length > 0, `${c.k} ${l}: description`).toBe(true);
    }
    soft(ids, `${c.k}: buy button`).toContain(`buy:${c.k}`);
    const call = c.k === "mittens" || c.k === "mega" ? `buyGloves("${c.k}")` : c.k === "kisses" ? "buyKisses(" : c.k === "rescues" ? "buyRescueKit(" : `buy:${c.k}`;
    soft(buyTests.some(t => t.body.includes(call) || t.body.includes(`"buy:${c.k}"`)), `${c.k}: a buy test in gameplay.spec.js`).toBe(true);
  }
  for (const l of LANGS.slice(1)) soft(r[l].map(c => c.name), `${l}: translated`).not.toEqual(r.en.map(c => c.name));
  // every key in the generated numbers section exists in the code
  const keys = docsNumbers.sectionKeys(fs.readFileSync(DOC, "utf8"));
  expect(keys.length).toBeGreaterThan(50);
  const missing = await page.evaluate(ks => ks.filter(([o, k]) => !window.__bb[o] || !(k in window.__bb[o])).map(x => x.join(".")), keys);
  soft(missing, "docs keys missing in the code").toEqual([]);
  soft.done();
});

// ---------- AC 11: the numbers section of game-design.md is generated ----------
test("the numbers in game-design.md are generated from the code and up to date", { tag: "@fast" }, () => {
  const src = docsNumbers.source(), doc = fs.readFileSync(DOC, "utf8");   // SPEC-011: src/core/config.js + src/client/look.js
  const section = docsNumbers.section(doc);
  expect(section, "markers <!-- numbers:start --> / <!-- numbers:end --> in docs/game-design.md").not.toBeNull();
  expect(section, "out of date: run npm run docs:numbers").toBe(docsNumbers.render(src));
  const row = (o, k) => section.split("\n").find(s => s.startsWith(`| ${o} | \`${k}\` |`));
  expect(row("CFG", "BIG_CHASE_MAX")).toContain("142.5 (derived)");
  expect(row("CFG", "FAST_TIME")).toContain("lv => 60 + lv * 15");
  expect(row("CFG", "LAYOUT")).toContain("meadow:");
  expect(row("CFG", "DOWN_TIME")).toContain("| 18 |");
  expect(row("CFG", "PUSH_STAND")).toContain("| 0.9 |");
  expect(row("CFG", "VISION_HALF")).toContain("Math.PI / 4");
  expect(row("GLOVES", "mittens")).toContain("price: 30");
  expect(row("KISSES", "price")).toContain("| 20 |");
  expect(row("RESCUE_KIT", "pack")).toContain("| 3 |");
  for (const [o, k] of docsNumbers.sectionKeys(doc)) expect(row(o, k), `${o}.${k}: one row`).toBeTruthy();
  // later specs add arrays and may write `export const` (SPEC-009: WARDROBE_TIERS, REWARD): one row per element / key
  const later = [
    "// tiers", "export const WARDROBE_TIERS = [", "  { price: 10, n: 2 },   // basic", "  { price: 25, n: 3 }   // fancy", "];",
    "// reward parts", "export const REWARD = { win: 10, perHug: 2 };", ""].join("\n");
  expect(docsNumbers.rows(later, ["WARDROBE_TIERS", "REWARD"])).toEqual([
    "| WARDROBE_TIERS | `0` | { price: 10, n: 2 } | basic |", "| WARDROBE_TIERS | `1` | { price: 25, n: 3 } | fancy |",
    "| REWARD | `win` | 10 | reward parts |", "| REWARD | `perHug` | 2 | reward parts |"]);
});
