// SPEC-008 / SPEC-011: the autopilot — plays the Little Ones the way a player does (balance report, tests). Core module.
import { CELL, CFG } from "./config.js";
import { angDiff, dist, normAng } from "./util.js";
import { bigListens } from "./hearing.js";
import { steerPoint } from "./path.js";
import { trickHideSpot, trickQuiet } from "./tricks/query.js";
import { inCone } from "./vision.js";
import { canUseKit, gameInv, moveSpeed } from "./rules.js";
import { canAct, inSafe, los, seeSolidAt } from "./world.js";
import { G } from "./active.js";

// =====================================================================
//  АВТОПИЛОТ (SPEC-008): ведёт маленьких игроков для проверки баланса. Видит то же, что игрок, а действует только как
//  игрок: «джойстик» autoMove, который прибавляется к стику его слота, и кнопки 💋 / 🩹 — флаги слота (SPEC-012 AC 3). Состояние Большого,
//  ботов, самих маленьких, CFG и progress не трогает (тест «the autopilot plays only through the players' inputs»);
//  своя память — autoNavs (путь к цели), путь ищет тем же steerPoint, что и боты.
//  careful — к спине в обход взгляда (за стенами и кустами), вблизи перед ним обходит сбоку, обнимает сзади и сразу
//            заходит за спину снова; спасает друзей; берёт звёздочки и предметы рядом, когда он туда не смотрит.
//  reckless — бежит прямо обниматься, ни от кого не прячется и никого не спасает.
// =====================================================================
// SPEC-012: G.autoOn, G.autoStyle, G.autoNavs (память пути), G.autoMove (стик этого шага) — в игре
export function autopilot(on, style) {
  if (typeof on === "boolean") G.autoOn = on;
  if (style === "careful" || style === "reckless") G.autoStyle = style;
  if (!G.autoOn) G.autoMove = [];
  return { on: G.autoOn, style: G.autoStyle };
}
const autoNav = l => {
  if (!G.autoNavs[l.id]) G.autoNavs[l.id] = { x: l.x, y: l.y, r: l.r, path: [], repath: 0 };
  return G.autoNavs[l.id];
};
// Большой сейчас может толкнуть (не в шоке, не лежит, не краснеет, не отдыхает после толчка)
const bigDangerous = () => G.big.stun <= 0 && G.big.slip <= 0 && G.big.blush <= 0 && G.big.pushCd <= 0 && G.big.noPush <= 0;
// Точка у спины Большого: издалека — в backDist px за ним, вблизи — вплотную (обнимашка)
const backPoint = (l, d) => {
  const A = CFG.AUTOPILOT, a = G.big.dir + Math.PI, rr = d > A.backNear ? A.backDist : G.big.r + l.r - A.hugIn;
  return { x: G.big.x + Math.cos(a) * rr, y: G.big.y + Math.sin(a) * rr };
};
// Цель careful-игрока: { x, y, avoid (обходить взгляд), stop (px — ближе не подходить) }
function autoGoalCareful(l) {
  const A = CFG.AUTOPILOT, danger = bigDangerous();
  if (G.big.slip > 0) return { x: G.big.x, y: G.big.y, avoid: false, stop: 0 };   // лежит после банана — обнимать с любой стороны!
  let down = null;                                       // упавший друг, которого ни один бот не поднимет быстрее
  for (const d of G.littles) {
    if (d.state !== "down" || d === l || (danger && dist(d, G.big) <= A.rescueSafe)) continue;
    if (G.littles.some(o => o.kind === "bot" && o.state === "ok" && dist(o, d) < dist(l, d))) continue;
    if (!down || dist(l, d) < dist(l, down)) down = d;
  }
  if (down) return { x: down.x, y: down.y, avoid: true, stop: l.r + down.r + A.arrive };
  let pick = null;                                       // звёздочка или предмет рядом, пока он туда не смотрит
  for (const s of [...G.bonusStars, ...G.items.filter(it => it.kind !== "banana")]) {
    if (dist(l, s) < A.itemReach && (!danger || (dist(s, G.big) > A.pickSafe && !inCone(s.x, s.y))) && (!pick || dist(l, s) < dist(l, pick))) pick = s;
  }
  if (pick) return { x: pick.x, y: pick.y, avoid: true, stop: 0 };
  // SPEC-042: он смотрит сюда (а он может толкнуть) и рядом брызги поливалки — прячемся в них, как в кусте
  if (danger && inCone(l.x, l.y)) { const h = trickHideSpot(l, CFG.TRICKS.sprinklers.hideReach * CELL); if (h) return { ...h, avoid: false, stop: CFG.TRICKS.sprinklers.r * CELL / 2 }; }
  // обнимашка: близко и перед ним, а он может толкнуть, — обходим сбоку к спине; иначе к спине, издалека — в обход взгляда
  const d = dist(l, G.big), a = Math.atan2(l.y - G.big.y, l.x - G.big.x), side = normAng(a - G.big.dir);
  if (danger && d < A.orbit && Math.abs(side) < CFG.BEHIND_ANGLE) {
    const t = a + Math.sign(side || 1) * A.orbitStep, r = Math.max(A.orbitR, d);
    return { x: G.big.x + Math.cos(t) * r, y: G.big.y + Math.sin(t) * r, avoid: false, stop: 0 };
  }
  return { ...backPoint(l, d), avoid: danger && d > A.sneakNear, stop: 0 };
}
// Цель reckless-игрока: прямо к спине Большого (или к нему, если лежит), не прячась и никого не спасая
const autoGoalReckless = l => G.big.slip > 0 ? { x: G.big.x, y: G.big.y, avoid: false, stop: 0 } : { ...backPoint(l, dist(l, G.big)), avoid: false, stop: 0 };
// SPEC-019: careful идёт на цыпочках, когда он рядом (HEAR_RADIUS + TIPTOE_NEAR клеток), сзади или сбоку от Большого (вне взгляда) и тот прислушивается
const autoTiptoe = l => bigListens() && dist(l, G.big) <= (CFG.HEAR_RADIUS + CFG.TIPTOE_NEAR) * CELL &&
  angDiff(G.big.dir, Math.atan2(l.y - G.big.y, l.x - G.big.x)) >= CFG.VISION_HALF;
