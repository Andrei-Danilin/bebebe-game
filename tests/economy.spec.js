// SPEC-009: the coins economy — the ledger (every coin change goes through addCoins / spendCoins and is logged),
// the earning rules, the wardrobe and the upgrades.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { openGame, sharedPage, resetGame, frames, softly, ROOT } = require("./helpers");

// SPEC-018: one game page for the file; resetGame() before each test, page errors and a changed CFG fail the test.
// A test that does not ask for `page` (the source scan) opens no game page (the worker's browser still starts: the
// failure-screenshot fixture of tests/pw.js needs it).
// SPEC-023: `simPage` = the same in sim mode (logic and numbers only; it draws nothing, so it may stay open next to a
// rendered page).
const shared = sharedPage(), sharedSim = sharedPage();
const fixture = (key, ctx, query = "", sim = false) => async ({ browser }, use) => {
  const s = await (sim ? sharedSim : shared).get(browser, key, ctx, p => openGame(p, { query, sim }));
  await resetGame(s.page);
  const numbers = () => s.page.evaluate(() => { const b = window.__bb; return JSON.stringify([b.CFG, b.REWARD, b.UPGRADES, b.WARDROBE_TIERS]); });
  const cfg = await numbers();
  await use(s.page);
  expect(s.errors.splice(0)).toEqual([]);
  expect(await numbers(), "the test restores every CFG / REWARD / UPGRADES / WARDROBE_TIERS value it changed").toBe(cfg);
};
const test = base.test.extend({
  page: fixture("economy", { viewport: { width: 960, height: 640 } }),
  simPage: fixture("economy-sim", { viewport: { width: 960, height: 640 } }, "", true),
  // the phone at its smallest size (SPEC-005 sizes), touch + mobile
  phonePage: fixture("phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, "?phone=1"),
  phone844: fixture("phone844", { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, "?phone=1"),
  phone932: fixture("phone932", { viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true }, "?phone=1")
});
test.afterAll(async () => { await shared.close(); await sharedSim.close(); });

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
    ["coins write", /(\.\s*coins|\[\s*["'`]coins["'`]\s*\])\s*(\+\+|--|(\*\*|<<|>>>|>>|\?\?|\|\||&&|[-+*/%&|^])?=(?![=>]))|(\+\+|--)\s*[\w$.]+\.coins\b/],
    // a write by reflection, or coins merged in with Object.assign
    ["reflect", /\b(Reflect\.(set|defineProperty)|Object\.defineProperty)\(/],
    // coins on the left of a destructuring assignment: [progress.coins] = …, ({ c: progress.coins } = …)
    ["destructure coins", /\[[^\]=]*\.coins\b[^\]=]*\]\s*=(?![=>])|\{[^}=]*:\s*[\w$.]+\.coins\b[^}=]*\}\s*=(?![=>])/],
    ["assign coins", /Object\.assign\([^)]*\bcoins\s*:/],
    // the whole progress replaced by something else than a fresh / loaded object
    ["progress replaced", /\bprogress\s*=(?![=>])(?!\s*(freshProgress\(\)|loadProgress\())/],
    // merged into or copied with other coins (a spread of one of its parts, e.g. ...progress.upgrades, is fine)
    ["progress merged", /Object\.assign\(\s*progress\b(?!\s*\.)|\.\.\.\s*progress\b(?!\s*\.)/]
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
  const planted = ["progress.coins ??= 1;", "progress.coins ||= 2;", "progress.coins **= 2;", "progress.coins <<= 1;",
    "Reflect.set(progress, \"coins\", 1);", "Object.assign(pp, { coins: 1 });", "progress.coins += 1;", "progress.coins++;", "progress[\"coins\"] -= 2;", "const pp = progress; pp.coins = 3;",
    "progress = { ...progress, coins: 9 };", "Object.assign(progress, { coins: 1 });", "--progress.coins;",
    "Object.defineProperty(progress, \"coins\", { value: 1 });", "[progress.coins] = [1];", "({ c: progress.coins } = { c: 1 });"];
  for (const p of planted) {
    const bad = src.slice(0, at) + p + "\n" + src.slice(at);
    expect(coinWrites(bad).out.length, `the scan finds: ${p}`).toBeGreaterThan(0);
  }
});

test("every coin change is in the ledger", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, out = {};
    const strip = list => list.map(({ t, ...rest }) => rest);
    // money to spend (a test setup, not a game change: the ledger starts counting after it)
    b.mode = "home"; b.progress.coins = 100;
    const coins0 = b.progress.coins, n0 = b.ledger().length;
    // shop: three buys; mega needs 60 and nothing is left (SPEC-026: the kit costs 50) → no entry
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
    b.mode = "home";
    return out;
  });
  const G = { mittens: 30, kisses: 20, rescues: 50 };   // SPEC-026: the kit 50
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
// SPEC-016: six worlds in the story order; the coins use the difficulty index (park 0 … winter 4), not the place in WORLDS
const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
const DIFFICULTY = { park: 0, field: 1, city: 2, school: 3, beach: 3, winter: 4 };
const sum = parts => parts.reduce((s, p) => s + p.amount, 0);

test("the reward rules: first win, replay, new stars, rests with floors, difficulty 0 and 4", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG;
    const out = { R: { ...b.REWARD }, rest: C.COINS_PER_REST, star: C.STAR_COINS, runs: {},
      removed: ["COINS_WIN", "COINS_PER_LEVEL", "COINS_PER_WORLD", "COINS_NOBODY_OUT", "COINS_FAST", "COINS_PER_HUG", "COINS_MIN_WIN"].filter(k => k in C) };
    // a win of (w, n) with these stats (slow, nobody rested, no hugs unless set): the reward, its ledger lines, the coins gained
    const win = (name, w, n, st) => {
      b.world = w; b.level = n; b.startGame(1);
      Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }, st);
      const n0 = b.ledger().length, c0 = b.progress.coins;
      b.giveReward(true); b.mode = "home";
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
  expect(Object.keys(DIFFICULTY)).toEqual(expect.arrayContaining(WORLDS));
  // SPEC-026: a win pays × WIN_SCALE (Andrei: −30 %) on the level line and the new-star coins, each line rounded; floors, hugs, bonus stars unchanged
  const win = v => Math.round(Number((v * R.WIN_SCALE).toFixed(6)));
  const base = (w, n) => win(R.BASE + R.PER_LEVEL * n + R.PER_WORLD * DIFFICULTY[w]);
  const half = (w, n) => win(Math.floor((R.BASE + R.PER_LEVEL * n + R.PER_WORLD * DIFFICULTY[w]) / 2));
  const stars = k => win(k * R.NEW_STAR);
  expect(r.removed, "the old COINS_* keys are gone").toEqual([]);
  expect(r.rest).toBe(3);
  expect(r.star, "bonus star +3 (kids' number)").toBe(3);
  const want = {
    firstSlow: [["firstWin", base("park", 5)], ["newStars", stars(2)], ["hugs", 2 * R.PER_HUG]],
    replaySlow: [["replay", half("park", 5)], ["hugs", 2 * R.PER_HUG]],
    replayFast: [["replay", half("park", 5)], ["newStars", stars(1)]],
    replayFastAgain: [["replay", half("park", 5)]],
    firstFast: [["firstWin", base("park", 6)], ["newStars", stars(3)], ["star", 6]],
    oneRest: [["firstWin", base("park", 7)], ["newStars", stars(2)], ["hugs", 3 * R.PER_HUG], ["rests", -3]],
    firstFloor: [["firstWin", base("park", 8)], ["newStars", stars(1)], ["rests", -(base("park", 8) - R.FIRST_MIN)]],
    replayFloor: [["replay", half("park", 8)], ["rests", -(half("park", 8) - R.REPLAY_MIN)]],
    winterFirst: [["firstWin", base("winter", 5)], ["newStars", stars(2)], ["hugs", 2 * R.PER_HUG]],
    winter20: [["firstWin", base("winter", 20)], ["newStars", stars(2)]]
  };
  for (const [name, x] of Object.entries(runs)) {
    soft(x.parts, `${name}: the lines`).toEqual(want[name].map(([reason, amount]) => ({ reason, amount })));
    soft(sum(x.parts), `${name}: lastReward.parts add up to lastReward.coins`).toBe(x.coins);
    soft(x.ledger, `${name}: the ledger has the same lines, without the bonus stars (paid at pickup)`).toEqual(x.parts.filter(p => p.reason !== "star"));
    soft(x.gained, `${name}: progress.coins grows by the reward minus the bonus stars`).toBe(x.coins - x.starCoins);
    soft(x.won, `${name}: the level is marked won`).toBe(true);
    soft(x.first, `${name}: first win flag`).toBe(x.parts[0].reason === "firstWin");
  }
  soft(runs.firstFloor.coins - stars(1), "first win + rests never below FIRST_MIN").toBe(R.FIRST_MIN);
  soft(runs.replayFloor.coins, "replay + rests never below REPLAY_MIN").toBe(R.REPLAY_MIN);
  soft(runs.replaySlow.coins < runs.firstSlow.coins, "a replay pays less than the first win (kids' rule)").toBe(true);
  soft(runs.winterFirst.coins - runs.firstSlow.coins, "Winter (difficulty 4) pays 4 × PER_WORLD more than the Park (0), × WIN_SCALE").toBe(base("winter", 5) - base("park", 5));
  soft(base("winter", 5) > base("park", 5), "Winter pays more").toBe(true);
  soft(r.notWon, "a level never won is not marked").toBe(false);
  soft.done();
});

