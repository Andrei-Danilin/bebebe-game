// SPEC-009: the coins economy — the ledger (every coin change goes through addCoins / spendCoins and is logged),
// the earning rules, the wardrobe and the upgrades.
const base = require("@playwright/test");
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { openGame, sharedPage, resetGame, frames, softly, ROOT } = require("./helpers");

// SPEC-018: one game page for the file; resetGame() before each test, page errors and a changed CFG fail the test.
// A test that does not ask for `page` (the source scan) opens no browser at all.
const shared = sharedPage();
const fixture = (key, ctx, query = "") => async ({ browser }, use) => {
  const s = await shared.get(browser, key, ctx, p => openGame(p, { query }));
  await resetGame(s.page);
  const cfg = await s.page.evaluate(() => JSON.stringify([window.__bb.CFG, window.__bb.REWARD]));
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await s.page.evaluate(() => JSON.stringify([window.__bb.CFG, window.__bb.REWARD])), "the test restores every CFG / REWARD value it changed").toBe(cfg);
};
const test = base.test.extend({
  page: fixture("economy", { viewport: { width: 960, height: 640 } }),
  // the phone at its smallest size (SPEC-005 sizes), touch + mobile
  phonePage: fixture("phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, "?phone=1")
});
test.afterAll(async () => { await shared.close(); });

const INDEX = path.join(ROOT, "index.html");

// ---------- AC 6: the ledger ----------
// Finds every write to the coins in the game's source. Allowed only inside the bodies of addCoins and spendCoins;
// `progress = …` only with a whole new object from freshProgress() / loadProgress() (fresh, load, reset, setProgress).
// → [{ line, text, rule }] of the writes outside those places, and `inside` = how many writes the ledger has.
function coinWrites(src) {
  const lines = src.split("\n").map(s => s.replace(/(^|\s)\/\/.*$/, ""));   // line comments out (an URL keeps its "://")
  // the lines of a function body, by brace matching from its first "{"
  const body = name => {
    const at = src.indexOf(`function ${name}(`);
    if (at < 0) return null;
    let i = src.indexOf("{", at), depth = 0;
    const from = src.slice(0, i).split("\n").length;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    return [from, src.slice(0, i).split("\n").length];
  };
  const ledger = ["addCoins", "spendCoins"].map(body);
  const inLedger = n => ledger.some(r => r && n >= r[0] && n <= r[1]);
  const rules = [
    // any member write to "coins": x.coins = / += / -= / ++ / --, x["coins"] = …, ++x.coins
    ["coins write", /(\.\s*coins|\[\s*["'`]coins["'`]\s*\])\s*(\+\+|--|[-+*/%]?=(?![=>]))|(\+\+|--)\s*[\w$.]+\.coins\b/],
    // the whole progress replaced by something else than a fresh / loaded object
    ["progress replaced", /\bprogress\s*=(?![=>])(?!\s*(freshProgress\(\)|loadProgress\())/],
    // merged into or copied with other coins
    ["progress merged", /Object\.assign\(\s*progress\b|\.\.\.\s*progress\b/]
  ];
  const out = [];
  let inside = 0;
  lines.forEach((text, i) => {
    for (const [rule, re] of rules) {
      if (!re.test(text)) continue;
      if (rule === "coins write" && inLedger(i + 1)) { inside++; continue; }
      out.push({ line: i + 1, text: text.trim(), rule });
    }
  });
  return { out, inside, found: ledger.map(r => !!r) };
}

test("only the ledger writes coins", { tag: "@fast" }, () => {
  const src = fs.readFileSync(INDEX, "utf8");
  const r = coinWrites(src);
  expect(r.found, "addCoins and spendCoins exist").toEqual([true, true]);
  expect(r.inside, "addCoins and spendCoins change progress.coins").toBeGreaterThanOrEqual(2);
  expect(r.out, "writes to the coins outside addCoins / spendCoins:\n" + r.out.map(w => `${w.line} [${w.rule}] ${w.text}`).join("\n")).toEqual([]);
  // the scan itself: every planted write is found (one per kind), so an empty result above means something
  const at = src.indexOf("function giveReward(");
  const planted = ["progress.coins += 1;", "progress.coins++;", "progress[\"coins\"] -= 2;", "const pp = progress; pp.coins = 3;",
    "progress = { ...progress, coins: 9 };", "Object.assign(progress, { coins: 1 });", "--progress.coins;"];
  for (const p of planted) {
    const bad = src.slice(0, at) + p + "\n" + src.slice(at);
    expect(coinWrites(bad).out.length, `the scan finds: ${p}`).toBeGreaterThan(0);
  }
});

test("every coin change is in the ledger", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = {};
    const strip = list => list.map(({ t, ...rest }) => rest);
    // money to spend (a test setup, not a game change: the ledger starts counting after it)
    b.mode = "menu"; b.progress.coins = 100;
    const coins0 = b.progress.coins, n0 = b.ledger().length;
    // shop: three buys; mega needs 60 and only 35 are left → no entry
    b.buyKisses(); b.buyGloves("mittens"); b.buyRescueKit(); b.buyGloves("mega");
    out.buys = strip(b.ledger().slice(n0));
    // a level start clears the event log, never the ledger
    b.world = "park"; b.level = 1; b.startGame(1);
    out.afterStart = { events: b.events.length, ledger: b.ledger().length - n0 };
    // a bonus star picked up by player 1 (everybody else far away, the Big One calm)
    const L = b.littles;
    L.forEach((l, i) => { if (i) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40, state: "ok" }); });
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 999, pushCd: 0, hugCd: 0, blush: 0 });
    Object.assign(L[0], { state: "ok", x: 600, y: 450, invuln: 0, hugAnim: 0, dizzy: 0, kx: 0, ky: 0 });
    b.spawnStar(600, 450); b.update(1 / 60);
    // the win: 2 hugs, 1 rest
    Object.assign(b.stats, { playerHugs: 2, rests: 1, time: 30 });
    const nWin = b.ledger().length;
    b.giveReward(true); b.mode = "win";
    out.win = strip(b.ledger().slice(nWin));
    out.winParts = b.lastReward.parts;
    out.winEvents = strip(b.events.filter(e => e.type === "coins"));
    // leaving early: the hugs line
    b.startGame(1);
    b.stats.playerHugs = 3;
    const nLeave = b.ledger().length;
    b.giveReward(false);
    out.leave = strip(b.ledger().slice(nLeave));
    // all of it: plain data, the sum = the change of progress.coins
    const all = b.ledger().slice(n0);
    out.all = strip(all);
    out.sum = all.reduce((s, e) => s + e.amount, 0);
    out.gained = b.progress.coins - coins0;
    out.plain = JSON.stringify(JSON.parse(JSON.stringify(all))) === JSON.stringify(all);
    out.shape = all.every(e => e.type === "coins" && typeof e.t === "number" && typeof e.reason === "string" && Number.isInteger(e.amount) && e.amount !== 0);
    // a copy: changing what ledger() returned changes nothing in the game
    const copy = b.ledger(); copy[copy.length - 1].amount = 999; copy.length = 0;
    out.untouched = b.ledger().length - n0 === all.length && b.ledger().at(-1).amount === all.at(-1).amount;
    out.star = C.STAR_COINS;
    b.mode = "menu";
    return out;
  });
  const G = { mittens: 30, kisses: 20, rescues: 15 };
  expect(r.buys).toEqual([
    { type: "coins", reason: "buy:kisses", amount: -G.kisses },
    { type: "coins", reason: "buy:mittens", amount: -G.mittens },
    { type: "coins", reason: "buy:rescues", amount: -G.rescues }]);
  expect(r.afterStart).toEqual({ events: 0, ledger: 3 });
  expect(r.all[3], "the bonus star at pickup").toEqual({ type: "coins", reason: "star", amount: r.star });
  expect(r.win.length).toBeGreaterThan(0);
  expect(r.win.map(({ reason, amount }) => ({ reason, amount })), "the win lines = lastReward.parts without the star (paid at pickup)")
    .toEqual(r.winParts.filter(p => p.reason !== "star"));
  expect(r.winEvents.slice(-r.win.length), "the same lines are in the event log").toEqual(r.win);
  expect(r.leave.map(e => e.reason)).toEqual(["hugs"]);
  expect(r.leave[0].amount).toBeGreaterThan(0);
  expect(r.sum, "the ledger adds up to the change of progress.coins").toBe(r.gained);
  expect(r.plain, "plain data").toBe(true);
  expect(r.shape, "every entry is a non-zero coins event").toBe(true);
  expect(r.untouched, "ledger() returns copies").toBe(true);
});

