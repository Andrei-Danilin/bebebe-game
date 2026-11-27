// SPEC-011: the bots — rescue, flee, sneak up one at a time, wait nearby. Core module.
import { CELL, CFG, COLS, H, W } from "./config.js";
import { angDiff, clamp, dist, rand, turnToward } from "./util.js";
import { bossPower } from "./mood.js";
import { cellIdx, freeCellNear, nearestExit } from "./grid.js";
import { steerTo } from "./path.js";
import { trickFreeze } from "./tricks/aware.js";
import { trickHideSpot, trickKidCost, trickQuiet } from "./tricks/query.js";
import { canSee, inCone } from "./vision.js";
import { canAct, inDanger, inDangerXY, moveSolidAt } from "./world.js";
import { G } from "./active.js";

function fleePoint(b) {
  const hide = trickHideSpot(b);   // SPEC-042: an active spray hides him like a bush, the far side of the truck from Dad too
  if (hide) return hide;
  if (G.safeZone) {                        // домик рядом — бежим в домик
    const home = { x: G.safeZone.x + G.safeZone.w / 2, y: G.safeZone.y + G.safeZone.h / 2 };
    if (dist(b, home) < 260) return home;
  }
  const away = Math.atan2(b.y - G.big.y, b.x - G.big.x);
  for (const k of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const a = away + k;
    const x = clamp(b.x + Math.cos(a) * 140, 20, W - 20), y = clamp(b.y + Math.sin(a) * 140, 20, H - 20);
    if (!moveSolidAt(x, y) && G.reachable[cellIdx(x, y)] && !inCone(x, y) && !inDangerXY(x, y) && !trickKidCost(x, y)) return { x, y };   // не за водой и не в «кармане»
  }
  return freePointNear({ x: clamp(b.x + Math.cos(away) * 140, 20, W - 20), y: clamp(b.y + Math.sin(away) * 140, 20, H - 20) });
}