// ---------- SPEC-026 AC 1–4: Andrei's prices (a win pays 30 % less, the kit costs 50, upgrades ×1.5) ----------
test("SPEC-026: a win pays 30 % less; the rescue kit costs 50; every upgrade ×1.5", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = { scale: b.REWARD.WIN_SCALE, kit: { ...b.RESCUE_KIT }, upg: Object.fromEntries(Object.entries(b.UPGRADES).map(([k, u]) => [k, [...u.prices]])),
      card: b.shopCards().find(c => c.k === "rescues").price, runs: {} };
    const win = (name, w, n, st, before) => {
      const wp = b.progress.worlds[w];
      if (before) { wp.won[n] = true; wp.stars[n] = before; } else { delete wp.won[n]; delete wp.stars[n]; }
      b.world = w; b.level = n; b.startGame(1);
      Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 }, st);
      b.giveReward(true); b.mode = "home";
      out.runs[name] = { coins: b.lastReward.coins, parts: b.lastReward.parts.map(p => [p.reason, p.amount]) };
    };
    // Park 1, first win: slow, nobody rested (2 stars), 2 hugs, one bonus star picked up
    win("park1First", "park", 1, { playerHugs: 2, starCoins: 3 });
    // School 20, first win: slow, nobody rested (2 stars)
    win("school20First", "school", 20, {});
    // Park 1 replay: won before with 2 stars, now fast (the 3rd star is new)
    win("park1Replay", "park", 1, { time: 10 }, 2);
    // the kit: 49 coins are not enough, 50 buy a pack of 3
    b.progress.coins = 49; b.progress.inv.rescues = 0; b.buyRescueKit();
    out.kit49 = [b.progress.coins, b.progress.inv.rescues];
    b.progress.coins = 50; b.buyRescueKit();
    out.kit50 = [b.progress.coins, b.progress.inv.rescues];
    // an upgrade: level 1 for 150
    b.progress.coins = 149; b.progress.upgrades.fastFeet = 0; b.buyUpgrade("fastFeet");
    out.upg149 = [b.progress.coins, b.progress.upgrades.fastFeet];
    b.progress.coins = 150; b.buyUpgrade("fastFeet");
    out.upg150 = [b.progress.coins, b.progress.upgrades.fastFeet];
    return out;
  });
  expect(r.scale, "REWARD.WIN_SCALE (Andrei: −30 %)").toBe(0.7);
  expect(r.kit, "RESCUE_KIT: 50 coins, pack stays 3").toEqual({ price: 50, pack: 3 });
  expect(r.card, "the shop card shows the new price").toBe(50);
  expect(r.upg, "every upgrade price ×1.5").toEqual({ fastFeet: [150, 300, 450], longItems: [150, 300, 450], quickHelp: [150, 300, 450] });
  // base = 15 + 1 × n + 10 × difficulty; first win = all of it, replay = half (floor); × 0.7 and rounded; new stars 6 each × 0.7
  expect(r.runs.park1First, "Park 1 first win: 16 → 11, 2 new stars 12 → 8, the bonus star and hugs unchanged").toEqual({ coins: 24, parts: [["firstWin", 11], ["newStars", 8], ["star", 3], ["hugs", 2]] });
  expect(r.runs.school20First, "School 20 first win: 65 → 46 (45.5 rounds up), 2 new stars 12 → 8").toEqual({ coins: 54, parts: [["firstWin", 46], ["newStars", 8]] });
  expect(r.runs.park1Replay, "Park 1 replay: 8 → 6, 1 new star 6 → 4").toEqual({ coins: 10, parts: [["replay", 6], ["newStars", 4]] });
  expect(r.kit49, "49 coins buy no kit").toEqual([49, 0]);
  expect(r.kit50, "50 coins buy 3 kits").toEqual([0, 3]);
  expect(r.upg149).toEqual([149, 0]);
  expect(r.upg150).toEqual([0, 1]);
});

test("SPEC-026: an old save keeps its kits, upgrade levels and clothes; nothing refunded or re-charged", async ({ simPage: page }) => {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saves", "pre-spec-026.json"), "utf8"));
  const r = await page.evaluate(raw => {
    const b = window.__bb, p = JSON.parse(JSON.stringify(b.loadProgress(JSON.parse(raw))));
    // play on with it: the next longItems level (2) costs the new price for level 2
    b.setProgress(JSON.parse(raw));
    const c0 = b.progress.coins; b.buyUpgrade("longItems");
    const fullTop = b.progress.upgrades.fastFeet;
    b.buyUpgrade("fastFeet");                     // already at the top: nothing happens
    return { p, spent: c0 - b.progress.coins, longItems: b.progress.upgrades.longItems, fastFeet: [fullTop, b.progress.upgrades.fastFeet], coinsAfter: b.progress.coins };
  }, JSON.stringify(f.keys["bebebe-progress"]));
  const want = f.expect.progress;
  expect(r.p.coins, "coins as saved").toBe(want.coins);
  expect(r.p.inv, "kits and items as saved").toEqual(want.inv);
  expect(r.p.upgrades, "upgrade levels as saved").toEqual(want.upgrades);
  expect(r.p.owned, "clothes as saved").toEqual(want.owned);
  expect(r.spent, "the next level costs today's price").toBe(300);
  expect(r.longItems).toBe(2);
  expect(r.fastFeet, "a maxed upgrade stays maxed, no charge").toEqual([3, 3]);
  expect(r.coinsAfter).toBe(want.coins - 300);
});

