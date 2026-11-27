// SPEC-011 / SPEC-039 (from input.js): what the fingers and the keyboard leave on the screen — the touch sticks of the players and the
// name input (an HTML <input> over a rectangle of the canvas). The state the frame loop, the screens and the HUD read; the handlers that
// create it (pointer, key, pad events) are in input.js, above these. Client module.
import { CFG } from "../core/config.js";
import { G } from "../core/active.js";
import { L } from "../i18n.js";
import { LOOK } from "./look.js";
import { cleanName, nameFor, setName } from "./names.js";
import { CSS_W, PHONE, UW, wrap } from "./screen.js";

// Касания: левая половина — игрок 1, правая — игрок 2 (в игре на одного — весь экран)
export const sticks = new Map();
export const chipName = l => G.players === 1 ? L().me : String(l.id + 1);   // короткая метка игрока в кружке HUD
const STICK_R = 55;
// радиус джойстика в UI px: на телефоне — PHONE_STICK_R в CSS px (под палец), иначе как было
export const stickR = () => PHONE ? LOOK.PHONE_STICK_R * UW / CSS_W : STICK_R;
// SPEC-038 AC 1: a player's stick is a stack of his pointers (the Map keeps them in the order they landed): the newest finger
// steers; lifting it falls back to the previous one; lifting an older one changes nothing; all lifted — the hero stops
export const activeStick = player => { let a = null; for (const s of sticks.values()) if (s.player === player) a = s; return a; };
export const clearSticks = () => sticks.clear();   // SPEC-038: the fingers are gone (the "turn your device" wall, a level left)
export const activeSticks = () => [0, 1].map(activeStick).filter(Boolean);

// Поле ввода имени: HTML <input> ровно поверх прямоугольника на холсте (rect в логических пикселях)
export let nameInput = null;   // { el, slot, rect }
export function placeNameInput() {
  if (!nameInput) return;
  const k = CSS_W / UW, r = nameInput.rect;
  Object.assign(nameInput.el.style, { left: r.x * k + "px", top: r.y * k + "px", width: r.w * k + "px", height: r.h * k + "px", fontSize: Math.max(LOOK.PHONE_TEXT.input, r.h * k * 0.5) + "px" });
}
export function openNameInput(rect, slot) {
  closeNameInput(true);
  const el = document.createElement("input");
  el.type = "text"; el.className = "name-input"; el.maxLength = CFG.NAME_MAX * 2; el.value = nameFor(slot);   // эмодзи — 2 знака UTF-16; cleanName режет до NAME_MAX
  el.setAttribute("enterkeyhint", "done"); el.setAttribute("autocapitalize", "words"); el.setAttribute("autocomplete", "off"); el.spellcheck = false;
  nameInput = { el, slot, rect };
  placeNameInput();
  el.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); closeNameInput(true); }
    else if (e.key === "Escape") { e.preventDefault(); closeNameInput(false); }
  });
  el.addEventListener("blur", () => closeNameInput(true));
  wrap.appendChild(el);
  el.focus(); el.select();
}
export function closeNameInput(save) {
  if (!nameInput) return;
  const { el, slot } = nameInput;
  nameInput = null;
  if (save && cleanName(el.value) !== nameFor(slot)) setName(slot, el.value);   // не менял — имя по умолчанию остаётся «языковым»
  el.remove();
}
// after fit() (screen.js asks input.js's initInput to register it): a phone turned sideways closes the field (the name is kept; the
// keyboard only changes the height), then the field is placed again on the rebuilt canvas
export function afterFit(oldCSSW) {
  if (PHONE && nameInput && CSS_W !== oldCSSW) closeNameInput(true);
  placeNameInput();
}
