// SPEC-011 (from validate.js): the level report for the tests. Core module.
import { COLS, ROWS, CELL } from "../config.js";
import { newGame, withGame } from "../game.js";
import { loadLevel } from "./load.js";
import { buildLevel } from "./validate.js";
import { G } from "../active.js";

// Отчёт о честности уровня (для тестов): строит уровень на пустой карте своей игры (SPEC-012: newGame) — идущая игра не меняется
export function levelReport(world, lv) { return withGame(newGame({ world, n: lv }), () => buildLevel(world, lv)); }
// SPEC-041: карта уровня для картинки на карточке — тот же уровень, что построит игра (loadLevel: тот же кеш принятой попытки), но в
// своей игре (withGame): идущая игра, её случайность и поле не меняются. → { world, lv, type, fallback, obstacles, bushes, safeZone,
// dangerZone, cells: { wall, free, bush, water } } — cells считаются по клеткам сетки COLS × ROWS (стена — занятая клетка, не вода и не куст)
export function levelPreview(world, lv) {
  return withGame(newGame({ world, n: lv }), () => {
    loadLevel(world, lv);
    const { obstacles, bushes, safeZone, dangerZone } = G, info = G.levelInfo;
    return { world, lv, type: info.type, fallback: info.fallback, obstacles, bushes, safeZone, dangerZone, cells: previewCells(obstacles, bushes) };
  });
}
// клетки сетки: вода (пруд, вода) / стена (остальные препятствия: стены, домики, деревья, камни) / куст (не занятые чем-то из этого) / свободно
function previewCells(obstacles, bushes) {
  const kind = new Uint8Array(COLS * ROWS);   // 0 свободно, 1 куст, 2 стена, 3 вода
  const mark = (x0, y0, x1, y1, v) => {
    for (let cy = Math.max(0, Math.floor(y0 / CELL)); cy <= Math.min(ROWS - 1, Math.ceil(y1 / CELL) - 1); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / CELL)); cx <= Math.min(COLS - 1, Math.ceil(x1 / CELL) - 1); cx++) kind[cy * COLS + cx] = Math.max(kind[cy * COLS + cx], v);
  };
  for (const b of bushes) mark(b.x - CELL, b.y - CELL, b.x + CELL, b.y + CELL, 1);
  for (const o of obstacles) {
    const v = o.kind === "water" || o.kind === "pond" ? 3 : 2;
    if (o.shape === "circle") mark(o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r, v); else mark(o.x, o.y, o.x + o.w, o.y + o.h, v);
  }
  const cells = { wall: 0, free: 0, bush: 0, water: 0 };
  for (const v of kind) cells[["free", "bush", "wall", "water"][v]]++;
  return cells;
}
