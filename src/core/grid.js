// SPEC-039 (from path.js): the level's grids as the Big One and the Little Ones read them — the cell of a point, A*, the cells the Big
// One can reach, the nearest free cell and exit, the walls a lying friend makes for him. Reads the active game's grids (G.blocked,
// G.blockedBig); no movement and no seeing here (path.js moves along the paths, vision.js is what is seen). Core module.
import { CELL, CFG, COLS, H, ROWS, W } from "./config.js";
import { clamp, dist, rng } from "./util.js";
import { moveSolidAt, moveSolidBigAt, inDangerXY } from "./world.js";
import { trickDadCells } from "./tricks/query.js";
import { G } from "./active.js";

// ---------- SPEC-040 AC 10 (RR-51): scratch buffers ----------
// The searches below used to make four typed arrays a call (A*) and one a BFS; the buffers are now the game's own, made on first use (the game's
// first search, so a run allocates none after its first step) and reused: zeroed at the start of each search. They live on the game (G.scratch),
// not in the module: games side by side (SPEC-012 instances) never share them. seen: the BFS marks of nearestFree and freeCellNear (never nested);
// gs / fs / came / closed: A*; grid: bigGrid's copy; reach: the two marks bigReach hands out in turn — learnBlocked reads two results side by side,
// so a result stays good until the call after the next.
function scratchOf() {
  if (G.scratch) return G.scratch;
  const N = COLS * ROWS;
  return (G.scratch = { seen: new Uint8Array(N), gs: new Float32Array(N), fs: new Float32Array(N), came: new Int32Array(N), closed: new Uint8Array(N),
    grid: new Uint8Array(N), reach: [new Uint8Array(N), new Uint8Array(N)], flip: 0 });
}
export function prepareScratch() { return scratchOf(); }   // createGame makes them with the game: no typed array is made while it runs
// ---------- Поиск пути (A*) ----------
export function cellIdx(x, y) { return clamp(Math.floor(y / CELL), 0, ROWS - 1) * COLS + clamp(Math.floor(x / CELL), 0, COLS - 1); }
function nearestFree(idx, grid = G.blocked) {
  if (!grid[idx]) return idx;
  const seen = scratchOf().seen.fill(0), q = [idx];
  seen[idx] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (!grid[i]) return i;
    const cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return idx;
}
const DIRS = Object.freeze([[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]);
export function findPath(sx, sy, gx, gy, extraCost, grid = G.blocked) {   // grid ≠ G.blocked — сетка Большого (G.blockedBig или она + выученные клетки, SPEC-037)
  const s = nearestFree(cellIdx(sx, sy), grid), g = nearestFree(cellIdx(gx, gy), grid);
  const sc = scratchOf(), gs = sc.gs.fill(Infinity), fs = sc.fs.fill(Infinity), came = sc.came.fill(-1), closed = sc.closed.fill(0);
  const gcx = g % COLS, gcy = (g / COLS) | 0;
  const h = i => { const dx = Math.abs(i % COLS - gcx), dy = Math.abs(((i / COLS) | 0) - gcy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const open = [s];
  gs[s] = 0; fs[s] = h(s);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fs[open[k]] < fs[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (closed[cur]) continue;
    if (cur === g) break;
    closed[cur] = 1;
    const cx = cur % COLS, cy = (cur / COLS) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (grid[j] || closed[j]) continue;
      if (dx && dy && (grid[cy * COLS + nx] || grid[ny * COLS + cx])) continue;
      const ng = gs[cur] + c + (extraCost ? extraCost((nx + 0.5) * CELL, (ny + 0.5) * CELL) : 0);
      if (ng < gs[j]) { gs[j] = ng; came[j] = cur; fs[j] = ng + h(j); open.push(j); }
    }
  }
  if (g !== s && came[g] === -1) return [];
  const pts = [];
  let c = g;
  while (c !== s && c !== -1) { pts.push({ x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL }); c = came[c]; }
  pts.reverse();
  if (pts.length && !(grid !== G.blocked ? moveSolidBigAt : moveSolidAt)(gx, gy)) pts[pts.length - 1] = { x: gx, y: gy };
  return pts;
}

// клетки ряда k перед дверью (k = 1 — сразу за проёмом)
export const doorFront = (d, k) => { const c = []; for (let yy = 0; yy < d.h; yy++) for (let xx = 0; xx < d.w; xx++) c.push([d.x + xx + d.dx * k, d.y + yy + d.dy * k]); return c; };
// SPEC-002 / SPEC-042: путь в клетках по сетке grid (Большого) от его двери до клетки перед дверью маленьких: кратчайшая пара дверей, диагональ = √2;
// −1 — пути нет. validate.js: правило housePath; tricks/index.js: хитрость не должна закрыть этот путь
export function housePathLen(doors, grid) {
  let best = Infinity;
  for (const bd of doors.big) for (const sd of doors.small) {
    const s = { x: (bd.x + 0.5) * CELL, y: (bd.y + 0.5) * CELL }, [fx0, fy0] = doorFront(sd, 1)[0];
    const pts = findPath(s.x, s.y, (fx0 + 0.5) * CELL, (fy0 + 0.5) * CELL, null, grid);
    if (!pts.length) continue;
    let L = 0, px = s.x, py = s.y;
    for (const p of pts) { L += Math.hypot(p.x - px, p.y - py) / CELL; px = p.x; py = p.y; }
    best = Math.min(best, L);
  }
  return isFinite(best) ? Math.round(best * 10) / 10 : -1;
}

// ---------- Ближайшая свободная клетка и выход ----------
// Ближайшая свободная клетка (не стена и не дом Большого), поиск в ширину
export function freeCellNear(idx) {
  const seen = scratchOf().seen.fill(0), q = [idx];
  seen[idx] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], cx = i % COLS, cy = (i / COLS) | 0;
    if (!G.blocked[i] && G.reachable[i] && !inDangerXY((cx + 0.5) * CELL, (cy + 0.5) * CELL)) return i;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return idx;
}
// Ближайшая точка за дверью дома Большого
export function nearestExit(p) {
  let best = null, bd = Infinity;
  for (const e of (G.dangerZone ? G.dangerZone.exits : [])) { const d = dist(p, e); if (d < bd) { bd = d; best = e; } }
  if (best) return best;
  const c = freeCellNear(cellIdx(p.x, p.y));             // дверей не знаем — ближайшая свободная клетка снаружи
  return { x: (c % COLS + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL };
}

// ---------- Большой и лежащие друзья (SPEC-037) ----------
// «Стена» (лежащий друг) и выученные клетки — только пока Большой гуляет или ищет, не в погоне и не по дороге домой; BIG_DETOUR_COST 0 — нет стены
export const wallOn = () => CFG.BIG_DETOUR_COST > 0 && (G.big.state === "patrol" || G.big.state === "search");
// запас до лежащего друга для центра клетки: < 0 — клетка «рядом» (его радиус + радиус Большого + полклетки: центр клетки не там, где он встанет);
// ignore — не считать друзей (последняя попытка уйти, когда он зажат)
export function downGap(x, y, ignore = false) {
  let m = Infinity;
  if (!ignore && wallOn()) for (const l of G.littles) if (l.state === "down") m = Math.min(m, Math.hypot(x - l.x, y - l.y) - (G.big.r + l.r + CELL / 2));
  return m;
}
export const nearDown = (x, y) => downGap(x, y) < 0;
// сетка Большого для A* и bigReach: уровень + клетки, до которых он не дошёл (G.bigLearned; только гуляя и ища)
export function bigGrid() {
  const trick = trickDadCells(), learned = wallOn() && G.bigLearned.some(v => v);   // SPEC-042: + the cells a spray / a wave keeps him out of (any state)
  if (!learned && !trick) return G.blockedBig;
  const m = scratchOf().grid;
  m.set(G.blockedBig);                    // (valid until the next bigGrid call: A* and bigReach use it at once)
  for (let i = 0; i < m.length; i++) if ((learned && G.bigLearned[i]) || (trick && trick[i])) m[i] = 1;
  return m;
}
// цена клетки рядом с лежащим другом; внутри его самого (где Большой не встанет) — вдвое: выход из тесноты идёт мимо друга, не сквозь него
export function detourCost(x, y) {
  const gap = downGap(x, y);
  return gap >= 0 ? 0 : gap < -CELL / 2 ? 2 * CFG.BIG_DETOUR_COST : CFG.BIG_DETOUR_COST;
}
export function randomFreePoint() {
  for (let k = 0; k < 300; k++) {
    const cx = Math.floor(rng() * COLS), cy = Math.floor(rng() * ROWS);
    if (G.blockedBig[cy * COLS + cx] || (G.tutorialGame && !G.reachable[cy * COLS + cx])) continue;   // SPEC-029: не за изгородь тренировки
    const p = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
    if (dist(p, G.big) > 150) return p;
  }
  return { x: W / 2, y: H / 2 };
}
// SPEC-037: клетки, куда Большой дойдёт от себя (не стена и не выученная клетка; не рядом с лежащим другом, разве что прочь от него; своя клетка — всегда,
// даже выученная), и ближайшая из них к точке (x, y) — её центр: цель, которая не достижима, не остаётся. ignoreKids — без лежащих друзей
export function bigReach(ignoreKids = false) {
  const sc = scratchOf(), grid = bigGrid(), seen = sc.reach[sc.flip ^= 1].fill(0), q = [cellIdx(G.big.x, G.big.y)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (seen[j] || grid[j]) continue;
      const gap = downGap((nx + 0.5) * CELL, (ny + 0.5) * CELL, ignoreKids);
      if (gap >= 0 || gap > downGap((cx + 0.5) * CELL, (cy + 0.5) * CELL, ignoreKids)) { seen[j] = 1; q.push(j); }   // из «рядом» — только прочь от лежащего
    }
  }
  return seen;
}
export function reachableGoal(x, y, ignoreKids = false) {
  const seen = bigReach(ignoreKids);
  let best = null, bd = Infinity;
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
    if (!seen[cy * COLS + cx] || downGap((cx + 0.5) * CELL, (cy + 0.5) * CELL, ignoreKids) < 0) continue;
    const px = (cx + 0.5) * CELL, py = (cy + 0.5) * CELL, d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = { x: px, y: py }; }
  }
  return best || { x: G.big.x, y: G.big.y };
}
