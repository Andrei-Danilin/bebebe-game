// SPEC-042: the questions the rest of the core asks a world trick — one function per effect, each a plain read of the fields
// a trick's step wrote into G.trick.fx (kit.js newFx); with no trick in the game (practice, tutorial, a world without one) every
// answer is "no effect". A low module (it only reads G), so world / vision / hearing / rules / grid can import it. Core module.
import { CELL, COLS, W, H } from "../config.js";
import { anyArea } from "./kit.js";
import { G } from "../active.js";

// Dad cannot see l: l stands in a hiding area (a sprinkler's spray), like in a bush
export const trickHides = l => { const T = G.trick; return !!T && T.fx.hide.length > 0 && anyArea(T.fx.hide, l.x, l.y); };
// the point (x, y) blocks Dad's sight like a wall (the ice-cream truck)
export const trickSightSolid = (x, y) => { const T = G.trick; return !!T && T.fx.sight.length > 0 && anyArea(T.fx.sight, x, y); };
// Dad never stands at (x, y) (an active spray, the wave): the cell mask of fx.noDad
export const trickDadSolid = (x, y) => {
  const T = G.trick, m = T && T.fx.noDad;
  return !!m && x >= 0 && y >= 0 && x < W && y < H && m[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)] === 1;
};
// the cell mask for Dad's A* (null: none) — grid.js adds it to his grid
export const trickDadCells = () => (G.trick ? G.trick.fx.noDad : null);
// a kid's speed factor from the ground (the wave: slowMul); 1 elsewhere
export const trickSpeedMul = l => { const T = G.trick; return T && T.fx.slow.length > 0 && anyArea(T.fx.slow, l.x, l.y) ? T.fx.slowMul : 1; };
// how many times HEAR_RADIUS a running kid is heard from (a puddle's splash); 1 — as usual
export const trickHearMul = l => { const T = G.trick; return (T && T.fx.loud[l.id]) || 1; };
