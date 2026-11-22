# SPEC-008 — Consistency and balance checks: invariants, autopilot simulation, balance report

Status: ready
Complexity: L
Branch: SPEC-008-balance-checks
Decided by: Andrei (2026-11-22): the game needs tests and checks for consistency and balance, so that rules, numbers, docs and difficulty stay coherent as features pile up. Everything below (what is checked, the simulator, thresholds, report format): Claude (spec author).

## Description
Eight features in, numbers live in `CFG`, rules in code, descriptions in `docs/game-design.md`, and nobody checks that they still agree or that 80 levels still feel right. This spec adds three layers:
1. **Invariant tests** (fast, in CI): rules that must always hold — speed caps, timings that make rescue possible, rewards that add up, saves that round-trip, every shop item complete in three languages.
2. **Autopilot simulation**: a headless mode where the player's Little Ones are driven by an AI too, with seeded randomness, so whole levels can be played at high speed and measured.
3. **Balance report** (`npm run balance`): plays every level of every world several times and writes `reports/balance.md` + `.json` — win time, hugs, falls, rescues, rests, stars, coins — and flags anything outside the target ranges. A small sample of it runs in CI.

## Goal
- A change that breaks a rule or makes a level unwinnable/trivial fails a test or shows up red in the report.
- Docs can't silently drift from `CFG`: the numbers section of the game design is generated.
- The economy spec (SPEC-009) and any later tuning use the report to set numbers, not guesses.

## Context
- After SPEC-006/007: `WORLDS`, `WORLD_TYPES`, `difficulty(world, n)`, `levelReport(world, n)`, `progress.worlds`, `inv = { mittens, mega, kisses, rescues }`, `REST_TIME` 30, the rescue kit. (If this spec starts before they land, wait — it runs after them.)
- Randomness: `rand()` and 10+ direct `Math.random()` calls in AI, items, effects, outfits, snow.
- Stepping: `__bb.update(dt)` / test helper `step(page, seconds)`; tests run Chromium + SwiftShader (slow rendering).
- Rewards: `giveReward(win)` → `lastReward` with parts; star coins; rest penalty; floor `COINS_MIN_WIN`.
- Bots: `updateBots` (rescue / flee / attack token / lurk); the Big One: look/patrol/chase/search, push, stun, slip, blush.

## Out of scope
- Changing any game rule or number (this spec measures; tuning is SPEC-009 and later).
- Story/cut-scenes (BACKLOG, see "Docs to update").
- Performance profiling beyond what the simulator needs.

## Acceptance criteria
### Seeded randomness and sim mode
1. All gameplay randomness goes through one `rng()` (a `mulberry32`); `Math.random` stays only in purely visual code (particles, snow, flower sway) and is listed in a comment. `__bb.seedRandom(n)` reseeds; with the same seed and the same inputs a level plays identically (two runs → identical event log). → `tests/balance.spec.js` "same seed, same game"
2. `?sim=1` (and `__bb.sim(true)`): no 3D render and no 2D draw, no audio, `update` can be stepped in big batches (`__bb.simRun(seconds, dt)` returns when the level ends or time runs out). Normal play unaffected.
3. **Autopilot:** `__bb.autopilot(on, style)` drives player Little Ones with an AI: `"careful"` (sneaks via cover, hugs from behind, rescues friends, grabs items and bonus stars when the Big One isn't looking) and `"reckless"` (runs straight for hugs). It uses only what a player could do (inputs → movement, the kiss and kit buttons), never touches the Big One's state. Bots keep their own AI.

### Event log
4. `__bb.events` records gameplay events with game time: `hug(power)`, `push`, `down`, `rescued(byBotOrPlayer)`, `rest`, `back`, `kiss(hit|miss)`, `kit`, `star`, `item(kind)`, `slip`, `thrownOut`, `win`, plus `coins(reason, amount)`. Capped length; cleared on level start. Used by tests and the report.

### Invariant tests (fast, in CI: `tests/invariants.spec.js`)
5. **Speeds:** for every world × level and every number of hearts lost, the Big One's chase speed ≤ `BIG_CHASE_MAX` < `PLAYER_SPEED`; patrol < chase; `BOT_SPEED` > the Big One's searching speed on Park 1.
6. **Rescue is possible:** `DOWN_TIME` > max `BOT_RESCUE_DELAY` + `RESCUE_TIME` + time for a bot to cross a quarter of the map at `BOT_SPEED`; `KIT_INVULN`, `INVULN_AFTER_RESCUE` ≥ the Big One's push cooldown after a push (so a just-rescued Little One isn't pushed instantly).
7. **Difficulty:** hearts and speed never decrease from level n to n + 1 inside a world; each world's level 1 is easier than the previous world's level 20 (SPEC-006 rule, kept here as a permanent check).
8. **Rewards add up:** for a set of fixed scenarios (no rests / 2 rests / fast / slow / with star coins / leaving early) `lastReward.coins` = the sum of its listed parts, never negative, floor applied where specified; buying never makes coins negative; inventory counts stay integers ≥ 0.
9. **Saves:** progress, outfits, names, inventory round-trip through `localStorage` unchanged; every known old save shape (fixtures in `tests/fixtures/saves/`: before SPEC-003, before SPEC-004, before SPEC-006) loads without errors into the current shape.
10. **Shop and texts completeness:** every shop item (gloves, kisses, kits, and anything later) has a price > 0, a pack size, a drawn icon, name and description in en/es/ru, a buy test; every `CFG` number referenced in `docs/game-design.md`'s generated section exists.
11. **Docs numbers are generated:** `npm run docs:numbers` writes the section between `<!-- numbers:start -->` and `<!-- numbers:end -->` in `docs/game-design.md` (a table: CFG key, value, one-line meaning taken from the `CFG` comment); a test fails if the section is out of date.

