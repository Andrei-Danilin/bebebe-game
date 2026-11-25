// SPEC-011: the tutorial step machine (SPEC-029): TUTORIAL_STEPS, pages, openTutorial, tutorialNext (the onPracticeWin
// hook), tutorialEnd, hint texts. Client module (moved out of index.html in Phase C).

import { CFG, WORLDS } from "../core/config.js";
import { progress, saveProgress } from "../core/economy.js";
import { big, curWorld, level, mode, numPlayers, pendingWin, setLevel, setMode, setPendingWin, setRewardDue, setWorld } from "../core/game.js";
import { setTutorialGame, tut, tutorialGame } from "../core/practice.js";
import { L } from "../i18n.js";
import { openMap, openScene, resetWorld, startGame } from "./flow.js";
import { LOOK } from "./look.js";
import { isTouch, PHONE } from "./screen.js";
import { ui } from "./state.js";

// SPEC-029: обучение (подробно — у openTutorial): идёт ли, номер тренировки, её сценарий и подсказки, её запас поцелуев и спасалок
export let tutorial = null;
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
  if (!tutorial) tutorial = { i: 0, back: back === "story" ? "story" : "map", keep: { world: curWorld, level, players: numPlayers } };
  tutorial.i = Math.max(0, TUTORIAL_STEPS.indexOf(from));
  tutorialShow();
}
function tutorialShow() {
  const s = tutorialStep();
  if (s.startsWith("game")) startTutorialGame(Number(s.slice(4)));
  else { setTutorialGame(0); openScene("tutorial_" + s, tutorialNext, { mark: false, skip: tutorialSkip }); }
}
// следующий шаг (страницы досмотрены, тренировка выиграна); после последнего — конец
export function tutorialNext() {
  if (!tutorial) return;
  if (tutorial.i >= TUTORIAL_STEPS.length - 1) tutorialEnd();
  else { tutorial.i++; tutorialShow(); }
}
// тренировка g: своя карта (resetWorld → applyTutorialMap; ключи мира и уровня — Парк 1), один игрок, без надписи уровня и без награды
function startTutorialGame(g) {
  setTutorialGame(g); setWorld(WORLDS[0]); setLevel(1);
  startGame(1);
  setRewardDue(false); ui.banner = null;
}
export function restartTutorialGame() { startTutorialGame(tutorialGame); }   // пауза → «Ещё раз»
export function tutorialSkip() { tutorialEnd(); }                            // «Пропустить» на странице, в паузе, в углу тренировки
// конец (досмотрели или пропустили): seen.tutorial, мир меню как был; первый запуск — карта уровней (Парк, уровень 1 ждёт), пересмотр — «Как играть»
function tutorialEnd() {
  const t = tutorial;
  if (!t) return;
  tutorial = null; setTutorialGame(0); ui.storyScene = null; setRewardDue(false); setPendingWin(0);
  if (!progress.seen.tutorial) { progress.seen.tutorial = true; saveProgress(); }
  setWorld(t.keep.world); setLevel(t.keep.level); resetWorld(t.keep.players);
  if (t.back === "story") { setMode("story"); ui.storyPage = "rules"; }
  else openMap();
}
// текст подсказки тренировки (или null); управление — по устройству, как на странице A4
export function tutorialHintText() {
  const T = L().tut, touch = PHONE || isTouch;
  if (tutorialGame === 2) return [null, T.g2item, T.g2banana, T.g2kiss(touch ? T.kissTouch : T.kissKey), T.g2kit(touch ? T.kitTouch : T.kitKey)][tut.hint] || null;
  if (tutorialGame !== 1) return null;
  return tut.hint === 1 ? T.g1rescue : tut.hint === 2 ? T.g1sneak(touch ? T.tiptoeTouch : T.tiptoeKey) : tut.hint === 3 ? T.g1hug : null;
}
export const tutorialHintOn = () => mode === "play" && pendingWin <= 0 && !big.kind && !!tutorialHintText();

// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setTutorial(v) { tutorial = v; }
