// SPEC-025 AC 14 / 14b / 14c: the app's lifecycle. Hidden (visibilitychange, pagehide) or blurred (the notification shade,
// the iOS Control Centre, a call) during play → pause, and the game stays paused when it comes back; audio is suspended until
// the next gesture (sound.js). On hide a win that is already decided is recorded and saved first (settleDecidedWin; every other
// change is already queued at once — the save queue is flushed after it, SPEC-025 AC 3b); a page back from the back/forward cache goes on.
// WebGL context loss → pause and the "Tap to continue" card; restored → the 3D is rebuilt and a tap continues; no restore within
// CFG.GL_RESTORE_WAIT s while the game is on screen → the decided win, save and reload. Client module.

import { CFG } from "../core/config.js";
import { L } from "../i18n.js";
import { flushErrorLog, hideCard, showCard } from "./errors.js";
import { mode, resumeGame, setMode, settleDecidedWin } from "./flow.js";
import { clearSticks, closeNameInput, nameInput } from "./input.js";
import { saveProgress } from "./progress.js";
import { rotateWall } from "./screen.js";
import { flushSaves } from "./save.js";
import { suspendAudio } from "./sound.js";
import { rebuild3D } from "./three/characters.js";
import { gradTex } from "./three/materials.js";
import { scene } from "./three/setup.js";

const pauseIfPlaying = () => { if (mode === "play") setMode("pause"); };
// SPEC-038 AC 2 (RR-72): the phone turned upright ("turn your device" wall): the fingers on the sticks are dropped, an open name
// input closes (name kept), a level in play pauses — and stays paused when the phone is turned back (the pause menu, no auto-resume).
// Called by main.js every frame (drawing changes no state, SPEC-012 AC 1f)
export function pauseForWall() {
  if (!rotateWall()) return;
  clearSticks();
  if (nameInput) closeNameInput(true);
  pauseIfPlaying();
}
// the app goes to the background: the decided win first (queued as it is paid), then the save queue is written (AC 3b: the
// localStorage backend is synchronous, so it is stored before the page can be killed), then pause and silence
function onHide() {
  settleDecidedWin();
  flushErrorLog();                          // a repeat count still waiting for its write
  flushSaves();
  pauseIfPlaying();
  suspendAudio();
  clearTimeout(glWait);                     // the restore wait runs only while the game is seen (re-armed when visible)
}

// ---------- WebGL context loss ----------
export let glRestored = false;            // the last loss is restored (the card's tap continues)
let glWait = null, pausedByGl = false, glLost = false;
// no restore within CFG.GL_RESTORE_WAIT s while the game is on screen: the decided win, save, reload
function armGlWait() {
  clearTimeout(glWait);
  if (!glLost || document.visibilityState === "hidden") return;
  glWait = setTimeout(() => { settleDecidedWin(); saveProgress(); flushErrorLog(); flushSaves(); location.reload(); }, CFG.GL_RESTORE_WAIT * 1000);
}
function onContextLost(e) {
  e.preventDefault();                       // the browser may restore the context
  glRestored = false; glLost = true;
  pausedByGl = mode === "play";
  pauseIfPlaying();
  armGlWait();
  showCard("gl-lost", L().glLost, [], () => {
    if (!glRestored) return;                // not back yet: the card stays
    hideCard("gl-lost");
    if (pausedByGl && mode === "pause") resumeGame();
  });
}
// every texture is uploaded again (three.js made a new context: the ground canvas, the gradient and grain textures, the
// previews), the level's characters are built again
function onContextRestored() {
  glLost = false;
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
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide(); else armGlWait(); });
  window.addEventListener("pagehide", onHide);
  window.addEventListener("blur", pauseIfPlaying);
  const gl = document.getElementById("gl");
  if (gl) { gl.addEventListener("webglcontextlost", onContextLost); gl.addEventListener("webglcontextrestored", onContextRestored); }
}
