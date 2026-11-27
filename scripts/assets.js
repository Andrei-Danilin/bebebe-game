// SPEC-020: the art pipeline. Turns the pictures in art/ into game-ready sprites in assets/.
//   npm run assets                 — every source in scripts/assets.json → assets/ + a report
//   node scripts/assets.js --debug 24_effects.webp   — list the regions found on one sheet (to write a manifest entry)
// The manifest lives in scripts/assets.json (art/ is Andrei's: the pipeline only reads it).
// Modes per source:
//   "paper"  — a picture on paper (no key): resized whole. SPEC-033: optional "crop": [x, y, w, h] (source px) keeps only that part
//              (sharp extract before the resize) — to drop a strip of colour swatches at the bottom of a picture.
//   "whole"  — a green sheet keyed to transparency and kept as one picture (the logo: every letter is its own region).
//   "sheet"  — a green sheet cut into sprites by connected regions; a region smaller than "small" px (default 3000)
//              joins the closest object within "merge" px (default 12) — strokes, stars, confetti bits; two big objects
//              never join. Order = rows top-to-bottom, then left-to-right; "names" maps them (null = skip a duplicate);
//              a count mismatch stops the run with the boxes found (use --debug to write the entry).
//   "boxes"  — explicit boxes [x, y, w, h] (source px): a green sheet keyed ("key": "green") or a paper sheet whose
//              paper around the drawing is made transparent ("key": "paper", flood fill from the box edge), or no key;
//              "dropLines": drop thin frame / ruled-line leftovers.
// Key options (per source, or per sprite through "rekey": { name: {…} }): "coreFrac"/"distFrac" (how close to the
// sheet colour a pixel must be to count as background), "edge" (px of soft, unmixed, despilled edge; wide for a glow
// or translucent tape over the green), "holeMin" (enclosed key-colour patches smaller than this stay opaque).
// Extra ops on a sheet: "erase" (paint circles with the colour sampled around them), "circles" (round crops, from the
// sheet before the erase: the joystick knob drawn on its base). SPEC-029: "erase" works on a "paper" picture too (stray words);
// "clear" (green sheet) paints circles with the sheet colour before keying — a part to drop that is glued to an object.
// Output: WebP, trimmed with a small padding, only ever scaled down (never upscaled). Deterministic: no time stamps,
// fixed encoder settings, sources processed in manifest order.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(__dirname, "assets.json");

sharp.cache(false);
sharp.concurrency(1);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

async function readRGB(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, W: info.width, H: info.height };
}

// Median of the border pixels = the sheet's background colour.
function borderColor(rgb, W, H) {
  const ch = [[], [], []];
  const add = (x, y) => { const i = (y * W + x) * 3; for (let k = 0; k < 3; k++) ch[k].push(rgb[i + k]); };
  for (let x = 0; x < W; x += 2) { add(x, 0); add(x, H - 1); }
  for (let y = 0; y < H; y += 2) { add(0, y); add(W - 1, y); }
  return ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
}

// Chebyshev dilation of a 0/1 mask, r passes of 3×3.
function dilate(mask, W, H, r) {
  let cur = mask;
  for (let p = 0; p < r; p++) {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cur[y * W + x]) { out[y * W + x] = 1; continue; }
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          if (cur[yy * W + xx]) { hit = 1; break; }
        }
      }
      out[y * W + x] = hit;
    }
    cur = out;
  }
  return cur;
}

