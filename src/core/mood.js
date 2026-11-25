// SPEC-022 / SPEC-011: the Big One's mood (anger), the bosses of the levels, the kind walk home after the last hug. Core module.
import { BOSSES, CFG, levelsPerWorld } from "./config.js";
import { hooks } from "./hooks.js";
import { dist, turnToward } from "./util.js";
import { L } from "../i18n.js";
import { nearestExit } from "./bots.js";
import { big, littles, setPendingWin } from "./game.js";
import { steerTo } from "./path.js";
import { winNow } from "./rules.js";

// босс уровня — последний уровень мира из BOSSES (его имя = мир); иначе null
export const bossFor = (world, n) => (Object.hasOwn(BOSSES, world) && Math.floor(n) === levelsPerWorld() ? world : null);
export const bossPower = boss => (boss && BOSSES[boss] ? BOSSES[boss].power : null);
// SPEC-022: настроение папы по доле злости (для вида: лицо, пар, сердечки — SPEC-022 часть B рисует по нему)
export function bigMood() {
  const f = big && big.maxHp > 0 ? big.hp / big.maxHp : 0;
  return f >= CFG.MOOD_ANGRY ? "angry" : f >= CFG.MOOD_MID ? "mid" : "kind";
}
// SPEC-022: последняя обнимашка доиграла (правило детей) — папа добреет: краснеет, сердечки, друзья кричат «Ура!», идёт к двери
// своего дома (не дольше KIND_WALK; часы уровня стоят — звезда «быстро» как раньше). Дошёл или время вышло — экран победы
export function startKindWalk() {
  Object.assign(big, { kind: true, stun: 0, slip: 0, pushCd: 0, blush: 0, path: [], state: "look", noise: 0, hearTurnT: 0, hearLook: 0 });   // своё состояние: ни шока, ни толчков, ни румянца-поцелуя
  big.home = nearestExit(big);
  setPendingWin(CFG.KIND_WALK);
  hooks.burst(big.x, big.y - 30, "heart", "#ff4d8d", CFG.KIND_HEARTS);
  for (const l of littles) if (l.state === "ok") hooks.pop(l.x, l.y - 40, L().cheer, "#facc15");
  hooks.sfx("mwah");
}
export function updateKindWalk(dt) {
  for (const l of littles) { l.moving = false; l.speedFrac = 0; if (l.state === "ok" && l.hugAnim <= 0) l.dir = turnToward(l.dir, Math.atan2(big.y - l.y, big.x - l.x), CFG.KIND_TURN * dt); }
  const g = big.home;
  big.moving = !!g && dist(big, g) > CFG.KIND_ARRIVE && steerTo(big, g.x, g.y, CFG.KIND_SPEED, dt, false);
  if (big.moving) big.dir = turnToward(big.dir, big.moveDir, CFG.KIND_TURN * dt);
  if (!big.moving) winNow();                               // у двери (или пути нет) — сразу победа
}
