// SPEC-011 AC 11b / SPEC-025 AC 8: `npm run lint` — ESLint (eslint.config.js) over the game code (src/: the core, the shared
// data, the client), the scripts and the tests, then Prettier's check (.prettierrc.json: the project style as it is today) over
// the files Prettier formats (PRETTIER below); exit 1 on any error. index.html is only the shell since Phase C (no inline game
// code: a test checks it), so there is nothing to extract from it any more.
// Prettier owns the formatting of the workflows, the configs and the release docs. The hand-packed JS of src/, scripts/ and
// tests/ is not reformatted (SPEC-025 AC 8: no mass reformat; ESLint carries its style rules) — BACKLOG "Prettier over the JS".
//   node scripts/lint.js            ESLint + the Prettier check
//   node scripts/lint.js --format   write Prettier's format into the PRETTIER files (npm run format)
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

const ROOT = path.resolve(__dirname, "..");
const ESLINT_TARGETS = ["src", "scripts", "tests", "eslint.config.js", "playwright.config.js"];
// files and folders (every .yml / .json / .md inside) Prettier formats
const PRETTIER = [".github", "jsconfig.json", "jsconfig.core.json", ".prettierrc.json", "package.json", "CHANGELOG.md", "docs/release.md"];
const PRETTIER_EXT = /\.(ya?ml|json|md)$/;

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const prettierFiles = () => PRETTIER.map(p => path.join(ROOT, p)).filter(p => fs.existsSync(p))
  .flatMap(p => (fs.statSync(p).isDirectory() ? walk(p).filter(f => PRETTIER_EXT.test(f)) : [p])).sort();

async function prettier(write) {
  const pr = require("prettier"), bad = [];
  for (const f of prettierFiles()) {
    const text = fs.readFileSync(f, "utf8"), options = { ...(await pr.resolveConfig(f)), filepath: f };
    if (await pr.check(text, options)) continue;
    if (write) fs.writeFileSync(f, await pr.format(text, options));
    else bad.push(path.relative(ROOT, f).replace(/\\/g, "/"));
  }
  return bad;
}

async function main() {
  if (process.argv.includes("--format")) { await prettier(true); console.log("format: written"); return; }
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(ESLINT_TARGETS);
  const text = (await eslint.loadFormatter("stylish")).format(results);
  const errors = results.reduce((s, r) => s + r.errorCount, 0), warnings = results.reduce((s, r) => s + r.warningCount, 0);
  if (text) console.log(text);
  console.log(`lint: ${results.length} files, ${errors} errors, ${warnings} warnings`);
  const bad = await prettier(false);
  for (const f of bad) console.log(`prettier: ${f} is not formatted (npm run format)`);
  console.log(`prettier: ${prettierFiles().length} files, ${bad.length} not formatted`);
  process.exitCode = errors || bad.length ? 1 : 0;
}

module.exports = { ESLINT_TARGETS, PRETTIER, prettierFiles };

if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });
