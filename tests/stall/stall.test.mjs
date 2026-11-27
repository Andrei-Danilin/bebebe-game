// SPEC-037 AC 2: the guard — Dad never stands stuck. Every level of every world (6 × 20) with the careful and the reckless
// autopilot for CFG.BALANCE.STALL.GUARD_TIME s of game time each, seeded; any stall (tests/stall/detector.mjs) fails the test and
// is printed with world / level / style / seed / time / state / position. Slow (minutes), so it is NOT in `npm run test:core`:
// `npm run test:stall` (CI: its own job, `stall` in tests.yml). Narrow it while debugging: STALL_WORLDS=school STALL_LEVELS=19,20.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG, WORLDS, autopilot, createGame, setProgress, step, withGame } from "../../src/core/index.js";
import { stallDetector } from "./detector.mjs";

const DT = CFG.STEP, S = CFG.BALANCE.STALL;
const worlds = process.env.STALL_WORLDS ? process.env.STALL_WORLDS.split(",") : WORLDS;
const levels = process.env.STALL_LEVELS ? process.env.STALL_LEVELS.split(",").map(Number) : Array.from({ length: 20 }, (_, i) => i + 1);
const salt = Number(process.env.STALL_SALT) || 0;   // other seeds, to look for more stalls (the CI guard uses 0)
const seedOf = (w, n, style) => 100003 * (WORLDS.indexOf(w) + 1) + 1009 * n + (style === "careful" ? 3 : 5) + salt;

// one game: the stalls Dad made (a list; empty = none)
export function playGuard(world, n, style, seed = seedOf(world, n, style), seconds = S.GUARD_TIME) {
  setProgress(null);
  const g = createGame({ world, n, seed, fx: false, slots: [{ slot: "p1", kind: "player" }] });
  withGame(g, () => autopilot(true, style));
  const det = stallDetector();
  for (let i = 0, N = Math.round(seconds / DT); i < N && g.phase !== "won"; i++) { step(g, DT); det.observe(g); }
  return det.stalls;
}

for (const world of worlds) {
  test(`Dad never stands stuck: ${world}, 20 levels × careful + reckless`, () => {
    const found = [];
    for (const n of levels) for (const style of ["careful", "reckless"]) {
      const seed = seedOf(world, n, style);
      for (const s of playGuard(world, n, style, seed)) found.push(`${world} ${n} ${style} seed ${seed}: ${JSON.stringify(s)}`);
    }
    assert.equal(found.length, 0, `${found.length} Dad stall(s):\n${found.join("\n")}`);
  });
}
