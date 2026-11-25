// SPEC-011: the level layouts (walls, the Big One's house, the layout of each level type). Core module.
import { CFG, COLS, ROWS } from "../config.js";

// =====================================================================
//  ГЕНЕРАТОР УРОВНЕЙ (по рисунку: домик маленьких, дом Большого,
//  здание с комнатами, ёлки, камни, кусты, лужа)
// =====================================================================
// Стены клетками; gaps — начала дверей шириной 2 клетки
const inGap = (v, gaps) => gaps.some(g => v >= g && v < g + 2);
export function hWallTo(items, x1, x2, y, kind, gaps = []) {
  let run = null;
  for (let x = x1; x <= x2 + 1; x++) {
    const gap = x > x2 || inGap(x, gaps);
    if (!gap) { if (run === null) run = x; }
    else if (run !== null) { items.push({ t: "wall", x: run, y, w: x - run, h: 1, kind }); run = null; }
  }
}
export function vWallTo(items, x, y1, y2, kind, gaps = []) {
  let run = null;
  for (let y = y1; y <= y2 + 1; y++) {
    const gap = y > y2 || inGap(y, gaps);
    if (!gap) { if (run === null) run = y; }
    else if (run !== null) { items.push({ t: "wall", x, y: run, w: 1, h: y - run, kind }); run = null; }
  }
}
// Дом Большого 6×6 с левым верхним углом (x0, y0): стены, тёмный пол, кровать и опасная зона (= пол).
// doors: [{ side: "top"|"bottom"|"left"|"right", at }] — дверь в 2 клетки, at — сдвиг от угла дома;
// exits опасной зоны выводятся из тех же дверей: CFG.DANGER_EXIT клеток наружу.
export const BIG_HOUSE = 6;
export function bigHouse(items, x0, y0, doors) {
  const S = BIG_HOUSE - 1, ex = CFG.DANGER_EXIT;
  const gaps = side => doors.filter(d => d.side === side).map(d => (side === "top" || side === "bottom" ? x0 : y0) + d.at);
  hWallTo(items, x0, x0 + S, y0, "bighome", gaps("top")); hWallTo(items, x0, x0 + S, y0 + S, "bighome", gaps("bottom"));
  vWallTo(items, x0, y0 + 1, y0 + S - 1, "bighome", gaps("left")); vWallTo(items, x0 + S, y0 + 1, y0 + S - 1, "bighome", gaps("right"));
  items.push({ t: "floor", x: x0 + 1, y: y0 + 1, w: S - 1, h: S - 1, kind: "dark" });
  items.push({ t: "decor", kind: "bigbed", x: x0 + 1, y: y0 + 3, w: 2, h: 2 });
  const exits = doors.map(d => d.side === "top" ? { x: x0 + d.at, y: y0 - ex, w: 2, h: 1 }
    : d.side === "bottom" ? { x: x0 + d.at, y: y0 + S + ex, w: 2, h: 1 }
    : d.side === "left" ? { x: x0 - ex, y: y0 + d.at, w: 1, h: 2 }
    : { x: x0 + S + ex, y: y0 + d.at, w: 1, h: 2 });
  items.push({ t: "danger", x: x0 + 1, y: y0 + 1, w: S - 1, h: S - 1, exits });
}

