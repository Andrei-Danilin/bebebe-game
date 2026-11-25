// SPEC-011: Character → Wardrobe: locks, Buy, captions, the looks columns and the friends page, the name labels
// (SPEC-009/017). Client module (moved out of index.html in Phase C).

import { progress } from "../../../core/economy.js";
import { BIG_SKINS, SLOTS } from "../../../core/wardrobe.js";
import { L, lang } from "../../../i18n.js";
import { art, paperUI, WARDROBE_ART } from "../../art.js";
import { openNameInput } from "../../input.js";
import { LOOK } from "../../look.js";
import { BOT_SLOTS, nameFor } from "../../names.js";
import { botOutfit, buyArmed, buyLook, cycleBig, cycleOutfit, lockedItems, lockedPrice, makeLook, ownsItem, P_COLORS, randomOutfit, skinSel } from "../../outfits.js";
import { ctx, OUT, PHONE, UW } from "../../screen.js";
import { ui } from "../../state.js";
import { skinCx, skinPanels } from "../../three/previews.js";
import { iconOnlyButton } from "./tabs.js";
import { addButton, circle, drawArtFit, drawCoin, fillStroke, fillT, noteArt, rr } from "../draw.js";
import { phoneSkinCols } from "../menu.js";
import { cpx, fitText, fz, label, noteRows, noteText, pLabel, plainText, pText, pWrap } from "../text.js";
import { fitLine } from "../win.js";

// ---------- SPEC-009: гардероб — замки, «Купить», подписи (вкладка «Гардероб» магазина, компьютер и телефон) ----------
// цена замочка в строке слота (0 — вещь своя); sl = слот или «look» (Большой)
const rowLock = (sl, list, sel) => (list[sel].price && !ownsItem(sl === "look" ? "big" : sl, sel) ? list[sel].price : 0);
const slotText = (sl, lock) => (lock ? `🔒 ${lock} · ${L().slots[sl]}` : L().slots[sl]);
// монетки игрока: белая плашка с монеткой (hudRects «coins»)
export function coinPlate(x, y, w, h) {
  const r = h * 0.3, min = PHONE ? cpx(LOOK.PHONE_TEXT.main) : 12, img = paperUI() && art("coin_badge");
  if (img) {                                                               // SPEC-020: плашка с монеткой из 13_interface (3 куска)
    const P = LOOK.PAPER, iw = img.naturalWidth, ih = img.naturalHeight, kk = h / ih;
    const lw = Math.min(w / 2, iw * P.coinLeft * kk), rw = Math.min(w / 4, iw * P.coinRight * kk);
    ctx.drawImage(img, 0, 0, iw * P.coinLeft, ih, x, y, lw, h);
    ctx.drawImage(img, iw * P.coinLeft, 0, iw * (1 - P.coinLeft - P.coinRight), ih, x + lw, y, w - lw - rw, h);
    ctx.drawImage(img, iw * (1 - P.coinRight), 0, iw * P.coinRight, ih, x + w - rw, y, rw, h);
    noteArt("coin_badge");
  } else {
    rr(x, y, w, h, h * 0.4); fillStroke("#fff", 3);
    drawCoin(x + h * 0.2 + r, y + h / 2, r);
  }
  const f = fitLine(String(progress.coins), Math.max(min, h * 0.5), min, w - 2 * r - h * 0.6);
  plainText(f.text, x + h * 0.4 + 2 * r, y + h / 2 + 1, f.sz);
  if (PHONE) noteText("main", f.sz);
  ui.hudRects.push({ id: "coins", x, y, w, h });
}
// подпись «не хватает монеток» / «нажми ещё раз» (hudRects «look-note:<колонка>»): box = { x, y, w, lines } — y верх плашки,
// или низ, если bottom (компьютер: поверх низа превью); телефон — под превью или под строкой «Вид», чтобы не закрывать примерку
function previewNote(key, box, text, color) {
  const pad = PHONE ? cpx(2) : 4, min = PHONE ? cpx(LOOK.PHONE_TEXT.hint) : 11;
  const b = noteRows(text, PHONE ? min : 14, min, box.w - 4 * pad, box.lines), lh = b.sz * 1.2, h = b.rows.length * lh + 2 * pad;
  const x = box.x, y = box.bottom ? box.y - h : box.y, w = box.w;
  rr(x, y, w, h, Math.min(10, h / 3)); ctx.fillStyle = "rgba(15,23,42,.78)"; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.font = `800 ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  b.rows.forEach((q, i) => fillT(q, x + w / 2, y + pad + lh * (i + 0.5)));
  ctx.restore();
  if (PHONE) noteText("hint", b.sz);
  ui.hudRects.push({ id: "look-note:" + key, x, y, w, h });
}
// на месте подписи с именем, пока в колонке примерено некупленное: «🔒 Купить за N» (второе нажатие — «✔ …», красная)
function lookBuy(key, r, note) {
  const total = lockedPrice(key), poor = progress.coins < total, armed = buyArmed === key;
  const min = PHONE ? cpx(LOOK.PHONE_TEXT.main) : 10;
  const f = fitLine((armed ? "✔ " : "🔒 ") + L().buyFor(total), PHONE ? cpx(18) : 18, min, r.w - (PHONE ? cpx(14) : 16));
  const b = addButton(r.x, r.y, r.w, r.h, f.text, poor ? "#94a3b8" : armed ? "#ef4444" : "#f59e0b", () => buyLook(key), f.sz);
  b.id = "buy-look:" + key; b.textW = f.w;
  if (poor) previewNote(key, note, L().notEnough, "#fecaca");
  else if (armed) previewNote(key, note, L().tapAgain, "#fde047");
}
// кнопка, надпись которой меряется с LOOK.TEXT_TEST_SCALE и сжимается до min (потом «…»); textW — ширина с этим множителем
export function fitButton(x, y, w, h, text, color, act, size, min) {
  const f = fitLine(text, size, min, w - (PHONE ? cpx(14) : 14));
  const b = addButton(x, y, w, h, f.text, color, act, f.sz);
  b.textW = f.w; b.size = f.sz;
  return b;
}
// строки noteRows от верхнего края y по центру cx (+ прямоугольник в hudRects); возвращает высоту
export function rowsAt(id, b, cx, y, color, weight = 800) {
  const lh = b.sz * 1.2;
  ctx.font = `${weight} ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  b.rows.forEach((q, i) => fillT(q, cx, y + lh * (i + 0.5)));
  ui.hudRects.push({ id, x: cx - b.w / 2, y, w: b.w, h: b.rows.length * lh, text: b.rows.join(" "), rows: b.rows.slice(), size: b.sz });
  return b.rows.length * lh;
}

