// SPEC-011: the level of a world and number — its type, tier and seed, the homes. Core module.
import { CFG, COLS, ROWS, WORLD_SEED, levelPos } from "../config.js";
import { BIG_HOUSE, bigHouse } from "./layouts.js";

export const levelKey = (world, n) => world + ":" + n;
// Тип уровня — по списку CFG.WORLD_TYPES (одинаковый во всех мирах)
export const levelType = (world, n) => CFG.WORLD_TYPES[levelPos(n)];
// tier — номер уровня внутри своего блока одного типа (0, 1, 2, 3): чем дальше, тем меньше укрытий
export function levelTier(world, n) {
  const T = CFG.WORLD_TYPES, i = levelPos(n);
  let t = 0;
  for (let k = i; k > 0 && T[k - 1] === T[i]; k--) t++;
  return t;
}
// Сид: 1-й уровень — рисунок детей, во всех мирах одна и та же раскладка (сид 1, как раньше у уровня 1);
// дальше сид от (WORLD_SEED мира, n) — у каждого мира свои карты (неизвестный мир — как Парк)
export const levelSeed = (world, n) => n <= 1 ? 1 : (WORLD_SEED[world] ?? WORLD_SEED.park) * 100 + n;

// Дверь дома (x0, y0, w×h) в виде проёма в клетках + направление наружу (dx, dy)
export function houseDoor(x0, y0, w, h, d) {
  if (d.side === "top") return { x: x0 + d.at, y: y0, w: 2, h: 1, dx: 0, dy: -1 };
  if (d.side === "bottom") return { x: x0 + d.at, y: y0 + h - 1, w: 2, h: 1, dx: 0, dy: 1 };
  if (d.side === "left") return { x: x0, y: y0 + d.at, w: 1, h: 2, dx: -1, dy: 0 };
  return { x: x0 + w - 1, y: y0 + d.at, w: 1, h: 2, dx: 1, dy: 0 };
}
// Домики (до зеркала): маленьких 7×6 слева вверху (двери справа и снизу, безопасная зона, кроватки, места);
// дом Большого 6×6 через bigHouse() — слева внизу ("side", как на рисунке) или справа внизу ("diagonal").
// Перед каждой дверью DOOR_APRON клеток заняты (reserve) — туда раскладка ничего не ставит.
export function placeHomes(lc, variant) {
  const { items, reserve } = lc, A = CFG.DOOR_APRON;
  placeSmallHome(lc);
  reserve(0, 0, 7 + A, 6 + A);

  const diag = variant === "diagonal", x0 = diag ? COLS - BIG_HOUSE : 0, y0 = ROWS - BIG_HOUSE;
  const bigDoors = [{ side: "top", at: 2 }, { side: diag ? "left" : "right", at: 2 }];
  bigHouse(items, x0, y0, bigDoors);
  lc.bigPt = [x0 + 3, y0 + 2];
  lc.doors.big = bigDoors.map(d => houseDoor(x0, y0, BIG_HOUSE, BIG_HOUSE, d));
  reserve(diag ? x0 - A : x0, y0 - A, BIG_HOUSE + A, BIG_HOUSE + A);
  lc.homes = { variant, small: { x: 0, y: 0, w: 7, h: 6 }, big: { x: x0, y: y0, w: BIG_HOUSE, h: BIG_HOUSE } };
}
// домик маленьких 7×6 слева вверху (двери справа и снизу, безопасная зона, кроватки, места) — и карта тренировок (SPEC-029)
export function placeSmallHome(lc) {
  const { items, hWall, vWall } = lc;
  hWall(0, 6, 0, "home"); hWall(0, 6, 5, "home", [2]); vWall(0, 1, 4, "home"); vWall(6, 1, 4, "home", [2]);
  items.push({ t: "floor", x: 1, y: 1, w: 5, h: 4, kind: "wood" });
  items.push({ t: "decor", kind: "bed", x: 1, y: 1, w: 1, h: 1, c: "#7cc6fe" });
  items.push({ t: "decor", kind: "bed", x: 3, y: 1, w: 1, h: 1, c: "#ffb86b" });
  items.push({ t: "decor", kind: "bed", x: 5, y: 1, w: 1, h: 1, c: "#c3a6ff" });
  lc.small = [[1.5, 3.5], [2.5, 2.5], [3.5, 3.5], [4.5, 2.5], [5.5, 3.5]];
  items.push({ t: "safe", x: 0, y: 0, w: 7, h: 6 });
  lc.doors.small = [{ side: "right", at: 2 }, { side: "bottom", at: 2 }].map(d => houseDoor(0, 0, 7, 6, d));
}
