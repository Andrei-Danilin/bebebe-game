// SPEC-011: the rules — push (and the wide push), hug, win, kisses, items, bonus stars, contacts, the rescue kit, downed,
// danger, resting. Core module.
import { CELL, CFG, COLS, GLOVES, ROWS, UPGRADES } from "./config.js";
import { hooks } from "./hooks.js";
import { angDiff, dist, normAng, rand, rng, turnToward, vrand } from "./util.js";
import { L } from "../i18n.js";
import { nearestExit } from "./bots.js";
import { addCoins, gameInv, gloveOf, progress, saveInv, saveProgress } from "./economy.js";
import { logEvent } from "./game.js";
import { bossPower } from "./mood.js";
import { cellIdx, resolveWalls, steerTo } from "./path.js";
import { payReward } from "./progress-rules.js";
import { canAct, inDanger, inDangerXY, inSafe, los, moveSolidAt, seeSolidAt } from "./world.js";
import { G } from "./active.js";

// прибавка улучшения k для этого маленького: его уровень (взят при создании; у ботов нет) × step
const playerBonus = (l, k) => (l.upg ? (l.upg[k] || 0) * UPGRADES[k].step : 0);
// скорость маленького-игрока: обычная × «быстрые ноги» × сапоги (CFG.PLAYER_SPEED не меняется — предел Большого от неё)
export const moveSpeed = l => CFG.PLAYER_SPEED * (1 + playerBonus(l, "fastFeet")) * (l.fx.boots > 0 ? CFG.BOOTS_MULT : 1);
const helps = (o, l) => o !== l && o.state === "ok" && dist(o, l) < o.r + l.r + 12;   // o стоит рядом с упавшим l и поднимает его
// SPEC-022: толчок того, кого Большой поймал: самый злой папа (Школа 20) толкает широко — всех рядом перед собой
export function pushHit(t) { if (bossPower(G.big.boss) === "wide") widePush(t); else push(t); }
// широкий толчок: все маленькие (ok, могут действовать, не неуязвимы, не невидимки, не в домике) ближе WIDE_PUSH_R клеток в угле
// WIDE_PUSH_ARC перед ним (и тот, кого поймал) — каждому обычный толчок (щит спасает своего хозяина), одно «ВЖУХ!», кольцо; стоит дольше
function widePush(t) {
  const reach = CFG.WIDE_PUSH_R * CELL, half = CFG.WIDE_PUSH_ARC * Math.PI / 360;
  const hit = G.littles.filter(l => l === t || (canAct(l) && l.invuln <= 0 && l.fx.cloak <= 0 && !inSafe(l)
    && dist(l, G.big) <= reach + l.r && angDiff(G.big.dir, Math.atan2(l.y - G.big.y, l.x - G.big.x)) <= half));
  for (const l of hit) push(l, true);
  const down = hit.filter(l => l.state === "down").length;
  if (!down) return;                                       // всех спас щит — как обычный толчок в щит (PUSH_STAND), без «ВЖУХ!»
  logEvent("widePush", { n: down });
  G.big.pushCd = CFG.WIDE_PUSH_STAND; G.big.noPush = CFG.PUSH_RECOVER;   // стоит дольше; передышка (правило детей) — как после любого толчка
  G.pushWaves.push({ x: G.big.x, y: G.big.y, t: 0, r: reach });
  hooks.pop(G.big.x + Math.cos(G.big.dir) * G.big.r * 2, G.big.y + Math.sin(G.big.dir) * G.big.r * 2 - G.big.r * 2, L().whoosh, "#fde047", "whoosh");
  hooks.shake(CFG.WIDE_PUSH_SHAKE);
  hooks.sfx("push");
}
// SPEC-029: передышка папы после толчка; в тренировке 2 он слабее — × TUTORIAL.pushCooldownMult
const pushRecover = () => CFG.PUSH_RECOVER * (G.tutorialGame === 2 ? CFG.TUTORIAL.pushCooldownMult : 1);
function push(t, wide = false) {
  const a = Math.atan2(t.y - G.big.y, t.x - G.big.x);
  for (const l of G.littles) if (l.state === "down" && helps(t, l)) l.rescue = 0;   // помощника толкнули — спасение сначала
  if (t.fx.shield > 0) {                   // щит спасает от одного толчка
    t.fx.shield = 0;
    logEvent("push", { who: t.id, blocked: true });
    t.kx = Math.cos(a) * 280; t.ky = Math.sin(a) * 280;
    G.big.pushCd = CFG.PUSH_STAND; G.big.noPush = pushRecover();
    hooks.pop(t.x, t.y - 40, L().blocked, "#7dd3fc");
    hooks.burst(t.x, t.y, "star", "#7dd3fc", 14);
    hooks.sfx("shield");
    return;
  }
  t.state = "down"; t.downTimer = CFG.DOWN_TIME; t.rescue = 0; t.path = []; t.dangerT = 0;
  logEvent("push", { who: t.id, blocked: false }); logEvent("down", { who: t.id, kind: t.kind });
  t.botWait = rand(CFG.BOT_RESCUE_DELAY[0], CFG.BOT_RESCUE_DELAY[1]);   // боты пойдут спасать чуть позже
  t.kx = Math.cos(a) * 360; t.ky = Math.sin(a) * 360;
  if (G.attackToken === t) G.attackToken = null;
  // первый раз за уровень упал игрок со спасалками — короткая подсказка «Нажми 🩹» (SPEC-007)
  if (t.kind === "player" && !G.kitHintDone && gameInv().rescues > 0) { G.kitHintDone = true; G.kitHintT = CFG.KIT_HINT_TIME; G.kitHintPi = t.id; }
  G.big.pushCd = CFG.PUSH_STAND;
  G.big.noPush = pushRecover();             // передышка: какое-то время никого не толкает (SPEC-029: в тренировке 2 — дольше)
  hooks.burst(t.x, t.y, "dust", "#e5d3a1", 10);
  if (wide) return;                         // SPEC-022: широкий толчок — одно «ВЖУХ!» на всех (widePush)
  hooks.shake(0.25);
  hooks.pop(t.x, t.y - 40, L().bang, "#ffcc00", "bang");
  hooks.sfx("push");
}
function hug(l, a) {
  let power = 1;
  G.big.blush = 0;                                         // обнимашка заканчивает смущение, дальше обычный шок
  const gl = l.kind === "player" ? gloveOf(l.id) : null;
  if (gl) { power = GLOVES[gl].power; progress.inv[gl]--; saveProgress(); }   // рукавицы: сразу 2–3 сердечка
  G.big.hp = Math.max(0, G.big.hp - power); G.big.hugCd = CFG.HUG_STUN + 0.3; G.big.stun = CFG.HUG_STUN; G.big.stunFace = a; G.big.flash = 0.3;
  G.big.stunTurn = Math.abs(normAng(a - G.big.dir)) / CFG.HUG_STUN;   // медленно поворачивается, пока в шоке
  G.big.state = "chase"; G.big.lastSeen = { x: l.x, y: l.y };
  G.big.slip = 0;
  l.hugCd = 1.5 + CFG.HUG_ANIM; l.hugAnim = CFG.HUG_ANIM;   // запрыгивает на спину
  l.path = [];
  G.stats.hugs++;
  if (l.kind === "player") G.stats.playerHugs++;
  logEvent("hug", { power, who: l.id, kind: l.kind });
  hooks.pop(G.big.x, G.big.y - 70, power > 1 ? L().megaHug(power) : L().hug, power > 1 ? "#facc15" : "#ff6fa8", power > 1 ? "mega" : "hug");
  hooks.burst(G.big.x, G.big.y - 30, "heart", "#ff4d8d", 12 * power);
  if (power > 1) hooks.shake(0.3);
  hooks.sfx("hug");
  if (l.kind === "bot") {
    if (G.attackToken === l) G.attackToken = null;
    l.lurkT = rand(3, 6); l.fleeT = 1.3; l.fleeGoal = null;
  }
  if (G.big.hp <= 0) winSoon();   // победа — после последней обнимашки
}
function winSoon() { G.pendingWin = CFG.HUG_ANIM; G.big.stun = 99; G.phase = "hugEnd"; }
// SPEC-012 AC 1c: the game is won (phase "won"); the client shows the win screen (hooks.onWin)
export function winNow() {
  G.pendingWin = 0;
  if (G.phase === "won") return;
  G.phase = "won";
  if (G.tutorialGame) { hooks.onPracticeWin(); return; }     // SPEC-029: тренировка — без экрана победы и награды, дальше по обучению
  logEvent("win", {}); hooks.onWin(payReward(true)); hooks.sfx("win"); hooks.burst(G.big.x, G.big.y - 30, "heart", "#ff4d8d", 40);
}
// ---------- Воздушные поцелуи: летят прямо, полсердечка, Большой краснеет ----------
export function throwKiss(pi) {
  const l = G.littles[pi];
  if (G.phase === "won" || G.pendingWin > 0 || !l || l.kind !== "player" || !canAct(l) || gameInv().kisses <= 0) return false;
  if (inSafe(l)) { hooks.pop(l.x, l.y - 40, L().noKissHome, "#fca5a5"); return false; }   // из домика нельзя
  if (l.kissCd > 0) return false;
  gameInv().kisses--; saveInv();
  if (G.tutorialGame === 2 && l.id === G.littles[0].id) G.tut.did[3] = true;   // SPEC-029: подсказка «пошли поцелуй» сделана
  l.kissCd = CFG.KISS_COOLDOWN;
  const dx = Math.cos(l.dir), dy = Math.sin(l.dir);
  G.kisses.push({ id: (G.kissSeq = G.kissSeq + 1), owner: pi, x: l.x + dx * l.r, y: l.y + dy * l.r, dx, dy, travel: 0 });
  hooks.sfx("kiss");
  return true;
}
function kissHit(k) {
  hooks.burst(G.big.x, G.big.y - 30, "heart", "#ff4d8d", 10);
  const blush = !(G.pendingWin > 0 || G.big.stun > 0 || G.big.hugCd > 0 || G.big.blush > 0);   // SPEC-022: победа уже идёт — только сердечки
  logEvent("kiss", { who: k.owner, result: "hit", blush });
  if (!blush) return;   // в шоке (и 0.3 с после него) или уже красный — только сердечки
  G.big.hp = Math.max(0, G.big.hp - CFG.KISS_DAMAGE);
  G.big.blush = CFG.KISS_BLUSH; G.big.blushBy = k.owner;
  G.big.pushCd = 0; G.big.path = []; G.big.moving = false; G.big.flash = 0.2;
  hooks.pop(G.big.x, G.big.y - 40, L().kissHit, "#ff6fa8", "kiss");
  hooks.pop(G.big.x, G.big.y - 112, L().blush, "#fda4af");   // выше имени Большого
  hooks.sfx("mwah");
  if (G.big.hp <= 0) winSoon();                            // последнее полсердечка — победа, как после обнимашки
}
export function updateKisses(dt) {
  for (const k of G.kisses) {
    let left = CFG.KISS_SPEED * dt;
    while (left > 0 && !k.done) {
      const s = Math.min(CFG.KISS_STEP, left, CFG.KISS_RANGE - k.travel);
      k.x += k.dx * s; k.y += k.dy * s; k.travel += s; left -= s;
      if (seeSolidAt(k.x, k.y)) { k.done = true; logEvent("kiss", { who: k.owner, result: "miss" }); hooks.burst(k.x - k.dx * CFG.KISS_STEP, k.y - k.dy * CFG.KISS_STEP, "star", "#ff9ecb", 8); }   // стена, дерево, камень, край карты
      else if (dist(k, G.big) < G.big.r + CFG.KISS_HIT_PAD && los(k.x, k.y, G.big.x, G.big.y, seeSolidAt)) { k.done = true; kissHit(k); }   // сквозь стену не попадает
      else if (k.travel >= CFG.KISS_RANGE) { k.done = true; logEvent("kiss", { who: k.owner, result: "miss" }); hooks.burst(k.x, k.y, "star", "#ffd1e3", 5); }
    }
  }
  G.kisses = G.kisses.filter(k => !k.done);
}
export function updateHugAnim(dt) {
  for (const l of G.littles) {
    if (l.hugAnim <= 0) continue;
    l.hugAnim -= dt;
    const back = G.big.dir + Math.PI;
    l.x = G.big.x + Math.cos(back) * (G.big.r + l.r + 2);
    l.y = G.big.y + Math.sin(back) * (G.big.r + l.r + 2);
    l.dir = G.big.dir; l.moving = false;
    if (vrand() < dt * 6) hooks.burst(G.big.x, G.big.y - 20, "heart", "#ff4d8d", 1);
    if (l.hugAnim <= 0) {                  // спрыгивает назад
      l.hugAnim = 0;
      l.kx = Math.cos(back) * 230; l.ky = Math.sin(back) * 230;
      resolveWalls(l);
    }
  }
}
// ---------- Предметы ----------
export function spawnItem() {
  const r = rng(), T = CFG.TUTORIAL, o = (1 - T.bananaShare) / 3;
  // SPEC-029: в тренировке — бананов bananaShare, остальное поровну (сапоги, плащ, щит); бананов меньше bananaMin — сразу банан
  const kind = G.tutorialGame ? (r < T.bananaShare || G.items.filter(it => it.kind === "banana").length < T.bananaMin ? "banana" : r < T.bananaShare + o ? "boots" : r < T.bananaShare + 2 * o ? "cloak" : "shield")
    : r < 0.3 ? "boots" : r < 0.55 ? "cloak" : r < 0.75 ? "shield" : "banana";
  for (let k = 0; k < 80; k++) {
    const cx = 1 + Math.floor(rng() * (COLS - 2)), cy = 1 + Math.floor(rng() * (ROWS - 2));
    if (G.blocked[cy * COLS + cx] || (G.tutorialGame && !G.reachable[cy * COLS + cx])) continue;   // SPEC-029: не за изгородь тренировки
    const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
    if (inSafe(p) || dist(p, G.big) < 90 || G.littles.some(l => dist(l, p) < 50) || G.items.some(it => dist(it, p) < 64)) continue;
    G.items.push({ id: (G.itemSeq = G.itemSeq + 1), kind, x: p.x, y: p.y, t: 0, life: kind === "banana" ? CFG.ITEM_LIFE + 8 : CFG.ITEM_LIFE });
    return;
  }
}
// ---------- Бонусные звёздочки: только игроки, +CFG.STAR_COINS монеток ----------
function starSpotOk(cx, cy) {
  const i = cy * COLS + cx;
  if (G.blocked[i] || !G.reachable[i]) return false;
  const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
  if (inSafe(p) || inDanger(p)) return false;
  if (G.dangerZone) {                                      // и не в стенах/дверях дома Большого, и не прямо перед ними
    const m = CFG.STAR_HOUSE_MARGIN * CELL, z = G.dangerZone;
    if (p.x > z.x - m && p.x < z.x + z.w + m && p.y > z.y - m && p.y < z.y + z.h + m) return false;
  }
  if (G.safeZone) {                                        // далеко от домика (от стен, значит и от любой двери)
    const dx = Math.max(G.safeZone.x - p.x, 0, p.x - G.safeZone.x - G.safeZone.w), dy = Math.max(G.safeZone.y - p.y, 0, p.y - G.safeZone.y - G.safeZone.h);
    if (Math.hypot(dx, dy) < CFG.STAR_MIN_FROM_HOME * CELL) return false;
  }
  return !G.items.some(it => cellIdx(it.x, it.y) === i) && !G.bonusStars.some(s => cellIdx(s.x, s.y) === i);
}
export function spawnStar(x, y) {
  let p = null;
  if (typeof x === "number" && typeof y === "number") p = { x, y };   // для тестов: в заданной точке
  else {
    const spots = [];
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) if (starSpotOk(cx, cy)) spots.push([cx, cy]);
    if (!spots.length) return null;
    const [cx, cy] = spots[Math.floor(rng() * spots.length)];
    p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
  }
  const s = { id: (G.starSeq = G.starSeq + 1), x: p.x, y: p.y, t: 0, life: CFG.STAR_LIFE };
  G.bonusStars.push(s);
  return s;
}
export function updateStars(dt) {
  if (G.tutorialGame) return;                                // SPEC-029: в тренировках звёздочек нет
  G.starCd = G.starCd - (dt);
  if (G.starCd <= 0) { if (G.bonusStars.length < CFG.STAR_MAX) spawnStar(); G.starCd = rand(CFG.STAR_EVERY[0], CFG.STAR_EVERY[1]); }
  for (const s of G.bonusStars) {
    s.t += dt;
    const l = G.littles.find(q => q.kind === "player" && canAct(q) && dist(q, s) < q.r + CFG.STAR_PICK);
    if (!l) continue;
    s.t = s.life;
    G.stats.starCoins += CFG.STAR_COINS;
    logEvent("star", { who: l.id });
    addCoins("star", CFG.STAR_COINS);   // сразу в копилку: остаются, даже если уровень не выигран
    hooks.pop(s.x, s.y - 30, "+" + CFG.STAR_COINS, "#fde047");
    hooks.burst(s.x, s.y, "star", "#fde047", 16);
    hooks.sfx("star");
  }
  G.bonusStars = G.bonusStars.filter(s => s.t < s.life);
}

