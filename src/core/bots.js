// SPEC-011: the bots — rescue, flee, sneak up one at a time, wait nearby. Core module.
import { CELL, CFG, COLS, H, W } from "./config.js";
import { angDiff, clamp, dist, rand, turnToward } from "./util.js";
import { canSee } from "./big.js";
import { attackToken, big, botAttackCd, littles, prevToken, setAttackToken, setBotAttackCd, setPrevToken } from "./game.js";
import { bossPower } from "./mood.js";
import { cellIdx, inCone, steerTo } from "./path.js";
import { tut, tutorialGame } from "./practice.js";
import { freeCellNear } from "./rules.js";
import { blocked, canAct, dangerZone, inDanger, inDangerXY, moveSolidAt, reachable, safeZone } from "./world.js";

function fleePoint(b) {
  if (safeZone) {                        // домик рядом — бежим в домик
    const home = { x: safeZone.x + safeZone.w / 2, y: safeZone.y + safeZone.h / 2 };
    if (dist(b, home) < 260) return home;
  }
  const away = Math.atan2(b.y - big.y, b.x - big.x);
  for (const k of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const a = away + k;
    const x = clamp(b.x + Math.cos(a) * 140, 20, W - 20), y = clamp(b.y + Math.sin(a) * 140, 20, H - 20);
    if (!moveSolidAt(x, y) && reachable[cellIdx(x, y)] && !inCone(x, y) && !inDangerXY(x, y)) return { x, y };   // не за водой и не в «кармане»
  }
  return freePointNear({ x: clamp(b.x + Math.cos(away) * 140, 20, W - 20), y: clamp(b.y + Math.sin(away) * 140, 20, H - 20) });
}

// Боты: 1) спасают упавших (сначала игроков), 2) убегают, если их видят,
//       3) по очереди подкрадываются сзади, остальные ждут неподалёку
export function updateBots(dt) {
  const bots = littles.filter(l => l.kind === "bot" && canAct(l));
  const downed = littles.filter(l => l.state === "down" && l.botWait <= 0)   // боты ждут BOT_RESCUE_DELAY после падения
    .sort((a, b) => ((a.kind === "player" ? 0 : 1) - (b.kind === "player" ? 0 : 1)) || (a.downTimer - b.downTimer));
  const free = new Set(bots), rescueTarget = new Map();
  for (const d of downed) {
    let best = null, bd = Infinity;
    for (const b of free) { const dd = dist(b, d); if (dd < bd) { bd = dd; best = b; } }
    if (best) { free.delete(best); rescueTarget.set(best, d); }
  }
  if (attackToken && (attackToken.state !== "ok" || !free.has(attackToken))) setAttackToken(null);

  for (const l of littles) if (l.kind === "bot") { l.moving = false; l.speedFrac = 0; }
  setBotAttackCd(botAttackCd - (dt));
  for (const b of bots) {
    b.fleeT = Math.max(0, b.fleeT - dt);
    b.lurkT = Math.max(0, b.lurkT - dt);
    b.fleeRe -= dt;
    const seen = big.stun <= 0 && big.slip <= 0 && big.noPush <= 0 && big.blush <= 0 && canSee(b);
    const wide = wideDanger(b);                           // SPEC-022: перед самым злым папой, пока он может толкнуть — отойти
    const speed = CFG.BOT_SPEED * (b.fx.boots > 0 ? CFG.BOOTS_MULT : 1);
    // SPEC-019: подкрадываясь (ближе HEAR_RADIUS + TIPTOE_NEAR клеток) и выжидая там, где он слышит (HEAR_RADIUS), — на цыпочках;
    // убегают и спасают — бегом
    const db = dist(b, big), tiptoe = db <= (CFG.HEAR_RADIUS + CFG.TIPTOE_NEAR) * CELL, lurkTip = db <= CFG.HEAR_RADIUS * CELL;
    let moved = false, frac = 1;

    if (b.dangerT > CFG.BOT_DANGER_LEAVE && dangerZone) {   // засиделся в доме Большого — к ближайшей двери
      b.task = "leave";
      const ex = nearestExit(b);
      moved = steerTo(b, ex.x, ex.y, speed, dt, false);
    } else if (big.slip > 0 && !rescueTarget.has(b) && dist(b, big) < 320) {   // Большой упал — бежим обнимать!
      b.task = "attack";
      moved = steerTo(b, big.x, big.y, speed, dt, false);
    } else if (rescueTarget.has(b) && !(seen && dist(b, big) < 90) && !wide && !wideDanger(rescueTarget.get(b), b)) {
      const d = rescueTarget.get(b);
      b.task = "rescue";
      if (dist(b, d) > b.r + d.r + 4) moved = steerTo(b, d.x, d.y, speed, dt, false);
    } else if (tutorialGame === 1 && tut.script && b === littles[1]) {   // SPEC-029: сценарий — бежит прямо на папу спереди (спасать — важнее)
      b.task = "script";
      moved = steerTo(b, big.x, big.y, speed, dt, false);
    } else {
      if ((seen || wide) && b.fleeT <= 0) { b.fleeT = 1.0; b.fleeGoal = null; }
      if (seen || wide) b.fleeT = Math.max(b.fleeT, 0.6);
      if (b.fleeT > 0) {
        b.task = "flee";
        if (attackToken === b) { setAttackToken(null); b.lurkT = rand(3, 6); }
        if (!b.fleeGoal || b.fleeRe <= 0 || dist(b, b.fleeGoal) < 15) { b.fleeGoal = fleePoint(b); b.fleeRe = 0.5; }
        moved = steerTo(b, b.fleeGoal.x, b.fleeGoal.y, speed, dt, false);
      } else {
        // SPEC-029: в тренировке 1 бот сам не обнимает (это делает игрок): убегает и ждёт рядом, как обычно, но не нападает
        if (!attackToken && botAttackCd <= 0 && b.lurkT <= 0 && free.has(b) && tutorialGame !== 1) { setAttackToken(b); b.tokenT = 8; }
        const back = big.dir + Math.PI;
        if (attackToken === b) {
          b.task = "attack";
          b.tokenT -= dt;
          if (b.tokenT <= 0) { setAttackToken(null); b.lurkT = rand(3, 6); }
          const a = back + b.offset;
          const rr = dist(b, big) > 95 ? 75 : big.r + b.r - 3;
          if (tiptoe) frac = CFG.TIPTOE_MULT;
          moved = steerTo(b, big.x + Math.cos(a) * rr, big.y + Math.sin(a) * rr, speed * frac, dt, true);
        } else {
          b.task = "lurk";
          const g = lurkPoint(back + b.offset * 2.2);
          frac = lurkTip ? CFG.TIPTOE_MULT : CFG.BOT_LURK_MULT;
          if (Math.hypot(g.x - b.x, g.y - b.y) > 20) moved = steerTo(b, g.x, g.y, speed * frac, dt, true);
        }
      }
    }
    b.moving = moved;
    b.speedFrac = moved ? frac : 0;                       // SPEC-019: доля своей скорости (на цыпочках — TIPTOE_MULT, тихо)
    if (moved) b.dir = turnToward(b.dir, b.moveDir, 10 * dt);
  }
  // один бот за раз и с паузой между попытками — чтобы главными героями были игроки
  if (prevToken && attackToken !== prevToken) setBotAttackCd(rand(CFG.BOT_ATTACK_PAUSE[0], CFG.BOT_ATTACK_PAUSE[1]));
  setPrevToken(attackToken);
}

