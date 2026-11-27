// SPEC-011: the tutorial step machine (SPEC-029): openTutorial, tutorialNext (after a practiceWin event after the step), tutorialEnd —
// the actions, which open the screens and build the practice games (flow.js). SPEC-039: the state, the steps, the pages and the hint
// texts are in tutorial-data.js, below flow.js, which reads them. Client module.

import { WORLDS } from "../core/config.js";
import { progress } from "../core/economy.js";
import { openMap, openScene, playWorld, setMode, startGame } from "./flow.js";
import { saveProgress } from "./progress.js";
import { ui } from "./state.js";
import { FIRST_STEPS, PRACTICE_STEPS, practiceStep, setPracticeStep, setTutorial, tutorial, TUTORIAL_STEPS, tutorialStep } from "./tutorial-data.js";
import { G } from "../core/active.js";

// SPEC-033 AC 1: первый запуск, после комикса: карточка «Как играть», потом всё обучение (из main.js)
export const openFirstTutorial = () => openTutorial("map", FIRST_STEPS[0], FIRST_STEPS);
// steps — шаги этого прохода (весь TUTORIAL_STEPS при первом запуске; PRACTICE_STEPS — «Тренировка» на «Как играть», SPEC-032)
export function openTutorial(back = "map", from = null, steps = TUTORIAL_STEPS) {
  if (!tutorial) setTutorial({ i: 0, back: back === "story" ? "story" : "map", keep: { world: G.world, level: G.level, players: G.players }, steps });
  tutorial.i = Math.max(0, tutorial.steps.indexOf(from ?? tutorial.steps[0]));
  tutorialShow();
}
// SPEC-032 AC 8: «Тренировка» — тренировка 1, сразу тренировка 2, потом снова «Как играть»; «Пропустить» — как раньше
export const openPractice = () => openTutorial("story", PRACTICE_STEPS[0], PRACTICE_STEPS);
// SPEC-032 AC 8: «Картинки» — страницы листов A1…C4 (без тренировок): «Дальше» / «Назад» / точки; последняя «Дальше», «Назад» на
// первой странице и Escape — снова «Как играть»
const backToRules = () => { setMode("story"); ui.storyPage = "rules"; };
export const openPictures = () => openScene("tutorial_pics", backToRules, { mark: false, skip: backToRules, back: true });
function tutorialShow() {
  const s = tutorialStep();
  if (s.startsWith("game")) startTutorialGame(Number(s.slice(4)));
  else { setPracticeStep(0); openScene("tutorial_" + s, tutorialNext, { mark: false, skip: tutorialSkip }); }
}
// следующий шаг (страницы досмотрены, тренировка выиграна); после последнего — конец
export function tutorialNext() {
  if (!tutorial) return;
  if (tutorial.i >= tutorial.steps.length - 1) tutorialEnd();
  else { tutorial.i++; tutorialShow(); }
}
// тренировка g: своя карта (resetWorld → applyTutorialMap; ключи мира и уровня — Парк 1), один игрок, без надписи уровня и без награды
function startTutorialGame(g) {
  setPracticeStep(g); G.world = WORLDS[0]; G.level = 1;
  startGame(1);
  G.rewardDue = false; ui.banner = null;
}
export function restartTutorialGame() { startTutorialGame(practiceStep || G.tutorialGame); }   // пауза → «Ещё раз»
export function tutorialSkip() { tutorialEnd(); }                            // «Пропустить» на странице, в паузе, в углу тренировки
// конец (досмотрели или пропустили): seen.tutorial, мир меню как был; первый запуск — карта уровней (Парк, уровень 1 ждёт), пересмотр — «Как играть»
function tutorialEnd() {
  const t = tutorial;
  if (!t) return;
  setTutorial(null); setPracticeStep(0); ui.storyScene = null; G.rewardDue = false; G.pendingWin = 0;
  if (!progress.seen.tutorial) { progress.seen.tutorial = true; saveProgress(); }
  G.world = t.keep.world; G.level = t.keep.level; playWorld(t.keep.players);
  if (t.back === "story") backToRules();
  else openMap();
}
