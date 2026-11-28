// SPEC-047 AC 6 / 7: the music — streamed, never decoded: every track is two HTMLAudioElements (A and B) through MediaElementSourceNodes into
// one gain per track, into the music bus. The two play alternately: B starts under the end of A and the two cross over AUDIO.LOOP_XFADE (2 s,
// equal power) before A's last AUDIO.LOOP_XFADE seconds, so MP3 padding never makes a gap. The loop point is the shipped length (manifest `dur`, else the element's
// own); the check runs on the element's timeupdate and every frame, and the fade itself is scheduled on the audio clock.
// Which track plays where: wantedTrack() (the table of AC 7). A change of screen crossfades over AUDIO.SCREEN_XFADE (the old track fades out,
// the new one in); the same track goes on across screens (menu → map → a Park level). A track that is not loaded yet (a world not heard before,
// offline) plays `theme` until it is, then crossfades; one that fails stays on `theme` (and is tried again after AUDIO.MUSIC_RETRY s). The bus is at MUSIC_MENU in
// menus, MUSIC_PLAY in play, MUSIC_PAUSE in pause, and dips to JINGLE_DIP under a jingle. Nothing in sim mode, nothing before the first gesture (no context),
// nothing in a hidden tab, nothing with the music off (musicOn).
// iOS plays an element only when a gesture started it once (and counts only a release, not the touch), and refuses play() from a frame or an event: so a small pool of
// elements (AUDIO.POOL) is started and stopped inside a gesture (unlockMusic, at every gesture, for the elements not yet unlocked) and reused for every track (only their src changes); and every later gesture plays again what should be playing
// (nudgeMusic): a refused play() never leaves the music stopped for good. Client module.
import { G } from "../../core/active.js";
import { levelsPerWorld } from "../../core/config.js";
import { LOOK } from "../look.js";
import { simMode } from "../screen.js";
import { mode, ui } from "../state.js";
import { context, musicOut } from "./engine.js";

const A = LOOK.AUDIO;
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";   // an empty wav: what the pool's elements play in the gesture
const tracks = new Map();          // name → a loaded or loading track (see makeTrack)
const lengths = new Map();         // name → the shipped length in s (manifest), set by sfx.js when the manifest arrives
const pool = [];                   // parts (an element + its source node + its gain) unlocked in the first gesture; free ones wait here
let current = null;                // the track that sounds (fading in or in): its name
let songFor = null;                // the ending scene (ui.storyScene) whose song has played to its end: this visit goes on with theme
let applied = "";                  // the bus level last set (level + duck end)
let duckEnd = 0;                   // the context time the jingle in progress ends
let paused = false;                // the app is in the background (or a call): the elements are paused until the next gesture
let ids = 0;                       // every element pair gets its own number (tests: the same track is the same pair)
let logged = false;                // one error line for an audio failure in musicTick (it never stops the frame)

// the Music switch (the home screen, key N, the grown-ups page; saved as settings.music)
export const musicOn = () => ui.music;

// the manifest's lengths: loop points come from the shipped file, not from what a browser says; also which tracks exist (levelTrack)
export function setMusicInfo(files) { for (const f of files) if (f.kind === "music" || f.kind === "song") lengths.set(f.name, f.dur); }
const exists = name => lengths.size === 0 || lengths.has(name);      // before the manifest is there every track is taken to exist

// ---------- which track plays where (AC 7) ----------
const levelTrack = () => {
  if (G.level === levelsPerWorld() && exists("boss")) return "boss";
  return G.world !== "park" && exists("world_" + G.world) ? "world_" + G.world : "theme";   // a world without a track of its own plays theme
};
export function wantedTrack() {
  if (mode === "scene") {                                     // the cards: "How it began", the tutorial pictures, the boss / bonus cards → story; the ending → its song, once
    const id = ui.storyScene && ui.storyScene.id;
    return id === "ending" ? (songFor === ui.storyScene ? "theme" : "theme_song") : "story";
  }
  if (mode === "story") return "story";                       // How to play, the Story chapters
  if (mode === "play" || mode === "pause" || mode === "win" || mode === "lose") return G.tutorialGame ? "story" : levelTrack();   // practice games: story; a level: its world's track
  return "theme";                                             // home, map, level card, character, grown-ups, language
}
const levelFor = () => (mode === "play" ? A.MUSIC_PLAY : mode === "pause" ? A.MUSIC_PAUSE : A.MUSIC_MENU);

