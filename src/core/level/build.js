// SPEC-011: building a level into the map — the generator's attempt, applyWorld, connectivity. SPEC-039: the cache and loadLevel moved to
// load.js (they need validate.js, which needs this file). Core module.
import { CELL, CFG, COLS, H, ROWS, W } from "../config.js";
import { mulberry32, noGameRng } from "../util.js";
import { levelSeed, levelTier, levelType, placeHomes } from "./generate.js";
import { LAYOUTS, hWallTo, vWallTo } from "./layouts.js";
import { cellIdx } from "../grid.js";
import { buildGrids } from "../world.js";
import { placeTrick, makeTrick } from "../tricks/index.js";
import { G } from "../active.js";

// ---------- Сборка уровня ----------
export function generateLevel(world, lv, attempt) { return noGameRng("generateLevel", () => layoutLevel(world, lv, attempt)); }
function layoutLevel(world, lv, attempt) {
  const type = levelType(world, lv), tier = levelTier(world, lv);
  const rng = mulberry32(levelSeed(world, lv) * 7919 + attempt * 104729 + 13);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const items = [], occ = new Uint8Array(COLS * ROWS);
  const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const reserve = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inb(xx, yy)) occ[yy * COLS + xx] = 1; };
  const isFree = (x, y, w, h, m) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!inb(xx, yy)) return false;
    for (let yy = y - m; yy < y + h + m; yy++) for (let xx = x - m; xx < x + w + m; xx++) if (inb(xx, yy) && occ[yy * COLS + xx]) return false;
    return true;
  };
  const hWall = (x1, x2, y, kind, gaps = []) => hWallTo(items, x1, x2, y, kind, gaps);
  const vWall = (x, y1, y2, kind, gaps = []) => vWallTo(items, x, y1, y2, kind, gaps);
  // n штук make(x, y) в свободных местах w×h с отступом m клеток от занятого
  const place = (n, make, w = 1, h = 1, m = 2, ok = null) => {
    let placed = 0;
    for (let k = 0; k < 500 && placed < n; k++) {
      const x = ri(0, COLS - w), y = ri(0, ROWS - h);
      if (isFree(x, y, w, h, m) && (!ok || ok(x, y))) { items.push(make(x, y)); reserve(x, y, w, h); placed++; }
    }
    return placed;
  };
  const lc = { lv, attempt, type, tier, rng, ri, items, occ, inb, reserve, isFree, hWall, vWall, place,
    small: null, bigPt: null, doors: { small: [], big: [] }, homes: null, meta: {} };

  // Домики: на 1-м уровне — как на рисунке (дом Большого слева внизу), иначе угол Большого выбирает сид
  placeHomes(lc, type === "classic" ? "side" : CFG.LAYOUT[type].homes || (rng() < 0.5 ? "diagonal" : "side"));
  LAYOUTS[type](lc);

  // Зеркалим карту для разнообразия (1-й уровень — как на рисунке)
  const fx = lv > 1 && rng() < 0.5, fy = lv > 1 && rng() < 0.5;
  const tx = (x, w) => fx ? COLS - x - w : x, ty = (y, h) => fy ? ROWS - y - h : y;
  for (const it of items) { const w = it.w || 1, h = it.h || 1; if (it.t === "bush") { it.x = tx(it.x, 2); it.y = ty(it.y, 2); } else { it.x = tx(it.x, w); it.y = ty(it.y, h); } }
  for (const it of items) if (it.exits) for (const e of it.exits) { e.x = tx(e.x, e.w); e.y = ty(e.y, e.h); }
  for (const list of Object.values(lc.meta.areas || {})) for (const r of list) { r.x = tx(r.x, r.w); r.y = ty(r.y, r.h); }
  const tp = ([x, y]) => [fx ? COLS - x : x, fy ? ROWS - y : y];
  // двери домиков (проём + направление наружу) — для правил честности
  const md = d => ({ x: tx(d.x, d.w), y: ty(d.y, d.h), w: d.w, h: d.h, dx: fx ? -d.dx : d.dx, dy: fy ? -d.dy : d.dy });
  const doors = { small: lc.doors.small.map(md), big: lc.doors.big.map(md) };
  const fl = [];
  for (let i = 0; i < 60; i++) fl.push({ x: rng() * W, y: rng() * H, c: ["#fff27a", "#ff9ecb", "#ffffff", "#b5e3ff"][ri(0, 3)] });
  // SPEC-042: the world's trick, placed on the finished map from its own seeded stream (the layout above is the same with tricks on or off)
  const trick = placeTrick(world, { items, doors }, lv, type, tier, levelSeed(world, lv) * 6151 + attempt * 7919 + 41);
  return { type, items, small: lc.small.map(tp), big: tp(lc.bigPt), flowers: fl, doors, meta: lc.meta, trick };
}

