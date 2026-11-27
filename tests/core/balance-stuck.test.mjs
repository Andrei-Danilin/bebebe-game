// SPEC-037 AC 4: the balance report names a run that is not won after CFG.BALANCE.STALL.STUCK_TIME s as stuck, with its seed.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { CFG } from "../../src/core/index.js";

const { stuckRuns, stuckTarget } = createRequire(import.meta.url)("../../scripts/balance.js");
const B = CFG.BALANCE, S = B.STALL.STUCK_TIME;
const run = (over = {}) => ({ world: "school", n: 20, style: "reckless", seed: 220187, win: false, time: B.TIME_LIMIT, falls: 0, ...over });

test("stuck runs: not won after the limit are listed with their seeds, wins and quick ends are not", () => {
  const runs = [run(), run({ n: 3, seed: 1, win: true, time: S + 100 }), run({ n: 4, seed: 2, win: false, time: S - 1 }), run({ n: 5, seed: 3, pass: "replay" })];
  const stuck = stuckRuns(runs, B);
  assert.deepEqual(stuck.map(r => [r.world, r.n, r.style, r.seed, r.pass]), [["school", 20, "reckless", 220187, "main"], ["school", 5, "reckless", 3, "replay"]]);
  const t = stuckTarget(stuck, B);
  assert.ok(!t.ok && t.value === "2 stuck" && t.detail.includes("seed 220187"));
  assert.ok(stuckTarget(stuckRuns([run({ win: true, time: 90 })], B), B).ok);
});
