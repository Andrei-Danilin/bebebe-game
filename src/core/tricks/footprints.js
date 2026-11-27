// SPEC-042 AC 10: Winter — footprints. A kid who runs leaves a print in the snow every `every` s; it fades over `life` s (at most `max` prints are
// kept, the oldest go first). Tiptoeing leaves none, and nothing is left or followed in the kids' house. Dad in patrol or search who sees a print
// in his cone goes to the freshest print of that kid's trail (lastSeen + search; bigStep returns false, the normal search does the walking); a
// trail whose freshest print he stands at or has been to is nothing new. The whole map is snow: bots and the careful autopilot tiptoe when Dad is within
// quietRange cells and is not already chasing (fx.quiet). Core module.
import { CELL, CFG, H, W } from "../config.js";
import { emit } from "../events.js";
import { isRunning } from "../hearing.js";
import { inCone } from "../vision.js";
import { inSafe, los, seeSolidAt } from "../world.js";
import { G } from "../active.js";
import { NO_HOOKS } from "./kit.js";

// the print's age (s) and how much of it is left (1 → 0)
export const printAge = (T, p) => T.t - p.t;
export const printLeft = (T, p) => Math.max(0, 1 - printAge(T, p) / CFG.TRICKS.footprints.life);

export const footprints = Object.freeze({
  name: "footprints", ...NO_HOOKS,
  // st: prints — [{ x, y, t (trick time), id (kid), dir, side (−1 left / 1 right) }], oldest first; tick — { kidId: s of running since his last print };
  // n — prints made so far; followed — { kidId: t of the freshest print Dad has gone to } (he goes only to a newer one)
  init(T) {
    T.st = { prints: [], tick: {}, n: 0, followed: {} };
    T.fx.quiet = [{ shape: "rect", x: 0, y: 0, w: W, h: H }];
    T.fx.quietRange = CFG.TRICKS.footprints.quietRange * CELL;
  },
  step(T, dt) {
    const C = CFG.TRICKS.footprints, st = T.st;
    while (st.prints.length && printAge(T, st.prints[0]) >= C.life) st.prints.shift();
    for (const l of G.littles) {
      if (!isRunning(l) || inSafe(l)) { st.tick[l.id] = C.every; continue; }   // not running (or at home): the next run leaves a print at once
      st.tick[l.id] = (st.tick[l.id] ?? C.every) + dt;
      if (st.tick[l.id] < C.every) continue;
      st.tick[l.id] -= C.every;
      st.prints.push({ x: l.x, y: l.y, t: T.t, id: l.id, dir: l.dir, side: st.n++ % 2 ? 1 : -1 });
      if (st.prints.length > C.max) st.prints.shift();
      if (l.kind === "player") emit("sfx", { name: "crunch" });
    }
  },
  bigStep(T) {
    const b = G.big, st = T.st, C = CFG.TRICKS.footprints;
    if (b.state !== "patrol" && b.state !== "search") return false;
    let near = null, nd = Infinity;                                    // the nearest print he sees
    for (const p of st.prints) {
      if (printAge(T, p) >= C.life || !inCone(p.x, p.y) || !los(b.x, b.y, p.x, p.y, seeSolidAt)) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < nd) { nd = d; near = p; }
    }
    if (!near) return false;
    let fresh = near;                                                  // the freshest of that kid's trail
    for (const p of st.prints) if (p.id === near.id && p.t > fresh.t) fresh = p;
    if (Math.hypot(fresh.x - b.x, fresh.y - b.y) < C.arrive * CELL || fresh.t <= (st.followed[near.id] ?? -1)) return false;   // he is at the end of it, or has been there
    st.followed[near.id] = fresh.t;
    b.state = "search"; b.lastSeen = { x: fresh.x, y: fresh.y }; b.path = []; b.repath = 0;
    return false;
  }
});
