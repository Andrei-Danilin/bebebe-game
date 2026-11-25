// SPEC-011 / SPEC-012 AC 5: the client's effects — popText, burst, clientFx (flying texts, particles, shake), bannerTick, and the
// drain of the core's effect events (drainEvents: sounds, particles, translated pop texts, shake, wide-push rings, hints);
// stepGame — one step of the local game as live play does it (devices → step → effects and their timers). Client module.

import { G } from "../core/active.js";
import { CFG, TAU } from "../core/config.js";
import { update } from "../core/game.js";
import { noGameRng, vrand } from "../core/util.js";
import { L } from "../i18n.js";
import { fillInputs } from "./input.js";
import { LOOK } from "./look.js";
import { simMode } from "./screen.js";
import { SFX } from "./sound.js";
import { ui } from "./state.js";
import { applyGameEvent, syncStock } from "./flow.js";

// ---------- Эффекты клиента ----------
// meaning — что случилось (SPEC-020: "bang" | "hug" | "mega" | "kiss" | "out"): под надписью рисуется свой взрыв (POP_ART), необязательно
export function popText(x, y, text, color, meaning) { ui.texts.push({ x, y, text, color, t: 0, meaning, w: undefined }); }
export function burst(x, y, kind, color, n) {
  if (simMode) return;                   // в sim частиц нет (vrand, игровой rng() не трогают)
  for (let i = 0; i < n; i++) {
    const a = vrand(0, TAU), s = vrand(40, 140);
    ui.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === "heart" ? 60 : 0), t: 0, life: vrand(0.6, 1.1), kind, color });
  }
}
// летящие надписи, частицы, тряска (каждый кадр: в игре и в меню)
export function clientFx(dt) {
  for (const t of ui.texts) { t.t += dt; t.y -= 30 * dt; }
  ui.texts = ui.texts.filter(t => t.t < 1.2);
  for (const p of ui.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
  ui.particles = ui.particles.filter(p => p.t < p.life);
  ui.shake = Math.max(0, ui.shake - dt);
}
// SPEC-022: кольца широкого толчка растут WAVE_TIME сек; вместе с надписями, частицами и тряской — вид каждого кадра
export function viewTick(dt) {
  clientFx(dt);
  for (const w of ui.waves) w.t += dt;
  ui.waves = ui.waves.filter(w => w.t < CFG.WAVE_TIME);
}
// надпись уровня гаснет, пока уровень идёт (каждый шаг игры)
export function bannerTick(dt) { if (ui.banner && (ui.banner.t += dt) >= LOOK.BANNER_TIME) ui.banner = null; }
// подсказки «Нажми 🩹» и «Папа услышал топот!» гаснут, пока уровень идёт (каждый шаг игры)
function hintTick(dt) { ui.kitHintT = Math.max(0, ui.kitHintT - dt); ui.heardHintT = Math.max(0, ui.heardHintT - dt); }

// ---------- SPEC-012 AC 5: the core's effect events ----------
// the text of a pop: an I18N key in the player's language (a function gets the args; a table gets args[0]); key null — args[0] itself
function popWords(e) {
  if (e.key == null) return e.args[0];
  const v = L()[e.key];
  return typeof v === "function" ? v(...e.args) : v && typeof v === "object" ? v[e.args[0]] : v;
}
function playEvent(e) {
  if (e.type === "sfx") SFX[e.name]();
  else if (e.type === "burst") burst(e.x, e.y, e.kind, e.color, e.n);
  else if (e.type === "pop") popText(e.x, e.y, popWords(e), e.color, e.meaning);
  else if (e.type === "shake") ui.shake = e.t;
  else if (e.type === "wave") ui.waves.push({ x: e.x, y: e.y, t: 0, r: e.r });
  else if (e.type === "hint") {
    const pi = G.littles.findIndex(l => l.slot === e.slot);
    if (e.kind === "kit") { ui.kitHintT = CFG.KIT_HINT_TIME; ui.kitHintPi = pi; }
    else if (e.kind === "kitOff" && ui.kitHintPi === pi) ui.kitHintT = 0;
    else if (e.kind === "heard") { ui.heardHintT = CFG.HEAR_HINT_TIME; ui.heardHintPi = pi; }
    // "practice": the HUD reads the practice hint step from the game (G.tut.hint)
  }
  else if (e.type === "game") applyGameEvent(e.e);           // SPEC-012 AC 6 / 10: coins, spent, result, practiceWin
  // "mood": the 3D face and the mood sprites read Dad's mood from the game every frame
}
// empty the game's effect queue into sounds, particles, texts, shake, rings and hints (client code: no gameplay rng)
export function drainEvents(g = G) {
  if (!g || !g.fx || !g.fx.length) return;
  const list = g.fx;
  g.fx = [];
  noGameRng("fx", () => { for (const e of list) playEvent(e); });
}
// one step of the local game: the players' devices into their slots, the step, then its effects and their timers (the hints
// age before the new ones arrive; texts, particles and rings age after, as when the core played them inside the step)
export function stepGame(dt) {
  syncStock();
  fillInputs();
  bannerTick(dt);
  update(dt);
  hintTick(dt);
  drainEvents();
  for (const l of G.littles) if (l.hugAnim > 0 && vrand() < dt * 6) burst(G.big.x, G.big.y - 20, "heart", "#ff4d8d", 1);   // сердечки, пока обнимает
  viewTick(dt);
}