// Green key → RGBA. Background = pixels close to the sheet colour (anywhere: holes in letters too);
// pixels within `edge` px of it get a soft alpha (how much green they carry), are unmixed from the green and despilled.
function keyGreen(rgb, W, H, opt = {}) {
  const bg = borderColor(rgb, W, H);
  const bgGr = bg[1] - Math.max(bg[0], bg[2]);
  const coreFrac = opt.coreFrac ?? 0.6, distFrac = opt.distFrac ?? 0.5, edge = opt.edge ?? 2;
  const N = W * H, core = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const gr = g - Math.max(r, b);
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    if (gr >= coreFrac * bgGr && d <= distFrac * bgGr) core[i] = 1;
  }
  // Enclosed patches of key colour smaller than holeMin px are part of the drawing (a green button's scribbles),
  // bigger ones are background seen through the picture (the holes of B, e, a…): only those are keyed.
  const holeMin = opt.holeMin ?? 0, seen = new Uint8Array(N), stack = [], patch = [];
  for (let s = 0; s < N; s++) {
    if (!core[s] || seen[s]) continue;
    let border = false; patch.length = 0; seen[s] = 1; stack.push(s);
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j - x) / W; patch.push(j);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
      if (x > 0 && core[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < W - 1 && core[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && core[j - W] && !seen[j - W]) { seen[j - W] = 1; stack.push(j - W); }
      if (y < H - 1 && core[j + W] && !seen[j + W]) { seen[j + W] = 1; stack.push(j + W); }
    }
    if (!border && patch.length < holeMin) for (const j of patch) core[j] = 0;
  }
  const near = dilate(core, W, H, edge);
  const out = Buffer.alloc(N * 4);
  const full = 0.9 * bgGr;
  for (let i = 0; i < N; i++) {
    let r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], a = 1;
    if (core[i]) a = 0;
    else if (near[i]) {
      const gr = g - Math.max(r, b);
      a = gr <= 0 ? 1 : clamp(1 - gr / full, 0, 1);
      if (a < 0.1) a = 0;
      else if (a < 1) {
        r = clamp((r - (1 - a) * bg[0]) / a, 0, 255);
        g = clamp((g - (1 - a) * bg[1]) / a, 0, 255);
        b = clamp((b - (1 - a) * bg[2]) / a, 0, 255);
      }
      const m = Math.max(r, b);
      if (g > m) g = m;                       // despill: an edge pixel is never greener than its red/blue
    }
    out[i * 4] = Math.round(r); out[i * 4 + 1] = Math.round(g); out[i * 4 + 2] = Math.round(b);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

// Paper key for one box: flood fill the light paper from the box edge → transparent; pixels next to it are
// "colour-to-alpha"-ed against the paper colour (soft edge, no white halo).
function keyPaper(rgb, W, H, box, opt = {}) {
  const [bx, by, bw, bh] = box;
  const minV = opt.paperMin ?? 205, maxSat = opt.paperSat ?? 40, edge = opt.edge ?? 2;
  const n = bw * bh, isPaper = new Uint8Array(n), seen = new Uint8Array(n);
  const px = (x, y) => ((by + y) * W + bx + x) * 3;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = px(x, y), r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    const ruled = lo >= 180 && b >= g && g >= r && b - r <= 40;   // the notebook's light-blue ruled lines are paper too
    if ((lo >= minV && hi - lo <= maxSat) || ruled) isPaper[y * bw + x] = 1;
  }
  const stack = [];
  const push = (x, y) => { const j = y * bw + x; if (isPaper[j] && !seen[j]) { seen[j] = 1; stack.push(j); } };
  for (let x = 0; x < bw; x++) { push(x, 0); push(x, bh - 1); }
  for (let y = 0; y < bh; y++) { push(0, y); push(bw - 1, y); }
  while (stack.length) {
    const j = stack.pop(), x = j % bw, y = (j - x) / bw;
    if (x > 0) push(x - 1, y); if (x < bw - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < bh - 1) push(x, y + 1);
  }
  // paper colour = median of the flooded pixels
  const ch = [[], [], []];
  for (let j = 0; j < n; j += 7) if (seen[j]) { const i = px(j % bw, Math.floor(j / bw)); for (let k = 0; k < 3; k++) ch[k].push(rgb[i + k]); }
  const paper = ch.map(a => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255));
  const near = dilate(seen, bw, bh, edge);
  const out = Buffer.alloc(n * 4);
  for (let j = 0; j < n; j++) {
    const i = px(j % bw, Math.floor(j / bw));
    let r = rgb[i], g = rgb[i + 1], b = rgb[i + 2], a = 1;
    if (seen[j]) a = 0;
    else if (near[j]) {
      a = Math.max((paper[0] - r) / paper[0], (paper[1] - g) / paper[1], (paper[2] - b) / paper[2], 0);
      a = clamp(a * 1.6, 0, 1);               // ink is dark: a light-grey rim already counts as mostly opaque
      if (a < 0.1) a = 0;
      else if (a < 1) {
        r = clamp((r - (1 - a) * paper[0]) / a, 0, 255);
        g = clamp((g - (1 - a) * paper[1]) / a, 0, 255);
        b = clamp((b - (1 - a) * paper[2]) / a, 0, 255);
      }
    }
    out[j * 4] = Math.round(r); out[j * 4 + 1] = Math.round(g); out[j * 4 + 2] = Math.round(b);
    out[j * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

// 8-connected regions of alpha ≥ thr. Returns { label (Int32Array), regions [{ id, x0, y0, x1, y1, area }] }.
function regionsOf(rgba, W, H, thr = 64) {
  const N = W * H, label = new Int32Array(N).fill(-1), regions = [];
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (label[s] !== -1 || rgba[s * 4 + 3] < thr) continue;
    const id = regions.length, R = { id, x0: W, y0: H, x1: -1, y1: -1, area: 0 };
    label[s] = id; stack.push(s);
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j - x) / W;
      R.area++; if (x < R.x0) R.x0 = x; if (x > R.x1) R.x1 = x; if (y < R.y0) R.y0 = y; if (y > R.y1) R.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const k = yy * W + xx;
          if (label[k] === -1 && rgba[k * 4 + 3] >= thr) { label[k] = id; stack.push(k); }
        }
      }
    }
    regions.push(R);
  }
  return { label, regions };
}