// SPEC-022: точка p (бот или упавший, к которому он идёт; o — бот рядом с ним) — перед самым злым папой ближе WIDE_PUSH_R + BOT_WIDE_KEEP
// клеток, а он может толкнуть (не стоит после толчка, не в шоке, не лежит, не красный, не отдыхает)
function wideDanger(p, o = null) {
  if (bossPower(big.boss) !== "wide" || big.kind || big.pushCd > 0 || big.stun > 0 || big.slip > 0 || big.blush > 0 || big.noPush > 0) return false;
  const keep = (CFG.WIDE_PUSH_R + CFG.BOT_WIDE_KEEP) * CELL + (o ? o.r * 2 : 0);
  return dist(p, big) < keep && angDiff(big.dir, Math.atan2(p.y - big.y, p.x - big.x)) <= CFG.WIDE_PUSH_ARC * Math.PI / 360;
}
// Где ждать боту: в 170 px за Большим, но не в его доме; точка в стене или за водой — ближайшая свободная клетка
function lurkPoint(a0) {
  for (const k of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, Math.PI]) {
    const a = a0 + k, p = { x: clamp(big.x + Math.cos(a) * 170, 24, W - 24), y: clamp(big.y + Math.sin(a) * 170, 24, H - 24) };
    if (!inDanger(p)) return freePointNear(p);
  }
  return nearestExit(big);
}
function freePointNear(p) {
  const i = cellIdx(p.x, p.y);
  if (!blocked[i] && reachable[i] && !moveSolidAt(p.x, p.y)) return p;
  const c = freeCellNear(i);
  return { x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL };
}
// Ближайшая точка за дверью дома Большого
export function nearestExit(p) {
  let best = null, bd = Infinity;
  for (const e of (dangerZone ? dangerZone.exits : [])) { const d = dist(p, e); if (d < bd) { bd = d; best = e; } }
  if (best) return best;
  const c = freeCellNear(cellIdx(p.x, p.y));             // дверей не знаем — ближайшая свободная клетка снаружи
  return { x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL };
}
