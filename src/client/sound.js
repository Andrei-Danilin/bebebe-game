// SPEC-011: Web Audio beeps: initAudio, beep, SFX (the synth beeps). SPEC-047: the real sounds are src/client/audio/ (engine.js: the context and
// its buses, sfx.js: the files); playSound(name) plays a name's file and, when it is not loaded or failed, its beep from here (or nothing, if it
// has none). The context starts on the first gesture (initAudio). Client module (moved out of index.html in Phase C).

// The single entry point to src/client/audio/: flow, fx, main and debug use the audio through the names exported here, never the audio folder directly.
import { wantedLoops } from "../core/soundloops.js";
import { G } from "../core/active.js";
import { levels as busLevels, onContextState, sfxOut, startEngine } from "./audio/engine.js";
import { currentTrack, musicInfo, musicPaused, musicTick, nudgeMusic, pauseMusic, resumeMusic, seekMusic, unlockMusic } from "./audio/music.js";
import { cancelPending, decodedBytes, failedNames, loadedNames, loadSfx, loopRegion, loopsPlaying, playLog, playSfx, setLoops, sfxOn, voiceCount } from "./audio/sfx.js";
import { LOOK } from "./look.js";
import { simMode } from "./screen.js";
import { mode, ui } from "./state.js";

export { cancelPending };

