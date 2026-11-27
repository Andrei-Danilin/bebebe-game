// SPEC-042 AC 6: Field — sprinklers. 2–3 per level, each on a `cycle` s cycle: off, `warn` s of drip, `spray` s of spray (radius r cells). Their
// phases are offset (seeded) so they never spray together. During the spray Dad never enters it (fx.noDad: his A* and his line keep out; one
// that starts under him makes him step out) and a kid inside is hidden from his eyes like in a bush (fx.hide). Bots and the careful autopilot
// hide in an active spray (query.js trickHideSpot). Core module.
import { CELL, CFG, COLS, ROWS } from "../config.js";
import { emit, logEvent } from "../events.js";
import { bigSpeeds } from "../difficulty.js";
import { steerTo } from "../path.js";
import { turnToward } from "../util.js";
import { trickDadSolid } from "./query.js";
import { G } from "../active.js";
import { cellsOf, NO_HOOKS } from "./kit.js";

// where in its cycle a sprinkler p is at trick time t: "off" | "drip" | "spray" (the client draws the same)
export function sprinklerPhase(p, t) {
  const C = CFG.TRICKS.sprinklers, u = (((t + p.off) % C.cycle) + C.cycle) % C.cycle;
  if (u >= C.cycle - C.spray) return "spray";
  return u >= C.cycle - C.spray - C.warn ? "drip" : "off";
}
export const sprinklers = Object.freeze({
  name: "sprinklers", ...NO_HOOKS, blocksDad: true,           // all the sprays at once may not close the path between the doors
  // 2–3 sprinklers at least 2r + 1 cells apart, none touching a house or a door apron; cycle offsets spread over the cycle from a seeded start
  place(pcx) {
    const C = CFG.TRICKS.sprinklers, want = pcx.ri(C.count[0], C.count[1]), base = pcx.rng() * C.cycle, out = [], n = want + C.spare;
    for (let i = 0; i < n; i++) {
      const s = pcx.spot(1, 1, C.pad, (x, y) => {
        const p = { shape: "circle", cx: x + 0.5, cy: y + 0.5, r: C.r };
        return !pcx.bad(p) && out.every(o => Math.hypot(o.cx - p.cx, o.cy - p.cy) >= 2 * C.r + 1);
      });
      if (!s) break;
      pcx.take(s.x, s.y, 1, 1);
      out.push({ shape: "circle", cx: s.x + 0.5, cy: s.y + 0.5, r: C.r });
    }
    return { pieces: out, meta: { want, base: Math.round(base * 10) / 10 } };   // fitTrick keeps the first `want` that leave the way between the doors; fit() then spreads their phases
  },
  // the kept sprinklers' phases are spread evenly over the cycle from the seeded start: never two sprays at once (cycle / n ≥ spray for n ≤ 4)
  fit(t) { t.pieces.forEach((p, i) => { p.off = Math.round((t.meta.base + i * CFG.TRICKS.sprinklers.cycle / t.pieces.length) % CFG.TRICKS.sprinklers.cycle * 10) / 10; }); },
  // st.ph[i] — the phase of sprinkler i; the hide areas and Dad's mask follow the active sprays (apply)
  init(T) { T.st = { ph: T.pieces.map(() => "off") }; T.fx.hideReach = CFG.TRICKS.sprinklers.hideReach * CELL; apply(T); },
  // Dad is standing in a spray that started under him (looking, hearing, pushing, thinking): he spends his steps walking straight out of it, before anything else
  bigStep(T, dt) {
    const b = G.big;
    if (!T.fx.noDad || !trickDadSolid(b.x, b.y)) return false;
    let c = null, cd = Infinity;
    for (const p of T.pieces) if (T.st.ph[T.pieces.indexOf(p)] === "spray") { const d = Math.hypot(b.x - p.cx * CELL, b.y - p.cy * CELL); if (d < cd) { cd = d; c = p; } }
    if (!c) return false;
    const a = cd > 1 ? Math.atan2(b.y - c.cy * CELL, b.x - c.cx * CELL) : 0, out = (c.r + CFG.TRICKS.sprinklers.exitPad) * CELL;
    b.moving = steerTo(b, c.cx * CELL + Math.cos(a) * out, c.cy * CELL + Math.sin(a) * out, bigSpeeds().patrol, dt, false);
    if (b.moving) b.dir = turnToward(b.dir, b.moveDir, CFG.TRICKS.sprinklers.exitTurn * dt);
    return true;
  },
  step(T) {
    let changed = false;
    T.pieces.forEach((p, i) => {
      const ph = sprinklerPhase(p, T.t);
      if (ph === T.st.ph[i]) return;
      T.st.ph[i] = ph; changed = true;
      logEvent("sprinkler", { i, phase: ph });
      if (ph === "spray") emit("sfx", { name: "sprinkler" });   // placeholder tones; the real sound comes with the audio spec
    });
    if (changed) apply(T);
  }
});
// the active sprays → fx.hide (px circles) and fx.noDad (the cells they cover); Dad re-plans at once when one starts near him
function apply(T) {
  const act = T.pieces.filter((p, i) => T.st.ph[i] === "spray");
  T.fx.hide = act.map(p => ({ shape: "circle", x: p.cx * CELL, y: p.cy * CELL, r: p.r * CELL }));
  if (!act.length) { T.fx.noDad = null; return; }
  const m = new Uint8Array(COLS * ROWS);
  for (const p of act) for (const i of cellsOf(p)) m[i] = 1;
  T.fx.noDad = m;
  if (G.big && act.some(p => Math.hypot(G.big.x - p.cx * CELL, G.big.y - p.cy * CELL) < (p.r + CFG.TRICKS.sprinklers.repathR) * CELL)) { G.big.path = []; G.big.repath = 0; }
}
