// SPEC-011: movement and collisions along the paths — resolveWalls, moveEntity and the steering (steerPoint / steerTo) that follows the A* of
// grid.js and keeps out of the Big One's cone (vision.js). SPEC-039: the grid queries live in grid.js, the seeing in vision.js. Core module.
import { CFG, H, W } from "./config.js";
import { clamp, rand } from "./util.js";
import { bigGrid, detourCost, findPath, wallOn } from "./grid.js";
import { inCone } from "./vision.js";
import { inDangerXY, losWide, moveSolidAt, moveSolidBigAt } from "./world.js";
import { G } from "./active.js";

// ---------- Движение ----------
export function resolveWalls(e) {
  for (const o of G.obstacles) {
    if (!o.move) continue;
    if (o.shape === "rect") {
      const nx = clamp(e.x, o.x, o.x + o.w), ny = clamp(e.y, o.y, o.y + o.h);
      const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
      if (d2 >= e.r * e.r) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); e.x += dx / d * (e.r - d); e.y += dy / d * (e.r - d); }
      else {
        const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y, m = Math.min(l, r, t, b);
        if (m === l) e.x = o.x - e.r; else if (m === r) e.x = o.x + o.w + e.r; else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
      }
    } else {
      const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = e.r + o.r;
      if (d < min) { e.x += dx / d * (min - d); e.y += dy / d * (min - d); }
    }
  }
  if (e.isBig && G.safeZone) {
    const o = G.safeZone, nx = clamp(e.x, o.x, o.x + o.w), ny = clamp(e.y, o.y, o.y + o.h);
    const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
    if (d2 < e.r * e.r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); e.x += dx / d * (e.r - d); e.y += dy / d * (e.r - d); }
      else {
        const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y, m = Math.min(l, r, t, b);
        if (m === l) e.x = o.x - e.r; else if (m === r) e.x = o.x + o.w + e.r; else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
      }
    }
  }
  e.x = clamp(e.x, e.r, W - e.r);
  e.y = clamp(e.y, e.r, H - e.r);
}
export function moveEntity(e, vx, vy, dt) { e.x += vx * dt; e.y += vy * dt; resolveWalls(e); }


// SPEC-037: лежащий друг (state "down") не сдвигается (separate()) — для Большого он стена: расстояние от точки до отрезка и «близко к лежащему»
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
function clearTo(e, x, y, avoidCone) {
  if (!losWide(e.x, e.y, x, y, e.r - 1, e.isBig ? moveSolidBigAt : moveSolidAt)) return false;
  // лежащий друг на отрезке — не прямо (кроме самой цели: к нему идут, поиск начинается у него)
  if (e.isBig && wallOn() && G.littles.some(l => l.state === "down" && Math.hypot(l.x - x, l.y - y) >= e.r + l.r && segDist(l.x, l.y, e.x, e.y, x, y) < e.r + l.r)) return false;
  if (avoidCone && G.big.stun <= 0 && G.big.blush <= 0) for (let t = 0.2; t <= 1.001; t += 0.2) if (inCone(e.x + (x - e.x) * t, e.y + (y - e.y) * t)) return false;
  return true;
}
// Куда идти к цели (gx, gy): сама цель, если путь прямой, иначе следующая точка пути A*. e.path/e.repath — память пути;
// repathIn — через сколько пересчитать (боты и Большой — случайно; автопилот — своё число, игровой rng() не трогает)
export function steerPoint(e, gx, gy, dt, avoidCone, repathIn = () => rand(0.3, 0.45)) {
  e.repath -= dt;
  let tx = gx, ty = gy;
  if (!clearTo(e, gx, gy, avoidCone)) {
    if (e.repath <= 0 || !e.path.length) {
      const cost = e.isBig ? ((x, y) => (avoidCone && inCone(x, y) ? 20 : 0) + detourCost(x, y))
        : (x, y) => (avoidCone && inCone(x, y) ? 20 : 0) + (inDangerXY(x, y) ? CFG.BOT_DANGER_COST : 0);   // дом Большого — «дорогой»
      e.path = findPath(e.x, e.y, gx, gy, cost, e.isBig ? bigGrid() : G.blocked);
      e.repath = repathIn();
    }
    while (e.path.length && Math.hypot(e.path[0].x - e.x, e.path[0].y - e.y) < 8) e.path.shift();
    while (e.path.length > 1 && clearTo(e, e.path[1].x, e.path[1].y, avoidCone)) e.path.shift();
    if (e.path.length) { tx = e.path[0].x; ty = e.path[0].y; }
  } else e.path = [];
  return { tx, ty };
}
export function steerTo(e, gx, gy, speed, dt, avoidCone) {
  const { tx, ty } = steerPoint(e, gx, gy, dt, avoidCone);
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 1.5) return false;
  const sp = Math.min(speed, d / dt);
  moveEntity(e, dx / d * sp, dy / d * sp, dt);
  e.moveDir = Math.atan2(dy, dx);
  e.walk += dt * sp / 14;
  return true;
}
