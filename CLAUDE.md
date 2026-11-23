# CLAUDE.md — bebebe-game (BeBeBe Atrapar)

A top-down 3D arcade game that Andrei makes with his kids from their scenario and drawings: the team of **Little Ones** (1–2 players + bots) against the **Big One**. Hug him from behind to take his hearts; if he sees you, he pushes you and your leg breaks; friends rescue you. The kids are the product owners: their decisions are the rules.

- **Game rules (source of truth):** `docs/game-design.md` — every rule says whose decision it is ("решение детей" / "придумал Claude"). A kids' rule never changes without a spec that says so.
- **Code map:** `docs/architecture.md` (sections of `index.html`, character states, the `window.__bb` debug object).
- **How work is run:** `docs/process/orchestration-rules.md` + `docs/process/run-templates/RUN_S|M|L.md`.

## What is in the repo

- `index.html` — **v2, 3D**: one HTML file, one ES module, no build step. Three.js **r187** is imported from jsDelivr (pinned `three@0.187.0`); the game needs internet to load it the first time.
- PWA files: `manifest.webmanifest`, `sw.js` (offline cache), `icons/` (`icon.svg` source + PNGs made by `npm run icons`). Published on GitHub Pages: **https://andrei-danilin.github.io/bebebe-game/** by `.github/workflows/pages.yml` (the sharded tests, then deploy) on every push to `master`. CI (SPEC-023): `.github/workflows/tests.yml` runs the whole suite in 4 shards on every push of a `SPEC-*` branch (and is reused by `pages.yml`); `.github/workflows/balance.yml` makes the balance report on demand.
- `v1-2d/index.html` — v1, 2D canvas, offline. Frozen: no new features unless a spec names it.
- `tests/` — Playwright tests (`smoke`, `gameplay`, `i18n` on `file://`; `pwa` over http from `scripts/serve.js`); three.js is served from `node_modules` so tests run offline.
- `docs/` — `game-design.md` (rules), `architecture.md` (code map), `process/` (orchestration rules, run templates).
- `specs/` — `SPEC-NNN-*.md` (one feature each), `BACKLOG.md`, `_archive/` (done specs).
- `claude-setup/` — the committed source of the Claude Code agents and skills; `npm run claude:sync` copies them into `.claude/` (local, gitignored), where Claude Code finds them. Edit `claude-setup/`, never `.claude/` directly.

## Hard rules

1. **No build.** The site is `index.html` + `manifest.webmanifest` + `sw.js` + `icons/` (+ `v1-2d/`); the game still opens from disk by double-click (with internet for three.js) and publishes as one claude.ai page. No bundler, no framework, no new runtime dependency without a spec.
2. **Three languages for every string.** Every text a player sees goes into `I18N` for `en` (default), `es` (Argentina, voseo: "agarrá", "tenés", "campera") and `ru`. `tests/i18n.spec.js` fails on a missing key.
3. **Numbers live in `CFG`** (and `GLOVES`, `THEMES`, the outfit lists): no magic numbers in logic. A spec that changes a rule changes the `CFG` value and the line in `game-design.md`.
4. **JS style:** ES2022, `let`/`const` only (never `var`), short comments in Russian or English, code identifiers in English.
5. **Kid-friendly:** nothing scary or violent in visuals or texts (the Big One "pushes", nobody "dies"); big readable UI; works with touch, keyboard and gamepad.
6. **Keep `window.__bb` working.** Tests drive the game through it; a spec that adds state the tests need exposes it there.
7. **Progress is player data.** `localStorage` keys `bebebe-progress`, `bebebe-outfits`, `bebebe-place` (no longer read since SPEC-006; old saves may still have it), `bebebe-lang`, `bebebe-names`: a change to their shape keeps old saves loading (merge with defaults, never throw).
8. **`sw.js` `SW_VERSION` is bumped** when the precache list or a cache strategy changes (a change to `index.html` alone needs no bump: it is network-first). A new three.js version (the URL in `index.html` and `THREE_BASE` in `sw.js` must match — a test checks it) or a redrawn icon → bump.

## Workflow (spec-driven) and Git