// ---------- Раскладки ----------
// Раскладки по типам: получают lc с уже построенными домиками и раскладывают остальное (до зеркала)
// 1-й уровень (рисунок детей): здание с комнатами справа, лужа, ёлки, камни, кусты
function classicLayout(lc) {
  const { lv, rng, ri, items, reserve, isFree, place, hWall, vWall } = lc;
  // Здание с комнатами
  const bw = ri(9, 11), bx = COLS - bw, by = ri(0, 2), bh = ri(13, ROWS - by), bb = by + bh - 1;
  const hy = by + Math.floor(bh / 2) + ri(-1, 1);
  const topDoor = by > 0 ? ri(bx + 2, COLS - 4) : -10;
  const botDoor = bb < ROWS - 1 ? ri(bx + 2, COLS - 4) : -10;
  hWall(bx, COLS - 1, by, "build", by > 0 ? [topDoor] : []);
  hWall(bx, COLS - 1, bb, "build", bb < ROWS - 1 ? [botDoor] : []);
  vWall(bx, by + 1, bb - 1, "build", [ri(by + 2, hy - 3), ri(hy + 2, bb - 3)]);
  vWall(COLS - 1, by + 1, bb - 1, "build");
  const hDoor = ri(bx + 2, COLS - 4);
  hWall(bx + 1, COLS - 2, hy, "build", [hDoor]);
  const tryV = (y1, y2, doorX) => {
    if (rng() < 0.35 || y2 - y1 + 1 < 4) return;
    const vx = ri(bx + 3, COLS - 4);
    if ([doorX, doorX + 1, hDoor, hDoor + 1].includes(vx)) return;
    vWall(vx, y1, y2, "build", [ri(y1, y2 - 1)]);
  };
  tryV(by + 1, hy - 1, topDoor);
  tryV(hy + 1, bb - 1, botDoor);
  items.push({ t: "floor", x: bx + 1, y: by + 1, w: bw - 2, h: bh - 2, kind: "tile" });
  reserve(bx - 3, by - 2, bw + 3, bh + 4);

  // Природа
  if (rng() < 0.5 || lv % 3 === 0) {
    for (let k = 0; k < 80; k++) {
      const w = ri(3, 4), h = 2, x = ri(1, COLS - w - 1), y = ri(1, ROWS - h - 1);
      if (isFree(x, y, w, h, 2)) { items.push({ t: "pond", x, y, w, h }); reserve(x, y, w, h); break; }
    }
  }
  place(Math.min(15, 7 + lv), (x, y) => ({ t: "tree", x, y, v: rng() < 0.6 ? "pine" : "round", s: 0.9 + rng() * 0.25 }));
  place(ri(2, 4), (x, y) => ({ t: "rock", x, y, s: 0.9 + rng() * 0.3 }));
  place(ri(3, 5), (x, y) => ({ t: "bush", x, y }), 2, 2, 0);
}
// общие кусочки раскладок
// Клетки стен (сетка COLS×ROWS) → прямоугольники-стены kind: сначала горизонтальные отрезки ≥ 2, остальное — вертикальными;
// клетки стен занимаются в occ
function emitWalls(items, occ, wall, kind) {
  const used = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!wall[y * COLS + x] || used[y * COLS + x]) continue;
    let e = x; while (e + 1 < COLS && wall[y * COLS + e + 1]) e++;
    if (e > x) { items.push({ t: "wall", x, y, w: e - x + 1, h: 1, kind }); for (let k = x; k <= e; k++) used[y * COLS + k] = 1; }
  }
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
    if (!wall[y * COLS + x] || used[y * COLS + x]) continue;
    let e = y; while (e + 1 < ROWS && wall[(e + 1) * COLS + x] && !used[(e + 1) * COLS + x]) e++;
    items.push({ t: "wall", x, y, w: 1, h: e - y + 1, kind }); for (let k = y; k <= e; k++) used[k * COLS + x] = 1;
  }
  for (let k = 0; k < COLS * ROWS; k++) if (wall[k]) occ[k] = 1;
}
const shuffle = (rng, a) => { for (let k = a.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [a[k], a[r]] = [a[r], a[k]]; } return a; };
const genTree = rng => (x, y) => ({ t: "tree", x, y, v: rng() < 0.6 ? "pine" : "round", s: 0.9 + rng() * 0.25 });
const genRock = rng => (x, y) => ({ t: "rock", x, y, s: 0.9 + rng() * 0.3 });
const genBush = (x, y) => ({ t: "bush", x, y });
/** @param {any} lc @param {number[]} range */
const bushCount = (lc, [a, b]) => Math.max(CFG.BUSH_MIN[lc.type], lc.ri(a, b) - lc.tier);

// Поляна: никаких зданий — кусты, деревья, камни и маленькие лужи
function meadowLayout(lc) {
  const { rng, ri, items, reserve, isFree, place } = lc, L = CFG.LAYOUT.meadow;
  for (let n = ri(L.ponds[0], L.ponds[1]); n > 0; n--) for (let k = 0; k < 80; k++) {
    const w = ri(L.pondW[0], L.pondW[1]), h = 2, x = ri(1, COLS - w - 1), y = ri(1, ROWS - h - 1);
    if (isFree(x, y, w, h, 2)) { items.push({ t: "pond", x, y, w, h }); reserve(x, y, w, h); break; }
  }
  place(ri(L.trees[0], L.trees[1]), genTree(rng));
  place(ri(L.rocks[0], L.rocks[1]), genRock(rng));
  place(bushCount(lc, L.bushes), genBush, 2, 2, 1);
}

