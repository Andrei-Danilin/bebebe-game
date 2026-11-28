// SPEC-047 AC 14: the audio pipeline (scripts/audio.js) on made-up tones. The processing (trim, fades, the loop seam, the ending-fade
// cut, the peak) is pure Node and always runs; what needs ffmpeg (loudnorm, the MP3 encode, a whole build) is skipped where ffmpeg is missing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const A = require("../../scripts/audio.js");
const R = A.RATE;
const skip = A.ffmpegAvailable() ? false : "ffmpeg is not on PATH";

// a made-up sound: for each [seconds, amplitude, hz] segment a sine (amplitude 0 = silence), `ch` channels interleaved
function tone(segments, ch = 1) {
  const n = segments.reduce((s, g) => s + Math.round(g[0] * R), 0), d = new Float32Array(n * ch);
  let f = 0;
  for (const [sec, amp, hz] of segments) {
    for (let i = 0, m = Math.round(sec * R); i < m; i++, f++) {
      const v = amp * Math.sin((2 * Math.PI * hz * f) / R);
      for (let c = 0; c < ch; c++) d[f * ch + c] = v;
    }
  }
  return d;
}
const secs = (d, ch) => d.length / ch / R;
const peakDb = d => A.db(A.peakOf(d));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not within ${tol} of ${b}`);

test("sfx: silence under -50 dBFS is trimmed (10 ms before, 30 ms after), 20 ms fade-out, peak -3 dBFS, gain added", () => {
  // 0.5 s of hiss at -66 dBFS, a 0.3 s tone, 0.7 s of hiss
  const raw = tone([[0.5, 0.0005, 3000], [0.3, 0.8, 440], [0.7, 0.0005, 3000]]);
  const { data } = A.processPcm("sfx", raw, {});
  near(secs(data, 1), 0.01 + 0.3 + 0.03, 0.003, "length");
  near(peakDb(data), -3, 0.05, "peak");
  assert.equal(Math.abs(data[data.length - 1]), 0, "the last sample is the end of the fade");
  near(peakDb(A.processPcm("sfx", raw, { gain: 2 }).data), -1, 0.05, "peak + gain 2 dB");
  near(peakDb(A.processPcm("sfx", raw, { gain: -4 }).data), -7, 0.05, "peak + gain -4 dB");
  // a sound with nothing above the threshold is kept as it is (the report shows it)
  assert.equal(A.trimSilence(tone([[0.2, 0.0005, 3000]]), 1, R).length, Math.round(0.2 * R));
});

test("loop: not trimmed; the baked 50 ms crossfade leaves no jump at the seam (and the raw wrap does jump)", () => {
  const raw = tone([[0.93, 0.7, 330]]);                    // 0.93 s of 330 Hz: the phase at the end is not the phase at the start
  const wrap = d => Math.abs(d[0] - d[d.length - 1]);
  assert.ok(wrap(raw) > 0.05, "without the crossfade the wrap would click: " + wrap(raw));
  const { data } = A.processPcm("loop", raw, {});
  near(secs(data, 1), 0.93 - 0.05, 0.001, "length: the crossfade shortens the loop by 50 ms");
  near(peakDb(data), -3, 0.05, "peak");
  let worst = wrap(data);
  for (let i = 1; i < data.length; i++) worst = Math.max(worst, Math.abs(data[i] - data[i - 1]));
  assert.ok(worst <= 0.05, "the largest sample jump of the whole loop, seam included: " + worst);
  // the start of a loop is not trimmed: a quiet start stays
  const quiet = A.processPcm("loop", tone([[0.3, 0.0005, 3000], [0.7, 0.5, 220]]), {}).data;
  near(secs(quiet, 1), 1 - 0.05, 0.001, "a loop keeps its leading quiet part");
});

test("jingle: stereo, silence trimmed, longer than JINGLE_MAX is cut with a 0.5 s fade-out, peak -2 dBFS", () => {
  const long = A.processPcm("jingle", tone([[0.4, 0, 0], [7, 0.6, 523], [1, 0, 0]], 2), {}).data;
  near(secs(long, 2), A.AUDIO.JINGLE_MAX, 0.001, "cut at JINGLE_MAX");
  near(peakDb(long), -2, 0.05, "peak");
  assert.equal(Math.abs(long[long.length - 1]), 0, "ends in silence");
  // 0.25 s before the cut the fade is half way: a 20 ms stretch there is at most ~half the peak
  const from = Math.round((A.AUDIO.JINGLE_MAX - 0.26) * R), to = Math.round((A.AUDIO.JINGLE_MAX - 0.24) * R);
  assert.ok(A.peakOf(long.slice(from * 2, to * 2)) < 0.56 * A.peakOf(long), "the fade-out is on");
  const short = A.processPcm("jingle", tone([[0.3, 0, 0], [2, 0.6, 523], [1, 0, 0]], 2), {}).data;
  near(secs(short, 2), 0.01 + 2 + 0.03, 0.003, "a short jingle is only trimmed");
  near(secs(A.processPcm("jingle", tone([[3, 0.6, 523]], 2), {}, R, 1.5).data, 2), 1.5, 0.001, "the limit is a parameter");
});

// a 40 s "track": 440 Hz (stereo) at a steady level for 30 s, then a linear fade over 8 s, then silence
function track(change) {
  const t = tone([[30, 0.5, 440], [10, 0, 0]], 2);
  for (let i = 0; i < 8 * R; i++) {
    const f = 30 * R + i, v = 0.5 * (1 - i / (8 * R)) * Math.sin((2 * Math.PI * 440 * f) / R);
    t[f * 2] = v; t[f * 2 + 1] = v;
  }
  return change ? change(t) : t;
}
const scale = (t, from, to, k) => { for (let f = Math.round(from * R); f < Math.round(to * R); f++) { t[f * 2] *= k; t[f * 2 + 1] *= k; } return t; };

test("music: the ending fade is cut where the 1 s RMS falls 6 dB under the median and stays under", () => {
  const { data, removed } = A.processPcm("music", track(), {});
  // the 1 s window that starts at t has about half the median's amplitude when it is centred on the middle of the fade (34 s): t ≈ 33.5
  near(secs(data, 2), 33.5, 0.3, "cut at");
  near(removed, 40 - 33.5, 0.3, "removed");
  assert.equal(A.findEndingFade(track(), 2, R).cut, data.length / 2);
  // a track that ends at full level (no fade) is not cut
  const loud = tone([[40, 0.5, 440]], 2);
  assert.equal(A.processPcm("music", loud, {}).data.length, loud.length);
  assert.equal(A.findEndingFade(loud, 2, R).removed, 0);
  // a quiet passage in the last 20 s that gets loud again is not the ending
  near(secs(A.processPcm("music", track(t => scale(t, 24, 27, 0.1)), {}).data, 2), 33.5, 0.3, "a dip in the middle is kept");
  // only the last 20 s are looked at: a quiet start is not cut
  near(secs(A.processPcm("music", track(t => scale(t, 0, 5, 0.05)), {}).data, 2), 33.5, 0.3, "a quiet start is kept");
  // a song is never cut
  assert.equal(A.processPcm("song", track(), {}).data.length, track().length);
});

test("an unknown kind is refused", () => {
  assert.throws(() => A.processPcm("symphony", new Float32Array(10), {}), /unknown kind/);
});

test("ffmpeg: an MP3 encode is the same bytes every time (fixed setup, no metadata)", { skip }, () => {
  const d = A.processPcm("sfx", tone([[0.2, 0, 0], [0.4, 0.8, 440], [0.2, 0, 0]]), {}).data;
  const a = A.encode("sfx", d, {}).bytes, b = A.encode("sfx", d, {}).bytes;
  assert.ok(a.equals(b), "two encodes differ");
  assert.ok(a.length > 1000 && a.length < 20000, "96 kbps mono: " + a.length);
  assert.notEqual(a.subarray(0, 3).toString("latin1"), "ID3", "no ID3 tag");
  assert.ok(A.decode(a, 1).length > 0.4 * R, "it decodes");
});

test("ffmpeg: music is two-pass loudnormed to -18 LUFS (within 1 LU), true peak near -1.5 dBTP at most", { skip }, () => {
  // a made-up chord with a slow swell, 40 s, quiet so loudnorm has to lift it
  const n = 40 * R, raw = new Float32Array(n * 2);
  for (let f = 0; f < n; f++) {
    const t = f / R, v = 0.03 * (1 + 0.5 * Math.sin(t * 0.7)) * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + 0.6 * Math.sin(2 * Math.PI * 330 * t));
    raw[f * 2] = v; raw[f * 2 + 1] = v * 0.9;
  }
  for (const gain of [0, -3]) {
    const { data } = A.processPcm("music", raw, { gain });
    const out = A.decode(A.encode("music", data, { gain }).bytes, 2);
    const m = A.measureLoudness(out, 2);
    near(m.I, -18 + gain, 1, `integrated loudness with gain ${gain} dB`);
    assert.ok(m.TP <= -1.5 + 0.5, "true peak " + m.TP);
  }
});

test("ffmpeg: a whole build from MP3 sources — trimmed, cut at the jingle limit and the ending fade; a re-run changes nothing; a forced re-run gives the same bytes", { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-audio-test-")), srcDir = path.join(dir, "src"), outDir = path.join(dir, "out");
  try {
    fs.mkdirSync(srcDir);
    const mp3 = (name, d) => A.ff(["-y", "-v", "error", "-f", "f32le", "-ar", String(R), "-ac", "2", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "128k", path.join(srcDir, name + ".mp3")], Buffer.from(d.buffer));
    mp3("blip", tone([[0.5, 0, 0], [0.4, 0.7, 660], [0.8, 0, 0]], 2));
    mp3("whirr", tone([[1, 0.5, 200]], 2));
    mp3("fanfare", tone([[0.3, 0, 0], [7, 0.6, 523], [1, 0, 0]], 2));
    mp3("tune", track());
    const config = { sounds: [{ name: "blip", kind: "sfx", gain: 0 }, { name: "whirr", kind: "loop", gain: 0 }, { name: "fanfare", kind: "jingle", gain: 0 },
      { name: "tune", kind: "music", gain: 0 }, { name: "ghost", kind: "sfx", gain: 0 }] };
    const first = A.build({ srcDir, outDir, config });
    const by = Object.fromEntries(first.manifest.map(e => [e.name, e]));
    assert.deepEqual(Object.keys(by).sort(), ["blip", "fanfare", "tune", "whirr"]);
    assert.ok(first.warnings.some(w => w.includes("ghost")), "a config entry with no file is warned about");
    near(by.blip.dur, 0.01 + 0.4 + 0.03, 0.06, "sfx trimmed (MP3 padding allowed)");
    near(by.whirr.dur, 1 - 0.05, 0.06, "loop crossfade");
    assert.equal(by.whirr.loop, true);
    near(by.fanfare.dur, 5, 0.06, "jingle cut");
    near(by.tune.dur, 33.5, 0.4, "music ending cut");
    near(A.measureLoudness(A.decode(path.join(outDir, "tune.mp3"), 2), 2).I, -18, 1, "music loudness");
    // a source with no config entry is warned about and skipped
    mp3("extra", tone([[0.3, 0.5, 440]], 2));
    assert.ok(A.build({ srcDir, outDir, config }).warnings.some(w => w.includes("extra.mp3")));
    // a second run: nothing is made again, no file is touched
    const files = () => fs.readdirSync(outDir).map(f => [f, fs.statSync(path.join(outDir, f)).mtimeMs, fs.readFileSync(path.join(outDir, f)).toString("base64")]);
    const before = files();
    const again = A.build({ srcDir, outDir, config });
    assert.ok(again.rows.every(r => r.fresh), "every sound is skipped");
    assert.equal(again.manifestChanged, false);
    assert.deepEqual(files(), before, "bytes and modification times are unchanged");
    // a changed gain makes only that sound again; a forced run gives the same bytes as before
    const c2 = { sounds: config.sounds.map(s => (s.name === "blip" ? { ...s, gain: 2 } : s)) };
    assert.deepEqual(A.build({ srcDir, outDir, config: c2 }).rows.filter(r => !r.fresh).map(r => r.name), ["blip"]);
    A.build({ srcDir, outDir, config, force: true });
    assert.deepEqual(files().map(f => [f[0], f[2]]), before.map(f => [f[0], f[2]]), "a forced re-encode gives the same bytes");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
