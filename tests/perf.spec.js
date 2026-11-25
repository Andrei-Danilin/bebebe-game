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
