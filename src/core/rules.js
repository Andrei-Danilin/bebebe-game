// SPEC-011: the rules — push (and the wide push), hug, win, kisses, items, bonus stars, contacts, the rescue kit, downed,
// danger, resting. Core module.
import { CELL, CFG, COLS, GLOVES, ROWS, UPGRADES } from "./config.js";
import { hooks } from "./hooks.js";
import { angDiff, dist, normAng, rand, rng, turnToward, vrand } from "./util.js";
import { L } from "../i18n.js";
import { nearestExit } from "./bots.js";
import { addCoins, gameInv, gloveOf, progress, saveInv, saveProgress } from "./economy.js";
import { attackToken, big, bonusStars, itemCd, itemSeq, items, kissSeq, kisses, kitHintDone, kitHintPi, littles, logEvent, mode, pendingWin, pushWaves, setAttackToken, setBonusStars, setItemCd, setItemSeq, setItems, setKissSeq, setKisses, setKitHintDone, setKitHintPi, setKitHintT, setMode, setPendingWin, setStarCd, setStarSeq, starCd, starSeq, stats } from "./game.js";
import { bossPower } from "./mood.js";
import { cellIdx, resolveWalls, steerTo } from "./path.js";
import { tut, tutorialGame } from "./practice.js";
import { payReward } from "./progress-rules.js";
import { blocked, canAct, dangerZone, inDanger, inDangerXY, inSafe, los, moveSolidAt, reachable, safeZone, seeSolidAt, spawns } from "./world.js";

