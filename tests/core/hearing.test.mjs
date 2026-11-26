// SPEC-032 AC 2–4: Dad does not always hear running feet. When the noise reaches NOISE_TURN he turns only with chance
// HEAR_CHANCE (the game's seeded rng: repeatable); a miss resets the noise and waits HEAR_MISS_COOLDOWN; the turn takes
// HEAR_TURN_TIME; practice game 1 keeps chance CFG.TUTORIAL.hearChance (1). HEAR_CHANCE 1 draws no rng (the old game).
import test from "node:test";
import assert from "node:assert/strict";
import { CELL, CFG, createGame, hearNoise, inSafe, los, seeSolidAt, withGame } from "../../src/core/index.js";

const DT = CFG.BALANCE.SIM_DT;
// a spot with 100 px of open ground on its left (Dad looks right, the kid runs behind him)
function openSpot(g) {
  return withGame(g, () => {
    for (let cy = 4; cy < 16; cy++) for (let cx = 6; cx < 24; cx++) {
      const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL }, q = { x: p.x - 100, y: p.y };
      if (!seeSolidAt(p.x, p.y) && !seeSolidAt(q.x, q.y) && !inSafe(p) && !inSafe(q) && los(p.x, p.y, q.x, q.y, seeSolidAt)) return { p, q };
    }
    return null;
  });
}
// one try: Dad calm at p looking right, the kid running at q, the noise one step short of NOISE_TURN → one hearNoise step
function tryOnce(g, spot) {
  return withGame(g, () => {
    const b = g.big, l = g.littles[0];
    Object.assign(b, { x: spot.p.x, y: spot.p.y, dir: 0, state: "look", timer: 999, stun: 0, slip: 0, blush: 0, pushCd: 0, kind: false,
      noise: CFG.NOISE_TURN - CFG.NOISE_RATE * DT / 2, hearCd: 0, hearTurnT: 0, hearLook: 0 });
    Object.assign(l, { x: spot.q.x, y: spot.q.y, state: "ok", moving: true, speedFrac: 1 });
    l.fx.cloak = 0;
    for (const o of g.littles.slice(1)) Object.assign(o, { state: "home" });
    const draws = g.rng.draws;
    hearNoise(DT);
    return { turned: b.hearTurnT > 0, noise: b.noise, cd: b.hearCd, turnT: b.hearTurnT, state: b.state, draws: g.rng.draws - draws };
  });
}

test("SPEC-032 numbers: chance 0.6, miss cooldown 1.5 s, turn 0.35 s, practice 1 hears always", () => {
  assert.deepEqual([CFG.HEAR_CHANCE, CFG.HEAR_MISS_COOLDOWN, CFG.HEAR_TURN_TIME, CFG.TUTORIAL.hearChance], [0.6, 1.5, 0.35, 1]);
  assert.ok(CFG.HEAR_MISS_COOLDOWN < CFG.HEAR_COOLDOWN, "a miss waits less than a turn");
});

test("Dad turns with chance HEAR_CHANCE; a miss resets the noise and waits HEAR_MISS_COOLDOWN (seeded, repeatable)", () => {
  const run = seed => {
    const g = createGame({ world: "park", n: 2, seed, fx: false }), spot = openSpot(g);
    assert.ok(spot, "an open spot");
    return Array.from({ length: 300 }, () => tryOnce(g, spot));
  };
  const a = run(5), b = run(5);
  assert.deepEqual(a, b, "the same seed → the same turns and misses");
  const turns = a.filter(r => r.turned), misses = a.filter(r => !r.turned);
  const share = turns.length / a.length;
  assert.ok(share > 0.5 && share < 0.7, `turned ${turns.length}/${a.length} (want ≈ ${CFG.HEAR_CHANCE})`);
  for (const r of turns) assert.deepEqual([r.noise, r.cd, r.turnT, r.state], [0, CFG.HEAR_COOLDOWN, CFG.HEAR_TURN_TIME, "look"]);
  for (const r of misses) assert.deepEqual([r.noise, r.cd, r.turnT], [0, CFG.HEAR_MISS_COOLDOWN, 0], "missed it: no turn");
  assert.ok(a.every(r => r.draws >= 1), "the chance is drawn from the game's rng");
  assert.notDeepEqual(run(6).map(r => r.turned), a.map(r => r.turned), "another seed, other misses");
});

test("HEAR_CHANCE 1 draws no rng and always turns (the old game); practice 1 hears always, practice 2 not", () => {
  const keep = CFG.HEAR_CHANCE;
  try {
    CFG.HEAR_CHANCE = 1;
    const g = createGame({ world: "park", n: 2, seed: 3, fx: false }), spot = openSpot(g);
    const r = Array.from({ length: 50 }, () => tryOnce(g, spot));
    assert.ok(r.every(x => x.turned), "always turns");
    // a turn draws HEAR_LOOK (as before SPEC-032) and nothing else: exactly one draw
    assert.deepEqual([...new Set(r.map(x => x.draws))], [1]);
  } finally { CFG.HEAR_CHANCE = keep; }
  const p1 = createGame({ world: "park", n: 1, seed: 4, fx: false, practice: 1, slots: [{ slot: "p1" }] }), s1 = openSpot(p1);
  const r1 = Array.from({ length: 50 }, () => tryOnce(p1, s1));
  assert.ok(r1.every(x => x.turned && x.draws === 1), "practice 1: chance 1 (the tiptoe lesson)");
  const p2 = createGame({ world: "park", n: 1, seed: 4, fx: false, practice: 2, slots: [{ slot: "p1" }] }), s2 = openSpot(p2);
  const r2 = Array.from({ length: 100 }, () => tryOnce(p2, s2));
  assert.ok(r2.some(x => !x.turned), "practice 2: HEAR_CHANCE");
});
