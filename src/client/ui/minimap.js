// SPEC-011: the phone mini-map and the edge arrows (SPEC-005, SPEC-010). Client module (moved out of index.html in Phase C).

import { H, TAU, W } from "../../core/config.js";
import { mode } from "../../core/game.js";
import { bigCalm } from "../../core/path.js";
import { clamp } from "../../core/util.js";
import { LOOK } from "../look.js";
import { P_COLORS } from "../outfits.js";
import { ctx, PHONE, UH, UW, VIEW } from "../screen.js";
import { ui } from "../state.js";
import { camHero, camRect, toScreen } from "../three/camera.js";
import { coneBuf } from "../three/sync.js";
import { THEMES } from "../three/themes.js";
import { circle, drawHeart, fillStroke, rr } from "./draw.js";
import { phoneOccluders } from "./phone.js";
import { cpx, label } from "./text.js";
import { G } from "../../core/active.js";

// ---------- Мини-карта и стрелки у края (SPEC-005, только телефон) ----------
// mmState — один объект на все кадры; маркеры — переиспользуемые объекты (mmCount штук нарисовано в этом кадре)
export let mmBase = null, mmKey = "", mmDraws = 0;
export const mmState = { x: 0, y: 0, w: 0, h: 0, alpha: 1, markers: [] };
export let mmCount = 0;
export const showMinimap = () => PHONE && (mode === "play" || mode === "pause");
// правый верхний угол, ширина MINIMAP_W от ширины интерфейса, 3:2 (как карта 30×20)
export function minimapRect() {
  const m = LOOK.MINIMAP_MARGIN, w = Math.round(UW * LOOK.MINIMAP_W), h = w * 2 / 3;
  return { x: UW - m - w, y: m, w, h };
}
// смесь двух цветов "#rrggbb" (f = доля второго)
function mixHex(a, b, f) {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(",")})`;
}
// нижний слой (SPEC-010: без заливки земли и полов): стены, домики соседей, стены арены и лабиринта — тёмные силуэты
// своего цвета; вода — голубая; домик маленьких и дом Большого — светлая заливка с контуром; кусты, деревья, камни — точки.
// Рисуется один раз на уровень (номер и попытку из levelInfo), место и размер; перезапуск того же уровня ничего не перерисовывает
const MM_DARK = "#1e293b", MM_WATER = "#38bdf8", MM_BUSH = "#2e8b3e";
function minimapBase(r) {
  const li = G.levelInfo || {}, key = [li.world, li.lv, li.attempt, li.fallback, r.w, VIEW].join(":");
  if (mmBase && key === mmKey) return mmBase;
  mmKey = key; mmDraws++;
  const th = THEMES[li.world || G.world], L = LOOK.MINIMAP_LOOK, c = mmBase || (mmBase = document.createElement("canvas"));
  c.width = Math.max(1, Math.round(r.w * VIEW)); c.height = Math.max(1, Math.round(r.h * VIEW));   // новый размер — холст чистый
  const g = c.getContext("2d"), ui = W / r.w;                    // px карты на UI px
  g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);          // рисуем в px карты
  const dark = col => mixHex(col, MM_DARK, L.dark);
  const zone = (z, col) => {
    if (!z) return;
    const lw = L.zoneLine * ui;
    g.globalAlpha = L.zone; g.fillStyle = col; g.fillRect(z.x, z.y, z.w, z.h); g.globalAlpha = 1;
    g.lineWidth = lw; g.strokeStyle = col; g.strokeRect(z.x + lw / 2, z.y + lw / 2, z.w - lw, z.h - lw);
  };
  zone(G.safeZone, th.walls.home[0]); zone(G.dangerZone, th.walls.bighome[0]);
  for (const o of G.obstacles) {
    // SPEC-016: у места с воротами (deco.goal — Поле) пруд — это ворота: рисуются цветом рамки, не водой
    if (o.kind === "water" || o.kind === "pond") { g.fillStyle = o.kind === "pond" && !o.fountain && th.deco?.goal ? th.deco.goal : MM_WATER; g.fillRect(o.x, o.y, o.w, o.h); continue; }
    if (o.kind === "tree" || o.kind === "rock") {
      g.fillStyle = dark(o.kind === "tree" ? MM_BUSH : "#94a3b8");
      g.beginPath(); g.arc(o.x, o.y, o.r * L.tree, 0, TAU); g.fill(); continue;
    }
    const col = o.kind === "cottage" ? th.cottage?.roof || "#ef4444"
      : o.kind === "maze" || o.kind === "hedge" ? th.maze?.wall || "#3f9a4a"
      : (th.walls[o.kind] || th.walls.build)[0];
    g.fillStyle = dark(col);
    if (o.shape === "circle") { g.beginPath(); g.arc(o.x, o.y, o.r, 0, TAU); g.fill(); }
    else g.fillRect(o.x, o.y, o.w, o.h);
  }
  g.fillStyle = dark(MM_BUSH);
  for (const b of G.bushes) { g.beginPath(); g.arc(b.x, b.y, b.r * L.bush, 0, TAU); g.fill(); }
  return c;
}
function mark(kind, x, y, r = 0) {
  const m = mmState.markers[mmCount] || (mmState.markers[mmCount] = { kind: "", x: 0, y: 0, r: 0 });
  m.kind = kind; m.x = x; m.y = y; m.r = r; mmCount++;
}
// SPEC-010: герой или Большой (точка ног на экране) под мини-картой с запасом MINIMAP_UNDER_PAD → вся карта бледнеет
export let mmAlpha = 1;
function minimapUnder() {
  const r = minimapRect(), p = LOOK.MINIMAP_UNDER_PAD;
  return [camHero(), G.big].some(o => {
    if (!o) return false;
    const s = toScreen(o.x, o.y);
    return s.x > r.x - p && s.x < r.x + r.w + p && s.y > r.y - p && s.y < r.y + r.h + p;
  });
}
// каждый кадр из главного цикла (после камеры): прозрачность ровно идёт к цели, весь путь — за MINIMAP_FADE_TIME
export function updateMinimapFade(dt) {
  if (!showMinimap()) { mmAlpha = 1; return; }
  const lo = LOOK.MINIMAP_UNDER_ALPHA, to = minimapUnder() ? lo : 1, d = dt * (1 - lo) / LOOK.MINIMAP_FADE_TIME;
  mmAlpha = to < mmAlpha ? Math.max(to, mmAlpha - d) : Math.min(to, mmAlpha + d);
}
// верхний слой каждый кадр: герой, боты, упавшие (мигают), Большой с конусом, звёздочки, предметы, рамка камеры.
// Точки — полной яркости (× mmAlpha) с тонким тёмным контуром, не меньше MINIMAP_LOOK.dot
export function drawMinimap(t) {
  const r = minimapRect(), sx = r.w / W, sy = r.h / H, L = LOOK.MINIMAP_LOOK, A = mmAlpha;
  const X = x => r.x + x * sx, Y = y => r.y + y * sy;
  const dot = (kind, x, y, rad, fill, ring) => {
    const R = Math.max(rad, L.dot), px = X(x), py = Y(y);
    circle(px, py, R); ctx.fillStyle = fill; ctx.fill();
    if (ring) { circle(px, py, R - L.outline); ctx.lineWidth = L.ringW; ctx.strokeStyle = ring; ctx.stroke(); }
    circle(px, py, R); ctx.lineWidth = L.outline; ctx.strokeStyle = MM_DARK; ctx.stroke();
    mark(kind, px, py, R);
  };
  mmCount = 0;
  ctx.save();
  rr(r.x, r.y, r.w, r.h, L.radius); ctx.globalAlpha = A * LOOK.MINIMAP_BG_ALPHA; ctx.fillStyle = "#0f172a"; ctx.fill();
  ctx.clip();
  ctx.globalAlpha = A * LOOK.MINIMAP_BASE_ALPHA; ctx.drawImage(minimapBase(r), r.x, r.y, r.w, r.h);
  // конус Большого — тот же многоугольник и то же «спокоен», что в 3D
  const vp = coneBuf, calm = bigCalm();   // посчитан в этом же кадре для 3D-конуса (updateCone)
  ctx.beginPath(); ctx.moveTo(X(vp[0]), Y(vp[1]));
  for (let i = 2; i < vp.length; i += 2) ctx.lineTo(X(vp[i]), Y(vp[i + 1]));
  ctx.closePath(); ctx.globalAlpha = A * (calm ? L.coneCalm : L.cone); ctx.fillStyle = calm ? "#fff" : "#facc15"; ctx.fill();
  mark("cone", X(G.big.x), Y(G.big.y));
  ctx.globalAlpha = A;
  for (const s of G.bonusStars) dot("star", s.x, s.y, L.dots.star, "#facc15");
  for (const it of G.items) dot("item", it.x, it.y, L.dots.item, "#fb923c");
  const hero = camHero(), blink = Math.sin(t * 10) > 0;
  for (const l of G.littles) {
    if (l === hero) continue;
    if (l.state === "down") { dot("downed", l.x, l.y, L.dots.downed, blink ? "#22c55e" : "#fff"); continue; }
    ctx.globalAlpha = A * (l.state === "home" || l.state === "rest" ? L.rest : 1);
    dot("bot", l.x, l.y, L.dots.bot, "#fff"); ctx.globalAlpha = A;
  }
  dot("big", G.big.x, G.big.y, L.dots.big, "#ef4444");
  if (hero) dot("hero", hero.x, hero.y, L.dots.hero, hero.state === "down" && blink ? "#fff" : P_COLORS[0], "#fff");
  const v = camRect();
  ctx.globalAlpha = A * L.frameShade; ctx.lineWidth = L.frameShadeW; ctx.strokeStyle = MM_DARK; ctx.strokeRect(X(v.x), Y(v.y), v.w * sx, v.h * sy);
  ctx.globalAlpha = A * L.frame; ctx.lineWidth = L.frameW; ctx.strokeStyle = "#fff"; ctx.strokeRect(X(v.x), Y(v.y), v.w * sx, v.h * sy);
  mark("view", X(v.x + v.w / 2), Y(v.y + v.h / 2));
  ctx.restore();
  ctx.save(); ctx.globalAlpha = A * L.border;
  rr(r.x, r.y, r.w, r.h, L.radius); ctx.lineWidth = L.borderW; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.restore();
  Object.assign(mmState, r); mmState.alpha = A; ui.mmShown = true;
}
// стрелки у края экрана: Большой (красная) и упавшие друзья (зелёная с ❗), если их не видно —
// за краем экрана или под мини-картой, кружками команды, верхней полосой; на линии герой → цель,
// в стороне от мини-карты, табличек HUD и кнопок (от идеального места идём по краю в обе стороны)
export function drawEdgeArrows() {
  const hero = camHero();
  if (!hero || mode !== "play") return;
  const R = cpx(LOOK.ARROW_D / 2), E = R * 1.55;                      // E — с кончиком стрелки
  const hs = toScreen(hero.x, hero.y), hidden = phoneOccluders();
  const x0 = E + 2, x1 = UW - E - 2, y0 = E + 2, y1 = UH - E - 2, Wd = x1 - x0, Ht = y1 - y0, per = 2 * (Wd + Ht);
  const blocks = [minimapRect(), ...ui.buttons, ...ui.hudRects];
  const free = (x, y) => {
    for (const b of blocks) if (x > b.x - E - 2 && x < b.x + b.w + E + 2 && y > b.y - E - 2 && y < b.y + b.h + E + 2) return false;
    for (const a of ui.edgeArrows) if (Math.abs(x - a.x) < 2 * E && Math.abs(y - a.y) < 2 * E) return false;
    return true;
  };
  // точка на краю по пути вдоль периметра (по часовой от левого верхнего угла)
  let px = 0, py = 0;
  const at = s => {
    s = ((s % per) + per) % per;
    if (s < Wd) { px = x0 + s; py = y0; } else if (s < Wd + Ht) { px = x1; py = y0 + s - Wd; }
    else if (s < 2 * Wd + Ht) { px = x1 - (s - Wd - Ht); py = y1; } else { px = x0; py = y1 - (s - 2 * Wd - Ht); }
  };
  const targets = [{ kind: "big", o: G.big }, ...G.littles.filter(l => l !== hero && l.state === "down").map(o => ({ kind: "downed", o }))];
  for (const { kind, o } of targets) {
    const ts = toScreen(o.x, o.y);
    const onScreen = ts.x >= 0 && ts.x <= UW && ts.y >= 0 && ts.y <= UH;
    if (onScreen && !hidden.some(b => ts.x > b.x && ts.x < b.x + b.w && ts.y > b.y && ts.y < b.y + b.h)) continue;
    const a = Math.atan2(ts.y - hs.y, ts.x - hs.x), dx = Math.cos(a), dy = Math.sin(a);
    let k = Infinity;
    if (dx > 1e-6) k = Math.min(k, (x1 - hs.x) / dx); else if (dx < -1e-6) k = Math.min(k, (x0 - hs.x) / dx);
    if (dy > 1e-6) k = Math.min(k, (y1 - hs.y) / dy); else if (dy < -1e-6) k = Math.min(k, (y0 - hs.y) / dy);
    const ix = clamp(hs.x + dx * k, x0, x1), iy = clamp(hs.y + dy * k, y0, y1);
    // идеальное место → координата вдоль периметра
    const s0 = Math.abs(iy - y0) < 0.5 ? ix - x0 : Math.abs(ix - x1) < 0.5 ? Wd + iy - y0 : Math.abs(iy - y1) < 0.5 ? Wd + Ht + x1 - ix : 2 * Wd + Ht + y1 - iy;
    let fx = ix, fy = iy;
    if (!free(ix, iy)) {
      for (let d = 4; d < per / 2; d += 4) {
        at(s0 + d); if (free(px, py)) { fx = px; fy = py; break; }
        at(s0 - d); if (free(px, py)) { fx = px; fy = py; break; }
      }
    }
    const col = kind === "big" ? "#ef4444" : "#22c55e";
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(E, 0); ctx.lineTo(R * 0.75, -R * 0.55); ctx.lineTo(R * 0.75, R * 0.55); ctx.closePath(); fillStroke(col, 2.5, "#fff");
    ctx.restore();
    circle(fx, fy, R); fillStroke(col, 3, "#fff");
    if (kind === "big") drawHeart(fx, fy - R * 0.45, R * 0.95, "#fff", false); else label("❗", fx, fy + 1, R * 1.1, "#fff");
    ui.edgeArrows.push({ kind, x: fx, y: fy, angle: a, r: E });
  }
}
