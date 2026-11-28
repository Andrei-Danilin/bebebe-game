// SPEC-047 AC 5: the game's sounds — decoded AudioBuffers (loaded after the first gesture: the sounds and loops first, then the
// jingles), playing with at most AUDIO.MAX_VOICES at once (the oldest is stopped first) and no repeat of a name within its gap
// (AUDIO.RETRIGGER; the coin: one per 0.06 s), a delay for a sound that comes a moment later (the fall after a push), loops
// (setLoops: the client says which loops should sound, this module starts and stops them; a loop buffer's ends under -60 dBFS are the
// decoder's padding and stay outside loopStart / loopEnd, so a looped buffer has no gap). A sound that is not loaded (yet), failed to load or
// failed to decode asks `fallback` (its synth beep, or nothing). Nothing plays in sim mode; the requests are counted for the sim test
// (ui.sounds, outside sim). `log` keeps the last AUDIO.LOG_MAX plays for the tests. Client module.
import { LOOK } from "../look.js";
import { simMode } from "../screen.js";
import { ui } from "../state.js";
import { context, sfxOut } from "./engine.js";
import { duck, setMusicInfo } from "./music.js";

const A = LOOK.AUDIO;
const bufs = new Map();            // name → { buf, region: [start, end] seconds | null } — loaded and decoded
const failed = new Set();          // names whose file or decode failed (they play their synth beep)
const last = new Map();            // name → the start time of its latest play (s, context clock)
const loops = new Map();           // name → { src, gain } — the loops sounding now
const plays = [];                  // the last AUDIO.LOG_MAX plays: { name, at, n, synth?, loop?, other? }
let voices = [];                   // one-shots not finished: { name, src, gain, start, end, tag }
let loading = false, seq = 0;      // seq: the number of plays so far (each log entry's n: tests read what came after n)

// the Sounds switch (the home screen, key M, the grown-ups page; saved as settings.sfx)
export const sfxOn = () => ui.sfx;

// the samples of a loop buffer that carry sound: [start, end] seconds of the first and last sample above AUDIO.LOOP_EDGE (-60 dBFS)
export function loopRegion(buf) {
  const d = buf.getChannelData(0), n = d.length;
  let a = 0, b = n - 1;
  while (a < n && Math.abs(d[a]) < A.LOOP_EDGE) a++;
  while (b > a && Math.abs(d[b]) < A.LOOP_EDGE) b--;
  return a >= b ? [0, buf.duration] : [a / buf.sampleRate, (b + 1) / buf.sampleRate];
}

// ---------- loading ----------
async function loadOne(f) {
  try {
    const r = await fetch(A.dir + f.file);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = await context().decodeAudioData(await r.arrayBuffer());
    bufs.set(f.name, { buf, region: f.loop ? loopRegion(buf) : null, jingle: f.kind === "jingle" });
  } catch (e) { failed.add(f.name); }
}
async function loadAll(list) {
  let i = 0;
  const worker = async () => { while (i < list.length) await loadOne(list[i++]); };
  await Promise.all(Array.from({ length: A.LOAD_PARALLEL }, worker));
}
// the manifest, then the sounds and loops, then the jingles (music is streamed: music.js); once, after the context exists
export function loadSfx() {
  if (loading || !context()) return;
  loading = true;
  fetch(A.dir + "manifest.json").then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then(m => { setMusicInfo(m.files); return m; })      // the music tracks' shipped lengths (loop points)
    .then(m => loadAll(m.files.filter(f => f.kind === "sfx" || f.kind === "loop")).then(() => loadAll(m.files.filter(f => f.kind === "jingle"))))
    .catch(() => { /* no manifest: every sound plays its beep */ });
}

