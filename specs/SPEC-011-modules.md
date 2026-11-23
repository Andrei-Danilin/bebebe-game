# SPEC-011 — Split index.html into ES modules (core / client)

Status: ready
Complexity: L
Branch: SPEC-011-modules
Decided by: Andrei (2026-11-22): the game goes online (SPEC-012…015) and later to Google Play / App Store, so the game logic must run in the browser **and** on a Node server; `index.html` is split into modules, the game opens only over http (`npm run serve`, GitHub Pages, the installed app), opening by double-click from disk and publishing as one claude.ai page are dropped. Module layout, rules and checks: Claude (spec author).

## Description
Nothing changes for the player. Under the hood the ~4,900-line `index.html` becomes a small shell plus ES modules in `src/`: `src/core/` is the game itself (rules, level generator, bots, the Big One, difficulty) and knows nothing about the screen; `src/client/` is everything a person sees, hears and touches (3D, 2D UI, input, sound, saves). This is the first step of the online game: the server will run `src/core/` (SPEC-012, SPEC-013).

## Goal
- `src/core/` imports nothing from `src/client/`, never imports three.js and loads in plain Node without errors.
- The game plays exactly as before: same levels, same event log for the same seed and inputs, whole suite green.
- The installed app (PWA) still works offline and updates cleanly.
- No file is a second `index.html`: the big sections each get their own module.

## Context
- `index.html`: one inline `<script type="module">` (line ~45 to the end) importing three.js r187 from jsDelivr; a small non-module script (offline hint). Sections and line ranges: `docs/architecture.md` ("Sections of index.html"); layers already kept apart there (Logic / 3D / 2D UI).
- Hard rule 1 in `CLAUDE.md` ("No build… opens by double-click… publishes as one claude.ai page") — this spec rewrites it. "No bundler, no framework" stays.
- Tests: `smoke`, `gameplay`, `i18n`, `phone`, `levels`, `names` open `file://…/index.html` (`tests/helpers.js` `openGame`); `pwa` uses `openGameHttp()` and `scripts/serve.js` (Playwright `webServer`). jsDelivr is routed to `node_modules/three`.
- `sw.js`: `PRECACHE_LOCAL` lists the site files; `index.html` and navigations network-first; three.js and `icons/` cache-first; `SW_VERSION` bump rule (hard rule 8). A test checks the three.js URL in `index.html` = `THREE_BASE`.
- `.github/workflows/pages.yml` copies `index.html manifest.webmanifest sw.js icons v1-2d` into `_site`.
- `claude-setup/skills/game-verification/SKILL.md` §1 extracts the inline module for `node --check`.
- SPEC-008 (runs before this spec) adds `rng()`/`seedRandom`, sim mode, `__bb.events`, autopilot. This spec relies on them for the "plays exactly as before" check.
- BACKLOG lines this spec answers: "index.html is ~4,700 lines: consider splitting into modules", "Split the pure level generator … into its own module", "Split the 2D layer … into screen modules".