// ---------- AC 1: the earning rules ----------
const WORLDS = ["park", "school", "beach", "winter"];
const sum = parts => parts.reduce((s, p) => s + p.amount, 0);

test("the reward rules: first win, replay, new stars, rests with floors, worlds 0 and 3", { tag: "@fast" }, async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG;
    const out = { R: { ...b.REWARD }, rest: C.COINS_PER_REST, star: C.STAR_COINS, runs: {},
      removed: ["COINS_WIN", "COINS_PER_LEVEL", "COINS_PER_WORLD", "COINS_NOBODY_OUT", "COINS_FAST", "COINS_PER_HUG", "COINS_MIN_WIN"].filter(k => k in C) };
    // a win of (w, n) with these stats (slow, nobody rested, no hugs unless set): the reward, its ledger lines, the coins gained
    const win = (name, w, n, st) => {
      b.world = w; b.level = n; b.startGame(1);
      Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }, st);
      const n0 = b.ledger().length, c0 = b.progress.coins;
      b.giveReward(true); b.mode = "menu";
      const lr = b.lastReward;
      out.runs[name] = { w, n, starCoins: b.stats.starCoins, coins: lr.coins, stars: lr.stars, first: lr.first, parts: lr.parts.map(p => ({ ...p })),
        ledger: b.ledger().slice(n0).map(({ reason, amount }) => ({ reason, amount })), gained: b.progress.coins - c0, won: b.progress.worlds[w].won[n] === true };
    };
    win("firstSlow", "park", 5, { playerHugs: 2 });          // 2 stars: the win + nobody rested
    win("replaySlow", "park", 5, { playerHugs: 2 });         // the same again: a replay, no new star
    win("replayFast", "park", 5, { time: 10 });              // a replay with the 3rd star: that star is new
    win("replayFastAgain", "park", 5, { time: 10 });         // ... and paid only once, ever
    win("firstFast", "park", 6, { time: 10, starCoins: 6 }); // 3 new stars, 2 bonus stars picked up
    win("oneRest", "park", 7, { time: 10, rests: 1, playerHugs: 3 });
    win("firstFloor", "park", 8, { rests: 100 });            // the rests line is cut at the first-win floor
    win("replayFloor", "park", 8, { rests: 100 });           // ... and at the replay floor
    win("winterFirst", "winter", 5, { playerHugs: 2 });
    win("winter20", "winter", 20, {});
    out.notWon = b.progress.worlds.park.won[9] === true;
    return out;
  });
  const { R, runs } = r, soft = softly();
  const base = (w, n) => R.BASE + R.PER_LEVEL * n + R.PER_WORLD * WORLDS.indexOf(w);
  const half = (w, n) => Math.floor(base(w, n) / 2);
  expect(r.removed, "the old COINS_* keys are gone").toEqual([]);
  expect(r.rest).toBe(3);
  expect(r.star, "bonus star +3 (kids' number)").toBe(3);
  const want = {
    firstSlow: [["firstWin", base("park", 5)], ["newStars", 2 * R.NEW_STAR], ["hugs", 2 * R.PER_HUG]],
    replaySlow: [["replay", half("park", 5)], ["hugs", 2 * R.PER_HUG]],
    replayFast: [["replay", half("park", 5)], ["newStars", R.NEW_STAR]],
    replayFastAgain: [["replay", half("park", 5)]],
    firstFast: [["firstWin", base("park", 6)], ["newStars", 3 * R.NEW_STAR], ["star", 6]],
    oneRest: [["firstWin", base("park", 7)], ["newStars", 2 * R.NEW_STAR], ["hugs", 3 * R.PER_HUG], ["rests", -3]],
    firstFloor: [["firstWin", base("park", 8)], ["newStars", R.NEW_STAR], ["rests", -(base("park", 8) - R.FIRST_MIN)]],
    replayFloor: [["replay", half("park", 8)], ["rests", -(half("park", 8) - R.REPLAY_MIN)]],
    winterFirst: [["firstWin", base("winter", 5)], ["newStars", 2 * R.NEW_STAR], ["hugs", 2 * R.PER_HUG]],
    winter20: [["firstWin", base("winter", 20)], ["newStars", 2 * R.NEW_STAR]]
  };
  for (const [name, x] of Object.entries(runs)) {
    soft(x.parts, `${name}: the lines`).toEqual(want[name].map(([reason, amount]) => ({ reason, amount })));
    soft(sum(x.parts), `${name}: lastReward.parts add up to lastReward.coins`).toBe(x.coins);
    soft(x.ledger, `${name}: the ledger has the same lines, without the bonus stars (paid at pickup)`).toEqual(x.parts.filter(p => p.reason !== "star"));
    soft(x.gained, `${name}: progress.coins grows by the reward minus the bonus stars`).toBe(x.coins - x.starCoins);
    soft(x.won, `${name}: the level is marked won`).toBe(true);
    soft(x.first, `${name}: first win flag`).toBe(x.parts[0].reason === "firstWin");
  }
  soft(runs.firstFloor.coins - R.NEW_STAR, "first win + rests never below FIRST_MIN").toBe(R.FIRST_MIN);
  soft(runs.replayFloor.coins, "replay + rests never below REPLAY_MIN").toBe(R.REPLAY_MIN);
  soft(runs.replaySlow.coins < runs.firstSlow.coins, "a replay pays less than the first win (kids' rule)").toBe(true);
  soft(runs.winterFirst.coins - runs.firstSlow.coins, "world 3 pays 3 × PER_WORLD more than world 0").toBe(3 * R.PER_WORLD);
  soft(r.notWon, "a level never won is not marked").toBe(false);
  soft.done();
});

