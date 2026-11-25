// SPEC-025 phase 2 (AC 4, 4b, 6, 6b, 6c): the DOM parts of the saves for grown-ups.
// - parentGate(onPass): the one gate of every adult-only action — a multiplication of two factors CFG.GATE_MIN…GATE_MAX written in
//   words in the current language, CFG.GATE_ANSWERS answer buttons, a new question after a wrong answer (no long press, no tap
//   count). While the grown-ups page is open its actions pass at once (the page itself was gated).
// - The "For grown-ups" page (reached from How to play): the version, the parents' code (copy: clipboard + selectable text; paste:
//   a text field, then importConfirm), restore an older copy, undo a reset, the error log with Copy, erase all data, the noSave note.
// - The save notes (saveRecovered, freshStart, noSave): shown once each, in the menus, as a small note that goes away by itself.
// DOM (class bb-card like the other cards: keys and pad reach it, not the game). Client module.

import { CFG } from "../../core/config.js";
import { vrand } from "../../core/util.js";
import { L, lang } from "../../i18n.js";
import { errorLog, hideCard } from "../errors.js";
import { progressReplaced } from "../progress.js";
import { eraseAll, importSave, listCopies, readCode, restoreCopy, saveCode, saveInfo, takeNote } from "../save.js";
import { LOOK } from "../look.js";

// ---------- the gate ----------
let gate = null;                             // the open question { a, b, answers, wait } (or null)
const word = n => L().numberWords[n - CFG.GATE_MIN] || String(n);
const randInt = (a, b) => a + Math.floor(vrand() * (b - a + 1));
// a question: the product and CFG.GATE_ANSWERS - 1 other products near it, shuffled
function newQuestion() {
  const a = randInt(CFG.GATE_MIN, CFG.GATE_MAX), b = randInt(CFG.GATE_MIN, CFG.GATE_MAX), right = a * b, answers = [right];
  const near = [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, right + 10, right - 10, right + 2, right - 2];
  for (const v of near) if (answers.length < CFG.GATE_ANSWERS && v > 0 && !answers.includes(v)) answers.push(v);
  for (let i = answers.length - 1; i > 0; i--) { const j = Math.floor(vrand() * (i + 1)); [answers[i], answers[j]] = [answers[j], answers[i]]; }
  return { a, b, answers };
}
// the page is open → an adult action on it passes at once; else the question card
export function parentGate(onPass) {
  if (document.getElementById("grownups")) { onPass(); return; }
  askGate(onPass, false);
}
// Review fix: guessing does not pass — after a wrong answer the new question ignores taps for CFG.GATE_WRONG_WAIT s (its answer
// buttons are disabled), and the highlight (Enter / pad A) starts on ✕, so mashing a key or a pad button only closes the gate.
// onCancel — ✕ (e.g. back to the page that asked)
function askGate(onPass, wrong, onCancel = null) {
  if (gate) clearTimeout(gate.wait);
  gate = newQuestion();
  const el = card("gate", [wrong ? L().gateWrong : null, L().parentsGate(word(gate.a), word(gate.b))]);
  const row = el.querySelector(".row"), answers = [];
  for (const v of gate.answers) answers.push(button(row, String(v), () => {
    if (v === gate.a * gate.b) { closeGate(); onPass(); } else askGate(onPass, true, onCancel);
  }, "answer"));
  const x = button(row, "✕", () => { closeGate(); if (onCancel) onCancel(); }, "close");
  if (wrong) {
    for (const b of answers) b.disabled = true;
    gate.wait = setTimeout(() => { for (const b of answers) b.disabled = false; }, CFG.GATE_WRONG_WAIT * 1000);
  }
  x.classList.add("hl"); x.focus({ preventScroll: true });
}
function closeGate() { if (gate) clearTimeout(gate.wait); gate = null; hideCard("gate"); }
export const gateState = () => (gate && document.getElementById("gate") ? { a: gate.a, b: gate.b, answers: [...gate.answers] } : null);

// ---------- DOM helpers ----------
// a card (#id, class bb-card) with lines of text and an empty button row
function card(id, lines, page = false) {
  hideCard(id);
  const wrap = document.getElementById("wrap") || document.body;
  const el = document.createElement("div"), box = document.createElement("div"), row = document.createElement("div");
  el.id = id; el.className = "bb-card" + (page ? " page" : ""); row.className = "row";
  for (const t of lines) if (t) { const m = document.createElement("div"); m.textContent = t; box.append(m); }
  box.append(row); el.append(box);
  el.addEventListener("pointerdown", e => e.stopPropagation());
  wrap.append(el);
  return el;
}
function button(parent, label, act, act2) {
  const b = document.createElement("button");
  b.textContent = label;
  if (act2) b.dataset.act = act2;
  b.addEventListener("click", e => { e.stopPropagation(); act(); });
  parent.append(b);
  return b;
}
function focusFirst(el) { const b = el.querySelector("button"); if (b) { b.classList.add("hl"); b.focus({ preventScroll: true }); } }
const version = () => { try { return document.querySelector("meta[name=src-hash]").content; } catch (e) { return "?"; } };