// Лабиринт из живой изгороди на сетке модулей 3×3 клетки: коридор 2 клетки + стена 1 клетка.
// Модули, задевающие домики с площадками у дверей, — одна открытая «область дома». Сначала идеальный лабиринт
// (Краскал), потом «плетение»: пробиваем стены у тупиков, пока их не останется ≤ MAZE_DEAD_ENDS; плюс 1–2 площади 5×5.
function mazeLayout(lc) {
  const { rng, ri, items, occ, reserve, place } = lc, L = CFG.LAYOUT.maze, M = L.module;
  const MC = Math.floor(COLS / M), MR = Math.ceil(ROWS / M), N = MC * MR;   // 10 × 7; крайние модули доходят до края карты
  const x0 = i => i * M, x1 = i => i === MC - 1 ? COLS - 1 : i * M + M - 2;
  const y0 = j => j * M, y1 = j => j === MR - 1 ? ROWS - 1 : j * M + M - 2;
  const id = (i, j) => j * MC + i;
  // модуль (с его стенами справа и снизу) задевает домик или площадку у двери
  const home = new Uint8Array(N);
  for (let j = 0; j < MR; j++) for (let i = 0; i < MC; i++) {
    for (let y = y0(j); y <= Math.min(ROWS - 1, y0(j) + M - 1); y++) for (let x = x0(i); x <= Math.min(COLS - 1, x0(i) + M - 1); x++) if (occ[y * COLS + x]) home[id(i, j)] = 1;
  }
  const edges = [];
  for (let j = 0; j < MR; j++) for (let i = 0; i < MC; i++) {
    if (i < MC - 1) edges.push({ a: id(i, j), b: id(i + 1, j), i, j, h: true, open: false });
    if (j < MR - 1) edges.push({ a: id(i, j), b: id(i, j + 1), i, j, h: false, open: false });
  }
  const edgeOf = (a, b) => edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const par = Array.from({ length: N }, (_, k) => k);
  const find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  const dg = new Uint8Array(N);   // сколько проходов у модуля
  const openE = e => { if (!e.open) { e.open = true; dg[e.a]++; dg[e.b]++; } };
  const join = e => { const a = find(e.a), b = find(e.b); if (a === b) return false; par[a] = b; openE(e); return true; };
  // области домов — открыты внутри
  for (const e of edges) if (home[e.a] && home[e.b]) { join(e); openE(e); }
  // площади: блок 2×2 модуля (5×5 клеток), не в широком крайнем столбце, не на доме и не рядом с другой площадью
  const plaza = new Uint8Array(N), plazas = [];
  const want = ri(L.plazas[0], L.plazas[1]);
  for (let k = 0; k < 60 && plazas.length < want; k++) {
    const i = ri(0, MC - 3), j = ri(0, MR - 2);
    let ok = true;
    for (let dj = -1; dj <= 2 && ok; dj++) for (let di = -1; di <= 2 && ok; di++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= MC || b >= MR) continue;
      const inside = di >= 0 && di <= 1 && dj >= 0 && dj <= 1;
      if ((inside && home[id(a, b)]) || plaza[id(a, b)]) ok = false;
    }
    if (!ok) continue;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) plaza[id(i + di, j + dj)] = 1;
    for (const [a, b] of [[id(i, j), id(i + 1, j)], [id(i, j + 1), id(i + 1, j + 1)], [id(i, j), id(i, j + 1)], [id(i + 1, j), id(i + 1, j + 1)]]) { const e = edgeOf(a, b); join(e); openE(e); }
    plazas.push({ i, j, x: x0(i), y: y0(j), w: x1(i + 1) - x0(i) + 1, h: y1(j + 1) - y0(j) + 1 });
  }
  // идеальный лабиринт
  const order = edges.filter(e => !e.open);
  for (let k = order.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [order[k], order[r]] = [order[r], order[k]]; }
  for (const e of order) join(e);
  // тупики: обычный модуль с одним проходом
  const deg = m => dg[m];
  const deadList = () => { const r = []; for (let m = 0; m < N; m++) if (!home[m] && !plaza[m] && deg(m) === 1) r.push(m); return r; };
  const dead = deadList();
  const before = dead.length, target = Math.floor(before * CFG.MAZE_DEAD_ENDS);
  for (let k = dead.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [dead[k], dead[r]] = [dead[r], dead[k]]; }
  for (const m of dead) {
    if (deadList().length <= target) break;
    if (deg(m) !== 1) continue;
    const closed = edges.filter(e => !e.open && (e.a === m || e.b === m));
    if (!closed.length) continue;
    const other = e => e.a === m ? e.b : e.a;
    const pick = closed.find(e => !home[other(e)] && !plaza[other(e)] && deg(other(e)) === 1) || closed[Math.floor(rng() * closed.length)];
    openE(pick);
  }
  lc.meta.deadEndsBefore = before;
  lc.meta.deadEndsAfter = deadList().length;
  // стены в клетки (кроме домиков и площадок у дверей)
  const wall = new Uint8Array(COLS * ROWS);
  const put = (x, y) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS && !occ[y * COLS + x]) wall[y * COLS + x] = 1; };
  for (const e of edges) {
    if (e.open) continue;
    if (e.h) for (let y = y0(e.j); y <= y1(e.j); y++) put(x1(e.i) + 1, y);
    else for (let x = x0(e.i); x <= x1(e.i); x++) put(x, y1(e.j) + 1);
  }
  for (let j = 0; j < MR - 1; j++) for (let i = 0; i < MC - 1; i++) {   // столбики на перекрёстках
    const near = [edgeOf(id(i, j), id(i + 1, j)), edgeOf(id(i, j + 1), id(i + 1, j + 1)), edgeOf(id(i, j), id(i, j + 1)), edgeOf(id(i + 1, j), id(i + 1, j + 1))];
    if (near.some(e => !e.open)) put(x1(i) + 1, y1(j) + 1);
  }
  emitWalls(items, occ, wall, "maze");
  // деревья — в центрах площадей, кусты — по одному на площадь, остальные — в широких местах коридоров
  const trees = Math.min(plazas.length, ri(L.trees[0], L.trees[1])), tree = genTree(rng);
  for (let k = 0; k < trees; k++) { const q = plazas[k], cx = q.x + 2, cy = q.y + 2; items.push(tree(cx, cy)); reserve(cx, cy, 1, 1); }
  let bushes = bushCount(lc, L.bushes);
  for (const q of plazas) {
    if (bushes <= 0) break;
    const c = [[q.x, q.y], [q.x + q.w - 2, q.y], [q.x, q.y + q.h - 2], [q.x + q.w - 2, q.y + q.h - 2]][ri(0, 3)];
    items.push(genBush(c[0], c[1])); reserve(c[0], c[1], 2, 2); bushes--;
  }
  place(bushes, genBush, 2, 2, 0);
  lc.meta.areas = { plazas: plazas.map(q => ({ x: q.x, y: q.y, w: q.w, h: q.h })) };
}

