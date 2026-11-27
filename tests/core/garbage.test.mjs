// SPEC-040 AC 10 (RR-51): the core makes no garbage in a running game — the pathfinder reuses per-game scratch buffers (no typed array
// allocated after the first step of a 600-step run), the event log is a fixed-size ring (no splice of the log at every event once
// full). Plain Node.
// The "baseline" half of each test records what today's code does (step 1 of SPEC-040, 2026-11-27); SPEC-040 step 7 sets PENDING to
// false, and the test then asserts the bound itself. While PENDING, a test that finds the bound already met fails: flip the flag.
import test from "node:test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { CFG, autopilot, createGame, logEvent, orderedEvents, setProgress, step, withGame } from "../../src/core/index.js";

// PERF_OUT=<file>: the numbers are also appended there as JSON lines (like tests/perf.spec.js)
const record = (key, value) => { console.log(`[perf] ${key}: ${JSON.stringify(value)}`); if (process.env.PERF_OUT) fs.appendFileSync(process.env.PERF_OUT, JSON.stringify({ key, value, gl: "node" }) + "\n"); };
const PENDING = false;   // SPEC-040 step 7: the pathfinder has per-game scratch buffers, the event log is a ring
const DT = CFG.STEP;

// every typed-array construction (new X(…), X.from, X.of) and every allocating typed-array method (slice, map, filter) while fn runs.
// subarray() makes a view, not memory: not counted. The constructors are the globals the core looks up at each call.
const TYPED = ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array"];
function countTypedArrays(fn) {
  const counts = {}, saved = {}, proto = Object.getPrototypeOf(Int8Array).prototype, methods = ["slice", "map", "filter"], savedMethods = {};
  let total = 0;
  for (const name of TYPED) {
    const Orig = saved[name] = globalThis[name];
    counts[name] = 0;
    globalThis[name] = new Proxy(Orig, { construct(target, args, newTarget) { counts[name]++; total++; return Reflect.construct(target, args, newTarget); } });
  }
  for (const m of methods) {
    const orig = savedMethods[m] = proto[m];
    proto[m] = function (...a) { counts[m] = (counts[m] || 0) + 1; total++; return orig.apply(this, a); };
  }
  try { fn(); } finally {
    for (const name of TYPED) globalThis[name] = saved[name];
    for (const m of methods) proto[m] = savedMethods[m];
  }
  return { total, counts: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)) };
}

const autoGame = opts => { const g = createGame({ fx: false, ...opts }); withGame(g, () => autopilot(true, "careful")); return g; };
// games that make the pathfinder work: the Big One and the bots path through a park with 4 bots, a winter level with 5 players
const SCENARIOS = [
  ["Park 1, 1 player + 4 bots", { world: "park", n: 1, seed: 7, slots: [{ slot: "p1", kind: "player" }] }],
  ["Winter 18, 5 players", { world: "winter", n: 18, seed: 18, slots: ["p1", "p2", "p3", "p4", "p5"].map(slot => ({ slot, kind: "player" })) }]
];

test("AC 10: a 600-step headless run allocates no typed arrays after its first step", () => {
  const found = {};
  for (const [name, opts] of SCENARIOS) {
    setProgress(null);
    const g = autoGame(opts);
    step(g, DT);                                            // the first step may set the scratch buffers up
    found[name] = countTypedArrays(() => { for (let i = 1; i < 600; i++) step(g, DT); });
  }
  record("typed arrays allocated in steps 2–600", found);
  const total = Object.values(found).reduce((s, r) => s + r.total, 0);
  if (PENDING) assert.ok(total > 0, "the bound is already met: set PENDING = false in tests/core/garbage.test.mjs (SPEC-040 step 7 done)");
  else assert.equal(total, 0, `typed arrays allocated after step 1: ${JSON.stringify(found)}`);
});

test("AC 10: the event log is a ring: a full log is not spliced at every event", () => {
  setProgress(null);
  const g = createGame({ world: "park", n: 1, seed: 7, fx: false });
  const proto = Array.prototype, orig = proto.splice;
  let splices = 0;
  withGame(g, () => {
    for (let i = 0; i < CFG.EVENT_LOG_MAX + 50; i++) logEvent("test", { i });   // fills the log
    proto.splice = function (...a) { if (this === g.events) splices++; return orig.apply(this, a); };
    try { for (let i = 0; i < 100; i++) logEvent("test", { i }); } finally { proto.splice = orig; }
  });
  record("splices of the event log in 100 events on a full log", splices);
  assert.ok(g.events.length <= CFG.EVENT_LOG_MAX, "the log stays at its cap");
  // the ring keeps the newest events, oldest first through orderedEvents, and is plain data (a clone keeps it whole)
  const i = g.events.length;
  withGame(g, () => { for (let k = 0; k < 7; k++) logEvent("tail", { k }); });
  assert.equal(g.events.length, i);
  assert.deepEqual(orderedEvents(g).slice(-7).map(e => e.k), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(orderedEvents(g).every((e, n, a) => !n || a[n - 1].t <= e.t), "oldest first");
  const copy = structuredClone(g);
  withGame(copy, () => logEvent("tail", { k: 7 }));
  assert.equal(orderedEvents(copy).at(-1).k, 7); assert.equal(copy.events.length, i, "a clone is a ring too");
  if (PENDING) assert.ok(splices > 0, "the bound is already met: set PENDING = false in tests/core/garbage.test.mjs (SPEC-040 step 7 done)");
  else assert.equal(splices, 0, "a ring buffer never splices");
});