// A frame or ruled-line leftover: very thin, or thin and touching the box edge.
function isLine(r, w, h) {
  const t = Math.min(r.x1 - r.x0, r.y1 - r.y0) + 1;
  const edge = r.x0 === 0 || r.y0 === 0 || r.x1 === w - 1 || r.y1 === h - 1;
  return t <= 3 || (edge && t <= 6);
}

// Joins regions into objects: repeatedly merges the closest pair of groups whose boxes are within `gap` px,
// as long as one of the two is smaller than `small` px (a speck, a star, a stroke, one confetti bit):
// two big objects never merge, however close they sit.
function mergeRegions(regions, gap, small = Infinity) {
  const groups = regions.map(r => ({ ids: [r.id], x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, area: r.area }));
  const dist = (a, b) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      if (Math.min(a.area, b.area) >= small) continue;
      const d = dist(a, b);
      if (d <= gap && (!best || d < best.d)) best = { i, j, d };
    }
    if (!best) return groups;
    const a = groups[best.i], b = groups[best.j];
    groups[best.i] = { ids: a.ids.concat(b.ids), x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area };
    groups.splice(best.j, 1);
  }
}

// Reading order: rows top-to-bottom (an object joins the row while its centre is above the row's first object's
// bottom), then left-to-right inside a row.
function readingOrder(groups) {
  const cy = g => (g.y0 + g.y1) / 2, cx = g => (g.x0 + g.x1) / 2;
  const sorted = groups.slice().sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
  const rows = [];
  for (const g of sorted) {
    const row = rows[rows.length - 1];
    if (row && cy(g) <= row.bottom) row.items.push(g);
    else rows.push({ bottom: g.y1, items: [g] });
  }
  return rows.flatMap(r => r.items.sort((a, b) => cx(a) - cx(b)));
}

// The sheet's objects: regions ≥ minArea, merged by `merge` px, reading order; tiny leftovers are dropped.
function findObjects(rgba, W, H, opt) {
  const { label, regions } = regionsOf(rgba, W, H, opt.alphaThr ?? 64);
  const kept = regions.filter(r => r.area >= (opt.minArea ?? 30));
  const groups = mergeRegions(kept, opt.merge ?? 12, opt.small ?? 3000).filter(g => g.area >= (opt.minObject ?? 400));
  return { label, groups: readingOrder(groups) };
}

// Crops a group to its own pixels (other regions in its box become transparent), with padding.
function cropGroup(rgba, W, H, label, g, pad) {
  const ids = new Set(g.ids);
  const x0 = Math.max(0, g.x0 - pad), y0 = Math.max(0, g.y0 - pad);
  const x1 = Math.min(W - 1, g.x1 + pad), y1 = Math.min(H - 1, g.y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y0 + y) * W + x0 + x, d = (y * w + x) * 4;
    // a pixel belongs to the group if its region is in the group, or it is a faint (unlabelled) edge pixel next to one
    let own = ids.has(label[s]);
    if (!own && label[s] === -1 && rgba[s * 4 + 3] > 0) {
      for (let dy = -2; dy <= 2 && !own; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x0 + x + dx, yy = y0 + y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && ids.has(label[yy * W + xx])) { own = true; break; }
      }
    }
    if (own) rgba.copy(out, d, s * 4, s * 4 + 4);
  }
  return { buf: out, w, h, x0, y0 };
}

