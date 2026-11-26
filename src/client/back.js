// SPEC-033 AC 13 (D-14): the system Back (Android: the installed app and the browser) and Escape on the home screen ask "Leave the game?".
// - history.pushState keeps one guard entry on top of the game's own: a real Back (popstate) lands one entry below the guard; the
//   game handles that Back and puts the guard back (one Back = one step), so the page is never left by accident.
// - Back on any other screen does what Escape / ◀ does there: flow.js goBack (map → home, card → map, play → pause, …). An open
//   card (the grown-ups page, the gate) is closed by its ✕; the Oops card stays.
// - The home screen: the dialog (a DOM card, keys and pad work like on the other cards; the highlight starts on No); the guard is
//   back under it, so another Back is a No. "Yes" goes back in history past the guard (two steps; the installed app closes).
// - Sim mode has no history entries and no dialog. Client module.

import { L } from "../i18n.js";
import { hideCard, showCard } from "./errors.js";
import { goBack, mode } from "./flow.js";
import { simMode } from "./screen.js";
import { ui } from "./state.js";

// __bb.back: how many times "Yes" was chosen; noLeave — the tests count the leaves without navigating
export const backInfo = { leaves: 0, noLeave: false };
let onGuard = false, leaving = false;
const GUARD = { bbGuard: 1 };

function pushGuard() {
  try { history.pushState(GUARD, ""); onGuard = true; } catch (e) { onGuard = false; /* no history (a sandboxed frame): Back leaves as usual */ }
}
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
function leave() {
  hideCard("leave");
  backInfo.leaves++;
  if (backInfo.noLeave) return;
  try {
    if (onGuard) leaving = true;           // asked by Escape: the guard is still on top — one Back takes it, the next one leaves
    history.back();
  } catch (e) { /* nothing to go back to */ }
}
function onPop() {
  onGuard = false;
  if (leaving) { leaving = false; try { history.back(); } catch (e) { /* ignore */ } return; }
  if (leaveOpen()) { stay(); return; }           // a Back with the dialog open is a No
  const card = document.querySelector(".bb-card");
  if (card) {                                    // another card is open: its ✕ closes it (the Oops card has none and stays)
    const x = /** @type {HTMLElement | null} */ (card.querySelector("[data-act=close]"));
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
  try { if (history.state && history.state.bbGuard) onGuard = true; else pushGuard(); } catch (e) { /* no history */ }   // a reload keeps its entry (and its guard)
  window.addEventListener("popstate", onPop);
}
