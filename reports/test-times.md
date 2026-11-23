# Test times (SPEC-018)

How long the Playwright suite takes, before and after SPEC-018, and what was changed to make it faster without losing
coverage. Durations come from `npx playwright test --reporter=json` (local) and from the Pages workflow log (CI).

## Before

Local: Andrei's machine (Windows 11, 8 logical CPUs, SwiftShader), `workers: 1`, `master` at `a691c07`.
CI: Pages workflow run 45098590841 (`master` at `bd26989`, the same tests), `ubuntu-latest`.

| | local | CI |
|---|---|---|
| whole suite (wall) | **22.0 min** (1323 s), 156 tests: 155 passed, 1 failed (see "Flaky" below) | test job **22 m 59 s**; the tests' own durations add up to 22.3 min |
| per file (local) | phone 501 s · gameplay 330 s · levels 280 s · pwa 101 s · smoke 52 s · names 31 s · i18n 5 s | phone 422 s · gameplay 438 s · levels 241 s · pwa 115 s · smoke 75 s · names 41 s · i18n 6 s |

20 slowest tests, local (seconds):

| # | s | test |
|---|---|---|
| 1 | 50.0 | `phone.spec.js:683 phone mini-map › edge arrows point to the off-screen Big One and downed friends` |
| 2 | 45.4 | `phone.spec.js:1034 phone banner 932×430 › the phone banner never covers the hero (932×430)` |
| 3 | 43.7 | `phone.spec.js:902 phone sizes 667×375 › every phone button is big enough at 667×375` |
| 4 | 41.4 | `phone.spec.js:1034 phone banner 844×390 › the phone banner never covers the hero (844×390)` |
| 5 | 37.7 | `phone.spec.js:1034 phone banner 667×375 › the phone banner never covers the hero (667×375)` |
| 6 | 37.1 | `levels.spec.js:445 rooms all have doors and the building has loops` |
| 7 | 24.1 | `gameplay.spec.js:1088 old saves get 0 kits` |
| 8 | 23.8 | `phone.spec.js:902 phone sizes 932×430 › every phone button is big enough at 932×430` |
| 9 | 21.2 | `gameplay.spec.js:604 old saves move into the Park` |
| 10 | 20.3 | `phone.spec.js:634 phone mini-map › the mini-map fades when someone is under it` |
| 11 | 19.7 | `levels.spec.js:496 arena has a ring with gaps` |
| 12 | 16.1 | `phone.spec.js:902 phone sizes 844×390 › every phone button is big enough at 844×390` |
| 13 | 15.2 | `gameplay.spec.js:1283 rescue kit on a touch screen › the kit button shows only when it can be used` |
| 14 | 14.8 | `levels.spec.js:394 river has bridges and the houses on opposite banks` |
| 15 | 14.6 | `levels.spec.js:717 the menu shows four worlds and switches between them` |
| 16 | 14.5 | `levels.spec.js:300 maze has 2-wide corridors and few dead ends` |
| 17 | 14.5 | `gameplay.spec.js:723 the gamepad d-pad up/down switches worlds in the menu` |
| 18 | 14.0 | `gameplay.spec.js:587 old saves get 0 kisses` |
| 19 | 13.4 | `phone.spec.js:1232 phone shop 932×430 › the phone shop fits with wider fonts (932×430)` |
| 20 | 13.3 | `names.spec.js:22 names are saved, cleaned and survive a reload` |

### Where the time goes (measured with a throwaway script, local)

