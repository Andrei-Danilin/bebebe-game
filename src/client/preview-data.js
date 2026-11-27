// SPEC-041: the data of the level card's preview — the map of a level (core levelPreview), made when the card OPENS (setMode in flow.js:
// logic, the same in sim and in a rendered page) and kept per level; drawing only reads it (peekPreviewData) and paints the offscreen
// canvas of an entry (ui/level-preview.js). Lifetime: the last LOOK.LEVEL_PREVIEW_LOOK.cache levels (the oldest goes first); an entry
// is also dropped when its level is no longer the level cache's accepted attempt (a changed CFG → __bb.clearLevelCache clears the
// previews too). The map is made in a game of its own: the running game, its rng and the level's random sequence are never touched.
// Client module (no canvas, no drawing).

import { acceptedAttempt } from "../core/level/load.js";
import { levelPreview } from "../core/level/report.js";
import { LOOK } from "./look.js";

/** @typedef {{ data: ReturnType<typeof levelPreview>, attempt: number, canvas: HTMLCanvasElement | null }} PreviewEntry */
/** @type {Map<string, PreviewEntry>} */
const cache = new Map();   // "world:level" → entry (Map keeps insertion order: the first key is the oldest)
export const previewStats = { built: 0, hits: 0 };   // for the tests
export const previewCacheSize = () => cache.size;
export function clearLevelPreviews() { cache.clear(); }

// the entry of a level, made now if there is none (or it is stale): called when the card opens
export function previewDataOf(world, lv) {
  const key = world + ":" + lv, hit = cache.get(key);
  if (hit && (hit.data.fallback || hit.attempt === acceptedAttempt(world, lv))) { previewStats.hits++; cache.delete(key); cache.set(key, hit); return hit; }
  const data = levelPreview(world, lv), entry = { data, attempt: data.attempt, canvas: null };
  cache.delete(key); cache.set(key, entry); previewStats.built++;
  while (cache.size > LOOK.LEVEL_PREVIEW_LOOK.cache) cache.delete(cache.keys().next().value);
  return entry;
}
// drawing: only reads — the entry of the open card or null (never builds a level)
export const peekPreviewData = (world, lv) => cache.get(world + ":" + lv) || null;
