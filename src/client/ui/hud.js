// SPEC-011: the in-game HUD on a computer (drawHUD), the shared HUD texts, the rescue-kit and heard hints, the kiss and kit
// buttons, the level banner (drawBanner, placePhoneBanner). Client module (moved out of index.html in Phase C).

import { CFG, TAU } from "../../core/config.js";
import { progress } from "../../core/economy.js";
import { clamp } from "../../core/util.js";
import { canAct, inSafe } from "../../core/world.js";
import { L } from "../../i18n.js";
import { ITEM_ART } from "../art.js";
import { bannerAlpha, canKitNow, pressKiss, pressKit, setMode } from "../flow.js";
import { chipName } from "../devices.js";
import { LOOK } from "../look.js";
import { nameOf, typedName } from "../names.js";
import { P_COLORS } from "../outfits.js";
import { CSS_W, ctx, fullscreenShown, isTouch, OUT, PHONE, UH, UW } from "../screen.js";
import { mode, ui } from "../state.js";
import { camHero, toScreen } from "../three/camera.js";
import { tutorialSkip } from "../tutorial.js";
import { tutorialHintOn, tutorialHintText } from "../tutorial-data.js";
import { fitButton } from "./buttons.js";
import { circle, drawKiss, drawKit, drawMitten, drawSticks, fillStroke, hpHeart, iconButton, nameTagH, playerNameTag, rr, toggleFullscreen } from "./draw.js";
import { drawArtFit, fillT } from "./artdraw.js";
import { fitText, fmtTime, fz, label, labelFit, lastFit, noteRows, noteText } from "./text.js";
import { cpx, hudFont, minimapRect, minPx, phoneTopBar } from "./layout.js";
import { G } from "../../core/active.js";
import { gameInv, gloveOf } from "../../core/rules.js";
import { textW } from "./measure.js";

