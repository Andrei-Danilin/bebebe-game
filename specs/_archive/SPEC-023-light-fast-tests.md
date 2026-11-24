# SPEC-023 — Light and fast testing: GPU locally, low priority, heavy runs on GitHub, logic tests without 3D

Status: done (merged by "Merge SPEC-023", see git log)
Complexity: M
Branch: SPEC-023-light-tests
Decided by: Andrei (2026-11-23): runs make his computer slow and take 3–4 hours per spec; do all of these before SPEC-020: tests on the GPU locally, low priority, the whole suite and the balance report on GitHub (sharded), logic tests without 3D. How (flags, workflows, sharding, which tests move): Claude (spec author).

## Description
Every Playwright test renders the 3D game with SwiftShader — on the CPU — so a local run keeps all cores busy for ~25 minutes, the balance report for another ~15, and the computer stutters. After this spec:
- **Locally** the browser draws 3D on the **GPU** (SwiftShader stays the fallback and stays on CI), and the test runner and its browsers run at **below-normal priority**, so the computer stays responsive.
- **The whole suite runs on GitHub**, split into **4 parallel shards**, on every push of a spec branch — the orchestrator waits for it before merging (this also catches the CI-font surprises before the merge instead of after).
- **The balance report runs on GitHub** as its own workflow that the orchestrator starts and waits for.
- **Logic-only tests run without rendering** (the SPEC-008 sim mode), which makes them much faster everywhere.

## Goal
- Local whole suite ≤ 12 min wall (from ~25) on Andrei's machine with GPU; the fast set ≤ 2 min.
- CI whole suite ≤ 8 min wall per spec branch push (4 shards); today a CI run takes 15–22 min.
- During a run the computer stays usable (below-normal priority; no 100 % CPU for long stretches from the browser).
- No loss of coverage: the same tests, the same assertions.

## Context
(Pre-flight done 2026-11-23 — names matched to master; see "Pre-flight notes" at the end.)
- `playwright.config.js`: `workers: 1`, `args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]`, timeout, viewport; `tests/helpers.js` (`openGame`, `openSim`, `frames`, `step`, `sharedPage`/`resetGame`, CDN routing, clear-once storage); `@fast` tag and `npm run test:fast` (SPEC-018); `reports/test-times.md`.
- Sim mode (SPEC-008): `?sim=1` / `__bb.sim(true)` — no 3D/2D draw, no audio, batch stepping (`__bb.simRun`); `openSim(page, opts)` in `tests/helpers.js`; `scripts/balance.js` (`npm run balance`).
- CI: `.github/workflows/pages.yml` — job `test`, then job `deploy`, on push to `master` (and `workflow_dispatch`). Process: `CLAUDE.md` ("Never: … pushing anything but `master`"; Workflow step 4 "the whole suite once before the merge", step 7 "only `master`, … never spec branches"), `docs/process/orchestration-rules.md`, `docs/process/run-templates/RUN_*.md` (whole suite locally before merge, balance locally).
- Andrei's machine: Windows 11, 8 logical CPUs, a GPU.

## Out of scope
- Removing or weakening tests; a dedicated runner machine (documented only).
- The Node-only core tests (SPEC-012 will add them).

