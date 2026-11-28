// SPEC-047 AC 6 / 7: the music — streamed, never decoded: every track is two HTMLAudioElements (A and B) through MediaElementSourceNodes into
// one gain per track, into the music bus. The two play alternately: B starts under the end of A and the two cross over AUDIO.LOOP_XFADE (2 s,
// equal power) before A's last AUDIO.LOOP_XFADE seconds, so MP3 padding never makes a gap. The loop point is the shipped length (manifest `dur`, else the element's
// own); the check runs every frame and on the element's timeupdate, and the fade itself is scheduled on the audio clock.
// Which track plays where: wantedTrack() (the table of AC 7). A change of screen crossfades over AUDIO.SCREEN_XFADE (the old track fades out,
// the new one in); the same track goes on across screens (menu → map → a Park level). A track that is not loaded yet (a world not heard before,
// offline) plays `theme` until it is, then crossfades; one that fails stays on `theme`. The bus is at MUSIC_MENU in menus, MUSIC_PLAY in play,
// MUSIC_PAUSE in pause, and dips to JINGLE_DIP under a jingle. Nothing in sim mode, nothing before the first gesture (no context), nothing in a hidden tab,
// nothing with the music off (musicOn: the one place the Music switch changes, step 4). Client module.
import { G } from "../../core/active.js";
import { levelsPerWorld } from "../../core/config.js";
import { LOOK } from "../look.js";
import { simMode } from "../screen.js";
import { mode, ui } from "../state.js";
import { context, musicOut } from "./engine.js";

const A = LOOK.AUDIO;
const tracks = new Map();          // name → a loaded or loading track (see makeTrack)
const failedAt = new Map();        // name → the context time its load failed (tried again after AUDIO.MUSIC_RETRY s)
const lengths = new Map();         // name → the shipped length in s (manifest), set by sfx.js when the manifest arrives
let current = null;                // the track that sounds (fading in or in): its name
let songFor = null;                // the ending scene (ui.storyScene) whose song has played to its end: this visit goes on with theme
let applied = "";                  // the bus level last set (level + duck end)
let duckEnd = 0;                   // the context time the jingle in progress ends
let ids = 0;                       // every element pair gets its own number (tests: the same track is the same pair)

// the Music switch (step 4 makes it its own setting)
export const musicOn = () => !ui.muted;

// the manifest's lengths: loop points come from the shipped file, not from what a browser says
export function setMusicInfo(files) { for (const f of files) if (f.kind === "music" || f.kind === "song") lengths.set(f.name, f.dur); }

// ---------- which track plays where (AC 7) ----------
const levelTrack = () => (G.level === levelsPerWorld() ? "boss" : G.world === "park" ? "theme" : "world_" + G.world);
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

// ---------- tracks ----------
function makeTrack(name, ctx) {
  const out = ctx.createGain();
  out.gain.value = 0; out.connect(musicOut());
  const parts = [0, 1].map(() => {
    const el = new Audio(), g = ctx.createGain();
    el.preload = "auto"; el.loop = false;
    const src = ctx.createMediaElementSource(el);
    g.gain.value = 0; src.connect(g); g.connect(out);
    return { el, g, src };
  });
  const t = { name, id: ++ids, out, parts, active: 0, ready: false, once: name === "theme_song", ended: false, xfade: 0, disposeAt: 0, blocked: 0, standby: false };
  const a = parts[0].el;
  a.src = A.dir + name + ".mp3";
  a.addEventListener("canplaythrough", () => { t.ready = true; });
  a.addEventListener("error", () => { t.failed = true; });
  a.addEventListener("ended", () => { t.ended = true; });
  a.addEventListener("timeupdate", () => loopCheck(t));
  parts[1].el.addEventListener("timeupdate", () => loopCheck(t));
  parts[1].el.addEventListener("ended", () => { t.ended = true; });
  return t;
}
function disposeTrack(t) {
  for (const p of t.parts) { try { p.el.pause(); p.el.removeAttribute("src"); p.el.load(); p.src.disconnect(); p.g.disconnect(); } catch (e) { /* gone */ } }
  try { t.out.disconnect(); } catch (e) { /* gone */ }
  tracks.delete(t.name);
}
const lengthOf = t => lengths.get(t.name) ?? t.parts[t.active].el.duration;