// Новое состояние мира здесь → добавить его в список keep у levelReport (и в __bb.worldState)
export function applyWorld(gen) {
  G.obstacles = []; G.bushes = []; G.floors = []; G.decor = []; G.trees = []; G.safeZone = null; G.dangerZone = null;
  G.flowers = gen.flowers;
  G.trick = makeTrick(gen.trick);                            // SPEC-042: null on the practice maps (they have no gen.trick)
  for (const it of gen.items) {
    const px = it.x * CELL, py = it.y * CELL;
    if (it.t === "wall") G.obstacles.push({ shape: "rect", x: px, y: py, w: it.w * CELL, h: it.h * CELL, move: true, sight: true, kind: it.kind });
    else if (it.t === "cottage") G.obstacles.push({ shape: "rect", x: px, y: py, w: it.w * CELL, h: it.h * CELL, move: true, sight: true, kind: "cottage" });
    else if (it.t === "water") G.obstacles.push({ shape: "rect", x: px, y: py, w: it.w * CELL, h: it.h * CELL, move: true, sight: false, kind: "water" });
    else if (it.t === "pond") G.obstacles.push({ shape: "rect", x: px, y: py, w: it.w * CELL, h: it.h * CELL, move: true, sight: false, kind: "pond", fountain: !!it.fountain });
    else if (it.t === "tree") { const t = { shape: "circle", x: px + 16, y: py + 16, r: 12, sr: 15, move: true, sight: true, kind: "tree", v: it.v, s: it.s }; G.obstacles.push(t); G.trees.push(t); }
    else if (it.t === "rock") G.obstacles.push({ shape: "circle", x: px + 16, y: py + 16, r: 16, sr: 16, move: true, sight: true, kind: "rock", s: it.s });
    else if (it.t === "bush") G.bushes.push({ x: px + CELL, y: py + CELL, r: 30 });
    else if (it.t === "safe") G.safeZone = { shape: "rect", x: px, y: py, w: it.w * CELL, h: it.h * CELL };
    else if (it.t === "danger") G.dangerZone = { x: px, y: py, w: it.w * CELL, h: it.h * CELL, exits: (it.exits || []).map(e => ({ x: (e.x + e.w / 2) * CELL, y: (e.y + e.h / 2) * CELL })) };
    else if (it.t === "floor") G.floors.push({ x: px, y: py, w: it.w * CELL, h: it.h * CELL, kind: it.kind, across: it.across });
    else if (it.t === "decor") G.decor.push({ x: px, y: py, w: it.w * CELL, h: it.h * CELL, kind: it.kind, c: it.c });
  }
  G.spawns = { small: gen.small.map(([x, y]) => ({ x: x * CELL, y: y * CELL })), big: { x: gen.big[0] * CELL, y: gen.big[1] * CELL } };
  buildGrids();
}

export function connectivity() {
  const N = COLS * ROWS, seen = new Uint8Array(N);
  const s = cellIdx(G.spawns.small[0].x, G.spawns.small[0].y);
  if (G.blocked[s]) return { ok: false, seen };
  const q = [s]; seen[s] = 1;
  while (q.length) {
    const i = q.pop(), cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!G.blocked[j] && !seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  let ok = true;
  for (let i = 0; i < N; i++) if (!G.blocked[i] && !seen[i]) { ok = false; break; }
  return { ok, seen };
}