## Out of scope
- Making the core run **many games** at once, input slots, moving sound/particles out of the logic — that is SPEC-012. Here the logic keeps its module-level state.
- Any rule, number, text or visual change (except the file:// notice, AC 6).
- A bundler, TypeScript, a framework, shipping three.js locally (BACKLOG "Offline 3D" stays open).

## Acceptance criteria
### Layout
1. `index.html` keeps only markup, CSS, the small non-module script(s) and `<script type="module" src="src/client/main.js"></script>`; there is no inline game code. → `tests/modules.spec.js` "index.html has no inline game code"
2. Module tree (names may be adjusted by the run if `architecture.md` says why; no file over ~900 lines):
   - `src/core/` — `config.js` (`CFG`, `GLOVES`, `KISSES`, `RESCUE_KIT` and the other number tables of the logic), `util.js` (`mulberry32`, `rng`, `clamp`, `dist`, …), `world.js` (obstacles, grids, `buildGrids`, `los`, zones), `level/` (`layouts.js`, `generate.js`, `validate.js`, `build.js` — the generator sections), `path.js` (A*, movement, `visionPoly`, `inCone`), `difficulty.js`, `rules.js` (push, hug, kisses, items, bonus stars, contacts, downed, danger, resting), `bots.js`, `big.js`, `game.js` (game state, `resetWorld`, `update`, win), `index.js` (the public surface of the core).
   - `src/i18n.js` — `I18N`, `ruPlural` (pure data + helpers, shared).
   - `src/client/` — `screen.js` (`fit`, `UW/UH`, `PHONE`, `STANDALONE`), `input.js`, `sound.js`, `progress.js` (saves: progress, outfits, names, lang), `outfits.js`, `ui/` (`hud.js`, `phone.js`, `minimap.js`, `overlay.js`, `overlay-phone.js`, `draw.js`), `three/` (`setup.js`, `camera.js`, `themes.js`, `map3d.js`, `characters.js`, `sync.js`, `skins.js`), `main.js` (loop, service worker registration, `window.__bb`).
3. **Dependency rule** (checked by a static scan of `import` lines and identifiers): files in `src/core/` import only `src/core/**` and `src/i18n.js`; they never import three.js or anything in `src/client/`, and never use `document`, `window`, `localStorage`, `navigator`, `requestAnimationFrame`, `Audio`/`AudioContext`. Exceptions still needed after this spec are listed in one array `CORE_DOM_ALLOW` in the test with a comment each — SPEC-012 must empty it. → `tests/modules.spec.js` "core does not depend on the client"
4. `node -e "import('./src/core/index.js')"` loads in Node without throwing (no DOM access at import time). → `tests/modules.spec.js` "core loads in Node" (via `child_process`)
5. **Live bindings rule:** a module-level `let` is reassigned only inside the module that declares it; other modules change it through an exported function (`setMode(m)`, …). `architecture.md` lists the state each core module owns.

### Behaviour unchanged
6. Opening `index.html` from disk (`file:`) shows, instead of a black page, a centred notice from the non-module script in the saved or browser language: en "Open the game from the website or run npm run serve", es "Abrí el juego desde la página o corré npm run serve", ru "Откройте игру с сайта или запустите npm run serve". → `tests/modules.spec.js` "file:// shows the notice"
7. **Same game:** before the split (on `master`, first step of the run) record the SPEC-008 event log of 3 fixed runs (Park 1, Beach 9, Winter 18; seed 7; autopilot `careful`; 120 s of game time) into `tests/fixtures/events-baseline.json`; after the split the same runs give identical logs. The level fixtures (`level1.json`, `levels-worlds.json`) are unchanged. → `tests/modules.spec.js` "same seed, same game after the split"
8. All tests run over http: `openGame()` opens `HTTP_BASE + "index.html" + query` (jsDelivr still routed to `node_modules`); the whole suite is green with no test removed. `GAME_URL` (file://) is gone from `helpers.js`.

### PWA and deploy
9. `sw.js`: every file under `src/` and `src/i18n.js` is in the precache list (a test compares the list with the files on disk); `src/**` is **network-first like `index.html`** (so the shell and its modules update together); `SW_VERSION` bumped. Offline start of the installed app still works. → `tests/pwa.spec.js` "precache lists every module", existing "works offline" test
10. `pages.yml` copies `src/` into `_site`; after the merge the deployed site loads (the run watches the Pages workflow as usual and opens the site URL once in Playwright).

### Process and docs
11. `CLAUDE.md` hard rule 1 says: "No build. The site is `index.html` + `src/` (ES modules) + PWA files; it opens over http only (`npm run serve`, Pages, the installed app). No bundler, no framework, no new runtime dependency without a spec. `src/core/` never depends on `src/client/` or three.js." `architecture.md` replaces the line-range table with a module table (file → what it owns, state it owns). `game-verification` skill §1 runs `node --check` on every file in `src/` and the Node import of `src/core/index.js`. The answered BACKLOG lines are removed.

## Implementation steps
1. On `master`: record `tests/fixtures/events-baseline.json` (AC 7) with the SPEC-008 tools; commit it on the branch first.
2. Switch the tests to http (AC 8) while the game is still one file; suite green.
3. Move code out section by section, core first (config → util → world → level → path → difficulty → rules/bots/big → game), then i18n, then client (screen, input, sound, progress, outfits, 3D, UI, main). After each move: `node --check`, the touched tests, the baseline test.
4. Setters for cross-module state (AC 5); the static dependency test and the Node import test (AC 3, 4).
5. file:// notice (AC 6); `sw.js` precache, strategy, version (AC 9); `pages.yml` (AC 10).
6. Docs and skill (AC 11); whole suite; reviews (code + architect); merge, push, watch deploy, open the site; close.

## Numbers and texts
| key | value | en | es | ru |
|---|---|---|---|---|
| file:// notice (inline, not `I18N`: the modules don't load from disk) | — | Open the game from the website or run npm run serve | Abrí el juego desde la página o corré npm run serve | Откройте игру с сайта или запустите npm run serve |
| `SW_VERSION` | `bebebe-v2` (or next) | | | |

## Docs to update
`CLAUDE.md` (hard rule 1, "What is in the repo", commands, test gotchas: tests use http), `architecture.md` (module table, owned state, setters), `README.md` (how to play locally: `npm run serve`), `game-verification` skill, `BACKLOG.md` (remove the three answered lines). No rule changes in `game-design.md`.
