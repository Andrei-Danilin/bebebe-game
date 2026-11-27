// SPEC-042: what every world trick shares — the module shape, the pieces' geometry in cells, the placement helpers of the generator
// and the effect fields a trick writes each step (G.trick.fx). A low module (config and util only). Core module.
import { CFG, COLS, ROWS } from "../config.js";

// SPEC-042 AC 1: a trick is a module { name, place, validate, init, step, bigStep, … } (every one optional beyond name). The game calls:
//   place(pcx) → pieces[]   the generator (build.js layoutLevel), after the layout is mirrored; pcx = placeCtx(...): seeded, in final cells
//   validate(T, gen) → string[]   extra fairness fails of this trick (index.js already checks house / apron / blocked / path)
//   init(T)                 a game starts (buildGame): T = G.trick, set T.st (the trick's own state: timers, trails) from T.pieces
//   step(T, dt)             every fixed step, after the kids moved and before Dad decides: timers, splashes, prints; writes T.fx
//   fit(trick)              applyWorld, once the layout is on the grids and fitTrick dropped what would shut the way: the pieces that are left get their final fields
//   bigStep(T, dt) → bool   inside updateBig, once Dad can act: may change his state; true = he spent the step (the bell holds him)
// Everything a trick keeps is plain data in G.trick (SPEC-012: a game is plain data; the server steps the same). Effects the rest of the
// core asks for are the fields of T.fx, read by query.js — a trick never edits big.js / vision.js / hearing.js itself.
/** @typedef {{ shape: "circle", cx: number, cy: number, r: number } | { shape: "rect", x: number, y: number, w: number, h: number }} Area   in cells (cx, cy — a centre in cell coordinates) */
/** @typedef {{ name: string, pieces: any[], meta?: any }} TrickGen   what the generator puts into gen.trick */
/** @typedef {{ hide: any[], sight: any[], noDad: Uint8Array | null, slow: any[], slowMul: number, loud: Record<number, number>, quiet: any[], quietRange: number, hideReach: number, freeze: number, mark: string }} TrickFx   the effect fields (areas in px) */
/** @typedef {{ name: string, pieces: any[], meta: any, st: any, fx: TrickFx, t: number }} Trick   G.trick */

// the effect fields (query.js reads them; a trick's step rewrites the ones it uses, the rest stay empty — a no-op)
//   hide      areas (px) where a kid is hidden from Dad's eyes, like in a bush           (vision.js canSee)
//   sight     areas (px) that block Dad's line of sight like a wall (the truck)           (world.js seeSolidAt)
//   noDad     Uint8Array(COLS*ROWS) or null: cells Dad never enters (a spray, a wave)     (world.js moveSolidBigAt, grid.js bigGrid)
//   slow      areas (px) where a kid moves at slowMul of its speed (the wave)            (rules.js moveSpeed)
//   loud      { kidId: multiplier } — the kid is heard from multiplier × HEAR_RADIUS      (hearing.js audible)
//   quiet     areas (px) where a kid tiptoes while Dad is within quietRange px — bots and the careful autopilot (puddles)  (query.js trickQuiet)
//   hideReach px: how near a bot looks for a place to hide (query.js trickHideSpot: the middle of an active spray, the far side of a sight blocker from Dad)
//   freeze    0 | 1 | 2: the bell — 1 warning (bots tiptoe), 2 ringing (bots stand still) while they are near Dad or in his sight  (query.js trickFreeze)
//   mark      a mark over Dad's head while the trick holds him ("🔔")                                                     (hearing.js bigMark)
export const newFx = () => ({ hide: [], sight: [], noDad: null, slow: [], slowMul: 1, loud: {}, quiet: [], quietRange: 0, hideReach: 0, freeze: 0, mark: "" });

// ---------- areas ----------
// an area in px — { shape: "circle", x, y, r } or { shape: "rect", x, y, w, h } (the fx fields; pieces are in cells, a trick converts)
export function areaHas(a, x, y) {
  if (a.shape === "rect") return x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;
  return Math.hypot(x - a.x, y - a.y) <= a.r;
}
export const anyArea = (list, x, y) => { for (const a of list) if (areaHas(a, x, y)) return true; return false; };
// the cells (index into COLS*ROWS) a piece covers: a circle — cells it touches; a rect — its cells; `cells` (a list of [x, y]) — those, as given
export function cellsOf(p) {
  const out = [];
  if (p.cells) { for (const [x, y] of p.cells) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) out.push(y * COLS + x); return out; }
  if (p.shape === "rect") {
    for (let y = Math.max(0, Math.floor(p.y)); y < Math.min(ROWS, Math.ceil(p.y + p.h)); y++) for (let x = Math.max(0, Math.floor(p.x)); x < Math.min(COLS, Math.ceil(p.x + p.w)); x++) out.push(y * COLS + x);
    return out;
  }
  const x0 = Math.max(0, Math.floor(p.cx - p.r)), x1 = Math.min(COLS - 1, Math.floor(p.cx + p.r)), y0 = Math.max(0, Math.floor(p.cy - p.r)), y1 = Math.min(ROWS - 1, Math.floor(p.cy + p.r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = Math.min(Math.max(p.cx, x), x + 1), ny = Math.min(Math.max(p.cy, y), y + 1);   // the nearest point of the cell to the centre
    if (Math.hypot(p.cx - nx, p.cy - ny) < p.r) out.push(y * COLS + x);
  }
  return out;
}
export const cellOfPiece = p => (p.shape === "rect" ? [Math.floor(p.x + p.w / 2), Math.floor(p.y + p.h / 2)] : [Math.floor(p.cx), Math.floor(p.cy)]);

