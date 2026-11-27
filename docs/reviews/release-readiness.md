# Release-readiness review (SPEC-024)

Base: `master` a52ecec (SPEC-031 merged), 2026-11-25. Read-only review by seven independent reviewers (opus subagents that did not write the code), one per lens: 1 Architecture (A), 2 Saves and data (S), 3 Packaging and offline (P), 4 Performance on weak devices (F), 5 Store policy and privacy (K), 6 Robustness (R), 7 Maintainability and release process (M). Every finding was checked against the code, the CI logs or the GitHub API. This report merges and de-duplicates them: each merged finding has a new id `RR-NN`, and the original lens ids are in brackets.

Severity: **BLOCKER** = stops a store release or makes the next spec fail as written. **HIGH** = a child can lose progress or get a broken game, or a release step fails often. **MEDIUM** = a real risk with a workaround, or a gap in a plan. **LOW** = clean-up.

Updated after the reviews of this report (fix round): SPEC-011 and SPEC-025 now run as three merges each (phases), RR-30's fix keeps today's update timing, RR-71 moved to SPEC-011 and RR-16 to SPEC-012, RR-51 is deferred, and RR-17, RR-24 and RR-52 were corrected.

Spec column: **011** = SPEC-011 (module split, runs next), **012** = SPEC-012 (headless core), **025** = SPEC-025 (production foundation), **later** = a later release spec (packaging, store texts, signing, performance pass), **BACKLOG** = a line in `specs/BACKLOG.md` marked "(release review)". The ACs added to the three specs carry the same RR id.

---

## 1. Summary

**Verdict: not ready for a store release.** It is a good game and a solid web PWA. But a store build today would fail the "fully offline" goal on first launch, load executable code from a third-party CDN, freeze for good on any runtime error, and let a child wipe all progress with a double tap. There is also no privacy page inside the app. The planned specs (SPEC-011, SPEC-012, SPEC-025) cover most of this once the corrections in this report are added. After them, a packaging spec (Capacitor, store texts, signing, a performance pass) is still needed.

**Counts (merged):** 4 BLOCKER, 27 HIGH, 36 MEDIUM, 17 LOW (84 findings from 98 lens findings).

**Top 5 risks**

| # | Risk | Findings | Fixed by |
|---|---|---|---|
| 1 | **Not offline, third-party code.** three.js loads from jsDelivr. A store app opened without Wi-Fi shows "needs internet". Every cold start sends the child's IP to a CDN. Apple 2.5.2 (downloaded code) and 1.3 (Kids: no data to third parties) both apply. | RR-29, RR-65 | SPEC-025 |
| 2 | **A frozen screen on any error.** One exception in the frame loop stops `requestAnimationFrame` for good. A failed start blames the internet and has no Retry button. A lost WebGL context leaves a black field. | RR-64, RR-65, RR-41 | SPEC-025 |
| 3 | **A child can lose all progress.** A double tap resets everything, with no gate and no undo. An unreadable save is silently replaced, sometimes at startup. The planned backup is only one write deep, and the planned single-key migration drops unknown fields, so a rollback or a stale tab loses progress. | RR-17…RR-21 | SPEC-025 |
| 4 | **The module split as written cannot succeed, and it can break the PWA.** The logic calls sound, saving and 3D directly, so "core never imports client" is impossible without a hooks port. The module tree covers half of today's 9,387-line file. Six scripts and tests read `index.html` as text. Per-file network-first can mix module versions. There is no check for undefined names. | RR-01…RR-03, RR-30, RR-75, RR-76 | SPEC-011 |
| 5 | **Weak devices.** There are no quality tiers, so tablets run the heaviest path. A background palm is 30 draws plus 30 shadow draws. All sprites are decoded at once (~70 MB). WebGL context loss is not handled. Nothing has been measured on a real low-end phone. | RR-41…RR-46 | later (performance pass), SPEC-025 (context loss, perf hook) |

Also blocking a submission: no privacy page or parents' area in the app (RR-52), a parental gate planned as "hold 3 seconds" (RR-53), and the Pages deploy failing in about 1 of 3 runs with green tests (RR-74), so fixes do not reach players reliably. At review time the live site still served SPEC-030.

**What is already good.**
- No ads, no analytics, no trackers, no web fonts, no third-party SDKs and no `fetch`/XHR/WebSocket/`sendBeacon`.
- No links out of the app, no permission prompts, no real-money purchases and no loot boxes (the 🎲 picks only from owned outfits).
- Names are free text that stays on the device.
- Every `localStorage` access is in `try`, and the loaders never throw. 13 old save shapes are tested as fixtures.
- `dt` is clamped, and there is no lose state any more.
- Every sprite has a code-drawn fallback. Audio is synthesized, so there are no files and no autoplay.
- Every rebuild path calls `disposeTree`. Materials are cached, DPR is capped, and there is a leak test and an A/B perf script.
- All paths are relative, so the game runs from a sub-path or `capacitor://localhost`.
- The process docs, spec trail and CI sharding are thorough.

---

## 2. Findings

### 2.0 Index

