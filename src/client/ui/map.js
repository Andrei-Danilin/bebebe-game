// SPEC-011: the level map (world tabs, the 20 stops) and the level card (SPEC-017), lockedText. Client module (moved out of
// index.html in Phase C).

import { CFG, H, levelsPerWorld, TAU, W, WORLD_SEED, WORLDS } from "../../core/config.js";
import { levelType } from "../../core/level/generate.js";
import { bossFor } from "../../core/mood.js";
import { progress, worldProgress } from "../../core/economy.js";
import { worldComplete } from "../../core/progress-rules.js";
import { mulberry32 } from "../../core/util.js";
import { L } from "../../i18n.js";
import { art, artFade, mapBgArt, worldArt } from "../art.js";
import { paperPanel } from "./paper.js";
import { cardLevel, chooseStop, goBack, mapSelN, nextStop, openStory, openTip, playCard, tapWorldTab } from "../flow.js";
import { LOOK, WORLD_ICONS } from "../look.js";
import { worldOpenNow } from "../entitlement.js";
import { ctx, OUT, PHONE, UH, UW, VIEW } from "../screen.js";
import { ui } from "../state.js";
import { THEMES } from "../three/themes.js";
import { coinPlate } from "./character/wardrobe.js";
import { fitButton, iconOnlyButton, rowsAt } from "./buttons.js";
import { addButton, circle, drawStar, drawStarArt, fillStroke, regButton, rr } from "./draw.js";
import { drawArtFit, fillT, noteArt } from "./artdraw.js";
import { drawPill, homePill } from "./home.js";
import { drawLevelPreview } from "./level-preview.js";
import { menuFrame, phoneFrame, worldStarsOf } from "./menu.js";
import { drawTipCard } from "./tip.js";
import { fitLine, fz, label, noteRows, noteText, plainText, scaledW } from "./text.js";
import { cpx, hudFont, minPx } from "./layout.js";
import { G } from "../../core/active.js";
import { textW } from "./measure.js";

