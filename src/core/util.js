// SPEC-011: small helpers — distance, clamp, angles, and the gameplay randomness rng() (seeded, SPEC-008) next to the
// visual one vrand(). Core module.
import { CFG, TAU } from "./config.js";
import { G } from "./active.js";

// =====================================================================
//  ПОМОЩНИКИ
// =====================================================================
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// SPEC-034: the accumulator of live play. A frame adds its time (at most CFG.MAX_FRAME) to acc; n = whole CFG.STEP steps (at most
// CFG.MAX_STEPS, the excess is dropped); the sub-step remainder stays. The 1e-9 absorbs float error (20 frames of 0.05 s are 60 steps).
export function frameSteps(acc, frameTime) {
  acc += clamp(frameTime, 0, CFG.MAX_FRAME);
  const whole = Math.floor(acc / CFG.STEP + 1e-9);
  return { n: Math.min(whole, CFG.MAX_STEPS), acc: Math.max(0, acc - whole * CFG.STEP) };
}
// SPEC-008: случайность. Игровая — только rng() (mulberry32): __bb.seedRandom(n) задаёт зерно, без зерна — случайное
// (игра как раньше). rand() — игровой. Визуальная — vrand() на Math.random: частицы burst, сердечки при обнимашках,
// тряска камеры, снег, randomOutfit; она не трогает rng(), поэтому sim (без частиц) тянет тот же ряд, что и игра.
// Без зерна — случайное. SPEC-011 AC 8d: тесты задают window.__bbSeed — клиент сеет им игру при запуске (до первой игры).
// rngOff — имя кода, которому игровая случайность запрещена (генератор уровней, 3D, рисование): у него свой сид (lc.rng, mulberry32).
// Забыл взять свой rng: в тестах (strictRng, его включает openGame) — громкая ошибка; в игре — визуальная vrand(),
// чтобы начало уровня у игрока не сломалось, а посев игры остался цел.
export let rngOff = "", strictRng = false;   // strictRng: клиент включает из window.__bbStrictRng (тесты)
// SPEC-012: the stream of each game is G.rng = { s, draws } (plain data: mulberry32's state and how many times it was drawn)
export function rng() {
  if (rngOff) { if (strictRng) throw new Error(`${rngOff}: gameplay rng() used; take its own seeded rng`); return vrand(); }
  const st = G.rng;
  st.draws++;
  return rngStep(st);
}
export function noGameRng(name, fn) { const prev = rngOff; rngOff = name; try { return fn(); } finally { rngOff = prev; } }
// a stream from seed n (no number — random); seedRandom(n, st) starts stream st (default: the active game's) again from n
const seedOf = n => (Number.isFinite(n) ? n >>> 0 : (vrand() * 4294967296) >>> 0);
export const newRng = n => ({ s: seedOf(n), draws: 0 });
export function seedRandom(n, st = G.rng) { st.s = seedOf(n); }
export const rand = (a, b) => a + rng() * (b - a);
export const vrand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const normAng = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angDiff = (a, b) => Math.abs(normAng(b - a));
export const turnToward = (cur, target, step) => { const d = normAng(target - cur); return Math.abs(d) <= step ? target : cur + Math.sign(d) * step; };
// one step of mulberry32 on a stream's state (the same numbers as mulberry32(seed))
function rngStep(st) {
  let a = st.s | 0; a = a + 0x6D2B79F5 | 0; st.s = a;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
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
