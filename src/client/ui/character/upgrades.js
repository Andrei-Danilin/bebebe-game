// SPEC-011: Character → Upgrades (SPEC-009): the upgrade cards on a phone and a computer. Client module (moved out of
// index.html in Phase C).

import { UPGRADES, upgTop } from "../../../core/config.js";
import { progress } from "../../../core/economy.js";
import { L } from "../../../i18n.js";
import { paperUI, UPG_ART } from "../../art.js";
import { LOOK } from "../../look.js";
import { ctx, OUT, UW } from "../../screen.js";
import { buyUpgrade, upgLevel } from "../../shop.js";
import { ui } from "../../state.js";
import { fitButton, rowsAt } from "./wardrobe.js";
import { circle, coinIcon, drawArtFit, fillStroke, fillT, rr } from "../draw.js";
import { clipRows, cpx, hudFont, minPx, noteRows, pDraw, pRows } from "../text.js";

// ---------- SPEC-009: вкладки и улучшения в магазине ----------
const UPG_ICONS = { fastFeet: "👟", longItems: "⏳", quickHelp: "🤝" };
const upgradeCards = () => Object.keys(UPGRADES).map(k => {
  const lv = upgLevel(k), top = upgTop(k);
  return { k, lv, top, name: L().upg[k].name, desc: L().upg[k].desc(Math.round(UPGRADES[k].step * 100)), price: lv < top ? UPGRADES[k].prices[lv] : 0,
    dots: "●".repeat(lv) + "○".repeat(top - lv) };
});
export function upgPicture(k, x, y, s) {
  if (paperUI() && drawArtFit(UPG_ART[k], x, y, s * 1.2)) return;
  ctx.font = `${s}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000";
  fillT(UPG_ICONS[k], x, y);
}
// уровень кружками ●●○ по центру cx (hudRects «upg-dots:<k>», текст — те же кружки)
function upgDots(cd, cx, cy, r) {
  const step = r * 2.8, x0 = cx - step * (cd.top - 1) / 2;
  for (let i = 0; i < cd.top; i++) { circle(x0 + i * step, cy, r); fillStroke(i < cd.lv ? "#f59e0b" : "#fff", Math.max(1.5, r / 3)); }
  ui.hudRects.push({ id: "upg-dots:" + cd.k, x: x0 - r - 1, y: cy - r - 1, w: step * (cd.top - 1) + 2 * r + 2, h: 2 * r + 2, text: cd.dots });
}
// кнопка «Купить N 🪙» (или «✔ Максимум») карточки улучшения
function upgButton(cd, x, y, w, h, size, min) {
  const max = cd.lv >= cd.top, ok = !max && progress.coins >= cd.price;
  const txt = max ? "✔ " + L().upgMax : `${L().buy}  ${cd.price}      `;
  const b = fitButton(x, y, w, h, txt, max ? "#a3a3a3" : ok ? "#22c55e" : "#cbd5e1", () => buyUpgrade(cd.k), size, min);
  b.id = "upg:" + cd.k;
  if (!max) {
    ctx.font = hudFont(b.size);
    const vis = ctx.measureText(`${L().buy}  ${cd.price}`).width, full = ctx.measureText(b.text).width;
    coinIcon(x + w / 2 - full / 2 + vis + b.size * 0.8, y + h / 2, b.size * 0.5);   // монетка после цены
  }
  return b;
}
// телефон: три карточки улучшений в полосе y0…Y1. Как карточки вещей: сначала мерка (pRows), потом рисуем; не влезает — картинка
// меньше (до picMin), потом описание и название теряют строки, в конце картинка меньше минимума; shopLayout = { tab, step, picH }
export function upgradeCardsPhone(X0, X1, y0, Y1) {
  const c = cpx, S = LOOK.PHONE_SHOP, cards = upgradeCards(), cg = c(8), n = cards.length, cw = (X1 - X0 - (n - 1) * cg) / n, tw = cw - 2 * c(S.side);
  const ch = Y1 - y0, pad = c(S.pad), sp = c(S.sp), B = c(LOOK.PHONE_BTN_MIN), bw = Math.min(c(170), cw - c(10)), eps = S.eps, dotR = c(6);
  const bl = cards.map(cd => ({ name: clipRows(pRows(cd.name, "main", 15, tw, S.nameLines, 900), S.nameLines),
    desc: clipRows(pRows(cd.desc, "hint", 13, tw, S.descLines, 700), S.descLines),
    no: cd.lv < cd.top && progress.coins < cd.price ? clipRows(pRows(L().notEnough, "hint", 13, tw, S.noLines, 700), S.noLines) : null }));
  const noH = Math.max(0, ...bl.map(b => b.no ? b.no.h + sp : 0));
  const by = y0 + ch - pad - noH - B, avail = by - sp - (y0 + pad);
  const slackOf = (b, p) => avail - p * S.picBox - sp - b.name.h - sp - 2 * dotR - sp - b.desc.h;
  const slack = p => Math.min(...bl.map(b => slackOf(b, p)));
  let picH = c(S.pic), step = 0;
  if (slack(picH) >= 0) picH += Math.min(c(S.picGrow), slack(picH) / S.picBox);
  else { while (picH > c(S.picMin) + eps && slack(picH) < -eps) picH -= c(S.scan); picH = Math.max(c(S.picMin), picH); }
  const cutRows = (b, key, min, over) => {
    if (over <= eps) return over;
    const t = b[key], keep = Math.max(min, t.rows.length - Math.ceil(over / t.lh - eps));
    if (keep < t.rows.length) { b[key] = clipRows(t, keep); step = 3; }
    return over - (t.h - b[key].h);
  };
  bl.forEach(b => { const over = cutRows(b, "desc", 0, -slackOf(b, picH)); cutRows(b, "name", 1, over); });
  if (slack(picH) < -eps) { step = 4; picH = Math.max(c(S.scan), picH + slack(picH) / S.picBox); }
  ui.shopLayout = { tab: "upgrades", step, picH: picH / cpx(1) };
  const box = (id, b, x, y) => { if (b.rows.length) ui.hudRects.push({ id, x: x - b.w / 2, y, w: b.w, h: b.h }); };
  cards.forEach((cd, i) => {
    const x0 = X0 + i * (cw + cg), cx = x0 + cw / 2, b = bl[i];
    rr(x0, y0, cw, ch, c(16)); fillStroke("#fff", 3);
    const pcy = y0 + pad + picH * S.picBox / 2, pw = picH * S.picW, ph = picH * S.picBox;
    upgPicture(cd.k, cx, pcy, picH);
    ui.hudRects.push({ id: "upg-pic:" + cd.k, x: cx - pw / 2, y: pcy - ph / 2, w: pw, h: ph });
    let y = y0 + pad + ph + sp;
    box("upg-name:" + cd.k, b.name, cx, y); y += pDraw(b.name, cx, y, OUT) + sp;
    upgDots(cd, cx, y + dotR, dotR); y += 2 * dotR + sp;
    box("upg-desc:" + cd.k, b.desc, cx, y); pDraw(b.desc, cx, y, "#475569");
    upgButton(cd, cx - bw / 2, by, bw, B, c(17), minPx("main"));
    if (b.no) { const ny = by + B + sp; box("upg-no:" + cd.k, b.no, cx, ny); pDraw(b.no, cx, ny, "#ef4444"); }
  });
}
// компьютер: три карточки улучшений в панели магазина (880 px), на месте карточек вещей
export function upgradeCardsDesktop() {
  const cards = upgradeCards(), gap = 10, w = (850 - (cards.length - 1) * gap) / cards.length, y0 = 92, tw = w - 28;
  cards.forEach((cd, i) => {
    const x0 = UW / 2 - 425 + i * (w + gap), cx = x0 + w / 2, bw = Math.min(210, w - 20);
    rr(x0, y0, w, 292, 22); fillStroke("#fff", 3.5);
    upgPicture(cd.k, cx, y0 + 44, 54);
    ui.hudRects.push({ id: "upg-pic:" + cd.k, x: cx - 36, y: y0 + 12, w: 72, h: 64 });
    const nm = noteRows(cd.name, 20, 12, tw, 1);
    rowsAt("upg-name:" + cd.k, nm, cx, y0 + 82, OUT, 900);
    upgDots(cd, cx, y0 + 124, 8);
    rowsAt("upg-desc:" + cd.k, noteRows(cd.desc, 16, 11, tw, 3), cx, y0 + 140, "#475569");
    upgButton(cd, cx - bw / 2, y0 + 216, bw, 50, 19, 12);
    if (cd.lv < cd.top && progress.coins < cd.price) rowsAt("upg-no:" + cd.k, noteRows(L().notEnough, 13, 10, tw, 1), cx, y0 + 270, "#ef4444", 700);
  });
}
