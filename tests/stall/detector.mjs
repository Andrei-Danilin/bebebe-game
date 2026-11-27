// SPEC-037 AC 1: the stall detector — a test helper (never part of the site). Watches the Big One over a run and flags him
// when, for more than CFG.BALANCE.STALL.TIME s of game time, he stays inside CFG.BALANCE.STALL.MOVE_CELLS cells of where the
// window began while he is in patrol or search and is not stunned, red, slipped, looking after a hearing, resting after a push,
// kind or in a scripted tutorial pause. Pure: it reads the game and keeps its own anchor.
import { CELL, CFG } from "../../src/core/index.js";

// a state in which standing still is allowed (or not Dad's walking at all)
export function stallExempt(g) {
  const b = g.big;
  return !(b.state === "patrol" || b.state === "search") || b.stun > 0 || b.blush > 0 || b.slip > 0 || b.pushCd > 0 || !!b.kind ||
    b.hearTurnT > 0 || b.hearLook > 0 || (g.tutorialGame === 1 && g.tut.script) || g.phase === "won";
}
export function stallDetector() {
  const S = CFG.BALANCE.STALL, stalls = [];
  let anchor = null;
  return {
    stalls,
    // call after every step of the game
    observe(g) {
      const b = g.big, t = g.stats.time;
      if (stallExempt(g)) { anchor = null; return; }
      if (!anchor || Math.hypot(b.x - anchor.x, b.y - anchor.y) >= S.MOVE_CELLS * CELL) { anchor = { x: b.x, y: b.y, t, state: b.state }; return; }
      if (t - anchor.t > S.TIME) {
        stalls.push({ time: +t.toFixed(2), from: +anchor.t.toFixed(2), state: b.state, x: Math.round(b.x), y: Math.round(b.y), goal: b.goal ? { x: Math.round(b.goal.x), y: Math.round(b.goal.y) } : null, lastSeen: b.lastSeen ? { x: Math.round(b.lastSeen.x), y: Math.round(b.lastSeen.y) } : null });
        anchor = null;                                   // one report per stand; a new window starts
      }
    }
  };
}
