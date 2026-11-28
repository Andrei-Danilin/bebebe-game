// SPEC-011: 2D drawing helpers: shapes, art on the canvas (drawArt*, artUse), buttons (addButton, iconButton), hearts,
// coins, kisses, the rescue kit, name tags, tap lines, the Big One's mood, markers, particles and texts, touch sticks.
// Client module (moved out of index.html in Phase C).

import { BOSSES, CELL, CFG, GLOVES, TAU } from "../../core/config.js";
import { audible, bigListens, bigMark, SLIP_MARKS } from "../../core/hearing.js";
import { inBush } from "../../core/vision.js";
import { L } from "../../i18n.js";
import { art, FX_ART, HEART_ART, PAPER_BTN, POP_ART } from "../art.js";
import { activeSticks, stickR } from "../devices.js";
import { KID_HEAD_R, LOOK } from "../look.js";
import { nameFor, nameOf } from "../names.js";
import { P_COLORS } from "../outfits.js";
import { ctx, OUT, PHONE } from "../screen.js";
import { mode, ui } from "../state.js";
import { toScreen, toScreenTo } from "../three/camera.js";
import { bossScale, modelOf } from "../three/characters.js";
import { BIG_SCALE, LITTLE_SCALE } from "../three/setup.js";
import { moodOf } from "../three/sync.js";
import { drawArt, drawArt9, drawArtFit, fillT } from "./artdraw.js";
import { circleOn, ellipseOn, fillStrokeOn, rrOn } from "./canvas.js";
import { paperUI } from "./paper.js";
import { fitText, fmtTime, fz, label, labelStroke, noteText } from "./text.js";
import { cpx, deskTeamRect, hudFont, minimapRect, minPx, showMinimap, teamRect } from "./layout.js";
import { G } from "../../core/active.js";
import { textW } from "./measure.js";

// =====================================================================
//  2D-СЛОЙ: меню, HUD, подписи (поверх 3D)
// =====================================================================
// the screen's own context (SPEC-039: the helpers themselves are in canvas.js and take the context)
export const rr = (x, y, w, h, r) => rrOn(ctx, x, y, w, h, r);
export const circle = (x, y, r) => circleOn(ctx, x, y, r);
const ellipse = (x, y, rx, ry) => ellipseOn(ctx, x, y, rx, ry);
export const fillStroke = (fill, lw = 3, stroke = OUT) => fillStrokeOn(ctx, fill, lw, stroke);
// кнопка без рисунка кодом (картинку нарисовал вызывающий): только в список кнопок кадра
export function regButton(x, y, w, h, text, act, id, textW) {
  const b = { x, y, w, h, act, text, textW, id };
  ui.buttons.push(b);
  return b;
}
// SPEC-020, в игре: сердечко Большого — облачко (HEART_ART); f как у heartFill
export function hpHeart(x, y, s, f, step) {
  if (drawArtFit(HEART_ART[f >= 1 ? 2 : f > 0 ? 1 : 0], x, y + s / 2, Math.max(s, step) * LOOK.PAPER.heart)) return;
  drawHpHeart(x, y, s, f);
}
// кнопка-значок HUD (пауза, во весь экран): картинка в прямоугольник кнопки или обычная кнопка
export function iconButton(name, x, y, w, h, text, color, act, size) {
  if (drawArtFit(name, x + w / 2, y + h / 2, Math.min(w, h) * LOOK.PAPER.hudIcon)) return regButton(x, y, w, h, text, act, undefined, Math.min(w, h));
  return addButton(x, y, w, h, text, color, act, size);
}
// звезда картинкой (золотая / пустая) или кодом; монетка картинкой (на бумажных экранах) или кодом
export const drawStarArt = (x, y, r, filled) => drawArtFit(filled ? "star_gold" : "star_empty", x, y, r * 2.4) || drawStar(x, y, r, filled);
export const coinIcon = (x, y, r) => (paperUI() && drawArtFit("item_coin", x, y, r * 2.6)) || drawCoin(x, y, r);