export function updateItems(dt) {
  // SPEC-022: пока подобревший папа идёт домой, новых вещей нет; SPEC-029: в тренировке 1 их нет совсем, в тренировке 2 — часто
  // (каждые TUTORIAL.itemEvery сек, пока их меньше TUTORIAL.itemMax)
  if (!G.big.kind && G.tutorialGame !== 1) {
    const T = CFG.TUTORIAL;
    G.itemCd = G.itemCd - (dt);
    if (G.itemCd <= 0) { if (G.items.length < (G.tutorialGame ? T.itemMax : CFG.ITEM_MAX)) spawnItem(); G.itemCd = G.tutorialGame ? T.itemEvery : rand(CFG.ITEM_EVERY[0], CFG.ITEM_EVERY[1]); }
  }
  for (const l of G.littles) for (const k of ["boots", "cloak", "shield"]) l.fx[k] = Math.max(0, l.fx[k] - dt);
  for (const it of G.items) {
    it.t += dt;
    if (it.kind === "banana") {
      if (!G.big.kind && G.big.slip <= 0 && G.big.stun <= 0 && dist(G.big, it) < G.big.r + 8) {   // SPEC-022: по дороге домой не поскальзывается
        it.t = 999;
        G.big.slip = CFG.SLIP_STUN; G.big.path = []; G.big.flash = 0.2;
        logEvent("slip", {});
        hooks.pop(G.big.x, G.big.y - 70, L().slip, "#fde047");
        hooks.burst(G.big.x, G.big.y, "star", "#fde047", 12);
        hooks.shake(0.2);
        hooks.sfx("slip");
      }
      continue;
    }
    const l = G.littles.find(q => q.state === "ok" && q.hugAnim <= 0 && dist(q, it) < q.r + 16);
    if (l) {
      it.t = 999;
      logEvent("item", { kind: it.kind, who: l.id });
      const base = it.kind === "boots" ? CFG.BOOTS_TIME : it.kind === "cloak" ? CFG.CLOAK_TIME : CFG.SHIELD_TIME;
      l.fx[it.kind] = base * (1 + playerBonus(l, "longItems"));   // SPEC-009: игроку дольше («долгие вещи»)
      hooks.pop(l.x, l.y - 40, L().items[it.kind], "#c4b5fd");
      hooks.burst(l.x, l.y, "star", "#fde047", 10);
      hooks.sfx("item");
    }
  }
  G.items = G.items.filter(it => it.t < it.life);
}