test("leaving a level early pays only the hugs", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    const key = code => window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    const lines = n0 => b.ledger().slice(n0).map(({ reason, amount }) => ({ reason, amount }));
    // Park 9: a bonus star (paid at pickup), 3 hugs, then pause → Map (Q)
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
    // after a win the reward is paid once: going to the map pays nothing more
    b.startGame(1); b.stats.playerHugs = 2; b.giveReward(true); b.mode = "win";
    n0 = b.ledger().length;
    key("Escape");
    out.afterWin = { mode: b.mode, lines: lines(n0) };
    out.PH = b.REWARD.PER_HUG;
    return out;
  });
  expect(r.menu).toEqual({ mode: "map", lines: [{ reason: "star", amount: 3 }, { reason: "hugs", amount: 3 * r.PH }], won: false, stars: 0 });
  expect(r.restart).toEqual([{ reason: "hugs", amount: 2 * r.PH }]);
  expect(r.none).toEqual([]);
  expect(r.afterWin).toEqual({ mode: "map", lines: [] });
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
    b.giveReward(true); b.mode = "home";
    out.replay = b.lastReward.parts.map(p => p.reason);
    return out;
  });
  expect(r.old).toEqual({ park: { 1: true, 2: true }, field: {}, city: {}, school: {}, beach: { 1: true }, winter: {} });
  expect(r.oldCoins.coins, "coins untouched").toBe(40);
  expect(r.oldCoins.inv, "inventory untouched").toEqual({ mittens: 1, mega: 0, kisses: 2, rescues: 1 });
  expect(r.mixed).toEqual({ 1: true, 3: true });
  expect(r.junk).toEqual([{ 2: true }, { 2: true }, { 2: true }]);
  expect(r.flat).toEqual({ 1: true, 3: true });
  expect(r.stale).toEqual({ 2: true, 5: true });
  expect(r.fresh).toEqual({ park: {}, field: {}, city: {}, school: {}, beach: {}, winter: {} });
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
  await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; window.__bb.setLang("en"); window.__bb.mode = "home"; });
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
  await page.evaluate(() => { window.__bb.mode = "home"; });
});

test("the win screen lists each reward line and fits (phone 667×375)", async ({ phonePage: page }) => {
  const fails = await winScreenProblems(page);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});

test("every win-screen text is in three languages", async ({ simPage: page }) => {
  const I = await page.evaluate(() => { const I = window.__bb.I18N; return ["en", "es", "ru"].map(l => I[l].rw); });
  expect(I[0]).toEqual({ firstWin: "First win", replay: "Replay", newStars: "New stars", star: "Bonus stars", hugs: "Hugs", rests: "Rests", total: "Total" });
  expect(I[1]).toEqual({ firstWin: "Primera vez", replay: "Repetición", newStars: "Estrellas nuevas", star: "Estrellitas", hugs: "Abrazos", rests: "Descansos", total: "Total" });
  expect(I[2]).toEqual({ firstWin: "Первая победа", replay: "Повтор", newStars: "Новые звёзды", star: "Звёздочки", hugs: "Обнимашки", rests: "Отдых", total: "Итого" });
});

// ---------- AC 3: the wardrobe ----------
// __bb.wardrobe() = { hat|jacket|pants|big: [{ id, price }], hairs } (plain data); __bb.outfits = { shown, saved } (indexes;
// shown = what the wardrobe tab shows, saved = the last owned look, the one bebebe-outfits stores); __bb.buyLook(key) = a tap
// on that column's Buy button. resetGame() puts the skin picker back to the defaults.
const outfitsSaved = page => page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-outfits") || "null"));

test("every wardrobe item has an id and a price; the basic ones and every default look are free", { tag: "@fast" }, async ({ simPage: page }) => {
  const r = await page.evaluate(() => ({ w: window.__bb.wardrobe(), tiers: window.__bb.WARDROBE_TIERS, def: window.__bb.outfits.shown }));
  const free = list => list.filter(q => q.price === 0).map(q => q.id), soft = softly();
  expect(r.tiers).toEqual([40, 80, 150]);
  soft(free(r.w.hat), "free hats (the crown is in the 150 tier)").toEqual(["none", "cap", "beanie", "bow"]);
  soft(free(r.w.jacket), "the first 4 jackets are free").toEqual(r.w.jacket.slice(0, 4).map(q => q.id));
  soft(free(r.w.pants), "the first 4 pants are free").toEqual(r.w.pants.slice(0, 4).map(q => q.id));
  soft(free(r.w.big), "Classic, Ogre and the Dad are free (SPEC-021: the dad, the default, is added at the end)").toEqual(["classic", "ogre", "dad"]);
  for (const k of ["hat", "jacket", "pants", "big"]) {
    soft(new Set(r.w[k].map(q => q.id)).size, `${k}: ids are unique`).toBe(r.w[k].length);
    for (const q of r.w[k]) soft(q.price === 0 || r.tiers.includes(q.price), `${k} ${q.id}: price ${q.price} is free or a tier`).toBe(true);
  }
  const top = ["hat:crown", "hat:viking", "hat:tophat", "jacket:cape", "big:robot", "big:captain"];
  for (const t of top) { const [k, id] = t.split(":"); soft(r.w[k].find(q => q.id === id)?.price, `${t} in the 150 tier`).toBe(150); }
  for (const pk of ["p1", "p2"]) for (const [slot, k] of [["hat", "hat"], ["jacket", "jacket"], ["pants", "pants"]]) soft(r.w[k][r.def[pk][slot]].price, `${pk} default ${slot} is free`).toBe(0);
  soft(r.w.big[r.def.big].price, "the default Big One is free").toBe(0);
  soft.done();
});