test("leaving a level early pays only the hugs", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    const key = code => window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    const lines = n0 => b.ledger().slice(n0).map(({ reason, amount }) => ({ reason, amount }));
    // Park 9: a bonus star (paid at pickup), 3 hugs, then pause → Menu (Q)
    b.world = "park"; b.level = 9; b.startGame(1);
    let n0 = b.ledger().length;
    const L = b.littles;
    L.forEach((l, i) => { if (i) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40, state: "ok" }); });
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 0, slip: 0, noPush: 999, pushCd: 0, hugCd: 0, blush: 0 });
    Object.assign(L[0], { state: "ok", x: 600, y: 450, invuln: 0, hugAnim: 0, dizzy: 0, kx: 0, ky: 0 });
    b.spawnStar(600, 450); b.update(1 / 60);
    b.stats.playerHugs = 3;
    b.mode = "pause"; key("KeyQ");
    out.menu = { mode: b.mode, lines: lines(n0), won: b.progress.worlds.park.won[9] === true, stars: b.progress.worlds.park.stars[9] ?? 0 };
    // a restart while playing changes the level too: the hugs of the left run are paid
    b.startGame(1); b.stats.playerHugs = 2;
    n0 = b.ledger().length;
    b.startGame(1);
    out.restart = lines(n0);
    // no hugs: nothing to pay
    n0 = b.ledger().length;
    b.mode = "pause"; key("KeyQ");
    out.none = lines(n0);
    // after a win the reward is paid once: going to the menu pays nothing more
    b.startGame(1); b.stats.playerHugs = 2; b.giveReward(true); b.mode = "win";
    n0 = b.ledger().length;
    key("Escape");
    out.afterWin = { mode: b.mode, lines: lines(n0) };
    out.PH = b.REWARD.PER_HUG;
    return out;
  });
  expect(r.menu).toEqual({ mode: "menu", lines: [{ reason: "star", amount: 3 }, { reason: "hugs", amount: 3 * r.PH }], won: false, stars: 0 });
  expect(r.restart).toEqual([{ reason: "hugs", amount: 2 * r.PH }]);
  expect(r.none).toEqual([]);
  expect(r.afterWin).toEqual({ mode: "menu", lines: [] });
});

