// SPEC-039 (from game.js): the active game's effect queue and event log — emit (an effect for the client), logEvent / logEcon (the
// gameplay log) and the practice's hint flags the log feeds. A leaf over the config and the active game, so every rule module can
// use it without importing the game (game.js imports the rules, not the other way round). Core module.
import { CFG } from "./config.js";
import { G } from "./active.js";

/** @import { GameEvent } from "./game.js" */

// SPEC-012 AC 5: an effect for the client (it plays it as today): sfx { name }, burst { kind, x, y, n, color }, pop { key, args, x,
// y, color, meaning } (an I18N key and its arguments — key null: args[0] is the text itself, a number or a sign), shake { t },
// wave { x, y, r } (a wide push ring), hint { kind: "kit" | "kitOff" | "heard" | "practice", slot, step }, mood { level }
/** @param {string} type @param {object} [data] */
export function emit(type, data) { if (G.fx) G.fx.push({ type, ...data }); }
// SPEC-012 AC 6 / 6b / 10: the events the client acts on — coins (a star), spent (a kiss, a kit, a glove charge), result (a level
// won), practiceWin: logged in the gameplay log like any event, and handed to the client in the effect queue ({ type: "game", e })
// so it applies each exactly once (the economy, the win screen, the next tutorial step)
/** @param {string} type @param {object} [data] @returns {GameEvent} */
export function logEcon(type, data) { const e = logEvent(type, data); if (G.fx) G.fx.push({ type: "game", e }); return e; }
/** @param {string} type @param {object} [data] @returns {GameEvent} */
export function logEvent(type, data) {
  const e = { t: G.stats.time, type, ...data };
  G.events.push(e);
  if (G.events.length > CFG.EVENT_LOG_MAX) G.events.splice(0, G.events.length - CFG.EVENT_LOG_MAX);
  if (G.tutorialGame === 2) tutorialNote(e);                 // SPEC-029: подсказки тренировки 2
  return e;
}
// событие игры в тренировке 2 → флаг сделанного для подсказок: предмет взял игрок, папа поскользнулся, спасалка игрока
export function tutorialNote(e) {
  const p = G.littles[0];
  if (e.type === "item" && e.who === p.id) G.tut.did[1] = true;
  else if (e.type === "slip") G.tut.did[2] = true;
  else if (e.type === "kit" && e.who === p.id) G.tut.did[4] = true;
}
