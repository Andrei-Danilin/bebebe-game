// SPEC-039: the geometry of the screen layers — the HUD and menu boxes as functions of the screen size (UW, UH, CSS_W, PHONE) and LOOK,
// with no drawing (only the team's size and a text measure for the chips): CSS px → UI px (cpx), the phone's top bar, mini-map and team chips, the
// menu frame, the Character screen's columns, the phone's wardrobe columns. The 3D camera (it keeps the hero out from under the HUD)
// and the 3D previews (they sit in the menu boxes) read it, and so do the 2D screens that draw into the same boxes — one source, no
// import of the UI by the 3D. Client module.
import { G } from "../../core/active.js";
import { L, lang } from "../../i18n.js";
import { LOOK } from "../look.js";
import { ctx, PHONE, UH, UW, CSS_W } from "../screen.js";
import { mode } from "../state.js";

// ---------- CSS px → UI px и шрифт интерфейса ----------
// CSS px → UI px: на телефоне кнопки и шрифты задаются в CSS px (под палец), рисуем в UI px
export const cpx = n => n * UW / CSS_W;
export const minPx = cat => cpx(LOOK.PHONE_TEXT[cat]);   // самый мелкий текст этого вида в UI px
export const hudFont = sz => `900 ${sz}px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;

// ---------- Телефон: мини-карта, верхняя полоса, кружки команды ----------
export const showMinimap = () => PHONE && (mode === "play" || mode === "pause");
// правый верхний угол, ширина MINIMAP_W от ширины интерфейса, 3:2 (как карта 30×20)
export function minimapRect() {
  const m = LOOK.MINIMAP_MARGIN, w = Math.round(UW * LOOK.MINIMAP_W), h = w * 2 / 3;
  return { x: UW - m - w, y: m, w, h };
}
// геометрия верхней полосы и кружков команды телефона (их же обходят камера и стрелки)
export const phoneTopBar = () => cpx(6) + cpx(LOOK.PHONE_BTN_MIN);
// кружок не уже любой своей метки («Я», «Б», 1, 2, счёт лежащего, z, !) самым мелким шрифтом подсказок с запасом PHONE_CHIP_FONT
// на более широкие шрифты (SPEC-029: шрифты CI и iPhone шире — «Me» не влезал в 30 CSS px). Запас постоянный, не от
// LOOK.TEXT_TEST_SCALE: раскладка (камера, надпись уровня) не меняется, пока тест расширяет шрифт. Метки — от языка, не от состояния
let chipCache = { key: "", d: 0 };
function chipDiameter() {
  const key = [lang, cpx(1)].join(":");                    // мерка — один раз на язык и размер UI
  if (chipCache.key === key) return chipCache.d;
  const f = ctx.font;
  ctx.font = hudFont(minPx("hint"));
  const need = Math.max(...[L().me, L().botChip, "1", "2", "88", "z", "!"].map(t => ctx.measureText(t).width)) * LOOK.PHONE_CHIP_FONT;
  ctx.font = f;
  chipCache = { key, d: Math.max(cpx(30), need + cpx(4)) };
  return chipCache.d;
}
export function teamRect() {
  const mm = minimapRect(), cd = chipDiameter(), cw = cd + cpx(3), w = G.littles.length * cw + cpx(10), h = cd + cpx(8);
  return { x: mm.x + mm.w - w, y: mm.y + mm.h + cpx(LOOK.PHONE_BTN_GAP), w, h, cd, cw };
}

// места экрана, где героя не видно: верхняя полоса и угол мини-карты с кружками (pad — запас);
// sides — ещё полосы у левого и правого края (для камеры: герой с именем целиком на экране)
export function phoneOccluders(pad = 0, sides = 0) {
  const mm = minimapRect(), tr = teamRect(), top = phoneTopBar();
  // ways — куда камере уводить героя из-под этого места, по порядку: сначала первый, второй — когда первый упёрся
  const r = [{ x: -1e4, y: -1e4, w: 2e4, h: 1e4 + top + pad, ways: ["down"] },
    { x: Math.min(mm.x, tr.x) - pad, y: -1e4, w: 2e4, h: 1e4 + tr.y + tr.h + pad, ways: ["down", "left"] }];   // SPEC-010: кружки шире маленькой мини-карты
  if (sides) r.push({ x: -1e4, y: -1e4, w: 1e4 + sides, h: 2e4, ways: ["right"] }, { x: UW - sides, y: -1e4, w: 2e4, h: 2e4, ways: ["left"] });
  return r;
}

// ---------- Рамки экранов меню и колонки Персонажа ----------
// SPEC-039: the geometry of a menu screen's frame, without drawing it (menuFrame / phoneFrame of menu.js draw the card on top of it)
export function phoneFrameGeom() {
  const m = cpx(8), p = cpx(12);
  return { X0: m + p, X1: UW - m - p, Y0: m + p, Y1: UH - m - p, g: cpx(LOOK.PHONE_BTN_GAP), B: cpx(LOOK.PHONE_BTN_MIN) };
}
/** @param {any} [box] */
export function menuFrameGeom(box = LOOK.MENU_LOOK.frame) {
  if (PHONE) return phoneFrameGeom();
  const M = LOOK.MENU_LOOK, F = M.frame, x = UW / 2 - box.w / 2;
  return { X0: x + F.padX, X1: x + box.w - F.padX, Y0: box.y + F.padY, Y1: box.y + box.h - F.padY, g: F.g, B: F.B, x, y: box.y, w: box.w, h: box.h };
}
// наряды: колонка игрока 1 (шире: 4 строки нарядов) и колонка Большого; окошки 3D-превью
// SPEC-017: под верхней полосой магазина (вкладки), без заголовков колонок — имя на подписи под превью
export function phoneSkinCols() {
  const { X0, X1, Y0, g, B } = phoneFrameGeom(), gap = cpx(16), inner = X1 - X0 - gap, w1 = inner * 0.62, w2 = inner - w1;
  const pv = cpx(LOOK.MENU_LOOK.wardrobe.preview), py = Y0 + B + g + cpx(6);
  return [
    { key: "p1", x: X0, w: w1, panel: { x: X0, y: py, w: pv, h: pv } },
    { key: "big", x: X0 + w1 + gap, w: w2, panel: { x: X0 + w1 + gap + (w2 - pv) / 2, y: py, w: pv, h: pv } }
  ];
}
// раскладка: три колонки под вкладками (компьютер — до ряда «Готово»): слева вид и имя игрока 1, посередине
// звёзды и миры, справа рюкзак, улучшения, гардероб; preview — окошко 3D-вида (его же берёт skinPanels для рендера)
export function progressGeom() {
  const L0 = LOOK.MENU_LOOK.progress, P = PHONE ? L0.phone : L0, c = PHONE ? cpx : (n => n);
  let x0, x1, y0, y1, B;
  if (PHONE) { const f = phoneFrameGeom(); x0 = f.X0; x1 = f.X1; y0 = f.Y0 + f.B + f.g; y1 = f.Y1; B = f.B; }
  else { const f = menuFrameGeom(); x0 = f.X0; x1 = f.X1; y0 = L0.top; y1 = L0.bottom; B = f.B; }
  const g = c(P.gap), lw = c(P.left), rest = x1 - x0 - lw - 2 * g, mw = rest * P.mid, h = y1 - y0, pv = Math.min(lw, c(P.pv));
  return { P, c, g, B, left: { x: x0, y: y0, w: lw, h }, mid: { x: x0 + lw + g, y: y0, w: mw, h }, right: { x: x0 + lw + 2 * g + mw, y: y0, w: rest - mw, h },
    preview: { x: x0 + (lw - pv) / 2, y: y0, w: pv, h: pv } };
}
