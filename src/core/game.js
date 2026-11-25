// SPEC-011 / SPEC-012: the running game — newGame / createGame and the active game (useGame, withGame, step), buildGame,
// update, simRun. Core module.
import { CFG, COLS, FH, FW, ROWS, WORLDS } from "./config.js";
import { hooks } from "./hooks.js";
import { newRng, rand } from "./util.js";
import { autoThink } from "./autopilot.js";
import { updateBig } from "./big.js";
import { updateBots } from "./bots.js";
import { difficulty } from "./difficulty.js";
import { progress } from "./economy.js";
import { loadLevel } from "./level/build.js";
import { bossFor, startKindWalk, updateKindWalk } from "./mood.js";
import { moveEntity } from "./path.js";
import { applyTutorialMap, tutorialNote, tutorialSetup, updateTutorial } from "./practice.js";
import { checkContacts, moveSpeed, separate, updateDanger, updateDowned, updateHugAnim, updateItems, updateKisses, updateResting, updateStars, winNow } from "./rules.js";
import { canAct } from "./world.js";
import { G, setActiveGame } from "./active.js";

// SPEC-012 AC 1: every piece of a game's state lives in its game object — newGame(opts) makes it, createGame(opts) builds it,
// useGame / withGame / step make it the active game G. The screen (mode) and the last reward are the client's (src/client/flow.js).
const N_CELLS = COLS * ROWS, N_FINE = FW * FH;
// SPEC-012 AC 1: the state of one game — plain data (the grids are typed arrays), nothing of the client. opts: world, n (level),
// players, rng (a stream { s, draws } to continue) or seed. Not built yet: createGame builds it.
export function newGame(opts = {}) {
  return {
    world: opts.world ?? WORLDS[0], level: opts.n ?? 1, players: opts.players ?? 1,
    // SPEC-012 AC 1c: the game's phase, set only by the core: "play" → (the last hug) "hugEnd" (CFG.HUG_ANIM) → "kindWalk" → "won"
    phase: "play",
    littles: [], big: null, botAttackCd: 0, prevToken: null, attackToken: null,
    stats: { hugs: 0, time: 0 }, items: [], itemCd: 5, itemSeq: 0, pendingWin: 0,
    // SPEC-008: журнал событий игры { t (сек игры), type, …данные } — для тестов, отчёта баланса и счёта монеток (SPEC-009).
    // Только простые данные; не длиннее CFG.EVENT_LOG_MAX (старые выпадают); очищается в начале уровня (startGame).
    events: [],
    bonusStars: [], starCd: 10, starSeq: 0,                  // бонусные звёздочки (отдельно от предметов)
    kisses: [], kissSeq: 0,                                  // летящие воздушные поцелуи
    pushWaves: [],                                           // SPEC-022: кольца широкого толчка { x, y, t, r } (растут WAVE_TIME сек)
    kitHintT: 0, kitHintDone: false, kitHintPi: 0,           // подсказка «Нажми 🩹» (SPEC-007): раз за уровень
    heardHintT: 0, heardHintDone: false, heardHintPi: 0,     // SPEC-019: «Папа услышал топот!» — раз за уровень
    rewardDue: false,                                        // уровень начат и ещё не оплачен (startGame → true; награда, сброс или замена прогресса → false)
    // карта уровня (world.js): препятствия, кусты, домики, сетки движения и взгляда; levelInfo — какой уровень построен (build.js)
    obstacles: [], bushes: [], floors: [], decor: [], trees: [], flowers: [],
    blocked: new Uint8Array(N_CELLS), blockedBig: new Uint8Array(N_CELLS), reachable: new Uint8Array(N_CELLS),
    moveGrid: new Uint8Array(N_FINE), seeGrid: new Uint8Array(N_FINE), moveGridBig: new Uint8Array(N_FINE),
    safeZone: null, dangerZone: null, spawns: { small: [], big: { x: 0, y: 0 } }, levelInfo: null,
    // SPEC-029: тренировка (practice.js): её номер (0 — обычный уровень), сценарий и подсказки, свой запас
    tutorialGame: 0, tut: { script: false, hint: 0, bothDown: 0 }, tutorialInv: { kisses: 0, rescues: 0, mittens: 0, mega: 0 },
    // SPEC-008: автопилот (autopilot.js): включён ли, стиль, память пути, «стик» этого шага
    autoOn: false, autoStyle: "careful", autoNavs: {}, autoMove: [],
    // SPEC-008 / SPEC-012: игровая случайность этой игры (mulberry32: состояние s, сколько раз тянули)
    rng: opts.rng ?? newRng(opts.seed)
  };
}
// SPEC-012 AC 1: the active game. useGame(g) — one assignment (the server calls it before stepping a room);
// withGame(g, fn) — fn on g, then the game that was active before (also when fn throws); step(g, dt) — g one step of dt s
export function useGame(g) { setActiveGame(g); return g; }
export function withGame(g, fn) { const prev = setActiveGame(g); try { return fn(); } finally { setActiveGame(prev); } }
export function step(g, dt) { useGame(g); update(dt); }
export function logEvent(type, data) {
  const e = { t: G.stats.time, type, ...data };
  G.events.push(e);
  if (G.events.length > CFG.EVENT_LOG_MAX) G.events.splice(0, G.events.length - CFG.EVENT_LOG_MAX);
  if (G.tutorialGame === 2) tutorialNote(e);                 // SPEC-029: подсказки тренировки 2
  return e;
}
// маленький i: look — вид от клиента (игра его только носит), upgrades — уровни улучшений игроков (у ботов нет)
function makeLittle(i, kind, botIndex, controls, look, upgrades) {
  const sp = G.spawns.small[i];
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
export function teamSize() { return G.tutorialGame ? 1 + Math.max(1, CFG.TUTORIAL.bots) : 5; }
export function buildGame(world, n, players, { looks, upgrades = progress.upgrades }) {
  G.world = world; G.level = n; G.players = players; G.phase = "play";
  if (G.tutorialGame) applyTutorialMap(); else loadLevel(world, n);   // SPEC-029: тренировка — своя карта
  G.littles = [];
  const p1 = players === 1
    ? { up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"] }
    : { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"] };
  G.littles.push(makeLittle(0, "player", -1, p1, looks.players[0], upgrades));
  if (players === 2) G.littles.push(makeLittle(1, "player", -1, { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] }, looks.players[1], upgrades));
  let bi = 0;
  const team = teamSize();
  while (G.littles.length < team) { G.littles.push(makeLittle(G.littles.length, "bot", bi, null, looks.bots[bi], upgrades)); bi++; }
  const maxHp = G.tutorialGame ? CFG.TUTORIAL["hearts" + G.tutorialGame] : difficulty(world, n).hearts;   // SPEC-029: тренировка — свои сердечки
  G.big = {
    isBig: true, x: G.spawns.big.x, y: G.spawns.big.y, r: 22, dir: -Math.PI / 2, hp: maxHp, maxHp,
    state: "look", timer: 4, lookSign: 1, lastSeen: null, goal: null, patrolT: 0,
    path: [], repath: 0, moveDir: 0, walk: 0, moving: false, stun: 0, stunFace: 0, stunTurn: 0, pushCd: 0, noPush: 0, hugCd: 0, flash: 0, slip: 0,
    blush: 0, blushBy: 0,   // покраснел после поцелуя: сколько ещё сек и кто бросил (индекс игрока)
    kind: false,            // SPEC-022: злость кончилась — подобрел и идёт домой (pendingWin — сколько ещё идёт)
    boss: G.tutorialGame ? null : bossFor(world, n),         // SPEC-022: босс уровня (мир из BOSSES) или null; в тренировке — нет
    // SPEC-019: шум топота, сек до того, как снова слышит; поворот на топот (куда, сколько ещё, скорость) и сколько ещё смотрит туда
    noise: 0, hearCd: 0, hearFace: 0, hearTurnT: 0, hearRate: 0, hearLook: 0,
    skin: looks.big
  };
  G.items = []; G.itemCd = rand(4, 7); G.pendingWin = 0; G.pushWaves = [];
  G.bonusStars = []; G.starCd = rand(CFG.STAR_EVERY[0], CFG.STAR_EVERY[1]);
  G.kisses = [];
  G.kitHintT = 0; G.kitHintDone = false;
  G.heardHintT = 0; G.heardHintDone = false;
  G.attackToken = null; G.prevToken = null; G.botAttackCd = rand(3, 5);
  G.stats = { hugs: 0, time: 0, playerHugs: 0, rests: 0, starCoins: 0 };
  G.autoNavs = {}; G.autoMove = [];
  if (G.tutorialGame) tutorialSetup();                       // SPEC-029: тренировка — папа на поляне, сценарий, подсказки, свой запас
  hooks.rebuild();
}
const NO_LOOKS = Object.freeze({ players: [], bots: [], big: null });
// SPEC-012 AC 1: a new game, built: newGame(opts) + buildGame on it (the active game is restored afterwards). opts: world, n,
// players, looks, upgrades, practice (the practice game's number, SPEC-029), rng / seed. → the game (not made active)
export function createGame(opts = {}) {
  const g = newGame(opts);
  g.tutorialGame = opts.practice || 0;
  withGame(g, () => buildGame(g.world, g.level, g.players, { looks: opts.looks || NO_LOOKS, upgrades: opts.upgrades }));
  return g;
}
// чем рулит игрок l: ввод с устройств (hooks.inputFor) плюс «джойстик» автопилота (SPEC-008); длина не больше 1
function inputFor(l) {
  let { x, y } = hooks.inputFor(l);
  const ap = G.autoMove[l.id];
  if (ap) { x += ap.x; y += ap.y; }
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  return { x, y };
}
function updatePlayers(dt) {
  for (const l of G.littles) {
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
  for (const w of G.pushWaves) w.t += dt;
  G.pushWaves = G.pushWaves.filter(w => w.t < CFG.WAVE_TIME);
  hooks.fx(dt);
}
export function update(dt) {
  if (!G.big.kind) G.stats.time += dt;                         // SPEC-022: пока подобревший папа идёт домой, часы уровня стоят
  hooks.banner(dt);                                        // надпись уровня гаснет (клиент)
  for (const l of G.littles) {
    l.invuln = Math.max(0, l.invuln - dt);
    l.hugCd = Math.max(0, l.hugCd - dt);
    l.dizzy = Math.max(0, l.dizzy - dt);
    l.kissCd = Math.max(0, l.kissCd - dt);
    if (l.hugAnim <= 0 && Math.abs(l.kx) + Math.abs(l.ky) > 5) {
      moveEntity(l, l.kx, l.ky, dt);
      const f = Math.exp(-7 * dt); l.kx *= f; l.ky *= f;
    } else { l.kx = 0; l.ky = 0; }
  }
  G.kitHintT = Math.max(0, G.kitHintT - dt);
  G.heardHintT = Math.max(0, G.heardHintT - dt);
  if (G.big.kind) updateKindWalk(dt);                        // SPEC-022: идёт домой; маленькие стоят и радуются
  else { autoThink(dt); updatePlayers(dt); updateBots(dt); updateBig(dt); }
  updateHugAnim(dt);
  updateKisses(dt);
  separate();
  checkContacts();
  updateDowned(dt);
  if (G.tutorialGame) updateTutorial(dt);                    // SPEC-029: оба лежат — встают; подсказки по шагам
  updateDanger(dt);
  updateResting(dt);
  updateItems(dt);
  updateStars(dt);
  updateFx(dt);
  // победа в два шага (SPEC-022): последняя обнимашка доигрывает (HUG_ANIM) → папа добреет и идёт домой (KIND_WALK) → экран победы
  if (G.pendingWin > 0) { G.pendingWin -= dt; if (G.pendingWin <= 0 && G.phase !== "won") { if (G.big.kind) winNow(); else startKindWalk(); } }
  // проигрыша больше нет: кого не спасли — отдыхает в домике и возвращается (за это меньше монеток)
}
// SPEC-008: шагает игру пачкой (dt — сек игры за шаг), пока уровень идёт и не вышло seconds; → простые данные
export function simRun(seconds, dt = CFG.BALANCE.SIM_DT) {
  const n = Math.round(seconds / dt);
  for (let i = 0; G.phase !== "won" && (i < n || G.pendingWin > 0); i++) update(dt);   // SPEC-022: начатая победа (обнимашка, дорога домой) доигрывается
  return { ended: G.phase === "won", win: G.phase === "won" && !G.tutorialGame, time: G.stats.time };   // SPEC-029: a practice game ends without a win screen
}
