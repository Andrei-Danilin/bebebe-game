// SPEC-011: small helpers — distance, clamp, angles, and the gameplay randomness rng() (seeded, SPEC-008) next to the
// visual one vrand(). Core module.
import { TAU } from "./config.js";

// =====================================================================
//  ПОМОЩНИКИ
// =====================================================================
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// SPEC-008: случайность. Игровая — только rng() (mulberry32): __bb.seedRandom(n) задаёт зерно, без зерна — случайное
// (игра как раньше). rand() — игровой. Визуальная — vrand() на Math.random: частицы burst, сердечки при обнимашках,
// тряска камеры, снег, randomOutfit; она не трогает rng(), поэтому sim (без частиц) тянет тот же ряд, что и игра.
// Без зерна — случайное. SPEC-011 AC 8d: тесты задают window.__bbSeed — клиент сеет им игру при запуске (до первой игры).
let rngNext = mulberry32((Math.random() * 4294967296) >>> 0);
// rngOff — имя кода, которому игровая случайность запрещена (генератор уровней, 3D, рисование): у него свой сид (lc.rng, mulberry32).
// Забыл взять свой rng: в тестах (strictRng, его включает openGame) — громкая ошибка; в игре — визуальная vrand(),
// чтобы начало уровня у игрока не сломалось, а посев игры остался цел.
export let rngOff = "", strictRng = false;   // strictRng: клиент включает из window.__bbStrictRng (тесты)
export let rngDraws = 0;   // сколько раз тянули игровую случайность (тест: автопилот её не тянет)
export function rng() {
  if (rngOff) { if (strictRng) throw new Error(`${rngOff}: gameplay rng() used; take its own seeded rng`); return vrand(); }
  rngDraws++;
  return rngNext();
}
export function noGameRng(name, fn) { const prev = rngOff; rngOff = name; try { return fn(); } finally { rngOff = prev; } }
export function seedRandom(n) { rngNext = mulberry32(Number.isFinite(n) ? n >>> 0 : (vrand() * 4294967296) >>> 0); }
export const rand = (a, b) => a + rng() * (b - a);
export const vrand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const normAng = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angDiff = (a, b) => Math.abs(normAng(b - a));
export const turnToward = (cur, target, step) => { const d = normAng(target - cur); return Math.abs(d) <= step ? target : cur + Math.sign(d) * step; };
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// SPEC-011 AC 5: other modules change this module's state only through these setters (live bindings are read-only there)
export function setStrictRng(v) { return (strictRng = v); }
