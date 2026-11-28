// SPEC-042 AC 11–13: the "New here!" card of a world — the world's tip picture (a panel of art/40 or 41), "New in the …!", two lines (the world's trick and
// its item, SPEC-043), OK. Opened the first time a world's level 1 card shows (flow.js showCard, `progress.seen.trick_<world>`) and from the level card's
// ? button (openTip). It stands in the level card's place while it is open (ui.tip = the world). Without the tip art it shows the world's map preview
// (SPEC-041) with the trick's icon. Client module.
import { CFG, H, W } from "../../core/config.js";
import { L } from "../../i18n.js";
import { itemEmoji, TIP_ART, tipPics, TRICK_EMOJI } from "../art.js";   // (the pictures it draws come from tipPics: the one definition screen-art.js lists too)
import { closeTip, okTip } from "../flow.js";
import { LOOK } from "../look.js";
import { ctx, OUT, PHONE, UH, UW } from "../screen.js";
import { ui } from "../state.js";
import { fitButton, rowsAt } from "./buttons.js";
import { drawArtCover, drawArtFit } from "./artdraw.js";
import { fillStroke, rr } from "./draw.js";
import { drawLevelPreview } from "./level-preview.js";
import { paperPanel } from "./paper.js";
import { cpx, minPx } from "./layout.js";
import { fitLine, label, noteRows, noteText } from "./text.js";

// the picture: the world's panel of the tip sheet (cover-fitted into the frame) or, without the art, the level preview with the trick's icon
function drawTipPicture(world, x, y, w, h) {
  const TL = LOOK.TIP_LOOK, sheet = tipPics(world).sheet, i = TIP_ART[world][1], P = LOOK.LEVEL_PREVIEW_LOOK, r = Math.min(w, h) * TL.corner;
  rr(x - TL.frame, y - TL.frame, w + 2 * TL.frame, h + 2 * TL.frame, r + TL.frame / 2); fillStroke(P.paper, P.line);
  ctx.save(); rr(x, y, w, h, r); ctx.clip();
  const [fx, fy, fw, fh] = TL.panels[sheet][i], shown = drawArtCover(sheet, x, y, w, h, fx, fy, fw, fh);
  ctx.restore();
  if (shown) return { x, y, w, h, fallback: false };
  const ph = w * H / W, pr = drawLevelPreview(world, 1, x, y + (h - ph) / 2, w, {});
  const ic = Math.min(w, h) * TL.iconFrac, trick = CFG.WORLD_TRICK[world];
  if (!drawArtFit(tipPics(world).trick, x + w - ic * 0.62, y + ic * 0.62, ic)) label(TRICK_EMOJI[trick], x + w - ic * 0.62, y + ic * 0.62, ic * 0.7, OUT);
  return { x: pr.x, y: pr.y, w: pr.w, h: pr.h, fallback: true };
}
export function drawTipCard() {
  const M = LOOK.MENU_LOOK, A = M.map, TL = LOOK.TIP_LOOK, k = PHONE ? cpx(1) : 1, B = PHONE ? cpx(LOOK.PHONE_BTN_MIN) : 44, g = PHONE ? cpx(LOOK.PHONE_BTN_GAP) : 10;
  const world = ui.tip, trick = CFG.WORLD_TRICK[world], minMain = PHONE ? minPx("main") : 13, minHint = PHONE ? minPx("hint") : 12, pad = A.cardPad * k;
  const cw = Math.min(UW - 40 * k, (PHONE ? A.phoneCardW : A.cardW) * k), BH = PHONE ? B + 6 * k : A.cardBtn;
  const title = L().newIn(world), f1 = fitLine(title, PHONE ? cpx(22) : 26, minMain, cw - 3 * pad - B);
  // the picture takes its share of the width but never more height than the screen leaves; the two lines share the rest of the column
  const bodyMax = UH - 8 * k - 2 * pad - B - 2 * g - BH, pw = Math.min(cw * (PHONE ? TL.phoneFrac : TL.deskFrac), (bodyMax - 2 * TL.frame) / TL.ratio), ph = pw * TL.ratio;
  const tw = cw - 3 * pad - pw, ic = Math.min(B * TL.iconBox, tw * 0.2), textW = tw - ic - g, each = (bodyMax - g) / 2;
  const size = PHONE ? cpx(15) : 18;
  const lines = [[L().tipTrick[world], "tip:trick", tipPics(world).trick, TRICK_EMOJI[trick]], [L().tipItem[world], "tip:item", tipPics(world).item, itemEmoji(world)]];
  const blocks = lines.map(([text]) => noteRows(text, size, minHint, textW, TL.lines, { maxH: each }));
  const heights = blocks.map(b => b.rows.length * b.sz * 1.2), used = heights[0] + heights[1] + g;
  const bodyH = Math.min(bodyMax, Math.max(ph + 2 * TL.frame, used));
  const ch = pad + B + g + bodyH + g + BH + pad, x = UW / 2 - cw / 2, y = Math.max(4 * k, UH / 2 - ch / 2);
  ctx.fillStyle = M.dim; ctx.fillRect(0, 0, UW, UH);
  if (!paperPanel(x, y, cw, ch, A.cardR * k)) { rr(x, y, cw, ch, A.cardR * k); fillStroke(M.card, M.cardLine); }
  ui.cardRect = { x, y, w: cw, h: ch };
  fitButton(x + cw - pad - B, y + pad, B, B, "✕", M.back, closeTip, PHONE ? cpx(18) : 20, minMain).id = "tip:close";
  label(f1.text, x + pad, y + pad + B / 2, f1.sz, M.title, "left");
  if (PHONE) noteText("main", f1.sz);
  ui.hudRects.push({ id: "tip:title", x: x + pad, y: y + pad + B / 2 - f1.sz * 0.6, w: f1.w, h: f1.sz * 1.2, text: f1.text });
  const body = y + pad + B + g, pic = drawTipPicture(world, x + pad, body + (bodyH - ph) / 2, pw, ph);
  ui.hudRects.push({ id: "tip:picture", x: pic.x - TL.frame, y: pic.y - TL.frame, w: pic.w + 2 * TL.frame, h: pic.h + 2 * TL.frame });
  const tx = x + 2 * pad + pw;
  let yy = body + (bodyH - used) / 2;
  blocks.forEach((b, i) => {
    const [text, id, icon, emoji] = lines[i], mid = yy + heights[i] / 2;
    if (!drawArtFit(icon, tx + ic / 2, mid, ic)) label(emoji, tx + ic / 2, mid, ic * 0.7, OUT);
    ui.hudRects.push({ id: id + ":icon", x: tx, y: mid - ic / 2, w: ic, h: ic });
    rowsAt(id, b, tx + ic + g + textW / 2, yy, M.lockedInk);
    ui.hudRects[ui.hudRects.length - 1].text = text;
    if (PHONE) noteText("hint", b.sz);
    yy += heights[i] + g;
  });
  fitButton(x + pad, y + ch - pad - BH, cw - 2 * pad, BH, L().ok, M.play, okTip, PHONE ? cpx(22) : 24, minMain).id = "tip:ok";
  ui.tipInfo = { world, fallback: pic.fallback, title, rect: { x, y, w: cw, h: ch }, picture: { x: pic.x, y: pic.y, w: pic.w, h: pic.h } };
}