| RR | Sev | Title | Lens ids | Spec |
|---|---|---|---|---|
| RR-01 | BLOCKER | The logic calls the client directly; the split needs a hooks port and a client-free `buildGame` | A1 | 011 |
| RR-02 | HIGH | SPEC-011 module tree predates SPEC-016…031; half the code has no module | A2, M12 | 011 |
| RR-03 | HIGH | Scripts and tests read or write `index.html` as source | A8, P16 | 011 |
| RR-04 | HIGH | The tutorial is woven into the core; its win path calls the menu flow | A6 | 011 + 012 |
| RR-05 | HIGH | `mode` is both the client screen and the game phase | A3 | 012 (+011 setter) |
| RR-06 | HIGH | The one live game is also the menu backdrop and the wardrobe stage | A4 | 012 |
| RR-07 | HIGH | Game state not contained: 3D models on logic objects, mutable `const` containers | A7 | 012 |
| RR-08 | HIGH | Live play steps on frame time; only sim is fixed-step — done (SPEC-034: fixed 1/60 s step everywhere) | A5, F13 | 012 (document) + decision |
| RR-09 | MEDIUM | Core-bound code touches DOM and storage at import | A9 | 011 |
| RR-10 | MEDIUM | `CFG` mixes logic and look numbers | A12 | 011 |
| RR-11 | MEDIUM | The logic makes translated text and UI-only state | A10 | 012 |
| RR-12 | MEDIUM | Reward and lock rules in the client; mid-level economy writes vs a result event | A11, S9 | 011 + 012 |
| RR-13 | MEDIUM | The "same game" baseline covers an empty inventory only | A13 | 011 + 012 |
| RR-14 | MEDIUM | `window.__bb` is a 184-member unlisted surface; shims can hide real paths | M9 | 011 + 012 |
| RR-15 | LOW | `architecture.md` line table and section headers mislead the split | A14, M12 | 011 |
| RR-16 | LOW | Hidden state changes in the frame loop and in drawing | A15 | 012 (AC 1f, moved from 011) |
| RR-17 | HIGH | Single-key migration plan unsafe (key-presence rules, old tabs, unknown fields, rollback) | S4, M5 | 025 |
| RR-18 | HIGH | "Reset progress" = two quick taps, no grown-up check, no undo — done (SPEC-025, SPEC-033: the reset is on the grown-ups page) | S2, R3 | 025 + decision |
| RR-19 | HIGH | An unreadable save is replaced without a trace, sometimes at startup | S1 | 025 |
| RR-20 | HIGH | The planned backup is one write deep | S3 | 025 |
| RR-21 | HIGH | Saves are synchronous `localStorage` at import; the wrapper needs an async native store | S5 | 025 + later |
| RR-22 | MEDIUM | Save loading depends on the top-level code order the split will change | S10 | 011 |
| RR-23 | MEDIUM | Failed writes are swallowed; nothing tests broken storage | S6, M14 | 025 |
| RR-24 | MEDIUM | A win in its last ~4 s is lost if the app is hidden or killed | S7, R5 | 025 |
| RR-25 | MEDIUM | Outfits are saved as list indexes | S8 | 025 |
| RR-26 | MEDIUM | Web version: shared github.io origin, Safari 7-day eviction | S11 | later + decision |
| RR-27 | LOW | Load validation gaps (inventory, equip, coins, root type) | S13 | 025 |
| RR-28 | LOW | Parents' save code: missing details | S14 | 025 |
| RR-29 | BLOCKER | three.js loads from jsDelivr at runtime | P1, K1, M7 | 025 |
| RR-30 | HIGH | `src/**` network-first per file can mix module versions | P3, M3, M14 | 011 |
| RR-31 | HIGH | Site file list in three places; CI never tests `_site` or the deployed site | P2, M14 | 011 |
| RR-32 | HIGH | Capacitor vs TWA still open; TWA breaks "offline" and "nothing leaves" | P7, K8 | later + decision |
| RR-33 | HIGH | Storage origin in the wrapper; PWA saves do not move to the store app | P6, S12 | later + 025 note |
| RR-34 | HIGH | Fullscreen button is dead in a native wrapper and on iPhone — done for the web (SPEC-038: hidden without the Fullscreen API; the native-wrapper half comes with the wrapper) | P5 | later + BACKLOG |
| RR-35 | MEDIUM | Service worker inside the native wrapper | P8 | later |
| RR-36 | MEDIUM | Minimum OS / WebView / GLES not declared | P9, F10 | later + decision |
| RR-37 | MEDIUM | Safe areas and system bars on Android edge-to-edge | P10 | later |
| RR-38 | MEDIUM | Orientation locked only by the web manifest; tablets in portrait — done (SPEC-038: tablets and tall windows play letterboxed; native orientation keys come with the wrapper) | P11 | later + BACKLOG |
| RR-39 | LOW | Sprite precache best-effort; the offline test does not check art — done (SPEC-038) | P14 | BACKLOG |
| RR-40 | LOW | Store icons, splash and manifest fields are web-only | P15 | later + BACKLOG |
| RR-41 | HIGH | WebGL context loss not handled | F3, P12, R6 | 025 |
| RR-42 | HIGH | Draw calls: two meshes per part, no sharing, hulls cast shadows — done (SPEC-040: shared geometries, instanced and joined static parts, hulls never cast shadows; the busiest levels draw 145–172 calls on the phone and 203–234 on a tablet, was 690–1160 and 1510–3061) | F1 | later |
| RR-43 | HIGH | No quality tiers; tablets get the heaviest path — done (SPEC-040: `LOOK.QUALITY` tiers, a start probe, a step down after 5 s of slow frames, a picture-quality setting on the grown-ups page) | F2 | later + decision |
| RR-44 | MEDIUM | Memory checks partial; no perf hook for device measurement | F6 | 025 |
| RR-45 | MEDIUM | First load parses ~3 MB of unminified JS | F11 | 025 |
| RR-46 | MEDIUM | All 155 sprites decoded at start (~70 MB) — done (SPEC-040: 22 MB decoded at the home screen, was 83 MB; sprites load per screen and are released) | F4 | later |
| RR-47 | MEDIUM | Full-rate rendering under opaque menus, pause, rotate prompt — done (SPEC-040: no `render3D` under a cover, once while paused, menus at `LOOK.MENU_FPS`) | F5 | later |
| RR-48 | MEDIUM | Level start: new geometries and no shader warm-up — done (SPEC-040: the level card warms up the level; nothing new is built in the first 60 frames) | F7 | later |
| RR-49 | MEDIUM | Text fit/wrap re-measured every frame — done (SPEC-040: text widths and fits are remembered; home and the Character tabs measure nothing per frame) | F8 | later |
| RR-50 | MEDIUM | Trees, bushes and roofs are transparent all the time — done (SPEC-040: opaque until a fade starts) | F9 | later |
| RR-51 | LOW | Per-frame garbage; event-log splice; A* allocations — done (SPEC-040: event-log ring, per-game scratch buffers, drawUI lists reused, preview keys without `JSON.stringify`) | F12 | BACKLOG (deferred from 012) |
| RR-52 | BLOCKER | No privacy policy or parents' page in the app | K2 | 025 (slot) + later + decision |
| RR-53 | HIGH | Planned parental gate is not an adult task; no Portuguese | K3 | 025 |
| RR-54 | HIGH | Rules text: Dad "pushes you and breaks your leg", "limp home" — done (SPEC-033) | K4 | decision + later |
| RR-55 | MEDIUM | SPEC-013 "Share" / `?room=` links would leave the app without a gate | K5 | BACKLOG |
| RR-56 | MEDIUM | SPEC-013 sends a persistent `deviceId` | K6 | BACKLOG |
| RR-57 | MEDIUM | Online server data handling not written as a kids' policy needs | K7 | BACKLOG |
| RR-58 | LOW | Error log and handlers must stay local and name-free | K10 | 025 |
| RR-59 | LOW | `navigator.storage.persist()` prompts in Firefox | K11 | 025 |
| RR-60 | LOW | Shop wording looks like a purchase screen — done (SPEC-033) | K9 | decision + later |
| RR-61 | LOW | Kostya's name in the credits and the public repo | K12 | decision + BACKLOG |
| RR-62 | LOW | `v1-2d/`, `__bb`, debug flags must not ship in the store build | K13 | later |
| RR-63 | LOW | Strangers can join a room through a forwarded link | K14 | BACKLOG |
| RR-64 | BLOCKER | Any exception in the frame loop freezes the game for good | R1 | 025 |
| RR-65 | HIGH | Failed start: endless loading screen, "needs internet" for every cause, no Retry, no WebGL2 check | P4, R2, F10 | 025 |
| RR-66 | MEDIUM | Lifecycle: no pause on hide/blur, audio "interrupted" never resumed, audio unlock | R5, P13, R9 | 025 |
| RR-67 | MEDIUM | Benign promise rejections would trigger false Oops cards | R9 | 025 |
| RR-68 | MEDIUM | Two taps in one frame run two actions (skip into a locked level, buy without confirm) | R7 | 025 |
| RR-69 | MEDIUM | Gamepads tracked by list position: a disconnect swaps players, phantom presses | R8, M14 | 025 (may move later) |
| RR-70 | MEDIUM | Android Back leaves the app mid-level — done (SPEC-033: "Leave the game?"; the store wrapper's native Back is later) | R10, P12 | 025 (seam) + later + decision |
| RR-71 | MEDIUM | Flaky `bosses.spec.js:143` (assert :163): the cause is unseeded test starts | R11 | 011 (AC 8d, Phase A) |
| RR-72 | LOW | Rotation/resize edge cases (live buttons under the rotate overlay, resize storms) — done (SPEC-038) | R12 | BACKLOG |
| RR-73 | LOW | Two fingers on one stick half stop the hero — done (SPEC-038) | R14 | BACKLOG |
| RR-74 | HIGH | Pages deploy fails ~1 in 3 runs with green tests; master not live | R4, M1 | 011 |
| RR-75 | HIGH | The 9,400-line split runs with no undefined-name check | M2 | 011 |
| RR-76 | HIGH | "All tests over http" under-specified: balance/perf scripts, SW in every test, file:// SW test | M4 | 011 |
| RR-77 | HIGH | No store release pipeline: signing keys, tag → build, staged rollout, store rollback | M6, M15 | later + decision |
| RR-78 | MEDIUM | Dependency updates: three.js in three places, Dependabot PRs get no CI, `lts/*` | M7 | 025 |
| RR-79 | MEDIUM | Text-fit tests depend on the CI machine's fonts — CI font mode done (SPEC-033; the bundled font is later) | M8 | decision + BACKLOG |
| RR-80 | MEDIUM | SPEC-012 Node tests: Playwright would load them; planned to gate only master | M10 | 012 |
| RR-81 | MEDIUM | CI time doubled in two days; uneven shards | M11 | BACKLOG |
| RR-82 | MEDIUM | No web rollback or hotfix runbook — done (SPEC-033) | M13 | 025 + decision |
| RR-83 | LOW | CI gate details: `retries: 0`, report shard count, actions pinned by tag | R13 | 025 + decision |
| RR-84 | LOW | Bus factor: one account, unprotected `master` | M15 | 025 + decision |

### 2.1 Architecture (core / client split)

Context: `index.html` is 9,387 lines (module 49–9385). The 2D layer is 2,705 lines and the 3D layer 2,245. About 3,000 lines are core-like and 5,500 client, and an 840-line middle block (2243–3085) mixes both. There are ~154 module-level `let`s plus ~20 mutable `const` containers.

#### RR-01 BLOCKER: The logic calls the client directly; SPEC-011 AC 3 cannot be met as written [A1]
- **Location:** `resetWorld` 2750 (`PHONE`, `skinSel`/`makeLook`, `sticks.clear()`, `rebuild3D()`); `startGame` 2801 (`endTryOn`, `showBanner`, `camSnap`); `winNow` 3526–3530 (`tutorialNext`, `giveReward`, `SFX.win`, `burst`); `hug` 3483 (`saveProgress`); `updateStars` 3669 (`addCoins`); `throwKiss` 3540 / `useRescueKit` 4105 (`saveInv`); `logEvent` 2491 (`tutorialNote`); `SFX.*` ×17, `burst` ×17, `popText` ×18 in 3409–4251.
- **Why:** SPEC-011 forbids any core → client import but keeps the module-level state and leaves sound, particles and saves to SPEC-012. `CORE_DOM_ALLOW` allows DOM names, not imports. So `SFX`, `burst`, `rebuild3D`, `saveProgress`, `skinSel`, `sticks` and `openScene` have no legal home, and every one is a cycle. The run will either break AC 3 or do half of SPEC-012 without its tests. The split is the base for both the store build and online play.
- **Fix:** One port `src/core/hooks.js` (`setHooks({ sfx, burst, pop, shake, save, rebuild, onWin, onPracticeWin, … })`, no-op defaults so Node import works). The client registers the real functions in `main.js`, and SPEC-012 replaces the hooks with events. `resetWorld` splits into a client-free core `buildGame(world, n, players)` (not pure: it still draws game `rng()`) and a client wrapper that does the 3D rebuild, `sticks.clear`, the phone one-player rule and `skinSel`.
- **Spec:** SPEC-011 AC 3b, 3c.

#### RR-02 HIGH: SPEC-011's module tree predates SPEC-016…031 [A2, M12]
- **Location:** SPEC-011 AC 2, compared with: art loader 465–646; `STORY` 974–1101; practice map 1404–1437; menus/flow/tutorial 2804–3085; autopilot + hearing + `update` 3854–4251; 2D 4252–6957; 3D 6958–9203.
- **Why:** The tree was written for a ~4,900-line file. It has no home for the art loader, story data, menus/flow, tutorial, world lock rules, autopilot, hearing, moods/bosses/kind walk, home, map + level card, story/comic/bubbles, Character (Progress/Items/Wardrobe/Upgrades), text fit, houses, materials/paper grain, boss parts or previews. With "no file over ~900 lines", `ui/overlay.js` would become a second `index.html`.
- **Fix:** Rewrite the tree to match today's code and add a static check that fails on any `src/**` file over 900 lines.
- **Spec:** SPEC-011 AC 2b, 2d.

#### RR-03 HIGH: Scripts and tests read or write `index.html` as source [A8, P16]
- **Location:**
  - `scripts/assets.js` 465–531 writes `ART_NAMES` between markers in `index.html`.
  - `scripts/docs-numbers.js` 12/18/149 evaluates `CFG`, `GLOVES`, … from `index.html`.
  - `scripts/perf.js` 71 runs `git show <ref>:index.html`.
  - `scripts/balance.js` reads texts.
  - Tests: `tests/art.spec.js` 10–18; `assets.spec.js` 128–131; `economy.spec.js` 82/904/925; `invariants.spec.js` 29/331; `menus.spec.js` 869; `smoke.spec.js` 172–175 (lookbehind scan); `pwa.spec.js` 144–149 (three.js URL regex).
  - `.github/workflows/pages.yml` 39–40.
- **Why:** After the split, `npm run assets` (Andrei's art pipeline) has nowhere to write, `docs:numbers` finds no `CFG`, and the art and lookbehind scans silently check an empty shell. They pass while checking nothing.
- **Fix:** Generate `src/client/art-names.js`. `docs-numbers` imports the config modules. Scans cover `src/**/*.js`. `perf.js` serves a git ref's whole tree. A test fails if any script or test still reads game code from `index.html`. Import three.js everywhere as the bare specifier `three` through one import map, so the URL lives in one place and SPEC-025's vendoring becomes a one-line change.
- **Spec:** SPEC-011 AC 1b, 8c.

#### RR-04 HIGH: The tutorial is woven into the core [A6]
- **Location:** 52 `tutorialGame` references (generator 1, menus/progress 25, input 2, logic 15, 2D 8, main 1); `winNow` 3529 → `tutorialNext` → `openScene`/`startTutorialGame` → `startGame`; `logEvent` 2491 → `tutorialNote`; `gameInv()` 2646 (`tutorialInv`); scripted bot and Big One 3784/4014; `applyTutorialMap` 1432.
- **Why:** Every new child goes through it (Andrei's decision), yet neither SPEC-011 nor SPEC-012 mentions it. After the split the core's win code would import the client's scene flow.
- **Fix:** Core `practice.js` (practice map, setup, scripted actors, hint state, own stock in the game object); client `tutorial.js` (steps, pages, transitions). A practice win calls the `onPracticeWin` hook (SPEC-011), which SPEC-012 turns into a `practiceWin` event.
- **Spec:** SPEC-011 AC 2b, 3b; SPEC-012 AC 10.

#### RR-05 HIGH: `mode` is both the client screen and the game phase [A3]
- **Location:** `mode` 2477, 23 writers including the logic (`winNow` 3530). It is read by `update` 4236, `canUseKit` 4101, `throwKiss` 3537, `autoThink` 3913 and `simRun` 4243.
- **Why:** A server room has no "home/map/shop" screen, and pausing one client must not stop other players. Today pausing works only because `frame` skips `update`.
- **Fix:** `g.phase` (`play`/`kindWalk`/`won`) in the game, set only by the core. The client screen is set from the `result` event, and pause means "the client does not step". SPEC-011 lists a `setMode` setter.
- **Spec:** SPEC-012 AC 1c; SPEC-011 AC 5.

#### RR-06 HIGH: The one live game is also the menu backdrop and the wardrobe stage [A4]
- **Location:** `resetWorld` has 17 callers, including wardrobe `cycleOutfit`/`randomOutfit`/`cycleBig` 2377–2390, `setEquip` 2679, `toMap`/`toHome`, and the frame loop 9225. Menus rotate the live Big One (9229).
- **Why:** Every wardrobe tap rebuilds and re-validates the whole level, draws game `rng()` and rebuilds the 3D characters. SPEC-012 does not say which game the menus show or who owns it.
- **Fix:** A client-owned showcase game, never stepped. Wardrobe changes re-dress models, and only `startGame`/`selectWorld`/the end of practice build a game.
- **Spec:** SPEC-012 AC 1d.

#### RR-07 HIGH: Game state not contained [A7]
- **Location:** `buildCharacters` 8700–8713 sets `l.model`/`big.model` on game entities; `const blocked/blockedBig` 1211 and `moveGrid/seeGrid/moveGridBig` 1215 are filled in place; `const ledger` 2495; `autoNavs`/`autoMove` 3863; hint timers 2503–2504.
- **Why:** Entities holding meshes cannot be cloned, sent or compared in Node. Tests already see 11–15 s serialisations. SPEC-012's "module-level `let`" test would pass while the grids, the ledger and the autopilot memory stay shared, so two games would corrupt each other's walls.
- **Fix:** A client `Map(entityId → model)`; `structuredClone(g)` must work. The state test also rejects mutable module-level `const` containers in `src/core/`.
- **Spec:** SPEC-012 AC 1b.

#### RR-08 HIGH: Live play steps on frame time; only sim is fixed-step [A5, F13]
- **Location:** `frame` 9217–9237 (`dt = clamp(…, 0, 0.05)`, one `update(dt)` per frame); `simRun` 4241 uses `CFG.BALANCE.SIM_DT` = 1/30 (421).
- **Why:**
  - The balance report measures 1/30 s steps. Children play at 1/120 s on an iPad Pro and 1/30 s or worse on a cheap Android.
  - Some rules run once per call (`separate`, `checkContacts`, `resolveWalls`, the autopilot `m = d/(sp·dt)`), so frame rate changes their results slightly.
  - Below 20 fps the clamp slows the whole game (F13).
  - SPEC-012 AC 1 says "with the existing fixed logic", which does not exist.
- **Fix:** In SPEC-012, document the two step modes and give the core a fixed-step entry for sim, Node and the server. Keep the live loop's feel exactly as today. A fixed live step (accumulator, e.g. 1/60) is decision D-11.
- **Spec:** SPEC-012 AC 1 (wording), AC 1e; decision D-11.
- **Status (2026-11-26):** done (SPEC-034: live play, the core, `simRun`, the autopilot and the balance runs all step at `CFG.STEP` = 1/60 s; the live loop takes whole steps from an accumulator, A5 and F13 included). F13's number is read off the perf overlay (SPEC-040 AC 11): game time / real time, with both sums.

#### RR-09 MEDIUM: Core-bound code touches DOM and storage at import [A9]
- **Location:**
  - `strictRng = window.__bbStrictRng` 1184.
  - The `lang` init 1084–1093 (`localStorage`, `navigator`, `document`, part of it outside `try`).
  - `W, H, CELL, COLS, ROWS, FINE, TAU` declared at 1108 next to `getElementById`.
  - Progress load at import 2603–2611; outfits load 2353.
- **Why:** SPEC-011 AC 4 (Node import) throws at once.
- **Fix:** No top-level statements in `src/core/**` and `src/i18n.js` other than declarations. Setters (`setStrictRng`, language state) are called by the client.
- **Spec:** SPEC-011 AC 4b.

#### RR-10 MEDIUM: `CFG` mixes logic and look numbers [A12]
- **Location:** `CFG` 58–464: about half is look (`CAM_*`, `PHONE_*`, `MENU_LOOK`, `TOON_LOOK`, …). The shop and reward tables sit at 604–646 between sprite tables.
- **Why:** The server would load menu colours, and the core rule would hold only formally. `docs:numbers` reads by object name.
- **Fix:** Core `config.js` (rules, generator, balance, shop/reward tables) and client `look.js`. `__bb.CFG` keeps today's keys, and `docs:numbers --check` passes unchanged.
- **Spec:** SPEC-011 AC 2c.

#### RR-11 MEDIUM: The logic makes translated text and UI-only state [A10]
- **Location:** `popText(x, y, L().…, color, meaning)` ×18; `showBanner` 2789 builds text and `update` 4209 advances it; `winTitle` 3533; kit/heard hint timers (3444, 4107, 3974, 4220); `pushWaves`; the practice hint step `tut.hint`.
- **Why:** For online play every client draws in its own language, and the server must hold no UI timers. SPEC-012 AC 5 lacks `color`/`meaning`, waves, hints and a text-free banner.
- **Fix:** Extend the event list and move hint timers, the banner clock and pop lifetimes to the client. A static test checks there is no `L()`/`I18N` in the core.
- **Spec:** SPEC-012 AC 5 (changed).

#### RR-12 MEDIUM: Reward and lock rules sit in the client; the logic writes saves mid-level; SPEC-012's "result instead of saving" does not match today's immediate saves [A11, S9]
- **Location:** `giveReward` 2706–2738, `rewardBase`/`fastTarget` 2507, `worldOpen` 2592; `updateStars` 3669 (`addCoins("star")` at pickup: "kept even if the level is not won"); `hug` 3483 (glove charge saved); `throwKiss` 3540 / `useRescueKit` 4105 (`gameInv()` → `tutorialInv` in practice); local p1/p2 share one pool.
- **Why:** If star coins and glove charges move into an end-of-level `result`, they are lost on quit or kill (today they are kept) or counted twice. The reward rules (game-design rules) would live where Node tests and a server cannot check them.
- **Fix:** `src/core/progress-rules.js` (pure: `worldOpen`, `isOpen`, `bonusUnlocked`, `worldComplete`, `rewardBase`, `fastTarget`, `computeReward`). One owner of the economy data: core `economy.js` (`progress` as plain data, the session coin book `ledger`, `addCoins`, `spendCoins`, `gameInv`, `gloveOf`; it saves only through `hooks.save`), while the client's `progress.js` only loads (`setProgress`) and saves. The `ledger` stays outside the game object, because it survives `startGame` and the shop writes it. In SPEC-012, every mid-level economy change is an immediate event (`coins`, `spent(slot, "kiss"|"kit"|"glove")`) that the client applies and saves at once. `result` carries only the win lines, and a practice game emits no economy events.
- **Spec:** SPEC-011 AC 2b, 5 (placement, owner); SPEC-012 AC 1b, 6 (changed), 6b.

#### RR-13 MEDIUM: The "same game" baseline would cover only an empty inventory [A13]
- **Location:** SPEC-011 AC 7; `openGame()` clears storage. The run depends on `makeLittle` 2747 (upgrades), `gloveOf`/`hug` (gloves) and `autoThink` 3911–3936 (kisses and kits only when owned).
- **Why:** The code SPEC-012 rewrites (slots, spending, gloves) is exactly what an empty-save baseline would not cover. Beach 9 and Winter 18 are locked bonus worlds since SPEC-030 (reachable only through the `__bb.world` setter).
- **Fix:** Record the baseline through `runLevel` (`scripts/balance.js`) with a committed stocked save fixture, plus one 2-player run. SPEC-012 consumes input flags at the start of the step in slot order, and any re-recording needs a written reason.
- **Spec:** SPEC-011 AC 7 (changed); SPEC-012 AC 9 (changed).

#### RR-14 MEDIUM: `window.__bb` is a 184-member unlisted surface [M9]
- **Location:** `index.html` 9251–9387 (Proxy at 9379). Tests make ~226 `b.mode =` writes and ~210 `Object.assign(littles/big, …)` calls, call `giveReward` 42×, `throwKiss` 27× and `useRescueKit` 19×.
- **Why:** SPEC-012 moves exactly these paths. If the `__bb` functions stay shims, ~90 tests stay green while the real input → kiss and win → `result` → ledger paths have one test each. A member can disappear silently.
- **Fix:** SPEC-011 builds `__bb` in `src/client/debug.js`, and a test snapshots its key list (additions allowed, removals fail). SPEC-012 documents the shims and moves the rule tests onto the real path.
- **Spec:** SPEC-011 AC 5c; SPEC-012 AC 9b.

#### RR-15 LOW: `architecture.md` line table and section headers mislead the split [A14, M12]
- **Location:** `docs/architecture.md` "Sections of index.html (~8,600 lines)": ranges are off by up to ~2,500 lines (`CFG` listed at 49–332, actually 53–464; `I18N` at 333, actually 647). The `index.html` 3855 "АВТОПИЛОТ" header spans hearing, `updateBig`, contacts, `update` and `sim`. `orchestration-rules.md` says "~2,500 lines".
- **Fix:** Step 0 of SPEC-011: regenerate the section map from the headers and correct misleading headers. After the split, docs name modules and symbols, never line numbers.
- **Spec:** SPEC-011 step 0, AC 11.

#### RR-16 LOW: Hidden state changes in the frame loop and in drawing [A15]
- **Location:** `showBanner` 2790 uses the wall clock; `frame` 9229 writes `big.dir` in menus; `frame` 9225 resets the world when leaving the wardrobe; `drawUI` 6931–6935 resets `shopTab`, `wardrobePage`, `toast`, `mapBgCache` and closes the name input (nothing happens in sim mode).
- **Fix:** Move the resets into the screen-change functions (`flow.js`). Drawing never changes state.
- **Spec:** SPEC-012 AC 1f (fix round: moved from SPEC-011 AC 7b; it belongs with the showcase-game work).

### 2.2 Saves and data

What a lost save costs a child today: every world goes back to locked (the Field needs all 20 Park levels again), and every star, coin, bought outfit, upgrade, mitten charge, kiss and kit is gone. The intro comic and the tutorial come back. For a 6–9-year-old that is hours of play, with no way back.

#### RR-17 HIGH: The single-key migration plan (SPEC-025 AC 3) is unsafe [S4, M5]
- **Location:**
  - 1087: `played = getItem("bebebe-progress") !== null` drives the first-launch language.
  - 2603–2621: `migrated = hasFlatProgress(pv)`, `hadOwned = "owned" in pv` (decides `adoptWorn` vs `fitOutfitsToOwned`), `if (migrated) saveProgress()` (rewrites in place).
  - 2568: `...rest` keeps unknown fields today.
  - `loadProgress` 2562–2580 rebuilds `worlds` only for known `WORLDS`.
  - BACKLOG: the SPEC-016 stale tab.
- **Why:** The plan says "old keys kept one version, then removed; unknown fields dropped". That loses data in four ways:
  1. Key-presence facts (first launch, `hadOwned`, flat save) get lost in a naive merge.
  2. An old tab or old build keeps writing the old keys, and that progress is lost.
  3. Dropping unknown fields means a rollback (on the stores, older code under a higher version number) erases what the newer build wrote.
  4. The migration write destroys its source.
- **Fix:** An ordered, tested pipeline:
  1. Read all old keys raw.
  2. Compute the key-presence facts first.
  3. Build `bebebe-save`, write it, read it back and validate it.
  4. Only then stamp it migrated.

  Old keys stay untouched in this spec (except the gated "Erase all data on this device"). A fingerprint of each old key's raw value, stored at migration, detects a stale-tab write, which is merged again with max rules. Unknown fields and unknown worlds are kept and written back. Schema rule: fields are only ever added, and a change of shape gets a new field name. A save with a newer `version` is played and written back with its own version and every field. A known field that fails this version's validation is written back unchanged, with the default used only in memory.
- **Spec:** SPEC-025 AC 3 (changed).

#### RR-18 HIGH: "Reset progress" is two quick taps for anyone, with no grown-up check and no undo [S2, R3]
- **Status (2026-11-26):** done (SPEC-025 safe flow; SPEC-033 moved it to the grown-ups page).
- **Location:** `resetProgress` 2680–2689 (the first call arms, the second wipes, no minimum delay). The armed "Sure?" button is in the same rect (phone 6401–6405, desktop 6814), and buttons fire on `pointerdown` (3236). `game-design.md`: "double tap … (придумал Claude)".
- **Why:** Small children double-tap all the time. Two taps ~100 ms apart, or two fingers in one frame (RR-68), erase everything. In a Kids-category app this is the most likely real-world loss of progress, more likely than storage failure. The planned single backup does not help (RR-20).
- **Fix:** After the first tap the reset button shows "No, keep it". A separate confirm sits at a different spot and ignores taps for `CFG.RESET_CONFIRM_DELAY` s. The armed texts `sure`/`sureShort` ("Sure? Tap again") are retired. Before wiping, the current save is kept as `bebebe-save-before-reset`, and an undo is offered. Moving the button behind the parents' gate is decision D-12 (recommended).
- **Spec:** SPEC-025 AC 6b; decision D-12.

#### RR-19 HIGH: An unreadable save is replaced without a trace, sometimes at startup [S1]
- **Location:** 2603–2611 (`catch { progress = freshProgress() }`), 2613–2620 (`if (!hadOwned) adoptWorn()` → `saveProgress()` during startup).
- **Why:** With unparseable `bebebe-progress` (a WebView glitch or a cut-off write), a worn paid outfit in `bebebe-outfits` makes `adoptWorn` write a fresh save at startup. That overwrites the recoverable bytes before the child touches anything. Otherwise the first star overwrites them. There is no copy and no message. No test covers unparseable JSON.
- **Fix:** Copy the raw text to `bebebe-save-broken` before anything writes, and never run one-time migration gifts after a failed load.
- **Spec:** SPEC-025 AC 4 (changed).

#### RR-20 HIGH: The planned backup is one write deep [S3]
- **Location:** There are 22 write sites: each star (3669), each reward line (3–5 per win), each glove hug, kiss and kit, each outfit arrow (2373–2390), and more.
- **Why:** A backup of "the previous write" is seconds old. It protects against a corrupt last write, but not against logical loss: a reset, a buggy migration, a stale tab, or a bug that zeroes a field.
- **Fix:** Keep the write backup, plus a once-a-day session snapshot, plus one-off snapshots before each migration, reset and import. Recovery takes the newest valid copy, and the grown-ups page can restore an older one.
- **Spec:** SPEC-025 AC 4 (changed).

#### RR-21 HIGH: Saves are synchronous `localStorage` at import; the store wrapper needs an async native store [S5]
- **Location:** 1087, 2353, 2448, 2605 (read at top level, used on the next line); SPEC-025 AC 5 (`persist()` only).
- **Why:** iOS may reclaim WKWebView storage, and `persist()` does not reliably change that. Capacitor's guidance is to use native Preferences/SQLite, which are async (and covered by iCloud / Android Auto Backup). A synchronous wrapper read at import time would force the boot to be rebuilt again in the packaging spec.
- **Fix:** A backend interface `{ get, set, remove }` returning Promises, with `localStorage` as today's backend. Boot does `await loadSave()`, and writes go through a last-write-wins queue. The native backend comes in the packaging spec.
- **Spec:** SPEC-025 AC 3b; later (native backend, device restore check).

#### RR-22 MEDIUM: Save loading depends on the top-level code order the split will change [S10]
- **Location:** 1084–1092 (language needs to know whether a progress key exists), 2352–2354 (outfits), 2603–2621 (progress, then `adoptWorn`/`fitOutfitsToOwned`), 2640 (`curWorld`), 9212 (`introDue`).
- **Why:** ES modules run top-level code in import order. A wrong order silently gives away or removes clothes, or picks the wrong language. Only `pre-spec-006` is tested through a real reload.
- **Fix:** No storage access at import. `main.js` calls `initSaves()` once in a fixed order (language facts → outfits → progress → adopt/fit → current world), with the same saved data shape. Every fixture goes through a real reload.
- **Spec:** SPEC-011 AC 5b.

#### RR-23 MEDIUM: Failed writes are swallowed; nothing tests broken storage [S6, M14]
- **Location:** `saveProgress` 2610, `saveSkins` 2355, `saveNames` 2454, language 1091/1099: `catch { /* ok */ }`.
- **Why:** With storage disabled, full (the shared github.io origin) or session-only, the child plays for an hour and everything is gone next launch, with no hint to the parent.
- **Fix:** Probe once at start. On a failed probe or write, keep playing from memory and show one calm grown-ups note. Tests make `localStorage` throw and make `setItem` throw `QuotaExceededError`.
- **Spec:** SPEC-025 AC 4b.

#### RR-24 MEDIUM: A win in its last ~4 s is lost if the app is hidden or killed [S7, R5]
- **Location:** `winSoon` 3503 (`pendingWin` 1 s) + `startKindWalk` 3514 (3 s); the timer runs only in the frame loop (4236); `winNow` → `giveReward` is the only place a win is written. There is no `visibilitychange`/`pagehide` handler.
- **Why:** Kids press Home right at the "Hooray!". `docs/game-design.md` :67–68 already counts leaving during the last hug as the win (`leaveLevel` settles a pending win on the menu path). That rule is marked "решено во время запуска, проверить с детьми" (decided during a run, to check with the kids), not a kids' decision.
- **Fix:** On hide (`visibilitychange` hidden or `pagehide`), save only an already-decided win (hearts at 0, `pendingWin > 0`), the way `leaveLevel` records it. Settle nothing else (no hug coins, no other economy change). Settle at most once per level: a page that comes back (visible again, or `pageshow.persisted` from the back/forward cache) continues without paying twice.
- **Spec:** SPEC-025 AC 14b.

#### RR-25 MEDIUM: Outfits are saved as list indexes [S8]
- **Location:** `loadOutfits` 2344 (clamped indexes), `saveSkins` 2355; "new looks go after `dad`" is enforced only by a comment.
- **Why:** One reorder or removal silently dresses every child in something else, and `clamp` hides it. `progress.owned` already uses ids.
- **Fix:** `bebebe-save` stores outfits by id. The migration maps old indexes with today's lists, and an unknown id falls back to the slot default.
- **Spec:** SPEC-025 AC 3c. (SPEC-011 keeps today's shape: moving the lists must not reorder them.)

#### RR-26 MEDIUM: Web version on a shared github.io origin; Safari deletes storage of a site not visited for 7 days [S11]
- **Location:** `sw.js:7` comment; keys on `andrei-danilin.github.io`.
- **Why:** Any other Pages project of the account shares the storage and quota and can clear it. In a Safari tab (not installed), script-written storage is deleted after 7 days without a visit.
- **Fix:** Give the game its own origin (custom domain or its own Pages site) before promoting the web version, and make the install path clearer in Safari. The parents' code is the bridge.
- **Spec:** later; decision D-5.

#### RR-27 LOW: Load validation gaps [S13]
- **Location:** 2568 (`inv: { ...p.inv, ...pv.inv }`; `equip` accepted when it is any array), 2579, `buyGloves` 2651.
- **Why:** `{ inv: { mittens: "3" } }` loads, and buying then gives `"35"`. `equip: [{}, "x", …]` is kept. `coins: 1e300` is accepted. Pasted codes (AC 6) make this a real input.
- **Fix:** A complete schema with types and ranges, caps in `CFG`, and the rule that the root must be a plain object.
- **Spec:** SPEC-025 AC 3d.

#### RR-28 LOW: Parents' save code: missing details [S14, P6]
- **Why:**
  - "Compressed" suggests `CompressionStream` (async, iOS 16.4+); base64url plus a checksum is enough.
  - The code must carry `version` and go through the same migration.
  - A newer code must be refused.
  - Clipboard reads prompt on iOS.
  - Import must snapshot first.
  - The texts have no pt.
  - The code is also the way to move PWA progress into the store app (different origin, RR-33).
- **Fix:** Write these details into AC 6.
- **Spec:** SPEC-025 AC 6 (changed), 6c.

### 2.3 Packaging and offline

Remote dependencies (verified): only three.js r187 (`index.html:50`, which pulls `three.core.js`; ~2.1 MB unminified). Everything else is relative: 155 sprites (3.7 MB), icons, manifest, `sw.js`.

#### RR-29 BLOCKER: three.js loads from jsDelivr at runtime [P1, K1, M7]
- **Location:** `index.html:50`; `sw.js:9` (`THREE_BASE`), 61–66, 129; loading hint `index.html:40–48`; test routing in `tests/helpers.js`, `tests/pwa.spec.js`, `playwright.config.js`; three.js also in `package.json`.
- **Why:**
  - A store app opened offline for the first time shows "needs internet". Reviewers test in airplane mode.
  - iOS `capacitor://` has no service worker, so nothing is cached for the next offline launch either.
  - Every cold start sends the child's IP, user agent and referrer to a third party (Apple 1.3 Kids).
  - Downloading executable code at runtime conflicts with Apple 2.5.2.
  - The tests run against `node_modules/three`, which Dependabot could bump alone, so CI would test a version players never get.
- **Fix:** Vendor the minified r187 files under `vendor/three/` and import them through one import map (bare `three`, introduced by SPEC-011). No `cdn.jsdelivr.net` or other `http(s)://` URL may remain in shipped files (scan). `vendor/` goes into the site list. The request-audit test runs on a fresh page with the network blocked from the start and no service worker (the Capacitor case), and on the installed PWA. A test checks that the `node_modules/three` version equals the vendored one.
- **Spec:** SPEC-025 AC 1 (changed), 1b.

#### RR-30 HIGH: Network-first `src/**` per file can mix module versions [P3, M3, M14]
- **Location:** `sw.js:97–119` `networkFirst` (each request races `NET_TIMEOUT_MS` = 4 s on its own); SPEC-011 AC 9.
- **Why:** With one file, network-first is atomic. With ~40 modules on a weak connection right after a deploy, some come from the network (new) and some from the cache (old). One renamed export causes a link error: a blank page with no error card, because no handler runs when the graph fails to link. This is the most likely field failure of the split, and it hits kids on mobile data.
- **Fix (fix round; keeps today's update timing):**
  - `index.html` stays network-first exactly as today. An online launch gets the new version at once, and the test "index.html is network-first…" stays unchanged.
  - `npm run precache` writes a content hash per module, and the import map in `index.html` maps every `src/**` module URL to `…?v=<hash>` (import maps also remap the modules' relative imports). A shell can therefore only load its own module versions: a new shell asks for new URLs (no mix, and no stale CDN edge), while an old cached shell keeps its old URLs.
  - There is no dynamic `import()`.
  - Caches are separate: shell + `src/` by `SRC_HASH`, sprites by `ASSETS_HASH`, three.js by version, so a code deploy re-downloads no sprites.
  - Versioned module URLs are served cache-first. The service worker writes the `src` cache only at install, and deletes an old cache only when no page of that version is open (or keeps the last 2).
  - After merging `master`, rerun `npm run precache`; a test catches a stale hash or import map.
- **Spec:** SPEC-011 AC 9 (replaced; Phase B).

#### RR-31 HIGH: The site file list lives in three places; CI never tests `_site` or the deployed site [P2, M14]
- **Location:** `pages.yml:36–40` (hand-copied list), `sw.js:10–13` `PRECACHE_LOCAL`; a future Capacitor `webDir` would be the fourth copy.
- **Why:** SPEC-011 adds `src/` and SPEC-025 adds `vendor/`. The natural implementation is green on CI and black on the live site (module 404), and on every installed PWA after the update.
- **Fix:** `npm run site` builds `_site/` from one list, and `pages.yml` uses it. A CI test serves `_site/` and checks that the game starts, every precached file exists and every requested file is in `_site/`. After the deploy, a step checks that the live site serves this commit's `index.html`.
- **Spec:** SPEC-011 AC 10b, 10c.

#### RR-32 HIGH: Capacitor vs TWA is still open; TWA breaks "fully offline" and "nothing leaves the device" [P7, K8]
- **Location:** The publishing plan ("Capacitor or TWA").
- **Why:**
  - A TWA is Chrome showing the website. The first launch offline shows Chrome's offline page.
  - GitHub receives the child's IP on every navigation.
  - The code can change on any push without review.
  - It needs Digital Asset Links at the origin root and has no iOS equivalent.
- **Fix:** Capacitor for both stores (reviewers' recommendation), with the PWA staying as the web version.
- **Spec:** later; decision D-2.

#### RR-33 HIGH: Storage origin in the wrapper; PWA saves do not move to the store app [P6, S12]
- **Location:** All storage is per origin; the future `capacitor.config` (`androidScheme`, `hostname`, `iosScheme`).
- **Why:** Capacitor once changed the Android default scheme (v6), and apps that upgraded lost WebView storage. PWA players start from zero in the store app. WebView storage is not reliably in OS backups.
- **Fix:** Pin the scheme and hostname from the first build, with a check. Ship the parents' save code in the PWA before the store launch as the bridge. Use a backed-up native store (RR-21).
- **Spec:** later (config pin, restore check); SPEC-025 AC 6c (bridge note).

#### RR-34 HIGH: The fullscreen button is dead in a native wrapper and on iPhone [P5]
- **Status (2026-11-27):** done for the web (SPEC-038: `fullscreenShown()` — hidden when neither `fullscreenEnabled` nor `webkitFullscreenEnabled` is true, and when `STANDALONE`); the `NATIVE` flag for the store wrapper is later.
- **Location:** `isStandalone` 1116–1122, `toggleFullscreen` 4736–4741 (errors swallowed), shown at 4850/4942 when `!STANDALONE`.
- **Why:** In WKWebView neither standalone check is true, so ⛶ is drawn and does nothing. Apple 2.1 rejects visibly non-functional controls.
- **Fix:** A `NATIVE` flag next to `STANDALONE`. Hide the button when `STANDALONE || NATIVE` or when the Fullscreen API is missing (that half now, in BACKLOG).
- **Spec:** later; BACKLOG.

#### RR-35 MEDIUM: Service worker inside the native wrapper [P8]
- **Location:** `registerServiceWorker` 9241–9248 registers on any `http(s):`, including Android Capacitor's `https://localhost`.
- **Why:** It caches files that are already local and can serve old sprites in the first session after an app update. It is Android-only behaviour.
- **Fix:** Do not register (and unregister) when `NATIVE`. Offline in a wrapper comes from packaging.
- **Spec:** later.

#### RR-36 MEDIUM: Minimum OS / WebView / GLES not declared [P9, F10]
- **Why:** three r187 needs ES2022 `static {}` (Safari 16.4+, Chrome 94+) and WebGL2 (GLES 3.0). Without declaring this, the store offers the app to devices where it never starts.
- **Fix:** iOS deployment target 16.4, `android.minWebViewVersion`, `<uses-feature android:glEsVersion="0x00030000" required>`, and the device floor in the listing.
- **Spec:** later; decision D-10.

#### RR-37 MEDIUM: Safe areas and system bars on Android edge-to-edge [P10]
- **Location:** `viewport-fit=cover` (5), body padding `env(safe-area-inset-*)` (19), `fit` 1139–1170.
- **Why:** API 35+ forces edge-to-edge, and Android WebView has reported insets as 0. Corner icons can sit under the cutout. A kids' game should be immersive.
- **Fix:** System-bars plugin for immersive landscape, CSS fallbacks fed by the plugin, and a device check on a notched phone in both landscape directions.
- **Spec:** later.

#### RR-38 MEDIUM: Orientation locked only by the web manifest; tablets in portrait [P11]
- **Status (2026-11-27):** done (SPEC-038: `rotateWall()` — the wall only on a phone; a tablet or a tall desktop window plays letterboxed in portrait); the native orientation keys are later (the wrapper).
- **Location:** `manifest.webmanifest` `orientation`; the portrait overlay 6947–6956 and `update` skip 9226.
- **Why:** iOS ignores the manifest, Android 16 ignores locks on large screens and iPadOS 26 has resizable windows. A tablet can show "rotate" forever.
- **Fix:** Native orientation keys. On tablets and large windows in portrait, play letterboxed. The rotate wall stays for phones only.
- **Spec:** later; BACKLOG (tablet portrait behaviour).

#### RR-39 LOW: Sprite precache is best-effort; the offline test does not check art [P14]
- **Status (2026-11-27):** done (SPEC-038: `offline.spec.js` asserts every sprite loaded offline; `sw.js` `repairArt` re-fetches missing sprites on an online navigation).
- **Location:** `sw.js:74`; `artLoad` 522–531 (if the logo fails, every sprite is marked bad); `pwa.spec.js` 210–224.
- **Fix:** The offline test asserts `__bb.artInfo.ok === total`, and the SW re-adds missing sprites on the next online start.
- **Spec:** BACKLOG.

#### RR-40 LOW: Store icons, splash and manifest fields are web-only [P15]
- **Why:** The stores need a 1024 icon without alpha (the source has none, good), adaptive and monochrome layers, a native splash kept until `__bbReady`, and store graphics. The PWA manifest has no `id`.
- **Fix:** Generate the native assets from `art/2_icon.webp`. Add `"id": "./"` and `"lang"` to the manifest (with an `SW_VERSION` bump).
- **Spec:** later; BACKLOG (manifest `id`).

### 2.4 Performance on weak devices

Figures are estimates from code and files. Nothing was run on a device; see the checklist in section 5.

#### RR-41 HIGH: WebGL context loss is not handled [F3, P12, R6]
- **Location:** Renderer 6965; no `webglcontextlost`/`webglcontextrestored` listener anywhere; `frame()` keeps rendering into a dead context.
- **Why:** 2 GB Androids and iOS drop contexts under memory pressure and after long backgrounding. The 3D stays black while the 2D HUD keeps drawing and the level clock runs. If no restore comes (common on iOS), the field stays black for good.
- **Fix:** On loss, `preventDefault` and pause with a "Tap to continue" card. On restore, run `rebuild3D`, repaint the ground canvas, re-upload textures and continue on a tap. With no restore within `CFG.GL_RESTORE_WAIT` s, save and reload. Test with `WEBGL_lose_context`.
- **Spec:** SPEC-025 AC 14c.

#### RR-42 HIGH: Draw calls: every part is two meshes, no geometry sharing, decor hulls cast shadows [F1]
- **Location:** `part()` 7206 (second mesh per part for the outline), `makeTree`/`makePalm` 7308–7350, background decor loop 8220–8231 (46 objects), `traverse(castShadow = true)` 8207/8230/7410.
- **Why:** One background palm = 30 colour draws + 30 shadow draws. On Beach, the whole map in view (desktop and every tablet) can reach ~1,400 + ~1,400 draws, against a practical budget of 150–300 on Mali/PowerVR. Each part builds its own geometry.
- **Fix:** Share geometries, make background decor `InstancedMesh` per part kind, and stop hulls from casting shadows. No visual change.
- **Spec:** later (performance pass).
- **Status (2026-11-27):** done (SPEC-040: shared geometries, instanced and joined static parts, hulls never cast shadows; the busiest levels draw 145–172 calls on the phone and 203–234 on a tablet, was 690–1160 and 1510–3061).

#### RR-43 HIGH: No quality tiers; tablets run the heaviest path [F2]
- **Location:** 6965 `antialias: true`; PCF shadows 2048² (6966–6984); DPR 1149; `isPhone()` 1123–1132 (tablets count as desktop); grain on tablets (290); ground canvas 1920×1280 + `anisotropy = 8` (7233–7237).
- **Why:** Families installs land on 2 GB phones and A9/A10 iPads. There is no fallback when frames are slow, so the device heats up and throttles.
- **Fix:** A `LOOK.QUALITY` table (`high`/`medium`/`low`) picked by a probe and stepped down on slow p95, plus a hidden override. What the low tier may drop is decision D-4.
- **Spec:** later (performance pass); decision D-4.
- **Status (2026-11-27):** done (SPEC-040: `LOOK.QUALITY` tiers, a start probe, a step down after 5 s of slow frames, a picture-quality setting on the grown-ups page).

#### RR-44 MEDIUM: Memory checks are partial; no perf hook for the device measurements [F6]
- **Location:** `tests/look3d.spec.js:129` (textures and geometries only, 7 builds); `disposeTree` 7222 (own materials' maps not freed); preview cache 9030, `artImgs`/`artFile`, `paperCache` 4349, `mmBase` 5063.
- **Why:** A slow leak shows only after 20–40 min, which is exactly how kids play. It ends as an OS kill or a context loss. The device checklist needs numbers the game does not expose yet.
- **Fix:** `__bb.perf()` (fps, frame-time p50/p95/max, draw calls, programs, memory counts, caches, heap where available, game-time/real-time ratio) and a `?perf=1` overlay (debug only, no I18N). The 30-level test also covers programs, previews and 2D caches. `disposeTree` frees own materials' maps.
- **Spec:** SPEC-025 AC 15 (changed), 15b.

#### RR-45 MEDIUM: First load parses ~3 MB of unminified JS [F11]
- **Location:** three.module.js 659 KB + three.core.js 1.47 MB, the module itself 800 KB; `CFG.ART.waitMs` 5000.
- **Why:** 1.5–3 s of parsing on a 2 GB Android before the first frame; a cold start can approach 8–10 s.
- **Fix:** Vendor the minified build (with the licence header) and record cold and warm start times.
- **Spec:** SPEC-025 AC 1b.

#### RR-46 MEDIUM: All 155 sprites are decoded at start and kept (~70 MB RGBA) [F4]
- **Location:** `artImgs` 517, `artLoad` 521–531; the largest are 1024×765 (3 MB decoded each).
- **Fix:** Keep HUD and button sprites resident. Load story, tutorial and map backgrounds per screen and release them when the screen closes.
- **Spec:** later (performance pass).
- **Status (2026-11-27):** done (SPEC-040: 22 MB decoded at the home screen, was 83 MB; sprites load per screen and are released).

#### RR-47 MEDIUM: The game renders at full rate under opaque menus, pause and the rotate prompt [F5]
- **Location:** `frame()` 9217–9236 (`render3D` + `drawUI` every frame), +3 preview renders in the wardrobe (9042).
- **Why:** Battery and heat, so the next level plays throttled. Battery drain is a common complaint in kids' app reviews.
- **Fix:** Skip `render3D` when the 3D is covered, render once while paused, and run menus at ~30 fps.
- **Spec:** later (performance pass).
- **Status (2026-11-27):** done (SPEC-040: no `render3D` under a cover, once while paused, menus at `LOOK.MENU_FPS`).

#### RR-48 MEDIUM: Level start creates hundreds of geometries and has no shader warm-up [F7]
- **Fix:** A geometry cache (RR-42) and `renderer.compileAsync` behind the level card.
- **Spec:** later.
- **Status (2026-11-27):** done (SPEC-040: the level card warms up the level; nothing new is built in the first 60 frames).

#### RR-49 MEDIUM: Text fit/wrap is re-measured every frame [F8]
- **Location:** `fitText` 4428, `wrapText` 4447, `labelFit` 4472, shop loops.
- **Fix:** Memoize per `(text, size, weight, maxW, scale)`, cleared on language change and resize.
- **Spec:** later (can join SPEC-011's `ui/text.js` only if Andrei prefers; not planned there).
- **Status (2026-11-27):** done (SPEC-040: text widths and fits are remembered; home and the Character tabs measure nothing per frame).

#### RR-50 MEDIUM: Trees, bushes and roofs are transparent all the time [F9]
- **Location:** `fadeHelper` 7310, `makeBushFor` 7415, outline materials 7164, fades in `syncScene` 9002–9010.
- **Fix:** Keep them opaque until a fade starts.
- **Spec:** later.
- **Status (2026-11-27):** done (SPEC-040: opaque until a fade starts).

#### RR-51 LOW: Per-frame garbage; event-log splice; A* allocations [F12]
- **Location:** `drawUI` rebuilds ~25 arrays per frame; `new Set(…)` ×3 per frame (8758/8795/8838); A* allocates four typed arrays per repath (2113); the event log `splice`s 5,000 entries per event once full (2489); `JSON.stringify(makeLook())` ×2 per frame in the wardrobe.
- **Fix:** The event log becomes a ring buffer and the pathfinder reuses per-game scratch buffers. The client-side items go to the performance pass. Meanwhile SPEC-012 AC 5 puts effect events in a separate uncapped `g.fx` queue, so the capped gameplay log never loses gameplay events.
- **Spec:** BACKLOG (fix round: deferred from SPEC-012 AC 12); later.

### 2.5 Store policy and privacy

Verified today: one third-party request (three.js, RR-29). No analytics, ads, fonts, trackers or network calls. No outbound links and no `window.open`. No permission prompts. `navigator.language(s)` picks the first-run language and stays on the device. The shop uses earned coins only, with no IAP and no loot boxes.
- **Status (2026-11-27):** done (SPEC-040: event-log ring, per-game scratch buffers, drawUI lists reused, preview keys without `JSON.stringify`).

#### RR-52 BLOCKER: No privacy policy or parents' page inside the app [K2]
- **Why:** Apple 5.1.1(i) requires a policy link in App Store Connect and inside the app, and 5.1.4(b) requires a policy for every Kids app. Google Families requires a policy that matches the Data safety form. A web link would be a link out and need a gate.
- **Fix:**
  - SPEC-025 can reserve the slot, **only if Andrei agrees (D-13)**: a grown-ups page behind the gate, with a short factual "Privacy" section in four languages that points to "Erase all data on this device". It is readable offline, has no external link, and states what the code does (nothing collected or sent; what is stored; how to erase it).
  - The legal policy text, the hosted URL, the contact address and the developer/legal entity go to the later release spec. Those are Andrei's (decision D-13), and SPEC-025 keeps "privacy texts" (the legal policy) out of scope.
- **Spec:** SPEC-025 AC 6d (conditional on D-13, not in the must-ship list); later; decision D-13.

#### RR-53 HIGH: The planned parental gate ("hold for 3 seconds") is not an adult task; no Portuguese [K3]
- **Location:** SPEC-025 AC 6 and its texts table.
- **Why:** Apple wants "adult-level tasks" (a math problem or a question), and reviewers test gates. Any 4-year-old can hold a button. The same gate would guard the save code, the error log and every future link or share.
- **Fix:** One `parentGate(onPass)`: a random multiplication of two factors 3–9 written in words, 4 answer buttons, a new question after a wrong answer, no long-press. Texts in en/es/pt/ru.
- **Spec:** SPEC-025 AC 6 (changed).

#### RR-54 HIGH: Rules text says Dad "pushes you and breaks your leg"; you "limp home" [K4]
- **Status (2026-11-26):** done (SPEC-033).
- **Location:** `I18N.*.rules`: en 658/660, es 744, pt 821, ru 899. Softer related texts: "BAM!" with a red burst (678/580); "Get out of my house!" (730).
- **Why:** Since SPEC-022 the Big One is "Dad". A Kids or Teacher Approved reviewer may read the line as an adult injuring a child. The line pushes the rating answer to "cartoon violence: infrequent/mild" (Apple 9+ instead of 4+, possibly PEGI 7). The tutorial already says it gently ("he pushes — and you fall down!", 711).
- **Fix:** Reword only (mechanic, numbers and visuals unchanged), e.g. "he pushes you and you fall down; friends help you up … you go home to rest". This is a kids' rule ("the leg breaks"), so it is **decision D-1** only. No spec changes it.
- **Spec:** decision D-1; later (store texts).

#### RR-55 MEDIUM: SPEC-013 "Share" and `?room=` links would leave the app without a gate [K5]
- **Fix:** Share goes behind the gate. The child reads the big code aloud. Room links use the app's own deep link once packaged. `?server=` is ignored in release builds.
- **Spec:** BACKLOG (for SPEC-013).

#### RR-56 MEDIUM: SPEC-013 sends a persistent `deviceId` [K6]
- **Why:** A persistent identifier is personal information under COPPA. It would have to be declared in Apple's label and Google asks about it. Reconnects already use `token`.
- **Fix:** Drop `deviceId` and keep only a per-session in-memory token.
- **Spec:** BACKLOG (for SPEC-013).

#### RR-57 MEDIUM: Online server data handling is not written as a kids' policy needs it [K7]
- **Why:** The IP is inevitable. The policy must state what is processed, why, where (Azure Brazil South) and how long logs are kept (Log Analytics defaults to 30 days). COPPA (amended) needs a written retention policy and security program. `ORIGINS` lacks the Capacitor origins.
- **Fix:** A server-privacy section, explicit retention, a check that logs never contain IPs, and the app origins in `ORIGINS`.
- **Spec:** BACKLOG (for SPEC-014 and the online release).

#### RR-58 LOW: The error log and handlers must stay local and name-free [K10]
- **Fix:** Log entries hold only message, stack head, version, mode and level (no typed names, no save content). The request-audit test runs with an injected error. Copying is possible only behind the gate.
- **Spec:** SPEC-025 AC 7 (changed).

#### RR-59 LOW: `navigator.storage.persist()` prompts in Firefox [K11]
- **Fix:** Request it only where it is silent (skip Gecko) or in the packaged app, and test that it is skipped.
- **Spec:** SPEC-025 AC 5 (changed).

#### RR-60 LOW: Shop wording looks like a purchase screen [K9]
- **Status (2026-11-26):** done (SPEC-033).
- **Location:** 🛒 Shop on the win and lose screens (6588/6592); `buy`, `buyFor`, `pack`, … (688–736 and the other languages).
- **Why:** It is not IAP ("In-app purchases: No"), but a cart and "Buy" on the lose screen look like a purchase nudge to a reviewer or parent.
- **Fix:** Show 🪙 in every price, drop 🛒 from the end screens, and consider "Get". The Shop button on the end screens is Andrei's (SPEC-026): **decision D-8**.
- **Spec:** decision D-8; later (store texts).

#### RR-61 LOW: Kostya's name in the credits and the public repo [K12]
- **Location:** `I18N.*.madeBy` (708/787/867/944); `docs/story.md`, `art/`; an existing BACKLOG line.
- **Fix:** Family decision before publishing: **D-9**.
- **Spec:** decision D-9; BACKLOG (existing line).

#### RR-62 LOW: `v1-2d/`, `window.__bb` and debug flags must not ship in the store build [K13]
- **Fix:** The wrapper's `webDir` is built from an explicit allowlist without `v1-2d/`. Debug flags are ignored or harmless in the packaged build. Add a short privacy note on the website.
- **Spec:** later.

#### RR-63 LOW: Strangers can join a room through a forwarded link [K14]
- **Fix:** Owner controls in the lobby: lock the room and remove a player.
- **Spec:** BACKLOG (for SPEC-013).

### 2.6 Robustness

#### RR-64 BLOCKER: Any exception in the frame loop freezes the game for good [R1]
- **Location:** `frame()` 9217–9237; `requestAnimationFrame(frame)` is the last line and nothing is wrapped. There is no `error`/`unhandledrejection` handler anywhere.
- **Why:** One throw in `update`, `render3D` or `drawUI` and the canvas freezes. Touch, keys and pads change state but nothing redraws, so a child can only kill the app. Pre-launch robots report it as "not responding".
- **Fix:** Schedule the next frame first, guard the body, and on the first error pause and show the Oops card once. A repeating error is logged once with a count. Add global handlers for errors outside the loop.
- **Spec:** SPEC-025 AC 7 (changed).

#### RR-65 HIGH: A failed start leaves the loading screen up forever, blames the internet, has no Retry and no WebGL2 check [P4, R2, F10]
- **Location:** Inline hint 40–48 (after 6 s without `__bbReady`, "The 3D engine needs an internet connection"); `new THREE.WebGLRenderer` 6965 at top level, not guarded; `__bbReady` 9215.
- **Why:** After vendoring, "needs internet" is false in every case. The real causes are no WebGL2 (cheap kids' tablets, blocklisted GPUs), an old WebView, a top-level exception, or just a slow first parse (> 6 s). A parent turns on Wi-Fi, nothing changes, and a reviewer reads the app as online-only.
- **Fix:** One guarded `boot()`. A WebGL2 probe shows "This device can't show the 3D game". Any other start error shows a card with Retry (`location.reload()`). A slow start keeps the progress bar. The internet text appears only on the web when the module import itself failed. All texts are inline in four languages (modules may not have loaded). The device floor is decision D-10.
- **Spec:** SPEC-025 AC 7b; later (store manifest); decision D-10.

#### RR-66 MEDIUM: Lifecycle: no pause on hide or blur, audio "interrupted" never resumed, audio unlock only on `pointerdown` [R5, P13, R9]
- **Location:** No `visibilitychange`/`pagehide`/`freeze` listener; `blur` only clears input (3136); `initAudio` 3090–3094 resumes only from `suspended` and is called from `keydown`/`pointerdown`/pad.
- **Why:**
  - On return, play resumes instantly and the child gets pushed before finding the screen.
  - The notification shade or the iOS Control Centre cause `blur` without `hidden`, so the level runs on underneath.
  - After a call, iOS leaves audio "interrupted", so sound is gone until a restart.
  - WebKit unlocks audio reliably on `pointerup`/`touchend`, not `pointerdown`.
- **Fix:** Hidden, `pagehide` and `blur` during play → pause and suspend audio, and stay paused on return. Resume audio on the next gesture from any non-running state. Also unlock on `pointerup`.
- **Spec:** SPEC-025 AC 14 (changed).

#### RR-67 MEDIUM: Benign promise rejections would trigger false Oops cards [R9]
- **Location:** `actx.resume()` 3093 is not caught; `requestFullscreen`/`exitFullscreen` 4737 (try/catch catches only the synchronous error). A touch `pointerdown` is not a user activation, so the first ⛶ tap is rejected.
- **Fix:** `.catch(() => {})` on these promises. The global handler ignores rejections marked benign. A scripted session records zero `unhandledrejection`s. Run fullscreen on `pointerup`.
- **Spec:** SPEC-025 AC 7c.

#### RR-68 MEDIUM: The button list is a frame old: two taps in one frame run two actions [R7]
- **Location:** `buttons` is rebuilt only in `drawUI` (6932); `pointerdown` runs `hit.act()` at once (3236). Affected: `nextLevel` 2803 (`level++` with no unlock check), `playCard` 2864, `buyLook` 2393–2397, `resetProgress`.
- **Why:** Two fingers on "Next" play level n+2, which is still locked. Two fingers in the wardrobe arm and buy, skipping the confirm.
- **Fix:** A generation stamp on the button list that goes up on every screen change. `nextLevel` is clamped to `unlocked`.
- **Spec:** SPEC-025 AC 7d.

#### RR-69 MEDIUM: Gamepads are tracked by list position [R8, M14]
- **Location:** `pollPads` 3312–3324 (`filter(Boolean)`, `padPrev[i]` by position), `inputFor` 3384; no connect/disconnect listener; `p.mapping` is not checked.
- **Why:** When player 1's pad drops, player 2's pad takes over player 1 and fires phantom edges (A on the win screen = `nextLevel`).
- **Fix:** Track pads by `Gamepad.index` in connect order. A disconnect during play pauses. The first poll after a (re)connect fires no edges. Skip non-`standard` mappings for buttons.
- **Spec:** SPEC-025 AC 7e (may move to a later release spec; see SPEC-025 Review notes).

#### RR-70 MEDIUM: Android Back leaves the app mid-level, without pausing or settling [R10, P12]
- **Status (2026-11-26):** done (SPEC-033; the wrapper's native Back is later).
- **Location:** No `popstate` handling and no Capacitor `backButton`; Escape is mapped per screen in `onKey()` 3142–3191.
- **Why:** Children trigger the edge-swipe Back by accident. In-level coins and a pending win are lost. Play's quality guidelines expect Back to move through the app's screens.
- **Fix:** SPEC-025 exposes one `goBack()` (today's Escape logic) as the only back handler, plus `__bb.goBack`. The wrapper (later) wires the native Back to it. What Back does on the home screen is decision D-14.
- **Spec:** SPEC-025 AC 14d; later; decision D-14.

#### RR-71 MEDIUM: Flaky `bosses.spec.js:143` (assert :163): the cause is unseeded test starts [R11]
- **Location:** `tests/bosses.spec.js` 22–31 and the test at 143 (assert at 163); `tests/helpers.js:196` (`resetGame` calls `seedRandom()` with no value); the same seeding after the start in `tests/tutorial.spec.js` 356, 546.
- **Spec:** SPEC-011 AC 8d (Phase A; fix round: moved from SPEC-012, so the harness is fixed before the split). Root cause and fix: section 3a.

#### RR-72 LOW: Rotation and resize edge cases [R12]
- **Status (2026-11-27):** done (SPEC-038: the overlay blocks every control and portrait in a level pauses; `fit()` runs once per animation frame).
- **Location:** 6946–6955 (`buttons = []` only on `PHONE`, so tablet buttons stay live under the rotate overlay); 9225–9226 (rotating back resumes play instantly); 1169–1170 (`fit()` on every resize event).
- **Fix:** Clear buttons under the overlay on every touch device, pause on portrait during play, and run `fit()` at most once per frame.
- **Spec:** BACKLOG.

#### RR-73 LOW: Two fingers on one stick half stop the hero [R14]
- **Status (2026-11-27):** done (SPEC-038: a per-player pointer stack, `activeStick`).
- **Location:** 3237–3240, 3253.
- **Fix:** Keep a per-player pointer stack and fall back to the previous finger.
- **Spec:** BACKLOG.

### 2.7 Maintainability and release process

Facts:
- Tests workflow 2026-11-23…25: 45 runs (23 green, 10 red, 12 cancelled). 7 of the 10 red runs were text fit with CI fonts; 3 were the `__bb` getter allow-list, which is not `@fast`.
- The suite has 379 tests and takes 12–15 min per push. SPEC-023 ended at 248 tests and 7.5 min.
- `window.__bb` has 184 members.

#### RR-74 HIGH: The Pages deploy fails in about 1 of 3 runs with green tests; master is not live [R4, M1]
- **Location:** `.github/workflows/pages.yml:24–46`: `upload-pages-artifact@v5` and `deploy-pages@v5` are consecutive steps of one job.
- **Why:** The deploy is how every fix reaches PWA players and later the web tree the wrapper is built from. At review time the deployment of a52ecec (SPEC-031) had failed and the site served SPEC-030. SPEC-029 never deployed on its own.
- **Fix:** See section 3b. A separate `build` job uploads in parallel with the tests. `deploy` (`needs: [test, build]`) runs only `deploy-pages`, with one automatic retry. A post-deploy check confirms the live site serves this commit.
- **Spec:** SPEC-011 AC 10c, Phase A (SPEC-011 edits `pages.yml` anyway). This retires the reference note "never `gh run rerun --failed`" (§3b, §4).

#### RR-75 HIGH: The 9,400-line split runs with no undefined-name check [M2]
- **Location:** SPEC-011 AC 3/4/11 (regex import scan, `node --check`, Node import of core); ESLint arrives only in SPEC-025.
- **Why:** Every forgotten import becomes a `ReferenceError` on a rarely tested path (a gamepad branch, the phone overlay, a bonus-world win, an error path): a frozen screen found after release. The same blind spot covers SPEC-012.
- **Fix:** Bring the cheapest part of SPEC-025 AC 8 forward: ESLint (devDependency) with `no-undef`, `no-unused-vars`, `no-var`, `prefer-const` and missing named imports over `src/`, run in CI. SPEC-025 extends the rules.
- **Spec:** SPEC-011 AC 11b.

#### RR-76 HIGH: "All tests over http" (SPEC-011 AC 8) is under-specified [M4]
- **Location:** `tests/helpers.js:12,64` (`GAME_URL`); `scripts/balance.js:293–303` (uses `openSim()` outside Playwright, so no `webServer`); `balance.yml:56`; `scripts/perf.js:22,70–75` (`file:///` A/B); `tests/pwa.spec.js:190` ("no service worker on file://"); `index.html:9243` (the SW registers on every http page).
- **Why:**
  - `npm run balance` (required for every gameplay spec) would find no server.
  - `perf.js` would load a module-less shell.
  - Every test context would register `sw.js` and precache ~150 sprites + three.js on SwiftShader runners, so art tests would depend on the SW.
  - "No test removed" clashes with the file:// SW test.
- **Fix:** The scripts start their own `makeServer()`. Playwright blocks service workers by default and only the PWA tests allow them. The file:// SW test becomes the notice test. CI time is recorded before and after.
- **Spec:** SPEC-011 AC 8 (changed), 8b.

#### RR-77 HIGH: No store release pipeline: signing keys, tag → build traceability, staged rollout, store rollback [M6, M15]
- **Location:** No keystore docs, CHANGELOG, tags or `version`; `SW_VERSION` is set by hand.
- **Why:**
  - A lost upload key or an account only one person can reach means the app can no longer be updated.
  - Stores have no revert: a fix is a new build plus review (hours to days).
  - Without staged rollout, a bad build reaches every child at once.
- **Fix:** In the later release spec:
  - Play App Signing, with the upload key in a password manager plus an offline backup, and Apple account recovery.
  - Tag `vX.Y.Z`, then a CI wrapper build from exactly that tag.
  - Internal testing / TestFlight, then a staged or phased rollout.
  - A rollback runbook: the last good tag rebuilt with a higher build number (needs RR-17).

  Key and account custody is decision D-6.
- **Spec:** later; decision D-6.

#### RR-78 MEDIUM: Dependency updates [M7]
- **Location:** three.js in `index.html:50`, `sw.js:9` and `package.json` (tests serve `node_modules/three`); `pwa.spec.js:144` compares only `index.html` ↔ `sw.js`; `tests.yml` triggers only on `SPEC-*` pushes; `node-version: lts/*`; actions pinned by major tag.
- **Why:** Dependabot bumping `three` in `package.json` alone would make CI test a version players never get. Dependabot branches get no CI, and CLAUDE.md forbids touching other people's branches. `lts/*` moves Node majors silently.
- **Fix:** A version-equality test (RR-29). Dependabot ignores `three`. Add a `pull_request` trigger and a CLAUDE.md procedure for bot PRs: CI green, then a `--no-ff` merge into `master`. Merging pushes only `master` and GitHub deletes the bot branch, so no exception to CLAUDE.md's "Never" is needed. Pin the Node major. SHA-pin the actions.
- **Spec:** SPEC-025 AC 11 (changed).

#### RR-79 MEDIUM: Text-fit tests depend on the CI machine's fonts [M8]
- **Status (2026-11-26):** CI font mode done (SPEC-033).
- **Location:** `font-family: system-ui, …` (17/26); `CFG.TEXT_TEST_SCALE`; eight "fits with CI fonts" commits; 7 of 10 red Tests runs.
- **Why:** Every spec loses ~15 min CI rounds to text that fits locally. Real devices (Roboto, SF, OEM fonts) are not measured. Portuguese texts were already shortened for CI.
- **Fix:** Either bundle one licensed web font for canvas and CSS (a visual change, **decision D-3**), or add a local `PW_FONT=ci` mode for the 667 runs.
- **Spec:** decision D-3; BACKLOG (`PW_FONT=ci`).

#### RR-80 MEDIUM: SPEC-012's Node tests: Playwright would load them, and they were planned to gate only master [M10]
- **Location:** `playwright.config.js:16` (the default `testMatch` matches `tests/core/*.test.mjs`); SPEC-012 AC 7 ("`pages.yml` runs it").
- **Fix:** `testMatch: "**/*.spec.js"`, and `npm run test:core` as its own job in `tests.yml`, so it runs on both branches and Pages.
- **Spec:** SPEC-012 AC 7 (changed).

#### RR-81 MEDIUM: CI time doubled in two days; shards are uneven [M11]
- **Location:** 379 tests, 12–15 min per push (shards 8–15 min); `reports/test-times.md:173,186` (target ≤ 8 min); `smoke.spec.js:20` (not `@fast`).
- **Fix:** Tag structural tests `@fast`, use 6 or weighted shards, and record CI time at each close (target ≤ 10 min per push).
- **Spec:** BACKLOG.

#### RR-82 MEDIUM: No web rollback or hotfix runbook [M13]
- **Status (2026-11-26):** done (SPEC-025 runbook; SPEC-033 revert rule and `ref` input).
- **Location:** CLAUDE.md §8 covers only the forward path; `pages.yml` has no `ref` input; `sw.js` keeps a cached broken shell on slow networks.
- **Why:** Today the way back is a revert, a spec-branch run (≥ 15 min), a merge and a Pages run (≥ 15 min plus a fragile deploy).
- **Fix:** A rollback section in the release doc. `pages.yml` `workflow_dispatch` takes a `ref` to redeploy a known-good tag. A PWA test checks that a broken shell is replaced on the next online launch. "A revert may go straight to master" is **decision D-7**.
- **Spec:** SPEC-025 AC 13 (changed); decision D-7.

#### RR-83 LOW: CI gate details [R13]
- **Location:** `playwright.config.js:24` `retries: 0`; the `tests.yml` report job (no shard-count check); actions pinned by tag.
- **Fix:** The report job checks that it has all 4 blob reports. SHA-pin the actions with Dependabot. `retries: 1` on CI is **decision D-15** (recommended: keep 0 and fix flakes at the root, RR-71).
- **Spec:** SPEC-025 AC 10 (changed), 11; decision D-15.

#### RR-84 LOW: Bus factor: one person, one account, an unprotected `master` [M15]
- **Location:** `gh api …/branches/master/protection` → "Branch not protected".
- **Fix:** A ruleset that blocks force-push and deletion of `master` (no required checks, so direct merges still work). The backup person and account access are part of decision D-6.
- **Spec:** SPEC-025 AC 11b; decision D-6.

---

## 3. Root causes

### 3a. `tests/bosses.spec.js:143` flake (R11)

- **What failed:** Pages run 45515871840 on `master`: the test "bots keep out of the grumpiest dad's front when he is not standing" (`tests/bosses.spec.js:143`) failed its assert "the bot goes to help" (`:163`) with `came = false`. The same test was green on the branch.
- **Root cause:**
  - `startGame → resetWorld → makeLittle` draws each bot's approach side (`offset`), `lurkT`, `botAttackCd`, `itemCd` and `starCd` from the game rng.
  - The test seeded the rng only after `startGame`.
  - `resetGame` (`tests/helpers.js:196`) calls `seedRandom()` with no value, which seeds from `Math.random`.

  So the start state was different on every run. With a far `offset`, the bot walks the long way round: 1–7.6 s across 60 starts, and 3 of 60 needed more than the old 300 frames (5 s).
- **Is bb4cae8 enough?** For this test, yes. It seeds before `startGame`, and 600 frames is above the 7.6 s worst case. But three problems remain:
  1. The test now checks one start state of a behaviour with a wide spread. Any unrelated change in rng draw order (a new `rand()` in `makeLittle`, `resetWorld` or `update`) reshuffles the scenario and can fail a later spec **deterministically**, which looks like a regression.
  2. `tests/tutorial.spec.js:356` and `:546` still seed after the start.
  3. A failing unseeded test cannot be reproduced, because the seed is never logged.
- **Fix (SPEC-011 AC 8d, Phase A; fix round: moved from SPEC-012 AC 11):**
  - `resetGame` seeds from the test title (a stable hash) and prints the seed on failure.
  - A smoke scan fails on any `startGame(`/`resetWorld(` in a test that is not preceded by `seedRandom(n)`.
  - Fix the two tutorial tests.
  - Claims about a distribution ("the bot comes to help") loop over ~10 seeds and assert a bound with margin.

### 3b. Repeated Pages deploy-step failures (R4, M1)

- **Evidence:**
  - 8 of the last 30 Pages runs failed in the deploy step with every test green: 45539507388, 45537497907, 45519899541, 45517743297, 45342996277, 45286223874, 45282836817, 45151979190. That is 5 of the 12 runs since SPEC-021.
  - Each log shows `Artifact github-pages successfully finalized`, then 0.24–0.45 s later `Fetching artifact metadata … Found 5 artifact(s)` (the 4 `blob-report-*` + `html-report`), then `No artifacts named "github-pages" were found`. Successful runs log `Found 6` with the same timing.
  - The "fresh `workflow_dispatch`" workaround also failed twice in a row (45517743297 → 45519899541; 45537497907 → 45539507388). Each retry re-runs all 4 shards (~15 min).
- **Root cause:** Eventual consistency of the artifact listing. `deploy-pages` lists the run's artifacts a fraction of a second after `upload-pages-artifact` finalizes it in the same job, and the new artifact is sometimes not listed yet. It is not a name clash with the test artifacts: it also happened in older runs with 0 other artifacts. "Check githubstatus.com" is a generic message.
- **Fix (SPEC-011 AC 10c, Phase A):** Follow GitHub's two-job Pages layout.
  - A `build` job (checkout, `npm run site`, `configure-pages`, `upload-pages-artifact`) runs **in parallel** with the test shards. It does not need them, so the artifact is minutes old by the time it is listed.
  - `deploy` (`needs: [test, build]`) has only `deploy-pages`, as a first attempt with `continue-on-error: true`, then `sleep 30` and a second `deploy-pages` if the first failed.
  - A last step checks that the live site serves this commit's `index.html` (or that the deployment status of the sha is `success`).
- **Side effect:** With the upload in its own job, `gh run rerun --failed` re-runs only the deploy and no longer uploads a second `github-pages` artifact. CLAUDE.md step 8, the `pages.yml` header comment and the memory note "Pages deploy rerun" can then be updated (SPEC-011 docs). That "never rerun --failed" line is a reference note written after the earlier failures, not a process rule from Andrei. It is retired only because its reason goes away, and Andrei is told (section 4, "for information").
- **Follow-up:** Watch the next 10 `master` deploys. If any deploy step still fails, open a BACKLOG item with the logs.

---

## 4. Decisions for Andrei

Each item would change a goal, a decision-type out-of-scope line, or a rule that belongs to the kids, Kostya or Andrei. None of them is written into a spec as decided. The specs either leave the current behaviour or say "if Andrei agrees".

**Status (2026-11-26):** Andrei decided D-1, D-2 (Capacitor), D-3, D-4, D-7, D-8, D-10, D-11 (→ SPEC-034), D-12, D-14, D-15, D-16 (not now) and D-17 as recommended; SPEC-033 carries out D-1, D-3, D-7, D-8, D-12, D-14 and D-15. **Still open: D-5, D-6, D-9, D-13.**

1. **D-1 Rules text "breaks your leg / limp home"** (RR-54, K4). — **decided by Andrei, 2026-11-26: as recommended (softer wording, SPEC-033).**
   - **Question:** May the "How to play" lines say "he pushes you and you fall down; friends help you up … go home to rest" instead of "breaks your leg … limp home"? The mechanic, numbers and pictures stay the same.
   - **Options:** keep the text; soften the wording only; ask the kids for their own words.
   - **Recommendation:** soften it, in the kids' words if possible. The tutorial already says "you fall down". This decides Apple 4+ vs 9+ and PEGI 3 vs 7.
2. **D-2 Capacitor or TWA** (RR-32, P7, K8). — **decided by Andrei, 2026-11-26: as recommended: Capacitor for both stores.**
   - **Options:** Capacitor for both stores; TWA for Android (+ something else for iOS).
   - **Recommendation:** Capacitor for both stores, and keep the PWA as the web version. A TWA cannot start offline on first launch and loads code from github.io on every launch.
3. **D-3 A bundled font** (RR-79, M8). — **decided by Andrei, 2026-11-26: as recommended: `PW_FONT=ci` now (SPEC-033), the bundled font is chosen with samples before packaging.**
   - **Question:** Ship one licensed web font for all texts, so CI, Android and iOS measure the same? This is a visual change to the comic UI.
   - **Options:** keep system fonts, and add a local `PW_FONT=ci` mode to catch CI-only misfits; bundle a rounded, child-friendly font (choose from samples).
   - **Recommendation:** add `PW_FONT=ci` now (BACKLOG). Decide the font with samples before packaging.
4. **D-4 What the low quality tier may drop** (RR-43, F2). — **decided by Andrei, 2026-11-26: as recommended.**
   - **Question:** On weak devices, which parts of the SPEC-021 comic look may go?
   - **Recommendation:** keep outlines and hatching. Drop MSAA and paper grain, change PCF shadows to basic 1024 or blob shadows, and show half of the background decor.
5. **D-5 Own domain for the web version** (RR-26, S11). — **still open.**
   - **Options:** stay on `andrei-danilin.github.io/bebebe-game/`; a custom domain (yearly cost; the URL changes and saves move only through the parents' code); a separate org/user Pages site.
   - **Recommendation:** an own origin before the web version is promoted.
6. **D-6 Who holds the store accounts and keys, and the backup person** (RR-77, RR-84, M6, M15). — **still open.**
   - **Question:** Who owns the Google Play and Apple developer accounts, the Android upload key and its password? Who is the second person with recovery access?
   - **Recommendation:** Play App Signing (Google keeps the app key); the upload key in a password manager plus an offline backup; one named backup person with documented recovery for GitHub, Google, Apple and the claude.ai project.
7. **D-7 A revert straight to master** (RR-82, M13). — **decided by Andrei, 2026-11-26: as recommended (a revert of a merge commit straight to `master`, a tag redeploy; SPEC-033).**
   - **Question:** When a deploy breaks the game for kids, may `Revert SPEC-NNN` go straight to `master` and deploy, without the spec-branch CI run first?
   - **Options:** keep today's rule (revert as a branch run, ≥ 30 min to live); allow a revert of a merge commit only, with the Pages tests still gating the deploy; also allow redeploying a known-good tag through `workflow_dispatch`.
   - **Recommendation:** allow it for reverting a merge commit only, and add the tag redeploy.
8. **D-8 Shop / "Buy" wording** (RR-60, K9). — **decided by Andrei, 2026-11-26: as recommended ("Get for 🪙 N", SPEC-033).**
   - **Question:** Keep 🛒 "Shop" on the win and lose screens and "Buy for N"? (The Shop button is Andrei's, SPEC-026; the coin shop is in Kostya's story.)
   - **Recommendation:** keep the shop. Show 🪙 in every price, drop the 🛒 icon on the lose screen, and consider "Get" instead of "Buy".
9. **D-9 Kostya's name in the credits and the public repo** (RR-61, K12). — **still open.**
   - **Options:** keep "Made by Kostya and Dad" and the public repo; first name off the credits; make the repo private (Pages from a private repo needs a paid plan) or move the family docs.
   - **Recommendation:** a family choice before the store listing. Store rules allow either.
10. **D-10 Minimum device** (RR-36, RR-65, F10, P9). — **decided by Andrei, 2026-11-26: as recommended.**
    - **Question:** Officially require WebGL2 / GLES 3.0, iOS 16.4+ and Android WebView ≥ Chrome 94?
    - **Recommendation:** yes. three.js r187 already needs these. Declare them in the store builds, and show "This device can't show the 3D game" below them.
11. **D-11 A fixed live time step** (RR-08, A5). — **decided by Andrei, 2026-11-26: as recommended: its own small spec, SPEC-034. Done (SPEC-034).**
    - **Question:** Should live play advance in fixed steps (e.g. 1/60 s from an accumulator), so the game behaves the same on a 30 Hz phone, a 120 Hz iPad, the balance report and the future server?
    - **Options:** keep today's one step per frame (SPEC-012 only documents it); fixed 1/60 (no visible change on normal devices, steadier on slow ones); 1/30 (would change the feel, not recommended).
    - **Recommendation:** fixed 1/60 in its own small spec after SPEC-012, with a balance run.
12. **D-12 Reset progress behind the parents' gate** (RR-18, S2, R3). — **decided by Andrei, 2026-11-26: as recommended (SPEC-033).**
    - **Question:** Move "Reset progress" from the child's Progress page to the grown-ups page behind the gate? The double-tap rule is Claude's, but the button leaves the child's page.
    - **Recommendation:** yes, with "bring back erased progress" (undo) there too. SPEC-025 does the safe part either way: a delayed confirm at another spot, plus undo.
13. **D-13 Privacy policy text, contact and developer name** (RR-52, K2). — **still open.**
    - **Question:** Who is named as developer (a person or a legal entity), which contact email goes into the policy, and what is the final legal wording? Publishing is parked, so this is for the release spec. Also: may SPEC-025 already add a short factual "Privacy" section to the new grown-ups page (what is stored, nothing sent, how to erase it; not the legal policy), or does all privacy text wait for the release spec?
    - **Recommendation:** yes to the short in-app section in SPEC-025 (it is offline, has no link and states only what the code does). For the policy: use the factual list in Appendix A, a dedicated contact address, and the same text in the app and on the website.
14. **D-14 What Android Back does on the home screen** (RR-70, R10). — **decided by Andrei, 2026-11-26: as recommended (SPEC-033).**
    - **Options:** leave the app at once; ask "Leave the game?" with big Yes/No; leave on a second Back within 2 s.
    - **Recommendation:** ask, with big buttons.
15. **D-15 One automatic retry for flaky tests on CI** (RR-83, R13). — **decided by Andrei, 2026-11-26: as recommended: `retries: 0` stays (SPEC-033).**
    - **Question:** `retries: 1` on CI changes SPEC-023's "green means green".
    - **Recommendation:** keep `retries: 0` and fix flakes at the root (seeding, RR-71).
16. **D-16 The second test pass on master** (RR-74 option, M1). — **decided by Andrei, 2026-11-26: as recommended: not now.**
    - **Question:** Skip the Pages test pass when the merge commit's tree equals a branch commit whose Tests run is green? (Andrei's speed rule says the Pages workflow tests master again.)
    - **Recommendation:** not now. Fix the deploy first (SPEC-011), then decide.
17. **D-17 Device pass thresholds** (section 5). — **decided by Andrei, 2026-11-26: as recommended.**
    - **Question:** Confirm the proposed fps, memory, battery and start-time thresholds, and the reference devices.
    - **Recommendation:** as proposed in section 5.

**For information (no decision needed, but Andrei should know):**
- After SPEC-011, updates arrive exactly as today: an online launch gets the new version at once, because `index.html` stays network-first. The modules are pinned to their content hashes, so a page never mixes two versions (RR-30).
- SPEC-011 AC 10c retires the reference note "red deploy with green tests: start a fresh run, never `gh run rerun --failed`" (CLAUDE.md step 8, the `pages.yml` comment and the memory note). With the upload in its own job, `rerun --failed` re-runs only the deploy. The note was written after the earlier failures; it is not a rule Andrei set, and it goes only because its reason goes away (RR-74).
- SPEC-011 and SPEC-025 each run as three merges (phases) instead of one, because the queue 024 → 011 → 012 → 025 stays as Andrei set it.
- SPEC-025 changes Claude's reset rule (a "No, keep it" button and a separate, delayed confirm spot, plus undo) and the "unknown fields dropped" plan, and adds a gated "Erase all data on this device" (RR-17, RR-18).
- SPEC-025 saves a win that is already decided when the app is hidden. This extends the rule at `game-design.md` :67–68, which is marked "решено во время запуска, проверить с детьми", so it can be checked with the kids together with that rule (RR-24).
- D-1 is decided (the rules text is softer, SPEC-033), so the rating answers in Appendix B may use the softer text.
- **SPEC-025 run decisions, confirmed by Andrei (2026-11-26):**
  - the app losing focus (blur) pauses the game but keeps the sound;
  - "Try again" (reload) appears on the "Oops" card when the same error repeats;
  - the parents' gate waits 3 s after a wrong answer before its answers can be pressed;
  - a reset keeps two copies, so a second reset after a short play loses neither progress;
  - a release re-downloads the caches (shell and modules by `SRC_HASH`, sprites by `ASSETS_HASH`);
  - the version label reads `1.0.0-dev+<hash>`.

---

## 5. Manual device checklist for Andrei

**Devices (minimum set):**
- A low-end Android phone: Samsung Galaxy A13/A14 (Mali-G52, 3 GB) or Redmi 9A (PowerVR GE8320, 2 GB).
- An older iPhone: iPhone 8 (2 GB), or SE 2.
- Strongly recommended, an old tablet: iPad 6th/7th gen or a cheap Android tablet. Tablets run the heaviest (desktop) path.
- Reference: Andrei's PC in Chrome.

**When:** Today on the web/PWA (installed to the home screen) for a first look. Then again after SPEC-025: offline from the first launch, the error cards, `__bb.perf()` and the `?perf=1` overlay. Then on the Capacitor builds in the packaging spec.

**Tools:**
- **Android:** USB + `chrome://inspect` (Performance and Memory panels); `adb shell dumpsys meminfo <pkg>`, `dumpsys gfxinfo`, `dumpsys thermalservice`, `dumpsys battery`.
- **iOS:** Safari Web Inspector (Timelines: frames, memory); Xcode gauges for the app build.
- Until SPEC-025 adds `__bb.perf()`, the inspectors plus `__bb.look3D("memory")` are enough. Write results to `reports/perf.md` (device, OS, browser/WebView version, build hash, tier).

**Scenes (all 1 player + bots, then 2 players):**

| # | What to try | How long | What to watch (proposed pass on low-end Android / iPhone 8 / old iPad) |
|---|---|---|---|
| 1 | **Cold start**: fresh install (PWA: first online visit, then airplane mode and reopen). **Warm start**: app killed, then reopened. | 5 runs each, median | Time to first paint (≤ 1 s), to the home screen (≤ 6 s / 3 s / 4 s offline). After SPEC-025: no "needs internet" text anywhere when offline. |
| 2 | **Gameplay worst cases**: Park 1, Beach 16 (palms), City 8, Winter 8 (snow), Field (nets), a level with both houses (roof fades), the first boss level, the tutorial map. | 2 min each | fps median / frame-time p95: ≥ 30 / ≤ 45 ms; ≥ 55 / ≤ 25 ms; ≥ 45 / ≤ 33 ms. Max frame after the first 2 s: ≤ 100 / 50 / 66 ms. Draw calls ≤ 300 / 300 / 600. Does Dad feel slower than on the PC (game time behind real time)? |
| 3 | **Menus**: home (3D behind), world map, Character → Wardrobe (3 preview renders), story comic, pause, portrait rotate prompt. | 1 min each | Does the device get warm on menus? CPU/energy gauge. Target later: ≤ 30 renders/s, none on covered screens. |
| 4 | **Level transitions**: start → win → next level, 10 times, including a new world and the first boss. | ~10 min | Hitch at level start (≤ 500 / 250 / 400 ms total). Any freeze while Dad already moves. |
| 5 | **Soak**: continuous play across all six worlds, 50 % brightness, not charging, room temperature. | 30 min | Heap and GL counts every level (after 30 levels vs level 5: +≤ 10 %, GL ±2); PSS ≤ 400 MB (2 GB device); fps at minute 20 ≥ 80 % of minute 2; battery ≤ 12 % / 10 % / 10 % per 30 min; thermal status ≤ moderate. |
| 6 | **Background and return**: Home button, app switch, lock screen during play. | 10× short, 1× for 10 min | The game must be paused on return (after SPEC-025), with no push the moment you come back, the picture drawn (not black) and progress kept. Today it resumes instantly: note it. |
| 7 | **Win at the last moment**: take the last heart and press Home during "Hooray!"; kill the app from the switcher; reopen. | 3 tries | After SPEC-025 the level is won and the next one open. Today it may be lost (RR-24). |
| 8 | **Sound**: start with a tap; take a phone call or use Siri / Control Centre mid-level; come back; toggle the silent switch. | 5 min | Sound returns after the call (iOS "interrupted", RR-66). Note when sound first starts on iPhone (first tap vs later). |
| 9 | **Rotation**: rotate to portrait mid-level and back; on a tablet, tap where buttons were under the rotate overlay; notched phone in both landscape directions. | 5 min | No play under the rotate overlay, no taps going through it, corner icons not under the cutout or gesture bar. |
| 10 | **Gamepad**: two Bluetooth pads in a 2-player game; switch pad 1 off mid-level; switch it on again; hold A while reconnecting on the win screen. | 10 min | Does player 2's pad take over player 1? Phantom "Next"? (RR-69.) |
| 11 | **Many fingers**: double-tap fast and two-finger tap on Reset progress, on "Next" on the win screen and on a wardrobe price. | 5 min | Today: a reset can wipe all progress, "Next" can skip into a locked level, a buy can skip the confirm (RR-18, RR-68). Back up the save first (export after SPEC-025, or test on a fresh profile). |
| 12 | **Airplane mode**: first launch with no network (after SPEC-025 on the PWA; on the store build later); also turn Wi-Fi off mid-level and go back to the map. | 5 min | Starts and plays; sprites present (not code drawings); no "needs internet". |
| 13 | **Low storage / private mode**: fill the device close to full, or use a private Safari window; play and win a level; reopen. | 10 min | After SPEC-025: the game plays and shows "This device isn't keeping progress" once. Today progress silently disappears (RR-23). |
| 14 | **Android Back gesture** (store build later; Chrome now): edge-swipe Back during play, in menus and on home. | 5 min | Today it leaves the page. Later: pause in play, parent screen in menus, D-14 on home. |
| 15 | **Context loss**: on Android open many heavy apps while the game is in the background, then return; on any device force it once from the inspector (`WEBGL_lose_context`). | 5 min | A "Tap to continue" card and the scene rebuilt (after SPEC-025); never a black field with the HUD over it. |
| 16 | **Weak-device feel**: hand the tablet to a child for one normal session. | 20 min | Stutter, heat, "the joystick stopped" (two fingers on one stick, RR-73), anything confusing. |

---

## 6. Appendices

### Appendix A: What the privacy policy must say (to match the code)

**Offline release (after RR-29):**
- **Nothing collected.** No personal data is collected, sent or shared. The app makes no network requests. There is no account, no analytics, no ads, no tracking, no third-party SDKs and no in-app purchases.
- **Stored on the device only.** This is removed by "Reset progress", by clearing the app's data, or by uninstalling:
  - progress: levels, stars, coins, bought items and upgrades, seen story scenes
  - chosen outfits
  - names typed for the players, the Big One and the bots: free text up to 12 characters, shown only on this device
  - chosen language
  - after SPEC-025: backup copies of the save and a log of the last 20 errors (technical messages only), which never leave the device
- **Language:** on first launch the app reads the device language to pick English, Spanish, Portuguese or Russian. It is stored on the device only.
- **Permissions:** none. Game controllers, full screen (web only, after a tap) and sound need no permission. No camera, microphone, location, contacts, notifications or photos.
- **Coins** are earned by playing and cannot be bought. Nothing costs real money.
- **Parents' area** (SPEC-025): the progress code and the error log can be copied only by a grown-up after the parents' check.
- **Children's privacy:** the app is made for children. No personal information is collected, so there is nothing to review or delete on a server. Contact address: Andrei to provide (D-13).
- **Website version:** hosted on GitHub Pages, and GitHub may log IP addresses as the host (link to GitHub's statement). Until SPEC-025, three.js loads from jsDelivr.
- **Changes:** the policy date, and the fact that changes ship with app updates (the in-app text is updated with the app).

**Additions when online play ships (SPEC-013…015):**
- **Sent only when a child opens "Online":** the room code, the online name (two list indexes, never typed text), outfit and gear choices, controller input, protocol and app version, and a temporary session token (no device ID, RR-56).
- **IP address:** used only in memory for the connection and join limits. It is not logged and is gone when the room closes.
- **Not offered:** chat, free text, friend lists and accounts. Rooms are private by code.
- **Where:** Microsoft Azure, Brazil South, with Microsoft as processor. Server logs keep room events with a hashed code, no IP and no names, for N days (the set retention).
- **Lawful basis:** COPPA "support for internal operations", GDPR necessity / legitimate interest, and an international transfer statement. A written retention policy and security measures (amended COPPA).
- **Store labels:** Apple "Data Not Collected" (if only ephemeral) or "Not Linked to You"; Google Data safety with the ephemeral-processing answers.

### Appendix B: Draft age-rating answers (today's game; re-answer when online ships)

**Apple App Store Connect (2025 questionnaire: 4+, 9+, 13+, 16+, 18+):**
- **Cartoon or fantasy violence:** Infrequent/Mild. Cartoon pushes that make a kid fall, "BAM!" bursts and screen shake, plus the "breaks your leg" rules text. If D-1 softens the text, "None" may be defensible; answer honestly. This answer decides 4+ vs 9+.
- **Realistic, prolonged or graphic violence, weapons:** None.
- **Profanity / crude humor:** None (the stink lines over trash bins are décor).
- **Mature or suggestive themes, sexual content, nudity:** None (air kisses make Dad blush; family context).
- **Horror or fear:** None.
- **Alcohol, tobacco, drugs, gambling, simulated gambling, contests:** None.
- **Medical:** None (🩹 is a game item).
- **Unrestricted web access:** No.
- **User-generated content shared with others:** No.
- **Messaging / chat:** No.
- **Advertising:** No.
- **In-app purchases:** No.
- **Loot boxes:** No.
- **Parental controls / age assurance:** No (the parents' gate guards only the save code and the log).
- **Kids Category:** "Made for Kids". Aim for the 5–8 band with 4+ (needs D-1); 9+ fits the 9–11 band.

**Google Play (IARC questionnaire, Families):**
- **Target audience:** under 13 (5 and under / 6–8 / 9–12), so the Families policy applies. Teacher Approved can be requested.
- **Violence:** yes, cartoon/fantasy, unrealistic, no blood, no death. The characters are human-like (a dad and kids), so expect ESRB E (possibly "Mild Cartoon Violence"), PEGI 3 or 7, USK 0/6. Softening D-1 helps.
- **Fear, sexuality, language, controlled substances, crude humor, gambling:** No.
- **Users interact / share info / location:** No today. When online ships: "Users can interact" (no chat).
- **Digital purchases:** No.
- **Ads:** No.
- **Data safety:** "No data collected, no data shared", plus the Families Policy badge.
- **Note:** Google's Aug 2026 ban on child-targeted anonymous chat does not apply (no chat). Keep SPEC-013's "no chat, no free text between players".

### Appendix C: Stale names in SPEC-011 / 012 / 025 (merged)

The specs were corrected in this run, with each correction marked "(from review)".

| Spec, place | What it says | Today (a52ecec) |
|---|---|---|
| 011 Description | "~4,900-line `index.html`" | 9,387 lines (2D 2,705, 3D 2,245) |
| 011 Context | inline module "line ~45 to the end"; a small offline hint | module 49–9385; the hint has 4 languages (en/es/pt/ru) |
| 011 Context | sections from `architecture.md` | that table is off by up to ~2,500 lines (RR-15) |
| 011 Context | tests on file://: smoke, gameplay, i18n, phone, levels, names | also art, assets, bosses, economy, invariants, look3d, menus, story, storyfit, tutorial, wardrobe, worlds, balance; shared-page fixtures `sharedPage`, `levelPage`, `simPage` |
| 011 Context | `pages.yml` copies `index.html manifest.webmanifest sw.js icons v1-2d` | also `assets/` |
| 011 Context / AC 9 | `PRECACHE_LOCAL`; three.js and `icons/` cache-first | plus generated `PRECACHE_ASSETS` + `ASSETS_HASH`; cache named `SW_VERSION-ASSETS_HASH`; `/assets/` cache-first; sprites precached best-effort |
| 011 Context | SPEC-008 "runs before this spec" | done |
| 011 AC 2 | `config.js` = `CFG`, `GLOVES`, `KISSES`, `RESCUE_KIT` | plus `REWARD`, `WARDROBE_TIERS` + `tierPrice`, `UPGRADES` + `upgTop`, `BOSSES`, `WORLD_SEED`; half of `CFG` is look (RR-10) |
| 011 AC 2 | `src/i18n.js` — `I18N`, `ruPlural` | plus `ptPlural`, `capFirst`, `LANGS`, `HTML_LANG`, `detectLang`; `STORY`, `RULE_ICONS`; `lang` init touches storage and DOM |
| 011 AC 2 | `client/outfits.js` | wardrobe state `skinSel`/`skinKeep`/`tryingOn`/`buyLook`/`endTryOn`, `BOSS_LOOKS`, `WARDROBE_ART`, `adoptWorn`, `fitOutfitsToOwned` |
| 011 AC 2 | `ui/overlay.js`, `overlay-phone.js` | screens are home, map + level card, story + comics + scenes, Character (Progress/Items/Wardrobe/Upgrades), tutorial pages, win |
| 011 AC 2 | `three/skins.js` | previews (`skinPanels`, `previewCache`), `BOSS_PARTS`/`dressBoss`, houses, toon/hatch materials, paper grain |
| 011 AC 2 | `rules.js` (push, hug, …) | plus `widePush`/`pushHit`, `bigMood`, `startKindWalk`/`updateKindWalk`/`winNow`, hearing, rescue kit, tutorial hooks |
| 011 AC 2 | `progress.js` (saves: progress, outfits, names, lang) | outfit saving is welded to wardrobe state; the language init sits in the I18N section (RR-22) |
| 011 AC 6 / texts | file:// notice en/es/ru | needs pt (hard rule 2, SPEC-028) |
| 011 AC 7 | Park 1, Beach 9, Winter 18 | Beach and Winter are locked bonus worlds since SPEC-030 (reachable through the `__bb.world` setter) |
| 011 Numbers | `SW_VERSION` `bebebe-v2` (or next) | current `bebebe-v3`, next `bebebe-v4` |
| 011 BACKLOG | "index.html is ~4,700 lines" | 9,387 |
| 012 Context | "`giveReward` replaced by ledger entries" | `giveReward(win)` still exists (2706) and writes through `addCoins`; star coins are paid at pickup (3669) |
| 012 Context | kisses and kits spent from `progress.inv` | `gameInv()` (practice uses `tutorialInv`); glove charges spent and saved in `hug` 3483 |
| 012 Context | "the kit function" | `useRescueKit(pi)` 4102, `canUseKit` 4101 |
| 012 Context | `SFX.*` (~18 places), pop texts (`texts`) | `SFX` ×17, `burst` ×17, `popText(x, y, text, color, meaning)` ×18; `meaning` → `POP_ART`; plus footsteps/heard hint (SPEC-019), moods/bosses (SPEC-021/022) |
| 012 AC 1 | "existing fixed logic" | no fixed step in live play (RR-08; SPEC-034 added it) |
| 012 AC 2 | slot `glove, gloveCharges, kisses, kits` | `progress.equip[pi]` + the shared `progress.inv` via `gloveOf`; local p1/p2 share one pool; the Big One slot also needs `boss` (`bossFor`) |
| 012 AC 5 | `banner(world, n, type)` | also the world-opened banner (SPEC-030) and toasts |
| 012 AC 6 | `perSlot { hugs, pushes, starCoins, kissesUsed, kitsUsed, gloveChargesUsed, rests }` | today's `stats` = `{ hugs, time, playerHugs, rests, starCoins }`; the reward uses `playerHugs` |
| 012 (missing) | — | tutorial/practice games, `pushWaves`, `bigMood`, kind walk, `worldOpen`, scenes (RR-04, RR-11) |
| 025 Context | `bebebe-place` (old); migrations SPEC-006/009/016 | `bebebe-place` not read since SPEC-006; also SPEC-021 (outfits `v`, `big: 0` → dad), SPEC-022 (`seen`), SPEC-026 (prices), SPEC-028 (`pt`, first-launch language keyed on the progress key), SPEC-029 (`seen.tutorial`), SPEC-030 (locked `lastWorld`, "played" exception); fixtures up to `pre-spec-030.json` + `stale-tab.json` |
| 025 Context | `sw.js` precaches three.js from the CDN; BACKLOG "Offline 3D" | that BACKLOG line still says "needs a local server instead of double-click", which SPEC-011 already decides; SPEC-025 closes it |
| 025 AC 1 | — | must also cover `pages.yml` / the site list (`vendor/`), the test "sw.js precaches the same three.js version" (`pwa.spec.js:144`), hard rule 8's URL rule, and jsDelivr routing in `helpers.js`, `pwa.spec.js`, `playwright.config.js` |
| 025 AC 3 | `{ version, progress, outfits, names, lang, seen, … }` | `seen` lives in `progress.seen` (`cleanSeen` over `SEEN_IDS`); `progress` has no version today (only outfits `v: 2`); v1-2d still writes `bebebe-lang`/`bebebe-skins` on the same origin |
| 025 AC 6/7 | "How to play / About" page; en/es/ru texts | "How to play" is a story page (`storyPage = "rules"`); Character has a Progress page; all texts need pt |
| 025 AC 12 | `SW_VERSION` bumped by hand / derived from version | coexists with the generated `ASSETS_HASH` (and `SRC_HASH` after SPEC-011): a script writes between markers |
| 025 AC 14 / Context | "`blur` clears keys; no `visibilitychange` pause" | still true; the pending-win timing (SPEC-022 kind walk) is new (RR-24) |
| 025 AC 15 | `disposeTree` covers a level | also `paperCache`, `mapBgCache`, `previewCache`, `netMats`, `matCache`/`hatchCache` (kept by design), art images |
| `docs/architecture.md` "Save data" | `bebebe-lang: en|es|ru` | `en|es|pt|ru` (fixed by SPEC-011's doc rewrite) |