| what | cost |
|---|---|
| `openGame()` (fresh page, menu ready) | 1.6–1.9 s |
| `page.reload()` until `__bbReady` | 2.9–3.0 s |
| `frames(page)` (two real frames: 3D + UI) | 0.3–0.75 s |
| `page.evaluate(() => Object.assign(big, …))` — returns the Big One, Playwright serializes him with his 3D parts | **13.8–15.1 s** |
| the same for a Little One | **11.3–12.0 s** |
| the same with braces (returns nothing) | 0.01–0.03 s |
| the first frame after a teleport | 0.4–0.55 s (no stall: the "15 s GPU stall after a teleport" in the old comments was the serialization above) |
| Playwright `expect()` inside loops | each call records a test step; the rooms test (37 s) took 0.5 s once its loop checks were collected and asserted once |
| a test's fixed cost (context, page, load, teardown) | ≈ 3.5–4.5 s, of which **1.5–2 s** was `screenshot: "only-on-failure"`: Playwright screenshots every page at the end of every test and drops the picture when the test passed |
| a second game page left open (e.g. a shared page) | the other test runs 3–5× slower: the open page keeps rendering 3D in software |
| 3D cost (throwaway build with a 512² shadow map and half the pixels) | a frame only ~1.5× cheaper, the load not at all — not worth a test-only render switch |

## After

Local, the same machine, `workers: 1`, branch `SPEC-018-fast-tests`, after the second round (shared pages in
`gameplay.spec.js` and `phone.spec.js`, review fixes). The first round's run was 11.6 min (700 s, 157 passed).

| | before | after |
|---|---|---|
| whole suite (wall) | 22.0 min (1323 s) | **9.8 min (594 s)** |
| tests | 156 (155 passed, 1 timing flake) | **157 passed**, 0 failed, 0 flaky (+1: the evaluate guard) |
| per file | phone 501 · gameplay 330 · levels 280 · pwa 101 · smoke 52 · names 31 · i18n 5 s | phone 264 · gameplay 109 · pwa 71 · levels 67 · smoke 34 · names 27 · i18n 3 s |
| fast set `npm run test:fast` | — | **15 tests, 1.4 min** (87 s wall, measured after round 1) |
| CI (Pages test job) | 22 m 59 s | to be measured on the first push of `master` after the merge |

Targets: ≤ 10 min locally — **met (9.8 min, −55 %)**; fast set ≤ 3 min — met. The 80-level test needed no timing
retry in this run (no "timing retry" annotation).
What is left: the phone layout matrices (banner, sizes, shop: real frames per case) and the tests that need a fresh
page (other query strings, viewports, the PWA service worker). Next steps are in `specs/BACKLOG.md`.

20 slowest tests after (seconds):

| # | s | test |
|---|---|---|
| 1 | 26.2 | `phone.spec.js:1102 phone banner 932×430 › the phone banner never covers the hero (932×430)` |
| 2 | 25.1 | `phone.spec.js:1102 phone banner 844×390 › the phone banner never covers the hero (844×390)` |
| 3 | 23.0 | `phone.spec.js:934 phone sizes 667×375 › every phone button is big enough at 667×375` |
| 4 | 22.9 | `phone.spec.js:1102 phone banner 667×375 › the phone banner never covers the hero (667×375)` |
| 5 | 12.3 | `names.spec.js:22 names are saved, cleaned and survive a reload` |
| 6 | 12.1 | `gameplay.spec.js:738 the gamepad d-pad up/down switches worlds in the menu` |
| 7 | 10.8 | `phone.spec.js:934 phone sizes 844×390 › every phone button is big enough at 844×390` |
| 8 | 10.5 | `phone.spec.js:934 phone sizes 932×430 › every phone button is big enough at 932×430` |
| 9 | 10.3 | `phone.spec.js:1146 phone banner too wide › the phone banner switches to the short text, and is skipped when nothing fits` |
| 10 | 9.6 | `levels.spec.js:136 the menu shows four worlds and switches between them` |
| 11 | 9.5 | `pwa.spec.js:252 on iPhone Safari › install hint shows on iPhone Safari only` |
| 12 | 9.1 | `phone.spec.js:1320 phone shop 932×430 › the phone shop fits with wider fonts (932×430)` |
| 13 | 9.0 | `phone.spec.js:156 phone 844×390 › phone mode fills the screen at 844×390` |
| 14 | 9.0 | `pwa.spec.js:218 fullscreen button is hidden in standalone mode` |
| 15 | 8.8 | `phone.spec.js:1320 phone shop 667×375 › the phone shop fits with wider fonts (667×375)` |
| 16 | 8.7 | `pwa.spec.js:157 index.html is network-first: a new version shows up online and stays offline` |
| 17 | 8.4 | `phone.spec.js:1320 phone shop 844×390 › the phone shop fits with wider fonts (844×390)` |
| 18 | 8.3 | `phone.spec.js:156 phone 932×430 › phone mode fills the screen at 932×430` |
| 19 | 8.2 | `gameplay.spec.js:619 old saves move into the Park` |
| 20 | 8.1 | `gameplay.spec.js:1298 rescue kit on a touch screen › the kit button shows only when it can be used` |

