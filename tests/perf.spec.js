// SPEC-025 phase 3: memory and the perf hook.
// - AC 15b: __bb.perf() — fps and frame time p50/p95/max over the last LOOK.PERF_LOOK.frames frames, draw calls and triangles,
//   renderer.info.memory and programs, cache sizes, the JS heap, DPR, canvas sizes, the level, the game/real time ratio.
// - AC 15: 30 levels across all six worlds plus 10 wardrobe opens on a rendered page: the three.js geometries, textures and
//   programs, the preview cache, the art table and the 2D caches come back to their level-5 values ±2 when the game returns to
//   that level after other levels,
//   and the JS heap after a forced GC grows ≤ 10 %. disposeTree also frees the textures of own materials.
// Speed (SwiftShader on CI): the game logic of each level advances with step() (no waiting), and each level draws only two
// frames — enough to build and upload everything a level creates.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames, step } = require("./helpers");

test("AC 15b: __bb.perf() has every field after 2 s of play", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.seedRandom(3); b.startGame(1); });
  await step(page, 2);
  // the window fills with real frames of play (polled: a SwiftShader frame on CI is slow)
  await page.waitForFunction(() => window.__bb.perf().frames >= 20, null, { timeout: 60_000, polling: 100 });
  const r = await page.evaluate(() => ({ p: window.__bb.perf(), max: window.__bb.CFG.PERF_LOOK.frames, level: `${window.__bb.world} ${window.__bb.level}` }));
  const p = r.p;
  expect(Object.keys(p).sort()).toEqual(["caches", "canvas", "dpr", "draw", "fps", "frameMs", "frames", "gameRealRatio", "heap", "level", "memory", "programs"].sort());
  expect(r.max).toBe(300);
  expect(p.frames).toBeLessThanOrEqual(r.max);
  expect(p.fps).toBeGreaterThan(0);
  expect(p.frameMs.p50).toBeGreaterThan(0);
  expect(p.frameMs.p50 <= p.frameMs.p95 && p.frameMs.p95 <= p.frameMs.max).toBe(true);
  expect(p.draw.calls).toBeGreaterThan(0);
  expect(p.draw.triangles).toBeGreaterThan(0);
  expect(p.memory.geometries).toBeGreaterThan(0);
  expect(p.memory.textures).toBeGreaterThan(0);
  expect(p.programs).toBeGreaterThan(0);
  expect(Object.keys(p.caches).sort()).toEqual(["art", "mapBg", "minimap", "paper", "previews"]);
  expect(p.heap === null || p.heap > 0, "the heap where the browser tells it").toBe(true);
  expect(p.dpr).toBeGreaterThan(0);
  expect(p.canvas.ui.w > 0 && p.canvas.gl.w > 0).toBe(true);
  expect(p.level).toBe(r.level);
  expect(p.gameRealRatio).toBeGreaterThan(0);
  expect(p.gameRealRatio).toBeLessThanOrEqual(1.001);
  // ?perf=1 shows it as an overlay with a copy button (debug only)
  expect(await page.evaluate(() => !!document.getElementById("perf"))).toBe(false);
  expect(errors).toEqual([]);
});

test("AC 15b: perf and disposeCheck are drawn state — a sim page throws on them", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const r = await page.evaluate(() => ["perf", "disposeCheck"].map(k => { try { window.__bb[k](); return "no throw"; } catch (e) { return /sim mode/.test(e.message) ? "throws" : e.message; } }));
  expect(r).toEqual(["throws", "throws"]);
  expect(errors).toEqual([]);
});

test("AC 15b: ?perf=1 shows the overlay with a copy button", async ({ page }) => {
  const errors = await openGame(page, { query: "?perf=1" });
  await page.waitForFunction(() => /fps/.test((document.querySelector("#perf pre") || {}).textContent || ""), null, { timeout: 30_000 });
  expect(await page.evaluate(() => document.querySelector("#perf button").textContent)).toBe("copy");
  expect(errors).toEqual([]);
});

