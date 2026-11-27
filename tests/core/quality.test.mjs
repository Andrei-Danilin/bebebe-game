// SPEC-040 AC 6 / 7 (RR-43, D-4, D-17): the quality tiers' numbers and rules, in plain Node — what each tier changes, which tier the start probe
// picks, which background decor a tier keeps, and the step-down rule driven with fake times (it runs on CI whatever the machine's speed).
import test from "node:test";
import assert from "node:assert/strict";
import { LOOK } from "../../src/client/look.js";
import { keepDecor, lowerTier, monitorFrame, newMonitor, pickTier, Q, TIERS, dprCap, tierOf } from "../../src/client/quality.js";

test("the three tiers: high is today's picture, medium and low cut what D-4 allows and keep the outlines and the hatching", () => {
  assert.deepEqual(TIERS, ["high", "medium", "low"]);
  const { high, medium, low } = LOOK.QUALITY;
  // high: the numbers the game had before the tiers (desktop pixel ratio ≤ 2, touch ≤ 1.5, MSAA, a 2048 PCF shadow map, the grain, all the decor)
  assert.deepEqual(high, { dprCap: { desktop: 2, touch: 1.5 }, msaa: true, shadow: 2048, shadowType: "pcf", grain: true, decor: 1 });
  // medium: DPR cap 1.5, shadow map 1024, decor 75 %
  assert.equal(medium.dprCap, 1.5); assert.equal(medium.shadow, 1024); assert.equal(medium.decor, 0.75); assert.equal(medium.msaa, true);
  // low: DPR cap 1, no MSAA, no paper grain, a basic 1024 shadow map, half the decor
  assert.equal(low.dprCap, 1); assert.equal(low.msaa, false); assert.equal(low.grain, false); assert.equal(low.shadow, 1024); assert.equal(low.shadowType, "basic"); assert.equal(low.decor, 0.5);
  for (const t of [high, medium, low]) for (const k of ["outline", "hatch"]) assert.equal(k in t, false, "nothing in a tier switches the outlines or the hatching off");
  // each tier costs no more than the one above
  assert.ok(medium.shadow <= high.shadow && low.shadow <= medium.shadow && low.decor <= medium.decor && medium.decor <= high.decor);
  Q.tier = "high"; assert.equal(dprCap(false), 2); assert.equal(dprCap(true), 1.5);
  Q.tier = "medium"; assert.equal(dprCap(false), 1.5); assert.equal(dprCap(true), 1.5);
  Q.tier = "low"; assert.equal(dprCap(false), 1); assert.equal(dprCap(true), 1);
  Q.tier = "high";
  assert.equal(tierOf("nope"), high, "an unknown name is high");
});

test("the start probe's milliseconds pick the tier: ≤ 10 ms high, ≤ 22 ms medium, else low", () => {
  const P = LOOK.QUALITY.probe;
  assert.deepEqual([P.highMs, P.mediumMs], [10, 22]);
  for (const [ms, tier] of [[0.5, "high"], [10, "high"], [10.1, "medium"], [22, "medium"], [22.1, "low"], [150, "low"]]) assert.equal(pickTier(ms), tier, `${ms} ms`);
  assert.equal(lowerTier("high"), "medium"); assert.equal(lowerTier("medium"), "low"); assert.equal(lowerTier("low"), "low", "nothing below low");
});

test("the decor a tier keeps: a share of it, spread evenly, the same on every call; high keeps all", () => {
  const N = 46;                                              // the map's background decor
  const kept = f => Array.from({ length: N }, (_, i) => keepDecor(i, f));
  assert.equal(kept(1).every(Boolean), true);
  const m = kept(LOOK.QUALITY.medium.decor), l = kept(LOOK.QUALITY.low.decor);
  assert.ok(Math.abs(m.filter(Boolean).length - 0.75 * N) <= 1, `medium keeps ${m.filter(Boolean).length} of ${N}`);
  assert.ok(Math.abs(l.filter(Boolean).length - 0.5 * N) <= 1, `low keeps ${l.filter(Boolean).length} of ${N}`);
  assert.deepEqual(kept(0.5), l, "deterministic");
  // spread: no run of three skipped in medium, no run of two skipped in low
  const run = a => { let r = 0, best = 0; for (const v of a) { r = v ? 0 : r + 1; best = Math.max(best, r); } return best; };
  assert.ok(run(m) <= 1 && run(l) <= 1);
});

// ---- the step-down rule: p95 of the last 3 s over 45 ms for 5 s → one tier down; never up ----
const S = LOOK.QUALITY.stepDown;
function feed(m, from, secs, frameMs, spikeEvery = 0, spikeMs = 0) {
  let t = from, fired = 0;
  for (let i = 0, n = Math.round((secs * 1000) / frameMs); i < n; i++) {
    t += frameMs;
    if (monitorFrame(m, spikeEvery && i % spikeEvery === 0 ? spikeMs : frameMs, t)) fired++;
  }
  return { t, fired };
}
test("step-down: steady 16.7 ms frames never step down; a p95 over 45 ms for 5 s does, once", () => {
  assert.deepEqual([S.p95Ms, S.afterS], [45, 5]);
  let m = newMonitor();
  assert.equal(feed(m, 0, 60, 16.7).fired, 0, "60 fps for a minute");
  m = newMonitor();
  const slow = feed(m, 0, 4.5, 60);                         // 60 ms frames for 4.5 s: not 5 s yet
  assert.equal(slow.fired, 0);
  const more = feed(m, slow.t, 2.5, 60);                    // … 7 s in all (the window needs ~1.2 s to fill, then 5 s over)
  assert.equal(more.fired, 1, "one step down");
  // after it the window starts again: another 5 s of slow frames is needed
  const again = feed(m, more.t, 4, 60);
  assert.equal(again.fired, 0);
  assert.equal(feed(m, again.t, 4, 60).fired, 1);
});
test("step-down: the p95 is what counts — a few spikes do not, a recovery resets the 5 s", () => {
  let m = newMonitor();
  assert.equal(feed(m, 0, 30, 16.7, 40, 120).fired, 0, "one 120 ms frame in 40 (2.5 %): the p95 stays low");
  m = newMonitor();
  const a = feed(m, 0, 4, 80);
  const calm = feed(m, a.t, 4, 16.7);                        // back under the threshold: the clock of "over" stops
  assert.equal(feed(m, calm.t, 4, 80).fired, 0, "4 s over, 4 s calm, 4 s over: never 5 in a row");
});
test("step-down: a hitch (a level build, a hidden tab: a frame over 500 ms) is not counted", () => {
  const m = newMonitor();
  let t = 0, fired = 0;
  for (let i = 0; i < 600; i++) { t += 16.7; if (monitorFrame(m, 16.7, t)) fired++; if (i % 100 === 99) { t += 3000; if (monitorFrame(m, 3000, t)) fired++; } }
  assert.equal(fired, 0);
});
test("there is no step up: the monitor only ever answers 'one tier down'", () => {
  const m = newMonitor();
  assert.equal(typeof monitorFrame(m, 5, 10), "boolean");
  assert.equal(lowerTier("low"), "low");
});
