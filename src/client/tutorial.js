// SPEC-011: the tutorial step machine (SPEC-029): TUTORIAL_STEPS, pages, openTutorial, tutorialNext (after a practiceWin event
// after the step), tutorialEnd, hint texts. Client module (moved out of index.html in Phase C).

import { CFG, WORLDS } from "../core/config.js";
import { progress } from "../core/economy.js";
import { L } from "../i18n.js";
import { mode, openMap, openScene, playWorld, setMode, startGame } from "./flow.js";
import { LOOK } from "./look.js";
import { isTouch, PHONE } from "./screen.js";
import { ui } from "./state.js";
import { G } from "../core/active.js";
import { saveProgress } from "./progress.js";

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
export const tutorialStep = () => (tutorial ? TUTORIAL_STEPS[tutorial.i] : null);
// само открывается только при настоящем первом запуске: комикс ещё не видели, обучение тоже, и ни одного выигранного уровня
// (старое сохранение, где уже играют, — нет; его предлагает «Как играть»)
export const firstTutorial = p => !p.seen.intro && !p.seen.tutorial && !WORLDS.some(w => Object.keys(p.worlds[w].won).length > 0);
// страницы листа sh («a», «b», «c»: четыре клетки картинки tutorial_<sh>, подпись под каждой) или «ready» (одна страница)
export function tutorialPages(sh) {
  const T = L().tut, F = CFG.TUTORIAL_LOOK.pages;
  if (sh === "ready") return [{ art: "story_win", crop: null, text: T.ready, fallback: F.ready }];   // дети и подобревший папа
  const texts = sh === "a" ? T.a(PHONE || isTouch ? T.tiptoeTouch : T.tiptoeKey) : T[sh];
  return LOOK.MENU_LOOK.scene.panels.map((crop, i) => ({ art: "tutorial_" + sh, crop, text: texts[i], fallback: F[sh][i] }));   // клетка листа (как комикс в начале)
}
// все картинки, которые может нарисовать обучение (листы, последняя страница, фигурки и значки запасных страниц)
export const tutorialArtNames = () => [...["a", "b", "c"].map(s => "tutorial_" + s), "story_win", ...Object.values(CFG.TUTORIAL_LOOK.figures).map(f => f[0]),
  ...Object.values(CFG.TUTORIAL_LOOK.pages).flat(2).filter(n => !Object.hasOwn(CFG.TUTORIAL_LOOK.figures, n))];
export function openTutorial(back = "map", from = TUTORIAL_STEPS[0]) {
  if (!tutorial) tutorial = { i: 0, back: back === "story" ? "story" : "map", keep: { world: G.world, level: G.level, players: G.players } };
  tutorial.i = Math.max(0, TUTORIAL_STEPS.indexOf(from));
  tutorialShow();
}
function tutorialShow() {
  const s = tutorialStep();
  if (s.startsWith("game")) startTutorialGame(Number(s.slice(4)));
  else { practiceStep = 0; openScene("tutorial_" + s, tutorialNext, { mark: false, skip: tutorialSkip }); }
}
// следующий шаг (страницы досмотрены, тренировка выиграна); после последнего — конец
export function tutorialNext() {
  if (!tutorial) return;
  if (tutorial.i >= TUTORIAL_STEPS.length - 1) tutorialEnd();
  else { tutorial.i++; tutorialShow(); }
}
// тренировка g: своя карта (resetWorld → applyTutorialMap; ключи мира и уровня — Парк 1), один игрок, без надписи уровня и без награды
function startTutorialGame(g) {
  practiceStep = g; G.world = WORLDS[0]; G.level = 1;
  startGame(1);
  G.rewardDue = false; ui.banner = null;
}
export function restartTutorialGame() { startTutorialGame(practiceStep || G.tutorialGame); }   // пауза → «Ещё раз»
export function tutorialSkip() { tutorialEnd(); }                            // «Пропустить» на странице, в паузе, в углу тренировки
// конец (досмотрели или пропустили): seen.tutorial, мир меню как был; первый запуск — карта уровней (Парк, уровень 1 ждёт), пересмотр — «Как играть»
function tutorialEnd() {
  const t = tutorial;
  if (!t) return;
  tutorial = null; practiceStep = 0; ui.storyScene = null; G.rewardDue = false; G.pendingWin = 0;
  if (!progress.seen.tutorial) { progress.seen.tutorial = true; saveProgress(); }
  G.world = t.keep.world; G.level = t.keep.level; playWorld(t.keep.players);
  if (t.back === "story") { setMode("story"); ui.storyPage = "rules"; }
  else openMap();
}
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
