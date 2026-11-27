// SPEC-011 AC 11b: ESLint — `npm run lint` (scripts/lint.js). SPEC-025 AC 8: ESLint's recommended rules plus the project's
// own (hard rule 4: no `var`, `prefer-const`; no unused vars; no implicit globals; the live-bindings rule), over src/, scripts/
// and tests/. Formatting is Prettier's (.prettierrc.json): `npm run lint` also checks it, `npm run format` writes it.
// - src/core/** (+ the shared src/i18n.js, src/story.js): only the globals Node and browsers share (console,
//   performance, …) without the browser-only ones (CORE_FORBIDDEN, also banned by no-restricted-globals) — the core runs in
//   Node too (SPEC-011 AC 3);
// - src/client/**: browser globals;
// - scripts/** and the configs: Node (CommonJS);
// - tests/**: Node (CommonJS) + browser globals (the bodies of page.evaluate run in the page); tests/core/*.mjs: Node modules.
// The local "imports" rule (scripts/eslint-imports.js) checks that relative imports resolve and export what is imported.
const js = require("@eslint/js");
const globals = require("globals");
const local = require("./scripts/eslint-imports.js");

const RULES = {
  ...js.configs.recommended.rules,
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],   // const { a, ...rest } = o: a is dropped on purpose
  "no-var": "error",
  "prefer-const": ["error", { destructuring: "all" }],
  "no-implicit-globals": "error",
  "no-import-assign": "error"          // the live-bindings rule (SPEC-011 AC 5): another module's `let` is changed through its setter
};
const MODULE = { ecmaVersion: "latest", sourceType: "module" };
const COMMONJS = { ecmaVersion: "latest", sourceType: "commonjs" };
// SPEC-011 AC 3: what the core never touches (globalThis counts as window). Node 22+ also has localStorage and navigator,
// so they are taken out of the shared set too.
const CORE_FORBIDDEN = ["document", "window", "localStorage", "sessionStorage", "navigator", "requestAnimationFrame", "Audio", "AudioContext", "globalThis", "self"];
const CORE_GLOBALS = Object.fromEntries(Object.entries(globals["shared-node-browser"]).filter(([k]) => !CORE_FORBIDDEN.includes(k)));

module.exports = [
  { ignores: ["node_modules/**", "v1-2d/**", "vendor/**", "_site/**", "test-results/**", "playwright-report/**", "blob-report/**", "assets/**", "art/**", "icons/**", "types/**"] },
  // the core: no browser-only and no Node-only globals
  {
    files: ["src/core/**/*.js", "src/i18n.js", "src/story.js"],
    languageOptions: { ...MODULE, globals: CORE_GLOBALS },
    plugins: { local },
    rules: { ...RULES, "local/imports": "error", "no-restricted-globals": ["error", ...CORE_FORBIDDEN] }
  },
  // the client
  {
    files: ["src/client/**/*.js"],
    languageOptions: { ...MODULE, globals: { ...globals.browser } },
    plugins: { local },
    rules: { ...RULES, "local/imports": "error" }
  },
  // Node scripts (and the configs)
  {
    files: ["scripts/**/*.js", "eslint.config.js", "playwright.config.js"],
    languageOptions: { ...COMMONJS, globals: { ...globals.node } },
    rules: RULES
  },
  // Playwright tests and their helpers: Node, and the page's globals inside page.evaluate / addInitScript bodies
  {
    files: ["tests/**/*.js"],
    languageOptions: { ...COMMONJS, globals: { ...globals.node, ...globals.browser } },
    rules: RULES
  },
  // the core's Node tests (SPEC-012: node --test)
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { ...MODULE, globals: { ...globals.node } },
    rules: RULES
  }
];