// Сердечко i в полоске: 1 — целое, 0.5 — половинка, 0 — пустое
export const heartFill = (i, hp) => clamp(hp - i, 0, 1);
// ---------- Общие тексты HUD (компьютер и телефон) ----------
// SPEC-022: подпись злости: «Злость папы»; набранное имя — «<имя> злится» (на всех уровнях, и у боссов)
export const angerLabel = () => (typedName("big") ? L().angerOf(typedName("big")) : L().anger);
export const timerText = () => { if (G.tutorialGame) return L().tut.practice; const s = Math.floor(G.stats.time); return `${L().lvShort} ${G.level}  ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };   // SPEC-029: в тренировке — «Тренировка»
// кружок команды: секунды до «домой» у упавшего, «z» у отдыхающего, иначе метка игрока или бота
export const chipText = l => l.state === "down" ? (G.tutorialGame ? "!" : String(Math.ceil(l.downTimer))) : l.state === "home" || l.state === "rest" ? "z" : l.kind === "player" ? chipName(l) : L().botChip;
// SPEC-036: кружок упавшего, которому помогают (таймер стоит): зелёный с тёмной цифрой; записывается в downDrawn (для тестов)
export const chipFill = l => l.state === "ok" ? l.look.shirt : l.state === "down" && l.helped ? LOOK.HELPED_LOOK.chip : "#9ca3af";
export const chipInk = l => l.state === "down" ? (l.helped ? LOOK.HELPED_LOOK.chipInk : "#fecaca") : "#fff";
export const noteChip = l => { if (l.state === "down") ui.downDrawn.push({ kind: "chip", id: l.id, helped: !!l.helped, color: chipFill(l) }); };
export const restText = l => "💤 " + L().resting(nameOf(l), fmtTime(Math.max(0, l.state === "rest" ? l.restTimer : CFG.REST_TIME)));

export function drawHUD(t) {
  // SPEC-022: злость папы (подпись + облачка-сердечки); полоска не налезает на таймер в центре
  const many = G.big.maxHp > 8, lots = G.big.maxHp > 12, hStep = lots ? 15 : many ? 17 : 21, hSize = lots ? 13 : many ? 15 : 18;   // много облачек — плотнее, чтобы влезла подпись
  const bigName = angerLabel(), hearts = G.big.maxHp * hStep, timerX = UW / 2 - 95;
  ctx.font = `900 15px system-ui, "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;
  const nameW = Math.min(textW(bigName), timerX - 10 - 8 - 8 - 18 - hearts - 6);
  const hx = 18 + nameW + 18, hpW = hx + hearts - 10 - (hStep - hSize / 2) + 9;
  rr(10, 8, hpW, 34, 14); fillStroke("rgba(255,255,255,.8)", 3);
  labelFit(bigName, 18, 25, 15, nameW, "#9b2c3a", "left");
  ui.hudRects.push({ id: "hearts", x: 10, y: 8, w: hpW, h: 34, label: lastFit.text, labelX: 18, labelW: lastFit.w });   // SPEC-022: + подпись злости
  for (let i = 0; i < G.big.maxHp; i++) hpHeart(hx + i * hStep, 25 - hSize / 2 - 1, hSize, heartFill(i, G.big.hp), hStep);

  const chipW = 32, totalW = G.littles.length * chipW + 14, x0 = UW - totalW - 10;
  rr(x0, 8, totalW, 34, 14); fillStroke("rgba(255,255,255,.8)", 3);
  G.littles.forEach((l, i) => {
    const cx = x0 + 7 + i * chipW + chipW / 2, cy = 25;
    ctx.globalAlpha = l.state === "home" || l.state === "rest" ? 0.45 : 1;
    circle(cx, cy, 11); fillStroke(chipFill(l), 2.5); noteChip(l);
    ctx.globalAlpha = 1;
    const down = l.state === "down", zz = l.state === "home" || l.state === "rest";
    label(chipText(l), cx, cy, down ? 11 : zz ? 12 : l.kind === "player" && G.players === 1 ? 8 : 10, chipInk(l));
  });

  const gls = [0, 1].filter(pi => pi < G.players).map(pi => gloveOf(pi)).filter(Boolean);
  const inv = gameInv(), kinds = [...new Set(gls)], showKiss = !isTouch && inv.kisses > 0, showKit = !isTouch && inv.kits > 0;
  if (kinds.length || showKiss || showKit) {               // сколько сильных обнимашек, поцелуев и спасалок осталось
    const n = kinds.length + (showKiss ? 1 : 0) + (showKit ? 1 : 0);
    rr(10, 48, 20 + n * 70, 34, 14); fillStroke("rgba(255,255,255,.8)", 3);
    kinds.forEach((k, i) => { drawArtFit(ITEM_ART[k], 30 + i * 70, 65, 32) || drawMitten(30 + i * 70, 65, 26, k); label("×" + progress.inv[k], 58 + i * 70, 65, 16, OUT); });
    if (showKiss) { const i = kinds.length; drawArtFit("item_kiss", 30 + i * 70, 65, 34) || drawKiss(30 + i * 70, 67, 26); label("×" + inv.kisses, 58 + i * 70, 65, 16, OUT); }
    if (showKit) { const i = kinds.length + (showKiss ? 1 : 0); drawArtFit("icon_bandaid", 30 + i * 70, 65, 32) || drawKit(30 + i * 70, 65, 30); label("×" + inv.kits, 58 + i * 70, 65, 16, OUT); }
  }
  // кнопка игрока: 💋, а пока он лежит, хромает домой или отдыхает и спасалки есть — 🩹 на том же месте (SPEC-007)
  if (isTouch && mode === "play") for (let pi = 0; pi < G.players; pi++) {
    if (canKitNow(G.littles[pi])) kitButton(pi, t); else if (gameInv().kisses > 0) kissButton(pi);
    tiptoeButton(pi, t);                                   // SPEC-032 AC 1: 👣 рядом
  }
  rr(UW / 2 - 95, 8, 110, 34, 14); fillStroke("rgba(255,255,255,.8)", 3);
  label(timerText(), UW / 2 - 40, 25, 14, OUT);
  iconButton("round_pause", UW / 2 + 22, 8, 40, 34, "II", "#64748b", () => { setMode("pause"); }, 16);
  if (fullscreenShown()) iconButton("ui_fullscreen", UW / 2 + 68, 8, 40, 34, "⛶", "#64748b", toggleFullscreen, 18).onUp = true;   // на iPhone нет Fullscreen API; SPEC-025 AC 7c: на отпускании (жест)
  // SPEC-029: в тренировке — маленькая «Пропустить» справа от кнопок (обучение целиком; то же есть в паузе)
  if (G.tutorialGame && mode === "play") fitButton(UW / 2 + (fullscreenShown() ? 114 : 68), 8, CFG.TUTORIAL_LOOK.skipW, 34, "⏭ " + L().sceneSkip, LOOK.MENU_LOOK.back, tutorialSkip, 16, 11).id = "tutorial:skip";

  drawSticks();
  if (isTouch && G.stats.time < 5) {
    label(G.players === 2 ? L().touch2 : L().touch1, UW / 2, UH - 26, 18, "#fff");
  }
  const resting = G.littles.filter(l => l.kind === "player" && (l.state === "home" || l.state === "rest"));
  resting.forEach((l, i) => {
    rr(UW / 2 - 230, UH - 58 - i * 44, 460, 38, 14); fillStroke("rgba(30,41,59,.75)", 3);
    fitText(restText(l), UW / 2, UH - 39 - i * 44, 17, 440, "center", "#e0e7ff", 800);
  });
  if (kitHintOn()) drawKitHint(UW / 2 - 230, UH - 58 - resting.length * 44, 460, 38, 14, () => {}, 18, 9);   // над плашками «отдыхает»
  // SPEC-019: ещё выше; в первые секунды на сенсорном экране — и над подписью «води пальцем»
  if (heardHintOn()) drawHeardHint(UW / 2 - 300, UH - 20 - (resting.length + (kitHintOn() ? 1 : 0)) * 44 - (isTouch && G.stats.time < 5 ? 30 : 0), 600, 18, 12, 12);
  if (tutorialHintOn()) ui.tutorialHintRect = hintPlate("tutorialHint", tutorialHintText(), UW / 2 - 300, UH - 20 - (isTouch && G.stats.time < 5 ? 30 : 0), 600, 18, 12, 12);   // SPEC-029
}

