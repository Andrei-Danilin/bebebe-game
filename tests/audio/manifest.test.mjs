// SPEC-047 AC 13: the committed audio (assets/audio/ + manifest.json) matches its sources and config, fits the budgets and covers the
// sound names the core emits. Node only, no ffmpeg: it reads the committed files; `npm run audio` (which needs ffmpeg) makes them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const A = require("../../scripts/audio.js");
const { AUDIO } = A;
const ROOT = A.ROOT, OUT = A.OUT_DIR, SRC = A.SRC_DIR;
const config = A.loadConfig();
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
const byName = new Map(manifest.files.map(f => [f.name, f]));
const KB = 1024, MB = 1024 * 1024;

test("the manifest is fresh: every srcHash matches audio/src/ + scripts/audio.json (run npm run audio)", () => {
  const stale = config.sounds.filter(s => byName.get(s.name)?.srcHash !== A.srcHash(s)).map(s => s.name);
  assert.deepEqual(stale, []);
});

test("every file is listed and exists, and the kinds match the config", () => {
  const sources = fs.readdirSync(SRC).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4)).sort();
  assert.equal(sources.length, 49, "audio/src/ holds the 49 sources of SPEC-047");
  assert.deepEqual(config.sounds.map(s => s.name).sort(), sources, "one config entry per source file, no entry without a file");
  assert.deepEqual([...byName.keys()].sort(), sources, "one manifest entry per source");
  const onDisk = fs.readdirSync(OUT).filter(f => f.endsWith(".mp3")).sort();
  assert.deepEqual(onDisk, sources.map(n => n + ".mp3"), "no mp3 in assets/audio/ that the manifest does not list");
  for (const s of config.sounds) {
    const e = byName.get(s.name);
    assert.deepEqual(Object.keys(e), ["name", "kind", "file", "dur", "bytes", "loop", "srcHash"], s.name);
    assert.equal(e.kind, s.kind, s.name + ": kind");
    assert.equal(e.file, s.name + ".mp3");
    assert.equal(e.loop, s.kind === "loop", s.name + ": loop");
    assert.equal(e.bytes, fs.statSync(path.join(OUT, e.file)).size, s.name + ": bytes");
    assert.ok(e.dur > 0.1, s.name + ": dur");
    assert.equal(typeof s.gain, "number", s.name + ": gain is a number (dB, default 0)");
  }
  const kinds = k => config.sounds.filter(s => s.kind === k).map(s => s.name).sort();
  assert.deepEqual(kinds("loop"), ["danger_tick", "dizzy", "rescue_loop", "run_steps", "tiptoe_steps"]);
  assert.deepEqual(kinds("jingle"), ["boss_sting", "lose", "win", "world_open"]);
  assert.deepEqual(kinds("music"), ["boss", "story", "theme", "world_beach", "world_city", "world_field", "world_school", "world_winter"]);
  assert.deepEqual(kinds("song"), ["theme_song"]);
});

test("the audio numbers are the ones of the spec (the budgets are not loosened quietly)", () => {
  assert.deepEqual([AUDIO.MASTER, AUDIO.MUSIC_MENU, AUDIO.MUSIC_PLAY, AUDIO.MUSIC_PAUSE, AUDIO.OTHERS], [0.8, 0.7, 0.35, 0.25, 0.7]);
  assert.deepEqual([AUDIO.SCREEN_XFADE, AUDIO.LOOP_XFADE, AUDIO.MAX_VOICES, AUDIO.RETRIGGER, AUDIO.JINGLE_MAX], [1, 2, 8, 0.05, 5]);
  assert.deepEqual([AUDIO.SFX_MAX, AUDIO.JINGLE_FILE_MAX, AUDIO.MUSIC_MAX, AUDIO.TOTAL_MAX, AUDIO.PRECACHE_MAX], [60 * KB, 120 * KB, 1.8 * MB, 13 * MB, 3.5 * MB]);
  assert.deepEqual([AUDIO.PRECACHE_KINDS, AUDIO.PRECACHE_MUSIC], [["sfx", "loop", "jingle"], ["theme", "story"]]);
});

