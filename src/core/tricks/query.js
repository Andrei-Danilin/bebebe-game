// SPEC-042: the questions the rest of the core asks a world trick — one function per effect, each a plain read of the fields
// a trick's step wrote into G.trick.fx (kit.js newFx); with no trick in the game (practice, tutorial, a world without one) every
// answer is "no effect". A low module (it only reads G), so world / vision / hearing / rules / grid can import it. Core module.
import { CELL, CFG, COLS, FINE, FW, W as MAP_W, H as MAP_H } from "../config.js";
import { anyArea, areaHas } from "./kit.js";
import { G } from "../active.js";

// Dad cannot see l: l stands in a hiding area (a sprinkler's spray), like in a bush
export const trickHides = l => { const T = G.trick; return !!T && T.fx.hide.length > 0 && anyArea(T.fx.hide, l.x, l.y); };
// the point (x, y) blocks Dad's sight like a wall (the ice-cream truck)
export const trickSightSolid = (x, y) => { const T = G.trick; return !!T && T.fx.sight.length > 0 && anyArea(T.fx.sight, x, y); };
// the sight blockers (the truck) that the line (x1, y1) → (x2, y2) starts or ends inside: the viewer inside one is not blinded by it and a kid inside one is not
// hidden by it — a blocker hides only what stands behind it (world.js los drops these from the line's own samples); null — none
export function trickSightOwn(x1, y1, x2, y2) {
  const T = G.trick;
  if (!T || !T.fx.sight.length) return null;
  const own = T.fx.sight.filter(a => areaHas(a, x1, y1) || areaHas(a, x2, y2));
  return own.length ? own : null;
}
// Dad never stands at (x, y) (an active spray, the wave): the cell mask of fx.noDad
export const trickDadSolid = (x, y) => {
  const T = G.trick, m = T && T.fx.noDad;
  return !!m && x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && m[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)] === 1;
};
// the cell mask for Dad's A* (null: none) — grid.js adds it to his grid
export const trickDadCells = () => (G.trick ? G.trick.fx.noDad : null);
// a kid's speed factor from the ground (the wave: slowMul); 1 elsewhere
export const trickSpeedMul = l => { const T = G.trick; return T && T.fx.slow.length > 0 && anyArea(T.fx.slow, l.x, l.y) ? T.fx.slowMul : 1; };
// how many times HEAR_RADIUS a running kid is heard from (a puddle's splash); 1 — as usual
export const trickHearMul = l => { const T = G.trick; return (T && T.fx.loud[l.id]) || 1; };
// a kid should tiptoe here: on ground that gives him away (a puddle) while Dad is near enough to hear it (fx.quiet, fx.quietRange) — the bots and the careful autopilot
// (not once he is chasing: then there is nothing left to hide)
export const trickQuiet = l => { const T = G.trick; return !!T && T.fx.quiet.length > 0 && G.big.state !== "chase" && Math.hypot(l.x - G.big.x, l.y - G.big.y) <= T.fx.quietRange && anyArea(T.fx.quiet, l.x, l.y); };
// the price a kid's path (a bot's, the autopilot's) pays for the point (x, y): fx.kidCost on slow ground (a wave that is up), else 0 — and the straight line to a goal is not taken through it
export const trickKidCost = (x, y) => { const T = G.trick; return T && T.fx.kidCost && T.fx.slow.length > 0 && anyArea(T.fx.slow, x, y) ? T.fx.kidCost : 0; };
// the mark the trick puts over Dad ("" — none)
export const trickMark = () => (G.trick ? G.trick.fx.mark : "");
// a place for a bot or the autopilot to hide, within maxDist px of p (default fx.hideReach): the middle of an active spray, or the point just behind
// a sight blocker (the truck) as Dad sees it (on the line from him through its centre, free ground); the nearest one → { x, y, stop (px: how close to get) }; null if none
export function trickHideSpot(p, maxDist) {
  const T = G.trick;
  if (!T) return null;
  const reach = maxDist ?? T.fx.hideReach, H = CFG.TRICKS.hideSpot;
  let best = null, bd = reach;
  const take = (x, y, stop) => { const d = Math.hypot(x - p.x, y - p.y); if (d <= bd) { bd = d; best = { x, y, stop }; } };
  for (const a of T.fx.hide) take(a.x, a.y, a.r / 2);
  for (const a of T.fx.sight) {
    if (a.shape !== "rect") continue;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2, dx = cx - G.big.x, dy = cy - G.big.y, d = Math.hypot(dx, dy) || 1, off = Math.max(a.w, a.h) / 2 + H.behind;
    const ux = dx / d, uy = dy / d;
    for (const [sx, sy] of [[0, 0], [-uy * H.side, ux * H.side], [uy * H.side, -ux * H.side]]) {   // straight behind it, else a bit to either side
      const x = cx + ux * off + sx, y = cy + uy * off + sy;
      if (x > H.edge && y > H.edge && x < MAP_W - H.edge && y < MAP_H - H.edge && G.moveGrid[((y / FINE) | 0) * FW + ((x / FINE) | 0)] !== 1) { take(x, y, H.stop); break; }
    }
  }
  return best;
}
