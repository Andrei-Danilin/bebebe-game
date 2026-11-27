// SPEC-011: the map of the running level — obstacles, bushes, homes, the grids for moving and seeing, what blocks what.
// Core module (the level generator fills it).
import { CELL, COLS, FH, FINE, FW, H, ROWS, W } from "./config.js";
import { clamp } from "./util.js";
import { trickDadSolid, trickSightOwn, trickSightSolid } from "./tricks/query.js";
import { areaHas } from "./tricks/kit.js";
import { G } from "./active.js";

// =====================================================================
//  МИР
// =====================================================================
// SPEC-012: the map of a game lives in its game object (newGame): G.obstacles, G.bushes, G.floors, G.decor, G.trees, G.flowers,
// G.safeZone (домик маленьких — Большой туда не заходит), G.dangerZone (пол дома Большого: маленьких там через DANGER_TIME
// выкидывают за дверь; exits — точки за дверями), G.reachable (клетки, куда маленькие могут дойти из своего домика), G.spawns,
// the grids G.blocked / G.blockedBig (cells) and G.moveGrid / G.seeGrid / G.moveGridBig (FINE cells)
export const inSafe = p => !!G.safeZone && p.x > G.safeZone.x && p.x < G.safeZone.x + G.safeZone.w && p.y > G.safeZone.y && p.y < G.safeZone.y + G.safeZone.h;
export const inDangerXY = (x, y) => !!G.dangerZone && x > G.dangerZone.x && x < G.dangerZone.x + G.dangerZone.w && y > G.dangerZone.y && y < G.dangerZone.y + G.dangerZone.h;
export const inDanger = p => inDangerXY(p.x, p.y);
// Может действовать сам: стоит на ногах, не на плечах у Большого, голова не кружится
export const canAct = l => l.state === "ok" && l.hugAnim <= 0 && l.dizzy <= 0;

function covers(o, x, y, sight) {
  if (o.shape === "rect") return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
  return Math.hypot(x - o.x, y - o.y) < (sight ? o.sr : o.r);
}
// Сетки строятся «растеризацией»: каждое препятствие отмечает только клетки своего прямоугольника (быстро — уровень
// строится до LEVEL_ATTEMPTS раз). Правила те же, что у covers(): мелкая сетка — по центрам клеток FINE, крупная — по пересечению.
export function buildGrids() {
  G.moveGrid.fill(0); G.seeGrid.fill(0); G.blocked.fill(0); G.bigLearned.fill(0);   // SPEC-037: выученные клетки Большого — на уровень
  for (const o of G.obstacles) {
    if (!o.move && !o.sight) continue;
    const ext = o.shape === "rect" ? 0 : Math.max(o.r, o.sr || 0);
    const x0 = o.shape === "rect" ? o.x : o.x - ext, y0 = o.shape === "rect" ? o.y : o.y - ext;
    const x1 = o.shape === "rect" ? o.x + o.w : o.x + ext, y1 = o.shape === "rect" ? o.y + o.h : o.y + ext;
    const i0 = clamp(Math.floor(x0 / FINE) - 1, 0, FW - 1), i1 = clamp(Math.ceil(x1 / FINE) + 1, 0, FW - 1);
    const j0 = clamp(Math.floor(y0 / FINE) - 1, 0, FH - 1), j1 = clamp(Math.ceil(y1 / FINE) + 1, 0, FH - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * FINE, y = (j + 0.5) * FINE;
      if (o.move && covers(o, x, y, false)) G.moveGrid[j * FW + i] = 1;
      if (o.sight && covers(o, x, y, true)) G.seeGrid[j * FW + i] = 1;
    }
    if (!o.move) continue;
    const c0 = clamp(Math.floor(x0 / CELL) - 1, 0, COLS - 1), c1 = clamp(Math.floor(x1 / CELL) + 1, 0, COLS - 1);
    const r0 = clamp(Math.floor(y0 / CELL) - 1, 0, ROWS - 1), r1 = clamp(Math.floor(y1 / CELL) + 1, 0, ROWS - 1);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const px = cx * CELL, py = cy * CELL;
      let hit;
      if (o.shape === "rect") hit = px < o.x + o.w && px + CELL > o.x && py < o.y + o.h && py + CELL > o.y;
      else { const nx = clamp(o.x, px, px + CELL), ny = clamp(o.y, py, py + CELL); hit = Math.hypot(o.x - nx, o.y - ny) < o.r - 2; }
      if (hit) G.blocked[cy * COLS + cx] = 1;
    }
  }
  const sz = G.safeZone;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const k = j * FW + i;
    G.moveGridBig[k] = G.moveGrid[k] || (sz && covers(sz, (i + 0.5) * FINE, (j + 0.5) * FINE, false)) ? 1 : 0;
  }
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
    const px = cx * CELL, py = cy * CELL;
    G.blockedBig[cy * COLS + cx] = G.blocked[cy * COLS + cx] || (sz && px < sz.x + sz.w && px + CELL > sz.x && py < sz.y + sz.h && py + CELL > sz.y) ? 1 : 0;
  }
}
export const moveSolidAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? true : G.moveGrid[((y / FINE) | 0) * FW + ((x / FINE) | 0)] === 1;
export const moveSolidBigAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? true : G.moveGridBig[((y / FINE) | 0) * FW + ((x / FINE) | 0)] === 1 || trickDadSolid(x, y);   // SPEC-042: + a spray / a wave he keeps out of
const wallSeeAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? true : G.seeGrid[((y / FINE) | 0) * FW + ((x / FINE) | 0)] === 1;
export const seeSolidAt = (x, y) => wallSeeAt(x, y) || trickSightSolid(x, y);   // SPEC-042: + the ice-cream truck

export function los(x1, y1, x2, y2, solid) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 5);
  // SPEC-042: the truck hides only what is behind it — a viewer or a target standing inside its body is not hidden by it (walls always are)
  const own = solid === seeSolidAt ? trickSightOwn(x1, y1, x2, y2) : null;
  const blocked = own ? (x, y) => wallSeeAt(x, y) || (trickSightSolid(x, y) && !own.some(a => areaHas(a, x, y))) : solid;
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false; }
  return true;
}
export function losWide(x1, y1, x2, y2, r, solid = moveSolidAt) {
  const d = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / d * r, ny = (x2 - x1) / d * r;
  return los(x1, y1, x2, y2, solid) && los(x1 + nx, y1 + ny, x2 + nx, y2 + ny, solid) && los(x1 - nx, y1 - ny, x2 - nx, y2 - ny, solid);
}