Old top-20 tests now: edge arrows 50.0 → 1.4 s, mini-map fades 20.3 → 1.3 s, rooms 37.1 → 0.2 s, arena 19.7 → 0.5 s,
maze 14.5 → 0.2 s, river 14.8 → 1.4 s, old saves 0 kits 24.1 → 3.3 s, old saves into the Park 21.2 → 8.2 s,
old saves 0 kisses 14.0 → 2.8 s. The banner tests grew a little (40 → 52 cases per size, review fix).

## What changed (coverage kept)

| change | where | why it catches the same bugs |
|---|---|---|
| evaluates that returned the Big One / a Little One return nothing (braces); guard test (scans whole files, so multi-line and `async` arrows, `littles[i]` and `littles.find(…)` are caught too) | `phone.spec.js`; `smoke.spec.js` "tests never return game objects from evaluate" | same calls and assertions; the return value was never used |
| loop checks collected, one `expect` per test (`softly()` in `helpers.js`, `phoneScreenProblems()`) | level-type tests, the Big One curve, "every world goes…", phone sizes, install hint | every check and its message is still there; a failure lists all of them (first 20/12) instead of the first one |
| one shared page for the generator tests (`levelPage` fixture); fresh-page tests first; `afterAll` closes it | `levels.spec.js` | each test starts on Park 1, English, empty level cache; errors are checked per test; menu/banner/reload tests keep a fresh page |
| one shared game page per spec for `gameplay.spec.js` and the `?phone=1` tests of `phone.spec.js` (`sharedPage()` + `resetGame()` in `helpers.js`; fixtures `page` / `phonePage`) | `gameplay.spec.js`, `phone.spec.js` | before each test the page is put back to a freshly opened game: localStorage as `openGame` leaves it, English, fresh progress and names, no gamepad stubs, empty level cache, Park 1 (phone: viewport restored, a name input closed, the mini-map fade settled); errors are checked per test. At most one shared page is open (another key or a fresh-page test closes it first: a second open game page slows the other tests 3–5×). Every assertion is unchanged. |
| real 1.1 s banner waits → `resetBannerTimer()` | "the banner names the world", the second wait in "start banner shows the level type" | the repeat rule keeps its real wait in "start banner shows the level type" |
| save shapes through `__bb.loadProgress` (test-only: the pure function the start code runs); one real reload per save test, plus the migration write-back reload | "old saves get 0 kisses", "old saves move into the Park", "old saves get 0 kits" | the same function on the same parsed object; the start path (localStorage → loadProgress → write-back) keeps real reloads |
| `screenshot: "off"` by default (`PW_SCREENSHOT=only-on-failure` to opt in) | `playwright.config.js` | diagnostics only; failures keep their message and `error-context.md`. For a failure seen only on CI: rerun it locally with `PW_SCREENSHOT=only-on-failure npx playwright test -g "<name>"`, and for layout failures imitate CI's wider fonts with `CFG.TEXT_TEST_SCALE` (BACKLOG line). `pages.yml` is unchanged. |

