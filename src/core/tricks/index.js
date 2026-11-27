// SPEC-042: the world tricks — the registry (which module is a world's trick: CFG.WORLD_TRICK) and the calls the game makes: the generator
// places a trick's pieces (placeTrick), the validator checks them (validateTrick), applyWorld makes G.trick from them (makeTrick), a game
// start resets it (initTrick), every fixed step runs it (stepTrick, bigStepTrick). The questions the rest of the core asks are in
// query.js, the shape of a trick module and the helpers in kit.js. Core module.
import { CFG, COLS, ROWS } from "../config.js";
import { mulberry32 } from "../util.js";
import { G } from "../active.js";
import { cellOfPiece, cellsOf, forbiddenCells, newFx, placeCtx } from "./kit.js";
import { bell } from "./bell.js";
import { footprints } from "./footprints.js";
import { puddles } from "./puddles.js";
import { sprinklers } from "./sprinklers.js";
import { truck } from "./truck.js";
import { waves } from "./waves.js";

// SPEC-042 AC 1: the tricks by name (a test may swap one for a fake; the world → name table is CFG.WORLD_TRICK)
export const TRICK_MODS = { puddles, sprinklers, truck, bell, waves, footprints };
// a world's trick name, or null: switched off (TRICKS_ON 0), a world with none, a name no module has
export function trickOf(world) {
  const n = CFG.TRICKS_ON ? CFG.WORLD_TRICK[world] : null;
  return n && TRICK_MODS[n] ? n : null;
}
// the generator's call (build.js layoutLevel): the pieces of the world's trick for this attempt, in cells of the finished (mirrored) map,
// from its own seeded stream (seed — from the level seed and the attempt) → { name, pieces, meta } or null. gen: { items, doors }
export function placeTrick(world, gen, lv, type, tier, seed) {
  const name = trickOf(world);
  if (!name) return null;
  const mod = TRICK_MODS[name], pcx = placeCtx(world, gen, lv, type, tier, mulberry32(seed));
  const r = mod.place(pcx) || [], pieces = Array.isArray(r) ? r : r.pieces || [];
  return { name, pieces, meta: (!Array.isArray(r) && r.meta) || {} };
}
// the validator's call (validate.js validateLevel, after applyWorld): the fairness fails of the trick's pieces — none in a house or its door apron,
// inside the map, the centre on free ground (a module with `ground: "none"` — the wave's water — is exempt), and a trick that keeps Dad out
// (`blocksDad`) leaves a path between the houses' doors (housePath(grid) → cells, −1 if none; the same A* as the housePath rule)
export function validateTrick(gen, housePath) {
  const t = gen.trick, fails = [];
  if (!t) return fails;
  const mod = TRICK_MODS[t.name];
  if (!mod) return ["trick:unknown"];
  const { house, apron } = forbiddenCells(gen), cells = [];
  for (const p of t.pieces) {
    const cs = cellsOf(p), [cx, cy] = cellOfPiece(p);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) fails.push("trick:bounds");
    if (cs.some(i => house[i])) fails.push("trick:house");
    if (cs.some(i => apron[i])) fails.push("trick:apron");
    if (mod.ground !== "none" && G.blocked[cy * COLS + cx]) fails.push("trick:blocked");
    cells.push(...cs);
  }
  if (mod.blocksDad && cells.length && housePath) {
    const grid = Uint8Array.from(G.blockedBig);
    for (const i of cells) grid[i] = 1;
    const base = housePath(G.blockedBig), now = housePath(grid);
    if (now < 0 || (base >= 0 && now > Math.max(base, CFG.HOUSE_PATH[1]))) fails.push("trick:path");
  }
  for (const f of mod.validate(t, gen) || []) fails.push(f);
  return [...new Set(fails)];
}
// applyWorld's call: the game's trick from the generator's — plain data (null: none, the practice and tutorial maps have no gen.trick)
export function makeTrick(gt) {
  return gt ? { name: gt.name, pieces: structuredClone(gt.pieces), meta: structuredClone(gt.meta || {}), st: {}, fx: newFx(), t: 0 } : null;
}
// buildGame's call (the stats are reset, the practice map has no trick): the trick starts from zero
export function initTrick() {
  const T = G.trick;
  if (!T) return;
  T.t = 0; T.st = {}; T.fx = newFx();
  const mod = TRICK_MODS[T.name];
  if (mod) mod.init(T);
}
// update's call, each fixed step, after the kids moved and before Dad decides; never in a practice game
export function stepTrick(dt) {
  const T = G.trick;
  if (!T || G.tutorialGame) return;
  T.t += dt;
  const mod = TRICK_MODS[T.name];
  if (mod) mod.step(T, dt);
}
// updateBig's call (Dad can act: not stunned, slipping, red or resting): true — the trick took his step
export function bigStepTrick(dt) {
  const T = G.trick;
  if (!T || G.tutorialGame) return false;
  const mod = TRICK_MODS[T.name];
  return !!mod && !!mod.bigStep(T, dt);
}
