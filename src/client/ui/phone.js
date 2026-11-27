// SPEC-011: the phone HUD (SPEC-005): phoneTopBar, team chips, teamRect, phoneOccluders, drawHUDPhone. Client module (moved
// out of index.html in Phase C).

import { progress } from "../../core/economy.js";
import { L } from "../../i18n.js";
import { ITEM_ART } from "../art.js";
import { LOOK } from "../look.js";
import { ctx, fullscreenShown, OUT, UH, UW } from "../screen.js";
import { mode, ui } from "../state.js";
import { tutorialSkip } from "../tutorial.js";
import { tutorialHintOn, tutorialHintText } from "../tutorial-data.js";
import { addButton, circle, drawMitten, drawSticks, fillStroke, hpHeart, iconButton, rr, toggleFullscreen } from "./draw.js";
import { drawArtFit } from "./artdraw.js";
import { angerLabel, chipFill, chipInk, chipText, noteChip, drawHeardHint, drawKitHint, heardHintOn, heartFill, hintPlate, kissButton, kitButton, kitHintOn, restText, timerText, tiptoeBtnRect, tiptoeButton } from "./hud.js";
import { drawEdgeArrows, drawMinimap } from "./minimap.js";
import { fitText, fz, labelFit, lastFit, noteText, scaledW } from "./text.js";
import { cpx, hudFont, minimapRect, minPx, showMinimap, teamRect } from "./layout.js";
import { G } from "../../core/active.js";
import { canKitNow, setMode } from "../flow.js";
import { gameInv, gloveOf } from "../../core/rules.js";
import { textW } from "./measure.js";