// Деревня: 5–8 домиков-блоков с улицами ≥ 2 клеток вокруг, площадь с фонтаном в середине
function villageLayout(lc) {
  const { rng, ri, items, reserve, isFree, place } = lc, L = CFG.LAYOUT.village, S = L.street;
  const sw = ri(L.squareW[0], L.squareW[1]), sh = ri(L.squareH[0], L.squareH[1]);
  const sx = Math.floor((COLS - sw) / 2) + ri(-1, 1), sy = Math.floor((ROWS - sh) / 2) + ri(-1, 1);
  items.push({ t: "floor", x: sx, y: sy, w: sw, h: sh, kind: "square" });
  const F = L.fountain;
  items.push({ t: "pond", x: sx + Math.floor((sw - F) / 2), y: sy + Math.floor((sh - F) / 2), w: F, h: F, fountain: true });
  reserve(sx, sy, sw, sh);
  const cottages = [], want = ri(L.cottages[0], L.cottages[1]);
  for (let k = 0; k < 800 && cottages.length < want; k++) {
    let w = ri(L.cottageA[0], L.cottageA[1]), h = ri(L.cottageB[0], L.cottageB[1]);
    if (rng() < 0.5) [w, h] = [h, w];
    const x = ri(S, COLS - w - S), y = ri(S, ROWS - h - S);
    if (isFree(x, y, w, h, S)) { const c = { t: "cottage", x, y, w, h }; items.push(c); cottages.push(c); reserve(x, y, w, h); }
  }
  if (cottages.length < L.cottages[0]) lc.meta.bad = "cottages";
  // кусты во дворах — вплотную к домикам
  let bushes = bushCount(lc, L.bushes);
  for (let k = 0; k < 400 && bushes > 0 && cottages.length; k++) {
    const c = cottages[ri(0, cottages.length - 1)], side = ri(0, 3);
    const x = side === 0 ? c.x - 2 : side === 1 ? c.x + c.w : ri(c.x - 1, c.x + c.w - 1);
    const y = side === 2 ? c.y - 2 : side === 3 ? c.y + c.h : ri(c.y - 1, c.y + c.h - 1);
    if (isFree(x, y, 2, 2, 0)) { items.push(genBush(x, y)); reserve(x, y, 2, 2); bushes--; }
  }
  place(bushes, genBush, 2, 2, 0);
  place(ri(L.trees[0], L.trees[1]), genTree(rng));
  place(ri(L.rocks[0], L.rocks[1]), genRock(rng));
}

