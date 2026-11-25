// SPEC-011: screens and transitions: world choice, leaveLevel, giveReward, resetWorld (the client wrapper of buildGame), the
// level banner, startGame, nextLevel, the modes, the shop tabs, the map and level card, the story and its scenes,
// resetMenus, toMap, toHome. Client module (moved out of index.html in Phase C).

import { G } from "../core/active.js";
import { BONUS_WORLDS, BOSSES, levelsPerWorld, MAIN_WORLDS, worldIndex, WORLDS } from "../core/config.js";
import { addCoins, progress } from "../core/economy.js";
import { createGame, logEvent, newInput, teamSize, useGame } from "../core/game.js";
import { levelType } from "../core/level/generate.js";
import { bossFor } from "../core/mood.js";
import { computeReward, isOpen, worldComplete, worldProgress } from "../core/progress-rules.js";
import { canUseKit, levelResult, throwKiss, useRescueKit } from "../core/rules.js";
import { clamp, newRng, seedRandom as seedStream } from "../core/util.js";
import { BIG_SKINS } from "../core/wardrobe.js";
import { L, lang, LANGS } from "../i18n.js";
import { SCENE_IDS, STORY, TUTORIAL_SCENES } from "../story.js";
import { STORY_ART } from "./art.js";
import { closeNameInput, nameInput, sticks } from "./input.js";
import { LOOK } from "./look.js";
import { botOutfit, endTryOn, makeLook, skinSel } from "./outfits.js";
import { saveProgress, setLang } from "./progress.js";
import { PHONE } from "./screen.js";
import { ui } from "./state.js";
import { camSnap } from "./three/camera.js";
import { practiceStep, setPracticeStep, setTutorial, tutorialNext, tutorialPages } from "./tutorial.js";
import { lockedText } from "./ui/map.js";
import { rebuild3D } from "./three/characters.js";
import { runCore } from "./fx.js";

// SPEC-012 AC 1c: the screen is the client's (the core has only the game's phase, G.phase). mode — one of MODES; lastReward — the
// reward of the last level paid (payLevel's result: the win screen shows it), null after a new game is built
export let mode = "home", lastReward = null;
// SPEC-012 AC 1f: a screen change resets the menus' state that belongs to the screen left (drawing changes no state): the shop
// tab and wardrobe page outside the shop, the map's hint outside the map, the world page's background outside the map and its
// card, the name input outside the wardrobe
export function setMode(v) {
  if (v !== "play") for (const inp of Object.values(G.inputs || {})) { inp.kiss = false; inp.kit = false; inp.act = false; }   // a press never fires after the game left play
  mode = v;
  if (mode !== "shop") { ui.shopTab = "items"; ui.wardrobePage = "looks"; }
  if (mode !== "map") ui.toast = null;   // SPEC-017: подсказка карты — только пока карта на экране
  if (mode !== "map" && mode !== "levelCard") ui.mapBgCache = null;   // фон страницы мира не держим в памяти вне карты
  if (nameInput && !inWardrobe()) closeNameInput(false);
  return mode;
}
export function setLastReward(v) { return (lastReward = v); }
// a kiss or a kit needs the play screen too (pause: the client does not step the game, and the buttons do nothing)
export const canKitNow = l => mode === "play" && canUseKit(l);
// SPEC-012 AC 3: the 💋 / 🩹 keys and buttons press the player's input slot; the next step fires them (at its start)
const press = (pi, k) => { const l = G.littles[pi]; if (mode !== "play" || !l || l.kind !== "player") return; (G.inputs[l.slot] || (G.inputs[l.slot] = newInput()))[k] = true; };
export const pressKiss = pi => press(pi, "kiss");
export const pressKit = pi => press(pi, "kit");
// shims for the tests (__bb.throwKiss / useRescueKit): the rule at once, past the input slot
export const kissNow = pi => runCore(() => mode === "play" && throwKiss(pi));
export const kitNow = pi => runCore(() => mode === "play" && useRescueKit(pi));
// ---------- SPEC-012 AC 6 / 6b / 10: the client applies the game's events ----------
// the local stock follows the saves (one pool for p1/p2; the shop and the tests change progress between steps), and each player
// wears his saved glove — before every core call (runCore: a step, the shims), every frame and a re-dress; a practice game keeps
// its own stock. Coupling: progress.inv / progress.equip are the truth between steps, G.stock / l.glove inside a step; the spent
// events the client applies after the step bring progress down by what the step spent, so the two stay equal
export function syncStock() {
  if (!G || !G.stock || G.tutorialGame) return;
  const s = G.stock, inv = progress.inv;
  s.kisses = inv.kisses; s.kits = inv.rescues; s.gloves.mittens = inv.mittens; s.gloves.mega = inv.mega;
  for (const l of G.littles) if (l.kind === "player") l.glove = progress.equip[l.id] ?? "none";
}
const INV_KEY = Object.freeze({ kiss: "kisses", kit: "rescues" });
// the level ended (the result event, or leaving early): the reward — computeReward, applied to progress and the coin book line by
// line (each saved, as before); → the reward the win screen shows, or null (a practice game pays nothing)
function payLevel(result) {
  G.rewardDue = false;
  if (G.tutorialGame) return null;                          // SPEC-029: тренировка не платит и ничего не открывает
  const c = computeReward(progress, result);
  if (c.world) {
    const wp = progress.worlds[c.world.name];
    wp.stars[c.world.n] = c.world.stars; wp.won[c.world.n] = true; wp.unlocked = c.world.unlocked;
    progress.lastWorld = c.world.name;
  }
  for (const ln of c.lines) { addCoins(ln.reason, ln.amount); saveProgress(); }
  return c.reward;
}
// one event of the game (drainEvents hands them over after the step, in order): star coins and spent charges go into the saves at
// once (quitting mid-level keeps them), the result pays the level and opens the win screen, a practice win goes on with the tutorial
export function applyGameEvent(e) {
  if (e.type === "coins") { addCoins(e.reason, e.amount, e); saveProgress(); }
  else if (e.type === "spent") { const k = e.kind === "glove" ? e.glove : INV_KEY[e.kind]; progress.inv[k]--; saveProgress(); }
  else if (e.type === "result") { lastReward = payLevel(e); setMode("win"); noteOpenedWorld(lastReward); }
  else if (e.type === "practiceWin") tutorialNext();
}

