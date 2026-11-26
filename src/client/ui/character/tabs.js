// SPEC-011: the Character screen's tabs and top bar (shopTabs, phoneShopBar). Client module (moved out of index.html in
// Phase C).

import { progress } from "../../../core/economy.js";
import { L } from "../../../i18n.js";
import { art, artPick, PAPER_BTN, paperUI, SHOP_TAB_ART } from "../../art.js";
import { backToWardrobe, closeShop, openFriends, setShopTab, SHOP_TABS } from "../../flow.js";
import { LOOK } from "../../look.js";
import { ctx, OUT, PHONE } from "../../screen.js";
import { ui } from "../../state.js";
import { fitButton } from "./wardrobe.js";
import { coinIcon, drawArt9, drawArtFit, fillStroke, regButton, rr } from "../draw.js";
import { cpx, hudFont, label, minPx, noteText, pText, scaledW } from "../text.js";
import { fitLine } from "../win.js";

// компьютер: вкладки «Прогресс» · «Вещи» · «Гардероб» · «Улучшения» (SPEC-017, SPEC-026) от x, y, высота h, в ширину maxW (не влезают —
// все уже поровну); возвращает правый край
const SHOP_TAB_ICONS = { progress: "🏆 ", items: "📦 ", wardrobe: "👕 ", upgrades: "⭐ " };
const shopTabText = (k, icons) => (icons ? SHOP_TAB_ICONS[k] : "") + L()[k + "Tab"];
export function shopTabs(x, y, h, size, min, gap, icons, maxW = Infinity) {
  ctx.font = hudFont(size);
  const nat = SHOP_TABS.map(k => Math.max(h, Math.min(scaledW(shopTabText(k, icons)), 200) + 30)), sum = nat.reduce((a, b) => a + b, 0);
  const k0 = Math.min(1, (maxW - (SHOP_TABS.length - 1) * gap) / sum);
  for (const [i, k] of SHOP_TABS.entries()) {
    const t = shopTabText(k, icons), color = ui.shopTab === k ? LOOK.MENU_LOOK.tabOn : LOOK.MENU_LOOK.tabOff;
    const w = Math.max(h, nat[i] * k0);
    if (!(icons && iconTab(x, y, w, h, SHOP_TAB_ART[k], L()[k + "Tab"], t, color, () => setShopTab(k), size, min, "tab:" + k)))
      fitButton(x, y, w, h, t, color, () => setShopTab(k), size, min).id = "tab:" + k;
    x += w + gap;
  }
  return x - gap;
}
// SPEC-020: бумажная вкладка со значком-картинкой слева от надписи (вместо эмодзи); null — нет картинок, рисуй как раньше
function iconTab(x, y, w, h, icon, text, full, color, act, size, min, id) {
  const paper = PAPER_BTN[color], k = PHONE ? cpx(1) : 1, pic = artPick(icon);   // SPEC-027: новый значок или прежний (ART_FALLBACK)
  if (!paperUI() || !paper || !pic || !art(paper)) return null;
  const ic = h * 0.82, sp = 4 * k, f = fitLine(text, size, min, w - ic - sp - 14 * k), tw = ic + sp + f.w, x0 = x + (w - tw) / 2;
  drawArt9(paper, x, y, w, h, Math.min(w, h) * LOOK.PAPER.btnCorner);
  drawArtFit(pic, x0 + ic / 2, y + h / 2, ic);
  label(f.text, x0 + ic + sp, y + h / 2 + 1, f.sz, "#fff", "left");
  if (PHONE) noteText("main", f.sz);
  const b = regButton(x, y, w, h, full, act, id, tw);
  b.size = f.sz;
  return b;
}
// SPEC-027: бумажная кнопка без надписи, только значок-картинка (icon или его запасная) на iconOnly высоты; нет картинок — кнопка с эмодзи
export function iconOnlyButton(x, y, w, h, icon, emoji, color, act, size, min, id) {
  const paper = PAPER_BTN[color], pic = artPick(icon);
  if (paperUI() && pic && paper && drawArt9(paper, x, y, w, h, Math.min(w, h) * LOOK.PAPER.btnCorner)) {
    drawArtFit(pic, x + w / 2, y + h / 2, Math.min(w, h) * LOOK.PAPER.iconOnly);
    return regButton(x, y, w, h, emoji, act, id, Math.min(w, h) * LOOK.PAPER.iconOnly);
  }
  const b = fitButton(x, y, w, h, emoji, color, act, size, min); b.id = id;
  return b;
}
// SPEC-017, телефон: верхняя полоса магазина — вкладки, монетки, средняя кнопка («Друзья» в гардеробе, «◀ Гардероб» на странице
// друзей; SPEC-026: сброс прогресса — на странице «Прогресс») и «Готово». Ширины меряются с LOOK.TEXT_TEST_SCALE (шрифты CI шире):
// сначала «Готово» и монетки, средняя кнопка — полный текст или короткий, вкладки — всё, что осталось (тесно — уже, текст мельче)
export function phoneShopBar(f) {
  const c = cpx, { X0, X1, Y0, g, B } = f, min = minPx("main"), tabSz = c(17), midSz = c(15), okSz = c(18);
  const need = (t, sz) => { ctx.font = hudFont(sz); return scaledW(t) + c(26); };
  const okW = Math.max(B, need(L().ok, okSz));
  ctx.font = hudFont(c(17));
  const pw = Math.max(c(76), scaledW(String(progress.coins)) + c(42));
  const tabT = SHOP_TABS.map(k => shopTabText(k, false)), tabW = tabT.map(t => Math.max(B, need(t, tabSz)));
  const M = LOOK.MENU_LOOK;
  // SPEC-026: сброс прогресса переехал на страницу «Прогресс»; средняя кнопка — только в гардеробе
  const mid = ui.shopTab !== "wardrobe" ? null
    : ui.wardrobePage === "friends" ? { texts: ["◀ " + L().wardrobeTab, "◀"], color: M.ok, act: backToWardrobe, min: B }
    : { texts: ["👥 " + L().friends, "👥"], color: M.friends, act: openFriends, min: B, icon: "ui_friends" };   // SPEC-027: короткая — значок 34_small_icons
  // надпись средней кнопки с запасом RESET_FIT (шрифты CI и iPhone шире наших)
  const midW = t => { ctx.font = hudFont(midSz); return Math.max(mid.min, scaledW(t) * LOOK.PHONE_SHOP.RESET_FIT + c(20)); };
  const avail = X1 - X0 - okW - pw - (mid ? 6 : 5) * g, tabsNat = tabW.reduce((a, b) => a + b, 0);
  const midT = mid ? mid.texts.find(t => tabsNat + midW(t) <= avail) ?? mid.texts.at(-1) : null;
  const mw = mid ? Math.min(midW(midT), avail - SHOP_TABS.length * B) : 0, room = avail - mw, k = Math.min(1, room / tabsNat);
  // SPEC-026: четыре вкладки не влезают и самым мелким текстом (узкий телефон, длинные слова) — у выбранной надпись, у остальных
  // только значок (картинка вкладки или эмодзи), по B
  const atMin = tabT.reduce((a, t) => a + Math.max(B, need(t, min)), 0), compact = atMin > room;
  const sel = SHOP_TABS.indexOf(ui.shopTab);
  let x = X0;
  SHOP_TABS.forEach((key, i) => {
    const color = ui.shopTab === key ? M.tabOn : M.tabOff, act = () => setShopTab(key);
    const w = !compact ? Math.max(B, tabW[i] * k) : i === sel ? Math.max(B, Math.min(tabW[i], room - (SHOP_TABS.length - 1) * B)) : B;
    if (compact && i !== sel) iconOnlyButton(x, Y0, w, B, SHOP_TAB_ART[key], SHOP_TAB_ICONS[key].trim(), color, act, tabSz, min, "tab:" + key);
    else fitButton(x, Y0, w, B, tabT[i], color, act, tabSz, min).id = "tab:" + key;
    x += w + g;
  });
  rr(x, Y0 + c(4), pw, B - c(8), c(12)); fillStroke(M.panel, 3);
  ui.hudRects.push({ id: "coins", x, y: Y0 + c(4), w: pw, h: B - c(8) });
  coinIcon(x + c(16), Y0 + B / 2, c(10)); pText(String(progress.coins), x + c(30), Y0 + B / 2 + 1, "main", 17, pw - c(36), "left", OUT, 900);
  if (mid && mid.icon && midT === mid.texts.at(-1)) iconOnlyButton(X1 - okW - g - mw, Y0, mw, B, mid.icon, midT, mid.color, mid.act, midSz, min);
  else if (mid) fitButton(X1 - okW - g - mw, Y0, mw, B, midT, mid.color, mid.act, midSz, min);
  fitButton(X1 - okW, Y0, okW, B, L().ok, M.ok, closeShop, okSz, min);
}