test("AC 15: 30 levels in all six worlds and 10 wardrobe opens: three.js counts, caches and heap stay flat", async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await openGame(page);
  const cdp = await page.context().newCDPSession(page);
  const worlds = await page.evaluate(() => window.__bb.WORLDS);
  expect(worlds.length).toBe(6);
  const counts = () => page.evaluate(() => {
    const p = window.__bb.perf();
    return { geometries: p.memory.geometries, textures: p.memory.textures, programs: p.programs, ...p.caches };
  });
  // the JS heap after a forced GC: a heap snapshot's objects without V8's compiled code (the JIT keeps compiling hotter code over
  // a long run — a snapshot diff over 40 levels showed only code, no game objects) and without the browser's timing entries.
  // The level cache (core build.js: the accepted attempt of each level, by design one per level of the game) is emptied first.
  const heap = async () => {
    await page.evaluate(() => { window.__bb.clearLevelCache(); });
    const chunks = [], onChunk = e => chunks.push(e.chunk);
    cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
    cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
    const s = JSON.parse(chunks.join("")), f = s.snapshot.meta.node_fields, types = s.snapshot.meta.node_types[0];
    const ti = f.indexOf("type"), ni = f.indexOf("name"), si = f.indexOf("self_size");
    let size = 0;
    for (let i = 0; i < s.nodes.length; i += f.length) {
      const type = types[s.nodes[i + ti]], name = s.strings[s.nodes[i + ni]];
      if (type === "code" || /^(Performance|TaskAttributionTiming|blink::ScriptTimingInfo)/.test(name)) continue;
      size += s.nodes[i + si];
    }
    return size;
  };
  const wardrobe = async () => {
    await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "looks"; });
    await frames(page);
    await page.evaluate(() => { window.__bb.mode = "map"; });
    await frames(page);
  };
  // level i is level LEVELS[⌊i/6⌋] of world i mod 6: every world five times, levels 1 to 20 (bosses on 20). Level 5 (the 5th
  // played) is the reference; after every 5th level the game goes back to exactly that level (same world, level and seed): what
  // the levels in between made must be gone again (their maps differ, so only the same level compares)
  const LEVELS = [1, 5, 10, 15, 20];
  const play = async (world, n, seed) => {
    await page.evaluate(([w, lv, s]) => { const b = window.__bb; b.mode = "map"; b.world = w; b.level = lv; b.seedRandom(s); b.startGame(1); }, [world, n, seed]);
    await step(page, 1);
    await frames(page);
  };
  const REF = [worlds[4], LEVELS[0], 104];
  let base = null, baseHeap = 0, opens = 0;
  const seen = [], problems = [];
  for (let i = 0; i < 30; i++) {
    await play(worlds[i % 6], LEVELS[Math.floor(i / 6)], 100 + i);
    if (i % 3 === 2 && opens < 10) { await wardrobe(); opens++; await page.evaluate(() => { window.__bb.mode = "play"; }); await frames(page); }
    if (i === 4) { base = await counts(); baseHeap = await heap(); continue; }
    if (i % 5 === 4) {
      await play(...REF);
      const c = await counts();
      seen.push({ after: i + 1, ...c });
      for (const k of Object.keys(base)) if (Math.abs(c[k] - base[k]) > 2) problems.push(`back on level 5 after level ${i + 1}: ${k} ${c[k]}, level 5 had ${base[k]}`);
    }
  }
  expect(opens).toBe(10);
  const endHeap = await heap();
  console.log(`[memory] level 5: ${JSON.stringify(base)}, heap ${(baseHeap / 1048576).toFixed(1)} MB; back on it after level 30: ${JSON.stringify(seen[seen.length - 1])}, heap ${(endHeap / 1048576).toFixed(1)} MB`);
  expect(seen.length).toBe(5);
  expect(problems, JSON.stringify(seen)).toEqual([]);
  expect(endHeap, `the heap after GC: ${baseHeap} → ${endHeap}`).toBeLessThanOrEqual(baseHeap * 1.1);
  expect(errors).toEqual([]);
});

test("AC 15: disposeTree frees the textures of own materials, never a shared one", async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => window.__bb.disposeCheck());
  expect(r).toEqual({ ownMap: true, sharedMap: false, gradient: false, material: true });
  expect(errors).toEqual([]);
});

// =====================================================================================================================
// SPEC-040 step 1: the baselines. Every number the acceptance criteria of SPEC-040 bound is measured here, on today's code, before
// any change. A test whose bound today's code misses is marked `test.fail()` ("SPEC-040 step N turns this on": that step deletes
// the line, and the test then guards the bound for good — a test.fail() that starts to pass is a red run, so a step cannot forget).
// Counts (draw calls, renders, measureText calls, allocations, bytes) are gates; times are not (CI draws with SwiftShader): the
// frame-time tests only record. Every measure goes through record(): a "[perf]" console line, and with PERF_OUT=<file> one JSON
// line {key, value, gl} appended to it — the numbers of reports/perf.md ("SPEC-040 baseline", later its "after") come from there.
//   PERF_OUT=C:/tmp/perf.jsonl npx playwright test tests/perf.spec.js -g "SPEC-040"        (PW_GPU=0 PW_NICE=0: SwiftShader)
// =====================================================================================================================
const fs = require("fs");
const { glBackend } = require("./test-env");
const record = (key, value) => {
  console.log(`[perf] ${key}: ${JSON.stringify(value)}`);
  if (process.env.PERF_OUT) fs.appendFileSync(process.env.PERF_OUT, JSON.stringify({ key, value, gl: glBackend() }) + "\n");
};
const PHONE = { viewport: { width: 667, height: 375 }, query: "?phone=1" };   // the phone view of every phone test
const TABLET = { viewport: { width: 1180, height: 820 }, query: "" };         // a tablet (an iPad) counts as desktop: no ?phone=1
const MB = 1048576;
const round1 = v => Math.round(v * 10) / 10;
const pctile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

