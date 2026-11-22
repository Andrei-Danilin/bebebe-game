// Renders icons/icon.svg into the PNG icons of the PWA with Playwright's Chromium.
//   npm run icons
// - icon-192.png, icon-512.png: the SVG as is (round-rect, transparent corners), purpose "any".
// - apple-touch-icon.png (180): opaque, full-bleed background (iOS rounds the corners itself).
// - icon-512-maskable.png: opaque, the artwork shrunk into the central 80 % safe zone.
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

const DIR = path.resolve(__dirname, "..", "icons");
const BG = "#5f9e4a";                 // the icon's background green
const TARGETS = [
  { file: "icon-192.png", size: 192, scale: 1, bg: null },
  { file: "icon-512.png", size: 512, scale: 1, bg: null },
  { file: "apple-touch-icon.png", size: 180, scale: 1, bg: BG },
  { file: "icon-512-maskable.png", size: 512, scale: 0.68, bg: BG }
];

(async () => {
  const svg = fs.readFileSync(path.join(DIR, "icon.svg"), "utf8");
  const src = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const browser = await chromium.launch();
  try {
    for (const t of TARGETS) {
      const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
      const art = Math.round(t.size * t.scale), off = Math.round((t.size - art) / 2);
      await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:${t.bg || "transparent"}">
        <img src="${src}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px"></body></html>`);
      await page.evaluate(() => document.querySelector("img").decode());
      await page.screenshot({ path: path.join(DIR, t.file), clip: { x: 0, y: 0, width: t.size, height: t.size }, omitBackground: !t.bg });
      await page.close();
      console.log("icons/" + t.file, t.size + "×" + t.size);
    }
  } finally {
    await browser.close();
  }
})();
