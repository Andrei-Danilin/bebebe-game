// SPEC-011 AC 2b: the player's economy — the one owner of progress and the coin book. Core module.
import { CFG } from "./config.js";
import { hooks } from "./hooks.js";
import { logEvent } from "./game.js";
import { tutorialGame, tutorialInv } from "./practice.js";
import { freshProgress, loadProgress } from "./progress-rules.js";

// SPEC-011 AC 2b: экономика игрока — единственный владелец progress (простые данные: миры, монетки, запас, рукавицы, наряды,
// улучшения, заставки) и книги монеток ledger. Хранилище не трогает: сохраняет только через hooks.save; сохранение даёт клиент
// (initSaves → setProgress). Менять progress.coins могут только addCoins / spendCoins (тест «only the ledger writes coins»).
export let progress = freshProgress();
// SPEC-009: книга монеток — события coins с загрузки страницы (startGame её не чистит), тоже не длиннее EVENT_LOG_MAX.
// logCoins зовут только addCoins / spendCoins (у прогресса, ниже).
export const ledger = [];
function logCoins(reason, amount) {
  ledger.push({ ...logEvent("coins", { reason, amount }) });
  if (ledger.length > CFG.EVENT_LOG_MAX) ledger.splice(0, ledger.length - CFG.EVENT_LOG_MAX);
}
// прогресс изменился — клиент пишет его (hooks.save)
export const saveProgress = () => hooks.save();
// сохранение (или null — новый прогресс) → прогресс игры (loadProgress: никогда не бросает); ничего не пишет
export function setProgress(save) { progress = loadProgress(save); }
// SPEC-009: единственный код, который меняет progress.coins (тест «only the ledger writes coins» это проверяет).
// Каждое изменение — событие coins (журнал и книга), потом сохранение. Ноль не пишем.
export function addCoins(reason, amount) {
  if (tutorialGame) return 0;                               // SPEC-029: в тренировке монеток нет (и записей в книге)
  amount = Math.max(amount, -progress.coins);              // копилка не уходит в минус (минус бывает только у отдыха, и он урезан);
  // другой отрицательный amount — ошибка: покупки идут только через spendCoins
  if (!amount) return 0;
  progress.coins += amount;
  logCoins(reason, amount); saveProgress();
  return amount;
}
// покупка: хватает монеток → списать (событие buy:<item> с минусом) и true; не хватает → ничего не меняет, false
export function spendCoins(item, amount) {
  if (progress.coins < amount) return false;
  progress.coins -= amount;
  logCoins("buy:" + item, -amount); saveProgress();
  return true;
}
export const gloveOf = pi => { const g = progress.equip[pi]; return !tutorialGame && g && g !== "none" && progress.inv[g] > 0 ? g : null; };   // SPEC-029: в тренировке без рукавиц
// SPEC-029: запас поцелуев и спасалок идущей игры: в тренировке — свой (tutorialInv; настоящий не тратится), иначе — прогресс
export const gameInv = () => (tutorialGame ? tutorialInv : progress.inv);
export const saveInv = () => { if (!tutorialGame) saveProgress(); };