// ---------- fades on the audio clock ----------
// a gain moves from its value now to `to` in `sec` s along an equal-power curve (up: the sine quarter, down: the cosine quarter)
function fade(param, to, sec, now) {
  const from = param.value, up = to > from, n = A.CURVE_N, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * Math.PI / 2; c[i] = up ? from + (to - from) * Math.sin(x) : to + (from - to) * Math.cos(x); }
  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);
  if (sec > 0 && from !== to) param.setValueCurveAtTime(c, now, sec); else param.setValueAtTime(to, now);
}
const play = part => {
  part.want = true;
  const p = part.el.play();
  if (p && p.then) p.then(() => { part.unlocked = true; }, () => { /* refused (iOS outside a gesture, autoplay): part.want stays, the next gesture plays it (nudgeMusic) */ });
};

// ---------- the pool of unlocked elements ----------
function newPart(ctx) {
  const el = new Audio(), g = ctx.createGain();
  el.preload = "auto"; el.loop = false;
  const src = ctx.createMediaElementSource(el);
  g.gain.value = 0; src.connect(g);
  const part = { el, g, src, want: false, owner: null, free: true, unlocked: false, unlocking: false };
  // one set of listeners for the element's whole life: they act for the track that owns it now
  el.addEventListener("canplaythrough", () => { if (part.owner && part.owner.parts[0] === part) part.owner.ready = true; });
  el.addEventListener("error", () => { if (part.owner && part.owner.parts[0] === part) part.owner.failed = true; });
  el.addEventListener("ended", () => { if (part.owner) part.owner.ended = true; });
  el.addEventListener("timeupdate", () => { if (part.owner) loopCheck(part.owner); });
  return part;
}
// WebKit counts only a release (pointerup, touchend, a key) as a user activation, never the touch itself: so every gesture calls this (sound.js initAudio), and each
// element is played once inside one that works — the pool's free ones with an empty file, one a track already owns (the standby, which no gesture plays) muted — and then
// plays later without a gesture. A part is unlocked when that play() resolves; one that was refused (the touch) is tried again at the next gesture.
export function unlockMusic() {
  const ctx = context();
  if (simMode || !ctx) return;
  while (pool.length < A.POOL) pool.push(newPart(ctx));
  for (const part of pool) if (!part.unlocked && !part.unlocking) unlockPart(part);
}
function unlockPart(part) {
  if (part.want || !part.el.paused) return;                          // it is playing (or about to be): a refused play is nudgeMusic's, a playing one is unlocked already
  const el = part.el, bare = !el.getAttribute("src"), at = el.currentTime;
  if (bare) el.src = SILENT;
  part.unlocking = true;
  const clean = ok => {
    part.unlocking = false;
    if (ok) part.unlocked = true;
    if (part.want) return;                                           // a track started it meanwhile: leave it
    try {
      el.pause();
      if (el.getAttribute("src") === SILENT) { el.removeAttribute("src"); el.load(); }   // (a src the owner set since stays)
      else if (!bare && ok) el.currentTime = at;
    } catch (e) { /* gone */ }
  };
  let p;
  try { p = el.play(); } catch (e) { clean(false); return; }
  if (p && p.then) p.then(() => clean(true), () => clean(false)); else clean(true);
}
function takePart(ctx) {
  const part = pool.find(p => p.free) || (pool.push(newPart(ctx)), pool[pool.length - 1]);   // an extra one is made when the pool runs dry (not unlocked)
  part.free = false; part.want = false;
  try { part.el.pause(); } catch (e) { /* ok */ }
  return part;
}
function releasePart(part) {
  part.owner = null; part.want = false; part.free = true;
  try { part.el.pause(); part.el.removeAttribute("src"); part.el.load(); part.g.gain.cancelScheduledValues(0); part.g.gain.value = 0; part.g.disconnect(); } catch (e) { /* gone */ }
}

