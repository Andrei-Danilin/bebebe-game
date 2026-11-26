// SPEC-033 AC 14 (D-3): PW_FONT=ci — the local test browser draws the game's text with the font the CI runner draws it with.
// What CI renders: the game asks for `system-ui, "Segoe UI", …, sans-serif` (index.html CSS, every ctx.font of src/client). On the
// ubuntu-latest runner (npx playwright install --with-deps chromium: fonts-liberation, fonts-freefont-ttf, fonts-noto-color-emoji,
// … on top of the image's fonts-dejavu-core) Chromium's system-ui / sans-serif is fontconfig's default sans = DejaVu Sans — wider
// than Segoe UI by 13–16 % on our strings (measured: tests/fonts, TEXT_TEST_SCALE 1.15 was calibrated on exactly that), where
// Liberation Sans (= Arial) would be only 7 % wider. So the mode serves DejaVu Sans (regular + bold, tests/fonts, with its licence;
// test-only: never in scripts/site.js SITE, never precached, never fetched from the site) under the family "BBCI" and makes every
// game page use it instead of the machine's fonts:
//   - canvas: the `font` setter of CanvasRenderingContext2D swaps system-ui / "Segoe UI" / "Arial Rounded MT Bold" / Arial /
//     Helvetica in the font string for "BBCI" (the emoji fallbacks of the stacks stay: emoji come from the system, as the game
//     also draws most of them as pictures);
//   - DOM (cards, the grown-ups page, the name input): a style makes every element but the code textareas use "BBCI".
// The fonts travel as data: URLs inside the init script (no request: the offline audit and the route tests see nothing new).
// Not reproduced: CI's emoji font (Noto Color Emoji) — an emoji's width still comes from the machine's emoji font.
// Off by default; CI is unchanged (it has the real font). Used by helpers.js openGame / openGameHttp and the page fixture of pw.js.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "fonts");
const ciFont = process.env.PW_FONT === "ci";
const FAMILY = "BBCI";

let cached = null;
const fonts = () => cached || (cached = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map(f => fs.readFileSync(path.join(DIR, f)).toString("base64")));

// runs in the page, before the game's scripts
function inPage([regular, bold, family]) {
  const faces = [["400", regular], ["700", bold]].map(([w, b64]) => new FontFace(family, `url(data:font/ttf;base64,${b64})`, { weight: w }));
  for (const f of faces) document.fonts.add(f);                  // added at once: the first canvas use already asks for it
  window.__bbCiFont = Promise.all(faces.map(f => f.load())).then(() => true);
  const swap = /system-ui|["']Segoe UI["']|["']Arial Rounded MT Bold["']|\bArial\b|\bHelvetica\b/g;
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    const d = Object.getOwnPropertyDescriptor(C.prototype, "font");
    Object.defineProperty(C.prototype, "font", { ...d, set(v) { d.set.call(this, String(v).replace(swap, `"${family}"`)); } });
  }
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = `body, body *:not(textarea) { font-family: "${family}", sans-serif !important; }`;
    document.head.append(s);
  });
}
// the page uses the CI font in every navigation from now on (PW_FONT=ci only)
async function installCiFont(page) {
  if (!ciFont || page.__ciFont) return;
  page.__ciFont = true;
  await page.addInitScript(inPage, [...fonts(), FAMILY]);
}
// the fonts are decoded (so text drawn from now on is measured with them)
async function ciFontReady(page) {
  if (ciFont) await page.evaluate(() => window.__bbCiFont);
}

module.exports = { ciFont, installCiFont, ciFontReady, FAMILY, DIR };
