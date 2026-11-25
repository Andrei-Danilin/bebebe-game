// SPEC-011 AC 10b: the ONE list of the site's files. `npm run site` copies them into _site/ (gitignored) — what GitHub Pages
// publishes (.github/workflows/pages.yml) and what tests/site.spec.js serves and plays. Node built-ins only (no npm install).
//   node scripts/site.js [--out <dir>] [--no-pages] [--stamp <text>]
// --out: _site/ (default), a missing or empty folder, or an earlier site build outside the repo (it is emptied first);
// --no-pages: without the Pages-only extras; --stamp: writes version.txt with that text (pages.yml: the commit sha, which
// the deploy's live check compares).
// A new site file or folder goes into SITE (and, if the installed app needs it offline, into sw.js's precache list).
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// the game itself: shell, PWA files, icons, the art sprites, the ES modules, the vendored three.js (SPEC-025 AC 1)
const SITE = ["index.html", "manifest.webmanifest", "sw.js", "icons", "assets", "src", "vendor"];
// Hook for later folders: entries here are copied only when they exist, so the list can name them before the folder is there;
// move them into SITE once they must exist (SPEC-025 moved "vendor" into SITE).
const SITE_LATER = [];
// published on Pages next to the game, not part of the installed app
const PAGES_ONLY = ["v1-2d"];

const STAMP = "version.txt";
const inside = (dir, parent) => { const r = path.relative(parent, dir); return r === "" || !(r.startsWith("..") || path.isAbsolute(r)); };
// where the site may be written (it is emptied first): _site/, a missing or empty folder, or an earlier build outside the repo
function checkOut(out) {
  if (out === path.join(ROOT, "_site")) return;
  if (inside(ROOT, out)) throw new Error("site: refusing to write into the repo or a folder above it: " + out);
  const have = fs.existsSync(out) ? fs.readdirSync(out) : [];
  if (!have.length) return;
  const known = [...SITE, ...SITE_LATER, ...PAGES_ONLY, STAMP];
  if (inside(out, ROOT) || !have.includes("sw.js") || have.some(f => !known.includes(f))) {
    throw new Error("site: refusing to empty " + out + " (not empty and not an earlier site build outside the repo)");
  }
}

// Copies the site into `out` (emptied first); returns the copied entries (relative paths). stamp → version.txt
function buildSite({ out = path.join(ROOT, "_site"), pages = true, stamp = null } = {}) {
  out = path.resolve(out);
  checkOut(out);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const entries = [...SITE, ...(pages ? PAGES_ONLY : [])];
  for (const e of entries) if (!fs.existsSync(path.join(ROOT, e))) throw new Error(`site: ${e} is missing`);
  entries.push(...SITE_LATER.filter(e => fs.existsSync(path.join(ROOT, e))));
  for (const e of entries) fs.cpSync(path.join(ROOT, e), path.join(out, e), { recursive: true });
  if (stamp != null) { fs.writeFileSync(path.join(out, STAMP), String(stamp) + "\n"); entries.push(STAMP); }
  return entries;
}

if (require.main === module) {
  const opt = name => {
    const i = process.argv.indexOf(name);
    if (i < 0) return null;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) { console.error(`site: ${name} needs a value`); process.exit(2); }
    return v;
  };
  const o = opt("--out"), out = o ? path.resolve(o) : path.join(ROOT, "_site");
  try {
    const entries = buildSite({ out, pages: !process.argv.includes("--no-pages"), stamp: opt("--stamp") });
    console.log(`site: ${entries.join(", ")} → ${path.relative(process.cwd(), out) || "."}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { SITE, SITE_LATER, PAGES_ONLY, STAMP, buildSite };
