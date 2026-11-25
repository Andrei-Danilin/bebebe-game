// SPEC-022 / SPEC-011: the Big One's mood (anger), the bosses of the levels, the kind walk home after the last hug. Core module.
import { BOSSES, CFG, levelsPerWorld } from "./config.js";
import { dist, turnToward } from "./util.js";
import { nearestExit } from "./bots.js";
import { steerTo } from "./path.js";
import { winNow } from "./rules.js";
import { G } from "./active.js";
import { emit } from "./game.js";

// босс уровня — последний уровень мира из BOSSES (его имя = мир); иначе null
export const bossFor = (world, n) => (Object.hasOwn(BOSSES, world) && Math.floor(n) === levelsPerWorld() ? world : null);
export const bossPower = boss => (boss && BOSSES[boss] ? BOSSES[boss].power : null);
// SPEC-022: настроение папы по доле злости (для вида: лицо, пар, сердечки — SPEC-022 часть B рисует по нему)
export function bigMood() {
  const f = G.big && G.big.maxHp > 0 ? G.big.hp / G.big.maxHp : 0;
  return f >= CFG.MOOD_ANGRY ? "angry" : f >= CFG.MOOD_MID ? "mid" : "kind";
}
// SPEC-022: последняя обнимашка доиграла (правило детей) — папа добреет: краснеет, сердечки, друзья кричат «Ура!», идёт к двери
// своего дома (не дольше KIND_WALK; часы уровня стоят — звезда «быстро» как раньше). Дошёл или время вышло — экран победы
export function startKindWalk() {
  Object.assign(G.big, { kind: true, stun: 0, slip: 0, pushCd: 0, blush: 0, path: [], state: "look", noise: 0, hearTurnT: 0, hearLook: 0 });   // своё состояние: ни шока, ни толчков, ни румянца-поцелуя
  G.big.home = nearestExit(G.big);
  G.pendingWin = CFG.KIND_WALK; G.phase = "kindWalk";
  emit("burst", { kind: "heart", x: G.big.x, y: G.big.y - 30, n: CFG.KIND_HEARTS, color: "#ff4d8d" });
  for (const l of G.littles) if (l.state === "ok") emit("pop", { key: "cheer", args: [], x: l.x, y: l.y - 40, color: "#facc15" });
  emit("sfx", { name: "mwah" });
}
export function updateKindWalk(dt) {
  for (const l of G.littles) { l.moving = false; l.speedFrac = 0; if (l.state === "ok" && l.hugAnim <= 0) l.dir = turnToward(l.dir, Math.atan2(G.big.y - l.y, G.big.x - l.x), CFG.KIND_TURN * dt); }
  const g = G.big.home;
  G.big.moving = !!g && dist(G.big, g) > CFG.KIND_ARRIVE && steerTo(G.big, g.x, g.y, CFG.KIND_SPEED, dt, false);
  if (G.big.moving) G.big.dir = turnToward(G.big.dir, G.big.moveDir, CFG.KIND_TURN * dt);
  if (!G.big.moving) winNow();                               // у двери (или пути нет) — сразу победа
}
