// SPEC-039 (from ui/character/wardrobe.js and tabs.js): the buttons several screens build on — a button whose label is fitted to its
// width (fitButton), the icon-only paper button, rows of notes centred under a point. Below the screens that use them (the Character
// tabs, the map, the story, the win screen), above the text and art drawing. Client module.
import { art, PAPER_BTN, artPick } from "../art.js";
import { LOOK } from "../look.js";
import { ctx, PHONE } from "../screen.js";
import { ui } from "../state.js";
import { art9Visible, drawArt9, drawArtFit, fillT } from "./artdraw.js";
import { addButton, regButton } from "./draw.js";
import { cpx } from "./layout.js";
import { paperUI } from "./paper.js";
import { fitLine, label, noteText } from "./text.js";

// кнопка, надпись которой меряется с LOOK.TEXT_TEST_SCALE и сжимается до min (потом «…»); textW — ширина с этим множителем
export function fitButton(x, y, w, h, text, color, act, size, min) {
  const f = fitLine(text, size, min, w - (PHONE ? cpx(14) : 14));
  const b = addButton(x, y, w, h, f.text, color, act, f.sz);
  b.textW = f.w; b.size = f.sz;
  return b;
}
// строки noteRows от верхнего края y по центру cx (+ прямоугольник в hudRects); возвращает высоту
export function rowsAt(id, b, cx, y, color, weight = 800) {
  const lh = b.sz * 1.2;
  ctx.font = `${weight} ${b.sz}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  b.rows.forEach((q, i) => fillT(q, cx, y + lh * (i + 0.5)));
  ui.hudRects.push({ id, x: cx - b.w / 2, y, w: b.w, h: b.rows.length * lh, text: b.rows.join(" "), rows: b.rows.slice(), size: b.sz });
  return b.rows.length * lh;
}
// SPEC-027: бумажная кнопка без надписи, только значок-картинка (icon или его запасная) на iconOnly высоты; нет картинок — кнопка с эмодзи
export function iconOnlyButton(x, y, w, h, icon, emoji, color, act, size, min, id) {
  const paper = PAPER_BTN[color], pic = artPick(icon);
  if (paperUI() && pic && paper && drawArt9(paper, x, y, w, h, Math.min(w, h) * LOOK.PAPER.btnCorner)) {
    drawArtFit(pic, x + w / 2, y + h / 2, Math.min(w, h) * LOOK.PAPER.iconOnly);
    return regButton(x, y, w, h, emoji, act, id, Math.min(w, h) * LOOK.PAPER.iconOnly);
  }
  const b = fitButton(x, y, w, h, emoji, color, act, size, min); b.id = id;
  return b;
}
// SPEC-039: (from home.js, where the story screen's buttons also used it) the home screen's button — icon at the left, label centred
// SPEC-030 AC 8 (сделано в SPEC-027): кнопка главного экрана — значок слева (отступ btnIconGap × hRef от левого края, по центру
// высоты; hRef — общая высота кнопок «История»/«Персонаж», так значки трёх кнопок в одном столбике и одного размера), надпись по
// центру всей кнопки: сначала мельчает под всю ширину (fitLine, поля btnPad), потом, если залезает на значок с отступом, сдвигается
// вправо ровно настолько; мельчает дальше, только если и сдвиг не помог. null — нет картинок (бумаги или значка): рисует вызывающий.
// Возвращает геометрию для __bb.homeInfo.buttons: { id, x, y, w, h, gap, icon: { x, y, w, h }, label: { x, w, cx, size, shifted } }
export function homeButton(x, y, w, h, a, size, min) {
  const D = LOOK.MENU_LOOK.home, paper = PAPER_BTN[a.color], pic = artPick(a.icon), pad = (PHONE ? cpx(1) : 1) * D.btnPad / 2;
  if (!paperUI() || !paper || !pic || !art(paper)) return null;
  // SPEC-032 AC 6: от видимого края нарисованной кнопки (не от прозрачного поля картинки) — btnIconGap × её высоты, значок btnIcon × высоты
  const corner = Math.min(w, h) * LOOK.PAPER.btnCorner, vis = art9Visible(paper, x, y, w, h, corner);
  const gap = h * D.btnIconGap, ic = h * D.btnIcon, ix = vis.x + gap, clear = ix + ic + h * D.btnLabelGap;   // левее clear надпись не начинается
  const right = vis.x + vis.w - pad;
  let f = fitLine(a.text, size, min, w - 2 * pad);
  if (x + w / 2 - f.w / 2 < clear && clear + f.w > right) f = fitLine(a.text, f.sz, min, right - clear);   // и сдвиг не помог
  const cx = Math.max(x + w / 2, clear + f.w / 2), shifted = cx > x + w / 2;
  drawArt9(paper, x, y, w, h, corner);
  drawArtFit(pic, ix + ic / 2, y + h / 2, ic);
  label(f.text, cx, y + h / 2 + 1, f.sz, "#fff", "center");
  if (PHONE) noteText("main", f.sz);
  const b = regButton(x, y, w, h, a.emoji + a.text, a.act, a.id, ic + gap + f.w);
  b.size = f.sz;
  return { id: a.id, x, y, w, h, gap, vis, icon: { x: ix, y: y + h / 2 - ic / 2, w: ic, h: ic }, label: { x: cx - f.w / 2, w: f.w, cx, size: f.sz, shifted } };
}