export function heartPath(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
}
export function drawCoin(x, y, r) {
  circle(x, y, r); fillStroke("#facc15", Math.max(1.5, r / 5));
  circle(x, y, r * 0.62); ctx.lineWidth = Math.max(1, r / 7); ctx.strokeStyle = "#ca8a04"; ctx.stroke();
  ctx.fillStyle = "#fff7c2"; circle(x - r * 0.35, y - r * 0.35, r * 0.2); ctx.fill();
}
export function drawStar(x, y, r, filled) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); fillStroke(filled ? "#facc15" : "rgba(255,255,255,.35)", Math.max(2, r / 7));
}
export function drawMitten(x, y, s, kind) {
  const g = GLOVES[kind];
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  rr(-14, -18, 28, 34, 13); fillStroke(g.color, 3);                       // ладошка
  ctx.save(); ctx.translate(-14, -2); ctx.rotate(-0.6); rr(-6, -10, 12, 18, 6); fillStroke(g.color, 3); ctx.restore();   // большой палец
  rr(-15, 12, 30, 10, 4); fillStroke(g.cuff, 3);                          // манжета
  if (kind === "mega") { heartPath(0, -10, 14); ctx.fillStyle = "#fff"; ctx.fill(); }
  else { ctx.fillStyle = "rgba(255,255,255,.8)"; for (const [dx, dy] of [[-5, -6], [5, -2], [-2, 5]]) { circle(dx, dy, 2); ctx.fill(); } }
  ctx.restore();
}
export function drawHeart(x, y, s, fill, outline = true) { heartPath(x, y, s); ctx.fillStyle = fill; ctx.fill(); if (outline) { ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); } }
// Сердечко в полоске Большого: f = 1 целое, 0.5 половинка, 0 пустое
function drawHpHeart(x, y, s, f) {
  if (f <= 0 || f >= 1) { drawHeart(x, y, s, f >= 1 ? "#ff3b5c" : "#e5e7eb"); return; }
  heartPath(x, y, s); ctx.fillStyle = "#e5e7eb"; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(x - s, y - 2, s, s + 4); ctx.clip();
  heartPath(x, y, s); ctx.fillStyle = "#ff3b5c"; ctx.fill();
  ctx.restore();
  heartPath(x, y, s); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
}
// Воздушный поцелуй: розовые губки и сердечко (картинка в магазине и на кнопке)
export function drawKiss(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  ctx.beginPath();                                                        // губки
  ctx.moveTo(-17, 4);
  ctx.bezierCurveTo(-11, -9, -4, -9, 0, -4); ctx.bezierCurveTo(4, -9, 11, -9, 17, 4);
  ctx.bezierCurveTo(10, 15, -10, 15, -17, 4); ctx.closePath();
  fillStroke("#ff4d8d", 3);
  ctx.beginPath(); ctx.moveTo(-15, 4); ctx.quadraticCurveTo(0, 8, 15, 4); ctx.lineWidth = 2.5; ctx.strokeStyle = "#b8104f"; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.7)"; ellipse(-6, -3, 3.5, 1.8); ctx.fill();
  heartPath(14, -20, 13); fillStroke("#ff8fb8", 2.5);                    // летящее сердечко
  ctx.restore();
}
// Спасалка 🩹: пластырь наискосок с подушечкой и сердечком (картинка в магазине, на кнопке и в HUD)
export function drawKit(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  ctx.save(); ctx.rotate(-0.6);
  rr(-21, -8.5, 42, 17, 8.5); fillStroke("#f6c39b", 3);                  // пластырь
  rr(-8, -7, 16, 14, 3); ctx.fillStyle = "#fff4ea"; ctx.fill();          // подушечка
  ctx.fillStyle = "rgba(160,95,60,.45)";                                  // дырочки на концах
  for (const dx of [-16, -12, 12, 16]) for (const dy of [-3, 3]) { circle(dx, dy, 1.2); ctx.fill(); }
  ctx.restore();
  heartPath(0, -5, 10); fillStroke("#ff4d8d", 1.5);                       // сердечко
  ctx.restore();
}

