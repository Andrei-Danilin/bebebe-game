// SPEC-042: what a kid may ask about Dad's eyes — the one question that needs the walls (world.js los), so it lives above query.js. Core module.
import { CELL, CFG } from "../config.js";
import { los, seeSolidAt } from "../world.js";
import { G } from "../active.js";

// the bell (fx.freeze 1 warning / 2 ring) for a kid who is near Dad (HEAR_RADIUS cells) or in his sight (VISION_RANGE, a clear line): 0 — nothing; 1 — tiptoe; 2 — stand still.
// Not while Dad chases
export function trickFreeze(l) {
  const T = G.trick;
  if (!T || !T.fx.freeze || G.big.state === "chase") return 0;
  const d = Math.hypot(l.x - G.big.x, l.y - G.big.y), near = CFG.HEAR_RADIUS * CELL;
  if (d > CFG.VISION_RANGE && d > near) return 0;
  if (d > near && !los(G.big.x, G.big.y, l.x, l.y, seeSolidAt)) return 0;   // beyond the near circle: only if he could see him
  return T.fx.freeze;
}