// "busiest" = the level with the most draw calls (colour + shadow, renderer.info after one render) of levels 1–20 of the world, on
// the view in question (the tablet shows the whole map, so it is the scene's weight; the phone camera follows the hero and culls
// the rest). Picked on 2026-11-27 on master 0c30772 by the scan test below (PERF_SCAN=1); the level generator is seeded per level,
// so the tables stay valid until a spec changes the generator — the scan test says if they have moved.
const BUSIEST = {
  phone: { park: 3, field: 3, city: 3, school: 3, beach: 3, winter: 2 },
  tablet: { park: 3, field: 3, city: 3, school: 2, beach: 2, winter: 2 }
};
const START_SEED = 5;
// starts world/level n as the first player (the level cache keeps each level's accepted attempt: the map is the same on every run)
async function playLevel(page, world, n) {
  await page.evaluate(([w, lv, s]) => { const b = window.__bb; b.mode = "map"; b.world = w; b.level = lv; b.seedRandom(s); b.startGame(1); }, [world, n, START_SEED]);
}
// draw calls of the main pass and its triangles, after the level has drawn a few frames. The shadow pass is in the count (three.js
// counts both passes in one render call; checked on Beach 2 on the tablet: 3061 calls = 1295 colour + 1766 shadow)
async function drawnCalls(page) {
  await frames(page); await frames(page); await frames(page);
  return page.evaluate(() => { const p = window.__bb.perf(); return { calls: p.draw.calls, triangles: p.draw.triangles }; });
}
// opens a rendered page on a view (viewport first, then the game with its query)
async function openView(page, view, opts = {}) {
  await page.setViewportSize(view.viewport);
  return openGame(page, { query: view.query, ...opts });
}

// ---------- AC 1: decoded sprite memory at the home screen (RR-46) ----------
// Σ naturalWidth × naturalHeight × 4 of the sprites in memory (the decoded RGBA the browser keeps), read when the loading screen is
// gone and the number has stopped moving. (Before SPEC-040 step 2 every sprite of ART_NAMES loaded at start: 83 MB.)
async function homeSprites(page) {
  await page.waitForFunction(() => !window.__bb.artInfo.loadingShown, null, { timeout: 60_000, polling: 100 });
  // artInfo.bytes = Σ naturalWidth × naturalHeight × 4 of the sprites in memory; read without art(): asking for a sprite loads it
  const read = () => page.evaluate(() => { const b = window.__bb, i = b.artInfo; return { loaded: i.loaded, total: i.total, resident: i.resident, bytes: i.bytes, mode: b.mode }; });
  let a = await read();
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(300); const b = await read(); if (b.bytes === a.bytes && b.loaded === a.loaded) return b; a = b; }
  return a;
}
test("SPEC-040 AC 1: decoded sprite memory at the home screen is at most 25 MB", async ({ page }) => {
  const errors = await openGame(page);
  const r = await homeSprites(page);
  expect(r.mode).toBe("home");
  record("sprites at home", { loaded: r.loaded, resident: r.resident, total: r.total, MB: round1(r.bytes / MB) });
  expect(r.loaded, "sprites that loaded").toBeGreaterThan(100);   // the art folder is there: the number below is a real measure
  expect(r.bytes / MB, `decoded sprites at home: ${round1(r.bytes / MB)} MB in ${r.loaded} sprites`).toBeLessThanOrEqual(25);
  expect(errors).toEqual([]);
});

