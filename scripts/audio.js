// SPEC-047: the audio pipeline. Turns the MP3 sources in audio/src/ into the game's sounds and music in assets/audio/.
//   npm run audio     — every source named in scripts/audio.json → assets/audio/<name>.mp3 + manifest.json + a report
// It needs ffmpeg on PATH (decode, loudnorm, encode); CI never runs it: the generated files are committed (like npm run assets).
// audio/src/ is Andrei's (the WAV masters live in audio/wav/, gitignored): the pipeline reads audio/src/*.mp3 only, never writes there.
// Kinds (scripts/audio.json, one entry per file: name, kind, gain in dB for tuning after listening):
//   sfx    — one-shots: mono; silence under -50 dBFS trimmed (keep 10 ms before, 30 ms after) + 20 ms fade-out; peak -3 dBFS + gain; 96 kbps, 44.1 kHz.
//   loop   — mono, not trimmed; a 50 ms equal-power crossfade baked from the tail into the head (no click at the seam); peak -3 dBFS + gain; 96 kbps.
//   jingle — stereo, silence trimmed; longer than AUDIO.JINGLE_MAX is cut with a 0.5 s fade-out; peak -2 dBFS + gain; 112 kbps.
//   music  — stereo; the ending fade is cut (in the last 20 s, the first point where the 1 s RMS falls 6 dB under the track's median
//            and stays under it); two-pass loudnorm to -18 LUFS (+ gain), true peak -1.5 dBTP; 112 kbps, 44.1 kHz.
//   song   — like music, nothing is cut (it plays once, to the end).
// The analysis (silence, peaks, RMS, the ending fade) runs in Node on the PCM ffmpeg decodes (f32le), not on ffmpeg's logs.
// Deterministic: a fixed encoder setup (no metadata, no ID3, bitexact) and an unchanged input is skipped (srcHash), so a re-run
// changes no byte. The numbers (JINGLE_MAX, the budgets, what is precached) are LOOK.AUDIO of src/client/look.js.
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const cp = require("child_process");
const { LOOK } = require("../src/client/look.js");

const AUDIO = LOOK.AUDIO;
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "audio", "src");
const OUT_DIR = path.join(ROOT, "assets", "audio");
const CONFIG = path.join(__dirname, "audio.json");
const NL = "\n";
const RATE = 44100;
const ALGO = 1;   // part of every srcHash: bump when the processing below changes, so every file is made again

// what each kind does (see the header)
const KINDS = {
  sfx: { ch: 1, peak: -3, kbps: 96, trim: true, fade: 0.02 },
  loop: { ch: 1, peak: -3, kbps: 96, xfade: 0.05 },
  jingle: { ch: 2, peak: -2, kbps: 112, trim: true, fade: 0.02, cutFade: 0.5 },
  music: { ch: 2, kbps: 112, loud: true, cut: true },
  song: { ch: 2, kbps: 112, loud: true }
};
const TRIM = { threshold: -50, pre: 0.01, post: 0.03 };           // dBFS, s, s
const ENDING = { last: 20, win: 1, hop: 0.1, drop: 6 };           // s, s, s, dB: the ending-fade rule
const LOUD = { I: -18, TP: -1.5, LRA: 20 };                       // LUFS, dBTP, LU (high: so loudnorm stays linear on dynamic tracks)
const WARN = { sfxLen: 2.5, cutMax: 15 };                         // s, s

const lin = d => Math.pow(10, d / 20);
const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const r1 = x => (Number.isFinite(x) ? Math.round(x * 10) / 10 : -Infinity);

// ---------- ffmpeg ----------
const FFMPEG = process.env.FFMPEG || "ffmpeg";
function ffmpegVersion() {
  const r = cp.spawnSync(FFMPEG, ["-version"], { encoding: "utf8" });
  return r.error || r.status !== 0 ? null : String(r.stdout).split(NL)[0];
}
const ffmpegAvailable = () => ffmpegVersion() !== null;
const NO_FFMPEG = "audio: ffmpeg was not found on PATH. Install it (Windows: winget install Gyan.FFmpeg · macOS: brew install ffmpeg · Linux: apt install ffmpeg), " +
  "open a new terminal and run npm run audio again.";

