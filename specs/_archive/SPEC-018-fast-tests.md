# SPEC-018 — Faster tests and a faster implementer loop

Status: done (32faffb)
Complexity: M
Branch: SPEC-018-fast-tests
Decided by: Andrei (2026-11-23, in the Claude Code chat): the runs take too long; after SPEC-010, before SPEC-008/009, do a round that makes the tests and the implementer loop faster. Outline agreed in that chat; details (targets, which cases to trim, worker count, tags): Claude (spec author).

## Description
No player-visible change. The Playwright suite grew from ~10 min to 22–31 min locally (155 tests, `workers: 1`, software WebGL), and each spec run spends most of its time waiting for tests. After this spec the whole suite runs in ≤ 10 min locally (≤ 12 min on CI) with the same coverage, implementers work against a ~3 min fast set, and the known flaky tests are deterministic.

## Goal
- Whole suite ≤ 10 min locally on Andrei's machine, ≤ 12 min in the Pages workflow; no lost coverage (every removed or merged case is replaced by one that catches the same bug).
- A tagged fast set (`@fast`, ≤ 3 min) that the implementer runs while working, plus the touched files.
- Zero known flaky tests (each listed one passes `--repeat-each=5`).

## Context
- `playwright.config.js`: `workers: 1`, `retries: 0`, `timeout: 90_000`; `webServer` = `scripts/serve.js` for the PWA tests; tests use SwiftShader (software WebGL); `step(page, s)` advances logic only.
- Slowest files (last runs): `phone.spec.js` 6–9 min, `gameplay.spec.js` ~6 min, `levels.spec.js` (80-level checks).
- Known time sinks (found during SPEC-006/007/010):
  - `page.evaluate(() => Object.assign(littles[i], …))` returns the Little object, so Playwright serializes it with its 3D parts: ~20 s per call under touch. Fixed in the SPEC-007 tests, older tests still have it.
  - Teleports (moving the Big One / a bot far) cost a ~15 s GPU stall in SwiftShader on the next frame (comment in the edge-arrows test).
  - Layout matrices: the phone banner (3 sizes × 4 worlds × 2 levels × 3 languages × 2 positions × 2 font scales), the phone shop (3 sizes × 3 languages × 2 coin amounts × 3 scales), "every phone button is big enough" (3 sizes, 667 in 3 languages).
- Known flaky (failed once or more, passed on rerun): phone "the camera follows the hero and stops at the map edges" (under load), phone "mini-map shows the level and everyone on it" (CI, fixed in SPEC-010), phone "edge arrows point…" (fixed in SPEC-010).
- One local run crashed with Chromium "Target crashed" / 0xC0000142 (resource exhaustion).
- `specs/BACKLOG.md`: "Make the test suite fast again" and the test-speed lead.

## Out of scope
- Any change to game behaviour, rules, CFG game values, texts or layout (tests only, plus test-only hooks if needed, plus process docs).
- Moving off SwiftShader / changing the CI image; splitting `index.html`.

## Acceptance criteria
1. **Measured first.** A JSON-reporter run lists every test's duration; `reports/test-times.md` (committed) shows the 20 slowest tests before and after, and the whole-suite time before and after (local and CI). → the report file
2. **Serialization sink gone.** No test `page.evaluate` returns a game object (Little, Big One, items, scene objects): bodies that only mutate are wrapped in braces or return plain data. A cheap guard test scans `tests/*.js` for `evaluate(() => Object.assign(` without braces. → `tests/smoke.spec.js` "tests never return game objects from evaluate"
3. **Fewer stalls and page loads.** Tests that teleport repeatedly or reload per case share one page per file/describe where it is safe (state reset through `__bb`, `clearLevelCache()`, `CFG` restored), and avoid needless teleports (place things before the first frame or step logic only). Each change keeps the test's assertions.
4. **Trimmed matrices with the same bug-catching power.** The phone layout matrices keep every case that ever failed (the CI banner case park 1 en ×1.15 at 667, the es shop at 667 ×1.15, the longest type texts, all three sizes) and drop redundant combinations (e.g. not every language at every size when one language is the longest at that size); a written note per matrix says what is kept and why. The 80-level fairness/fixture checks stay complete but run in one page.
5. **Workers.** Try `workers: 2` locally and on CI. Keep it only if the whole suite is green twice in a row with it and no "Target crashed"; otherwise stay at 1 and record why in the report. If tests share state that blocks parallel runs (the `webServer`, localStorage), fix it or mark those files serial.
6. **Fast set.** Tag ≤ 3 min of tests `@fast` (one per area: smoke load, core rules pinned by the kids, save/migration, shop buy, phone layout at one size, i18n, levels determinism sample). `npm run test:fast` runs them. → the script and its time in the report
7. **No flaky tests.** Each known flaky test is made deterministic (pin moving bots and the Big One, step logic instead of real frames where the assertion is about logic) and passes `--repeat-each=5`.
8. **Process docs.** `docs/process/orchestration-rules.md` §2 and the run templates: implementers run `npm run test:fast` + the touched files while working; the whole suite once per spec before the merge; CI checks `master`. `CLAUDE.md` Commands and the suite time updated.
9. **Targets met:** whole suite ≤ 10 min locally and ≤ 12 min on CI (Pages workflow test job), fast set ≤ 3 min; the whole suite green. If a target is missed, the report says by how much and why, and the spec still closes if coverage is intact and the time at least halved.

## Implementation steps
1. Baseline: JSON reporter run (local), collect CI test-job time; write the "before" part of `reports/test-times.md`.
2. AC 2 (serialization) + its guard test.
3. AC 7 (flaky tests deterministic).
4. AC 3 and AC 4 (shared pages, fewer teleports, trimmed matrices) file by file, slowest first; each file green after its change.
5. AC 5 (workers) and AC 6 (fast set, `npm run test:fast`).
6. AC 8 docs; "after" numbers; reviews (code-reviewer: is any coverage lost?), merge, push, CI time, close.

## Numbers and texts
| Key | Value |
|---|---|
| target whole suite | ≤ 10 min local, ≤ 12 min CI |
| target fast set | ≤ 3 min |
| flaky check | `--repeat-each=5` |
| new strings | none |

## Docs to update
`docs/process/orchestration-rules.md` (§2 tests), `docs/process/run-templates/RUN_S|M|L.md` (implementer loop), `CLAUDE.md` (Commands: `npm run test:fast`; suite time), `README.md` if it lists test commands, `specs/BACKLOG.md` (remove the "make the suite fast" item when done).
