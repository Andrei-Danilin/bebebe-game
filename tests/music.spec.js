// SPEC-047 AC 6 / 7 / 12 (step 3): the music — streamed through two HTMLAudioElements per track (never decoded), the right track on each screen,
// crossfades between screens, the loop crossfade, the bus levels (menus / play / pause, the dip under a jingle). A rendered page with a real
// AudioContext; the first tap starts everything (the engine and the music). __bb.audio.track = the track that sounds, __bb.audio.music =
// { track, id, time, dur, elements, crossing } of the playing pair, __bb.audio.levels = the bus gains.
const { test, expect } = require("./pw");
const { openGame, openSim } = require("./helpers");

const MUSIC_NAMES = ["theme", "story", "boss", "theme_song", "world_field", "world_city", "world_school", "world_beach", "world_winter"];

async function gesture(page) {
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => { const a = window.__bb.audioContext(); return !!a && a.state === "running"; });
}
const track = page => page.evaluate(() => window.__bb.audio.track);
const info = page => page.evaluate(() => window.__bb.audio.music);
const levels = page => page.evaluate(() => window.__bb.audio.levels);
const untilTrack = (page, name, timeout = 20_000) => page.waitForFunction(n => window.__bb.audio.track === n, name, { timeout });
// the bus gain settles (it ramps over LEVEL_RAMP s): wait for it to be at `v`
const untilLevel = (page, v, timeout = 10_000) => page.waitForFunction(x => { const l = window.__bb.audio.levels; return !!l && Math.abs(l.music - x) < 0.002; }, v, { timeout });
const play = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.world = w; b.level = n; b.startGame(1); }, [world, level]);
// record every buffer the page decodes (music must never be one of them)
const recordDecodes = page => page.addInitScript(() => {
  const orig = BaseAudioContext.prototype.decodeAudioData;
  window.__decoded = [];
  BaseAudioContext.prototype.decodeAudioData = function (...a) { return Promise.resolve(orig.apply(this, a)).then(b => { window.__decoded.push(b.duration); return b; }); };
});

test("no audio element before the first gesture; then theme streams in the menu, and no music is ever decoded into an AudioBuffer", async ({ page }) => {
  await recordDecodes(page);
  await openGame(page);
  await page.waitForTimeout(600);
  expect(await info(page), "nothing before a gesture").toEqual({ track: null, id: 0, time: 0, dur: 0, pair: 0, elements: 0, playing: 0, crossing: false });
  await gesture(page);
  await untilTrack(page, "theme");
  const a = await info(page);
  expect([a.track, a.elements <= 2]).toEqual(["theme", true]);
  await page.waitForFunction(t => window.__bb.audio.music.time > t + 0.5, a.time, { timeout: 10_000 });   // it plays: the element's clock runs
  await page.waitForFunction(() => window.__bb.audio.loaded.length >= 40, null, { timeout: 30_000 });
  const d = await page.evaluate(() => ({ decoded: window.__decoded, loaded: window.__bb.audio.loaded }));
  expect(d.decoded.length, "the sounds were decoded").toBeGreaterThanOrEqual(40);
  expect(Math.max(...d.decoded), "no decoded buffer is a music track (the longest sound is 5 s; the shortest track 63 s)").toBeLessThan(10);
  expect(d.loaded.filter(n => MUSIC_NAMES.includes(n))).toEqual([]);
});

test("menu → map → a Park level keeps theme: the same element goes on, no restart; the bus is lower in play, lowest in pause", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await untilLevel(page, 0.7);
  const home = await info(page);
  await page.waitForFunction(t => window.__bb.audio.music.time > t + 0.5, home.time, { timeout: 10_000 });
  await page.evaluate(() => window.__bb.openMap());
  await page.waitForTimeout(300);
  await play(page, "park", 1);
  await untilLevel(page, 0.35);
  const inPlay = await info(page);
  expect([inPlay.track, inPlay.id], "the same track, the same pair of elements").toEqual(["theme", home.id]);
  expect(inPlay.time, "the clock never went back").toBeGreaterThan(home.time + 0.4);
  expect((await levels(page)).music, "play").toBeCloseTo(0.35, 2);
  await page.evaluate(() => { window.__bb.mode = "pause"; });
  await untilLevel(page, 0.25);
  expect((await levels(page)).music, "pause").toBeCloseTo(0.25, 2);
  await page.evaluate(() => window.__bb.toHome());
  await untilLevel(page, 0.7);
  expect((await info(page)).id, "home again: still the same pair").toBe(home.id);
  expect((await levels(page)).master).toBeCloseTo(0.8, 2);
});

test("a Field level plays world_field, level 20 plays boss, and the way back crossfades to theme", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await play(page, "field", 3);
  await untilTrack(page, "world_field");
  await page.waitForFunction(() => window.__bb.audio.music.elements <= 2, null, { timeout: 5000 });   // the old track faded out and was let go: only this one's pair is left
  await play(page, "city", 20);
  await untilTrack(page, "boss");
  await play(page, "park", 20);
  expect(await track(page), "level 20 of any world, the Park too: still boss").toBe("boss");
  await play(page, "park", 5);
  await untilTrack(page, "theme");
  await play(page, "winter", 7);
  await untilTrack(page, "world_winter");
  await page.evaluate(() => window.__bb.toMap());
  await untilTrack(page, "theme");
});

