// SPEC-039 (from ui/draw.js): the canvas path helpers, taking the 2D context as their first argument. The screen layer draws on the
// screen's context (ui/draw.js binds these to it: rr, circle, fillStroke); the 3D painters (the ground texture of three/map3d.js and
// three/themes.js) pass their own canvas's context, so nothing swaps the screen's context any more (the old setCtx). A leaf: no
// other client module. Client module.
import { TAU } from "../../core/config.js";
import { OUT } from "../screen.js";

export function rrOn(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
export function circleOn(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
export function ellipseOn(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
export function fillStrokeOn(c, fill, lw = 3, stroke = OUT) { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
