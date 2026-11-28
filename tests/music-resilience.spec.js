// SPEC-047 review fixes (music): a refused play() never leaves the music stopped for good (iOS refuses play() outside a gesture), a context interrupted by a call
// pauses it, a restart in the middle of a crossfade is clean, a failed track is tried again, the elements are a small reused pool, a world without a track
// plays theme. The stub below stands in for the browser refusing: HTMLMediaElement.prototype.play rejects (NotAllowedError) for the game's audio files while
// window.__refuse is on (the pool's own silent unlock file is let through, as a gesture would allow it).
const { test, expect } = require("./pw");
const { openGame } = require("./helpers");

const stubPlay = page => page.addInitScript(() => {
  const orig = HTMLMediaElement.prototype.play;
  window.__refuse = false; window.__refused = 0; window.__els = new Set(); window.__audioMade = 0;
  HTMLMediaElement.prototype.play = function (...a) {
    if ((this.currentSrc || this.src || "").includes("/assets/audio/")) {
      window.__els.add(this);
      if (window.__refuse) { window.__refused++; return Promise.reject(new DOMException("refused", "NotAllowedError")); }
    }
    return orig.apply(this, a);
  };
  const A0 = window.Audio;
  window.Audio = function (...a) { window.__audioMade++; return new A0(...a); };
  window.Audio.prototype = A0.prototype;
});
const gesture = async page => {
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => { const a = window.__bb.audioContext(); return !!a && a.state === "running"; });
};
const info = page => page.evaluate(() => window.__bb.audio.music);
const untilTrack = (page, name, timeout = 20_000) => page.waitForFunction(n => window.__bb.audio.track === n, name, { timeout });
const advancing = (page, from, timeout = 8000) => page.waitForFunction(t => window.__bb.audio.music.time > t + 0.5, from, { timeout });
const play = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.world = w; b.level = n; b.startGame(1); }, [world, level]);

test("a refused play() at the start leaves the music waiting, and the next gesture brings it back", async ({ page }) => {
  await stubPlay(page);
  const errors = await openGame(page);
  await page.evaluate(() => { window.__refuse = true; });
  await gesture(page);
  await untilTrack(page, "theme");                              // chosen, started, refused
  await page.waitForTimeout(1500);
  expect(await info(page), "silent: the clock does not run").toMatchObject({ track: "theme", playing: 0 });
  expect((await info(page)).time).toBeLessThan(0.1);
  expect(await page.evaluate(() => window.__refused)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__refuse = false; });
  await page.mouse.click(5, 5);                                 // the next gesture
  await advancing(page, 0);
  expect((await info(page)).playing).toBe(1);
  expect(errors).toEqual([]);
});

test("a refused play() at the loop point takes the crossfade back: the track goes on and crosses over a moment later", async ({ page }) => {
  await stubPlay(page);
  const errors = await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await page.waitForFunction(() => window.__bb.audio.music.dur > 60 && window.__bb.audio.music.elements === 2, null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  const id = (await info(page)).id, dur = (await info(page)).dur;
  await page.evaluate(() => { window.__refuse = true; });
  await page.evaluate(d => window.__bb.audio.seekMusic(d - 2.6), dur);
  await page.waitForFunction(() => window.__refused > 0, null, { timeout: 10_000 });   // the other element was refused at the loop point
  await page.evaluate(() => { window.__refuse = false; });
  const seen = [];
  for (let i = 0; i < 16; i++) { const m = await info(page); seen.push([m.track, m.playing >= 1]); await page.waitForTimeout(250); }
  expect(seen.every(([t, p]) => t === "theme" && p), "never silent, never another track: " + JSON.stringify(seen)).toBe(true);
  await page.waitForFunction(() => !window.__bb.audio.music.crossing && window.__bb.audio.music.time < 10, null, { timeout: 15_000 });
  expect(await info(page), "the other element took over").toMatchObject({ id, track: "theme", playing: 1 });
  expect(errors).toEqual([]);
});

test("a paused element with the context running is played again by the next gesture; an interrupted context pauses the music and the next gesture resumes it", async ({ page }) => {
  await stubPlay(page);
  const errors = await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  const t0 = (await info(page)).time;
  await advancing(page, t0);
  await page.evaluate(() => { for (const e of window.__els) e.pause(); });            // the system paused it
  await page.waitForTimeout(600);
  const t1 = (await info(page)).time;
  await page.waitForTimeout(600);
  expect((await info(page)).time, "stopped").toBeCloseTo(t1, 1);
  await page.mouse.click(5, 5);
  await advancing(page, t1);
  // a call on iOS: the context reports "interrupted"
  await page.evaluate(() => {
    const a = window.__bb.audioContext();
    Object.defineProperty(a, "state", { configurable: true, get: () => "interrupted" });
    a.onstatechange();
  });
  await page.waitForFunction(() => window.__bb.audio.musicPaused, null, { timeout: 5000 });
  const t2 = (await info(page)).time;
  await page.waitForTimeout(600);
  expect((await info(page)).time, "paused by the interruption").toBeCloseTo(t2, 1);
  await page.evaluate(() => { delete window.__bb.audioContext().state; });
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => !window.__bb.audio.musicPaused, null, { timeout: 5000 });
  await advancing(page, t2);
  expect(errors).toEqual([]);
});