// ---------- SPEC-017: вкладка «Гардероб» магазина — бывший экран нарядов (SPEC-003/009) и имена друзей ----------
const LOOK_TITLES = () => ({ p1: [L().player1, P_COLORS[0]], p2: [L().player2, P_COLORS[1]], big: [L().big, LOOK.MENU_LOOK.bigInk] });
// стрелки ◀ ▶ строки наряда: id «cycle:<колонка>:<слот>:±1»
function cycleButtons(key, sl, act, x, y, w, h, size, rightX) {
  addButton(x, y, w, h, "◀", LOOK.MENU_LOOK.nav, () => act(-1), size).id = `cycle:${key}:${sl}:-1`;
  addButton(rightX, y, w, h, "▶", LOOK.MENU_LOOK.nav, () => act(1), size).id = `cycle:${key}:${sl}:1`;
}
const lookRows = key => key === "big" ? [["look", BIG_SKINS, skinSel.big, d => cycleBig(d)]]
  : ["hair", "hat", "jacket", "pants"].map(sl => [sl, SLOTS[sl], skinSel[key][sl], d => cycleOutfit(key, sl, d)]);
const THUMB_SLOTS = ["hat", "jacket", "pants"];
// рисунки надетых вещей столбиком у правого края окошка 3D-превью (у Большого — нет)
function lookThumbs(key, pnl) {
  if (key === "big" || !paperUI()) return;
  const sz = Math.min(pnl.w * 0.27, pnl.h / 3.3), x = pnl.x + pnl.w - sz / 2 - 3;
  let y = pnl.y + sz / 2 + 3;
  for (const sl of THUMB_SLOTS) {
    const name = WARDROBE_ART[sl][SLOTS[sl][skinSel[key][sl]].id];
    if (name && drawArtFit(name, x, y, sz)) y += sz + 2;
  }
}
export function wardrobeDesktop() {
  const W = LOOK.MENU_LOOK.wardrobe;
  if (ui.wardrobePage === "friends") {
    label("👥 " + L().friends, UW / 2, 124, 34, LOOK.MENU_LOOK.friendsTitle);
    fitText(L().tapToRename, UW / 2, 162, 16, 520, "center", LOOK.MENU_LOOK.note, 700);
    for (let i = 0; i < BOT_SLOTS; i++) {
      const y = 190 + i * 80, look = makeLook(botOutfit(i));
      circle(UW / 2 - 200, y + 28, 24); fillStroke(look.shirt, 3);
      circle(UW / 2 - 200, y + 18, 13); fillStroke(look.skin, 2.5);
      nameLabel({ x: UW / 2 - 160, y, w: 360, h: 56 }, "bot" + (i + 1), LOOK.MENU_LOOK.ink);
    }
    return;
  }
  const cols = LOOK_TITLES();
  skinPanels().forEach((pnl, i) => {
    const key = pnl.key, [title, color] = cols[key], cx = skinCx(i);
    rr(cx - 115, 88, 230, W.colBottom - 88, 22); fillStroke(LOOK.MENU_LOOK.panel, 3.5);
    label(title, cx - (key === "big" ? 0 : 18), 112, 20, color);
    if (key !== "big") iconOnlyButton(cx + 62, 96, 42, 32, "ui_dice", "🎲", LOOK.MENU_LOOK.dice, () => randomOutfit(key), 18, 18, "random:" + key);   // SPEC-027: кубик картинкой
    ctx.clearRect(pnl.x, pnl.y, pnl.w, pnl.h);              // окошко: здесь видно 3D-превью
    ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.strokeRect(pnl.x, pnl.y, pnl.w, pnl.h);
    lookThumbs(key, pnl);
    // имя под превью — тап, чтобы поменять; пока примерено некупленное — на его месте «Купить N» (SPEC-009)
    const nr = { x: pnl.x, y: pnl.y + pnl.h + 8, w: pnl.w, h: 36 };
    if (lockedItems(key).length) lookBuy(key, nr, { x: pnl.x + 4, y: pnl.y + pnl.h - 4, w: pnl.w - 8, lines: 3, bottom: true }); else nameLabel(nr, key, color);
    lookRows(key).forEach(([sl, list, sel, act], r) => {
      const y = 336 + r * 54, lock = rowLock(sl, list, sel);
      fitText(slotText(sl, lock), cx, y, 12, 200, "center", lock ? LOOK.MENU_LOOK.lockNote : LOOK.MENU_LOOK.nav, 800);
      cycleButtons(key, sl, act, cx - 108, y + 10, 40, 34, 15, cx + 68);
      fitText(list[sel].name[lang], cx, y + 28, 15, 130, "center", OUT, 900);
    });
  });
}
// телефон: под верхней полосой — колонка игрока 1 (превью, под ним подсказка или «не хватает», 🎲; справа имя и 4 строки нарядов)
// и колонка Большого (превью, имя или «Купить», строка «Вид»); на странице друзей — четыре имени в два столбца
export function wardrobePhone(f) {
  const c = cpx, { X0, X1, Y0, Y1, g, B } = f;
  if (ui.wardrobePage === "friends") {
    const y0 = Y0 + B + g;
    pLabel("👥 " + L().friends, UW / 2, y0 + c(16), "title", 26, LOOK.MENU_LOOK.friendsTitle);
    pText(L().tapToRename, UW / 2, y0 + c(44), "hint", 14, X1 - X0, "center", LOOK.MENU_LOOK.note, 700);
    const cw = (X1 - X0 - c(16)) / 2;
    for (let i = 0; i < BOT_SLOTS; i++) {
      const x = X0 + (i % 2) * (cw + c(16)), y = y0 + c(66) + Math.floor(i / 2) * (B + c(16)), look = makeLook(botOutfit(i));
      circle(x + c(20), y + B / 2 + c(4), c(17)); fillStroke(look.shirt, 3);
      circle(x + c(20), y + B / 2 - c(4), c(9)); fillStroke(look.skin, 2.5);
      nameLabel({ x: x + c(48), y, w: cw - c(48), h: B }, "bot" + (i + 1), LOOK.MENU_LOOK.ink);
    }
    return;
  }
  const cols = LOOK_TITLES();
  phoneSkinCols().forEach(col => {
    const pnl = col.panel, isBig = col.key === "big", color = cols[col.key][1];
    rr(col.x - c(6), pnl.y - c(6), col.w + c(12), Y1 - pnl.y + c(12), c(16)); fillStroke(LOOK.MENU_LOOK.panel, 3);
    ctx.clearRect(pnl.x, pnl.y, pnl.w, pnl.h);              // окошко: здесь видно 3D-превью
    ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.strokeRect(pnl.x, pnl.y, pnl.w, pnl.h);
    lookThumbs(col.key, pnl);
    /** @param {number} x @param {number} y @param {number} w @param {any[]} r */
    const row = (x, y, w, [sl, list, sel, act]) => {         // ◀ подпись и название ▶
      cycleButtons(col.key, sl, act, x, y, B, B, fz(16, "main"), x + w - B);
      const lock = rowLock(sl, list, sel);
      pText(slotText(sl, lock), x + w / 2, y + c(11), "hint", 13, w - 2 * B - c(8), "center", lock ? LOOK.MENU_LOOK.lockNote : LOOK.MENU_LOOK.nav, 800);
      pText(list[sel].name[lang], x + w / 2, y + c(31), "main", 15, w - 2 * B - c(8), "center", OUT, 900);
    };
    if (isBig) {
      const ny = pnl.y + pnl.h + g, nr = { x: col.x, y: ny, w: col.w, h: B };
      if (lockedItems("big").length) lookBuy("big", nr, { x: col.x, y: ny + 2 * B + g + c(3), w: col.w, lines: 1 }); else nameLabel(nr, "big", color);
      row(col.x, ny + B + g, col.w, lookRows("big")[0]);
    } else {
      const x = pnl.x + pnl.w + c(12), w = col.x + col.w - x, nr = { x, y: pnl.y, w, h: B }, dy = pnl.y + 4 * (B + g);
      iconOnlyButton(pnl.x, dy, pnl.w, B, "ui_dice", "🎲", LOOK.MENU_LOOK.dice, () => randomOutfit("p1"), fz(18, "main"), fz(18, "main"), "random:p1");   // на одной высоте со «Штанами» (SPEC-027: кубик картинкой)
      if (lockedItems("p1").length) lookBuy("p1", nr, { x: pnl.x, y: pnl.y + pnl.h + c(6), w: pnl.w, lines: 3 });
      else { nameLabel(nr, "p1", color); pWrap(L().tapToRename, pnl.x + pnl.w / 2, pnl.y + pnl.h + c(8), "hint", 13, pnl.w, 4, LOOK.MENU_LOOK.note, 700); }
      lookRows("p1").forEach((r, i) => row(x, pnl.y + B + g + i * (B + g), w, r));
    }
  });
}

// Подпись с именем: прямоугольник-кнопка с ✏️; тап открывает поле ввода ровно на её месте
function nameLabel(rect, slot, color) {
  rr(rect.x, rect.y, rect.w, rect.h, 12); fillStroke("#f8fafc", 3);
  if (PHONE) {
    const min = cpx(LOOK.PHONE_TEXT.main);
    noteText("main", fitText(nameFor(slot) + " ✏️", rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, Math.max(min, Math.min(cpx(20), rect.h * 0.5)), rect.w - cpx(12), "center", color, 900, min));
    ui.buttons.push({ ...rect, act: () => openNameInput(rect, slot), id: "name:" + slot, onUp: true, textW: ctx.measureText(nameFor(slot) + " ✏️").width });
    return;
  } else fitText(nameFor(slot) + " ✏️", rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, Math.min(22, rect.h * 0.5), rect.w - 16, "center", color, 900);
  ui.buttons.push({ ...rect, act: () => openNameInput(rect, slot), id: "name:" + slot, onUp: true });
}
