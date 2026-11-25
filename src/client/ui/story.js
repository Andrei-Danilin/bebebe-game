// SPEC-011: the story screen (chapters, How to play), the comic bubbles (SPEC-026), the story scenes (SPEC-022). Client
// module (moved out of index.html in Phase C).

import { BONUS_WORLDS, CFG, WORLDS } from "../../core/config.js";
import { clamp } from "../../core/util.js";
import { L, lang } from "../../i18n.js";
import { RULE_ICONS, STORY, TUTORIAL_SCENES } from "../../story.js";
import { art, artFile, artImgs, STORY_ART, tape } from "../art.js";
import { cardLevel, chapterOpen, sceneNext, scenePages, sceneSkip, storyBack, goBack, storyCh, storyStep, watchChapter } from "../flow.js";
import { LOOK } from "../look.js";
import { ctx, PHONE } from "../screen.js";
import { ui } from "../state.js";
import { openTutorial } from "../tutorial.js";
import { fitButton, rowsAt } from "./character/wardrobe.js";
import { circle, drawArtFit, fillStroke, fillT, heartPath, noteArt, regButton, rr } from "./draw.js";
import { lockedText, WORLD_ICONS } from "./map.js";
import { menuFrame } from "./menu.js";
import { cpx, hudFont, label, minPx, noteRows, noteText, noteUnfit, plainText, scaledW, sideFit, storyMin, storyPx } from "./text.js";
import { fitLine } from "./win.js";

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
  fitButton(X1 - tw, Y0, tw, B, rules ? "📖 " + L().story : "❓ " + L().howToPlay, M.storyBtn, () => { ui.storyPage = rules ? "chapters" : "rules"; }, PHONE ? cpx(16) : 19, minMain).id = rules ? "story:chapters" : "story:rules";
  const title = rules ? "❓ " + L().howToPlay : (open ? "" : "🔒 ") + chapterTitle(c);
  const tx0 = X0 + bw + g, tmax = X1 - tw - g - tx0, tf = fitLine(title, PHONE ? Math.max(minMain, storyPx(20)) : 26, minMain, tmax);   // SPEC-031: × масштаб экрана
  label(tf.text, tx0 + tmax / 2, Y0 + B / 2, tf.sz, rules ? M.storyBtn : M.title, "center");
  if (PHONE) noteText("main", tf.sz);
  ui.hudRects.push({ id: "story:title", x: tx0 + tmax / 2 - tf.w / 2, y: Y0 + B / 2 - tf.sz * 0.6, w: tf.w, h: tf.sz * 1.2, text: tf.text });
  const top = Y0 + B + g;
  if (rules) {
    // правила (как было в меню) — значок слева, строка до двух-трёх рядов; ниже управление (телефон — только про палец)
    // SPEC-029: нижний ряд — свой: справа «▶ Тренировка» (обучение ещё раз; в конце — снова сюда), на телефоне слева от неё —
    // строка управления; правила — над рядом (на телефоне не влезают — мельче, не мельче подсказок)
    const iw = S.icon * k, maxW = X1 - X0 - iw, by = Y1 - B, lines = L().rules(CFG.DOWN_TIME);
    const pt = "▶ " + L().tut.practice;
    ctx.font = hudFont(PHONE ? cpx(18) : 20);
    const pw = Math.min((X1 - X0) * 0.45, Math.max(B * 2.5, scaledW(pt) + 30 * k));
    fitButton(X1 - pw, by, pw, B, pt, M.ok, () => openTutorial("story"), PHONE ? cpx(18) : 20, minMain).id = "story:practice";
    const rulesH = sz => lines.reduce((h, r) => { const b = noteRows(r, sz, minHint, maxW, 3); return h + b.rows.length * b.sz * 1.2 + 5 * k; }, 0);
    let size = PHONE ? cpx(S.phoneRule) : S.rule;
    if (PHONE) while (size > minHint && rulesH(size) > by - g - (top + 4 * k)) size = Math.max(minHint, size - 0.5);
    let y = top + 4 * k;
    lines.forEach((r, i) => {
      const b = noteRows(r, size, minHint, maxW, 3), lh = b.sz * 1.2;
      ctx.font = `${size}px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      fillT(RULE_ICONS[i] || "•", X0 + iw / 2, y + lh / 2);
      ctx.font = `800 ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "left"; ctx.fillStyle = M.ink;
      b.rows.forEach((q, j) => fillT(q, X0 + iw, y + lh * (j + 0.5)));
      if (PHONE) noteText("hint", b.sz);
      ui.hudRects.push({ id: "rules:" + i, x: X0 + iw, y, w: b.w, h: b.rows.length * lh, text: r });
      y += b.rows.length * lh + 5 * k;
    });
    y += 6 * k;
    if (PHONE) {                                           // про палец — в нижнем ряду, левее «Тренировки», по середине ряда
      const t = L().touch1, cw = X1 - X0 - pw - g, b = noteRows(t, cpx(S.phoneRule), minHint, cw, 2);
      rowsAt("controls:touch", b, X0 + cw / 2, by + (B - b.rows.length * b.sz * 1.2) / 2, M.soft);
      ui.hudRects[ui.hudRects.length - 1].text = t;
      noteText("hint", b.sz);
    } else for (const [id, t] of [["controls:0", L().controls1], ["controls:1", L().controls2]]) {
      // строка, которая дошла бы до нижнего ряда, — левее кнопки «Тренировка»
      const cw = y + 2 * 15 * 1.2 > by - g ? X1 - X0 - pw - g : X1 - X0;
      const b = noteRows(t, 15, minHint, cw, 2);
      y += rowsAt(id, b, X0 + cw / 2, y, M.soft) + 2 * k;
      ui.hudRects[ui.hudRects.length - 1].text = t;
    }
    ui.storyInfo = { chapter: c.id, index: storyCh, locked: !open, page: "rules", title, text: "", art: null };
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
  const { pw, tW, b } = sideFit(text, X1 - X0, mh, 2 * g, S.pic, p => Math.min((X1 - X0) * p, mh * 1.4), size, min), picShare = pw / (X1 - X0);
  const pic = { x: X0, y: top, w: pw, h: mh };
  // SPEC-020: картинка главы — свой путь (c.image) или комикс из art/ (STORY_ART); нет — заглушка
  const own = open && c.image ? storyPicture(c) : null, artName = open && !c.image ? STORY_ART[c.id] : null, img = own || (artName && art(artName));
  let imgRect = null, picBox = pic;
  if (img) {
    const fr = 5 * k, sc = Math.min((pic.w - 2 * fr) / img.width, (pic.h - 2 * fr) / img.height), iw = img.width * sc, ih = img.height * sc;
    const ix = pic.x + (pic.w - iw) / 2, iy = pic.y + (pic.h - ih) / 2;
    imgRect = [ix, iy, iw, ih];
    picBox = { x: ix - fr - 1.5 * k, y: iy - fr - 1.5 * k, w: iw + 2 * fr + 3 * k, h: ih + 2 * fr + 3 * k };   // SPEC-031: с рамкой (и половиной её линии)
    rr(ix - fr, iy - fr, iw + 2 * fr, ih + 2 * fr, 6 * k); fillStroke(S.paper, 3 * k);   // бумажная рамка
    ctx.drawImage(img, ix, iy, iw, ih);
    if (artName) noteArt(artName);
    tape(ix + 6 * k, iy + 2 * k, -0.7, k * 0.8); tape(ix + iw - 6 * k, iy + 2 * k, 0.7, k * 0.8);
  } else storyPlaceholder(pic, !open);
  // SPEC-026: «Как всё началось» — комикс целиком: слова папы во всех четырёх облачках
  const bubbles = img && artName && c.bubbles ? drawBubbles(c.bubbles[lang].map((text, i) => ({ i, text })), [0, 0, 1, 1], ...imgRect) : [];
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
  ui.storyInfo = { chapter: c.id, index: storyCh, locked: !open, page: "chapters", title, text, art: !open ? "locked" : img ? "image" : "placeholder", load: storyLoad(c), pic, bubbles, picBox, fit: b.fit, picShare };
}
// ---------- SPEC-026: слова папы в пустых облачках комикса 8_start (заставка «Как всё началось» и глава в «Истории») ----------
// строки текста облачка: кегль от size до min (шаг 0,5), не больше lines строк, не шире maxW и не выше maxH (× TEXT_TEST_SCALE);
// → { rows, sz, w, h, fit } (fit = false: не влезло и самым мелким — тогда строки самым мелким, их может быть больше lines)
function bubbleRows(text, maxW, maxH, size, min, lines) {
  const lh = LOOK.MENU_LOOK.scene.bubbleLh;
  for (let sz = size; ; sz = Math.max(min, sz - 0.5)) {
    ctx.font = `800 ${sz}px system-ui, "Segoe UI", sans-serif`;
    const rows = [];
    let cur = "";
    for (const wd of text.split(" ")) { const t = cur ? cur + " " + wd : wd; if (scaledW(t) > maxW && cur) { rows.push(cur); cur = wd; } else cur = t; }
    rows.push(cur);
    const w = Math.max(...rows.map(scaledW)), h = rows.length * sz * lh;
    const fit = rows.length <= lines && w <= maxW && h <= maxH;
    if (fit || sz <= min) return { rows, sz, w, h, fit, lh };
  }
}
// неровный контур облачка (как фломастером): суперэллипс степени n с центром cx, cy, полуосями rx, ry; неровность — синусы, без случайности
function wobblyBubble(cx, cy, rx, ry, wob, n) {
  const sp = (v, e) => Math.sign(v) * Math.abs(v) ** e;
  ctx.beginPath();
  for (let j = 0; j <= 48; j++) {
    const a = j / 48 * Math.PI * 2, f = 1 + wob * (Math.sin(a * 5 + 0.7) + 0.6 * Math.sin(a * 9 + 2.1)) / 1.6;
    const x = cx + sp(Math.cos(a), 2 / n) * rx * f, y = cy + sp(Math.sin(a), 2 / n) * ry * f;
    if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}
// list — [{ i, text }] (облачко i = клетка i), cr — какая часть картинки нарисована (доли [x, y, w, h]), ix…ih — где она на экране.
// Слова — по центру облачка, тёмные, жирные,
// до двух строк, мельче — до самого мелкого текста подписи; не влезли и так — своё облачко поверх нарисованного (белое, неровный
// чёрный контур, хвостик в ту же сторону), внутри клетки, по размеру слов.
// → [{ i, text, x, y, w, h (рамка строк), size, rows, own, bubble (своё облачко или null), panel (клетка на экране) }]
function drawBubbles(list, cr, ix, iy, iw, ih) {
  const S = LOOK.MENU_LOOK.scene, k = PHONE ? cpx(1) : 1, min = storyMin(S.bubbleMin), max = Math.max(min, PHONE ? storyPx(S.phoneText) : S.text);   // SPEC-031: масштаб и самый мелкий — как у подписи
  const X = f => ix + (f - cr[0]) / cr[2] * iw, Y = f => iy + (f - cr[1]) / cr[3] * ih, [inW, inH] = S.bubbleIn;
  const out = [];
  for (const { i, text } of list) {
    const [bx, by, bw, bh, tx, ty] = S.bubbles[i], [px, py, pw, ph] = S.panels[i];
    const box = { x: X(bx), y: Y(by), w: X(bx + bw) - X(bx), h: Y(by + bh) - Y(by) };
    const panel = { x: Math.max(ix, X(px)), y: Math.max(iy, Y(py)) };
    panel.w = Math.min(ix + iw, X(px + pw)) - panel.x; panel.h = Math.min(iy + ih, Y(py + ph)) - panel.y;
    let b = bubbleRows(text, box.w * inW, box.h * inH, max, min, S.bubbleLines), cx = box.x + box.w / 2, cy = box.y + box.h / 2, bubble = null;
    if (!b.fit) {
      // своё облачко: слова кеглем своего облачка (SPEC-031: на телефоне phoneOwn × масштаб экрана, не мельче min; компьютер — min),
      // ширина строки растёт, пока строк не больше lines (но облачко не шире ownMax клетки); не влезло и так — самым мелким
      const m = S.ownEdge * k, [oW, oH] = S.ownIn, wMax = (panel.w * S.ownMax - 2 * m) * oW;
      for (const sz of PHONE && storyPx(S.phoneOwn) > min ? [storyPx(S.phoneOwn), min] : [min]) {
        let w = box.w * inW;
        do { b = bubbleRows(text, w, Infinity, sz, sz, S.bubbleLines); w *= 1.12; } while (b.rows.length > S.bubbleLines && w < wMax * 1.12);
        if (b.rows.length <= S.bubbleLines && b.w <= wMax) break;
      }
      // не меньше нарисованного облачка: пустого облачка не видно (SPEC-026: ни одной клетки с пустым облачком)
      const ow = Math.min(panel.w - 2 * m, Math.max(box.w * S.ownCover, b.w / oW)), oh = Math.min(panel.h - 2 * m, Math.max(box.h * S.ownCover, b.h / oH));
      cx = clamp(cx, panel.x + m + ow / 2, panel.x + panel.w - m - ow / 2); cy = clamp(cy, panel.y + m + oh / 2, panel.y + panel.h - m - oh / 2);
      bubble = { x: cx - ow / 2, y: cy - oh / 2, w: ow, h: oh };
      // хвостик — туда же, куда у нарисованного облачка (к его кончику), не дальше края клетки
      const a = Math.atan2(Y(ty) - (box.y + box.h / 2), X(tx) - (box.x + box.w / 2)), len = oh * S.ownTail;
      const tipX = clamp(cx + Math.cos(a) * (ow / 2 + len), panel.x + m, panel.x + panel.w - m), tipY = clamp(cy + Math.sin(a) * (oh / 2 + len), panel.y + m, panel.y + panel.h - m);
      ctx.save();
      ctx.lineWidth = S.ownLine * k; ctx.strokeStyle = S.bubbleInk; ctx.fillStyle = "#ffffff"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.3) * ow * 0.42, cy + Math.sin(a - 0.3) * oh * 0.42); ctx.lineTo(tipX, tipY);
      ctx.lineTo(cx + Math.cos(a + 0.3) * ow * 0.42, cy + Math.sin(a + 0.3) * oh * 0.42); ctx.closePath();
      ctx.fill(); ctx.stroke();
      wobblyBubble(cx, cy, ow / 2, oh / 2, S.ownWobble, S.ownRound); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // строки по центру облачка
    const lh = b.sz * b.lh, top = cy - b.h / 2;
    ctx.save();
    ctx.font = `800 ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = S.bubbleInk;
    b.rows.forEach((r, j) => fillT(r, cx, top + lh * (j + 0.5)));
    ctx.restore();
    if (PHONE) noteText("story", b.sz);
    out.push({ i, text, x: cx - b.w / 2, y: top, w: b.w, h: b.h, size: b.sz, rows: b.rows.length, own: !!bubble, bubble, panel });
  }
  return out;
}
export function drawScene() {
  if (!ui.storyScene) return;
  const M = LOOK.MENU_LOOK, S = M.scene, k = PHONE ? cpx(1) : 1, minMain = PHONE ? minPx("main") : 14;
  const { X0, X1, Y0, Y1, g, B } = menuFrame();
  const pages = scenePages(ui.storyScene.id), n = pages.length, pg = pages[ui.storyScene.page], last = ui.storyScene.page === n - 1;
  const before = ui.storyScene.play;                           // перед уровнем: на последней странице «Играть»
  // нижний ряд: «Пропустить» слева (на последней странице длинной заставки её нет), точки страниц, справа «Дальше» / «Играть» / «Готово»
  const by = Y1 - B, bw = PHONE ? Math.min((X1 - X0) * 0.36, Math.max(B * 2.8, cpx(150))) : S.btnW, bsz = PHONE ? cpx(20) : 24;
  const goOn = !!ui.storyScene.skip && ui.storyScene.id !== TUTORIAL_SCENES.at(-1);   // SPEC-029: лист обучения — и на последней «Дальше» (дальше тренировка)
  fitButton(X1 - bw, by, bw, B, last && !goOn ? (before ? "▶ " + L().play : L().ok) : L().sceneNext + " ▶", M.ok, sceneNext, bsz, minMain).id = "scene:next";
  if (!last || n === 1 || ui.storyScene.skip) fitButton(X0, by, bw, B, L().sceneSkip, M.back, sceneSkip, bsz, minMain).id = "scene:skip";   // SPEC-029: обучение — на каждой
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
    const fr = 5 * k, sw = img.width * cr[2], sh = img.height * cr[3];
    const sc = Math.min((pic.w - 2 * fr) / sw, (pic.h - 2 * fr) / sh), iw = sw * sc, ih = sh * sc, ix = pic.x + (pic.w - iw) / 2, iy = pic.y + (pic.h - ih) / 2;
    rr(ix - fr, iy - fr, iw + 2 * fr, ih + 2 * fr, 6 * k); fillStroke(M.story.paper, 3 * k);   // бумажная рамка, как в «Истории»
    ctx.drawImage(img, img.width * cr[0], img.height * cr[1], sw, sh, ix, iy, iw, ih);
    noteArt(pg.art);
    tape(ix + 6 * k, iy + 2 * k, -0.7, k * 0.8); tape(ix + iw - 6 * k, iy + 2 * k, 0.7, k * 0.8);
    if (pg.bubbles) bubbles = drawBubbles(pg.bubbles, cr, ix, iy, iw, ih);   // SPEC-026: слова папы в облачке клетки
    panel = { x: ix, y: iy, w: iw, h: ih };
    picBox = { x: ix - fr - 1.5 * k, y: iy - fr - 1.5 * k, w: iw + 2 * fr + 3 * k, h: ih + 2 * fr + 3 * k };   // SPEC-031: с рамкой
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