// прибавка улучшения k для этого маленького: его уровень (взят при создании; у ботов нет) × step
const playerBonus = (l, k) => (l.upg ? (l.upg[k] || 0) * UPGRADES[k].step : 0);
// скорость маленького-игрока: обычная × «быстрые ноги» × сапоги (CFG.PLAYER_SPEED не меняется — предел Большого от неё)
export const moveSpeed = l => CFG.PLAYER_SPEED * (1 + playerBonus(l, "fastFeet")) * (l.fx.boots > 0 ? CFG.BOOTS_MULT : 1);
const helps = (o, l) => o !== l && o.state === "ok" && dist(o, l) < o.r + l.r + 12;   // o стоит рядом с упавшим l и поднимает его
// SPEC-022: толчок того, кого Большой поймал: самый злой папа (Школа 20) толкает широко — всех рядом перед собой
export function pushHit(t) { if (bossPower(big.boss) === "wide") widePush(t); else push(t); }
// широкий толчок: все маленькие (ok, могут действовать, не неуязвимы, не невидимки, не в домике) ближе WIDE_PUSH_R клеток в угле
// WIDE_PUSH_ARC перед ним (и тот, кого поймал) — каждому обычный толчок (щит спасает своего хозяина), одно «ВЖУХ!», кольцо; стоит дольше
function widePush(t) {
  const reach = CFG.WIDE_PUSH_R * CELL, half = CFG.WIDE_PUSH_ARC * Math.PI / 360;
  const hit = littles.filter(l => l === t || (canAct(l) && l.invuln <= 0 && l.fx.cloak <= 0 && !inSafe(l)
    && dist(l, big) <= reach + l.r && angDiff(big.dir, Math.atan2(l.y - big.y, l.x - big.x)) <= half));
  for (const l of hit) push(l, true);
  const down = hit.filter(l => l.state === "down").length;
  if (!down) return;                                       // всех спас щит — как обычный толчок в щит (PUSH_STAND), без «ВЖУХ!»
  logEvent("widePush", { n: down });
  big.pushCd = CFG.WIDE_PUSH_STAND; big.noPush = CFG.PUSH_RECOVER;   // стоит дольше; передышка (правило детей) — как после любого толчка
  pushWaves.push({ x: big.x, y: big.y, t: 0, r: reach });
  hooks.pop(big.x + Math.cos(big.dir) * big.r * 2, big.y + Math.sin(big.dir) * big.r * 2 - big.r * 2, L().whoosh, "#fde047", "whoosh");
  hooks.shake(CFG.WIDE_PUSH_SHAKE);
  hooks.sfx("push");
}
// SPEC-029: передышка папы после толчка; в тренировке 2 он слабее — × TUTORIAL.pushCooldownMult
const pushRecover = () => CFG.PUSH_RECOVER * (tutorialGame === 2 ? CFG.TUTORIAL.pushCooldownMult : 1);
function push(t, wide = false) {
  const a = Math.atan2(t.y - big.y, t.x - big.x);
  for (const l of littles) if (l.state === "down" && helps(t, l)) l.rescue = 0;   // помощника толкнули — спасение сначала
  if (t.fx.shield > 0) {                   // щит спасает от одного толчка
    t.fx.shield = 0;
    logEvent("push", { who: t.id, blocked: true });
    t.kx = Math.cos(a) * 280; t.ky = Math.sin(a) * 280;
    big.pushCd = CFG.PUSH_STAND; big.noPush = pushRecover();
    hooks.pop(t.x, t.y - 40, L().blocked, "#7dd3fc");
    hooks.burst(t.x, t.y, "star", "#7dd3fc", 14);
    hooks.sfx("shield");
    return;
  }
  t.state = "down"; t.downTimer = CFG.DOWN_TIME; t.rescue = 0; t.path = []; t.dangerT = 0;
  logEvent("push", { who: t.id, blocked: false }); logEvent("down", { who: t.id, kind: t.kind });
  t.botWait = rand(CFG.BOT_RESCUE_DELAY[0], CFG.BOT_RESCUE_DELAY[1]);   // боты пойдут спасать чуть позже
  t.kx = Math.cos(a) * 360; t.ky = Math.sin(a) * 360;
  if (attackToken === t) setAttackToken(null);
  // первый раз за уровень упал игрок со спасалками — короткая подсказка «Нажми 🩹» (SPEC-007)
  if (t.kind === "player" && !kitHintDone && gameInv().rescues > 0) { setKitHintDone(true); setKitHintT(CFG.KIT_HINT_TIME); setKitHintPi(t.id); }
  big.pushCd = CFG.PUSH_STAND;
  big.noPush = pushRecover();             // передышка: какое-то время никого не толкает (SPEC-029: в тренировке 2 — дольше)
  hooks.burst(t.x, t.y, "dust", "#e5d3a1", 10);
  if (wide) return;                         // SPEC-022: широкий толчок — одно «ВЖУХ!» на всех (widePush)
  hooks.shake(0.25);
  hooks.pop(t.x, t.y - 40, L().bang, "#ffcc00", "bang");
  hooks.sfx("push");
}
function hug(l, a) {
  let power = 1;
  big.blush = 0;                                         // обнимашка заканчивает смущение, дальше обычный шок
  const gl = l.kind === "player" ? gloveOf(l.id) : null;
  if (gl) { power = GLOVES[gl].power; progress.inv[gl]--; saveProgress(); }   // рукавицы: сразу 2–3 сердечка
  big.hp = Math.max(0, big.hp - power); big.hugCd = CFG.HUG_STUN + 0.3; big.stun = CFG.HUG_STUN; big.stunFace = a; big.flash = 0.3;
  big.stunTurn = Math.abs(normAng(a - big.dir)) / CFG.HUG_STUN;   // медленно поворачивается, пока в шоке
  big.state = "chase"; big.lastSeen = { x: l.x, y: l.y };
  big.slip = 0;
  l.hugCd = 1.5 + CFG.HUG_ANIM; l.hugAnim = CFG.HUG_ANIM;   // запрыгивает на спину
  l.path = [];
  stats.hugs++;
  if (l.kind === "player") stats.playerHugs++;
  logEvent("hug", { power, who: l.id, kind: l.kind });
  hooks.pop(big.x, big.y - 70, power > 1 ? L().megaHug(power) : L().hug, power > 1 ? "#facc15" : "#ff6fa8", power > 1 ? "mega" : "hug");
  hooks.burst(big.x, big.y - 30, "heart", "#ff4d8d", 12 * power);
  if (power > 1) hooks.shake(0.3);
  hooks.sfx("hug");
  if (l.kind === "bot") {
    if (attackToken === l) setAttackToken(null);
    l.lurkT = rand(3, 6); l.fleeT = 1.3; l.fleeGoal = null;
  }
  if (big.hp <= 0) winSoon();   // победа — после последней обнимашки
}
function winSoon() { setPendingWin(CFG.HUG_ANIM); big.stun = 99; }
export function winNow() {
  setPendingWin(0);
  if (mode !== "play") return;
  if (tutorialGame) { hooks.onPracticeWin(); return; }     // SPEC-029: тренировка — без экрана победы и награды, дальше по обучению
  setMode("win"); logEvent("win", {}); hooks.onWin(payReward(true)); hooks.sfx("win"); hooks.burst(big.x, big.y - 30, "heart", "#ff4d8d", 40);
}
// ---------- Воздушные поцелуи: летят прямо, полсердечка, Большой краснеет ----------
export function throwKiss(pi) {
  const l = littles[pi];
  if (mode !== "play" || pendingWin > 0 || !l || l.kind !== "player" || !canAct(l) || gameInv().kisses <= 0) return false;
  if (inSafe(l)) { hooks.pop(l.x, l.y - 40, L().noKissHome, "#fca5a5"); return false; }   // из домика нельзя
  if (l.kissCd > 0) return false;
  gameInv().kisses--; saveInv();
  if (tutorialGame === 2 && l.id === littles[0].id) tut.did[3] = true;   // SPEC-029: подсказка «пошли поцелуй» сделана
  l.kissCd = CFG.KISS_COOLDOWN;
  const dx = Math.cos(l.dir), dy = Math.sin(l.dir);
  kisses.push({ id: setKissSeq(kissSeq + 1), owner: pi, x: l.x + dx * l.r, y: l.y + dy * l.r, dx, dy, travel: 0 });
  hooks.sfx("kiss");
  return true;
}
function kissHit(k) {
  hooks.burst(big.x, big.y - 30, "heart", "#ff4d8d", 10);
  const blush = !(pendingWin > 0 || big.stun > 0 || big.hugCd > 0 || big.blush > 0);   // SPEC-022: победа уже идёт — только сердечки
  logEvent("kiss", { who: k.owner, result: "hit", blush });
  if (!blush) return;   // в шоке (и 0.3 с после него) или уже красный — только сердечки
  big.hp = Math.max(0, big.hp - CFG.KISS_DAMAGE);
  big.blush = CFG.KISS_BLUSH; big.blushBy = k.owner;
  big.pushCd = 0; big.path = []; big.moving = false; big.flash = 0.2;
  hooks.pop(big.x, big.y - 40, L().kissHit, "#ff6fa8", "kiss");
  hooks.pop(big.x, big.y - 112, L().blush, "#fda4af");   // выше имени Большого
  hooks.sfx("mwah");
  if (big.hp <= 0) winSoon();                            // последнее полсердечка — победа, как после обнимашки
}
export function updateKisses(dt) {
  for (const k of kisses) {
    let left = CFG.KISS_SPEED * dt;
    while (left > 0 && !k.done) {
      const s = Math.min(CFG.KISS_STEP, left, CFG.KISS_RANGE - k.travel);
      k.x += k.dx * s; k.y += k.dy * s; k.travel += s; left -= s;
      if (seeSolidAt(k.x, k.y)) { k.done = true; logEvent("kiss", { who: k.owner, result: "miss" }); hooks.burst(k.x - k.dx * CFG.KISS_STEP, k.y - k.dy * CFG.KISS_STEP, "star", "#ff9ecb", 8); }   // стена, дерево, камень, край карты
      else if (dist(k, big) < big.r + CFG.KISS_HIT_PAD && los(k.x, k.y, big.x, big.y, seeSolidAt)) { k.done = true; kissHit(k); }   // сквозь стену не попадает
      else if (k.travel >= CFG.KISS_RANGE) { k.done = true; logEvent("kiss", { who: k.owner, result: "miss" }); hooks.burst(k.x, k.y, "star", "#ffd1e3", 5); }
    }
  }
  setKisses(kisses.filter(k => !k.done));
}
export function updateHugAnim(dt) {
  for (const l of littles) {
    if (l.hugAnim <= 0) continue;
    l.hugAnim -= dt;
    const back = big.dir + Math.PI;
    l.x = big.x + Math.cos(back) * (big.r + l.r + 2);
    l.y = big.y + Math.sin(back) * (big.r + l.r + 2);
    l.dir = big.dir; l.moving = false;
    if (vrand() < dt * 6) hooks.burst(big.x, big.y - 20, "heart", "#ff4d8d", 1);
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
  const kind = tutorialGame ? (r < T.bananaShare || items.filter(it => it.kind === "banana").length < T.bananaMin ? "banana" : r < T.bananaShare + o ? "boots" : r < T.bananaShare + 2 * o ? "cloak" : "shield")
    : r < 0.3 ? "boots" : r < 0.55 ? "cloak" : r < 0.75 ? "shield" : "banana";
  for (let k = 0; k < 80; k++) {
    const cx = 1 + Math.floor(rng() * (COLS - 2)), cy = 1 + Math.floor(rng() * (ROWS - 2));
    if (blocked[cy * COLS + cx] || (tutorialGame && !reachable[cy * COLS + cx])) continue;   // SPEC-029: не за изгородь тренировки
    const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
    if (inSafe(p) || dist(p, big) < 90 || littles.some(l => dist(l, p) < 50) || items.some(it => dist(it, p) < 64)) continue;
    items.push({ id: setItemSeq(itemSeq + 1), kind, x: p.x, y: p.y, t: 0, life: kind === "banana" ? CFG.ITEM_LIFE + 8 : CFG.ITEM_LIFE });
    return;
  }
}
// ---------- Бонусные звёздочки: только игроки, +CFG.STAR_COINS монеток ----------
function starSpotOk(cx, cy) {
  const i = cy * COLS + cx;
  if (blocked[i] || !reachable[i]) return false;
  const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
  if (inSafe(p) || inDanger(p)) return false;
  if (dangerZone) {                                      // и не в стенах/дверях дома Большого, и не прямо перед ними
    const m = CFG.STAR_HOUSE_MARGIN * CELL, z = dangerZone;
    if (p.x > z.x - m && p.x < z.x + z.w + m && p.y > z.y - m && p.y < z.y + z.h + m) return false;
  }
  if (safeZone) {                                        // далеко от домика (от стен, значит и от любой двери)
    const dx = Math.max(safeZone.x - p.x, 0, p.x - safeZone.x - safeZone.w), dy = Math.max(safeZone.y - p.y, 0, p.y - safeZone.y - safeZone.h);
    if (Math.hypot(dx, dy) < CFG.STAR_MIN_FROM_HOME * CELL) return false;
  }
  return !items.some(it => cellIdx(it.x, it.y) === i) && !bonusStars.some(s => cellIdx(s.x, s.y) === i);
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
  const s = { id: setStarSeq(starSeq + 1), x: p.x, y: p.y, t: 0, life: CFG.STAR_LIFE };
  bonusStars.push(s);
  return s;
}
export function updateStars(dt) {
  if (tutorialGame) return;                                // SPEC-029: в тренировках звёздочек нет
  setStarCd(starCd - (dt));
  if (starCd <= 0) { if (bonusStars.length < CFG.STAR_MAX) spawnStar(); setStarCd(rand(CFG.STAR_EVERY[0], CFG.STAR_EVERY[1])); }
  for (const s of bonusStars) {
    s.t += dt;
    const l = littles.find(q => q.kind === "player" && canAct(q) && dist(q, s) < q.r + CFG.STAR_PICK);
    if (!l) continue;
    s.t = s.life;
    stats.starCoins += CFG.STAR_COINS;
    logEvent("star", { who: l.id });
    addCoins("star", CFG.STAR_COINS);   // сразу в копилку: остаются, даже если уровень не выигран
    hooks.pop(s.x, s.y - 30, "+" + CFG.STAR_COINS, "#fde047");
    hooks.burst(s.x, s.y, "star", "#fde047", 16);
    hooks.sfx("star");
  }
  setBonusStars(bonusStars.filter(s => s.t < s.life));
}

export function updateItems(dt) {
  // SPEC-022: пока подобревший папа идёт домой, новых вещей нет; SPEC-029: в тренировке 1 их нет совсем, в тренировке 2 — часто
  // (каждые TUTORIAL.itemEvery сек, пока их меньше TUTORIAL.itemMax)
  if (!big.kind && tutorialGame !== 1) {
    const T = CFG.TUTORIAL;
    setItemCd(itemCd - (dt));
    if (itemCd <= 0) { if (items.length < (tutorialGame ? T.itemMax : CFG.ITEM_MAX)) spawnItem(); setItemCd(tutorialGame ? T.itemEvery : rand(CFG.ITEM_EVERY[0], CFG.ITEM_EVERY[1])); }
  }
  for (const l of littles) for (const k of ["boots", "cloak", "shield"]) l.fx[k] = Math.max(0, l.fx[k] - dt);
  for (const it of items) {
    it.t += dt;
    if (it.kind === "banana") {
      if (!big.kind && big.slip <= 0 && big.stun <= 0 && dist(big, it) < big.r + 8) {   // SPEC-022: по дороге домой не поскальзывается
        it.t = 999;
        big.slip = CFG.SLIP_STUN; big.path = []; big.flash = 0.2;
        logEvent("slip", {});
        hooks.pop(big.x, big.y - 70, L().slip, "#fde047");
        hooks.burst(big.x, big.y, "star", "#fde047", 12);
        hooks.shake(0.2);
        hooks.sfx("slip");
      }
      continue;
    }
    const l = littles.find(q => q.state === "ok" && q.hugAnim <= 0 && dist(q, it) < q.r + 16);
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
  setItems(items.filter(it => it.t < it.life));
}

export function separate() {
  const all = littles.filter(l => (l.state === "ok" || l.state === "down") && l.hugAnim <= 0);
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
    const dx = l.x - big.x, dy = l.y - big.y, d = Math.hypot(dx, dy) || 0.01, min = l.r + big.r;
    if (d >= min) continue;
    if (l.state === "ok") { l.x += dx / d * (min - d); l.y += dy / d * (min - d); resolveWalls(l); }
    else { big.x -= dx / d * (min - d); big.y -= dy / d * (min - d); resolveWalls(big); }
  }
}
export function checkContacts() {
  if (pendingWin > 0) return;                              // SPEC-022: злость кончилась — ни обнимашек, ни толчков (он добреет)
  for (const l of littles) {
    if (mode !== "play") return;
    if (!canAct(l)) continue;   // голова кружится: не обнимает, толкнуть нельзя
    const dx = l.x - big.x, dy = l.y - big.y, d = Math.hypot(dx, dy);
    if (d > big.r + l.r + 4) continue;
    const a = Math.atan2(dy, dx), diff = angDiff(big.dir, a);
    if (diff > CFG.BEHIND_ANGLE || big.slip > 0) {                   // сзади — или Большой лежит после банана
      const wants = l.kind === "player" || l.task === "attack";   // боты обнимают только когда сами решили
      if (wants && big.hugCd <= 0 && l.hugCd <= 0 && big.stun <= 0) hug(l, a);
    }
    else if (diff < 1.9 && big.stun <= 0 && big.slip <= 0 && big.blush <= 0 && big.pushCd <= 0 && big.noPush <= 0 && l.invuln <= 0 && l.fx.cloak <= 0 && !inSafe(l)) pushHit(l);
  }
}
// ---------- Спасалка 🩹 (SPEC-007): игрок сразу встаёт там, где он есть — лёжа, по дороге в домик или отдыхая ----------
const KIT_STATES = ["down", "home", "rest"];
// одно правило для кнопки, подсказки и useRescueKit: идёт игра (не пауза, победа ещё не наступает), игрок лежит/хромает/отдыхает
export const canUseKit = l => mode === "play" && pendingWin <= 0 && !!l && l.kind === "player" && KIT_STATES.includes(l.state) && gameInv().rescues > 0;
export function useRescueKit(pi) {
  const l = littles[pi];
  if (!canUseKit(l)) return false;                       // боты, игрок на ногах, нет спасалок, пауза — ничего
  gameInv().rescues--; saveInv();
  logEvent("kit", { who: l.id });
  if (kitHintPi === pi) setKitHintT(0);                   // встал — подсказка больше не нужна
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
  for (const l of littles) {
    if (l.state !== "down") continue;
    if (!tutorialGame) l.downTimer -= dt;                 // SPEC-029: в тренировке лежат без времени — пока не поднимут
    l.botWait = Math.max(0, l.botWait - dt);
    // SPEC-009: рядом игрок — он и поднимает (с «быстрой помощью» быстрее); бот — всегда за RESCUE_TIME
    const helper = littles.find(o => o.kind === "player" && helps(o, l)) || littles.find(o => helps(o, l));
    l.rescueNeed = CFG.RESCUE_TIME * (1 - (helper ? playerBonus(helper, "quickHelp") : 0));
    l.rescue = helper ? l.rescue + dt : Math.max(0, l.rescue - CFG.RESCUE_DRAIN * dt);   // отошёл — прогресс тает
    if (l.rescue >= l.rescueNeed) {
      l.state = "ok"; l.invuln = CFG.INVULN_AFTER_RESCUE; l.rescue = 0;
      logEvent("rescued", { who: l.id, by: helper.kind });
      hooks.pop(l.x, l.y - 40, L().saved, "#7CFC9A");
      hooks.burst(l.x, l.y - 10, "star", "#7CFC9A", 10);
      hooks.sfx("rescue");
    } else if (!tutorialGame && l.downTimer <= 0) {   // никто не помог — встаёт и хромает в домик отдыхать (SPEC-029: в тренировке — никогда)
      l.state = "home"; l.path = []; l.rescue = 0;
      l.restSpot = { ...spawns.small[l.id] };
      stats.rests++;
      logEvent("rest", { who: l.id });
      if (attackToken === l) setAttackToken(null);
      hooks.pop(l.x, l.y - 40, L().out, "#e5e7eb");
      hooks.sfx("out");
    }
  }
}
// Дом Большого: кто в состоянии ok простоял внутри DANGER_TIME — вылетает за дверь, голова кружится (нога цела)
export function updateDanger(dt) {
  for (const l of littles) {
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
  if (attackToken === l) setAttackToken(null);
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
    if (!blocked[i] && reachable[i] && !inDangerXY((cx + 0.5) * CELL, (cy + 0.5) * CELL)) return i;
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
  for (const l of littles) {
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