// Runs ffmpeg; returns { stdout (Buffer), stderr (string) }; throws with the tail of ffmpeg's message on failure.
function ff(args, input) {
  const r = cp.spawnSync(FFMPEG, ["-hide_banner", "-nostats", ...args], { input, maxBuffer: 1 << 30 });
  if (r.error && r.error.code === "ENOENT") throw new Error(NO_FFMPEG);
  if (r.error && r.error.code !== "EPIPE") throw r.error;
  const stderr = String(r.stderr || "");
  if (r.status !== 0) throw new Error("ffmpeg " + args.join(" ") + " failed:" + NL + stderr.split(NL).slice(-12).join(NL));
  return { stdout: r.stdout, stderr };
}
const asBytes = d => Buffer.from(d.buffer, d.byteOffset, d.byteLength);
const toFloats = buf => { const a = new Float32Array(buf.length >> 2); new Uint8Array(a.buffer).set(buf.subarray(0, a.length * 4)); return a; };

// MP3 (a file or bytes) → interleaved f32 PCM at RATE with `ch` channels.
function decode(file, ch) {
  const bytes = Buffer.isBuffer(file) ? file : null;
  const { stdout } = ff(["-v", "error", "-i", bytes ? "pipe:0" : file, "-f", "f32le", "-ac", String(ch), "-ar", String(RATE), "pipe:1"], bytes);
  return toFloats(stdout);
}

// EBU R128 measurement of f32 PCM (loudnorm's first pass): { I, TP, LRA, thresh, offset } as numbers.
function measureLoudness(data, ch, rate = RATE, target = LOUD) {
  const af = `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`;
  const { stderr } = ff(["-v", "info", "-f", "f32le", "-ar", String(rate), "-ac", String(ch), "-i", "pipe:0", "-af", af, "-f", "null", "-"], asBytes(data));
  const j = lastJson(stderr);
  return { I: +j.input_i, TP: +j.input_tp, LRA: +j.input_lra, thresh: +j.input_thresh, offset: +j.target_offset };
}
function lastJson(text) {
  const i = text.lastIndexOf("{"), j = text.indexOf("}", i);
  if (i < 0 || j < 0) throw new Error("ffmpeg printed no loudnorm result:" + NL + text.split(NL).slice(-8).join(NL));
  return JSON.parse(text.slice(i, j + 1));
}

// ---------- DSP on interleaved Float32Array (pure, no ffmpeg: tests/audio runs these on made-up tones) ----------
function peakOf(d) { let m = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } return m; }
function rmsOf(d) { if (!d.length) return 0; let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); }

// Leading and trailing silence (every channel under `threshold` dBFS) cut away, keeping `pre` s before and `post` s after the sound.
function trimSilence(d, ch, rate, { threshold, pre, post } = TRIM) {
  const frames = d.length / ch, th = lin(threshold);
  let first = -1, last = -1;
  for (let f = 0; f < frames; f++) {
    let m = 0;
    for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(d[f * ch + c]));
    if (m >= th) { if (first < 0) first = f; last = f; }
  }
  if (first < 0) return d;   // all silent: nothing to find (the report shows peak -inf)
  const a = Math.max(0, first - Math.round(pre * rate)), b = Math.min(frames, last + 1 + Math.round(post * rate));
  return d.slice(a * ch, b * ch);
}

// Linear fade to zero over the last `sec` seconds (in place).
function fadeOut(d, ch, rate, sec) {
  const frames = d.length / ch, n = Math.min(frames, Math.round(sec * rate));
  for (let i = 0; i < n; i++) {
    const g = 1 - (i + 1) / n, f = frames - n + i;
    for (let c = 0; c < ch; c++) d[f * ch + c] *= g;
  }
  return d;
}

// Everything past `maxSec` cut away, with a `fade`-second fade-out ending at the cut. Returns the same array when it is short enough.
function cutLong(d, ch, rate, maxSec, fade) {
  const keep = Math.round(maxSec * rate);
  if (d.length / ch <= keep) return d;
  return fadeOut(d.slice(0, keep * ch), ch, rate, fade);
}

// Scales so the highest sample sits at `peakDb` + `gainDb` dBFS (in place). A silent file stays silent.
function normalizePeak(d, peakDb, gainDb = 0) {
  const p = peakOf(d);
  if (p === 0) return d;
  const k = lin(peakDb + gainDb) / p;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return d;
}

// A loop with no click: the last `xfade` s of the sound are mixed into the first `xfade` s with equal-power curves and dropped
// from the end. The new last sample is followed by the (mixed) first one = the old sample after it, so the seam is as smooth as the sound.
function bakeLoop(d, ch, rate, xfade = KINDS.loop.xfade) {
  const frames = d.length / ch, x = Math.round(xfade * rate), n = frames - x;
  if (n <= x) throw new Error("loop: too short for a " + xfade * 1000 + " ms crossfade");
  const out = d.slice(0, n * ch);
  for (let i = 0; i < x; i++) {
    const t = ((i + 0.5) / x) * Math.PI / 2, head = Math.sin(t), tail = Math.cos(t);
    for (let c = 0; c < ch; c++) out[i * ch + c] = d[i * ch + c] * head + d[(n + i) * ch + c] * tail;
  }
  return out;
}