// =====================================================================
//  ЗВУК
// =====================================================================
let actx = null;
// a gesture (key, tap — pointerdown and pointerup —, pad button): the audio context starts, or resumes from any state but
// running (SPEC-025 AC 14: "suspended" after a hide, iOS "interrupted" after a call)
export function initAudio() {
  if (simMode) return;
  if (!actx) {                                                   // SPEC-047: the context, its buses, the sounds' files, the music's elements — nothing exists before this
    actx = startEngine();
    if (actx) { onContextState(s => { if (s === "interrupted") pauseMusic(); }); loadSfx(); }   // a call on iOS: the music pauses, the next gesture plays it again
  } else if (actx.state !== "running" && actx.state !== "closed") {
    try { const p = actx.resume(); if (p && p.catch) p.catch(() => { /* SPEC-025 AC 7c: not allowed yet — the next gesture tries again */ }); } catch (e) { /* ok */ }
  }
  unlockMusic();                                                 // SPEC-047: every gesture unlocks the music elements that are not unlocked yet (WebKit: only a release counts, not the touch)
  resumeMusic();                                                 // SPEC-047 AC 10: after the background / a call the first gesture plays the paused music again
  nudgeMusic();                                                  // and every gesture plays what should be playing but is not (a refused play(), an element the system paused)
}
// SPEC-025 AC 14: the app went to the background — silence until the next gesture
export function suspendAudio() {
  pauseMusic();                                                  // SPEC-047 AC 10: the music's elements pause with the context
  if (!actx || actx.state !== "running") return;
  try { const p = actx.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ok */ }
}
export const audioContext = () => actx;   // for the tests (__bb.audioContext)
// can a beep sound? Not in sim, not before the first gesture, not with the sounds off (the request is counted by sfx.js playSfx, once per sound)
const canBeep = () => !simMode && !!actx && sfxOn();
function beep(f, dur, type = "square", vol = 0.06, delay = 0) {
  if (!canBeep()) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(sfxOut());
  o.start(t0); o.stop(t0 + dur + 0.02);
}
export const SFX = {
  push: () => { beep(180, 0.08, "sawtooth", 0.08); beep(90, 0.25, "sawtooth", 0.08, 0.05); },
  hug: () => { beep(660, 0.1, "triangle", 0.09); beep(880, 0.15, "triangle", 0.09, 0.09); },
  rescue: () => { beep(523, 0.1, "square", 0.05); beep(784, 0.18, "square", 0.05, 0.1); },
  out: () => { beep(330, 0.2, "triangle", 0.08); beep(220, 0.35, "triangle", 0.08, 0.18); },
  alert: () => beep(990, 0.07, "square", 0.04),
  bell: () => { beep(1568, 0.5, "sine", 0.07); beep(2093, 0.35, "sine", 0.04, 0.01); beep(1568, 0.5, "sine", 0.05, 0.28); },   // SPEC-042: the school bell (placeholder tones)
  sprinkler: () => [880, 1046, 1318].forEach((f, i) => beep(f, 0.05, "sine", 0.03, i * 0.05)),   // SPEC-042: a sprinkler starts to spray (placeholder)
  truck: () => [659, 784, 659, 523].forEach((f, i) => beep(f, 0.13, "triangle", 0.04, i * 0.14)),   // SPEC-042: the ice-cream truck's tune (placeholder)
  wave: () => { beep(260, 0.25, "sine", 0.05); beep(330, 0.3, "sine", 0.035, 0.12); },   // SPEC-042: a wave comes up (placeholder)
  kick: () => { beep(140, 0.08, "triangle", 0.09); beep(210, 0.06, "square", 0.04, 0.03); },   // SPEC-043: a ball is kicked / bounces (placeholder tones)
  bonk: () => { beep(330, 0.06, "square", 0.08); beep(110, 0.18, "triangle", 0.09, 0.05); },   // SPEC-043: the ball bonks Dad
  whee: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.08, "sine", 0.04, i * 0.05)),   // SPEC-043: the paper plane takes off
  munch: () => [220, 180, 240, 190].forEach((f, i) => beep(f, 0.07, "triangle", 0.05, i * 0.1)),   // SPEC-043: Dad eats the cupcake
  freeze: () => { beep(1760, 0.1, "sine", 0.05); beep(1318, 0.14, "sine", 0.04, 0.07); beep(988, 0.2, "triangle", 0.03, 0.14); },   // SPEC-043: the snowball freezes Dad
  crunch: () => beep(160, 0.04, "square", 0.012),                  // SPEC-042: a step in the snow (placeholder)
  splash: () => { beep(420, 0.07, "sine", 0.06); beep(640, 0.09, "sine", 0.05, 0.04); beep(300, 0.12, "triangle", 0.04, 0.09); },   // SPEC-042: a puddle's splash (placeholder tones)
  item: () => [660, 880, 1175].forEach((f, i) => beep(f, 0.09, "square", 0.05, i * 0.06)),
  shield: () => { beep(1200, 0.12, "triangle", 0.08); beep(1500, 0.18, "triangle", 0.06, 0.08); },
  star: () => [880, 1175, 1568, 2093].forEach((f, i) => beep(f, 0.08, "triangle", 0.06, i * 0.05)),
  kiss: () => { beep(1046, 0.06, "sine", 0.06); beep(1568, 0.1, "sine", 0.05, 0.05); },
  mwah: () => [784, 988, 1318].forEach((f, i) => beep(f, 0.1, "triangle", 0.07, i * 0.07)),
  thrown: () => { beep(520, 0.1, "triangle", 0.07); beep(260, 0.25, "triangle", 0.07, 0.08); },
  slip: () => { if (!canBeep()) return; const t0 = actx.currentTime; const o = actx.createOscillator(), g = actx.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(900, t0); o.frequency.exponentialRampToValueAtTime(180, t0 + 0.45); g.gain.setValueAtTime(0.09, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5); o.connect(g); g.connect(sfxOut()); o.start(t0); o.stop(t0 + 0.52); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, "triangle", 0.08, i * 0.15)),
  lose: () => [392, 330, 262].forEach((f, i) => beep(f, 0.3, "triangle", 0.08, i * 0.25))
};
// SPEC-047: the beep a sound plays when its file is not loaded (yet), failed to load or failed to decode: an old beep, or none (the sounds that
// are new in SPEC-047 and have no beep play nothing). The names that SPEC-042 / 043 have no file for (munch, kick, bonk, whee, freeze, bell,
// sprinkler, truck, wave, crunch, splash) are beeps of their own name.
const SYNTH_OF = Object.freeze({ hug_mega: "hug", wide_push: "push", heard: "alert", kind: "mwah", boots: "item", cloak: "item", pickup: "item",
  kiss_hit: "mwah", kit: "rescue", thrown_out: "thrown", star_1: "star", star_2: "star", star_3: "star", buy: "item", nope: "out", unlock: "star" });