// выбор мира в меню (карточка, ↑/↓, крестовина геймпада): запоминается, показывается новый открытый уровень мира.
// SPEC-016/030: закрытый мир выбрать нельзя (__bb.world — без проверки, для тестов и отчёта баланса)
export function selectWorld(w) {
  if (!WORLDS.includes(w) || w === G.world || !isOpen(w)) return;
  G.world = w; ui.toast = null; ui.worldBanner = null;   // SPEC-017: подсказка карты была про прошлый мир (SPEC-030: и плашка «открыт»)
  progress.lastWorld = G.world; saveProgress();
  G.level = worldProgress().unlocked;
  playWorld(G.players);
}
// ↑/↓: следующий открытый мир по сюжету (по кругу), закрытые пропускаются
export function cycleWorld(d) {
  const n = WORLDS.length;
  for (let k = 1; k < n; k++) { const w = WORLDS[(worldIndex(G.world) + d * k + n * n) % n]; if (isOpen(w)) { selectWorld(w); return; } }
}
// выход из идущего уровня до победы (пауза → Меню, перезапуск или другой уровень): платим только обнимашки.
// Последнее сердечко уже снято (pendingWin идёт) — это победа: засчитываем её, как если бы досмотрели (правило детей: обнял — победил)
function leaveLevel() {
  if (G.tutorialGame || !G.rewardDue || (mode !== "play" && mode !== "pause")) return;   // SPEC-029: тренировка не платит
  if (G.pendingWin > 0) { G.pendingWin = 0; logEvent("win", {}); giveReward(true); } else giveReward(false);
}
// клиент: награда уровня (payLevel по levelResult) и мир, который она открыла
export function giveReward(win) { lastReward = payLevel(levelResult(win)); noteOpenedWorld(lastReward); }
// SPEC-030: победа открыла главный мир — карта переключится на него, когда откроется
export function noteOpenedWorld(r) { if (r && r.worldOpened) ui.openedWorld = r.worldOpened; }