### Balance report
12. `npm run balance` (Node script driving Playwright in sim mode, not part of `npm test`): for every world × level, 3 seeds × `careful` autopilot, 1 player + 4 bots, game-time limit 8 min. Writes `reports/balance.json` (raw per run) and `reports/balance.md` (per level: win rate, median win time vs `FAST_TIME`, hugs, pushes, falls, rescue rate, rests, stars, coins earned with parts, bonus stars picked; per world: averages and a small ASCII trend of win time by level). Under 15 min on a normal laptop; prints the run time.
13. **Targets** (each row red/green in the report; the numbers live in `CFG.BALANCE` so they are easy to change):
    - `careful` wins every level in ≥ 2 of 3 seeds within 8 min;
    - inside each world the median win time trend goes up (Spearman ρ ≥ 0.5) and the maze block (17–20) is the slowest block;
    - Park 1–5 median win time ≤ `FAST_TIME` (3 stars reachable early); Winter 17–20 median win time ≥ 1.5 × Park 1–5;
    - rescue rate (rescued / falls) between 50 % and 90 %; median rests per level ≤ 2;
    - `reckless` (1 seed, every 5th level) wins less often or slower than `careful` — sneaking must pay.
14. **CI sample:** `tests/balance.spec.js` runs 8 sampled levels (two per world: one early, one maze) × 1 seed with wide bounds (win within 8 min, no stuck state, no errors) — under 3 min.
15. **Process:** `CLAUDE.md` and the run templates get a rule: a spec that changes gameplay numbers or rules runs `npm run balance` before the merge, commits the updated `reports/balance.*`, and lists red targets in its final report (red is not a stop by itself unless the spec's ACs say so).
16. The first report is committed with this spec, and its red rows (if any) are listed in the final report as BACKLOG rows — not fixed here.

## Implementation steps
1. `rng()` + `seedRandom`, replace gameplay `Math.random`; the determinism test (AC 1).
2. Event log (AC 4) and sim mode (AC 2).
3. Invariant tests (AC 5–10) with save fixtures; `docs:numbers` (AC 11).
4. Autopilot (AC 3) — reuse the bots' steering and cover logic; tune until `careful` clearly beats `reckless`.
5. `scripts/balance.js` + report format (AC 12–13); CI sample (AC 14).
6. Process rule (AC 15), first report (AC 16), whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value |
|---|---|
| sim dt | 1/30 s |
| game-time limit per run | 8 min |
| seeds per level | 3 (`careful`), 1 (`reckless`, every 5th level) |
| `CFG.BALANCE` | targets from AC 13 |
| CI sample | 8 levels × 1 seed |
| new UI strings | none (developer tooling) |

## Docs to update
`docs/architecture.md` (rng, sim mode, autopilot, event log, balance script, generated numbers section), `docs/game-design.md` (the generated numbers section), `docs/process/orchestration-rules.md` + run templates (the balance rule), `README.md` (Development: `npm run balance`, `npm run docs:numbers`), `specs/BACKLOG.md`: red rows from the first report; **story**: "a short intro card with a picture and a sentence before every level, and a short story between worlds (after level 20) — content and frame to be set by Andrei later".
