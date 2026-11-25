// SPEC-011: the players', the Big One's and the bots' names (bebebe-names): cleanName, initNames, nameFor, setName, nameOf.
// Client module (moved out of index.html in Phase C).

import { CFG } from "../core/config.js";
import { L } from "../i18n.js";

// ---------- Имена: игроки, Большой, боты (localStorage bebebe-names; "" = имя по умолчанию на текущем языке) ----------
const NAME_SLOTS = ["p1", "p2", "big", "bot1", "bot2", "bot3", "bot4"];
export const BOT_SLOTS = 4;
export function cleanName(s) {
  if (typeof s !== "string") return "";
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();     // без управляющих символов
  return Array.from(s).slice(0, CFG.NAME_MAX).join("").trim();      // длина — по кодовым точкам (эмодзи = 1)
}
let namesTyped = { p1: "", p2: "", big: "", bots: ["", "", "", ""] };
// имена из bebebe-names (initSaves)
export function initNames() {
  try {
    const nv = JSON.parse(localStorage.getItem("bebebe-names") || "null");
    if (nv && typeof nv === "object") {
      const bots = Array.isArray(nv.bots) ? nv.bots : [];
      namesTyped = { p1: cleanName(nv.p1), p2: cleanName(nv.p2), big: cleanName(nv.big), bots: Array.from({ length: BOT_SLOTS }, (_, i) => cleanName(bots[i])) };
    }
  } catch (e) { /* сломанные данные — имена по умолчанию */ }
}
const saveNames = () => { try { localStorage.setItem("bebebe-names", JSON.stringify(namesTyped)); } catch (e) { /* ok */ } };
export const typedName = slot => slot.startsWith("bot") ? namesTyped.bots[Number(slot.slice(3)) - 1] : namesTyped[slot];
function defaultName(slot) {
  if (slot === "p1") return L().player1;
  if (slot === "p2") return L().player2;
  if (slot === "big") return L().defaultBig;
  return L().defaultBots[Number(slot.slice(3)) - 1];
}
export const nameFor = slot => typedName(slot) || defaultName(slot);
export function setName(slot, text) {
  if (!NAME_SLOTS.includes(slot)) return;
  const v = cleanName(text);
  if (slot.startsWith("bot")) namesTyped.bots[Number(slot.slice(3)) - 1] = v; else namesTyped[slot] = v;
  saveNames();
}
export const allNames = () => ({ p1: nameFor("p1"), p2: nameFor("p2"), big: nameFor("big"), bots: [1, 2, 3, 4].map(i => nameFor("bot" + i)) });
const slotOf = l => l.isBig ? "big" : l.kind === "player" && l.id < 2 ? "p" + (l.id + 1) : "bot" + (Math.max(0, l.botIndex) % BOT_SLOTS + 1);
export const nameOf = l => nameFor(slotOf(l));
