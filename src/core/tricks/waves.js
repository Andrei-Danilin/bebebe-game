// SPEC-042 AC 9: Beach — waves. The Beach has no sea inside the fence, so the trick places its own shore band: strips `depth` cells deep along one
// map edge (the bottom one, nearest the sea outside the fence; else the edge with the most free ground), on cells that are free and clear of the houses
// and their door aprons. Every `every` s a wave rolls up over the band for `time` s: kids in it move at slowMul of their speed (fx.slow), Dad does not
// enter it (fx.noDad; one caught inside walks straight out at his usual pace, like from a spray), and the bots and the autopilot route around it
// (fx.kidCost). fitTrick drops a strip that would shut the way between the houses' doors. Core module.
import { CELL, CFG, COLS, ROWS } from "../config.js";
import { bigSpeeds } from "../difficulty.js";
import { logEvent, emit } from "../events.js";
import { steerTo } from "../path.js";
import { turnToward } from "../util.js";
import { G } from "../active.js";
import { cellsOf, NO_HOOKS } from "./kit.js";
import { trickDadSolid } from "./query.js";

// where the wave is at trick time t for a band with phase offset off: { up, k } — k 0 → 1 while it rolls up (`rise` s), 1 while it holds, 1 → 0 as it
// runs back (`rise` s); up is true for the whole `time` s (the game's rule), k is the picture's
export function wavePhase(t, off = 0) {
  const C = CFG.TRICKS.waves, u = (((t + off) % C.every) + C.every) % C.every, from = C.every - C.time;
  if (u < from) return { up: false, k: 0 };
  const e = Math.min((u - from) / C.rise, (C.every - u) / C.rise, 1), s = Math.max(0, e);
  return { up: true, k: s * s * (3 - 2 * s) };
}
// a strip on an edge: which edge, where it starts along it (cells) and how long → its rect in cells
const EDGES = ["bottom", "top", "left", "right"];
function rectOf(edge, a, len, depth) {
  if (edge === "bottom") return { x: a, y: ROWS - depth, w: len, h: depth };
  if (edge === "top") return { x: a, y: 0, w: len, h: depth };
  if (edge === "left") return { x: 0, y: a, w: depth, h: len };
  return { x: COLS - depth, y: a, w: depth, h: len };
}
// the runs of columns / rows along `edge` whose `depth` cells deep are all free: [[start, length], …]
function runsOf(occ, edge, depth) {
  const horizontal = edge === "bottom" || edge === "top", n = horizontal ? COLS : ROWS, out = [];
  let from = -1;
  for (let a = 0; a <= n; a++) {
    let free = a < n;
    if (free) { const r = rectOf(edge, a, 1, depth); for (let y = r.y; y < r.y + r.h && free; y++) for (let x = r.x; x < r.x + r.w; x++) if (occ[y * COLS + x]) { free = false; break; } }
    if (free && from < 0) from = a;
    if (!free && from >= 0) { if (a - from >= CFG.TRICKS.waves.minRun) out.push([from, a - from]); from = -1; }
  }
  return out;
}
const total = runs => runs.reduce((s, r) => s + r[1], 0);

export const waves = Object.freeze({
  name: "waves", ...NO_HOOKS, blocksDad: true,
  // the bottom edge when it has at least minTotal cells of strips, else the edge with the most; a seeded phase for the level's cycle
  place(pcx) {
    const C = CFG.TRICKS.waves, per = EDGES.map(e => ({ e, runs: runsOf(pcx.occ, e, C.depth) }));
    const base = per[0].runs, pick = total(base) >= C.minTotal ? per[0] : per.reduce((a, b) => (total(b.runs) > total(a.runs) ? b : a));
    const off = Math.round(pcx.rng() * C.every * 10) / 10;
    const pieces = pick.runs.map(([a, len]) => ({ shape: "rect", ...rectOf(pick.e, a, len, C.depth), edge: pick.e, a, len, off }));
    return { pieces, meta: { want: pieces.length, edge: pieces.length ? pick.e : "none", cells: total(pick.runs), off } };
  },
  // st: up — the wave is up; the areas and Dad's mask follow it (apply)
  init(T) {
    const C = CFG.TRICKS.waves;
    T.st = { up: false, k: 0 };
    T.fx.slowMul = C.slowMul; T.fx.kidCost = C.kidCost;
    apply(T);
  },
  // Dad is in the band when it comes up (or was pushed in): he walks out across its inner edge, before anything else
  bigStep(T, dt) {
    const b = G.big, C = CFG.TRICKS.waves;
    if (!T.st.up || !trickDadSolid(b.x, b.y)) return false;
    const p = T.pieces.find(q => b.x >= q.x * CELL && b.x < (q.x + q.w) * CELL && b.y >= q.y * CELL && b.y < (q.y + q.h) * CELL);
    if (!p) return false;
    const pad = C.exitPad * CELL, d = C.depth * CELL;
    const tx = p.edge === "left" ? d + pad : p.edge === "right" ? (COLS - C.depth) * CELL - pad : b.x;
    const ty = p.edge === "top" ? d + pad : p.edge === "bottom" ? (ROWS - C.depth) * CELL - pad : b.y;
    b.moving = steerTo(b, tx, ty, bigSpeeds().patrol, dt, false);
    if (b.moving) b.dir = turnToward(b.dir, b.moveDir, 5 * dt);
    return true;
  },
  step(T) {
    const off = T.meta.off ?? 0, { up, k } = wavePhase(T.t, off);
    T.st.k = k;
    if (up === T.st.up) return;
    T.st.up = up;
    logEvent("wave", { phase: up ? "up" : "down" });
    if (up) emit("sfx", { name: "wave" });
    apply(T);
  }
});
// the band while the wave is up → fx.slow (px rects) and fx.noDad (its cells); Dad re-plans at once when it comes up near him
function apply(T) {
  if (!T.st.up || !T.pieces.length) { T.fx.slow = []; T.fx.noDad = null; return; }
  T.fx.slow = T.pieces.map(p => ({ shape: "rect", x: p.x * CELL, y: p.y * CELL, w: p.w * CELL, h: p.h * CELL }));
  const m = new Uint8Array(COLS * ROWS);
  for (const p of T.pieces) for (const i of cellsOf(p)) m[i] = 1;
  T.fx.noDad = m;
  if (G.big && T.pieces.some(p => G.big.x > (p.x - 3) * CELL && G.big.x < (p.x + p.w + 3) * CELL && G.big.y > (p.y - 3) * CELL && G.big.y < (p.y + p.h + 3) * CELL)) { G.big.path = []; G.big.repath = 0; }
}