// ---------- AC 2: draw calls (colour + shadow) of the busiest level of each world (RR-42) ----------
for (const [name, view, limit] of [["phone", PHONE, 300], ["tablet", TABLET, 600]]) {
  test(`SPEC-040 AC 2: the busiest level of each world draws at most ${limit} calls on the ${name} view`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await openView(page, view);
    const worlds = await page.evaluate(() => window.__bb.WORLDS);
    const out = {}, over = [];
    for (const w of worlds) {
      await playLevel(page, w, BUSIEST[name][w]);
      const r = await drawnCalls(page);
      out[w] = { level: BUSIEST[name][w], calls: r.calls, tris: r.triangles };
      if (r.calls > limit) over.push(`${w} ${BUSIEST[name][w]}: ${r.calls}`);
    }
    record(`draw calls ${name}`, out);
    expect(over, `over ${limit} calls: ${over.join(", ")}`).toEqual([]);
    expect(errors).toEqual([]);
  });
}
// the scan the tables above come from: every level 1–20 of every world, on both views (about 3 min; not part of the suite)
test("SPEC-040 scan: the busiest level of each world is the one in BUSIEST (PERF_SCAN=1)", async ({ page }) => {
  test.skip(!process.env.PERF_SCAN, "a scan of 240 levels: PERF_SCAN=1");
  test.setTimeout(900_000);
  const errors = [];
  for (const [name, view] of [["phone", PHONE], ["tablet", TABLET]]) {
    await openView(page, view);
    const worlds = await page.evaluate(() => window.__bb.WORLDS), found = {};
    for (const w of worlds) {
      const calls = [];
      for (let n = 1; n <= 20; n++) { await playLevel(page, w, n); calls.push((await drawnCalls(page)).calls); }
      found[w] = calls.indexOf(Math.max(...calls)) + 1;
      record(`scan ${name} ${w}`, calls);
    }
    expect(found, `the busiest levels on the ${name} view have moved: ${JSON.stringify(found)}`).toEqual(BUSIEST[name]);
  }
  expect(errors).toEqual([]);
});

