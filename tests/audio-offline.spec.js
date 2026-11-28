// SPEC-047 AC 11 (step 5): the sounds and the music offline. The install caches manifest.json + every sound, loop and jingle + theme and story
// (PRECACHE_AUDIO, written into sw.js by npm run audio) under AUDIO_HASH; the other tracks (a world's music, boss, theme_song) are fetched whole
// when first played and stored whole under TRACKS_HASH. A media element asks for byte ranges: the worker answers them from a cached whole file with
// a correct 206, and never stores a 206. Service workers are allowed here (playwright.config.js blocks them in every other spec).
const { test, expect } = require("./pw");
const fs = require("fs");
const path = require("path");
const { openGameHttp, reloadGame, softly, ROOT } = require("./helpers");
const { makeServer } = require("../scripts/serve");

test.use({ serviceWorkers: "allow" });

const SW_SRC = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const konst = name => (SW_SRC.match(new RegExp(`const ${name}\\s*=\\s*"?([^";\\s]+)"?`)) || [])[1];
const SW_BUILD = konst("SW_BUILD"), AUDIO_HASH = konst("AUDIO_HASH"), TRACKS_HASH = konst("TRACKS_HASH"), SRC_HASH = konst("SRC_HASH"), ASSETS_HASH = konst("ASSETS_HASH");
const CACHE_SRC = `bebebe-b${SW_BUILD}-src-${SRC_HASH}`, CACHE_ASSETS = `bebebe-b${SW_BUILD}-assets-${ASSETS_HASH}`, CACHE_THREE = "bebebe-three-" + konst("THREE_VERSION");
const CACHE_AUDIO = `bebebe-b${SW_BUILD}-audio-${AUDIO_HASH}`, CACHE_TRACKS = `bebebe-b${SW_BUILD}-tracks-${TRACKS_HASH}`;
const swList = name => { const m = SW_SRC.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`)); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : []; };
const FILES = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "audio", "manifest.json"), "utf8")).files;
const LOADED = FILES.filter(f => ["sfx", "loop", "jingle"].includes(f.kind)).length;

const waitForSW = page => page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 30_000 });
const pathsIn = (page, name) => page.evaluate(async n => ((await caches.has(n)) ? (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname) : null), name);
const gesture = async page => {
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => { const a = window.__bb.audioContext(); return !!a && a.state === "running"; });
};
const untilTrack = (page, name, timeout = 30_000) => page.waitForFunction(n => window.__bb.audio.track === n, name, { timeout });
const playLevel = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.world = w; b.level = n; b.startGame(1); }, [world, level]);

test("the sw.js block: the audio list and hashes are there, and the cache names carry no version", async () => {
  expect(AUDIO_HASH && TRACKS_HASH && SW_BUILD).toBeTruthy();
  expect(swList("PRECACHE_AUDIO").length).toBe(1 + LOADED + 2);                    // manifest.json + sounds, loops, jingles + theme and story
  expect(SW_SRC).toContain('const CACHE_AUDIO = CACHE_PREFIX + "b" + SW_BUILD + "-audio-" + AUDIO_HASH');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  expect([CACHE_AUDIO, CACHE_TRACKS].filter(n => n.includes(pkg)), "SPEC-039: named by the build and the content, never by the semver").toEqual([]);
});

test("the install caches the sounds and the music of the menus, not the other tracks", async ({ page }) => {
  const errors = await openGameHttp(page);
  await waitForSW(page);
  expect((await page.evaluate(() => caches.keys())).sort(), "the tracks cache is made when a track first plays").toEqual([CACHE_ASSETS, CACHE_AUDIO, CACHE_SRC, CACHE_THREE].sort());
  const cached = await pathsIn(page, CACHE_AUDIO);
  expect(cached.sort()).toEqual(swList("PRECACHE_AUDIO").map(u => "/" + u.slice(2)).sort());
  expect(cached).toEqual(expect.arrayContaining(["/assets/audio/manifest.json", "/assets/audio/theme.mp3", "/assets/audio/story.mp3", "/assets/audio/tap.mp3", "/assets/audio/win.mp3", "/assets/audio/rescue_loop.mp3"]));
  const soft = softly();
  for (const n of ["boss", "theme_song", "world_field", "world_city", "world_school", "world_beach", "world_winter"]) soft(cached.includes(`/assets/audio/${n}.mp3`), n + " is cached on first play, not at install").toBe(false);
  soft.done();
  expect((await pathsIn(page, CACHE_ASSETS)).filter(u => u.includes("/audio/")), "no audio in the sprite cache").toEqual([]);
  const bytes = await page.evaluate(async n => { const c = await caches.open(n); let s = 0; for (const r of await c.keys()) s += (await (await c.match(r)).arrayBuffer()).byteLength; return s; }, CACHE_AUDIO);
  expect(bytes, "AUDIO.PRECACHE_MAX (3.5 MB)").toBeLessThanOrEqual(3.5 * 1024 * 1024);
  expect(errors).toEqual([]);
});

test("a Range request is answered with a correct 206 from a cached file; an uncached track is stored whole, never as a 206", async ({ page }) => {
  await openGameHttp(page);
  await waitForSW(page);
  const r = await page.evaluate(async () => {
    const url = "assets/audio/theme.mp3", full = new Uint8Array(await (await fetch(url)).arrayBuffer()), n = full.length;
    const get = async (range, from) => {
      const res = await fetch(url, { headers: { Range: range } }), b = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, cr: res.headers.get("content-range"), cl: res.headers.get("content-length"), ar: res.headers.get("accept-ranges"), type: res.headers.get("content-type"),
        len: b.length, same: from === undefined || b.every((v, i) => v === full[from + i]) };
    };
    return { n, mid: await get("bytes=100-199", 100), tail: await get("bytes=-50", n - 50), open: await get("bytes=" + (n - 10) + "-", n - 10),
      from0: await get("bytes=0-", 0), past: await get("bytes=" + (n + 5) + "-"), whole: (await fetch(url)).status };
  });
  const size = FILES.find(f => f.name === "theme").bytes;
  expect(r.n).toBe(size);
  expect(r.mid).toMatchObject({ status: 206, cr: `bytes 100-199/${size}`, cl: "100", ar: "bytes", type: "audio/mpeg", len: 100, same: true });
  expect(r.tail).toMatchObject({ status: 206, cr: `bytes ${size - 50}-${size - 1}/${size}`, len: 50, same: true });
  expect(r.open).toMatchObject({ status: 206, cr: `bytes ${size - 10}-${size - 1}/${size}`, len: 10, same: true });
  expect(r.from0).toMatchObject({ status: 206, cr: `bytes 0-${size - 1}/${size}`, len: size, same: true });
  expect(r.past.status, "a range past the end").toBe(416);
  expect(r.whole, "a plain request: the whole file").toBe(200);
  // a track that was never played: the page asks for a piece — the worker fetches the whole file, stores it whole (200), answers the piece
  expect(await pathsIn(page, CACHE_TRACKS)).toBe(null);
  const city = FILES.find(f => f.name === "world_city").bytes;
  const piece = await page.evaluate(async () => { const res = await fetch("assets/audio/world_city.mp3", { headers: { Range: "bytes=0-99" } }); return { status: res.status, cr: res.headers.get("content-range"), len: (await res.arrayBuffer()).byteLength }; });
  expect(piece).toEqual({ status: 206, cr: `bytes 0-99/${city}`, len: 100 });
  await expect.poll(() => pathsIn(page, CACHE_TRACKS), { timeout: 15_000 }).toEqual(["/assets/audio/world_city.mp3"]);
  const stored = await page.evaluate(async n => { const c = await caches.open(n); const out = []; for (const q of await c.keys()) { const res = await c.match(q); out.push([res.status, (await res.arrayBuffer()).byteLength]); } return out; }, CACHE_TRACKS);
  expect(stored, "stored whole: status 200 and every byte").toEqual([[200, city]]);
});

test("offline after a first visit the sounds and theme play; a track played before plays too; one never played stays on theme", async ({ page, context }) => {
  test.slow();
  await openGameHttp(page);
  await waitForSW(page);
  await gesture(page);
  await untilTrack(page, "theme");
  await playLevel(page, "field", 3);
  await untilTrack(page, "world_field");                                    // played once: fetched whole and stored
  await expect.poll(() => pathsIn(page, CACHE_TRACKS), { timeout: 15_000 }).toContain("/assets/audio/world_field.mp3");
  await context.setOffline(true);
  await reloadGame(page);                                                    // offline: the page itself comes from the cache
  await gesture(page);
  await page.waitForFunction(n => window.__bb.audio.loaded.length + window.__bb.audio.failed.length >= n, LOADED, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__bb.audio.failed), "every sound came from the cache").toEqual([]);
  await untilTrack(page, "theme");                                          // the menu's music, offline
  await page.waitForFunction(() => window.__bb.audio.music.time > 0.5, null, { timeout: 15_000 });
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); b.game.fx.push({ type: "sfx", name: "hug" }); b.update(b.CFG.STEP); });
  expect(await page.evaluate(() => window.__bb.audio.log.some(e => e.name === "hug" && !e.synth)), "a sound plays offline").toBe(true);
  await playLevel(page, "field", 3);
  await untilTrack(page, "world_field");                                    // a track played before: from the tracks cache, with range requests
  await page.waitForFunction(() => window.__bb.audio.music.time > 0.5, null, { timeout: 15_000 });
  await page.evaluate(() => window.__bb.toMap());
  await untilTrack(page, "theme");
  await playLevel(page, "city", 3);                                         // never played, not cached: stays on theme
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__bb.audio.track)).toBe("theme");
  expect(await pathsIn(page, CACHE_TRACKS)).toEqual(["/assets/audio/world_field.mp3"]);
});

test("the sounds' caches are named by the build and the content, and the last two are kept like the sprites'", async ({ page }) => {
  test.slow();
  const override = { fn: () => null };
  const server = makeServer({ override: p => override.fn(p) });
  await new Promise(r => server.listen(0, r));
  try {
    const base = `http://localhost:${server.address().port}/`;
    await page.addInitScript(() => { window.__bbQuality = "high"; });
    await page.goto(base);
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    await waitForSW(page);
    await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 60_000 });
    await page.evaluate(() => { window.__bb.sim(true); });                 // idle: the worker takes over at once
    const keys = () => page.evaluate(async () => (await caches.keys()).sort());
    const update = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    expect(await keys()).toContain(CACHE_AUDIO);
    const named = h => `bebebe-b${SW_BUILD}-audio-${h}`;
    const withHash = h => SW_SRC.replace(`const AUDIO_HASH = "${AUDIO_HASH}";`, `const AUDIO_HASH = "${h}";`);
    expect(withHash("testaudio001")).not.toBe(SW_SRC);
    // a changed sound (a new AUDIO_HASH): a new audio cache, the code and the sprites stay, the old audio cache stays once (an old page may be open)
    override.fn = p => (p === "/sw.js" ? withHash("testaudio001") : null);
    await update();
    await expect.poll(keys, { timeout: 60_000 }).toEqual([CACHE_ASSETS, CACHE_AUDIO, named("testaudio001"), CACHE_SRC, CACHE_THREE].sort());
    await expect.poll(() => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !r.installing && !r.waiting && r.active.state === "activated"; }), { timeout: 30_000 }).toBe(true);
    override.fn = p => (p === "/sw.js" ? withHash("testaudio002") : null);
    await update();
    await expect.poll(keys, { timeout: 60_000 }).toEqual([CACHE_ASSETS, named("testaudio001"), named("testaudio002"), CACHE_SRC, CACHE_THREE].sort());
  } finally { server.close(); }
});

test("requests that come together for a track not cached yet share one download", async ({ page, context }) => {
  const asked = [];
  await context.route("**/assets/audio/world_school.mp3", async route => { asked.push(route.request().url()); await route.continue(); });
  await openGameHttp(page);
  await waitForSW(page);
  const size = FILES.find(f => f.name === "world_school").bytes;
  const got = await page.evaluate(async () => {
    const ask = range => fetch("assets/audio/world_school.mp3", { headers: { Range: range } }).then(async r => ({ status: r.status, cr: r.headers.get("content-range"), len: (await r.arrayBuffer()).byteLength }));
    return Promise.all([ask("bytes=0-"), ask("bytes=0-99"), ask("bytes=5000-5999"), ask("bytes=-10")]);
  });
  expect(got.map(g => g.status)).toEqual([206, 206, 206, 206]);
  expect(got.map(g => g.len)).toEqual([size, 100, 1000, 10]);
  expect(asked.length, "one request reached the network").toBe(1);
  await expect.poll(() => pathsIn(page, CACHE_TRACKS), { timeout: 15_000 }).toEqual(["/assets/audio/world_school.mp3"]);
});
