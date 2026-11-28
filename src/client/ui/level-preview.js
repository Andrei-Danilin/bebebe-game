// SPEC-041: the level card's picture — a top-down preview of the very level the card opens: the generated map (walls, bushes, trees, ponds,
// both houses) in the mini-map's colours on a paper frame; no characters. The map DATA is made when the card opens (preview-data.js, logic);
// here drawing only paints it — once per entry onto an offscreen canvas sized from the drawn width (× the screen scale, capped) — and draws
// the houses, the boss face on Dad's house (last level of a world with a boss), the dimming and the padlock of a closed level, live over
// the cached map. Drawing never builds a level. Client module.

import { H, W } from "../../core/config.js";
import { artFailed, houseArt } from "../art.js";
import { LOOK } from "../look.js";
import { peekPreviewData } from "../preview-data.js";
import { ctx, VIEW } from "../screen.js";
import { THEMES } from "../three/themes.js";
import { drawArtFit, fillT } from "./artdraw.js";
import { fillStroke, rr } from "./draw.js";
import { paintMapBase } from "./minimap.js";

// the entry of a level with its map painted on its canvas (a canvas smaller than wanted is painted again); null — no data (the card
// was not opened through setMode). drawW (UI px) sizes the canvas; without it LEVEL_PREVIEW_LOOK.px (the tests)
export function levelPreviewOf(world, lv, drawW = 0) {
  const entry = peekPreviewData(world, lv);
  if (!entry) return null;
  const P = LOOK.LEVEL_PREVIEW_LOOK, px = drawW ? Math.min(P.pxMax, Math.max(P.pxMin, Math.round(drawW * VIEW))) : P.px;
  if (entry.canvas && entry.canvas.width >= px) return entry;
  const th = THEMES[world], canvas = document.createElement("canvas");
  canvas.width = px; canvas.height = Math.round(px * H / W);
  const g = canvas.getContext("2d"), k = px / W;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = th.g1; g.fillRect(0, 0, W, H);                     // the ground of the place, light, so the dark walls read
  paintMapBase(g, entry.data, th, 1 / k);
  entry.canvas = canvas;
  return entry;
}

// draws the preview in the box x, y, w (the height is w × H / W) on a paper frame; opts: { boss, locked }
// → { x, y, w, h } of the picture (inside the frame)
export function drawLevelPreview(world, lv, x, y, w, opts = {}) {
  const P = LOOK.LEVEL_PREVIEW_LOOK, entry = levelPreviewOf(world, lv, w), h = w * H / W, r = Math.min(w, h) * P.corner, s = w / W;
  rr(x - P.frame, y - P.frame, w + 2 * P.frame, h + 2 * P.frame, r + P.frame / 2); fillStroke(P.paper, P.line);
  ctx.save();
  rr(x, y, w, h, r); ctx.clip();
  if (!entry) { ctx.fillStyle = THEMES[world].g1; ctx.fillRect(x, y, w, h); ctx.restore(); return { x, y, w, h }; }
  const data = entry.data;
  ctx.drawImage(entry.canvas, x, y, w, h);
  // the houses of the kids and of Dad, over their zones; on the last level of a world with a boss his face sits on Dad's house
  // SPEC-044: the picture of this world's house (house_<world>_kids / _dad); the one of every world only when that picture is missing (not while it loads)
  const house = (z, names, emoji, size) => {
    if (!z) return;
    const cx = x + (z.x + z.w / 2) * s, cy = y + (z.y + z.h / 2) * s, d = Math.min(z.w, z.h) * s * size;
    const list = [].concat(names);
    for (let i = 0; i < list.length; i++) {
      if (drawArtFit(list[i], cx, cy, d)) return;
      if (!artFailed(list[i])) return;                      // still loading: nothing yet
    }
    { ctx.font = `${d}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; fillT(emoji, cx, cy); }
  };
  house(data.safeZone, [houseArt(world, "kids"), "house_kids"], "🏠", P.house);
  house(data.dangerZone, [houseArt(world, "dad"), "house_messy"], "🏚", P.house);
  if (opts.boss) house(data.dangerZone, "stop_boss", "😠", P.boss);
  if (opts.locked) {
    ctx.fillStyle = P.dim; ctx.fillRect(x, y, w, h);
    const d = Math.min(w, h) * P.lock;
    if (!drawArtFit("padlock", x + w / 2, y + h / 2, d)) { ctx.font = `${d}px system-ui, "Segoe UI Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; fillT("🔒", x + w / 2, y + h / 2); }
  }
  ctx.restore();
  return { x, y, w, h };
}
