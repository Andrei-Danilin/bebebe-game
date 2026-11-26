// SPEC-011: text drawing and fitting: label, fitText, wrapText, labelFit, noteRows, sideFit, the phone text sizes (cpx,
// minPx, fz, hudFont), the menu text helpers (pLabel, pRows, pWrap), fmtTime, fmtHearts. Client module (moved out of
// index.html in Phase C).

import { clamp } from "../../core/util.js";
import { L } from "../../i18n.js";
import { paperUI } from "../art.js";
import { LOOK } from "../look.js";
import { CSS_H, CSS_W, ctx, OUT, PHONE, UW } from "../screen.js";
import { ui } from "../state.js";
import { fillT, strokeT } from "./draw.js";

export const fmtHearts = n => (Math.floor(n) || (n % 1 ? "" : "0")) + (n % 1 ? "½" : "");   // 2.5 → «2½», 0.5 → «½»
export const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export const labelStroke = size => Math.max(3, size / 4.5);   // толщина обводки надписи label()
// число на белой плашке (монетки, звёзды): тёмный текст без обводки — с обводкой цвета OUT цифры сливаются
export function plainText(text, x, y, size, color = OUT, align = "left") {
  ctx.font = hudFont(size); ctx.textAlign = /** @type {CanvasTextAlign} */ (align); ctx.textBaseline = "middle"; ctx.fillStyle = color;
  fillT(text, x, y);
  if (PHONE) noteText("drawn", size);
}
const INK = new Set(Object.values(LOOK.PAPER.ink));
// яркость цвета 0..1 (#rgb, #rrggbb, rgb()/rgba()); не разобрали — 1 (светлый: обычная обводка)
const lumCache = new Map();
function colorLum(c) {
  let v = lumCache.get(c);
  if (v !== undefined) return v;
  const s = String(c).trim();
  let rgb = null, m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1]; rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s))) rgb = [m[1], m[2], m[3]].map(Number);
  v = rgb ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : 1;
  lumCache.set(c, v);
  return v;
}
export function label(text, x, y, size, color, align = "center") {
  ctx.font = `900 ${size}px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;   // = hudFont(size)
  ctx.textAlign = /** @type {CanvasTextAlign} */ (align); ctx.textBaseline = "middle";
  if (!(INK.has(color) && paperUI())) {        // SPEC-020: чернила на бумажном экране (LOOK.PAPER.ink) — без обводки
    const P = LOOK.PAPER, dark = colorLum(color) < P.darkInk;   // тёмная надпись (таймер, ×N, имя Большого на плашке) — светлый ореол
    ctx.lineJoin = "round"; ctx.lineWidth = dark ? size * P.haloW : labelStroke(size); ctx.strokeStyle = dark ? P.halo : OUT;
    strokeT(text, x, y);
  }
  ctx.fillStyle = color; fillT(text, x, y);
  if (PHONE) noteText("drawn", size);
}
export function fitText(text, x, y, size, maxW, align, color, weight, min = 9, scaled = false) {
  let sz = size + 0.5, w;
  do { sz = Math.max(min, sz - 0.5); ctx.font = `${weight} ${sz}px system-ui, "Segoe UI", sans-serif`; w = ctx.measureText(text).width; } while (w > maxW && sz > min);
  noteOverflow(text, w * min / sz, maxW, scaled);
  ctx.textAlign = /** @type {CanvasTextAlign} */ (align); ctx.textBaseline = "middle"; ctx.fillStyle = color;
  fillT(text, x, y);
  if (PHONE) noteText("drawn", sz);
  return sz;   // размер, которым написано
}
function noteOverflow(text, wMin, maxW, scaled) {
  const k = LOOK.TEXT_TEST_SCALE, w = wMin * k, lim = scaled ? maxW * k : maxW;
  if (w > lim + 0.5 && ui.textOverflows.length < 50) ui.textOverflows.push({ text, w: Math.round(w), maxW: Math.round(lim) });
}
// Текст в несколько строк (по словам), не больше lines строк; не влезает — мельче
export function wrapText(text, x, y, size, maxW, lines, color, weight) {
  let sz = size, rows;
  for (;;) {
    ctx.font = `${weight} ${sz}px system-ui, "Segoe UI", sans-serif`;
    rows = [];
    let cur = "";
    for (const wd of text.split(" ")) {
      const t = cur ? cur + " " + wd : wd;
      if (ctx.measureText(t).width > maxW && cur) { rows.push(cur); cur = wd; } else cur = t;
    }
    rows.push(cur);
    const fit = rows.length <= lines && rows.every(r => ctx.measureText(r).width <= maxW);
    if (!fit && sz <= 9) {   // SPEC-028: сдался на самом мелком — лишние строки или строка шире места → textOverflows
      if (rows.length > lines) noteOverflow(text, maxW * rows.length / lines, maxW);
      for (const r of rows) noteOverflow(r, ctx.measureText(r).width, maxW);
    }
    if (fit || sz <= 9) break;
    sz -= 0.5;
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  const lh = sz * 1.25, y0 = y - (rows.length - 1) * lh / 2 + (lines - 1) * lh / 2;
  rows.forEach((r, i) => fillT(r, x, y0 + i * lh));
}
// Подпись с контуром, которая сжимается под ширину (не мельче 11px), а если не влезает — обрезается «…»
export let lastFit = null;   // что нарисовал последний labelFit: { text, sz, w } (SPEC-022: подпись злости — в hudRects)
export function labelFit(text, x, y, size, maxW, color, align = "center", min = 11, scaled = false) {
  const font = sz => `900 ${sz}px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;
  let sz = size;
  ctx.font = font(sz);
  while (ctx.measureText(text).width > maxW && sz > min) { sz = Math.max(min, sz - 0.5); ctx.font = font(sz); }
  let chars = Array.from(text);
  if (sz <= min || LOOK.TEXT_TEST_SCALE !== 1) noteOverflow(text, ctx.measureText(text).width * min / sz, maxW, scaled);   // крупнее min при ×1 — влезло
  while (chars.length > 1 && ctx.measureText(text).width > maxW) { chars = chars.slice(0, -1); text = chars.join("").trimEnd() + "…"; }
  lastFit = { text, sz, w: ctx.measureText(text).width };
  label(text, x, y, sz, color, align);
  return sz;
}