// ---------- AC 3: render3D only when needed (RR-47) ----------
// ui.renders (= __bb.sim().renders) counts render3D calls; ui.draws the frame loop's ticks (the 2D layer draws on every one). The window is
// a number of TICKS, not of seconds (a SwiftShader frame is 100–300 ms, a GPU one 17 ms): it ends after `ticks` ticks, or after maxSec when
// given (the menus' cap is a rate, so there the window must not grow without end on a slow machine). A bound on renders is then the same
// on every machine: "no render in 8 ticks" cannot be met by a machine that is too slow to tick.
const TICKS = 8;   // enough: today a render comes with every tick, so 8 ticks show 8 renders; the bounds allow 0 or 1
async function renderWindow(page, { ticks = TICKS, maxSec = 180 } = {}) {
  return page.evaluate(([ticks, maxSec]) => new Promise(resolve => {
    const b = window.__bb, a = b.sim(), t0 = performance.now();
    const poll = () => {
      const s = b.sim(), sec = (performance.now() - t0) / 1000, d = s.draws - a.draws;
      if (d >= ticks || sec >= maxSec) resolve({ renders: s.renders - a.renders, draws: d, sec, perSec: (s.renders - a.renders) / sec, fps: d / sec });
      else setTimeout(poll, 20);
    };
    poll();
  }), [ticks, maxSec]);
}
const settle = async page => { await frames(page); await frames(page); };
test("SPEC-040 AC 3: no render3D while story, scene, Character pages and the grown-ups page cover the 3D", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const screens = {
    story: () => { window.__bb.mode = "story"; },
    scene: () => { window.__bb.openScene("intro"); },
    "character progress": () => { window.__bb.openShop("home", "progress"); },
    "character items": () => { window.__bb.openShop("home", "items"); },
    "character wardrobe": () => { window.__bb.openShop("home", "wardrobe"); },
    "character upgrades": () => { window.__bb.openShop("home", "upgrades"); },
    "grown-ups": () => { window.__bb.mode = "story"; window.__bb.grownUps.open(); }   // + the gate answered below: the page is what covers
  };
  const out = {}, bad = [];
  for (const [name, go] of Object.entries(screens)) {
    await page.evaluate(go);
    if (name === "grown-ups") await page.evaluate(() => { const g = window.__bb.grownUps.gate, want = g.a * g.b; [...document.querySelectorAll("#gate button[data-act=answer]")].find(b => Number(b.textContent) === want).click(); });
    await settle(page);
    if (name === "grown-ups" && !(await page.evaluate(() => !!document.getElementById("grownups")))) bad.push("grown-ups: the page did not open");
    const r = await renderWindow(page);
    out[name] = { renders: r.renders, ticks: r.draws, sec: round1(r.sec) };
    if (r.renders > 0) bad.push(`${name}: ${r.renders} renders in ${r.draws} ticks`);
    if (r.draws < TICKS) bad.push(`${name}: the frame loop ticked only ${r.draws} times`);
    await page.evaluate(() => { for (const id of ["grownups", "gate"]) document.getElementById(id)?.remove(); window.__bb.mode = "home"; });
  }
  record("renders on covered screens (8 ticks each)", out);
  expect(bad, `render3D ran under a full-screen page: ${bad.join("; ")}`).toEqual([]);
  expect(errors).toEqual([]);
});
// The pause menu: the world is drawn when the pause starts, and again only while a roof / tree / bush fade is still moving (a few
// frames: it must not freeze half way); then not at all.
test("SPEC-040 AC 3: a paused level renders once, settles, and then renders nothing", async ({ page }) => {
  const errors = await openGame(page);
  await playLevel(page, "park", 3);
  await step(page, 1); await settle(page);
  const r0 = await page.evaluate(() => window.__bb.sim().renders);
  await page.evaluate(() => { window.__bb.mode = "pause"; });
  await settle(page);
  // quiet = no render in 8 ticks (fades move for a few dozen frames at most)
  let quiet = null;
  for (let i = 0; i < 12 && !quiet; i++) { const w = await renderWindow(page); if (w.renders === 0) quiet = w; }
  const since = (await page.evaluate(() => window.__bb.sim().renders)) - r0;
  record("renders from the pause until it is quiet", { renders: since });
  expect(quiet, "the paused scene stops rendering").not.toBe(null);
  expect(quiet.draws, "the frame loop ticked").toBeGreaterThanOrEqual(TICKS);
  expect(since, "the world was drawn when the pause started").toBeGreaterThanOrEqual(1);
  expect(since, "and only while a fade was moving").toBeLessThanOrEqual(40);
  // something changes: another screen (a new seq) and a resized canvas each draw the frozen scene once
  const w2 = await page.evaluate(() => { const b = window.__bb, a = b.sim().renders; b.mode = "play"; b.mode = "pause"; return a; });
  await settle(page);
  expect((await page.evaluate(() => window.__bb.sim().renders)) - w2, "a changed screen draws the frozen scene").toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
test("SPEC-040 AC 3: the menus render at most CFG.MENU_FPS (30) frames per second", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const out = {};
  for (const [name, go] of [["home", () => { window.__bb.mode = "home"; }], ["map", () => { window.__bb.mode = "map"; }]]) {
    await page.evaluate(go); await settle(page);
    const r = await renderWindow(page, { ticks: 90, maxSec: 3 });
    out[name] = { renders: r.renders, perSec: round1(r.perSec), frameLoopFps: round1(r.fps) };
  }
  record("menu renders per second", out);
  // the cap only shows where the frame loop is faster than it: a machine drawing under ~40 fps (SwiftShader) is under it anyway
  test.skip(out.home.frameLoopFps < 40 || out.map.frameLoopFps < 40, `the frame loop runs ${out.home.frameLoopFps} / ${out.map.frameLoopFps} fps: the 30 fps cap cannot be seen here`);
  for (const [name, o] of Object.entries(out)) expect(o.perSec, `${name} renders ${o.perSec}/s`).toBeLessThanOrEqual(30 * 1.1);
  expect(errors).toEqual([]);
});
test.describe("rotate overlay", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });   // a phone held upright
  test("SPEC-040 AC 3: no render3D under the rotate overlay", async ({ page }) => {
    const errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.rotateShown === true, null, { timeout: 30_000, polling: 100 });
    await settle(page);
    const r = await renderWindow(page);
    record("renders under the rotate overlay (8 ticks)", { renders: r.renders, ticks: r.draws, sec: round1(r.sec) });
    expect(r.renders, `${r.renders} renders in ${r.draws} ticks under the rotate overlay`).toBe(0);
    expect(errors).toEqual([]);
  });
});

// The canvas keeps its last picture while nothing is drawn; a resize empties it. The way back from a full-screen page and a resize under
// it must leave the world drawn, not a black or empty frame. The 2D layer is hidden for the check, so only the 3D canvas is seen: a
// strip of ground (green) at the bottom of the screen, left of the Big One's house.
const sharp = require("sharp");
async function groundStrip(page) {
  const vp = page.viewportSize();
  await page.evaluate(() => { document.getElementById("game").style.visibility = "hidden"; });
  const png = await page.screenshot({ clip: { x: 300, y: vp.height - 60, width: 300, height: 24 } });
  await page.evaluate(() => { document.getElementById("game").style.visibility = ""; });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const m = [0, 0, 0], n = data.length / info.channels;
  for (let i = 0; i < data.length; i += info.channels) for (let k = 0; k < 3; k++) m[k] += data[i + k];
  return m.map(v => Math.round(v / n));
}
const isGround = rgb => rgb[1] > 70 && rgb[1] > rgb[0] + 10 && rgb[1] > rgb[2] + 10;   // green; the page behind the canvas is not
test("SPEC-040 AC 3: a resize under a full-screen page, and the way back, leave the world drawn", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  await playLevel(page, "park", 3);
  await step(page, 1); await frames(page);
  await page.evaluate(() => { window.__bb.mode = "pause"; });
  await frames(page);
  const seen = [];
  const check = async what => { const g = await groundStrip(page); seen.push(`${what} ${g}`); return isGround(g); };
  expect(await check("the pause menu over a level"), seen.join(" | ")).toBe(true);
  await page.evaluate(() => { window.__bb.mode = "story"; });          // a full-screen page: nothing is drawn, the canvas keeps the picture
  await frames(page);
  expect(await check("under the story page"), seen.join(" | ")).toBe(true);
  await page.setViewportSize({ width: 800, height: 600 });            // the canvas is resized under the page: empty until a world frame
  await frames(page);
  expect(await check("under the story page, resized"), seen.join(" | ")).toBe(true);
  await page.evaluate(() => { window.__bb.mode = "pause"; });
  await frames(page);
  expect(await check("back to the pause menu"), seen.join(" | ")).toBe(true);
  await page.setViewportSize({ width: 960, height: 640 });            // and a resize while paused
  await frames(page);
  expect(await check("paused, resized"), seen.join(" | ")).toBe(true);
  expect(errors).toEqual([]);
});

