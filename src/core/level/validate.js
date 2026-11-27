// SPEC-011: is a level fair (SPEC-002) — reachability, dead ends, free space; the level report. Core module.
import { CELL, CFG, COLS, ROWS } from "../config.js";
import { applyWorld, connectivity, generateLevel } from "./build.js";
import { levelKey, levelTier, levelType } from "./generate.js";
import { cellIdx, findPath } from "../grid.js";
import { buildGrids } from "../world.js";
import { G } from "../active.js";

// ---------- Честность уровня (SPEC-002) ----------
// validateLevel проверяет уже применённый уровень (после applyWorld) по 7 правилам; ok — все выполнены.
const N4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
function floodCells(start, grid) {
  const seen = new Uint8Array(COLS * ROWS);
  if (grid[start]) return seen;
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const i = q.pop(), cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!grid[j] && !seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return seen;
}
const allSeen = (grid, seen) => { for (let i = 0; i < COLS * ROWS; i++) if (!grid[i] && !seen[i]) return false; return true; };
// клетки ряда k перед дверью (k = 1 — сразу за проёмом)
const doorFront = (d, k) => { const c = []; for (let yy = 0; yy < d.h; yy++) for (let xx = 0; xx < d.w; xx++) c.push([d.x + xx + d.dx * k, d.y + yy + d.dy * k]); return c; };
const cellFree = (grid, [x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !grid[y * COLS + x];
// Тупики на сетке Большого: узлы — «окна» 2×2 свободных клеток (там он помещается), соседи — сдвиг на клетку.
// Листья обрезаем по одному: обрезанная цепочка — тупиковый коридор, её длина в клетках = окон + 1.
// count — сколько концов тупиков, longest — самый длинный тупиковый коридор (клеток).
function deadEndScan(skip = null) {
  const WC = COLS - 1, WR = ROWS - 1, NW = WC * WR, ok = new Uint8Array(NW), deg = new Uint8Array(NW), len = new Uint16Array(NW), gone = new Uint8Array(NW);
  const fr = (x, y) => !G.blockedBig[y * COLS + x];
  for (let j = 0; j < WR; j++) for (let i = 0; i < WC; i++) ok[j * WC + i] = fr(i, j) && fr(i + 1, j) && fr(i, j + 1) && fr(i + 1, j + 1) ? 1 : 0;
  const nb = w => {
    const i = w % WC, j = (w / WC) | 0, r = [];
    for (const [dx, dy] of N4) { const a = i + dx, b = j + dy; if (a >= 0 && b >= 0 && a < WC && b < WR && ok[b * WC + a]) r.push(b * WC + a); }
    return r;
  };
  const q = [];
  let count = 0, longest = 0;
  for (let w = 0; w < NW; w++) if (ok[w]) { deg[w] = nb(w).length; if (deg[w] <= 1) { q.push(w); len[w] = 1; gone[w] = 1; if (!skip || !skip(w % WC, (w / WC) | 0)) count++; } }
  for (let h = 0; h < q.length; h++) {
    const w = q[h];
    for (const u of nb(w)) {
      if (gone[u]) continue;
      len[u] = Math.max(len[u], len[w] + 1);
      if (--deg[u] <= 1) { gone[u] = 1; q.push(u); }
    }
    longest = Math.max(longest, len[w] + 1);
  }
  return { count, longest };
}
export function validateLevel(gen, type) {
  const N = COLS * ROWS, fails = [];
  // 1, 2: всё свободное достижимо — для маленьких от их домика, для Большого (вне домика маленьких) от его места
  const small = connectivity(), smallReachAll = small.ok;
  const bigReachAll = allSeen(G.blockedBig, floodCells(cellIdx(G.spawns.big.x, G.spawns.big.y), G.blockedBig));
  // 4: свободные клетки вне обоих домиков
  const sz = gen.items.find(it => it.t === "safe"), dz = gen.items.find(it => it.t === "danger");
  const inRect = (x, y, r) => !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const bigBox = dz && { x: dz.x - 1, y: dz.y - 1, w: dz.w + 2, h: dz.h + 2 };
  let free = 0;
  for (let i = 0; i < N; i++) { const x = i % COLS, y = (i / COLS) | 0; if (!G.blocked[i] && !inRect(x, y, sz) && !inRect(x, y, bigBox)) free++; }
  const freeRatio = free / N;
  // 5: перед каждой дверью DOOR_APRON свободных рядов на обеих сетках
  const doors = gen.doors || { small: [], big: [] };
  let doorClear = doors.small.length > 0 && doors.big.length > 0;
  for (const d of [...doors.small, ...doors.big]) for (let k = 1; k <= CFG.DOOR_APRON; k++) for (const c of doorFront(d, k)) if (!cellFree(G.blocked, c) || !cellFree(G.blockedBig, c)) doorClear = false;
  // 3: A* по сетке Большого от его двери до клетки перед дверью маленьких; кратчайшая пара дверей, диагональ = √2
  let housePath = Infinity;
  for (const bd of doors.big) for (const sd of doors.small) {
    const s = { x: (bd.x + 0.5) * CELL, y: (bd.y + 0.5) * CELL }, [fx0, fy0] = doorFront(sd, 1)[0];
    const pts = findPath(s.x, s.y, (fx0 + 0.5) * CELL, (fy0 + 0.5) * CELL, null, G.blockedBig);
    if (!pts.length) continue;
    let L = 0, px = s.x, py = s.y;
    for (const p of pts) { L += Math.hypot(p.x - px, p.y - py) / CELL; px = p.x; py = p.y; }
    housePath = Math.min(housePath, L);
  }
  housePath = isFinite(housePath) ? Math.round(housePath * 10) / 10 : -1;
  // 6: тупики (в лабиринте — сколько концов осталось от тупиков идеального лабиринта)
  // в лабиринте концы тупиков считаем только вне домиков с их площадками у дверей (там не лабиринт)
  const A = CFG.DOOR_APRON, grow = r => r && { x: r.x - A, y: r.y - A, w: r.w + 2 * A, h: r.h + 2 * A };
  const nearHome = (i, j) => [grow(sz), grow(bigBox)].some(r => r && i + 1 >= r.x && i < r.x + r.w && j + 1 >= r.y && j < r.y + r.h);
  const de = deadEndScan(type === "maze" ? nearHome : null), before = gen.meta && gen.meta.deadEndsBefore != null ? gen.meta.deadEndsBefore : null;
  const deadEnds = { count: de.count, longest: de.longest, before };
  // 7: кусты
  const bushes = gen.items.filter(it => it.t === "bush").length;
  if (!smallReachAll) fails.push("smallReach");
  if (!bigReachAll) fails.push("bigReach");
  if (type !== "classic" && (housePath < CFG.HOUSE_PATH[0] || housePath > CFG.HOUSE_PATH[1])) fails.push("housePath");   // 1-й уровень — рисунок детей
  if (freeRatio < CFG.FREE_MIN[type]) fails.push("free");
  if (!doorClear) fails.push("doors");
  if (type === "maze" ? !(before != null && de.count <= Math.floor(before * CFG.MAZE_DEAD_ENDS)) : de.longest > CFG.DEAD_END_MAX) fails.push("deadEnds");
  if (bushes < CFG.BUSH_MIN[type]) fails.push("bushes");
  if (gen.meta && gen.meta.bad) fails.push("layout:" + gen.meta.bad);
  return { ok: fails.length === 0, fails, seen: small.seen, freeRatio, bigReachAll, smallReachAll, housePath, doorClear, deadEnds, bushes };
}
// Строит уровень: до LEVEL_ATTEMPTS попыток, пока validateLevel не пройдёт; иначе — запасной вариант (живая изгородь в «карманах»).
// Попытки с 0 до LEVEL_ATTEMPTS-1, первая честная принимается. attempt — какая попытка построена.
// Для запасного варианта — «лучшая» неудачная: меньше нарушенных правил, а нарушившие достижимость
// (smallReach / bigReach) — в самом конце (их «карманы» пришлось бы закрывать).
const failScore = fails => fails.length + (fails.includes("smallReach") || fails.includes("bigReach") ? 100 : 0);
export function buildLevel(world, lv) {
  const type = levelType(world, lv), t0 = performance.now(), N = Math.max(1, CFG.LEVEL_ATTEMPTS);
  let rep = null, attempt = 0, tries = 0, best = null;
  const rejects = [];   // почему отброшены прежние попытки
  for (; attempt < N; attempt++) {
    const gen = generateLevel(world, lv, attempt);
    applyWorld(gen); tries++;
    rep = validateLevel(gen, type);
    if (rep.ok) break;
    rejects.push(rep.fails.join("/"));
    if (!best || failScore(rep.fails) < best.score) best = { score: failScore(rep.fails), attempt };
  }
  const fallback = !rep.ok;
  if (fallback) {
    // запасной вариант: попытка с меньшим числом нарушенных правил; «карманы», куда не дойдут маленькие
    // или (вне их домика) Большой, закрываем живой изгородью
    attempt = best.attempt;
    const gen = generateLevel(world, lv, attempt);
    applyWorld(gen);
    rep = validateLevel(gen, type);
    const bigSeen = floodCells(cellIdx(G.spawns.big.x, G.spawns.big.y), G.blockedBig);
    for (let i = 0; i < COLS * ROWS; i++) if (!G.blocked[i] && (!rep.seen[i] || (!G.blockedBig[i] && !bigSeen[i]))) {
      G.obstacles.push({ shape: "rect", x: (i % COLS) * CELL, y: ((i / COLS) | 0) * CELL, w: CELL, h: CELL, move: true, sight: true, kind: "hedge" });
    }
    buildGrids();
    rep.seen = connectivity().seen;
    console.warn(`level ${levelKey(world, lv)} (${type}): no fair layout in ${N} attempts (kept attempt ${attempt}: ${rep.fails.join(", ")}), pockets filled`);
  }
  G.reachable = rep.seen;
  const { seen, ok, ...report } = rep;
  return { type, tier: levelTier(world, lv), attempt, attempts: tries, fallback, ...report, rejects, ms: performance.now() - t0 };
}
