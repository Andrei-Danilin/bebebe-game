// SPEC-037 AC 1: the stall detector — a test helper (never part of the site). Watches the Big One over a run and flags him
// - "short": for more than CFG.BALANCE.STALL.TIME s of game time he stays inside CFG.BALANCE.STALL.MOVE_CELLS cells of where the
//   window began while he is in patrol or search and is not stunned, red, slipped, looking after a hearing, resting after a push,
//   kind or in a scripted tutorial pause;
// - "long": for more than STALL.LONG_TIME s he stays inside the same radius in patrol, search and look together (the look → 1-frame
//   patrol → look loop of a boxed-in Dad), not stunned, red, slipped, kind or in the tutorial script.
// Pure: it reads the game and keeps its own anchors.
import { CELL, CFG } from "../../src/core/index.js";

// a state in which standing still is allowed (or not Dad's walking at all)
export function stallExempt(g) {
  const b = g.big;
  return !(b.state === "patrol" || b.state === "search") || b.stun > 0 || b.blush > 0 || b.slip > 0 || b.pushCd > 0 || !!b.kind ||
    b.hearTurnT > 0 || b.hearLook > 0 || (g.tutorialGame === 1 && g.tut.script) || g.phase === "won";
}
// the long check's own exemptions: only the states where he cannot walk at all (and the stands that end by themselves)
export function longExempt(g) {
  const b = g.big;
  return !(b.state === "patrol" || b.state === "search" || b.state === "look") || b.stun > 0 || b.blush > 0 || b.slip > 0 || !!b.kind ||
    (g.tutorialGame === 1 && g.tut.script) || g.phase === "won";
}
export function stallDetector() {
  const S = CFG.BALANCE.STALL, stalls = [];
  let anchor = null, long = null;
  const report = (b, t, from, kind) => stalls.push({
    kind, time: +t.toFixed(2), from: +from.toFixed(2), state: b.state, x: Math.round(b.x), y: Math.round(b.y),
    goal: b.goal ? { x: Math.round(b.goal.x), y: Math.round(b.goal.y) } : null, lastSeen: b.lastSeen ? { x: Math.round(b.lastSeen.x), y: Math.round(b.lastSeen.y) } : null
  });
  // one window: restarts when he is exempt or moved far enough; true when it has lasted longer than `limit`
  const window = (a, exempt, b, t, limit) => {
    if (exempt) return [null, false];
    if (!a || Math.hypot(b.x - a.x, b.y - a.y) >= S.MOVE_CELLS * CELL) return [{ x: b.x, y: b.y, t }, false];
    return t - a.t > limit ? [null, a] : [a, false];
  };
  return {
    stalls,
    // call after every step of the game
    observe(g) {
      const b = g.big, t = g.stats.time;
      let hit;
      [anchor, hit] = window(anchor, stallExempt(g), b, t, S.TIME);
      if (hit) report(b, t, hit.t, "short");
      [long, hit] = window(long, longExempt(g), b, t, S.LONG_TIME);
      if (hit) report(b, t, hit.t, "long");
    }
  };
}
