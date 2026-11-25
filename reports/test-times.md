# Test times (SPEC-018, SPEC-023, SPEC-011)

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
| CI (Pages test job) | 22 m 59 s | **11 m 14 s** (run 45115173852, `master` at `32faffb`; `npx playwright test` step 10 m 43 s) |

Targets: ≤ 10 min locally — **met (9.8 min, −55 %)**; ≤ 12 min on CI — **met (11 m 14 s, −51 %)**; fast set ≤ 3 min — met. The 80-level test needed no timing
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

# SPEC-023: GPU locally, below-normal priority, sharded CI, logic tests in sim mode

## Before

The planned local "before" run on `master` (`7498cec`) was stopped by the system (low memory) and not repeated; the
numbers come from the records. The old config drew with SwiftShader everywhere, which is what `PW_GPU=0` does now.

| | value | source |
|---|---|---|
| local whole suite | **~25 min** (~244 tests, SwiftShader, normal priority) | orchestrator notes, SPEC-016…019 queue; SPEC-018 measured 9.8 min for 157 tests (above) |
| local fast set | 1.4 min (15 tests, SPEC-018) | above |
| local balance | 139 s (`durationSec` in `reports/balance.json` on `master`) | `reports/balance.json` |
| CI (Pages workflow, one `test` job) | test job **15 m 08 s** (run 45272975936, `ada0f78`; `npx playwright test` step 14 m 34 s), **21 m 17 s** (45253495054, `592371b`), **19 m 39 s** (45245942170, `52e4704`); whole run incl. deploy 15 m 30 s / 21 m 41 s / 19 m 42 s | `gh run view <id> --json jobs` |

## After

Local: the same machine (Windows 11, 8 logical CPUs, Intel UHD Graphics, 32 GB), branch `SPEC-023-light-tests`, default
settings = **GPU and below-normal priority**. **The machine was busy during all local runs**: other Claude Code sessions
of other projects ran their own Playwright suite, vitest and perf scripts at normal priority (CPU 60–100 % before our runs
started). A below-normal run gives way to all of that, so the local numbers are an upper bound, not the quiet-machine time.

| | before | after |
|---|---|---|
| local whole suite, GPU (default) | ~25 min (SwiftShader) | **15.5 min** (15 m 45 s wall), **248 passed** |
| local whole suite, `PW_GPU=0` (SwiftShader, as before) | ~25 min | **not completed — skipped on Andrei's word** (CI's SwiftShader shards are the proof that this backend passes). Two attempts were stopped: at below normal (21:30–22:23) it starved into 90 s timeouts (14 tests, all `Test timeout` / `waitForFunction` timeouts, none an assertion); with `PW_NICE=0` (22:37–23:06) it reached `economy.spec.js` in 28 min with 3 timeouts — SPEC-020's tests (another agent in a worktree) overlapped with it 22:34–22:58 |
| local fast set, GPU | 1.4 min (15 tests) | **1.4 min** (88 s wall), 29 passed |
| local fast set, `PW_GPU=0` | — | **4.0 min** (245 s wall), 29 passed |
| local balance (`npm run balance`) | 139 s | **171 s** (below normal on the busy machine; the report itself unchanged) |
| balance on GitHub (`balance.yml`, run 45292838058) | — | **53 s** run (script 21 s; checkout + npm ci + Chromium 21 s) |
| CI whole suite per push (`tests.yml`, 4 shards + merge) | 15–21 min (one job) | **8 m 33 s** (run 45292838040, shards by file: 8:11 / 6:07 / 0:52 / 2:56), **7 m 28 s** (run 45294116381, `fullyParallel` on CI: shards 3:32 / 3:06 / 6:21 / 7:08, merge 16 s), **8 m 25 s** (run 45312023244, docs push: shards 2:18 / 3:00 / 3:49 / 8:06 — the last shard holds the phone/PWA/smoke tail), **7 m 34 s** (run 45315561445, review fixes: shards 2:45 / 7:09 / 5:03 / 4:19, merge 19 s) |