// ---------- tracks ----------
function makeTrack(name, ctx) {
  const out = ctx.createGain();
  out.gain.value = 0; out.connect(musicOut());
  const parts = [takePart(ctx), takePart(ctx)];
  const t = { name, id: ++ids, out, parts, active: 0, ready: false, failed: false, failedAt: 0, once: name === "theme_song", ended: false, xfade: 0, loopWait: 0, disposeAt: 0, standby: false };
  for (const p of parts) { p.owner = t; p.g.connect(out); p.g.gain.value = 0; }
  parts[0].el.src = A.dir + name + ".mp3";
  return t;
}
function disposeTrack(t) {
  for (const p of t.parts) if (p.owner === t) releasePart(p);
  try { t.out.disconnect(); } catch (e) { /* gone */ }
  tracks.delete(t.name);
}
const lengthOf = t => lengths.get(t.name) ?? t.parts[t.active].el.duration;

// the standby element loads from the moment its track plays (a whole track is ~1 MB: it is streamed, not decoded)
function prepareStandby(t) {
  if (t.once || t.standby) return;
  t.standby = true;
  t.parts[1 - t.active].el.src = A.dir + t.name + ".mp3";
}
// the end of the active element is near: the other one starts from 0 and the two cross over (equal power); then the old one rests at 0.
// A refused play() of the other one takes the crossfade back (the active one goes on) and is tried again after AUDIO.BLOCKED_WAIT s or at the next gesture
function loopCheck(t) {
  const ctx = context();
  if (!ctx || t.once || t.name !== current || t.xfade || paused) return;
  const a = t.parts[t.active].el, dur = lengthOf(t), now = ctx.currentTime;
  if (!(dur > A.LOOP_XFADE * 2) || a.currentTime < dur - A.LOOP_XFADE || now < t.loopWait) return;
  const b = t.parts[1 - t.active];
  if (b.el.readyState < 2 && a.currentTime < dur - A.STANDBY_LAST) return;     // the standby is not there yet: wait for the last moment, then go without
  const f = Math.max(A.XFADE_MIN, Math.min(A.LOOP_XFADE, dur - a.currentTime));
  try { b.el.currentTime = 0; } catch (e) { /* not seekable yet */ }
  b.want = true;
  const p = b.el.play();
  if (p && p.catch) p.catch(() => abortLoop(t, b));
  fade(b.g.gain, 1, f, now);
  fade(t.parts[t.active].g.gain, 0, f, now);
  t.xfade = now + f + A.XFADE_PAD;
}
function abortLoop(t, b) {
  const ctx = context();
  if (!ctx || !t.xfade) return;
  const now = ctx.currentTime;
  b.want = false;
  try { b.el.pause(); } catch (e) { /* ok */ }
  fade(t.parts[t.active].g.gain, 1, A.ABORT_FADE, now);
  fade(b.g.gain, 0, A.ABORT_FADE, now);
  t.xfade = 0; t.loopWait = now + A.BLOCKED_WAIT;
}
function finishLoop(t, ctx) {
  const old = t.parts[t.active];
  old.want = false; old.el.pause();
  try { old.el.currentTime = 0; } catch (e) { /* ok */ }
  old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.value = 0;
  t.active = 1 - t.active; t.xfade = 0; t.ended = false;
}
// (re)starts a track from its beginning on part 0: whatever it was doing — fading out, in the middle of a loop crossfade — is taken back first
function startTrack(t, ctx, now) {
  for (let i = 0; i < 2; i++) if (t.parts[i].owner !== t) {      // the resting element went back to the pool while the track faded out: take one again
    const p = takePart(ctx);
    p.owner = t; p.g.connect(t.out); p.g.gain.value = 0; t.parts[i] = p; t.standby = false;
  }
  const [a, b] = t.parts;
  if (!a.el.getAttribute("src")) a.el.src = A.dir + t.name + ".mp3";
  t.active = 0; t.xfade = 0; t.ended = false; t.disposeAt = 0; t.loopWait = 0;
  for (const p of t.parts) p.g.gain.cancelScheduledValues(now);
  b.want = false; try { b.el.pause(); b.el.currentTime = 0; } catch (e) { /* ok */ }
  b.g.gain.value = 0;
  a.g.gain.value = 1;
  try { a.el.currentTime = 0; } catch (e) { /* ok */ }
  play(a);
  fade(t.out.gain, 1, A.SCREEN_XFADE, now);
}
function fadeOutTrack(t, ctx, now) {
  if (!t.xfade && t.parts[1 - t.active].owner === t) { releasePart(t.parts[1 - t.active]); t.standby = false; }   // the resting element is not needed while it fades: back to the pool at once
  fade(t.out.gain, 0, A.SCREEN_XFADE, now);
  t.disposeAt = now + A.SCREEN_XFADE + A.DISPOSE_PAD;
}

