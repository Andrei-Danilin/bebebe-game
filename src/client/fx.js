// SPEC-011: the client's effects the core asks for: popText, burst, clientFx (the fx hook), bannerTick (the banner hook).
// Client module (moved out of index.html in Phase C).

import { TAU } from "../core/config.js";
import { vrand } from "../core/util.js";
import { LOOK } from "./look.js";
import { simMode } from "./screen.js";
import { ui } from "./state.js";

// ---------- Эффекты клиента (SPEC-011 AC 3b: логика зовёт их через hooks.pop / burst / shake / fx / banner) ----------
// meaning — что случилось (SPEC-020: "bang" | "hug" | "mega" | "kiss" | "out"): под надписью рисуется свой взрыв (POP_ART), необязательно
export function popText(x, y, text, color, meaning) { ui.texts.push({ x, y, text, color, t: 0, meaning, w: undefined }); }
export function burst(x, y, kind, color, n) {
  if (simMode) return;                   // в sim частиц нет (vrand, игровой rng() не трогают)
  for (let i = 0; i < n; i++) {
    const a = vrand(0, TAU), s = vrand(40, 140);
    ui.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === "heart" ? 60 : 0), t: 0, life: vrand(0.6, 1.1), kind, color });
  }
}
// летящие надписи, частицы, тряска (hooks.fx — из updateFx: в игре и в меню)
export function clientFx(dt) {
  for (const t of ui.texts) { t.t += dt; t.y -= 30 * dt; }
  ui.texts = ui.texts.filter(t => t.t < 1.2);
  for (const p of ui.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
  ui.particles = ui.particles.filter(p => p.t < p.life);
  ui.shake = Math.max(0, ui.shake - dt);
}
// надпись уровня гаснет, пока уровень идёт (hooks.banner — из update)
export function bannerTick(dt) { if (ui.banner && (ui.banner.t += dt) >= LOOK.BANNER_TIME) ui.banner = null; }
