// SPEC-040 AC 6 / 7 (RR-43, D-4, D-17): the quality tier — which of LOOK.QUALITY's three the game draws with now (high / medium / low), the mode it
// was chosen in (auto, or a tier the grown-ups chose), what the start probe measured, how many steps down this session. Pure: no DOM, no three.js;
// pickTier maps the probe's milliseconds to a tier, monitorFrame is the step-down rule fed with each frame's time and the clock (a test drives it
// with fake times; adaptive.js feeds it the real ones). Client module (a leaf).

import { LOOK } from "./look.js";

export const TIERS = Object.freeze(["high", "medium", "low"]);
export const MODES = Object.freeze(["auto", ...TIERS]);
/** the state: the tier in use, how it was chosen, the probe's median ms per frame (null: not probed), the step-downs of this session */
export const Q = { tier: "high", mode: "auto", pinned: false, probeMs: /** @type {number | null} */ (null), steps: 0 };   // pinned: a test fixed the tier (nothing is saved)

/** @param {string} [name] */
export const tierOf = (name = Q.tier) => LOOK.QUALITY[name] || LOOK.QUALITY.high;
export const tierNumbers = () => tierOf(Q.tier);
/** the pixel-ratio cap of the tier (touch screens: high already stops at 1.5) */
export function dprCap(touch) { const c = tierOf(Q.tier).dprCap; return typeof c === "number" ? c : touch ? c.touch : c.desktop; }
/** the tier for the ms per frame the start probe measured at the high tier */
export function pickTier(ms) { const P = LOOK.QUALITY.probe; return ms <= P.highMs ? "high" : ms <= P.mediumMs ? "medium" : "low"; }
export const lowerTier = (/** @type {string} */ t) => TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(t) + 1)];
/** which of the decor (index 0, 1, 2, …) a tier keeps: a share of `frac`, spread evenly (index i is kept when the count of kept ones grows), the same everywhere */
export const keepDecor = (i, frac) => Math.floor((i + 1) * frac + 1e-9) > Math.floor(i * frac + 1e-9);

/** the step-down monitor: { samples: [[ms of the clock, frame ms]], over: since when p95 is over, n } */
export const newMonitor = () => ({ samples: /** @type {number[][]} */ ([]), over: /** @type {number | null} */ (null), n: 0 });
/** one frame: its real length (ms) and the clock (ms); true once the p95 of the window has been over the threshold for afterS seconds */
export function monitorFrame(m, frameMs, now, S = LOOK.QUALITY.stepDown) {
  if (frameMs > S.ignoreMs) return false;                       // a hitch (a level build, a tab that was hidden), not the steady state
  m.samples.push([now, frameMs]);
  while (m.samples.length && now - m.samples[0][0] > S.windowS * 1000) m.samples.shift();
  if (++m.n % 10 !== 0 || m.samples.length < S.minFrames) return false;
  const ms = m.samples.map(s => s[1]).sort((a, b) => a - b), p95 = ms[Math.floor(0.95 * ms.length)];
  if (p95 <= S.p95Ms) { m.over = null; return false; }
  if (m.over === null) m.over = now;
  if (now - m.over >= S.afterS * 1000) { m.over = null; m.samples.length = 0; return true; }
  return false;
}
