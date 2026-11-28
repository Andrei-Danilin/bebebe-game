// SPEC-045 AC 2 / 3: the purchase lock of worldOpen (core, Node): entitlement "free" closes every world outside CFG.MONETIZATION.freeWorlds with the
// reason "purchase" — main and bonus, even when the progress would open it; "full" (the default) is the rules as before; the Park is always open.
import test from "node:test";
import assert from "node:assert/strict";
import { BONUS_WORLDS, CFG, MAIN_WORLDS, WORLDS, levelsPerWorld } from "../../src/core/config.js";
import { computeReward, freshProgress, isOpen, loadProgress, worldOpen } from "../../src/core/progress-rules.js";

const won = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, true]));
const withWon = (...worlds) => { const p = freshProgress(); for (const w of worlds) { p.worlds[w].won = won(levelsPerWorld()); p.worlds[w].unlocked = levelsPerWorld(); } return p; };

test("CFG.MONETIZATION: the beta is switched off, the Park is the free world", () => {
  assert.equal(CFG.MONETIZATION.enforce, false);
  assert.deepEqual(CFG.MONETIZATION.freeWorlds, ["park"]);
  assert.equal(CFG.MONETIZATION.product, "full_game");
});

test("entitlement full (the default): nothing changes", () => {
  const p = withWon("park");
  assert.deepEqual(worldOpen("field", p), { open: true, reason: "previous" });
  assert.deepEqual(worldOpen("field", p, "full"), worldOpen("field", p));
  assert.deepEqual(worldOpen("city", p), { open: false, reason: "locked", needs: "field" });
});

test("free: the Park is open, every other world is locked by purchase, even when the progress would open it", () => {
  const p = withWon("park");
  assert.deepEqual(worldOpen("park", freshProgress(), "free"), { open: true, reason: "start" });
  assert.deepEqual(worldOpen("field", p, "free"), { open: false, reason: "purchase", needs: null }, "Park 20 won: the progress opens the Field, the purchase closes it");
  assert.deepEqual(worldOpen("city", p, "free"), { open: false, reason: "purchase", needs: "field" }, "the progress still says what is needed");
  const all = withWon(...MAIN_WORLDS);
  for (const w of [...MAIN_WORLDS.slice(1), ...BONUS_WORLDS]) assert.equal(worldOpen(w, all, "free").reason, "purchase", w);
  assert.equal(isOpen("field", p, "free"), false);
  assert.equal(isOpen("field", p), true);
});

test("free: a world with old progress is closed too, and buying opens what was earned", () => {
  const p = withWon("park", "field"); p.worlds.city.unlocked = 3; p.worlds.city.won = { 1: true, 2: true };
  assert.equal(worldOpen("city", p, "free").reason, "purchase");
  assert.deepEqual(worldOpen("city", p, "full"), { open: true, reason: "previous" });
  assert.equal(p.worlds.city.unlocked, 3, "progress is untouched by the lock");
});

test("free: a win in the Park does not report the Field as opened", () => {
  const p = withWon("park"); p.worlds.park.won[20] = false; delete p.worlds.park.won[20];
  const result = { win: true, world: "park", n: 20, nobodyOut: true, fast: false, stats: { starCoins: 0, playerHugs: 0, rests: 0 } };
  assert.equal(computeReward(p, result).reward.worldOpened, "field");
  assert.equal(computeReward(p, result, "free").reward.worldOpened, null);
});

test("loadProgress keeps the lastWorld of the progress (the lock lives in worldOpen, not in the save)", () => {
  const p = loadProgress({ ...withWon("park"), lastWorld: "field" });
  assert.equal(p.lastWorld, "field");
  assert.ok(WORLDS.includes(p.lastWorld));
});