// ---------- SPEC-012 AC 1d: the client's games ----------
// Every build makes a new game object (createGame) and makes it the active game G (what the scene shows and __bb reads). A
// playable game (startGame, selectWorld, the end of a practice game) draws the local rng stream localRng — one stream for
// all local games, seeded by seedRandom (window.__bbSeed, __bb.seedRandom); any other build (the menus' backdrop: the
// showcase, made by resetWorld) takes a copy of that stream's state, so it never draws it. The new game carries over what
// the session keeps from game to game (KEEP: the event log until the next level starts, the ids, the practice game and
// the autopilot switches). Wardrobe, glove and try-on changes re-dress the shown game (redress) instead of a build.
const localRng = newRng();
export function seedRandom(n) { seedStream(n, localRng); }
export const rngDraws = () => localRng.draws;
const KEEP = Object.freeze(["events", "rewardDue", "itemSeq", "starSeq", "kissSeq", "autoOn", "autoStyle"]);
// the looks of n players, the bots and the Big One from the wardrobe (the game only carries them)
const looksFor = (n, practice = G.practice) => ({ players: [makeLook(skinSel.p1), makeLook(skinSel.p2)], bots: Array.from({ length: teamSize(practice) - n }, (_, bi) => makeLook(botOutfit(bi))), big: BIG_SKINS[skinSel.big] });
// SPEC-012 AC 2: the slots of a local game — n players p1…pn (look, glove, upgrades from the saves), the bots with their looks,
// the Big One (a bot) in the wardrobe's look; the shared stock of local play (one pool for p1/p2)
function localSlots(n) {
  const looks = looksFor(n, practiceStep);
  return [...Array.from({ length: n }, (_, i) => ({ slot: "p" + (i + 1), kind: "player", look: looks.players[i], glove: progress.equip[i] ?? "none", upgrades: progress.upgrades })),
    ...looks.bots.map((look, bi) => ({ slot: "bot" + (bi + 1), kind: "bot", look })), { slot: "big", kind: "bot", skin: looks.big }];
}
const localStock = () => ({ shared: true, kisses: progress.inv.kisses, kits: progress.inv.rescues, gloves: { mittens: progress.inv.mittens, mega: progress.inv.mega } });
// the client's per-game view state from scratch: texts, particles, shake, sticks, the reset button, the menu spin of the Big One
function clearView() { ui.texts = []; ui.particles = []; ui.shake = 0; sticks.clear(); ui.resetArmed = false; ui.menuSpin = 0; ui.waves = []; ui.kitHintT = 0; ui.heardHintT = 0; }
function buildLocal(n, playable) {
  if (PHONE) n = 1;                  // на телефоне играет один (SPEC-005)
  clearView();
  const keep = Object.fromEntries(KEEP.map(k => [k, G[k]]));
  lastReward = null;
  useGame(createGame({ world: G.world, n: G.level, mode: "local", slots: localSlots(n), stock: localStock(), practice: practiceStep, rng: playable ? localRng : { s: localRng.s, draws: 0 }, keep }));
}
// новая игра мира и уровня меню (G.world, G.level): правило телефона (играет один), виды из гардероба; надписи, частицы, тряска и
// джойстики — с нуля. resetWorld — витрина меню (showcase), playWorld — игра, в которую играют
export function resetWorld(n) { buildLocal(n, false); }
export function playWorld(n) { buildLocal(n, true); }
// SPEC-012 AC 1d: the wardrobe, a glove or a try-on changed — the shown game wears the new looks (models rebuilt), nothing else changes
export function redress() {
  clearView();
  const looks = looksFor(G.players);
  for (const l of G.littles) l.look = l.kind === "player" ? looks.players[l.id] : looks.bots[l.botIndex];
  G.big.skin = looks.big;
  syncStock();                                              // the saved glove of each player (and the stock's charges) before the models
  rebuild3D();
}
export function showBanner() {
  const now = performance.now() / 1000;
  if (now - ui.bannerShownAt < LOOK.BANNER_REPEAT) { ui.banner = null; return; }
  ui.bannerShownAt = now;
  const wn = L().worlds[G.world], tn = L().types[levelType(G.world, G.level)];
  // short — короткий вариант для телефона, если полный не влез (SPEC-006 AC 13); tiny — самый короткий, без мира (SPEC-016: с длинным
  // именем мира — «Футбольное поле» — и широким шрифтом не влезал и короткий); place — место на телефоне, выбирается при первом показе
  ui.banner = { text: L().levelIntro(wn, G.level, tn), short: L().levelIntroShort(wn, G.level, tn), tiny: L().levelIntroTiny(wn, G.level, tn), t: 0, place: null };
}
export const bannerAlpha = () => !ui.banner ? 0 : clamp(Math.min(ui.banner.t, LOOK.BANNER_TIME - ui.banner.t) / LOOK.BANNER_FADE, 0, 1);
// camSnap: начало уровня — камера телефона сразу у героя (в resetWorld нельзя: он же открывает меню, где камера показывает всю карту)
// SPEC-030: начатый уровень снимает плашку и несостоявшийся переход карты в открытый мир (не показывать их игрой позже)
export function startGame(n) { leaveLevel(); ui.openedWorld = null; ui.worldBanner = null; endTryOn(); G.events = []; playWorld(n); setMode("play"); G.rewardDue = true; mapSel = null; showBanner(); camSnap(); }
// следующий уровень того же мира; после последнего мир пройден — на карту уровней
export function nextLevel() { if (G.level >= levelsPerWorld()) { toMap(); return; } G.level = G.level + 1; withScene(sceneBefore(G.world, G.level), () => startGame(G.players)); }
// ---------- SPEC-017: экраны и переходы между ними ----------
// home — главный экран; map — карта уровней (levelCard — карточка уровня поверх неё); story — история; shop — магазин с вкладками
// SPEC-022: scene — заставка истории (комикс в начале, босс, бонусный мир, конец) поверх меню
export const MODES = Object.freeze(["home", "map", "levelCard", "story", "shop", "play", "pause", "win", "lose", "scene"]);
const MENU_MODES = Object.freeze(["home", "map", "levelCard", "story", "shop", "scene"]);
export const inMenus = () => MENU_MODES.includes(mode);
// магазин: вкладка (вне магазина снова «items»), страница гардероба (наряды или имена друзей), куда ведёт «Готово»
export const SHOP_TABS = Object.freeze(["progress", "items", "wardrobe", "upgrades"]);   // SPEC-026: «Прогресс» персонажа — первая
let shopBack = "home";
export const inWardrobe = () => mode === "shop" && ui.shopTab === "wardrobe";
export function setShopTab(k) { if (!SHOP_TABS.includes(k)) return; closeNameInput(true); ui.shopTab = k; ui.wardrobePage = "looks"; ui.resetArmed = false; }
// ←/→ и крестовина: вкладки по кругу
export const switchShopTab = (d = 1) => setShopTab(SHOP_TABS[(SHOP_TABS.indexOf(ui.shopTab) + d + SHOP_TABS.length) % SHOP_TABS.length]);
// SPEC-026: tab — с какой вкладки: с главного (кнопка «Персонаж») — «Прогресс»; отовсюду ещё (победа, проигрыш) — «Вещи», как раньше
export function openShop(back = "home", tab = "items") { setMode("shop"); ui.shopTab = SHOP_TABS.includes(tab) ? tab : "items"; ui.wardrobePage = "looks"; shopBack = back; ui.resetArmed = false; }
export function closeShop() { closeNameInput(true); if (shopBack === "map") { mapSel = null; setMode("map"); showOpenedWorld(); } else setMode("home"); }
export function openFriends() { closeNameInput(true); ui.wardrobePage = "friends"; }
export function backToWardrobe() { closeNameInput(true); ui.wardrobePage = "looks"; }
// ---------- SPEC-017: карта уровней ----------
// мир карты — G.world (выбор мира — selectWorld, он же запоминает progress.lastWorld); mapSel — остановка с кольцом выбора
// (клавиатура, геймпад) в этом мире, null — следующий уровень; toast — короткая подсказка внизу карты { text, t };
// cardLevel — уровень открытой карточки; mapSwipe — палец/мышь, нажатые на карте (смена мира — на отпускании)
export let mapSel = null, cardLevel = 1;
function showOpenedWorld() {
  const w = ui.openedWorld;
  ui.openedWorld = null;
  if (!w || !isOpen(w)) return;
  selectWorld(w); mapSel = null;
  ui.worldBanner = { world: w, t: LOOK.MENU_LOOK.map.openedTime };
}
// следующий уровень мира: первый открытый, ещё не выигранный (0 — такого нет)
export function nextStop(w = G.world) {
  const p = progress.worlds[w];
  for (let n = 1; n <= Math.min(p.unlocked, levelsPerWorld()); n++) if (!p.won[n]) return n;
  return 0;
}
// карта открывается на последнем мире (progress.lastWorld); если он пройден целиком — на первом открытом мире с невыигранным уровнем
function mapStartWorld() {
  const lw = isOpen(progress.lastWorld) ? progress.lastWorld : WORLDS[0];
  return worldComplete(lw) ? WORLDS.find(w => isOpen(w) && !worldComplete(w)) ?? lw : lw;
}
export function openMap() { selectWorld(mapStartWorld()); mapSel = null; setMode("map"); showOpenedWorld(); }
export const mapSelN = () => (mapSel && mapSel.world === G.world ? mapSel.n : nextStop() || levelsPerWorld());
export function moveMapSel(d) { mapSel = { world: G.world, n: clamp(mapSelN() + d, 1, levelsPerWorld()) }; }
function showToast(text) { ui.toast = { text, t: LOOK.MENU_LOOK.map.toastTime }; }
// время подсказок карты (кадр меню; тесты шагают его __bb.mapTick): подсказка гаснет сама; SPEC-030: «<мир> открыт!» — тоже, пока видна карта
export function mapTick(dt) {
  if (ui.toast && (ui.toast.t -= dt) <= 0) ui.toast = null;
  if (ui.worldBanner && mode === "map" && (ui.worldBanner.t -= dt) <= 0) ui.worldBanner = null;
}
// остановка: открытая — карточка уровня, закрытая — «Сначала пройди уровень n − 1»
export function chooseStop(n) {
  mapSel = { world: G.world, n };
  if (n > worldProgress().unlocked) { showToast(L().lockedLevel(n - 1)); return; }
  cardLevel = n; setMode("levelCard");
}
// вкладка мира: закрытый мир не выбирается — только подсказка (SPEC-030: главный — какой мир пройти)
export function tapWorldTab(w) { if (isOpen(w)) selectWorld(w); else showToast(lockedText(w)); }
export const closeCard = () => { setMode("map"); };
// «Играть» на карточке: тот же startGame, что и раньше (resetWorld → loadLevel, надпись уровня, камера телефона)
export function playCard(players) { G.level = cardLevel; withScene(sceneBefore(G.world, G.level), () => startGame(players)); }   // SPEC-022: сначала заставка, если пора
// ---------- SPEC-017: история — главы по порядку и страница «Как играть» ----------
// storyCh — глава на экране; storyBack — куда ведёт «назад» (главный экран или карточка уровня); storyPage — «chapters» или «rules»
export let storyCh = 0, storyBack = "home";
export function openStory(id = STORY[0].id, back = "home") { storyCh = Math.max(0, STORY.findIndex(c => c.id === id)); storyBack = back; ui.storyPage = "chapters"; setMode("story"); }
const closeStory = () => { setMode(storyBack === "levelCard" ? "levelCard" : "home"); };
export const storyStep = d => { storyCh = clamp(storyCh + d, 0, STORY.length - 1); };
export const storyBackKey = () => { if (ui.storyPage === "rules") ui.storyPage = "chapters"; else closeStory(); };
// глава видна: начало — всегда; мир — когда он открыт (SPEC-030: worldOpen); конец — после 20-го уровня Школы
export function chapterOpen(c) {
  if (WORLDS.includes(c.id)) return isOpen(c.id);
  return c.id === "ended" ? progress.worlds.school.won[levelsPerWorld()] === true : true;
}
const storyOf = id => STORY.find(c => c.id === id);
// страницы: { art, crop ([x, y, w, h] — доли картинки или null — вся), text, bubbles? } или { thanks: true } (карточка «Спасибо» после финала)
export function scenePages(id) {
  if (TUTORIAL_SCENES.includes(id)) return tutorialPages(id.slice("tutorial_".length));   // SPEC-029
  if (id === "intro") return LOOK.MENU_LOOK.scene.panels.map((crop, i) => ({ art: STORY_ART.began, crop, text: storyOf("began").captions[lang][i],
    bubbles: [{ i, text: storyOf("began").bubbles[lang][i] }] }));   // SPEC-026: слова папы в облачке этой клетки
  if (id === "ending") return [{ art: STORY_ART.ended, crop: null, text: storyOf("ended").text[lang] }, { thanks: true }];
  const [kind, w] = id.split("_");
  return [{ art: STORY_ART[w], crop: null, text: kind === "boss" ? storyOf(w).boss[lang] : storyOf(w).text[lang] }];
}
// opts.mark — отметить показанной, когда с неё уходят (сама открылась: запуск, уровень, финал; пересмотр из «Истории» — нет);
// opts.play — перед уровнем: на последней странице «▶ Играть»
// SPEC-029: opts.skip — своё «Пропустить» (обучение: сразу в конец; кнопка на каждой странице), а «Дальше» после последней — then
export function openScene(id, then = null, opts = {}) {
  if (!SCENE_IDS.includes(id) && !TUTORIAL_SCENES.includes(id)) return false;
  ui.storyScene = { id, page: 0, then, mark: opts.mark !== false && SCENE_IDS.includes(id), play: !!opts.play, skip: opts.skip || null };
  setMode("scene");
  return true;
}
export const scenePageCount = () => (ui.storyScene ? scenePages(ui.storyScene.id).length : 0);
// заставка досмотрена (или пропущена): отметить показанной и — к тому, что дальше
function sceneDone() {
  const sc = ui.storyScene;
  ui.storyScene = null; setMode("home");                       // без заставки — просто на главный экран
  if (!sc) return;
  if (sc.mark && !progress.seen[sc.id]) { progress.seen[sc.id] = true; saveProgress(); }   // показана — отмечаем, когда с неё ушли
  if (sc.then) sc.then();
}
// пропустить (Escape, B, «Пропустить») — сразу к тому, что дальше (SPEC-029: или своё skip — обучение пропускается целиком)
export function sceneSkip() {
  const sc = ui.storyScene;
  if (sc && sc.skip) { ui.storyScene = null; sc.skip(); } else sceneDone();
}
// дальше (Enter, пробел, A, тап, «Дальше» / «Играть» / «Готово»): следующая страница, после последней — к тому, что дальше
export function sceneNext() { if (ui.storyScene && ui.storyScene.page < scenePageCount() - 1) ui.storyScene.page++; else sceneDone(); }
export function scenePrev() { if (ui.storyScene && ui.storyScene.page > 0) ui.storyScene.page--; }
// заставка перед уровнем (мир, n), если её ещё не показывали: босс — перед 20-м уровнем основного мира, бонусный мир — перед
// любым своим уровнем (первый раз это его первый уровень)
function sceneBefore(world, n) {
  const id = bossFor(world, n) ? "boss_" + world : BONUS_WORLDS.includes(world) ? "bonus_" + world : null;
  return id && !progress.seen[id] ? id : null;
}
function withScene(id, go) { if (id) openScene(id, go, { play: true }); else go(); }
// финал: после первой победы 20-го уровня Школы (экран победы или выход через паузу, который засчитал победу) — «Как всё закончилось»
// и «Спасибо» перед картой, главным экраном или магазином
const endingDue = () => !!lastReward && lastReward.win && lastReward.world === MAIN_WORLDS.at(-1) && lastReward.worldDone && !progress.seen.ending;
// глава истории → её заставка (посмотреть ещё раз); после неё — снова эта глава
const chapterScene = c => (c.id === "began" ? "intro" : c.id === "ended" ? "ending" : Object.hasOwn(BOSSES, c.id) ? "boss_" + c.id : "bonus_" + c.id);
export function watchChapter() {
  const c = STORY[storyCh], ch = storyCh;
  if (!chapterOpen(c)) return;
  openScene(chapterScene(c), () => { setMode("story"); storyCh = ch; ui.storyPage = "chapters"; }, { mark: false });
}
// всё состояние экранов меню — как при запуске (тесты: resetGame); SPEC-029: и обучения нет
export function resetMenus() {
  closeNameInput(false); ui.shopTab = "items"; ui.wardrobePage = "looks"; shopBack = "home"; mapSel = null; ui.toast = null; cardLevel = 1; ui.mapSwipe = null; ui.openedWorld = null; ui.worldBanner = null;
  storyCh = 0; storyBack = "home"; ui.storyPage = "chapters"; ui.storyScene = null; setTutorial(null); setPracticeStep(0);
}
export function toMap() {
  leaveLevel();
  if (endingDue()) { openScene("ending", toMap); return; }   // SPEC-022: сначала финал истории
  const w = ui.openedWorld;                                     // SPEC-030: победа открыла мир — карта переходит в него (selectWorld строит его уровень)
  if (!(w && w !== G.world && isOpen(w))) resetWorld(G.players);
  mapSel = null; setMode("map");                               // кольцо — снова на следующем уровне
  showOpenedWorld();
}
export function toHome() {
  leaveLevel();
  if (endingDue()) { openScene("ending", toHome); return; }  // SPEC-022: сначала финал истории
  resetWorld(G.players); setMode("home"); ui.worldBanner = null;
}
export const resumeGame = () => { setMode("play"); };
export const retryLevel = () => startGame(G.players);
// экран итогов → магазин; «Готово» в магазине ведёт на карту. После победы — уже следующий уровень (как «Дальше»)
export function shopAfterWin() {
  if (endingDue()) { openScene("ending", shopAfterWin); return; }   // SPEC-022: сначала финал истории
  G.level = clamp(G.level + 1, 1, worldProgress().unlocked); resetWorld(G.players); openShop("map");
}
export function shopAfterLose() { resetWorld(G.players); openShop("map"); }
export const nextLang = () => setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
export const toggleSound = () => { ui.muted = !ui.muted; };