// Подписи над 3D-героями (имена, таймеры, SOS, значки Большого)
// имя игрока над головой: hd — точка над ногами (над ней же имена ботов), x/y — где имя, кегль и обводка;
// рисует drawMarkers, обходит надпись уровня на телефоне (heroScreenRect) — один источник
// SPEC-021: высота точки имени над ногами (px мира) — верх головы с шапкой: голова больше (LOOK.KID_LOOK), имя выше
export const nameTagH = () => (LOOK.KID_LOOK.headY + (KID_HEAD_R + LOOK.KID_LOOK.tagTop) * LOOK.KID_LOOK.head) * LITTLE_SCALE * CELL;
export function playerNameTag(l) {
  const T = LOOK.NAME_TAG, hd = toScreen(l.x, l.y, nameTagH()), size = PHONE ? Math.max(T.size, minPx("main")) : T.size;
  return { hd, x: hd.x, y: hd.y - T.up, size, stroke: labelStroke(size) };
}
// SPEC-019: «топ-топ» — короткие штрихи у ног того, кого Большой сейчас слышит (бежит рядом, вне взгляда); tapLines — чьи (тесты)
export let tapLines = [];
function drawTapLines() {
  tapLines = [];
  if (mode !== "play" || !bigListens()) return;   // SPEC-012: in pause and on other screens he hears nothing (the client steps no game)
  const T = LOOK.TIPTOE_LOOK, len = PHONE ? cpx(T.tap) : T.tap;
  for (const l of G.littles) {
    if (!audible(l)) continue;
    tapLines.push(l.id);
    if (Math.abs(Math.sin(l.walk)) < T.tapShow) continue;   // мигают в такт шагам
    const f = toScreen(l.x, l.y, 0);
    const lw = PHONE ? cpx(3) : 3;
    ctx.save(); ctx.lineCap = "round";
    for (const [color, w] of /** @type {[string, number][]} */ ([["rgba(30,41,59,.6)", lw + 2.5], ["#fff", lw]])) {   // белые косые чёрточки с тёмным краем — слева и справа от ног
      ctx.strokeStyle = color; ctx.lineWidth = w;
      for (const side of [-1, 1]) for (let i = 0; i < T.taps; i++) {
        const y = f.y - i * len * 0.8;
        ctx.beginPath(); ctx.moveTo(f.x + side * len, y); ctx.lineTo(f.x + side * len * 2, y - len * 0.6); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
const moodNow = { mood: "", face: "", sprites: [], cloud: 0 };   // один объект на все кадры (moodInfo указывает на него, когда что-то нарисовано)
const STEAM_BOTH = [-1, 1], STEAM_L = [-1], STEAM_R = [1];
const MOOD_PUFFS = [[-0.22, 0.05, 0.22], [0, -0.08, 0.28], [0.24, 0.04, 0.2]];
function moodSprite(name, x, y, s, alpha = 1) {
  ctx.globalAlpha = alpha;
  if (!drawArtFit(name, x, y, s)) {
    if (name === "fx_hearts") { drawHeart(x - s * 0.18, y, s * 0.22, "#ff6fa8"); drawHeart(x + s * 0.2, y - s * 0.15, s * 0.16, "#ff9ecb"); }
    else { ctx.fillStyle = name === "fx_storm_cloud" ? "#3f3f46" : "#d4d4d8"; for (const [dx, dy, r] of MOOD_PUFFS) { circle(x + dx * s, y + dy * s, r * s); ctx.fill(); } }
  }
  ctx.globalAlpha = 1;
  moodNow.sprites.push(name);
}
export function drawMood(t) {
  const m = modelOf(G.big);
  ui.moodInfo = null;
  if (!m || !m.anchors) return;
  const ML = LOOK.MOOD_LOOK, mood = m.mood || moodOf(G.big);
  ui.moodInfo = moodNow; moodNow.mood = mood; moodNow.face = m.faceHex || ""; moodNow.sprites.length = 0; moodNow.cloud = 0;
  if (G.big.slip > 0) return;
  const h = m.topH * BIG_SCALE * bossScale(G.big) * CELL;    // точка над головой (m.anchors.top) по логике, без чтения сцены 3D
  toScreenTo(fxA, G.big.x, G.big.y, h);
  toScreenTo(fxB, G.big.x + CELL, G.big.y, h);
  const c = Math.hypot(fxB.x - fxA.x, fxB.y - fxA.y), x = fxA.x, y = fxA.y, puff = (t * ML.puff) % 1;
  if (mood === "angry" || mood === "mid") {
    const sides = mood === "angry" ? STEAM_BOTH : Math.floor(t * ML.puff) % 2 ? STEAM_R : STEAM_L;
    const k = (mood === "angry" ? 1 : 0.7) * (0.8 + puff * 0.4);
    for (const sd of sides) moodSprite(sd < 0 ? "fx_steam_left" : "fx_steam_right", x + sd * c * (ML.steamX + puff * 0.2), y + c * ML.steamY, c * ML.steam * k, 1 - puff * 0.5);
  }
  if (mood === "angry") {
    moodNow.cloud = ML[G.big.boss && BOSSES[G.big.boss] ? BOSSES[G.big.boss].cloud : "cloud"];
    moodSprite("fx_storm_cloud", x, y - c * ML.cloudY, c * moodNow.cloud);
  }
  if (mood === "kind" || mood === "happy") moodSprite("fx_hearts", x, y - c * (ML.heartsY + Math.sin(t * 3) * ML.bob), c * ML.hearts);
}
export function drawMarkers(t) {
  drawTapLines();
  if (G.safeZone) {
    const s = toScreen(G.safeZone.x + G.safeZone.w / 2, G.safeZone.y + G.safeZone.h - 22, 0);
    ctx.save(); ctx.globalAlpha = 0.75; fitText("🛡 " + L().safe, s.x, s.y, fz(14, "hint"), PHONE ? cpx(200) : 150, "center", "#14532d", 900, PHONE ? minPx("hint") : 9); ctx.restore();
  }
  if (G.big.stun <= 0) {
    const back = G.big.dir + Math.PI, p = toScreen(G.big.x + Math.cos(back) * (G.big.r + 16), G.big.y + Math.sin(back) * (G.big.r + 16), 4);
    drawHeart(p.x, p.y - 7, 14, "#ff6fa8");
  }
  for (const l of G.littles) {
    const isPlayer = l.kind === "player", name = nameOf(l);
    if (l.state === "home" || l.state === "rest") {
      const hd = toScreen(l.x, l.y, nameTagH() - (l.state === "rest" ? LOOK.NAME_TAG.rest : 0));
      if (l.state === "rest") {
        const z = (t * 1.2 + l.id * 0.3) % 1;
        ctx.save(); ctx.globalAlpha = 1 - z; label("z", hd.x + 10 + z * 14, hd.y - 6 - z * 22, fz(12, "hint") + z * 8, "#e0e7ff"); ctx.restore();
        label(fmtTime(Math.max(0, l.restTimer)), hd.x, hd.y + 6, fz(isPlayer ? 14 : 11, "hint"), isPlayer ? P_COLORS[l.id] : "#e5e7eb");
      } else label("🏠 " + name, hd.x, hd.y - 6, fz(isPlayer ? 13 : 10, "hint"), "#e5e7eb");
      continue;
    }
    if (l.state === "ok") {
      const tag = playerNameTag(l), hd = tag.hd;
      ctx.save(); if (inBush(l)) ctx.globalAlpha = 0.4;     // в кустах имя бледное
      if (isPlayer) {
        label(name, tag.x, tag.y, tag.size, P_COLORS[l.id]);
        if (PHONE) noteText("main", tag.size);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(hd.x - 5, hd.y - 1); ctx.lineTo(hd.x + 5, hd.y - 1); ctx.lineTo(hd.x, hd.y + 5); ctx.fill();
      } else label(name, hd.x, hd.y - 4, fz(11, "hint"), "#ffffff");
      ctx.restore();
      const ic = (l.fx.boots > 0 ? "👟" : "") + (l.fx.cloak > 0 ? "👻" : "") + (l.fx.shield > 0 ? "🛡" : "");
      if (l.dangerT > CFG.DANGER_TIME - LOOK.DANGER_WARN) {   // в доме Большого: большой отсчёт 3, 2, 1 (выше значков предметов)
        const n = Math.ceil(CFG.DANGER_TIME - l.dangerT), ph = (CFG.DANGER_TIME - l.dangerT) % 1;
        label(String(n), hd.x, hd.y - (isPlayer ? 46 : 36) - (ic ? 24 : 0), 34 + ph * 12, n <= 1 ? "#ff3b30" : "#fb923c");
      }
      if (ic) { ctx.font = "15px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; fillT(ic, hd.x, hd.y - (isPlayer ? 30 : 20)); }
    } else {
      const c = toScreen(l.x, l.y, 10);
      const H = LOOK.HELPED_LOOK, helped = !!l.helped;           // SPEC-036: помощник рядом — таймер стоит: зелёный круг, свечение
      if (helped) {                                              // ореол вокруг круга таймера: центр прозрачный — ребёнок виден
        const gr = ctx.createRadialGradient(c.x, c.y, H.glowIn, c.x, c.y, H.glowOut);
        gr.addColorStop(0, H.glow[0]); gr.addColorStop(H.glowPeak, H.glow[1]); gr.addColorStop(1, H.glow[2]);
        ctx.save(); ctx.globalAlpha = H.glowA + Math.sin(t * H.glowSpeed) * H.glowPulse; ctx.fillStyle = gr; circle(c.x, c.y, H.glowOut); ctx.fill(); ctx.restore();
      }
      ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,.3)"; circle(c.x, c.y, 24); ctx.stroke();
      const dn = G.tutorialGame ? CFG.DOWN_TIME : l.downTimer;   // SPEC-029: в тренировке лежат без времени — полный круг, без счёта
      const ringColor = helped ? H.ring : dn < 5 && Math.floor(t * 6) % 2 ? "#fff" : "#ef4444";
      ui.downDrawn.push({ kind: "ring", id: l.id, helped, color: ringColor });
      ctx.strokeStyle = ringColor;
      ctx.beginPath(); ctx.arc(c.x, c.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (dn / CFG.DOWN_TIME)); ctx.stroke();
      if (l.rescue > 0) { ctx.strokeStyle = H.ring; ctx.beginPath(); ctx.arc(c.x, c.y, 29, -Math.PI / 2, -Math.PI / 2 + TAU * (l.rescue / (l.rescueNeed || CFG.RESCUE_TIME))); ctx.stroke(); }
      ctx.lineCap = "butt";
      if (!G.tutorialGame) label(String(Math.ceil(l.downTimer)), c.x + 30, c.y - 22, fz(15, "main"), helped ? H.num : "#fecaca");
      const pulse = 1 + Math.sin(t * 8) * 0.1;   // телефон: пульсирует вверх от минимального размера
      label(isPlayer ? L().help(name) : "SOS", c.x, c.y - 40, PHONE ? fz(12, "main") * (pulse + 0.1) : 12 * pulse, "#fde047");
    }
  }
  const bh = toScreen(G.big.x, G.big.y, 134);
  ui.bigTag = null;
  if (G.big.slip <= 0) {                                    // имя Большого над головой — выше значков «!», «?!», «💦» (они на bh.y − 18…+14)
    ctx.save(); if (inBush(G.big)) ctx.globalAlpha = 0.4;
    // SPEC-048 AC 8: over the team's chips (or the mini-map) the name goes below his feet instead (his marks stay above)
    const nm = nameFor("big"), sz = fz(14, "main");
    ctx.font = hudFont(sz);
    const w = textW(nm) + 2 * labelStroke(sz), h = sz * LOOK.NAME_TAG.box;
    const blocks = PHONE ? (showMinimap() ? [minimapRect(), teamRect()] : []) : [deskTeamRect()];
    const hits = (x, y) => blocks.find(b => x - w / 2 < b.x + b.w && b.x < x + w / 2 && y - h / 2 < b.y + b.h && b.y < y + h / 2);
    const feet = toScreen(G.big.x, G.big.y, 0), above = { x: bh.x, y: bh.y - 34 }, beneath = { x: feet.x, y: feet.y + sz * LOOK.NAME_TAG.below };
    let at = above, under = false;
    if (hits(above.x, above.y)) {
      if (!hits(beneath.x, beneath.y)) { at = beneath; under = true; }
      else { const b = hits(above.x, above.y); at = { x: Math.min(above.x, b.x - 4 - w / 2), y: above.y }; }   // both are on them: beside them, left
    }
    label(nm, at.x, at.y, sz, "#ff4d4d");
    ui.bigTag = { x: at.x - w / 2, y: at.y - h / 2, w, h, below: under };
    ctx.restore();
  }
  const mark = bigMark();
  if (SLIP_MARKS.includes(mark)) label(mark, bh.x + 10, bh.y + 30, 20, "#fff");   // SPEC-043: the banana's mark and the ones of the other things that lay him down
  else if (mark === "✈" || mark === "🧁") label(mark, bh.x + 24, bh.y + 2, fz(26, "main"), "#fff");   // SPEC-043: watching the plane, walking to a cupcake
  else if (mark === "?!") label(mark, bh.x + 22, bh.y, 22, "#fff");
  else if (mark === "💗") label(mark, bh.x + 22, bh.y + 2, 20 + Math.sin(t * 10) * 2, "#fff");
  else if (mark === "❓" || mark === "👂") label(mark, bh.x + 24, bh.y + 2, fz(mark === "❓" ? 30 : 26, "main"), "#fff");   // SPEC-019: топот
  else if (mark === "💦") label(mark, bh.x + 22, bh.y + 6, 16, "#fff");
  else if (mark === "!") label(mark, bh.x, bh.y - 4, 28, "#ff3b30");
}

// SPEC-020: частицы — картинки 24_effects / v1/staff (сердечко, искорка, пыль), размер — доля клетки на экране (камера);
// всплывающие надписи с burst (BONK, обнимашка, поцелуй, «выгнали») — на нарисованном взрыве. Точки экрана — в переиспользуемых объектах
const FX_SIZE = { heart: "fxHeart", star: "fxStar", dust: "fxDust" };
const fxA = { x: 0, y: 0 }, fxB = { x: 0, y: 0 };
export function drawFx() {
  const P = LOOK.PAPER;
  for (const w of ui.waves) {                             // SPEC-022: кольцо широкого толчка — на земле, расходится и гаснет
    const k = w.t / CFG.WAVE_TIME, rr0 = w.r * (0.35 + 0.65 * k);
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) { toScreenTo(fxA, w.x + Math.cos(i / 32 * TAU) * rr0, w.y + Math.sin(i / 32 * TAU) * rr0, 2); if (i) ctx.lineTo(fxA.x, fxA.y); else ctx.moveTo(fxA.x, fxA.y); }
    ctx.globalAlpha = 1 - k; ctx.lineWidth = PHONE ? cpx(6) : 6; ctx.strokeStyle = "#fde047"; ctx.stroke();
    ctx.lineWidth = PHONE ? cpx(2) : 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  let cell = 0;
  if (ui.particles.length) { toScreenTo(fxA, G.big.x, G.big.y, 20); toScreenTo(fxB, G.big.x + CELL, G.big.y, 20); cell = Math.hypot(fxB.x - fxA.x, fxB.y - fxA.y); }
  for (const p of ui.particles) {
    toScreenTo(fxA, p.x, p.y, 20);
    ctx.globalAlpha = 1 - p.t / p.life;
    if (drawArtFit(FX_ART[p.kind], fxA.x, fxA.y, cell * P[FX_SIZE[p.kind]])) continue;
    if (p.kind === "heart") drawHeart(fxA.x, fxA.y, 12, p.color, false);
    else { ctx.fillStyle = p.color; circle(fxA.x, fxA.y, p.kind === "star" ? 3.5 : 4.5); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  const sz = fz(21, "main");
  for (const tx of ui.texts) {
    toScreenTo(fxA, tx.x, tx.y, 40);
    ctx.globalAlpha = Math.max(0, 1 - tx.t / 1.2);
    const boom = tx.meaning && POP_ART[tx.meaning];
    if (boom && art(boom)) {
      if (tx.w === undefined) { ctx.font = hudFont(sz); tx.w = textW(tx.text); }   // ширина надписи — один раз
      drawArt(boom, fxA.x - tx.w * P.popBurst / 2, fxA.y - sz * P.popH / 2, tx.w * P.popBurst, sz * P.popH);
    }
    label(tx.text, fxA.x, fxA.y, sz, tx.color);
  }
  ctx.globalAlpha = 1;
}

export function addButton(x, y, w, h, text, color, act, size = 24) {
  const paper = paperUI() && PAPER_BTN[color];                            // SPEC-020: бумажная кнопка, если есть картинка
  if (!(paper && drawArt9(paper, x, y, w, h, Math.min(w, h) * LOOK.PAPER.btnCorner))) {
    ctx.fillStyle = "rgba(0,0,0,.3)"; rr(x + 3, y + 5, w, h, 18); ctx.fill();
    rr(x, y, w, h, 18); fillStroke(color, 4);
    ctx.fillStyle = "rgba(255,255,255,.25)"; rr(x + 8, y + 6, w - 16, h * 0.35, 10); ctx.fill();
  }
  label(text, x + w / 2, y + h / 2 + 1, size, "#fff");
  if (PHONE) noteText("main", size);
  const b = { x, y, w, h, act, text, textW: textW(text) };
  ui.buttons.push(b);
  return b;
}
export function toggleFullscreen() {
  const d = document;
  try {
    const p = !d.fullscreenElement && !d.webkitFullscreenElement ? (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen).call(d.documentElement)
      : (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    if (p && p.catch) p.catch(() => { /* SPEC-025 AC 7c: refused (no user activation, not allowed) — no unhandled rejection */ });
  } catch (e) { /* не везде поддерживается */ }
}

// джойстики: основание и шарик под пальцем
export function drawSticks() {
  const SR = stickR();
  const P = LOOK.PAPER, base = art("phone_stick_base"), knob = art("phone_stick_knob");   // SPEC-020: джойстик 25_phone_controls
  for (const st of activeSticks()) {   // SPEC-038 AC 1: only the newest finger of each player is drawn
    ctx.globalAlpha = base ? P.stickBase : 0.35;
    if (!drawArtFit("phone_stick_base", st.ox, st.oy, SR * 2.1)) { circle(st.ox, st.oy, SR); fillStroke("#fff", 3); }
    // SPEC-019: внутреннее кольцо — граница «на цыпочках»: внутри него тихо, дальше — бегом (на бумажном основании — тёмное)
    const ring = SR * CFG.TIPTOE_MAX;
    ctx.globalAlpha = base ? 0.9 : 0.6; circle(st.ox, st.oy, ring); ctx.lineWidth = base ? 2.5 : 2; ctx.setLineDash([5, 5]); ctx.strokeStyle = base ? P.stickRing : "#fff"; ctx.stroke(); ctx.setLineDash([]);
    ui.stickMarks.push({ x: st.ox, y: st.oy, R: SR, ring });
    ctx.globalAlpha = knob ? 0.95 : 0.7;
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), k = d > SR ? SR / d : 1, kx = st.ox + dx * k, ky = st.oy + dy * k;
    if (drawArtFit("phone_stick_knob", kx, ky, P.knob * 2)) { circle(kx, ky, P.knob); ctx.lineWidth = 3; ctx.strokeStyle = P_COLORS[st.player]; ctx.stroke(); }
    else { circle(kx, ky, 24); fillStroke(P_COLORS[st.player], 3); }
    ctx.globalAlpha = 1;
  }
}
