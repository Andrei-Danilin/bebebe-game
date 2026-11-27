// SPEC-011 / SPEC-012: the running game — newGame / createGame and the active game (useGame, withGame, step), buildGame,
// update, simRun. Core module.
import { CFG, COLS, FH, FW, ROWS, WORLDS } from "./config.js";
import { emit } from "./events.js";
import { hooks } from "./hooks.js";
import { newRng, rand } from "./util.js";
import { autoDecide } from "./autopilot.js";
import { updateBig, updateBigPlayer } from "./big.js";
import { updateBots } from "./bots.js";
import { difficulty } from "./difficulty.js";
import { loadLevel } from "./level/load.js";
import { startKindWalk, updateKindWalk } from "./kindwalk.js";
import { bossFor } from "./mood.js";
import { moveEntity } from "./path.js";
import { applyTutorialMap, practiceOf, stockOf, tutorialSetup, updateTutorial } from "./practice.js";
import { checkContacts, moveSpeed, separate, throwKiss, updateDanger, updateDowned, updateHugAnim, updateItems, updateKisses, updateResting, updateStars, useRescueKit, winNow } from "./rules.js";
import { canAct } from "./world.js";
import { G, setActiveGame } from "./active.js";

// SPEC-012 AC 1: every piece of a game's state lives in its game object — newGame(opts) makes it, createGame(opts) builds it,
// useGame / withGame / step make it the active game G. The screen (mode) and the last reward are the client's (src/client/flow.js).
const N_CELLS = COLS * ROWS, N_FINE = FW * FH;
// SPEC-025 AC 9: the types of the core's public API (JSDoc for `npm run typecheck`; nothing here runs)
/**
 * @typedef {{ mx: number, my: number, kiss: boolean, kit: boolean, act: boolean, tiptoe: boolean }} Input   a slot's controls (SPEC-012 AC 3)
 * @typedef {{ shared: boolean, kisses: number, kits: number, gloves: { mittens: number, mega: number } }} Stock   a game's stock (AC 2)
 * @typedef {{ slot: string, kind?: string, look?: any, name?: string | null, glove?: string | null, gloveCharges?: number,
 *   kisses?: number, kits?: number, upgrades?: Record<string, number>, skin?: any, boss?: string }} Slot   a player or bot slot (AC 2)
 * @typedef {{ t: number, type: string, [field: string]: any }} GameEvent   an entry of the gameplay log g.events (SPEC-008)
 * @typedef {{ type: string, [field: string]: any }} Effect   an effect for the client in g.fx (AC 5; { type: "game", e } carries a GameEvent)
 * @typedef {{ s: number, draws: number }} RngStream   the game's rng state (mulberry32)
 * @typedef {{ world?: string, n?: number, players?: number, slots?: Slot[], mode?: string, stock?: any, practice?: any,
 *   rng?: RngStream, seed?: number, fx?: boolean, keep?: object }} GameOptions   newGame / createGame options (AC 1, 2, 10)
 * @typedef {ReturnType<typeof newGame>} Game   one game's whole state (AC 1)
 */