## Acceptance criteria
### Local GPU and priority
1. `playwright.config.js` picks the GL backend: on CI (`process.env.CI`) — SwiftShader exactly as today; locally — hardware GL (`--use-angle=d3d11` on Windows, `metal` on macOS, `gl`/`vulkan` on Linux, with `--enable-gpu` / headless settings needed for GPU in headless Chromium — find the working set and document it). `PW_GPU=0` forces SwiftShader locally, `PW_GPU=1` forces GPU. If the GPU context can't be created, fall back to SwiftShader with a one-line console notice. A test reads the WebGL renderer string (`WEBGL_debug_renderer_info`) and asserts it matches the chosen backend. → `tests/env.spec.js`
2. Below-normal priority: a Playwright global setup lowers the priority of the test runner process (`os.setPriority(..., PRIORITY_BELOW_NORMAL)`); browsers and workers it starts inherit it (verify on Windows: the Chrome processes show "Below normal"; if they don't inherit, lower them right after launch via their PIDs). `PW_NICE=0` turns it off. Same for `scripts/balance.js`.
3. Local timings measured before/after (same machine, same commit apart from this spec) and written into `reports/test-times.md`: whole suite, fast set, balance — with GPU on/off.

### Logic tests without 3D
4. `openGame(page, { sim: true })` opens the game in sim mode (no render, no audio). Tests that assert only logic or numbers move to it: level generation and fairness (`levels.spec.js` except the visual/menu ones), economy and ledger, invariants, saves/migration, i18n parity, balance sample, and gameplay rule tests that don't check drawing (each moved test keeps its assertions). Tests that check what is drawn (HUD, phone layouts, menus, screenshots, 3D) stay rendered. List what moved in the report.
5. A guard: a test that calls drawing helpers or inspects canvas pixels in sim mode fails loudly (so a visual test can't silently stop testing anything).

### Whole suite and balance on GitHub
6. New workflow `.github/workflows/tests.yml`: on push to branches `SPEC-*` (and manual dispatch): install, cache Playwright browsers and `node_modules`, run the whole suite in **4 shards** (`--shard i/4`) in parallel jobs with the blob reporter, then a merge job that merges reports into one HTML report (artifact) and fails if any shard failed; on failure, screenshots/traces as artifacts. `pages.yml` on `master` uses the same sharded test jobs before deploy (shared via a reusable workflow or composite action).
7. New workflow `.github/workflows/balance.yml`: manual dispatch with input `ref`; runs `npm run balance` in sim mode and uploads `reports/balance.md` and `.json` as an artifact. The orchestrator starts it with `gh workflow run balance.yml -f ref=<branch>`, waits with `gh run watch`, downloads the artifact and commits the report on the branch.
8. Timings: CI whole suite wall time per push ≤ 8 min (report the measured number); balance workflow time reported.

### Process
9. **Andrei's speed rules become the written process** (he set them during the SPEC-016…019 queue, 2026-11-23; today they live only in the orchestrator's notes): no local whole suite — CI gates the merge and the deploy; locally the fast set plus the tests of changed files; phone layouts checked locally at 667×375 only (CI covers all sizes); one review pass (`code-reviewer` + `architect-reviewer` in parallel) plus one check of the fix commits; close the spec on its branch before the merge so close and merge go out in one push; the next spec of a queue may start while the previous deploy is still running (it must be green before that spec's own merge). Write them into `CLAUDE.md`, `docs/process/orchestration-rules.md` and every run template.
10. `CLAUDE.md` and `docs/process/orchestration-rules.md`: pushing **spec branches** is allowed (never `--force`, never other people's branches) so CI can test them; the remote spec branch is deleted after the merge (`git push origin --delete <branch>`). Locally only the fast set and the tests of touched files; **the whole suite runs on CI** for the branch, and the merge happens only when that CI run is green; the balance report comes from the balance workflow when a spec changes gameplay numbers. `RUN_S/M/L.md` updated accordingly (the "whole suite locally before merge" step becomes "push the branch, `gh run watch` the tests workflow; if red — investigate from its artifacts, fix, push again").
11. `README.md` Development: how to start Claude Code at low priority on Windows (`start /belownormal claude --model opus`), `PW_GPU`/`PW_NICE`, where CI reports are, how to run balance on GitHub; a short section "running the queue on another machine" (any machine with Node, Chrome, `gh`, `claude`; clone, `npm run setup`, start the queue there).
12. Whole suite green on CI (all shards) and locally once with GPU and once with `PW_GPU=0` (to prove both backends pass) — this spec's own merge follows the new process.

## Implementation steps
1. Pre-flight; measure "before" locally (whole, fast, balance).
2. GPU selection + renderer test + priority (AC 1–2).
3. Sim-mode helper and moving logic tests + guard (AC 4–5).
4. `tests.yml` (shards, merge, artifacts), `pages.yml` reuse, `balance.yml` (AC 6–7); push the branch and tune until CI is green and fast.
5. Process docs and templates (AC 9–11); measure "after" (AC 3, 8); reviews, docs, merge, push, delete the remote branch, close — following the new rules (`RUN_M.md`).

## Numbers and texts
| Key | Value |
|---|---|
| CI shards | 4 |
| local targets | whole ≤ 12 min, fast ≤ 2 min |
| CI target | ≤ 8 min wall per push |
| env switches | `PW_GPU` (auto/0/1), `PW_NICE` (1/0) |
| new UI strings | none |

## Docs to update
`CLAUDE.md`, `docs/process/orchestration-rules.md`, `docs/process/run-templates/RUN_S.md`, `RUN_M.md`, `RUN_L.md`, `RUN_QUEUE.md`, `RUN_AFTER_QUEUE.md`, `README.md`, `reports/test-times.md`, `docs/architecture.md` (test architecture: render vs sim tests, CI workflows).

## Pre-flight notes (2026-11-23)
Changes made in this pre-flight:
- Context "Pre-flight: match names…" → done; points here.
- Context helpers list: + `openSim`, `sharedPage`/`resetGame` (exist since SPEC-008/018).
- Context sim mode: + `__bb.simRun`, `openSim(page, opts)` (exist).
- Context CI/process: `CLAUDE.md` quote "Never: … pushing spec branches" was stale → the real text is "Never: … pushing anything but `master`", plus Workflow step 4 (whole suite once before the merge) and step 7 (push only `master`, never spec branches).
- Docs to update: + `docs/process/run-templates/RUN_AFTER_QUEUE.md` (it exists and AC 9 says "every run template").

Facts for the implementer:
- **Andrei's speed rules (2026-11-23) are already applied by the orchestrator** (its memory + `specs/BACKLOG.md` "Process (Andrei 2026-11-23…)"), but no process doc has them yet: `CLAUDE.md` Workflow 4/7 + "Never", `orchestration-rules.md` §2 ("Before the merge: the whole suite once") and §5 ("only `master`… never spec branches"), and every `RUN_*.md` (RUN_S/M/L: "`tester` whole suite once (~10 min)", "never spec branches"; RUN_QUEUE/RUN_AFTER_QUEUE: stop on red suite on `master`, follow the template) still describe the old flow. The rules to write (AC 9/10): no local whole suite — CI gates the merge and the deploy; locally `npm run test:fast` + the tests of changed files; phone layouts locally at 667×375 only; one review pass (`code-reviewer` + `architect-reviewer` in parallel) + one check of the fix commits; close the spec on its branch before the merge (close + merge = one push); the next spec may start while the previous deploy runs (green before its own merge); after SPEC-023: push each spec branch, `gh run watch` the tests workflow, merge only when green, `git push origin --delete <branch>` after the merge; balance reports from `balance.yml`.
- **AC 3 / AC 12 local whole-suite runs are measurements this spec requires** (before/after timings with GPU on/off; proof that both backends pass) — they stay, as the one exception to "no local whole suite". The **"before" run (whole suite, fast set, balance on current master) is already running in the background** (started by the orchestrator before this pre-flight): implementation step 1 only has to collect its numbers.
- Timings on record: SPEC-018 measured the local whole suite at 22.0 min before / **9.8 min (594 s, 157 tests)** after (`reports/test-times.md`); CLAUDE.md says "about 10 minutes". The suite has grown since (now 11 spec files, ~213 tests: balance 8, economy 26, gameplay 66, i18n 3, invariants 9, levels 26, menus 12, names 3, phone 38, pwa 16, smoke 6); Andrei's "~25 min" is today's figure — the running "before" run gives the real one. CI before SPEC-018: test job 22 m 59 s.
- **Closing on the branch**: the `Status:` line can't carry the merge hash before the merge; SPEC-017/019 used `Status: done (merged by "Merge SPEC-NNN", see git log)` — write that convention into CLAUDE.md step 8 / orchestration-rules §5.
- `openGame(page, { lang, clearStorage, query })` — no `sim` option yet; `openSim(page, opts)` = `openGame(page, { ...opts, query: "?sim=1" })` **replaces** `query` (can't combine with `?phone=1`); the AC 4 option should append. Already in sim mode: all of `tests/balance.spec.js` (shared `?sim=1` page) and `scripts/balance.js`. Shared pages: `gameplay.spec.js`, `phone.spec.js`, `economy.spec.js`, `invariants.spec.js`, `menus.spec.js` (`sharedPage()` + `resetGame()`), `levels.spec.js` (`levelPage` fixture). `@fast` = `{ tag: "@fast" }`, ~27 tests across all files; `npm run test:fast` = `playwright test --grep @fast`.
- Sim mode behaviour (index.html screen section ~558–630, `simMode`; logic section `simRun`/`sim` ~3250): `frame()` only requests the next frame — no `update`, no drawing — so sim tests advance with `step()` / `__bb.update` / `simRun`, never `frames()`; `rebuild3D` returns at once; `burst` makes no particles; `sim()` → `{ on, renders, draws, sounds }`. For AC 5's guard: the per-frame getters filled only by `drawUI` (`buttonRects`, `hudRects`, `mapInfo`, `levelCard`, `storyInfo`, `textSizes`, `minimap`, `bannerRect`, `winPanel`, `shopLayout`, `kitHint`, `heardHint.rect`, `edgeArrows`, `stickMarks`, `tapLines`) are stale/empty in sim — the natural place to throw.
- `scripts/balance.js` launches its own Chromium (`chromium.launch({ args: [SwiftShader flags] })`, ~line 270) and opens the page with `openSim()` — `playwright.config.js` does not reach it; sim draws nothing, so it needs only AC 2's priority, not the GPU switch.
- `pages.yml` today: `actions/checkout@v7`, `setup-node@v7` (cache npm), `npm ci`, `npx playwright install --with-deps chromium`, `npx playwright test`, `upload-artifact@v7` `test-results/` on failure; `deploy` needs `test`, copies `index.html manifest.webmanifest sw.js` + `icons v1-2d` into `_site`; `concurrency: pages`; `workflow_dispatch`. Keep `workflow_dispatch`: a red deploy with green tests is recovered with a fresh `gh workflow run pages.yml --ref master`, never `gh run rerun --failed` (it uploads a second `github-pages` artifact → "Multiple artifacts named github-pages"); with blob-report shards, give each shard's artifact a unique name too. SPEC-020 later adds `assets/` to the deploy copy.
- `tests/env.spec.js` does not exist yet (new). `README.md` has a `## Development` section (AC 11 goes there). `reports/test-times.md` has SPEC-018 "Before"/"After" sections — add a SPEC-023 section.
- Phone tests' sizes: 844×390 default, plus 667×375 and 932×430 in the sizes/banner/shop groups (`tests/phone.spec.js`) — locally only 667×375 under the new rules, CI runs all.
