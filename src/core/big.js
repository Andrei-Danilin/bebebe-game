// SPEC-011: the Big One — what he sees, how he looks, chases, searches and patrols. Core module.
import { CFG } from "./config.js";
import { hooks } from "./hooks.js";
import { angDiff, dist, rand, rng, turnToward } from "./util.js";
import { bigSpeeds } from "./difficulty.js";
import { big, littles } from "./game.js";
import { bigDeaf, hearNoise, stopHearing } from "./hearing.js";
import { inBush, randomFreePoint, steerTo } from "./path.js";
import { tut, tutorialGame } from "./practice.js";
import { pushHit } from "./rules.js";
import { inSafe, los, seeSolidAt } from "./world.js";

export function canSee(l) {
  if (inSafe(l)) return false;          // в домике Большой не видит и не трогает
  if (l.fx && l.fx.cloak > 0) return false;   // невидимка          // в домике Большой не видит и не трогает
  const dx = l.x - big.x, dy = l.y - big.y, d = Math.hypot(dx, dy);
  const diff = angDiff(big.dir, Math.atan2(dy, dx));
  if (d < big.r + l.r + 22 && diff < 1.9) return true;
  if (d > 45 && inBush(l)) return false;
  return d < CFG.VISION_RANGE && diff < CFG.VISION_HALF && los(big.x, big.y, l.x, l.y, seeSolidAt);
}
export function updateBig(dt) {
  big.flash = Math.max(0, big.flash - dt);
  big.hugCd = Math.max(0, big.hugCd - dt);
  big.moving = false;
  big.noPush = Math.max(0, big.noPush - dt);
  big.hearCd = Math.max(0, big.hearCd - dt);
  if (bigDeaf()) stopHearing();
  if (big.blush > 0) {                                   // покраснел: время идёт и пока лежит после банана
    big.blush = Math.max(0, big.blush - dt);
    if (big.blush <= 0 && big.slip <= 0 && big.stun <= 0) {   // прошло — поворачивается к тому, кто бросил, и в погоню
      const th = littles[big.blushBy] || littles[0];
      big.state = "chase"; big.lastSeen = { x: th.x, y: th.y };
      big.dir = Math.atan2(th.y - big.y, th.x - big.x); big.path = [];
      return;
    }
  }
  if (big.slip > 0) { big.slip -= dt; big.moving = false; if (big.slip <= 0) { big.state = "look"; big.timer = 0.8; } return; }
  if (big.stun > 0) { big.stun -= dt; big.dir = turnToward(big.dir, big.stunFace, big.stunTurn * dt); return; }
  if (big.blush > 0) return;                             // стоит красный и никого не толкает
  if (big.pushCd > 0) {
    big.pushCd -= dt;
    if (big.pushCd <= 0) { big.state = "look"; big.timer = Math.max(0.5, big.noPush); big.lookSign = rng() < 0.5 ? -1 : 1; }
    return;
  }

  if (tutorialGame === 1 && tut.script) {                // SPEC-029: сценарий тренировки 1 — стоит, поворачивается к боту и толкает его
    const b = littles[1];
    big.dir = turnToward(big.dir, Math.atan2(b.y - big.y, b.x - big.x), CFG.TUTORIAL.scriptTurn * dt);
    if (b.state === "ok" && dist(big, b) < big.r + b.r + CFG.TUTORIAL.scriptPushPad) pushHit(b);
    return;
  }
  const speed = bigSpeeds();
  let target = null, td = Infinity;
  for (const l of littles) {
    if (big.noPush > 0) break;               // отдыхает — никого не ловит
    if (l.state !== "ok" || l.invuln > 0 || l.dizzy > 0) continue;   // с кружащейся головой не трогает
    if (canSee(l)) { const d = dist(big, l); if (d < td) { td = d; target = l; } }
  }
  if (target) {
    big.hearTurnT = 0; big.hearLook = 0;                 // видит — топот уже не важен; шум тает
    big.noise = Math.max(0, big.noise - CFG.NOISE_DECAY * dt);
    if (big.state !== "chase") { hooks.pop(big.x, big.y - 75, "!", "#ff3b30"); hooks.sfx("alert"); }
    big.state = "chase";
    big.lastSeen = { x: target.x, y: target.y };
    big.moving = steerTo(big, target.x, target.y, speed.chase, dt, false);
    big.dir = turnToward(big.dir, Math.atan2(target.y - big.y, target.x - big.x), 7 * dt);
    if (td < big.r + target.r + 8) pushHit(target);
    return;
  }
  hearNoise(dt);
  if (big.state === "chase" || big.state === "search") {
    big.state = "search";
    big.moving = steerTo(big, big.lastSeen.x, big.lastSeen.y, speed.search, dt, false);
    if (big.moving) big.dir = turnToward(big.dir, big.moveDir, 6 * dt);
    if (!big.moving || dist(big, big.lastSeen) < 10) { big.state = "look"; big.timer = rand(1.5, 2.5); big.lookSign = rng() < 0.5 ? -1 : 1; }
    return;
  }
  if (big.state === "look") {
    if (big.hearTurnT > 0) { big.hearTurnT -= dt; big.dir = turnToward(big.dir, big.hearFace, big.hearRate * dt); }   // на топот
    else if (big.hearLook > 0) big.hearLook = Math.max(0, big.hearLook - dt);   // смотрит туда, не крутится
    else big.dir += big.lookSign * 1.7 * dt;
    big.timer -= dt;
    if (big.timer <= 0) { big.state = "patrol"; big.goal = randomFreePoint(); big.path = []; big.repath = 0; big.patrolT = 10; }
    return;
  }
  if (!big.goal) { big.goal = randomFreePoint(); big.patrolT = 10; }
  big.patrolT -= dt;
  big.moving = steerTo(big, big.goal.x, big.goal.y, speed.patrol, dt, false);
  if (big.moving) big.dir = turnToward(big.dir, big.moveDir, 5 * dt);
  if (!big.moving || dist(big, big.goal) < 12 || big.patrolT <= 0) {
    big.state = "look"; big.timer = rand(1, 2.2); big.lookSign = rng() < 0.5 ? -1 : 1; big.goal = null;
  }
}