// Решение автопилота для игрока l на этот шаг (SPEC-012 AC 3: через тот же вход, что у игрока): «стик» autoMove[l.id] = { x, y }
// (длина ≤ 1, прибавляется к стику слота) и нажатия 💋 / 🩹 — флаги inp.kiss / inp.kit его слота (readInputs нажимает их сразу)
export function autoDecide(l, inp, dt) {
  const A = CFG.AUTOPILOT;
  const n = autoNav(l);
  n.x = l.x; n.y = l.y;
  // 🩹: лежит долго и никто не поднимает (или уже хромает в домик, отдыхает)
  if (G.autoStyle === "careful" && canUseKit(l) && (l.state !== "down" || (l.rescue <= 0 && l.downTimer < CFG.DOWN_TIME - A.kitWait))) { inp.kit = true; return; }
  if (!canAct(l)) return;
  const goal = G.autoStyle === "reckless" ? autoGoalReckless(l) : autoGoalCareful(l);
  if (Math.hypot(goal.x - l.x, goal.y - l.y) <= goal.stop) return;
  const { tx, ty } = steerPoint(n, goal.x, goal.y, dt, goal.avoid, () => A.repath);
  const dx = tx - l.x, dy = ty - l.y, d = Math.hypot(dx, dy);
  if (d < A.minStep) return;
  const sp = moveSpeed(l);
  let m = Math.min(1, d / (sp * dt));                  // не проскочить точку
  if (G.autoStyle === "careful" && (autoTiptoe(l) || trickQuiet(l))) m = Math.min(m, CFG.TIPTOE_MULT);   // SPEC-019: рядом сзади/сбоку — на цыпочках
  G.autoMove[l.id] = { x: dx / d * m, y: dy / d * m };
  // 💋: смотрит на Большого, он близко, видно, и поцелуй сработает
  if (G.autoStyle === "careful" && gameInv().kisses > 0 && l.kissCd <= 0 && !inSafe(l) && G.big.stun <= 0 && G.big.blush <= 0 && G.big.hugCd <= 0 &&
    dist(l, G.big) < CFG.KISS_RANGE * A.kissReach && angDiff(l.dir, Math.atan2(G.big.y - l.y, G.big.x - l.x)) < A.kissAim &&
    los(l.x, l.y, G.big.x, G.big.y, seeSolidAt)) inp.kiss = true;
}
