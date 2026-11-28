// SPEC-020 / SPEC-039 (from ui/draw.js): drawing the art on the 2D layer — the sprite primitives (drawArt, drawArtFit, drawArtCover, the
// nine-piece paper buttons) and the labels with the emoji replaced by pictures (fillT / strokeT), with the count of what was drawn
// (artUse). They sit below the text, the paper and the screens, which all draw sprites; they need only the art and the screen's
// context. Client module.
import { art, artFade, artInset, artPick, EMOJI_ART, EMOJI_RE } from "../art.js";
import { LOOK } from "../look.js";
import { ctx } from "../screen.js";
import { textW } from "./measure.js";

// ---------- SPEC-020: картинки на холсте. Каждая функция рисует картинку name и возвращает true — или false, если картинки нет
// (тогда вызывающий рисует кодом, как раньше). artUse — сколько раз нарисована каждая картинка с последнего resetArtUse()
// (копится, пока тест не сбросит; тесты: «этот экран нарисован картинками» / «без картинок — ни одной»)
export const artUse = {};
export function noteArt(name) { artUse[name] = (artUse[name] || 0) + 1; }
export function resetArtUse() { for (const k in artUse) delete artUse[k]; }
// SPEC-048 AC 3: a picture the screen change stopped waiting for fades in over LOOK.ART_FADE s: fadeIn(name) sets the alpha, fadeOut(a) puts it back
export const fadeIn = name => { const a = ctx.globalAlpha, k = artFade(name); if (k < 1) ctx.globalAlpha = a * k; return a; };
export const fadeOut = a => { ctx.globalAlpha = a; };
// растянуть в прямоугольник
export function drawArt(name, x, y, w, h) {
  const img = art(name);
  if (!img) return false;
  const ga = fadeIn(name);
  ctx.drawImage(img, x, y, w, h); noteArt(name);
  fadeOut(ga);
  return true;
}
// вписать по центру (cx, cy) в квадрат size, пропорции картинки сохраняются
export function drawArtFit(name, cx, cy, size) {
  const img = art(name);
  if (!img) return false;
  const s = size / Math.max(img.naturalWidth, img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
  const ga = fadeIn(name);
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); noteArt(name);
  fadeOut(ga);
  return true;
}

function textArt(text, x, y, stroke) {
  text = String(text);
  const plain = () => (stroke ? ctx.strokeText(text, x, y) : ctx.fillText(text, x, y));
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return plain();   // SPEC-039: холст земли рисуют своим контекстом (canvas.js), сюда он не попадает
  EMOJI_RE.lastIndex = 0;                                  // matchAll начинает с lastIndex, который сдвинул test()
  const segs = [];
  let at = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const name = artPick(EMOJI_ART[m[1]]);
    if (!name) continue;
    if (m.index > at) segs.push({ t: text.slice(at, m.index) });
    segs.push({ t: m[0], name });
    at = m.index + m[0].length;
  }
  if (!segs.length) return plain();
  if (at < text.length) segs.push({ t: text.slice(at) });
  const ws = segs.map(q => textW(q.t)), total = ws.reduce((a, b) => a + b, 0), align = ctx.textAlign, bl = ctx.textBaseline;
  const sz = parseFloat((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [])[1]) || 16;
  const cy = bl === "middle" ? y : bl === "top" || bl === "hanging" ? y + sz / 2 : bl === "bottom" || bl === "ideographic" ? y - sz / 2 : y - sz * 0.35;
  let cx = align === "center" ? x - total / 2 : align === "right" || align === "end" ? x - total : x;
  ctx.textAlign = "left";
  segs.forEach((q, i) => {
    if (!q.name) { if (stroke) ctx.strokeText(q.t, cx, y); else ctx.fillText(q.t, cx, y); }
    else if (!stroke) drawArtFit(q.name, cx + ws[i] / 2, cy, Math.min(ws[i], sz * LOOK.PAPER.emojiArt));   // не шире места эмодзи
    cx += ws[i];
  });
  ctx.textAlign = align;
}
export const fillT = (text, x, y) => textArt(text, x, y, false), strokeT = (text, x, y) => textArt(text, x, y, true);
// заполнить прямоугольник с обрезкой лишнего (cover); fx, fy, fw, fh — из какой части картинки брать (доли)
export function drawArtCover(name, x, y, w, h, fx = 0, fy = 0, fw = 1, fh = 1) {
  const img = art(name);
  if (!img) return false;
  const sw = img.naturalWidth * fw, sh = img.naturalHeight * fh, k = Math.min(sw / w, sh / h);
  const ga = fadeIn(name);
  ctx.drawImage(img, img.naturalWidth * fx + (sw - w * k) / 2, img.naturalHeight * fy + (sh - h * k) / 2, w * k, h * k, x, y, w, h); noteArt(name);
  fadeOut(ga);
  return true;
}
// бумажная кнопка «девятью кусками»: углы картинки (доля cut) — в размер c без искажения, края и середина тянутся
// SPEC-032 AC 6: доля картинки в углах «девятки» (видимый край кнопки считается по ней: поле картинки l → l × c / ART9_CUT на экране)
export const ART9_CUT = 0.3;
// SPEC-032 AC 6: видимая часть кнопки drawArt9(name, x, y, w, h, c) на экране (без прозрачного поля картинки)
export function art9Visible(name, x, y, w, h, c) {
  const q = artInset(name), k = Math.min(c, w / 2, h / 2) / ART9_CUT;
  return { x: x + q.l * k, y: y + q.t * k, w: w - (q.l + q.r) * k, h: h - (q.t + q.b) * k };
}
export function drawArt9(name, x, y, w, h, c, cut = ART9_CUT) {
  const img = art(name);
  if (!img) return false;
  const iw = img.naturalWidth, ih = img.naturalHeight, sx = iw * cut, sy = ih * cut, ga = fadeIn(name);
  c = Math.min(c, w / 2, h / 2);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const s0 = i === 0 ? 0 : i === 1 ? sx : iw - sx, sw = i === 1 ? iw - 2 * sx : sx;
    const t0 = j === 0 ? 0 : j === 1 ? sy : ih - sy, th = j === 1 ? ih - 2 * sy : sy;
    const d0 = i === 0 ? x : i === 1 ? x + c : x + w - c, dw = i === 1 ? w - 2 * c : c;
    const e0 = j === 0 ? y : j === 1 ? y + c : y + h - c, eh = j === 1 ? h - 2 * c : c;
    if (dw > 0 && eh > 0) ctx.drawImage(img, s0, t0, sw, th, d0, e0, dw, eh);
  }
  noteArt(name);
  fadeOut(ga);
  return true;
}
