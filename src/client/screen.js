// SPEC-011: the two canvases, fit() (letterbox / phone full screen, DPR), UW/UH, isTouch, STANDALONE, PHONE, sim mode
// (simMode, sim()). Client module (moved out of index.html in Phase C).

import { H, W } from "../core/config.js";
import { LOOK } from "./look.js";
import { dprCap } from "./quality.js";
import { renderer } from "./three/setup.js";

// =====================================================================
//  ЭКРАН: снизу 3D-холст (Three.js), сверху прозрачный 2D-слой для меню и подписей
// =====================================================================
export const wrap = document.getElementById("wrap");
export const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
export const ctx = canvas.getContext("2d");   // SPEC-039: never swapped (the 3D painters pass their own context, ui/canvas.js)
export const OUT = "#3d2b1f";        // мультяшный контур
export let VIEW = 1, CSS_W = W, CSS_H = H, DPR = 1;
export let UW = W, UH = H;             // логический размер слоя интерфейса (на компьютере = миру; на телефоне — свой, SPEC-005)

export const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
// Запущено как приложение с экрана «Домой» (для тестов: ?standalone=1)
export function isStandalone() {
  try {
    return navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches
      || new URLSearchParams(location.search).get("standalone") === "1";
  } catch (e) { return false; }
}
export const STANDALONE = isStandalone();                 // режим отображения не меняется за сессию
// SPEC-038 AC 4 (RR-34): кнопка «во весь экран» — только где она что-то делает: есть Fullscreen API (обычный или webkit; на iPhone
// Safari его нет) и это не установленное приложение. Решается при рисовании: HUD (hud.js, phone.js) и сдвиг кнопок рядом
export const fullscreenShown = () => !STANDALONE && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
// Телефон (SPEC-005): сенсорный экран с короткой стороной ≤ PHONE_MAX_SHORT_SIDE; ?phone=1 / ?phone=0 — принудительно.
function isPhone() {
  try {
    const q = new URLSearchParams(location.search).get("phone");
    if (q === "1") return true;
    if (q === "0") return false;
    return isTouch && Math.min(screen.width, screen.height) <= LOOK.PHONE_MAX_SHORT_SIDE;
  } catch (e) { return false; }
}
export const PHONE = isPhone();                           // решается один раз при запуске, как STANDALONE
// SPEC-038 AC 2 / 3: «поверни устройство» — только на телефоне (PHONE или сенсорный экран с короткой стороной ≤ PHONE_MAX_SHORT_SIDE),
// пока он стоит вертикально. Планшет (в том числе окно iPadOS вдвое уже экрана) и высокое окно компьютера играют в портрете
// с полями; screen — весь экран устройства, а не окно. Считается каждый раз: окно меняется
export function rotateWall() {
  try { return isTouch && window.innerHeight > window.innerWidth && (PHONE || Math.min(screen.width, screen.height) <= LOOK.PHONE_MAX_SHORT_SIDE); } catch (e) { return false; }
}
// SPEC-008: режим симуляции (?sim=1 или __bb.sim(true)): без 3D, без 2D, без звука, цикл кадров игру не двигает —
// её шагает __bb.simRun. Счётчики — для теста: сколько раз рисовали 3D, 2D и сколько звуков просили (не в sim).
export let simMode = false;

// Место для игры: body без отступов safe-area (вырез и полоска «домой» на iPhone).
function playArea() {
  const b = document.body, cs = getComputedStyle(b);
  const w = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return { w: w > 0 ? w : window.innerWidth, h: h > 0 ? h : window.innerHeight };
}

export let afterFit = null;             // SPEC-039: what fit() does last, given the old CSS width (input.js's initInput sets it: the name input)
export let onFit = null;               // телефон: 3D-камера подстраивается под форму холста (задаётся в разделе 3D)
export let fitCount = 0;               // SPEC-038 AC 2: сколько раз fit() переделал холсты (для теста: пачка resize — один раз)
// SPEC-038 AC 2 (RR-72): пачка resize / orientationchange за кадр — один fit() (он пересоздаёт оба холста). Событие только ставит флаг;
// fit() делает начало следующего кадра игры (runQueuedFit в tick, ДО рисования: кадр не рисуется на старых размерах); rAF — запасной
// путь, когда цикл кадров не идёт (sim: tick выходит; вкладка скрыта)
let fitQueued = false, fitFallback = false;
export function runQueuedFit() {
  if (!fitQueued) return;
  fitQueued = false;
  fit();
}
function fitSoon() {
  fitQueued = true;
  if (fitFallback) return;
  fitFallback = true;
  requestAnimationFrame(() => { fitFallback = false; runQueuedFit(); });
}
export function fit() {
  fitCount++;
  DPR = Math.min(window.devicePixelRatio || 1, dprCap(isTouch));   // на планшетах чуть меньше пикселей — плавнее; SPEC-040: потолок — по уровню качества
  const area = playArea();
  const oldCSSW = CSS_W;
  if (PHONE) {
    // телефон: весь экран без полос; интерфейс — высотой PHONE_UI_H, ширина по соотношению сторон
    CSS_W = Math.max(1, Math.floor(area.w)); CSS_H = Math.max(1, Math.floor(area.h));
    UH = LOOK.PHONE_UI_H; UW = UH * CSS_W / CSS_H;
  } else {
    const s = Math.min(area.w / W, area.h / H);
    CSS_W = Math.floor(W * s); CSS_H = Math.floor(H * s);
  }
  wrap.style.width = CSS_W + "px"; wrap.style.height = CSS_H + "px";
  canvas.style.width = CSS_W + "px"; canvas.style.height = CSS_H + "px";
  canvas.width = Math.max(1, Math.floor(CSS_W * DPR)); canvas.height = Math.max(1, Math.floor(CSS_H * DPR));
  VIEW = canvas.width / UW;
  if (renderer) { renderer.setPixelRatio(DPR); renderer.setSize(CSS_W, CSS_H, true); }
  if (onFit) onFit();
  if (afterFit) afterFit(oldCSSW);                           // SPEC-039: devices.js's name input (телефон повернули — имя сохраняем, поле закрываем)
}

// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setOnFit(v) { onFit = v; }
export function setAfterFit(v) { afterFit = v; }
export function setSimMode(v) { simMode = v; }          // SPEC-039: sim() (debug.js) switches it; it rebuilds the 3D and the art itself

// called once by main.js, in the start order of the one-file game
export function initScreen() {
  try { simMode = new URLSearchParams(location.search).get("sim") === "1"; } catch (e) { /* без адреса — обычная игра */ }
  if (PHONE) document.body.classList.add("phone");
  window.addEventListener("resize", fitSoon);
  window.addEventListener("orientationchange", fitSoon);   // iOS обновляет safe-area чуть позже — кадр спустя
}
