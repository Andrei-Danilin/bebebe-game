// SPEC-047 AC 8: the sound loops of a level — a pure query of the game state (no rng, nothing written), so the core stays deterministic
// and online play can ask it of any snapshot. The client asks once per frame (src/client/sound.js audioTick → audio/sfx.js setLoops) and starts or stops the
// loops that came or went. The one-shot sounds are `sfx` effect events (events.js emit). Core module.
import { CELL, CFG } from "./config.js";
import { dist } from "./util.js";
import { isRunning } from "./hearing.js";
import { helps } from "./rules.js";
import { inDanger } from "./world.js";
import { G } from "./active.js";

/** the loop sounds, in the order wantedLoops lists them */
export const LOOP_NAMES = Object.freeze(["rescue_loop", "dizzy", "danger_tick", "run_steps", "tiptoe_steps"]);

/**
 * The loops that should sound now:
 * - rescue_loop: a player stands by a friend who lies (only while a PLAYER helps — a bot's help is silent);
 * - dizzy: Dad lies after a banana (or a melon, a ball …);
 * - danger_tick: a player is inside Dad's house;
 * - run_steps / tiptoe_steps: a player runs / tiptoes within HEAR_RADIUS of Dad.
 * `local` — the slots whose players are on this device (null: every player — a local game). Nothing sounds outside play.
 * @param {string[] | null} [local]
 * @returns {string[]}
 */
export function wantedLoops(local = null) {
  const g = G;
  if (!g || !g.big || g.phase !== "play") return [];
  const mine = l => l.kind === "player" && (!local || local.includes(l.slot));
  const on = new Set();
  if (g.littles.some(d => d.state === "down" && g.littles.some(o => mine(o) && o.state === "ok" && helps(o, d)))) on.add("rescue_loop");
  if (!g.big.kind && g.big.slip > 0) on.add("dizzy");
  if (g.littles.some(l => mine(l) && l.state === "ok" && l.hugAnim <= 0 && inDanger(l))) on.add("danger_tick");
  if (!g.big.kind) {
    const near = CFG.HEAR_RADIUS * CELL;
    for (const l of g.littles) {
      if (!mine(l) || l.state !== "ok" || !l.moving || dist(l, g.big) > near) continue;
      on.add(isRunning(l) ? "run_steps" : "tiptoe_steps");
    }
  }
  return LOOP_NAMES.filter(n => on.has(n));
}