// Trim fully transparent borders, keep `pad` px.
function trim(img, pad) {
  const { buf, w, h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3] > 0) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1, out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) buf.copy(out, y * nw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4);
  return { buf: out, w: nw, h: nh, x0: (img.x0 || 0) + x0, y0: (img.y0 || 0) + y0 };
}

// SPEC-029: "clear" on a green sheet — circles [cx, cy, r] painted with the sheet colour BEFORE keying, so they key out (a drawn
// trail glued to an object by its glow: the cloak's dashed trail on 30_items).
function clearRGB(rgb, W, H, circles) {
  const bg = borderColor(rgb, W, H);
  for (const [cx, cy, r] of circles) for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      if (Math.hypot(x - cx, y - cy) > r) continue;
      const i = (y * W + x) * 3; rgb[i] = bg[0]; rgb[i + 1] = bg[1]; rgb[i + 2] = bg[2];
    }
}
// Paint circles [cx, cy, r] (sheet px) with the median colour of the ring just outside them.
function erase(rgba, W, H, circles) {
  for (const [cx, cy, r] of circles) {
    const ch = [[], [], []];
    for (let a = 0; a < 360; a += 3) {
      const x = Math.round(cx + (r + 4) * Math.cos(a * Math.PI / 180)), y = Math.round(cy + (r + 4) * Math.sin(a * Math.PI / 180));
      const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) ch[k].push(rgba[i + k]);
    }
    const c = ch.map(v => v.sort((p, q) => p - q)[v.length >> 1]);
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy); if (d > r + 1) continue;
      const t = clamp(r + 1 - d, 0, 1), i = (y * W + x) * 4;   // soft 1 px rim
      for (let k = 0; k < 3; k++) rgba[i + k] = Math.round(rgba[i + k] * (1 - t) + c[k] * t);
    }
  }
}

// Round crop [cx, cy, r] → its own sprite (soft 1.5 px rim).
function circleCrop(rgba, W, H, [cx, cy, r]) {
  const x0 = Math.floor(cx - r - 2), y0 = Math.floor(cy - r - 2), w = Math.ceil(2 * r + 5), h = w, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const d = Math.hypot(sx - cx, sy - cy), t = clamp((r - d) / 1.5 + 0.5, 0, 1);
    const s = (sy * W + sx) * 4, o = (y * w + x) * 4;
    out[o] = rgba[s]; out[o + 1] = rgba[s + 1]; out[o + 2] = rgba[s + 2]; out[o + 3] = Math.round(rgba[s + 3] * t);
  }
  return { buf: out, w, h };
}

function cropBox(rgba, W, [x, y, w, h]) {
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) rgba.copy(out, r * w * 4, ((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4);
  return { buf: out, w, h };
}

const fitSize = (w, h, max) => { const s = Math.min(1, max / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };

async function writeSprite(img, file, max, q) {
  const [w, h] = fitSize(img.w, img.h, max);
  let p = sharp(img.buf, { raw: { width: img.w, height: img.h, channels: 4 } });
  if (w !== img.w || h !== img.h) p = p.resize(w, h, { kernel: "lanczos3", fit: "fill" });
  await p.webp({ quality: q.quality, alphaQuality: q.alphaQuality, effort: q.effort, smartSubsample: true }).toFile(file);
  return { w, h };
}

async function writePaper(src, file, maxW, q, circles = null, crop = null) {
  const meta0 = await sharp(src).metadata(), meta = crop ? { ...meta0, width: crop[2], height: crop[3] } : meta0;
  let p = sharp(src).removeAlpha();
  if (circles) {                                  // SPEC-029: "erase" on a paper picture (stray words): circles painted with the paper around them
    const { rgb, W, H } = await readRGB(src), rgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { rgb.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
    erase(rgba, W, H, circles);
    p = sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).removeAlpha();
  }
  if (crop) p = p.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });   // SPEC-033: keep only this part of the source
  if (meta.width > maxW) p = p.resize({ width: maxW, kernel: "lanczos3" });
  await p.webp({ quality: q.paperQuality, effort: q.effort, smartSubsample: true }).toFile(file);
  return { w: Math.min(meta.width, maxW), h: meta.width > maxW ? Math.round(meta.height * maxW / meta.width) : meta.height };
}