// ---------- AC 4: migration of the won flags ----------
test("old saves: levels with stars count as won", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, load = s => JSON.parse(JSON.stringify(b.loadProgress(s))), won = p => Object.fromEntries(Object.entries(p.worlds).map(([w, v]) => [w, v.won]));
    const out = {};
    out.old = won(load({ worlds: { park: { unlocked: 5, stars: { 1: 3, 2: 1 } }, beach: { unlocked: 2, stars: { 1: 2 } } }, coins: 40, inv: { mittens: 1, mega: 0, kisses: 2, rescues: 1 } }));
    out.oldCoins = load({ worlds: { park: { unlocked: 5, stars: { 1: 3 } } }, coins: 40, inv: { mittens: 1, mega: 0, kisses: 2, rescues: 1 } });
    // broken or partly broken won flags: only true for levels 1…20, never throws
    out.mixed = won(load({ worlds: { park: { unlocked: 5, stars: { 1: 2 }, won: { 3: true, 4: false, 25: true, x: true, 2: "yes", 0: true } } } })).park;
    out.junk = [won(load({ worlds: { park: { unlocked: 3, stars: { 2: 1 }, won: "junk" } } })).park, won(load({ worlds: { park: { unlocked: 3, stars: { 2: 1 }, won: [1, 2] } } })).park,
      won(load({ worlds: { park: { unlocked: 3, stars: { 2: 1 }, won: null } } })).park];
    // the old flat save (before worlds) and a stale tab (worlds + flat fields)
    out.flat = won(load({ unlocked: 4, stars: { 1: 3, 3: 1 }, coins: 5 })).park;
    out.stale = won(load({ worlds: { park: { unlocked: 3, stars: { 2: 1 }, won: { 2: true } } }, unlocked: 6, stars: { 5: 1 } })).park;
    out.fresh = won(load(null));
    const cur = load({ worlds: { park: { unlocked: 4, stars: { 1: 3 }, won: { 1: true, 2: true } } } });
    out.roundTrip = JSON.stringify(load(cur)) === JSON.stringify(cur);
    // a level won in an old save is a replay now (its old stars are not paid again)
    b.setProgress({ worlds: { park: { unlocked: 4, stars: { 1: 2 } } } });
    b.world = "park"; b.level = 1; b.startGame(1);
    Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 });
    b.giveReward(true); b.mode = "menu";
    out.replay = b.lastReward.parts.map(p => p.reason);
    return out;
  });
  expect(r.old).toEqual({ park: { 1: true, 2: true }, school: {}, beach: { 1: true }, winter: {} });
  expect(r.oldCoins.coins, "coins untouched").toBe(40);
  expect(r.oldCoins.inv, "inventory untouched").toEqual({ mittens: 1, mega: 0, kisses: 2, rescues: 1 });
  expect(r.mixed).toEqual({ 1: true, 3: true });
  expect(r.junk).toEqual([{ 2: true }, { 2: true }, { 2: true }]);
  expect(r.flat).toEqual({ 1: true, 3: true });
  expect(r.stale).toEqual({ 2: true, 5: true });
  expect(r.fresh).toEqual({ park: {}, school: {}, beach: {}, winter: {} });
  expect(r.roundTrip).toBe(true);
  expect(r.replay).toEqual(["replay"]);
});