// ---------- Телефон (SPEC-005): размеры в CSS px, крупный HUD ----------
// CSS px → UI px: на телефоне кнопки и шрифты задаются в CSS px (под палец), рисуем в UI px
export const cpx = n => n * UW / CSS_W;
export const minPx = cat => cpx(LOOK.PHONE_TEXT[cat]);   // самый мелкий текст этого вида в UI px
// SPEC-031: масштаб текста истории (главы, подписи заставок, облачка, заголовок главы) от размера экрана — LOOK.STORY_TEXT_SCALE
function textScale() {
  if (!PHONE) return 1;
  const T = LOOK.STORY_TEXT_SCALE;
  return clamp(Math.min(CSS_W / T.ref[0], CSS_H / T.ref[1]), T.min, T.max);
}
export const storyPx = css => cpx(css) * textScale();                       // кегль текста истории на телефоне (CSS px → UI px × масштаб)
export const storyMin = desk => (PHONE ? cpx(LOOK.STORY_TEXT_MIN) : desk);   // его самый мелкий (компьютер — как был: desk)
export const noteText = (cat, s) => { if (!(s >= ui.textSizes[cat])) ui.textSizes[cat] = s; };
// размер текста: на компьютере как задан; на телефоне не мельче PHONE_TEXT[cat] CSS px (записывается там, где рисуется)
export function fz(size, cat) {
  if (!PHONE) return size;
  const s = Math.max(size, minPx(cat));
  noteText(cat, s);
  return s;
}
// SPEC-033: подпись цены «Взять за 🪙 N» в кнопке шириной w: не влезла даже самым мелким кеглем min (с запасом LOOK.PRICE_FIT_MARGIN на шрифты CI,
// шире наших) — «Взять 🪙 N», потом «🪙 N»; prefix — «🔒 » / «✔ » перед надписью. Общая для карточек вещей и кнопок наряда
export function priceLabel(price, w, min, prefix = "") {
  ctx.font = hudFont(min);
  const options = [L().buyFor(price), `${L().buy} 🪙 ${price}`, `🪙 ${price}`].map(t => prefix + t);
  return options.find(t => scaledW(t) * LOOK.PRICE_FIT_MARGIN <= w) || options.at(-1);
}
// название крупной надписью: слова переносятся (не больше lines строк), кегль мельче до min; меряется шрифтом label (hudFont); → { rows, sz, w, fit }
// (SPEC-033: карточка «Как играть» и заголовок победы на компьютере)
export function titleRows(text, size, min, maxW, lines) {
  for (let sz = size; ; sz = Math.max(min, sz - 0.5)) {
    ctx.font = hudFont(sz);
    const rows = [];
    let cur = "";
    for (const wd of text.split(" ")) { const t = cur ? cur + " " + wd : wd; if (scaledW(t) > maxW && cur) { rows.push(cur); cur = wd; } else cur = t; }
    rows.push(cur);
    const w = Math.max(...rows.map(scaledW)), fit = rows.length <= lines && w <= maxW;
    if (fit || sz <= min) return { rows, sz, w: Math.min(maxW, w), fit };
  }
}
export const hudFont = sz => `900 ${sz}px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;
// ---------- 2D — МЕНЮ (SPEC-017; телефон — SPEC-005, слой UI 420 px высотой): тексты и кнопки телефона, рамка экрана меню, дальше —
// миры, карта уровней и карточка уровня, история, гардероб, вкладки магазина, главный экран, вкладка «Гардероб», итоги, пауза ----------
// размеры в CSS px; текст не мельче PHONE_TEXT своего вида; сжимается под ширину только до этого минимума
export function pLabel(text, x, y, cat, css, color, align = "center", maxW = 1e4) {
  const min = cpx(LOOK.PHONE_TEXT[cat]), sz = labelFit(text, x, y, Math.max(cpx(css), min), maxW, color, align, min);
  noteText(cat, sz);
  return sz;
}
export function pText(text, x, y, cat, css, maxW, align = "center", color = OUT, weight = 800) {
  const min = cpx(LOOK.PHONE_TEXT[cat]), sz = fitText(text, x, y, Math.max(cpx(css), min), maxW, align, color, weight, min);
  noteText(cat, sz);
  return sz;
}
// несколько строк: сначала мерка (pRows: строки, кегль, высота h, ширина w самой длинной строки), потом рисуем (pDraw)
// ширина строки при мерке: × LOOK.TEXT_TEST_SCALE (тесты изображают более широкие шрифты CI и iPhone)
export const scaledW = t => ctx.measureText(t).width * LOOK.TEXT_TEST_SCALE;
export function pRows(text, cat, css, maxW, lines, weight = 700) {
  const min = cpx(LOOK.PHONE_TEXT[cat]);
  let sz = Math.max(cpx(css), min), rows = [];
  for (;;) {
    ctx.font = `${weight} ${sz}px system-ui, "Segoe UI", sans-serif`;
    rows = [];
    let cur = "";
    // слова по пробелам; длинное слово с дефисом можно перенести после дефиса («Мега-» / «рукавицы»)
    // без lookbehind в регулярках: Safari до iOS 16.4 не разбирает модуль, и игра не запускается
    for (const wd of text.split(" ")) (wd.match(/[^-]*-|[^-]+/g) ?? [""]).forEach((part, j) => {
      const t = !cur ? part : cur + (j ? "" : " ") + part;
      if (scaledW(t) > maxW && cur) { rows.push(cur); cur = part; } else cur = t;
    });
    rows.push(cur);
    if ((rows.length <= lines && rows.every(r => scaledW(r) <= maxW)) || sz <= min) break;
    sz = Math.max(min, sz - 0.5);
  }
  const lh = sz * 1.25;
  return { rows, sz, lh, h: rows.length * lh, w: Math.max(...rows.map(scaledW)), cat, weight, maxW };
}
export function pDraw(b, x, y, color = OUT, align = "center") {
  ctx.font = `${b.weight} ${b.sz}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = /** @type {CanvasTextAlign} */ (align); ctx.textBaseline = "middle"; ctx.fillStyle = color;
  b.rows.forEach((r, i) => fillT(r, x, y + b.lh / 2 + i * b.lh));
  noteText(b.cat, b.sz);
  return b.h;
}
// не больше n строк и каждая не шире b.maxW: лишнее отрезается «…» (магазин телефона, когда места не хватило)
export function clipRows(b, n) {
  ctx.font = `${b.weight} ${b.sz}px system-ui, "Segoe UI", sans-serif`;
  const rows = b.rows.slice(0, Math.max(0, n)), more = b.rows.length > rows.length;
  const cut = (r, dots) => {
    let chs = Array.from(r), t = dots ? r + "…" : r;
    while (chs.length > 1 && scaledW(t) > b.maxW) { chs = chs.slice(0, -1); t = chs.join("").trimEnd() + "…"; }
    return t;
  };
  for (let i = 0; i < rows.length; i++) rows[i] = cut(rows[i], more && i === rows.length - 1);
  return { ...b, rows, h: rows.length * b.lh, w: rows.length ? Math.max(...rows.map(scaledW)) : 0 };
}
// несколько строк от верхнего края y; возвращает высоту
export function pWrap(text, x, y, cat, css, maxW, lines, color = OUT, weight = 700, align = "center") {
  return pDraw(pRows(text, cat, css, maxW, lines, weight), x, y, color, align);
}
// строки текста не шире maxW (× TEXT_TEST_SCALE), не больше lines и не выше opts.maxH (шаг строк — 1,2 кегля); не влезает — мельче,
// но не меньше min; fit = false — не влезло и самым мелким. SPEC-031: текст истории (opts.keep) получает все строки — раскладку меняет
// вызывающий; остальные экраны — как раньше, лишние строки отрезаются, но обрезанное попадает в textOverflows (noteUnfit)
export function noteRows(text, size, min, maxW, lines, { maxH = Infinity, keep = false } = {}) {
  let sz = size, rows, fit;
  for (;;) {
    ctx.font = `800 ${sz}px system-ui, "Segoe UI", sans-serif`;
    rows = [];
    let cur = "";
    for (const wd of text.split(" ")) { const t = cur ? cur + " " + wd : wd; if (scaledW(t) > maxW && cur) { rows.push(cur); cur = wd; } else cur = t; }
    rows.push(cur);
    fit = rows.length <= lines && rows.length * sz * 1.2 <= maxH + 0.01 && rows.every(q => scaledW(q) <= maxW);
    if (fit || sz <= min) break;
    sz = Math.max(min, sz - 0.5);
  }
  const b = { rows, sz, w: Math.min(maxW, Math.max(...rows.map(scaledW))), fit };
  if (!keep && rows.length > lines) { noteUnfit(text, b, maxW, lines * sz * 1.2); b.rows = rows.slice(0, lines); }
  return b;
}
// SPEC-031: картинка слева, текст справа (глава «Истории», заставка на телефоне) — сначала мерим текст: кегль от size до min, пока
// весь текст не влезет в высоту h; не влез и самым мелким — место картинки уже (доля ширины w от share вниз на LOOK.STORY_PIC.step,
// но не меньше LOOK.STORY_PIC.min), текст шире. picW(доля) — ширина места картинки, gap — от картинки до текста.
// → { pw — ширина места картинки, tW — ширина текста, b — строки noteRows (b.fit = false: не влезло и так — в textOverflows) }
export function sideFit(text, w, h, gap, share, picW, size, min) {
  const P = LOOK.STORY_PIC;
  for (let p = share; ; p = Math.max(P.min, p - P.step)) {
    const pw = picW(p), tW = w - pw - gap, b = noteRows(text, size, min, tW, Infinity, { maxH: h, keep: true });
    if (b.fit || p <= P.min) {
      if (!b.fit) noteUnfit(text, b, tW, h);
      return { pw, tW, b };
    }
  }
}
// SPEC-031: текст истории не влез в своё место и самым мелким — в textOverflows этого кадра (ширина и высота строк, место)
export function noteUnfit(text, b, maxW, maxH) {
  if (ui.textOverflows.length < 50) ui.textOverflows.push({ text, w: Math.round(b.w), maxW: Math.round(maxW), h: Math.round(b.rows.length * b.sz * 1.2), maxH: Math.round(maxH) });
}
