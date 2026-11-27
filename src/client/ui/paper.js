// SPEC-020 / SPEC-039 (from art.js): the paper of the menu screens — paperUI (every screen but the game is on paper), the panel drawn from
// a page of the notebook (cached per size), the tape on its corners. Client module.
import { art } from "../art.js";
import { LOOK } from "../look.js";
import { ctx, OUT, PHONE, VIEW } from "../screen.js";
import { mode } from "../state.js";
import { noteArt } from "./artdraw.js";
import { rrOn } from "./canvas.js";
import { cpx } from "./layout.js";

// бумажные экраны — все, кроме самой игры (в игре HUD и кнопки телефона рисуются картинками сами, где они есть)
export const paperUI = () => mode !== "play";
// бумажная панель: кусок страницы тетради, контур, скотч на верхних углах; false — картинки нет
// бумага панели рисуется один раз в свой холст (по размеру и скруглению) — в кадре одна отрисовка без масштаба
export const paperCache = [];
function paperSheet(w, h, r) {
  for (const q of paperCache) if (q.w === w && q.h === h && q.r === r && q.view === VIEW) return q.cv;
  const img = art("menu_bg"), S = LOOK.PAPER.sheet, cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w * VIEW)); cv.height = Math.max(1, Math.ceil(h * VIEW));
  const g = cv.getContext("2d"), sw = img.naturalWidth * S[2], sh = img.naturalHeight * S[3], kk = Math.min(sw / w, sh / h);
  g.scale(VIEW, VIEW);
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); g.clip();
  g.drawImage(img, img.naturalWidth * S[0] + (sw - w * kk) / 2, img.naturalHeight * S[1] + (sh - h * kk) / 2, w * kk, h * kk, 0, 0, w, h);
  if (paperCache.length >= LOOK.PAPER.cache) paperCache.shift();
  paperCache.push({ w, h, r, view: VIEW, cv });
  return cv;
}
export function paperPanel(x, y, w, h, r) {
  if (!art("menu_bg")) return false;
  const k = PHONE ? cpx(1) : 1;
  ctx.drawImage(paperSheet(w, h, r), x, y, w, h); noteArt("menu_bg");
  rrOn(ctx, x, y, w, h, r); ctx.lineWidth = 3 * k; ctx.strokeStyle = OUT; ctx.stroke();
  tape(x + r * 0.7, y + r * 0.45, -0.7, k); tape(x + w - r * 0.7, y + r * 0.45, 0.7, k);
  return true;
}
export function tape(cx, cy, a, k) {
  const P = LOOK.PAPER, tw = P.tapeW * k, th = P.tapeH * k;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  ctx.fillStyle = P.tape; ctx.fillRect(-tw / 2, -th / 2, tw, th);
  ctx.lineWidth = 1.5 * k; ctx.strokeStyle = P.tapeLine; ctx.strokeRect(-tw / 2, -th / 2, tw, th);
  ctx.restore();
}
