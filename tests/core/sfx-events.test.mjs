// SPEC-047 AC 8: the core emits the sound events (headless, so online play gets them too): { type: "sfx", name } in g.fx — never in
// the gameplay log, never drawing the game's rng. The one-shots are events; the loops (rescue_loop, dizzy, danger_tick, run_steps,
// tiptoe_steps) are a pure query of the game state, wantedLoops(), that the client diffs every step.
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, checkContacts, createGame, hearNoise, inSafe, los, pushHit, seeSolidAt, throwKiss, update, updateDanger, updateDowned, updateItems,
  useRescueKit, wantedLoops, winNow, withGame, startKindWalk } from "../../src/core/index.js";

const DT = CFG.STEP;
// a spot with open ground around it (Dad can stand there, kids next to him)
function openSpot(g) {
  return withGame(g, () => {
    for (let cy = 4; cy < 16; cy++) for (let cx = 6; cx < 24; cx++) {
      const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
      if ([[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]].every(([dx, dy]) => !seeSolidAt(p.x + dx, p.y + dy) && !inSafe({ x: p.x + dx, y: p.y + dy }) && los(p.x, p.y, p.x + dx, p.y + dy, seeSolidAt))) return p;
    }
    return null;
  });
}
// a calm game: Dad at the spot looking right (a long look), the kid behind him (left), the others resting
function scene(opts = {}) {
  const g = createGame({ world: "park", n: opts.n ?? 2, seed: 11, players: opts.players ?? 1, fx: true });
  const p = openSpot(g);
  assert.ok(p, "an open spot");
  withGame(g, () => {
    Object.assign(g.big, { x: p.x, y: p.y, dir: 0, state: "look", timer: 999, stun: 0, slip: 0, blush: 0, pushCd: 0, noPush: 0, hugCd: 0, kind: false });
    g.littles.forEach((l, i) => Object.assign(l, i === 0 ? { x: p.x - (g.big.r + l.r), y: p.y, state: "ok", hugCd: 0, invuln: 0 } : { state: "rest", restTimer: 999, x: p.x + 500, y: p.y }));
    g.fx.length = 0;
  });
  return { g, p };
}
const sfx = g => g.fx.filter(e => e.type === "sfx").map(e => e.name);
const take = g => { const out = g.fx.filter(e => e.type === "sfx"); g.fx.length = 0; return out; };

test("hug: hug, with mittens (power 2+) hug_mega; a bot's hug carries other: true", () => {
  const { g } = scene();
  withGame(g, () => { checkContacts(); });
  assert.deepEqual(take(g), [{ type: "sfx", name: "hug" }]);
  const m = scene();
  withGame(m.g, () => { m.g.stock.gloves.mittens = 3; m.g.littles[0].glove = "mittens"; checkContacts(); });
  assert.deepEqual(take(m.g).map(e => e.name), ["hug_mega"]);
  const b = scene({ players: 1 });
  withGame(b.g, () => {
    const bot = b.g.littles[1];
    Object.assign(bot, { state: "ok", x: b.g.big.x - (b.g.big.r + bot.r), y: b.g.big.y, task: "attack", hugCd: 0 });
    Object.assign(b.g.littles[0], { state: "home" });
    checkContacts();
  });
  assert.deepEqual(take(b.g), [{ type: "sfx", name: "hug", other: true }]);
});

test("push: push + fall 0.25 s later; every 3rd push of a level also growls; a wide push is one wide_push", () => {
  const { g } = scene();
  const push = () => withGame(g, () => { const l = g.littles[0]; Object.assign(l, { state: "ok", invuln: 0 }); l.fx.shield = 0; pushHit(l); return take(g); });
  const first = push();
  assert.deepEqual(first.map(e => e.name).sort(), ["fall", "push"]);
  assert.deepEqual(first.find(e => e.name === "fall"), { type: "sfx", name: "fall", delay: 0.25 }, "the kid sits down 0.25 s after the push");
  assert.equal(CFG.SFX_FALL_DELAY, 0.25);
  assert.deepEqual(push().map(e => e.name).sort(), ["fall", "push"], "2nd push: no growl");
  assert.deepEqual(push().map(e => e.name).sort(), ["fall", "growl", "push"], "3rd push growls");
  assert.deepEqual(push().map(e => e.name).sort(), ["fall", "push"]);
  push(); assert.deepEqual(push().map(e => e.name).sort(), ["fall", "growl", "push"], "6th push growls");
  // the grumpiest dad (a school boss): one wide_push for everybody he hits, no plain push
  const w = scene();
  const names = withGame(w.g, () => { w.g.big.boss = "school"; const l = w.g.littles[0]; Object.assign(l, { state: "ok", invuln: 0 }); pushHit(l); return take(w.g).map(e => e.name); });
  assert.equal(names.filter(n => n === "wide_push").length, 1, "one wide_push: " + names);
  assert.ok(!names.includes("push") && names.includes("fall"), names.join());
});

