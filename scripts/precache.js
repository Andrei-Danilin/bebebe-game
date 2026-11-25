// SPEC-011 AC 9: `npm run precache` — the module versions of the installed app (Node built-ins only). Run it after any change
// to src/ (and after merging master into a branch): it is the step that replaces a manual SW_VERSION bump for module changes.
// From the one site list (scripts/site.js SITE) it writes
//   index.html: the import map — every module URL "./src/…/x.js" → "./src/…/x.js?v=<hash of its bytes>", so a shell only
//               ever asks for its own module versions (import maps remap the modules' relative imports too); SPEC-025 AC 1:
//               "three" → the vendored "./vendor/three/three.module.js?v=<hash>" and "./vendor/three/three.core.js" (which the
//               module imports) → its own "?v=<hash>" (the files of vendor/three/, see THIRD_PARTY_LICENSES.md);
//               <meta name="src-hash" content="<SRC_HASH>"> — the version of the whole module set;
//               the entry script <script type="module" src="./src/client/main.js?v=<hash>"> — an entry script's src is not
//               remapped by the import map, so its version is written into the tag itself (Phase C);
//   sw.js:      between // precache:start / // precache:end — SRC_HASH, the shell files (PRECACHE_LOCAL) and the versioned
//               module URLs (PRECACHE_SRC) the service worker installs into its "src" cache; THREE_VERSION (r<REVISION> of
//               the vendored build) and PRECACHE_THREE, the versioned vendor URLs of its three.js cache (SPEC-025 AC 1).
// SPEC-025 AC 12: and the versions —
//   src/version.js: `export const VERSION = "<package.json version>"` (written first: it is a module, hashed like the rest);
//   sw.js (same block): SW_VERSION = "bebebe-<version>-b<SW_BUILD>", derived — SW_BUILD is a build counter that goes up by one
//               whenever SW_STRATEGY changes: the hash of sw.js outside its generated blocks (the cache strategy) and of the
//               shell files the src cache keeps besides index.html (the icons, the manifest). So a strategy change or a
//               redrawn icon can't ship under the old SW_VERSION, and a module- or sprite-only change keeps it.
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
const THREE_DIR = "vendor/three";
const THREE_ENTRY = "./vendor/three/three.module.js";
const VERSION_FILE = path.join(ROOT, "src", "version.js");
const SW_BLOCKS = [MARK, ["// assets:start", "// assets:end"]];   // generated: not part of the cache strategy
const TEXT_SHELL = /\.(svg|webmanifest|json)$/;
const hashOf = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 10);
// a module's hash: of its text with LF line ends (a Windows checkout with CRLF gives the same hash as CI and Pages)
const fileHash = f => hashOf(fs.readFileSync(f, "utf8").split("\r\n").join(NL));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = f => "./" + path.relative(ROOT, f).replace(/\\/g, "/");

// The site's files by role: the shell (index.html, the manifest, the icons), the ES modules (every src/**/*.js; not
// src/package.json, which only tells Node the files are modules) and the vendored three.js (vendor/three/*.js, SPEC-025;
// its licence file ships with the site but is not cached). sw.js is the worker itself, assets/ has its own list (npm run
// assets), so neither is here.
function lists() {
  const shell = ["./"], modules = [], three = [], shellFiles = [];
  for (const e of SITE) {
    const p = path.join(ROOT, e);
    if (e === "sw.js" || e === "assets") continue;
    if (e === "vendor") {
      for (const f of walk(p).sort()) if (f.endsWith(".js")) three.push({ url: rel(f), hash: fileHash(f) });
      continue;
    }
    const files = fs.statSync(p).isDirectory() ? walk(p).sort() : [p];
    for (const f of files) {
      if (e === "src") { if (f.endsWith(".js")) modules.push({ url: rel(f), hash: fileHash(f) }); }
      else { shell.push(rel(f)); if (e !== "index.html") shellFiles.push(`${rel(f)} ${shellFileHash(f)}`); }
    }
  }
  modules.sort((x, y) => (x.url < y.url ? -1 : x.url > y.url ? 1 : 0));   // by posix path, the same on every system
  shell.sort((x, y) => (x === "./" ? -1 : y === "./" ? 1 : x < y ? -1 : x > y ? 1 : 0));
  const srcHash = hashOf(modules.map(m => `${m.url} ${m.hash}`).join(NL));
  const shellHash = hashOf(shellFiles.sort().join(NL));
  return { shell, modules, srcHash, three, threeVersion: threeVersion(), version: gameVersion(), shellHash };
}
// a cached shell file's hash: text with LF line ends, binary (the png icons) as bytes
const shellFileHash = f => (TEXT_SHELL.test(f) ? fileHash(f) : crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 10));
// SPEC-025 AC 12: the game version (package.json "version", semver) and the text of src/version.js for it
function gameVersion() {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v || "")) throw new Error(`package.json: version "${v}" is not semver`);
  return v;
}
const versionModule = v => [
  "// SPEC-025 AC 12: the game version, from package.json \"version\" — written by npm run precache (scripts/precache.js), do not",
  "// edit by hand. Shown on the grown-ups page and kept in the error log as <VERSION>+<SRC_HASH> (shared data).",
  `export const VERSION = ${JSON.stringify(v)};`, ""].join(NL);
