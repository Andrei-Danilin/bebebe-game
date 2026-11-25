// SPEC-011 AC 11b: minimal ESLint — `npm run lint` (scripts/lint.js). Only the rules that catch a forgotten import or name
// before a child hits it, plus the code style of hard rule 4; SPEC-025 extends the set (and adds Prettier, type checks).
// - src/core/** (+ the shared src/i18n.js, src/story.js): only the globals Node and browsers share (console, performance, …)
//   without the browser-only ones (CORE_FORBIDDEN, also banned by no-restricted-globals) — the core runs in Node too (AC 3);
// - src/client/**: browser globals (the inline module of index.html is gone since Phase C);
// - scripts/**: Node (CommonJS).
// The local "imports" rule (scripts/eslint-imports.js) checks that relative imports resolve and export what is imported.
const globals = require("globals");
const local = require("./scripts/eslint-imports.js");

const RULES = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],   // const { a, ...rest } = o: a is dropped on purpose
  "no-var": "error",
  "prefer-const": ["error", { destructuring: "all" }],
  "no-import-assign": "error"          // the live-bindings rule (AC 5): another module's `let` is changed through its setter
};
const MODULE = { ecmaVersion: "latest", sourceType: "module" };
// SPEC-011 AC 3: what the core never touches (globalThis counts as window). Node 22+ also has localStorage and navigator,
// so they are taken out of the shared set too.
const CORE_FORBIDDEN = ["document", "window", "localStorage", "sessionStorage", "navigator", "requestAnimationFrame", "Audio", "AudioContext", "globalThis", "self"];
const CORE_GLOBALS = Object.fromEntries(Object.entries(globals["shared-node-browser"]).filter(([k]) => !CORE_FORBIDDEN.includes(k)));

module.exports = [
  { ignores: ["node_modules/**", "v1-2d/**", "vendor/**", "_site/**", "test-results/**", "playwright-report/**", "assets/**", "art/**", "icons/**"] },
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
  // Node scripts (and this config)
  {
    files: ["scripts/**/*.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: { ...globals.node } },
    rules: RULES
  }
];