function synthFor(name) {
  const f = Object.hasOwn(SFX, SYNTH_OF[name] ?? name) && SFX[SYNTH_OF[name] ?? name];
  if (!f || !canBeep()) return false;
  f();
  return true;
}
// the one way to make a sound: its file (loaded after the first gesture), else its beep. opts: delay (s), gain (×), other (a bot's / Dad's: × AUDIO.OTHERS),
// tag (cancelPending). → true when something sounded. A new sound's file is added in assets/audio (npm run audio), never here.
export const playSound = (name, opts = {}) => playSfx(name, opts, () => synthFor(name));
// SPEC-047 AC 8: the sound of pressing a button — by what it is: "back" (the back / close buttons; goBack plays its own), "page" (comic chapters,
// tabs, the world tabs), "tap" for the rest; nothing for the buttons that have sounds of their own (buy, upgrades, 💋 / 🩹, the comic's own
// pages). `hit` = a registered button { id, act }. Called by input.js on a press (and the tapButton shim of the tests).
const OWN_SOUND = /^(buy:|buy-look:|upg:|kiss:|kit:|scene:)/, BACK_ACT = /^(closeShop|closeCard|closeTip|backToWardrobe|storyBackKey|toMap|toHome)$/, PAGE_ID = /^(story:(prev|next)|tab:|maptab:)/;
export function clickSound(hit) {
  const id = hit.id || "", fn = hit.act ? hit.act.name : "";
  if (OWN_SOUND.test(id) || fn === "goBack") return false;
  if (/^(back:|card:close|tip:close)/.test(id) || (id === "tip:ok" && !ui.tipPlay) || BACK_ACT.test(fn)) return playSound("back");
  return playSound(PAGE_ID.test(id) ? "page" : "tap");
}
// the win screen counts its reward in sound (the screen shows the numbers at once): after the jingle starts, each star (star_1, star_2, star_3)
// and then a coin per coin earned (at most AUDIO.WIN_COUNT.coinMax), one per AUDIO.WIN_COUNT.coin s. Tag "win": leaving the screen cancels what is still to come.
export function winCountSounds(reward) {
  if (!reward) return;
  const W = LOOK.AUDIO.WIN_COUNT;
  let t = W.start;
  for (let k = 1; k <= Math.min(3, reward.stars || 0); k++, t += W.star) playSound("star_" + k, { delay: t, tag: "win" });
  for (let i = 0; i < Math.min(W.coinMax, reward.coins || 0); i++, t += W.coin) playSound("coin", { delay: t, tag: "win" });
}

// ---------- who is on this device, loops, the frame (SPEC-047) ----------
// the slots of the players on this device: their sounds are full volume; a bot's, Dad's and (online) a friend's play at AUDIO.OTHERS
// (and "big" when a player moves Dad on this device: G.big.player)
const localSlots = () => {
  if (!G || !G.littles) return [];
  const slots = G.littles.filter(l => l.kind === "player").map(l => l.slot);
  if (G.big && G.big.player) slots.push("big");
  return slots;
};
export const isOther = slot => !!slot && !localSlots().includes(slot);
// the one owner of the audio's per-frame work (main.js calls it every frame): the music follows the screen, the loops follow the level (none outside play).
// An audio failure is logged once and never stops the frame
let tickLogged = false;
export function audioTick() {
  if (simMode) return;
  try {
    musicTick();
    setLoops(mode === "play" ? wantedLoops(localSlots()) : []);
  } catch (e) { if (!tickLogged) { tickLogged = true; console.error("audio:", e); } }
}
// for the tests (__bb.audio): getters over the audio's state, and tick() = one audioTick (a test that moves the game by hand asks for the loops this way)
export const audioDebug = {
  get log() { return playLog(); }, get track() { return currentTrack(); }, get music() { return musicInfo(); }, get levels() { return busLevels(); },
  get loaded() { return loadedNames(); }, get failed() { return failedNames(); }, get loops() { return loopsPlaying(); }, get voices() { return voiceCount(); },
  get settings() { return { music: ui.music, sfx: ui.sfx }; }, get musicPaused() { return musicPaused(); }, get decodedBytes() { return decodedBytes(); },
  loopRegion, seekMusic, tick: audioTick
};
