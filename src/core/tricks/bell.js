// SPEC-042 AC 8: School — the bell ("Freeze!"). Every `every` s the bell rings for `ring` s after a `warn` s warning. During the ring Dad stops and
// looks all around (one full turn in the ring's time) and any kid who moves faster than a tiptoe within his sight is spotted: after the ring he goes
// after the last spotted one (chase → lastSeen). Kids who stand still or tiptoe are not. How it meets Dad's other states: bigStep runs only once he
// can act (not stunned, slipping, red or standing after a push — those win), never in the practice games, never while he walks home kind (the game
// does not step tricks then), and not while he is chasing someone he already sees (the ring does not stop a chase). The bots and the careful
// autopilot freeze in his sight or near him (fx.freeze: 1 warning → tiptoe, 2 ring → stand). Core module.
import { CFG, TAU } from "../config.js";
import { emit, logEvent } from "../events.js";
import { canSee } from "../vision.js";
import { G } from "../active.js";
import { NO_HOOKS } from "./kit.js";

// where the bell's cycle is at trick time t: { phase: "idle" | "warn" | "ring", left: s to the end of the phase }. The ring is the last `ring` s
// of each `every` s, the warning the `warn` s before it (so the first ring comes at every − ring, not at once)
export function bellPhase(t) {
  const C = CFG.TRICKS.bell, u = ((t % C.every) + C.every) % C.every;
  if (u >= C.every - C.ring) return { phase: "ring", left: C.every - u };
  if (u >= C.every - C.ring - C.warn) return { phase: "warn", left: C.every - C.ring - u };
  return { phase: "idle", left: C.every - C.ring - C.warn - u };
}
// a kid who runs: on his feet, moving, faster than a tiptoe
const runs = l => l.state === "ok" && l.moving && l.speedFrac >= CFG.TIPTOE_MAX;
// Dad would see l from where he stands if he faced him (the sweep covers every way): the same rules as canSee (house, cloak, bush, walls, range)
function inSight(l) {
  const b = G.big, d0 = b.dir;
  b.dir = Math.atan2(l.y - b.y, l.x - b.x);
  try { return canSee(l); } finally { b.dir = d0; }
}

export const bell = Object.freeze({
  name: "bell", ...NO_HOOKS,
  // st: ph — the phase now, rings — rings so far, held — Dad stood for this ring, spotted — { kidId: true }, last — where the last one was seen, pending — { x, y, t }: he is to chase there once he can act
  init(T) { T.st = { ph: "idle", rings: 0, held: false, spotted: {}, last: null, pending: null }; },
  step(T) {
    const st = T.st, fx = T.fx, now = bellPhase(T.t).phase;
    fx.mark = "";
    fx.freeze = now === "warn" ? 1 : now === "ring" ? 2 : 0;
    if (now === st.ph) return;
    const was = st.ph;
    st.ph = now;
    if (now === "ring") {                                              // the bell rings
      logEvent("bell", { n: st.rings + 1 });
      emit("sfx", { name: "bell" });
      if (st.rings === 0) emit("hint", { kind: "freeze" });           // the "Freeze!" banner, the first ring of a level
      st.rings++; st.held = false; st.spotted = {}; st.last = null;
    } else if (now === "warn") logEvent("bellWarn", { n: st.rings + 1 });
    if (was === "ring") {                                              // over: he goes after the one he saw run
      const spot = Object.keys(st.spotted).length > 0;
      logEvent("bellEnd", { held: st.held, spotted: Object.keys(st.spotted).length });
      if (st.held && spot && st.last) st.pending = { x: st.last.x, y: st.last.y, t: T.t };   // he goes after him as soon as he can act (bigStep): a stun, a slip, red or a push-stand come first
    }
  },
  // Dad can act: during the ring he stands and turns once round (state look, so the stall guard treats it as a look), spotting runners
  bigStep(T, dt) {
    const st = T.st, b = G.big, C = CFG.TRICKS.bell;
    if (st.pending) {                                                  // the ring is over and he spotted a runner: after it, through his own gates, he chases
      if (T.t - st.pending.t > C.chaseKeep) st.pending = null;
      else if (st.ph !== "ring") {
        if (b.state !== "chase") {                                    // (already chasing someone he sees: nothing to add)
          b.state = "chase"; b.lastSeen = { x: st.pending.x, y: st.pending.y }; b.path = []; b.goal = null; b.timer = 0;
          b.dir = Math.atan2(st.pending.y - b.y, st.pending.x - b.x);
        }
        st.pending = null;
        return false;
      }
    }
    if (st.ph !== "ring" || b.state === "chase") return false;
    st.held = true;
    b.moving = false; b.state = "look"; b.timer = CFG.TRICKS.bell.afterLook; b.goal = null; b.path = [];
    b.hearTurnT = 0; b.hearLook = 0; b.noise = 0;
    b.dir += TAU / CFG.TRICKS.bell.ring * dt * b.lookSign;
    T.fx.mark = "🔔";
    if (b.noPush > 0) return true;                                     // resting after a push he catches nobody (but he still stands and looks round)
    for (const l of G.littles) {
      if (!runs(l) || l.invuln > 0 || l.dizzy > 0 || !inSight(l)) continue;
      st.last = { x: l.x, y: l.y };
      if (!st.spotted[l.id]) {
        st.spotted[l.id] = true;
        logEvent("bellSpot", { who: l.id, kind: l.kind });
        if (Object.keys(st.spotted).length === 1) { emit("pop", { key: null, args: ["!"], x: b.x, y: b.y - 75, color: "#ff3b30" }); emit("sfx", { name: "alert" }); }
      }
    }
    return true;
  }
});
