# CLAUDE.md — bebebe-game (BeBeBe Atrapar)

A top-down 3D arcade game that Andrei makes with his kids from their scenario and drawings: the team of **Little Ones** (1–2 players + bots) against the **Big One**. Hug him from behind to take his hearts; if he sees you, he pushes you and your leg breaks; friends rescue you. The kids are the product owners: their decisions are the rules.

- **Game rules (source of truth):** `docs/game-design.md` — every rule says whose decision it is ("решение детей" / "придумал Claude"). A kids' rule never changes without a spec that says so.
- **Code map:** `docs/architecture.md` (sections of `index.html`, character states, the `window.__bb` debug object).
- **How work is run:** `docs/process/orchestration-rules.md` + `docs/process/run-templates/RUN_S|M|L.md`.

## What is in the repo

- `index.html` — **v2, 3D**: one HTML file, one ES module, no build step. Three.js **r187** is imported from jsDelivr (pinned `three@0.187.0`); the game needs internet to load it the first time.
- PWA files: `manifest.webmanifest`, `sw.js` (offline cache), `icons/` (`icon.svg` source + PNGs made by `npm run icons`). Published on GitHub Pages: **https://andrei-danilin.github.io/bebebe-game/** by `.github/workflows/pages.yml` (tests, then deploy) on every push to `master`.
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
7. **Progress is player data.** `localStorage` keys `bebebe-progress`, `bebebe-outfits`, `bebebe-place`, `bebebe-lang`, `bebebe-names`: a change to their shape keeps old saves loading (merge with defaults, never throw).
8. **`sw.js` `SW_VERSION` is bumped** when the precache list or a cache strategy changes (a change to `index.html` alone needs no bump: it is network-first). A new three.js version (the URL in `index.html` and `THREE_BASE` in `sw.js` must match — a test checks it) or a redrawn icon → bump.

## Workflow (spec-driven) and Git

**Roles.** Specs are written by Claude in the claude.ai project "BeBeBe Atrapar" (with Andrei and the kids) and committed to `master` as `specs/SPEC-NNN-short-name.md` before a run (that Claude cannot write into `.claude/` on this machine, which is why specs and docs live outside it). **Claude Code implements, commits and merges** — unlike ce-fsa-app, no user step is needed for commits or merges. Andrei starts a run by pasting the matching template from `docs/process/run-templates/` into `claude` at the repo root.

1. One feature = one spec (format: `specs/README.md`). Work strictly within one spec; anything new that comes up goes to `specs/BACKLOG.md`, not into the running spec.
2. **Branch** `SPEC-NNN-short-description` off `master` (`git branch --show-current` first; never edit on `master`).
3. **TDD**: for each acceptance criterion write the failing Playwright test first, then the code.
4. **Verify** (agent `tester`): `npx playwright test` — the touched spec files first, the **whole suite once before the merge** (it takes about a minute and a half).
5. **Review** (agent `code-reviewer`, + `architect-reviewer` for tier L): on `git diff master...<branch>` and the spec only. CRITICAL/HIGH are fixed; at most two fix rounds.
6. **Commit** in small steps, explicit paths only, message `SPEC-NNN: <what>`, ending with the attribution lines from your system reminder. Use the machine's git identity; never change git config.
7. **Merge** `git checkout master && git merge --no-ff SPEC-NNN-...` (message `Merge SPEC-NNN: <title>`), run the whole suite once on `master`, then `git branch -d SPEC-NNN-...`. **Push and deploy:** remote `origin` = `github.com/Andrei-Danilin/bebebe-game`; after the green suite on `master`, `git push origin master` (only `master`, never `--force`, never spec branches), then `gh run watch` until the Pages deploy is green; a red deploy is reported, not retried blindly.
8. **Close**: the spec's `Status:` line becomes `done (<merge hash>)`, the file moves to `specs/_archive/` (commit `SPEC-NNN: close`, pushed like the merge); agent `doc-keeper` updates `game-design.md`, `architecture.md`, `README.md` if the spec changed a rule, a structure or a command. Final report: short table AC → test, test counts, review findings, open points.

Never: `git push --force`, pushing anything but `master`, `git reset --hard`, `git branch -D`, rewriting history on `master`, editing `v1-2d/` or `node_modules/`.

## Commands

- First time on a machine: `npm run setup` (installs Playwright + three.js for tests, downloads Chromium, syncs `claude-setup/` into `.claude/`).
- Agents/skills changed in `claude-setup/`: `npm run claude:sync`.
- All tests: `npx playwright test` · one file: `npx playwright test tests/gameplay.spec.js` · one test: `npx playwright test -g "banana"` · watch it: `npx playwright test --headed`.
- Play locally: open `index.html` in a browser (Chrome/Edge/Safari/Firefox). Over http (service worker, manifest): `npm run serve` → http://localhost:8123/ (`PORT` to change it; Playwright starts it itself as `webServer`).
- Icons changed in `icons/icon.svg`: `npm run icons` (renders the PNGs with Playwright's Chromium).
- Syntax check of the module without a browser: see `claude-setup/skills/game-verification/SKILL.md`.

## Test gotchas

- Tests use software WebGL (SwiftShader); they are slow per frame, so gameplay is advanced with `step(page, seconds)` (logic only), not by waiting.
- `openGame()` clears `localStorage` once per test; a test about saving reloads the page and checks `window.__bb.progress`.
- A test that needs a calm Big One sets `big.state = "look"` and a large `big.timer`, and moves him away; bots keep moving — pin what you assert.
- If `CHROME_PATH` is set, Playwright uses that browser instead of its own Chromium.
- PWA tests (`tests/pwa.spec.js`) use `openGameHttp()`: jsDelivr is routed at **context** level so the service worker's requests are intercepted too (`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`, set in `playwright.config.js`). The browser's own fetch of `sw.js` is not routable: a test that needs another `sw.js` starts its own `makeServer({ override })` from `scripts/serve.js`. `?standalone=1` makes `isStandalone()` true.