// The ending fade of a music track: in the last ENDING.last s, the first point where the 1 s RMS (every 0.1 s) falls ENDING.drop dB under
// the track's median 1 s RMS and stays under it to the end. Returns { cut (frame, or the length when there is no fade), removed (s), median (dB) }.
function findEndingFade(d, ch, rate, o = ENDING) {
  const frames = d.length / ch, blk = Math.round(o.hop * rate), per = Math.round(o.win / o.hop), nb = Math.floor(frames / blk);
  const sums = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let s = 0;
    for (let i = b * blk * ch, e = (b + 1) * blk * ch; i < e; i++) s += d[i] * d[i];
    sums[b] = s;
  }
  const wins = nb - per + 1;
  if (wins < 2) return { cut: frames, removed: 0, median: -Infinity };
  const rms = new Float64Array(wins);
  for (let w = 0; w < wins; w++) {   // each window summed afresh (a running sum drifts below zero over silence)
    let s = 0;
    for (let b = 0; b < per; b++) s += sums[w + b];
    rms[w] = Math.sqrt(s / (per * blk * ch));
  }
  const median = [...rms].sort((p, q) => p - q)[wins >> 1], th = median * lin(-o.drop);
  const from = Math.max(0, Math.ceil((frames / rate - o.last) / o.hop));
  let w = wins;
  while (w - 1 >= from && rms[w - 1] < th) w--;
  const cut = w === wins ? frames : w * blk;
  return { cut, removed: (frames - cut) / rate, median: db(median) };
}

// The sound the pipeline makes from decoded source PCM, before encoding (music / song: loudnorm is the encoder's job).
// Returns { data, note } — note: what was cut, for the report.
function processPcm(kind, raw, entry = {}, rate = RATE, jingleMax = AUDIO.JINGLE_MAX) {
  const K = KINDS[kind];
  if (!K) throw new Error("unknown kind " + kind);
  let d = raw.slice(), note = "";
  if (K.trim) d = trimSilence(d, K.ch, rate);
  if (kind === "jingle") {
    const before = d.length;
    d = cutLong(d, K.ch, rate, jingleMax, K.cutFade);
    if (d.length < before) note = `cut at ${jingleMax} s`;
    else d = fadeOut(d, K.ch, rate, K.fade);
  } else if (kind === "sfx") d = fadeOut(d, K.ch, rate, K.fade);
  else if (kind === "loop") d = bakeLoop(d, K.ch, rate);
  else if (K.cut) {
    const e = findEndingFade(d, K.ch, rate);
    note = e.removed ? `ending fade cut: -${(Math.round(e.removed * 10) / 10)} s` : "no ending fade";
    d = d.slice(0, e.cut * K.ch);
    return { data: d, note, removed: e.removed };
  }
  if (K.peak !== undefined) d = normalizePeak(d, K.peak, entry.gain || 0);
  return { data: d, note, removed: 0 };
}

