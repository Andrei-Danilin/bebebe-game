// SPEC-025 AC 7 / 7b: friendly errors. reportError — every error the game catches (the guarded frame loop, the window's
// error / unhandledrejection handlers of index.html's non-module script, a failed start) goes into the local error log
// (bebebe-errors: message, stack head, version, mode, level — never names or save content; never sent anywhere) and, once
// the game is running, shows the "Oops" card once: the game pauses; Continue goes on, Restart level starts the level again.
// The same error repeating (every frame) is counted in its log entry and does not show the card again until Continue.
// showCard / hideCard — the DOM cards over the game (also the context-loss card, lifecycle). failStart — a start that cannot
// go on: logged, and the loading screen says why (index.html's __bbBoot.fail). Client module.

import { G } from "../core/active.js";
import { CFG } from "../core/config.js";
import { L } from "../i18n.js";
import { mode, resumeGame, retryLevel, setMode, toHome } from "./flow.js";
import { readErrorLog, writeErrorLog } from "./progress.js";
import { restartTutorialGame } from "./tutorial.js";

let log = null;                      // the error log (read on the first error)
let logDirty = false, logWrittenAt = 0;
let pausedByOops = false, lastShown = null;   // the entry the last card showed (the same one again → also a reload button)
const version = () => { try { return document.querySelector("meta[name=src-hash]").content; } catch (e) { return "?"; } };
const levelOf = () => (G ? `${G.world} ${G.level}` : "-");
// the message of anything thrown: an Error's message, a string or a number as text, any other value only as its type (never its
// content: a rejected object may carry names or save data)
function messageOf(err) {
  if (err instanceof Error) return String(err.message);
  if (typeof err === "string" || typeof err === "number" || typeof err === "boolean") return String(err);
  if (err === null || err === undefined) return String(err);
  const name = err && err.constructor && typeof err.constructor.name === "string" ? err.constructor.name : "";
  return `(${typeof err}${name ? " " + name : ""})`;
}
function entryOf(err) {
  const stack = err instanceof Error && err.stack ? String(err.stack).split("\n").slice(0, CFG.ERROR_STACK_LINES).join("\n") : "";
  return { message: messageOf(err).slice(0, CFG.ERROR_MESSAGE_MAX), stack, version: version(), mode, level: levelOf(), count: 1 };
}
const sameEntry = (a, b) => !!a && !!b && a.message === b.message && a.stack === b.stack;
// writes the log if a repeat count is waiting (at most every CFG.ERROR_LOG_WRITE_EVERY s; lifecycle.js on hide)
export function flushErrorLog(force = true) {
  if (!log || !logDirty) return;
  if (!force && performance.now() - logWrittenAt < CFG.ERROR_LOG_WRITE_EVERY * 1000) return;
  logDirty = false; logWrittenAt = performance.now();
  writeErrorLog(log);
}
// into the log only (no card): a new entry is written at once; the same error as the last entry only counts there (written at
// most every CFG.ERROR_LOG_WRITE_EVERY s, and on hide). → the entry
export function logError(err) {
  try {
    if (!log) log = readErrorLog();
    const e = entryOf(err), last = log.at(-1);
    if (sameEntry(last, e)) { last.count = (last.count || 1) + 1; logDirty = true; flushErrorLog(false); return last; }
    log.push(e);
    if (log.length > CFG.ERROR_LOG_MAX) log.splice(0, log.length - CFG.ERROR_LOG_MAX);
    console.error(err);              // a new error: once to the console (the developers' view)
    logDirty = true; flushErrorLog(true);
    return e;
  } catch (e) { return null; /* the log must never throw */ }
}
export const errorLog = () => { flushErrorLog(true); return (log || readErrorLog()).map(e => ({ ...e })); };
// a card is over the game (Oops, context loss): keys and pad buttons do not reach the game under it (input.js)
export const cardOpen = () => !!document.querySelector(".bb-card");
// Enter / Space / pad A on an open card: its first button (or the card's own tap)
export function pressCard() {
  const el = document.querySelector(".bb-card");
  if (!el) return false;
  const b = el.querySelector("button");
  (b || el).click();
  return true;
}
// an error of the running game: logged, and the Oops card (once while it is open — the DOM is the truth, so a card closed any
// way can show again); before the game is ready only logged
export function reportError(err) {
  const e = logError(err);
  if (window.__bbReady !== true || document.getElementById("oops")) return;
  try { openOops(e); } catch (x) { /* the card itself failed: the log has it */ }
}
// In a level: Continue and Restart level. Elsewhere: Continue and Home — and when the same error opens the card again right
// after it was closed (it repeats on that screen), also Try again (reload; the start's own text, index.html)
function openOops(e) {
  const again = sameEntry(lastShown, e);
  lastShown = e;
  const inLevel = mode === "play" || mode === "pause";
  pausedByOops = mode === "play";
  if (pausedByOops) setMode("pause");
  const close = () => hideCard("oops");
  const buttons = [[L().resume, () => { close(); if (pausedByOops && mode === "pause") resumeGame(); }]];
  if (inLevel) buttons.push([L().restartLevel, () => { close(); if (G.tutorialGame) restartTutorialGame(); else retryLevel(); }]);
  else buttons.push([L().home, () => { close(); toHome(); }]);
  const tryAgain = window.__bbBoot && window.__bbBoot.tryAgain;
  if (again && tryAgain) buttons.push([tryAgain, () => { flushErrorLog(true); location.reload(); }]);
  showCard("oops", L().oops, buttons);
}

// ---------- the cards ----------
// a card over the game (#id, class bb-card): its text and its buttons [[label, act]]; tapping the card itself → onTap
export function showCard(id, text, buttons = [], onTap = null) {
  hideCard(id);
  const wrap = document.getElementById("wrap") || document.body;
  const el = document.createElement("div"), box = document.createElement("div"), row = document.createElement("div");
  el.id = id; el.className = "bb-card"; row.className = "row";
  const msg = document.createElement("div"); msg.textContent = text;
  box.append(msg);
  for (const [label, act] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", e => { e.stopPropagation(); act(); });
    row.append(b);
  }
  if (buttons.length) box.append(row);
  el.append(box);
  if (onTap) el.addEventListener("click", onTap);
  el.addEventListener("pointerdown", e => e.stopPropagation());
  wrap.append(el);
  return el;
}
export function hideCard(id) { const el = document.getElementById(id); if (el) el.remove(); }

// a start that cannot go on (kind: "noWebGL" | "startFailed"): logged, and the loading screen says it (index.html)
export function failStart(kind, err) {
  if (err) logError(err);
  try { if (window.__bbBoot) window.__bbBoot.fail(kind); } catch (e) { /* no start screen */ }
}

// called once by main.js, in the start order of the one-file game
export function initErrors() {
  const B = window.__bbBoot;
  if (!B) return;
  for (const [err] of B.early.splice(0)) logError(err);   // errors before this module ran
  B.onError = err => reportError(err);
}