// the standby element loads from the moment its track plays (a whole track is ~1 MB: it is streamed, not decoded)
function prepareStandby(t) {
  if (t.once || t.standby) return;
  t.standby = true;
  const b = t.parts[1 - t.active].el;
  b.src = A.dir + t.name + ".mp3";
}
// the end of the active element is near: the other one starts from 0 and the two cross over (equal power); then the old one rests at 0
function loopCheck(t) {
  const ctx = context();
  if (!ctx || t.once || t.name !== current || t.xfade) return;
  const a = t.parts[t.active].el, dur = lengthOf(t);
  if (!(dur > A.LOOP_XFADE * 2) || a.currentTime < dur - A.LOOP_XFADE) return;
  const b = t.parts[1 - t.active];
  if (b.el.readyState < 2 && a.currentTime < dur - 0.2) return;           // the standby is not there yet: wait for the last moment, then go without
  const now = ctx.currentTime, f = Math.max(0.2, Math.min(A.LOOP_XFADE, dur - a.currentTime));
  try { b.el.currentTime = 0; } catch (e) { /* not seekable yet */ }
  const p = b.el.play();
  if (p && p.catch) p.catch(() => { t.blocked = now; });
  fade(b.g.gain, 1, f, now);
  fade(t.parts[t.active].g.gain, 0, f, now);
  t.xfade = now + f + 0.05;
}
function finishLoop(t, ctx) {
  const old = t.parts[t.active];
  old.el.pause();
  try { old.el.currentTime = 0; } catch (e) { /* ok */ }
  old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.value = 0;
  t.active = 1 - t.active; t.xfade = 0; t.ended = false;
}
function startTrack(t, ctx, now) {
  const a = t.parts[0];
  t.active = 0; t.xfade = 0; t.ended = false; t.disposeAt = 0;   // (a track that was fading out and is wanted again starts over)
  a.g.gain.value = 1;
  try { a.el.currentTime = 0; } catch (e) { /* ok */ }
  const p = a.el.play();
  if (p && p.catch) p.catch(() => { t.blocked = now; });
  fade(t.out.gain, 1, A.SCREEN_XFADE, now);
}
function fadeOutTrack(t, ctx, now) {
  fade(t.out.gain, 0, A.SCREEN_XFADE, now);
  t.disposeAt = now + A.SCREEN_XFADE + 0.1;
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
    g.linearRampToValueAtTime(low, now + 0.05);
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

// ---------- every frame ----------
// called by main.js every frame (and nothing else): chooses the track, starts, crossfades and disposes, keeps the bus level and the loops going
export function musicTick() {
  const ctx = context();
  if (simMode || !ctx) return;
  const now = ctx.currentTime;
  applyLevel(ctx);
  for (const t of tracks.values()) {
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
  // a track that is wanted loads (a failed one is tried again after a while)
  const load = name => {
    const t = tracks.get(name);
    if (t && t.failed) { if (!failedAt.has(name)) failedAt.set(name, now); if (now - failedAt.get(name) > A.MUSIC_RETRY) { disposeTrack(t); failedAt.delete(name); } return null; }
    if (!t && !failedAt.has(name)) { const n = makeTrack(name, ctx); tracks.set(name, n); return n; }
    return t || null;
  };
  const wanted = load(want);
  const fallback = want !== "theme" && !(wanted && wanted.ready && !wanted.failed);   // theme is kept loaded only while the wanted track is not there yet
  // the track to play: the wanted one once it is loaded, else theme (when it is)
  const ready = t => t && t.ready && !t.failed && (!t.blocked || now - t.blocked > 1);
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
  for (const [name, t] of tracks) if (name !== current && name !== want && !(name === "theme" && fallback) && !t.disposeAt) disposeTrack(t);
}

// ---------- for the tests (__bb.audio) ----------
export const currentTrack = () => current;
// the sounding pair: { track, id, time (s of the playing element), dur, pair (its elements with a file: 1 while it loads / for the song, else 2), elements (all alive), crossing (the loop crossfade is on) }
export function musicInfo() {
  const t = tracks.get(current);
  let elements = 0;
  for (const x of tracks.values()) elements += x.parts.filter(p => p.el.getAttribute("src")).length;
  const pair = t ? t.parts.filter(p => p.el.getAttribute("src")).length : 0;
  return t ? { track: t.name, id: t.id, time: t.parts[t.active].el.currentTime, dur: lengthOf(t), pair, elements, crossing: !!t.xfade } : { track: null, id: 0, time: 0, dur: 0, pair, elements, crossing: false };
}
// seeks the playing element (the ending's song is 80 s long: a test goes to its last seconds)
export function seekMusic(sec) { const t = tracks.get(current); if (t) t.parts[t.active].el.currentTime = sec; }
