// SPEC-011: the story screen (chapters, How to play), the comic bubbles (SPEC-026), the story scenes (SPEC-022). Client
// module (moved out of index.html in Phase C).

import { BONUS_WORLDS, CFG, WORLDS } from "../../core/config.js";
import { L, lang } from "../../i18n.js";
import { RULE_ICONS, STORY, TUTORIAL_SCENES } from "../../story.js";
import { art, artFile, artImgs, STORY_ART } from "../art.js";
import { tape } from "./paper.js";
import { cardLevel, chapterOpen, goBack, lockedText, sceneBack, sceneNext, scenePages, sceneSkip, setStoryPage, storyBack, storyCh, storyStep, watchChapter } from "../flow.js";
import { LOOK } from "../look.js";
import { ctx, PHONE } from "../screen.js";
import { ui } from "../state.js";
import { openPictures, openPractice } from "../tutorial.js";
import { openGrownUps } from "./grownups.js";
import { fitButton, homeButton, rowsAt } from "./buttons.js";
import { circle, fillStroke, heartPath, regButton, rr } from "./draw.js";
import { drawArtFit, fadeIn, fadeOut, fillT, noteArt } from "./artdraw.js";
import { WORLD_ICONS } from "./map.js";
import { menuFrame } from "./menu.js";
import { fitLine, label, noteRows, noteText, noteUnfit, plainText, scaledW, sideFit, storyMin, storyPx, titleRows } from "./text.js";
import { cpx, hudFont, minPx } from "./layout.js";

// SPEC-032 AC 7: значки правил «Как играть» — картинки по порядку RULE_ICONS (❤ 👀 🤝 ⏱ 🏠 🍌 👣); нет картинки — эмодзи
const RULE_ART = ["heart_full", "ui_eyes", "shop_quick_help", "ui_timer", "house_kids", "item_banana", "ui_tiptoe"];
// картинка главы по своему пути c.image (SPEC-020: тем же загрузчиком artFile); нет пути, грузится или ошибка — null
const storyPicture = c => (c.image ? artFile(c.image) : null);
const storyLoad = c => !c.image ? "none" : (artImgs.get(c.image) || { state: "loading" }).state;
const chapterTitle = c => c.id === "began" ? "📖 " + L().chapters.began : c.id === "ended" ? "🎉 " + L().chapters.ended
  : `${WORLD_ICONS[c.id]} ${L().worlds[c.id]}${BONUS_WORLDS.includes(c.id) ? " · " + L().bonus : ""}`;
