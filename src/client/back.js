// SPEC-033 AC 13 (D-14): the system Back (Android: the installed app and the browser) and Escape on the home screen ask "Leave the game?".
// - history.pushState keeps one guard entry on top of the game's own: a real Back (popstate) lands one entry below the guard; the
//   game handles that Back and puts the guard back (one Back = one step), so the page is never left by accident.
// - Back on any other screen does what Escape / ◀ does there: flow.js goBack (map → home, card → map, play → pause, …). An open
//   card (the grown-ups page, the gate) is closed by its ✕; the Oops card stays.
// - The home screen: the dialog (a DOM card, keys and pad work like on the other cards; the highlight starts on No); the guard is
//   back under it, so another Back is a No. "Yes" goes back in history past the guard (two steps; the installed app closes).
// - The guard is pushed at the player's first user activation — a tap's release (pointerup / touchend) or a key other than Escape
//   (Chrome skips history entries made before one, so one pushed at start could be skipped by Back); a reload on a guard entry keeps
//   it. A player with only a gamepad never activates the page: no guard, the system Back leaves unasked, pad B still asks (goBack).
// - Yes with nothing behind the game (an installed app, a tab with no earlier entry) closes the window. Chrome refuses that for a
//   window no script opened unless its history has one entry (ours has the guard too), so if the page is still there after
//   LOOK.BACK_CLOSE_WAIT the game steps off its guard (back to its own entry: that pop opens no dialog and puts no guard back) and
//   the next system Back leaves (the Android app closes, the tab goes back); the next activation puts the guard back (asked again).
// - Sim mode has no history entries and no dialog. Client module.

import { L } from "../i18n.js";
import { hideCard, showCard } from "./errors.js";
import { goBack, mode } from "./flow.js";
import { LOOK } from "./look.js";
import { isStandalone, simMode } from "./screen.js";
import { ui } from "./state.js";

// __bb.back: how many times "Yes" was chosen; noLeave — the tests count the leaves without navigating
export const backInfo = { leaves: 0, noLeave: false };
let onGuard = false, leaving = false, closing = false;   // onGuard: our guard is the current entry
// after a refused window.close(): off — stepped off the guard (it is the entry ahead), going — that history.back() is under way,
// timer — the wait for the window to close
const step = { off: false, going: false, timer: 0 };
const GUARD = { bbGuard: 1 }, ACTIVATION = ["pointerup", "touchend", "keydown"];

function pushGuard() {
  try { history.pushState(GUARD, ""); onGuard = true; step.off = false; } catch (e) { onGuard = false; /* no history (a sandboxed frame): Back leaves as usual */ }
}
// the guard goes on at the next user activation (Escape is none: Chrome would let Back skip an entry pushed then)
function arm(e) {
  if (e.type === "keydown" && /** @type {KeyboardEvent} */ (e).key === "Escape") return;
  for (const t of ACTIVATION) window.removeEventListener(t, arm, true);
  if (!onGuard) pushGuard();
}
function armOnActivation() { for (const t of ACTIVATION) window.addEventListener(t, arm, true); }   // a listener added twice is one
export const leaveOpen = () => !!document.getElementById("leave");
// the dialog: Yes / No; Enter, Space and pad A press the highlighted button (errors.js), the highlight starts on No
export function askLeave() {
  if (leaveOpen()) return;
  const el = showCard("leave", L().leaveAsk, [[L().yes, leave], [L().no, stay]]);
  const buttons = [...el.querySelectorAll("button")], no = buttons[1];
  buttons.forEach(b => b.classList.toggle("hl", b === no));
  no.focus({ preventScroll: true });
}
// No (or Escape / pad B / another Back on the open dialog): the dialog closes (and the guard is put back if it is missing)
export function stay() {
  hideCard("leave");
  if (!onGuard) pushGuard();
}
// Escape and pad B on the open dialog; false when it is not open
export function leaveCancel() {
  if (!leaveOpen()) return false;
  stay();
  return true;
}
// nothing behind the game: the installed app, or history of only the game's own entry and our guard (on it or stepped off it)
const nothingBehind = () => isStandalone() || history.length <= (onGuard || step.off ? 2 : 1);
function leave() {
  hideCard("leave");
  backInfo.leaves++;
  if (backInfo.noLeave) return;
  if (nothingBehind()) { closeWindow(); return; }
  try {
    if (onGuard) leaving = true;           // the guard is on top — one Back takes it, the next one leaves
    history.back();
  } catch (e) { /* nothing to go back to */ }
}
// the app has no earlier page to go back to: close the window (some browsers do); one that refuses leaves us here — then, after
// LOOK.BACK_CLOSE_WAIT, step off the guard so the next system Back leaves (never a trap); the next activation puts it back
function closeWindow() {
  try { window.close(); } catch (e) { /* refused */ }
  clearTimeout(step.timer);
  step.timer = setTimeout(stepOffGuard, LOOK.BACK_CLOSE_WAIT * 1000);
}
function stepOffGuard() {
  step.timer = 0;
  if (closing) return;                           // the page is going away
  if (!onGuard) { armOnActivation(); return; }
  step.going = true;
  try { history.back(); } catch (e) { step.going = false; }
}
function onPop() {
  onGuard = false;
  clearTimeout(step.timer);                      // a Back while the window was to close: handled as usual, no step-off after it
  if (step.going) { step.going = false; step.off = true; armOnActivation(); return; }   // our own step off the guard: no dialog, no guard
  if (leaving) { leaving = false; try { history.back(); } catch (e) { /* ignore */ } return; }
  if (leaveOpen()) { stay(); return; }           // a Back with the dialog open is a No
  const card = document.querySelector(".bb-card");
  if (card) {                                    // another card is open: its ✕ (or its "No, keep it": data-back) closes it (the Oops card has none and stays)
    const x = /** @type {HTMLElement | null} */ (card.querySelector("[data-act=close], [data-back]"));
    if (x) x.click();
    pushGuard();
    return;
  }
  if (mode === "home") { askLeave(); pushGuard(); return; }   // the guard is back at once: a second Back is a No
  goBack();
  pushGuard();
}

// called once by main.js
export function initBack() {
  if (simMode) return;
  ui.homeBack = () => { if (!leaveCancel()) askLeave(); };   // flow.js goBack on the home screen (Escape, pad B): ask — or, with the dialog open, No
  window.addEventListener("popstate", onPop);
  window.addEventListener("pagehide", () => { closing = true; });
  window.addEventListener("pageshow", () => { closing = false; });   // back from the cache: the page did not go away after all
  try {
    if (history.state && history.state.bbGuard) { onGuard = true; return; }   // a reload keeps its entry (and its guard)
    armOnActivation();                           // an entry pushed before a user activation may be skipped by Back
  } catch (e) { /* no history */ }
}