export function separate() {
  const all = G.littles.filter(l => (l.state === "ok" || l.state === "down") && l.hugAnim <= 0);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r;
    if (d >= min) continue;
    const am = a.state === "ok" ? 1 : 0, bm = b.state === "ok" ? 1 : 0, s = am + bm;
    if (!s) continue;
    const o = min - d;
    a.x -= dx / d * o * am / s; a.y -= dy / d * o * am / s;
    b.x += dx / d * o * bm / s; b.y += dy / d * o * bm / s;
    resolveWalls(a); resolveWalls(b);
  }
  for (const l of all) {
    const dx = l.x - G.big.x, dy = l.y - G.big.y, d = Math.hypot(dx, dy) || 0.01, min = l.r + G.big.r;
    if (d >= min) continue;
    if (l.state === "ok") { l.x += dx / d * (min - d); l.y += dy / d * (min - d); resolveWalls(l); }
    else { G.big.x -= dx / d * (min - d); G.big.y -= dy / d * (min - d); resolveWalls(G.big); }
  }
}
export function checkContacts() {
  if (G.pendingWin > 0) return;                              // SPEC-022: злость кончилась — ни обнимашек, ни толчков (он добреет)
  for (const l of G.littles) {
    if (G.phase === "won") return;
    if (!canAct(l)) continue;   // голова кружится: не обнимает, толкнуть нельзя
    const dx = l.x - G.big.x, dy = l.y - G.big.y, d = Math.hypot(dx, dy);
    if (d > G.big.r + l.r + 4) continue;
    const a = Math.atan2(dy, dx), diff = angDiff(G.big.dir, a);
    if (diff > CFG.BEHIND_ANGLE || G.big.slip > 0) {                   // сзади — или Большой лежит после банана
      const wants = l.kind === "player" || l.task === "attack";   // боты обнимают только когда сами решили
      if (wants && G.big.hugCd <= 0 && l.hugCd <= 0 && G.big.stun <= 0) hug(l, a);
    }
    else if (diff < 1.9 && G.big.stun <= 0 && G.big.slip <= 0 && G.big.blush <= 0 && G.big.pushCd <= 0 && G.big.noPush <= 0 && l.invuln <= 0 && l.fx.cloak <= 0 && !inSafe(l)) pushHit(l);
  }
}
// ---------- Спасалка 🩹 (SPEC-007): игрок сразу встаёт там, где он есть — лёжа, по дороге в домик или отдыхая ----------
const KIT_STATES = Object.freeze(["down", "home", "rest"]);
// одно правило для кнопки, подсказки и useRescueKit: идёт игра (победа ещё не наступает), игрок лежит/хромает/отдыхает;
// пауза — у клиента (SPEC-012: canKitNow, kitNow в flow.js)
export const canUseKit = l => G.phase !== "won" && G.pendingWin <= 0 && !!l && l.kind === "player" && KIT_STATES.includes(l.state) && gameInv().rescues > 0;
export function useRescueKit(pi) {
  const l = G.littles[pi];
  if (!canUseKit(l)) return false;                       // боты, игрок на ногах, нет спасалок, пауза — ничего
  gameInv().rescues--; saveInv();
  logEvent("kit", { who: l.id });
  if (G.kitHintPi === pi) G.kitHintT = 0;                   // встал — подсказка больше не нужна
  // лёжа (таймер ещё не кончился) — это не отдых: stats.rests не растёт; дома — уже засчитанный отдых остаётся
  l.state = "ok"; l.invuln = CFG.KIT_INVULN; l.rescue = 0; l.downTimer = 0; l.restTimer = 0; l.path = [];
  l.kx = 0; l.ky = 0; l.moving = false; l.botWait = 0; l.fleeT = 0;
  l.kissCd = Math.max(l.kissCd, CFG.KIT_SLOT_LOCK);      // второй тап по тому же месту (там уже 💋) не бросает поцелуй
  hooks.pop(l.x, l.y - 40, L().kitUsed, "#7CFC9A");
  hooks.burst(l.x, l.y - 10, "star", "#fde68a", 14);
  hooks.sfx("rescue");
  return true;
}
export function updateDowned(dt) {
  for (const l of G.littles) {
    if (l.state !== "down") continue;
    if (!G.tutorialGame) l.downTimer -= dt;                 // SPEC-029: в тренировке лежат без времени — пока не поднимут
    l.botWait = Math.max(0, l.botWait - dt);
    // SPEC-009: рядом игрок — он и поднимает (с «быстрой помощью» быстрее); бот — всегда за RESCUE_TIME
    const helper = G.littles.find(o => o.kind === "player" && helps(o, l)) || G.littles.find(o => helps(o, l));
    l.rescueNeed = CFG.RESCUE_TIME * (1 - (helper ? playerBonus(helper, "quickHelp") : 0));
    l.rescue = helper ? l.rescue + dt : Math.max(0, l.rescue - CFG.RESCUE_DRAIN * dt);   // отошёл — прогресс тает
    if (l.rescue >= l.rescueNeed) {
      l.state = "ok"; l.invuln = CFG.INVULN_AFTER_RESCUE; l.rescue = 0;
      logEvent("rescued", { who: l.id, by: helper.kind });
      hooks.pop(l.x, l.y - 40, L().saved, "#7CFC9A");
      hooks.burst(l.x, l.y - 10, "star", "#7CFC9A", 10);
      hooks.sfx("rescue");
    } else if (!G.tutorialGame && l.downTimer <= 0) {   // никто не помог — встаёт и хромает в домик отдыхать (SPEC-029: в тренировке — никогда)
      l.state = "home"; l.path = []; l.rescue = 0;
      l.restSpot = { ...G.spawns.small[l.id] };
      G.stats.rests++;
      logEvent("rest", { who: l.id });
      if (G.attackToken === l) G.attackToken = null;
      hooks.pop(l.x, l.y - 40, L().out, "#e5e7eb");
      hooks.sfx("out");
    }
  }
}
// Дом Большого: кто в состоянии ok простоял внутри DANGER_TIME — вылетает за дверь, голова кружится (нога цела)
export function updateDanger(dt) {
  for (const l of G.littles) {
    if (l.state !== "ok" || !inDanger(l)) { l.dangerT = 0; continue; }
    if (l.hugAnim > 0) continue;                            // на плечах у Большого — время стоит
    l.dangerT += dt;
    if (l.dangerT >= CFG.DANGER_TIME) throwOut(l);
  }
}
function throwOut(l) {
  const ex = nearestExit(l), c = freeCellNear(cellIdx(ex.x, ex.y));
  const p = c === cellIdx(ex.x, ex.y) && !moveSolidAt(ex.x, ex.y) ? ex : { x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL };
  l.x = p.x; l.y = p.y; l.kx = 0; l.ky = 0; l.path = []; l.fleeGoal = null;
  l.dangerT = 0; l.dizzy = CFG.DIZZY_TIME; l.moving = false;
  logEvent("thrownOut", { who: l.id });
  if (G.attackToken === l) G.attackToken = null;
  hooks.shake(0.2);
  hooks.pop(l.x, l.y - 40, L().thrownOut, "#fca5a5", "out");
  hooks.burst(l.x, l.y - 10, "star", "#fde047", 10);
  hooks.sfx("thrown");
}
// Ближайшая свободная клетка (не стена и не дом Большого), поиск в ширину
export function freeCellNear(idx) {
  const seen = new Uint8Array(COLS * ROWS), q = [idx];
  seen[idx] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], cx = i % COLS, cy = (i / COLS) | 0;
    if (!G.blocked[i] && G.reachable[i] && !inDangerXY((cx + 0.5) * CELL, (cy + 0.5) * CELL)) return i;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return idx;
}
export function updateResting(dt) {
  for (const l of G.littles) {
    if (l.state === "home") {
      l.moving = steerTo(l, l.restSpot.x, l.restSpot.y, CFG.HOME_SPEED, dt, false);
      if (l.moving) l.dir = turnToward(l.dir, l.moveDir, 8 * dt);
      if (!l.moving || dist(l, l.restSpot) < 6) { l.state = "rest"; l.restTimer = CFG.REST_TIME; l.moving = false; l.dir = Math.PI / 2; }
    } else if (l.state === "rest") {
      l.restTimer -= dt; l.moving = false;
      if (l.restTimer <= 0) {
        l.state = "ok"; l.invuln = 2; l.fleeT = 0;
        logEvent("back", { who: l.id });
        hooks.pop(l.x, l.y - 40, L().back, "#7CFC9A");
        hooks.burst(l.x, l.y - 10, "star", "#7CFC9A", 10);
        hooks.sfx("rescue");
      }
    }
  }
}
