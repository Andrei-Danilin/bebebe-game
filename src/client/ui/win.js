// SPEC-011: the end screens: win title and lines, bonus note, reward lines, the end and pause buttons, pause / win / lose on
// a phone and a computer. Client module (moved out of index.html in Phase C).

import { CFG, levelsPerWorld } from "../../core/config.js";
import { lastReward, mode } from "../../core/game.js";
import { bossFor } from "../../core/mood.js";
import { L } from "../../i18n.js";
import { art, paperPanel, paperUI } from "../art.js";
import { nextLevel, resumeGame, retryLevel, shopAfterLose, shopAfterWin, toHome, toMap } from "../flow.js";
import { LOOK } from "../look.js";
import { nameFor } from "../names.js";
import { ctx, OUT, PHONE, UH, UW } from "../screen.js";
import { ui } from "../state.js";
import { restartTutorialGame, tutorialSkip } from "../tutorial.js";
import { fitButton } from "./character/wardrobe.js";
import { addButton, coinIcon, drawStarArt, fillStroke, rr } from "./draw.js";
import { pButton, phoneFrame } from "./menu.js";
import { cpx, fitText, fmtHearts, fmtTime, hudFont, label, labelFit, lastFit, noteText, pLabel, pRows, pWrap, scaledW } from "./text.js";
import { G } from "../../core/active.js";