test("locked clothes can be tried on and bought", async ({ page }) => {
  const W = await page.evaluate(() => window.__bb.wardrobe());
  const idx = (k, id) => W[k].findIndex(q => q.id === id);
  const crown = idx("hat", "crown"), cap = idx("hat", "cap"), robot = idx("big", "robot");
  // try on: the preview shows the crown, the save keeps the cap
  await page.evaluate(n => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.progress.coins = 0; b.cycleOutfit("p1", "hat", n); }, crown - cap);
  await frames(page);
  let d = await page.evaluate(() => ({ o: window.__bb.outfits, ids: window.__bb.buttonRects.map(q => q.id), hud: window.__bb.hudRects.map(h => h.id), snd: window.__bb.sim().sounds }));
  expect(d.o.shown.p1.hat).toBe(crown);
  expect(d.o.saved.p1.hat).toBe(cap);
  expect((await outfitsSaved(page)).p1.hat, "bebebe-outfits never stores a locked item").toBe(cap);
  expect(d.ids).toContain("buy-look:p1");
  expect(d.ids, "the name label makes room for the Buy button").not.toContain("name:p1");
  expect(d.hud).toEqual(expect.arrayContaining(["coins", "look-note:p1"]));   // "not enough coins" on the preview
  // too few coins: nothing bought, the "out" sound
  const n0 = await page.evaluate(() => window.__bb.ledger().length);
  await page.evaluate(() => window.__bb.buyLook("p1"));
  expect(await page.evaluate(s0 => [window.__bb.progress.owned.hats, window.__bb.ledger().length, window.__bb.sim().sounds > s0], d.snd)).toEqual([[], n0, true]);
  // enough coins: the first tap only asks (the button and the note change), the second one buys — a real click on the button
  await page.evaluate(() => { window.__bb.progress.coins = 200; });
  await frames(page);
  const before = await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "buy-look:p1").text);
  const click = async id => {
    const at = await page.evaluate(k => {
      const q = window.__bb.buttonRects.find(r => r.id === k), c = document.getElementById("game").getBoundingClientRect();
      return { x: c.left + (q.x + q.w / 2) * c.width / 960, y: c.top + (q.y + q.h / 2) * c.height / 640 };
    }, id);
    await page.mouse.click(at.x, at.y);
    await frames(page);
  };
  await click("buy-look:p1");
  d = await page.evaluate(() => ({ owned: window.__bb.progress.owned.hats, coins: window.__bb.progress.coins, text: window.__bb.buttonRects.find(q => q.id === "buy-look:p1").text, hud: window.__bb.hudRects.map(h => h.id), tap: window.__bb.I18N.en.tapAgain }));
  expect([d.owned, d.coins]).toEqual([[], 200]);
  expect(d.text).not.toBe(before);
  expect(d.hud).toContain("look-note:p1");                                   // "Tap again to buy" on the preview
  await click("buy-look:p1");
  d = await page.evaluate(() => ({ owned: window.__bb.progress.owned.hats, coins: window.__bb.progress.coins, o: window.__bb.outfits, ids: window.__bb.buttonRects.map(q => q.id), last: window.__bb.ledger().at(-1) }));
  expect(d.owned).toEqual(["crown"]);
  expect(d.coins).toBe(200 - W.hat[crown].price);
  expect([d.last.reason, d.last.amount]).toEqual(["buy:hat:crown", -W.hat[crown].price]);
  expect(d.o.saved.p1.hat).toBe(crown);
  expect((await outfitsSaved(page)).p1.hat).toBe(crown);
  expect(d.ids).toContain("name:p1");                                        // bought: the name label is back
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-progress")).owned.hats)).toEqual(["crown"]);
  // two locked pieces at once: one button buys both; a tap in between and another change disarm it
  const cape = idx("jacket", "cape"), green = idx("pants", "green");
  const r = await page.evaluate(([cp, gr]) => {
    const b = window.__bb, out = {};
    b.progress.coins = 160;                                                  // the cape (150) + green pants (40) = 190: too few
    b.cycleOutfit("p1", "jacket", cp - b.outfits.shown.p1.jacket); b.cycleOutfit("p1", "pants", gr - b.outfits.shown.p1.pants);
    b.buyLook("p1"); b.buyLook("p1");
    out.poor = [[...b.progress.owned.jackets], [...b.progress.owned.pants], b.progress.coins];   // copies: the arrays change later
    b.progress.coins = 300;
    b.buyLook("p1");                                                         // armed…
    b.cycleOutfit("p1", "hair", 1);                                          // …another change disarms
    b.buyLook("p1");
    out.disarmed = [b.progress.owned.jackets.length, b.progress.coins];
    b.buyLook("p1");
    out.bought = [b.progress.owned.jackets, b.progress.owned.pants, b.progress.coins];
    return out;
  }, [cape, green]);
  expect(r.poor).toEqual([[], [], 160]);
  expect(r.disarmed).toEqual([0, 300]);
  expect(r.bought).toEqual([["cape"], ["green"], 300 - W.jacket[cape].price - W.pants[green].price]);
  // leaving with a locked Big One on: back to the last owned one, never saved
  await page.evaluate(n => { const b = window.__bb; b.progress.coins = 0; b.cycleBig(n - b.outfits.shown.big); }, robot);
  expect(await page.evaluate(() => window.__bb.outfits.shown.big)).toBe(robot);
  const dad = W.big.findIndex(q => q.id === "dad");                          // SPEC-021: the default Big One is the dad
  expect((await outfitsSaved(page)).big).toBe(dad);
  await page.keyboard.press("Escape");                                       // the shop's Wardrobe tab → home (SPEC-017)
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.outfits.shown.big, window.__bb.outfits.saved.big])).toEqual(["home", dad, dad]);   // SPEC-021: back to the default, the dad
  // a game never starts in a locked look (even without a drawn frame in between)
  const tophat = idx("hat", "tophat");
  const g = await page.evaluate(n => {
    const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.cycleOutfit("p1", "hat", n - b.outfits.shown.p1.hat); b.startGame(1);
    const out = { shown: b.outfits.shown.p1.hat, acc: b.littles[0].look.acc }; b.mode = "home"; return out;
  }, tophat);
  expect(g).toEqual({ shown: crown, acc: "crown" });
});

test("random outfit uses only owned items; bots may wear anything", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe(), seen = { hat: new Set(), jacket: new Set(), pants: new Set() }, bad = [];
    b.mode = "shop"; b.shopTab = "wardrobe";
    b.progress.owned.hats.push("crown"); b.progress.owned.jackets.push("ninja");
    for (let i = 0; i < 60; i++) {
      b.randomOutfit("p1");
      const o = b.outfits;
      for (const k of ["hat", "jacket", "pants"]) {
        const it = W[k][o.shown.p1[k]]; seen[k].add(it.id);
        if (it.price && !b.progress.owned[k === "hat" ? "hats" : k === "jacket" ? "jackets" : "pants"].includes(it.id)) bad.push(`${k} ${it.id}`);
      }
      if (JSON.stringify(o.shown) !== JSON.stringify(o.saved)) bad.push("shown ≠ saved after a random outfit");
    }
    // bots' looks come from their level and slot, whatever the player owns
    const botAcc = new Set();
    for (let n = 1; n <= 20; n++) { b.level = n; b.resetWorld(1); b.littles.filter(l => l.kind === "bot").forEach(l => botAcc.add(l.look.acc)); }
    b.level = 1; b.mode = "home";
    return { bad, hats: [...seen.hat].sort(), jackets: [...seen.jacket].sort(), botPaid: [...botAcc].filter(a => W.hat.find(q => q.id === a).price > 0).length };
  });
  expect(r.bad).toEqual([]);
  expect(r.hats).toEqual(["beanie", "bow", "cap", "crown", "none"]);        // the free four + the bought crown
  expect(r.jackets).toContain("ninja");
  expect(r.botPaid, "bots wear paid hats too").toBeGreaterThan(0);
});

// ---------- AC 4: worn clothes become owned ----------
test("old saves keep their outfits", async ({ page }) => {
  // the save from before SPEC-009 wears paid things: the Bear (fixture), plus a crown and the cape set here; a real reload
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saves", "pre-spec-009.json"), "utf8"));
  const W = await page.evaluate(() => window.__bb.wardrobe());
  const outfits = JSON.parse(JSON.stringify(f.keys["bebebe-outfits"]));
  outfits.p1.hat = W.hat.findIndex(q => q.id === "crown"); outfits.p2.jacket = W.jacket.findIndex(q => q.id === "cape");
  await page.evaluate(([pv, o]) => {
    localStorage.clear(); localStorage.setItem("bb-test-init", "1"); localStorage.setItem("bebebe-lang", "en");
    localStorage.setItem("bebebe-progress", JSON.stringify(pv)); localStorage.setItem("bebebe-outfits", JSON.stringify(o));
  }, [f.keys["bebebe-progress"], outfits]);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const r = await page.evaluate(() => ({ owned: window.__bb.progress.owned, o: window.__bb.outfits, coins: window.__bb.progress.coins, inv: window.__bb.progress.inv,
    stored: JSON.parse(localStorage.getItem("bebebe-progress")), storedOutfits: JSON.parse(localStorage.getItem("bebebe-outfits")) }));
  expect(r.owned).toEqual({ hats: ["crown"], jackets: ["cape"], pants: [], big: ["bear"] });
  expect(r.stored.owned, "written back once").toEqual(r.owned);
  expect(r.o.shown).toEqual(outfits);
  expect(r.o.saved).toEqual(outfits);
  expect(r.storedOutfits).toEqual(outfits);
  expect(r.coins).toBe(f.expect.progress.coins);
  expect(r.inv).toEqual(f.expect.progress.inv);
  // owned is cleaned on load: only paid ids of the right list, no duplicates; broken → empty, never throws
  const c = await page.evaluate(() => {
    const L = s => JSON.parse(JSON.stringify(window.__bb.loadProgress(s).owned));
    return [L({ owned: { hats: ["crown", "crown", "cap", "moon", 7], jackets: "junk", pants: ["green"], big: ["robot", "classic"] } }), L({ owned: "junk" }), L({ owned: null }), L({})];
  });
  expect(c[0]).toEqual({ hats: ["crown"], jackets: [], pants: ["green"], big: ["robot"] });
  for (const e of c.slice(1)) expect(e).toEqual({ hats: [], jackets: [], pants: [], big: [] });
  // a progress reset takes the bought clothes away and puts free ones on (so a reload does not give them back)
  const reset = await page.evaluate(() => { const b = window.__bb; b.resetProgress(); b.resetProgress(); return { o: b.outfits.saved, W: b.wardrobe() }; });
  for (const pk of ["p1", "p2"]) for (const k of ["hat", "jacket", "pants"]) expect(reset.W[k][reset.o[pk][k]].price, `${pk} ${k} free after a reset`).toBe(0);
  expect(reset.W.big[reset.o.big].price).toBe(0);
});

