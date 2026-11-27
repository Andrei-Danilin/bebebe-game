// SPEC-011 (from validate.js): the level report for the tests. Core module.
import { newGame, withGame } from "../game.js";
import { buildLevel } from "./validate.js";

// Отчёт о честности уровня (для тестов): строит уровень на пустой карте своей игры (SPEC-012: newGame) — идущая игра не меняется
export function levelReport(world, lv) { return withGame(newGame({ world, n: lv }), () => buildLevel(world, lv)); }
