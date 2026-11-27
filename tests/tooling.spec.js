// SPEC-025 phase 3: tooling and release — the checks of the repo itself (no game page).
// - AC 8: ESLint (recommended + the project's rules) over src/, scripts/, tests/; Prettier with today's style (.prettierrc.json)
//   over the files it owns; both in `npm run lint`.
// - AC 9: type checks — jsconfig.json (src/, basic) + jsconfig.core.json (the core, strict-ish), `npm run typecheck`, TypeScript a
//   dev dependency only; JSDoc types of the core's public API and the save schema.
// - AC 10: CI — lint and typecheck jobs beside the shards; the report job checks it got all 4 blob reports; Node pinned to a major;
//   actions pinned by commit SHA; tests.yml also on pull_request.
// - AC 11 / 11b: Dependabot (npm + actions, weekly, grouped, never three) and the master ruleset (no force-push, no deletion, no
//   required checks), both described in CLAUDE.md.
// - AC 12: package.json version = src/version.js; SW_VERSION derived (version + build counter) by npm run precache.
// - AC 13: CHANGELOG.md, the release doc with the rollback runbook, pages.yml's `ref` input, the changelog step in the run templates.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./helpers");

const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const PKG = JSON.parse(read("package.json"));
const WORKFLOWS = fs.readdirSync(path.join(ROOT, ".github", "workflows")).filter(f => f.endsWith(".yml"));
const stripJsonc = t => t.replace(/^\s*\/\/.*$/gm, "");

test("AC 8: ESLint recommended + project rules over src, scripts and tests; Prettier with today's style", { tag: "@fast" }, () => {
  const config = require(path.join(ROOT, "eslint.config.js"));
  const recommended = Object.keys(require("@eslint/js").configs.recommended.rules);
  for (const file of ["src/core/**/*.js", "src/client/**/*.js", "scripts/**/*.js", "tests/**/*.js", "tests/**/*.mjs"]) {
    const block = config.find(c => (c.files || []).includes(file));
    expect(block, `${file} has a lint block`).toBeDefined();
    expect(recommended.filter(r => !(r in block.rules)), `${file}: every recommended rule`).toEqual([]);
    for (const r of ["no-var", "prefer-const", "no-unused-vars", "no-implicit-globals", "no-undef"]) expect(block.rules[r], `${file}: ${r}`).toBeDefined();
  }
  const { ESLINT_TARGETS, PRETTIER } = require(path.join(ROOT, "scripts", "lint.js"));
  expect(ESLINT_TARGETS).toEqual(expect.arrayContaining(["src", "scripts", "tests"]));
  expect(PRETTIER).toEqual(expect.arrayContaining([".github", "CHANGELOG.md", "docs/release.md"]));
  // today's style: double quotes, semicolons, 2 spaces, no trailing commas, long lines
  expect(JSON.parse(read(".prettierrc.json"))).toMatchObject({ singleQuote: false, semi: true, tabWidth: 2, trailingComma: "none", printWidth: 160 });
  expect(PKG.scripts.lint).toBe("node scripts/lint.js");
  expect(PKG.scripts.format).toBe("node scripts/lint.js --format");
  expect(PKG.devDependencies.prettier && PKG.devDependencies["@eslint/js"]).toBeTruthy();
});

