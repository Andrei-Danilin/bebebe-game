# SPEC-008 — Consistency and balance checks: invariants, autopilot simulation, balance report

Status: done (3555d64)
Complexity: L
Branch: SPEC-008-balance-checks
Decided by: Andrei (2026-11-22): the game needs tests and checks for consistency and balance, so that rules, numbers, docs and difficulty stay coherent as features pile up. Everything below (what is checked, the simulator, thresholds, report format): Claude (spec author).

## Description
Ten specs in (four worlds, rescue kits, phone mode, fast tests), numbers live in `CFG`, rules in code, descriptions in `docs/game-design.md`, and nobody checks that they still agree or that 80 levels still feel right. This spec adds three layers:
1. **Invariant tests** (fast, in CI): rules that must always hold — speed caps, timings that make rescue possible, rewards that add up, saves that round-trip, every shop item complete in three languages.
2. **Autopilot simulation**: a headless mode where the player's Little Ones are driven by an AI too, with seeded randomness, so whole levels can be played at high speed and measured.
3. **Balance report** (`npm run balance`): plays every level of every world several times and writes `reports/balance.md` + `reports/balance.json` — win time, hugs, falls, rescues, rests, stars, coins — and flags anything outside the target ranges. A small sample of it runs in CI.

## Goal
- A change that breaks a rule or makes a level unwinnable/trivial fails a test or shows up red in the report.
- Docs can't silently drift from `CFG`: the numbers section of the game design is generated.
- The economy spec (SPEC-009) and any later tuning use the report to set numbers, not guesses.