// ---------- the bus ----------
function applyLevel(ctx) {
  const target = levelFor(), key = target + ":" + duckEnd;
  if (key === applied) return;
  applied = key;
  const g = musicOut().gain, now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  if (duckEnd > now) {
    const low = Math.min(target, A.JINGLE_DIP);
    g.linearRampToValueAtTime(low, now + A.DUCK_IN);
    g.setValueAtTime(low, duckEnd);
    g.linearRampToValueAtTime(target, duckEnd + A.JINGLE_BACK);
  } else g.linearRampToValueAtTime(target, now + A.LEVEL_RAMP);
}
// a jingle sounds from `at` for `len` s: the music dips to JINGLE_DIP and comes back over JINGLE_BACK s (called by sfx.js)
export function duck(at, len) {
  duckEnd = Math.max(duckEnd, at + len);
  applied = "";
  const ctx = context();
  if (ctx && !simMode) applyLevel(ctx);
}

// the app went to the background / a call (or the context was interrupted): the elements that play pause (the context is suspended by sound.js: the fades on its clock wait too);
// the first gesture after it plays them again (SPEC-047 AC 10)
export function pauseMusic() {
  if (paused) return;
  paused = true;
  for (const t of tracks.values()) for (const p of t.parts) { try { p.el.pause(); } catch (e) { /* ok */ } }
}
export function resumeMusic() {
  if (!paused) return;
  paused = false;
  nudgeMusic();
}
// every gesture: whatever of the sounding track should be playing but is not (play() was refused, the element was paused by the system) plays again;
// a track whose active element has run out starts its loop crossfade (the standby is unlocked: it plays outside a gesture too, this is the safety net)
export function nudgeMusic() {
  const ctx = context(), t = tracks.get(current);
  if (simMode || !ctx || paused || !t) return;
  for (const p of t.parts) if (p.want && p.el.paused && p.el.getAttribute("src") && !p.el.ended) play(p);
  const a = t.parts[t.active];
  if (!t.once && !t.xfade && a.el.ended) { t.loopWait = 0; loopCheck(t); }
  if (t.once && a.el.ended) t.ended = true;
}