// Подсказка «Нажми 🩹» (SPEC-007): видна KIT_HINT_TIME сек, пока упавший игрок может встать спасалкой.
// Без сенсорного экрана — ещё и клавиша этого игрока: Q (игрок 2 вдвоём — Shift справа)
export const kitHintOn = () => mode === "play" && ui.kitHintT > 0 && canKitNow(G.littles[ui.kitHintPi]);
const kitHintText = () => L().kitHint + (PHONE || isTouch ? "" : ` (${G.players === 2 && ui.kitHintPi === 1 ? L().kitKey2 : L().kitKey1})`);
export function drawKitHint(x, y, w, h, r, note, size, min) {
  const text = kitHintText();
  rr(x, y, w, h, r); fillStroke("rgba(255,250,235,.95)", 3);
  ui.hudRects.push({ id: "kitHint", x, y, w, h });
  note(fitText(text, x + w / 2, y + h / 2 + 1, size, w - 2 * r, "center", "#be185d", 900, min));
  ui.kitHintRect = { x, y, w, h, text };
}

// Подсказка «Папа услышал топот!» (SPEC-019): видна HEAR_HINT_TIME сек после первого за уровень поворота на топот игрока.
// Без сенсорного экрана — клавиша этого игрока (левый Shift; вдвоём у игрока 2 — «/»), иначе — про джойстик
export const heardHintOn = () => mode === "play" && ui.heardHintT > 0;
const heardKey = () => G.players === 2 && ui.heardHintPi === 1 ? L().heardKey2 : L().heardKey1;
export const heardHintText = () => PHONE || isTouch ? L().heardHintTouch(L().tiptoeTap) : L().heardHint(heardKey());
// плашка нижним краем на bottom, до двух строк (мерка с LOOK.TEXT_TEST_SCALE, не мельче min); → кегль
export function drawHeardHint(x, bottom, w, size, min, pad) {
  ui.heardHintRect = hintPlate("heardHint", heardHintText(), x, bottom, w, size, min, pad);
  return ui.heardHintRect.size;
}
// плашка подсказки (SPEC-019; SPEC-029: и подсказки тренировки): нижним краем на bottom, до двух строк; → { x, y, w, h, text, rows, size }
export function hintPlate(id, text, x, bottom, w, size, min, pad) {
  const b = noteRows(text, size, min, w - 2 * pad, 2), lh = b.sz * 1.2, h = b.rows.length * lh + pad, y = bottom - h;
  rr(x, y, w, h, Math.min(pad * 1.4, h / 2)); fillStroke("rgba(255,250,235,.95)", 3);
  ctx.font = `800 ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#7c3aed";
  b.rows.forEach((q, i) => fillT(q, x + w / 2, y + pad / 2 + lh * (i + 0.5)));
  ui.hudRects.push({ id, x, y, w, h });
  return { x, y, w, h, text, rows: b.rows, size: b.sz };
}

// Круглая кнопка 💋 игрока pi: внизу справа (один игрок) или на своей стороне (двое); касание здесь — не джойстик
export function kissBtnRect(pi) {
  if (PHONE) { const d = cpx(LOOK.PHONE_KISS_BTN), m = cpx(12); return { x: UW - m - d, y: UH - m - d, w: d, h: d }; }   // телефон: один игрок
  const d = LOOK.KISS_BTN, m = 14, left = G.players === 2 && pi === 0;
  return { x: left ? m : UW - m - d, y: UH - m - d, w: d, h: d };
}
export function kissButton(pi) {
  const l = G.littles[pi];
  if (!l) return;
  const rc = kissBtnRect(pi), r = rc.w / 2, cx = rc.x + r, cy = rc.y + r;
  const ready = canAct(l) && !inSafe(l) && l.kissCd <= 0;   // серая: перезарядка, в домике или не может действовать
  ctx.save(); ctx.globalAlpha = ready ? 0.95 : 0.55;
  if (drawArtFit("phone_kiss", cx, cy, rc.w * LOOK.PAPER.hudIcon)) {                 // SPEC-020: кнопка 25_phone_controls
    if (G.players === 2) { circle(cx, cy, r); ctx.lineWidth = 4; ctx.strokeStyle = P_COLORS[pi]; ctx.stroke(); }
  } else {
    ctx.fillStyle = "rgba(0,0,0,.3)"; circle(cx + 2, cy + 4, r); ctx.fill();
    circle(cx, cy, r); fillStroke(ready ? "#ffd1e3" : "#cbd5e1", 4, G.players === 2 ? P_COLORS[pi] : OUT);
    drawKiss(cx, cy + 4, r * 1.15);
  }
  if (l.kissCd > 0) {                                      // перезарядка — дуга
    ctx.lineWidth = 5; ctx.strokeStyle = "#ff4d8d"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy, r - 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - l.kissCd / CFG.KISS_COOLDOWN)); ctx.stroke(); ctx.lineCap = "butt";
  }
  ctx.restore();
  const br = PHONE ? cpx(15) : 13;
  circle(cx + r * 0.72, cy - r * 0.72, br); fillStroke("#ff4d8d", 2.5);
  label(String(gameInv().kisses), cx + r * 0.72, cy - r * 0.72 + 1, fz(13, "hint"), "#fff");
  ui.buttons.push({ ...rc, act: () => pressKiss(pi), id: "kiss:" + pi });
}
// Круглая кнопка 🩹 игрока pi — на месте 💋 (поцелуй лёжа всё равно не бросить); мигает кольцом, сверху — сколько спасалок
export function kitButton(pi, t) {
  const rc = kissBtnRect(pi), r = rc.w / 2, cx = rc.x + r, cy = rc.y + r, pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
  ctx.save(); ctx.globalAlpha = 0.95;
  const pic = drawArtFit("phone_kit", cx, cy, rc.w * LOOK.PAPER.hudIcon);              // SPEC-020: кнопка 25_phone_controls
  if (!pic) { ctx.fillStyle = "rgba(0,0,0,.3)"; circle(cx + 2, cy + 4, r); ctx.fill(); circle(cx, cy, r); fillStroke("#dcfce7", 4, G.players === 2 ? P_COLORS[pi] : OUT); }
  else if (G.players === 2) { circle(cx, cy, r); ctx.lineWidth = 4; ctx.strokeStyle = P_COLORS[pi]; ctx.stroke(); }
  ctx.globalAlpha = 0.35 + 0.5 * pulse; circle(cx, cy, r - 6); ctx.lineWidth = 4; ctx.strokeStyle = "#22c55e"; ctx.stroke();
  ctx.globalAlpha = 1; if (!pic) drawKit(cx, cy, r * 1.3);
  ctx.restore();
  const br = PHONE ? cpx(15) : 13;
  circle(cx + r * 0.72, cy - r * 0.72, br); fillStroke("#16a34a", 2.5);
  label(String(gameInv().kits), cx + r * 0.72, cy - r * 0.72 + 1, fz(13, "hint"), "#fff");
  ui.buttons.push({ ...rc, act: () => pressKit(pi), id: "kit:" + pi });
}
// SPEC-032 AC 1: круглая кнопка 👣 игрока pi рядом с 💋 / 🩹 (касания): переключатель «на цыпочках» (придумал Claude: детям проще, чем
// держать, пока рулишь). Место — со стороны середины экрана от 💋, по той же нижней линии; есть, даже когда 💋 нет
export function tiptoeBtnRect(pi) {
  const T = LOOK.TIPTOE_BTN, k = kissBtnRect(pi), d = PHONE ? cpx(T.phone) : T.desk, gap = k.w * T.gap, right = !PHONE && G.players === 2 && pi === 0;
  return { x: right ? k.x + k.w + gap : k.x - gap - d, y: k.y + k.h - d, w: d, h: d };
}
export function toggleTiptoe(pi) { ui.tiptoe[pi] = !ui.tiptoe[pi]; }
export function tiptoeButton(pi, t) {
  const T = LOOK.TIPTOE_BTN, rc = tiptoeBtnRect(pi), r = rc.w / 2, cx = rc.x + r, cy = rc.y + r, on = !!ui.tiptoe[pi];
  ctx.save(); ctx.globalAlpha = on ? 1 : 0.9;
  if (on) {                                               // включена — светится (мягко пульсирует)
    ctx.globalAlpha = T.pulseMin + T.pulseAmp * (0.5 + 0.5 * Math.sin(t * T.pulseSpeed));
    circle(cx, cy, r + rc.w * T.glowW * T.glowOut); ctx.fillStyle = T.glow; ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (!drawArtFit("phone_stick_base", cx, cy, rc.w * LOOK.PAPER.hudIcon)) { circle(cx, cy, r); fillStroke(on ? "#fef9c3" : "#f8fafc", 4, G.players === 2 ? P_COLORS[pi] : OUT); }
  else if (G.players === 2) { circle(cx, cy, r); ctx.lineWidth = 4; ctx.strokeStyle = P_COLORS[pi]; ctx.stroke(); }
  if (!drawArtFit("ui_tiptoe", cx, cy, rc.w * T.icon)) {
    ctx.font = `${rc.w * T.icon * T.emoji}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("👣", cx, cy);                          // нет картинки — эмодзи (запасной вид)
  }
  if (on) { circle(cx, cy, r - rc.w * T.glowW / 2); ctx.lineWidth = rc.w * T.glowW; ctx.strokeStyle = T.glow; ctx.stroke(); }
  ctx.restore();
  ui.buttons.push({ ...rc, act: () => toggleTiptoe(pi), id: "tiptoe:" + pi, text: "👣", on });
}

