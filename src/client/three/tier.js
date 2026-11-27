// SPEC-040 AC 6 / 7: puts a quality tier into the 3D. At once: the shadow map (size, kind) and the pixel ratio (fit), the paper grain (syncPaper
// reads the tier each frame). The two changes that freeze a frame — the renderer's MSAA (a new canvas and renderer) and the background decor (the
// map is built again) — are applied at once only for a choice (the grown-ups page, the tests); a tier the game picked by itself (the start probe,
// a step down in play) leaves them waiting (Q.pending) for the next level build (startGame, the warm-up behind the level card: applyPendingTier)
// or a pause (adaptive.js), so no frame of play is lost to them. The level itself goes on: the game is untouched. Client module.

import { Q, setPending, setTier, tierOf } from "../quality.js";
import { fit } from "../screen.js";
import { rebuild3D } from "./characters.js";
import { forgetMap } from "./map3d.js";
import { msaaOn, recreateRenderer, scene, setShadowQuality } from "./setup.js";

let appliedDecor = /** @type {number | null} */ (null);   // the decor share the map in the scene was built with
let onCanvasHook = /** @type {((canvas: HTMLCanvasElement) => void) | null} */ (null);
/** runs when the renderer was made again (before the old context goes): the lifecycle moves its context-loss listeners; set once by adaptive.js */
export const setCanvasHook = fn => { onCanvasHook = fn; };

/** @param {string} name  @param {boolean} [defer] true: leave the MSAA and the decor for the next level build or a pause */
export function applyTier3D(name, defer = false) {
  if (appliedDecor === null) appliedDecor = tierOf(Q.tier).decor;
  setTier(name);
  const next = tierOf(name), heavy = next.msaa !== msaaOn() || next.decor !== appliedDecor;
  if (heavy && defer) setPending(true);                    // (the shadow map and the pixel ratio below do not wait)
  else if (heavy) applyHeavy(true);
  if (setShadowQuality(next.shadow, next.shadowType === "basic")) scene.traverse(o => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
  fit();                                                   // the pixel ratio of the tier (and a new renderer's size)
}
// the waiting changes: a new renderer for the MSAA, the map built again for the decor (rebuild: now; else the next level build makes it)
function applyHeavy(rebuild) {
  const next = tierOf(Q.tier);
  setPending(false);
  if (next.msaa !== msaaOn()) recreateRenderer(next.msaa, onCanvasHook);
  if (next.decor !== appliedDecor) { appliedDecor = next.decor; forgetMap(); if (rebuild) rebuild3D(); }
}
/** a level is about to be built (startGame, the warm-up's first stage: rebuild false — the build that follows makes the map) or the game is paused (rebuild true) */
export function applyPendingTier(rebuild) {
  if (!Q.pending) return;
  applyHeavy(rebuild);
  fit();
}
