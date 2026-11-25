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
  // alone: one game after the other (fresh progress for each run, so both runs start alike; since SPEC-012 AC 6 the game never
  // reads or writes progress during a level — the client pays the result)
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

// SPEC-012 AC 2: the slots — up to 5 Little Ones (players and bots), missing ones filled with bots; the Big One's slot
test("slots fill with bots", () => {
  const look = { hat: "cap" };
  const g = createGame({ world: "park", n: 20, seed: 4, mode: "online-a", stock: { shared: true, kisses: 3, kits: 1, gloves: { mittens: 2, mega: 0 } },
    slots: [{ slot: "p1", kind: "player", look, name: "Ana", glove: "mittens", gloveCharges: 2, kisses: 1, kits: 0, upgrades: { fastFeet: 2 } },
      { slot: "p2", kind: "player" }, { slot: "big", kind: "bot", skin: { id: "ogre" }, name: "Dad" }] });
  assert.deepEqual(g.littles.map(l => [l.id, l.slot, l.kind, l.botIndex]), [[0, "p1", "player", -1], [1, "p2", "player", -1], [2, "bot1", "bot", 0], [3, "bot2", "bot", 1], [4, "bot3", "bot", 2]]);
  assert.equal(g.players, 2);
  assert.deepEqual(Object.keys(g.inputs), ["p1", "p2"], "an input slot per player (a bot Big One has none)");
  const p1 = g.littles[0];
  assert.deepEqual([p1.look, p1.name, p1.glove, p1.gloveCharges, p1.upg, g.littles[2].upg], [look, "Ana", "mittens", 2, { fastFeet: 2 }, null]);
  assert.deepEqual([g.net, g.stock.kisses, g.big.skin.id, g.big.name, g.big.boss, g.big.player], ["online-a", 3, "ogre", "Dad", "park", false]);
  // five human players: no bot; more slots than the team are cut at five
  const five = createGame({ world: "winter", n: 18, seed: 5, slots: ["p1", "p2", "p3", "p4", "p5", "p6"].map(slot => ({ slot, kind: "player" })) });
  assert.deepEqual(five.littles.map(l => l.slot), ["p1", "p2", "p3", "p4", "p5"]);
  assert.deepEqual(Object.keys(five.inputs), ["p1", "p2", "p3", "p4", "p5"]);
  // a practice game keeps its own team size (player + bot)
  const pr = createGame({ world: "park", n: 1, seed: 6, practice: 1, slots: [{ slot: "p1", kind: "player" }] });
  assert.deepEqual(pr.littles.map(l => l.slot), ["p1", "bot1"]);
  // the same seed and today's resetWorld order: the slots draw nothing extra (players first, then bots: the same rng calls)
  const a = createGame({ world: "city", n: 7, seed: 9, players: 1 }), b = createGame({ world: "city", n: 7, seed: 9, slots: [{ slot: "p1" }] });
  assert.equal(a.rng.draws, b.rng.draws);
  assert.deepEqual(a.littles.map(l => [l.lurkT, l.offset]), b.littles.map(l => [l.lurkT, l.offset]));
});

test("a 5-player autopilot game plays in Node", () => {
  setProgress(null);
  const g = createGame({ world: "winter", n: 18, seed: 12, slots: ["p1", "p2", "p3", "p4", "p5"].map(slot => ({ slot, kind: "player" })) });
  withGame(g, () => autopilot(true, "careful"));
  for (let i = 0; i < steps(60) && g.phase !== "won"; i++) step(g, DT);
  assert.ok(g.events.some(e => e.type === "hug" && e.kind === "player"), "the players hug");
  assert.ok(g.littles.every(l => l.kind === "player"));
});