// =====================================================================
//  ЛОГИКА
// =====================================================================
// SPEC-022: заголовок экрана победы: «<имя> снова добрый!» — босс уровня по имени босса, иначе набранное имя или «Папа»
export const winTitle = () => L().kindAgain(bossFor(G.world, G.level) ? L().bossNames[G.world] : nameFor("big"));
// Ширина текста меряется с LOOK.TEXT_TEST_SCALE (тесты изображают более широкие шрифты CI и iPhone): плашка всегда шире текста
function drawBonusNote(cx, cy, maxW, h, css) {
  if (!lastReward || !lastReward.bonusUnlocked) return;
  const text = "🎁 " + L().bonusUnlocked, padX = PHONE ? cpx(24) : 28;
  const min = PHONE ? cpx(LOOK.PHONE_TEXT.main) : 14, start = PHONE ? Math.max(cpx(css), min) : css;
  const size = fitText(text, -9999, -9999, start, (maxW - padX) / LOOK.TEXT_TEST_SCALE, "center", OUT, 900, min, true);
  const textW = ctx.measureText(text).width * LOOK.TEXT_TEST_SCALE, w = Math.min(maxW, textW + padX), x = cx - w / 2, y = cy - h / 2;
  rr(x, y, w, h, h / 2); fillStroke("#fde047", PHONE ? cpx(3) : 4, "#db2777");
  fitText(text, cx, cy + 1, size, Infinity, "center", "#831843", 900, size);
  if (PHONE) noteText("main", size);
  ui.bonusNote = { text, x, y, w, h, size, textW };
  ui.hudRects.push({ id: "bonus-note", x, y, w, h });
}
function winText() {
  ui.winLine = lastReward && lastReward.worldDone ? L().worldDone(L().worlds[lastReward.world], lastReward.world) : L().winSub;
  return ui.winLine;
}
// SPEC-009: строки награды на экране победы (компьютер и телефон): значок и название слева, сумма справа, итог с монеткой внизу.
// Каждый текст меряется с LOOK.TEXT_TEST_SCALE, сжимается не мельче min, потом режется «…»; части — в hudRects
// (win-line:<reason> — название, win-num:<reason> — сумма; итог — :total), рамка всех строк — winPanel (для тестов).
const RW_ICONS = { firstWin: "🏆", replay: "🔁", newStars: "⭐", star: "✨", hugs: "🤗", rests: "😴" };
export function fitLine(text, size, min, maxW) {
  let sz = size;
  ctx.font = hudFont(sz);
  while (scaledW(text) > maxW && sz > min) { sz = Math.max(min, sz - 0.5); ctx.font = hudFont(sz); }
  let chs = Array.from(text);
  while (chs.length > 1 && scaledW(text) > maxW) { chs = chs.slice(0, -1); text = chs.join("").trimEnd() + "…"; }
  return { text, sz, w: scaledW(text) };
}
// x, y — левый верхний угол, w — ширина; rowH — шаг строк; size/min — кегль строк; big/bigMin — кегль суммы итога (UI px)
function drawRewardLines(rw, x, y, w, rowH, size, min, big, bigMin) {
  const parts = rw.parts || [], gap = size * 0.6, totalH = rowH * 1.4, r = size * 0.55;
  const note = (cat, sz) => { if (PHONE) noteText(cat, sz); };
  const put = (id, f, xx, yy, h = f.sz * 1.2) => ui.hudRects.push({ id, x: xx, y: yy - h / 2, w: f.w, h, text: f.text });
  ui.winPanel = { x, y, w, h: rowH * parts.length + gap + totalH };
  parts.forEach((p, i) => {
    const yy = y + rowH * (i + 0.5), neg = p.amount < 0, col = neg ? endInk("bad", "#fca5a5") : endInk("gold", "#fde047");
    const num = fitLine((neg ? "−" : "+") + Math.abs(p.amount), size, min, w / 3);
    label(num.text, x + w, yy, num.sz, col, "right"); note("main", num.sz); put("win-num:" + p.reason, num, x + w - num.w, yy);
    const name = fitLine(`${RW_ICONS[p.reason] || "•"} ${L().rw[p.reason] || p.reason}`, size, min, w - num.w - gap);
    label(name.text, x, yy, name.sz, neg ? endInk("bad", "#fca5a5") : endInk("text", "#fff"), "left"); note("main", name.sz); put("win-line:" + p.reason, name, x, yy);
  });
  const ly = y + rowH * parts.length + gap / 2, ty = ly + gap / 2 + totalH / 2;
  ctx.strokeStyle = endInk("line", "rgba(255,255,255,.55)"); ctx.lineWidth = Math.max(1, size / 9);
  ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
  const num = fitLine("+" + rw.coins, big, bigMin, w / 2);
  label(num.text, x + w, ty, num.sz, endInk("gold", "#fde047"), "right"); note("title", num.sz); put("win-num:total", num, x + w - num.w, ty);
  coinIcon(x + r, ty, r);
  const name = fitLine(L().rw.total, size, min, w - num.w - 2 * gap - 2 * r);
  label(name.text, x + 2 * r + gap, ty, name.sz, endInk("text", "#fff"), "left"); note("main", name.sz);
  const h = Math.max(name.sz * 1.2, 2 * r);
  ui.hudRects.push({ id: "win-line:total", x, y: ty - h / 2, w: 2 * r + gap + name.w, h, text: name.text });
}
// кнопки экрана итогов (компьютер и телефон): [надпись, цвет, действие]. SPEC-017: победа — «Дальше» · Карта · Магазин
// (после последнего уровня мира — Карта · Магазин), проигрыш — Ещё раз · Магазин · Карта
function endActions(m) {
  const M = LOOK.MENU_LOOK, map = ["🗺 " + L().map, M.back, toMap];
  if (m === "win") {
    const shop = ["🛒 " + L().shop, M.shop, shopAfterWin];
    if (G.level >= levelsPerWorld()) return [["🗺 " + L().map, M.ok, toMap], shop];   // мир пройден: дальше — карта
    return [[L().next(G.level + 1), M.ok, nextLevel], map, shop];
  }
  return [[L().again, M.shop, retryLevel], ["🛒 " + L().shop, M.shop, shopAfterLose], map];
}
// пауза (SPEC-017): Продолжить · Карта · Главная
// SPEC-029: в тренировке — Продолжить · Ещё раз · Пропустить (обучение)
const pauseActions = () => (G.tutorialGame ? [[L().resume, LOOK.MENU_LOOK.ok, resumeGame], ["🔁 " + L().again, LOOK.MENU_LOOK.back, restartTutorialGame], ["⏭ " + L().sceneSkip, LOOK.MENU_LOOK.back, tutorialSkip]]
  : [[L().resume, LOOK.MENU_LOOK.ok, resumeGame], ["🗺 " + L().map, LOOK.MENU_LOOK.back, toMap], ["🏠 " + L().home, LOOK.MENU_LOOK.back, toHome]]);
