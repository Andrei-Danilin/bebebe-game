// SPEC-040 AC 7 (RR-43, D-17): which quality tier the game draws with, and when it changes.
//  - Start: a pinned tier (the tests: window.__bbQuality) or the grown-ups' choice from the save (setQualityChoice) is used as it is; otherwise
//    (auto) a short probe picks the tier: the home scene is drawn a few times at the high tier, the GPU waited for each time (readPixels), and the
//    median ms per frame goes through pickTier (LOOK.QUALITY.probe: ≤ 10 ms high, ≤ 22 medium, else low). It takes a few tens of ms on a good
//    phone and at most LOOK.QUALITY.probe.maxMs on a slow one.
//  - Play: in auto mode the p95 of the frame times over the last windowS seconds above p95Ms (D-17) for afterS seconds drops one tier (a pause, a
//    menu, a level just built or a hidden tab do not count); the tier never goes up during a run; the next start probes again.
//  - The grown-ups page: Auto / High / Medium / Low (setQualityMode): the choice is saved and applied at once, the level goes on.
// Client module.

import { LOOK } from "./look.js";
import { watchGl } from "./lifecycle.js";
import { MODES, monitorFrame, newMonitor, pickTier, lowerTier, Q } from "./quality.js";
import { qualityChoice, setQualityChoice } from "./save.js";
import { CSS_H, CSS_W } from "./screen.js";
import { camera, renderer, scene } from "./three/setup.js";
import { applyTier3D } from "./three/tier.js";

const monitor = newMonitor();
let lastMode = "";

// before the renderer exists (main.js, after the save is read): the tier the renderer is made with — MSAA is part of it
export function earlyQuality() {
  const pin = typeof window !== "undefined" ? window.__bbQuality : null;
  const m = MODES.includes(pin) ? pin : (MODES.includes(qualityChoice()) ? qualityChoice() : "auto");
  Q.mode = m; Q.pinned = MODES.includes(pin);
  Q.tier = m === "auto" ? "high" : m;
}
// the start probe: ms per frame of the home scene at the high tier (median after the shader-compiling frames), the GPU waited for
function probe() {
  if (typeof window !== "undefined" && Number.isFinite(window.__bbProbeMs)) return window.__bbProbeMs;   // (the tests give the probe's answer: the tier does not depend on the machine)
  const P = LOOK.QUALITY.probe, gl = renderer.getContext(), px = new Uint8Array(4), ms = [], t0 = performance.now();
  renderer.setViewport(0, 0, CSS_W, CSS_H);
  for (let i = 0; i < P.frames && performance.now() - t0 < P.maxMs; i++) {
    const a = performance.now();
    renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ms.push(performance.now() - a);
  }
  const rest = ms.slice(P.skip).sort((x, y) => x - y);
  return rest.length ? rest[rest.length >> 1] : (performance.now() - t0) / Math.max(1, ms.length);   // too slow to get past the compiling frames: the average of what ran
}
function pick() { Q.probeMs = Math.round(probe() * 10) / 10; applyTier3D(pickTier(Q.probeMs), watchGl); }
// called once by main.js, after the first scene is built
export function initQuality() {
  if (Q.mode !== "auto") { applyTier3D(Q.mode, watchGl); return; }   // a pinned or chosen tier (the renderer already has its MSAA; the rest is applied)
  pick();
}
// the grown-ups page, the tests: a choice (saved unless the tests pinned a tier), applied at once; auto probes again
export function setQualityMode(m) {
  if (!MODES.includes(m)) return;
  Q.mode = m;
  if (!Q.pinned) setQualityChoice(m);
  if (m === "auto") pick(); else applyTier3D(m, watchGl);
  monitor.samples.length = 0; monitor.over = null;
}
// once a frame (main.js): the step-down rule
export function qualityFrame(realS, mode, nowMs) {
  if (mode !== lastMode) { lastMode = mode; monitor.samples.length = 0; monitor.over = null; }
  if (Q.mode !== "auto" || mode !== "play" || Q.tier === "low") return;
  if (monitorFrame(monitor, realS * 1000, nowMs)) { Q.steps++; applyTier3D(lowerTier(Q.tier), watchGl); }
}
export const qualityInfo = () => ({ tier: Q.tier, mode: Q.mode, probeMs: Q.probeMs, steps: Q.steps });
