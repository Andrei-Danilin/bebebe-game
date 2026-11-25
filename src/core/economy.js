// SPEC-011 AC 2b: the player's economy — the one owner of progress and the coin book. Core module.
import { CFG } from "./config.js";
import { logEvent } from "./game.js";
import { freshProgress, loadProgress } from "./progress-rules.js";

// SPEC-011 AC 2b: экономика игрока — единственный владелец progress (простые данные: миры, монетки, запас, рукавицы, наряды,
// улучшения, заставки) и книги монеток ledger. Простые данные: хранилище не трогает и не сохраняет — клиент пишет progress после
// каждого изменения, которое делает (SPEC-012 AC 5/6), и даёт сохранение при запуске (initSaves → setProgress). Менять progress.coins могут только addCoins / spendCoins (тест «only the ledger writes coins»).
export let progress = freshProgress();
// SPEC-009: книга монеток — события coins с загрузки страницы (startGame её не чистит), тоже не длиннее EVENT_LOG_MAX.
// logCoins зовут только addCoins / spendCoins (у прогресса, ниже).
export const ledger = [];
// logged — событие coins, которое игра уже записала в журнал (SPEC-012 AC 6b: звёздочка): в книгу идёт оно, второго нет
function logCoins(reason, amount, logged = null) {
  ledger.push({ ...(logged || logEvent("coins", { reason, amount })) });
  if (ledger.length > CFG.EVENT_LOG_MAX) ledger.splice(0, ledger.length - CFG.EVENT_LOG_MAX);
}
// сохранение (или null — новый прогресс) → прогресс игры (loadProgress: никогда не бросает); ничего не пишет
export function setProgress(save) { progress = loadProgress(save); }
// SPEC-009: единственный код, который меняет progress.coins (тест «only the ledger writes coins» это проверяет).
// Каждое изменение — событие coins (журнал и книга); сохраняет клиент. Ноль не пишем. logged — см. logCoins
export function addCoins(reason, amount, logged = null) {
  amount = Math.max(amount, -progress.coins);              // копилка не уходит в минус (минус бывает только у отдыха, и он урезан);
  // другой отрицательный amount — ошибка: покупки идут только через spendCoins
  if (!amount) return 0;
  progress.coins += amount;
  logCoins(reason, amount, logged);
  return amount;
}
// покупка: хватает монеток → списать (событие buy:<item> с минусом) и true; не хватает → ничего не меняет, false
export function spendCoins(item, amount) {
  if (progress.coins < amount) return false;
  progress.coins -= amount;
  logCoins("buy:" + item, -amount);
  return true;
}
