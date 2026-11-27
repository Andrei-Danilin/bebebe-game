// SPEC-011: the entry point and the one place that starts the game: the rng flags of the tests, the init functions in the
// start order of the one-file game, setHooks (before the saves), await loadSave() (SPEC-025), the first resetWorld, the frame loop frame,
// registerServiceWorker, installDebug. Client module (moved out of index.html in Phase C).
// SPEC-025 AC 7 / 7b: the start is one guarded boot() (no WebGL2 → the loading screen says noWebGL; any other start error →
// startFailed with Try again, index.html); the frame loop schedules the next frame first and runs inside a guard.

import { progress } from "../core/economy.js";
import { newGame, useGame } from "../core/game.js";
import { setHooks } from "../core/hooks.js";
import { noGameRng, setStrictRng } from "../core/util.js";
import { artGate, initArt } from "./art.js";
import { installDebug } from "./debug.js";
import { failStart, initErrors, reportError } from "./errors.js";
import { inMenus, inWardrobe, mapTick, mode, openScene, redress, resetWorld, seedRandom, syncStock } from "./flow.js";
import { drainEvents, runFrame, viewTick } from "./fx.js";
import { initInput, pollPads } from "./input.js";
import { initBack } from "./back.js";
import { initLifecycle, pauseForWall } from "./lifecycle.js";
import { endTryOn } from "./outfits.js";
import { LOOK } from "./look.js";
import { initPerf, noteFrame } from "./perf.js";
import { langPending, loadSave } from "./save.js";
import { openLangScreen } from "./ui/lang.js";
import { fit, initScreen, runQueuedFit, simMode } from "./screen.js";
import { ui } from "./state.js";
import { initCamera, updateCamera } from "./three/camera.js";
import { initCharacters, rebuild3D } from "./three/characters.js";
import { initMaterials } from "./three/materials.js";
import { initPreviews } from "./three/previews.js";
import { hasWebGL2, initScene, initThree } from "./three/setup.js";
import { initSync, render3D } from "./three/sync.js";
import { firstTutorial, openFirstTutorial } from "./tutorial.js";
import { initUpdates } from "./update.js";
import { showDueNote } from "./ui/grownups.js";
import { updateMinimapFade } from "./ui/minimap.js";
import { drawUI } from "./ui/screens.js";

let langDue = false, introDue = false, tutorialDue = false, last = 0;
async function boot() {
  // SPEC-025 AC 7: errors are logged (and, once ready, shown) from here on
  initErrors();
  if (!hasWebGL2()) { failStart("noWebGL"); return; }   // SPEC-025 AC 7b: three.js r187 needs WebGL2
  // SPEC-008 / SPEC-011 AC 8d: тесты включают строгую игровую случайность и задают зерно запуска (init-скрипт до игры)
  setStrictRng(window.__bbStrictRng === true);
  useGame(newGame());                         // SPEC-012: the local game (resetWorld builds it; the saves pick its world and level first)
  if (Number.isFinite(window.__bbSeed)) seedRandom(window.__bbSeed);
  initArt();
  initScreen();
  // SPEC-011 AC 3b: сторона клиента в порту hooks (Phase C: src/client/main.js) — до загрузки сохранений и до первой игры
  setHooks({ rebuild: rebuild3D });
  // SPEC-025 AC 3b: the save module loads (and migrates, recovers) the save before the first level is built (storage is async)
  await loadSave();
  initInput();
  initThree();
  fit();
  initScene();
  initCamera();
  initMaterials();
  initSync();
  initCharacters();
  initPreviews();
  // SPEC-025 AC 14 / 14c: hide, blur, WebGL context loss
  initLifecycle();
  // SPEC-033 AC 13: the system Back / Escape on home ask "Leave the game?" (a guard history entry)
  initBack();
  // SPEC-025 AC 15b: ?perf=1 — the perf overlay (__bb.perf)
  initPerf();
  fit();
  resetWorld(1);
  artGate();                                  // SPEC-020: экран загрузки ждёт картинки (недолго); игра уже готова
  // SPEC-022: самый первый запуск (и старое сохранение без seen: история новая для всех) — комикс «Как всё началось» (под экраном
  // загрузки, пока он есть). Тесты его пропускают: их init-скрипт ставит window.__bbNoIntro (кроме теста первого запуска)
  introDue = !progress.seen.intro && window.__bbNoIntro !== true;   // открывается в frame(), когда экрана загрузки уже нет
  // SPEC-032 AC 13: самый первый запуск (ничего не сохранено) — сначала экран языка, пока на него не ответили (langAsked: false в
  // сохранении — закрыли приложение на нём, спросит снова); тесты пропускают его вместе с комиксом
  langDue = langPending() && window.__bbNoIntro !== true;
  // SPEC-029: после комикса — обучение (только настоящий первый запуск: firstTutorial); тесты пропускают его: window.__bbNoTutorial
  tutorialDue = firstTutorial(progress) && window.__bbNoTutorial !== true;
  window.__bbReady = true;
  last = performance.now();
  requestAnimationFrame(frame);
  registerServiceWorker();
  installDebug();
}
boot().catch(e => failStart(e && e.noWebGL ? "noWebGL" : "startFailed", e));   // SPEC-025 AC 7b

