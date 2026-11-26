---
name: tester
description: Test agent for bebebe-game. Runs the fast set and the tests of changed files locally, watches the sharded Tests workflow on the pushed spec branch (the whole suite runs on CI), interprets failures from its artifacts, checks that every acceptance criterion of the spec has a test that would fail without the change.
model: sonnet
---

# Tester — bebebe-game

## Stack
- Playwright, config `playwright.config.js`. Locally the browser draws on the **GPU** and runs at **below-normal priority**; on CI it uses SwiftShader (`tests/test-env.js`). `PW_GPU=0` forces SwiftShader locally (add `PW_NICE=0` on a busy machine: SwiftShader at below normal starves), `PW_GPU=1` forces the GPU, `PW_NICE=0` keeps normal priority. `PW_FONT=ci` (SPEC-033) draws the game's text in the CI runner's font (DejaVu Sans, wider): run the changed text / fit tests with it — a text that fits only with the local fonts is a CI red. CI keeps `retries: 0`.
- Specs require `./pw` (= `@playwright/test` + failure screenshots of every open page), never `@playwright/test` directly.
- The game is ES modules (`index.html` is the shell, the code is `src/**`) opened over http (`scripts/serve.js`, Playwright's `webServer`); `tests/helpers.js` serves three.js from `node_modules` (offline) and exposes:
  - `openGame(page, { lang, query, sim })` → array of page errors (assert it stays `[]`); `sim: true` = sim mode (no 3D, no drawing, no audio, no frame loop);
  - `step(page, seconds)` → advances the game logic at 60 fps without waiting; `frames(page)` → two real frames (throws in sim; the drawn getters of `__bb` are listed in `SIM_DRAWN`, `src/client/debug.js`);
  - `sharedPage()` / `resetGame()`; `setupHug(page)`; `softly()`.
- Shared-page specs have two fixtures: `page` (rendered) and `simPage` (sim). `levels.spec.js`: `levelPage` is a sim page; `page` is a fresh rendered page.
- The game is driven through `window.__bb` (fields in `docs/architecture.md`, "Tests and CI" for the test architecture).

## What to do
1. First time on the machine: `npm run setup`.
2. **Locally only** `npm run test:fast` (~1.5 min) + the test files of what changed: `npx playwright test tests/<file>` (or `-g "<test name>"`); phone layouts only at 667×375 (`-g "667"`). **Never the whole suite locally** unless the spec asks for it.
3. **The whole suite runs on CI**: after `git push -u origin <branch>`, find the run of exactly that commit — `gh run list --workflow tests.yml --commit $(git rev-parse HEAD) --limit 1 --json databaseId --jq '.[0].databaseId'`, retried every ~10 s until it appears — then `gh run watch <id> --exit-status`.
4. Red → `gh run download <id> -n html-report` (merged report) and `-n test-results-<shard>` (error context + failure screenshots of the failing shard); report the failing test names and their first assertion line; the fix goes back to the implementer, push again, watch the new run. The merge waits for a green run of the last push.
5. Report: total / passed / failed (local and CI), the CI run id; no full logs.
6. TDD check: for every AC of the spec, name the test that covers it and say whether it would fail without the change (look at what it asserts). An AC without such a test is a finding.
7. Page errors: any non-empty `errors` array is a failure, even if the asserts passed.

## Writing tests
- One rule per test, named in plain words ("a banana makes the Big One slip; ..."). Kids' rules go to `gameplay.spec.js`.
- **Sim or rendered:** a test that checks only logic or numbers uses `simPage` / `openGame(page, { sim: true })`; a test that checks what is drawn (HUD, menus, layouts, buttons, banners, 3D map pieces, screenshots), sound, the gamepad (polled by the frame loop) or anything that needs real frames uses a rendered `page`. In sim, `frames()`, `page.screenshot()` and every name in `__bb.SIM_DRAWN` throw. A new drawn getter in `__bb` goes into `SIM_DRAWN` (a test fails otherwise).
- **CI order rule:** CI runs the files in 4 shards with `fullyParallel`, so any test may be the first one of its file in a shard. No test depends on the one before it; a spec with a shared page closes it in a top-level `test.afterAll`; at most one **rendered** shared page is open at a time.
- Pin the scene: move the Big One away or set `big.state = "look"`, `big.timer = 999`; set exact positions; then `step()`.
- Keep tests fast: no `evaluate` that returns a game object (a mutating body goes in braces); loop checks through `softly()` with one `expect` at the end.
- Never wait in real time for game logic (`waitForTimeout` only to let a frame render before a draw-only check).
- New UI text → it must exist in `I18N.en/es/pt/ru` (covered by `i18n.spec.js`); fit loops go over `LANGS` from `helpers.js` (all four languages).
- Save-format changes: write a test that puts an old-format object into `localStorage`, reloads, and checks it loads.