// Река с мостиками: вода 2–3 клетки от края до края между домиками (горизонтально; при доме Большого по диагонали —
// иногда вертикально), каждые 4–6 клеток сдвигается на ±1; 2–3 мостика шириной 2–3 клетки; кусты на обоих берегах
function riverLayout(lc) {
  const { rng, ri, items, reserve, place } = lc, L = CFG.LAYOUT.river, A = CFG.DOOR_APRON;
  const diag = lc.homes.variant === "diagonal", vertical = diag && rng() < 0.5;
  const along = vertical ? ROWS : COLS, w = ri(L.width[0], L.width[1]);
  // полоса между домиками с их площадками у дверей
  const lo = vertical ? lc.homes.small.w + A : lc.homes.small.h + A;
  const hi = vertical ? lc.homes.big.x - A - 1 : lc.homes.big.y - A - 1;
  const maxOff = hi - w + 1, top = new Array(along);
  let off = ri(lo, maxOff);
  for (let pos = 0; pos < along;) {
    const seg = ri(L.bend[0], L.bend[1]);
    for (let k = 0; k < seg && pos < along; k++) top[pos++] = off;
    const d = rng() < 0.5 ? -1 : 1;
    off = off + d >= lo && off + d <= maxOff ? off + d : off - d;
  }
  // мостики: по одному в каждой части реки, на прямом куске; при домах на одной стороне — не у самих домов
  const nb = ri(L.bridges[0], L.bridges[1]), bridge = new Uint8Array(along), bridges = [];
  const minS = !vertical && !diag ? lc.homes.small.w + A + 1 : 1;
  for (let k = 0; k < nb; k++) {
    const bw = ri(L.bridgeW[0], L.bridgeW[1]), p0 = Math.floor(k * along / nb), p1 = Math.floor((k + 1) * along / nb) - 1;
    const cand = [];
    for (let st = Math.max(p0, minS); st + bw - 1 <= Math.min(p1, along - 2); st++) {
      let ok = true;
      for (let q = st; q < st + bw; q++) if (top[q] !== top[st] || bridge[q]) ok = false;
      if (ok && !bridge[st - 1] && !bridge[st + bw]) cand.push(st);
    }
    if (!cand.length) continue;
    const st = cand[ri(0, cand.length - 1)];
    for (let q = st; q < st + bw; q++) bridge[q] = 1;
    bridges.push(vertical ? { x: top[st], y: st, w, h: bw } : { x: st, y: top[st], w: bw, h: w });
  }
  if (bridges.length < L.bridges[0]) lc.meta.bad = "bridges";
  // вода — прямыми кусками без мостиков
  for (let p = 0; p < along;) {
    if (bridge[p]) { p++; continue; }
    let e = p; while (e + 1 < along && !bridge[e + 1] && top[e + 1] === top[p]) e++;
    const r = vertical ? { x: top[p], y: p, w, h: e - p + 1 } : { x: p, y: top[p], w: e - p + 1, h: w };
    items.push({ t: "water", ...r }); reserve(r.x, r.y, r.w, r.h);
    p = e + 1;
  }
  for (const b of bridges) { items.push({ t: "floor", kind: "bridge", ...b, across: vertical ? "x" : "y" }); reserve(b.x, b.y, b.w, b.h); }
  // берег клетки: 0 — сторона домика маленьких, 1 — другая
  const bank = (x, y) => vertical ? (x < top[y] ? 0 : 1) : (y < top[x] ? 0 : 1);
  const nBush = bushCount(lc, L.bushes), half = Math.ceil(nBush / 2);
  place(half, genBush, 2, 2, 0, (x, y) => bank(x, y) === 0);
  place(nBush - half, genBush, 2, 2, 0, (x, y) => bank(x, y) === 1);
  place(ri(L.trees[0], L.trees[1]), genTree(rng));
  place(ri(L.rocks[0], L.rocks[1]), genRock(rng));
  lc.meta.areas = { bridges: bridges.map(b => ({ ...b })) };
  lc.meta.vertical = vertical;
}

