// SPEC-036 AC 1 / 2: while a friend helps a fallen kid up, that kid's "go home" timer stops; when the helper leaves it goes on
// from where it stopped; the rescue progress itself melts at RESCUE_DRAIN as before (the kids' rule). Plain Node: npm run test:core.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, createGame, step } from "../../src/core/index.js";

const DT = CFG.STEP;
const run = (g, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) step(g, DT); };
const near = (a, b, eps = 2 * DT) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b} (±${eps})`);

// kid 0 lies down at once (fresh timer), kid 1 is the helper (a player, no controls: stands where we put him), the rest rests far away
function setup() {
  const g = createGame({ world: "park", n: 2, seed: 11, fx: false });
  const [l0, l1, ...rest] = g.littles;
  Object.assign(g.big, { x: 1500, y: 900, state: "look", timer: 1e9, stun: 0, slip: 0, noPush: 0, pushCd: 0 });
  Object.assign(l0, { state: "down", downTimer: CFG.DOWN_TIME, rescue: 0, kx: 0, ky: 0, botWait: 1e9 });
  Object.assign(l1, { kind: "player", state: "ok", x: l0.x + 20, y: l0.y, invuln: 0, kx: 0, ky: 0 });
  for (const o of rest) Object.assign(o, { state: "rest", restTimer: 1e9, restSpot: { x: o.x, y: o.y } });
  return { g, l0, l1, away: () => { l1.x = l0.x + 600; }, back: () => { l1.x = l0.x + 20; } };
}

test("the timer keeps running with nobody near, and stops while a helper is next to the kid, then goes on (5 s / 2 s / leave)", () => {
  const { g, l0, l1, away, back } = setup();
  away();
  run(g, 5);
  near(l0.downTimer, CFG.DOWN_TIME - 5);
  back();
  run(g, 2 - 3 * DT);                                   // 2 s of help, a hair short of RESCUE_TIME 3 s
  assert.equal(l0.state, "down");
  near(l0.downTimer, CFG.DOWN_TIME - 5, 2 * DT);        // paused: still DOWN_TIME − 5 at the moment of leaving
  assert.ok(l0.rescue > 1.9 && l0.rescue < 2.1);
  const paused = l0.downTimer;
  away();
  run(g, 1);
  near(l0.downTimer, paused - 1);                       // keeps counting down from the paused value
  assert.equal(l1.state, "ok");
});

test("the rescue progress melts at RESCUE_DRAIN after the helper leaves, as before", () => {
  const { g, l0, away, back } = setup();
  back(); run(g, 2);
  const r0 = l0.rescue;
  away(); run(g, 1);
  near(l0.rescue, r0 - CFG.RESCUE_DRAIN, 3 * DT);
});

test("a helper who stays the whole time: the timer never falls, and the kid is up after RESCUE_TIME", () => {
  const { g, l0, back } = setup();
  back();
  g.littles[0].downTimer = 0.5;                         // almost out of time: a late rescue must still work
  for (let i = 0; i < Math.round(CFG.RESCUE_TIME / DT) + 5 && l0.state === "down"; i++) { step(g, DT); assert.equal(l0.downTimer, 0.5); }
  assert.equal(l0.state, "ok", "rescued, not sent home");
  assert.equal(g.stats.rests, 0);
});

test("a helper who stays longer than DOWN_TIME cannot make the timer run out (a stuck rescue is never lost)", () => {
  const { g, l0, l1, back } = setup();
  back();
  l0.downTimer = 0.2;
  // keep the rescue from completing: the helper "helps" but progress is held back by the need (an absurdly slow rescue)
  const save = CFG.RESCUE_TIME;
  try {
    CFG.RESCUE_TIME = 1e6;
    run(g, 3);
    assert.equal(l0.state, "down");
    assert.equal(l0.downTimer, 0.2);
    assert.equal(l1.state, "ok");
  } finally { CFG.RESCUE_TIME = save; }
});

test("a fallen kid with no helper still goes home when the timer runs out", () => {
  const { g, l0, away } = setup();
  away();
  run(g, CFG.DOWN_TIME + 0.5);
  assert.ok(l0.state === "home" || l0.state === "rest", l0.state);
  assert.equal(g.stats.rests, 1);
});

test("DOWN_PAUSE_HELPED 0 is the old rule (the timer runs while a friend helps; kept for the recorded baseline game)", () => {
  const keep = CFG.DOWN_PAUSE_HELPED;
  try {
    CFG.DOWN_PAUSE_HELPED = 0;
    const { g, l0, back } = setup();
    back(); run(g, 2);
    near(l0.downTimer, CFG.DOWN_TIME - 2);
  } finally { CFG.DOWN_PAUSE_HELPED = keep; }
  assert.equal(keep, 1, "the kids' rule is on");
});

test("practice games keep no timer at all (unchanged)", () => {
  const g = createGame({ world: "park", n: 1, seed: 3, practice: { step: 2 }, slots: [{ slot: "p1", kind: "player" }], fx: false });
  const l = g.littles[0];
  Object.assign(g.big, { x: 1500, y: 900, state: "look", timer: 1e9 });
  Object.assign(l, { state: "down", downTimer: CFG.DOWN_TIME });
  run(g, 3);
  assert.equal(l.downTimer, CFG.DOWN_TIME);
});
