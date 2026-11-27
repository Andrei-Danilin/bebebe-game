// SPEC-011: the rules — push (and the wide push), hug, win, kisses, items, bonus stars, contacts, the rescue kit, downed,
// danger, resting. Core module.
import { CELL, CFG, COLS, GLOVES, levelsPerWorld, ROWS, upgBonus } from "./config.js";
import { angDiff, clamp, dist, normAng, rand, rng, turnToward } from "./util.js";
import { emit, logEcon, logEvent } from "./events.js";
import { cellIdx, freeCellNear, nearestExit } from "./grid.js";
import { bigMood, bossPower } from "./mood.js";
import { resolveWalls, steerTo } from "./path.js";
import { fastTarget } from "./progress-rules.js";
import { canAct, inDanger, inSafe, los, moveSolidAt, seeSolidAt } from "./world.js";
import { G } from "./active.js";

// прибавка улучшения k для этого маленького: его уровень (взят при создании; у ботов нет) × step
const playerBonus = (l, k) => (l.upg ? upgBonus(k, l.upg[k] || 0) : 0);
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
  emit("wave", { x: G.big.x, y: G.big.y, r: reach });
  emit("pop", { key: "whoosh", args: [], x: G.big.x + Math.cos(G.big.dir) * G.big.r * 2, y: G.big.y + Math.sin(G.big.dir) * G.big.r * 2 - G.big.r * 2, color: "#fde047", meaning: "whoosh" });
  emit("shake", { t: CFG.WIDE_PUSH_SHAKE });
  emit("sfx", { name: "push" });
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
    emit("pop", { key: "blocked", args: [], x: t.x, y: t.y - 40, color: "#7dd3fc" });
    emit("burst", { kind: "star", x: t.x, y: t.y, n: 14, color: "#7dd3fc" });
    emit("sfx", { name: "shield" });
    return;
  }
  t.state = "down"; t.downTimer = CFG.DOWN_TIME; t.rescue = 0; t.helped = false; t.path = []; t.dangerT = 0;
  logEvent("push", { who: t.id, blocked: false }); logEvent("down", { who: t.id, kind: t.kind });
  t.botWait = rand(CFG.BOT_RESCUE_DELAY[0], CFG.BOT_RESCUE_DELAY[1]);   // боты пойдут спасать чуть позже
  t.kx = Math.cos(a) * 360; t.ky = Math.sin(a) * 360;
  if (G.attackToken === t) G.attackToken = null;
  // первый раз за уровень упал игрок со спасалками — короткая подсказка «Нажми 🩹» (SPEC-007)
  if (t.kind === "player" && !G.kitHintDone && gameInv().kits > 0) { G.kitHintDone = true; emit("hint", { kind: "kit", slot: t.slot }); }
  G.big.pushCd = CFG.PUSH_STAND;
  G.big.noPush = pushRecover();             // передышка: какое-то время никого не толкает (SPEC-029: в тренировке 2 — дольше)
  emit("burst", { kind: "dust", x: t.x, y: t.y, n: 10, color: "#e5d3a1" });
  if (wide) return;                         // SPEC-022: широкий толчок — одно «ВЖУХ!» на всех (widePush)
  emit("shake", { t: 0.25 });
  emit("pop", { key: "bang", args: [], x: t.x, y: t.y - 40, color: "#ffcc00", meaning: "bang" });
  emit("sfx", { name: "push" });
}
function hug(l, a) {
  let power = 1;
  G.big.blush = 0;                                         // обнимашка заканчивает смущение, дальше обычный шок
  const gl = l.kind === "player" ? gloveOf(l.id) : null;
  if (gl) { power = GLOVES[gl].power; G.stock.gloves[gl]--; logEcon("spent", { slot: l.slot, kind: "glove", glove: gl }); }   // рукавицы: сразу 2–3 сердечка
  const mood0 = bigMood();
  G.big.hp = Math.max(0, G.big.hp - power); G.big.hugCd = CFG.HUG_STUN + 0.3; G.big.stun = CFG.HUG_STUN; G.big.stunFace = a; G.big.flash = 0.3;
  G.big.stunTurn = Math.abs(normAng(a - G.big.dir)) / CFG.HUG_STUN;   // медленно поворачивается, пока в шоке
  G.big.state = "chase"; G.big.lastSeen = { x: l.x, y: l.y };
  G.big.slip = 0;
  if (bigMood() !== mood0) emit("mood", { level: bigMood() });
  l.hugCd = 1.5 + CFG.HUG_ANIM; l.hugAnim = CFG.HUG_ANIM;   // запрыгивает на спину
  l.path = [];
  G.stats.hugs++;
  if (l.kind === "player") G.stats.playerHugs++;
  logEvent("hug", { power, who: l.id, kind: l.kind });
  emit("pop", { key: power > 1 ? "megaHug" : "hug", args: power > 1 ? [power] : [], x: G.big.x, y: G.big.y - 70, color: power > 1 ? "#facc15" : "#ff6fa8", meaning: power > 1 ? "mega" : "hug" });
  emit("burst", { kind: "heart", x: G.big.x, y: G.big.y - 30, n: 12 * power, color: "#ff4d8d" });
  if (power > 1) emit("shake", { t: 0.3 });
  emit("sfx", { name: "hug" });
  if (l.kind === "bot") {
    if (G.attackToken === l) G.attackToken = null;
    l.lurkT = rand(3, 6); l.fleeT = 1.3; l.fleeGoal = null;
  }
  if (G.big.hp <= 0) winSoon();   // победа — после последней обнимашки
}
function winSoon() { G.pendingWin = CFG.HUG_ANIM; G.big.stun = 99; G.phase = "hugEnd"; }
// SPEC-012 AC 1c / 6: the game is won (phase "won"): the result event (the client pays the reward and shows the win screen)
// SPEC-012 AC 2 / 6b: the stock the game spends from — a practice game's own, else the game's (local play: the shared pool the client
// keeps equal to the saves); the glove of player pi (his slot's, while the stock has its charges; none in practice)
export const gameInv = () => (G.tutorialGame ? G.tutorialInv : G.stock);
export const gloveOf = pi => { const l = G.littles[pi], g = l && l.glove; return !G.tutorialGame && g && g !== "none" && G.stock.gloves[g] > 0 ? g : null; };
// SPEC-012 AC 6: what a level ended with — plain data for the client and computeReward (progress-rules.js). stats: the counts the
// reward reads; perSlot: per slot (display only: never paid) hugs, pushes, star coins, kisses / kits / glove charges used, rests
export function levelResult(win) {
  const n = clamp(G.level, 1, levelsPerWorld()), s = G.stats;
  return { world: G.world, n, time: s.time, win, nobodyOut: s.rests === 0, fast: s.time <= fastTarget(G.world, n),
    stats: { hugs: s.hugs, playerHugs: s.playerHugs, rests: s.rests, starCoins: s.starCoins }, perSlot: perSlotCounts() };
}
function perSlotCounts() {
  const out = {}, slotOf = who => G.littles[who] && G.littles[who].slot;
  for (const l of G.littles) out[l.slot] = { hugs: 0, pushes: 0, starCoins: 0, kissesUsed: 0, kitsUsed: 0, gloveChargesUsed: 0, rests: 0 };
  const USED = { kiss: "kissesUsed", kit: "kitsUsed", glove: "gloveChargesUsed" };
  for (const e of G.events) {
    const c = out[e.type === "spent" ? e.slot : slotOf(e.who)];
    if (!c) continue;
    if (e.type === "hug") c.hugs++;
    else if (e.type === "push" && !e.blocked) c.pushes++;
    else if (e.type === "star") c.starCoins += CFG.STAR_COINS;
    else if (e.type === "rest") c.rests++;
    else if (e.type === "spent") c[USED[e.kind]]++;
  }
  return out;
}
export function winNow() {
  G.pendingWin = 0;
  if (G.phase === "won") return;
  G.phase = "won";
  if (G.tutorialGame) { logEcon("practiceWin", { step: G.tutorialGame }); return; }   // SPEC-029: тренировка — без экрана победы и награды, дальше по обучению (клиент)
  logEvent("win", {}); logEcon("result", levelResult(true)); emit("sfx", { name: "win" }); emit("burst", { kind: "heart", x: G.big.x, y: G.big.y - 30, n: 40, color: "#ff4d8d" });
}
// ---------- Воздушные поцелуи: летят прямо, полсердечка, Большой краснеет ----------
export function throwKiss(pi) {
  const l = G.littles[pi];
  if (G.phase === "won" || G.pendingWin > 0 || !l || l.kind !== "player" || !canAct(l) || gameInv().kisses <= 0) return false;
  if (inSafe(l)) { emit("pop", { key: "noKissHome", args: [], x: l.x, y: l.y - 40, color: "#fca5a5" }); return false; }   // из домика нельзя
  if (l.kissCd > 0) return false;
  gameInv().kisses--;
  if (!G.tutorialGame) logEcon("spent", { slot: l.slot, kind: "kiss" });   // SPEC-029: запас тренировки — свой
  if (G.tutorialGame === 2 && l.id === G.littles[0].id) G.tut.did[3] = true;   // SPEC-029: подсказка «пошли поцелуй» сделана
  l.kissCd = CFG.KISS_COOLDOWN;
  const dx = Math.cos(l.dir), dy = Math.sin(l.dir);
  G.kisses.push({ id: (G.kissSeq = G.kissSeq + 1), owner: pi, x: l.x + dx * l.r, y: l.y + dy * l.r, dx, dy, travel: 0 });
  emit("sfx", { name: "kiss" });
  return true;
}
function kissHit(k) {
  emit("burst", { kind: "heart", x: G.big.x, y: G.big.y - 30, n: 10, color: "#ff4d8d" });
  const blush = !(G.pendingWin > 0 || G.big.stun > 0 || G.big.hugCd > 0 || G.big.blush > 0);   // SPEC-022: победа уже идёт — только сердечки
  logEvent("kiss", { who: k.owner, result: "hit", blush });
  if (!blush) return;   // в шоке (и 0.3 с после него) или уже красный — только сердечки
  const mood0 = bigMood();
  G.big.hp = Math.max(0, G.big.hp - CFG.KISS_DAMAGE);
  if (bigMood() !== mood0) emit("mood", { level: bigMood() });
  G.big.blush = CFG.KISS_BLUSH; G.big.blushBy = k.owner;
  G.big.pushCd = 0; G.big.path = []; G.big.moving = false; G.big.flash = 0.2;
  emit("pop", { key: "kissHit", args: [], x: G.big.x, y: G.big.y - 40, color: "#ff6fa8", meaning: "kiss" });
  emit("pop", { key: "blush", args: [], x: G.big.x, y: G.big.y - 112, color: "#fda4af" });   // выше имени Большого
  emit("sfx", { name: "mwah" });
  if (G.big.hp <= 0) winSoon();                            // последнее полсердечка — победа, как после обнимашки
}
export function updateKisses(dt) {
  for (const k of G.kisses) {
    let left = CFG.KISS_SPEED * dt;
    while (left > 0 && !k.done) {
      const s = Math.min(CFG.KISS_STEP, left, CFG.KISS_RANGE - k.travel);
      k.x += k.dx * s; k.y += k.dy * s; k.travel += s; left -= s;
      if (seeSolidAt(k.x, k.y)) { k.done = true; logEvent("kiss", { who: k.owner, result: "miss" }); emit("burst", { kind: "star", x: k.x - k.dx * CFG.KISS_STEP, y: k.y - k.dy * CFG.KISS_STEP, n: 8, color: "#ff9ecb" }); }   // стена, дерево, камень, край карты
      else if (dist(k, G.big) < G.big.r + CFG.KISS_HIT_PAD && los(k.x, k.y, G.big.x, G.big.y, seeSolidAt)) { k.done = true; kissHit(k); }   // сквозь стену не попадает
      else if (k.travel >= CFG.KISS_RANGE) { k.done = true; logEvent("kiss", { who: k.owner, result: "miss" }); emit("burst", { kind: "star", x: k.x, y: k.y, n: 5, color: "#ffd1e3" }); }
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
  let p;
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
    logEcon("coins", { slot: l.slot, reason: "star", amount: CFG.STAR_COINS });   // клиент кладёт их в копилку сразу: остаются, даже если уровень не выигран
    emit("pop", { key: null, args: ["+" + CFG.STAR_COINS], x: s.x, y: s.y - 30, color: "#fde047" });
    emit("burst", { kind: "star", x: s.x, y: s.y, n: 16, color: "#fde047" });
    emit("sfx", { name: "star" });
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
        emit("pop", { key: "slip", args: [], x: G.big.x, y: G.big.y - 70, color: "#fde047" });
        emit("burst", { kind: "star", x: G.big.x, y: G.big.y, n: 12, color: "#fde047" });
        emit("shake", { t: 0.2 });
        emit("sfx", { name: "slip" });
      }
      continue;
    }
    const l = G.littles.find(q => q.state === "ok" && q.hugAnim <= 0 && dist(q, it) < q.r + 16);
    if (l) {
      it.t = 999;
      logEvent("item", { kind: it.kind, who: l.id });
      const base = it.kind === "boots" ? CFG.BOOTS_TIME : it.kind === "cloak" ? CFG.CLOAK_TIME : CFG.SHIELD_TIME;
      l.fx[it.kind] = base * (1 + playerBonus(l, "longItems"));   // SPEC-009: игроку дольше («долгие вещи»)
      emit("pop", { key: "items", args: [it.kind], x: l.x, y: l.y - 40, color: "#c4b5fd" });
      emit("burst", { kind: "star", x: l.x, y: l.y, n: 10, color: "#fde047" });
      emit("sfx", { name: "item" });
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
export const canUseKit = l => G.phase !== "won" && G.pendingWin <= 0 && !!l && l.kind === "player" && KIT_STATES.includes(l.state) && gameInv().kits > 0;
export function useRescueKit(pi) {
  const l = G.littles[pi];
  if (!canUseKit(l)) return false;                       // боты, игрок на ногах, нет спасалок, пауза — ничего
  gameInv().kits--;
  if (!G.tutorialGame) logEcon("spent", { slot: l.slot, kind: "kit" });
  logEvent("kit", { who: l.id });
  emit("hint", { kind: "kitOff", slot: l.slot });            // встал — его подсказка «Нажми 🩹» больше не нужна
  // лёжа (таймер ещё не кончился) — это не отдых: stats.rests не растёт; дома — уже засчитанный отдых остаётся
  l.state = "ok"; l.invuln = CFG.KIT_INVULN; l.rescue = 0; l.helped = false; l.downTimer = 0; l.restTimer = 0; l.path = [];
  l.kx = 0; l.ky = 0; l.moving = false; l.botWait = 0; l.fleeT = 0;
  l.kissCd = Math.max(l.kissCd, CFG.KIT_SLOT_LOCK);      // второй тап по тому же месту (там уже 💋) не бросает поцелуй
  emit("pop", { key: "kitUsed", args: [], x: l.x, y: l.y - 40, color: "#7CFC9A" });
  emit("burst", { kind: "star", x: l.x, y: l.y - 10, n: 14, color: "#fde68a" });
  emit("sfx", { name: "rescue" });
  return true;
}
export function updateDowned(dt) {
  for (const l of G.littles) {
    if (l.state !== "down") continue;
    l.botWait = Math.max(0, l.botWait - dt);
    // SPEC-009: рядом игрок — он и поднимает (с «быстрой помощью» быстрее); бот — всегда за RESCUE_TIME
    const helper = G.littles.find(o => o.kind === "player" && helps(o, l)) || G.littles.find(o => helps(o, l));
    l.helped = !!helper;                                    // SPEC-036: клиент рисует «ему помогают» (зелёное кольцо, свечение)
    // SPEC-036 (решение детей): пока помощник рядом — таймер «домой» стоит; отошёл — идёт дальше с того же места
    if (!G.tutorialGame && !(helper && CFG.DOWN_PAUSE_HELPED)) l.downTimer -= dt;      // SPEC-029: в тренировке лежат без времени — пока не поднимут
    l.rescueNeed = CFG.RESCUE_TIME * (1 - (helper ? playerBonus(helper, "quickHelp") : 0));
    l.rescue = helper ? l.rescue + dt : Math.max(0, l.rescue - CFG.RESCUE_DRAIN * dt);   // отошёл — прогресс тает
    if (l.rescue >= l.rescueNeed) {
      l.state = "ok"; l.invuln = CFG.INVULN_AFTER_RESCUE; l.rescue = 0; l.helped = false;
      logEvent("rescued", { who: l.id, by: helper.kind });
      emit("pop", { key: "saved", args: [], x: l.x, y: l.y - 40, color: "#7CFC9A" });
      emit("burst", { kind: "star", x: l.x, y: l.y - 10, n: 10, color: "#7CFC9A" });
      emit("sfx", { name: "rescue" });
    } else if (!G.tutorialGame && l.downTimer <= 0) {   // никто не помог — встаёт и хромает в домик отдыхать (SPEC-029: в тренировке — никогда)
      l.state = "home"; l.path = []; l.rescue = 0; l.helped = false;
      l.restSpot = { ...G.spawns.small[l.id] };
      G.stats.rests++;
      logEvent("rest", { who: l.id });
      if (G.attackToken === l) G.attackToken = null;
      emit("pop", { key: "out", args: [], x: l.x, y: l.y - 40, color: "#e5e7eb" });
      emit("sfx", { name: "out" });
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
  emit("shake", { t: 0.2 });
  emit("pop", { key: "thrownOut", args: [], x: l.x, y: l.y - 40, color: "#fca5a5", meaning: "out" });
  emit("burst", { kind: "star", x: l.x, y: l.y - 10, n: 10, color: "#fde047" });
  emit("sfx", { name: "thrown" });
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
        emit("pop", { key: "back", args: [], x: l.x, y: l.y - 40, color: "#7CFC9A" });
        emit("burst", { kind: "star", x: l.x, y: l.y - 10, n: 10, color: "#7CFC9A" });
        emit("sfx", { name: "rescue" });
      }
    }
  }
}
