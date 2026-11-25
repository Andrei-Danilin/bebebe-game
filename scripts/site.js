// SPEC-011 AC 10b: the ONE list of the site's files. `npm run site` copies them into _site/ (gitignored) — what GitHub Pages
// publishes (.github/workflows/pages.yml) and what tests/site.spec.js serves and plays. Node built-ins only (no npm install).
//   node scripts/site.js [--out <dir>] [--no-pages]     (--no-pages: without the Pages-only extras, e.g. for the installed app)
// A new site file or folder goes into SITE (and, if the installed app needs it offline, into sw.js's precache list).
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// the game itself: shell, PWA files, icons, the art sprites
const SITE = ["index.html", "manifest.webmanifest", "sw.js", "icons", "assets"];
// Hook for the module split: SPEC-011 phase B adds "src" (the ES modules), SPEC-025 "vendor" (three.js). Entries here are
// copied only when they exist, so the list can name them before the folder is there; move them into SITE once they must exist.
const SITE_LATER = ["src", "vendor"];
// published on Pages next to the game, not part of the installed app
const PAGES_ONLY = ["v1-2d"];

// Copies the site into `out` (emptied first); returns the copied entries (relative paths)
function buildSite({ out = path.join(ROOT, "_site"), pages = true } = {}) {
  out = path.resolve(out);
  // never empty the repo, a folder above it or one of the site's own folders
  const rel = path.relative(out, ROOT), src = path.relative(ROOT, out).split(path.sep)[0];
  if (!(rel.startsWith("..") || path.isAbsolute(rel)) || [...SITE, ...SITE_LATER, ...PAGES_ONLY].includes(src)) throw new Error("site: refusing to write into " + out);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const entries = [...SITE, ...(pages ? PAGES_ONLY : [])];
  for (const e of entries) if (!fs.existsSync(path.join(ROOT, e))) throw new Error(`site: ${e} is missing`);
  entries.push(...SITE_LATER.filter(e => fs.existsSync(path.join(ROOT, e))));
  for (const e of entries) fs.cpSync(path.join(ROOT, e), path.join(out, e), { recursive: true });
  return entries;
}

if (require.main === module) {
  const i = process.argv.indexOf("--out");
  const out = i < 0 ? path.join(ROOT, "_site") : path.resolve(process.argv[i + 1]);
  const entries = buildSite({ out, pages: !process.argv.includes("--no-pages") });
  console.log(`site: ${entries.join(", ")} → ${path.relative(process.cwd(), out) || "."}`);
}

module.exports = { SITE, SITE_LATER, PAGES_ONLY, buildSite };
