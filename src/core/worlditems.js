// SPEC-043: the world items — each world's own item next to the banana (CFG.WORLD_ITEM): the football, the paper plane and the snowball pile are run
// into and fly off in the kid's direction (G.shots); the watermelon slice lies and Dad slides on it; the cupcake lies and Dad walks over to eat it.
// What they do to Dad reuses his `slip` timer (he lies or stands helpless, huggable from any side, never chases: rules / bots / autopilot already
// know it); `slipKind` says which (the mark and the pose). The plane makes him watch it (`watch`, the gate in big.js). A boss gets half the time
// (CFG.WORLD_ITEMS.bossMul). No effect in a practice game. Core module; it reads the game only through G, so rules.js and big.js import it.
import { CELL, CFG } from "./config.js";
import { angDiff, dist, turnToward } from "./util.js";
import { emit, logEvent } from "./events.js";
import { bigSpeeds } from "./difficulty.js";
import { moveEntity, steerTo } from "./path.js";
import { canSee, inCone } from "./vision.js";
import { los, moveSolidAt, seeSolidAt } from "./world.js";
import { G } from "./active.js";

export const LAUNCH_KINDS = Object.freeze(["football", "plane", "snowball"]);   // run into them: they fly
export const WORLD_KINDS = Object.freeze([...LAUNCH_KINDS, "watermelon", "cupcake"]);
const STEP_PX = 4;                                          // a flying item moves in steps this short (the walls are on an 8 px grid)
const bossMul = () => (G.big.boss ? CFG.WORLD_ITEMS.bossMul : 1);
// Dad may be affected: not walking home kind, not lying or shocked already, never in a practice game
const canHit = () => !G.tutorialGame && !G.big.kind && G.big.slip <= 0 && G.big.stun <= 0;

