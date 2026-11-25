// SPEC-025 AC 9: `npm run typecheck` — tsc --noEmit --checkJs (TypeScript, a dev dependency only) over src/: jsconfig.json (the
// whole of src/, basic: the client) and jsconfig.core.json (the core, strict-ish); exit 1 on any type error.
//   node scripts/typecheck.js
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CONFIGS = ["jsconfig.json", "jsconfig.core.json"];

let failed = 0;
for (const cfg of CONFIGS) {
  const r = spawnSync(process.execPath, [path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc"), "--noEmit", "--checkJs", "-p", cfg], { cwd: ROOT, encoding: "utf8" });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  const errors = (out.match(/error TS\d+/g) || []).length;
  if (out) console.log(out);
  console.log(`typecheck ${cfg}: ${r.status === 0 ? "0 errors" : `${errors || "?"} errors (exit ${r.status})`}`);
  if (r.status !== 0) failed++;
}
process.exitCode = failed ? 1 : 0;