test("AC 9: type checks over src (basic) and the core (strict-ish); JSDoc types of the core API and the save schema", { tag: "@fast" }, () => {
  const base = JSON.parse(stripJsonc(read("jsconfig.json"))), core = JSON.parse(stripJsonc(read("jsconfig.core.json")));
  expect(base.compilerOptions).toMatchObject({ checkJs: true, noEmit: true, allowJs: true });
  expect(base.include).toContain("src/**/*.js");
  expect(core.extends).toBe("./jsconfig.json");
  expect(core.compilerOptions.strict, "the core: strict-ish").toBe(true);
  expect(core.include).toContain("src/core/**/*.js");
  // the core is checked without the DOM: ES2022 and only the globals Node and browsers share (the core/browser boundary)
  expect(core.compilerOptions.lib).toEqual(["ES2022"]);
  expect(core.include.filter(f => f.startsWith("types/"))).toEqual(["types/core-globals.d.ts"]);
  expect(read("types/core-globals.d.ts").replace(/\/\/.*$/gm, ""), "no browser global").not.toMatch(/\b(document|window|localStorage|navigator|requestAnimationFrame)\b/);
  expect(PKG.scripts.typecheck).toBe("node scripts/typecheck.js");
  expect(read("scripts/typecheck.js")).toMatch(/--noEmit", "--checkJs"/);
  expect(PKG.devDependencies.typescript, "TypeScript: a dev dependency").toBeTruthy();
  expect(PKG.dependencies, "no runtime dependency").toBeUndefined();
  // the public API of the core and the save schema carry JSDoc types
  const game = read("src/core/game.js");
  for (const t of ["Input", "Stock", "Slot", "GameEvent", "Effect", "GameOptions", "Game"]) expect(game, `@typedef ${t}`).toMatch(new RegExp(`@typedef \\{[\\s\\S]*?\\} ${t}\\b`));
  expect(game).toMatch(/@param \{GameOptions\} \[opts\] @returns \{Game\} \*\/\nexport function createGame/);
  expect(read("src/core/progress-rules.js")).toMatch(/@typedef \{[\s\S]*?\} Progress\b/);
  expect(read("src/client/save.js")).toMatch(/@typedef \{[\s\S]*?\} Save\b/);
});

test("AC 10: lint, typecheck and core jobs beside the shards; all 4 blob reports checked; pinned Node and actions; pull_request", { tag: "@fast" }, () => {
  const tests = read(".github/workflows/tests.yml");
  expect(tests).toMatch(/\n {2}typecheck:\n[\s\S]*?run: npm run typecheck/);
  expect(tests).toMatch(/\n {2}lint:\n[\s\S]*?run: npm run lint/);
  // SPEC-037 AC 2: the Dad stall guard is its own job (a rollback ref without the script skips it: --if-present)
  expect(tests, "the stall guard job").toMatch(/\n {2}stall:\n[\s\S]*?run: npm run test:stall --if-present\n\n {2}test:/);
  expect(PKG.scripts["test:stall"], "the guard has its own script, not in test:core").toMatch(/tests\/stall\//);
  expect(PKG.scripts["test:core"]).not.toMatch(/stall/);
  expect(tests, "PRs (Dependabot) are tested").toMatch(/\non:\n(?: {2}.*\n|\s*#.*\n)*? {2}pull_request:/);
  // RR-83: the report job fails when a shard's blob report is missing
  const report = tests.slice(tests.indexOf("\n  report:"));
  expect(report).toMatch(/blob-report-\*/);
  expect(report).toMatch(/expected 4 blob reports|-ne 4/);
  expect(tests, "retries stay 0 (D-15)").not.toMatch(/--retries/);
  for (const f of WORKFLOWS) {
    const y = read(".github/workflows/" + f);
    const uses = [...y.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map(m => m[1]).filter(u => !u.startsWith("./"));
    expect(uses.filter(u => !/@[0-9a-f]{40}$/.test(u)), `${f}: actions pinned by commit SHA`).toEqual([]);
    const nodes = [...y.matchAll(/node-version:\s*(\S+)/g)].map(m => m[1]);
    expect(nodes.filter(n => !/^"?\d+"?$/.test(n)), `${f}: node-version is a pinned major`).toEqual([]);
  }
  const majors = new Set(WORKFLOWS.flatMap(f => [...read(".github/workflows/" + f).matchAll(/node-version:\s*"?(\d+)"?/g)].map(m => m[1])));
  expect([...majors].length, "one Node major in every workflow").toBe(1);
});

test("AC 11 / 11b: Dependabot (npm + actions, weekly, grouped, never three) and the master ruleset; both in CLAUDE.md", { tag: "@fast" }, () => {
  const dep = read(".github/dependabot.yml");
  for (const eco of ["npm", "github-actions"]) expect(dep).toMatch(new RegExp(`package-ecosystem: "?${eco}"?[\\s\\S]*?interval: "?weekly"?[\\s\\S]*?groups:`));
  expect(dep, "three is bumped only by a spec").toMatch(/ignore:\n\s+- dependency-name: "?three"?/);
  const rs = JSON.parse(read(".github/rulesets/master.json"));
  expect(rs.target).toBe("branch");
  expect(rs.enforcement).toBe("active");
  expect(rs.conditions.ref_name.include).toEqual(["refs/heads/master"]);
  expect(rs.rules.map(r => r.type).sort(), "no force-push, no deletion — and no required checks (the direct merge flow works)").toEqual(["deletion", "non_fast_forward"]);
  expect((dep.match(/update-types: \["minor", "patch"\]/g) || []).length, "groups take minor + patch; a major comes alone").toBe(2);
  const tags = JSON.parse(read(".github/rulesets/tags.json"));
  expect([tags.target, tags.enforcement, tags.conditions.ref_name.include]).toEqual(["tag", "active", ["refs/tags/v*"]]);
  expect(tags.rules.map(r => r.type).sort(), "release tags: no deletion, no move").toEqual(["deletion", "non_fast_forward", "update"]);
  expect(read("docs/release.md")).toMatch(/\.github\/rulesets\/tags\.json/);
  const claude = read("CLAUDE.md");
  expect(claude).toMatch(/\.github\/rulesets\/tags\.json/);
  expect(claude).toMatch(/Dependabot/);
  expect(claude).toMatch(/deps:/);
  expect(claude).toMatch(/\.github\/rulesets\/master\.json/);
});

test("AC 12: package.json version = src/version.js; SW_VERSION = version + build counter, written by npm run precache", { tag: "@fast" }, () => {
  expect(PKG.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  const v = (read("src/version.js").match(/export const VERSION = "([^"]+)";/) || [])[1];
  expect(v, "src/version.js = package.json version").toBe(PKG.version);
  const precache = require(path.join(ROOT, "scripts", "precache.js"));
  const sw = read("sw.js").split("\r\n").join("\n");
  const swVersion = (sw.match(/const SW_VERSION = "([^"]+)";/) || [])[1], build = Number((sw.match(/const SW_BUILD = (\d+);/) || [])[1]);
  expect(swVersion, "SW_VERSION = bebebe-<version>-b<build>").toBe(`bebebe-${PKG.version}-b${build}`);
  // the SW_VERSION line sits inside the block npm run precache writes (no hand bump)
  const block = sw.slice(sw.indexOf(precache.MARK[0]), sw.indexOf(precache.MARK[1]));
  expect(block).toContain("const SW_VERSION = ");
  // a forgotten bump can't happen: a strategy change (sw.js outside its generated blocks) or a changed shell file (an icon)
  // gives the next build; a module-only change or a rerun gives the same
  const L = precache.lists(), same = precache.writeSw(sw, L);
  expect(same, "the committed sw.js is what npm run precache writes").toBe(sw);
  const strategy = precache.writeSw(sw.replace("const KEEP = 2;", "const KEEP = 3;"), L);
  expect((strategy.match(/const SW_BUILD = (\d+);/) || [])[1], "a strategy change → next build").toBe(String(build + 1));
  expect(strategy).toContain(`const SW_VERSION = "bebebe-${PKG.version}-b${build + 1}";`);
  const icon = precache.writeSw(sw, { ...L, shellHash: "changed-icon" });
  expect((icon.match(/const SW_BUILD = (\d+);/) || [])[1], "a changed icon → next build").toBe(String(build + 1));
  const mod = precache.writeSw(sw, { ...L, srcHash: "0123456789" });
  expect((mod.match(/const SW_VERSION = "([^"]+)";/) || [])[1], "a module change: same SW_VERSION").toBe(swVersion);
  const next = precache.writeSw(sw, { ...L, version: "9.9.9" });
  expect((next.match(/const SW_VERSION = "([^"]+)";/) || [])[1], "a new version → new SW_VERSION").toBe(`bebebe-9.9.9-b${build}`);
  // hard rule 8 says so
  expect(read("CLAUDE.md")).toMatch(/SW_VERSION[^\n]*derived/);
});

test("AC 13: CHANGELOG, the release doc with the rollback runbook, pages.yml ref input, the changelog step of every run template", { tag: "@fast" }, () => {
  const log = read("CHANGELOG.md");
  expect(log).toMatch(/Keep a Changelog/);
  expect(log).toMatch(/^## \[Unreleased\]/m);
  expect(log.length, "what is in the game today, in plain words").toBeGreaterThan(1500);
  const rel = read("docs/release.md");
  for (const s of [/npm run release/, /git tag -a v/, /## Rollback/, /version\.txt/, /workflow_dispatch|gh workflow run pages\.yml/, /-f ref=v/, /git revert/, /D-7/, /before Phase 2|before phase 2/i, /coins/, /only one pending run/, /push nothing to\s+`master`/, /download all the modules and all the sprites/]) expect(rel).toMatch(s);
  const pages = read(".github/workflows/pages.yml");
  expect(pages).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+ref:/);
  // the ref is resolved to one sha once (a job of its own); tests, build and the live check use that sha only
  expect(pages).toMatch(/\n {2}resolve:\n[\s\S]*?ref: \$\{\{ inputs\.ref \|\| github\.sha \}\}[\s\S]*?git rev-parse HEAD/);
  expect(pages.split("${{ needs.resolve.outputs.sha }}").length - 1, "test, build checkout, stamp, outputs, live check").toBeGreaterThanOrEqual(5);
  expect(pages.match(/\$\{\{ inputs\.ref/g) || [], "inputs.ref is read only by the resolve job").toHaveLength(1);
  expect(pages).toMatch(/\n {2}test:\n {4}needs: resolve\n[\s\S]*?ref: \$\{\{ needs\.resolve\.outputs\.sha \}\}/);
  expect(read(".github/workflows/tests.yml"), "a rollback ref from before phase 3 still runs").toMatch(/run: npm run typecheck --if-present/);
  expect(read(".github/workflows/tests.yml"), "tests.yml takes the ref from pages.yml").toMatch(/workflow_call:\n\s+inputs:\n\s+ref:/);
  expect(PKG.scripts.release).toBe("node scripts/release.js");
  for (const t of ["RUN_S.md", "RUN_M.md", "RUN_L.md"]) expect(read("docs/process/run-templates/" + t), `${t}: the changelog line at the close`).toMatch(/CHANGELOG\.md/);
  expect(exists("THIRD_PARTY_LICENSES.md")).toBe(true);
});

test("AC 13: npm run release — moveUnreleased, and nothing written for a bad version or a dirty tree", { tag: "@fast" }, () => {
  const { moveUnreleased, release } = require(path.join(ROOT, "scripts", "release.js"));
  const log = "# Changelog\n\nintro\n\n## [Unreleased]\n\n### Added\n\n- a thing\n\n## [1.0.0] - 2026-01-01\n\n- old\n";
  expect(moveUnreleased(log, "1.1.0", "2026-12-01")).toBe("# Changelog\n\nintro\n\n## [Unreleased]\n\n## [1.1.0] - 2026-12-01\n\n### Added\n\n- a thing\n\n## [1.0.0] - 2026-01-01\n\n- old\n");
  expect(moveUnreleased("## [Unreleased]\n\n- only\n", "2.0.0", "2026-12-01"), "the last section").toBe("## [Unreleased]\n\n## [2.0.0] - 2026-12-01\n\n- only\n");
  expect(() => moveUnreleased("## [Unreleased]\n\n## [1.0.0] - x\n", "1.1.0", "d"), "nothing to release").toThrow(/nothing under Unreleased/);
  expect(() => moveUnreleased("# no heading\n", "1.1.0", "d")).toThrow(/no "## \[Unreleased\]"/);
  const before = [read("package.json"), read("CHANGELOG.md")];
  for (const bad of ["1.0", "v1.0.0", "1.0.0.0", "", undefined]) expect(() => release(bad, { dry: true }), `"${bad}"`).toThrow(/not a semver version/);
  expect(() => release("9.9.9", { status: () => " M src/client/main.js\n" }), "a dirty tree").toThrow(/not clean/);
  expect(release("9.9.9", { dry: true })).toMatchObject({ to: "9.9.9", changelog: true });
  expect(release("9.9.9-dev", { dry: true }), "a pre-release leaves the changelog alone").toMatchObject({ changelog: false });
  expect([read("package.json"), read("CHANGELOG.md")], "nothing written").toEqual(before);
});