test("a world track that is not loaded yet plays theme, then crossfades; one that fails to load stays on theme (and is not hammered)", async ({ page }) => {
  let beach = 0;
  await page.route("**/assets/audio/world_city.mp3", async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
  await page.route("**/assets/audio/world_beach.mp3", r => { beach++; return r.fulfill({ status: 404, body: "no" }); });
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await play(page, "city", 2);
  await page.waitForTimeout(800);
  expect(await track(page), "city is on its way: theme goes on").toBe("theme");
  await untilTrack(page, "world_city");
  await play(page, "beach", 2);
  await page.waitForTimeout(2500);
  expect(await track(page), "beach failed: theme").toBe("theme");
  expect(beach, "one request, not one per frame").toBeLessThanOrEqual(2);
});

test("Story, How to play, the cards and the practice games play story; the ending plays theme_song once, then theme", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await page.evaluate(() => window.__bb.openStory());
  await untilTrack(page, "story");
  await page.evaluate(() => window.__bb.toHome());
  await untilTrack(page, "theme");
  await page.evaluate(() => window.__bb.openScene("intro", null, { mark: false }));
  await untilTrack(page, "story");
  await page.evaluate(() => window.__bb.toHome());
  await untilTrack(page, "theme");
  // the ending: the song, to its end, once
  await page.evaluate(() => window.__bb.openScene("ending", null, { mark: false }));
  await untilTrack(page, "theme_song");
  const song = await info(page);
  expect(song.pair, "one element: the song is not looped").toBe(1);
  await page.evaluate(d => window.__bb.audio.seekMusic(d - 1.2), song.dur);
  await untilTrack(page, "theme", 15_000);
  await page.waitForTimeout(2500);
  expect(await track(page), "once: theme goes on under the ending's last card").toBe("theme");
  await page.evaluate(() => window.__bb.toHome());
  // a second visit plays the song again
  await page.evaluate(() => window.__bb.openScene("ending", null, { mark: false }));
  await untilTrack(page, "theme_song");
  // a practice game is story music too
  await page.evaluate(() => window.__bb.toHome());
  await untilTrack(page, "theme");
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); });
  await page.evaluate(() => { const g = window.__bb.game; g.tutorialGame = 1; });
  await untilTrack(page, "story");
});

test("the loop: the second element comes in under the end of the first (2 s equal-power crossfade), the track never stops", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  const a = await info(page);
  await page.waitForFunction(() => window.__bb.audio.music.dur > 60, null, { timeout: 10_000 });
  const dur = (await info(page)).dur;
  await page.waitForFunction(() => window.__bb.audio.music.elements === 2, null, { timeout: 10_000 });   // the standby is loading
  await page.waitForTimeout(500);
  await page.evaluate(d => window.__bb.audio.seekMusic(d - 2.6), dur);
  await page.waitForFunction(() => window.__bb.audio.music.crossing, null, { timeout: 10_000 });
  expect((await info(page)).track).toBe("theme");
  const seen = [];
  for (let i = 0; i < 12; i++) { seen.push((await info(page)).track); await page.waitForTimeout(250); }
  expect(seen.every(t => t === "theme"), "no gap: always theme").toBe(true);
  await page.waitForFunction(() => !window.__bb.audio.music.crossing, null, { timeout: 10_000 });
  const b = await info(page);
  expect([b.id, b.track]).toEqual([a.id, "theme"]);
  expect(b.time, "the other element is playing from the start").toBeLessThan(10);
  await page.waitForTimeout(700);
  expect((await info(page)).time, "and it runs").toBeGreaterThan(b.time + 0.4);
});

test("a jingle dips the music to 0.1 and it comes back over 0.5 s", async ({ page }) => {
  await openGame(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await page.waitForFunction(() => window.__bb.audio.loaded.includes("world_open"), null, { timeout: 30_000 });
  await untilLevel(page, 0.7);
  await page.evaluate(() => { const b = window.__bb; b.game.fx.push({ type: "sfx", name: "world_open" }); b.update(b.CFG.STEP); });
  await untilLevel(page, 0.1, 3000);
  expect((await levels(page)).music).toBeCloseTo(0.1, 2);
  await untilLevel(page, 0.7, 12_000);
});

test("with the music off no track plays and no element exists; switching it on brings theme back; a hidden tab never starts music", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__bb.toHome());
  await page.evaluate(() => window.__bb.tapButton("home:music"));            // off
  expect(await page.evaluate(() => window.__bb.audio.settings.music)).toBe(false);
  await gesture(page);
  await page.waitForTimeout(1200);
  expect(await info(page), "off: nothing").toEqual({ track: null, id: 0, time: 0, dur: 0, pair: 0, elements: 0, playing: 0, crossing: false });
  await page.evaluate(() => window.__bb.tapButton("home:music"));            // on
  await untilTrack(page, "theme");
  await page.evaluate(() => window.__bb.tapButton("home:music"));            // off again: it fades out and is let go
  await page.waitForFunction(() => window.__bb.audio.track === null && window.__bb.audio.music.elements === 0, null, { timeout: 10_000 });
  await page.evaluate(() => window.__bb.tapButton("home:music"));
  await untilTrack(page, "theme");
});

test("a hidden tab never starts music", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); });
  await gesture(page);
  await page.waitForTimeout(1000);
  expect((await info(page)).elements, "hidden: nothing").toBe(0);
  await page.evaluate(() => { delete document.hidden; });
  await untilTrack(page, "theme");
});

test("sim mode: no music, no element", async ({ page }) => {
  await openSim(page);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => [window.__bb.audio.track, window.__bb.audio.music.elements, window.__bb.audioContext()])).toEqual([null, 0, null]);
});
