// SPEC-011: the Big One — what he sees, how he looks, chases, searches and patrols. Core module.
import { CELL, CFG } from "./config.js";
import { angDiff, dist, rand, rng, turnToward } from "./util.js";
import { bigSpeeds } from "./difficulty.js";
import { bigDeaf, hearNoise, stopHearing } from "./hearing.js";
import { bigReach, cellIdx, randomFreePoint, reachableGoal } from "./grid.js";
import { moveEntity, steerTo } from "./path.js";
import { pushHit } from "./rules.js";
import { canSee } from "./vision.js";
import { G } from "./active.js";
import { emit } from "./events.js";

// SPEC-012 AC 4: a Big One a player moves (G.inputs.big): his timers run, he walks where the stick points at his chase speed
// (not while stunned, slipping or red); no AI — no seeing, chasing, hearing or patrol (the push and button rules: SPEC-015)
export function updateBigPlayer(dt) {
  const b = G.big, inp = G.inputs.big;
  b.flash = Math.max(0, b.flash - dt); b.hugCd = Math.max(0, b.hugCd - dt); b.noPush = Math.max(0, b.noPush - dt);
  b.pushCd = Math.max(0, b.pushCd - dt); b.blush = Math.max(0, b.blush - dt);
  b.moving = false;
  if (b.slip > 0) { b.slip -= dt; return; }
  if (b.stun > 0) { b.stun -= dt; b.dir = turnToward(b.dir, b.stunFace, b.stunTurn * dt); return; }
  if (b.blush > 0 || !inp) return;
  let x = inp.mx, y = inp.my;
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  if (d < 0.05) return;
  const sp = bigSpeeds().chase;
  moveEntity(b, x * sp, y * sp, dt);
  b.dir = Math.atan2(y, x); b.walk += dt * sp / 14; b.moving = true;
}
// SPEC-037: идёт, а двигается меньше BIG_UNSTUCK_MOVE клеток уже BIG_UNSTUCK_TIME сек (упёрся) — пора менять цель. Окно (big.prog, меняется на месте)
// не копится, пока он стоял иначе: шаг без вызова сбрасывает его
function bigStuck(dt) {
  const b = G.big, now = G.stats.time, p = b.prog;
  if (!(CFG.BIG_UNSTUCK_TIME > 0)) return false;
  if (now - p.last > 2 * dt || dist(b, p) >= CFG.BIG_UNSTUCK_MOVE * CELL) { p.x = b.x; p.y = b.y; p.t = 0; p.last = now; return false; }
  p.t += dt; p.last = now;
  return p.t >= CFG.BIG_UNSTUCK_TIME;
}
const unstuck = () => { G.big.prog.last = -1; };   // новая цель — окно с нуля
// упёрся в лежащего друга: стоит вплотную к нему (separate() держит их на r + r) и друг — по ходу движения (не за спиной)
const pressedByFriend = () => G.littles.some(l => l.state === "down" && dist(G.big, l) < G.big.r + l.r + CELL / 16 &&
  angDiff(G.big.moveDir, Math.atan2(l.y - G.big.y, l.x - G.big.x)) < Math.PI / 2);