// the cache strategy of a sw.js text: everything outside its generated blocks
function strategyText(sw) {
  let out = sw;
  for (const [a, b] of SW_BLOCKS) {
    const i = out.indexOf(a), j = out.indexOf(b);
    if (i >= 0 && j > i) out = out.slice(0, out.indexOf(NL, i) + 1) + out.slice(j);
  }
  return out;
}
// the version of the vendored build: "r" + three.js REVISION (in three.core.js); its cache is named by it (sw.js)
function threeVersion() {
  const core = path.join(ROOT, THREE_DIR, "three.core.js");
  const m = fs.existsSync(core) && fs.readFileSync(core, "utf8").match(/\bREVISION\s*=\s*"(\d+)"/);
  if (!m) throw new Error(`${THREE_DIR}/three.core.js: no REVISION`);
  return "r" + m[1];
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

// index.html with the import map and the src-hash meta for these modules (and the vendored three.js)
function writeIndex(html, { modules, srcHash, three }) {
  const re = /<script type="importmap">([\s\S]*?)<\/script>/;
  if (!re.test(html)) throw new Error("index.html: no <script type=\"importmap\">");
  if (!three.some(x => x.url === THREE_ENTRY)) throw new Error(`${THREE_ENTRY} is missing`);
  const entries = [...three.map(x => [x.url === THREE_ENTRY ? "three" : x.url, `${x.url}?v=${x.hash}`]), ...modules.map(x => [x.url, `${x.url}?v=${x.hash}`])];
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

function writeSw(sw, { shell, modules, srcHash, three, threeVersion: tv, version, shellHash }) {
  const a = sw.indexOf(MARK[0]), b = sw.indexOf(MARK[1]);
  if (a < 0 || b < a) throw new Error(`sw.js: markers ${MARK[0]} … ${MARK[1]} not found`);
  // SPEC-025 AC 12: the build counter goes up when the strategy (or a cached shell file) changed since the block was written;
  // the first run continues the hand-bumped "bebebe-v<N>"
  const strategy = hashOf(strategyText(sw) + NL + shellHash);
  const oldStrategy = (sw.match(/const SW_STRATEGY = "([0-9a-f]+)";/) || [])[1];
  const oldBuild = Number((sw.match(/const SW_BUILD = (\d+);/) || sw.match(/const SW_VERSION = "bebebe-v(\d+)";/) || [0, 0])[1]);
  const build = oldStrategy === strategy ? oldBuild : oldBuild + 1;
  const block = [`const SW_BUILD = ${build};`, `const SW_STRATEGY = "${strategy}";`, `const SW_VERSION = "bebebe-${version}-b${build}";`,
    `const SRC_HASH = "${srcHash}";`, "const PRECACHE_LOCAL = [", arrayLines(shell, "  "), "];",
    "const PRECACHE_SRC = [", arrayLines(modules.map(x => `${x.url}?v=${x.hash}`), "  "), "];",
    `const THREE_VERSION = "${tv}";`, "const PRECACHE_THREE = [", arrayLines(three.map(x => `${x.url}?v=${x.hash}`), "  "), "];"].join(NL);
  return sw.slice(0, sw.indexOf(NL, a) + 1) + block + NL + sw.slice(b);
}

// what the files should be now (LF); the caller keeps a file's line ends. src/version.js is one of the modules: a stale one
// (check mode, or before the write) is hashed as it will be written
function expected() {
  const lf = f => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\r\n").join(NL) : "");
  const version = versionModule(gameVersion()), L = lists();
  if (lf(VERSION_FILE) !== version) {
    L.modules = L.modules.filter(x => x.url !== "./src/version.js").concat([{ url: "./src/version.js", hash: hashOf(version) }]);
    L.modules.sort((x, y) => (x.url < y.url ? -1 : x.url > y.url ? 1 : 0));
    L.srcHash = hashOf(L.modules.map(m => `${m.url} ${m.hash}`).join(NL));
  }
  return { lists: L, version, index: writeIndex(lf(INDEX), L), sw: writeSw(lf(SW), L) };
}

function run({ check = false } = {}) {
  const e = expected(), stale = [];
  for (const [file, next] of [[VERSION_FILE, e.version], [INDEX, e.index], [SW, e.sw]]) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", eol = text.includes("\r\n") ? "\r\n" : NL;
    if (text.split("\r\n").join(NL) === next) continue;
    stale.push(path.basename(file));
    if (!check) fs.writeFileSync(file, next.split(NL).join(eol));
  }
  return { stale, srcHash: e.lists.srcHash, modules: e.lists.modules.length };
}

module.exports = { lists, expected, run, writeIndex, writeSw, hashOf, fileHash, threeVersion, gameVersion, versionModule, strategyText, MARK, ENTRY, THREE_ENTRY };

if (require.main === module) {
  const check = process.argv.includes("--check");
  const r = run({ check });
  if (check && r.stale.length) { console.error(`precache: ${r.stale.join(", ")} out of date — run npm run precache`); process.exit(1); }
  console.log(`precache: ${r.modules} modules, SRC_HASH ${r.srcHash}${r.stale.length ? (check ? "" : " — wrote " + r.stale.join(", ")) : " — up to date"}`);
}
