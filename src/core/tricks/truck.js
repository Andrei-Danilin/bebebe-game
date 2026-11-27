// SPEC-042 AC 7: City — the ice-cream truck. One truck per level drives a closed loop at speedMul × a kid's speed; it is 2 × 1 cells and
// blocks Dad's sight like a wall (fx.sight, so kids can sneak along behind it); it stops while a kid or Dad is in front of it (or in it), and goes
// on when they leave — or after maxWait s anyway. It is a picture on the street, not a wall to walk into: kids and Dad pass through it (a
// moving wall could squash a kid against a real one), so it can never hurt or trap anyone. Bots and the careful autopilot walk on its far side
// from Dad (query.js trickHideSpot). Core module.
import { CELL, CFG, COLS, ROWS } from "../config.js";
import { emit, logEvent } from "../events.js";
import { G } from "../active.js";
import { NO_HOOKS } from "./kit.js";

// ---------- the lane: a closed loop of 2×2 windows ----------
// A window (i, j) is the 2×2 free cells (i, j) … (i + 1, j + 1); its centre is the corner point (i + 1, j + 1). The truck (2 × 1) always fits into the
// 2×2 window it is the centre of, whichever way it points, and into the strip of two next windows: it drives along the corner points of a cycle of
// windows (each next one shifted by one cell). So a loop is a 2-cell-wide lane, never through a house, an apron, a wall, a tree, a bush or water.
const WC = COLS - 1, WR = ROWS - 1;
function windowsOf(occ) {
  const ok = new Uint8Array(WC * WR);
  for (let j = 0; j < WR; j++) for (let i = 0; i < WC; i++) ok[j * WC + i] = !occ[j * COLS + i] && !occ[j * COLS + i + 1] && !occ[(j + 1) * COLS + i] && !occ[(j + 1) * COLS + i + 1] ? 1 : 0;
  return ok;
}
// the nodes of the ring of windows around the rectangle (x0, y0) … (x0 + w, y0 + h), clockwise, one per cell step
function ringOf(x0, y0, w, h) {
  const out = [];
  for (let x = x0; x < x0 + w; x++) out.push([x, y0]);
  for (let y = y0; y < y0 + h; y++) out.push([x0 + w, y]);
  for (let x = x0 + w; x > x0; x--) out.push([x, y0 + h]);
  for (let y = y0 + h; y > y0; y--) out.push([x0, y]);
  return out;
}
// every ring of windows that is free and between minLoop and maxLoop long → a seeded pick (a block the truck drives around); null if none
function rectLoop(ok, rng, minLoop, maxLoop) {
  const found = [];
  const prefix = (get, n) => { const p = new Int32Array(n + 1); for (let k = 0; k < n; k++) p[k + 1] = p[k] + get(k); return p; };
  const rows = Array.from({ length: WR }, (_, y) => prefix(x => ok[y * WC + x], WC)), cols = Array.from({ length: WC }, (_, x) => prefix(y => ok[y * WC + x], WR));
  const run = (p, a, b) => p[b + 1] - p[a] === b - a + 1;   // windows a … b all free
  for (let h = 2; h < WR; h++) for (let w = 2; w < WC; w++) {
    const len = 2 * (w + h);
    if (len < minLoop || len > maxLoop) continue;
    for (let y0 = 0; y0 + h < WR; y0++) for (let x0 = 0; x0 + w < WC; x0++) {
      if (run(rows[y0], x0, x0 + w) && run(rows[y0 + h], x0, x0 + w) && run(cols[x0], y0, y0 + h) && run(cols[x0 + w], y0, y0 + h)) found.push([x0, y0, w, h]);
    }
  }
  if (!found.length) return null;
  const [x0, y0, w, h] = found[Math.floor(rng() * found.length)];
  return ringOf(x0, y0, w, h);
}
// the fallback for the irregular lanes (mazes, rooms): a seeded depth-first walk over free windows that comes back to its start after at least
// minLoop and at most maxLoop steps without visiting a window twice; a bounded number of tries
function walkLoop(ok, rng, minLoop, maxLoop) {
  const free = [];
  for (let k = 0; k < ok.length; k++) if (ok[k]) free.push(k);
  if (!free.length) return null;
  const N4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const order = () => { const o = [0, 1, 2, 3]; for (let k = 3; k > 0; k--) { const m = Math.floor(rng() * (k + 1)); [o[k], o[m]] = [o[m], o[k]]; } return o; };
  for (let tries = 0; tries < 24; tries++) {
    const start = free[Math.floor(rng() * free.length)], seen = new Uint8Array(ok.length), path = [start], pick = [order()];
    let budget = 3000;
    seen[start] = 1;
    while (path.length && budget-- > 0) {
      const u = path[path.length - 1], opts = pick[pick.length - 1];
      if (!opts.length) { seen[u] = 0; path.pop(); pick.pop(); continue; }
      const [dx, dy] = N4[opts.pop()], x = u % WC + dx, y = ((u / WC) | 0) + dy;
      if (x < 0 || y < 0 || x >= WC || y >= WR) continue;
      const v = y * WC + x;
      if (v === start && path.length >= minLoop) return path.map(k => [k % WC, (k / WC) | 0]);
      if (!ok[v] || seen[v] || path.length >= maxLoop) continue;
      seen[v] = 1; path.push(v); pick.push(order());
    }
  }
  return null;
}
// the cells the truck can be on: the windows along the loop
function laneCells(nodes) {
  const set = new Set();
  for (const [x, y] of nodes) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set.add((y + dy) * COLS + x + dx);
  return [...set].map(i => [i % COLS, (i / COLS) | 0]);
}

