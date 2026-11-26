// SPEC-012 AC 6 / 6b: the core never pays — star coins and spent charges are gameplay events (coins, spent), a win is the result
// event, and the reward is the pure computeReward(progress, result). Plain Node: npm run test:core.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, REWARD, autopilot, computeReward, createGame, freshProgress, progress, setProgress, step, withGame } from "../../src/core/index.js";

const DT = CFG.STEP;

test("result sums match the event log", () => {
  const max0 = CFG.EVENT_LOG_MAX;
  CFG.EVENT_LOG_MAX = 1e6;                                   // the whole level in the log (the perSlot counts read it)
  try {
    setProgress(null);
    const coins0 = progress.coins, inv0 = JSON.stringify(progress.inv);
    const g = createGame({ world: "park", n: 1, seed: 21, stock: { kisses: 4, kits: 2 },
      slots: [{ slot: "p1", kind: "player", glove: "mittens" }, { slot: "p2", kind: "player" }] });
    g.stock.gloves.mittens = 1;
    withGame(g, () => autopilot(true, "careful"));
    for (let i = 0; i < Math.round(180 / DT) && g.phase !== "won"; i++) step(g, DT);
    assert.equal(g.phase, "won");
    assert.deepEqual([progress.coins, JSON.stringify(progress.inv)], [coins0, inv0], "the core never touched progress");
    const ev = g.events, results = ev.filter(e => e.type === "result");
    assert.equal(results.length, 1);
    const r = results[0], ps = Object.values(r.perSlot), sum = k => ps.reduce((s, c) => s + c[k], 0), count = (t, f = () => true) => ev.filter(e => e.type === t && f(e)).length;
    assert.deepEqual(Object.keys(r.perSlot), g.littles.map(l => l.slot));
    assert.deepEqual([r.world, r.n, r.win, r.time, r.nobodyOut], ["park", 1, true, g.stats.time, g.stats.rests === 0]);
    assert.equal(sum("hugs"), g.stats.hugs);
    assert.equal(sum("hugs"), count("hug"));
    assert.equal(sum("rests"), g.stats.rests);
    assert.equal(sum("pushes"), count("push", e => !e.blocked));
    assert.equal(sum("starCoins"), g.stats.starCoins);
    assert.equal(ev.filter(e => e.type === "coins").reduce((s, e) => s + e.amount, 0), g.stats.starCoins, "the star coins events add up to the star coins");
    assert.equal(sum("kissesUsed"), count("spent", e => e.kind === "kiss"));
    assert.equal(sum("kitsUsed"), count("spent", e => e.kind === "kit"));
    assert.equal(sum("gloveChargesUsed"), count("spent", e => e.kind === "glove"));
    assert.equal(4 - g.stock.kisses, sum("kissesUsed"), "the stock went down by what was spent");
    assert.ok(count("spent") > 0 && count("hug") > 0, "the level used the stock and had hugs");
    // the reward: pure (progress unchanged), its lines and the star coins make its total
    const p = freshProgress(), before = JSON.stringify(p), c = computeReward(p, r);
    assert.equal(JSON.stringify(p), before, "computeReward changes nothing");
    assert.equal(c.lines.reduce((s, l) => s + l.amount, 0) + r.stats.starCoins, c.reward.coins);
    assert.deepEqual([c.reward.first, c.world.name, c.world.n, c.world.unlocked], [true, "park", 1, 2]);
    // a lost level pays the players' hugs only
    const lost = computeReward(p, { ...r, win: false });
    assert.deepEqual(lost.lines, r.stats.playerHugs ? [{ reason: "hugs", amount: r.stats.playerHugs * REWARD.PER_HUG }] : []);
  } finally { CFG.EVENT_LOG_MAX = max0; }
});