// SPEC-012 AC 1: the state of one game — plain data (the grids are typed arrays), nothing of the client. opts: world, n (level),
// players, rng (a stream { s, draws } to continue) or seed. Not built yet: createGame builds it.
/** @param {GameOptions} [opts] */
export function newGame(opts = {}) {
  return {
    world: opts.world ?? WORLDS[0], level: opts.n ?? 1, players: opts.players ?? 1,
    // SPEC-012 AC 2: how the game is played ("local" | "online-a" | "online-b"; the core does not use it yet) and the shared
    // stock of a local game { shared, kisses, kits, gloves: { mittens, mega } } (spent through progress until AC 6b)
    net: opts.mode ?? "local", stock: stockOf(opts.stock),
    // SPEC-012 AC 3: the controls of each player slot (p1…p5, big): { mx, my, kiss, kit, act, tiptoe } — the core reads nothing else
    inputs: {},
    // SPEC-012 AC 1c: the game's phase, set only by the core: "play" → (the last hug) "hugEnd" (CFG.HUG_ANIM) → "kindWalk" → "won"
    phase: "play",
    littles: [], big: null, botAttackCd: 0, prevToken: null, attackToken: null,
    stats: { hugs: 0, time: 0 }, items: [], itemCd: 5, itemSeq: 0, pendingWin: 0,
    // SPEC-008: журнал событий игры { t (сек игры), type, …данные } — для тестов, отчёта баланса и счёта монеток (SPEC-009).
    // Только простые данные; не длиннее CFG.EVENT_LOG_MAX (старые выпадают); очищается в начале уровня (startGame).
    events: [],
    bonusStars: [], starCd: 10, starSeq: 0,                  // бонусные звёздочки (отдельно от предметов)
    kisses: [], kissSeq: 0,                                  // летящие воздушные поцелуи
    kitHintDone: false,                                      // подсказка «Нажми 🩹» (SPEC-007): раз за уровень (её время — у клиента)
    heardHintDone: false,                                    // SPEC-019: «Папа услышал топот!» — раз за уровень (её время — у клиента)
    // SPEC-012 AC 5: the effect events of the steps not yet drained by the client — { type: "sfx" | "burst" | "pop" | "shake" |
    // "wave" | "hint" | "mood", … } (see emit); not capped, never mixed with the gameplay log events; null (opts.fx false): none kept
    fx: opts.fx === false ? null : [],
    rewardDue: false,                                        // уровень начат и ещё не оплачен (startGame → true; награда, сброс или замена прогресса → false)
    // карта уровня (world.js): препятствия, кусты, домики, сетки движения и взгляда; levelInfo — какой уровень построен (build.js)
    obstacles: [], bushes: [], floors: [], decor: [], trees: [], flowers: [],
    blocked: new Uint8Array(N_CELLS), blockedBig: new Uint8Array(N_CELLS), bigLearned: new Uint8Array(N_CELLS), reachable: new Uint8Array(N_CELLS),
    moveGrid: new Uint8Array(N_FINE), seeGrid: new Uint8Array(N_FINE), moveGridBig: new Uint8Array(N_FINE),
    safeZone: null, dangerZone: null, spawns: { small: [], big: { x: 0, y: 0 } }, levelInfo: null,
    // SPEC-029: тренировка (practice.js): её номер (0 — обычный уровень), сценарий и подсказки, свой запас
    // SPEC-012 AC 10: practice — the practice game's option (practiceOf) or null; tutorialGame — its step (0 — a normal level)
    practice: null, tutorialGame: 0, tut: { script: false, hint: 0, bothDown: 0 }, tutorialInv: stockOf(null),
    // SPEC-008: автопилот (autopilot.js): включён ли, стиль, память пути, «стик» этого шага
    autoOn: false, autoStyle: "careful", autoNavs: {}, autoMove: [],
    // SPEC-008 / SPEC-012: игровая случайность этой игры (mulberry32: состояние s, сколько раз тянули)
    rng: opts.rng ?? newRng(opts.seed)
  };
}
// SPEC-012 AC 1: the active game. useGame(g) — one assignment (the server calls it before stepping a room);
// withGame(g, fn) — fn on g, then the game that was active before (also when fn throws); step(g, dt) — g one step of dt s
/** @param {Game} g @returns {Game} */
export function useGame(g) { setActiveGame(g); return g; }
/** @template T @param {Game} g @param {() => T} fn @returns {T} */
export function withGame(g, fn) { const prev = setActiveGame(g); try { return fn(); } finally { setActiveGame(prev); } }
/** @param {Game} g @param {number} dt */
export function step(g, dt) { useGame(g); update(dt); }
// маленький i из слота s: look — вид от клиента (игра его только носит), upgrades — уровни улучшений игрока (у ботов нет);
// name, glove, gloveCharges, kisses, kits — данные слота (игра их носит; тратится пока progress, SPEC-012 AC 6b)
function makeLittle(i, s, botIndex) {
  const sp = G.spawns.small[i], kind = s.kind, upgrades = s.upgrades || {};
  return {
    id: i, slot: s.slot, x: sp.x, y: sp.y, r: 11, kind, botIndex, look: s.look,
    name: s.name ?? null, glove: s.glove ?? null, gloveCharges: s.gloveCharges ?? 0, kisses: s.kisses ?? 0, kits: s.kits ?? 0,
    state: "ok", downTimer: 0, rescue: 0, helped: false, botWait: 0, invuln: 0, kx: 0, ky: 0, dangerT: 0, dizzy: 0,
    path: [], repath: 0, dir: Math.PI / 2, moveDir: 0, walk: 0, moving: false, speedFrac: 0, hugCd: 0,
    task: "idle", fleeT: 0, fleeGoal: null, fleeRe: 0, lurkT: rand(0, 2), offset: rand(-0.5, 0.5), tokenT: 0,
    hugAnim: 0, kissCd: 0, fx: { boots: 0, cloak: 0, shield: 0 },
    upg: kind === "player" ? { ...upgrades } : null          // SPEC-009: уровни улучшений этого игрока (у ботов нет)
  };
}
// маленьких в команде (игроки + боты): 5; SPEC-029: в тренировке — игрок и бот (сценарий и спасение нужны хоть одному)
// p — the practice option (practiceOf) or a step; by default the active game's
export function teamSize(p = G.practice) { return p ? 1 + Math.max(1, typeof p === "object" ? p.bots : CFG.TUTORIAL.bots) : 5; }
/** @type {() => Input} */
export const newInput = () => ({ mx: 0, my: 0, kiss: false, kit: false, act: false, tiptoe: false });
// SPEC-012 AC 2: the Little One slots of a game — the given ones (players and bots, in their order; at most teamSize()), then
// bots up to teamSize(): { slot: "bot<k>", kind: "bot" }. A slot without kind is a player.
/** @param {Slot[]} slots @returns {Slot[]} */
export function fillSlots(slots) {
  const team = teamSize(), out = slots.filter(s => s.slot !== "big").slice(0, team).map(s => ({ kind: "player", ...s }));
  let k = out.filter(s => s.kind === "bot").length;
  while (out.length < team) out.push({ slot: "bot" + ++k, kind: "bot" });
  return out;
}
// SPEC-011 AC 3c / SPEC-012 AC 2: новая игра из простых данных, без клиента: уровень n мира world, слоты slots — маленькие
// { slot: "p1".."p5" | "bot1".."bot4", kind: "player" | "bot", look, name, glove, gloveCharges, kisses, kits, upgrades } (недостающие —
// боты до teamSize()) и Большой { slot: "big", kind: "bot" | "player", skin, name, boss } (boss — по умолчанию bossFor). Виды игра
// только носит. Не чистая: тянет игровой rng() (те же вызовы в том же порядке, что раньше). Тренировка (tutorialGame) строит свою
// карту и сценарий. В конце — hooks.rebuild (клиент строит 3D)
/** @param {string} world @param {number} n @param {Slot[]} slots */
export function buildGame(world, n, slots) {
  G.world = world; G.level = n; G.phase = "play";
  if (G.tutorialGame) applyTutorialMap(); else loadLevel(world, n);   // SPEC-029: тренировка — своя карта
  G.littles = [];
  let bi = 0;
  for (const s of fillSlots(slots)) G.littles.push(makeLittle(G.littles.length, s, s.kind === "bot" ? bi++ : -1));
  G.players = G.littles.filter(l => l.kind === "player").length;
  const bs = slots.find(s => s.slot === "big") || { slot: "big", kind: "bot" };
  G.inputs = {};
  for (const l of G.littles) if (l.kind === "player") G.inputs[l.slot] = newInput();
  if (bs.kind === "player") G.inputs.big = newInput();
  const maxHp = G.tutorialGame ? G.practice.hearts : difficulty(world, n).hearts;   // SPEC-029: тренировка — свои сердечки
  G.big = {
    isBig: true, x: G.spawns.big.x, y: G.spawns.big.y, r: 22, dir: -Math.PI / 2, hp: maxHp, maxHp,
    state: "look", timer: 4, lookSign: 1, lastSeen: null, goal: null, patrolT: 0, prog: { x: 0, y: 0, t: 0, last: -1 },
    path: [], repath: 0, moveDir: 0, walk: 0, moving: false, stun: 0, stunFace: 0, stunTurn: 0, pushCd: 0, noPush: 0, hugCd: 0, flash: 0, slip: 0,
    blush: 0, blushBy: 0,   // покраснел после поцелуя: сколько ещё сек и кто бросил (индекс игрока)
    kind: false,            // SPEC-022: злость кончилась — подобрел и идёт домой (pendingWin — сколько ещё идёт)
    boss: G.tutorialGame ? null : bs.boss !== undefined ? bs.boss : bossFor(world, n),   // SPEC-022: босс уровня (мир из BOSSES) или null; в тренировке — нет
    // SPEC-019: шум топота, сек до того, как снова слышит; поворот на топот (куда, сколько ещё, скорость) и сколько ещё смотрит туда
    noise: 0, hearCd: 0, hearFace: 0, hearTurnT: 0, hearRate: 0, hearLook: 0,
    skin: bs.skin ?? null, name: bs.name ?? null,
    player: bs.kind === "player"   // SPEC-012 AC 4: a player moves him (G.inputs.big), his AI does not run
  };
  G.items = []; G.itemCd = rand(4, 7); G.pendingWin = 0;
  G.bonusStars = []; G.starCd = rand(CFG.STAR_EVERY[0], CFG.STAR_EVERY[1]);
  G.kisses = [];
  G.kitHintDone = false; G.heardHintDone = false;
  G.attackToken = null; G.prevToken = null; G.botAttackCd = rand(3, 5);
  G.stats = { hugs: 0, time: 0, playerHugs: 0, rests: 0, starCoins: 0 };
  G.autoNavs = {}; G.autoMove = [];
  if (G.tutorialGame) tutorialSetup();                       // SPEC-029: тренировка — папа на поляне, сценарий, подсказки, свой запас
  hooks.rebuild();
}
// SPEC-012 AC 1 / 2: a new game, built: newGame(opts) + buildGame on it (the active game is restored afterwards). opts: world,
// n, slots (or players — that many player slots p1…), mode, stock, practice (the practice game's number, SPEC-029), rng (a stream
// to continue) / seed, keep (fields carried over from the client's previous game before the build: its event log, ids,
// autopilot…). → the game (not made active)
/** @param {GameOptions} [opts] @returns {Game} */
export function createGame(opts = {}) {
  const g = newGame(opts);
  if (opts.keep) Object.assign(g, opts.keep);
  if (opts.practice !== undefined) { g.practice = practiceOf(opts.practice); g.tutorialGame = g.practice ? g.practice.step : 0; }
  const slots = opts.slots || Array.from({ length: opts.players ?? 1 }, (_, i) => ({ slot: "p" + (i + 1), kind: "player" }));
  withGame(g, () => buildGame(g.world, g.level, slots));
  return g;
}
// SPEC-012 AC 3: the stick of input inp: tiptoe → no longer than TIPTOE_MULT; plus the autopilot's stick ap; length ≤ 1
function stickOf(inp, ap) {
  let x = inp ? inp.mx : 0, y = inp ? inp.my : 0;
  if (inp && inp.tiptoe) { const t = Math.hypot(x, y); if (t > CFG.TIPTOE_MULT) { x *= CFG.TIPTOE_MULT / t; y *= CFG.TIPTOE_MULT / t; } }
  if (ap) { x += ap.x; y += ap.y; }
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  return { x, y };
}
// SPEC-012 AC 3: the buttons of the step, at its start, in slot order: for each player the autopilot decides (SPEC-008; it presses
// through the same slot), then the slot's 🩹 and 💋 edge flags fire and are consumed. __bb.autoThink runs this too.
export function readInputs(dt) {
  G.autoMove = [];
  const auto = G.autoOn && G.phase !== "won";
  for (const l of G.littles) {
    if (l.kind !== "player") continue;
    const inp = G.inputs[l.slot] || (G.inputs[l.slot] = newInput());
    if (auto) autoDecide(l, inp, dt);
    if (inp.kit) { inp.kit = false; useRescueKit(l.id); }
    if (inp.kiss) { inp.kiss = false; throwKiss(l.id); }
    inp.act = false;                                      // SPEC-015 gives it a meaning
  }
}
function updatePlayers(dt) {
  for (const l of G.littles) {
    if (l.kind !== "player") continue;
    l.moving = false; l.speedFrac = 0;
    if (!canAct(l)) continue;
    const v = stickOf(G.inputs[l.slot], G.autoMove[l.id]), m = Math.hypot(v.x, v.y);
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

/** @param {number} dt */
export function update(dt) {
  if (!G.big.kind) G.stats.time += dt;                         // SPEC-022: пока подобревший папа идёт домой, часы уровня стоят
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
  if (G.big.kind) updateKindWalk(dt);                        // SPEC-022: идёт домой; маленькие стоят и радуются
  else { readInputs(dt); updatePlayers(dt); updateBots(dt); if (G.big.player) updateBigPlayer(dt); else updateBig(dt); }
  updateHugAnim(dt);
  updateKisses(dt);
  separate();
  checkContacts();
  updateDowned(dt);
  if (G.tutorialGame) {                                     // SPEC-029: оба лежат — встают; подсказки по шагам
    const h0 = G.tut.hint;
    updateTutorial(dt);
    if (G.tut.hint !== h0) emit("hint", { kind: "practice", slot: G.littles[0].slot, step: G.tut.hint });
  }
  updateDanger(dt);
  updateResting(dt);
  updateItems(dt);
  updateStars(dt);
  // победа в два шага (SPEC-022): последняя обнимашка доигрывает (HUG_ANIM) → папа добреет и идёт домой (KIND_WALK) → экран победы
  if (G.pendingWin > 0) { G.pendingWin -= dt; if (G.pendingWin <= 0 && G.phase !== "won") { if (G.big.kind) winNow(); else startKindWalk(); } }
  // проигрыша больше нет: кого не спасли — отдыхает в домике и возвращается (за это меньше монеток)
}
// SPEC-008: шагает игру пачкой (dt — сек игры за шаг), пока уровень идёт и не вышло seconds; → простые данные.
// stepFn — один шаг (по умолчанию update; клиент даёт свой stepGame: ввод, эффекты и их таймеры — как в игре)
export function simRun(seconds, dt = CFG.STEP, stepFn = update) {
  const n = Math.round(seconds / dt);
  for (let i = 0; G.phase !== "won" && (i < n || G.pendingWin > 0); i++) stepFn(dt);   // SPEC-022: начатая победа (обнимашка, дорога домой) доигрывается
  return { ended: G.phase === "won", win: G.phase === "won" && !G.tutorialGame, time: G.stats.time };   // SPEC-029: a practice game ends without a win screen
}
