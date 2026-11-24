// SPEC-020: renders the PWA icons from the drawn app icon art/2_icon.webp (sharp, no browser).
//   npm run icons
// The picture is a square on blue marker; its outer edge shows bits of white paper, so a margin is cut off first.
// - icon-192.png, icon-512.png: rounded square with transparent corners, purpose "any".
// - apple-touch-icon.png (180): opaque, full-bleed (iOS rounds the corners itself).
// - icon-512-maskable.png: opaque, full-bleed (the dad's face and the kid sit inside the central 80 % safe circle).
// - icon.svg: the favicon (index.html links it, sw.js precaches it) — the 128 px rounded icon embedded as a PNG.
// Bump SW_VERSION in sw.js after a new icon (hard rule 8).
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "art", "2_icon.webp");
const DIR = path.join(ROOT, "icons");
const MARGIN = 0.05;                  // share of the side cut off on every edge (white paper at the picture's edge)
const RADIUS = 0.18;                  // corner radius of the "any" icons, share of the side
const FAVICON = 128;

const roundMask = size => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * RADIUS)}" fill="#fff"/></svg>`);

async function square(size) {
  const meta = await sharp(SRC).metadata();
  const side = Math.min(meta.width, meta.height), cut = Math.round(side * MARGIN);
  return sharp(SRC).removeAlpha()
    .extract({ left: cut, top: cut, width: side - 2 * cut, height: side - 2 * cut })
    .resize(size, size, { kernel: "lanczos3" });
}

const opaque = async size => (await square(size)).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer();
const rounded = async size => sharp(await (await square(size)).ensureAlpha().png().toBuffer())
  .composite([{ input: roundMask(size), blend: "dest-in" }]).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer();

(async () => {
  const out = [
    ["icon-192.png", await rounded(192)],
    ["icon-512.png", await rounded(512)],
    ["apple-touch-icon.png", await opaque(180)],
    ["icon-512-maskable.png", await opaque(512)]
  ];
  const fav = await rounded(FAVICON);
  out.push(["icon.svg", Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FAVICON}" height="${FAVICON}" viewBox="0 0 ${FAVICON} ${FAVICON}">` +
    `<image width="${FAVICON}" height="${FAVICON}" href="data:image/png;base64,${fav.toString("base64")}"/></svg>\n`)]);
  for (const [file, buf] of out) {
    fs.writeFileSync(path.join(DIR, file), buf);
    console.log("icons/" + file, (buf.length / 1024).toFixed(1) + " KB");
  }
})().catch(e => { console.error(e); process.exit(1); });