### Matrix trims

| matrix | before | after | what is kept and why it is safe |
|---|---|---|---|
| phone banner (per size) | 4 worlds × levels 1, 10 × 3 languages × 2 hero positions × 2 font scales = 96 | 13 (world, level, language) × 2 positions × 2 scales = 52 | The banner's place depends on the map (the hero's start), on its text and on the hero's rect, which includes the default name per language ("Player 1" / "Jugador 1" / "Игрок 1"); `placePhoneBanner` tries the full and then the short text at every height, so no single width orders the cases (review fix: the first plan used the text width only and never tested es at level 1 or park 10). Level 10 (generated: the hero starts elsewhere in every world): all four worlds, each in the language with the **widest text, the narrowest text and the widest hero name**. Level 1 (the kids' drawing: the same map in every world, only the world name changes): **Park in every language** (incl. park 1 en, the CI failure) plus the widest and narrowest (world, language) text. Widths are measured in the page with the game's fonts, so CI picks its own extremes; asserts check level 1 has every language and every world at level 10 has the widest-name language. Both positions, both font scales (×1.15 too) and all three sizes stay. Locally: park 1 en/es/ru, school 1 ru, park 10 ru/en/es, school 10 ru/es, beach 10 ru/es, winter 10 ru/es. |
| phone shop (per size) | 3 languages × 2 coin amounts × 3 font scales = 18 | 3 languages × (10 coins × 3 scales + 999 coins × ×1) = 12 (667: + 999 coins ×1.3 = 15) | 10 coins is the tighter layout (the "not enough coins" row is reserved under the cards, `noH` in `index.html`), so a wider font with 999 coins has nothing more in the way. 999 at ×1 keeps the "no 'not enough coins' when rich" check and the 932 en "nothing gives way" check. At 667, 999 coins also runs at ×1.3 (a spot check of the widest font without that row). Every language at every size stays, incl. **es at 667 ×1.15**. |
| every phone button is big enough | 667 in en/es/ru, 844 and 932 in en | unchanged | already minimal: the longest texts (es/ru) at the narrowest size and all three sizes; one assert instead of thousands (43.7 → 18.4 s) |
| 80-level fairness and fixture checks | one test each | unchanged, complete, on one page | — |

## Workers (AC 5)

One whole-suite run with `--workers=2` (local, after the test changes, before the screenshot change): **green, 157
passed, no "Target crashed"**, wall **15.6 min**, but the tests' own durations added up to 29.4 min: every test ran
about twice as slow. The suite is CPU-bound (SwiftShader renders every open game page non-stop on all cores), so 2
workers gave no gain over 1 and doubled each test's exposure to its timeout. A second 2-worker run was not made: with
no gain there was nothing to keep. **`workers` stays 1** (local and CI). The CI part of AC 5 is deferred: only `master` may be pushed, so a 2-worker CI run cannot be tried on the branch; trying 2 on CI (4 vCPU) is in the BACKLOG.
No shared state blocks parallel runs (localStorage is per context, the PWA tests use their own servers or the
stateless `webServer`).

## Flaky tests (AC 7)

| test | what was done | `--repeat-each=5` |
|---|---|---|
| phone "the camera follows the hero and stops at the map edges" | bots rest (`calmAll`); the walk is one evaluate (key down, logic + camera steps, key up), no real frames in between | 5/5 passed |
| phone "mini-map shows the level and everyone on it" (fixed in SPEC-010) | unchanged | 5/5 passed |
| phone "edge arrows point to the off-screen Big One and downed friends" (fixed in SPEC-010) | serialization fix (50 → 4 s) | 5/5 passed |
| levels "all 80 levels are fair and build fast" (failed in the baseline run: park 12 took 450 ms) | a build ≥ 200 ms is timed again; the fastest of up to 3 full builds counts | 5/5 passed |
