// SPEC-013 AC 3 (the pure part, no server): the Room's game — made from a lobby, driven by inputs, read back as compact snapshots.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG } from "../../src/core/config.js";
import { applyInput, drainEvents, humanGone, humanJoined, isOver, makeGame, resultOf, slotName, snapshotOf, stepGame } from "../../online/src/sim.js";

const human = (i, extra = {}) => ({ name: { adj: i, animal: 15 - i }, look: { hair: i, hat: 1, jacket: 1, pants: 1 }, gear: { glove: "mittens", gloveCharges: 3, kisses: 2, kits: 1, upgrades: { fastFeet: 1 } },
  entitlement: "full", joined: i + 1, tokenHash: "h" + i, awayUntil: null, ...extra });
const lobby = (slots, extra = {}) => ({ world: "park", n: 1, slots: Array.from({ length: 5 }, (_, i) => slots[i] ?? null), ...extra });

test("the game of a lobby: a player in every held slot, a bot in the rest (a dropped kid's slot too), the humans' gear in one stock", () => {
  const g = makeGame(lobby([human(0), null, human(2), human(3, { awayUntil: Date.now() + 5000 })]), { seed: 3 });
  assert.deepEqual(g.littles.map(l => [l.slot, l.kind]), [["p1", "player"], ["p2", "bot"], ["p3", "player"], ["p4", "bot"], ["p5", "bot"]]);
  assert.deepEqual(Object.keys(g.inputs), ["p1", "p3"]);
  assert.equal(g.net, "online-a");
  assert.deepEqual([g.stock.kisses, g.stock.kits, g.stock.gloves.mittens], [4, 2, 6], "two connected kids' gear");
  assert.deepEqual(g.littles[0].look, { hair: 0, hat: 1, jacket: 1, pants: 1 });
  assert.equal(g.littles[3].look.hair, 3, "the dropped kid's bot keeps his look");
  assert.deepEqual([g.world, g.level], ["park", 1]);
  assert.equal(g.littles[0].glove, "mittens");
  assert.deepEqual(g.littles[0].upg, { fastFeet: 1 });
  assert.equal(slotName(4), "p5");
});

test("the same lobby and seed play the same game", () => {
  const run = () => { const g = makeGame(lobby([human(0), human(1)]), { seed: 9 }); for (let i = 0; i < 300; i++) stepGame(g); return JSON.stringify(snapshotOf(g, 300, [])); };
  assert.equal(run(), run());
});

test("input: the stick is the latest, 💋 and 🩹 stay set until a step consumes them; a bot's slot takes nothing", () => {
  const g = makeGame(lobby([human(0)]), { seed: 4 });
  Object.assign(g.big, { x: 900, y: 600, state: "look", timer: 9999, lookSign: 0, noPush: 999 });
  assert.equal(applyInput(g, 1, { mx: 1, my: 0, kiss: false, kit: false, tiptoe: false }), false, "slot 2 is a bot");
  assert.equal(applyInput(g, 0, { mx: 0.6, my: 0.8, kiss: true, kit: false, tiptoe: true }), true);
  assert.deepEqual(g.inputs.p1, { mx: 0.6, my: 0.8, kiss: true, kit: false, act: false, tiptoe: true });
  applyInput(g, 0, { mx: 0, my: 0, kiss: false, kit: false, tiptoe: false });
  assert.equal(g.inputs.p1.kiss, true, "a later message without the press does not erase it");
  Object.assign(g.littles[0], { x: 300, y: 300, dir: 0 });   // out of the house (no kisses from home)
  const x0 = g.littles[0].x;
  applyInput(g, 0, { mx: 1, my: 0, kiss: false, kit: false, tiptoe: false });
  stepGame(g);
  assert.equal(g.inputs.p1.kiss, false, "the step consumed the press");
  assert.equal(g.kisses.length, 1, "and the kiss flew");
  assert.ok(g.littles[0].x !== x0);
});

