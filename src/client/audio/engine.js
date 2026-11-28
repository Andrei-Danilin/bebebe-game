// SPEC-047 AC 4: the audio engine — the one AudioContext and its buses: master → music bus + sfx bus, each with a gain
// (AUDIO.MASTER, AUDIO.MUSIC_MENU / MUSIC_PLAY / MUSIC_PAUSE for music, 1 for sounds). Nothing exists before the first gesture:
// startEngine() is called by sound.js initAudio on a tap, key or pad press. Client module (no game state, no DOM but the context).
import { LOOK } from "../look.js";

const A = LOOK.AUDIO;
let ctx = null, master = null, music = null, sfx = null, stateHook = null;
// who hears of the context changing state (sound.js: "interrupted" — a call on iOS — pauses the music); one listener
export const onContextState = fn => { stateHook = fn; };

// the context and its buses (made once; null where Web Audio is missing or refused)
export function startEngine() {
  if (ctx) return ctx;
  try { const s = /** @type {any} */ (navigator).audioSession; if (s) s.type = "ambient"; } catch (e) { /* not on this browser */ }   // SPEC-047 AC 10: on iPhone the game's audio follows the silent switch
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = A.MASTER; master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = A.MUSIC_MENU; music.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    ctx.onstatechange = () => { if (stateHook) stateHook(ctx.state); };
  } catch (e) { ctx = master = music = sfx = null; }
  return ctx;
}
export const context = () => ctx;
// where a sound connects: the sfx bus (the context's destination if the buses are missing)
export const sfxOut = () => sfx || (ctx && ctx.destination);
export const musicOut = () => music;
// the bus gains as the tests read them (null before the context exists)
export const levels = () => (ctx ? { master: master.gain.value, music: music.gain.value, sfx: sfx.gain.value } : null);
