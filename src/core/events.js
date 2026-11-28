// SPEC-039 (from game.js): the active game's effect queue and event log — emit (an effect for the client), logEvent / logEcon (the
// gameplay log) and the practice's hint flags the log feeds. A leaf over the config and the active game, so every rule module can
// use it without importing the game (game.js imports the rules, not the other way round). Core module.
import { CFG } from "./config.js";
import { G } from "./active.js";

/** @import { GameEvent } from "./game.js" */

// SPEC-040 AC 10 (RR-51): the gameplay log is a fixed-size ring (CFG.EVENT_LOG_MAX events) over plain data — g.events, an array, and g.eventsHead,
// the index of the oldest event once the log is full (a game stays plain data: structuredClone keeps the ring whole). Every reader (filter,
// find, some, map, length, for … of) works as before, in time order, while the log has not wrapped; pushEvent overwrites the oldest event once
// it is full instead of splicing the whole log down at every event. After a wrap the array is not in time order: orderedEvents(g) is (the
// __bb.events getter and the balance report read that); counting readers (perSlotCounts) do not care. The cap is read at each push (tests change it).
/** @param {{ events: GameEvent[], eventsHead: number }} g @param {GameEvent} e */
export function pushEvent(g, e) {
  const max = CFG.EVENT_LOG_MAX, ev = g.events;
  if (ev.length > max) { const keep = orderedEvents(g).slice(ev.length - max + 1); ev.length = 0; g.eventsHead = 0; ev.push(...keep); }   // the cap was lowered
  else if (g.eventsHead && ev.length < max) { const all = orderedEvents(g); ev.length = 0; g.eventsHead = 0; ev.push(...all); }   // the cap was raised again: back in time order
  if (ev.length < max) { ev.push(e); return; }
  ev[g.eventsHead] = e;
  g.eventsHead = (g.eventsHead + 1) % max;
}
/** the events oldest first (a copy) @param {{ events: GameEvent[], eventsHead: number }} [g] */
export function orderedEvents(g = G) { return g.eventsHead === 0 ? g.events.slice() : [...g.events.slice(g.eventsHead), ...g.events.slice(0, g.eventsHead)]; }
/** @param {{ events: GameEvent[], eventsHead: number }} [g] */
export function clearEvents(g = G) { g.events.length = 0; g.eventsHead = 0; }
// SPEC-012 AC 5: an effect for the client (it plays it as today): sfx { name, delay?, other? } (SPEC-047: a sound of assets/audio or an old beep;
// delay s — comes later (the fall after a push); other: true — a bot's sound, quieter), burst { kind, x, y, n, color }, pop { key, args, x,
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
  pushEvent(G, e);                                           // SPEC-040 AC 10: a ring — nothing is moved when the log is full
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
