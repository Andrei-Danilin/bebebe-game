// SPEC-011: path finding (A*), movement and collisions, the Big One's view cone. Core module.
import { CELL, CFG, COLS, H, ROWS, W } from "./config.js";
import { angDiff, clamp, dist, rand, rng } from "./util.js";
import { big } from "./game.js";
import { tutorialGame } from "./practice.js";
import { blocked, blockedBig, bushes, inDangerXY, losWide, moveSolidAt, moveSolidBigAt, obstacles, reachable, safeZone, seeSolidAt } from "./world.js";

// ---------- Поиск пути (A*) ----------
export function cellIdx(x, y) { return clamp(Math.floor(y / CELL), 0, ROWS - 1) * COLS + clamp(Math.floor(x / CELL), 0, COLS - 1); }
function nearestFree(idx, grid = blocked) {
  if (!grid[idx]) return idx;
  const seen = new Uint8Array(COLS * ROWS), q = [idx];
  seen[idx] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (!grid[i]) return i;
    const cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return idx;
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
export function findPath(sx, sy, gx, gy, extraCost, grid = blocked) {
  const N = COLS * ROWS;
  const s = nearestFree(cellIdx(sx, sy), grid), g = nearestFree(cellIdx(gx, gy), grid);
  const gs = new Float32Array(N).fill(Infinity), fs = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const gcx = g % COLS, gcy = (g / COLS) | 0;
  const h = i => { const dx = Math.abs(i % COLS - gcx), dy = Math.abs(((i / COLS) | 0) - gcy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const open = [s];
  gs[s] = 0; fs[s] = h(s);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fs[open[k]] < fs[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (closed[cur]) continue;
    if (cur === g) break;
    closed[cur] = 1;
    const cx = cur % COLS, cy = (cur / COLS) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (grid[j] || closed[j]) continue;
      if (dx && dy && (grid[cy * COLS + nx] || grid[ny * COLS + cx])) continue;
      const ng = gs[cur] + c + (extraCost ? extraCost((nx + 0.5) * CELL, (ny + 0.5) * CELL) : 0);
      if (ng < gs[j]) { gs[j] = ng; came[j] = cur; fs[j] = ng + h(j); open.push(j); }
    }
  }
  if (g !== s && came[g] === -1) return [];
  const pts = [];
  let c = g;
  while (c !== s && c !== -1) { pts.push({ x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL }); c = came[c]; }
  pts.reverse();
  if (pts.length && !(grid === blockedBig ? moveSolidBigAt : moveSolidAt)(gx, gy)) pts[pts.length - 1] = { x: gx, y: gy };
  return pts;
}

// ---------- Движение ----------
export function resolveWalls(e) {
  for (const o of obstacles) {
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
  if (e.isBig && safeZone) {
    const o = safeZone, nx = clamp(e.x, o.x, o.x + o.w), ny = clamp(e.y, o.y, o.y + o.h);
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

// Большой «спокоен»: в шоке, отдыхает после толчка или краснеет — конус бледный (3D и мини-карта)
export const bigCalm = () => !!big.kind || big.stun > 0 || big.noPush > 0 || big.blush > 0;   // SPEC-022: подобревший идёт домой — луч спокойный
// многоугольник взгляда Большого в px мира: [x0, y0 (он сам), x1, y1, …] — n + 1 лучей, обрезанных стенами
export function visionPoly(n, out = []) {
  out.length = 2 * (n + 2); out[0] = big.x; out[1] = big.y;
  const a0 = big.dir - CFG.VISION_HALF;
  for (let i = 0; i <= n; i++) {
    const a = a0 + i * (2 * CFG.VISION_HALF / n), cx = Math.cos(a), sy = Math.sin(a);
    let r = 0;
    while (r < CFG.VISION_RANGE) { r += 5; if (seeSolidAt(big.x + cx * r, big.y + sy * r)) { r -= 5; break; } }
    out[2 * i + 2] = big.x + cx * r; out[2 * i + 3] = big.y + sy * r;
  }
  return out;
}
export function inCone(x, y) {
  const dx = x - big.x, dy = y - big.y, d = Math.hypot(dx, dy);
  return d < CFG.VISION_RANGE + 25 && angDiff(big.dir, Math.atan2(dy, dx)) < CFG.VISION_HALF + 0.2;
}
function clearTo(e, x, y, avoidCone) {
  if (!losWide(e.x, e.y, x, y, e.r - 1, e.isBig ? moveSolidBigAt : moveSolidAt)) return false;
  if (avoidCone && big.stun <= 0 && big.blush <= 0) for (let t = 0.2; t <= 1.001; t += 0.2) if (inCone(e.x + (x - e.x) * t, e.y + (y - e.y) * t)) return false;
  return true;
}
// Куда идти к цели (gx, gy): сама цель, если путь прямой, иначе следующая точка пути A*. e.path/e.repath — память пути;
// repathIn — через сколько пересчитать (боты и Большой — случайно; автопилот — своё число, игровой rng() не трогает)
export function steerPoint(e, gx, gy, dt, avoidCone, repathIn = () => rand(0.3, 0.45)) {
  e.repath -= dt;
  let tx = gx, ty = gy;
  if (!clearTo(e, gx, gy, avoidCone)) {
    if (e.repath <= 0 || !e.path.length) {
      const cost = e.isBig ? (avoidCone ? ((x, y) => (inCone(x, y) ? 20 : 0)) : null)
        : (x, y) => (avoidCone && inCone(x, y) ? 20 : 0) + (inDangerXY(x, y) ? CFG.BOT_DANGER_COST : 0);   // дом Большого — «дорогой»
      e.path = findPath(e.x, e.y, gx, gy, cost, e.isBig ? blockedBig : blocked);
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
export function randomFreePoint() {
  for (let k = 0; k < 300; k++) {
    const cx = Math.floor(rng() * COLS), cy = Math.floor(rng() * ROWS);
    if (blockedBig[cy * COLS + cx] || (tutorialGame && !reachable[cy * COLS + cx])) continue;   // SPEC-029: не за изгородь тренировки
    const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
    if (dist(p, big) > 150) return p;
  }
  return { x: W / 2, y: H / 2 };
}
export const inBush = l => CFG.BUSH_HIDES && bushes.some(b => Math.hypot(l.x - b.x, l.y - b.y) < b.r - 6);
