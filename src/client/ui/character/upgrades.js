// SPEC-011: Character → Upgrades (SPEC-009): the upgrade cards on a phone and a computer. Client module (moved out of
// index.html in Phase C).

import { CFG, TAU, UPGRADES, upgBonus, upgTop } from "../../../core/config.js";
import { progress } from "../../../core/economy.js";
import { L } from "../../../i18n.js";
import { art, UPG_ART } from "../../art.js";
import { paperUI } from "../paper.js";
import { LOOK } from "../../look.js";
import { ctx, OUT, PHONE, UW } from "../../screen.js";
import { buyUpgrade, upgLevel } from "../../shop.js";
import { ui } from "../../state.js";
import { fitButton, rowsAt } from "../buttons.js";
import { circle, drawStar, fillStroke, rr } from "../draw.js";
import { drawArtFit, fillT } from "../artdraw.js";
import { clipRows, fitLine, noteRows, noteText, pDraw, priceLabel, pRows } from "../text.js";
import { cpx, hudFont, minPx } from "../layout.js";

// ---------- SPEC-009: вкладки и улучшения в магазине ----------
const UPG_ICONS = { fastFeet: "👟", longItems: "⏳", quickHelp: "🤝" };
// SPEC-041: что улучшение даёт на уровне lv: скорость и «долгие вещи» — целые % (из UPGRADES), помощь — секунды подъёма друга (из CFG.RESCUE_TIME)
const upgValue = (k, lv) => (k === "quickHelp" ? CFG.RESCUE_TIME * (1 - upgBonus(k, lv)) : Math.round(upgBonus(k, lv) * 100));
const upgradeCards = () => Object.keys(UPGRADES).map(k => {
  const lv = upgLevel(k), top = upgTop(k);
  return { k, lv, top, name: L().upg[k].name, effect: L().upg[k].effect(upgValue(k, lv), lv < top ? upgValue(k, lv + 1) : null), price: lv < top ? UPGRADES[k].prices[lv] : 0,
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
// кнопка «Взять за 🪙 N» карточки улучшения; на последнем уровне кнопки нет — лента «Максимум» (SPEC-041: ribbon_star, hudRects «upg-max:<k>»)
function upgButton(cd, x, y, w, h, size, min) {
  if (cd.lv >= cd.top) { upgRibbon(cd, x, y, w, h, size, min); return null; }
  const ok = progress.coins >= cd.price;
  const txt = priceLabel(cd.price, w - (PHONE ? cpx(14) : 14), min);   // SPEC-033: «Взять за 🪙 N», короче, если не влезает
  const b = fitButton(x, y, w, h, txt, ok ? "#22c55e" : "#cbd5e1", () => buyUpgrade(cd.k), size, min);
  b.id = "upg:" + cd.k;
  return b;
}
// лента «Максимум» в рамке x, y, w, h: картинка ribbon_star (нет — золотая плашка), надпись по центру
function upgRibbon(cd, x, y, w, h, size, min) {
  const R = LOOK.UPG_PAGE_LOOK.ribbon, text = L().upgMax.toLocaleUpperCase(), cx = x + w / 2, cy = y + h / 2;
  const img = art("ribbon_star"), k = img ? Math.min(w / img.naturalWidth, h / img.naturalHeight) : 0;
  let rw = w, rh = h;
  if (paperUI() && img) { rw = img.naturalWidth * k; rh = img.naturalHeight * k; drawArtFit("ribbon_star", cx, cy, Math.max(rw, rh)); }
  else { rr(x, y, w, h, h * 0.3); fillStroke(R.fill, 3); }
  const f = fitLine(text, Math.max(size, h * R.text), PHONE ? minPx("hint") : min, rw * R.textW);   // лента — не кнопка: надпись может быть мельче (hint), лишь бы вся
  ctx.font = hudFont(f.sz); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, f.sz / 5); ctx.lineJoin = "round"; ctx.strokeStyle = "#fff"; ctx.strokeText(f.text, cx, cy + 1); ctx.fillStyle = R.ink; fillT(f.text, cx, cy + 1);
  if (PHONE) noteText("hint", f.sz);
  ui.hudRects.push({ id: "upg-max:" + cd.k, x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh, text: f.text });   // что нарисовано: обрезка видна тесту
}
// SPEC-041: искорки (fx_sparkle) вокруг картинки купленного улучшения: UPG_PAGE_LOOK.spark.time секунд после покупки (ui.upgSpark)
function upgSparkles(cd, cx, cy, size) {
  const sp = ui.upgSpark, S = LOOK.UPG_PAGE_LOOK.spark;
  if (!sp || sp.k !== cd.k) return;
  const age = (ui.T - sp.t0) / S.time;
  if (age < 0 || age >= 1) { if (age >= 1) ui.upgSpark = null; return; }
  for (let i = 0; i < S.n; i++) {
    const a = (i / S.n) * TAU + age * 2, r = size * S.radius * (0.55 + age * 0.6), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.85;
    ctx.globalAlpha = 1 - age;
    if (!drawArtFit("fx_sparkle", x, y, size * S.size * (1.1 - age * 0.4))) drawStar(x, y, size * S.size * 0.35, true);
  }
  ctx.globalAlpha = 1;
}
// телефон: три карточки улучшений в полосе y0…Y1, под ними строка «только игрокам». Как карточки вещей: сначала мерка (pRows), потом
// рисуем; не влезает — картинка меньше (до picMin), потом эффект и название теряют строки, в конце картинка меньше минимума;
// shopLayout = { tab, step, picH }. SPEC-041: картинка крупнее (UPG_PAGE_LOOK.pic ×), вместо описания — «сейчас → дальше»
export function upgradeCardsPhone(X0, X1, y0, Y1) {
  const c = cpx, S = LOOK.PHONE_SHOP, U = LOOK.UPG_PAGE_LOOK, cards = upgradeCards(), cg = c(8), n = cards.length, cw = (X1 - X0 - (n - 1) * cg) / n, tw = cw - 2 * c(S.side);
  const pad = c(S.pad), sp = c(S.sp), B = c(LOOK.PHONE_BTN_MIN), bw = Math.min(c(170), cw - c(10)), eps = S.eps, dotR = c(6);
  const note = clipRows(pRows(L().upgNote, "hint", 13, X1 - X0, 2, 700), 2), ch = Y1 - y0 - note.h - sp;
  const bl = cards.map(cd => ({ name: clipRows(pRows(cd.name, "main", U.phone.name, tw, S.nameLines, 900), S.nameLines),
    eff: clipRows(pRows(cd.effect, "hint", U.phone.effect, tw, S.descLines, 700), S.descLines),
    no: cd.lv < cd.top && progress.coins < cd.price ? clipRows(pRows(L().notEnough, "hint", 13, tw, S.noLines, 700), S.noLines) : null }));
  const noH = Math.max(0, ...bl.map(b => b.no ? b.no.h + sp : 0));
  const by = y0 + ch - pad - noH - B, avail = by - sp - (y0 + pad);
  const slackOf = (b, p) => avail - p * S.picBox - sp - b.name.h - sp - 2 * dotR - sp - b.eff.h;
  const slack = p => Math.min(...bl.map(b => slackOf(b, p)));
  let picH = c(S.pic * U.pic), step = 0;
  if (slack(picH) >= 0) picH += Math.min(c(S.picGrow * U.pic), slack(picH) / S.picBox);
  else { while (picH > c(S.picMin) + eps && slack(picH) < -eps) picH -= c(S.scan); picH = Math.max(c(S.picMin), picH); }
  const cutRows = (b, key, min, over) => {
    if (over <= eps) return over;
    const t = b[key], keep = Math.max(min, t.rows.length - Math.ceil(over / t.lh - eps));
    if (keep < t.rows.length) { b[key] = clipRows(t, keep); step = 3; }
    return over - (t.h - b[key].h);
  };
  bl.forEach(b => { const over = cutRows(b, "eff", 0, -slackOf(b, picH)); cutRows(b, "name", 1, over); });
  if (slack(picH) < -eps) { step = 4; picH = Math.max(c(S.scan), picH + slack(picH) / S.picBox); }
  // место, что осталось, — в промежутки между картинкой, названием, кружками и эффектом и отступом сверху (остальное — над кнопкой)
  const rest = Math.max(0, slack(picH)), gap = Math.min(rest / 3, c(U.phone.gapMax)), top = (rest - 3 * gap) / 2;
  ui.shopLayout = { tab: "upgrades", step, picH: picH / cpx(1) };
  const box = (id, b, x, y) => { if (b.rows.length) ui.hudRects.push({ id, x: x - b.w / 2, y, w: b.w, h: b.h, text: b.rows.join(" ") }); };
  cards.forEach((cd, i) => {
    const x0 = X0 + i * (cw + cg), cx = x0 + cw / 2, b = bl[i];
    rr(x0, y0, cw, ch, c(16)); fillStroke("#fff", 3);
    ui.hudRects.push({ id: "upg-card:" + cd.k, x: x0, y: y0, w: cw, h: ch });
    const pcy = y0 + pad + top + picH * S.picBox / 2, pw = picH * S.picW, ph = picH * S.picBox;
    upgPicture(cd.k, cx, pcy, picH);
    upgSparkles(cd, cx, pcy, picH);
    ui.hudRects.push({ id: "upg-pic:" + cd.k, x: cx - pw / 2, y: pcy - ph / 2, w: pw, h: ph });
    let y = y0 + pad + top + ph + sp + gap;
    box("upg-name:" + cd.k, b.name, cx, y); y += pDraw(b.name, cx, y, OUT) + sp + gap;
    upgDots(cd, cx, y + dotR, dotR); y += 2 * dotR + sp + gap;
    box("upg-effect:" + cd.k, b.eff, cx, y); pDraw(b.eff, cx, y, "#475569");
    upgButton(cd, cx - bw / 2, by, bw, B, c(17), minPx("main"));
    if (b.no) { const ny = by + B + sp; box("upg-no:" + cd.k, b.no, cx, ny); pDraw(b.no, cx, ny, "#ef4444"); }
  });
  const ny = y0 + ch + sp;
  box("upg-note", note, (X0 + X1) / 2, ny); pDraw(note, (X0 + X1) / 2, ny, "#475569");
}
// компьютер: три карточки улучшений в панели магазина (880 px), на месте карточек вещей; под ними строка «только игрокам» (числа — LOOK.UPG_PAGE_LOOK.desk)
export function upgradeCardsDesktop() {
  const D = LOOK.UPG_PAGE_LOOK.desk, cards = upgradeCards(), gap = 10, w = (850 - (cards.length - 1) * gap) / cards.length, y0 = D.top, tw = w - 28;
  cards.forEach((cd, i) => {
    const x0 = UW / 2 - 425 + i * (w + gap), cx = x0 + w / 2, bw = Math.min(210, w - 20);
    rr(x0, y0, w, D.h, 22); fillStroke("#fff", 3.5);
    ui.hudRects.push({ id: "upg-card:" + cd.k, x: x0, y: y0, w, h: D.h });
    upgPicture(cd.k, cx, y0 + D.picY, D.pic);
    upgSparkles(cd, cx, y0 + D.picY, D.pic);
    ui.hudRects.push({ id: "upg-pic:" + cd.k, x: cx - D.pic * 0.7, y: y0 + D.picY - D.pic * 0.6, w: D.pic * 1.4, h: D.pic * 1.2 });
    rowsAt("upg-name:" + cd.k, noteRows(cd.name, D.nameSz, 12, tw, 1), cx, y0 + D.nameY, OUT, 900);
    upgDots(cd, cx, y0 + D.dotsY, D.dotR);
    rowsAt("upg-effect:" + cd.k, noteRows(cd.effect, D.effSz, 11, tw, D.effLines), cx, y0 + D.effY, "#475569");
    upgButton(cd, cx - bw / 2, y0 + D.btnY, bw, D.btnH, 19, 12);
    if (cd.lv < cd.top && progress.coins < cd.price) rowsAt("upg-no:" + cd.k, noteRows(L().notEnough, 13, 10, tw, 1), cx, y0 + D.noY, "#ef4444", 700);
  });
  rowsAt("upg-note", noteRows(L().upgNote, D.noteSz, 11, 850, 2), UW / 2, D.noteY, "#475569", 800);
}
