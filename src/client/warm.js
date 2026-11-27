// SPEC-040 AC 4 (RR-48): the warm-up behind the level card. Opening the card of a level (chooseStop sets ui.warm) is the one moment the game knows
// which level comes next and has a second or more before it starts, so the work that made the first frames of a level hitch is done then, one
// stage a frame, while the card is shown:
//   game   — the showcase game of that level (G.level = the card's level; the menus' backdrop: it takes a copy of the rng stream, so Play still
//            plays the game it would have played), without building the 3D yet;
//   map    — the 3D map: parts, geometries, batches (buildMap3D, batch.js);
//   shaders— the shader variants of the fades, compiled without blocking a frame (compileFadeVariants → renderer.compileAsync);
//   chars  — the Little Ones' and the Big One's models (a boss in his clothes) — rebuildChars3D;
//   upload — everything drawn once so the geometries, the instance and vertex buffers and the textures (the ground, the hatch) are on the GPU:
//            a few top-level parts of the map and of the characters per frame, with a one-pixel scissor, only in a frame that draws the world
//            anyway (cadence.js: the rest of the canvas is painted by the world frame that follows);
//   done   — the world is shown again (it was hidden while built) and counted as rebuilt: one cheap world frame.
// Play before the end cancels it (startGame clears ui.warm): the normal start builds what is missing — never more than it did before — and
// finds the map (same mapKey) and the models (same looks) already there. A level started any other way (Next, Retry, a practice game,
// __bb.startGame) is built as before, and the map and the models of the same level and team are reused (rebuild3D). Client module.

import { G } from "../core/active.js";
import { resetWorld } from "./flow.js";
import { CSS_H, CSS_W } from "./screen.js";
import { mode, ui } from "./state.js";
import { charGroup, deferRebuild, noteRebuilt, rebuildChars3D, rebuildMap3D, showWorld } from "./three/characters.js";
import { compileFadeVariants, setCompileLater } from "./three/map3d.js";
import { mapGroup } from "./three/mapstate.js";
import { camera, renderer, scene } from "./three/setup.js";

const SLICE = 8;                                  // top-level parts drawn per frame in the upload stage
const CARD_MODES = ["levelCard", "story", "scene"];   // the card, its story page, the comic before a level
const W = { key: "", phase: "", queue: /** @type {any[]} */ ([]), at: 0 };

/** @returns {{ key: string, phase: string, done: boolean }} */
export const warmInfo = () => ({ key: ui.warm ? W.key : "", phase: ui.warm ? W.phase : "", done: !!ui.warm && W.phase === "done" });   // (no card, no warm-up: Play or closing the card ends it at once)

function stop() {
  if (["shaders", "compiling", "chars", "upload"].includes(W.phase)) showWorld(true);   // cut short while the world was hidden
  W.phase = ""; W.key = ""; W.queue = []; W.at = 0;
}
// draws some of the world's parts once, into one pixel
function drawSlice(items) {
  const all = [...mapGroup.children, ...charGroup.children], keep = new Set(items), was = all.map(o => o.visible);
  all.forEach(o => { o.visible = keep.has(o); });
  showWorld(true);
  renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.setViewport(0, 0, CSS_W, CSS_H);
  try { renderer.render(scene, camera); } finally {
    renderer.setScissorTest(false);
    all.forEach((o, i) => { o.visible = was[i]; });
    showWorld(false);
  }
}
// once a frame, outside the frame's guard against gameplay randomness (main.js): the stages that build a game and the 3D
export function warmBuild() {
  const want = ui.warm;
  if (!want || !CARD_MODES.includes(mode) || G.world !== want.world) { if (W.phase) stop(); return; }
  const key = want.world + ":" + want.level;
  if (W.key !== key) { stop(); W.key = key; W.phase = "game"; }
  switch (W.phase) {
    case "game":
      G.level = want.level;
      deferRebuild(true);
      try { resetWorld(G.players); } finally { deferRebuild(false); }
      W.phase = "map";
      break;
    case "map":
      setCompileLater(true);
      try { rebuildMap3D(); } finally { setCompileLater(false); }
      showWorld(false);
      W.phase = "shaders";
      break;
    case "shaders": {
      W.phase = "compiling";
      const k = W.key;
      compileFadeVariants().catch(() => { /* the first frame compiles them */ }).finally(() => { if (W.key === k && W.phase === "compiling") W.phase = "chars"; });
      break;
    }
    case "chars":
      rebuildChars3D(); showWorld(false);
      W.queue = [...mapGroup.children, ...charGroup.children]; W.at = 0;
      W.phase = "upload";
      break;
    default:
  }
}
// once a frame, before the world is drawn (worldFrame: this frame draws the world): one slice of the upload stage
export function warmUpload(worldFrame) {
  if (W.phase !== "upload" || !worldFrame) return;
  drawSlice(W.queue.slice(W.at, W.at + SLICE));
  W.at += SLICE;
  if (W.at >= W.queue.length) { showWorld(true); noteRebuilt(); W.phase = "done"; }
}