// SPEC-037: клетка пути, до которой он не дошёл (дерево у края, щель уже его ширины — A* считает клетку свободной), для него стена на этот уровень
// (G.bigLearned, не данные уровня; только гуляя и ища). Не когда он упёрся в лежащего друга — тот встанет; и не если клетка отрезала бы от него другие клетки
function learnBlocked() {
  const b = G.big, p = b.path[0];
  if (!p || pressedByFriend()) return;   // он упёрся в друга, не в стену
  const i = cellIdx(p.x, p.y);
  if (i === cellIdx(b.x, b.y) || G.blockedBig[i] || G.bigLearned[i]) return;
  const before = bigReach(true);   // как стоят стены, без лежащих друзей: они встанут
  G.bigLearned[i] = 1;
  const after = bigReach(true);
  for (let k = 0; k < after.length; k++) if (k !== i && before[k] && !after[k]) { G.bigLearned[i] = 0; return; }
}
// точка прогулки: достижимая; не ближе двух клеток к нему самому (иначе look → короткий шаг → look на месте, пока вокруг лежат друзья): тогда — достижимая, если не считать лежащих друзей, иначе случайная
const ARRIVE = 12;   // px — ближе к цели прогулки — дошёл
function newGoal() {
  let p = randomFreePoint();
  if (CFG.BIG_UNSTUCK_TIME > 0 || CFG.BIG_DETOUR_COST > 0) {
    let q = reachableGoal(p.x, p.y);
    if (dist(q, G.big) < 2 * CELL) q = reachableGoal(p.x, p.y, true);
    if (dist(q, G.big) >= 2 * CELL) p = q;
  }
  return p;
}
export function updateBig(dt) {
  G.big.flash = Math.max(0, G.big.flash - dt);
  G.big.hugCd = Math.max(0, G.big.hugCd - dt);
  G.big.moving = false;
  G.big.noPush = Math.max(0, G.big.noPush - dt);
  G.big.hearCd = Math.max(0, G.big.hearCd - dt);
  if (bigDeaf()) stopHearing();
  if (G.big.blush > 0) {                                   // покраснел: время идёт и пока лежит после банана
    G.big.blush = Math.max(0, G.big.blush - dt);
    if (G.big.blush <= 0 && G.big.slip <= 0 && G.big.stun <= 0) {   // прошло — поворачивается к тому, кто бросил, и в погоню
      const th = G.littles[G.big.blushBy] || G.littles[0];
      G.big.state = "chase"; G.big.lastSeen = { x: th.x, y: th.y };
      G.big.dir = Math.atan2(th.y - G.big.y, th.x - G.big.x); G.big.path = [];
      return;
    }
  }
  if (G.big.slip > 0) { G.big.slip -= dt; G.big.moving = false; if (G.big.slip <= 0) { G.big.state = "look"; G.big.timer = 0.8; } return; }
  if (G.big.stun > 0) { G.big.stun -= dt; G.big.dir = turnToward(G.big.dir, G.big.stunFace, G.big.stunTurn * dt); return; }
  if (G.big.blush > 0) return;                             // стоит красный и никого не толкает
  if (G.big.pushCd > 0) {
    G.big.pushCd -= dt;
    if (G.big.pushCd <= 0) { G.big.state = "look"; G.big.timer = Math.max(0.5, G.big.noPush); G.big.lookSign = rng() < 0.5 ? -1 : 1; }
    return;
  }

  if (G.tutorialGame === 1 && G.tut.script) {                // SPEC-029: сценарий тренировки 1 — стоит, поворачивается к боту и толкает его
    const b = G.littles[1];
    G.big.dir = turnToward(G.big.dir, Math.atan2(b.y - G.big.y, b.x - G.big.x), CFG.TUTORIAL.scriptTurn * dt);
    if (b.state === "ok" && dist(G.big, b) < G.big.r + b.r + CFG.TUTORIAL.scriptPushPad) pushHit(b);
    return;
  }
  const speed = bigSpeeds();
  let target = null, td = Infinity;
  for (const l of G.littles) {
    if (G.big.noPush > 0) break;               // отдыхает — никого не ловит
    if (l.state !== "ok" || l.invuln > 0 || l.dizzy > 0) continue;   // с кружащейся головой не трогает
    if (canSee(l)) { const d = dist(G.big, l); if (d < td) { td = d; target = l; } }
  }
  if (target) {
    G.big.hearTurnT = 0; G.big.hearLook = 0;                 // видит — топот уже не важен; шум тает
    G.big.noise = Math.max(0, G.big.noise - CFG.NOISE_DECAY * dt);
    if (G.big.state !== "chase") { emit("pop", { key: null, args: ["!"], x: G.big.x, y: G.big.y - 75, color: "#ff3b30" }); emit("sfx", { name: "alert" }); }
    G.big.state = "chase";
    G.big.lastSeen = { x: target.x, y: target.y };
    G.big.moving = steerTo(G.big, target.x, target.y, speed.chase, dt, false);
    G.big.dir = turnToward(G.big.dir, Math.atan2(target.y - G.big.y, target.x - G.big.x), 7 * dt);
    if (td < G.big.r + target.r + 8) pushHit(target);
    return;
  }
  hearNoise(dt);
  if (G.big.state === "chase" || G.big.state === "search") {
    G.big.state = "search";
    G.big.moving = steerTo(G.big, G.big.lastSeen.x, G.big.lastSeen.y, speed.search, dt, false);
    if (G.big.moving) G.big.dir = turnToward(G.big.dir, G.big.moveDir, 6 * dt);
    if (G.big.moving && bigStuck(dt)) {                       // SPEC-037: упёрся — ближайшая достижимая клетка к месту, где видел / слышал
      learnBlocked();
      const p = reachableGoal(G.big.lastSeen.x, G.big.lastSeen.y), same = p.x === G.big.lastSeen.x && p.y === G.big.lastSeen.y;
      G.big.lastSeen = p; G.big.path = []; G.big.repath = 0; unstuck();
      if (same) { G.big.state = "look"; G.big.timer = rand(1.5, 2.5); G.big.lookSign = rng() < 0.5 ? -1 : 1; return; }   // уже была ближайшей достижимой — осмотрелся и дальше
    }
    if (!G.big.moving || dist(G.big, G.big.lastSeen) < 10) { G.big.state = "look"; G.big.timer = rand(1.5, 2.5); G.big.lookSign = rng() < 0.5 ? -1 : 1; }
    return;
  }
  if (G.big.state === "look") {
    if (G.big.hearTurnT > 0) { G.big.hearTurnT -= dt; G.big.dir = turnToward(G.big.dir, G.big.hearFace, G.big.hearRate * dt); }   // на топот
    else if (G.big.hearLook > 0) G.big.hearLook = Math.max(0, G.big.hearLook - dt);   // смотрит туда, не крутится
    else G.big.dir += G.big.lookSign * 1.7 * dt;
    G.big.timer -= dt;
    if (G.big.timer <= 0) { G.big.state = "patrol"; G.big.goal = newGoal(); G.big.path = []; G.big.repath = 0; G.big.patrolT = 10; }
    return;
  }
  if (!G.big.goal) { G.big.goal = newGoal(); G.big.patrolT = 10; }
  G.big.patrolT -= dt;
  G.big.moving = steerTo(G.big, G.big.goal.x, G.big.goal.y, speed.patrol, dt, false);
  if (G.big.moving) G.big.dir = turnToward(G.big.dir, G.big.moveDir, 5 * dt);
  if (G.big.moving && bigStuck(dt)) {                         // SPEC-037: упёрся — новая достижимая точка прогулки
    if (pressedByFriend()) {                                    // упёрся в лежащего друга — не лезет сквозь него, стоит и смотрит туда же (не крутится), пока тот не встанет
      G.big.state = "look"; G.big.timer = rand(1, 2.2); G.big.hearLook = G.big.timer; G.big.goal = null; G.big.path = []; unstuck();
      return;
    }
    learnBlocked();
    G.big.goal = newGoal(); G.big.path = []; G.big.repath = 0; unstuck();   // patrolT идёт дальше: время прогулки то же
  }
  if (!G.big.moving || dist(G.big, G.big.goal) < ARRIVE || G.big.patrolT <= 0) {
    G.big.state = "look"; G.big.timer = rand(1, 2.2); G.big.lookSign = rng() < 0.5 ? -1 : 1; G.big.goal = null;
  }
}