// прямоугольник героя на экране (UI px): от ног до имени над головой (playerNameTag, как в drawMarkers), шириной с тело или имя
function heroScreenRect(l) {
  const P = LOOK.PHONE_BANNER, tag = playerNameTag(l), head = tag.hd, feet = toScreen(l.x, l.y);
  const side = P.heroSide * Math.max(Math.abs(toScreen(l.x + l.r, l.y).x - feet.x), Math.abs(toScreen(l.x + l.r, l.y, nameTagH()).x - head.x));
  ctx.font = hudFont(tag.size);
  const nw = textW(nameOf(l)) + tag.stroke;   // с обводкой
  const x0 = Math.min(feet.x - side, tag.x - nw / 2), x1 = Math.max(feet.x + side, tag.x + nw / 2);
  const y0 = tag.y - tag.size * P.heroText, y1 = feet.y + side * P.heroFeet;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// место надписи уровня на телефоне (SPEC-006 AC 13): в той половине экрана, где нет героя — сверху под верхней полосой
// или снизу над подсказкой; по центру самого широкого свободного места, в стороне (PHONE_BTN_GAP) от мини-карты,
// табличек HUD, кнопок и героя. Ищем от края к середине экрана; на каждой высоте сначала полный текст, потом короткий;
// нигде не влезли — ещё раз с самым коротким (SPEC-016, без имени мира). Нигде не влезло — null: надпись не показываем.
function placePhoneBanner() {
  const P = LOOK.PHONE_BANNER, m = cpx(8), gap = cpx(LOOK.PHONE_BTN_GAP), h = cpx(P.h), step = cpx(P.scan), mid = UH / 2;
  const hero = camHero(), hr = hero && heroScreenRect(hero);
  const blocks = [minimapRect(), ...ui.buttons, ...ui.hudRects];
  if (hr) blocks.push(hr);
  ctx.font = `900 ${minPx("title")}px system-ui, "Segoe UI", sans-serif`;
  const measure = (text, variant) => ({ text, variant, w: textW(text) * LOOK.TEXT_TEST_SCALE + 2 * cpx(P.pad) });
  const tiers = [[measure(ui.banner.text, "full"), measure(ui.banner.short, "short")], [measure(ui.banner.tiny, "tiny")]];
  // самый широкий свободный отрезок по x для плашки на высоте y
  const span = y => {
    let segs = [[m, UW - m]];
    for (const b of blocks) {
      if (b.y >= y + h + gap || b.y + b.h <= y - gap) continue;
      const a = b.x - gap, c = b.x + b.w + gap;
      segs = segs.flatMap(([s0, e0]) => [[s0, Math.min(e0, a)], [Math.max(s0, c), e0]]).filter(([s0, e0]) => e0 > s0);
    }
    return segs.reduce((best, sg) => sg[1] - sg[0] > best[1] - best[0] ? sg : best, [0, 0]);
  };
  // низ: над подсказкой «проведи пальцем» и плашками «отдыхает» (они по всей ширине слева от кнопок)
  const low = ui.hudRects.filter(r => r.id === "hint" || r.id === "rest" || r.id === "kitHint" || r.id === "heardHint").reduce((v, r) => Math.min(v, r.y - gap), UH - m);
  const bands = [{ from: phoneTopBar() + gap, to: mid - h, dir: 1 }, { from: low - h, to: mid, dir: -1 }];
  if (hr && hr.y + hr.h / 2 < mid) bands.reverse();          // герой в верхней половине — сначала низ
  for (const texts of tiers) for (const bd of bands) {
    for (let y = bd.from; (y - bd.to) * bd.dir <= 0; y += step * bd.dir) {
      const [s0, e0] = span(y);
      for (const t of texts) if (t.w <= e0 - s0) return { x: (s0 + e0 - t.w) / 2, y, w: t.w, h, text: t.text, variant: t.variant };
    }
  }
  return null;
}
// «Уровень N: тип» — плашка под верхней панелью, плавно появляется и исчезает, кнопок не добавляет
export function drawBanner() {
  const a = bannerAlpha();
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  if (PHONE) {
    // телефон (SPEC-006 AC 13): место выбирается один раз, при первом показе (не прыгает, пока герой бегает)
    const P = LOOK.PHONE_BANNER, key = `${UW}x${UH}x${CSS_W}`;
    if (!ui.banner.place || ui.banner.place.key !== key) ui.banner.place = { key, spot: placePhoneBanner() };
    if (!ui.banner.place.spot) { ctx.restore(); return; }       // нигде не влезло — не показываем
    const { x, y, w, h, text, variant } = ui.banner.place.spot, size = minPx("title");
    rr(x, y, w, h, cpx(P.radius)); fillStroke("rgba(255,250,235,.93)", 3);
    const sz = fitText(text, x + w / 2, y + h / 2 + 1, size, (w - 2 * cpx(P.edge)) / LOOK.TEXT_TEST_SCALE, "center", "#ff6fa8", 900, size, true);
    noteText("title", sz);
    ui.bannerRect = { x, y, w, h, text, size: sz, short: text !== ui.banner.text, variant };   // variant: full | short | tiny
    ctx.restore(); return;
  }
  ctx.font = `900 34px system-ui, "Segoe UI", sans-serif`;
  const w = Math.min(640, textW(ui.banner.text)) + 60;
  rr(UW / 2 - w / 2, 96, w, 62, 26); fillStroke("rgba(255,250,235,.93)", 4);
  fitText(ui.banner.text, UW / 2, 128, 34, 640, "center", "#ff6fa8", 900);
  ctx.restore();
}
