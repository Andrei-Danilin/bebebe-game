// SPEC-022 / SPEC-011: the Big One's mood (anger) and the bosses of the levels. SPEC-039: a leaf — the kind walk home after the last hug
// moved to kindwalk.js, which needs the rules (winNow); the rules read the mood. Core module.
import { BOSSES, CFG, levelsPerWorld } from "./config.js";
import { G } from "./active.js";

// босс уровня — последний уровень мира из BOSSES (его имя = мир); иначе null
export const bossFor = (world, n) => (Object.hasOwn(BOSSES, world) && Math.floor(n) === levelsPerWorld() ? world : null);
export const bossPower = boss => (boss && BOSSES[boss] ? BOSSES[boss].power : null);
// SPEC-022: настроение папы по доле злости (для вида: лицо, пар, сердечки — SPEC-022 часть B рисует по нему)
export function bigMood() {
  const f = G.big && G.big.maxHp > 0 ? G.big.hp / G.big.maxHp : 0;
  return f >= CFG.MOOD_ANGRY ? "angry" : f >= CFG.MOOD_MID ? "mid" : "kind";
}
