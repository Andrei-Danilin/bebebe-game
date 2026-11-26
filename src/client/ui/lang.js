// SPEC-032 AC 13–15: the language screen of the very first launch (no save at all) — before the intro comic: four big paper
// buttons with the language names in their own language, English highlighted as the default (Andrei), so Enter / A / a tap on
// the highlighted one picks it. Old saves never see it; the globe on the home screen keeps working as before. Client module.

import { LANG_NAMES, LANGS } from "../../i18n.js";
import { art } from "../art.js";
import { setMode } from "../flow.js";
import { LOOK } from "../look.js";
import { setLang } from "../progress.js";
import { ctx, PHONE, UH, UW } from "../screen.js";
import { ui } from "../state.js";
import { fitButton } from "./character/wardrobe.js";
import { drawArtCover, rr } from "./draw.js";
import { menuFrame, phoneFrame } from "./menu.js";
import { cpx, minPx } from "./text.js";

// the language screen opens with English highlighted (Andrei: default English, no detection)
export function openLangScreen() { ui.langSel = Math.max(0, LANGS.indexOf("en")); setMode("lang"); }
// the highlighted button moves (keys, the gamepad's cross): ±1 along a row, ±2 to the other row
export function moveLangSel(d) { ui.langSel = (ui.langSel + d + LANGS.length) % LANGS.length; }
// a language is chosen: saved at once (bebebe-save.lang), then the home screen — the intro comic and the tutorial follow as before
export function chooseLang(l = LANGS[ui.langSel]) {
  if (!LANGS.includes(l)) return;
  setLang(l);
  setMode("home");
}
// two rows of two big paper buttons in the middle of the notebook page (no title: the four names are enough)
export function drawLangScreen() {
  const L2 = LOOK.LANG_SCREEN, c = PHONE ? cpx : (n => n);
  if (!drawArtCover("menu_bg", 0, 0, UW, UH) || !art("menu_bg")) { if (PHONE) phoneFrame(true); else menuFrame(LOOK.MENU_LOOK.home, true); }
  const w = Math.min(UW * L2.w, c(L2.maxW)), h = c(L2.h), g = c(L2.gap), x0 = UW / 2 - w - g / 2, y0 = UH / 2 - h - g / 2;
  const M = LOOK.MENU_LOOK, size = c(L2.size), min = PHONE ? minPx("main") : L2.size * 0.6;
  LANGS.forEach((l, i) => {
    const x = x0 + (i % 2) * (w + g), y = y0 + Math.floor(i / 2) * (h + g), on = i === ui.langSel;
    if (on) {                                                     // the highlighted one: a soft glow ring around it
      ctx.save(); ctx.lineWidth = c(L2.ring); ctx.strokeStyle = L2.glow; rr(x - c(L2.ring), y - c(L2.ring), w + 2 * c(L2.ring), h + 2 * c(L2.ring), h * 0.4); ctx.stroke(); ctx.restore();
    }
    const b = fitButton(x, y, w, h, LANG_NAMES[l], on ? M.play : M.shop, () => chooseLang(l), size, min);
    b.id = "lang:" + l; b.on = on;
  });
}
