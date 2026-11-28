// SPEC-011: Character → Progress (SPEC-026): progressGeom, progressPage. Client module (moved out of index.html in Phase C).

import { BONUS_WORLDS, CFG, levelsPerWorld, MAIN_WORLDS, UPGRADES, upgTop, WORLDS } from "../../../core/config.js";
import { progress } from "../../../core/economy.js";
import { BIG_SKINS, SLOTS } from "../../../core/wardrobe.js";
import { L } from "../../../i18n.js";
import { ITEM_ART, UPG_ART, worldArt } from "../../art.js";
import { worldOpenNow } from "../../entitlement.js";
import { LOOK } from "../../look.js";
import { nameFor } from "../../names.js";
import { LOOK_SLOTS, ownsItem, P_COLORS } from "../../outfits.js";
import { ctx, OUT, PHONE } from "../../screen.js";
import { upgLevel } from "../../shop.js";
import { ui } from "../../state.js";
import { SHOP_PICTURES, shopPicture } from "./items.js";
import { upgPicture } from "./upgrades.js";
import { rowsAt } from "../buttons.js";
import { drawStarArt, fillStroke, regButton, rr } from "../draw.js";
import { drawArtFit, fillT } from "../artdraw.js";
import { mainStars, worldsFinished } from "../home.js";
import { lockedText, tapWorldTab } from "../../flow.js";
import { worldPicture, worldStarsOf } from "../menu.js";
import { fitLine, noteRows, noteText, plainText } from "../text.js";
import { minPx, progressGeom } from "../layout.js";

