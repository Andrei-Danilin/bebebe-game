// SPEC-011: the saves: language (initLang, setLang), writeProgress (the save hook), initSaves() (AC 5b order),
// resetProgress. Client module (moved out of index.html in Phase C).

import { WORLDS } from "../core/config.js";
import { progress, saveProgress, setProgress } from "../core/economy.js";
import { curWorld, numPlayers, setLevel, setRewardDue, setWorld } from "../core/game.js";
import { hasFlatProgress, isOpen, worldProgress } from "../core/progress-rules.js";
import { detectLang, HTML_LANG, lang, LANGS, setCurrentLang } from "../i18n.js";
import { resetWorld } from "./flow.js";
import { initNames } from "./names.js";
import { adoptWorn, cloneSkins, fitOutfitsToOwned, loadOutfits, setSkinKeep, setSkinSel, skinSel } from "./outfits.js";
import { ui } from "./state.js";

// язык при запуске (initSaves — первым: ему нужно знать, есть ли сохранённый прогресс)
function initLang() {
  try {
    let saved = null, played = false;
    try { saved = localStorage.getItem("bebebe-lang"); played = localStorage.getItem("bebebe-progress") !== null; } catch (e) { /* без хранилища — по браузеру */ }
    setCurrentLang(detectLang(saved, navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language], played));
    // самый первый запуск: язык браузера сохраняется сразу — первая же игра пишет bebebe-progress, и без этого со второго запуска
    // был бы английский (у игрока с прогрессом без сохранённого языка — английский, как раньше; его не трогаем)
    if (!LANGS.includes(saved) && !played) { try { localStorage.setItem("bebebe-lang", lang); } catch (e) { /* без хранилища — ok */ } }
  } catch (e) { /* ok — английский */ }
  document.documentElement.lang = HTML_LANG[lang] || lang;
}
export function setLang(l) {
  if (!LANGS.includes(l)) return;
  setCurrentLang(l);
  document.documentElement.lang = HTML_LANG[l] || l;
  try { localStorage.setItem("bebebe-lang", l); } catch (e) { /* ok */ }
}
// прогресс → localStorage (hooks.save)
export function writeProgress() { try { localStorage.setItem("bebebe-progress", JSON.stringify(progress)); } catch (e) { /* ok */ } }
// SPEC-011 AC 5b: сохранения грузятся в одном месте и в одном порядке, до первой игры: язык (есть ли сохранённый прогресс) →
// наряды → имена → прогресс (setProgress; старое плоское сохранение один раз переписывается) → adoptWorn / fitOutfitsToOwned →
// мир и уровень, на которых открывается меню. Форма сохранений не меняется (старые грузятся как раньше)
export function initSaves() {
  initLang();
  try { setSkinSel(loadOutfits(JSON.parse(localStorage.getItem("bebebe-outfits") || "null"))); } catch (e) { /* ok */ }   // старый ключ bebebe-place больше не читается (SPEC-006)
  setSkinKeep(cloneSkins(skinSel));                          // после загрузки прогресса надетое становится своим (adoptWorn)
  initNames();
  let migrated = false, hadOwned = false;
  try {
    const pv = JSON.parse(localStorage.getItem("bebebe-progress") || "null");
    setProgress(pv);
    migrated = hasFlatProgress(pv);
    hadOwned = !!pv && typeof pv === "object" && "owned" in pv;   // SPEC-009: сохранение уже знает про купленные наряды
  } catch (e) { setProgress(null); }
  if (migrated) saveProgress();                            // переезд старого сохранения — один раз
  if (!hadOwned) adoptWorn(); else fitOutfitsToOwned();    // сохранение с owned: некупленное снимается, а не дарится
  setWorld(progress.lastWorld);
  setLevel(worldProgress().unlocked);                        // меню открывается на последнем мире, на его новом уровне
}

export function resetProgress() {
  if (!ui.resetArmed) { ui.resetArmed = true; return; }
  ui.resetArmed = false;
  setRewardDue(false);                         // прогресс заменён целиком: за брошенный уровень не платим
  setProgress(null); ui.openedWorld = null; ui.worldBanner = null;   // новый прогресс
  if (!isOpen(curWorld)) setWorld(WORLDS[0]);   // SPEC-016/030: после сброса открыт только Парк
  progress.lastWorld = curWorld;
  fitOutfitsToOwned();                       // SPEC-009: купленные наряды ушли вместе с прогрессом
  saveProgress(); setLevel(1); resetWorld(numPlayers);
}
