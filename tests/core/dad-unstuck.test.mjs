// SPEC-037: Dad never stands stuck — the stall detector itself (AC 1), the re-path rule (AC 3) and the autopilot hangs of the
// balance report (AC 4). The all-levels guard is tests/stall/ (`npm run test:stall`, its own CI job).
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, autopilot, createGame, setProgress, step, withGame, bigReach, reachableGoal, cellIdx } from "../../src/core/index.js";
import { stallDetector, stallExempt } from "../stall/detector.mjs";

const DT = CFG.STEP, S = CFG.BALANCE.STALL;
const fakeGame = (over = {}) => ({ big: { x: 100, y: 100, state: "patrol", stun: 0, blush: 0, slip: 0, pushCd: 0, kind: false, hearTurnT: 0, hearLook: 0, goal: null, lastSeen: null, ...over }, stats: { time: 0 }, tutorialGame: 0, tut: { script: false }, phase: "play" });
// feeds the detector with Dad standing at (x, y) for `seconds`, `mutate` changes the game each step; returns the stalls
function watch(seconds, over = {}, mutate = () => {}) {
  const g = fakeGame(over), d = stallDetector();
  for (let i = 0; i < Math.round(seconds / DT); i++) { g.stats.time += DT; mutate(g, i); d.observe(g); }
  return d.stalls;
}

test("detector: standing in patrol or search for more than the stall time is a stall; less is not", () => {
  assert.equal(watch(S.TIME - 0.2).length, 0);
  assert.equal(watch(S.TIME + 0.2).length, 1);
  assert.equal(watch(S.TIME + 0.2, { state: "search" }).length, 1);
});
test("detector: moving at least half a cell resets the window; less than that does not", () => {
  assert.equal(watch(2 * S.TIME, {}, (g, i) => { g.big.x = 100 + (i % 2 ? 0 : S.MOVE_CELLS * CELL * 0.9); }).length >= 1, true);
  assert.equal(watch(2 * S.TIME, {}, (g, i) => { g.big.x += (S.MOVE_CELLS * CELL * 1.2) / (S.TIME / DT) * 1.5; }).length, 0, "a walking Dad is not flagged");
});
test("detector: every allowed way to stand still is exempt", () => {
  for (const over of [{ state: "look" }, { state: "chase" }, { stun: 1 }, { blush: 1 }, { slip: 1 }, { pushCd: 1 }, { kind: true }, { hearTurnT: 1 }, { hearLook: 1 }]) {
    assert.equal(watch(S.TIME + 1, over).length, 0, JSON.stringify(over));
    assert.ok(stallExempt(fakeGame(over)), JSON.stringify(over));
  }
  const script = fakeGame(); script.tutorialGame = 1; script.tut.script = true;
  assert.ok(stallExempt(script));
  assert.ok(!stallExempt(fakeGame()));
});

const play = (world, n, style, seed, seconds) => {
  setProgress(null);
  const g = createGame({ world, n, seed, fx: false, slots: [{ slot: "p1", kind: "player" }] });
  withGame(g, () => autopilot(true, style));
  for (let i = 0, N = Math.round(seconds / DT); i < N && g.phase !== "won"; i++) step(g, DT);
  return g;
};

// AC 4: the hangs of the balance report (seeds of its runs) — Dad stood in "search" / "patrol" against a wall or a fallen friend for ever
test("the balance hangs are gone: School 20 reckless, Field 17 careful, Beach 19 careful are won within the time limit", () => {
  for (const [world, n, style, seed] of [["school", 20, "reckless", 220187], ["field", 17, "careful", 517176], ["beach", 19, "careful", 319188]]) {
    const g = play(world, n, style, seed, CFG.BALANCE.TIME_LIMIT);
    assert.equal(g.phase, "won", `${world} ${n} ${style} seed ${seed} was won (time ${g.stats.time.toFixed(0)} s)`);
    assert.ok(g.stats.time < CFG.BALANCE.STALL.STUCK_TIME, `${world} ${n} ${style}: won in ${g.stats.time.toFixed(0)} s, before it counts as stuck`);
  }
});
test("BIG_UNSTUCK_TIME 0 is the game before SPEC-037: School 20 reckless hangs again (the test sees the cause)", () => {
  const keep = CFG.BIG_UNSTUCK_TIME;
  CFG.BIG_UNSTUCK_TIME = 0;
  try { assert.notEqual(play("school", 20, "reckless", 220187, CFG.BALANCE.TIME_LIMIT).phase, "won"); } finally { CFG.BIG_UNSTUCK_TIME = keep; }
});

// AC 3: a lying friend does not move, so for Dad he is a wall — a goal behind him is not reachable, and the nearest reachable cell to a spot
// under him is next to him; an unreachable goal is not kept
test("re-path: cells near a lying friend are not goals, the goal nearest to his spot is a reachable cell beside him", () => {
  setProgress(null);
  const g = createGame({ world: "park", n: 1, seed: 5, fx: false, slots: [{ slot: "p1", kind: "player" }] });
  withGame(g, () => {
    const kid = g.littles[0];
    Object.assign(kid, { state: "down", x: g.big.x + 3 * CELL, y: g.big.y });
    const reach = bigReach();
    assert.equal(reach[cellIdx(g.big.x, g.big.y)], 1, "his own cell is reachable");
    const p = reachableGoal(kid.x, kid.y);
    assert.ok(reach[cellIdx(p.x, p.y)], "the goal is a reachable cell");
    assert.ok(Math.hypot(p.x - kid.x, p.y - kid.y) >= g.big.r + kid.r, "and he can stand there: not under the friend");
    assert.ok(Math.hypot(p.x - kid.x, p.y - kid.y) < 3 * CELL, "next to him, not across the map");
  });
});