// Dad lies or stands helpless for `time` s (× the boss' share unless mul is given): `kind` names the cause — "banana", "ball", "eat", "freeze", "melon"
export function dadDown(kind, time, mul = bossMul()) {
  const b = G.big;
  b.slip = time * mul; b.slipKind = kind; b.slideT = 0; b.watch = 0; b.cake = 0;
  b.path = []; b.moving = false; b.flash = 0.2;
}
// the watermelon's slide: a step of it while he lies (updateBig / updateBigPlayer, in their slip branch)
export function slideStep(dt) {
  const b = G.big;
  if (b.slideT <= 0) return;
  moveEntity(b, b.slideX, b.slideY, Math.min(dt, b.slideT));
  b.slideT -= dt;
}
// ---------- what a kid or Dad touching a lying item does (rules.js updateItems calls it for the world kinds) ----------
export function touchWorldItem(it) {
  if (G.tutorialGame || it.t >= it.life) return;
  const b = G.big, W = CFG.WORLD_ITEMS;
  if (LAUNCH_KINDS.includes(it.kind)) {
    const l = G.littles.find(q => q.state === "ok" && q.hugAnim <= 0 && q.moving && dist(q, it) < q.r + W.touch);
    if (l) launch(it, l);
  } else if (it.kind === "watermelon") {
    if (canHit() && dist(b, it) < b.r + 8) melon(it);
  } else if (it.kind === "cupcake") {
    if (canHit() && b.state !== "chase" && dist(b, it) < b.r + W.cupcake.near) eat(it);
  }
}
function melon(it) {
  const b = G.big, W = CFG.WORLD_ITEMS.watermelon, a = b.moving ? b.moveDir : b.dir;
  it.t = 999;
  dadDown("melon", W.time);
  b.slideX = Math.cos(a) * W.slide * CELL / W.slideTime; b.slideY = Math.sin(a) * W.slide * CELL / W.slideTime; b.slideT = W.slideTime;
  logEvent("worldItem", { kind: "watermelon", effect: "slide" });
  emit("pop", { key: "slip", args: [], x: b.x, y: b.y - 70, color: "#fb7185" });
  emit("burst", { kind: "star", x: b.x, y: b.y, n: 12, color: "#fb7185" });
  emit("shake", { t: 0.2 });
  emit("sfx", { name: "slip" });
}
function eat(it) {
  const b = G.big;
  it.t = 999;
  dadDown("eat", CFG.WORLD_ITEMS.cupcake.time);
  logEvent("worldItem", { kind: "cupcake", effect: "eat" });
  emit("pop", { key: "yum", args: [], x: b.x, y: b.y - 70, color: "#f9a8d4" });
  emit("burst", { kind: "heart", x: b.x, y: b.y - 20, n: 8, color: "#f9a8d4" });
  emit("sfx", { name: "munch" });
}
// the kid's direction: a bot's own steering, a player's stick (l.dir is set by it)
const runDir = l => (l.kind === "bot" ? l.moveDir : l.dir);
function launch(it, l) {
  const W = CFG.WORLD_ITEMS, a = runDir(l);
  it.t = 999;
  G.shots.push({ id: (G.shotSeq = G.shotSeq + 1), kind: it.kind, x: it.x, y: it.y, dx: Math.cos(a), dy: Math.sin(a), left: W[it.kind].cells * CELL, bounces: 0, t: 0, by: l.id, seen: false });
  logEvent("worldItem", { kind: it.kind, effect: "launch", who: l.id });
  if (it.kind === "plane") emit("pop", { key: "whee", args: [], x: l.x, y: l.y - 40, color: "#bae6fd" });
  emit("burst", { kind: "star", x: it.x, y: it.y, n: 8, color: "#fde047" });
  emit("sfx", { name: it.kind === "plane" ? "whee" : "kick" });
}
// ---------- the flights ----------
// Dad sees the point (x, y) from where he stands, facing where he faces
function seesPoint(x, y) {
  const b = G.big, d = Math.hypot(x - b.x, y - b.y);
  return d < CFG.VISION_RANGE && angDiff(b.dir, Math.atan2(y - b.y, x - b.x)) < CFG.VISION_HALF && los(b.x, b.y, x, y, seeSolidAt);
}
function hitDad(s) {
  const b = G.big, snow = s.kind === "snowball";
  s.left = 0;
  dadDown(snow ? "freeze" : "ball", CFG.WORLD_ITEMS[s.kind].time);
  logEvent("worldItem", { kind: s.kind, effect: "hit", who: s.by });
  if (snow) emit("pop", { key: "brr", args: [], x: b.x, y: b.y - 70, color: "#7dd3fc" });
  else emit("pop", { key: "bonk", args: [], x: b.x, y: b.y - 70, color: "#fde047" });
  emit("burst", { kind: "star", x: b.x, y: b.y, n: 12, color: snow ? "#e0f2fe" : "#fde047" });
  emit("shake", { t: 0.2 });
  emit("sfx", { name: snow ? "freeze" : "bonk" });
}
function flyStep(s, px) {
  const nx = s.x + s.dx * px, ny = s.y + s.dy * px;
  if (!moveSolidAt(nx, ny)) { s.x = nx; s.y = ny; s.left -= px; return; }
  if (s.kind === "football" && s.bounces < CFG.WORLD_ITEMS.football.bounces) {   // the football bounces off the wall once
    const bx = moveSolidAt(nx, s.y), by = moveSolidAt(s.x, ny);
    if (bx || !by) s.dx = -s.dx;
    if (by || !bx) s.dy = -s.dy;
    s.bounces++;
    emit("sfx", { name: "kick" });
  } else s.left = 0;                                         // the plane and the snowball stop at a wall
}
export function updateShots(dt) {
  if (!G.shots.length) return;
  const b = G.big;
  for (const s of G.shots) {
    const W = CFG.WORLD_ITEMS[s.kind];
    s.t += dt;
    let todo = W.speed * CELL * dt;
    for (let n = 0; todo > 0 && s.left > 0 && n < 64; n++) {
      const px = Math.min(todo, STEP_PX, s.left);
      todo -= px;
      flyStep(s, px);
      if (s.kind !== "plane" && s.left > 0 && canHit() && dist(s, b) < b.r + W.hit) hitDad(s);
    }
    if (s.kind === "plane" && !b.kind && !G.tutorialGame) {  // he watches it fly (not while he chases, lies or is shocked)
      if (!s.seen && b.state !== "chase" && b.slip <= 0 && b.stun <= 0 && seesPoint(s.x, s.y)) { s.seen = true; b.watch = Math.max(b.watch, W.time * bossMul()); }
      if (s.seen && b.watch > 0) { b.watchX = s.x; b.watchY = s.y; }
    }
  }
  G.shots = G.shots.filter(s => s.left > 0);
}
// ---------- Dad's own step: the plane look and the walk to a cupcake (big.js updateBig, before the world trick) ----------
// → true when he spent the step. He never gets here lying or shocked (their gates are above); a kid he sees comes first: no cupcake then
const kidSeen = () => G.big.noPush <= 0 && G.littles.some(l => l.state === "ok" && l.invuln <= 0 && l.dizzy <= 0 && canSee(l));
function cakeTarget() {
  const b = G.big, W = CFG.WORLD_ITEMS.cupcake;
  let best = null, bd = Infinity;
  for (const it of G.items) {
    if (it.kind !== "cupcake" || it.t >= it.life) continue;
    const d = dist(b, it);
    if (it.id !== b.cake && !(d < W.see * CELL && seesPoint(it.x, it.y))) continue;   // he sees it, or is already on his way to it
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
export function bigStepItem(dt) {
  const b = G.big;
  if (G.tutorialGame) return false;
  if (b.watch > 0) {                                         // watching the plane: he looks where it flew and sees nobody else
    b.watch -= dt; b.moving = false; b.state = "look"; b.timer = Math.max(b.timer, 0.5); b.goal = null; b.path = [];
    b.hearTurnT = 0; b.hearLook = 0; b.noise = 0;
    b.dir = turnToward(b.dir, Math.atan2(b.watchY - b.y, b.watchX - b.x), CFG.WORLD_ITEMS.plane.turn * dt);
    return true;
  }
  if (b.state === "chase") { b.cake = 0; return false; }
  const cake = G.items.some(it => it.kind === "cupcake") ? cakeTarget() : null;
  if (!cake || kidSeen()) { b.cake = 0; return false; }
  const W = CFG.WORLD_ITEMS.cupcake;
  if (b.cake !== cake.id) { b.cake = cake.id; b.cakeT = 0; b.cakeStuck = 0; }
  b.cakeT += dt;
  b.state = "patrol"; b.goal = null;
  b.moving = steerTo(b, cake.x, cake.y, bigSpeeds().patrol, dt, false);
  if (b.moving) { b.dir = turnToward(b.dir, b.moveDir, 5 * dt); b.cakeStuck = 0; } else b.cakeStuck += dt;
  if (b.cakeT > W.giveUp || b.cakeStuck > W.stuck) { cake.t = cake.life; b.cake = 0; }   // he cannot get there: the cupcake is gone (a bird took it)
  return true;
}
// ---------- the bots and the autopilot: a lying football / plane / snowball that sends something at Dad ----------
// where a kid goes to use one on him: first to the spot a little behind it on the line from Dad through it (so that running through it aims at him),
// then straight through it → { x, y } or null (nothing to use: Dad is not in line within the flight, a wall is in the way, he is lying already,
// the kid is too far, or the spot is in his view when `hidden` asks to keep out of it)
export function launcherGoal(l, hidden) {
  const b = G.big, K = CFG.WORLD_ITEMS.kick;
  if (G.tutorialGame || b.kind || b.slip > 0 || b.stun > 0 || b.watch > 0) return null;
  let best = null, bd = Infinity;
  for (const it of G.items) {
    if (!LAUNCH_KINDS.includes(it.kind) || it.t >= it.life) continue;
    const d = dist(l, it), dd = dist(it, b);
    if (d > K.reach || dd > CFG.WORLD_ITEMS[it.kind].cells * CELL * 0.85 || dd < b.r + 12 || d >= bd) continue;
    if (!los(it.x, it.y, b.x, b.y, moveSolidAt)) continue;
    const ux = (b.x - it.x) / dd, uy = (b.y - it.y) / dd, px = it.x - ux * K.approach, py = it.y - uy * K.approach;
    if (moveSolidAt(px, py) || (hidden && (inCone(px, py) || inCone(it.x, it.y)))) continue;
    const off = angDiff(Math.atan2(uy, ux), Math.atan2(it.y - l.y, it.x - l.x));
    best = off <= K.line && d < K.approach * 2.5 ? { x: it.x + ux * K.past, y: it.y + uy * K.past } : { x: px, y: py };
    bd = d;
  }
  return best;
}
