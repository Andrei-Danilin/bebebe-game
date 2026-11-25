// SPEC-025 AC 14 / 14b / 14c: the app's lifecycle. Hidden (visibilitychange, pagehide) or blurred (the notification shade,
// the iOS Control Centre, a call) during play → pause, and the game stays paused when it comes back; audio is suspended until
// the next gesture (sound.js). On hide a win that is already decided is recorded and saved first (settleDecidedWin; every other
// change is already saved at once — Phase 2's save queue is flushed after it); a page back from the back/forward cache goes on.
// WebGL context loss → pause and the "Tap to continue" card; restored → the 3D is rebuilt and a tap continues; no restore within
// CFG.GL_RESTORE_WAIT s → save and reload. Client module.

import { CFG } from "../core/config.js";
import { L } from "../i18n.js";
import { hideCard, showCard } from "./errors.js";
import { mode, resumeGame, setMode, settleDecidedWin } from "./flow.js";
import { saveProgress } from "./progress.js";
import { suspendAudio } from "./sound.js";
import { rebuild3D } from "./three/characters.js";
import { gradTex } from "./three/materials.js";
import { scene } from "./three/setup.js";

const pauseIfPlaying = () => { if (mode === "play") setMode("pause"); };
// the app goes to the background: the decided win first (saved as it is paid), then pause and silence. Every other change is
// already in storage (each change saves at once), so nothing else is written here — writing the whole progress again would
// overwrite what another tab or an older build wrote meanwhile. Phase 2 flushes its save queue here, after the win
function onHide() {
  settleDecidedWin();
  pauseIfPlaying();
  suspendAudio();
}

// ---------- WebGL context loss ----------
export let glRestored = false;            // the last loss is restored (the card's tap continues)
let glWait = null, pausedByGl = false;
function onContextLost(e) {
  e.preventDefault();                       // the browser may restore the context
  glRestored = false;
  pausedByGl = mode === "play";
  pauseIfPlaying();
  clearTimeout(glWait);
  glWait = setTimeout(() => { saveProgress(); location.reload(); }, CFG.GL_RESTORE_WAIT * 1000);
  showCard("gl-lost", L().glLost, [], () => {
    if (!glRestored) return;                // not back yet: the card stays
    hideCard("gl-lost");
    if (pausedByGl && mode === "pause") resumeGame();
  });
}
// every texture is uploaded again (three.js made a new context: the ground canvas, the gradient and grain textures, the
// previews), the level's characters are built again
function onContextRestored() {
  clearTimeout(glWait);
  gradTex.needsUpdate = true;
  scene.traverse(o => {
    for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v && v.isTexture) v.needsUpdate = true;
  });
  rebuild3D();
  glRestored = true;
}

// called once by main.js, in the start order of the one-file game
export function initLifecycle() {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide(); });
  window.addEventListener("pagehide", onHide);
  window.addEventListener("blur", pauseIfPlaying);
  const gl = document.getElementById("gl");
  if (gl) { gl.addEventListener("webglcontextlost", onContextLost); gl.addEventListener("webglcontextrestored", onContextRestored); }
}