// ---------- where the truck is ----------
// distance s px along the loop (nodes are corner points, CELL px apart) → { x, y (px), dir (rad), horizontal }
export function truckAt(nodes, s) {
  const n = nodes.length, L = n * CELL, u = ((s % L) + L) % L, i = Math.floor(u / CELL), f = (u - i * CELL) / CELL;
  const a = nodes[i], b = nodes[(i + 1) % n];
  const x = (a[0] + 1 + (b[0] - a[0]) * f) * CELL, y = (a[1] + 1 + (b[1] - a[1]) * f) * CELL;
  return { x, y, dir: Math.atan2(b[1] - a[1], b[0] - a[0]), horizontal: b[1] === a[1] };
}
// the area the truck covers: 2 cells long along the way it points, 1 across (px rect)
const bodyOf = p => (p.horizontal ? { shape: "rect", x: p.x - CELL, y: p.y - CELL / 2, w: 2 * CELL, h: CELL } : { shape: "rect", x: p.x - CELL / 2, y: p.y - CELL, w: CELL, h: 2 * CELL });
// someone stands in the truck or in the cell in front of it (kids and Dad: the ones that could be hurt if it were solid)
function inFront(p) {
  const hx = Math.cos(p.dir), hy = Math.sin(p.dir), who = [...G.littles.filter(l => l.state !== "home"), G.big];
  return who.some(e => {
    const dx = e.x - p.x, dy = e.y - p.y, along = dx * hx + dy * hy, across = Math.abs(-dx * hy + dy * hx), pad = e.r * 0.5;
    return along >= -CELL - pad && along <= 2 * CELL + pad && across < CELL / 2 + pad;
  });
}

export const truck = Object.freeze({
  name: "truck", ...NO_HOOKS,
  // one loop of ≥ minLoop windows (a ring around a free block, else a walked loop), a seeded start and direction; none → no truck (meta.loop "none")
  place(pcx) {
    const C = CFG.TRICKS.truck, ok = windowsOf(pcx.occ);
    const nodes = rectLoop(ok, pcx.rng, C.minLoop, C.maxLoop) || walkLoop(ok, pcx.rng, C.minLoop, C.maxLoop);
    if (!nodes) return { pieces: [], meta: { loop: "none" } };
    if (pcx.rng() < 0.5) nodes.reverse();
    const start = Math.floor(pcx.rng() * nodes.length);
    return { pieces: [{ shape: "loop", cx: nodes[0][0] + 1, cy: nodes[0][1] + 1, nodes, cells: laneCells(nodes), start }], meta: { loop: nodes.length } };
  },
  // st: s — distance travelled (px), wait — s it has stood, pass — s it ignores someone in front, stopped, and where it is (x, y, dir, horizontal) for the client
  init(T) {
    T.fx.hideReach = CFG.TRICKS.truck.hideReach * CELL;
    const p = T.pieces[0];
    T.st = { s: p ? p.start * CELL : 0, wait: 0, pass: 0, stopped: false, ...(p ? truckAt(p.nodes, p.start * CELL) : { x: 0, y: 0, dir: 0, horizontal: true }) };
    if (p) T.fx.sight = [bodyOf(T.st)];
  },
  step(T, dt) {
    const p = T.pieces[0];
    if (!p) return;
    const C = CFG.TRICKS.truck, st = T.st;
    st.pass = Math.max(0, st.pass - dt);
    const hold = st.pass <= 0 && inFront(st);
    if (hold) {
      st.wait += dt;
      if (st.wait >= C.maxWait) { st.pass = C.passTime; st.wait = 0; }   // nobody moved: it goes on anyway
    } else st.wait = 0;
    if (hold !== st.stopped) { st.stopped = hold; logEvent(hold ? "truckStop" : "truckGo", {}); }
    if (!hold) st.s += CFG.PLAYER_SPEED * C.speedMul * dt;
    if (!hold && (st.tune = (st.tune ?? 0) + dt) >= C.tuneEvery) { st.tune = 0; emit("sfx", { name: "truck" }); }   // the ice-cream tune (placeholder tones), now and then while it drives
    Object.assign(st, truckAt(p.nodes, st.s));
    T.fx.sight = [bodyOf(st)];
  }
});