// верхняя полоса телефона: слева имя Большого и сердечки, дальше уровень/время, пауза, «во весь экран»;
// справа сверху мини-карта, под ней кружки команды; внизу справа 💋 и рядом рукавицы
export function drawHUDPhone(t) {
  if (mode === "win" || mode === "lose") return;   // итоги — свой экран
  const m = cpx(8), gap = cpx(LOOK.PHONE_BTN_GAP), bh = cpx(LOOK.PHONE_BTN_MIN), top = cpx(6), pad = cpx(10);
  const mm = minimapRect(), main = minPx("main"), hint = minPx("hint"), fsOn = fullscreenShown();   // SPEC-038 AC 4
  const plate = (id, x, y, w, h) => { rr(x, y, w, h, cpx(14)); fillStroke("rgba(255,255,255,.85)", 3); ui.hudRects.push({ id, x, y, w, h }); };
  // уровень и время + кнопки
  const timeTxt = timerText();
  ctx.font = hudFont(main);
  const tw = (G.tutorialGame ? scaledW(timeTxt) : textW(timeTxt)) + 2 * pad, nBtn = (fsOn ? 2 : 1) + (G.tutorialGame ? 1 : 0), gw = tw + nBtn * (gap + bh);   // SPEC-029: «Тренировка» — с запасом на широкие шрифты; + ⏭
  // SPEC-022: злость папы (подпись) и облачка-сердечки. Подпись — вся (ширина с LOOK.TEXT_TEST_SCALE: шрифты CI и iPhone шире);
  // не влезает — облачка плотнее (до PHONE_HEART_MIN), и только потом подпись короче
  const bigName = angerLabel(), room = mm.x - gap - m - gw - gap;
  let hStep = cpx(21), hSize = cpx(18), nameW = scaledW(bigName);
  const plateW = () => pad + nameW + pad * 0.6 + G.big.maxHp * hStep + pad * 0.4;
  if (plateW() > room) { hStep = Math.max(cpx(LOOK.PHONE_HEART_MIN), (room - pad * 2 - nameW) / G.big.maxHp); hSize = Math.min(hSize, hStep * 0.95); }
  if (plateW() > room) nameW = Math.max(cpx(36), room - pad * 2 - G.big.maxHp * hStep);
  const pw = plateW();
  plate("hearts", m, top, pw, bh);
  noteText("main", labelFit(bigName, m + pad, top + bh / 2, main, nameW / LOOK.TEXT_TEST_SCALE + 0.01, "#9b2c3a", "left", main, true));   // + 0.01: × и ÷ масштаба не точны
  Object.assign(ui.hudRects.find(r => r.id === "hearts"), { label: lastFit.text, labelX: m + pad, labelW: lastFit.w * LOOK.TEXT_TEST_SCALE });   // SPEC-022: подпись злости — в плашке hearts
  const hx = m + pad + nameW + pad * 0.6 + hStep / 2;
  for (let i = 0; i < G.big.maxHp; i++) hpHeart(hx + i * hStep, top + bh / 2 - hSize / 2 - 1, hSize, heartFill(i, G.big.hp), hStep);
  // группа по центру свободного места
  const gx = m + pw + Math.max(gap, (mm.x - gap - (m + pw) - gw) / 2);
  plate("timer", gx, top, tw, bh);
  noteText("main", fitText(timeTxt, gx + tw / 2, top + bh / 2 + 1, main, tw, "center", OUT, 900, main));
  iconButton("phone_pause", gx + tw + gap, top, bh, bh, "II", "#64748b", () => { setMode("pause"); }, fz(main, "main"));
  if (fsOn) iconButton("ui_fullscreen", gx + tw + gap + bh + gap, top, bh, bh, "⛶", "#64748b", toggleFullscreen, fz(main, "main")).onUp = true;   // SPEC-025 AC 7c: на отпускании (жест)
  // SPEC-029: в тренировке — кнопка ⏭ «Пропустить» (обучение целиком; то же со словом — в паузе) в ряду кнопок, после «во весь экран»
  if (G.tutorialGame && mode === "play") addButton(gx + tw + gap + (fsOn ? 2 : 1) * (bh + gap), top, bh, bh, "⏭", LOOK.MENU_LOOK.back, tutorialSkip, fz(main, "main")).id = "tutorial:skip";
  // кружки команды под мини-картой
  const tr = teamRect();
  plate("team", tr.x, tr.y, tr.w, tr.h);
  G.littles.forEach((l, i) => {
    const cx = tr.x + cpx(5) + i * tr.cw + tr.cw / 2, cy = tr.y + tr.h / 2;
    ctx.globalAlpha = l.state === "home" || l.state === "rest" ? 0.45 : 1;
    circle(cx, cy, tr.cd / 2); fillStroke(chipFill(l), 2.5); noteChip(l);
    ctx.globalAlpha = 1;
    noteText("hint", labelFit(chipText(l), cx, cy, hint, tr.cd - cpx(4), chipInk(l), "center", hint));
  });
  // внизу справа: 💋 (или 🩹, пока герой лежит, хромает домой или отдыхает — SPEC-007) и рукавицы рядом
  const kitOn = canKitNow(G.littles[0]), kissOn = mode === "play" && !kitOn && gameInv().kisses > 0;
  if (kitOn) kitButton(0, t); else if (kissOn) kissButton(0);
  if (mode === "play") tiptoeButton(0, t);               // SPEC-032 AC 1: 👣 левее 💋 (его место — и когда 💋 нет)
  const gl = gloveOf(0), gh = cpx(44), gEach = cpx(80);
  let rightEdge = mode === "play" ? tiptoeBtnRect(0).x - gap : UW - m;
  if (gl) {
    const gx0 = rightEdge - gEach, gy0 = UH - m - gh;
    plate("gloves", gx0, gy0, gEach, gh);
    drawArtFit(ITEM_ART[gl], gx0 + cpx(22), gy0 + gh / 2, cpx(36)) || drawMitten(gx0 + cpx(22), gy0 + gh / 2, cpx(28), gl);
    noteText("main", fitText("×" + progress.inv[gl], gx0 + cpx(54), gy0 + gh / 2 + 1, main, gEach - cpx(40), "center", OUT, 900, main));
    rightEdge = gx0 - gap;
  }
  drawSticks();
  // подсказка (первые секунды) и «отдыхает» — внизу, левее кнопок
  const bw = rightEdge - m, bcx = m + bw / 2;
  if (G.stats.time < 5) {
    const hy = UH - m - cpx(16), hs = labelFit(L().touch1, bcx, hy, cpx(17), bw, "#fff", "center", hint), tw2 = Math.min(bw, textW(L().touch1));
    noteText("hint", hs); ui.hudRects.push({ id: "hint", x: bcx - tw2 / 2, y: hy - hs * 0.7, w: tw2, h: hs * 1.4 });
  }
  const resting = G.littles.filter(l => l.kind === "player" && (l.state === "home" || l.state === "rest"));
  resting.forEach((l, i) => {
    const rh = cpx(40), ry = UH - m - rh - i * (rh + gap) - (G.stats.time < 5 ? cpx(36) : 0);
    rr(m, ry, bw, rh, cpx(14)); fillStroke("rgba(30,41,59,.8)", 3); ui.hudRects.push({ id: "rest", x: m, y: ry, w: bw, h: rh });
    noteText("main", fitText(restText(l), bcx, ry + rh / 2, cpx(17), bw - 2 * pad, "center", "#e0e7ff", 800, main));
  });
  if (kitHintOn()) {                                     // «Нажми 🩹» — над плашками «отдыхает»
    const rh = cpx(40), ry = UH - m - rh - resting.length * (rh + gap) - (G.stats.time < 5 ? cpx(36) : 0);
    drawKitHint(m, ry, bw, rh, cpx(14), sz => noteText("main", sz), cpx(17), main);
  }
  if (heardHintOn()) {                                   // SPEC-019: «Папа услышал топот!» — над ними, до двух строк
    const n = resting.length + (kitHintOn() ? 1 : 0);
    noteText("main", drawHeardHint(m, UH - m - n * (cpx(40) + gap) - (G.stats.time < 5 ? cpx(36) : 0), bw, cpx(17), main, cpx(10)));
  }
  if (tutorialHintOn()) {                                // SPEC-029: подсказка тренировки — там же, внизу левее кнопок (в тренировке нет ни отдыха, ни тех подсказок)
    ui.tutorialHintRect = hintPlate("tutorialHint", tutorialHintText(), m, UH - m - (G.stats.time < 5 ? cpx(36) : 0), bw, cpx(17), main, cpx(10));
    noteText("main", ui.tutorialHintRect.size);
  }
  if (showMinimap()) { drawMinimap(t); drawEdgeArrows(); }
}
