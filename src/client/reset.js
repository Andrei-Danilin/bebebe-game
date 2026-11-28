// SPEC-011 / SPEC-039 (from progress.js): the reset of the progress (SPEC-033: its buttons are on the grown-ups page, behind the gate) and
// "a whole save replaced the progress". The reset (AC 6b): the first tap arms it (the button shows resetCancel — a tap there cancels)
// and a separate resetConfirm button appears at another place, which ignores taps for CFG.RESET_CONFIRM_DELAY s; before wiping, the
// save is kept as bebebe-save-before-reset (undo on the grown-ups page, next to the reset). They rebuild the game on screen (flow.js),
// so they sit above it. Client module.
import { G } from "../core/active.js";
import { CFG, WORLDS } from "../core/config.js";
import { progress, setProgress, worldProgress } from "../core/economy.js";
import { isOpenNow } from "./entitlement.js";
import { resetWorld, setLastReward } from "./flow.js";
import { fitOutfitsToOwned } from "./outfits.js";
import { saveProgress } from "./progress.js";
import { forgetHeldProgress, snapshotBeforeReset } from "./save.js";
import { screenChanged, ui } from "./state.js";

// ---------- AC 6b: reset progress ----------
let armedAt = 0;                             // performance.now() of the arming tap
const setArmed = v => { if (ui.resetArmed !== v) { ui.resetArmed = v; screenChanged(); } };   // SPEC-025 AC 7d: another button
// the reset button: the first tap arms (resetConfirm appears elsewhere); on the armed button (resetCancel) a tap cancels
export function armReset() {
  if (ui.resetArmed) { setArmed(false); return; }
  armedAt = performance.now();
  setArmed(true);
}
// the confirm button: taps in the first CFG.RESET_CONFIRM_DELAY s are ignored (a double tap or two fingers never reset)
export const resetConfirmReady = () => ui.resetArmed && performance.now() - armedAt >= CFG.RESET_CONFIRM_DELAY * 1000;
export function confirmReset() {
  if (!resetConfirmReady()) return null;
  return resetProgress();
}
// the reset itself (the confirm button; __bb.resetProgress for the tests): the save is kept as bebebe-save-before-reset first
// → the promise of the copy being written (the grown-ups page shows the undo when it is done)
export function resetProgress() {
  setArmed(false);
  const copy = snapshotBeforeReset();
  G.rewardDue = false;                         // прогресс заменён целиком: за брошенный уровень не платим
  setProgress(null); forgetHeldProgress(); ui.openedWorld = null; ui.worldBanner = null;   // новый прогресс
  if (!isOpenNow(G.world)) G.world = WORLDS[0];   // SPEC-016/030: после сброса открыт только Парк
  progress.lastWorld = G.world;
  fitOutfitsToOwned();                       // SPEC-009: купленные наряды ушли вместе с прогрессом
  saveProgress(); G.level = 1; resetWorld(G.players);
  return copy;
}
// a whole save replaced the progress (restore a copy, undo a reset, import a code): the menu as after a start
export function progressReplaced() {
  G.rewardDue = false; setLastReward(null); ui.openedWorld = null; ui.worldBanner = null;
  G.world = isOpenNow(progress.lastWorld) ? progress.lastWorld : WORLDS[0];   // SPEC-045: a world the purchase closes is not the menu's world
  G.level = worldProgress().unlocked;
  resetWorld(G.players);
}