// =====================================================================
//  ГЛАВНЫЙ ЦИКЛ
// =====================================================================
// SPEC-025 AC 7: the next frame is asked for first, so an error in this one never stops the loop; the error → reportError
function frame(now) {
  requestAnimationFrame(frame);
  try { tick(now); } catch (e) { reportError(e); }
}
function tick(now) {
  // первая метка rAF бывает раньше performance.now() при запуске: dt < 0 раскачивал тряску камеры (shake − dt) — не меньше 0
  const real = (now - last) / 1000, dt = Math.max(0, Math.min(LOOK.VIEW_DT_MAX, real));   // dt — the frame time of the view; the game takes real through the accumulator (SPEC-034)
  last = now;
  noteFrame(Math.max(0, real), dt);          // SPEC-025 AC 15b: __bb.perf()
  runQueuedFit();                            // SPEC-038 AC 2: a resize / rotation since the last frame — the canvases are rebuilt before this frame draws
  if (simMode) return;                       // sim: ни логики, ни рисования — игру шагает simRun
  if (langDue && mode === "home" && !document.getElementById("loading")) { langDue = false; openLangScreen(); }   // SPEC-032: язык — до комикса
  if (introDue && mode === "home" && !document.getElementById("loading")) { introDue = false; openScene("intro", tutorialDue ? openFirstTutorial : null); }   // SPEC-022: первый запуск (SPEC-029: потом обучение; SPEC-033: сначала карточка «Как играть»)
  if (inMenus() && !document.getElementById("loading")) showDueNote(now);   // SPEC-025 AC 4 / 4b: a save note, once, in the menus
  ui.T += dt;
  pollPads();
  syncStock();                              // SPEC-012: the local stock follows the saves (shop, tests)
  if (!inWardrobe() && endTryOn()) redress();   // SPEC-009/017: ушли из вкладки «Гардероб» (друзья — её часть) — примерка кончилась
  pauseForWall();                           // SPEC-038 AC 2: the phone turned upright — the sticks go, a level pauses (turned back: the pause menu, no auto-resume)
  mapTick(dt);
  if (mode === "play") runFrame(Math.max(0, real));           // SPEC-012 / SPEC-034: devices once → the accumulator's whole 1/60 s steps → their effects (the game); the view ages by the frame time
  else { drainEvents(); viewTick(dt); if (inMenus()) ui.menuSpin += dt * 0.8; }   // SPEC-012 AC 1d: the Big One turns in the menus — a view angle, not game state
  noGameRng("render", () => {              // рисование не тянет игровую случайность (SPEC-008: тесты — ошибка, игра — vrand)
    updateCamera(dt);                       // телефон: камера за героем (3D-слой, не логика)
    updateMinimapFade(dt);                  // телефон: мини-карта бледнеет, когда под ней герой или Большой (SPEC-010)
    render3D(ui.T);
    drawUI(ui.T);
  });
}

// Офлайн-кэш (sw.js): только по http(s). С диска (file://) и на странице claude.ai — ничего не делаем и молчим.
function registerServiceWorker() {
  try {
    if ((location.protocol === "http:" || location.protocol === "https:") && navigator.serviceWorker) {
      navigator.serviceWorker.register("sw.js").then(initUpdates).catch(() => { /* регистрацию запретили — игра работает и так */ });   // SPEC-038 AC 5: initUpdates — плашка «новая версия»
    }
  } catch (e) { /* нет доступа к serviceWorker */ }
}