// ---------- encoding ----------
// f32 PCM → MP3 bytes (96 / 112 kbps CBR, 44.1 kHz). Deterministic: no metadata, no ID3 tag, bitexact muxer and encoder.
// music / song: two-pass loudnorm to LOUD.I + gain (linear when it can; `norm` says which). Returns { bytes, norm }.
function encode(kind, data, entry = {}, rate = RATE) {
  const K = KINDS[kind], ch = K.ch;
  let filter = null, norm = null;
  if (K.loud) {
    const I = LOUD.I + (entry.gain || 0), m = measureLoudness(data, ch, rate, { ...LOUD, I });
    filter = `loudnorm=I=${I}:TP=${LOUD.TP}:LRA=${LOUD.LRA}:measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=json`;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-audio-")), out = path.join(dir, "out.mp3");
  try {
    const r = ff(["-y", "-v", filter ? "info" : "error", "-f", "f32le", "-ar", String(rate), "-ac", String(ch), "-i", "pipe:0",
      ...(filter ? ["-af", filter] : []), "-c:a", "libmp3lame", "-b:a", K.kbps + "k", "-ar", String(RATE), "-ac", String(ch),
      "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-id3v2_version", "0", out], asBytes(data));
    if (filter) norm = lastJson(r.stderr).normalization_type;
    return { bytes: fs.readFileSync(out), norm };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---------- config, hashes, the manifest ----------
const stable = v => (v && typeof v === "object" && !Array.isArray(v)
  ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}" : JSON.stringify(v));

function loadConfig(file = CONFIG) {
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = c.sounds.map(s => s.name);
  if (new Set(names).size !== names.length) throw new Error("audio.json: a name is listed twice");
  for (const s of c.sounds) if (!KINDS[s.kind]) throw new Error(`audio.json: ${s.name}: unknown kind "${s.kind}"`);
  return c;
}

// The hash of a source file + its config entry (+ the processing version, and for a jingle the cut length): changes when the sound must be made again.
function srcHash(entry, srcDir = SRC_DIR) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(path.join(srcDir, entry.name + ".mp3")));
  h.update(NL + stable(entry) + NL + "algo " + ALGO);
  if (entry.kind === "jingle") h.update(NL + "jingle-max " + AUDIO.JINGLE_MAX);
  return h.digest("hex").slice(0, 16);
}

const manifestFile = (outDir = OUT_DIR) => path.join(outDir, "manifest.json");
function readManifest(outDir = OUT_DIR) {
  try { return JSON.parse(fs.readFileSync(manifestFile(outDir), "utf8")); } catch (e) { return { files: [] }; }
}

// Budgets of AUDIO (AC 12): a list of what is over (empty = fine). `entries` = manifest files (with kind, bytes, name).
function checkBudgets(entries) {
  const bad = [];
  let total = 0, pre = 0;
  for (const e of entries) {
    total += e.bytes;
    const cap = e.kind === "sfx" || e.kind === "loop" ? AUDIO.SFX_MAX : e.kind === "jingle" ? AUDIO.JINGLE_FILE_MAX : AUDIO.MUSIC_MAX;
    if (e.bytes > cap) bad.push(`${e.name}: ${e.bytes} bytes (${e.kind} max ${cap})`);
    if (AUDIO.PRECACHE_KINDS.includes(e.kind) || AUDIO.PRECACHE_MUSIC.includes(e.name)) pre += e.bytes;
  }
  if (total > AUDIO.TOTAL_MAX) bad.push(`assets/audio: ${total} bytes (max ${AUDIO.TOTAL_MAX})`);
  if (pre > AUDIO.PRECACHE_MAX) bad.push(`precached: ${pre} bytes (max ${AUDIO.PRECACHE_MAX})`);
  return bad;
}
const precachedBytes = entries => entries.filter(e => AUDIO.PRECACHE_KINDS.includes(e.kind) || AUDIO.PRECACHE_MUSIC.includes(e.name)).reduce((s, e) => s + e.bytes, 0);

// ---------- the run ----------
const stats = (d, ch) => ({ dur: d.length / ch / RATE, peak: db(peakOf(d)), rms: db(rmsOf(d)) });

// Makes every sound of the config into outDir (a source whose srcHash and output are unchanged is skipped; `force` makes all again).
// Returns { rows, warnings, manifest, bad } and writes outDir + manifest.json only where something changed.
function build({ srcDir = SRC_DIR, outDir = OUT_DIR, config = loadConfig(), force = false, log = () => {} } = {}) {
  const old = new Map(readManifest(outDir).files.map(f => [f.name, f]));
  const warnings = [], rows = [], files = [];
  const onDisk = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4)) : [];
  for (const n of onDisk) if (!config.sounds.some(s => s.name === n)) warnings.push(`audio/src/${n}.mp3 has no entry in scripts/audio.json (skipped)`);
  const entries = config.sounds.filter(s => {
    if (onDisk.includes(s.name)) return true;
    warnings.push(`scripts/audio.json lists "${s.name}" but audio/src/${s.name}.mp3 does not exist`);
    return false;
  });
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const K = KINDS[entry.kind], hash = srcHash(entry, srcDir), file = entry.name + ".mp3", outFile = path.join(outDir, file);
    const raw = decode(path.join(srcDir, file), K.ch), before = stats(raw, K.ch);
    const prev = old.get(entry.name);
    const fresh = !force && prev && prev.srcHash === hash && fs.existsSync(outFile) && fs.statSync(outFile).size === prev.bytes;
    let note = "", norm = null;
    if (fresh) log(`  = ${entry.name} unchanged`);
    else {
      const p = processPcm(entry.kind, raw, entry);
      const e = encode(entry.kind, p.data, entry);
      note = p.note; norm = e.norm;
      fs.writeFileSync(outFile, e.bytes);
      log(`  + ${entry.name} written (${e.bytes.length} bytes)`);
      if (p.removed > WARN.cutMax) warnings.push(`${entry.name}: the ending-fade cut removed ${r1(p.removed)} s (more than ${WARN.cutMax} s)`);
    }
    const bytes = fs.statSync(outFile).size, after = stats(decode(outFile, K.ch), K.ch);
    const lufs = K.loud ? measureLoudness(decode(outFile, K.ch), K.ch).I : null;
    if (!fresh && after.peak > -0.1) warnings.push(`${entry.name}: peak ${r1(after.peak)} dBFS after the gain (it may clip)`);
    if (entry.kind === "sfx" && after.dur > WARN.sfxLen) warnings.push(`${entry.name}: a sound of ${r1(after.dur)} s (longer than ${WARN.sfxLen} s)`);
    if (norm === "dynamic") warnings.push(`${entry.name}: loudnorm had to go dynamic (its peak or loudness range did not allow a plain gain)`);
    rows.push({ name: entry.name, kind: entry.kind, gain: entry.gain || 0, before, after, lufs, bytes, note: fresh ? "" : note, fresh });
    files.push({ name: entry.name, kind: entry.kind, file, dur: Math.round(after.dur * 1000) / 1000, bytes, loop: entry.kind === "loop", srcHash: hash });
  }
  // sounds the config no longer names: their files go (only .mp3 files the pipeline owns)
  const keep = new Set(files.map(f => f.file));
  for (const f of fs.readdirSync(outDir)) if (f.endsWith(".mp3") && !keep.has(f)) { fs.unlinkSync(path.join(outDir, f)); log(`  - ${f} removed`); }
  const text = JSON.stringify({ files }, null, 2) + NL;
  const cur = fs.existsSync(manifestFile(outDir)) ? fs.readFileSync(manifestFile(outDir), "utf8") : null;
  if (cur !== text) fs.writeFileSync(manifestFile(outDir), text);
  return { rows, warnings, manifest: files, bad: checkBudgets(files), manifestChanged: cur !== text };
}

