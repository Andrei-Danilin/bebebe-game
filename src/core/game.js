// SPEC-011: the running game — its state (Little Ones, the Big One, items, stars, kisses, the event log, mode), buildGame,
// update, simRun. Core module.
import { CFG, WORLDS } from "./config.js";
import { hooks } from "./hooks.js";
import { rand } from "./util.js";
import { autoMove, autoThink, setAutoMove, setAutoNavs } from "./autopilot.js";
import { updateBig } from "./big.js";
import { updateBots } from "./bots.js";
import { difficulty } from "./difficulty.js";
import { progress } from "./economy.js";
import { loadLevel } from "./level/build.js";
import { bossFor, startKindWalk, updateKindWalk } from "./mood.js";
import { moveEntity } from "./path.js";
import { applyTutorialMap, tutorialGame, tutorialNote, tutorialSetup, updateTutorial } from "./practice.js";
import { checkContacts, moveSpeed, separate, updateDanger, updateDowned, updateHugAnim, updateItems, updateKisses, updateResting, updateStars, winNow } from "./rules.js";
import { canAct, spawns } from "./world.js";

// ---------- Миры (SPEC-006): место уровня — его мир ----------
export let curWorld = WORLDS[0];
export let littles = [], big = null;
export let botAttackCd = 0, prevToken = null;
export let mode = "home", numPlayers = 1, level = 1, attackToken = null;
export let stats = { hugs: 0, time: 0 };
export let items = [], itemCd = 5, itemSeq = 0, pendingWin = 0, lastReward = null;
// SPEC-008: журнал событий игры { t (сек игры), type, …данные } — для тестов, отчёта баланса и счёта монеток (SPEC-009).
// Только простые данные; не длиннее CFG.EVENT_LOG_MAX (старые выпадают); очищается в начале уровня (startGame).
export let events = [];
export function logEvent(type, data) {
  const e = { t: stats.time, type, ...data };
  events.push(e);
  if (events.length > CFG.EVENT_LOG_MAX) events.splice(0, events.length - CFG.EVENT_LOG_MAX);
  if (tutorialGame === 2) tutorialNote(e);                 // SPEC-029: подсказки тренировки 2
  return e;
}
export let bonusStars = [], starCd = 10, starSeq = 0;   // бонусные звёздочки (отдельно от предметов)
export let kisses = [], kissSeq = 0;                      // летящие воздушные поцелуи
export let pushWaves = [];                                // SPEC-022: кольца широкого толчка { x, y, t, r } (растут WAVE_TIME сек)
export let kitHintT = 0, kitHintDone = false, kitHintPi = 0;   // подсказка «Нажми 🩹» (SPEC-007): раз за уровень
export let heardHintT = 0, heardHintDone = false, heardHintPi = 0;   // SPEC-019: «Папа услышал топот!» — раз за уровень
// уровень начат и ещё не оплачен (startGame → true; награда, сброс или замена прогресса → false)
export let rewardDue = false;
// маленький i: look — вид от клиента (игра его только носит), upgrades — уровни улучшений игроков (у ботов нет)
function makeLittle(i, kind, botIndex, controls, look, upgrades) {
  const sp = spawns.small[i];
  return {
    id: i, x: sp.x, y: sp.y, r: 11, kind, botIndex, look, controls,
    state: "ok", downTimer: 0, rescue: 0, botWait: 0, invuln: 0, kx: 0, ky: 0, dangerT: 0, dizzy: 0,
    path: [], repath: 0, dir: Math.PI / 2, moveDir: 0, walk: 0, moving: false, speedFrac: 0, hugCd: 0,
    task: "idle", fleeT: 0, fleeGoal: null, fleeRe: 0, lurkT: rand(0, 2), offset: rand(-0.5, 0.5), tokenT: 0,
    hugAnim: 0, kissCd: 0, fx: { boots: 0, cloak: 0, shield: 0 },
    upg: kind === "player" ? { ...upgrades } : null          // SPEC-009: уровни улучшений этого игрока (у ботов нет)
  };
}
// SPEC-011 AC 3c: новая игра из простых данных, без клиента: уровень n мира world, players (1–2) маленьких-игроков и боты,
// Большой. looks — виды от клиента: { players: [вид p1, вид p2], bots: [вид бота 0, 1, …], big: образ Большого } (игра их только
// носит); upgrades — уровни улучшений игроков. Не чистая: тянет игровой rng() (те же вызовы в том же порядке, что раньше).
// Тренировка (tutorialGame) строит свою карту и сценарий. В конце — hooks.rebuild (клиент строит 3D)
// маленьких в команде (игроки + боты): 5; SPEC-029: в тренировке — игрок и бот (сценарий и спасение нужны хоть одному)
export function teamSize() { return tutorialGame ? 1 + Math.max(1, CFG.TUTORIAL.bots) : 5; }
export function buildGame(world, n, players, { looks, upgrades = progress.upgrades }) {
  curWorld = world; level = n; numPlayers = players;
  if (tutorialGame) applyTutorialMap(); else loadLevel(world, n);   // SPEC-029: тренировка — своя карта
  littles = [];
  const p1 = players === 1
    ? { up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"] }
    : { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"] };
  littles.push(makeLittle(0, "player", -1, p1, looks.players[0], upgrades));
  if (players === 2) littles.push(makeLittle(1, "player", -1, { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] }, looks.players[1], upgrades));
  let bi = 0;
  const team = teamSize();
  while (littles.length < team) { littles.push(makeLittle(littles.length, "bot", bi, null, looks.bots[bi], upgrades)); bi++; }
  const maxHp = tutorialGame ? CFG.TUTORIAL["hearts" + tutorialGame] : difficulty(world, n).hearts;   // SPEC-029: тренировка — свои сердечки
  big = {
    isBig: true, x: spawns.big.x, y: spawns.big.y, r: 22, dir: -Math.PI / 2, hp: maxHp, maxHp,
    state: "look", timer: 4, lookSign: 1, lastSeen: null, goal: null, patrolT: 0,
    path: [], repath: 0, moveDir: 0, walk: 0, moving: false, stun: 0, stunFace: 0, stunTurn: 0, pushCd: 0, noPush: 0, hugCd: 0, flash: 0, slip: 0,
    blush: 0, blushBy: 0,   // покраснел после поцелуя: сколько ещё сек и кто бросил (индекс игрока)
    kind: false,            // SPEC-022: злость кончилась — подобрел и идёт домой (pendingWin — сколько ещё идёт)
    boss: tutorialGame ? null : bossFor(world, n),         // SPEC-022: босс уровня (мир из BOSSES) или null; в тренировке — нет
    // SPEC-019: шум топота, сек до того, как снова слышит; поворот на топот (куда, сколько ещё, скорость) и сколько ещё смотрит туда
    noise: 0, hearCd: 0, hearFace: 0, hearTurnT: 0, hearRate: 0, hearLook: 0,
    skin: looks.big
  };
  items = []; itemCd = rand(4, 7); pendingWin = 0; pushWaves = [];
  bonusStars = []; starCd = rand(CFG.STAR_EVERY[0], CFG.STAR_EVERY[1]);
  kisses = [];
  kitHintT = 0; kitHintDone = false;
  heardHintT = 0; heardHintDone = false;
  attackToken = null; prevToken = null; botAttackCd = rand(3, 5);
  stats = { hugs: 0, time: 0, playerHugs: 0, rests: 0, starCoins: 0 };
  setAutoNavs(new Map()); setAutoMove([]);
  lastReward = null;
  if (tutorialGame) tutorialSetup();                       // SPEC-029: тренировка — папа на поляне, сценарий, подсказки, свой запас
  hooks.rebuild();
}
// чем рулит игрок l: ввод с устройств (hooks.inputFor) плюс «джойстик» автопилота (SPEC-008); длина не больше 1
function inputFor(l) {
  let { x, y } = hooks.inputFor(l);
  const ap = autoMove[l.id];
  if (ap) { x += ap.x; y += ap.y; }
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  return { x, y };
}
function updatePlayers(dt) {
  for (const l of littles) {
    if (l.kind !== "player") continue;
    l.moving = false; l.speedFrac = 0;
    if (!canAct(l)) continue;
    const v = inputFor(l), m = Math.hypot(v.x, v.y);
    if (m > 0.05) {
      const sp = moveSpeed(l);
      moveEntity(l, v.x * sp, v.y * sp, dt);
      l.dir = Math.atan2(v.y, v.x);
      l.walk += dt * 12 * m;
      l.moving = true;
      l.speedFrac = m;                      // SPEC-019: доля своей скорости (≤ TIPTOE_MULT — на цыпочках, тихо)
    }
  }
}

// эффекты: кольца широкого толчка (игра); летящие надписи, частицы и тряска — у клиента (hooks.fx)
export function updateFx(dt) {
  for (const w of pushWaves) w.t += dt;
  pushWaves = pushWaves.filter(w => w.t < CFG.WAVE_TIME);
  hooks.fx(dt);
}
export function update(dt) {
  if (!big.kind) stats.time += dt;                         // SPEC-022: пока подобревший папа идёт домой, часы уровня стоят
  hooks.banner(dt);                                        // надпись уровня гаснет (клиент)
  for (const l of littles) {
    l.invuln = Math.max(0, l.invuln - dt);
    l.hugCd = Math.max(0, l.hugCd - dt);
    l.dizzy = Math.max(0, l.dizzy - dt);
    l.kissCd = Math.max(0, l.kissCd - dt);
    if (l.hugAnim <= 0 && Math.abs(l.kx) + Math.abs(l.ky) > 5) {
      moveEntity(l, l.kx, l.ky, dt);
      const f = Math.exp(-7 * dt); l.kx *= f; l.ky *= f;
    } else { l.kx = 0; l.ky = 0; }
  }
  kitHintT = Math.max(0, kitHintT - dt);
  heardHintT = Math.max(0, heardHintT - dt);
  if (big.kind) updateKindWalk(dt);                        // SPEC-022: идёт домой; маленькие стоят и радуются
  else { autoThink(dt); updatePlayers(dt); updateBots(dt); updateBig(dt); }
  updateHugAnim(dt);
  updateKisses(dt);
  separate();
  checkContacts();
  updateDowned(dt);
  if (tutorialGame) updateTutorial(dt);                    // SPEC-029: оба лежат — встают; подсказки по шагам
  updateDanger(dt);
  updateResting(dt);
  updateItems(dt);
  updateStars(dt);
  updateFx(dt);
  // победа в два шага (SPEC-022): последняя обнимашка доигрывает (HUG_ANIM) → папа добреет и идёт домой (KIND_WALK) → экран победы
  if (pendingWin > 0) { pendingWin -= dt; if (pendingWin <= 0 && mode === "play") { if (big.kind) winNow(); else startKindWalk(); } }
  // проигрыша больше нет: кого не спасли — отдыхает в домике и возвращается (за это меньше монеток)
}
// SPEC-008: шагает игру пачкой (dt — сек игры за шаг), пока уровень идёт и не вышло seconds; → простые данные
export function simRun(seconds, dt = CFG.BALANCE.SIM_DT) {
  const n = Math.round(seconds / dt);
  for (let i = 0; mode === "play" && (i < n || pendingWin > 0); i++) update(dt);   // SPEC-022: начатая победа (обнимашка, дорога домой) доигрывается
  return { ended: mode !== "play", win: mode === "win", time: stats.time };
}
// SPEC-011 AC 5: other modules change this module's state only through these setters (live bindings are read-only there)
export function setWorld(v) { return (curWorld = v); }
export function setLevel(v) { return (level = v); }
export function setRewardDue(v) { return (rewardDue = v); }
export function setPendingWin(v) { return (pendingWin = v); }
export function setEvents(v) { return (events = v); }
export function setMode(v) { return (mode = v); }
export function setLastReward(v) { return (lastReward = v); }
export function setKitHintDone(v) { return (kitHintDone = v); }
export function setHeardHintDone(v) { return (heardHintDone = v); }
export function setItemCd(v) { return (itemCd = v); }
export function setAttackToken(v) { return (attackToken = v); }
export function setKitHintT(v) { return (kitHintT = v); }
export function setKitHintPi(v) { return (kitHintPi = v); }
export function setKissSeq(v) { return (kissSeq = v); }
export function setKisses(v) { return (kisses = v); }
export function setItemSeq(v) { return (itemSeq = v); }
export function setStarSeq(v) { return (starSeq = v); }
export function setStarCd(v) { return (starCd = v); }
export function setBonusStars(v) { return (bonusStars = v); }
export function setItems(v) { return (items = v); }
export function setBotAttackCd(v) { return (botAttackCd = v); }
export function setPrevToken(v) { return (prevToken = v); }
export function setHeardHintT(v) { return (heardHintT = v); }
export function setHeardHintPi(v) { return (heardHintPi = v); }