// заглушка картинки: лист бумаги, карандашный рисунок (Большой и двое Маленьких обнимают его сзади), «Комикс скоро будет»
function storyPlaceholder(r, locked, soon = true) {   // SPEC-029: soon = false — без подписи «комикс скоро» (запасная страница обучения)
  const S = LOOK.MENU_LOOK.story, k = PHONE ? cpx(1) : 1;
  rr(r.x, r.y, r.w, r.h, 10 * k); fillStroke(S.paper, 3 * k);
  if (locked) {
    ctx.font = `${Math.min(r.w, r.h) * 0.35}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    fillT("🔒", r.x + r.w / 2, r.y + r.h / 2);
    return;
  }
  const u = Math.min(r.w, r.h * 1.2) / 10, cx = r.x + r.w / 2, base = r.y + r.h * 0.68;
  ctx.save(); ctx.strokeStyle = S.pencil; ctx.lineWidth = Math.max(1.5, u * 0.18); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const line = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
  circle(cx, base - u * 4.6, u * 0.9); ctx.stroke();                                   // Большой
  rr(cx - u * 1.1, base - u * 3.6, u * 2.2, u * 2.6, u * 0.6); ctx.stroke();
  line([cx - u * 0.6, base - u * 1, cx - u * 0.7, base]); line([cx + u * 0.6, base - u * 1, cx + u * 0.7, base]);
  for (const sx of [-1, 1]) {                                                          // двое Маленьких обнимают сзади
    const kx = cx + sx * u * 2.4;
    circle(kx, base - u * 2.2, u * 0.55); ctx.stroke();
    line([kx, base - u * 1.65, kx, base - u * 0.6]); line([kx, base - u * 0.6, kx - u * 0.4, base]); line([kx, base - u * 0.6, kx + u * 0.4, base]);
    line([kx, base - u * 1.4, cx + sx * u * 1.1, base - u * 2.4]);
  }
  ctx.fillStyle = S.heart; heartPath(cx, base - u * 6.6, u * 0.9); ctx.fill();
  ctx.restore();
  if (!soon) return;
  const min = PHONE ? minPx("main") : 13, f = fitLine(L().comicSoon, PHONE ? cpx(16) : 18, min, r.w - 16 * k), ty = r.y + r.h - f.sz;
  plainText(f.text, cx, ty, f.sz, LOOK.MENU_LOOK.lockedInk, "center");
  if (PHONE) noteText("main", f.sz);
  ui.hudRects.push({ id: "story:soon", x: cx - f.w / 2, y: ty - f.sz * 0.6, w: f.w, h: f.sz * 1.2, text: f.text });
}
export function drawStory() {
  const M = LOOK.MENU_LOOK, S = M.story, k = PHONE ? cpx(1) : 1, minMain = PHONE ? minPx("main") : 13, minHint = PHONE ? minPx("hint") : 12;
  const { X0, X1, Y0, Y1, g, B } = menuFrame();
  const c = STORY[storyCh], open = chapterOpen(c), rules = ui.storyPage === "rules";
  // верхний ряд: ◀ назад, заголовок, «❓ Как играть» / «📖 История»
  const backText = PHONE ? "◀" : "◀ " + (storyBack === "levelCard" ? L().level + " " + cardLevel : L().home);
  const bw = PHONE ? B : S.backW;
  fitButton(X0, Y0, bw, B, backText, M.back, goBack, PHONE ? cpx(18) : 20, minMain).id = "back:story";
  const tText = rules ? "❓ " + L().howToPlay : "📖 " + L().story;
  ctx.font = hudFont(PHONE ? cpx(16) : 19);
  const tw = Math.max(B, Math.min((X1 - X0) * 0.36, scaledW(rules ? tText : "❓ " + L().howToPlay) + 26 * k));
  fitButton(X1 - tw, Y0, tw, B, rules ? "📖 " + L().story : "❓ " + L().howToPlay, M.storyBtn, () => { setStoryPage(rules ? "chapters" : "rules"); }, PHONE ? cpx(16) : 19, minMain).id = rules ? "story:chapters" : "story:rules";
  const title = rules ? "❓ " + L().howToPlay : (open ? "" : "🔒 ") + chapterTitle(c);
  const tx0 = X0 + bw + g, tmax = X1 - tw - g - tx0, tf = fitLine(title, PHONE ? Math.max(minMain, storyPx(20)) : 26, minMain, tmax);   // SPEC-031: × масштаб экрана
  label(tf.text, tx0 + tmax / 2, Y0 + B / 2, tf.sz, rules ? M.storyBtn : M.title, "center");
  if (PHONE) noteText("main", tf.sz);
  ui.hudRects.push({ id: "story:title", x: tx0 + tmax / 2 - tf.w / 2, y: Y0 + B / 2 - tf.sz * 0.6, w: tf.w, h: tf.sz * 1.2, text: tf.text });
  const top = Y0 + B + g;
  if (rules) {
    drawRulesPage(c, open, title, top, { X0, X1, Y1, g, B }, minMain, minHint);
    return;
  }
  // нижний ряд: ◀ ▶ между главами, посередине точки глав (текущая — крупнее, закрытые — серые)
  const by = Y1 - B;
  const nw = PHONE ? B : B * 1.4;
  fitButton(X0, by, nw, B, "◀", M.nav, () => storyStep(-1), PHONE ? cpx(20) : 24, minMain).id = "story:prev";
  fitButton(X1 - nw, by, nw, B, "▶", M.nav, () => storyStep(1), PHONE ? cpx(20) : 24, minMain).id = "story:next";
  const dr = S.dot * k, step = dr * 3.4, dx0 = (X0 + X1) / 2 - step * (STORY.length - 1) / 2;
  STORY.forEach((q, i) => { circle(dx0 + i * step, by + B / 2, i === storyCh ? dr * 1.5 : dr); fillStroke(i === storyCh ? M.title : chapterOpen(q) ? M.panel : M.locked, 2 * k); });
  ui.hudRects.push({ id: "story:dots", x: dx0 - dr * 1.5, y: by + B / 2 - dr * 1.5, w: step * (STORY.length - 1) + dr * 3, h: dr * 3 });
  // посередине: картинка слева, текст справа (закрытая глава — 🔒 и что для неё надо пройти).
  // SPEC-031: сначала текст — кегль × масштаб экрана, мельче до самого мелкого, потом картинка уже (sideFit); картинка — на остальном
  const text = open ? c.text[lang] : WORLDS.includes(c.id) ? lockedText(c.id) : L().endedLocked;
  const mh = by - g - top, size = PHONE ? storyPx(S.phoneText) : S.text, min = storyMin(14);
  // SPEC-033 AC 4: «Как всё началось» — только клетка 1, крупно (часть MENU_LOOK.scene.panels[0] картинки комикса); ▶ показывает весь комикс
  const one = c.id === "began" && !c.image, cr = one ? M.scene.panels[0] : [0, 0, 1, 1];
  // SPEC-020: картинка главы — свой путь (c.image) или комикс из art/ (STORY_ART); нет — заглушка
  const own = open && c.image ? storyPicture(c) : null, artName = open && !c.image ? STORY_ART[c.id] : null, img = own || (artName && art(artName));
  const aspect = one && img ? (img.width * cr[2]) / (img.height * cr[3]) : 1.4;   // other chapters: the old width cap (AC 4: unchanged)
  const { pw, tW, b } = sideFit(text, X1 - X0, mh, 2 * g, one ? S.picBig : S.pic, p => Math.min((X1 - X0) * p, mh * aspect), size, min), picShare = pw / (X1 - X0);
  const pic = { x: X0, y: top, w: pw, h: mh };
  let imgRect = null, picBox = pic;
  if (img) {
    const fr = 5 * k, sw = img.width * cr[2], sh = img.height * cr[3], sc = Math.min((pic.w - 2 * fr) / sw, (pic.h - 2 * fr) / sh), iw = sw * sc, ih = sh * sc;
    const ix = pic.x + (pic.w - iw) / 2, iy = pic.y + (pic.h - ih) / 2;
    imgRect = [ix, iy, iw, ih];
    picBox = { x: ix - fr - 1.5 * k, y: iy - fr - 1.5 * k, w: iw + 2 * fr + 3 * k, h: ih + 2 * fr + 3 * k };   // SPEC-031: с рамкой (и половиной её линии)
    rr(ix - fr, iy - fr, iw + 2 * fr, ih + 2 * fr, 6 * k); fillStroke(S.paper, 3 * k);   // бумажная рамка
    const ga = artName ? fadeIn(artName) : ctx.globalAlpha;
    ctx.drawImage(img, img.width * cr[0], img.height * cr[1], sw, sh, ix, iy, iw, ih);
    if (artName) noteArt(artName);
    fadeOut(ga);
    tape(ix + 6 * k, iy + 2 * k, -0.7, k * 0.8); tape(ix + iw - 6 * k, iy + 2 * k, 0.7, k * 0.8);
  } else storyPlaceholder(pic, !open);
  // SPEC-026 / SPEC-033: слова папы клетки 1 в её облачке (только буквы, SPEC-032); остальные три облачка — в комиксе по ▶
  const bubbles = img && artName && c.bubbles ? drawBubbles([{ i: 0, text: c.bubbles[lang][0] }], cr, ...imgRect) : [];
  if (open) {                                                // SPEC-022: ▶ в углу картинки — посмотреть заставку главы ещё раз
    // SPEC-026: в правом нижнем углу картинки (в правом верхнем — облачко второй клетки комикса)
    const fr = imgRect || [pic.x, pic.y, pic.w, pic.h], r = B, bx = fr[0] + fr[2] - r - 4 * k, byy = fr[1] + fr[3] - r - 4 * k;
    if (!drawArtFit("round_play", bx + r / 2, byy + r / 2, r * 1.15)) { circle(bx + r / 2, byy + r / 2, r / 2); fillStroke(M.play, 3 * k); label("▶", bx + r / 2 + 2 * k, byy + r / 2, r * 0.45, "#fff"); }
    regButton(bx, byy, r, r, "▶", watchChapter, "story:scene", r);
  }
  const tx = X0 + pw + 2 * g, th = b.rows.length * b.sz * 1.2;
  rowsAt(open ? "story:text" : "story:locked", b, tx + tW / 2, top + Math.max(0, (mh - th) / 2), open ? M.ink : M.lockedInk);
  ui.hudRects[ui.hudRects.length - 1].text = text;
  if (PHONE) noteText("story", b.sz);   // SPEC-031: свой вид — свой самый мелкий (STORY_TEXT_MIN)
  // SPEC-031: picBox — картинка с рамкой (или заглушка), fit — весь текст влез в своё место, picShare — доля ширины под картинку
  ui.storyInfo = { chapter: c.id, index: storyCh, locked: !open, page: "chapters", title, text, art: !open ? "locked" : img ? "image" : "placeholder", load: storyLoad(c), pic, bubbles, picBox, fit: b.fit, picShare, crop: img ? cr : null };
}
// ---------- SPEC-032 AC 7–8: «Как играть» — слева правила со значками-картинками (~1.6 × кегля; эмодзи — только запасной вид), справа
// лист обучения A (tutorial_a, все четыре клетки) в бумажной рамке, как картинки «Истории»; под правилами — управление (телефон —
// только про палец). Нижний ряд: «Для взрослых» слева (SPEC-025 AC 6), справа «Картинки» (страницы A1…C4) и «Тренировка» (только игры).
// Всё влезает: кегль правил и управления мельчает вместе (не мельче подсказок), строка правила — до трёх рядов
function drawRulesPage(c, open, title, top, { X0, X1, Y1, g, B }, minMain, minHint) {
  const M = LOOK.MENU_LOOK, S = M.story, R = S.rules, k = PHONE ? cpx(1) : 1, by = Y1 - B, lines = L().rules(CFG.DOWN_TIME);
  // нижний ряд: справа «Тренировка», левее «Картинки» (бумажные кнопки со значком, как на главном), слева «Для взрослых»
  const bsz = PHONE ? cpx(18) : 20, gt = L().forGrownUps;
  ctx.font = hudFont(PHONE ? cpx(16) : 17);
  const gw = Math.min((X1 - X0) * R.grownW, Math.max(B * 2, scaledW(gt) + 26 * k));
  fitButton(X0, by, gw, B, gt, M.back, openGrownUps, PHONE ? cpx(16) : 17, minMain).id = "story:grownups";
  const acts = [{ id: "story:pictures", icon: "menu_story", emoji: "📖 ", text: L().pictures, color: M.storyBtn, act: openPictures },
    { id: "story:practice", icon: "menu_play", emoji: "▶ ", text: L().tut.practice, color: M.ok, act: openPractice }];
  ctx.font = hudFont(bsz);
  const room = (X1 - X0 - gw - 3 * g) / 2, bws = acts.map(a => Math.min(room, Math.max(B * R.btnMinW, scaledW(a.text) + B * R.btnIcon + R.btnPad * k)));
  let bx = X1;
  for (let i = acts.length - 1; i >= 0; i--) {
    bx -= bws[i];
    if (!homeButton(bx, by, bws[i], B, acts[i], bsz, minMain)) fitButton(bx, by, bws[i], B, acts[i].emoji + acts[i].text, acts[i].color, acts[i].act, bsz, minMain).id = acts[i].id;
    bx -= g;
  }
  // управление: на компьютере — под правилами (слева), на телефоне — под картинкой (справа: слева правилам нужна вся высота)
  const mh = by - g - top;
  const ctl = PHONE ? [["controls:touch", L().touch1]] : [["controls:0", L().controls1], ["controls:1", L().controls2]];
  const ctlRows = (sz, w) => ctl.map(([, t]) => noteRows(t, Math.max(minHint, sz * R.ctl), minHint, w, 2, { keep: true }));
  const ctlH = cb => cb.reduce((a, b) => a + b.rows.length * b.sz * 1.2 + 2 * k, 0) + R.ctlGap * k;
  // слева — правила (и на компьютере под ними управление); кегль один на всё (мельче, пока не влезет по высоте)
  let iconK = R.icon;
  const iconOf = sz => sz * iconK, colW = (sz, w) => w - iconOf(sz) - sz * R.iconGap, rowGap = (PHONE ? R.phoneRowGap : R.rowGap) * k, rlh = PHONE ? R.phoneLh : 1.2;
  const lay = (sz, w) => {
    const rows = lines.map(r => noteRows(r, sz, minHint, colW(sz, w), 3, { keep: true })), cb = PHONE ? [] : ctlRows(sz, w);
    const h = rows.reduce((a, b) => a + Math.max(b.rows.length * b.sz * rlh, iconOf(b.sz)) + rowGap, 0) + (cb.length ? ctlH(cb) : 0);
    return { rows, cb, h, fit: rows.every(b => b.fit) && cb.every(b => b.fit) };
  };
  // SPEC-035: a very small phone (568×320) with the longest texts: the rules still do not fit at the smallest size and the smallest icons →
  // the text column grows (the picture gets narrower) until they do, at most to R.phoneShareMax
  let lw = (X1 - X0) * (PHONE ? R.phoneShare : R.share);
  if (PHONE) {
    const icon0 = iconK;
    iconK = R.iconMin;
    for (let L0 = lay(minHint, lw); (L0.h > mh || !L0.fit) && lw < (X1 - X0) * R.phoneShareMax; L0 = lay(minHint, lw)) lw = Math.min(lw + (X1 - X0) * 0.02, (X1 - X0) * R.phoneShareMax);
    iconK = icon0;
  }
  const px = X0 + lw + 2 * g, rw = X1 - px;
  const phoneCtl = PHONE ? ctlRows(cpx(S.phoneRule), rw) : null;
  // справа — лист A целиком (без картинки — запасная страница первой клетки)
  const pic = { x: px, y: top, w: rw, h: mh - (phoneCtl ? ctlH(phoneCtl) : 0) };
  const img = art("tutorial_a");
  let picBox = pic;
  if (img) {
    const fr = R.frame * k, sc = Math.min((pic.w - 2 * fr) / img.width, (pic.h - 2 * fr) / img.height), iw = img.width * sc, ih = img.height * sc;
    const ix = pic.x + (pic.w - iw) / 2, iy = pic.y + (pic.h - ih) / 2;
    rr(ix - fr, iy - fr, iw + 2 * fr, ih + 2 * fr, R.frameR * k); fillStroke(S.paper, 3 * k);   // бумажная рамка, как в «Истории»
    const ga = fadeIn("tutorial_a");
    ctx.drawImage(img, ix, iy, iw, ih);
    fadeOut(ga);
    noteArt("tutorial_a");
    tape(ix + R.tapeIn * k, iy + 2 * k, -0.7, k * 0.8); tape(ix + iw - R.tapeIn * k, iy + 2 * k, 0.7, k * 0.8);
    picBox = { x: ix - fr - 1.5 * k, y: iy - fr - 1.5 * k, w: iw + 2 * fr + 3 * k, h: ih + 2 * fr + 3 * k };
  } else storyPlaceholder(pic, false, false);
  let size = PHONE ? cpx(S.phoneRule) : S.rule, L1 = lay(size, lw);
  while (size > minHint && (L1.h > mh || !L1.fit)) { size = Math.max(minHint, size - 0.5); L1 = lay(size, lw); }
  while (iconK > R.iconMin && (L1.h > mh || !L1.fit)) { iconK = Math.max(R.iconMin, iconK - 0.05); L1 = lay(size, lw); }   // самый мелкий кегль и всё равно тесно — значки чуть меньше
  let y = top + Math.max(0, (mh - L1.h) / 2);
  const drawnIcons = [];
  L1.rows.forEach((b, i) => {
    const lh = b.sz * rlh, ic = iconOf(b.sz), rowH = Math.max(b.rows.length * lh, ic), tx = X0 + ic + b.sz * R.iconGap;
    const name = RULE_ART[i], cy = y + rowH / 2;
    if (!(name && drawArtFit(name, X0 + ic / 2, cy, ic))) {   // нет картинки — эмодзи, как раньше
      ctx.font = `${b.sz * R.emoji}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(RULE_ICONS[i] || "•", X0 + ic / 2, cy);
    } else drawnIcons.push(name);
    ui.hudRects.push({ id: "rulesIcon:" + i, x: X0, y: cy - ic / 2, w: ic, h: ic });
    ctx.font = `800 ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "left"; ctx.fillStyle = M.ink;
    const ty = cy - b.rows.length * lh / 2;
    b.rows.forEach((q, j) => fillT(q, tx, ty + lh * (j + 0.5)));
    if (PHONE) noteText("hint", b.sz);
    ui.hudRects.push({ id: "rules:" + i, x: tx, y: ty, w: b.w, h: b.rows.length * lh, text: lines[i], size: b.sz });
    if (!b.fit) noteUnfit(lines[i], b, colW(b.sz, lw), 3 * b.sz * 1.2);
    y += rowH + rowGap;
  });
  let cy = phoneCtl ? picBox.y + picBox.h + R.ctlGap * k : y + R.ctlGap * k;
  const cx = phoneCtl ? px + rw / 2 : X0 + lw / 2;
  ctl.forEach(([id, t], i) => {
    const b = (phoneCtl || L1.cb)[i];
    cy += rowsAt(id, b, cx, cy, M.soft) + 2 * k;
    ui.hudRects[ui.hudRects.length - 1].text = t;
    if (PHONE) noteText("hint", b.sz);
  });
  ui.storyInfo = { chapter: c.id, index: storyCh, locked: !open, page: "rules", title, text: "", art: img ? "tutorial_a" : "placeholder", picBox, icons: drawnIcons };
}
// ---------- SPEC-026: слова папы в пустых облачках комикса 8_start (заставка «Как всё началось» и глава в «Истории») ----------
// строки текста облачка: кегль от size до min (шаг 0,5), не больше lines строк, не шире maxW и не выше maxH (× TEXT_TEST_SCALE);
// → { rows, sz, w, h, fit } (fit = false: не влезло и самым мелким — тогда самым мелким, всё равно не больше lines строк: шире облачка)
function bubbleRows(text, maxW, maxH, size, min, lines) {
  const lh = LOOK.MENU_LOOK.scene.bubbleLh;
  const wrap = mw => {
    const rows = [];
    let cur = "";
    for (const wd of text.split(" ")) { const t = cur ? cur + " " + wd : wd; if (scaledW(t) > mw && cur) { rows.push(cur); cur = wd; } else cur = t; }
    rows.push(cur);
    return rows;
  };
  for (let sz = size; ; sz = Math.max(min, sz - 0.5)) {
    ctx.font = `800 ${sz}px system-ui, "Segoe UI", sans-serif`;
    let rows = wrap(maxW);
    const fit = rows.length <= lines && Math.max(...rows.map(scaledW)) <= maxW && rows.length * sz * lh <= maxH;
    if (fit || sz <= min) {
      // SPEC-032 (ревью): не влезло и самым мелким — всё равно пишется (пустых облачков не бывает), не больше lines строк
      for (let mw = maxW; rows.length > lines; mw += sz / 2) rows = wrap(mw);
      return { rows, sz, w: Math.max(...rows.map(scaledW)), h: rows.length * sz * lh, fit, lh };
    }
  }
}
// list — [{ i, text }] (облачко i = клетка i), cr — какая часть картинки нарисована (доли [x, y, w, h]), ix…ih — где она на экране.
// SPEC-032 AC 9–10: только буквы — внутри белого нарисованного облачка (без своей заливки и контура поверх картинки): тёмные, жирные,
// по центру облачка, кегль bubbleScale × прежнего (SPEC-031: × масштаб экрана), мельче — до LOOK.BUBBLE_MIN, до bubbleLines строк;
// не влезли и самым мелким — всё равно пишутся самым мелким, по центру облачка, до bubbleLines строк (fit = false; пустых облачков
// не бывает — правило Андрея SPEC-026; SPEC-033: списка исключений больше нет — глава «Как всё началось» показывает одну клетку крупно, всё влезает).
// → [{ i, text, x, y, w, h (рамка строк), size, rows, fit, box (белое внутри облачка на экране), panel (клетка на экране), img / crop (где картинка) }]
function drawBubbles(list, cr, ix, iy, iw, ih) {
  const S = LOOK.MENU_LOOK.scene, min = PHONE ? cpx(LOOK.BUBBLE_MIN.phone) : LOOK.BUBBLE_MIN.desk;
  const max = Math.max(min, (PHONE ? storyPx(S.phoneText) : S.text) * S.bubbleScale);
  const X = f => ix + (f - cr[0]) / cr[2] * iw, Y = f => iy + (f - cr[1]) / cr[3] * ih, [inW, inH] = S.bubbleIn;
  const out = [];
  for (const { i, text } of list) {
    const [bx, by, bw, bh] = S.bubbles[i], [px, py, pw, ph] = S.panels[i];
    const box = { x: X(bx), y: Y(by), w: X(bx + bw) - X(bx), h: Y(by + bh) - Y(by) };
    const panel = { x: Math.max(ix, X(px)), y: Math.max(iy, Y(py)) };
    panel.w = Math.min(ix + iw, X(px + pw)) - panel.x; panel.h = Math.min(iy + ih, Y(py + ph)) - panel.y;
    const b = bubbleRows(text, box.w * inW, box.h * inH, max, min, S.bubbleLines);
    // по центру облачка; не влезшее (шире / выше облачка) сдвигается ровно настолько, чтобы остаться в своей клетке
    const into = (c, half, lo, len) => Math.min(Math.max(c, lo + half), lo + len - half);
    const cx = into(box.x + box.w / 2, b.w / 2, panel.x, panel.w), cy = into(box.y + box.h / 2, b.h / 2, panel.y, panel.h);
    const lh = b.sz * b.lh, top = cy - b.h / 2;
    if (!ui.bubbleTextOff) {                                  // SPEC-032 AC 12: тест сравнивает кадр с буквами и без них
      ctx.save();
      ctx.font = `800 ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = S.bubbleInk;
      b.rows.forEach((r, j) => fillT(r, cx, top + lh * (j + 0.5)));
      ctx.restore();
    }
    if (PHONE) noteText("bubble", b.sz);
    out.push({ i, text, x: cx - b.w / 2, y: top, w: b.w, h: b.h, size: b.sz, rows: b.rows.length, fit: b.fit, box, panel, img: { x: ix, y: iy, w: iw, h: ih }, crop: cr });
  }
  return out;
}
// картинка img (часть cr — доли) в бумажной рамке со скотчем по центру места pic → { ix, iy, iw, ih (картинка на экране), box (с рамкой) }
function paperPicture(img, cr, pic, name) {
  const k = PHONE ? cpx(1) : 1, fr = 5 * k, sw = img.width * cr[2], sh = img.height * cr[3];
  const sc = Math.min((pic.w - 2 * fr) / sw, (pic.h - 2 * fr) / sh), iw = sw * sc, ih = sh * sc, ix = pic.x + (pic.w - iw) / 2, iy = pic.y + (pic.h - ih) / 2;
  rr(ix - fr, iy - fr, iw + 2 * fr, ih + 2 * fr, 6 * k); fillStroke(LOOK.MENU_LOOK.story.paper, 3 * k);   // бумажная рамка, как в «Истории»
  const ga = fadeIn(name);
  ctx.drawImage(img, img.width * cr[0], img.height * cr[1], sw, sh, ix, iy, iw, ih);
  noteArt(name);
  fadeOut(ga);
  tape(ix + 6 * k, iy + 2 * k, -0.7, k * 0.8); tape(ix + iw - 6 * k, iy + 2 * k, 0.7, k * 0.8);
  return { ix, iy, iw, ih, box: { x: ix - fr - 1.5 * k, y: iy - fr - 1.5 * k, w: iw + 2 * fr + 3 * k, h: ih + 2 * fr + 3 * k } };
}
// SPEC-033 AC 2: карточка «Как играть» (после комикса на первом запуске): большое название, строка под ним, картинка howto_card (нет — клетка A1
// tutorial_a; нет и её — запасная страница) в бумажной рамке. Телефон: картинка слева, текст справа по центру; компьютер: название и строка
// сверху, картинка под ними. Кнопки («Учимся! ▶», «Пропустить») рисует drawScene.
function drawIntroCard(area, pg, g, n) {
  const M = LOOK.MENU_LOOK, S = M.scene, C = S.card, P = LOOK.STORY_PIC;
  let img = art(pg.art), name = pg.art, cr = pg.crop || [0, 0, 1, 1];
  if (!img) { img = art(pg.art2); name = pg.art2; cr = pg.crop2; }
  const aspect = img ? (img.width * cr[2]) / (img.height * cr[3]) : 16 / 9;
  const tSize = PHONE ? storyPx(C.phoneTitle) : C.title, tMin = PHONE ? minPx("title") : 24, lSize = PHONE ? storyPx(C.phoneLine) : C.line, lMin = storyMin(14);
  const hOf = (b, lh) => b.rows.length * b.sz * lh;
  let pic, cx, ty, tW, tb, lb, fit, share;
  if (PHONE) {                                                // картинка слева, текст справа; не влез — картинка уже (как sideFit)
    for (let p = C.phonePic; ; p = Math.max(P.min, p - P.step)) {
      const pw = Math.min(area.w * p, area.h * aspect);
      tW = area.w - pw - 2 * g;
      tb = titleRows(pg.title, tSize, tMin, tW, C.titleLines); lb = noteRows(pg.text, lSize, lMin, tW, Infinity, { keep: true });
      fit = tb.fit && lb.fit && hOf(tb, 1.2) + g + hOf(lb, 1.2) <= area.h + 0.01;
      if (fit || p <= P.min) { pic = { x: area.x, y: area.y, w: pw, h: area.h }; share = pw / area.w; break; }
    }
    if (!fit) noteUnfit(pg.text, lb, tW, area.h - hOf(tb, 1.2) - g);
    cx = pic.x + pic.w + 2 * g + tW / 2;
    ty = area.y + Math.max(0, (area.h - hOf(tb, 1.2) - g - hOf(lb, 1.2)) / 2);
  } else {                                                    // название и строка сверху, картинка не ниже STORY_PIC.minH высоты
    tW = area.w; cx = area.x + area.w / 2; ty = area.y;
    tb = titleRows(pg.title, tSize, tMin, tW, C.titleLines); lb = noteRows(pg.text, lSize, lMin, tW, S.lines, { keep: true });
    const th = hOf(tb, 1.2) + g + hOf(lb, 1.2), maxH = area.h * (1 - P.minH) - g;
    fit = tb.fit && lb.fit && th <= maxH + 0.01;
    if (!fit) noteUnfit(pg.text, lb, tW, maxH - hOf(tb, 1.2) - g);
    pic = { x: area.x, y: area.y + th + g, w: area.w, h: Math.max(area.h * P.minH, area.h - th - g) };
    share = pic.h / area.h;
  }
  const lh = tb.sz * 1.2;
  tb.rows.forEach((r, i) => label(r, cx, ty + lh * (i + 0.5), tb.sz, M.title, "center"));
  ui.hudRects.push({ id: "scene:title", x: cx - tb.w / 2, y: ty, w: tb.w, h: hOf(tb, 1.2), text: pg.title, rows: tb.rows.slice(), size: tb.sz });
  rowsAt("scene:caption", lb, cx, ty + hOf(tb, 1.2) + g, M.ink);
  ui.hudRects[ui.hudRects.length - 1].text = pg.text;
  if (PHONE) { noteText("title", tb.sz); noteText("story", lb.sz); }
  let picBox = pic, panel = null, pieces = null;
  if (img) { const r = paperPicture(img, cr, pic, name); panel = { x: r.ix, y: r.iy, w: r.iw, h: r.ih }; picBox = r.box; }
  else if (pg.fallback) pieces = drawTutorialFallback(pic, pg.fallback);
  else storyPlaceholder(pic, false, false);
  ui.sceneInfo = { id: ui.storyScene.id, page: ui.storyScene.page, pages: n, art: img ? "image" : pieces ? "fallback" : "placeholder", artName: img ? name : null,
    caption: pg.text, title: pg.title, crop: img && name === pg.art2 ? pg.crop2 : null, bubble: null, panel, pieces, picBox, fit, picShare: share };
}
export function drawScene() {
  if (!ui.storyScene) return;
  const M = LOOK.MENU_LOOK, S = M.scene, k = PHONE ? cpx(1) : 1, minMain = PHONE ? minPx("main") : 14;
  const { X0, X1, Y0, Y1, g, B } = menuFrame();
  const pages = scenePages(ui.storyScene.id), n = pages.length, pg = /** @type {any} */ (pages[ui.storyScene.page]), last = ui.storyScene.page === n - 1;
  const before = ui.storyScene.play;                           // перед уровнем: на последней странице «Играть»
  // нижний ряд: «Пропустить» слева (на последней странице длинной заставки её нет), точки страниц, справа «Дальше» / «Играть» / «Готово»
  const by = Y1 - B, bw = PHONE ? Math.min((X1 - X0) * 0.36, Math.max(B * 2.8, cpx(150))) : S.btnW, bsz = PHONE ? cpx(20) : 24;
  const viewer = ui.storyScene.back;                           // SPEC-032 AC 8: листалка «Картинки» — «◀ Назад» вместо «Пропустить»
  const goOn = !!ui.storyScene.skip && !viewer && ui.storyScene.id !== TUTORIAL_SCENES.at(-1);   // SPEC-029: лист обучения — и на последней «Дальше» (дальше тренировка)
  const nextText = pg.card ? L().tut.introGo + " ▶" : last && !goOn ? (before ? "▶ " + L().play : L().ok) : L().sceneNext + " ▶";   // SPEC-033: карточка «Как играть» — «Учимся! ▶»
  // SPEC-033 (CI): «Учимся! ▶» длиннее «Дальше ▶» — кнопка берёт нужную ширину (надпись × card.btnGrow на запас под более широкие шрифты CI), но не
  // налезает на «Пропустить» (промежуток g); остальные страницы — как были
  let nw = bw;
  if (pg.card) { ctx.font = hudFont(bsz); nw = Math.min(X1 - X0 - bw - g, Math.max(bw, scaledW(nextText) * S.card.btnGrow + (PHONE ? cpx(14) : 14))); }
  fitButton(X1 - nw, by, nw, B, nextText, M.ok, sceneNext, bsz, minMain).id = "scene:next";
  if (viewer) fitButton(X0, by, bw, B, "◀ " + L().sceneBack, M.back, sceneBack, bsz, minMain).id = "scene:back";
  else if (!last || n === 1 || ui.storyScene.skip) fitButton(X0, by, bw, B, L().sceneSkip, M.back, sceneSkip, bsz, minMain).id = "scene:skip";   // SPEC-029: обучение — на каждой
  if (n > 1) {
    const dr = M.story.dot * k, step = dr * 3.4, dx0 = (X0 + X1) / 2 - step * (n - 1) / 2;
    for (let i = 0; i < n; i++) { circle(dx0 + i * step, by + B / 2, i === ui.storyScene.page ? dr * 1.5 : dr); fillStroke(i === ui.storyScene.page ? M.title : M.panel, 2 * k); }
  }
  const area = { x: X0, y: Y0, w: X1 - X0, h: by - g - Y0 };
  if (pg.thanks) {                                            // «Спасибо, что играли!», кто сделал, пирожное (как в конце истории)
    const cs = area.h * S.cupcake, cy = area.y + cs / 2;
    if (!drawArtFit("icon_cupcake", area.x + area.w / 2, cy, cs)) drawArtFit("fx_hearts", area.x + area.w / 2, cy, cs);
    const t1 = fitLine(L().thanks, PHONE ? cpx(S.phoneThanks) : S.thanks, PHONE ? minPx("title") : 20, area.w), y1 = area.y + cs + g + t1.sz * 0.6;
    label(t1.text, area.x + area.w / 2, y1, t1.sz, M.title, "center");
    ui.hudRects.push({ id: "scene:thanks", x: area.x + area.w / 2 - t1.w / 2, y: y1 - t1.sz * 0.6, w: t1.w, h: t1.sz * 1.2, text: t1.text });
    const t2 = fitLine(L().madeBy, PHONE ? cpx(S.phoneMadeBy) : S.madeBy, minMain, area.w), y2 = y1 + t1.sz * 0.6 + g + t2.sz * 0.6;
    plainText(t2.text, area.x + area.w / 2, y2, t2.sz, M.ink, "center");
    ui.hudRects.push({ id: "scene:madeBy", x: area.x + area.w / 2 - t2.w / 2, y: y2 - t2.sz * 0.6, w: t2.w, h: t2.sz * 1.2, text: t2.text });
    if (PHONE) { noteText("title", t1.sz); noteText("main", t2.sz); }
    ui.sceneInfo = { id: ui.storyScene.id, page: ui.storyScene.page, pages: n, art: "thanks", caption: null, crop: null };
    return;
  }
  if (pg.card) { drawIntroCard(area, pg, g, n); return; }    // SPEC-033: карточка «Как играть» после комикса
  const img = art(pg.art), cr = pg.crop || [0, 0, 1, 1];
  const aspect = img ? (img.width * cr[2]) / (img.height * cr[3]) : 16 / 9;
  // SPEC-031: подпись меряется первой (кегль × масштаб экрана, мельче до самого мелкого), картинка — на остальном месте
  const size = PHONE ? storyPx(S.phoneText) : S.text, min = storyMin(14);
  let pic, tx, tW, ty, b, bubbles = [], panel = null, pieces = null, fit, picShare;
  if (PHONE) {                                                // картинка слева, подпись справа (по высоте — посередине)
    const f = sideFit(pg.text, area.w, area.h, 2 * g, S.phonePic, p => Math.min(area.w * p, area.h * aspect), size, min);
    pic = { x: area.x, y: area.y, w: f.pw, h: area.h };
    tx = area.x + f.pw + 2 * g; tW = f.tW; b = f.b; fit = b.fit; picShare = f.pw / area.w;
    ty = area.y + Math.max(0, (area.h - b.rows.length * b.sz * 1.2) / 2);
  } else {                                                    // подпись внизу (до S.lines строк), картинка над ней на всё остальное место
    tx = area.x; tW = area.w;
    b = noteRows(pg.text, size, min, tW, S.lines, { keep: true });
    // SPEC-031: не влезла в S.lines строк и самым мелким — строк больше (ничего не обрезаем); картинка не ниже STORY_PIC.minH высоты
    const th = b.rows.length * b.sz * 1.2, maxH = area.h * (1 - LOOK.STORY_PIC.minH) - g;
    fit = th <= maxH + 0.01;
    if (!fit) noteUnfit(pg.text, b, tW, maxH);
    pic = { x: area.x, y: area.y, w: area.w, h: Math.max(area.h * LOOK.STORY_PIC.minH, area.h - th - g) };
    picShare = pic.h / area.h;
    ty = pic.y + pic.h + g;
  }
  let picBox = pic;
  if (img) {
    const { ix, iy, iw, ih, box } = paperPicture(img, cr, pic, pg.art);
    if (pg.bubbles) bubbles = drawBubbles(pg.bubbles, cr, ix, iy, iw, ih);   // SPEC-026: слова папы в облачке клетки
    panel = { x: ix, y: iy, w: iw, h: ih };
    picBox = box;   // SPEC-031: с рамкой
  } else if (pg.fallback) pieces = drawTutorialFallback(pic, pg.fallback);   // SPEC-029: обучение без своей картинки — из других картинок
  else storyPlaceholder(pic, false);
  rowsAt("scene:caption", b, tx + tW / 2, ty, M.ink);
  ui.hudRects[ui.hudRects.length - 1].text = pg.text;
  if (PHONE) noteText("story", b.sz);   // SPEC-031: свой вид — свой самый мелкий (STORY_TEXT_MIN)
  ui.sceneInfo = { id: ui.storyScene.id, page: ui.storyScene.page, pages: n, art: img ? "image" : pieces ? "fallback" : "placeholder", caption: pg.text, crop: pg.crop,
    bubble: bubbles[0] || null, panel, pieces, picBox, fit, picShare };   // SPEC-031: picBox — картинка с рамкой (или её место), fit — подпись влезла, picShare — доля места под картинку (телефон — ширины, компьютер — высоты)   // SPEC-029: pieces — что нарисовано на запасной странице обучения (иначе null)   // SPEC-026: облачко клетки (рамка строк, кегль, своё ли облачко) и где нарисована клетка
}
// SPEC-029 AC 6: запасная страница обучения (нет картинки листа): бумажный лист, слева фигурка (кусок картинки истории; нет и её —
// карандашные человечки), справа значки вещей и эффектов; → имена нарисованного («figure» — человечки)
function drawTutorialFallback(r, [fig, ...icons]) {
  const S = LOOK.MENU_LOOK.story, k = PHONE ? cpx(1) : 1, F = CFG.TUTORIAL_LOOK.figures[fig], drawn = [];
  rr(r.x, r.y, r.w, r.h, 10 * k); fillStroke(S.paper, 3 * k);
  const L2 = CFG.TUTORIAL_LOOK, p = L2.fallbackPad * k, fw = r.w * L2.fallbackFig, box = { x: r.x + p, y: r.y + p, w: fw - 1.5 * p, h: r.h - 2 * p }, img = F && art(F[0]);
  if (img) {
    const [cx, cy, cw, ch] = F[1], sw = img.width * cw, sh = img.height * ch, s = Math.min(box.w / sw, box.h / sh), w = sw * s, h = sh * s;
    ctx.drawImage(img, img.width * cx, img.height * cy, sw, sh, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    noteArt(F[0]); drawn.push(F[0]);
  } else { storyPlaceholder(box, false, false); drawn.push("figure"); }
  const n = icons.length, ix = r.x + fw + (r.w - fw) / 2, sz = Math.min((r.w - fw) * L2.fallbackIcon, (r.h / n) * L2.fallbackIcon);
  icons.forEach((name, i) => { if (drawArtFit(name, ix, r.y + r.h * (i + 0.5) / n, sz)) drawn.push(name); });
  return drawn;
}
