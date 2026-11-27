// SPEC-011: Web Audio beeps: initAudio, soundOn, beep, SFX (the sfx hook). Client module (moved out of index.html in Phase
// C).

import { simMode } from "./screen.js";
import { ui } from "./state.js";

// =====================================================================
//  ЗВУК
// =====================================================================
let actx = null;
// a gesture (key, tap — pointerdown and pointerup —, pad button): the audio context starts, or resumes from any state but
// running (SPEC-025 AC 14: "suspended" after a hide, iOS "interrupted" after a call)
export function initAudio() {
  if (simMode) return;
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  else if (actx.state !== "running" && actx.state !== "closed") {
    try { const p = actx.resume(); if (p && p.catch) p.catch(() => { /* SPEC-025 AC 7c: not allowed yet — the next gesture tries again */ }); } catch (e) { /* ok */ }
  }
}
// SPEC-025 AC 14: the app went to the background — silence until the next gesture
export function suspendAudio() {
  if (!actx || actx.state !== "running") return;
  try { const p = actx.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ok */ }
}
export const audioContext = () => actx;   // for the tests (__bb.audioContext)
// звук можно играть? В sim — нет (и не считается); иначе считаем просьбу (тест sim) и смотрим, есть ли звук
function soundOn() { if (simMode) return false; ui.sounds++; return !!actx && !ui.muted; }
function beep(f, dur, type = "square", vol = 0.06, delay = 0) {
  if (!soundOn()) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
export const SFX = {
  push: () => { beep(180, 0.08, "sawtooth", 0.08); beep(90, 0.25, "sawtooth", 0.08, 0.05); },
  hug: () => { beep(660, 0.1, "triangle", 0.09); beep(880, 0.15, "triangle", 0.09, 0.09); },
  rescue: () => { beep(523, 0.1, "square", 0.05); beep(784, 0.18, "square", 0.05, 0.1); },
  out: () => { beep(330, 0.2, "triangle", 0.08); beep(220, 0.35, "triangle", 0.08, 0.18); },
  alert: () => beep(990, 0.07, "square", 0.04),
  bell: () => { beep(1568, 0.5, "sine", 0.07); beep(2093, 0.35, "sine", 0.04, 0.01); beep(1568, 0.5, "sine", 0.05, 0.28); },   // SPEC-042: the school bell (placeholder tones)
  crunch: () => beep(160, 0.04, "square", 0.012),                  // SPEC-042: a step in the snow (placeholder)
  splash: () => { beep(420, 0.07, "sine", 0.06); beep(640, 0.09, "sine", 0.05, 0.04); beep(300, 0.12, "triangle", 0.04, 0.09); },   // SPEC-042: a puddle's splash (placeholder tones)
  item: () => [660, 880, 1175].forEach((f, i) => beep(f, 0.09, "square", 0.05, i * 0.06)),
  shield: () => { beep(1200, 0.12, "triangle", 0.08); beep(1500, 0.18, "triangle", 0.06, 0.08); },
  star: () => [880, 1175, 1568, 2093].forEach((f, i) => beep(f, 0.08, "triangle", 0.06, i * 0.05)),
  kiss: () => { beep(1046, 0.06, "sine", 0.06); beep(1568, 0.1, "sine", 0.05, 0.05); },
  mwah: () => [784, 988, 1318].forEach((f, i) => beep(f, 0.1, "triangle", 0.07, i * 0.07)),
  thrown: () => { beep(520, 0.1, "triangle", 0.07); beep(260, 0.25, "triangle", 0.07, 0.08); },
  slip: () => { if (!soundOn()) return; const t0 = actx.currentTime; const o = actx.createOscillator(), g = actx.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(900, t0); o.frequency.exponentialRampToValueAtTime(180, t0 + 0.45); g.gain.setValueAtTime(0.09, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5); o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.52); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, "triangle", 0.08, i * 0.15)),
  lose: () => [392, 330, 262].forEach((f, i) => beep(f, 0.3, "triangle", 0.08, i * 0.25))
};