// ---------- AC 3: the wardrobe (SPEC-017: the shop's Wardrobe tab) fits, with locked items ----------
// p1: a locked hat and jacket; the Big One locked; (desktop) p2 locked pants. Two states: too few coins ("not enough" on
// the preview) and armed (enough coins, one column tapped once: "tap again" on its preview; tapping another column disarms
// the first). Three languages, fonts ×1 and ×1.15.
async function skinsProblems(page, phone) {
  const fails = [];
  const overlaps = (a, b) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;
  for (const lang of ["en", "es", "ru"]) for (const scale of [1, 1.15]) for (const state of ["poor", "p1", "big"]) {
    const at = `${lang} ×${scale} ${state}`;
    await page.evaluate(([l, s, st]) => {
      const b = window.__bb, W = b.wardrobe(), to = (pk, slot, k, id) => b.cycleOutfit(pk, slot, W[k].findIndex(q => q.id === id) - b.outfits.shown[pk][slot]);
      b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.resetOutfits(); b.mode = "shop"; b.shopTab = "wardrobe";
      to("p1", "hat", "hat", "viking"); to("p1", "jacket", "jacket", "cape"); to("p2", "pants", "pants", "pinkshorts");
      b.cycleBig(W.big.findIndex(q => q.id === "captain") - b.outfits.shown.big);
      b.progress.coins = st === "poor" ? 10 : 9999;
      if (st !== "poor") b.buyLook(st);
    }, [lang, scale, state]);
    await frames(page);
    const d = await page.evaluate(() => ({ buttons: window.__bb.buttonRects, hud: window.__bb.hudRects, ui: window.__bb.uiSize, scale: window.__bb.CFG.TEXT_TEST_SCALE, previews: window.__bb.skinPanels() }));
    if (phone) for (const h of d.hud.filter(q => q.id.startsWith("look-note:"))) for (const pv of d.previews) if (overlaps(h, pv)) fails.push(`${at}: ${h.id} covers the ${pv.key} preview`);
    const s = d.ui.scale, inside = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= d.ui.w + 0.01 && r.y + r.h <= d.ui.h + 0.01;
    const keys = phone ? ["p1", "big"] : ["p1", "p2", "big"];
    for (const k of keys) {
      const btn = d.buttons.find(q => q.id === "buy-look:" + k);
      if (!btn) { fails.push(`${at}: no buy-look:${k}`); continue; }
      if (btn.textW > btn.w - 4) fails.push(`${at}: buy-look:${k} text ${btn.textW} wider than the button ${btn.w}`);
      const note = d.hud.some(h => h.id === "look-note:" + k);
      if (note !== (state === "poor" || state === k)) fails.push(`${at}: look-note:${k} ${note ? "shown" : "missing"}`);
    }
    if (!d.hud.some(h => h.id === "coins")) fails.push(`${at}: no coins plate`);
    for (const b of d.buttons) {
      if (!inside(b)) fails.push(`${at}: button ${b.id || b.text} outside the screen`);
      if (phone && (b.w * s < 44 - 0.01 || b.h * s < 44 - 0.01)) fails.push(`${at}: button ${b.id || b.text} ${b.w * s}×${b.h * s} CSS px`);
      for (const h of d.hud) if (overlaps(b, h)) fails.push(`${at}: button ${b.id || b.text} on ${h.id}`);
    }
    d.buttons.forEach((a, i) => d.buttons.slice(i + 1).forEach(b => { if (overlaps(a, b)) fails.push(`${at}: ${a.id || a.text} on ${b.id || b.text}`); }));
    d.hud.forEach((a, i) => { if (!inside(a)) fails.push(`${at}: ${a.id} outside`); d.hud.slice(i + 1).forEach(b => { if (overlaps(a, b)) fails.push(`${at}: ${a.id} on ${b.id}`); }); });
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); b.resetOutfits(); b.mode = "home"; });
  return fails;
}

test("the wardrobe tab with locked items fits (desktop 960×640)", async ({ page }) => {
  const fails = await skinsProblems(page, false);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});

test("the wardrobe tab with locked items fits (phone 667×375)", async ({ phonePage: page }) => {
  const fails = await skinsProblems(page, true);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});

test("every wardrobe text is in three languages", async ({ simPage: page }) => {
  const I = await page.evaluate(() => { const I = window.__bb.I18N; return ["en", "es", "ru"].map(l => [I[l].buyFor(150), I[l].tapAgain]); });
  expect(I).toEqual([["Buy for 150", "Tap again to buy"], ["Comprar por 150", "Tocá otra vez para comprar"], ["Купить за 150", "Нажми ещё раз, чтобы купить"]]);
});