// ---------- AC 2: the win screen ----------
// One scene with every line (first win: new stars, bonus stars, hugs, rests) and one replay of level 20 (worldDone line),
// in three languages, with normal and wider fonts (CFG.TEXT_TEST_SCALE 1.15, like CI). The lines and their sums are in
// hudRects (win-line:<reason>, win-num:<reason>, + total); __bb.winPanel is the box they must stay in.
const WIN_SCENES = {
  first: [{ world: "park", n: 5, stats: { playerHugs: 4, rests: 1, time: 10, starCoins: 6 }, won: false }],
  replay20: [{ world: "winter", n: 20, stats: { playerHugs: 12, rests: 2, time: 9999, starCoins: 3 }, won: true }]
};
async function showWin(page, { world, n, stats, won }) {
  await page.evaluate(([w, lv, st, wonBefore]) => {
    const b = window.__bb; b.world = w; b.level = lv;
    const wp = b.progress.worlds[w];   // the same scene every time: won before (a replay) or never won (a first win)
    if (wonBefore) { wp.won[lv] = true; wp.stars[lv] = 1; } else { delete wp.won[lv]; delete wp.stars[lv]; }
    b.startGame(1); Object.assign(b.stats, st); b.giveReward(true); b.mode = "win";
  }, [world, n, stats, won]);
  await frames(page);
}
async function winScreenProblems(page) {
  const fails = [];
  const overlaps = (a, b) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;
  for (const lang of ["en", "es", "ru"]) for (const scale of [1, 1.15]) for (const [name, [scene]] of Object.entries(WIN_SCENES)) {
    const at = `${lang} ×${scale} ${name}`;
    await page.evaluate(([l, s]) => { window.__bb.setLang(l); window.__bb.CFG.TEXT_TEST_SCALE = s; }, [lang, scale]);
    await showWin(page, scene);
    const d = await page.evaluate(() => {
      const b = window.__bb;
      return { panel: b.winPanel, hud: b.hudRects.filter(h => h.id.startsWith("win-")), buttons: b.buttonRects, parts: b.lastReward.parts.map(p => p.reason),
        ui: b.uiSize, done: b.lastReward.worldDone };
    });
    if (!d.panel) { fails.push(`${at}: no win panel`); continue; }
    const ids = d.hud.map(h => h.id);
    for (const p of [...d.parts, "total"]) for (const k of ["line", "num"]) if (!ids.includes(`win-${k}:${p}`)) fails.push(`${at}: no win-${k}:${p}`);
    if (ids.length !== 2 * (d.parts.length + 1)) fails.push(`${at}: ${ids.length} rects for ${d.parts.length} lines + total`);
    if (name === "first" && d.parts.length !== 5) fails.push(`${at}: ${d.parts} — the scene should show all five lines`);
    const P = d.panel;
    if (P.x < 0 || P.y < 0 || P.x + P.w > d.ui.w || P.y + P.h > d.ui.h) fails.push(`${at}: panel outside the screen ${JSON.stringify(P)}`);
    for (const h of d.hud) {
      if (h.x < P.x - 0.01 || h.y < P.y - 0.01 || h.x + h.w > P.x + P.w + 0.01 || h.y + h.h > P.y + P.h + 0.01) fails.push(`${at}: ${h.id} "${h.text}" outside the panel ${JSON.stringify(h)} ${JSON.stringify(P)}`);
      for (const q of d.buttons) if (overlaps(h, q)) fails.push(`${at}: ${h.id} on button ${q.id || q.text}`);
    }
    d.hud.forEach((a, i) => d.hud.slice(i + 1).forEach(b => { if (overlaps(a, b)) fails.push(`${at}: ${a.id} "${a.text}" on ${b.id} "${b.text}"`); }));
    if (name === "replay20" && !d.done) fails.push(`${at}: level 20 is not worldDone`);
  }
  await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; window.__bb.setLang("en"); window.__bb.mode = "menu"; });
  return fails;
}

