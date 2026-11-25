// SPEC-006 / SPEC-011: the Big One's numbers per world and level (speed, hearts, anger). Core module.
import { BOSSES, CFG, WORLDS, levelPos, worldDifficulty } from "./config.js";
import { bossFor } from "./mood.js";
import { G } from "./active.js";

// Сложность (SPEC-006): мир начинается с WORLD_SPEED_START[d] (d — индекс сложности мира, SPEC-016), каждый уровень мира
// +SPEED_PER_LEVEL; злость — каждое ЦЕЛОЕ потерянное сердечко +BIG_SPEED_PER_HIT. Ни одна скорость не больше BIG_CHASE_MAX (вместе со злостью).
const levelBoost = (world, n) => (CFG.WORLD_SPEED_START[worldDifficulty(world)] ?? CFG.WORLD_SPEED_START.at(-1)) + levelPos(n) * CFG.SPEED_PER_LEVEL;
const bigHearts = (world, n) => Math.min(CFG.BIG_HP_MAX, CFG.BIG_HP + Math.floor(levelPos(n) / CFG.HP_LEVELS_PER_HEART) + worldDifficulty(world) * CFG.HP_PER_WORLD);
const chaseCap = v => Math.min(CFG.BIG_CHASE_MAX, v);
// Единственный источник чисел Большого: { chase, search, patrol, hearts, boost } уровня (мир, n);
// lost — сколько сердечек уже отняли (злость), по умолчанию 0; boost — прибавка без потолка
// SPEC-022: босс (bossFor): злости больше на BOSS_EXTRA_HP (самый злой папа — MAIN_BOSS_EXTRA_HP), каждая скорость + BOSS_SPEED (с потолком)
export function difficulty(world, n, lost = 0) {
  const boost = levelBoost(world, n) + Math.floor(lost) * CFG.BIG_SPEED_PER_HIT, boss = bossFor(world, n), bs = boss ? CFG.BOSS_SPEED : 0;
  const extra = boss ? CFG[BOSSES[boss].extraHp] : 0;
  return { chase: chaseCap(CFG.BIG_CHASE_SPEED + boost + bs), search: chaseCap(CFG.BIG_CHASE_SPEED * 0.85 + boost + bs),
    patrol: chaseCap(CFG.BIG_PATROL_SPEED + boost * 0.5 + bs), hearts: bigHearts(world, n) + extra, boost };
}
const bigDifficulty = () => difficulty(G.world, G.level, G.big.maxHp - G.big.hp);
export const bigBoost = () => bigDifficulty().boost;                     // насколько Большой быстрее сейчас (без потолка)
// SPEC-029: в тренировке — скорости Парка 1 × TUTORIAL.speedMult (без прибавки за злость), настоящие уровни как были
export function bigSpeeds() {
  const d = G.tutorialGame ? difficulty(WORLDS[0], 1) : bigDifficulty(), m = G.tutorialGame ? CFG.TUTORIAL.speedMult : 1;
  return { chase: d.chase * m, search: d.search * m, patrol: d.patrol * m };
}
