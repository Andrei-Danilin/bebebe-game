// SPEC-011: screens and transitions: world choice, leaveLevel, giveReward, resetWorld (the client wrapper of buildGame), the
// level banner, startGame, nextLevel, the modes, the shop tabs, the map and level card, the story and its scenes,
// resetMenus, toMap, toHome. Client module (moved out of index.html in Phase C).

import { BONUS_WORLDS, BOSSES, levelsPerWorld, MAIN_WORLDS, worldIndex, WORLDS } from "../core/config.js";
import { progress, saveProgress } from "../core/economy.js";
import { buildGame, lastReward, logEvent, mode, setMode, teamSize } from "../core/game.js";
import { levelType } from "../core/level/generate.js";
import { bossFor } from "../core/mood.js";
import { isOpen, payReward, worldComplete, worldProgress } from "../core/progress-rules.js";
import { clamp } from "../core/util.js";
import { BIG_SKINS } from "../core/wardrobe.js";
import { L, lang, LANGS } from "../i18n.js";
import { SCENE_IDS, STORY, TUTORIAL_SCENES } from "../story.js";
import { STORY_ART } from "./art.js";
import { closeNameInput, sticks } from "./input.js";
import { LOOK } from "./look.js";
import { botOutfit, endTryOn, makeLook, skinSel } from "./outfits.js";
import { setLang } from "./progress.js";
import { PHONE } from "./screen.js";
import { ui } from "./state.js";
import { camSnap } from "./three/camera.js";
import { setTutorial, tutorialPages } from "./tutorial.js";
import { lockedText } from "./ui/map.js";
import { G } from "../core/active.js";

// выбор мира в меню (карточка, ↑/↓, крестовина геймпада): запоминается, показывается новый открытый уровень мира.
// SPEC-016/030: закрытый мир выбрать нельзя (__bb.world — без проверки, для тестов и отчёта баланса)
export function selectWorld(w) {
  if (!WORLDS.includes(w) || w === G.world || !isOpen(w)) return;
  G.world = w; ui.toast = null; ui.worldBanner = null;   // SPEC-017: подсказка карты была про прошлый мир (SPEC-030: и плашка «открыт»)
  progress.lastWorld = G.world; saveProgress();
  G.level = worldProgress().unlocked;
  resetWorld(G.players);
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
// клиент: награда (payReward) и мир, который она открыла (hooks.onWin зовёт noteOpenedWorld сам)
export function giveReward(win) { noteOpenedWorld(payReward(win)); }
// SPEC-030: победа открыла главный мир — карта переключится на него, когда откроется
export function noteOpenedWorld(r) { if (r && r.worldOpened) ui.openedWorld = r.worldOpened; }

// новая игра мира и уровня меню (curWorld, level): правило телефона (играет один), виды из гардероба; надписи, частицы, тряска и
// джойстики — с нуля. Игру строит buildGame (SPEC-011 AC 3c)
export function resetWorld(n) {
  if (PHONE) n = 1;                  // на телефоне играет один (SPEC-005)
  ui.texts = []; ui.particles = []; ui.shake = 0; sticks.clear(); ui.resetArmed = false;
  const looks = { players: [makeLook(skinSel.p1), makeLook(skinSel.p2)], bots: Array.from({ length: teamSize() - n }, (_, bi) => makeLook(botOutfit(bi))), big: BIG_SKINS[skinSel.big] };
  buildGame(G.world, G.level, n, { looks });
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
export function startGame(n) { leaveLevel(); ui.openedWorld = null; ui.worldBanner = null; endTryOn(); G.events = []; resetWorld(n); setMode("play"); G.rewardDue = true; mapSel = null; showBanner(); camSnap(); }
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
// мир карты — curWorld (выбор мира — selectWorld, он же запоминает progress.lastWorld); mapSel — остановка с кольцом выбора
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
  storyCh = 0; storyBack = "home"; ui.storyPage = "chapters"; ui.storyScene = null; setTutorial(null); G.tutorialGame = 0;
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
