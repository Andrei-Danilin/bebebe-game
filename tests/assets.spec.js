// SPEC-020 AC 1: the art pipeline (scripts/assets.js + scripts/assets.json → assets/).
// Node-only: no page fixture, so no browser starts. Reads the committed assets/ and re-runs a small part of the
// pipeline twice into temp folders to check that it is deterministic.
// Node-only: plain @playwright/test, not ./pw (its auto failure-screenshot fixture would start a browser for nothing) —
// allowed by name in smoke.spec.js ("every spec file uses ./pw").
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { run, spriteNames, loadManifest, listBlocks, between, MARK, INDEX, SW, ROOT } = require("../scripts/assets");

const ASSETS = path.join(ROOT, "assets");
const manifest = loadManifest();
const names = spriteNames(manifest);
// sprites keyed to transparency (everything but the paper pictures)
const keyed = manifest.sources.filter(s => s.mode !== "paper").flatMap(s =>
  [s.name, ...(s.names || []), ...Object.keys(s.boxes || {}), ...Object.keys(s.circles || {})].filter(Boolean));

test("every sprite named in the manifest exists in assets/ @fast", async () => {
  expect(names.length).toBeGreaterThan(100);
  expect(new Set(names).size).toBe(names.length);              // no name used twice
  const missing = names.filter(n => !fs.existsSync(path.join(ASSETS, n + ".webp")));
  expect(missing).toEqual([]);
  const extra = fs.readdirSync(ASSETS).filter(f => f.endsWith(".webp") && !names.includes(f.slice(0, -5)));
  expect(extra).toEqual([]);
  // the manifest only names art/ files that exist
  expect(manifest.sources.filter(s => !fs.existsSync(path.join(ROOT, "art", s.src))).map(s => s.src)).toEqual([]);
});

// SPEC-027 AC 1 / 2a: the menu icons (28), the 15 missing clothes (29) and the small icons (34) are cut into assets/
test("the SPEC-027 sheets give their sprites: menu icons, the missing clothes, the small icons @fast", async () => {
  const want = ["menu_play", "menu_story", "menu_character", "tab_progress",
    "jacket_tshirt", "jacket_orange_stripes", "jacket_purple_zip", "jacket_pink_hoodie", "jacket_teal_zip",
    "jacket_hero_cape", "jacket_ninja", "jacket_sailor", "jacket_raincoat", "hat_ninja",
    "pants_black", "pants_red", "pants_green", "pants_pink_shorts", "pants_purple",
    "ui_friends", "ui_dice", "ui_question", "ui_pencil", "ui_pack", "ui_ear", "ui_map", "ui_check", "ui_cross"];
  expect(want.filter(n => !names.includes(n)), "named in scripts/assets.json").toEqual([]);
  expect(want.filter(n => !fs.existsSync(path.join(ASSETS, n + ".webp"))), "written to assets/").toEqual([]);
  const src = n => manifest.sources.find(s => (s.names || []).includes(n));
  expect([src("menu_play")?.src, src("menu_play")?.size, src("jacket_tshirt")?.src, src("jacket_tshirt")?.size, src("ui_dice")?.src])
    .toEqual(["28_menu_icons.webp", "button", "29_wardrobe_2.webp", "icon", "34_small_icons.webp"]);
});

test("no green left at sprite edges @fast", async () => {
  const bad = [];
  for (const n of keyed) {
    const { data, info } = await sharp(path.join(ASSETS, n + ".webp")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, A = i => data[i * 4 + 3];
    let edge = 0, green = 0, clear = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!A(i)) { clear++; continue; }
      // an edge pixel: semi-transparent, or opaque next to a transparent one
      let isEdge = A(i) < 255;
      if (!isEdge) isEdge = (x > 0 && !A(i - 1)) || (x < W - 1 && !A(i + 1)) || (y > 0 && !A(i - W)) || (y < H - 1 && !A(i + W));
      if (!isEdge) continue;
      edge++;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      if (g > 100 && g - Math.max(r, b) > 50) green++;           // green-dominant: a fringe of the key colour
    }
    if (!clear) bad.push(`${n}: no transparent pixels`);
    else if (green > edge * 0.01) bad.push(`${n}: ${green} of ${edge} edge pixels green`);
  }
  expect(bad).toEqual([]);
});

test("assets fit the budget @fast", async () => {
  const bg = new Set(manifest.sources.filter(s => s.size === "background").map(s => s.name));
  let total = 0;
  const over = [];
  for (const f of fs.readdirSync(ASSETS)) {
    const size = fs.statSync(path.join(ASSETS, f)).size;
    total += size;
    if (bg.has(f.replace(/\.webp$/, "")) && size > manifest.budget.backgroundKB * 1024) over.push(`${f}: ${size}`);
  }
  expect(over).toEqual([]);
  expect(total).toBeLessThanOrEqual(manifest.budget.totalKB * 1024);
  expect(manifest.budget).toEqual({ totalKB: 4096, backgroundKB: 250 });
  // never upscaled: sprites stay within their size class
  const tooBig = [];
  for (const s of manifest.sources) {
    const max = manifest.sizes[s.size];
    for (const n of [s.name, ...(s.names || []), ...Object.keys(s.boxes || {}), ...Object.keys(s.circles || {})].filter(Boolean)) {
      const m = await sharp(path.join(ASSETS, n + ".webp")).metadata();
      if (Math.max(m.width, m.height) > max) tooBig.push(`${n}: ${m.width}×${m.height} > ${max}`);
    }
  }
  expect(tooBig).toEqual([]);
});

test("the pipeline is deterministic (two runs → identical files)", async () => {
  // a sample covering every mode: whole (logo), sheet with merge + erase + circle crop, rekey, paper boxes, paper
  const only = ["19_logo.webp", "25_phone_controls.webp", "20_levelmap_parts.webp", "v1/staff.webp", "14_interface.webp"];
  const dirs = [0, 1].map(i => fs.mkdtempSync(path.join(os.tmpdir(), `bb-assets-${i}-`)));
  try {
    const rows = [];
    for (const d of dirs) rows.push(await run({ outDir: d, only, manifest, log: () => {} }));
    expect(rows[0].length).toBeGreaterThan(20);
    expect(rows[1].map(r => r.name)).toEqual(rows[0].map(r => r.name));
    const differ = rows[0].filter(r => !fs.readFileSync(path.join(dirs[0], r.file)).equals(fs.readFileSync(path.join(dirs[1], r.file))));
    expect(differ.map(r => r.file)).toEqual([]);
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});

// SPEC-020 step 2: the game's sprite list (index.html ART_NAMES) and the offline cache list (sw.js PRECACHE_ASSETS + the hash
// of the sprites' bytes) are written by npm run assets; stale lists mean somebody forgot to run it.
test("index.html and sw.js list every sprite (npm run assets keeps them in step) @fast", async () => {
  const want = listBlocks(manifest);
  expect(between(fs.readFileSync(INDEX, "utf8"), MARK.index), "index.html ART_NAMES: run npm run assets").toBe(want.index);
  expect(between(fs.readFileSync(SW, "utf8"), MARK.sw), "sw.js PRECACHE_ASSETS / ASSETS_HASH: run npm run assets").toBe(want.sw);
  // and sw.js really precaches them, cache-first like the icons
  const sw = fs.readFileSync(SW, "utf8");
  expect(sw).toContain("PRECACHE_ASSETS.map(u => cache.add(");   // one by one, errors ignored (the core precache stays atomic)
  expect(sw).toContain('const CACHE = SW_VERSION + "-" + ASSETS_HASH');
  expect(sw).toContain('url.pathname.includes("/assets/")');
});
