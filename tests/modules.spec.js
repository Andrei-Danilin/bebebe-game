// SPEC-011: index.html split into ES modules (core / client). The checks of the module layout and of what must stay the
// same through the move. Phase A: the __bb surface (AC 5c), service workers blocked (8b), the import map (1b), the lint config (11b);
// later phases add the layout, dependency and Node checks.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { openGame, ROOT } = require("./helpers");

// AC 5c: the keys of window.__bb and their kind (getter / getter+setter / function / value, from the property descriptor),
// recorded before any code moved (tests/fixtures/bb-keys.json). Tests drive the game through __bb (hard rule 6) and write
// through its setters (`__bb.mode = x`): a key may be added, none may disappear, a getter must not become a copied value,
// a getter+setter must keep its setter, a function stays a function (a value may become a getter: a live binding).
// A spec that adds keys may add them to the fixture.
const BB_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "bb-keys.json"), "utf8"));
const bbKinds = () => {                       // runs in the page: descriptors only, no getter runs (sim throws on drawn state)
  const b = window.__bb, out = {};
  for (const k of Object.keys(b)) {
    const d = Object.getOwnPropertyDescriptor(b, k);
    out[k] = d.get ? (d.set ? "getter+setter" : "getter") : typeof d.value === "function" ? "function" : "value";
  }
  return out;
};
// what a recorded kind may be now
const KIND_OK = { "getter+setter": ["getter+setter"], getter: ["getter", "getter+setter"], function: ["function"], value: ["value", "getter", "getter+setter"] };
test("the __bb surface is unchanged", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const now = await page.evaluate(bbKinds);
  expect(Object.keys(BB_KEYS).length, "the recorded list is not empty").toBeGreaterThan(150);
  const bad = Object.entries(BB_KEYS).filter(([k, kind]) => !KIND_OK[kind].includes(now[k])).map(([k, kind]) => `${k}: was ${kind}, now ${now[k] || "gone"}`);
  expect(bad, "__bb keys removed or weakened since the recorded list").toEqual([]);
  expect(errors).toEqual([]);
});

// AC 8b: over http the game registers sw.js; playwright.config.js blocks service workers for every spec but pwa.spec.js,
// also in the contexts the shared-page fixtures make with browser.newContext()
test("service workers are blocked outside the PWA tests", async ({ page, browser }) => {
  const registrations = p => p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  const errors = await openGame(page, { sim: true });
  const ctx = await browser.newContext(), other = await ctx.newPage();
  try {
    const more = await openGame(other, { sim: true });
    await page.waitForTimeout(500);
    expect([await registrations(page), await registrations(other)]).toEqual([0, 0]);
    expect(page.url().startsWith("http://"), "the game is opened over http").toBe(true);
    expect([...errors, ...more]).toEqual([]);
  } finally { await ctx.close(); }
});

// AC 1b: the game imports the bare name "three"; one <script type="importmap"> in index.html says where it comes from (today
// jsDelivr, the same URL as sw.js THREE_BASE; SPEC-025 points it at vendor/three/). No game code names the CDN URL.
const INDEX = path.join(ROOT, "index.html");
const srcFiles = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? srcFiles(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []);
test("three.js comes from the import map only", { tag: "@fast" }, () => {
  const html = fs.readFileSync(INDEX, "utf8"), sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  expect(maps.length, "one import map").toBe(1);
  const map = JSON.parse(maps[0][1]), base = (sw.match(/const THREE_BASE\s*=\s*"([^"]+)"/) || [])[1];
  expect(map.imports.three, "the import map's three = sw.js THREE_BASE + three.module.js").toBe(base + "three.module.js");
  expect(html.indexOf("<script type=\"importmap\">"), "the import map comes before the module script").toBeLessThan(html.indexOf("<script type=\"module\""));
  // every piece of game code without the import map: the inline module(s) and, from Phase B on, src/**
  const code = [["index.html", html.replace(maps[0][0], "")], ...srcFiles(path.join(ROOT, "src")).map(f => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")])];
  const bad = [];
  for (const [name, text] of code) {
    if (text.includes("cdn.jsdelivr.net")) bad.push(`${name}: names cdn.jsdelivr.net`);
    for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) if (/^https?:/.test(m[1]) || /(^|\/)three(\.module)?\.js$/.test(m[1])) bad.push(`${name}: imports ${m[1]}`);
  }
  expect(bad).toEqual([]);
  expect(code.some(([, text]) => /\bimport \* as THREE from "three";/.test(text)), "the game imports the bare name (index.html or src/**)").toBe(true);
});

// AC 11b: `npm run lint` (scripts/lint.js, eslint.config.js) — the minimal rule set on every block, no browser-only globals
// for the core (it runs in Node; AC 3), browser globals for the client and the inline module, the local imports check for
// module code, and a lint job in every Tests run
const BROWSER_ONLY = ["document", "window", "localStorage", "navigator", "requestAnimationFrame", "Audio", "AudioContext", "globalThis"];
test("lint config covers src/", { tag: "@fast" }, () => {
  const config = require(path.join(ROOT, "eslint.config.js"));
  const block = file => config.find(c => (c.files || []).includes(file));
  const core = block("src/core/**/*.js"), client = block("src/client/**/*.js");
  expect(!!core && !!client, "a src/core and a src/client block").toBe(true);
  for (const f of ["src/i18n.js", "src/story.js"]) expect(block(f), `${f} is linted like the core`).toBe(core);
  // the inline module is linted like the client while index.html still has one (Phase C empties the shell)
  if (/<script type="module">/.test(fs.readFileSync(INDEX, "utf8"))) expect(client.files, "the inline module is linted like the client").toContain(".lint-index.mjs");
  expect(BROWSER_ONLY.filter(g => g in core.languageOptions.globals), "browser-only globals allowed in the core").toEqual([]);
  // globalThis is an ES built-in ESLint always knows: no-restricted-globals bans it (and the rest) in the core
  const banned = (core.rules["no-restricted-globals"] || []).slice(1).map(g => (typeof g === "string" ? g : g.name));
  expect(BROWSER_ONLY.filter(g => !banned.includes(g)), "browser-only globals not banned in the core").toEqual([]);
  expect(core.languageOptions.globals.console, "the core may log (globals Node and browsers share)").toBeDefined();
  expect(client.languageOptions.globals.document, "the client gets browser globals").toBeDefined();
  for (const c of [core, client]) {
    expect(c.languageOptions.sourceType).toBe("module");
    for (const r of ["no-undef", "no-unused-vars", "no-var", "prefer-const", "no-import-assign", "local/imports"]) expect(c.rules[r], r).toBeDefined();
  }
  expect(block("scripts/**/*.js"), "the scripts are linted").toBeDefined();
  const lint = fs.readFileSync(path.join(ROOT, "scripts", "lint.js"), "utf8");
  expect(lint, "lint.js lints src/ once it exists").toContain("\"src\"");
  expect(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts.lint).toBe("node scripts/lint.js");
  expect(fs.readFileSync(path.join(ROOT, ".github", "workflows", "tests.yml"), "utf8"), "every Tests run lints").toMatch(/run: npm run lint/);
});
