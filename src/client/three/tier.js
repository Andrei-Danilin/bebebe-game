// SPEC-040 AC 6 / 7: puts a quality tier into the 3D. The renderer's MSAA (a new canvas and renderer when it changes), the shadow map (size, kind),
// the pixel ratio (fit), the paper grain (syncPaper reads the tier each frame) and the background decor (the map is built again — the level itself
// goes on: the game is untouched). Client module.

import { Q, tierOf } from "../quality.js";
import { fit } from "../screen.js";
import { rebuild3D } from "./characters.js";
import { forgetMap } from "./map3d.js";
import { msaaOn, recreateRenderer, scene, setShadowQuality } from "./setup.js";

/** @param {string} name  @param {((canvas: HTMLCanvasElement) => void) | null} [onCanvas] runs when the renderer was made again (before the old context goes) */
export function applyTier3D(name, onCanvas = null) {
  const was = tierOf(Q.tier), next = tierOf(name);
  Q.tier = name;
  let shaders = false;
  if (next.msaa !== msaaOn()) recreateRenderer(next.msaa, onCanvas);
  if (setShadowQuality(next.shadow, next.shadowType === "basic")) shaders = true;
  if (shaders) scene.traverse(o => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
  fit();                                                  // the pixel ratio of the tier (and the new renderer's size)
  if (was.decor !== next.decor) { forgetMap(); rebuild3D(); }
}
