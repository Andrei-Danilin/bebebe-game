// SPEC-008 / SPEC-011: the autopilot — plays the Little Ones the way a player does (balance report, tests). Core module.
import { CELL, CFG } from "./config.js";
import { angDiff, dist, normAng } from "./util.js";
import { gameInv } from "./economy.js";
import { big, bonusStars, items, littles, mode } from "./game.js";
import { bigListens } from "./hearing.js";
import { inCone, steerPoint } from "./path.js";
import { canUseKit, moveSpeed, throwKiss, useRescueKit } from "./rules.js";
import { canAct, inSafe, los, seeSolidAt } from "./world.js";

// =====================================================================
//  АВТОПИЛОТ (SPEC-008): ведёт маленьких игроков для проверки баланса. Видит то же, что игрок, а действует только как
//  игрок: «джойстик» autoMove, который читает inputFor(l), и кнопки 💋 throwKiss / 🩹 useRescueKit. Состояние Большого,
//  ботов, самих маленьких, CFG и progress не трогает (тест «the autopilot plays only through the players' inputs»);
//  своя память — autoNavs (путь к цели), путь ищет тем же steerPoint, что и боты.
//  careful — к спине в обход взгляда (за стенами и кустами), вблизи перед ним обходит сбоку, обнимает сзади и сразу
//            заходит за спину снова; спасает друзей; берёт звёздочки и предметы рядом, когда он туда не смотрит.
//  reckless — бежит прямо обниматься, ни от кого не прячется и никого не спасает.
// =====================================================================
export let autoOn = false, autoStyle = "careful", autoNavs = new Map(), autoMove = [];
export function autopilot(on, style) {
  if (typeof on === "boolean") autoOn = on;
  if (style === "careful" || style === "reckless") autoStyle = style;
  if (!autoOn) autoMove = [];
  return { on: autoOn, style: autoStyle };
}
const autoNav = l => {
  if (!autoNavs.has(l.id)) autoNavs.set(l.id, { x: l.x, y: l.y, r: l.r, path: [], repath: 0 });
  return autoNavs.get(l.id);
};
// Большой сейчас может толкнуть (не в шоке, не лежит, не краснеет, не отдыхает после толчка)
const bigDangerous = () => big.stun <= 0 && big.slip <= 0 && big.blush <= 0 && big.pushCd <= 0 && big.noPush <= 0;
// Точка у спины Большого: издалека — в backDist px за ним, вблизи — вплотную (обнимашка)
const backPoint = (l, d) => {
  const A = CFG.AUTOPILOT, a = big.dir + Math.PI, rr = d > A.backNear ? A.backDist : big.r + l.r - A.hugIn;
  return { x: big.x + Math.cos(a) * rr, y: big.y + Math.sin(a) * rr };
};
// Цель careful-игрока: { x, y, avoid (обходить взгляд), stop (px — ближе не подходить) }
function autoGoalCareful(l) {
  const A = CFG.AUTOPILOT, danger = bigDangerous();
  if (big.slip > 0) return { x: big.x, y: big.y, avoid: false, stop: 0 };   // лежит после банана — обнимать с любой стороны!
  let down = null;                                       // упавший друг, которого ни один бот не поднимет быстрее
  for (const d of littles) {
    if (d.state !== "down" || d === l || (danger && dist(d, big) <= A.rescueSafe)) continue;
    if (littles.some(o => o.kind === "bot" && o.state === "ok" && dist(o, d) < dist(l, d))) continue;
    if (!down || dist(l, d) < dist(l, down)) down = d;
  }
  if (down) return { x: down.x, y: down.y, avoid: true, stop: l.r + down.r + A.arrive };
  let pick = null;                                       // звёздочка или предмет рядом, пока он туда не смотрит
  for (const s of [...bonusStars, ...items.filter(it => it.kind !== "banana")]) {
    if (dist(l, s) < A.itemReach && (!danger || (dist(s, big) > A.pickSafe && !inCone(s.x, s.y))) && (!pick || dist(l, s) < dist(l, pick))) pick = s;
  }
  if (pick) return { x: pick.x, y: pick.y, avoid: true, stop: 0 };
  // обнимашка: близко и перед ним, а он может толкнуть, — обходим сбоку к спине; иначе к спине, издалека — в обход взгляда
  const d = dist(l, big), a = Math.atan2(l.y - big.y, l.x - big.x), side = normAng(a - big.dir);
  if (danger && d < A.orbit && Math.abs(side) < CFG.BEHIND_ANGLE) {
    const t = a + Math.sign(side || 1) * A.orbitStep, r = Math.max(A.orbitR, d);
    return { x: big.x + Math.cos(t) * r, y: big.y + Math.sin(t) * r, avoid: false, stop: 0 };
  }
  return { ...backPoint(l, d), avoid: danger && d > A.sneakNear, stop: 0 };
}
// Цель reckless-игрока: прямо к спине Большого (или к нему, если лежит), не прячась и никого не спасая
const autoGoalReckless = l => big.slip > 0 ? { x: big.x, y: big.y, avoid: false, stop: 0 } : { ...backPoint(l, dist(l, big)), avoid: false, stop: 0 };
// SPEC-019: careful идёт на цыпочках, когда он рядом (HEAR_RADIUS + TIPTOE_NEAR клеток), сзади или сбоку от Большого (вне взгляда) и тот прислушивается
const autoTiptoe = l => bigListens() && dist(l, big) <= (CFG.HEAR_RADIUS + CFG.TIPTOE_NEAR) * CELL &&
  angDiff(big.dir, Math.atan2(l.y - big.y, l.x - big.x)) >= CFG.VISION_HALF;