// ---------- every frame ----------
// called by sound.js audioTick every frame: chooses the track, starts, crossfades and disposes, keeps the bus level going. An audio failure is logged once and never stops the frame
export function musicTick() {
  try { tick(); } catch (e) { if (!logged) { logged = true; console.error("music:", e); } }
}
function tick() {
  const ctx = context();
  if (simMode || !ctx || paused || ctx.state !== "running") return;   // nothing in the background, a call or before the context runs
  const now = ctx.currentTime;
  applyLevel(ctx);
  for (const t of [...tracks.values()]) {
    if (t.xfade && now >= t.xfade) finishLoop(t, ctx);
    else if (t.ended && !t.xfade && !t.once && t.name === current) loopCheck(t);
    if (t.disposeAt && now >= t.disposeAt) disposeTrack(t);
  }
  const cur = tracks.get(current);
  if (cur && cur.once && cur.ended && mode === "scene") songFor = ui.storyScene;                    // the song reached its end: theme follows (a new visit to the ending is a new scene: the song plays again)
  const want = musicOn() ? wantedTrack() : null;
  if (want === null || document.hidden) {
    if (want === null) {                                                                           // music off: the sounding track fades out, the others go, nothing starts
      for (const t of [...tracks.values()]) { if (t === cur) { if (!t.disposeAt) fadeOutTrack(t, ctx, now); } else if (!t.disposeAt) disposeTrack(t); }
      current = null;
    }
    return;
  }
  // a track that is wanted loads (a failed one is tried again after AUDIO.MUSIC_RETRY s: its record goes with it)
  const load = name => {
    const t = tracks.get(name);
    if (t && t.failed) {
      if (!t.failedAt) t.failedAt = now;
      if (now - t.failedAt > A.MUSIC_RETRY) disposeTrack(t);
      return null;
    }
    if (t) return t;
    const n = makeTrack(name, ctx);
    tracks.set(name, n);
    return n;
  };
  const wanted = load(want);
  const fallback = want !== "theme" && !(wanted && wanted.ready && !wanted.failed);   // theme is kept loaded only while the wanted track is not there yet
  // the track to play: the wanted one once it is loaded, else theme (when it is)
  const ready = t => t && t.ready && !t.failed;
  if (fallback) load("theme");
  const pick = ready(wanted) ? wanted : want !== "theme" && ready(tracks.get("theme")) ? tracks.get("theme") : null;
  if (pick && pick.name !== current) {
    if (cur) fadeOutTrack(cur, ctx, now);
    startTrack(pick, ctx, now);
    current = pick.name;
  }
  const playing = tracks.get(current);
  if (playing && !playing.once) prepareStandby(playing);
  // tracks nobody needs any more go (not the one sounding or fading, not the wanted one, not theme)
  for (const [name, t] of [...tracks]) if (name !== current && name !== want && !(name === "theme" && fallback) && !t.disposeAt) disposeTrack(t);
}

// ---------- for the tests (__bb.audio) ----------
export const currentTrack = () => current;
export const musicPaused = () => paused;
const withSrc = t => t.parts.filter(p => p.owner === t && p.el.getAttribute("src") && p.el.getAttribute("src") !== SILENT);
// the sounding pair: { track, id, time (s of the playing element), dur, pair (its elements with a file: 1 while it loads / for the song, else 2), elements (all alive),
// playing (elements that are playing now, of all tracks), crossing (the loop crossfade is on) }
export function musicInfo() {
  const t = tracks.get(current);
  let elements = 0, playing = 0;
  for (const x of tracks.values()) { elements += withSrc(x).length; playing += x.parts.filter(p => p.owner === x && !p.el.paused && p.el.getAttribute("src")).length; }
  return t ? { track: t.name, id: t.id, time: t.parts[t.active].el.currentTime, dur: lengthOf(t), pair: withSrc(t).length, elements, playing, crossing: !!t.xfade }
    : { track: null, id: 0, time: 0, dur: 0, pair: 0, elements, playing, crossing: false };
}
// seeks the playing element (the ending's song is 80 s long: a test goes to its last seconds)
export function seekMusic(sec) { const t = tracks.get(current); if (t) t.parts[t.active].el.currentTime = sec; }
