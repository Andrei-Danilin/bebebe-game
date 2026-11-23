# SPEC-012 — Headless core: game instances, input slots, events

Status: ready
Complexity: L
Branch: SPEC-012-headless-core
Decided by: Andrei (2026-11-22): the server computes the game (server-authoritative), many rooms on one server, up to 5 human Little Ones per game and a mode where a human plays the Big One. Everything below (API shape, slots, event list, what moves to the client): Claude (spec author).

## Description
Still nothing changes for the player. The core learns three things the server needs: (1) to hold **many games side by side**, each with its own state; (2) to take each player's controls from an **input slot** instead of reading the keyboard; (3) to **report what happened as events** (a push, a hug, a sound, a pop text, the result) instead of playing sounds, spawning particles or writing saves itself. The browser game becomes "core + a client that feeds inputs and draws events", exactly what an online client will be.

## Goal
- `src/core/` runs whole games in plain Node (`node --test`), many at once, deterministically.
- The core has no DOM/audio/storage access (`CORE_DOM_ALLOW` from SPEC-011 is empty).
- Up to 5 human Little Ones and an optional human Big One are possible in the core (the local UI still offers 1–2 players).

## Context
- After SPEC-011: `src/core/*` with module-level state (`littles`, `big`, `items`, `bonusStars`, `kisses`, `stats`, grids, `levelInfo`, `pendingWin`, `mode`, …), `CORE_DOM_ALLOW` list in `tests/modules.spec.js`.
- After SPEC-008: `rng()`/`seedRandom`, `__bb.events` (gameplay event log), sim mode, autopilot `careful`/`reckless`, `npm run balance`.
- After SPEC-009: one coin ledger; `giveReward` replaced by ledger entries; wardrobe and upgrades in `progress`.
- Today the logic calls `SFX.*` (~18 places), `burst()`, pop texts (`texts`), `shake`, reads `inputFor(l)` (keyboard, pads, sticks), `PHONE` (one player), `numPlayers`, and the kiss/kit buttons call `throwKiss(pi)` / the kit function directly; kisses and kits are spent from `progress.inv` and saved at once.
- `levelCache` (accepted attempt per level key) is pure per key and may stay shared between games.

## Out of scope
- Networking, server, lobby (SPEC-013); the Big One controlled by a human in play (SPEC-015) — here only the slot and the switch exist and are tested in Node.
- Any rule, number, text or visual change.

## Acceptance criteria
### Game instances
1. All mutable game state lives in one object made by `createGame(opts)` (`src/core/game.js`); the core works on the **active game** set by `useGame(g)` (one assignment, cheap; the server calls it before stepping a room — Node is single-threaded). `step(g, dt)` = `useGame(g); update(dt)` with the existing fixed logic. No other module-level mutable state remains in `src/core/` except `levelCache` and constants (a test lists the module-level `let`s of `src/core/` and allows only these). → `tests/core/instances.test.mjs` "two games stepped interleaved equal the same games stepped alone"
2. `createGame({ world, n, seed, mode: "local" | "online-a" | "online-b", slots })` where `slots` = up to 5 Little One slots `{ slot: "p1".."p5" | "bot1".."bot4", kind: "player" | "bot", look, name, glove, gloveCharges, kisses, kits, upgrades }` and the Big One slot `{ slot: "big", kind: "bot" | "player", skin, name }`. Missing Little One slots are filled with bots up to 5. → `tests/core/instances.test.mjs` "slots fill with bots"

### Inputs
3. The core reads controls only from `g.inputs[slot] = { mx, my, kiss, kit, act }` (vector clamped to length 1; buttons are edge flags consumed by the step). `inputFor` (keyboard, pads, sticks) moves to `src/client/input.js` and fills `p1`/`p2`; the kiss and kit buttons set flags instead of calling core functions. Local play is unchanged (1–2 players, one player on a phone). → existing `gameplay`/`phone` tests + `tests/core/inputs.test.mjs` "a player slot walks and throws a kiss from inputs only"
4. `big` slot `kind: "player"`: the core moves the Big One from `g.inputs.big` and skips his AI (turning, pushing and the button rules come in SPEC-015; here a test only checks he walks from inputs and the AI does not run). → `tests/core/inputs.test.mjs` "a player Big One is not driven by AI"

### Events
5. The core never plays sounds, makes particles, shakes the camera or writes pop texts: it appends events to `g.events` (the SPEC-008 log, extended): gameplay events as in SPEC-008 plus `sfx(name)`, `burst(kind, x, y, n, color)`, `pop(key, args, x, y)` (an `I18N` key and its arguments, so every client translates into its own language), `shake(t)`, `banner(world, n, type)`. The client drains `g.events` every frame and turns them into `SFX`, particles, pop texts and shake exactly as today. Purely visual randomness (particles, snow) is client-side. `CORE_DOM_ALLOW` is empty. → `tests/modules.spec.js` "core does not depend on the client" (empty allow-list), `tests/gameplay.spec.js` existing sound/pop-text tests
6. **Result instead of saving:** the core never touches `progress`. On a win it emits `result { world, n, time, win, nobodyOut, fast, perSlot: { [slot]: { hugs, pushes, starCoins, kissesUsed, kitsUsed, gloveChargesUsed, rests } } }`; spending a kiss or a kit emits `spent(slot, kind)`. `src/client/progress.js` applies them (the ledger from SPEC-009, the shared local pool for two local players, saving a spent kiss at once as today). The win screen is unchanged. → `tests/gameplay.spec.js` existing reward tests, `tests/core/result.test.mjs` "result sums match the event log"

### Node runner and speed
7. `npm run test:core` = `node --test tests/core/` runs headless games in Node: Park 1 to a win with 1 autopilot player + 4 bots; a 5-player autopilot game on Winter 18 for 180 s with no errors; determinism (same seed and inputs → identical `g.events`). `pages.yml` runs it before Playwright. → `tests/core/run.test.mjs`
8. **Speed is recorded:** `npm run bench:core` steps 100 games side by side at 30 steps per game-second for 60 game-seconds and prints ms per step (median, p95). Target: p95 ≤ 1 ms per game step on Andrei's laptop; the result goes into `docs/architecture.md`. Not a test gate. → `scripts/bench-core.js`
9. `window.__bb` keeps working: its fields read and write the active local game; SPEC-008 `__bb.events`, sim mode and autopilot still work; the SPEC-011 event baseline is still identical (fx events excluded from the comparison if their order changed, gameplay events must match). → `tests/modules.spec.js` "same seed, same game after the split"

## Implementation steps
1. State object: gather the module-level `let`s of `src/core/` into `createGame()`; `useGame(g)`; the client creates the local game. Baseline test after each core module.
2. Instances test in Node (AC 1, 2).
3. Input slots (AC 3, 4); move `inputFor` to the client.
4. Events (AC 5); move `SFX`/particles/pop texts/shake triggering into a client `drainEvents()`.
5. Result and spending (AC 6); move reward/inventory writes to `src/client/progress.js`.
6. Node runner, CI step, bench (AC 7, 8); `__bb` (AC 9); docs; whole suite; reviews (code + architect); merge, push, close.

## Numbers and texts
No new player-visible texts. New: `npm run test:core`, `npm run bench:core`.

## Docs to update
`architecture.md` (game object and `useGame`, slots, inputs, event list, result, what the client does with events, bench numbers), `CLAUDE.md` (commands: `test:core`, `bench:core`; Node tests in CI), `README.md` (developer commands).
