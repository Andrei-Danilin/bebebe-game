// SPEC-011: Character → Items: the four cards (shopCards, shopPicture) and who wears what, on a phone and a computer. Client
// module (moved out of index.html in Phase C).

import { GLOVES, KISSES, RESCUE_KIT } from "../../../core/config.js";
import { progress } from "../../../core/economy.js";
import { L } from "../../../i18n.js";
import { ITEM_ART, paperUI } from "../../art.js";
import { LOOK } from "../../look.js";
import { P_COLORS } from "../../outfits.js";
import { ctx, OUT, UW } from "../../screen.js";
import { buyGloves, buyKisses, buyRescueKit, setEquip } from "../../shop.js";
import { ui } from "../../state.js";
import { addButton, circle, drawArtFit, drawKiss, drawKit, drawMitten, fillStroke, rr } from "../draw.js";
import { pButton } from "../menu.js";
import { clipRows, cpx, fitText, fz, hudFont, label, minPx, scaledW, noteText, pDraw, pLabel, pRows, wrapText } from "../text.js";

// карточки магазина (компьютер и телефон): рукавицы, мега-рукавицы, воздушные поцелуи, спасалка (SPEC-007)
export const shopCards = () => [
  ...["mittens", "mega"].map(k => ({ k, name: L().gloves[k], desc: L().gloveDesc(GLOVES[k].power), pack: L().pack(GLOVES[k].charges), packN: GLOVES[k].charges, have: L().have(progress.inv[k]), n: progress.inv[k], price: GLOVES[k].price, buy: () => buyGloves(k) })),
  { k: "kisses", name: L().kisses, desc: L().kissDesc, pack: L().kissPack(KISSES.pack), packN: KISSES.pack, have: L().kissHave(progress.inv.kisses), n: progress.inv.kisses, price: KISSES.price, buy: buyKisses },
  { k: "rescues", name: L().kit, desc: L().kitDesc, pack: L().kitPack(RESCUE_KIT.pack), packN: RESCUE_KIT.pack, have: L().kitHave(progress.inv.rescues), n: progress.inv.rescues, price: RESCUE_KIT.price, buy: buyRescueKit }
];
// картинка карточки: s — размер (как у drawMitten); новая карточка магазина добавляет сюда свою (тест SPEC-008 AC 10)
export const SHOP_PICTURES = {
  mittens: (x, y, s) => drawMitten(x, y, s, "mittens"),
  mega: (x, y, s) => drawMitten(x, y, s, "mega"),
  kisses: (x, y, s) => drawKiss(x, y + s * 0.05, s * 1.18),
  rescues: (x, y, s) => drawKit(x, y, s * 1.15)
};
export function shopPicture(k, x, y, s) {
  if (paperUI() && ITEM_ART[k] && drawArtFit(ITEM_ART[k], x, y, s * 1.25)) return;   // SPEC-020: картинка вещи
  if (SHOP_PICTURES[k]) SHOP_PICTURES[k](x, y, s);
}
// SPEC-007/009: вкладка «Вещи» Персонажа на телефоне (f — рамка экрана phoneFrame())
export function itemsPhone(f) {
  const c = cpx, { X0, X1, Y0, Y1, g, B } = f;
  // четыре карточки в ряд: рукавицы, мега-рукавицы, воздушные поцелуи, спасалка (SPEC-007). Сверху картинка, название,
  // описание; снизу (к кнопке) набор и «у вас»; кнопки «Купить» на одной высоте, под ними «не хватает монеток».
  // Места мало (узкий телефон, широкий шрифт, длинные тексты) — уступаем по шагам, теряя как можно меньше (AC 10):
  // 1) картинка меньше; 2) «у вас» → кружок с числом у картинки; 3) набор коротко («📦 ×3»); 4) описание теряет строки («…»).
  const S = LOOK.PHONE_SHOP, cards = shopCards(), cg = c(8), nC = cards.length, cw = (X1 - X0 - (nC - 1) * cg) / nC, tw = cw - 2 * c(S.side);
  const y0 = Y0 + B + cg, ch = Y1 - B - g - y0, pad = c(S.pad), sp = c(S.sp), bw = Math.min(c(160), cw - c(10)), eps = S.eps;
  let br = c(S.badge);
  const bl = cards.map(cd => ({ name: clipRows(pRows(cd.name, "main", 15, tw, S.nameLines, 900), S.nameLines),
    desc: clipRows(pRows(cd.desc, "hint", 13, tw, S.descLines, 700), S.descLines),
    pack: clipRows(pRows(cd.pack, "hint", 13, tw, S.packLines, 600), S.packLines),
    packShort: clipRows(pRows(L().packShort(cd.packN), "hint", 13, tw, S.shortLines, 600), S.shortLines),
    have: clipRows(pRows(cd.have, "hint", 13, tw, S.haveLines, 800), S.haveLines),
    no: progress.coins >= cd.price ? null : clipRows(pRows(L().notEnough, "hint", 13, tw, S.noLines, 700), S.noLines) }));
  const noH = Math.max(0, ...bl.map(b => b.no ? b.no.h + sp : 0));
  const by = y0 + ch - pad - noH - B;                                      // кнопки «Купить» — одна высота
  const avail = by - sp - (y0 + pad);                                      // картинка и тексты над кнопкой
  const rowH = (p, m) => Math.max(p * S.picBox, m.badge ? 2 * br : 0);     // верхний ряд: картинка (и кружок рядом)
  const packOf = (b, m) => m.short ? b.packShort : b.pack;
  const lowH = (b, m) => packOf(b, m).h + (m.badge ? 0 : b.have.h);
  const slackOf = (b, p, m) => avail - rowH(p, m) - sp - b.name.h - b.desc.h - sp - lowH(b, m);
  const slack = (p, m) => Math.min(...bl.map(b => slackOf(b, p, m)));
  const steps = [{ badge: false, short: false }, { badge: true, short: false }, { badge: true, short: true }];
  const pBase = c(S.pic), pMin = c(S.picMin);
  let m = steps[0], picH = pBase;
  if (slack(pBase, m) >= 0) picH = pBase + Math.min(c(S.picGrow), slack(pBase, m) / S.picBox);   // место есть — картинка крупнее
  else {
    let found = null;                                                      // самая крупная картинка, при которой всё влезает
    for (const st of steps) {
      m = st;
      for (let p = pBase; p >= pMin - eps && found === null; p -= c(S.scan)) if (slack(p, m) >= 0) found = p;
      if (found !== null) break;
    }
    picH = found ?? pMin;
  }
  // шаг: 0 — всё полностью, 1 — кружок «у вас», 2 — и набор коротко, 3 — описание/название обрезаны, 4 — последний шаг
  let stepUsed = steps.indexOf(m);
  // всё ещё тесно (очень широкий шрифт) — описание теряет строки, потом название — до одной строки
  const cutRows = (b, key, min, over) => {
    if (over <= eps) return over;
    const t = b[key], keep = Math.max(min, t.rows.length - Math.ceil(over / t.lh - eps));
    if (keep < t.rows.length) { b[key] = clipRows(t, keep); stepUsed = Math.max(stepUsed, 3); }
    return over - (t.h - b[key].h);
  };
  bl.forEach(b => { let over = -slackOf(b, picH, m); over = cutRows(b, "desc", 0, over); cutRows(b, "name", 1, over); });
  // последний шаг — всегда без наложений: кружок не выше картинки, набор — до одной строки и совсем без него,
  // и (только если и это не помогло) картинка меньше своего минимума
  if (slack(picH, m) < -eps) {
    stepUsed = 4;
    if (m.badge) br = Math.max(c(S.badgeMin), Math.min(br, picH * S.picBox / 2));
    const pk = m.short ? "packShort" : "pack";
    bl.forEach(b => { let over = -slackOf(b, picH, m); over = cutRows(b, pk, 1, over); cutRows(b, pk, 0, over); });
    if (slack(picH, m) < -eps) { picH = Math.max(c(S.scan), picH + slack(picH, m) / S.picBox); if (m.badge) br = Math.min(br, picH * S.picBox / 2); }
  }
  stepUsed = Math.max(stepUsed, 0);
  ui.shopLayout = { step: stepUsed, badge: m.badge, short: m.short, picH: picH / cpx(1), badgeR: br / cpx(1),
    packs: bl.map(b => packOf(b, m).rows.join(" ")) };
  const top = rowH(picH, m);
  const box = (id, b, x, y) => { if (b.rows.length) ui.hudRects.push({ id, x: x - b.w / 2, y, w: b.w, h: b.h }); };   // части карточек: тест проверяет, что не налезают
  cards.forEach((cd, i) => {
    const x0 = X0 + i * (cw + cg), cx = x0 + cw / 2, b = bl[i];
    rr(x0, y0, cw, ch, c(16)); fillStroke("#fff", 3);
    const pcy = y0 + pad + top / 2, pw = picH * S.picW, ph = picH * S.picBox;
    shopPicture(cd.k, cx, pcy, picH);
    ui.hudRects.push({ id: "card-pic:" + cd.k, x: cx - pw / 2, y: pcy - ph / 2, w: pw, h: ph });
    if (m.badge) {                                                         // сколько есть — кружок с числом справа от картинки
      const bx = cx + pw / 2 + c(S.gap) + br;
      circle(bx, pcy, br); fillStroke(cd.n > 0 ? "#16a34a" : "#94a3b8", 2.5);
      noteText("hint", fitText(String(cd.n), bx, pcy + 1, minPx("hint"), br * 1.7, "center", "#fff", 900, minPx("hint")));
      ui.hudRects.push({ id: "card-badge:" + cd.k, x: bx - br, y: pcy - br, w: 2 * br, h: 2 * br });
    }
    let y = y0 + pad + top + sp;
    box("card-name:" + cd.k, b.name, cx, y); y += pDraw(b.name, cx, y, OUT);
    box("card-desc:" + cd.k, b.desc, cx, y); pDraw(b.desc, cx, y, "#475569");
    let yl = by - sp - (m.badge ? 0 : b.have.h);
    if (!m.badge) { box("card-have:" + cd.k, b.have, cx, yl); pDraw(b.have, cx, yl, cd.n > 0 ? "#15803d" : "#94a3b8"); }
    const pk = packOf(b, m);
    yl -= pk.h;
    box("card-pack:" + cd.k, pk, cx, yl); pDraw(pk, cx, yl, "#64748b");
    const ok = !b.no, txt = priceLabel(cd.price, bw);   // SPEC-033: «Взять за 🪙 N» — монетка рисуется картинкой item_coin
    const btn = pButton(cx - bw / 2, by, bw, B, txt, ok ? "#22c55e" : "#cbd5e1", cd.buy, 17);
    btn.id = "buy:" + cd.k;
    if (b.no) { const ny = by + B + sp; box("card-no:" + cd.k, b.no, cx, ny); pDraw(b.no, cx, ny, "#ef4444"); }
  });
  // кто что надевает (на телефоне — только игрок 1)
  const wy = y0 + ch + g, wl = `${L().player1} ${L().wears}:`;
  pLabel(wl, X0 + c(4), wy + B / 2, "main", 17, P_COLORS[0], "left");
  const lw = ctx.measureText(wl).width;
  ["none", "mittens", "mega"].forEach((k, j) => {
    const on = progress.equip[0] === k, bw = c(118), bx = X0 + c(4) + lw + c(16) + j * (bw + g);
    addButton(bx, wy, bw, B, k === "none" ? L().none : "", on ? "#ff6fa8" : "#cbd5e1", () => setEquip(0, k), fz(16, "main"));
    if (k !== "none") { (paperUI() && drawArtFit(ITEM_ART[k], bx + c(28), wy + B / 2, c(34))) || drawMitten(bx + c(28), wy + B / 2, c(26), k); pLabel("×" + progress.inv[k], bx + c(72), wy + B / 2, "main", 16, "#fff"); }
  });
}
// SPEC-033: подпись цены на узкой карточке телефона: «Взять за 🪙 N», не влезла самым мелким кеглем — «Взять 🪙 N», потом «🪙 N»
function priceLabel(price, w) {
  ctx.font = hudFont(cpx(LOOK.PHONE_TEXT.main));
  const options = [L().buyFor(price), `${L().buy} 🪙 ${price}`, `🪙 ${price}`];
  return options.find(t => scaledW(t) <= w - cpx(14)) || options.at(-1);
}
// SPEC-007/009: вкладка «Вещи» Персонажа на компьютере
export function itemsDesktop() {
  // четыре карточки: рукавицы, мега-рукавицы, воздушные поцелуи, спасалка (SPEC-007)
  const cards = shopCards(), gap = 10, w = (850 - (cards.length - 1) * gap) / cards.length;
  cards.forEach((c, i) => {
    const x0 = UW / 2 - 425 + i * (w + gap), cx = x0 + w / 2, y0 = 92, bw = Math.min(190, w - 20);
    rr(x0, y0, w, 292, 22); fillStroke("#fff", 3.5);
    shopPicture(c.k, cx, y0 + 44, 62);
    wrapText(c.name, cx, y0 + 93, 18, w - 20, 2, OUT, 900);
    wrapText(c.desc, cx, y0 + 140, 14, w - 22, 2, "#475569", 700);
    fitText(c.pack, cx, y0 + 182, 13, w - 22, "center", "#64748b", 600);
    fitText(c.have, cx, y0 + 202, 14, w - 22, "center", c.n > 0 ? "#15803d" : "#94a3b8", 800);
    const ok = progress.coins >= c.price, txt = L().buyFor(c.price);
    ctx.font = `900 19px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;
    let fs = 19;
    while (ctx.measureText(txt).width > bw - 12 && fs > 14) { fs -= 0.5; ctx.font = `900 ${fs}px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`; }
    addButton(cx - bw / 2, y0 + 216, bw, 50, txt, ok ? "#22c55e" : "#cbd5e1", c.buy, fs).id = "buy:" + c.k;
    if (!ok) fitText(L().notEnough, cx, y0 + 279, 12, w - 22, "center", "#ef4444", 700);
  });
  // кто что надевает
  [0, 1].forEach(pi => {
    const y = 398 + pi * 60;
    label(`${pi === 0 ? L().player1 : L().player2} ${L().wears}:`, UW / 2 - 360, y + 24, 17, P_COLORS[pi], "left");
    ["none", "mittens", "mega"].forEach((k, j) => {
      const on = progress.equip[pi] === k, bx = UW / 2 - 110 + j * 165;
      addButton(bx, y, 155, 48, k === "none" ? L().none : "", on ? "#ff6fa8" : "#cbd5e1", () => setEquip(pi, k), 16);
      if (k !== "none") { (paperUI() && drawArtFit(ITEM_ART[k], bx + 34, y + 24, 40)) || drawMitten(bx + 34, y + 24, 30, k); label("×" + progress.inv[k], bx + 90, y + 24, 16, "#fff"); }
    });
  });
}