// ---------- AC 5: upgrades ----------
// __bb.UPGRADES (live object), __bb.upgrades (get: levels, a copy), __bb.buyUpgrade(key); __bb.shopTab (get/set "items"|"upgrades").
test("upgrades apply to players only and stop at level 3", { tag: "@fast" }, async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, U = b.UPGRADES, out = {};
    const keyEv = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
    out.U = JSON.parse(JSON.stringify(U));
    const cfg0 = JSON.stringify(C), diff0 = JSON.stringify(["park", "winter"].map(w => [1, 10, 20].map(n => b.difficulty(w, n))));
    // too few coins: nothing
    b.mode = "home"; b.progress.coins = 0;
    const s0 = b.sim().sounds, n0 = b.ledger().length;
    b.buyUpgrade("fastFeet");
    out.poor = { lv: b.upgrades.fastFeet, sound: b.sim().sounds > s0, ledger: b.ledger().length - n0 };
    // levels 1, 2, 3, then no more
    b.progress.coins = 5000;
    const n1 = b.ledger().length, lv = [];
    for (let i = 0; i < 4; i++) { b.buyUpgrade("fastFeet"); lv.push(b.upgrades.fastFeet); }
    out.levels = lv;
    out.spent = b.ledger().slice(n1).map(({ reason, amount }) => ({ reason, amount }));
    out.coinsAfter = b.progress.coins;
    for (let i = 0; i < 3; i++) { b.buyUpgrade("longItems"); b.buyUpgrade("quickHelp"); }
    out.all = b.upgrades;
    out.copy = (() => { const u = b.upgrades; u.fastFeet = 0; return b.upgrades.fastFeet; })();
    // CFG and the Big One's numbers never change
    out.cfgSame = JSON.stringify(C) === cfg0;
    out.diffSame = JSON.stringify(["park", "winter"].map(w => [1, 10, 20].map(n => b.difficulty(w, n)))) === diff0;
    // speed: player 1 walks right for 0.5 s on a free row, with and without the upgrade
    const G = b.grid, isFree = (cx, cy) => !G.blocked[cy * G.COLS + cx];
    const walk = () => {
      b.world = "park"; b.level = 1; b.startGame(1);
      const L = b.littles;
      L.forEach((l, i) => { if (i) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 40 + i * 40, y: 610, state: "ok" }); });
      Object.assign(b.big, { x: 60, y: 600, state: "look", timer: 9999, stun: 999, noPush: 999 });
      let spot = null;
      for (let cy = 6; cy < G.ROWS - 2 && !spot; cy++) for (let cx = 9; cx < G.COLS - 8 && !spot; cx++) {
        let ok = true; for (let k = -1; k < 6; k++) for (const dy of [-1, 0, 1]) if (!isFree(cx + k, cy + dy)) ok = false;
        const p = { x: (cx + 0.5) * G.CELL, y: (cy + 0.5) * G.CELL };
        if (ok && !b.inSafe(p) && !b.inDanger(p)) spot = p;
      }
      Object.assign(L[0], { ...spot, state: "ok", invuln: 0, kx: 0, ky: 0, hugAnim: 0, dizzy: 0 }); L[0].fx.boots = 0;
      keyEv("KeyD", true); for (let i = 0; i < 30; i++) b.update(1 / 60); keyEv("KeyD", false);
      const d = L[0].x - spot.x; b.mode = "home"; return d;
    };
    out.fast = walk();
    b.progress.upgrades.fastFeet = 0; out.slow = walk(); b.progress.upgrades.fastFeet = 3;
    // items: a player's boots last longer, a bot's do not; ITEM_LIFE stays (CFG unchanged above)
    b.world = "park"; b.level = 1; b.startGame(1);
    const L = b.littles, bot = L.find(l => l.kind === "bot");
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 999, noPush: 999 });
    Object.assign(L[0], { x: 600, y: 450, state: "ok", hugAnim: 0 }); L[0].fx.boots = 0;
    Object.assign(bot, { x: 300, y: 450, state: "ok", hugAnim: 0 }); bot.fx.boots = 0;
    b.items.length = 0;
    b.items.push({ id: 991, kind: "boots", x: 600, y: 450, t: 0, life: 30 }, { id: 992, kind: "shield", x: 300, y: 450, t: 0, life: 30 });
    b.update(1 / 60);
    out.items = { player: L[0].fx.boots, bot: bot.fx.shield, base: [C.BOOTS_TIME, C.SHIELD_TIME] };
    // rescue: a player lifts a friend in RESCUE_TIME × (1 − 3 × step); a bot needs the full RESCUE_TIME. Two players: player 2
    // helps (the upgrade levels are copied into each player when the level starts)
    b.startGame(2);
    b.littles.forEach((l, i) => { if (i > 1) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, x: 860, y: 60 + i * 40, state: "ok" }); });
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 999, noPush: 999 });
    Object.assign(b.littles[0], { state: "down", downTimer: 15, x: 400, y: 300, kx: 0, ky: 0, rescue: 0 });
    Object.assign(b.littles[1], { kind: "player", controls: { up: [], down: [], left: [], right: [] }, state: "ok", x: 420, y: 300 });
    const need = C.RESCUE_TIME * (1 - 3 * U.quickHelp.step);
    for (let i = 0; i < Math.round((need - 0.1) * 60); i++) b.update(1 / 60);
    out.rescueBefore = b.littles[0].state;
    for (let i = 0; i < 12; i++) b.update(1 / 60);
    out.rescueAfter = b.littles[0].state;
    // a bot next to the downed one: the time needed stays RESCUE_TIME
    b.startGame(1);
    const L2 = b.littles, helperBot = L2.find(l => l.kind === "bot");
    Object.assign(b.big, { x: 900, y: 600, state: "look", timer: 9999, stun: 999, noPush: 999 });
    Object.assign(L2[0], { state: "down", downTimer: 15, x: 400, y: 300, kx: 0, ky: 0, rescue: 0, botWait: 0 });
    Object.assign(helperBot, { x: 420, y: 300, state: "ok" });
    b.update(1 / 60);
    out.botNeed = L2[0].rescueNeed;
    b.mode = "home";
    return out;
  });
  expect(r.U).toEqual({ fastFeet: { step: 0.03, prices: [150, 300, 450] }, longItems: { step: 0.15, prices: [150, 300, 450] }, quickHelp: { step: 0.1, prices: [150, 300, 450] } });   // SPEC-026: ×1.5
  expect(r.poor).toEqual({ lv: 0, sound: true, ledger: 0 });
  expect(r.levels).toEqual([1, 2, 3, 3]);
  expect(r.spent).toEqual([150, 300, 450].map(a => ({ reason: "buy:upgrade:fastFeet", amount: -a })));
  expect(r.coinsAfter).toBe(5000 - 900);
  expect(r.all).toEqual({ fastFeet: 3, longItems: 3, quickHelp: 3 });
  expect(r.copy, "__bb.upgrades is a copy").toBe(3);
  expect(r.cfgSame, "upgrades change no CFG value").toBe(true);
  expect(r.diffSame, "the Big One's numbers stay").toBe(true);
  expect(r.fast / r.slow).toBeCloseTo(1 + 3 * 0.03, 2);                 // +9 %
  expect(r.items.player).toBeCloseTo(r.items.base[0] * (1 + 3 * 0.15), 5);
  expect(r.items.bot, "a bot's item lasts the normal time").toBe(r.items.base[1]);
  expect([r.rescueBefore, r.rescueAfter]).toEqual(["down", "ok"]);      // 2.1 s instead of 3
  expect(r.botNeed, "a bot needs the full RESCUE_TIME").toBe(3);
});

test("upgrades are saved, merged with defaults and cleaned", async ({ simPage: page }) => {
  const c = await page.evaluate(() => {
    const L = s => JSON.parse(JSON.stringify(window.__bb.loadProgress(s).upgrades));
    return [L({ upgrades: { fastFeet: 2, longItems: 9, quickHelp: "x", jump: 3 } }), L({ upgrades: { fastFeet: 1.7, longItems: -2 } }), L({ upgrades: "junk" }), L({ upgrades: null }), L({ coins: 4 })];
  });
  expect(c).toEqual([{ fastFeet: 2, longItems: 3, quickHelp: 0 }, { fastFeet: 1, longItems: 0, quickHelp: 0 }, ...Array(3).fill({ fastFeet: 0, longItems: 0, quickHelp: 0 })]);
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 450; b.buyUpgrade("quickHelp"); b.buyUpgrade("quickHelp"); });   // SPEC-026: 150 + 300
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => [window.__bb.upgrades, window.__bb.progress.coins])).toEqual([{ fastFeet: 0, longItems: 0, quickHelp: 2 }, 0]);
  expect(await page.evaluate(() => { const b = window.__bb; b.resetProgress(); b.resetProgress(); return b.upgrades; })).toEqual({ fastFeet: 0, longItems: 0, quickHelp: 0 });
});