test("a shield stops a push: shield (no push, no fall)", () => {
  const { g } = scene();
  withGame(g, () => { const l = g.littles[0]; l.fx.shield = 5; pushHit(l); });
  assert.deepEqual(take(g), [{ type: "sfx", name: "shield" }]);
});

test("kiss: kiss when thrown, kiss_hit when it hits; kit: kit; thrown_out when Dad's house throws a kid out", () => {
  const { g } = scene();
  withGame(g, () => {
    g.stock.kisses = 3;
    const l = g.littles[0];
    l.dir = Math.PI;                                                        // away from Dad: the kiss is thrown, not at once a hit
    assert.equal(throwKiss(0), true);
    assert.deepEqual(take(g).map(e => e.name), ["kiss"]);
    g.kisses.length = 0;
    // a kiss that reaches Dad
    g.kisses.push({ id: 99, owner: 0, x: g.big.x - 5, y: g.big.y, dx: 1, dy: 0, travel: 0 });
    update(DT);
    assert.ok(sfx(g).includes("kiss_hit"), "kiss_hit: " + sfx(g));
  });
  const k = scene();
  withGame(k.g, () => { k.g.stock.kits = 1; Object.assign(k.g.littles[0], { state: "down", downTimer: 10 }); assert.equal(useRescueKit(0), true); });
  assert.ok(take(k.g).some(e => e.name === "kit"));
  const d = scene({ n: 1 });
  withGame(d.g, () => {
    const l = d.g.littles[0], z = d.g.dangerZone;
    assert.ok(z, "this level has Dad's house");
    Object.assign(l, { x: z.x + z.w / 2, y: z.y + z.h / 2, state: "ok", dangerT: CFG.DANGER_TIME - DT / 2 });
    d.g.big.x = 1e4;
    updateDanger(DT);
  });
  assert.ok(sfx(d.g).includes("thrown_out"), "thrown_out: " + sfx(d.g));
});

test("items: boots / cloak / pickup (shield); a rescue: rescue; Dad sees a kid: alert; kind before win", () => {
  for (const [kind, name] of [["boots", "boots"], ["cloak", "cloak"], ["shield", "pickup"]]) {
    const { g } = scene();
    withGame(g, () => {
      const l = g.littles[0];
      g.items.length = 0; g.itemCd = 99;
      g.items.push({ id: 1, kind, x: l.x, y: l.y, t: 0, life: 99 });
      updateItems(DT);
    });
    assert.deepEqual(sfx(g), [name], kind);
  }
  const r = scene({ players: 2 });
  withGame(r.g, () => {
    const down = r.g.littles[0], helper = r.g.littles[1];
    Object.assign(down, { state: "down", downTimer: 99, rescue: CFG.RESCUE_TIME - DT / 2 });
    Object.assign(helper, { state: "ok", x: down.x + 20, y: down.y });
    updateDowned(DT);
  });
  assert.ok(sfx(r.g).includes("rescue"));
  // the last hug: kind (the kind walk starts), then win at the door
  const k = scene();
  withGame(k.g, () => { startKindWalk(); });
  assert.deepEqual(sfx(k.g), ["kind"]);
  withGame(k.g, () => { winNow(); });
  assert.deepEqual(sfx(k.g), ["kind", "win"], "kind comes before the win jingle");
});

