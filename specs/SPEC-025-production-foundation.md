# SPEC-025 — Production foundation: offline, safe saves, friendly errors, code checks, versions

Status: ready
Complexity: L
Branch: SPEC-025-production-foundation
Decided by: Andrei (2026-11-23): prepare the game for normal, long-term production work and support (store releases later: free kids' game, no ads, no purchases, nothing collected, offline). The list of foundations, tools and numbers: Claude (spec author). SPEC-024 (release-readiness review) may add acceptance criteria here, marked "(from review)".

## Description
After the module split (SPEC-011) and the headless core (SPEC-012), the game gets the foundations a real product needs:
- **Fully offline:** three.js and every other runtime file ship with the game; nothing loads from the internet.
- **Saves a child can't lose:** one versioned save, validated on load, a backup copy, automatic recovery from a broken save, persistent storage requested, and an export/import code for parents (moving to a new phone).
- **Friendly errors:** if something breaks, a calm "Oops" card with Continue / Restart level instead of a frozen screen; the last errors kept locally (never sent anywhere) so Andrei can read them on the device.
- **Code checks:** ESLint + Prettier and type checking from JSDoc (`tsc --checkJs`, no TypeScript build), run in CI on every push.
- **Versions:** a game version shown in the "How to play" / about page, `CHANGELOG.md`, git tags for releases, and the service worker version derived from it.
- **App lifecycle:** pause when the app goes to the background, resume cleanly; no memory growth over long sessions.

## Goal
- The game runs with the network off from the very first launch after install (PWA) — the base for Capacitor packaging later.
- No path in which a child loses progress without a way back.
- Every push is linted and type-checked; a release is a tag with a changelog entry.

## Context
(Pre-flight: this runs after SPEC-011 and SPEC-012; match names to `src/`. Check SPEC-024's "Review notes" and any "(from review)" criteria.)
- three.js r187 from jsDelivr (`THREE_BASE`), tests route it to `node_modules/three`; `sw.js` precaches it from the CDN; BACKLOG "Offline 3D".
- Saves: `bebebe-progress`, `bebebe-outfits`, `bebebe-names`, `bebebe-lang`, `bebebe-place` (old), migrations in `progress.js` (SPEC-006/009/016), save fixtures in `tests/fixtures/saves/` (SPEC-008).
- Errors: no global handler; a failure usually leaves a frozen canvas.
- Tooling: no linter, no type checks; `package.json` has no version policy; `SW_VERSION` bumped by hand (hard rule).
- Lifecycle: `blur` clears keys; no `visibilitychange` pause.

## Out of scope
- Capacitor/TWA packaging, store pages, privacy texts (publishing parked; later release specs).
- Online features (SPEC-013…015).
- Any telemetry that leaves the device.

## Acceptance criteria
### Offline
1. three.js is vendored: `vendor/three/` (the exact r187 build files the game imports, with its MIT licence), imported by relative path; no runtime request leaves the origin (a test records all requests during a level and fails on any other host). `sw.js` precaches `vendor/`; jsDelivr routing removed from tests. Offline first launch after install works (test with the network blocked after the service worker installs).
2. A `THIRD_PARTY_LICENSES.md` lists vendored code and its licence.

### Saves
3. One save module owns all storage: a single key `bebebe-save` with `{ version, progress, outfits, names, lang, seen, ... }`; old keys migrate into it once (old keys kept for one version as a fallback, then removed); a schema check on load (types and ranges; unknown fields dropped, missing ones defaulted).
4. Every write keeps the previous good save as `bebebe-save-backup`; a broken or unreadable save loads the backup, and if that is broken too, starts fresh **without** crashing, showing a gentle message; a test for each case (truncated JSON, wrong types, empty).
5. `navigator.storage.persist()` requested once (where available), result kept in the save; no prompt is shown to the child.
6. **Parents' save code:** in the "How to play / About" page behind a simple parental gate (e.g. "hold the button for 3 seconds" or a small sum, en/es/ru), "Copy my progress code" and "Paste a code" — the save as a compressed, checksummed text; import validates and asks for confirmation. Tests for round-trip and a broken code.

### Errors
7. Global `error` and `unhandledrejection` handlers and a guard around the frame loop: on an error the game pauses and shows an "Oops! Something went wrong" card (en/es/ru) with Continue (if the loop can go on) and Restart level; never a frozen screen. The last 20 errors (message, stack head, version, mode, level) are kept in local storage only; the About page (behind the parental gate) shows them with "Copy". A test injects an error and checks the card and the log.

### Code checks
8. ESLint (flat config, recommended rules + a few for the project: no `var`, `prefer-const`, no unused vars, no implicit globals) and Prettier (project style as it is today, no mass reformat beyond what the config needs) over `src/`, `scripts/`, `tests/`; `npm run lint`; zero errors.
9. Type checks: `jsconfig.json` + `tsc --noEmit --checkJs` over `src/core/` strict-ish (`noImplicitAny` for core), `src/client/` basic; JSDoc types for the core's public API (game instance, inputs, events from SPEC-012) and the save schema; `npm run typecheck`; zero errors.
10. CI: lint and typecheck jobs run on every push (spec branches and `master`) in parallel with the sharded tests; a failure blocks the merge/deploy.
11. Dependabot (or Renovate) for npm and GitHub Actions, weekly, grouped; `CLAUDE.md` says how to review such PRs.

### Versions and releases
12. `package.json` `version` (semver, start `1.0.0-dev`); `src/version.js` generated or kept in sync (a test checks); the About page shows it; `SW_VERSION` is derived from the version + a build counter so a forgotten bump can't happen (test); hard rule 8 updated.
13. `CHANGELOG.md` (Keep a Changelog style) with what's in the game today, in plain words; the run templates add "add a changelog line" to each spec's close; a `release` script/doc: bump version, update changelog, tag `vX.Y.Z`, push tag (the Pages deploy stays on `master`).

### Lifecycle and memory
14. `visibilitychange`/`pagehide`: the game pauses (play → pause screen) when hidden and stays paused when visible again; audio suspends/resumes; timers don't jump (no dt spike after resume). Tests simulate hide/show.
15. Memory: playing 30 levels in a row (sim + render) keeps the JS heap and the count of three.js geometries/materials/textures stable (within a small margin after GC); `disposeTree` covers everything a level creates. A test reports the numbers and fails on growth beyond the margin.

### General
16. Whole suite green (sharded CI), lint and typecheck green; no gameplay or visual change (the event-log baseline from SPEC-011 still matches); docs updated.

## Implementation steps
1. Pre-flight (names after SPEC-011/012; review notes); tests first per section.
2. Vendor three.js, request audit test, offline install test (AC 1–2).
3. Save module, migration, schema, backup/recovery, persist, parents' code (AC 3–6).
4. Error handling and local log (AC 7).
5. ESLint/Prettier, JSDoc types, CI jobs, Dependabot (AC 8–11).
6. Versions, changelog, release doc, derived `SW_VERSION` (AC 12–13).
7. Lifecycle and memory (AC 14–15); reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| save key / backup | `bebebe-save` / `bebebe-save-backup` | | | |
| error log | last 20 entries, local only | | | |
| memory margin | heap and three.js counts within +10 % after GC over 30 levels | | | |
| version start | `1.0.0-dev` | | | |
| `I18N.*.oops` | error card | Oops! Something went wrong | ¡Uy! Algo salió mal | Ой! Что-то пошло не так |
| `I18N.*.continue` / `restartLevel` | | Continue / Restart level | Seguir / Reiniciar nivel | Продолжить / Начать уровень заново |
| `I18N.*.saveRecovered` | | We fixed your save from a backup | Arreglamos tu partida con una copia | Мы восстановили сохранение из копии |
| `I18N.*.parentsGate` | | For grown-ups: hold for 3 seconds | Para adultos: mantené 3 segundos | Для взрослых: удерживайте 3 секунды |
| `I18N.*.copyCode` / `pasteCode` | | Copy my progress code / Paste a code | Copiar mi código / Pegar un código | Скопировать код прогресса / Вставить код |

## Docs to update
`CLAUDE.md` (hard rules: vendored deps, save module only writes storage, version/SW rule, lint/typecheck), `docs/architecture.md` (save module and schema, errors, lifecycle, vendor, tooling), `README.md` (lint, typecheck, release, offline), `CHANGELOG.md`, `THIRD_PARTY_LICENSES.md`, `docs/game-design.md` (parents' save code, error card — Andrei's goal, Claude's design).
