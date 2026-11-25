// SPEC-011 AC 11b: `npm run lint` — ESLint (eslint.config.js) over the game code and the scripts; exit 1 on any error.
// The game's inline module(s) in index.html (Phase A: the whole game) are extracted to .lint-index.mjs (gitignored) with
// blank lines in front, so a reported line is the line in index.html; src/** is linted once it exists (Phase B).
//   node scripts/lint.js
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

const ROOT = path.resolve(__dirname, "..");
const INLINE = path.join(ROOT, ".lint-index.mjs");

// every <script type="module"> without src, at its own line numbers (other lines blank)
function inlineModules(html) {
  const lines = html.split(/\r?\n/), out = lines.map(() => "");
  let inside = false;
  lines.forEach((l, i) => {
    if (!inside && /<script type="module">/.test(l) && !/\bsrc=/.test(l)) { inside = true; return; }
    if (inside && /<\/script>/.test(l)) { inside = false; return; }
    if (inside) out[i] = l;
  });
  return out.join("\n");
}

async function main() {
  fs.writeFileSync(INLINE, inlineModules(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")));
  try {
    const targets = [INLINE, "scripts", "eslint.config.js", ...(fs.existsSync(path.join(ROOT, "src")) ? ["src"] : [])];
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles(targets);
    for (const r of results) if (r.filePath === INLINE) r.filePath = path.join(ROOT, "index.html");   // report index.html lines
    const text = (await eslint.loadFormatter("stylish")).format(results);
    const errors = results.reduce((s, r) => s + r.errorCount, 0), warnings = results.reduce((s, r) => s + r.warningCount, 0);
    if (text) console.log(text);
    console.log(`lint: ${results.length} files, ${errors} errors, ${warnings} warnings`);
    process.exitCode = errors ? 1 : 0;
  } finally { fs.rmSync(INLINE, { force: true }); }
}

main().catch(e => { console.error(e); process.exit(2); });