test("a kid dropping or joining mid-level switches his slot between player and bot", () => {
  const g = makeGame(lobby([human(0), human(1)]), { seed: 5 });
  assert.equal(humanGone(g, 1), true);
  assert.deepEqual([g.littles[1].kind, Object.keys(g.inputs)], ["bot", ["p1"]]);
  assert.equal(humanJoined(g, 3, human(3)), true);
  assert.deepEqual([g.littles[3].kind, g.littles[3].name, g.littles[3].upg], ["player", "3.12", { fastFeet: 1 }]);
  assert.deepEqual(Object.keys(g.inputs).sort(), ["p1", "p4"]);
  humanJoined(g, 3, human(3, { look: { hair: 7, hat: 0, jacket: 0, pants: 0 } }));
  assert.equal(g.littles[3].look.hair, 7, "a new look reaches the game");
  for (let i = 0; i < 120; i++) stepGame(g);
});

test("a whole level with five kids: snapshots stay compact, events are keys, the level ends with a result per kid", () => {
  const g = makeGame(lobby([0, 1, 2, 3, 4].map(i => human(i))), { seed: 7, auto: true });
  let max = 0, maxEv = 0, n = 0, steps = 0;
  const kinds = new Set();
  for (; !isOver(g) && steps < 60 * 300; steps++) {
    stepGame(g);
    if (steps % 3 === 0) {
      const d = drainEvents(g), snap = snapshotOf(g, steps, d.events, d.lost);
      const text = JSON.stringify(snap);
      max = Math.max(max, text.length); maxEv = Math.max(maxEv, d.events.length); n++;
      for (const e of d.events) kinds.add(e.type);
      assert.deepEqual(Object.keys(snap).slice(0, 2), ["type", "tick"]);
    }
  }
  assert.ok(isOver(g), "the autopilot wins Park 1");
  assert.ok(max < 2048, `the biggest snapshot is ${max} bytes`);
  assert.ok(maxEv <= 24);
  assert.ok(n > 50);
  for (const k of kinds) assert.ok(["sfx", "pop", "burst", "wave", "shake", "mood", "hint", "game"].includes(k), k);
  const snap = snapshotOf(g, 1, []);
  assert.deepEqual(Object.keys(snap).sort(), ["big", "events", "hud", "items", "kisses", "littles", "shots", "stars", "tick", "type"]);
  assert.equal(snap.littles.length, 5);
  assert.equal(snap.hud.ph, "won");
  const r = resultOf(g, 2);
  assert.deepEqual([r.type, r.slot, r.win, r.world, r.n], ["result", 2, true, "park", 1]);
  assert.ok(r.time > 0 && r.mine && "hugs" in r.mine && !("perSlot" in r));
});

test("events: the effect queue becomes pop keys and sounds, capped per snapshot; the log's own events do not travel", () => {
  const g = makeGame(lobby([human(0)]), { seed: 6 });
  g.fx.length = 0;
  for (let i = 0; i < 30; i++) g.fx.push({ type: "sfx", name: "pickup", slot: "p1" });
  g.fx.push({ type: "pop", key: "whee", args: [], x: 10.123, y: 20.987, color: "#fff" });
  g.fx.push({ type: "game", e: { t: 3, type: "spent", slot: "p1", kind: "kiss" } });
  g.fx.push({ type: "game", e: { t: 3, type: "result", win: true } });
  g.fx.push({ type: "weird" });
  const d = drainEvents(g);
  assert.equal(d.events.length, 24);
  assert.equal(d.lost, 8, "32 kept events, 24 sent, the rest is counted");
  assert.deepEqual(g.fx, [], "the queue is drained");
  g.fx.push({ type: "pop", key: "whee", args: [], x: 10.123, y: 20.987, color: "#fff" }, { type: "game", e: { t: 3, type: "spent", slot: "p1", kind: "kiss" } }, { type: "game", e: { t: 3, type: "result" } });
  assert.deepEqual(drainEvents(g).events, [{ type: "pop", key: "whee", args: [], x: 10.1, y: 21, color: "#fff" }, { type: "game", e: { type: "spent", slot: "p1", kind: "kiss" } }]);
  assert.equal(CFG.ONLINE.SLOW_STEP_MS, 8);
});
