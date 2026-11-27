// SPEC-037 AC 4: the balance report names a run as stuck, with its seed, when more than CFG.BALANCE.STALL.STUCK_TIME s of game time pass
// in it with no heart taken (no hug), up to its end (decided during the run: the core has no loss state). runLevel measures the stretch (noHug).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { CFG } from "../../src/core/index.js";

const { stuckRuns, stuckTarget } = createRequire(import.meta.url)("../../scripts/balance.js");
const B = CFG.BALANCE, S = B.STALL.STUCK_TIME;
const run = (over = {}) => ({ world: "school", n: 20, style: "reckless", seed: 220187, win: false, time: B.TIME_LIMIT, noHug: B.TIME_LIMIT, falls: 0, ...over });

test("stuck runs: a no-hug stretch over the limit is listed with its seed (won or not); steady slow wins are not", () => {
  const runs = [
    run(),                                                                       // timed out, no hug at all
    run({ n: 3, seed: 1, win: true, time: 400, noHug: 100 }),                    // hugs every 100 s up to 400 s and wins: not stuck
    run({ n: 4, seed: 2, win: false, time: B.TIME_LIMIT, noHug: S - 1 }),        // a long run that keeps hugging
    run({ n: 5, seed: 3, win: true, time: 300, noHug: 250, pass: "replay" }),    // won, but 250 s with no hug: stuck
    run({ n: 6, seed: 4, win: false, time: B.TIME_LIMIT, noHug: S + 1, pass: "upgrades" })   // time-out with a long no-hug tail
  ];
  const stuck = stuckRuns(runs, B);
  assert.deepEqual(stuck.map(r => [r.world, r.n, r.seed, r.pass, r.win]), [["school", 20, 220187, "main", false], ["school", 5, 3, "replay", true], ["school", 6, 4, "upgrades", false]]);
  const t = stuckTarget(stuck, B);
  assert.ok(!t.ok && t.value === "3 stuck" && t.detail.includes("seed 220187"));
  assert.ok(stuckTarget(stuckRuns([run({ win: true, time: 90, noHug: 40 })], B), B).ok);
});
