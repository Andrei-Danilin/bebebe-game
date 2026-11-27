// SPEC-011: menu building blocks: pButton, menuFrame, phoneFrame, phoneSkinCols, worldPicture. Client module (moved out of
// index.html in Phase C).

import { progress } from "../../core/economy.js";
import { paperPanel, paperUI } from "./paper.js";
import { LOOK } from "../look.js";
import { ctx, OUT, PHONE, UH, UW } from "../screen.js";
import { THEMES } from "../three/themes.js";
import { addButton, fillStroke, rr } from "./draw.js";
import { cpx, hudFont, menuFrameGeom, phoneFrameGeom } from "./layout.js";
import { textW } from "./measure.js";

// кнопка: надпись сжимается под ширину, но не мельче основного текста
export function pButton(x, y, w, h, text, color, act, css = 18) {
  const min = cpx(LOOK.PHONE_TEXT.main);
  let sz = Math.max(cpx(css), min);
  ctx.font = hudFont(sz);
  while (textW(text) > w - cpx(14) && sz > min) { sz = Math.max(min, sz - 0.5); ctx.font = hudFont(sz); }
  const b = addButton(x, y, w, h, text, color, act, sz);
  b.size = sz;
  return b;
}
// SPEC-017: рамка экрана меню — карточка и её поля из LOOK.MENU_LOOK (телефон — phoneFrame); box — своя карточка (главный экран)
/** @param {any} [box] @param {boolean} [card] */
export function menuFrame(box = LOOK.MENU_LOOK.frame, card = true) {
  if (PHONE) return phoneFrame(card);
  const M = LOOK.MENU_LOOK, x = UW / 2 - box.w / 2;
  if (card && !(paperUI() && paperPanel(x, box.y, box.w, box.h, box.r))) { rr(x, box.y, box.w, box.h, box.r); fillStroke(M.card, M.cardLine); }   // SPEC-020: бумага
  return menuFrameGeom(box);                                // SPEC-039: the geometry is layout.js's
}
// рамка экрана: отступы и светлая карточка на весь экран
export function phoneFrame(card = true) {
  const m = cpx(8);
  if (card && !(paperUI() && paperPanel(m, m, UW - 2 * m, UH - 2 * m, cpx(22)))) { rr(m, m, UW - 2 * m, UH - 2 * m, cpx(22)); fillStroke(LOOK.MENU_LOOK.card, 4); }
  return phoneFrameGeom();
}
// ---------- Миры (SPEC-006): звёзды мира, маленькая картинка из цветов THEMES (плашки бонусных миров на главном экране) ----------
export const worldStarsOf = w => Object.values(progress.worlds[w].stars).reduce((a, b) => a + b, 0);
// маленькая картинка мира: земля, вода, домик и куст в цветах темы (снежинки зимой)
export function worldPicture(w, x, y, sz) {
  const th = THEMES[w], r = sz * 0.2;
  ctx.save(); rr(x, y, sz, sz, r); ctx.clip();
  ctx.fillStyle = th.g1; ctx.fillRect(x, y, sz, sz);
  ctx.fillStyle = th.water.c; ctx.fillRect(x, y + sz * 0.72, sz, sz * 0.28);
  ctx.fillStyle = th.cottage.wall; ctx.fillRect(x + sz * 0.14, y + sz * 0.42, sz * 0.34, sz * 0.27);
  ctx.fillStyle = th.cottage.roof; ctx.beginPath();
  ctx.moveTo(x + sz * 0.07, y + sz * 0.44); ctx.lineTo(x + sz * 0.31, y + sz * 0.18); ctx.lineTo(x + sz * 0.55, y + sz * 0.44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = th.maze.wall; ctx.beginPath(); ctx.arc(x + sz * 0.75, y + sz * 0.5, sz * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1, sz * 0.04); ctx.strokeStyle = OUT; ctx.stroke();
  if (th.snow) { ctx.fillStyle = "#fff"; for (const [a, b] of [[0.2, 0.1], [0.62, 0.14], [0.88, 0.28], [0.45, 0.62]]) { ctx.beginPath(); ctx.arc(x + sz * a, y + sz * b, sz * 0.045, 0, Math.PI * 2); ctx.fill(); } }
  ctx.restore();
  rr(x, y, sz, sz, r); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
}
