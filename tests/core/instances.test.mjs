// SPEC-012 AC 1 / 1b: games are instances — each game's state is its own plain-data object (createGame), the core works on the
// active game (useGame / withGame / step), and games stepped side by side do not touch each other. Plain Node: npm run test:core.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, G, autopilot, createGame, setProgress, step, useGame, withGame } from "../../src/core/index.js";

const DT = CFG.BALANCE.SIM_DT;                  // the fixed step of sim mode, the balance report and the server (AC 1e)
const steps = s => Math.round(s / DT);
// a game of 1 autopilot player + 4 bots on (world, n) from seed
function newGame(world, n, seed) {
  const g = createGame({ world, n, players: 1, seed });
  withGame(g, () => autopilot(true, "careful"));
  return g;
}
// everything of a game but levelInfo (it holds how long the level took to build: a clock, not game state)
const state = g => { const { levelInfo, ...rest } = g; return JSON.stringify(rest, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)); };

test("two games stepped interleaved equal the same games stepped alone", () => {
  const SEC = 60, specs = [["park", 1, 11], ["winter", 18, 22]];
  // alone: one game after the other (fresh progress for each run: the win reward reads it)
  setProgress(null);
  const alone = specs.map(([w, n, s]) => { const g = newGame(w, n, s); for (let i = 0; i < steps(SEC); i++) step(g, DT); return state(g); });
  // interleaved: one step of each in turn
  setProgress(null);
  const games = specs.map(([w, n, s]) => newGame(w, n, s));
  for (let i = 0; i < steps(SEC); i++) for (const g of games) step(g, DT);
  assert.equal(G, games.at(-1), "step(g) makes g the active game");
  const inter = games.map(state);
  for (let k = 0; k < specs.length; k++) assert.ok(inter[k] === alone[k], `${specs[k].join(" ")}: interleaved differs from alone`);
  // a game that does something: hugs, pushes, the rng drawn
  const ev = new Set(games.flatMap(g => g.events.map(e => e.type)));
  assert.ok(["hug", "push"].every(t => ev.has(t)), `events seen: ${[...ev]}`);
  assert.ok(games.every(g => g.rng.draws > 100), "each game draws its own rng stream");
  assert.notEqual(games[0].rng, games[1].rng);
});

test("withGame restores the active game, also when fn throws", () => {
  const a = createGame({ world: "park", n: 1, seed: 1 }), b = createGame({ world: "park", n: 2, seed: 2 });
  useGame(a);
  assert.equal(withGame(b, () => G.level), 2);
  assert.equal(G, a);
  assert.throws(() => withGame(b, () => { throw new Error("boom"); }), /boom/);
  assert.equal(G, a);
  assert.equal(createGame({ world: "park", n: 3, seed: 3 }) !== a && G === a, true, "createGame does not change the active game");
});

// plain data: only objects, arrays, typed arrays, strings, numbers, booleans, null, undefined — no function, no class instance, no Map
function impure(v, where, out, seen = new Set()) {
  if (v === null || ["undefined", "string", "number", "boolean"].includes(typeof v)) return out;
  if (typeof v !== "object") { out.push(`${where}: ${typeof v}`); return out; }
  if (seen.has(v)) return out;
  seen.add(v);
  if (ArrayBuffer.isView(v)) return out;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== Array.prototype) { out.push(`${where}: ${proto && proto.constructor && proto.constructor.name}`); return out; }
  for (const [k, x] of Object.entries(v)) impure(x, `${where}.${k}`, out, seen);
  return out;
}

test("a game is plain data", () => {
  setProgress(null);
  const g = newGame("city", 5, 33);
  for (let i = 0; i < steps(60); i++) step(g, DT);
  assert.deepEqual(impure(g, "g", []), []);
  assert.ok(g.littles.every(l => !("model" in l)) && !("model" in g.big), "no 3D model on the entities");
  const copy = structuredClone(g);
  assert.deepEqual(copy, g);
  // the copy is a whole game: stepped on, it plays exactly as the original
  for (let i = 0; i < steps(10); i++) { step(g, DT); step(copy, DT); }
  assert.ok(state(copy) === state(g), "the clone plays like the original");
});