// SPEC-017: пауза на телефоне — Продолжить · Карта · Главная (в тренировке — Продолжить · Ещё раз · Пропустить)
export function pausePhone() {
  const c = cpx;
  const bw = c(170), bh = c(60), g = c(16), acts = pauseActions();
  phoneFrame(paperUI() && !!art("menu_bg"));                            // SPEC-020: бумажный лист (без картинок — как раньше, без листа)
  pLabel(L().pause, UW / 2, UH / 2 - c(56), "title", 44, "#fff");
  let bx = UW / 2 - (acts.length * bw + (acts.length - 1) * g) / 2;
  for (const [txt, col, act] of acts) { pButton(bx, UH / 2, bw, bh, txt, col, act, 22); bx += bw + g; }
}
// SPEC-009/017: победа и проигрыш на телефоне
export function endPhone() {
  const c = cpx;
  // слева — заголовок и звёзды, справа — итоги и монетки, внизу — кнопки
  const onPaper = paperUI() && !!art("menu_bg"), { X0, X1, Y0, Y1, g } = phoneFrame(onPaper), lx = X0 + (X1 - X0) * 0.27, rx = X0 + (X1 - X0) * 0.72, colW = (X1 - X0) * 0.44;
  const rw = lastReward || { stars: 1, coins: 0, nobodyOut: false, fast: false, target: 0 }, bh = c(56);
  let acts;
  if (mode === "win") {
    // слева: заголовок, строка под ним, звёзды и за что они; справа — строки награды и итог (SPEC-009)
    // SPEC-022: «Папа снова добрый!» — до двух строк, строка под ним — сразу под заголовком
    const tb = pRows(winTitle(), "title", 32, colW, 2, 900), ty0 = Y0 + c(4);
    tb.rows.forEach((r, i) => label(r, lx, ty0 + tb.lh * (i + 0.5), tb.sz, "#ffcf33"));
    noteText("title", tb.sz);
    ui.hudRects.push({ id: "win:title", x: lx - tb.w / 2, y: ty0, w: tb.w, h: tb.h, text: tb.rows.join(" ") });
    pWrap(winText(), lx, ty0 + tb.h + c(2), "main", 16, colW, 2, endInk("text", "#fff"), 900);
    for (let k = 0; k < CFG.STARS_PER_LEVEL; k++) drawStarArt(lx - c(56) + k * c(56), Y0 + c(138), c(21), k < rw.stars);
    [[true, L().victory], [rw.nobodyOut, L().nobodyOut], [rw.fast, L().fast(fmtTime(rw.target))]].forEach(([okk, txt], i) => {
      pLabel((okk ? "✔ " : "✘ ") + txt, lx, Y0 + c(178) + i * c(26), "main", 15, okk ? endInk("good", "#bbf7d0") : endInk("off", "#cbd5e1"), "center", colW);
    });
    drawRewardLines(rw, rx - colW / 2, Y0 + c(14), colW, c(28), c(17), cpx(LOOK.PHONE_TEXT.main), c(26), cpx(LOOK.PHONE_TEXT.title));
    acts = endActions("win").map((a, i) => [...a, c([200, 150, 150][i])]);
    // SPEC-016: под строками звёзд и наградой, над кнопками, по центру экрана — во всю ширину (испанский текст в левую колонку не влезал)
    drawBonusNote(UW / 2, Math.min(Y0 + c(262), Y1 - bh - g - c(15)), X1 - X0 - 2 * g, c(28), 15);
  } else {
    pLabel(L().lose, lx, Y0 + c(40), "title", 36, "#fca5a5", "center", colW);
    pWrap(L().loseSub(fmtHearts(G.big.maxHp - G.big.hp), G.big.maxHp), lx, Y0 + c(70), "main", 17, colW, 3, endInk("text", "#fff"), 900);
    const sc = lastReward ? lastReward.starCoins || 0 : 0, hugCoins = lastReward ? lastReward.coins - sc : 0;
    if (hugCoins > 0) { coinIcon(rx - c(70), Y0 + c(60), c(12)); pLabel(L().forHugs(hugCoins), rx - c(50), Y0 + c(60), "main", 18, endInk("gold", "#fde047"), "left", colW - c(30)); }
    if (sc > 0) pLabel("✨ " + L().starCoins(sc), rx, Y0 + c(90), "main", 16, endInk("gold", "#fde047"), "center", colW);
    acts = endActions("lose").map((a, i) => [...a, c([180, 150, 150][i])]);
  }
  const total = acts.reduce((s, a) => s + a[3], 0) + g * 1.5 * (acts.length - 1);
  let bx = UW / 2 - total / 2;
  for (const [txt, col, act, w] of acts) { pButton(bx, Y1 - bh, w, bh, txt, col, act, 22); bx += w + g * 1.5; }
}