test("the win screen lists each reward line and fits (desktop 960×640)", async ({ page }) => {
  const fails = await winScreenProblems(page);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
  // the lines' texts and sums
  await showWin(page, WIN_SCENES.first[0]);
  const d = await page.evaluate(() => ({ hud: window.__bb.hudRects.filter(h => h.id.startsWith("win-")), I: window.__bb.I18N.en.rw, r: window.__bb.lastReward }));
  const text = id => (d.hud.find(h => h.id === id) || {}).text;
  for (const k of ["firstWin", "newStars", "star", "hugs", "rests", "total"]) expect(text(`win-line:${k}`), k).toContain(d.I[k]);
  expect(text("win-num:rests")).toBe("−3");
  expect(text("win-num:firstWin")).toBe("+" + d.r.parts.find(p => p.reason === "firstWin").amount);
  expect(text("win-num:total")).toBe("+" + d.r.coins);
  // after level 20 the world-done line stays
  await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.level = 20; b.startGame(1); b.giveReward(true); b.mode = "win"; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.winLine)).toBe("You finished the School!");
  await page.evaluate(() => { window.__bb.mode = "menu"; });
});

test("the win screen lists each reward line and fits (phone 667×375)", async ({ phonePage: page }) => {
  const fails = await winScreenProblems(page);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});

test("every win-screen text is in three languages", async ({ page }) => {
  const I = await page.evaluate(() => { const I = window.__bb.I18N; return ["en", "es", "ru"].map(l => I[l].rw); });
  expect(I[0]).toEqual({ firstWin: "First win", replay: "Replay", newStars: "New stars", star: "Bonus stars", hugs: "Hugs", rests: "Rests", total: "Total" });
  expect(I[1]).toEqual({ firstWin: "Primera vez", replay: "Repetición", newStars: "Estrellas nuevas", star: "Estrellitas", hugs: "Abrazos", rests: "Descansos", total: "Total" });
  expect(I[2]).toEqual({ firstWin: "Первая победа", replay: "Повтор", newStars: "Новые звёзды", star: "Звёздочки", hugs: "Обнимашки", rests: "Отдых", total: "Итого" });
});
