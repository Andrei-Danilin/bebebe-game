// SPEC-041: the level card's picture — a top-down preview of the very level the card opens: the generated map (walls, bushes, trees, ponds,
// both houses) in the mini-map's colours on a paper frame; no characters. The map comes from the core's levelPreview (the same level the
// game builds, made in a game of its own: the running game, its rng and the level's random sequence are never touched); it is painted once
// per level onto an offscreen canvas and kept in a small cache (LOOK.LEVEL_PREVIEW_LOOK.cache levels, the oldest goes first). The houses,
// the boss face on Dad's house, the dimming and the padlock of a closed level are drawn live over the cached map. Client module.

import { H, W } from "../../core/config.js";
import { levelPreview } from "../../core/level/report.js";
import { LOOK } from "../look.js";
import { ctx } from "../screen.js";
import { THEMES } from "../three/themes.js";
import { drawArtFit, fillT } from "./artdraw.js";
import { fillStroke, rr } from "./draw.js";
import { paintMapBase } from "./minimap.js";

// "world:level" → { canvas, data } (Map keeps insertion order: the first key is the oldest); built / hits count the cache for the tests
const cache = new Map();
export const previewStats = { built: 0, hits: 0 };
export const previewCacheSize = () => cache.size;
export function clearLevelPreviews() { cache.clear(); }

// the map of a level painted on its canvas (built the first time the card opens, then taken from the cache)
export function levelPreviewOf(world, lv) {
  const key = world + ":" + lv, hit = cache.get(key);
  if (hit) { previewStats.hits++; cache.delete(key); cache.set(key, hit); return hit; }
  const P = LOOK.LEVEL_PREVIEW_LOOK, data = levelPreview(world, lv), th = THEMES[world], canvas = document.createElement("canvas");
  canvas.width = P.px; canvas.height = Math.round(P.px * H / W);
  const g = canvas.getContext("2d"), k = P.px / W;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = th.g1; g.fillRect(0, 0, W, H);                     // the ground of the place, light, so the dark walls read
  paintMapBase(g, data, th, 1 / k);
  const entry = { canvas, data };
  cache.set(key, entry); previewStats.built++;
  while (cache.size > P.cache) cache.delete(cache.keys().next().value);
  return entry;
}

// draws the preview in the box x, y, w (the height is w × H / W) on a paper frame; opts: { boss, locked }
// → { x, y, w, h } of the picture (inside the frame)
export function drawLevelPreview(world, lv, x, y, w, opts = {}) {
  const P = LOOK.LEVEL_PREVIEW_LOOK, { canvas, data } = levelPreviewOf(world, lv), h = w * H / W, r = Math.min(w, h) * P.corner, s = w / W;
  rr(x - P.frame, y - P.frame, w + 2 * P.frame, h + 2 * P.frame, r + P.frame / 2); fillStroke(P.paper, P.line);
  ctx.save();
  rr(x, y, w, h, r); ctx.clip();
  ctx.drawImage(canvas, x, y, w, h);
  // the houses of the kids and of Dad, over their zones; on the last level of a world with a boss his face sits on Dad's house
  const house = (z, name, emoji, size) => {
    if (!z) return;
    const cx = x + (z.x + z.w / 2) * s, cy = y + (z.y + z.h / 2) * s, d = Math.min(z.w, z.h) * s * size;
    if (!drawArtFit(name, cx, cy, d)) { ctx.font = `${d}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; fillT(emoji, cx, cy); }
  };
  house(data.safeZone, "house_kids", "🏠", P.house);
  house(data.dangerZone, "house_messy", "🏚", P.house);
  if (opts.boss) house(data.dangerZone, "stop_boss", "😠", P.boss);
  if (opts.locked) {
    ctx.fillStyle = P.dim; ctx.fillRect(x, y, w, h);
    const d = Math.min(w, h) * P.lock;
    if (!drawArtFit("padlock", x + w / 2, y + h / 2, d)) { ctx.font = `${d}px system-ui, "Segoe UI Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; fillT("🔒", x + w / 2, y + h / 2); }
  }
  ctx.restore();
  return { x, y, w, h };
}
