// SPEC-011 AC 9: `npm run precache` — the module versions of the installed app (Node built-ins only). Run it after any change
// to src/ (and after merging master into a branch): it is the step that replaces a manual SW_VERSION bump for module changes.
// From the one site list (scripts/site.js SITE) it writes
//   index.html: the import map — every module URL "./src/…/x.js" → "./src/…/x.js?v=<hash of its bytes>" (and "three"), so a
//               shell only ever asks for its own module versions (import maps remap the modules' relative imports too);
//               <meta name="src-hash" content="<SRC_HASH>"> — the version of the whole module set;
//               the entry script <script type="module" src="./src/client/main.js?v=<hash>"> — an entry script's src is not
//               remapped by the import map, so its version is written into the tag itself (Phase C);
//   sw.js:      between // precache:start / // precache:end — SRC_HASH, the shell files (PRECACHE_LOCAL) and the versioned
//               module URLs (PRECACHE_SRC) the service worker installs into its "src" cache.
// A test (tests/pwa.spec.js) fails when the committed hashes, import map or SRC_HASH do not match the files: rerun this.
//   node scripts/precache.js [--check]
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { SITE } = require("./site.js");

const ROOT = path.resolve(__dirname, "..");
const INDEX = path.join(ROOT, "index.html"), SW = path.join(ROOT, "sw.js");
const MARK = ["// precache:start", "// precache:end"];
const NL = "\n";
const ENTRY = "./src/client/main.js";
const ENTRY_RE = /<script type="module" src="\.\/src\/client\/main\.js(?:\?v=[0-9a-f]*)?"><\/script>/;
const hashOf = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 10);
// a module's hash: of its text with LF line ends (a Windows checkout with CRLF gives the same hash as CI and Pages)
const fileHash = f => hashOf(fs.readFileSync(f, "utf8").split("\r\n").join(NL));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = f => "./" + path.relative(ROOT, f).replace(/\\/g, "/");

// The site's files by role: the shell (index.html, the manifest, the icons) and the ES modules (every src/**/*.js; not
// src/package.json, which only tells Node the files are modules). sw.js is the worker itself, assets/ has its own list
// (npm run assets), so neither is here.
function lists() {
  const shell = ["./"], modules = [];
  for (const e of SITE) {
    const p = path.join(ROOT, e);
    if (e === "sw.js" || e === "assets") continue;
    const files = fs.statSync(p).isDirectory() ? walk(p).sort() : [p];
    for (const f of files) {
      if (e === "src") { if (f.endsWith(".js")) modules.push({ url: rel(f), hash: fileHash(f) }); }
      else shell.push(rel(f));
    }
  }
  modules.sort((x, y) => (x.url < y.url ? -1 : x.url > y.url ? 1 : 0));   // by posix path, the same on every system
  shell.sort((x, y) => (x === "./" ? -1 : y === "./" ? 1 : x < y ? -1 : x > y ? 1 : 0));
  const srcHash = hashOf(modules.map(m => `${m.url} ${m.hash}`).join(NL));
  return { shell, modules, srcHash };
}

const arrayLines = (items, indent) => {
  const out = []; let cur = "";
  for (const it of items.map(x => JSON.stringify(x))) {
    if (cur && (indent + cur + it).length > 118) { out.push(indent + cur.trimEnd()); cur = ""; }
    cur += it + ", ";
  }
  if (cur) out.push(indent + cur.slice(0, -2));
  return out.join(NL);
};

// index.html with the import map and the src-hash meta for these modules
function writeIndex(html, { modules, srcHash }) {
  const re = /<script type="importmap">([\s\S]*?)<\/script>/;
  const m = html.match(re);
  if (!m) throw new Error("index.html: no <script type=\"importmap\">");
  const three = JSON.parse(m[1]).imports.three;
  if (!three) throw new Error("index.html: the import map has no \"three\"");
  const entries = [["three", three], ...modules.map(x => [x.url, `${x.url}?v=${x.hash}`])];
  const map = "<script type=\"importmap\">" + NL + "{ \"imports\": {" + NL +
    entries.map(([k, v], i) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < entries.length - 1 ? "," : ""}`).join(NL) + NL + "} }" + NL + "</script>";
  html = html.replace(re, map);
  const entry = modules.find(x => x.url === ENTRY);
  if (entry) {
    if (!ENTRY_RE.test(html)) throw new Error(`index.html: no <script type="module" src="${ENTRY}"> entry script`);
    html = html.replace(ENTRY_RE, `<script type="module" src="${ENTRY}?v=${entry.hash}"></script>`);
  }
  const meta = `<meta name="src-hash" content="${srcHash}">`;
  if (/<meta name="src-hash" content="[^"]*">/.test(html)) html = html.replace(/<meta name="src-hash" content="[^"]*">/, meta);
  else html = html.replace(/(<meta name="theme-color"[^>]*>)/, `$1${NL}${meta}`);
  return html;
}

function writeSw(sw, { shell, modules, srcHash }) {
  const a = sw.indexOf(MARK[0]), b = sw.indexOf(MARK[1]);
  if (a < 0 || b < a) throw new Error(`sw.js: markers ${MARK[0]} … ${MARK[1]} not found`);
  const block = [`const SRC_HASH = "${srcHash}";`, "const PRECACHE_LOCAL = [", arrayLines(shell, "  "), "];",
    "const PRECACHE_SRC = [", arrayLines(modules.map(x => `${x.url}?v=${x.hash}`), "  "), "];"].join(NL);
  return sw.slice(0, sw.indexOf(NL, a) + 1) + block + NL + sw.slice(b);
}

// what the two files should be now (LF); the caller keeps a file's line ends
function expected() {
  const L = lists(), lf = f => fs.readFileSync(f, "utf8").split("\r\n").join(NL);
  return { lists: L, index: writeIndex(lf(INDEX), L), sw: writeSw(lf(SW), L) };
}

function run({ check = false } = {}) {
  const e = expected(), stale = [];
  for (const [file, next] of [[INDEX, e.index], [SW, e.sw]]) {
    const text = fs.readFileSync(file, "utf8"), eol = text.includes("\r\n") ? "\r\n" : NL;
    if (text.split("\r\n").join(NL) === next) continue;
    stale.push(path.basename(file));
    if (!check) fs.writeFileSync(file, next.split(NL).join(eol));
  }
  return { stale, srcHash: e.lists.srcHash, modules: e.lists.modules.length };
}

module.exports = { lists, expected, run, writeIndex, writeSw, hashOf, fileHash, MARK, ENTRY };

if (require.main === module) {
  const check = process.argv.includes("--check");
  const r = run({ check });
  if (check && r.stale.length) { console.error(`precache: ${r.stale.join(", ")} out of date — run npm run precache`); process.exit(1); }
  console.log(`precache: ${r.modules} modules, SRC_HASH ${r.srcHash}${r.stale.length ? (check ? "" : " — wrote " + r.stale.join(", ")) : " — up to date"}`);
}