// Решение автопилота на этот шаг: autoMove[pi] = { x, y } (как стик, длина ≤ 1) и нажатия 💋 / 🩹
export function autoThink(dt) {
  autoMove = [];
  if (!autoOn || mode !== "play") return;
  const A = CFG.AUTOPILOT;
  for (const l of littles) {
    if (l.kind !== "player") continue;
    const n = autoNav(l);
    n.x = l.x; n.y = l.y;
    // 🩹: лежит долго и никто не поднимает (или уже хромает в домик, отдыхает)
    if (autoStyle === "careful" && canUseKit(l) && (l.state !== "down" || (l.rescue <= 0 && l.downTimer < CFG.DOWN_TIME - A.kitWait))) { useRescueKit(l.id); continue; }
    if (!canAct(l)) continue;
    const goal = autoStyle === "reckless" ? autoGoalReckless(l) : autoGoalCareful(l);
    if (Math.hypot(goal.x - l.x, goal.y - l.y) <= goal.stop) continue;
    const { tx, ty } = steerPoint(n, goal.x, goal.y, dt, goal.avoid, () => A.repath);
    const dx = tx - l.x, dy = ty - l.y, d = Math.hypot(dx, dy);
    if (d < A.minStep) continue;
    const sp = moveSpeed(l);
    let m = Math.min(1, d / (sp * dt));                  // не проскочить точку
    if (autoStyle === "careful" && autoTiptoe(l)) m = Math.min(m, CFG.TIPTOE_MULT);   // SPEC-019: рядом сзади/сбоку — на цыпочках
    autoMove[l.id] = { x: dx / d * m, y: dy / d * m };
    // 💋: смотрит на Большого, он близко, видно, и поцелуй сработает
    if (autoStyle === "careful" && gameInv().kisses > 0 && l.kissCd <= 0 && !inSafe(l) && big.stun <= 0 && big.blush <= 0 && big.hugCd <= 0 &&
      dist(l, big) < CFG.KISS_RANGE * A.kissReach && angDiff(l.dir, Math.atan2(big.y - l.y, big.x - l.x)) < A.kissAim &&
      los(l.x, l.y, big.x, big.y, seeSolidAt)) throwKiss(l.id);
  }
}
// SPEC-011 AC 5: other modules change this module's state only through these setters (live bindings are read-only there)
export function setAutoNavs(v) { return (autoNavs = v); }
export function setAutoMove(v) { return (autoMove = v); }
