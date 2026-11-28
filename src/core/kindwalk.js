// SPEC-022 / SPEC-011 (from mood.js): the kind walk home after the last hug. Core module.
import { CFG } from "./config.js";
import { dist, turnToward } from "./util.js";
import { emit } from "./events.js";
import { nearestExit } from "./grid.js";
import { steerTo } from "./path.js";
import { winNow } from "./rules.js";
import { G } from "./active.js";

// SPEC-022: последняя обнимашка доиграла (правило детей) — папа добреет: краснеет, сердечки, друзья кричат «Ура!», идёт к двери
// своего дома (не дольше KIND_WALK; часы уровня стоят — звезда «быстро» как раньше). Дошёл или время вышло — экран победы
export function startKindWalk() {
  Object.assign(G.big, { kind: true, stun: 0, slip: 0, slideT: 0, watch: 0, cake: 0, pushCd: 0, blush: 0, path: [], state: "look", noise: 0, hearTurnT: 0, hearLook: 0 });   // своё состояние: ни шока, ни толчков, ни румянца-поцелуя
  G.big.home = nearestExit(G.big);
  G.pendingWin = CFG.KIND_WALK; G.phase = "kindWalk";
  emit("burst", { kind: "heart", x: G.big.x, y: G.big.y - 30, n: CFG.KIND_HEARTS, color: "#ff4d8d" });
  for (const l of G.littles) if (l.state === "ok") emit("pop", { key: "cheer", args: [], x: l.x, y: l.y - 40, color: "#facc15" });
  emit("sfx", { name: "kind", slot: "big" });                           // SPEC-047: Dad turns kind (before the win jingle)
}
export function updateKindWalk(dt) {
  for (const l of G.littles) { l.moving = false; l.speedFrac = 0; if (l.state === "ok" && l.hugAnim <= 0) l.dir = turnToward(l.dir, Math.atan2(G.big.y - l.y, G.big.x - l.x), CFG.KIND_TURN * dt); }
  const g = G.big.home;
  G.big.moving = !!g && dist(G.big, g) > CFG.KIND_ARRIVE && steerTo(G.big, g.x, g.y, CFG.KIND_SPEED, dt, false);
  if (G.big.moving) G.big.dir = turnToward(G.big.dir, G.big.moveDir, CFG.KIND_TURN * dt);
  if (!G.big.moving) winNow();                               // у двери (или пути нет) — сразу победа
}