**Roles.** Specs are written by Claude in the claude.ai project "BeBeBe Atrapar" (with Andrei and the kids) and committed to `master` as `specs/SPEC-NNN-short-name.md` before a run (that Claude cannot write into `.claude/` on this machine, which is why specs and docs live outside it). **Claude Code implements, commits and merges** — unlike ce-fsa-app, no user step is needed for commits or merges. Andrei starts a run by pasting the matching template from `docs/process/run-templates/` into `claude` at the repo root.

1. One feature = one spec (format: `specs/README.md`). Work strictly within one spec; anything new that comes up goes to `specs/BACKLOG.md`, not into the running spec.
2. **Branch** `SPEC-NNN-short-description` off `master` (`git branch --show-current` first; never edit on `master`).
3. **TDD**: for each acceptance criterion write the failing Playwright test first, then the code.
4. **Verify** (agent `tester`; speed rules, Andrei 2026-11-23): **no local whole suite.** Locally only `npm run test:fast` + the test files of what changed (`npx playwright test tests/<file>` or `-g "<name>"`); phone layouts locally at **667×375 only** (`-g "667"`; CI runs every size). **The whole suite runs on CI:** push the spec branch (`git push -u origin SPEC-NNN-...`, never `--force`), `gh run watch <id> --exit-status` the **Tests** workflow (`tests.yml`, 4 shards); red → investigate from its artifacts (`gh run download <id>`: the merged HTML report, failure traces/screenshots), fix, push again. **The merge happens only when that run is green.** **Balance:** a spec that changes gameplay numbers or rules gets its report from GitHub: `gh workflow run balance.yml -f ref=<branch>`, `gh run watch`, `gh run download <id> -n balance -D reports`, commit the updated `reports/balance.md` + `reports/balance.json` on the branch, and list the red targets in its final report (red is not a stop by itself unless the spec's ACs say so); a changed number also needs `npm run docs:numbers`.
5. **Review**: **one pass** — `code-reviewer` + `architect-reviewer` **in parallel**, on `git diff master...<branch>` and the spec only; CRITICAL/HIGH are fixed, then **one** check of the fix commits (`code-reviewer` on those commits only). No second full review.
6. **Commit** in small steps, explicit paths only, message `SPEC-NNN: <what>`, ending with the attribution lines from your system reminder. Use the machine's git identity; never change git config.
7. **Close on the branch, before the merge** (so close and merge go out in one push): agent `doc-keeper` updates `game-design.md`, `architecture.md`, `README.md` if the spec changed a rule, a structure or a command (commit `SPEC-NNN: docs`); the spec's `Status:` line becomes `done (merged by "Merge SPEC-NNN", see git log)` (the merge hash does not exist yet), the file moves to `specs/_archive/`, the run-state file `specs/SPEC-NNN_RUN_STATE.md` is deleted; commit `SPEC-NNN: close` and push the branch (the Tests workflow must be green on this last push).
8. **Merge, push, deploy**: `git checkout master && git merge --no-ff SPEC-NNN-...` (message `Merge SPEC-NNN: <title>`), then `git branch -d SPEC-NNN-...`; no local suite on `master` (CI tested the branch; the Pages workflow tests `master` again before the deploy). Remote `origin` = `github.com/Andrei-Danilin/bebebe-game`: `git push origin master` (never `--force`), then `git push origin --delete SPEC-NNN-...` (the remote spec branch), then `gh run watch` until the Pages workflow (sharded tests + deploy) is green. A red deploy is reported, not retried blindly; a red deploy **with green tests** ("Fetching artifact metadata failed" and the like) is recovered with a **fresh** `gh workflow run pages.yml --ref master`, never `gh run rerun --failed` (that uploads a second `github-pages` artifact and fails again). **Queues:** the next spec may start while the previous deploy is still running; that deploy must be green before the next spec's own merge. Final report: short table AC → test, test counts, CI run ids, review findings, open points.

Never: `git push --force`, pushing anything but `master` and your own spec branches (`SPEC-*`; never other people's branches), `git reset --hard`, `git branch -D`, rewriting history on `master`, editing `v1-2d/` or `node_modules/`.

## Commands

- First time on a machine: `npm run setup` (installs Playwright + three.js for tests, downloads Chromium, syncs `claude-setup/` into `.claude/`).
- Agents/skills changed in `claude-setup/`: `npm run claude:sync`.
- Balance report: on GitHub `gh workflow run balance.yml -f ref=<branch>` → `gh run watch` → `gh run download <id> -n balance -D reports`; locally `npm run balance` (every level × 3 seeds with the autopilot in sim mode → `reports/balance.md`, `reports/balance.json`; targets in `CFG.BALANCE`). Not part of `npm test`; the CI sample is in `tests/balance.spec.js`.
- CI: `gh run list --branch <branch>`, `gh run watch <id> --exit-status`, `gh run download <id>` (artifacts: `html-report` = the merged Playwright report, `test-results-<n>` = failure traces/screenshots of shard n).
- Local test environment (SPEC-023): `PW_GPU` = auto (default: GPU locally, SwiftShader on CI) / `0` (force SwiftShader) / `1` (force GPU); `PW_NICE=0` keeps normal priority (default: the runner, its browsers and `npm run balance` run below normal). Claude Code itself at low priority on Windows: `start /belownormal claude --model opus`.
- Numbers section of `docs/game-design.md` (generated from `CFG`, `GLOVES`, `KISSES`, `RESCUE_KIT`): `npm run docs:numbers` (`--check` to only compare).
- Fast set while working (`@fast`, ~1.5 min): `npm run test:fast` · all tests: on CI (Tests workflow on the pushed branch); locally `npx playwright test` only when a spec asks for it (`workers: 1`) · one file: `npx playwright test tests/gameplay.spec.js` · one test: `npx playwright test -g "banana"` · watch it: `npx playwright test --headed`.
- Play locally: open `index.html` in a browser (Chrome/Edge/Safari/Firefox). Over http (service worker, manifest): `npm run serve` → http://localhost:8123/ (`PORT` to change it; Playwright starts it itself as `webServer`).
- Icons changed in `icons/icon.svg`: `npm run icons` (renders the PNGs with Playwright's Chromium).
- Syntax check of the module without a browser: see `claude-setup/skills/game-verification/SKILL.md`.

## Test gotchas

- Tests use software WebGL (SwiftShader); they are slow per frame, so gameplay is advanced with `step(page, seconds)` (logic only), not by waiting.
- Tests that change `__bb.CFG` restore it and call `__bb.clearLevelCache()` (the level cache keeps the accepted attempt per level).
- `openGame()` clears `localStorage` once per test; a test about saving reloads the page and checks `window.__bb.progress`.
- A test that needs a calm Big One sets `big.state = "look"` and a large `big.timer`, and moves him away; bots keep moving — pin what you assert.
- If `CHROME_PATH` is set, Playwright uses that browser instead of its own Chromium.
- Speed (SPEC-018, `reports/test-times.md`): an `evaluate` never returns a game object — `evaluate(() => Object.assign(littles[i], …))` returns the Little One and Playwright serializes him with his 3D parts (11–15 s); put a mutating body in braces (a smoke test scans `tests/*.js`). Checks inside loops use `softly()` from `helpers.js` (or a problem list) and one `expect` at the end: each Playwright `expect` records a step. Never leave a second game page open while other tests run (it renders in software and slows them 3–5×). No screenshot per test by default: `PW_SCREENSHOT=only-on-failure npx playwright test …` to get them. `workers` stays 1 (2 workers ran each test twice as slow).
- Shared pages: `gameplay.spec.js` and the `?phone=1` tests of `phone.spec.js` share one game page (`sharedPage()` + `resetGame()` in `helpers.js`: a fresh game before each test; one shared page open at a time, closed before any fresh-page test). State a new test needs must be reset there too. `levels.spec.js`: the generator tests share one page (`levelPage` fixture, reset to Park 1 / English / level cache cleared before each); its fresh-page tests come first in the file. Save tests reload once and check other save shapes through `__bb.loadProgress(save)` (the pure merge the start code runs).
- PWA tests (`tests/pwa.spec.js`) use `openGameHttp()`: jsDelivr is routed at **context** level so the service worker's requests are intercepted too (`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`, set in `playwright.config.js`). The browser's own fetch of `sw.js` is not routable: a test that needs another `sw.js` starts its own `makeServer({ override })` from `scripts/serve.js`. `?standalone=1` makes `isStandalone()` true.