// ---------- SPEC-017: карта уровней — вкладки шести миров, страница мира с 20 остановками на дорожке змейкой ----------
// значки миров на вкладках и в заголовке страницы (вкладка — значок на фоне цвета земли мира: имена в узкую вкладку не влезают)
// где что на карте: верхний ряд (◀, вкладки, монетки), страница мира (строка заголовка, ниже остановки); k — UI px на единицу CFG
function mapGeom() {
  const A = LOOK.MENU_LOOK.map;
  if (PHONE) {
    const c = cpx, { X0, X1, Y0, Y1, g, B } = phoneFrame(false);
    return { X0, X1, Y0, g, B, tabH: B, backW: B, backText: "◀", coinsW: c(A.phoneCoins), titleH: c(A.phoneTitleH), stop: c(A.phoneStop),
      page: { x: X0, y: Y0 + B + g, w: X1 - X0, h: Y1 - Y0 - B - g } };
  }
  const { X0, X1, Y0, Y1, g } = menuFrame(undefined, false);
  return { X0, X1, Y0, g, B: 44, tabH: A.tabH, backW: A.backW, backText: "◀ " + L().home, coinsW: A.coinsW, titleH: A.titleH, stop: A.stop,
    page: { x: X0, y: Y0 + A.tabH + g, w: X1 - X0, h: Y1 - Y0 - A.tabH - g } };
}
// остановки змейкой: ряды по A.cols, нечётные ряды справа налево; под остановкой место для звёзд; босс (последний уровень
// основного мира; SPEC-022: у бонусных миров босса нет) крупнее
function stopRects(MG) {
  const A = LOOK.MENU_LOOK.map, n = levelsPerWorld(), cols = A.cols, rows = Math.ceil(n / cols);
  const ay = MG.page.y + MG.titleH + MG.g, px = MG.page.w / cols, py = (MG.page.y + MG.page.h - ay) / rows, starH = MG.stop * A.starRow;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols), col = r % 2 ? cols - 1 - i % cols : i % cols, boss = !!bossFor(G.world, i + 1), s = MG.stop * (boss ? A.boss : 1);
    const cx = MG.page.x + px * (col + 0.5), cy = ay + py * (r + 0.5) - starH / 2;
    return { n: i + 1, x: cx - s / 2, y: cy - s / 2, w: s, h: s, cx, cy, boss };
  });
}
// рисунки фона страницы по миру (в цветах THEMES): деревья, разметка поля, домики, школа, пальмы, снежинки
function mapDoodle(g, w, th, x, y, s, i) {
  const out = OUT, D = LOOK.MENU_LOOK.map.doodle;
  g.lineWidth = Math.max(1, s * 0.06); g.strokeStyle = out;
  const blob = (bx, by, r, col) => { g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fillStyle = col; g.fill(); g.stroke(); };
  if (w === "park" || w === "field" && i % 3 === 2) {                       // дерево (на поле — редкие кусты по краю)
    g.fillStyle = D.trunk; g.fillRect(x - s * 0.07, y, s * 0.14, s * 0.35);
    blob(x, y - s * 0.05, s * 0.3, th.maze.wall); blob(x + s * 0.12, y - s * 0.15, s * 0.16, th.maze.cap);
  } else if (w === "field") {                                               // мяч
    blob(x, y, s * 0.18, D.ball); g.fillStyle = out; g.beginPath(); g.arc(x, y, s * 0.06, 0, TAU); g.fill();
  } else if (w === "city" || w === "school" && i % 2) {                     // домик
    const c = th.cottage || THEMES.park.cottage;
    g.fillStyle = c.wall; g.fillRect(x - s * 0.25, y - s * 0.1, s * 0.5, s * 0.4); g.strokeRect(x - s * 0.25, y - s * 0.1, s * 0.5, s * 0.4);
    g.beginPath(); g.moveTo(x - s * 0.32, y - s * 0.08); g.lineTo(x, y - s * 0.36); g.lineTo(x + s * 0.32, y - s * 0.08); g.closePath(); g.fillStyle = c.roof; g.fill(); g.stroke();
    g.fillStyle = c.window; g.fillRect(x - s * 0.15, y, s * 0.12, s * 0.1);
  } else if (w === "school") {                                              // школа: большой дом с флажком
    const wall = th.walls.build[0], top = th.walls.build[1];
    g.fillStyle = wall; g.fillRect(x - s * 0.45, y - s * 0.15, s * 0.9, s * 0.45); g.strokeRect(x - s * 0.45, y - s * 0.15, s * 0.9, s * 0.45);
    g.fillStyle = top; g.fillRect(x - s * 0.5, y - s * 0.25, s, s * 0.1); g.strokeRect(x - s * 0.5, y - s * 0.25, s, s * 0.1);
    g.fillStyle = D.window; for (let k = -1; k <= 1; k++) g.fillRect(x + k * s * 0.28 - s * 0.07, y - s * 0.05, s * 0.14, s * 0.12);
    g.beginPath(); g.moveTo(x, y - s * 0.25); g.lineTo(x, y - s * 0.5); g.stroke();
    g.fillStyle = D.flag; g.fillRect(x, y - s * 0.5, s * 0.16, s * 0.1);
  } else if (w === "beach") {                                               // пальма
    g.strokeStyle = D.palm; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(x, y + s * 0.35); g.quadraticCurveTo(x + s * 0.12, y, x + s * 0.05, y - s * 0.2); g.stroke();
    g.fillStyle = D.leaf; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.6; g.beginPath(); g.ellipse(x + s * 0.05 + Math.cos(a) * s * 0.18, y - s * 0.2 + Math.sin(a) * s * 0.12, s * 0.2, s * 0.06, a, 0, TAU); g.fill(); }
  } else {                                                                  // снежинка
    g.strokeStyle = D.snow; g.lineWidth = Math.max(1.5, s * 0.06);
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(x - Math.cos(a) * s * 0.25, y - Math.sin(a) * s * 0.25); g.lineTo(x + Math.cos(a) * s * 0.25, y + Math.sin(a) * s * 0.25); g.stroke(); }
  }
}
// фон страницы и дорожка (точками через центры остановок, повороты дугой за край ряда) — рисуется один раз в отдельный холст
function paintMapPage(g, w, pw, ph, pts, unit) {
  const A = LOOK.MENU_LOOK.map, th = THEMES[w], r = A.pageR * unit;
  g.save(); g.beginPath(); g.moveTo(r, 0); g.arcTo(pw, 0, pw, ph, r); g.arcTo(pw, ph, 0, ph, r); g.arcTo(0, ph, 0, 0, r); g.arcTo(0, 0, pw, 0, r); g.closePath(); g.clip();
  const bg = art(mapBgArt(w));
  if (bg) {                                                                // SPEC-020: нарисованная карта мира (cover), дорожка — синей ручкой
    const kk = Math.min(bg.naturalWidth / pw, bg.naturalHeight / ph);
    g.drawImage(bg, (bg.naturalWidth - pw * kk) / 2, (bg.naturalHeight - ph * kk) / 2, pw * kk, ph * kk, 0, 0, pw, ph);
  } else { g.fillStyle = th.g1; g.fillRect(0, 0, pw, ph); }
  if (bg) { /* рисунки фона уже на картинке */ } else if (w === "field") {                                                     // поле: полосы газона и разметка
    g.fillStyle = th.g2; for (let k = 0; k < 8; k += 2) g.fillRect(k * pw / 8, 0, pw / 8, ph);
    g.strokeStyle = th.deco.chalk; g.lineWidth = 3 * unit; g.globalAlpha = 0.8;
    g.strokeRect(pw * 0.04, ph * 0.08, pw * 0.92, ph * 0.84); g.beginPath(); g.moveTo(pw / 2, ph * 0.08); g.lineTo(pw / 2, ph * 0.92); g.stroke();
    g.beginPath(); g.arc(pw / 2, ph / 2, ph * 0.16, 0, TAU); g.stroke(); g.globalAlpha = 1;
  } else if (w === "city") {                                               // город: улица поперёк страницы
    g.fillStyle = th.deco && th.deco.asphalt || A.doodle.road; g.globalAlpha = 0.35; g.fillRect(0, ph * 0.46, pw, ph * 0.12); g.globalAlpha = 1;
  } else if (w === "beach") {                                              // пляж: море внизу
    g.fillStyle = th.water.c; g.globalAlpha = 0.6; g.fillRect(0, ph * 0.9, pw, ph * 0.1); g.globalAlpha = 1;
  } else {                                                                  // пятна травы/снега
    g.fillStyle = th.g2; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc((k * 0.37 % 1) * pw, (k * 0.61 % 1) * ph, (14 + k % 4 * 6) * unit, 0, TAU); g.fill(); }
  }
  if (!bg) {
    const rnd = mulberry32(WORLD_SEED[w] || 1);                             // свои места рисунков у каждого мира (не игровой rng)
    g.globalAlpha = A.doodleAlpha;
    for (let i = 0; i < A.doodles; i++) mapDoodle(g, w, th, (0.06 + rnd() * 0.88) * pw, (0.1 + rnd() * 0.8) * ph, (A.doodleSize + rnd() * A.doodleGrow) * unit, i);
    g.globalAlpha = 1;
  }
  g.strokeStyle = bg ? LOOK.PAPER.pen : A.path; g.lineWidth = A.dotW * unit; g.lineCap = "round"; g.setLineDash([A.dash * unit, A.dashGap * unit]);
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.abs(a.y - b.y) < 1) g.lineTo(b.x, b.y);
    else { const side = a.x > pw / 2 ? 1 : -1, out = pw / A.cols * 0.45; g.bezierCurveTo(a.x + side * out, a.y, b.x + side * out, b.y, b.x, b.y); }
  }
  g.stroke(); g.setLineDash([]);
  g.restore();
}
function drawMapPage(w, MG, rects) {
  const P = MG.page, bgName = mapBgArt(w), key = [w, P.x, P.y, P.w, P.h, VIEW, MG.stop, rects.length, LOOK.MENU_LOOK.map.cols, !!art(bgName)].join();
  if (!ui.mapBgCache || ui.mapBgCache.key !== key) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(P.w * VIEW)); cv.height = Math.max(1, Math.ceil(P.h * VIEW));
    const g = cv.getContext("2d"); g.scale(VIEW, VIEW);
    paintMapPage(g, w, P.w, P.h, rects.map(q => ({ x: q.cx - P.x, y: q.cy - P.y })), PHONE ? cpx(1) : 1);
    ui.mapBgCache = { key, cv };
  }
  ctx.drawImage(ui.mapBgCache.cv, P.x, P.y, P.w, P.h);
  if (art(bgName)) noteArt(bgName);
  const fk = artFade(bgName);   // SPEC-048 AC 3: the page picture came late — the plain page fades into it (a veil of the page colour that thins out)
  if (fk < 1) { ctx.globalAlpha = 1 - fk; ctx.fillStyle = THEMES[w].g1; ctx.fillRect(P.x, P.y, P.w, P.h); ctx.globalAlpha = 1; }
  rr(P.x, P.y, P.w, P.h, (PHONE ? cpx(1) : 1) * LOOK.MENU_LOOK.map.pageR); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
}
// одна остановка: кружок с номером (закрытая — серая с 🔒), звёзды под ней, следующая подпрыгивает, выбранная — в кольце;
// босс — крупнее, с плашкой «Босс» поверх кружка. Кнопка — неподвижный квадрат (прыгает только рисунок)
function drawStop(q, info, t, won) {
  const A = LOOK.MENU_LOOK.map, M = LOOK.MENU_LOOK, P = LOOK.PAPER, k = PHONE ? cpx(1) : 1, R = q.w / 2;
  const cy = q.cy - (info.next ? Math.abs(Math.sin(t * A.bounceSpeed)) * cpx(A.bounce) : 0);
  if (info.sel) { circle(q.cx, cy, R + A.ringPad * k); ctx.lineWidth = A.ringW * k; ctx.strokeStyle = A.ring; ctx.stroke(); }
  // SPEC-020: остановка картинкой из 20_levelmap_parts (босс — всегда своя, закрытый босс — бледнее и с замочком)
  const sprite = q.boss ? "stop_boss" : info.locked ? "stop_locked" : info.next ? "stop_current" : "stop_empty";
  if (q.boss && info.locked) ctx.globalAlpha = 0.6;
  const drawn = drawArtFit(sprite, q.cx, cy, q.w * P.stop * (sprite === "stop_current" ? P.glow : 1));
  ctx.globalAlpha = 1;
  if (!drawn) { circle(q.cx, cy, R); fillStroke(info.locked ? A.closed : info.next ? A.next : A.open, 3 * k); }
  let numY = cy + 1, numSz = R * 0.85;
  const badge = drawn && (info.locked || q.boss);                          // SPEC-020: в середине картинки замок или лицо босса —
  if (badge) numSz = R * 0.42;                                              // номер на белом кружке внизу
  if (q.boss) {                                                            // плашка «Босс» поперёк верха кружка
    const min = PHONE ? minPx("hint") : A.badgeMin, bh = R * 0.62, bw = q.w * 0.96;
    const f = fitLine(L().boss, Math.max(min, bh * 0.72), min, bw - 6 * k);
    rr(q.cx - bw / 2, cy - R * 0.92, bw, bh, bh / 2); fillStroke(A.badge, 2 * k);
    ctx.font = hudFont(f.sz); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = A.badgeInk; fillT(f.text, q.cx, cy - R * 0.92 + bh / 2 + 1);
    if (PHONE) noteText("hint", f.sz);
    info.badge = { text: f.text, w: bw, textW: f.w + 6 * k, size: f.sz };
    numY = cy + R * 0.22; numSz = R * 0.62;
  }
  numSz = Math.max(numSz, PHONE ? minPx("main") : 14);
  let numX = q.cx;
  if (badge) {
    numX = q.cx + R * 0.66; numY = cy + R * 0.66;
    ctx.font = hudFont(numSz);
    const br = Math.max(numSz * 0.72, textW(String(q.n)) * 0.62);
    circle(numX, numY, br); fillStroke(M.pill, 2 * k);
  }
  plainText(String(q.n), numX, numY + (badge ? 1 : 0), numSz, info.locked && !badge ? M.lockedInk : M.ink, "center");
  if (PHONE) noteText("main", numSz);
  if (info.locked) {
    if (drawn && !q.boss) { /* замок уже на картинке */ }
    else if (!drawArtFit("padlock", q.cx - R * 0.7, cy + R * 0.55, R * 0.62)) {
      ctx.font = `${R * 0.6}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      fillT("🔒", q.cx + R * 0.7, cy + R * 0.62);
    }
  } else {
    const sr = Math.max(4 * k, R * 0.24), step = sr * 2.2, sy = q.y + q.h + sr * 0.4;
    for (let i = 0; i < CFG.STARS_PER_LEVEL; i++) (drawn ? drawStarArt : drawStar)(q.cx + (i - (CFG.STARS_PER_LEVEL - 1) / 2) * step, sy, sr, i < info.stars);
    if (won && drawn) drawArtFit("stamp_done", q.cx + R * 0.72, cy - R * 0.72, q.w * P.stamp);   // SPEC-020: штамп «Пройдено»
  }
  ui.buttons.push({ x: q.x, y: q.y, w: q.w, h: q.h, act: () => chooseStop(q.n), id: "stop:" + q.n, text: String(q.n) });
}
// плашка в строке заголовка (название мира, штамп «Пройдено», подсказка): цвета bg/ink — свои
function mapPill(id, text, x, y, h, maxW, bg, ink, size, min) {
  const p = homePill(id, text, h, size, min);
  p.bg = bg; p.ink = ink;
  drawPill(p, x, y, maxW);
  return Math.min(p.w, maxW);
}
// подсказка карты (hudRects «toast», text — весь текст, rows — строки): влезает одной строкой — плашка в строке заголовка;
// нет (длинный текст, шрифты CI шире) — до A.toastRows строк, плашка выше: от промежутка под вкладками до верха остановок.
// Ширина меряется с LOOK.TEXT_TEST_SCALE; текст сжимается не мельче min и никогда не режется «…»
function toastRows(text, size, maxW) {
  ctx.font = hudFont(size);
  const words = text.split(" ");
  if (words.length < 2 || scaledW(text) <= maxW) return [text];
  let best = null;                                                         // две строки, самая длинная — как можно короче
  for (let i = 1; i < words.length; i++) {
    const r = [words.slice(0, i).join(" "), words.slice(i).join(" ")], w = Math.max(...r.map(scaledW));
    if (!best || w < best.w) best = { r, w };
  }
  if (best.w <= maxW) return best.r;
  const rows = [];                                                         // и в две не влезло — по словам, сколько нужно
  let cur = "";
  for (const wd of words) { const t2 = cur ? cur + " " + wd : wd; if (scaledW(t2) > maxW && cur) { rows.push(cur); cur = wd; } else cur = t2; }
  return rows.concat(cur);
}
// SPEC-030: look — та же плашка другого вида (id, цвета, по центру страницы): «<мир> открыт!» после победы, открывшей мир
function drawToast(text, MG, rects, th, ty, size, min, look = {}) {
  const A = LOOK.MENU_LOOK.map, M = LOOK.MENU_LOOK, k = PHONE ? cpx(1) : 1, P = MG.page, pad = 8 * k, maxW = P.w - 2 * pad;
  const id = look.id || "toast", bg = look.bg || A.toastBg, ink = look.ink || A.toastInk, pill = homePill(id, text, th, size, min);
  const one = fitLine(text, size, min, maxW - 2 * pill.pad);
  if (one.text === text) { mapPill(id, text, look.center ? P.x + (P.w - Math.min(pill.w, maxW)) / 2 : P.x + pad, ty, th, maxW, bg, ink, size, min); return; }
  const padX = PHONE ? cpx(M.phoneHome.pad) : M.home.pad, top = P.y - MG.g / 2;
  const avail = Math.min(...rects.map(q => q.y)) - MG.g / 2 - top;
  const fit = sz => { const r = toastRows(text, sz, maxW - 2 * padX); return { r, sz, h: (r.length * A.toastLine + A.toastPadY) * sz }; };
  let f = fit(size);
  while (f.sz > min && (f.r.length > A.toastRows || f.h > avail)) f = fit(Math.max(min, f.sz - 0.5));
  ctx.font = hudFont(f.sz);
  const textW = Math.max(...f.r.map(scaledW)), w = Math.min(maxW, textW + 2 * padX), x = look.center ? P.x + (P.w - w) / 2 : P.x + pad, y = top + Math.max(0, (avail - f.h) / 2);
  rr(x, y, w, f.h, Math.min(f.h, th) * 0.4); fillStroke(bg, k * M.pillLine, M.ink);
  f.r.forEach((q, i) => plainText(q, x + w / 2, y + f.h / 2 + (i - (f.r.length - 1) / 2) * f.sz * A.toastLine + 1, f.sz, ink, "center"));
  if (PHONE) noteText("main", f.sz);
  ui.hudRects.push({ id, x, y, w, h: f.h, text: f.r.join(" "), textW: textW + 2 * padX, rows: f.r });
}
export function drawMap(t) {
  const M = LOOK.MENU_LOOK, A = M.map, MG = mapGeom(), k = PHONE ? cpx(1) : 1, w = G.world, wp = worldProgress();
  menuFrame();
  const minMain = PHONE ? minPx("main") : 13;
  // верхний ряд: ◀ Главная, шесть вкладок, монетки
  fitButton(MG.X0, MG.Y0, MG.backW, MG.tabH, MG.backText, M.back, goBack, PHONE ? cpx(18) : 20, minMain).id = "back:home";
  coinPlate(MG.X1 - MG.coinsW, MG.Y0 + 4 * k, MG.coinsW, MG.tabH - 8 * k);
  const tx0 = MG.X0 + MG.backW + MG.g, tw = (MG.X1 - MG.coinsW - MG.g - tx0 - (WORLDS.length - 1) * MG.g) / WORLDS.length, tabs = [];
  WORLDS.forEach((wd, i) => {
    const x = tx0 + i * (tw + MG.g), o = worldOpenNow(wd), locked = !o.open, gift = o.reason === "purchase", mark = gift ? "🎁" : "🔒", sel = wd === (ui.mapTab ?? w);   // SPEC-045: a gift badge (not a padlock) on a world only the Full game opens
    const ic = Math.min(tw, MG.tabH);
    if (art(worldArt(wd))) {                                              // SPEC-020: значок мира из 20_levelmap_parts
      if (locked) ctx.globalAlpha = 0.5;
      drawArtFit(worldArt(wd), x + tw / 2, MG.Y0 + MG.tabH / 2, ic * 1.06);
      ctx.globalAlpha = 1;
      if (locked) drawArtFit(gift ? "ui_gift" : "padlock", x + tw / 2 + ic * 0.3, MG.Y0 + MG.tabH * 0.66, ic * 0.5);
      regButton(x, MG.Y0, tw, MG.tabH, locked ? mark : WORLD_ICONS[wd], () => tapWorldTab(wd), "maptab:" + wd, ic);
    } else addButton(x, MG.Y0, tw, MG.tabH, locked ? mark : WORLD_ICONS[wd], locked ? A.closed : THEMES[wd].g1, () => tapWorldTab(wd), PHONE ? fz(24, "main") : 30).id = "maptab:" + wd;
    if (sel) { rr(x - 3 * k, MG.Y0 - 3 * k, tw + 6 * k, MG.tabH + 6 * k, 20 * k); ctx.lineWidth = A.ringW * k; ctx.strokeStyle = A.ring; ctx.stroke(); }
    tabs.push({ world: wd, locked, reason: o.reason, selected: sel, x, y: MG.Y0, w: tw, h: MG.tabH });
  });
  // страница мира: фон и дорожка, строка заголовка (или подсказка), остановки
  const rects = stopRects(MG), next = nextStop(w), done = worldComplete(w, progress), sel = ui.mapTab ? null : mapSelN();   // SPEC-045: the ring is on a 🎁 tab: none on the stops
  drawMapPage(w, MG, rects);
  const P = MG.page, th = MG.titleH * 0.86, ty = P.y + (MG.titleH - th) / 2 + 4 * k, size = PHONE ? cpx(16) : 18, pad = 8 * k;
  if (!ui.toast && !ui.worldBanner) {
    const title = `${WORLD_ICONS[w]} ${L().worlds[w]}  ${L().worldStars(worldStarsOf(w), CFG.STARS_PER_LEVEL * levelsPerWorld())}`;
    const used = mapPill("map:title", title, P.x + pad, ty, th, P.w * 0.62, M.pill, M.ink, size, minMain);
    if (done) mapPill("map:done", L().done, P.x + pad + used + 10 * k, ty, th, P.w - used - 2 * pad - 10 * k, A.doneBg, A.done, size, minMain);
  }
  const stops = rects.map(q => {
    const info = { n: q.n, stars: wp.stars[q.n] || 0, locked: q.n > wp.unlocked, next: q.n === next, boss: q.boss, sel: q.n === sel, badge: null };
    drawStop(q, info, t, !!wp.won[q.n]);
    return { ...info, x: q.x, y: q.y, w: q.w, h: q.h };
  });
  if (ui.toast) drawToast(ui.toast.text, MG, rects, th, ty, size, minMain);   // поверх остановок: двухстрочная заходит на верх страницы
  else if (ui.worldBanner) drawToast("🎉 " + L().worldOpened(ui.worldBanner.world), MG, rects, th, ty, size, minMain, { id: "world-opened", bg: A.openedBg, ink: A.openedInk, center: true });   // SPEC-030
  ui.mapState = { world: w, sel, done, tabs, stops };
}
// SPEC-017: карточка уровня — «Мир · Уровень n», тип, строка про тип (у 20-го — про босса), звёзды; внизу 📖 (глава мира) и
// Играть (компьютер — 1 или 2 игрока), ✕ в углу. Высота — по тексту; вся по центру экрана
export function drawLevelCard() {
  if (ui.tip) { drawTipCard(); return; }   // SPEC-042: the "New here!" card stands in its place
  const M = LOOK.MENU_LOOK, A = M.map, PV = LOOK.LEVEL_PREVIEW_LOOK, k = PHONE ? cpx(1) : 1, B = PHONE ? cpx(LOOK.PHONE_BTN_MIN) : 44, g = PHONE ? cpx(LOOK.PHONE_BTN_GAP) : 10;
  const n = cardLevel, minMain = PHONE ? minPx("main") : 13, minHint = PHONE ? minPx("hint") : 12, pad = A.cardPad * k;
  const cw = Math.min(UW - 40 * k, (PHONE ? A.phoneCardW : A.cardW) * k), BH = PHONE ? B + 6 * k : A.cardBtn, sr = A.cardStar * k;
  const title = `${L().worlds[G.world]} · ${L().level} ${n}`, type = L().types[levelType(G.world, n)];
  // SPEC-022: строка босса — только у мира с боссом (у бонусных миров босса нет — обычная строка типа)
  const boss = n >= levelsPerWorld() && !!L().bossLine[G.world], locked = n > worldProgress().unlocked;
  const line = boss ? L().bossLine[G.world] : L().typeLines[levelType(G.world, n)], stars = worldProgress().stars[n] || 0;
  // SPEC-041: слева картинка — вид сверху на карту этого уровня (level-preview.js), справа тип, строка и звёзды; под ними кнопки
  const pw = cw * (PHONE ? PV.phoneFrac : PV.deskFrac), ph = pw * H / W, tw = cw - 3 * pad - pw;
  const f1 = fitLine(title, PHONE ? cpx(22) : 26, minMain, cw - 3 * pad - B), f2 = fitLine(type, PHONE ? cpx(17) : 20, minMain, tw);
  const lb = noteRows(line, PHONE ? cpx(16) : 18, minHint, tw, PV.lines), lineH = lb.rows.length * lb.sz * 1.2;
  const textH = f2.sz * 1.2 + g + lineH + g + 2 * sr, bodyH = Math.max(ph + 2 * PV.frame, textH);
  const ch = pad + B + g + bodyH + g + BH + pad, x = UW / 2 - cw / 2, y = Math.max(4 * k, UH / 2 - ch / 2);
  ctx.fillStyle = M.dim; ctx.fillRect(0, 0, UW, UH);
  if (!paperPanel(x, y, cw, ch, A.cardR * k)) { rr(x, y, cw, ch, A.cardR * k); fillStroke(M.card, M.cardLine); }   // SPEC-020: бумага тетради
  ui.cardRect = { x, y, w: cw, h: ch };
  fitButton(x + cw - pad - B, y + pad, B, B, "✕", M.back, goBack, PHONE ? cpx(18) : 20, minMain).id = "card:close";
  label(f1.text, x + pad, y + pad + B / 2, f1.sz, M.title, "left");
  if (PHONE) noteText("main", f1.sz);
  ui.hudRects.push({ id: "card:title", x: x + pad, y: y + pad + B / 2 - f1.sz * 0.6, w: f1.w, h: f1.sz * 1.2, text: f1.text });
  const body = y + pad + B + g, tx = x + 2 * pad + pw + tw / 2;
  const pr = drawLevelPreview(G.world, n, x + pad, body + (bodyH - ph) / 2, pw, { boss, locked });
  ui.hudRects.push({ id: "card:preview", x: pr.x - PV.frame, y: pr.y - PV.frame, w: pr.w + 2 * PV.frame, h: pr.h + 2 * PV.frame });
  let yy = body + (bodyH - textH) / 2 + f2.sz * 0.6;
  plainText(f2.text, tx, yy, f2.sz, M.type, "center");
  if (PHONE) noteText("main", f2.sz);
  ui.hudRects.push({ id: "card:type", x: tx - f2.w / 2, y: yy - f2.sz * 0.6, w: f2.w, h: f2.sz * 1.2, text: f2.text });
  yy += f2.sz * 0.6 + g;
  ctx.font = `800 ${lb.sz}px system-ui, "Segoe UI", sans-serif`;
  yy += rowsAt("card:line", lb, tx, yy, M.lockedInk) + g;
  ui.hudRects[ui.hudRects.length - 1].text = line;
  if (PHONE) noteText("hint", lb.sz);
  for (let i = 0; i < CFG.STARS_PER_LEVEL; i++) drawStarArt(tx + (i - 1) * sr * 2.6, yy + sr, sr, i < stars);
  const by = y + ch - pad - BH;
  iconOnlyButton(x + pad, by, BH, BH, "menu_story", "📖", M.storyBtn, () => openStory(G.world, "levelCard"), PHONE ? cpx(20) : 24, minMain, "card:story");   // SPEC-027: значок 28_menu_icons
  fitButton(x + pad + BH + g, by, BH, BH, "?", M.alt, openTip, PHONE ? cpx(22) : 26, minMain).id = "card:tip";   // SPEC-042 AC 11: what is new in this world
  const px = x + pad + 2 * (BH + g), pw2 = cw - 2 * pad - 2 * (BH + g);
  if (PHONE) fitButton(px, by, pw2, BH, "▶ " + L().play, M.play, () => playCard(1), cpx(22), minMain).id = "card:play";
  else {
    const bw = (pw2 - g) / 2;
    fitButton(px, by, bw, BH, L().onePlayer, M.play, () => playCard(1), 24, 14).id = "card:1";
    fitButton(px + bw + g, by, bw, BH, L().twoPlayers, M.alt, () => playCard(2), 24, 14).id = "card:2";
  }
  ui.cardInfo = { world: G.world, n, title, type, line, stars, preview: { boss, locked } };
}
