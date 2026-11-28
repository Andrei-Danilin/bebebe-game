// SPEC-029 / SPEC-039 (from tutorial.js): the tutorial's state (which step runs, the practice game's number), its steps, the pages of its
// sheets and the hint texts of the practice games. Plain data and reads of the screen and the game, no flow: flow.js keeps the
// state through the setters and reads the pages, tutorial.js (above flow.js) moves between the steps. Client module.
import { CFG, WORLDS } from "../core/config.js";
import { L } from "../i18n.js";
import { LOOK } from "./look.js";
import { isTouch, PHONE } from "./screen.js";
import { mode } from "./state.js";
import { G } from "../core/active.js";

// SPEC-029: обучение (подробно — у openTutorial): идёт ли, номер тренировки, её сценарий и подсказки, её запас поцелуев и спасалок
export let tutorial = null;
// SPEC-012 AC 10: the practice step the next local game is built with (1, 2) or 0 — a normal level (the game holds its own copy)
export let practiceStep = 0;
// ---------- SPEC-029: обучение — страницы A → тренировка 1 → страницы B, C → тренировка 2 → «Ты готов!» → конец ----------
// Решение Андрея: после комикса при самом первом запуске, с «Пропустить»; пересмотр — «Тренировка» на странице «Как играть».
// tutorial — идёт обучение { i — шаг из TUTORIAL_STEPS, back — куда в конце («map» — карта уровней, «story» — «Как играть»),
// keep — мир, уровень и число игроков меню (тренировки играют свою карту одним игроком; в конце всё как было) } или null.
// tutorialGame — номер идущей тренировки (1, 2; resetWorld строит её: свои сердечки, без босса) или 0 — обычный уровень.
// Тренировка без награды: rewardDue = false (ни монеток, ни звёзд, ни уровней); победа — дальше по обучению, а не экран победы.
export const TUTORIAL_STEPS = Object.freeze(["a", "game1", "b", "c", "game2", "ready"]);
// SPEC-033 AC 1: первый запуск — перед страницей A карточка «Как играть» (сцена tutorial_intro); пересмотр, «Тренировка» и «Картинки» её не показывают
export const FIRST_STEPS = Object.freeze(["intro", ...TUTORIAL_STEPS]);
// SPEC-032 AC 8: «Тренировка» на «Как играть» — только две тренировки (без страниц с картинками между ними)
export const PRACTICE_STEPS = Object.freeze(["game1", "game2"]);
export const tutorialStep = () => (tutorial ? tutorial.steps[tutorial.i] : null);
// само открывается только при настоящем первом запуске: комикс ещё не видели, обучение тоже, и ни одного выигранного уровня
// (старое сохранение, где уже играют, — нет; его предлагает «Как играть»)
export const firstTutorial = p => !p.seen.intro && !p.seen.tutorial && !WORLDS.some(w => Object.keys(p.worlds[w].won).length > 0);
// SPEC-048: ONE definition of the tutorial's pictures: a step's sheet (a, b, c → tutorial_<step>), the card before it and the last page; the order they come in
// (the practice games play between) is what screen-art.js prefetches by
export const HOWTO_ART = "howto_card", READY_ART = "story_win";
export const sheetArt = sh => "tutorial_" + sh;
export const stepArt = step => (step === "intro" ? HOWTO_ART : step === "ready" ? READY_ART : ["a", "b", "c"].includes(step) ? sheetArt(step) : null);
const SHEET_ORDER = [HOWTO_ART, ...["a", "b", "c"].map(sheetArt), READY_ART];
// the picture of the step after the one that shows `name` (null at the end, or for a picture that is no step's)
export const sheetAfter = name => (SHEET_ORDER.includes(name) ? SHEET_ORDER[SHEET_ORDER.indexOf(name) + 1] ?? null : null);
// страницы листа sh («a», «b», «c»: четыре клетки картинки tutorial_<sh>, подпись под каждой) или «ready» (одна страница)
export function tutorialPages(sh) {
  if (sh === "pics") return ["a", "b", "c"].flatMap(tutorialPages);   // SPEC-032 AC 8: «Картинки» — все страницы листов A1…C4 подряд
  const T = L().tut, F = CFG.TUTORIAL_LOOK.pages;
  if (sh === "intro") return [{ card: true, art: HOWTO_ART, crop: null, title: L().howToPlay, text: T.introLine, art2: sheetArt("a"), crop2: LOOK.MENU_LOOK.scene.panels[0], fallback: F.a[0] }];   // SPEC-033 AC 2: нет howto_card — клетка A1
  if (sh === "ready") return [{ art: READY_ART, crop: null, text: T.ready, fallback: F.ready }];   // дети и подобревший папа
  const texts = sh === "a" ? T.a(PHONE || isTouch ? T.tiptoeTouch : T.tiptoeKey) : T[sh];
  return LOOK.MENU_LOOK.scene.panels.map((crop, i) => ({ art: sheetArt(sh), crop, text: texts[i], fallback: F[sh][i] }));   // клетка листа (как комикс в начале)
}
// все картинки, которые может нарисовать обучение (листы, последняя страница, фигурки и значки запасных страниц)
export const tutorialArtNames = () => [...["a", "b", "c"].map(sheetArt), READY_ART, HOWTO_ART, ...Object.values(CFG.TUTORIAL_LOOK.figures).map(f => f[0]),
  ...Object.values(CFG.TUTORIAL_LOOK.pages).flat(2).filter(n => !Object.hasOwn(CFG.TUTORIAL_LOOK.figures, n))];
// текст подсказки тренировки (или null); управление — по устройству, как на странице A4
export function tutorialHintText() {
  const T = L().tut, touch = PHONE || isTouch;
  if (G.tutorialGame === 2) return [null, T.g2item, T.g2banana, T.g2kiss(touch ? T.kissTouch : T.kissKey), T.g2kit(touch ? T.kitTouch : T.kitKey)][G.tut.hint] || null;
  if (G.tutorialGame !== 1) return null;
  return G.tut.hint === 1 ? T.g1rescue : G.tut.hint === 2 ? T.g1sneak(touch ? T.tiptoeTouch : T.tiptoeKey) : G.tut.hint === 3 ? T.g1hug : null;
}
export const tutorialHintOn = () => mode === "play" && G.pendingWin <= 0 && !G.big.kind && !!tutorialHintText();

// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setTutorial(v) { tutorial = v; }
export function setPracticeStep(v) { practiceStep = v; }
