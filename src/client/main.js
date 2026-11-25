// SPEC-011: the entry point and the one place that starts the game: the rng flags of the tests, the init functions in the
// start order of the one-file game, setHooks (before initSaves), initSaves, the first resetWorld, the frame loop frame,
// registerServiceWorker, installDebug. Client module (moved out of index.html in Phase C).

import { progress } from "../core/economy.js";
import { newGame, update, updateFx, useGame } from "../core/game.js";
import { setHooks } from "../core/hooks.js";
import { noGameRng, seedRandom, setStrictRng } from "../core/util.js";
import { artGate, initArt } from "./art.js";
import { installDebug } from "./debug.js";
import { inMenus, inWardrobe, mapTick, mode, onWin, openScene, resetWorld } from "./flow.js";
import { bannerTick, burst, clientFx, popText } from "./fx.js";
import { deviceInput, initInput, pollPads } from "./input.js";
import { endTryOn } from "./outfits.js";
import { initSaves, writeProgress } from "./progress.js";
import { fit, initScreen, isTouch, simMode } from "./screen.js";
import { SFX } from "./sound.js";
import { ui } from "./state.js";
import { initCamera, updateCamera } from "./three/camera.js";
import { initCharacters, rebuild3D } from "./three/characters.js";
import { initMaterials } from "./three/materials.js";
import { initPreviews } from "./three/previews.js";
import { initScene, initThree } from "./three/setup.js";
import { initSync, render3D } from "./three/sync.js";
import { firstTutorial, openTutorial, tutorialNext } from "./tutorial.js";
import { updateMinimapFade } from "./ui/minimap.js";
import { drawUI } from "./ui/screens.js";
import { G } from "../core/active.js";

// SPEC-008 / SPEC-011 AC 8d: тесты включают строгую игровую случайность и задают зерно запуска (init-скрипт до игры)
setStrictRng(window.__bbStrictRng === true);
useGame(newGame());                         // SPEC-012: the local game (resetWorld builds it; the saves pick its world and level first)
if (Number.isFinite(window.__bbSeed)) seedRandom(window.__bbSeed);
initArt();
initScreen();
// SPEC-011 AC 3b: сторона клиента в порту hooks (Phase C: src/client/main.js) — до загрузки сохранений и до первой игры
setHooks({
  sfx: name => SFX[name](), burst, pop: popText, shake: v => { ui.shake = v; }, fx: clientFx, banner: bannerTick, rebuild: rebuild3D, save: writeProgress,
  onWin, onPracticeWin: () => tutorialNext(), inputFor: deviceInput
});
initSaves();
initInput();
initThree();
fit();
initScene();
initCamera();
initMaterials();
initSync();
initCharacters();
initPreviews();

// =====================================================================
//  ГЛАВНЫЙ ЦИКЛ
// =====================================================================
fit();
resetWorld(1);
artGate();                                  // SPEC-020: экран загрузки ждёт картинки (недолго); игра уже готова
// SPEC-022: самый первый запуск (и старое сохранение без seen: история новая для всех) — комикс «Как всё началось» (под экраном
// загрузки, пока он есть). Тесты его пропускают: их init-скрипт ставит window.__bbNoIntro (кроме теста первого запуска)
let introDue = !progress.seen.intro && window.__bbNoIntro !== true;   // открывается в frame(), когда экрана загрузки уже нет
// SPEC-029: после комикса — обучение (только настоящий первый запуск: firstTutorial); тесты пропускают его: window.__bbNoTutorial
const tutorialDue = firstTutorial(progress) && window.__bbNoTutorial !== true;
window.__bbReady = true;
let last = performance.now();
function frame(now) {
  // первая метка rAF бывает раньше performance.now() при запуске: dt < 0 раскачивал тряску камеры (shake − dt) — не меньше 0
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (simMode) { requestAnimationFrame(frame); return; }   // sim: ни логики, ни рисования — игру шагает simRun
  if (introDue && mode === "home" && !document.getElementById("loading")) { introDue = false; openScene("intro", tutorialDue ? () => openTutorial("map") : null); }   // SPEC-022: первый запуск (SPEC-029: потом обучение)
  ui.T += dt;
  pollPads();
  if (!inWardrobe() && endTryOn()) resetWorld(G.players);   // SPEC-009/017: ушли из вкладки «Гардероб» (друзья — её часть) — примерка кончилась
  const portrait = isTouch && window.innerHeight > window.innerWidth;
  mapTick(dt);
  if (mode === "play" && !portrait) update(dt);
  else { updateFx(dt); if (inMenus()) G.big.dir += dt * 0.8; }
  noGameRng("render", () => {              // рисование не тянет игровую случайность (SPEC-008: тесты — ошибка, игра — vrand)
    updateCamera(dt);                       // телефон: камера за героем (3D-слой, не логика)
    updateMinimapFade(dt);                  // телефон: мини-карта бледнеет, когда под ней герой или Большой (SPEC-010)
    render3D(ui.T);
    drawUI(ui.T);
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Офлайн-кэш (sw.js): только по http(s). С диска (file://) и на странице claude.ai — ничего не делаем и молчим.
function registerServiceWorker() {
  try {
    if ((location.protocol === "http:" || location.protocol === "https:") && navigator.serviceWorker) {
      navigator.serviceWorker.register("sw.js").catch(() => { /* регистрацию запретили — игра работает и так */ });
    }
  } catch (e) { /* нет доступа к serviceWorker */ }
}
registerServiceWorker();
installDebug();
