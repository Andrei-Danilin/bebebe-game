// SPEC-012 AC 7 / 1e: whole headless games in plain Node at the fixed step CFG.STEP (the step of sim mode, the balance
// report, the server and live play, SPEC-034) — no client, no effect queue (fx: false). npm run test:core.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, autopilot, createGame, setProgress, step, withGame } from "../../src/core/index.js";

const DT = CFG.STEP;
const steps = s => Math.round(s / DT);
const autoGame = opts => { const g = createGame({ fx: false, ...opts }); withGame(g, () => autopilot(true, "careful")); return g; };

test("Park 1 plays to a win: 1 autopilot player and 4 bots", () => {
  setProgress(null);
  const g = autoGame({ world: "park", n: 1, seed: 7, slots: [{ slot: "p1", kind: "player" }] });
  assert.deepEqual(g.littles.map(l => l.kind), ["player", "bot", "bot", "bot", "bot"]);
  assert.equal(g.fx, null, "fx: false keeps no effect queue");
  for (let i = 0; i < steps(CFG.BALANCE.TIME_LIMIT) && g.phase !== "won"; i++) step(g, DT);
  assert.equal(g.phase, "won");
  const result = g.events.find(e => e.type === "result");
  assert.ok(result && result.win && result.world === "park" && result.n === 1);
  assert.equal(g.big.hp, 0);
});

// (stepped the whole 180 s, also after a win: stepping a won game is safe)
test("a 5-player autopilot game on Winter 18 runs 180 s without errors", () => {
  setProgress(null);
  const g = autoGame({ world: "winter", n: 18, seed: 18, slots: ["p1", "p2", "p3", "p4", "p5"].map(slot => ({ slot, kind: "player" })) });
  let n = 0;
  for (; n < steps(180); n++) step(g, DT);
  assert.ok(n === steps(180) && Number.isFinite(g.stats.time) && g.littles.every(l => Number.isFinite(l.x) && Number.isFinite(l.y)));
  assert.ok(g.events.length > 10, "the game happened");
});

// the same seed and the same inputs (a scripted stick and buttons for p1, the autopilot for p2) → the same event log
test("same seed and inputs, same events (fixed step)", () => {
  const play = () => {
    setProgress(null);
    const g = createGame({ world: "city", n: 9, seed: 99, fx: false, stock: { kisses: 5, kits: 2 },
      slots: [{ slot: "p1", kind: "player" }, { slot: "p2", kind: "player" }] });
    for (let i = 0; i < steps(90) && g.phase !== "won"; i++) {
      const a = i * 0.013, p1 = g.inputs.p1;
      p1.mx = Math.cos(a); p1.my = Math.sin(a * 0.7);
      p1.tiptoe = i % 300 < 60;
      if (i % 240 === 120) p1.kiss = true;
      if (i % 400 === 200) p1.kit = true;
      if (i === steps(10)) withGame(g, () => autopilot(true, "careful"));
      step(g, DT);
    }
    return g;
  };
  const a = play(), b = play();
  assert.ok(a.events.length > 20);
  assert.deepEqual(b.events, a.events);
  assert.deepEqual([b.rng.draws, b.stats], [a.rng.draws, a.stats]);
});