// Дом с комнатами (дом Большого по диагонали): здание из двух крыльев вокруг двор(ов) домиков — A справа сверху,
// B слева снизу, общая стена между ними. Каждое крыло делится пополам (BSP) на комнаты ≥ 4×4 внутри; в каждой
// стене деления дверь (2 клетки), примерно в трети — вторая; 3–4 двери наружу, в оба двора.
function roomsLayout(lc) {
  const { rng, ri, items, occ, place } = lc, L = CFG.LAYOUT.rooms, A = CFG.DOOR_APRON, MR = L.minRoom;
  if (lc.homes.variant !== "diagonal") { lc.meta.bad = "homes"; return; }   // крылья здания — только вокруг домов по диагонали
  const sh = lc.homes.small, bh = lc.homes.big;
  const ax0 = sh.x + sh.w + A, ay1 = bh.y - A - 1;            // крыло A: x ax0..COLS-1, y 0..ay1
  const bx1 = bh.x - A - 1, by0 = ay1;                         // крыло B: x 0..bx1, y by0..ROWS-1 (общая стена y = ay1)
  const wings = [{ x0: ax0, y0: 0, x1: COLS - 1, y1: ay1 }, { x0: 0, y0: by0, x1: bx1, y1: ROWS - 1 }];
  const wall = new Uint8Array(COLS * ROWS), door = new Uint8Array(COLS * ROWS), doors = [];
  const at = (x, y) => y * COLS + x;
  for (const g of wings) {
    for (let x = g.x0; x <= g.x1; x++) { wall[at(x, g.y0)] = 1; wall[at(x, g.y1)] = 1; }
    for (let y = g.y0; y <= g.y1; y++) { wall[at(g.x0, y)] = 1; wall[at(g.x1, y)] = 1; }
  }
  // дверь: 2 клетки в стене; vert — стена вертикальная (дверь сверху вниз)
  const addDoor = (x, y, vert, kind) => {
    const c = vert ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]];
    for (const [cx, cy] of c) { wall[at(cx, cy)] = 0; door[at(cx, cy)] = 1; }
    doors.push({ x, y, w: vert ? 1 : 2, h: vert ? 2 : 1, vert, kind });
  };
  const free2 = (vert, x, y, list) => list.every(([cx, cy]) => !door[at(cx, cy)]) && !door[at(vert ? x : x - 1, vert ? y - 1 : y)] && !door[at(vert ? x : x + 2, vert ? y + 2 : y)];
  // двери наружу: стены крыльев, смотрящие во дворы (по 1–2 в каждый двор, всего 3–4)
  const segs = {
    small: [{ vert: true, x: ax0, a: 1, b: ay1 - 1 }, { vert: false, y: by0, a: 1, b: ax0 - 1 }],
    big: [{ vert: false, y: ay1, a: bx1 + 1, b: COLS - 2 }, { vert: true, x: bx1, a: by0 + 1, b: ROWS - 2 }]
  };
  const total = ri(L.outsideDoors[0], L.outsideDoors[1]), perYard = { small: 1, big: 1 };
  perYard[rng() < 0.5 ? "small" : "big"] += total - 2 > 0 ? 1 : 0;
  if (total - 2 > 1) perYard[perYard.small > 1 ? "big" : "small"]++;
  // первая дверь во двор маленьких — напротив правой стены их домика: иначе полоса между домиком и зданием —
  // тупик для Большого (в домик ему нельзя)
  addDoor(ax0, ri(1, sh.h - 2), true, "out:small"); perYard.small--;
  for (const yard of ["small", "big"]) {
    let left = perYard[yard];
    for (let k = 0; k < 80 && left > 0; k++) {
      const sg = segs[yard][ri(0, 1)], st = ri(sg.a, sg.b - 1);
      const x = sg.vert ? sg.x : st, y = sg.vert ? st : sg.y;
      const cells = sg.vert ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]];
      if (!free2(sg.vert, x, y, cells)) continue;
      addDoor(x, y, sg.vert, "out:" + yard); left--;
    }
  }
  // общая стена между крыльями: 1 дверь (иногда 2)
  const sharedDoor = () => { for (let k = 0; k < 40; k++) { const x = ri(ax0 + 1, bx1 - 2); if (free2(false, x, ay1, [[x, ay1], [x + 1, ay1]])) { addDoor(x, ay1, false, "in"); return; } } };
  sharedDoor(); if (rng() < L.secondDoor) sharedDoor();
  // BSP: r — внутренность (без стен). Линия деления не упирается в дверь соседней стены.
  const rooms = [];
  const split = r => {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    const canV = w >= 2 * MR + 1, canH = h >= 2 * MR + 1;
    if ((!canV && !canH) || (w * h <= L.stopArea && rng() < 0.5)) { rooms.push(r); return; }
    const vert = canV && (!canH || (w > h ? rng() < L.splitBias : rng() < 1 - L.splitBias));   // чаще делим длинную сторону
    const opts = [];
    if (vert) { for (let sx = r.x0 + MR; sx <= r.x1 - MR; sx++) if (!door[at(sx, r.y0 - 1)] && !door[at(sx, r.y1 + 1)]) opts.push(sx); }
    else { for (let sy = r.y0 + MR; sy <= r.y1 - MR; sy++) if (!door[at(r.x0 - 1, sy)] && !door[at(r.x1 + 1, sy)]) opts.push(sy); }
    if (!opts.length) { rooms.push(r); return; }
    const sp = opts[ri(0, opts.length - 1)];
    if (vert) for (let y = r.y0; y <= r.y1; y++) wall[at(sp, y)] = 1;
    else for (let x = r.x0; x <= r.x1; x++) wall[at(x, sp)] = 1;
    const a0 = vert ? r.y0 : r.x0, a1 = vert ? r.y1 : r.x1;
    const d1 = ri(a0, a1 - 1);
    if (vert) addDoor(sp, d1, true, "in"); else addDoor(d1, sp, false, "in");
    if (rng() < L.secondDoor) {
      const o = []; for (let d = a0; d <= a1 - 1; d++) if (d + 1 < d1 - 1 || d > d1 + 2) o.push(d);
      if (o.length) { const d2 = o[ri(0, o.length - 1)]; if (vert) addDoor(sp, d2, true, "in"); else addDoor(d2, sp, false, "in"); }
    }
    if (vert) { split({ x0: r.x0, y0: r.y0, x1: sp - 1, y1: r.y1 }); split({ x0: sp + 1, y0: r.y0, x1: r.x1, y1: r.y1 }); }
    else { split({ x0: r.x0, y0: r.y0, x1: r.x1, y1: sp - 1 }); split({ x0: r.x0, y0: sp + 1, x1: r.x1, y1: r.y1 }); }
  };
  for (const g of wings) {
    split({ x0: g.x0 + 1, y0: g.y0 + 1, x1: g.x1 - 1, y1: g.y1 - 1 });
    items.push({ t: "floor", x: g.x0 + 1, y: g.y0 + 1, w: g.x1 - g.x0 - 1, h: g.y1 - g.y0 - 1, kind: "tile" });
  }
  emitWalls(items, occ, wall, "build");
  // кто за дверью: номер комнаты, "small"/"big" — двор
  const roomAt = (x, y) => rooms.findIndex(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const side = (x, y, d) => { const k = roomAt(x, y); return k >= 0 ? k : d.kind.startsWith("out:") ? d.kind.slice(4) : -1; };
  const doorList = doors.map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h,
    a: d.vert ? side(d.x - 1, d.y, d) : side(d.x, d.y - 1, d), b: d.vert ? side(d.x + 1, d.y, d) : side(d.x, d.y + 1, d) }));
  if (doors.filter(d => d.kind.startsWith("out:")).length < L.outsideDoors[0] || !doors.some(d => d.kind === "out:small") || !doors.some(d => d.kind === "out:big")) lc.meta.bad = "outsideDoors";
  // растения в комнатах, камни-мебель в больших комнатах (не у стен и дверей)
  const inRoom = (x, y, w, h) => rooms.some(r => x >= r.x0 && y >= r.y0 && x + w - 1 <= r.x1 && y + h - 1 <= r.y1);
  const big = rooms.filter(r => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) >= L.bigRoom);
  place(bushCount(lc, L.bushes), genBush, 2, 2, 0, (x, y) => inRoom(x, y, 2, 2));
  place(ri(L.rocks[0], L.rocks[1]), genRock(rng), 1, 1, 2, (x, y) => big.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1));
  lc.meta.areas = { rooms: rooms.map(r => ({ x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 })), doors: doorList };
}

