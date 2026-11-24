// SPEC-020 AC 1: the art pipeline (scripts/assets.js + scripts/assets.json → assets/).
// Node-only: no page fixture, so no browser starts. Reads the committed assets/ and re-runs a small part of the
// pipeline twice into temp folders to check that it is deterministic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { run, spriteNames, loadManifest, ROOT } = require("../scripts/assets");

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