// ---------- the map of the finished layout (final cells, after the mirror) ----------
// what a trick piece must keep out of — the houses (the small ones' 7×6 and the Big One's floor with its walls) and DOOR_APRON rows in front of each door
// → { house, apron } Uint8Array(COLS*ROWS) each
export function forbiddenCells(gen) {
  const house = new Uint8Array(COLS * ROWS), apron = new Uint8Array(COLS * ROWS);
  const fill = (m, x0, y0, w, h) => { for (let y = Math.max(0, y0); y < Math.min(ROWS, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(COLS, x0 + w); x++) m[y * COLS + x] = 1; };
  for (const it of gen.items) {
    if (it.t === "safe") fill(house, it.x, it.y, it.w, it.h);
    else if (it.t === "danger") fill(house, it.x - 1, it.y - 1, it.w + 2, it.h + 2);
  }
  const doors = gen.doors || { small: [], big: [] };
  for (const d of [...doors.small, ...doors.big]) {
    fill(apron, d.x, d.y, d.w, d.h);
    for (let k = 1; k <= CFG.DOOR_APRON; k++) fill(apron, d.x + d.dx * k, d.y + d.dy * k, d.w, d.h);
  }
  return { house, apron };
}
// the cells the layout itself fills (walls, cottages, water, ponds, trees, rocks, bushes) plus the houses and aprons
export function occupiedCells(gen) {
  const occ = new Uint8Array(COLS * ROWS), { house, apron } = forbiddenCells(gen);
  const fill = (x0, y0, w, h) => { for (let y = Math.max(0, y0); y < Math.min(ROWS, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(COLS, x0 + w); x++) occ[y * COLS + x] = 1; };
  for (const it of gen.items) {
    if (it.t === "wall" || it.t === "cottage" || it.t === "water" || it.t === "pond") fill(it.x, it.y, it.w, it.h);
    else if (it.t === "tree" || it.t === "rock") fill(it.x, it.y, 1, 1);
    else if (it.t === "bush") fill(it.x, it.y, 2, 2);
  }
  for (let i = 0; i < occ.length; i++) if (house[i] || apron[i]) occ[i] = 1;
  return occ;
}
// SPEC-042: the context a trick's place() gets. rng — its own seeded stream (never the layout's: a level looks the same with tricks on or off,
// and never the game's rng()). free(x, y, w, h, m): the w×h cells and m cells around are inside the map and not occupied; take(x, y, w, h)
// occupies them (the next piece keeps its distance); spot(w, h, m, ok?) — a random free place or null; bad(piece) — it touches a house or an apron.
export function placeCtx(world, gen, lv, type, tier, rng) {
  const occ = occupiedCells(gen), { house, apron } = forbiddenCells(gen), ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const free = (x, y, w, h, m = 0) => {
    for (let yy = y - m; yy < y + h + m; yy++) for (let xx = x - m; xx < x + w + m; xx++) {
      if (xx < 0 || yy < 0 || xx >= COLS || yy >= ROWS) { if (xx >= x && xx < x + w && yy >= y && yy < y + h) return false; continue; }
      if (occ[yy * COLS + xx]) return false;
    }
    return true;
  };
  const take = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < COLS && yy < ROWS) occ[yy * COLS + xx] = 1; };
  const spot = (w = 1, h = 1, m = 0, ok = null) => {
    for (let k = 0; k < 500; k++) {
      const x = ri(0, COLS - w), y = ri(0, ROWS - h);
      if (free(x, y, w, h, m) && (!ok || ok(x, y))) return { x, y };
    }
    return null;
  };
  // bad(piece): the piece touches a house or a door apron (a piece with a wide footprint — a spray — asks it before it takes a spot)
  const bad = p => cellsOf(p).some(i => house[i] || apron[i]);
  return { world, lv, type, tier, rng, ri, items: gen.items, doors: gen.doors, occ, free, take, spot, bad };
}
// the default (no-op) hooks of a trick module: a module is `{ name, ...NO_HOOKS, place, … }` and overrides what it needs
export const NO_HOOKS = Object.freeze({
  place: () => [],
  validate: () => [],
  init: () => {},
  step: () => {},
  bigStep: () => false,
  fit: () => {}
});
