// SPEC-012 AC 1: the active game — the one pointer the core works on. Every game's state lives in its own object
// (createGame in game.js); useGame(g) / withGame(g, fn) / step(g, dt) set this pointer, and every core and client read goes
// through G.<field>. A leaf module (util.js reads it for the per-game rng). Core module.

export let G = null;
// game.js's useGame / withGame only: → the game that was active before
export function setActiveGame(g) { const prev = G; G = g; return prev; }
