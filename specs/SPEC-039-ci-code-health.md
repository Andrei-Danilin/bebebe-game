# SPEC-039 — CI and code health: CI under 10 minutes, no stalled installs, release-friendly caches, no import cycles

Status: ready
Complexity: M
Branch: SPEC-039-ci-code-health
Decided by: Andrei (2026-11-26): do the CI and code-health items from the backlog. Shard counts, tags and module names: Claude.

## Description
Every push waits 12–15 minutes for CI (379 tests), and the code has known debt from the module split:
1. **CI time (RR-81):** at most **10 min** per push.
2. **Stalled install:** `npx playwright install-deps chromium` once hung 7m48s on a shard (SPEC-023 follow-up).
3. **Cache names (SPEC-025 review):** a release changes `SW_VERSION`, so installed apps download unchanged modules and sprites again.
4. **Candidate flake (SPEC-025 review):** the lifecycle "no dt jump" test depends on how long rendered frames take.
5. **Import cycles (SPEC-011 review):**
   - the core's 14-module cycle (split `path.js` into a pure `grid.js` + `vision.js`; `progress-rules.js` a stateless leaf);
   - the client's cycle (a pure `ui/layout.js` for HUD/menu geometry read by `three/camera.js` and `three/previews.js`; canvas helpers take a `ctx` argument instead of the `setCtx` swap; `homeButton` gets a home without a cycle).

No behaviour changes: same game, same pictures.

## Context
(Pre-flight against master; match names.)
- CI: `.github/workflows/tests.yml` (4 shards), `pages.yml`, `balance.yml`; `@fast` tags; `reports/test-times.md`.
- Service worker caches: `sw.js` (`SW_VERSION`, `SRC_HASH`, the src / assets caches), `src/version.js`, `npm run precache`.
- `tests/lifecycle.spec.js`, `CFG.MAX_FRAME` / `STEP` (SPEC-034).
- Modules: `src/core/path.js`, `src/core/progress-rules.js`; `src/client/three/camera.js`, `three/previews.js`, `ui/*` (`minimapRect`, `teamRect`, `phoneTopBar`, `progressGeom`, `phoneSkinCols`, `KID_HEAD_R`, `setCtx`); `ui/home.js` `homeButton` (used by `ui/story.js`); the home-made lint plugin of SPEC-011; `tests/modules.spec.js`.

## Acceptance criteria
1. **CI ≤ 10 min per push.** Measured as the wall time of the Tests workflow on the branch's last push, recorded at the close in `reports/test-times.md` with the before value. Allowed means:
   - **more shards:** 6, or weighted by measured file times;
   - **`@fast`:** structural tests (getter list, i18n coverage, three/SW version checks, `docs:numbers --check`) tagged `@fast`;
   - **caching:** cached Playwright browsers and apt packages;
   - **no doubling:** no test run twice in one push.
   No test is deleted or weakened to save time. The slow all-levels stall guard (SPEC-037) stays its own job.
2. **Install step:** the install-deps step has `timeout-minutes: 4` and one retry, or the packages come from cache. A hang fails fast with a clear step name.
3. **Caches survive a release:** src and assets caches are named by build and content hash without the semver (e.g. `bebebe-b<SW_BUILD>-src-<SRC_HASH>`). A version bump with unchanged files makes the installed app download nothing but `index.html` and `sw.js`. Test in `pwa.spec`.
4. **Lifecycle flake:** the "no dt jump" check is bounded by the game rules (`MAX_FRAME`, `MAX_STEPS`, `STEP`), not by real frame duration; green 20 times in a row locally under `PW_GPU=0`.
5. **Core cycle gone:**
   - `path.js` is split into `grid.js` (pure grid and A*) and `vision.js` (line of sight, view cone), and `progress-rules.js` imports no game state;
   - `tests/modules.spec.js` asserts the core import graph has no cycle;
   - the same seed gives the same game (the existing split-equality test).
6. **Client cycle gone:**
   - `ui/layout.js` holds the HUD and menu geometry (pure functions of the screen size), read by the 3D and the UI;
   - `KID_HEAD_R` lives in `look.js` (or `three/setup.js`);
   - canvas helpers take `ctx`; `homeButton` sits in a module both `ui/home.js` and `ui/story.js` import;
   - `modules.spec` asserts no client cycle;
   - screenshots of home, map, a level and Character are pixel-equal to master (tolerance as the art tests use).
7. **Docs:**
   - `docs/architecture.md` (module table, CI layout);
   - `CLAUDE.md` / `docs/process/` (shards, `@fast` set);
   - `specs/BACKLOG.md`: strike the done lines.

## Implementation steps (TDD: failing test first in each)
1. Cycle tests (red), then the core split, then the client split.
2. Cache naming test (red), then `sw.js`.
3. Lifecycle test bound.
4. CI: install step, caching, shards and tags; measure; record times.
5. Docs.
