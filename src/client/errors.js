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
import { mode, resumeGame, retryLevel, setMode } from "./flow.js";
import { readErrorLog, writeErrorLog } from "./progress.js";
import { restartTutorialGame } from "./tutorial.js";

let log = null;                      // the error log (read on the first error)
let oopsOpen = false, pausedByOops = false;
const version = () => { try { return document.querySelector("meta[name=src-hash]").content; } catch (e) { return "?"; } };
const levelOf = () => (G ? `${G.world} ${G.level}` : "-");
function entryOf(err) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : (() => { try { return JSON.stringify(err); } catch (e) { return String(err); } })();
  const stack = err instanceof Error && err.stack ? String(err.stack).split("\n").slice(0, CFG.ERROR_STACK_LINES).join("\n") : "";
  return { message: String(message).slice(0, 300), stack, version: version(), mode, level: levelOf(), count: 1 };
}
// into the log only (no card): the same error as the last entry is counted there
export function logError(err) {
  try {
    if (!log) log = readErrorLog();
    const e = entryOf(err), last = log.at(-1);
    if (last && last.message === e.message && last.stack === e.stack) last.count = (last.count || 1) + 1;
    else {
      log.push(e);
      if (log.length > CFG.ERROR_LOG_MAX) log.splice(0, log.length - CFG.ERROR_LOG_MAX);
      console.error(err);            // a new error: once to the console (the developers' view)
    }
    writeErrorLog(log);
  } catch (e) { /* the log must never throw */ }
}
export const errorLog = () => (log || readErrorLog()).map(e => ({ ...e }));
// an error of the running game: logged, and the Oops card (once, until Continue); before the game is ready only logged
export function reportError(err) {
  logError(err);
  if (window.__bbReady !== true || oopsOpen) return;
  try { openOops(); } catch (e) { /* the card itself failed: the log has it */ }
}
function openOops() {
  oopsOpen = true;
  const inLevel = mode === "play" || mode === "pause";
  pausedByOops = mode === "play";
  if (pausedByOops) setMode("pause");
  const close = () => { hideCard("oops"); oopsOpen = false; };
  const buttons = [[L().resume, () => { close(); if (pausedByOops && mode === "pause") resumeGame(); }]];
  if (inLevel) buttons.push([L().restartLevel, () => { close(); if (G.tutorialGame) restartTutorialGame(); else retryLevel(); }]);
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
