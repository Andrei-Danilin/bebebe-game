// SPEC-042 AC 5: Park — puddles. 3–5 one-cell puddles on free ground. A kid who crosses one running splashes: a SPLASH pop, water drops, the
// sound, and Dad hears him from splashMul × HEAR_RADIUS for splashTime s (a kid who stops right after is still heard: fx.loud, honoured by
// hearing.js audible). Tiptoeing through is silent. Dad stepping in one only splashes (fx, no effect). Bots and the careful autopilot tiptoe
// across puddles while Dad is within the splash's hearing (fx.quiet). Core module.
import { CELL, CFG } from "../config.js";
import { emit, logEvent } from "../events.js";
import { isRunning } from "../hearing.js";
import { G } from "../active.js";
import { NO_HOOKS } from "./kit.js";

const SPLASH_COLOR = "#4cc9f0";
const LOOKAHEAD = 0.8;    // cells before a puddle's edge where a bot starts tiptoeing (fx.quiet)
function drops(x, y, n) { emit("burst", { kind: "splash", x, y, n, color: SPLASH_COLOR }); emit("sfx", { name: "splash" }); }

export const puddles = Object.freeze({
  name: "puddles", ...NO_HOOKS,
  // 3–5 puddles of radius r cells, each on a free cell with pad cells of free ground around it
  place(pcx) {
    const C = CFG.TRICKS.puddles, n = pcx.ri(C.count[0], C.count[1]), out = [];
    for (let i = 0; i < n; i++) {
      const s = pcx.spot(1, 1, C.pad);
      if (!s) break;
      pcx.take(s.x, s.y, 1, 1);
      out.push({ shape: "circle", cx: s.x + 0.5, cy: s.y + 0.5, r: C.r });
    }
    return out;
  },
  validate: T => (T.pieces.length < CFG.TRICKS.puddles.count[0] ? ["trick:puddles:count"] : []),
  // st.wet[kidId] — this crossing already splashed; st.loud[kidId] — s of splash left; st.bigWet — Dad is standing in one
  init(T) {
    const C = CFG.TRICKS.puddles;
    T.st = { wet: {}, loud: {}, bigWet: false };
    T.fx.quiet = T.pieces.map(p => ({ shape: "circle", x: p.cx * CELL, y: p.cy * CELL, r: (p.r + LOOKAHEAD) * CELL }));
    T.fx.quietRange = C.splashMul * CFG.HEAR_RADIUS * CELL;
  },
  step(T, dt) {
    const C = CFG.TRICKS.puddles, st = T.st, fx = T.fx;
    for (const id of Object.keys(st.loud)) {                       // the splash fades
      if ((st.loud[id] -= dt) <= 0) { delete st.loud[id]; delete fx.loud[id]; }
    }
    const inside = (e, extra) => T.pieces.findIndex(p => Math.hypot(e.x - p.cx * CELL, e.y - p.cy * CELL) < p.r * CELL + extra);
    for (const l of G.littles) {
      if (inside(l, l.r / 2) < 0) { delete st.wet[l.id]; continue; }
      if (st.wet[l.id] || !isRunning(l)) continue;                 // tiptoeing through is silent; one splash a crossing
      st.wet[l.id] = true;
      st.loud[l.id] = C.splashTime; fx.loud[l.id] = C.splashMul;
      logEvent("splash", { who: l.id, kind: l.kind });
      emit("pop", { key: "splash", args: [], x: l.x, y: l.y - 40, color: SPLASH_COLOR });
      drops(l.x, l.y, 10);
    }
    const bigIn = G.big.moving && inside(G.big, 0) >= 0;           // Dad: only a splash for the eyes
    if (bigIn && !st.bigWet) drops(G.big.x, G.big.y, 8);
    st.bigWet = bigIn;
  }
});