// The wardrobe's previews are drawn on the saved picture of the world: they go on turning while the world itself is not drawn.
test("SPEC-040 AC 3: the wardrobe previews keep animating while the world behind is not drawn", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);                                   // 960×640: the first player's window is (135, 136, 190, 140) in UI px = CSS px
  await page.evaluate(() => { window.__bb.openShop("home", "wardrobe"); });
  await frames(page);
  const shot = () => page.screenshot({ clip: { x: 135, y: 136, width: 190, height: 140 } });
  const r0 = await page.evaluate(() => window.__bb.sim().renders);
  const first = await shot();
  let moved = false;
  for (let i = 0; i < 20 && !moved; i++) { await page.waitForTimeout(150); moved = !(await shot()).equals(first); }
  expect(moved, "the preview of player 1 turned").toBe(true);
  expect((await page.evaluate(() => window.__bb.sim().renders)) - r0, "and the world was not drawn meanwhile").toBe(0);
  // the same on the Progress page (one window)
  await page.evaluate(() => { window.__bb.openShop("home", "progress"); });
  await frames(page);
  expect((await page.evaluate(() => ({ shown: window.__bb.screenState.shopTab }))).shown).toBe("progress");
  expect(errors).toEqual([]);
});

// ---------- AC 4: the first 60 frames of a new world / the first boss (RR-48) ----------
// A page-side recorder: the rAF timestamps of the frames after a level starts (startGame included: the first delta holds the
// build), the programs / geometries / textures three.js made during them (info counts a geometry when it is first drawn), then
// the next frames as the level's steady state.
// card: the level starts the way a player starts it — its card is opened (chooseStop), the warm-up behind the card runs to its end (__bb.warm),
// then Play is pressed; without it the level is started at once (startGame: nothing was warmed)
async function levelFrames(page, world, n, { first = 60, steady = 60, card = false } = {}) {
  if (card) {
    await page.evaluate(([w, lv, s]) => { const b = window.__bb; b.mode = "map"; b.world = w; b.seedRandom(s); b.progress.worlds[w].unlocked = 20; b.chooseStop(lv); }, [world, n, START_SEED]);
    await page.waitForFunction(() => window.__bb.warm.done, null, { timeout: 60_000, polling: 50 });
    await frames(page);
  }
  return page.evaluate(([w, lv, s, first, steady, card, phone]) => new Promise(resolve => {
    const b = window.__bb, ts = [performance.now()];
    if (card) { if (!b.tapButton(phone ? "card:play" : "card:1")) throw new Error("no Play button on the card"); while (b.scene) b.sceneSkip(); }
    else { b.mode = "map"; b.world = w; b.level = lv; b.seedRandom(s); b.startGame(1); }
    const p0 = b.perf(), at0 = { programs: p0.programs, ...p0.memory };
    let made = null, made3 = null;
    const diff = () => { const p = b.perf(); return { programs: p.programs - at0.programs, geometries: p.memory.geometries - at0.geometries, textures: p.memory.textures - at0.textures }; };
    const loop = t => {
      ts.push(t);
      if (ts.length === 4) made3 = diff();
      if (ts.length === first + 1) { const p = b.perf(); made = { programs: p.programs - at0.programs, geometries: p.memory.geometries - at0.geometries, textures: p.memory.textures - at0.textures }; }
      if (ts.length < first + steady + 1) requestAnimationFrame(loop);
      else resolve({ ms: ts.slice(1).map((t, i) => t - ts[i]), made, made3 });
    };
    requestAnimationFrame(loop);
  }), [world, n, START_SEED, first, steady, card, page.viewportSize().width < 700]);
}
function firstFramesOf(r, first = 60) {
  const a = r.ms.slice(0, first), b = r.ms.slice(first);
  return { first60: { p50: round1(pctile(a, 0.5)), p95: round1(pctile(a, 0.95)), max: round1(Math.max(...a)) },
    steady: { p50: round1(pctile(b, 0.5)), p95: round1(pctile(b, 0.95)), max: round1(Math.max(...b)) },
    ratio: round1(pctile(a, 0.95) / Math.max(1e-6, pctile(b, 0.95))), made: r.made, made3: r.made3 };
}
for (const [what, world, n] of [["a new world (Beach 3 after Park)", "beach", 3], ["the first boss (Park 20)", "park", 20]]) {
  test(`SPEC-040 AC 4: the first 60 frames of ${what} (phone view): p95 ≤ steady × 1.5, no program or geometry first made in them`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await openView(page, PHONE);
    await playLevel(page, "park", 1);              // the game's first level: its programs and geometries are made
    await frames(page); await frames(page);
    const r = firstFramesOf(await levelFrames(page, world, n, { card: true }));
    record(`first 60 frames: ${what}`, r);
    // the count is the gate (a program compiled or a geometry uploaded inside the first frames is the hitch); the ratio is a
    // time, so only a real GPU judges it (SwiftShader frames are 100 ms and noisy)
    const software = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"), e = gl.getExtension("WEBGL_debug_renderer_info"); return /swiftshader|basic render|llvmpipe/i.test(String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "")); });
    // (a level may free more than it makes: negative is fine.) No program in the first 60 frames; no geometry or texture in the first 3: later a slow
    // machine (SwiftShader: 60 frames are 9 s of the game) has items and stars appear, and each makes its own mesh
    expect(r.made.programs, `programs made inside the first 60 frames: ${JSON.stringify(r.made)}`).toBeLessThanOrEqual(0);
    expect(Object.values(r.made3).every(v => v <= 0), `made inside the first 3 frames: ${JSON.stringify(r.made3)}`).toBe(true);
    if (!software) expect(r.first60.p95, `first-60 p95 ${r.first60.p95} ms vs steady ${r.steady.p95} ms`).toBeLessThanOrEqual(r.steady.p95 * 1.5);
    expect(errors).toEqual([]);
  });
}
// What the warm-up must not change: the game that Play starts is the same game (the showcase it builds takes a copy of the rng stream), Play
// before the warm-up has ended just starts the level, and a level started again (Retry, a new game of the same level and team) builds nothing.
test("SPEC-040 AC 4: the warm-up does not change the game Play starts; Play before its end starts the level; a Retry builds nothing", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openView(page, PHONE);
  // the game after 120 steps, read in the same evaluate that started it (no frame of the live loop in between)
  await page.evaluate(() => {
    window.__snap = () => { const b = window.__bb, dt = b.CFG.STEP; for (let i = 0; i < 120; i++) b.update(dt); return JSON.stringify([b.level, b.world, b.littles.map(l => [Math.round(l.x * 100), Math.round(l.y * 100)]), [Math.round(b.big.x * 100), Math.round(b.big.y * 100)], b.rngDraws - window.__d0, b.stats.time.toFixed(3)]); };
    window.__open = () => { const b = window.__bb; b.mode = "map"; b.world = "park"; b.progress.worlds.park.unlocked = 20; b.seedRandom(7); window.__d0 = b.rngDraws; };
  });
  // 1. the level started straight
  const direct = await page.evaluate(() => { const b = window.__bb; window.__open(); b.level = 3; b.startGame(1); return window.__snap(); });
  // 2. the same level through its card, the warm-up run to its end before Play
  await page.evaluate(() => { window.__open(); window.__bb.chooseStop(3); });
  await page.waitForFunction(() => window.__bb.warm.done, null, { timeout: 60_000, polling: 50 });
  await frames(page);
  expect(await page.evaluate(() => { window.__bb.tapButton("card:play"); return window.__snap(); }), "the warmed level plays the same game").toBe(direct);
  // 3. Play pressed in the frames the card opened: part of the warm-up ran, the level starts, the warm-up is gone
  await page.evaluate(() => { window.__open(); window.__bb.chooseStop(3); });
  await frames(page);                                              // a stage or two ran
  const mid = await page.evaluate(() => { const b = window.__bb, phase = b.warm.phase; b.tapButton("card:play"); return { phase, mode: b.mode, after: b.warm.phase, snap: window.__snap() }; });
  expect(["game", "map", "shaders", "compiling", "chars", "upload", "done"]).toContain(mid.phase);
  expect(mid, "an early Play starts the level and ends the warm-up").toMatchObject({ mode: "play", after: "" });
  expect(mid.snap, "an early Play plays the same game too").toBe(direct);
  await frames(page);
  // 3b. the card closed in the middle of the warm-up: the world it had hidden is shown again
  await page.evaluate(() => { window.__open(); window.__bb.chooseStop(3); });
  await page.waitForFunction(() => ["shaders", "compiling", "chars", "upload"].includes(window.__bb.warm.phase), null, { timeout: 30_000, polling: 20 });
  await page.evaluate(() => { window.__bb.mode = "map"; });
  await frames(page);
  expect(await page.evaluate(async () => { const { mapGroup } = await import("./src/client/three/mapstate.js"); const { charGroup } = await import("./src/client/three/characters.js"); return [mapGroup.visible, charGroup.visible, window.__bb.warm.phase]; }), "map, models, no warm-up").toEqual([true, true, ""]);
  // 4. Retry: the same level again (same team): the map and the models stay, nothing new is uploaded
  const mem = () => page.evaluate(() => ({ g: window.__bb.look3D("memory").memory.geometries, p: window.__bb.perf().programs }));
  const before = await mem();
  await page.evaluate(() => { window.__bb.startGame(1); });
  await frames(page); await frames(page);
  expect(await mem(), "a Retry builds nothing new").toEqual(before);
  expect(errors).toEqual([]);
});

