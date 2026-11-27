// SPEC-011: the language (setLang) and the save calls of the game (saveProgress — after every change of progress, writeOutfits,
// writeNames). SPEC-025 phase 2: storage belongs to the save module (save.js: one key bebebe-save, loaded by loadSave() at start); these
// calls queue the whole save there — through the port ports.queueSave, because save.js reads the names and outfits that call them.
// SPEC-039: the reset of the progress moved to reset.js (it needs the game's flow, which needs this module). Client module.

import { HTML_LANG, LANGS, setCurrentLang } from "../i18n.js";
import { ports } from "./ports.js";

export function setLang(l) {
  if (!LANGS.includes(l)) return;
  setCurrentLang(l);
  document.documentElement.lang = HTML_LANG[l] || l;
  ports.queueSave();
}
// SPEC-012: the client saves after every change of progress it makes (economy events it applies, shop, wardrobe, screens)
export function saveProgress() { ports.queueSave(); }
// наряды и имена — тоже в bebebe-save (их зовут outfits.js и names.js)
export function writeOutfits() { ports.queueSave(); }
export function writeNames() { ports.queueSave(); }