// ---------- playing ----------
function record(name, at, extra) {
  plays.push({ name, at, n: ++seq, ...extra });
  if (plays.length > A.LOG_MAX) plays.shift();
}
// stops a voice with a short fade (a click-free steal)
function stopVoice(v, now) {
  try {
    v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + A.STEAL_FADE); v.src.stop(now + A.STEAL_FADE + 0.01);
  } catch (e) { /* already stopped */ }
}
// Plays `name` once. opts: delay (s), gain (× — default 1), other (a bot's or Dad's sound: × AUDIO.OTHERS), tag (cancelPending). Counts the request
// (not in sim); then: sounds off / no context → nothing; the name's gap since its last start → nothing; no buffer → fallback() (its beep: true when played).
export function playSfx(name, opts = {}, fallback = null) {
  if (simMode) return false;
  ui.sounds++;
  const ctx = context();
  if (!sfxOn() || !ctx) return false;
  const now = ctx.currentTime, when = now + (opts.delay || 0), gap = A.GAP[name] ?? A.RETRIGGER, prev = last.get(name);
  if (prev !== undefined && Math.abs(when - prev) < gap) return false;
  const b = bufs.get(name);
  if (!b) {
    if (!fallback || opts.delay || !fallback()) return false;           // a beep has no delay: a delayed sound without its file stays silent
    last.set(name, when); record(name, when, { synth: true });
    return true;
  }
  voices = voices.filter(v => v.end > now);
  while (voices.length >= A.MAX_VOICES) stopVoice(voices.shift(), now);       // the oldest first
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = b.buf; gain.gain.value = (opts.other ? A.OTHERS : 1) * (opts.gain ?? 1);
  src.connect(gain); gain.connect(sfxOut());
  src.start(when);
  if (b.jingle) duck(when, b.buf.duration);                                    // the music dips under a jingle
  voices.push({ name, src, gain, start: when, end: when + b.buf.duration, tag: opts.tag });
  last.set(name, when);
  record(name, when, opts.other ? { other: true } : {});
  return true;
}
// stops the sounds with this tag that have not started yet (the win screen's count, when the screen is left)
export function cancelPending(tag) {
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of voices) if (v.tag === tag && v.start > now) { try { v.src.stop(); } catch (e) { /* not started */ } v.end = 0; }
  voices = voices.filter(v => v.end > now);
}

// ---------- loops ----------
function startLoop(name, b, ctx) {
  const src = ctx.createBufferSource(), gain = ctx.createGain(), now = ctx.currentTime;
  src.buffer = b.buf; src.loop = true;
  if (b.region) { src.loopStart = b.region[0]; src.loopEnd = b.region[1]; }
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + A.LOOP_FADE);
  src.connect(gain); gain.connect(sfxOut());
  src.start(now, b.region ? b.region[0] : 0);
  loops.set(name, { src, gain });
  record(name, now, { loop: true });
}
function stopLoop(l, ctx) {
  const now = ctx.currentTime;
  try { l.gain.gain.cancelScheduledValues(now); l.gain.gain.setValueAtTime(l.gain.gain.value, now); l.gain.gain.linearRampToValueAtTime(0, now + A.LOOP_FADE); l.src.stop(now + A.LOOP_FADE + 0.01); } catch (e) { /* already stopped */ }
}
// The loops that should sound now (names; the core's wantedLoops): the ones missing start, the ones gone stop. A loop whose buffer is not
// loaded yet starts on a later call. Sounds off or no context: none.
export function setLoops(wanted) {
  if (simMode) return;
  const ctx = context();
  if (!ctx) return;
  const want = sfxOn() ? wanted : [];
  for (const [name, l] of loops) if (!want.includes(name)) { stopLoop(l, ctx); loops.delete(name); }
  for (const name of want) { const b = bufs.get(name); if (b && !loops.has(name)) startLoop(name, b, ctx); }
}

// ---------- for the tests (__bb.audio) ----------
export const playLog = () => plays.map(p => ({ ...p }));
export const loadedNames = () => [...bufs.keys()].sort();
export const failedNames = () => [...failed].sort();
export const loopsPlaying = () => [...loops.keys()].sort();
export const voiceCount = () => { const ctx = context(); return ctx ? voices.filter(v => v.end > ctx.currentTime).length : 0; };