test("the shop has an Items tab and an Upgrades tab", async ({ page }) => {
  await page.evaluate(() => { window.__bb.mode = "shop"; });
  await frames(page);
  const ids = () => page.evaluate(() => window.__bb.buttonRects.map(q => q.id));
  let b = await ids();
  expect(b).toEqual(expect.arrayContaining(["tab:items", "tab:upgrades", "buy:mittens", "buy:mega", "buy:kisses", "buy:rescues"]));
  expect(await page.evaluate(() => window.__bb.shopTab)).toBe("items");
  // a click on the tab; the keyboard arrows switch too
  const at = await page.evaluate(() => {
    const q = window.__bb.buttonRects.find(r => r.id === "tab:upgrades"), c = document.getElementById("game").getBoundingClientRect();
    return { x: c.left + (q.x + q.w / 2) * c.width / 960, y: c.top + (q.y + q.h / 2) * c.height / 640 };
  });
  await page.mouse.click(at.x, at.y);
  await frames(page);
  b = await ids();
  expect(await page.evaluate(() => window.__bb.shopTab)).toBe("upgrades");
  expect(b).toEqual(expect.arrayContaining(["upg:fastFeet", "upg:longItems", "upg:quickHelp"]));
  expect(b.some(id => String(id).startsWith("buy:"))).toBe(false);
  // a level shows as dots; the max level has no price
  await page.evaluate(() => { const b = window.__bb; b.progress.upgrades.longItems = 2; b.progress.upgrades.quickHelp = 3; });
  await frames(page);
  const d = await page.evaluate(() => ({ hud: window.__bb.hudRects, btn: window.__bb.buttonRects.filter(q => String(q.id).startsWith("upg:")), I: window.__bb.I18N.en }));
  expect(d.hud.find(h => h.id === "upg-dots:longItems").text).toBe("●●○");
  expect(d.hud.find(h => h.id === "upg-dots:fastFeet").text).toBe("○○○");
  expect(d.btn.find(q => q.id === "upg:longItems").text).toContain("450");   // SPEC-026: level 3 costs 450
  expect(d.btn.find(q => q.id === "upg:quickHelp").text).toContain(d.I.upgMax);
  await page.keyboard.press("ArrowLeft");                                     // SPEC-017: three tabs — Items · Wardrobe · Upgrades
  await frames(page);
  expect(await page.evaluate(() => window.__bb.shopTab)).toBe("wardrobe");
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.__bb.shopTab)).toBe("items");
  await page.keyboard.press("ArrowRight");
  // leaving the shop: next time it opens on Items
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await frames(page);
  await page.evaluate(() => { window.__bb.mode = "shop"; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.shopTab)).toBe("items");
  await page.evaluate(() => { window.__bb.mode = "home"; });
});

// the Upgrades tab fits: three languages, fonts ×1 / ×1.15, too few coins and plenty (one upgrade at max)
async function upgradeTabProblems(page, phone) {
  const fails = [];
  const overlaps = (a, b) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;
  const KEYS = ["fastFeet", "longItems", "quickHelp"];
  for (const lang of ["en", "es", "ru"]) for (const scale of [1, 1.15]) for (const coins of [10, 9999]) {
    const at = `${lang} ×${scale} ${coins} coins`;
    await page.evaluate(([l, s, cn]) => {
      const b = window.__bb; b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.progress.coins = cn;
      Object.assign(b.progress.upgrades, { fastFeet: 0, longItems: 2, quickHelp: 3 }); b.mode = "shop"; b.shopTab = "upgrades";
    }, [lang, scale, coins]);
    await frames(page);
    const d = await page.evaluate(() => { const b = window.__bb, resets = ["en", "es", "ru"].flatMap(l => ["reset", "resetShort", "sure", "sureShort"].map(k => b.I18N[l][k]));
      return { buttons: b.buttonRects, hud: b.hudRects, ui: b.uiSize, texts: b.textSizes, min: b.CFG.PHONE_TEXT, tab: b.shopTab, resets }; });
    if (d.tab !== "upgrades") { fails.push(`${at}: tab ${d.tab}`); continue; }
    // SPEC-026: Reset progress moved to the Character's Progress page — not on the Upgrades tab
    if (d.buttons.some(q => d.resets.includes(q.text))) fails.push(`${at}: a reset button on the Upgrades tab`);
    const s = d.ui.scale, inside = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= d.ui.w + 0.01 && r.y + r.h <= d.ui.h + 0.01;
    const btns = KEYS.map(k => d.buttons.find(q => q.id === "upg:" + k));
    if (btns.some(q => !q)) { fails.push(`${at}: missing upgrade buttons`); continue; }
    const cx = btns.map(q => q.x + q.w / 2), cols = cx.map((x, i) => [i ? (cx[i - 1] + x) / 2 : 0, i < 2 ? (x + cx[i + 1]) / 2 : d.ui.w]);
    const parts = d.hud.filter(h => h.id.startsWith("upg-"));
    KEYS.forEach((k, i) => {
      const mine = parts.filter(p => p.id.endsWith(":" + k));
      for (const id of ["pic", "name", "dots", "desc"]) if (!mine.some(p => p.id === `upg-${id}:${k}`)) fails.push(`${at}: no upg-${id}:${k}`);
      const poor = coins === 10 && k !== "quickHelp";
      if (mine.some(p => p.id === "upg-no:" + k) !== poor) fails.push(`${at}: upg-no:${k} ${poor ? "missing" : "shown"}`);
      for (const p of mine) if (p.x < cols[i][0] - 0.01 || p.x + p.w > cols[i][1] + 0.01) fails.push(`${at}: ${p.id} leaves its card ${JSON.stringify(p)}`);
    });
    for (const b of d.buttons) {
      if (!inside(b)) fails.push(`${at}: button ${b.id || b.text} outside`);
      if (b.textW !== undefined && b.textW > b.w + 0.5) fails.push(`${at}: button ${b.id || b.text} text ${b.textW} > ${b.w}`);
      if (phone && (b.w * s < 44 - 0.01 || b.h * s < 44 - 0.01)) fails.push(`${at}: button ${b.id || b.text} ${b.w * s}×${b.h * s} CSS px`);
      for (const h of d.hud) if (overlaps(b, h)) fails.push(`${at}: button ${b.id || b.text} on ${h.id}`);
    }
    d.buttons.forEach((a, i) => d.buttons.slice(i + 1).forEach(b => { if (overlaps(a, b)) fails.push(`${at}: ${a.id || a.text} on ${b.id || b.text}`); }));
    d.hud.forEach((a, i) => { if (!inside(a)) fails.push(`${at}: ${a.id} outside`); d.hud.slice(i + 1).forEach(b => { if (overlaps(a, b)) fails.push(`${at}: ${a.id} on ${b.id}`); }); });
    if (phone) for (const cat of ["main", "hint"]) if (!(d.texts[cat] * s >= d.min[cat] - 0.01)) fails.push(`${at}: smallest ${cat} text ${d.texts[cat] * s}`);
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); b.mode = "home"; });
  return fails;
}

test("the Upgrades tab fits (desktop 960×640)", async ({ page }) => {
  const fails = await upgradeTabProblems(page, false);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});
// (Playwright reads the fixture names from the test function, so one test per phone size)
test("the Upgrades tab fits (phone 667×375)", async ({ phonePage: page }) => {
  const fails = await upgradeTabProblems(page, true);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});
test("the Upgrades tab fits (phone 844×390)", async ({ phone844: page }) => {
  const fails = await upgradeTabProblems(page, true);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});
test("the Upgrades tab fits (phone 932×430)", async ({ phone932: page }) => {
  const fails = await upgradeTabProblems(page, true);
  expect(fails, fails.slice(0, 12).join("\n")).toEqual([]);
});

test("every upgrade text is in three languages", async ({ simPage: page }) => {
  const I = await page.evaluate(() => { const I = window.__bb.I18N; return ["en", "es", "ru"].map(l => [I[l].itemsTab, I[l].upgradesTab, I[l].upgMax, ...["fastFeet", "longItems", "quickHelp"].map(k => [I[l].upg[k].name, I[l].upg[k].desc(3)])]); });
  expect(I[0]).toEqual(["Items", "Upgrades", "Max", ["Fast feet", "+3% speed"], ["Long items", "Items last longer"], ["Quick help", "Lift friends faster"]]);
  expect(I[1]).toEqual(["Cosas", "Mejoras", "Máximo", ["Pies rápidos", "+3% velocidad"], ["Cosas duraderas", "Duran más"], ["Ayuda rápida", "Levantás más rápido"]]);
  expect(I[2]).toEqual(["Вещи", "Улучшения", "Максимум", ["Быстрые ноги", "+3% скорости"], ["Долгие вещи", "Действуют дольше"], ["Быстрая помощь", "Поднимаешь быстрее"]]);
});