// Арена: блок в середине, вокруг кольцо стен через 3 клетки с 3–4 проходами; у половины уровней ещё полукольцо
// снаружи (в свободном углу) с 2 проходами. Кусты — в коридоре кольца, деревья и камни — снаружи.
function arenaLayout(lc) {
  const { rng, ri, items, occ, reserve, isFree, place } = lc, L = CFG.LAYOUT.arena, D = L.ring + 1, bh = L.blockH, HG = L.halfGap;
  if (lc.homes.variant !== "diagonal") { lc.meta.bad = "homes"; return; }   // полукольцу нужны свободные углы (слева внизу / справа вверху)
  let half = rng() < L.halfRing;
  const corner = half ? (rng() < 0.5 ? "bl" : "tr") : null;
  // при полукольце кольцо сдвинуто от того края, где ему нужно место (2 клетки коридор + стена + 2 клетки)
  const by = corner === "bl" ? Math.floor((ROWS - bh) / 2) - 1 : corner === "tr" ? Math.floor((ROWS - bh) / 2) + 1 : Math.floor((ROWS - bh) / 2) + ri(-1, 1);
  let bw = ri(L.blockW[0], L.blockW[1]), bx = -1;
  for (; bw >= L.blockW[0] && bx < 0; bw--) {
    const opts = [];
    for (let x = D + 2; x + bw + D + 2 <= COLS; x++) if (isFree(x - D, by - D, bw + 2 * D, bh + 2 * D, 0)) opts.push(x);
    if (opts.length) { bx = opts[ri(0, opts.length - 1)]; break; }
  }
  if (bx < 0) { lc.meta.bad = "arena"; return; }
  const x0 = bx - D, y0 = by - D, x1 = bx + bw + D - 1, y1 = by + bh + D - 1;
  const wall = new Uint8Array(COLS * ROWS), at = (x, y) => y * COLS + x;
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) wall[at(x, y)] = v; };
  for (let x = x0; x <= x1; x++) { set(x, y0, 1); set(x, y1, 1); }
  for (let y = y0; y <= y1; y++) { set(x0, y, 1); set(x1, y, 1); }
  // проходы в кольце: на разных сторонах, не у углов
  const gaps = [], n = ri(L.gaps[0], L.gaps[1]);
  for (const sd of shuffle(rng, ["top", "bottom", "left", "right"]).slice(0, n)) {
    const gw = ri(L.gapW[0], L.gapW[1]), horiz = sd === "top" || sd === "bottom";
    const st = horiz ? ri(x0 + 2, x1 - 1 - gw) : ri(y0 + 2, y1 - 1 - gw);
    const g = horiz ? { x: st, y: sd === "top" ? y0 : y1, w: gw, h: 1 } : { x: sd === "left" ? x0 : x1, y: st, w: 1, h: gw };
    for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) set(x, y, 0);
    gaps.push(g);
  }
  // полукольцо: две «руки» через HG клеток от кольца — по левой и нижней стороне (bl) или по верхней и правой (tr);
  // снаружи от него тоже HG свободных клеток до края карты, и оно не задевает домики — иначе его нет
  const halfGaps = [];
  if (half) {
    const hx = corner === "bl" ? x0 - HG - 1 : x1 + HG + 1, hy = corner === "bl" ? y1 + HG + 1 : y0 - HG - 1;
    const mx = Math.floor((x0 + x1) / 2), my = Math.floor((y0 + y1) / 2);
    const vy0 = Math.min(my, hy), vy1 = Math.max(my, hy), hx0 = Math.min(mx, hx), hx1 = Math.max(mx, hx);
    const arm = [];
    for (let y = vy0; y <= vy1; y++) arm.push([hx, y]);
    for (let x = hx0; x <= hx1; x++) arm.push([x, hy]);
    half = arm.every(([x, y]) => x >= HG && y >= HG && x < COLS - HG && y < ROWS - HG && !occ[at(x, y)]);
    if (half) {
      for (const [x, y] of arm) set(x, y, 1);
      const gv = ri(L.gapW[0], L.gapW[1]), gvy = ri(vy0 + 1, vy1 - 1 - gv), gh = ri(L.gapW[0], L.gapW[1]), ghx = ri(hx0 + 1, hx1 - 1 - gh);
      for (let y = gvy; y < gvy + gv; y++) set(hx, y, 0);
      for (let x = ghx; x < ghx + gh; x++) set(x, hy, 0);
      halfGaps.push({ x: hx, y: gvy, w: 1, h: gv }, { x: ghx, y: hy, w: gh, h: 1 });
    }
  }
  emitWalls(items, occ, wall, "arena");
  items.push({ t: "wall", x: bx, y: by, w: bw, h: bh, kind: "arena" }); reserve(bx, by, bw, bh);
  // кусты — в коридоре внутри кольца; потом кольцо целиком занято, деревья и камни — снаружи
  place(bushCount(lc, L.bushes), genBush, 2, 2, 0, (x, y) => x > x0 && y > y0 && x + 1 < x1 && y + 1 < y1);
  reserve(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  place(ri(L.trees[0], L.trees[1]), genTree(rng));
  place(ri(L.rocks[0], L.rocks[1]), genRock(rng));
  lc.meta.areas = { block: [{ x: bx, y: by, w: bw, h: bh }], ring: [{ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }], gaps, halfGaps };
}

export const LAYOUTS = Object.freeze({
  classic: classicLayout, meadow: meadowLayout, maze: mazeLayout, village: villageLayout,
  river: riverLayout, rooms: roomsLayout, arena: arenaLayout
});