function loadManifest() { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }

// The sprite names of one source (in manifest order).
function sourceNames(s) {
  const names = [];
  if (s.name) names.push(s.name);
  if (s.names) names.push(...s.names.filter(Boolean));
  if (s.boxes) names.push(...Object.keys(s.boxes));
  if (s.circles) names.push(...Object.keys(s.circles));
  return names;
}
// Every sprite name the manifest promises (in manifest order).
function spriteNames(manifest = loadManifest()) {
  return manifest.sources.flatMap(sourceNames);
}
// SPEC-040 AC 1: the resident sprites — loaded at start and kept (HUD, buttons, items, effects, icons, the paper sheet, the logo). Every source
// says "resident": true or false (a new picture must decide); a sprite of a source with false loads when a screen first draws it and is
// released when no screen has drawn it for LOOK.ART.releaseMs (the story and tutorial pictures, the map backgrounds, the wardrobe, the houses).
function residentNames(manifest = loadManifest()) {
  const bad = manifest.sources.filter(s => typeof s.resident !== "boolean").map(s => s.src);
  if (bad.length) throw new Error("scripts/assets.json: \"resident\": true or false is missing in " + bad.join(", "));
  return manifest.sources.filter(s => s.resident).flatMap(sourceNames);
}

// Processes the manifest (or only the sources whose src is in `only`) into outDir. Returns the report rows.
async function run({ outDir = path.join(ROOT, "assets"), only = null, manifest = loadManifest(), log = console.log } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const q = manifest.encode, pad = manifest.pad ?? 4, rows = [];
  const put = async (name, kind, fn) => {
    const file = path.join(outDir, name + ".webp");
    const { w, h } = await fn(file);
    rows.push({ name, kind, file: name + ".webp", w, h, bytes: fs.statSync(file).size });
  };
  for (const s of manifest.sources) {
    if (only && !only.includes(s.src)) continue;
    const src = path.join(ROOT, "art", s.src);
    const max = manifest.sizes[s.size];
    if (!max) throw new Error(`${s.src}: unknown size "${s.size}"`);
    if (s.mode === "paper") { await put(s.name, s.size, f => writePaper(src, f, max, s.quality ? { ...q, paperQuality: s.quality } : q, s.erase || null, s.crop || null)); continue; }
    const { rgb, W, H } = await readRGB(src);
    if (s.mode === "whole") {
      const rgba = keyGreen(rgb, W, H, s);
      const { label, regions } = regionsOf(rgba, W, H, s.alphaThr ?? 64);
      const kept = regions.filter(r => r.area >= (s.minArea ?? 30));
      const g = mergeRegions(kept, 1e6)[0];
      const img = trim(cropGroup(rgba, W, H, label, g, pad), pad);
      await put(s.name, s.size, f => writeSprite(img, f, max, q));
      continue;
    }
    if (s.mode === "sheet") {
      if (s.clear) clearRGB(rgb, W, H, s.clear);
      const rgba = keyGreen(rgb, W, H, s);
      if (s.erase) erase(rgba, W, H, s.erase);
      const { label, groups } = findObjects(rgba, W, H, s);
      if (groups.length !== s.names.length) {
        throw new Error(`${s.src}: found ${groups.length} objects, the manifest names ${s.names.length}: ` +
          groups.map(g => `[${g.x0},${g.y0},${g.x1 - g.x0 + 1}×${g.y1 - g.y0 + 1}]`).join(" "));
      }
      // rekey: some sprites want other key options (a wide soft edge for a glow, translucent tape over the green)
      const rekeyed = new Map();
      const keyFor = name => {
        const o = s.rekey && s.rekey[name]; if (!o) return rgba;
        const k = JSON.stringify(o);
        if (!rekeyed.has(k)) { const r = keyGreen(rgb, W, H, { ...s, ...o }); if (s.erase) erase(r, W, H, s.erase); rekeyed.set(k, r); }
        return rekeyed.get(k);
      };
      for (let i = 0; i < groups.length; i++) {
        if (!s.names[i]) continue;
        const img = trim(cropGroup(keyFor(s.names[i]), W, H, label, groups[i], pad), pad);
        await put(s.names[i], s.size, f => writeSprite(img, f, max, q));
      }
      if (s.circles) for (const [name, c] of Object.entries(s.circles)) {
        const keyed = keyGreen(rgb, W, H, s);       // circles come from the sheet before any erase
        await put(name, s.size, f => writeSprite(circleCrop(keyed, W, H, c), f, max, q));
      }
      continue;
    }
    if (s.mode === "boxes") {
      const rgba = s.key === "green" ? keyGreen(rgb, W, H, s) : null;
      for (const [name, box] of Object.entries(s.boxes)) {
        let img;
        if (s.key === "paper") img = { buf: keyPaper(rgb, W, H, box, s), w: box[2], h: box[3] };
        else if (s.key === "green") img = cropBox(rgba, W, box);
        else { const full = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { rgb.copy(full, i * 4, i * 3, i * 3 + 3); full[i * 4 + 3] = 255; } img = cropBox(full, W, box); }
        if (s.key) {
          // drop specks: keep only regions of a reasonable size inside the box
          const { label, regions } = regionsOf(img.buf, img.w, img.h, s.alphaThr ?? 64);
          // (dropLines: also thin bits of a cell frame the box edge cut through, and leftovers of the ruled lines)
          const kept = regions.filter(r => r.area >= (s.minArea ?? 30) &&
            !(s.dropLines && isLine(r, img.w, img.h)));
          if (kept.length) img = trim(cropGroup(img.buf, img.w, img.h, label, mergeRegions(kept, 1e6)[0], pad), pad);
        }
        await put(name, s.size, f => writeSprite(img, f, max, q));
      }
      continue;
    }
    throw new Error(`${s.src}: unknown mode "${s.mode}"`);
  }
  return rows;
}