test("budgets (AC 12): sfx / loop 60 KB, jingle 120 KB, music 1.8 MB, all of assets/audio 13 MB, precached 3.5 MB", () => {
  const over = [];
  for (const e of manifest.files) {
    const cap = e.kind === "sfx" || e.kind === "loop" ? 60 * KB : e.kind === "jingle" ? 120 * KB : 1.8 * MB;
    if (e.bytes > cap) over.push(`${e.name}: ${e.bytes} > ${cap}`);
  }
  assert.deepEqual(over, []);
  const all = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  assert.ok(all <= 13 * MB, `assets/audio is ${all} bytes`);
  for (const n of AUDIO.PRECACHE_MUSIC) assert.ok(byName.has(n), "precached music exists: " + n);
  const pre = A.precachedBytes(manifest.files);
  assert.ok(pre > 1 * MB && pre <= 3.5 * MB, `precached audio is ${pre} bytes`);
  assert.deepEqual(A.checkBudgets(manifest.files), []);
});

// every sound name the core emits ({ type: "sfx", name } events) plays a file or, failing that, a synth beep of sound.js
test("every sfx event name the core emits has a manifest entry or a synth fallback in sound.js", () => {
  const files = fs.readdirSync(path.join(ROOT, "src", "core"), { recursive: true }).filter(f => f.endsWith(".js"));
  const emitted = new Set();
  for (const f of files) {
    // emit("sfx", { name: "x" }) and emit("sfx", { name: cond ? "a" : "b" }): the quoted names after the condition
    const code = fs.readFileSync(path.join(ROOT, "src", "core", f), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
    for (const m of code.matchAll(/emit\(\s*"sfx"\s*,\s*\{\s*name:\s*([^}]*)\}/g)) {
      const expr = m[1].includes("?") ? m[1].slice(m[1].indexOf("?")) : m[1];
      for (const q of expr.matchAll(/"([a-z_0-9]+)"/g)) emitted.add(q[1]);
    }
  }
  assert.ok(emitted.size >= 15, "found the emits: " + [...emitted]);
  const sound = fs.readFileSync(path.join(ROOT, "src", "client", "sound.js"), "utf8");
  const synth = new Set([...sound.slice(sound.indexOf("export const SFX")).matchAll(/^ {2}([a-z_0-9]+):/gm)].map(m => m[1]));
  assert.ok(synth.has("hug") && synth.has("item"), "read the SFX table of sound.js");
  const missing = [...emitted].filter(n => !byName.has(n) && !synth.has(n));
  assert.deepEqual(missing, []);
});

// SPEC-047 AC 11: sw.js precaches manifest.json + every sound, loop and jingle + theme and story (AUDIO.PRECACHE_*), named by the manifest's hash; the other
// tracks (a world's music, boss, theme_song) are not in the list — they are stored whole on first play (TRACKS_HASH names that cache)
test("sw.js lists the precached audio and its hashes (run npm run audio)", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), text = fs.readFileSync(path.join(OUT, "manifest.json"), "utf8");
  assert.equal(A.swBetween(sw), A.swBlock(manifest.files, text), "the audio block of sw.js is stale");
  const list = [...A.swBetween(sw).matchAll(/"\.\/assets\/audio\/([^"]+)"/g)].map(m => m[1]);
  const want = ["manifest.json", ...manifest.files.filter(f => ["sfx", "loop", "jingle"].includes(f.kind) || ["theme", "story"].includes(f.name)).map(f => f.file)];
  assert.deepEqual(list, want);
  for (const n of ["boss", "theme_song", "world_field", "world_city", "world_school", "world_beach", "world_winter"]) assert.ok(!list.includes(n + ".mp3"), n + " is cached on first play, not at install");
  assert.ok(list.includes("theme.mp3") && list.includes("story.mp3") && list.includes("win.mp3") && list.includes("rescue_loop.mp3"));
  assert.match(sw, /const CACHE_AUDIO = CACHE_PREFIX \+ "b" \+ SW_BUILD \+ "-audio-" \+ AUDIO_HASH/);
  assert.match(sw, /const CACHE_TRACKS = CACHE_PREFIX \+ "b" \+ SW_BUILD \+ "-tracks-" \+ TRACKS_HASH/);
  // a changed sound changes AUDIO_HASH; a changed track also TRACKS_HASH, a changed sound does not
  const hashes = (files, t) => A.swBlock(files, t).split("\n").slice(0, 2);
  const [a0, t0] = hashes(manifest.files, text);
  const bumped = f => manifest.files.map(e => (e.name === f ? { ...e, srcHash: "changed" } : e));
  const [a1, t1] = hashes(bumped("tap"), text + " ");
  assert.ok(a1 !== a0 && t1 === t0, "a sound: new AUDIO_HASH, same TRACKS_HASH");
  const [a2, t2] = hashes(bumped("world_field"), text + " ");
  assert.ok(a2 !== a0 && t2 !== t0, "a track: both change");
});
