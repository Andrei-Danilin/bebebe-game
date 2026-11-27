// SPEC-039 (from path.js and big.js): what the Big One sees — his view cone and the polygon of it, who he can see, who hides in a bush.
// Reads the active game's Big One and the walls (world.js); no movement, no paths. Core module.
import { CFG } from "./config.js";
import { angDiff } from "./util.js";
import { inSafe, los, seeSolidAt } from "./world.js";
import { G } from "./active.js";

// Большой «спокоен»: в шоке, отдыхает после толчка или краснеет — конус бледный (3D и мини-карта)
export const bigCalm = () => !!G.big.kind || G.big.stun > 0 || G.big.noPush > 0 || G.big.blush > 0;   // SPEC-022: подобревший идёт домой — луч спокойный
// многоугольник взгляда Большого в px мира: [x0, y0 (он сам), x1, y1, …] — n + 1 лучей, обрезанных стенами
// dir — куда он смотрит (по умолчанию G.big.dir; клиент в меню добавляет свой угол поворота)
export function visionPoly(n, out = [], dir = G.big.dir) {
  out.length = 2 * (n + 2); out[0] = G.big.x; out[1] = G.big.y;
  const a0 = dir - CFG.VISION_HALF;
  for (let i = 0; i <= n; i++) {
    const a = a0 + i * (2 * CFG.VISION_HALF / n), cx = Math.cos(a), sy = Math.sin(a);
    let r = 0;
    while (r < CFG.VISION_RANGE) { r += 5; if (seeSolidAt(G.big.x + cx * r, G.big.y + sy * r)) { r -= 5; break; } }
    out[2 * i + 2] = G.big.x + cx * r; out[2 * i + 3] = G.big.y + sy * r;
  }
  return out;
}
export function inCone(x, y) {
  const dx = x - G.big.x, dy = y - G.big.y, d = Math.hypot(dx, dy);
  return d < CFG.VISION_RANGE + 25 && angDiff(G.big.dir, Math.atan2(dy, dx)) < CFG.VISION_HALF + 0.2;
}
export const inBush = l => CFG.BUSH_HIDES && G.bushes.some(b => Math.hypot(l.x - b.x, l.y - b.y) < b.r - 6);
// Видит ли Большой l (SPEC-011: из big.js)
export function canSee(l) {
  if (inSafe(l)) return false;          // в домике Большой не видит и не трогает
  if (l.fx && l.fx.cloak > 0) return false;   // невидимка          // в домике Большой не видит и не трогает
  const dx = l.x - G.big.x, dy = l.y - G.big.y, d = Math.hypot(dx, dy);
  const diff = angDiff(G.big.dir, Math.atan2(dy, dx));
  if (d < G.big.r + l.r + 22 && diff < 1.9) return true;
  if (d > 45 && inBush(l)) return false;
  return d < CFG.VISION_RANGE && diff < CFG.VISION_HALF && los(G.big.x, G.big.y, l.x, l.y, seeSolidAt);
}