test("Dad sees a kid: alert; Dad hears steps and turns: heard", () => {
  const { g } = scene();
  withGame(g, () => {
    Object.assign(g.big, { dir: Math.PI, state: "look", timer: 999 });         // he looks left: at the kid right beside him
    update(DT);
  });
  assert.ok(sfx(g).includes("alert"), "alert: " + sfx(g));
  const h = scene();
  withGame(h.g, () => {
    Object.assign(h.g.big, { dir: 0, state: "look", timer: 999, noise: CFG.NOISE_TURN, hearCd: 0 });
    Object.assign(h.g.littles[0], { x: h.p.x - 100, state: "ok", moving: true, speedFrac: 1 });
    h.g.littles[0].fx.cloak = 0;
    const keep = CFG.HEAR_CHANCE;
    CFG.HEAR_CHANCE = 1;
    try { hearNoise(DT); } finally { CFG.HEAR_CHANCE = keep; }
  });
  assert.ok(sfx(h.g).includes("heard"), "heard: " + sfx(h.g));
});

test("the sound events are effects only: never in the gameplay log, and the same seed gives the same game with or without them", () => {
  const run = fx => {
    const g = createGame({ world: "park", n: 3, seed: 5, fx });
    withGame(g, () => { for (let i = 0; i < 600; i++) update(DT); });
    return [JSON.stringify(g.events), g.rng.draws];
  };
  assert.deepEqual(run(true), run(false));
  const g = createGame({ world: "park", n: 3, seed: 5, fx: true });
  withGame(g, () => { for (let i = 0; i < 600; i++) update(DT); });
  assert.ok(!g.events.some(e => e.type === "sfx"));
});

test("wantedLoops: rescue_loop only while a player stands by a downed friend (a bot helper is no player)", () => {
  const { g } = scene({ players: 2 });
  const loops = () => withGame(g, () => wantedLoops());
  assert.deepEqual(loops(), []);
  withGame(g, () => {
    const down = g.littles[0], helper = g.littles[1];
    Object.assign(down, { state: "down", downTimer: 99 });
    Object.assign(helper, { state: "ok", x: down.x + 20, y: down.y });
  });
  assert.deepEqual(loops(), ["rescue_loop"]);
  withGame(g, () => { g.littles[1].x += 300; });
  assert.deepEqual(loops(), [], "he walked away");
  withGame(g, () => { const h = g.littles[1]; h.x -= 300; h.kind = "bot"; });
  assert.deepEqual(loops(), [], "a bot helps: no loop (only while a player is helping)");
});

test("wantedLoops: dizzy while Dad lies; danger_tick for a player inside his house; run_steps / tiptoe_steps near Dad, for the listed players only", () => {
  const { g, p } = scene({ n: 1 });
  const loops = local => withGame(g, () => wantedLoops(local));
  withGame(g, () => { g.big.slip = 2; });
  assert.deepEqual(loops(), ["dizzy"]);
  withGame(g, () => { g.big.slip = 0; });
  const l = g.littles[0];
  withGame(g, () => Object.assign(l, { x: p.x - 100, y: p.y, moving: true, speedFrac: 1 }));
  assert.deepEqual(loops(), ["run_steps"], "running within HEAR_RADIUS");
  assert.deepEqual(loops(["p9"]), [], "not a local player");
  withGame(g, () => Object.assign(l, { speedFrac: CFG.TIPTOE_MULT }));
  assert.deepEqual(loops(), ["tiptoe_steps"], "tiptoeing");
  withGame(g, () => Object.assign(l, { x: p.x - CFG.HEAR_RADIUS * CELL - 50 }));
  assert.deepEqual(loops(), [], "too far from Dad");
  withGame(g, () => Object.assign(l, { x: p.x - 100, moving: false }));
  assert.deepEqual(loops(), [], "standing still");
  const z = withGame(g, () => g.dangerZone);
  withGame(g, () => { Object.assign(l, { x: z.x + z.w / 2, y: z.y + z.h / 2, moving: false, dangerT: 0 }); g.big.x = 1e4; });
  assert.deepEqual(loops(), ["danger_tick"]);
  withGame(g, () => { g.phase = "won"; });
  assert.deepEqual(loops(), [], "none after the win");
});