// phone frame time of the busiest levels (p50 / p95 over frames 61–120 of the level): recorded, not gated (times)
test("SPEC-040 AC 12: phone frame time p50/p95 of the busiest level of Park, Beach and Winter (recorded)", async ({ page }) => {
  test.skip(!!process.env.CI, "a time, recorded on the machine at hand (PERF_OUT), not on CI");
  test.setTimeout(300_000);
  const errors = await openView(page, PHONE);
  const out = {};
  for (const w of ["park", "beach", "winter"]) {
    const r = firstFramesOf(await levelFrames(page, w, BUSIEST.phone[w]));
    const calls = await page.evaluate(() => window.__bb.perf().draw.calls);
    out[w] = { level: BUSIEST.phone[w], steady: r.steady, first60: r.first60, calls };
  }
  record("phone frame time (ms)", out);
  for (const o of Object.values(out)) expect(o.steady.p50).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// ---------- AC 9: measureText calls per frame on the home and Character screens (RR-49) ----------
// the baseline of today's code (calls per 2D frame, mean over a 2 s window, 2026-11-27; the home screen varies from 14.7 on a GPU to 18.4 under
// SwiftShader — a few frames of its own work in a short window — the Character tabs are the same on both); SPEC-040 AC 9: at least 5× fewer
const MEASURE_BASELINE = { home: 15, "character progress": 111, "character items": 116, "character wardrobe": 73, "character upgrades": 93 };
test("SPEC-040 AC 9: measureText calls per frame on the home and Character screens drop at least 5×", async ({ page }) => {
  test.fail();   // SPEC-040 step 7 turns this on (memoized fitText / wrapText / labelFit)
  test.setTimeout(120_000);
  const errors = await openGame(page);
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype, orig = proto.measureText;
    window.__measureCalls = 0;
    proto.measureText = function (...a) { window.__measureCalls++; return orig.apply(this, a); };
  });
  const screens = {
    home: () => { window.__bb.mode = "home"; },
    "character progress": () => { window.__bb.openShop("home", "progress"); },
    "character items": () => { window.__bb.openShop("home", "items"); },
    "character wardrobe": () => { window.__bb.openShop("home", "wardrobe"); },
    "character upgrades": () => { window.__bb.openShop("home", "upgrades"); }
  };
  const out = {}, bad = [];
  for (const [name, go] of Object.entries(screens)) {
    await page.evaluate(go); await settle(page); await settle(page);
    const m0 = await page.evaluate(() => window.__measureCalls);   // the window is 10 ticks (renderWindow), whatever the frame rate
    const w = await renderWindow(page, { ticks: 10 });
    const r = { frames: w.draws, calls: (await page.evaluate(() => window.__measureCalls)) - m0 };
    const perFrame = r.calls / Math.max(1, r.frames);
    out[name] = { frames: r.frames, calls: r.calls, perFrame: round1(perFrame) };
    if (perFrame > MEASURE_BASELINE[name] / 5) bad.push(`${name}: ${round1(perFrame)} per frame, baseline ${MEASURE_BASELINE[name]} / 5`);
  }
  record("measureText calls per 2D tick (10 ticks each)", out);
  expect(bad, `measureText per frame: ${bad.join("; ")}`).toEqual([]);
  expect(errors).toEqual([]);
});
