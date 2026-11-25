// SPEC-011 AC 11b: `npm run lint` — ESLint (eslint.config.js) over the game code (src/: the core, the shared data, the client)
// and the scripts; exit 1 on any error. index.html is only the shell since Phase C (no inline game code: a test checks it),
// so there is nothing to extract from it any more.
//   node scripts/lint.js
const path = require("path");
const { ESLint } = require("eslint");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const targets = ["src", "scripts", "eslint.config.js"];
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(targets);
  const text = (await eslint.loadFormatter("stylish")).format(results);
  const errors = results.reduce((s, r) => s + r.errorCount, 0), warnings = results.reduce((s, r) => s + r.warningCount, 0);
  if (text) console.log(text);
  console.log(`lint: ${results.length} files, ${errors} errors, ${warnings} warnings`);
  process.exitCode = errors ? 1 : 0;
}

main().catch(e => { console.error(e); process.exit(2); });
