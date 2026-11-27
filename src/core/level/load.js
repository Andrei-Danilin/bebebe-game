// SPEC-011 (from build.js): loading a level for the game — the attempt loop of validate.js, the cache of the accepted attempt. Core module.
import { CFG } from "../config.js";
import { applyWorld, generateLevel } from "./build.js";
import { levelKey, levelType } from "./generate.js";
import { buildLevel, validateLevel } from "./validate.js";
import { G } from "../active.js";

// Уровень для игры строится тем же циклом попыток, что проверяет levelReport (validateLevel, запасной вариант)
// G.levelInfo = { world, lv, type, attempt, fallback, cached, ms } — какой уровень сейчас построен (SPEC-012: в игре)
// уровень ("мир:n") → принятая попытка: перезапуск и стрелки в меню строят её сразу, без перебора попыток.
// Если она вдруг не проходит проверку (поменяли CFG) — запись удаляется и уровень строится заново с попытки 0,
// как в levelReport.
const levelCache = new Map();
export const clearLevelCache = () => levelCache.clear();
export function loadLevel(world, lv) {
  const t0 = performance.now(), type = levelType(world, lv), key = levelKey(world, lv), c = levelCache.get(key);
  if (c !== undefined && c < CFG.LEVEL_ATTEMPTS) {
    const gen = generateLevel(world, lv, c);
    applyWorld(gen);
    const rep = validateLevel(gen, type);
    if (rep.ok) { G.reachable = rep.seen; G.levelInfo = { world, lv, type, attempt: c, fallback: false, cached: true, ms: performance.now() - t0 }; return; }
  }
  levelCache.delete(key);
  const r = buildLevel(world, lv);
  if (!r.fallback) levelCache.set(key, r.attempt);
  G.levelInfo = { world, lv, type: r.type, attempt: r.attempt, fallback: r.fallback, cached: false, ms: r.ms };
}
