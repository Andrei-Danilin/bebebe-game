// SPEC-012 AC 10: a practice (tutorial) game is a game option — createGame({ practice: { step, map, hearts, bots, stock, script } }),
// plain data; its win is the practiceWin event (no hook re-enters the core) and it pays nothing. Plain Node: npm run test:core.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, autopilot, createGame, step, withGame } from "../../src/core/index.js";

const DT = CFG.STEP;

test("practice 2 plays to practiceWin in Node", () => {
  const g = createGame({ world: "park", n: 1, seed: 17, practice: { step: 2 }, slots: [{ slot: "p1", kind: "player" }] });
  const T = CFG.TUTORIAL;
  assert.deepEqual(g.practice, { step: 2, map: "tutorial", hearts: T.hearts2, bots: T.bots, stock: { shared: true, kisses: T.kisses, kits: T.kits, gloves: { mittens: 0, mega: 0 } }, script: null });
  assert.deepEqual([g.tutorialGame, g.littles.length, g.big.maxHp, g.big.boss, g.levelInfo.type], [2, 1 + Math.max(1, T.bots), T.hearts2, null, "tutorial"]);
  assert.deepEqual(structuredClone(g.practice), g.practice, "the option is plain data");
  withGame(g, () => autopilot(true, "careful"));
  for (let i = 0; i < Math.round(600 / DT) && g.phase !== "won"; i++) step(g, DT);
  assert.equal(g.phase, "won");
  const types = new Set(g.events.map(e => e.type));
  assert.deepEqual(g.events.filter(e => e.type === "practiceWin").map(e => e.step), [2]);
  assert.deepEqual(["coins", "spent", "result", "win"].filter(t => types.has(t)), [], "a practice game pays nothing and shows no win screen");
  // practice 1: its script (Dad pushes the bot) is an id, not a function
  const g1 = createGame({ world: "park", n: 1, seed: 2, practice: 1, slots: [{ slot: "p1" }] });
  assert.deepEqual([g1.practice.script, g1.tut.script, g1.practice.hearts], ["game1", true, T.hearts1]);
});
