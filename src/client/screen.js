// SPEC-011: the two canvases, fit() (letterbox / phone full screen, DPR), UW/UH, isTouch, STANDALONE, PHONE, sim mode
// (simMode, sim()). Client module (moved out of index.html in Phase C).

import { H, W } from "../core/config.js";
import { artLoad } from "./art.js";
import { closeNameInput, nameInput, placeNameInput } from "./input.js";
import { LOOK } from "./look.js";
import { ui } from "./state.js";
import { rebuild3D } from "./three/characters.js";
import { renderer } from "./three/setup.js";

// =====================================================================
//  ЭКРАН: снизу 3D-холст (Three.js), сверху прозрачный 2D-слой для меню и подписей
// =====================================================================
export const wrap = document.getElementById("wrap");
export const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
export let ctx = canvas.getContext("2d");
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

export let onFit = null;               // телефон: 3D-камера подстраивается под форму холста (задаётся в разделе 3D)
export function fit() {
  DPR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);   // на планшетах чуть меньше пикселей — плавнее
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
  if (PHONE && nameInput && CSS_W !== oldCSSW) closeNameInput(true);   // телефон повернули — имя сохраняем, поле закрываем (клавиатура меняет только высоту)
  placeNameInput();
}
// sim(on): включить/выключить режим симуляции; без аргумента — только узнать. Выключили — 3D строится заново.
export function sim(on) {
  if (typeof on === "boolean" && on !== simMode) { simMode = on; if (!on) { rebuild3D(); artLoad(); } }
  return { on: simMode, renders: ui.renders, draws: ui.draws, sounds: ui.sounds };
}

// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setOnFit(v) { onFit = v; }
export function setCtx(v) { ctx = v; }

// called once by main.js, in the start order of the one-file game
export function initScreen() {
  try { simMode = new URLSearchParams(location.search).get("sim") === "1"; } catch (e) { /* без адреса — обычная игра */ }
  if (PHONE) document.body.classList.add("phone");
  window.addEventListener("resize", () => fit());
  window.addEventListener("orientationchange", () => requestAnimationFrame(() => fit())); // iOS обновляет safe-area чуть позже
}