// ---------- AC 7–8: the economy section of the balance report (pure, no browser) ----------
test("the balance report's economy targets are computed from the runs' coins", { tag: "@fast" }, () => {
  const { analyseEconomy } = require("../scripts/balance.js");
  const { readValue } = require("../scripts/docs-numbers.js");
  const B = readValue(fs.readFileSync(INDEX, "utf8"), "CFG").BALANCE, E = B.ECONOMY;
  const worlds = ["park", "school", "beach", "winter"], perWorld = 6, prices = { cheapest: 15, mega: 60, top: 150, upgrades: 1800 };
  // careful runs: 3 seeds per level; Park pays 40 / 50 / 60 → median 50; the other worlds 100 each; one lost run of 3 coins
  const runs = [];
  worlds.forEach(w => { for (let n = 1; n <= perWorld; n++) [40, 50, 60].forEach((v, k) => runs.push({ world: w, n, style: "careful", seed: k, win: true, time: 60, coins: w === "park" ? v : 100 })); });
  runs.push({ world: "park", n: 1, style: "reckless", seed: 0, win: false, time: 480, coins: 3 });
  const replayRuns = [{ world: "park", n: 1, seed: 0, win: true, time: 60, coins: 10, parts: [] }, { world: "park", n: 2, seed: 0, win: true, time: 60, coins: 50, parts: [] }];
  const upgradeRuns = [17, 18, 19, 20].map(n => ({ world: E.UPG_EXTRA[0], n, seed: 0, win: true, time: 40, coins: 0 }));
  const ec = analyseEconomy(runs, replayRuns, upgradeRuns, B, worlds, perWorld, prices), ok = ec.targets.map(t => t.ok);
  expect(ec.worlds.map(r => [r.world, r.median, r.total, r.streak])).toEqual([["park", 50, 300, 200], ["school", 100, 600, 400], ["beach", 100, 600, 400], ["winter", 100, 600, 400]]);
  expect(ok[0], "Park median 50 is within PARK_PACKS × 15").toBe(true);
  expect(ok[3], "1800 > UPGRADE_SHARE of 1500").toBe(false);
  expect(ec.targets[0].want, "a fractional pack count prints as whole coins (SPEC-026: 1.6 × 15)").toBe(`${+(E.PARK_PACKS[0] * 15).toFixed(6)}–${E.PARK_PACKS[1] * 15}`);
  // replay: (10 + 50) / 2 min vs (40 + 40) / 2 min (the seed-0 first runs) = 75 % → red; park 2 pays 50 ≥ its first win 40 → red
  expect(ec.replay.map(r => [r.n, r.firstCoins, r.replayCoins])).toEqual([[1, 40, 10], [2, 40, 50]]);
  expect([ok[4], ok[5]]).toEqual([false, false]);
  // the upgrades pass needs the same levels in the first pass: here there are none past level 6, so it has no pairs
  expect(ec.upgrades).toEqual([]);
  expect(ok[6], "no upgrade runs to compare: not green").toBe(false);
  // SPEC-026: the pace lines (no targets) — levels per pack in the Park (median 50) and per upgrade level (first 3 worlds: median 100)
  const ec2 = analyseEconomy(runs, replayRuns, upgradeRuns, B, worlds, perWorld,
    { ...prices, packs: [{ k: "kisses", price: 20 }, { k: "rescues", price: 50 }], upgradeLevels: [150, 300, 450] });
  expect(ec2.targets.map(t => t.ok), "the pace adds no target").toEqual(ok);
  expect(ec2.pace.packs).toEqual([{ k: "kisses", price: 20, levels: 0.4 }, { k: "rescues", price: 50, levels: 1 }]);
  expect(ec2.pace.upgrades.map(q => [q.level, q.price, q.levels])).toEqual([[1, 150, 1.5], [2, 300, 3], [3, 450, 4.5]]);
  expect(ec2.pace.allUpgrades).toEqual({ price: 1800, levels: 18 });
});

// ---------- review fixes (SPEC-009 fix round 1) ----------
test("the Friends screen keeps a try-on; a save that knows owned clothes does not get worn ones for free", async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe(), crown = W.hat.findIndex(q => q.id === "crown");
    b.mode = "shop"; b.shopTab = "wardrobe"; b.cycleOutfit("p1", "hat", crown - b.outfits.shown.p1.hat);
    return crown;
  });
  await page.evaluate(() => { window.__bb.wardrobePage = "friends"; });      // SPEC-017: Friends is a page of the Wardrobe tab
  await frames(page);
  expect(await page.evaluate(() => window.__bb.outfits.shown.p1.hat), "still trying on with Friends open").toBe(r);
  await page.evaluate(() => { window.__bb.wardrobePage = "looks"; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.outfits.shown.p1.hat)).toBe(r);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await frames(page);
  expect(await page.evaluate(() => window.__bb.outfits.shown.p1.hat), "the home screen ends it").not.toBe(r);
  // a SPEC-009 save (it has owned) wearing a crown it never bought: the crown is taken off, not given
  await page.evaluate(c => {
    localStorage.setItem("bebebe-progress", JSON.stringify({ coins: 5, owned: { hats: [], jackets: [], pants: [], big: [] } }));
    localStorage.setItem("bebebe-outfits", JSON.stringify({ p1: { hair: 0, hat: c, jacket: 0, pants: 0 }, p2: { hair: 1, hat: 4, jacket: 1, pants: 3 }, big: 0 }));
  }, r);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  const after = await page.evaluate(() => ({ owned: window.__bb.progress.owned.hats, hat: window.__bb.outfits.saved.p1.hat, stored: JSON.parse(localStorage.getItem("bebebe-outfits")).p1.hat }));
  expect(after).toEqual({ owned: [], hat: 1, stored: 1 });   // back to the free default cap
});

test("a pause during the final hug and Map still counts the win; coins load as a whole number ≥ 0", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, key = code => window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    b.world = "park"; b.level = 3; b.startGame(1);
    Object.assign(b.big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0, hp: 1 });
    Object.assign(b.littles[0], { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 466, y: 320 });
    b.update(1 / 60);                                     // the last heart: the win is coming
    const n0 = b.ledger().length;
    b.mode = "pause"; key("KeyQ");                        // pause → Map before the win screen
    const n1 = b.ledger().length;
    for (let i = 0; i < 180; i++) b.update(1 / 60);       // the win timer must not pay it a second time
    const n2 = b.ledger().length;
    return { n1, n2, mode: b.mode, won: b.progress.worlds.park.won[3] === true, unlocked: b.progress.worlds.park.unlocked, reasons: b.ledger().slice(n0).map(e => e.reason),
      coins: [{ coins: -5 }, { coins: "lots" }, { coins: 7.9 }, { coins: 12 }, {}].map(s => b.loadProgress(s).coins) };
  });
  expect(r.mode).toBe("map");
  expect(r.won, "the win is kept").toBe(true);
  expect(r.unlocked).toBe(4);
  expect(r.reasons.filter(x => x === "firstWin"), "the win is paid exactly once").toEqual(["firstWin"]);
  expect(r.n2, "nothing more is paid after the map").toBe(r.n1);
  expect(r.coins).toEqual([0, 0, 7, 12, 0]);
});