// ---------- SPEC-026: персонаж — страница «Прогресс» (только смотреть; раскладка — Claude): вид и имя игрока 1, звёзды и пройденные
// миры, по строке на мир (значок, звёзды, уровни, «Пройдено» или замок), рюкзак, улучшения, гардероб ----------
// одежда своя / всего: шапки, куртки, штаны, Большие (бесплатное — своё; причёски не в счёт — они все бесплатные)
export function clothesCount() {
  let n = 0, m = 0;
  for (const sl of [...LOOK_SLOTS, "big"]) (sl === "big" ? BIG_SKINS : SLOTS[sl]).forEach((_, i) => { m++; if (ownsItem(sl, i)) n++; });
  return [n, m];
}
// уровни мира: пройдено (won) из levelsPerWorld()
const worldWins = w => Array.from({ length: levelsPerWorld() }, (_, i) => i + 1).filter(n => progress.worlds[w].won[n] === true).length;
export function progressPage() {
  const G = progressGeom(), { P, c, left, mid, right, preview: pv } = G, M = LOOK.MENU_LOOK;
  const min = PHONE ? minPx("main") : LOOK.MENU_LOOK.progress.min, size = c(P.text), tsize = c(P.title);
  // одна строка: картинка слева (pic(x, cy, s) или null) и текст, сжимается до min (потом «…»); в hudRects — { id, text, textW }
  const line = (id, t, x, y, h, maxW, opts = {}) => {
    const s = opts.pic ? Math.min(h * 0.9, c(30)) : 0, sp = s ? c(4) : 0, f = fitLine(t, opts.size || size, min, maxW - s - sp);
    const x0 = opts.center ? x + (maxW - s - sp - f.w) / 2 : x;
    if (opts.pic) opts.pic(x0 + s / 2, y + h / 2, s);
    plainText(f.text, x0 + s + sp, y + h / 2 + 1, f.sz, opts.color || M.ink);
    if (PHONE) noteText("main", f.sz);
    const r = { id, x: x0, y: y + h / 2 - Math.max(s, f.sz * 1.2) / 2, w: s + sp + f.w, h: Math.max(s, f.sz * 1.2), text: f.text, textW: s + sp + f.w };
    ui.hudRects.push(r);
    return r;
  };
  const emoji = e => (x, y, s) => { ctx.font = `${s * 0.85}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; fillT(e, x, y); };
  // ---- слева: окошко 3D-вида игрока 1 (как в гардеробе), под ним имя (SPEC-033: сброс прогресса переехал на страницу для взрослых) ----
  rr(left.x - c(4), pv.y - c(4), left.w + c(8), pv.h + c(P.nameH) + c(12), c(14)); fillStroke(M.panel, 3);
  ctx.clearRect(pv.x, pv.y, pv.w, pv.h);                       // окошко: здесь видно 3D-превью
  ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.strokeRect(pv.x, pv.y, pv.w, pv.h);
  const name = nameFor("p1");
  line("progress:name", name, left.x, pv.y + pv.h + c(4), c(P.nameH), left.w, { center: true, color: P_COLORS[0] });
  // ---- посередине: звёзды основных миров и пройденные миры, по строке на мир ----
  const starMax = CFG.STARS_PER_LEVEL * levelsPerWorld() * MAIN_WORLDS.length, wmax = CFG.STARS_PER_LEVEL * levelsPerWorld();
  const gifted = WORLDS.some(w => worldOpenNow(w).reason === "purchase");   // SPEC-045: worlds only the Full game opens: one friendly line instead of the progress hints
  const lockedAny = !gifted && BONUS_WORLDS.some(w => !worldOpenNow(w).open);
  const note = lockedAny ? noteRows(L().lockedBonus, PHONE ? minPx("hint") : c(14), PHONE ? minPx("hint") : 12, mid.w, 3) : null;   // SPEC-030: до трёх строк, как строка ниже
  // SPEC-030: следующий закрытый главный мир — «Пройди <предыдущий>, чтобы открыть <этот>!» под строками миров (над строкой бонусных)
  const nextLocked = gifted ? null : MAIN_WORLDS.find(w => worldOpenNow(w).needs);
  const giftNote = gifted ? noteRows(L().moreWorlds, PHONE ? minPx("hint") : c(14), PHONE ? minPx("hint") : 12, mid.w, 3) : null;
  const mainNote = giftNote ?? (nextLocked ? noteRows(lockedText(nextLocked), PHONE ? minPx("hint") : c(14), PHONE ? minPx("hint") : 12, mid.w, 3) : null);   // до трёх строк (шрифты CI шире); SPEC-045: или строка про Полную игру
  const noteH = [note, mainNote].reduce((a, n) => a + (n ? n.rows.length * n.sz * 1.2 + c(4) : 0), 0);
  const sumH = c(P.sumH);
  let rowH = c(P.rowH);
  const fixed = 2 * sumH + noteH, floor = min * 1.3;
  if (fixed + WORLDS.length * rowH > mid.h) rowH = Math.max(floor, (mid.h - fixed) / WORLDS.length);
  let y = mid.y;
  const star = (x, yy, s) => drawStarArt(x, yy, s * 0.42, true);
  line("progress:stars", `${mainStars()} / ${starMax}`, mid.x, y, sumH, mid.w, { pic: star, size: tsize });
  y += sumH;
  line("progress:worlds", L().worldsDone(worldsFinished(), MAIN_WORLDS.length), mid.x, y, sumH, mid.w, { size: tsize });
  y += sumH;
  const iconW = rowH, stampW = rowH, nameW = PHONE ? 0 : (mid.w - iconW - stampW) * LOOK.MENU_LOOK.progress.name, colW = (mid.w - iconW - stampW - nameW) / 2;
  const worlds = WORLDS.map(w => {
    const wo = worldOpenNow(w), open = wo.open, gift = wo.reason === "purchase", stars = worldStarsOf(w), wins = worldWins(w), done = wins >= levelsPerWorld();
    const rowY = y, cy = y + rowH / 2, is = rowH * 0.86;
    if (!open) ctx.globalAlpha = 0.45;
    if (!drawArtFit(worldArt(w), mid.x + iconW / 2, cy, is * 1.1)) worldPicture(w, mid.x + iconW / 2 - is / 2, cy - is / 2, is);
    ctx.globalAlpha = 1;
    ui.hudRects.push({ id: "progress:icon:" + w, x: mid.x + (iconW - is) / 2, y: cy - is / 2, w: is, h: is });
    let x = mid.x + iconW + c(4);
    if (nameW) {                                             // название мира: до двух строк (длинные названия, широкие шрифты CI)
      const nb = noteRows(L().worlds[w], size, min, nameW - c(6), 2), lh = nb.sz * 1.2, ny = cy - nb.rows.length * lh / 2;
      ctx.font = `800 ${nb.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = open ? M.ink : M.lockedInk;
      nb.rows.forEach((r, j) => fillT(r, x, ny + lh * (j + 0.5)));
      ui.hudRects.push({ id: "progress:name:" + w, x, y: ny, w: nb.w, h: nb.rows.length * lh, text: nb.rows.join(" "), textW: nb.w });
      x += nameW;
    }
    if (open) {
      line("progress:stars:" + w, `${stars}/${wmax}`, x, rowY, rowH, colW - c(4), { pic: star });
      line("progress:levels:" + w, `🏁 ${wins}/${levelsPerWorld()}`, x + colW, rowY, rowH, colW - c(4));
      if (done) {
        const ss = stampW * 0.9, sx = mid.x + mid.w - stampW / 2;
        if (!drawArtFit("stamp_done", sx, cy, ss * 1.1)) emoji("✔️")(sx, cy, ss);
        ui.hudRects.push({ id: "progress:done:" + w, x: sx - ss / 2, y: cy - ss / 2, w: ss, h: ss });
      }
    } else {
      const ps = rowH * 0.8, px = x + ps / 2;
      if (!drawArtFit(gift ? "ui_gift" : "padlock", px, cy, ps)) emoji(gift ? "🎁" : "🔒")(px, cy, ps);
      ui.hudRects.push({ id: (gift ? "progress:gift:" : "progress:lock:") + w, x: px - ps / 2, y: cy - ps / 2, w: ps, h: ps });
      if (gift) regButton(mid.x, rowY, mid.w, rowH, "🎁", () => tapWorldTab(w), "progress:world:" + w, ps);   // SPEC-045: the row opens the "Full game" card
    }
    y += rowH;
    return { world: w, open, stars, max: wmax, levels: wins, done, reason: wo.reason };
  });
  if (mainNote) {
    y += rowsAt("progress:lockText", mainNote, mid.x + mid.w / 2, y + c(4), M.lockedInk) + c(4);
    if (PHONE) noteText("hint", mainNote.sz);
  }
  if (note) {
    rowsAt("progress:lockNote", note, mid.x + mid.w / 2, y + c(4), M.lockedInk);   // в hudRects — нарисованные строки (обрезанное видно тестам)
    if (PHONE) noteText("hint", note.sz);
  }
  // ---- справа: рюкзак (вещи и спасалки), улучшения (уровень из 3), гардероб (одежда своя / всего) ----
  const tH = c(P.titleH), cellH = c(P.cellH);
  let ry = right.y;
  const title = (id, t) => { line(id, t, right.x, ry, tH, right.w, { size: tsize, color: M.type }); ry += tH; };
  title("progress:bag", L().bag);
  const kinds = Object.keys(SHOP_PICTURES), bagW = right.w / 2;
  kinds.forEach((k, i) => {
    const x = right.x + (i % 2) * bagW, yy = ry + Math.floor(i / 2) * cellH;
    line("progress:bag:" + k, "×" + progress.inv[k], x, yy, cellH, bagW - c(6), { pic: (cx, cy, s) => (ITEM_ART[k] && drawArtFit(ITEM_ART[k], cx, cy, s * 1.15)) || shopPicture(k, cx, cy, s * 0.8) });
  });
  ry += Math.ceil(kinds.length / 2) * cellH + c(4);
  title("progress:upgrades", L().upgradesTab);
  const keys = Object.keys(UPGRADES), uw = right.w / keys.length;
  keys.forEach((k, i) => line("progress:upg:" + k, `${upgLevel(k)}/${upgTop(k)}`, right.x + i * uw, ry, cellH, uw - c(4),
    { pic: (cx, cy, s) => (UPG_ART[k] && drawArtFit(UPG_ART[k], cx, cy, s * 1.15)) || upgPicture(k, cx, cy, s * 0.8) }));
  ry += cellH + c(4);
  title("progress:wardrobe", L().wardrobeTab);
  const [own, all] = clothesCount();
  line("progress:clothes", L().clothes(own, all), right.x, ry, cellH * 0.8, right.w);
  ui.progressInfo = { name, stars: mainStars(), starsMax: starMax, worldsDone: worldsFinished(), worlds,
    bag: Object.fromEntries(kinds.map(k => [k, progress.inv[k]])), upgrades: Object.fromEntries(keys.map(k => [k, upgLevel(k)])), clothes: [own, all], preview: { ...pv } };
}
