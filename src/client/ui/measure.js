// SPEC-040 AC 9 (RR-49): text widths and fits are measured once, not on every frame. textW(text) is ctx.measureText(text).width of the screen's
// context at its current font, remembered per (font, text): every frame of a menu draws the same texts at the same sizes, so after the first
// frame nothing is measured. fitText / wrapText / labelFit (text.js) also remember their result per (text, size, weight, width, …) in `fits`.
// Both memos are cleared when the language changes, when a test changes LOOK.TEXT_TEST_SCALE (the results do not depend on it; cleared all the same), when the screen is refitted (resize, rotation), when a font finishes loading (the metrics
// of a fallback font are not those of the font that came) and, being bounded, when they hold LOOK.TEXT_MEMO_MAX entries. Widths are raw: the
// tests' LOOK.TEXT_TEST_SCALE is applied by the callers, after. Client module.

import { lang } from "../../i18n.js";
import { LOOK } from "../look.js";
import { ctx, fitCount } from "../screen.js";

const widths = new Map();
/** result memos of fitText / wrapText / labelFit: key → what they computed (text.js makes the keys) */
export const fits = new Map();
let memoLang = "", memoFit = -1, memoScale = 1;
/** clears both memos when something they depend on changed (cheap; every user calls it first) */
export function syncTextMemo() {
  if (lang !== memoLang || fitCount !== memoFit || LOOK.TEXT_TEST_SCALE !== memoScale || widths.size + fits.size >= LOOK.TEXT_MEMO_MAX) { widths.clear(); fits.clear(); memoLang = lang; memoFit = fitCount; memoScale = LOOK.TEXT_TEST_SCALE; }
}
export function clearTextMemo() { widths.clear(); fits.clear(); }
export const textMemoSize = () => widths.size + fits.size;
/** @param {any} text */
export function textW(text) {
  syncTextMemo();
  const key = ctx.font + "\n" + text;
  let w = widths.get(key);
  if (w === undefined) { w = ctx.measureText(text).width; widths.set(key, w); }
  return w;
}
// called once by main.js
export function initTextMemo() {
  try { document.fonts.addEventListener("loadingdone", clearTextMemo); } catch (e) { /* no FontFaceSet: the memo is cleared by language and resize only */ }
}