function report(rows, manifest = loadManifest(), log = console.log) {
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const kb = b => (b / 1024).toFixed(1);
  for (const r of rows) log(`${r.file.padEnd(28)} ${String(r.w + "×" + r.h).padStart(10)} ${kb(r.bytes).padStart(7)} KB  ${r.kind}`);
  const big = rows.filter(r => r.kind === "background" && r.bytes > manifest.budget.backgroundKB * 1024);
  const ok = total <= manifest.budget.totalKB * 1024 && !big.length;
  log(`${rows.length} files, ${kb(total)} KB total (budget ${manifest.budget.totalKB} KB, background ≤ ${manifest.budget.backgroundKB} KB)` +
    (big.length ? ` — over budget: ${big.map(r => r.file).join(", ")}` : "") + (ok ? " — OK" : " — OVER BUDGET"));
  return { total, ok };
}

async function debug(src, manifest = loadManifest()) {
  const s = manifest.sources.find(x => x.src === src) || { src };
  const { rgb, W, H } = await readRGB(path.join(ROOT, "art", src));
  if (s.clear) clearRGB(rgb, W, H, s.clear);
  const rgba = keyGreen(rgb, W, H, s);
  const { groups } = findObjects(rgba, W, H, s);
  console.log(`${src} ${W}×${H}: ${groups.length} objects`);
  groups.forEach((g, i) => console.log(`${String(i).padStart(3)} [${g.x0},${g.y0} ${g.x1 - g.x0 + 1}×${g.y1 - g.y0 + 1}] area ${g.area} parts ${g.ids.length}  ${(s.names || [])[i] ?? ""}`));
}
// ---------- the lists other files keep (written between markers, so nobody edits them by hand) ----------
// src/client/art-names.js: ART_NAMES (every sprite; ART_RESIDENT: the ones loaded at start; SPEC-011 AC 8c — was in index.html); sw.js: PRECACHE_ASSETS + ASSETS_HASH (a hash of their bytes: a redrawn
// sprite changes sw.js, so the installed app fetches it again).
const ART_FILE = path.join(ROOT, "src", "client", "art-names.js"), SW = path.join(ROOT, "sw.js");
const MARK = { index: ["// art:start", "// art:end"], sw: ["// assets:start", "// assets:end"] };
const NL = "\n";

