// SPEC-011: the home screen (SPEC-017/026): title, language and sound, Play · Story · Character. Client module (moved out of
// index.html in Phase C).

import { MAIN_WORLDS } from "../../core/config.js";
import { progress } from "../../core/economy.js";
import { worldComplete } from "../../core/progress-rules.js";
import { L, lang } from "../../i18n.js";
import { art, PAPER_BTN } from "../art.js";
import { nextLang, openMap, openShop, openStory, toggleMusic, toggleSound } from "../flow.js";
import { LOOK } from "../look.js";
import { ctx, PHONE, UH, UW } from "../screen.js";
import { ui } from "../state.js";
import { applyUpdate, updateReady } from "../update.js";
import { fitButton, homeButton } from "./buttons.js";
import { fillStroke, regButton, rr } from "./draw.js";
import { drawArt, drawArtCover, drawArtFit } from "./artdraw.js";
import { menuFrame, phoneFrame, worldStarsOf } from "./menu.js";
import { fitLine, labelFit, noteText, pLabel, plainText, scaledW } from "./text.js";
import { cpx, hudFont, minPx } from "./layout.js";
import { textW } from "./measure.js";

// ---------- SPEC-017/026: главный экран — название, язык и звук в углу, три кнопки столбиком: Играть · История · Персонаж ----------
// SPEC-026 (решение Андрея): звёзды, миры, бонусные миры, монетки и подсказка «установить на iPhone» ушли с главного (прогресс — на
// странице «Прогресс» персонажа); страница тетради menu_bg видна целиком и на телефоне — рисунки слева и справа, как на компьютере.
// звёзды основных миров (из STARS_PER_LEVEL × уровней × основных миров) и сколько основных миров пройдено целиком — страница «Прогресс»
export const mainStars = () => MAIN_WORLDS.reduce((a, w) => a + worldStarsOf(w), 0);
export const worldsFinished = () => MAIN_WORLDS.filter(w => worldComplete(w, progress)).length;
// плашка: { id, text, pic(x, y, s) — картинка слева, open }. Ширина = картинка + текст × LOOK.TEXT_TEST_SCALE + поля (шрифты CI шире)
export function homePill(id, text, h, size, min, pic, extra = {}) {
  const M = LOOK.MENU_LOOK, pad = PHONE ? cpx(M.phoneHome.pad) : M.home.pad, ps = h * 0.55, picW = pic ? ps * 1.3 + pad * 0.5 : 0;
  ctx.font = hudFont(size);
  return { id, text, h, size, min, pic, ps, picW, pad, extra, w: picW + scaledW(text) + 2 * pad };
}
// рисует плашку (текст сжимается не мельче min, потом «…»); в hudRects — { id, text, textW, …extra }
export function drawPill(p, x, y, maxW) {
  const M = LOOK.MENU_LOOK, w = Math.min(p.w, maxW), dim = p.extra.open === false;
  rr(x, y, w, p.h, p.h * 0.4); fillStroke(p.bg || (dim ? M.locked : M.pill), (PHONE ? cpx(1) : 1) * M.pillLine, M.ink);
  if (p.pic) p.pic(x + p.pad + p.ps * 0.65, y + p.h / 2, p.ps);
  const f = fitLine(p.text, p.size, p.min, w - p.picW - 2 * p.pad);
  plainText(f.text, x + p.pad + p.picW, y + p.h / 2 + 1, f.sz, p.ink || (dim ? M.lockedInk : M.ink));
  if (PHONE) noteText("main", f.sz);
  const rect = { id: p.id, x, y, w, h: p.h, text: f.text, textW: p.picW + f.w + 2 * p.pad, ...p.extra };
  ui.hudRects.push(rect);
  return rect;
}
// SPEC-017: кнопки главного экрана — первая крупная («Играть»), остальные под ней; key — клавиши, pad — кнопки геймпада.
// Одно место для обеих раскладок и для клавиатуры/геймпада (SPEC-013 добавит сюда «Онлайн»). SPEC-026: «Магазин» стал «Персонажем»
// (та же клавиша B и кнопка Y; id «home:shop» прежний — переименовано только то, что видит игрок); icon — картинка слева от надписи
// (SPEC-027: 28_menu_icons; не загрузилась — прежняя 21_icons_ui, ART_FALLBACK), emoji — вместо неё, когда картинок нет
export const homeActions = () => {
  const M = LOOK.MENU_LOOK;
  return [
    { id: "home:play", icon: "menu_play", emoji: "▶ ", text: L().play, color: M.play, act: openMap, keys: ["Enter", "NumpadEnter", "Space"], pad: [0, 9] },
    { id: "home:story", icon: "menu_story", emoji: "📖 ", text: L().story, color: M.storyBtn, act: () => openStory(), keys: ["KeyS"], pad: [2] },
    { id: "home:shop", icon: "menu_character", emoji: "🎒 ", text: L().character, color: M.shop, act: () => openShop("home", "progress"), keys: ["KeyB"], pad: [3] }
  ];
};
// маленькие значки звука (справа, w × h), музыки (слева от него) и языка (ещё левее, langW × h); x1 — правый край. SPEC-047: два переключателя — 🎵 музыка и 🔊 звуки; выключенный зачёркнут
// SPEC-020: с картинками — круглые значки 21_icons_ui; у языка рядом с глобусом код языка
function homeIcons(x1, y, langW, w, h, size) {
  const M = LOOK.MENU_LOOK, gap = PHONE ? cpx(LOOK.PHONE_BTN_GAP) : M.home.gap, snd = ui.sfx ? "ui_sound_on" : "ui_sound_off";
  if (drawArtFit(snd, x1 - w / 2, y + h / 2, Math.min(w, h) * 1.05)) regButton(x1 - w, y, w, h, ui.sfx ? "🔊" : "🔇", toggleSound, "home:sound", Math.min(w, h));
  else fitButton(x1 - w, y, w, h, ui.sfx ? "🔊" : "🔇", M.icon, toggleSound, size, size).id = "home:sound";
  // the music switch: an emoji button until there is a picture of its own; off — crossed out with a red stroke
  const mx = x1 - w - gap - w;
  fitButton(mx, y, w, h, "🎵", M.icon, toggleMusic, Math.max(size, h * 0.62), Math.max(size, h * 0.62)).id = "home:music";
  if (!ui.music) {
    ctx.save(); ctx.strokeStyle = "#dc2626"; ctx.lineWidth = Math.max(3, h * 0.09); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(mx + w * 0.2, y + h * 0.84); ctx.lineTo(mx + w * 0.8, y + h * 0.16); ctx.stroke(); ctx.restore();
  }
  const lx = mx - gap - langW, code = lang.toUpperCase(), sp = PHONE ? cpx(4) : 4;
  if (art("ui_globe")) {
    const ic = Math.min(h, langW * 0.6), f = fitLine(code, size, PHONE ? minPx("main") : size, langW - ic - sp);
    drawArtFit("ui_globe", lx + ic / 2, y + h / 2, ic * 1.05);
    plainText(f.text, lx + ic + sp, y + h / 2 + 1, f.sz, M.ink);
    if (PHONE) noteText("main", f.sz);
    regButton(lx, y, langW, h, "🌐 " + code, nextLang, "home:lang", ic + sp + f.w).size = f.sz;
  } else fitButton(lx, y, langW, h, "🌐 " + code, M.icon, nextLang, size, PHONE ? minPx("main") : size).id = "home:lang";
}
// SPEC-038 AC 5: плашка «Готова новая версия — нажми, чтобы обновить» (жёлтая бумажка): целиком, шире не LOOK.UPDATE_NOTE.maxW экрана;
// нажатие — applyUpdate() (update.js): рабочий воркер берёт управление и страница перезагружается
function drawUpdateNote(y, h) {
  const U = LOOK.UPDATE_NOTE, p = homePill("home:update", L().updateReady, h, PHONE ? cpx(U.phoneSize) : U.size, PHONE ? minPx("main") : U.min);
  p.bg = U.bg; p.ink = U.ink;
  const w = Math.min(p.w, UW * U.maxW), x = UW / 2 - w / 2;
  const r = drawPill(p, x, y, w);
  regButton(x, y, w, h, r.text, applyUpdate, "home:update", r.textW);
}
// одна раскладка для компьютера и телефона (SPEC-026): фон — страница menu_bg «cover» (лишнее срезается поровну), значки в углу,
// по центру столбиком логотип и три кнопки (не шире col экрана); тесно по высоте — сначала ниже логотип, потом кнопки (не ниже 44 CSS px)
export function drawHome() {
  const M = LOOK.MENU_LOOK, H = PHONE ? M.phoneHome : M.home, D = M.home, c = PHONE ? cpx : (n => n), img = art("menu_bg");
  let bg = null;
  if (drawArtCover("menu_bg", 0, 0, UW, UH)) { const k = Math.min(img.naturalWidth / UW, img.naturalHeight / UH), w = UW * k / img.naturalWidth; bg = { x: (1 - w) / 2, w }; }
  // без картинки фона — бумажная карточка, как раньше (значки — в её углу)
  const f = PHONE ? phoneFrame(!bg) : menuFrame(D, !bg);
  // SPEC-038 AC 5: «Готова новая версия» — плашка внизу по центру; колонке остаётся место над ней
  const U = LOOK.UPDATE_NOTE, noteH = updateReady() ? (PHONE ? cpx(U.phoneH) : U.h) : 0, noteGap = noteH ? c(U.gap) : 0;
  const top = PHONE ? f.Y0 : bg ? D.top : D.y + D.top, edge = PHONE ? f.Y1 : bg ? UH - D.top : D.y + D.h - D.top, bottom = edge - noteH - noteGap;
  if (PHONE) homeIcons(f.X1, f.Y0, c(H.langW), f.B, f.B, c(16));
  else homeIcons(bg ? UW - D.iconPad : f.x + D.w - D.iconPad, bg ? D.iconPad : D.y + D.iconPad, D.langW, D.iconW, D.iconH, D.iconSize);
  const acts = homeActions(), gap = PHONE ? f.g : D.btnGap, minH = PHONE ? f.B : D.subH, colW = Math.min(UW * H.col, PHONE ? c(H.colMax) : D.colW);
  const logo = art("logo"), ratio = logo ? logo.naturalWidth / logo.naturalHeight : 4;
  let lh = logo ? (PHONE ? c(LOOK.PAPER.phoneLogoH) : LOOK.PAPER.logoH) : (PHONE ? c(H.titleSize) : D.titleSize) * 1.3;
  let playH = c(H.playH), subH = c(H.subH);
  const need = () => lh + c(H.logoGap) + playH + (acts.length - 1) * (gap + subH), room = bottom - top;
  if (logo && need() > room) lh = Math.max(PHONE ? c(H.logoMin) : D.titleSize, lh - (need() - room));
  if (need() > room) subH = Math.max(minH, subH - (need() - room) / (acts.length - 1));
  if (need() > room) playH = Math.max(minH, playH - (need() - room));
  const titleW = Math.min(colW * D.logoW, UW * D.logoBand);               // логотип не шире колонки с запасом и середины экрана
  if (logo) lh = Math.min(lh, titleW / ratio);
  let y = top + Math.max(0, (room - need()) / 2);
  if (logo) {                                                              // SPEC-020: нарисованное название
    const lw = lh * ratio;
    drawArt("logo", UW / 2 - lw / 2, y, lw, lh);
    ui.hudRects.push({ id: "home:title", x: UW / 2 - lw / 2, y, w: lw, h: lh, text: "BeBeBe Atrapar" });
  } else {
    const sz = PHONE ? pLabel("BeBeBe Atrapar", UW / 2, y + lh / 2, "title", H.titleSize, M.title, "center", titleW)
      : labelFit("BeBeBe Atrapar", UW / 2, y + lh / 2, D.titleSize, titleW, M.title, "center", 24);
    ctx.font = hudFont(sz);
    const tw = Math.min(titleW, textW("BeBeBe Atrapar"));
    ui.hudRects.push({ id: "home:title", x: UW / 2 - tw / 2, y: y + lh / 2 - sz * 0.6, w: tw, h: sz * 1.2, text: "BeBeBe Atrapar" });
  }
  y += lh + c(H.logoGap);
  const x = UW / 2 - colW / 2, min = PHONE ? minPx("main") : 16;
  const btns = [];
  acts.forEach((a, i) => {
    const h = i ? subH : playH, size = c(i ? H.subSize : H.playSize);
    const q = homeButton(x, y, colW, h, a, size, min);
    if (q) btns.push(q);
    else fitButton(x, y, colW, h, a.emoji + a.text, a.color, a.act, size, min).id = a.id;
    y += h + gap;
  });
  if (noteH) drawUpdateNote(edge - noteH, noteH);
  ui.homeInfo = { bg, col: { x, w: colW }, paper: acts.map(a => PAPER_BTN[a.color]), colors: acts.map(a => a.color), buttons: btns };
}
