// SPEC-009: the coins economy — the ledger (every coin change goes through addCoins / spendCoins and is logged),
// the earning rules, the wardrobe and the upgrades.
const base = require("@playwright/test");
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { openGame, sharedPage, resetGame, ROOT } = require("./helpers");

// SPEC-018: one game page for the file; resetGame() before each test, page errors and a changed CFG fail the test.
// A test that does not ask for `page` (the source scan) opens no browser at all.
const shared = sharedPage();
const test = base.test.extend({
  page: async ({ browser }, use) => {
    const s = await shared.get(browser, "economy", { viewport: { width: 960, height: 640 } }, p => openGame(p));
    await resetGame(s.page);
    const cfg = await s.page.evaluate(() => JSON.stringify(window.__bb.CFG));
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
    expect(await s.page.evaluate(() => JSON.stringify(window.__bb.CFG)), "the test restores every CFG value it changed").toBe(cfg);
  }
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
