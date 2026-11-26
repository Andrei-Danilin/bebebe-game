// SPEC-012 AC 3 / 4: the core reads controls only from the input slots G.inputs[slot] = { mx, my, kiss, kit, act, tiptoe }:
// the stick is clamped to length 1, the buttons are edge flags fired and consumed at the start of the step. Plain Node.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, createGame, setProgress, step, withGame } from "../../src/core/index.js";

const DT = CFG.STEP;
// a calm Big One far away (he looks at nothing for a long time), so only the inputs move player 1
const calm = g => Object.assign(g.big, { x: 900, y: 600, state: "look", timer: 9999, dir: Math.PI / 2, lookSign: 0, noPush: 999 });

test("a player slot walks and throws a kiss from inputs only", () => {
  const g = createGame({ world: "park", n: 1, seed: 3, slots: [{ slot: "p1", kind: "player" }], stock: { kisses: 3 } });
  calm(g);
  const p = g.littles[0], inp = g.inputs.p1;
  Object.assign(p, { x: 300, y: 300 });
  const x0 = p.x;
  inp.mx = 3; inp.my = 0;                                  // a stick longer than 1 is clamped
  step(g, DT);
  assert.ok(p.x - x0 <= CFG.PLAYER_SPEED * DT + 1e-9, "the stick is clamped to 1: at most full speed");
  assert.ok(p.x > x0 && p.moving && p.speedFrac === 1);
  // tiptoe: the stick is cut to TIPTOE_MULT (quiet steps)
  inp.tiptoe = true; step(g, DT);
  assert.ok(Math.abs(p.speedFrac - CFG.TIPTOE_MULT) < 1e-9);
  inp.tiptoe = false; inp.mx = 0;
  // a kiss: the flag fires once at the start of the next step, then it is consumed
  Object.assign(p, { dir: 0, kissCd: 0 });
  inp.kiss = true;
  step(g, DT);
  assert.deepEqual([inp.kiss, g.kisses.length, g.stock.kisses], [false, 1, 2]);
  assert.deepEqual(g.events.filter(e => e.type === "spent").map(({ slot, kind }) => [slot, kind]), [["p1", "kiss"]]);
  step(g, DT);
  assert.equal(g.stock.kisses, 2, "a flag fires once");
  assert.ok(g.events.every(e => e.type !== "kiss" || e.who === 0));
  // a bot's slot is never read: only player slots
  g.inputs.bot1 = { mx: 1, my: 0, kiss: true, kit: false, act: false, tiptoe: false };
  step(g, DT);
  assert.equal(g.inputs.bot1.kiss, true);
});

test("a player Big One is not driven by AI", () => {
  setProgress(null);
  const g = createGame({ world: "park", n: 2, seed: 8, slots: [{ slot: "p1", kind: "player" }, { slot: "big", kind: "player" }] });
  assert.equal(g.big.player, true);
  assert.ok(g.inputs.big, "the Big One gets an input slot");
  // no input: he stands still, his look state never changes (no turning, patrol or chase) and the rng is not drawn by him
  const b = g.big, at = [b.x, b.y, b.dir, b.state, b.timer];
  for (let i = 0; i < 60; i++) step(g, DT);
  assert.deepEqual([b.x, b.y, b.dir, b.state, b.timer], at);
  // a stick: he walks that way
  g.inputs.big.mx = 0; g.inputs.big.my = -1;
  const y0 = b.y;
  for (let i = 0; i < 10; i++) step(g, DT);
  assert.ok(b.y < y0 && Math.abs(b.dir + Math.PI / 2) < 1e-9 && b.moving);
  // the same game with an AI Big One turns and walks on its own
  const ai = createGame({ world: "park", n: 2, seed: 8, slots: [{ slot: "p1", kind: "player" }] });
  const a0 = [ai.big.x, ai.big.y, ai.big.dir];
  for (let i = 0; i < 60; i++) step(ai, DT);
  assert.notDeepEqual([ai.big.x, ai.big.y, ai.big.dir], a0);
  withGame(ai, () => assert.equal(ai.big.player, false));
});