Priority (AC 2), checked with `Get-CimInstance Win32_Process` / `Get-Process … PriorityClass` during a default run of one
file: runner `node … cli.js test` base 6 = BelowNormal, its worker BelowNormal, the worker's browser and its renderer and
utility processes BelowNormal, no separate GPU process (`--in-process-gpu`). A "Normal" runner seen meanwhile was a run
with `PW_NICE=0` set on purpose, or the other agent's run in `C:	mpebebe-020` (on `master`, without SPEC-023).
Below normal gives way to every normal program: with SwiftShader and another session's tests running at normal priority,
it starves (see the `PW_GPU=0` row) — run SwiftShader locally as `PW_GPU=0 PW_NICE=0`. Even with the GPU it starves
while another session runs its tests at normal priority: the priority check run of `smoke.spec.js` (23:10–23:25, next to
the SPEC-020 agent's Playwright run from `master`) took 15.3 min with 4 page-load timeouts (`__bbReady` not within 30 s);
the same 4 with `PW_NICE=0` passed in 38.5 s. Once every session runs SPEC-023's config, all test runs are below normal
and share the CPU evenly.

Targets: CI ≤ 8 min — **borderline: met twice (7 m 28 s, 7 m 34 s), 8 m 25 s and 8 m 33 s on the other pushes** (−45…−65 % against 15–21 min). Local whole ≤ 12 min with GPU — **not met on the busy machine
(15.5 min)**; fast set ≤ 2 min — **met (1.4 min)**. The GPU makes the fast set 2.8× faster than SwiftShader on the same
machine. CI shards are still uneven (3–7 min): Playwright splits by test count, and the phone, menu and PWA tests
(rendered, ~25–33 s each on CI) sit at the end of the file order; the sum of all tests on CI is 17.5 min
(phone 329 s, menus 188, gameplay 160, economy 143, smoke 71, pwa 69, levels 56, names 21, balance 9, invariants 4 s).
Next step if CI must get faster: split `phone.spec.js` or weight the shards (BACKLOG).

### What changed

| change | where | effect |
|---|---|---|
| hardware WebGL locally (`--use-gl=angle --use-angle=d3d11` on Windows; `metal` / `gl` elsewhere); SwiftShader on CI, with `PW_GPU=0`, or after a failed GPU probe | `tests/test-env.js`, `playwright.config.js`, `tests/global-setup.js` | 3D frames cost the GPU instead of all CPU cores; renderer checked by `tests/env.spec.js` |
| below-normal priority for the runner, workers, browsers and `npm run balance` (`PW_NICE=0`: off); `--in-process-gpu` on Windows because Chrome raises its GPU process to "Above normal" | `tests/test-env.js`, `tests/global-setup.js`, `scripts/balance.js` | the computer stays responsive; measured: every browser process "Below normal" (`tests/env.spec.js`) |
| 90 logic-only tests (96 with the per-type loop) run on sim pages | gameplay 50, economy 10, invariants 7, levels 19 (+6 from the loop), i18n 3, names 1 | no 3D, no drawing, no audio while they run; every assertion kept |
| sim guard: `frames()`, `page.screenshot()` and `__bb.SIM_DRAWN` throw in sim mode | `tests/helpers.js`, `index.html`, `balance.spec.js` test | a visual test cannot silently run on a sim page |
| 4 CI shards, blob reports merged into one HTML report, Pages reuses them | `.github/workflows/tests.yml`, `pages.yml` | CI per push 15–21 → 7.5 min |
| failure screenshots of every open page, only when a test fails | `tests/pw.js` | CI artifacts show the screen; no cost when green |

### Tests that moved to sim mode (rendered → sim)

Line numbers as on `master` before SPEC-023.

Two tests were tried in sim and moved back, because they need the frame loop or sound: economy "upgrades apply to
players only and stop at level 3" (asserts a sound request, none in sim) and gameplay "kiss keys for one and two
players" (the gamepad is polled by the frame loop).

- gameplay.spec.js:26 "a hug from behind takes one heart and shocks the Big One"
- gameplay.spec.js:36 "seen from the front, a Little One is pushed and breaks a leg"
- gameplay.spec.js:62 "rescue takes 3 seconds and drains when the helper leaves"
- gameplay.spec.js:86 "pushing the helper resets the rescue"
- gameplay.spec.js:104 "bots wait before they go to rescue"
- gameplay.spec.js:128 "an unrescued Little One rests 30 seconds"
- gameplay.spec.js:165 "winning gives stars and coins, unlocks the next level and survives a reload"
- gameplay.spec.js:223 "the reward grows with the world"
- gameplay.spec.js:291 "each rest takes coins from the level reward"
- gameplay.spec.js:300 "warm mittens: bought in the shop, a hug takes 2 hearts and uses a charge"
- gameplay.spec.js:311 "buying mega mittens: 3 charges, a hug takes 3 hearts"
- gameplay.spec.js:321 "not enough coins: nothing is bought"
- gameplay.spec.js:328 "the Big One never enters the Little Ones' house"
- gameplay.spec.js:338 "a banana makes the Big One slip; he can be hugged from the front"
- gameplay.spec.js:351 "picking up speed boots makes a Little One faster for a while"
- gameplay.spec.js:364 "the Big One's house is a danger zone"
- gameplay.spec.js:382 "staying 5 s in the Big One's house throws you out"
- gameplay.spec.js:423 "downed Little Ones have no house timer, the shield does not help"
- gameplay.spec.js:442 "bots don't linger in the Big One's house"
- gameplay.spec.js:463 "bonus stars appear and disappear"
- gameplay.spec.js:489 "stars spawn only in fair places"
- gameplay.spec.js:524 "only players pick up stars"
- gameplay.spec.js:592 "a danger zone without exits throws out to the nearest free cell"
- gameplay.spec.js:612 "buying air kisses"
- gameplay.spec.js:631 "old saves get 0 kisses"
- gameplay.spec.js:720 "old saves move into the Park"
- gameplay.spec.js:768 "throwing spends a kiss and has a cooldown"
- gameplay.spec.js:914 "no kisses from the safe house"
- gameplay.spec.js:931 "kisses stop at walls and fly over ponds"
- gameplay.spec.js:964 "trees, rocks and the map edge stop kisses; bushes do not"
- gameplay.spec.js:1004 "a kiss never hits the Big One through a wall"
- gameplay.spec.js:1039 "a kiss takes half a heart and makes him blush"
- gameplay.spec.js:1074 "kisses during shock or blush do no damage"
- gameplay.spec.js:1099 "a blushing Big One can be hugged"
- gameplay.spec.js:1117 "the last half heart by a kiss wins the level"
- gameplay.spec.js:1137 "hearts bar shows half hearts"
- gameplay.spec.js:1197 "buying rescue kits"
- gameplay.spec.js:1213 "old saves get 0 kits"
- gameplay.spec.js:1233 "a kit gets a downed player up at once"
- gameplay.spec.js:1274 "a kit ends limping home"
- gameplay.spec.js:1288 "a kit ends the rest"
- gameplay.spec.js:1303 "a kit while down keeps the nobody-out star"
- gameplay.spec.js:1463 "a kit does not throw an air kiss right after"
- gameplay.spec.js:1656 "the Big One turns when a kid runs behind him"
- gameplay.spec.js:1729 "tiptoeing behind him is silent"
- gameplay.spec.js:1781 "no hearing while stunned or blushing"
- gameplay.spec.js:1820 "cooldown after a turn"
- gameplay.spec.js:1844 "noise turn leads to a chase"
- gameplay.spec.js:1906 "bots tiptoe near the Big One"
- gameplay.spec.js:1949 "the careful autopilot tiptoes near his back, the reckless one runs"
- economy.spec.js:95 "every coin change is in the ledger"
- economy.spec.js:166 "the reward rules: first win, replay, new stars, rests with floors, difficulty 0 and 4"
- economy.spec.js:229 "leaving a level early pays only the hugs"
- economy.spec.js:375 "every win-screen text is in three languages"
- economy.spec.js:388 "every wardrobe item has an id and a price; the basic ones and every default look are free"
- economy.spec.js:487 "random outfit uses only owned items; bots may wear anything"
- economy.spec.js:600 "every wardrobe text is in three languages"
- economy.spec.js:699 "upgrades are saved, merged with defaults and cleaned"
- economy.spec.js:816 "every upgrade text is in three languages"
- economy.spec.js:874 "a pause during the final hug and Map still counts the win; coins load as a whole number ≥ 0"
- invariants.spec.js:32 "the Big One never outruns a player, patrols slower than he chases, bots outrun his search"
- invariants.spec.js:54 "tiptoe speed is at least half the player speed and below the running line"
- invariants.spec.js:62 "a friend can always arrive in time, and a Little One just stood up is not pushed at once"
- invariants.spec.js:95 "rewards add up, coins never go negative, inventory stays whole"
- invariants.spec.js:205 "every known save shape loads into the current one and round-trips"
- invariants.spec.js:227 "old saves get the new worlds"
- invariants.spec.js:263 "a whole old save starts the game: progress moves, outfits and names load, the game writes them back the same"
- i18n.spec.js:5 "es and ru have every key that en has, with the same type"
- i18n.spec.js:25 "every STORY text is in en, es and ru"
- i18n.spec.js:36 "the tiptoe rule and the heard hints are in en, es and ru"
- levels.spec.js:212 "worlds follow the story order"
- levels.spec.js:260 "level 1 is the kids' drawing in every world"
- levels.spec.js:279 "maps are fixed and differ between worlds"
- levels.spec.js:305 "old worlds keep their maps"
- levels.spec.js:325 "all 120 levels are fair"
- levels.spec.js:370 "the Big One gets faster inside a world and never outruns a player"
- levels.spec.js:483 "difficulty follows the story order"
- levels.spec.js:561 "meadow is open with bushes"
- levels.spec.js:581 "maze has 2-wide corridors and few dead ends"
- levels.spec.js:622 "village has cottages, streets and a square"
- levels.spec.js:680 "river has bridges and the houses on opposite banks"
- levels.spec.js:733 "rooms all have doors and the building has loops"
- levels.spec.js:786 "arena has a ring with gaps"
- levels.spec.js:828 "the game starts exactly the level that levelReport checks"
- levels.spec.js:865 "restarting a retried level builds it from the cache, the same as a fresh build"
- levels.spec.js:884 "a level with no fair layout falls back and warns"
- levels.spec.js:1007 `${type}: 60 s of play, nobody stuck`
- levels.spec.js:1027 "kisses stop at maze walls and cottages and fly over the river"
- levels.spec.js:1089 "rooms and arena need diagonal houses even if the CFG pairing is removed"
- names.spec.js:23 "names are saved, cleaned and survive a reload"

## SPEC-011 phase A: every test over http (AC 8, 8b)

The tests open the game from `scripts/serve.js` (`http://localhost:8123/index.html`) instead of `file://`, service workers
are blocked outside `pwa.spec.js`, and every test game is seeded from the test title. Expected growth of the CI time per
push: ≤ 10 %.

## Before

The last 7 green Tests runs (`tests.yml`, 4 shards, `ubuntu-latest`) before phase A, from `gh run view <id> --json jobs`
(seconds; wall = run created → run finished, includes the queue and the merge-reports job):

| run | commit | wall | shard 1 | shard 2 | shard 3 | shard 4 | shards together |
|---|---|---|---|---|---|---|---|
| 45549853445 | `96879aa` | 1284 | 372 | 557 | 549 | 586 | 2064 |
| 45547344922 | `d3443a0` | 975 | 350 | 435 | 953 | 820 | 2558 |
| 45535987930 | `98c9901` | 749 | 504 | 539 | 731 | 651 | 2425 |
| 45530836647 | `b9466bd` | 957 | 366 | 315 | 936 | 815 | 2432 |
| 45525827338 | `af4d29f` | 912 | 486 | 564 | 894 | 855 | 2799 |
| 45523693201 | `2590342` | 977 | 378 | 424 | 952 | 777 | 2531 |
| 45513805116 | `26527e3` | 888 | 544 | 540 | 778 | 848 | 2710 |
| **median** | | **957 (16.0 min)** | | | | longest shard **894 (14.9 min)** | **2531 (42.2 min)** |

## After

The Tests runs of the phase A branch (same columns; the `lint` job, ~15 s, runs in parallel with the shards):

| run | commit | wall | shard 1 | shard 2 | shard 3 | shard 4 | shards together |
|---|---|---|---|---|---|---|---|
| 45555074702 | `e0a631a` (tests over http) | 848 | 290 | 451 | 783 | 825 | 2349 |
| 45556873107 | `d2c4667` (+ import map, site, lint) | 983 | 307 | 570 | 962 | 818 | 2657 |

Against the medians before: wall −11 % / +3 %, longest shard −8 % / +8 %, shards together −7 % / +5 % — within the
≤ 10 % growth AC 8b allows (the spread between runs on the shared runners is larger than the change).