function report({ rows, warnings, manifest, bad }) {
  const pad = (s, n) => String(s).padEnd(n), num = (s, n) => String(s).padStart(n);
  const s1 = x => (Number.isFinite(x) ? x.toFixed(1) : "-inf");
  const lines = [[pad("name", 14), pad("kind", 7), num("before s", 9), num("after s", 8), num("peak dB", 8), num("RMS dB", 8), num("LUFS", 7), num("KB", 7), "  note"].join(" ")];
  for (const r of rows) {
    lines.push([pad(r.name, 14), pad(r.kind, 7), num(r.before.dur.toFixed(2), 9), num(r.after.dur.toFixed(2), 8), num(s1(r.after.peak), 8), num(s1(r.after.rms), 8),
      num(r.lufs === null ? "" : s1(r.lufs), 7), num((r.bytes / 1024).toFixed(1), 7), "  " + [r.gain ? `gain ${r.gain} dB` : "", r.note, r.fresh ? "unchanged" : "made"].filter(Boolean).join(", ")].join(" "));
  }
  const kb = n => (n / 1024).toFixed(0) + " KB";
  const total = manifest.reduce((s, e) => s + e.bytes, 0);
  lines.push("", `${manifest.length} files, ${kb(total)} in assets/audio (budget ${kb(AUDIO.TOTAL_MAX)}); precached ${kb(precachedBytes(manifest))} (budget ${kb(AUDIO.PRECACHE_MAX)})`);
  for (const w of warnings) lines.push("WARN " + w);
  for (const b of bad) lines.push("OVER BUDGET " + b);
  if (!warnings.length && !bad.length) lines.push("no warnings");
  return lines.join(NL);
}

module.exports = {
  build, report, loadConfig, srcHash, readManifest, checkBudgets, precachedBytes, ffmpegAvailable, ffmpegVersion, decode, encode, measureLoudness,
  processPcm, trimSilence, fadeOut, cutLong, normalizePeak, bakeLoop, findEndingFade, peakOf, rmsOf, ff, db, lin,
  KINDS, TRIM, ENDING, LOUD, RATE, ALGO, AUDIO, SRC_DIR, OUT_DIR, CONFIG, ROOT
};

if (require.main === module) {
  try {
    const v = ffmpegVersion();
    if (!v) { console.error(NO_FFMPEG); process.exit(1); }
    console.log(v);
    const res = build({ force: process.argv.includes("--force"), log: console.log });
    console.log(report(res));
    if (res.bad.length) process.exitCode = 1;
  } catch (e) { console.error(e.message || e); process.exit(1); }
}
