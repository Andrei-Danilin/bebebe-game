// SPEC-013: setSlotKind — a Little One slot of a running game passes from a bot to a player and back (the online Room does it when a kid
// joins, drops or returns). Headless; the step itself is not changed by it.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, createGame, setSlotKind, step } from "../../src/core/index.js";

const DT = CFG.STEP;
const slots = n => Array.from({ length: 5 }, (_, i) => ({ slot: "p" + (i + 1), kind: i < n ? "player" : "bot", look: { hair: i }, name: "n" + i }));
const calm = g => Object.assign(g.big, { x: 900, y: 600, state: "look", timer: 9999, dir: Math.PI / 2, lookSign: 0, noPush: 999 });

test("a player becomes a bot: his input slot goes and the AI walks him; the look and name stay", () => {
  const g = createGame({ world: "park", n: 1, seed: 4, slots: slots(2) });
  calm(g);
  assert.deepEqual(Object.keys(g.inputs), ["p1", "p2"]);
  g.inputs.p2.mx = 1;
  for (let i = 0; i < 30; i++) step(g, DT);
  assert.equal(setSlotKind(g, 1, "bot"), true);
  assert.deepEqual(Object.keys(g.inputs), ["p1"]);
  const l = g.littles[1];
  assert.deepEqual([l.kind, l.upg, g.players, l.look, l.name], ["bot", null, 1, { hair: 1 }, "n1"]);
  assert.equal(setSlotKind(g, 1, "bot"), false, "already a bot: nothing changes");
  for (let i = 0; i < 600; i++) step(g, DT);               // ten seconds of AI: no throw, and the kid is somewhere on the map
  assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y));
});

test("a bot becomes a player: an input slot appears and moves him; his upgrades count", () => {
  const g = createGame({ world: "park", n: 1, seed: 5, slots: slots(1) });
  calm(g);
  assert.equal(g.littles[3].kind, "bot");
  assert.equal(setSlotKind(g, 3, "player", { upgrades: { fastFeet: 2 }, name: "Zoe", look: { hair: 7 } }), true);
  const l = g.littles[3];
  assert.deepEqual([l.kind, l.upg, g.players, l.name, l.look, l.botIndex], ["player", { fastFeet: 2 }, 2, "Zoe", { hair: 7 }, -1]);
  Object.assign(l, { x: 300, y: 300, state: "ok" });
  const x0 = l.x;
  g.inputs.p4.mx = 1;
  step(g, DT);
  assert.ok(l.x > x0 && l.moving, "the input drives him");
  assert.equal(setSlotKind(g, 9, "bot"), false, "no such slot");
});

test("a game with no switches is unchanged: the same seed plays the same", () => {
  const run = () => { const g = createGame({ world: "city", n: 3, seed: 8, slots: slots(2) }); for (let i = 0; i < 600; i++) step(g, DT); return g.littles.map(l => [l.x, l.y, l.state]).concat([[g.big.x, g.big.y, g.big.state]]); };
  assert.deepEqual(run(), run());
});