function assetsHash(names, dir = path.join(ROOT, "assets")) {
  const h = crypto.createHash("sha256");
  for (const n of names) { h.update(n + NL); h.update(fs.readFileSync(path.join(dir, n + ".webp"))); }
  return h.digest("hex").slice(0, 12);
}

// A JS array literal's items, wrapped at ~120 columns.
function arrayLines(items, indent) {
  const lines = [];
  let cur = "";
  for (const it of items.map(x => JSON.stringify(x))) {
    if (cur && (indent + cur + it).length > 118) { lines.push(indent + cur.trimEnd()); cur = ""; }
    cur += it + ", ";
  }
  if (cur) lines.push(indent + cur.slice(0, -2));
  return lines.join(NL);
}

function listBlocks(manifest = loadManifest(), dir = path.join(ROOT, "assets")) {
  const names = spriteNames(manifest);
  return {
    index: ["export const ART_NAMES = [", arrayLines(names, "  "), "];",
      "// SPEC-040 AC 1: the sprites loaded at start and kept; the others load when a screen draws them and are released when it stops",
      "export const ART_RESIDENT = [", arrayLines(residentNames(manifest), "  "), "];"].join(NL),
    sw: [`const ASSETS_HASH = "${assetsHash(names, dir)}";`, "const PRECACHE_ASSETS = [",
      arrayLines(names.map(n => "./assets/" + n + ".webp"), "  "), "];"].join(NL)
  };
}

// The text between a file's markers, with LF line ends (null when the markers are missing).
function between(text, [a, b]) {
  text = text.split("\r\n").join(NL);
  const i = text.indexOf(a), j = text.indexOf(b);
  return i < 0 || j < i ? null : text.slice(text.indexOf(NL, i) + 1, j).trimEnd();
}

function writeLists(manifest = loadManifest()) {
  const blocks = listBlocks(manifest);
  for (const [file, key] of [[ART_FILE, "index"], [SW, "sw"]]) {
    const text = fs.readFileSync(file, "utf8"), [a, b] = MARK[key];
    if (between(text, MARK[key]) === null) throw new Error(`${path.basename(file)}: markers ${a} … ${b} not found`);
    const eol = text.includes("\r\n") ? "\r\n" : NL;           // a Windows checkout (autocrlf) keeps its CRLF
    const i = text.indexOf(NL, text.indexOf(a)) + 1, j = text.indexOf(b);
    const next = text.slice(0, i) + (blocks[key] + NL).split(NL).join(eol) + text.slice(j);
    if (next !== text) fs.writeFileSync(file, next);
  }
}

module.exports = { run, report, spriteNames, residentNames, loadManifest, keyGreen, keyPaper, regionsOf, listBlocks, between, writeLists, MARK, ART_FILE, SW, MANIFEST, ROOT };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args[0] === "--debug") { for (const s of args.slice(1)) await debug(s); return; }
    const manifest = loadManifest();
    const outDir = path.join(ROOT, "assets");
    // remove sprites the manifest no longer names (only .webp files the pipeline owns)
    const want = new Set(spriteNames(manifest).map(n => n + ".webp"));
    if (fs.existsSync(outDir)) for (const f of fs.readdirSync(outDir)) if (f.endsWith(".webp") && !want.has(f)) fs.unlinkSync(path.join(outDir, f));
    const rows = await run({ outDir, manifest });
    const { ok } = report(rows, manifest);
    writeLists(manifest);
    console.log("src/client/art-names.js ART_NAMES and sw.js PRECACHE_ASSETS / ASSETS_HASH updated");
    // SPEC-011 AC 9: art-names.js is a module — its hash in the import map and sw.js follows (npm run precache)
    const pc = require("./precache.js").run();
    console.log(`precache: SRC_HASH ${pc.srcHash}${pc.stale.length ? " — wrote " + pc.stale.join(", ") : " — up to date"}`);
    if (!ok) process.exitCode = 1;
  })().catch(e => { console.error(e.message || e); process.exit(1); });
}