// SPEC-020: на бумаге надписи итогов — чернилами (LOOK.PAPER.ink[key]), без картинок — светлые, как раньше (dark)
const endInk = (key, dark) => (paperUI() && art("menu_bg") ? LOOK.PAPER.ink[key] : dark);
// SPEC-020: бумажный лист под экраном паузы / победы / проигрыша на компьютере: box = [ширина, верх, высота] (UI px)
function endPaper(box) {
  if (paperUI()) paperPanel(UW / 2 - box[0] / 2, box[1], box[0], box[2], 30);
}
// пауза, победа и проигрыш на компьютере
export function pauseDesktop() {
  endPaper(LOOK.PAPER.pauseBox);
  label(L().pause, UW / 2, UH / 2 - 70, 56, "#fff");
  pauseActions().forEach(([txt, col, act], i) => fitButton(UW / 2 - 320 + i * 220, UH / 2, 200, 66, txt, col, act, 24, 14));
}
export function winDesktop() {
  endPaper(LOOK.PAPER.winBox);
  labelFit(winTitle(), UW / 2, 92, 60, LOOK.PAPER.winBox[0] - 60, "#ffcf33", "center", 30);   // SPEC-022: «Папа снова добрый!»
  ui.hudRects.push({ id: "win:title", x: UW / 2 - lastFit.w / 2, y: 92 - lastFit.sz * 0.6, w: lastFit.w, h: lastFit.sz * 1.2, text: lastFit.text });
  label(winText(), UW / 2, 146, 22, endInk("text", "#fff"));
  const rw = lastReward || { stars: 1, coins: 0, nobodyOut: false, fast: false, target: 0, parts: [] };
  // слева — звёзды и за что они, справа — строки награды и итог (SPEC-009)
  const lx = UW / 2 - 190;
  for (let k = 0; k < CFG.STARS_PER_LEVEL; k++) drawStarArt(lx - 80 + k * 80, 214, 32, k < rw.stars);
  [[true, L().victory], [rw.nobodyOut, L().nobodyOut], [rw.fast, L().fast(fmtTime(rw.target))]].forEach(([okk, txt], i) => {
    labelFit((okk ? "✔ " : "✘ ") + txt, lx, 274 + i * 30, 18, 340, okk ? endInk("good", "#bbf7d0") : endInk("off", "#cbd5e1"));
  });
  drawRewardLines(rw, UW / 2 + 20, 186, 340, 30, 19, 12, 26, 16);
  drawBonusNote(lx, 384, 360, 40, 20);   // SPEC-016: под строками звёзд, над кнопками
  const acts = endActions("win");
  const geo = acts.length === 3 ? [[UW / 2 - 360, 440, 260, 66, 24], [UW / 2 - 85, 440, 200, 66, 22], [UW / 2 + 130, 440, 200, 66, 22]]
    : [[UW / 2 - 240, 440, 260, 66, 24], [UW / 2 + 40, 440, 200, 66, 22]];
  acts.forEach(([txt, col, act], i) => { const [x, y, w, h, sz] = geo[i]; addButton(x, y, w, h, txt, col, act, sz); });
}
export function loseDesktop() {
  endPaper(LOOK.PAPER.loseBox);
  label(L().lose, UW / 2, UH / 2 - 100, 58, "#fca5a5");
  label(L().loseSub(fmtHearts(G.big.maxHp - G.big.hp), G.big.maxHp), UW / 2, UH / 2 - 35, 24, endInk("text", "#fff"));
  const sc = lastReward ? lastReward.starCoins || 0 : 0, hugCoins = lastReward ? lastReward.coins - sc : 0;
  if (hugCoins > 0) { coinIcon(UW / 2 - 70, UH / 2 - 2, 13); label(L().forHugs(hugCoins), UW / 2 - 50, UH / 2 - 2, 20, endInk("gold", "#fde047"), "left"); }
  if (sc > 0) label("✨ " + L().starCoins(sc), UW / 2, UH / 2 + (hugCoins > 0 ? 22 : 0), 16, endInk("gold", "#fde047"));
  const geo = [[UW / 2 - 360, UH / 2 + 40, 240, 66], [UW / 2 - 100, UH / 2 + 40, 200, 66], [UW / 2 + 120, UH / 2 + 40, 240, 66]];
  endActions("lose").forEach(([txt, col, act], i) => { const [x, y, w, h] = geo[i]; addButton(x, y, w, h, txt, col, act, 22); });
}
