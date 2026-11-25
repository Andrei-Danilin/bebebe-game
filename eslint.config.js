// SPEC-011 AC 11b: minimal ESLint — `npm run lint` (scripts/lint.js). Only the rules that catch a forgotten import or name
// before a child hits it, plus the code style of hard rule 4; SPEC-025 extends the set (and adds Prettier, type checks).
// - src/core/** (+ the shared src/i18n.js, src/story.js): no globals at all — the core runs in Node too (SPEC-011 AC 3);
// - src/client/** and the inline module of index.html (extracted to .lint-index.mjs by scripts/lint.js): browser globals;
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

module.exports = [
  { ignores: ["node_modules/**", "v1-2d/**", "_site/**", "test-results/**", "playwright-report/**", "assets/**", "art/**", "icons/**"] },
  // the core: no browser, no Node globals
  {
    files: ["src/core/**/*.js", "src/i18n.js", "src/story.js"],
    languageOptions: { ...MODULE, globals: {} },
    plugins: { local },
    rules: { ...RULES, "local/imports": "error" }
  },
  // the client and the inline module (Phase A: the whole game)
  {
    files: ["src/client/**/*.js", ".lint-index.mjs"],
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