## Context
All of this is on `master` (SPEC-006, SPEC-007, SPEC-010, SPEC-018 are done):
- **Worlds and difficulty** (SPEC-006): `WORLDS = ["park", "school", "beach", "winter"]`, 20 levels each (`CFG.WORLD_TYPES`: 1 classic, 2–4 meadow, 5–7 village, 8–10 river, 11–13 rooms, 14–16 arena, 17–20 maze); a level is `(world, n)`. `difficulty(world, n, lost = 0)` → `{ chase, search, patrol, hearts, boost }` is the single source of the Big One's numbers (`bigSpeeds()`, `bigBoost()` read it for the running level); chase, search and patrol are capped by `CFG.BIG_CHASE_MAX`, a getter = `CHASE_MAX_SHARE × PLAYER_SPEED` = 142.5 (player 150, bot 135). `levelReport(world, n)` builds a level without touching the game. Fast-star time = `CFG.FAST_TIME(n) + w × CFG.FAST_PER_WORLD` (= `lastReward.target`).
- **Saves** (SPEC-006/007/018): `bebebe-progress` = `{ worlds: { park|school|beach|winter: { unlocked, stars } }, lastWorld, coins, inv: { mittens, mega, kisses, rescues }, equip }`; `loadProgress(pv)` is the pure save → progress merge (never throws), exposed as `__bb.loadProgress`. `bebebe-outfits` (indexes `{ p1: { hair, hat, jacket, pants }, p2, big }`) and `bebebe-names` are read only at start (a test needs a reload for them).
- **Rest and kits** (SPEC-007): `REST_TIME` 30; rescue kit 🩹 `RESCUE_KIT = { price: 15, pack: 3 }`, `canUseKit(l)`, `useRescueKit(pi)`, `KIT_INVULN` 2; air kisses `throwKiss(pi)`, `KISSES = { price: 20, pack: 5 }`; gloves `GLOVES.mittens` 30 / `mega` 60 (3 charges).
- **Randomness**: `rand(a, b)` (helpers section, on `Math.random`) is shared by gameplay (item and star timers, bot rescue delay and lurk timers, the Big One's look timers, `makeLittle`, `resetWorld`) and by visuals (`burst` particles, camera shake in `syncScene`). Direct `Math.random()` calls: 10 — 7 gameplay (`randomFreePoint`, `spawnItem` ×2, `spawnStar`, the Big One's `lookSign` ×3), 3 visual/UI (`randomOutfit`, the blush heart burst, snow). The level generator and the 3D decorations already use their own seeded `mulberry32`.
- **Stepping**: `__bb.update(dt)`; tests advance with `step(page, seconds)` (`tests/helpers.js`, 60 fps) or the `window.__t` helpers of `tests/gameplay.spec.js` (`step`, `pin`, `calm`, `key`). The real `frame()` loop also calls `update(dt)` while `mode === "play"`, so anything that must be deterministic runs inside one `page.evaluate` (no frames in between).
- **Rewards**: `giveReward(win)` runs with `true` when `pendingWin` ends; `giveReward(false)` is reachable only through `__bb` (the lose screen is unreachable, and leaving a level pays nothing today). It sets `lastReward = { win, coins, starCoins, stars, nobodyOut, fast, target, penalty, newBest, world, level, worldDone }` — **no list of parts yet**. Win coins = `max(COINS_MIN_WIN, COINS_WIN + n × COINS_PER_LEVEL + w × COINS_PER_WORLD + nobodyOut × COINS_NOBODY_OUT + fast × COINS_FAST + playerHugs × COINS_PER_HUG − rests × COINS_PER_REST)` (10 / 5 / 10 / 10 / 10 / 2 / 3, floor 5). Bonus-star coins (`STAR_COINS` 3) go into `progress.coins` **at pickup** in `updateStars` (kept even if the level is not won) and are reported in `lastReward.starCoins` and inside `lastReward.coins`. `progress.coins` is changed in `giveReward`, `updateStars`, `buyGloves`, `buyKisses`, `buyRescueKit`.
- **Bots**: `updateBots` — tasks rescue / flee / attack (one `attackToken`) / lurk / leave (walking out of the Big One's house); `botWait` from `BOT_RESCUE_DELAY` [2, 3]. **The Big One**: `look` / `patrol` / `chase` / `search`; `push()` sets `big.pushCd = 0.9` (a literal: the stand after a push) and `big.noPush = CFG.PUSH_RECOVER` (2.5); overlays `stun`, `slip`, `blush`; the house throw-out (`throwOut`).
- **Tests** (SPEC-018): ~157 tests, whole suite **~10 min** locally (9.8) and ~11 min on CI (`reports/test-times.md`); while working `npm run test:fast` (the `@fast` set, ~1.5 min, keep it under 3 min) + the touched files. Helpers in `tests/helpers.js`: `openGame(page, { query })`, `step`, `frames`, `softly()` (collect loop checks, assert once), `sharedPage()` + `resetGame()` (one game page per spec file, reset before each test; the fixture also fails a test that leaves `__bb.CFG` changed). `tests/smoke.spec.js` fails any `page.evaluate` that returns a game object (return plain data). `tests/levels.spec.js` "the Big One gets faster inside a world and never outruns a player" already checks the difficulty curve, the cap and the world starts (most of AC 5 and AC 7 for `lost = 0`).
- **Old save shapes** (from git history): before SPEC-003 `{ unlocked, stars, coins, inv: { mittens, mega }, equip }` + `bebebe-outfits` + `bebebe-place`, no `bebebe-names`; before SPEC-004 the same + `bebebe-names`; before SPEC-006 + `inv.kisses`, still flat `unlocked`/`stars`, `bebebe-place`; before SPEC-007 `worlds` + `lastWorld`, `inv` without `rescues`; now `inv.rescues`.

## Out of scope
- Changing any game rule or number (this spec measures; tuning is SPEC-009 and later). Moving a literal into `CFG` with the same value is allowed.
- Story/cut-scenes (BACKLOG, see "Docs to update").
- Performance profiling beyond what the simulator needs.

## Acceptance criteria
### Seeded randomness and sim mode
1. All gameplay randomness goes through one `rng()` (a `mulberry32`): the 7 gameplay `Math.random()` calls and the gameplay uses of `rand()` (which then draws from `rng()`). Visual randomness (particles in `burst`, the blush heart burst, camera shake, snow) and `randomOutfit` use a separate visual helper on `Math.random`, listed in a comment — so sim mode (no particles) draws the same `rng()` sequence as normal play. `__bb.seedRandom(n)` reseeds; with the same seed and the same inputs a level plays identically (two runs, each `seedRandom` + `startGame` + `simRun` inside one `page.evaluate` → identical event log). → `tests/balance.spec.js` "same seed, same game" (`{ tag: "@fast" }`)
2. `?sim=1` (open with `openGame(page, { query: "?sim=1" })`) and `__bb.sim(true)`: no 3D render, no 2D draw, no audio, the `frame()` loop does not advance the game; `__bb.simRun(seconds, dt)` steps `update` in a batch and returns plain data `{ ended, win, time }` when the level ends or time runs out. Normal play unaffected (the existing suite stays green).
3. **Autopilot:** `__bb.autopilot(on, style)` drives the player Little Ones with an AI: `"careful"` (sneaks via cover, hugs from behind, rescues friends, grabs items and bonus stars when the Big One isn't looking) and `"reckless"` (runs straight for hugs). It uses only what a player could do: inputs through `inputFor(l)` → movement, and the kiss and kit buttons (`throwKiss(pi)`, `useRescueKit(pi)` — only when `canUseKit`); it never touches the Big One's or the bots' state, `CFG` or `progress`. Bots keep their own AI.

### Event log
4. `__bb.events` records gameplay events with game time, as plain objects `{ t, type, …data }`: `hug(power)`, `push`, `down`, `rescued(byBotOrPlayer)`, `rest`, `back`, `kiss(hit|miss)`, `kit`, `star`, `item(kind)`, `slip`, `thrownOut`, `win`, plus `coins(reason, amount)` at every change of `progress.coins` (today: the reward parts of a win, `star` at pickup, and `buy:<kind>` with a negative amount for `mittens|mega|kisses|rescues`). The same win parts go into a new `lastReward.parts = [{ reason, amount }]` (amounts unchanged: `win`, `level`, `world`, `nobodyOut`, `fast`, `hugs`, `rests` (negative), `floor` (what the `COINS_MIN_WIN` floor adds), `star`). Capped length; cleared on level start. Used by tests, the report and SPEC-009's ledger.

### Invariant tests (fast, in CI: `tests/invariants.spec.js`)
5. **Speeds:** for every world × level and every number of hearts lost (`difficulty(world, n, lost)`, `lost` = 0 … hearts − 1): chase and search ≤ `CFG.BIG_CHASE_MAX` < `CFG.PLAYER_SPEED`; patrol < chase; `CFG.BOT_SPEED` > `difficulty("park", 1).search`.
6. **Rescue is possible:** `DOWN_TIME` > max `BOT_RESCUE_DELAY` + `RESCUE_TIME` + time for a bot to cross a quarter of the map at `BOT_SPEED`; `KIT_INVULN` and `INVULN_AFTER_RESCUE` ≥ the Big One's stand after a push (`big.pushCd`; the run moves the literal 0.9 into `CFG.PUSH_STAND` 0.9, value unchanged, so the check reads it) — a just-rescued Little One isn't pushed instantly.
7. **Difficulty:** hearts and speed never decrease from level n to n + 1 inside a world; each world's level 1 is easier than the previous world's level 20 (SPEC-006 rule, kept as a permanent check). → already in `tests/levels.spec.js` "the Big One gets faster inside a world and never outruns a player"; add the explicit hearts n → n + 1 check there (no copy in `invariants.spec.js`).
8. **Rewards add up:** fixed scenarios through `giveReward(true|false)` with set `stats` (`playerHugs`, `rests`, `time`, `starCoins`) in worlds 0 and 3 — no rests / 2 rests / fast / slow / with star coins / leaving early (`giveReward(false)`) / so many rests that the `COINS_MIN_WIN` floor applies (star coins stay on top): `lastReward.coins` = the sum of `lastReward.parts`, never negative; `progress.coins` grows by `lastReward.coins − starCoins` (star coins were added at pickup); a buy with too few coins (`buyGloves`, `buyKisses`, `buyRescueKit`) changes nothing, so coins never go negative; inventory counts stay integers ≥ 0 (also after `throwKiss`, `useRescueKit`, glove charges).
9. **Saves:** progress, outfits, names, inventory round-trip through `localStorage` unchanged; every known old save shape loads without errors into the current shape. Fixtures in `tests/fixtures/saves/` — each a snapshot of all `bebebe-*` keys: `pre-spec-003.json`, `pre-spec-004.json`, `pre-spec-006.json`, `pre-spec-007.json`, `stale-tab.json` (worlds + old flat fields), `current.json`. The progress part goes through `__bb.loadProgress` (no reload); one real reload with a whole snapshot checks the start path (outfits, names, the migration write-back) — the SPEC-018 pattern. SPEC-009 reuses these fixtures.
10. **Shop and texts completeness:** every shop item (today the four cards of `shopCards()`: mittens, mega, kisses, rescues — and anything later) has a price > 0, a pack size > 0, a drawn picture (`shopPicture`), a non-empty name and description in en/es/ru, a buy button (`buy:<kind>`) and a buy test in `tests/gameplay.spec.js`. The test reads the cards through a new `__bb.shopCards()` (plain data: `k`, `price`, `packN`, `name`, `desc` — no functions), so a later card can't skip it. Every key in `docs/game-design.md`'s generated section exists in the code.
11. **Docs numbers are generated:** `npm run docs:numbers` (`scripts/docs-numbers.js`, Node, no browser: reads the objects' source from `index.html`) writes the section between `<!-- numbers:start -->` and `<!-- numbers:end -->` in `docs/game-design.md` — a table: key, value, one-line meaning taken from the source comment. It covers `CFG` and the shop objects `GLOVES`, `KISSES`, `RESCUE_KIT` (one list in the script; later specs add theirs — SPEC-009 adds `REWARD`, `UPGRADES`, `WARDROBE_TIERS`); a getter (`BIG_CHASE_MAX`) shows its value marked "derived", a function (`FAST_TIME`) its formula, a nested object (`LAYOUT`, `PHONE_SHOP`, `MINIMAP_LOOK`, `BALANCE`, …) one compact row. A Node-side test in `tests/invariants.spec.js` (`{ tag: "@fast" }`) fails if the section is out of date.

### Balance report
12. `npm run balance` (`scripts/balance.js`: Node driving Chromium in sim mode — `chromium` from `@playwright/test`, the page opened like `openGame()` in `tests/helpers.js` with `?sim=1`, three.js from `node_modules`, the SwiftShader flags of `playwright.config.js`; not part of `npm test`): for every world × level, 3 seeds × `careful` autopilot, 1 player + 4 bots, game-time limit 8 min, each run from fresh progress (empty inventory, nothing bought; coins earned are counted, not spent). Writes `reports/balance.json` (raw per run, incl. its `coins` events) and `reports/balance.md` (per level: win rate, median win time vs the level's fast-star time, hugs, pushes, falls, rescue rate, rests, stars, coins earned with parts, bonus stars picked; per world: averages and a small ASCII trend of win time by level). Under 15 min on a normal laptop; prints the run time.
13. **Targets** (each row red/green in the report; the numbers live in `CFG.BALANCE` so they are easy to change):
    - `careful` wins every level in ≥ 2 of 3 seeds within 8 min;
    - inside each world the median win time trend goes up (Spearman ρ ≥ 0.5) and the maze block (17–20) is the slowest block;
    - Park 1–5 median win time ≤ the level's fast-star time (3 stars reachable early); Winter 17–20 median win time ≥ 1.5 × Park 1–5;
    - rescue rate (rescued / falls) between 50 % and 90 %; median rests per level ≤ 2;
    - `reckless` (1 seed, every 5th level) wins less often or slower than `careful` — sneaking must pay.
14. **CI sample:** `tests/balance.spec.js` runs 8 sampled levels (two per world: one early, one maze) × 1 seed with wide bounds (win within 8 min, no stuck state, no errors) on one shared `?sim=1` page (`sharedPage()` with its own key, `resetGame()` before each test) — under 3 min. Not in the `@fast` set (only the determinism test of AC 1 is). The whole suite grows from ~10 min by at most that; the final report gives the new whole-suite time.
15. **Process:** `docs/process/orchestration-rules.md` (where the test rules live since SPEC-018), `CLAUDE.md` (Workflow "Verify" and Commands) and the run templates `RUN_S.md`, `RUN_M.md`, `RUN_L.md` (and `RUN_QUEUE.md` / `RUN_AFTER_QUEUE.md` where they list per-spec steps) get a rule: a spec that changes gameplay numbers or rules runs `npm run balance` before the merge, commits the updated `reports/balance.*`, and lists red targets in its final report (red is not a stop by itself unless the spec's ACs say so).
16. The first report is committed with this spec, and its red rows (if any) are listed in the final report as BACKLOG rows — not fixed here.

## Implementation steps
Each step: failing test first; green on `npm run test:fast` + the touched test files; committed.
1. `rng()` + `seedRandom`; split `rand()` into gameplay (on `rng()`) and visual (on `Math.random`); replace the gameplay `Math.random`; the determinism test (AC 1).
2. Event log incl. `coins` events and `lastReward.parts` (AC 4) and sim mode (AC 2).
3. Invariant tests (AC 5–10) with the save fixtures, `CFG.PUSH_STAND`, `__bb.shopCards()`, the hearts check in `levels.spec.js`; `docs:numbers` (AC 11).
4. Autopilot (AC 3) — reuse the bots' steering and cover logic; tune until `careful` clearly beats `reckless`.
5. `scripts/balance.js` + report format (AC 12–13); CI sample (AC 14).
6. Process rule (AC 15), first report (AC 16); whole suite once, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value |
|---|---|
| sim dt | 1/30 s |
| game-time limit per run | 8 min |
| seeds per level | 3 (`careful`), 1 (`reckless`, every 5th level) |
| `CFG.BALANCE` | targets from AC 13 and the run settings above; suggested keys `SEEDS` 3, `SIM_DT` 1/30, `TIME_LIMIT` 480, `WIN_SEEDS` 2, `TREND_RHO` 0.5, `LATE_VS_EARLY` 1.5, `RESCUE_RATE` [0.5, 0.9], `RESTS_MAX` 2, `RECKLESS_EVERY` 5, `CI_LEVELS` (the 8 sampled levels); SPEC-009 adds `CFG.BALANCE.ECONOMY` |
| `CFG.PUSH_STAND` | 0.9 s (moved from the literal in `push()`, unchanged) |
| CI sample | 8 levels × 1 seed |
| `package.json` scripts | `balance` → `node scripts/balance.js`, `docs:numbers` → `node scripts/docs-numbers.js` |
| new `__bb` members | `seedRandom(n)`, `sim(on)`, `simRun(seconds, dt)`, `autopilot(on, style)`, `events` (get, copies), `shopCards()` |
| new UI strings | none (developer tooling) |

## Docs to update
`docs/architecture.md` (rng and the visual random helper, sim mode, autopilot, event log, `lastReward.parts`, the new `__bb` members, balance script, generated numbers section), `docs/game-design.md` (the generated numbers section), `docs/process/orchestration-rules.md` + `CLAUDE.md` + run templates (the balance rule), `README.md` (Development: `npm run balance`, `npm run docs:numbers`), `specs/BACKLOG.md`: red rows from the first report; **story**: "a short intro card with a picture and a sentence before every level, and a short story between worlds (after level 20) — content and frame to be set by Andrei later" (SPEC-017 adds only the on-demand Story screen; cut-scenes before levels stay out of its scope).

## Pre-flight notes (2026-11-23)
Synced with `master` at `3d458f0` (after SPEC-006, SPEC-007, SPEC-010, SPEC-018). Goals, every AC's intent and all decisions kept; no rule or number changes. `Status: ready` was already set.

**What changed and why**
- Context rewritten from the code on `master`: SPEC-006/007 have landed, so the "wait for them" line is gone; added the facts the run needs (difficulty API, save shapes, how rewards and star coins really work, the SPEC-018 test helpers and suite time).
- AC 1: `rand()` is shared by gameplay and particles/camera shake, so the AC now splits it; otherwise sim mode (no particles) would draw a different `rng()` sequence than normal play. Determinism is checked inside one `page.evaluate`, because the real `frame()` loop also calls `update` in play.
- AC 4 + AC 8: `lastReward` has no list of parts today. The spec now adds `lastReward.parts` and defines the `coins` event reasons (measurement only, amounts unchanged), so AC 8 can check "coins = sum of parts" and SPEC-009 can build its ledger on the same `coins` events.
- AC 7: already covered by `tests/levels.spec.js` (SPEC-006). It stays there as the permanent check, plus an explicit hearts check, instead of a copy.
- AC 9: fixtures named and extended with `pre-spec-007.json` (no `inv.rescues`), `stale-tab.json` and `current.json`; the progress part goes through `__bb.loadProgress` (SPEC-018).
- AC 10: the shop now has four cards (incl. kits); `__bb.shopCards()` added so the test can't miss a card (hard rule 6).
- AC 11: the generator also covers `GLOVES`/`KISSES`/`RESCUE_KIT` and leaves room for SPEC-009's `REWARD`/`UPGRADES`/`WARDROBE_TIERS` (they are not inside `CFG`); it says how getters, functions and nested objects are shown.
- AC 14/15 and steps: the current process (`npm run test:fast` while working, the whole suite once before the merge, shared pages, `@fast`); process rules now live in `docs/process/orchestration-rules.md`; `RUN_QUEUE.md`/`RUN_AFTER_QUEUE.md` exist.

**Stale references fixed (old → new)**
- "Eight features in" → "Ten specs in".
- `difficulty(world, n)` → `difficulty(world, n, lost = 0)` → `{ chase, search, patrol, hearts, boost }`; "the Big One's searching speed on Park 1" → `difficulty("park", 1).search`.
- "10+ direct `Math.random()` calls" → exactly 10 (7 gameplay, 3 visual/UI) + the shared `rand()`.
- "`giveReward(win)` → `lastReward` with parts" → `lastReward` without parts today (fields listed); star coins are paid at pickup in `updateStars`.
- "median win time vs `FAST_TIME`" / "≤ `FAST_TIME`" → the level's fast-star time `FAST_TIME(n) + w × FAST_PER_WORLD` (= `lastReward.target`).
- "`updateBots` (rescue / flee / attack token / lurk)" → + `leave`.
- "the Big One's push cooldown after a push" → `big.pushCd` (0.9 s literal → `CFG.PUSH_STAND`).
- Save fixtures "before SPEC-003, before SPEC-004, before SPEC-006" → + before SPEC-007, stale tab, current.
- "every shop item (gloves, kisses, kits…)" → the four `shopCards()` cards via `__bb.shopCards()`.
- "`CLAUDE.md` and the run templates" → + `docs/process/orchestration-rules.md` and the queue templates.
- CI sample: "(in CI)" → one shared `?sim=1` page via `sharedPage()`/`resetGame()`; the determinism test is `@fast`.

**Open questions and the reading chosen**
- "Push cooldown" in AC 6 is read as `big.pushCd` (0.9 s, the stand after a push), not `PUSH_RECOVER` (2.5 s). With `PUSH_RECOVER` the check would fail today (1.5 and 2 < 2.5), and this spec changes no number. A rescue takes 3 s, longer than his 2.5 s rest, so the rest is already over when anyone stands up.
- Balance runs start from fresh progress (empty inventory, nothing bought), so the report measures the base game and SPEC-009's "no purchases" first playthrough. The autopilot's kiss/kit buttons only matter if a later pass gives it stock.
- "Leaving early" in AC 8 is `giveReward(false)` through `__bb`: the game has no other path to it today (no lose screen; pause → Menu pays nothing).

**Conflicts found**
- None with the kids' decisions in `docs/game-design.md`.
- Ordering: SPEC-011 (`tests/fixtures/events-baseline.json`) and SPEC-012 use this spec's names (`__bb.events`, `seedRandom`, autopilot `careful`, sim mode). They are unchanged here, so those specs still match.