test("the music switch off and on within a second, also in the middle of the loop crossfade, leaves one element audible and throws nothing", async ({ page }) => {
  const errors = await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await page.waitForFunction(() => window.__bb.audio.music.dur > 60 && window.__bb.audio.music.elements === 2, null, { timeout: 15_000 });
  const dur = (await info(page)).dur;
  const twice = async () => { await page.keyboard.press("KeyN"); await page.waitForTimeout(250); await page.keyboard.press("KeyN"); };
  // after a loop pass the second element is the active one
  await page.waitForTimeout(500);
  await page.evaluate(d => window.__bb.audio.seekMusic(d - 2.6), dur);
  await page.waitForFunction(() => window.__bb.audio.music.crossing, null, { timeout: 10_000 });
  await page.waitForFunction(() => !window.__bb.audio.music.crossing, null, { timeout: 10_000 });
  await twice();
  await untilTrack(page, "theme");
  await expect.poll(async () => (await info(page)).playing, { timeout: 10_000 }).toBe(1);
  // and in the middle of a crossfade
  await page.waitForTimeout(800);
  await page.evaluate(d => window.__bb.audio.seekMusic(d - 2.6), dur);
  await page.waitForFunction(() => window.__bb.audio.music.crossing, null, { timeout: 10_000 });
  await twice();
  await untilTrack(page, "theme");
  await expect.poll(async () => (await info(page)).playing, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(2500);
  expect((await info(page)).playing, "one element audible").toBe(1);
  expect(errors).toEqual([]);
});

test("a world track that failed to load is loaded when the network is back (the next visit to that world)", async ({ page }) => {
  await page.route("**/assets/audio/world_city.mp3", r => r.fulfill({ status: 404, body: "no" }));
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await play(page, "city", 3);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__bb.audio.track), "failed: theme").toBe("theme");
  await page.unroute("**/assets/audio/world_city.mp3");
  await page.evaluate(() => window.__bb.toMap());                 // leaving the world lets the failed track go
  await untilTrack(page, "theme");
  await play(page, "city", 3);
  await untilTrack(page, "world_city", 30_000);
});

test("the elements are a small pool unlocked in the first gesture and reused: five track changes make no new element", async ({ page }) => {
  await stubPlay(page);
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  const made0 = await page.evaluate(() => window.__audioMade);
  expect(made0, "the pool: AUDIO.POOL elements, made in the first gesture").toBe(8);
  for (const [w, n, t] of [["field", 3, "world_field"], ["city", 20, "boss"], ["school", 3, "world_school"], ["winter", 3, "world_winter"], ["park", 2, "theme"]]) {
    await play(page, w, n);
    await untilTrack(page, t, 30_000);
  }
  expect(await page.evaluate(() => window.__audioMade), "no element was made after the pool").toBe(made0);
});

test("a world without a track in the manifest plays theme and never asks for a file", async ({ page }) => {
  const asked = [];
  page.on("request", r => { if (r.url().includes("world_beach.mp3")) asked.push(r.url()); });
  await page.route("**/assets/audio/manifest.json", async route => {
    const res = await route.fetch(), body = await res.json();
    body.files = body.files.filter(f => f.name !== "world_beach");
    await route.fulfill({ response: res, json: body });
  });
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await page.waitForFunction(() => window.__bb.audio.loaded.length > 30, null, { timeout: 30_000 });
  await play(page, "beach", 3);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__bb.audio.track)).toBe("theme");
  expect(asked, "no request for the missing track").toEqual([]);
});

// WebKit counts only a release (pointerup, touchend) as a user activation, never the touch itself. The stub below is that browser: an element may play() only inside a
// pointerup, or once it has played inside one. The first gesture of a touch is a pointerdown, so the first unlock attempt is refused; the release unlocks, and from then on
// every track change and every loop crossfade (the standby element, which no gesture plays) must work with no further gesture.
test("the touch does not unlock the music elements, the release does: afterwards a loop crossfade and a track change play with no further gesture", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.play, unlocked = new WeakSet();
    let inRelease = false;
    window.__refusedTouch = 0;
    window.addEventListener("pointerup", () => { inRelease = true; }, true);      // capture: before the game's handler
    window.addEventListener("pointerup", () => { inRelease = false; });           // bubble: after it
    HTMLMediaElement.prototype.play = function (...a) {
      if (!inRelease && !unlocked.has(this)) { window.__refusedTouch++; return Promise.reject(new DOMException("needs a release", "NotAllowedError")); }
      if (inRelease) unlocked.add(this);
      return orig.apply(this, a);
    };
  });
  const errors = await openGame(page);
  await page.mouse.move(5, 5);
  await page.mouse.down();                                                         // the touch: the engine starts, nothing can play yet
  await page.waitForFunction(() => { const a = window.__bb.audioContext(); return !!a && a.state === "running"; });
  await untilTrack(page, "theme");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__refusedTouch), "the touch was refused").toBeGreaterThan(0);
  expect((await info(page)).playing, "silent until the release").toBe(0);
  await page.mouse.up();                                                           // the release
  await advancing(page, 0);
  // no more gestures from here on
  await page.waitForFunction(() => window.__bb.audio.music.dur > 60 && window.__bb.audio.music.elements === 2, null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  const { id, dur } = await info(page);
  await page.evaluate(d => window.__bb.audio.seekMusic(d - 2.6), dur);
  await page.waitForFunction(() => window.__bb.audio.music.crossing, null, { timeout: 10_000 });
  await page.waitForFunction(() => !window.__bb.audio.music.crossing && window.__bb.audio.music.time < 10, null, { timeout: 15_000 });
  expect(await info(page), "the loop crossfade worked without a gesture").toMatchObject({ id, track: "theme", playing: 1 });
  const t0 = (await info(page)).time;
  await advancing(page, t0);
  await play(page, "field", 3);
  await untilTrack(page, "world_field", 30_000);
  const t1 = (await info(page)).time;
  await advancing(page, t1);                                                       // the new track plays with no gesture
  await expect.poll(async () => (await info(page)).playing, { timeout: 10_000 }).toBe(1);   // the old track has faded out and gone
  expect(errors).toEqual([]);
});