// Боты: 1) спасают упавших (сначала игроков), 2) убегают, если их видят,
//       3) по очереди подкрадываются сзади, остальные ждут неподалёку
export function updateBots(dt) {
  const bots = G.littles.filter(l => l.kind === "bot" && canAct(l));
  const downed = G.littles.filter(l => l.state === "down" && l.botWait <= 0)   // боты ждут BOT_RESCUE_DELAY после падения
    .sort((a, b) => ((a.kind === "player" ? 0 : 1) - (b.kind === "player" ? 0 : 1)) || (a.downTimer - b.downTimer));
  const free = new Set(bots), rescueTarget = new Map();
  for (const d of downed) {
    let best = null, bd = Infinity;
    for (const b of free) { const dd = dist(b, d); if (dd < bd) { bd = dd; best = b; } }
    if (best) { free.delete(best); rescueTarget.set(best, d); }
  }
  if (G.attackToken && (G.attackToken.state !== "ok" || !free.has(G.attackToken))) G.attackToken = null;

  for (const l of G.littles) if (l.kind === "bot") { l.moving = false; l.speedFrac = 0; }
  G.botAttackCd = G.botAttackCd - (dt);
  for (const b of bots) {
    b.fleeT = Math.max(0, b.fleeT - dt);
    b.lurkT = Math.max(0, b.lurkT - dt);
    b.fleeRe -= dt;
    const seen = G.big.stun <= 0 && G.big.slip <= 0 && G.big.noPush <= 0 && G.big.blush <= 0 && canSee(b);
    const wide = wideDanger(b);                           // SPEC-022: перед самым злым папой, пока он может толкнуть — отойти
    const freeze = trickFreeze(b);                        // SPEC-042: the school bell, he is near Dad or in his sight: warning — tiptoe, ring — stand still
    if (freeze === 2) { b.moving = false; b.speedFrac = 0; continue; }
    const quiet = freeze === 1 || trickQuiet(b);          // a puddle or snow near Dad that would give him away — tiptoe across it
    const speed = CFG.BOT_SPEED * (b.fx.boots > 0 ? CFG.BOOTS_MULT : 1) * (quiet ? CFG.TIPTOE_MULT : 1);
    // SPEC-019: подкрадываясь (ближе HEAR_RADIUS + TIPTOE_NEAR клеток) и выжидая там, где он слышит (HEAR_RADIUS), — на цыпочках;
    // убегают и спасают — бегом
    const db = dist(b, G.big), tiptoe = db <= (CFG.HEAR_RADIUS + CFG.TIPTOE_NEAR) * CELL, lurkTip = db <= CFG.HEAR_RADIUS * CELL;
    let moved = false, frac = 1;

    if (b.dangerT > CFG.BOT_DANGER_LEAVE && G.dangerZone) {   // засиделся в доме Большого — к ближайшей двери
      b.task = "leave";
      const ex = nearestExit(b);
      moved = steerTo(b, ex.x, ex.y, speed, dt, false);
    } else if (G.big.slip > 0 && !rescueTarget.has(b) && dist(b, G.big) < 320) {   // Большой упал — бежим обнимать!
      b.task = "attack";
      moved = steerTo(b, G.big.x, G.big.y, speed, dt, false);
    } else if (rescueTarget.has(b) && !(seen && dist(b, G.big) < 90) && !wide && !wideDanger(rescueTarget.get(b), b)) {
      const d = rescueTarget.get(b);
      b.task = "rescue";
      if (dist(b, d) > b.r + d.r + 4) moved = steerTo(b, d.x, d.y, speed, dt, false);
    } else if (G.tutorialGame === 1 && G.tut.script && b === G.littles[1]) {   // SPEC-029: сценарий — бежит прямо на папу спереди (спасать — важнее)
      b.task = "script";
      moved = steerTo(b, G.big.x, G.big.y, speed, dt, false);
    } else {
      if ((seen || wide) && b.fleeT <= 0) { b.fleeT = 1.0; b.fleeGoal = null; }
      if (seen || wide) b.fleeT = Math.max(b.fleeT, 0.6);
      if (b.fleeT > 0) {
        b.task = "flee";
        if (G.attackToken === b) { G.attackToken = null; b.lurkT = rand(3, 6); }
        if (!b.fleeGoal || b.fleeRe <= 0 || dist(b, b.fleeGoal) < 15) { b.fleeGoal = fleePoint(b); b.fleeRe = 0.5; }
        moved = steerTo(b, b.fleeGoal.x, b.fleeGoal.y, speed, dt, false);
      } else {
        // SPEC-029: в тренировке 1 бот сам не обнимает (это делает игрок): убегает и ждёт рядом, как обычно, но не нападает
        if (!G.attackToken && G.botAttackCd <= 0 && b.lurkT <= 0 && free.has(b) && G.tutorialGame !== 1) { G.attackToken = b; b.tokenT = 8; }
        const back = G.big.dir + Math.PI;
        if (G.attackToken === b) {
          b.task = "attack";
          b.tokenT -= dt;
          if (b.tokenT <= 0) { G.attackToken = null; b.lurkT = rand(3, 6); }
          const a = back + b.offset;
          const rr = dist(b, G.big) > 95 ? 75 : G.big.r + b.r - 3;
          if (tiptoe) frac = CFG.TIPTOE_MULT;
          moved = steerTo(b, G.big.x + Math.cos(a) * rr, G.big.y + Math.sin(a) * rr, speed * frac, dt, true);
        } else {
          b.task = "lurk";
          const g = lurkPoint(back + b.offset * 2.2);
          frac = lurkTip ? CFG.TIPTOE_MULT : CFG.BOT_LURK_MULT;
          if (Math.hypot(g.x - b.x, g.y - b.y) > 20) moved = steerTo(b, g.x, g.y, speed * frac, dt, true);
        }
      }
    }
    if (quiet) frac = Math.min(frac, CFG.TIPTOE_MULT);
    b.moving = moved;
    b.speedFrac = moved ? frac : 0;                       // SPEC-019: доля своей скорости (на цыпочках — TIPTOE_MULT, тихо)
    if (moved) b.dir = turnToward(b.dir, b.moveDir, 10 * dt);
  }
  // один бот за раз и с паузой между попытками — чтобы главными героями были игроки
  if (G.prevToken && G.attackToken !== G.prevToken) G.botAttackCd = rand(CFG.BOT_ATTACK_PAUSE[0], CFG.BOT_ATTACK_PAUSE[1]);
  G.prevToken = G.attackToken;
}

// SPEC-022: точка p (бот или упавший, к которому он идёт; o — бот рядом с ним) — перед самым злым папой ближе WIDE_PUSH_R + BOT_WIDE_KEEP
// клеток, а он может толкнуть (не стоит после толчка, не в шоке, не лежит, не красный, не отдыхает)
function wideDanger(p, o = null) {
  if (bossPower(G.big.boss) !== "wide" || G.big.kind || G.big.pushCd > 0 || G.big.stun > 0 || G.big.slip > 0 || G.big.blush > 0 || G.big.noPush > 0) return false;
  const keep = (CFG.WIDE_PUSH_R + CFG.BOT_WIDE_KEEP) * CELL + (o ? o.r * 2 : 0);
  return dist(p, G.big) < keep && angDiff(G.big.dir, Math.atan2(p.y - G.big.y, p.x - G.big.x)) <= CFG.WIDE_PUSH_ARC * Math.PI / 360;
}
// Где ждать боту: в 170 px за Большим, но не в его доме; точка в стене или за водой — ближайшая свободная клетка
function lurkPoint(a0) {
  for (const k of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, Math.PI]) {
    const a = a0 + k, p = { x: clamp(G.big.x + Math.cos(a) * 170, 24, W - 24), y: clamp(G.big.y + Math.sin(a) * 170, 24, H - 24) };
    if (!inDanger(p)) return freePointNear(p);
  }
  return nearestExit(G.big);
}
function freePointNear(p) {
  const i = cellIdx(p.x, p.y);
  if (!G.blocked[i] && G.reachable[i] && !moveSolidAt(p.x, p.y)) return p;
  const c = freeCellNear(i);
  return { x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL };
}