// ---------- the grown-ups page ----------
// opened from How to play, behind the gate
export function openGrownUps() { parentGate(showPage); }
function showPage(note = null) {
  const el = card("grownups", [L().forGrownUps], true), box = el.firstChild, row = el.querySelector(".row");
  box.firstChild.className = "title";
  const line = (t, cls) => { const d = document.createElement("div"); d.textContent = t; if (cls) d.className = cls; box.insertBefore(d, row); return d; };
  line(`${L().version}: ${version()}`, "small");
  if (saveInfo.noSave) line(L().noSave, "note");
  if (note) line(note, "note");
  const act = (label, name, fn) => button(row, label, () => parentGate(fn), name);
  act(L().copyCode, "copyCode", copyCode);
  act(L().pasteCode, "pasteCode", pasteCode);
  if (saveInfo.copies.reset) act(L().undoReset, "undoReset", () => restoreAndShow("reset"));
  act(L().restoreCopy, "restoreCopy", showCopies);
  act(L().errorLog, "errorLog", showLog);
  // review fix: erasing everything always asks the gate again (also with the page open)
  button(row, L().eraseAll, () => { closePage(); askGate(confirmErase, false, () => showPage()); }, "eraseAll");
  button(row, L().ok, closePage, "close");
  focusFirst(el);
}
function closePage() { hideCard("grownups"); }
// a sub-view of the page: its lines, a text area (optional) and buttons [[label, name, act]]
function subView(lines, buttons, text = null) {
  const el = card("grownups", [L().forGrownUps, ...lines], true), box = el.firstChild, row = el.querySelector(".row");
  box.firstChild.className = "title";
  let area = null;
  if (text !== null) {
    area = document.createElement("textarea");
    area.id = "code-text"; area.rows = 4; area.value = text; area.spellcheck = false;
    area.addEventListener("pointerdown", e => e.stopPropagation());
    area.addEventListener("keydown", e => e.stopPropagation());   // typing: the arrows, Enter and Space stay in the field (not the card's keys)
    box.insertBefore(area, row);
  }
  for (const [label, name, fn] of buttons) button(row, label, fn, name);
  focusFirst(el);
  return { el, area };
}
// copy: the code into the clipboard (codeCopied) and always as selected text to copy by hand (the fallback)
function copyCode() {
  const code = saveCode(), v = subView([], [[L().ok, "back", () => showPage()]], code);
  v.area.readOnly = true; v.area.select();
  const done = () => { if (v.el.isConnected) { const m = document.createElement("div"); m.className = "note"; m.dataset.note = "codeCopied"; m.textContent = L().codeCopied; v.el.firstChild.insertBefore(m, v.area); } };
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { /* the selected text is the fallback */ }); } catch (e) { /* no clipboard */ }
}
// paste: a text field (navigator.clipboard.readText would prompt on iOS), then the code is checked and confirmed
function pasteCode(msg = null) {
  const v = subView(msg ? [msg] : [], [[L().ok, "importCode", () => checkCode(v.area.value)], ["✕", "back", () => showPage()]], "");
  v.area.focus();
}
function checkCode(text) {
  const r = readCode(text);
  if (!r.ok) { pasteCode(L()[r.error]); return; }
  subView([L().importConfirm], [[L().ok, "importYes", () => { importSave(r.save); progressReplaced(); showPage(); }], [L().resetCancel, "importNo", () => showPage()]]);
}
const when = at => { try { return new Date(at).toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-AR" : lang); } catch (e) { return String(at); } };
// the stored copies (newest kinds first) → a button each: the date, the stars and the coins it holds
async function showCopies() {
  const list = await listCopies();
  const v = subView([L().restoreCopy], list.map(q => [`📅 ${when(q.at)} · ⭐ ${q.stars} · 🪙 ${q.coins}`, "copy:" + q.name, () => restoreAndShow(q.name)]).concat([["✕", "back", () => showPage()]]));
  v.el.dataset.copies = list.map(q => q.name).join(",");
}
async function restoreAndShow(name) {
  if (await restoreCopy(name)) progressReplaced();
  showPage();
}
function showLog() {
  const text = errorLog().map(e => `${e.message}${e.count > 1 ? " ×" + e.count : ""} · ${e.mode} · ${e.level} · ${e.version}${e.stack ? "\n" + e.stack : ""}`).join("\n\n");
  const v = subView([L().errorLog], [[L().copy, "copyLog", () => { v.area.select(); try { navigator.clipboard.writeText(text).catch(() => { /* selected */ }); } catch (e) { /* no clipboard */ } }], [L().ok, "back", () => showPage()]], text);
  v.area.readOnly = true;
}
// the highlight (Enter / pad A) starts on "No, keep it"
function confirmErase() {
  const v = subView([L().eraseAll + "?"], [[L().resetConfirm, "eraseYes", () => { eraseAll().then(() => location.reload()); }], [L().resetCancel, "eraseNo", () => showPage()]]);
  const no = v.el.querySelector("[data-act=eraseNo]");
  v.el.querySelectorAll("button").forEach(b => b.classList.toggle("hl", b === no));
  no.focus({ preventScroll: true });
}

// ---------- the save notes ----------
// called by main.js's frame while the menus are on screen: the next note due, once, for LOOK.BANNER_SAVE_NOTE s
let noteUntil = 0;
export function showDueNote(now) {
  const el = document.getElementById("save-note");
  if (el && now < noteUntil) return;
  if (el) el.remove();
  const key = takeNote();
  if (!key) return;
  const n = document.createElement("div");
  n.id = "save-note"; n.className = "bb-note"; n.dataset.note = key; n.textContent = L()[key];
  (document.getElementById("wrap") || document.body).append(n);
  noteUntil = now + LOOK.BANNER_SAVE_NOTE * 1000;
}
