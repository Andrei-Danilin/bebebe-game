// SPEC-013 AC 1 (guard test): src/core/ — and the two shared data files it imports, src/i18n.js and src/story.js — is bundled by wrangler into
// the Worker, so it must stay free of the DOM and of Node-only APIs. The ESLint config already bans the browser globals in the core
// (tests/modules.spec.js reads it); this scan adds what ESLint does not: Node's `process`, `require`, `node:` and `fs`-like imports, bare
// package imports and JSON imports (none of which the bundle can resolve the way Node does), and the page's `window` / `document` /
// `localStorage` as property reads too. Comments and string contents are ignored.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = [...walk(path.join(ROOT, "src", "core")).filter(f => f.endsWith(".js")), path.join(ROOT, "src", "i18n.js"), path.join(ROOT, "src", "story.js")];
const rel = f => path.relative(ROOT, f).replace(/\\/g, "/");
// code without comments and string contents (an import path is read from the raw text below)
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "\"\"");

// what must not appear as code
const FORBIDDEN = [
  [/(?<![.\w$])window\b/, "window"], [/(?<![.\w$])document\b/, "document"], [/(?<![.\w$])localStorage\b/, "localStorage"],
  [/(?<![.\w$])sessionStorage\b/, "sessionStorage"], [/(?<![.\w$])navigator\b/, "navigator"],
  [/(?<![.\w$])process\./, "process."], [/(?<![.\w$])require\s*\(/, "require("], [/(?<![.\w$])__dirname\b|(?<![.\w$])__filename\b/, "__dirname"],
  [/(?<![.\w$])Buffer\b/, "Buffer"], [/(?<![.\w$])module\.exports\b/, "module.exports"]
];
// every import path: relative and a .js file (no node:, no bare package, no .json)
const IMPORT = /(?:^|\n)\s*(?:import|export)\b[^"'`\n]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

test("the scan finds the core's files", () => {
  assert.ok(files.length > 40, `${files.length} files`);
  assert.ok(files.map(rel).includes("src/core/config.js") && files.map(rel).includes("src/i18n.js"));
});

test("src/core (+ i18n, story) has no DOM and no Node-only APIs", () => {
  const found = [];
  for (const f of files) {
    const code = strip(readFileSync(f, "utf8"));
    for (const [re, name] of FORBIDDEN) if (re.test(code)) found.push(`${rel(f)}: ${name}`);
  }
  assert.deepEqual(found, []);
});

test("src/core (+ i18n, story) imports only its own relative .js files (bundleable by wrangler)", () => {
  const found = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/.*(?=\n)/g, "$1");
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec.startsWith(".") || !spec.endsWith(".js")) found.push(`${rel(f)}: imports "${spec}"`);
      else if (!path.resolve(path.dirname(f), spec).startsWith(path.join(ROOT, "src") + path.sep)) found.push(`${rel(f)}: imports "${spec}" from outside src/`);
      else if (/\/client\//.test(path.resolve(path.dirname(f), spec).replace(/\\/g, "/"))) found.push(`${rel(f)}: imports the client "${spec}"`);
    }
  }
  assert.deepEqual(found, []);
});

test("the guard sees what it guards against", () => {
  for (const [code, name] of [["const w = window.innerWidth;", "window"], ["const x = process.env.X;", "process."], ["const fs = require(\"fs\");", "require("], ["localStorage.getItem(1)", "localStorage"]])
    assert.ok(FORBIDDEN.some(([re, n]) => n === name && re.test(strip(code))), name);
  assert.ok(!FORBIDDEN.some(([re]) => re.test(strip("// window and process.env in a comment\nconst s = \"document\"; o.window; o.process.env;"))), "comments, strings and properties are fine");
  const specs = s => [...s.matchAll(IMPORT)].map(m => m[1] ?? m[2] ?? m[3]);
  assert.deepEqual(specs("import fs from \"node:fs\";\nimport { a } from \"./a.js\";\nexport * from \"../b.js\";\nimport \"./side.js\";\nconst z = await import(\"three\");"), ["node:fs", "./a.js", "../b.js", "./side.js", "three"]);
});

// the real thing: the whole core (src/core/index.js, the file the Room will import) goes through esbuild — wrangler's own bundler — as a worker
// bundle would take it: no Node platform, so a Node-only import or an unresolvable specifier fails here. Needs online/node_modules (npm ci --prefix online)
const ESBUILD = path.join(ROOT, "online", "node_modules", "esbuild", "bin", "esbuild");
test("the whole core bundles for a Worker with esbuild (platform neutral)", { skip: !existsSync(ESBUILD) && "online/node_modules is not installed" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bebebe-core-bundle-")), out = path.join(dir, "core.js");
  try {
    execFileSync(process.execPath, [ESBUILD, path.join(ROOT, "src", "core", "index.js"), "--bundle", "--format=esm", "--platform=neutral", "--log-level=error", `--outfile=${out}`], { stdio: "pipe" });
    assert.ok(statSync(out).size > 100_000, "the bundle holds the core");
    assert.ok(/createGame/.test(readFileSync(out, "utf8")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
