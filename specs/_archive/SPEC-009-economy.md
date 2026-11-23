# SPEC-009 — Coins economy: clear earning rules, wardrobe for coins, permanent upgrades

Status: done (019ab3f; phone reset fix 572713c)
Complexity: L
Branch: SPEC-009-economy
Decided by: Andrei and the kids (2026-11-22): replaying a level pays less than the first win, with a separate bonus for every new star; coins can also buy clothes/hats/Big One looks (basic ones stay free) and permanent upgrades; the pace — a purchase every 1–2 levels (cheap items almost every level, mega mittens every 3–4 levels, an expensive outfit about once per world). Kept from earlier kids' decisions: bonus star pickup +3, kisses 5 for 20, rescue kits 3 for 15, existing glove prices. Everything else (formulas, starting numbers, which items are paid, upgrade list and caps, UI): Claude (spec author).

## Description
Coins today come from a pile of overlapping bonuses (win, level, world, nobody out, fast, hugs, star pickups, minus rests) and the same pile is paid on every replay, so farming level 1 beats playing on. After this spec:
- **Earning has one clear rule.** First win of a level pays the full base; a replay pays half the base; every *new* star earns its own bonus (once per star, ever); hugs and bonus stars pay a little every time; rests cut the base. The win screen lists each line.
- **Spending has three shelves:** consumables (mittens, mega mittens, kisses, rescue kits — unchanged prices), the **wardrobe** (paid hats, jackets, pants, Big One looks — bought once, kept forever; the basic ones free), and **upgrades** (three permanent player-only boosts with three levels each, capped so the Big One stays a challenge).
- **One ledger.** Every coin change goes through one function and lands in the event log, so tests and the balance report can see where coins come from and go.

## Goal
- A child understands the win screen: "First win +31, New star +8, Bonus stars +6, Hugs +7, Rests −3".
- Playing forward is always worth more than farming.
- The pace targets below are green in the balance report (SPEC-008).

## Context
On `master` (SPEC-006, SPEC-007, SPEC-018 done); SPEC-008 runs before this spec.
- **Rewards today** (`giveReward(win)`): win coins = `max(COINS_MIN_WIN 5, COINS_WIN 10 + n × COINS_PER_LEVEL 5 + w × COINS_PER_WORLD 10 + COINS_NOBODY_OUT 10 + COINS_FAST 10 + playerHugs × COINS_PER_HUG 2 − rests × COINS_PER_REST 3)`, paid in full on every replay; stars = 1 + nobody out + fast (fast-star time `FAST_TIME(n) + w × FAST_PER_WORLD`); bonus-star coins (`STAR_COINS` 3) go into `progress.coins` **at pickup** in `updateStars` and are shown in `lastReward.starCoins` and inside `lastReward.coins`. `giveReward(false)` is reachable only through `__bb` (no lose screen; leaving a level via pause → Menu pays nothing). Win screen: desktop `drawOverlay` and phone `drawOverlayPhone` show the stars, ✔/✘ lines, "+coins", the `starCoins(n)` line and the `restPenalty(n)` line; after level 20 `winLine` = `worldDone`.
- **Saves**: `progress.worlds[world]` (keyed by world **name**: `park|school|beach|winter`) = `{ unlocked, stars }`; `cleanWorld` keeps only those two fields. `loadProgress(pv)` (pure, `__bb.loadProgress`) keeps unknown top-level fields but cleans only the known ones; `freshProgress()` / `resetProgress()` (double tap via `resetArmed`, text `sure`). `inv = { mittens, mega, kisses, rescues }`.
- **Shop**: `shopCards()` → four cards (mittens 30 for 3 charges, mega 60 for 3, kisses 20 for 5, kits 15 for 3), Buy buttons `buy:<kind>`, not enough coins → `notEnough` text + `SFX.out`. Desktop: 880 px panel, four cards in a row. Phone (SPEC-007 AC 10): four cards in a row; texts measured first (`pRows`, widths × `CFG.TEXT_TEST_SCALE`) and drawn after (`pDraw`); when they don't fit, the layout gives way in this order: (1) picture shrinks to `picMin`, (2) "you have" becomes a badge, (3) pack → `packShort`, (4) description then name cut, (5) final clip; `CFG.PHONE_SHOP`, `__bb.shopLayout`, card parts in `hudRects` (`card-*:<kind>`), overlap tests in `tests/phone.spec.js`.
- **Wardrobe today**: the skins screen (desktop: three columns, `skinPanels()`; phone: `phoneSkinCols()` = Player 1 + the Big One) cycles `HAIRS` (8), `HATS` (12), `JACKETS` (10), `PANTS` (8) with `cycleOutfit(pk, slot, d)`, the Big One's 5 `BIG_SKINS` with `cycleBig(d)`, 🎲 `randomOutfit(pk)`; every change is saved at once (`saveSkins`). Only `HATS` entries have an `id`. `bebebe-outfits` stores **indexes** `{ p1: { hair, hat, jacket, pants }, p2, big }`. Bots' looks come from `botOutfit(i)` (by level, not saved).
- **Items and rescue**: items are picked up by any Little One in state `ok` (bots too); boots/cloak/shield durations `BOOTS_TIME` 6 / `CLOAK_TIME` 6 / `SHIELD_TIME` 25, map life `ITEM_LIFE` 20; rescue `RESCUE_TIME` 3 s (kids' decision); `CFG.BIG_CHASE_MAX` is a getter on `CFG.PLAYER_SPEED`.
- **From SPEC-008**: `rng()`/`seedRandom`, `__bb.events` with `coins(reason, amount)` events, `lastReward.parts`, sim mode + autopilot (`careful`/`reckless`), `npm run balance` → `reports/balance.md` + `reports/balance.json`, `CFG.BALANCE`, the save fixtures in `tests/fixtures/saves/` (`pre-spec-003.json` … `current.json`), `npm run docs:numbers` (`scripts/docs-numbers.js`), `__bb.shopCards()`, the invariants in `tests/invariants.spec.js`, and the balance rule in `docs/process/orchestration-rules.md`.
- **Tests that pin today's reward formula** (`tests/gameplay.spec.js`): "winning gives stars and coins, unlocks the next level and survives a reload" (`@fast`), "the reward grows with the world", "each rest takes coins from the level reward", "star coins are added to the reward"; "old saves move into the Park" compares `worlds.*` with exactly `{ unlocked, stars }`. They change on purpose with this spec. `resetGame()` (helpers) does not reset the skin picker.
- Hard rule 7: old saves keep working.

## Out of scope
- Real money, ads, daily rewards, chests.
- New consumables or new outfit items (only prices for existing ones).
- Story content (BACKLOG).
- The one-shop-with-tabs layout and moving the skins screen into it (SPEC-017; it takes over this spec's wardrobe and upgrades).

## Earning rules (starting numbers; tune with the report, see "Pace targets")
With world index `w` (0–3, `worldIndex(world)`) and level `n` (1–20):
- **Base** = `REWARD.BASE` 15 + `REWARD.PER_LEVEL` 2 × n + `REWARD.PER_WORLD` 10 × w (levels 1 → 20: Park 17 → 55, Winter 47 → 85).
- **First win** of `(world, n)`: base − `COINS_PER_REST` 3 × rests, floor `REWARD.FIRST_MIN` 5. **Replay win:** floor(base / 2) − 3 × rests, floor `REWARD.REPLAY_MIN` 3. (On the win screen and in the ledger the rests line is cut so that base + rests never goes below the floor.)
- **New stars:** `REWARD.NEW_STAR` 8 for each star above the level's previous best (max 3 × 8 per level, ever). The separate "nobody out" and "fast" coin bonuses are removed (they are the stars now).
- **Every time** (win or leaving early): hugs by players × `REWARD.PER_HUG` 1 (was `COINS_PER_HUG` 2); bonus star pickups × `STAR_COINS` 3 (kids' number, fixed) — still paid at pickup, as today.
- **Leaving early** (pause → Menu, or the level changes, before a win) pays only the "every time" lines: the hugs line through the ledger; the star coins were already paid at pickup.
- `progress.worlds[world].won[n]` marks first wins (old saves: a level with stars counts as won).
- Removed `CFG` keys (replaced by `REWARD.*`): `COINS_WIN`, `COINS_PER_LEVEL`, `COINS_PER_WORLD`, `COINS_NOBODY_OUT`, `COINS_FAST`, `COINS_PER_HUG`, `COINS_MIN_WIN`. `COINS_PER_REST` and `STAR_COINS` stay.

## Spending
- **Consumables:** unchanged items and prices (the four `shopCards()` cards).
- **Wardrobe:** each entry of `HATS`, `JACKETS`, `PANTS`, `BIG_SKINS` gets `price` (0 = free) and a stable `id` (`HATS` already have one; `JACKETS`, `PANTS`, `BIG_SKINS` get new ones). Starting set: all hairs free; 4 hats (`none`, `cap`, `beanie`, `bow`), the first 4 jackets, the first 4 pants and the first 2 Big One looks (Classic, Ogre) free, so every default look is free; the rest in tiers `WARDROBE_TIERS` = 40 / 80 / 150 (the most special ones — crown, viking, top hat, the Superhero cape jacket, Robot, the Captain (pirate) Big One — in the 150 tier). Bought items are kept in `progress.owned = { hats: [], jackets: [], pants: [], big: [] }` (ids, not indexes). `bebebe-outfits` keeps its index shape and never saves an item that is not owned. The list of paid items is a "check with the kids" decision in the final report.
- **Upgrades** (`UPGRADES`, levels 0–3, saved in `progress.upgrades = { fastFeet, longItems, quickHelp }`; player Little Ones only, never bots, never the Big One; they never change a `CFG` value — they are per-player multipliers):
  - `fastFeet` — player speed +3 % per level (max +9 %); applied to the player's movement, never to `CFG.PLAYER_SPEED`, so the Big One's cap (`BIG_CHASE_MAX` = `CHASE_MAX_SHARE × PLAYER_SPEED`) stays relative to the base speed;
  - `longItems` — boots/cloak/shield durations +15 % per level when a player picks the item up;
  - `quickHelp` — a player's rescue time (when a player lifts a friend) −10 % per level (3.0 → 2.1 s); `CFG.RESCUE_TIME` stays 3.
  Prices per level 100 / 200 / 300 (all upgrades maxed = 1800).

## Ledger
- `addCoins(reason, amount)` and `spendCoins(item, amount)` are the only code that changes `progress.coins`; both append a SPEC-008 `coins` event (`{ reason, amount }`; `spendCoins` uses reason `buy:<item>` and a negative amount) to `__bb.events` and save. Reasons: `firstWin`, `replay`, `rests`, `newStars`, `hugs`, `star`, `buy:<item>`. `lastReward.parts` (SPEC-008) holds the same lines of a win. A source-scan test fails on any other write to `progress.coins` in `index.html` (`freshProgress`, `loadProgress` and `resetProgress` build or replace the whole object; that is allowed).

## Acceptance criteria
1. **Reward rules:** scenario tests for first win, replay, new stars (0/1/3 new), rests with floors, leaving early, worlds 0 and 3; `lastReward.parts` sum to `lastReward.coins`; new-star coins are paid once per star ever. → `tests/economy.spec.js` (new; one shared page through `sharedPage()` + `resetGame()` with the CFG check, like `gameplay.spec.js`; the main rule test `{ tag: "@fast" }`). The four `gameplay.spec.js` reward tests listed in Context are rewritten to the new rules (or moved here).
2. **Win screen** (desktop `drawOverlay` and phone `drawOverlayPhone`) shows one line per non-zero part with its own icon: First win / Replay, New stars, Bonus stars, Hugs, Rests (negative in red), and the total — in place of today's "+coins", `starCoins` and `restPenalty` lines; after level 20 the `worldDone` line stays. Fits desktop and phone in en/es/ru: the lines go into `hudRects` (`win-line:<reason>`) and a test checks they fit the panel and don't overlap at 960×640 and 667×375, also with `CFG.TEXT_TEST_SCALE` 1.15 (CI fonts are wider); plus the screenshot check.
3. **Wardrobe:** locked items appear in the skins screen (desktop three columns, phone `phoneSkinCols()`) with 🔒 and the price; cycling onto one (`cycleOutfit`, `cycleBig`) shows it on the preview ("try on"); a "Buy N" button buys it (second tap confirms, like reset); not enough coins → the existing `notEnough` message and `SFX.out`; leaving the screen with a locked item selected falls back to the last owned item, and `bebebe-outfits` never stores a locked item; `randomOutfit` picks only owned items; bots' looks (`botOutfit(i)`) may use any item (they don't cost the player anything). Desktop and phone layouts, buttons ≥ 44 CSS px on phone (`CFG.PHONE_BTN_MIN`; `tests/phone.spec.js` "every phone button is big enough" covers the skins screen with a locked item shown). `resetGame()` puts the skin picker back to its defaults (or each wardrobe test restores it). → "locked clothes can be tried on and bought", "random outfit uses only owned items"
4. **Migration:** items worn in `bebebe-outfits` become owned (needs a real reload: outfits are read at start); levels with stars count as won (in `loadProgress` / `cleanWorld`, checked through `__bb.loadProgress`); `owned`, `upgrades`, `won` are merged with defaults and cleaned (broken → default, never throws); coins and inventory untouched; the SPEC-008 fixtures (`tests/fixtures/saves/pre-spec-003.json` … `current.json`) still load. Add `pre-spec-009.json` (SPEC-008's `current.json` as it was) and update `current.json` to the new shape. "old saves move into the Park" is updated for the `won` field. → "old saves keep their outfits"
5. **Upgrades:** a second shop tab "Upgrades" (the first tab is today's items) with the three upgrades, their level (●●○), next price, effect text; buying raises the level, max 3; effects apply only to players; `__bb.upgrades` (get: levels), `__bb.buyUpgrade(key)`. The tab buttons are ≥ 44 CSS px on a phone; the Items tab keeps the four cards and the SPEC-007 phone degrade order (the phone shop tests stay green with the tab bar taking height); the upgrade cards are measured and drawn the same way (`pRows`/`pDraw`, `TEXT_TEST_SCALE`) and put their parts into `hudRects` for an overlap test. Desktop 880 px panel. → "upgrades apply to players only and stop at level 3"
6. **Ledger:** AC from "Ledger" above; `__bb.ledger()` returns the `coins` events of the session (a separate list since page load, not cleared at level start like `__bb.events`; plain data). → "every coin change is in the ledger"; the source scan → "only the ledger writes coins" (Node-side, `{ tag: "@fast" }`)
7. **Pace targets** — added to `CFG.BALANCE.ECONOMY` and to the balance report's new "Economy" section in `reports/balance.md` (per-run lines in `reports/balance.json`). First playthrough = SPEC-008's `careful` runs of all 80 levels (each from fresh progress, so each is a first win with no earlier stars; no purchases); a run's income = the sum of its `coins` events (incl. bonus-star pickups), median over seeds. Cheapest pack = kits, 15:
   - Park median first-win income per level (all lines) between 2× and 4× the cheapest pack (30–60 coins) — enough for a cheap pack almost every level and savings for the rest;
   - income of any 4 first wins in a row ≥ mega mittens + 2 cheapest packs (90) in every world;
   - each world's total first-win income ≥ one 150-tier item + 10 cheapest packs (300);
   - all upgrades (1800) ≤ 60 % of the income of the first 60 levels (Park, School, Beach);
   - replay income per game-minute ≤ 60 % of first-win income per game-minute (on Park 1–5 and Beach 1–5; the replay pass reruns them, 1 seed, with the level already won at the first run's stars).
   Claude Code tunes only the `REWARD.*` numbers (within ±50 % of the starting values) and the wardrobe tier prices until all are green; the kids' fixed numbers stay. Final numbers and the report diff go in the final report.
8. **Upgrades don't break difficulty:** the report runs a second pass with all upgrades maxed (1 seed, every 5th level plus Winter 17–20): median win time on Winter 17–20 is ≥ 70 % of the no-upgrade time, and every SPEC-008 invariant (`tests/invariants.spec.js`, `tests/levels.spec.js` difficulty test) still holds — upgrades change no `CFG` value.
9. All numbers in `CFG`/`REWARD`/`UPGRADES`/`WARDROBE_TIERS`; `REWARD`, `UPGRADES`, `WARDROBE_TIERS` added to the `docs:numbers` list and the section regenerated; all strings in en/es/ru; `npm run test:fast` + touched files while working, whole suite once before the merge; `npm run balance` run and `reports/balance.*` committed (SPEC-008 rule).

## Implementation steps
Each step: failing test first; green on `npm run test:fast` + the touched test files; committed.
1. Ledger first (`addCoins`/`spendCoins`, `coins` events, `__bb.ledger()`, source-scan test), switch existing purchases, star pickups and rewards to it.
2. Reward rules + `won` flags + migration; tests (AC 1, 4); the `gameplay.spec.js` reward tests rewritten; win screen (AC 2).
3. Wardrobe ids and prices, `owned`, skins screen buy flow (AC 3).
4. Upgrades and the shop tab (AC 5).
5. Economy section of the balance report, tuning (AC 7–8).
6. Screenshots (win screen, skins with locks, upgrades tab — desktop/phone, three languages), `docs:numbers`, whole suite once, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Start value | en | es | ru |
|---|---|---|---|---|
| `REWARD.BASE` / `PER_LEVEL` / `PER_WORLD` | 15 / 2 / 10 | | | |
| `REWARD.NEW_STAR` | 8 | | | |
| `REWARD.PER_HUG` | 1 | | | |
| `REWARD.FIRST_MIN` / `REPLAY_MIN` | 5 / 3 | | | |
| `COINS_PER_REST`, `STAR_COINS` | 3, 3 (unchanged) | | | |
| removed | `COINS_WIN`, `COINS_PER_LEVEL`, `COINS_PER_WORLD`, `COINS_NOBODY_OUT`, `COINS_FAST`, `COINS_PER_HUG`, `COINS_MIN_WIN` | | | |
| `WARDROBE_TIERS` | 40 / 80 / 150 | | | |
| `UPGRADES` prices | 100 / 200 / 300 per level | | | |
| `CFG.BALANCE.ECONOMY` | the AC 7–8 targets | | | |
| `I18N.*.rw` | win-screen lines | First win, Replay, New stars, Bonus stars, Hugs, Rests, Total | Primera vez, Repetición, Estrellas nuevas, Estrellitas, Abrazos, Descansos, Total | Первая победа, Повтор, Новые звёзды, Звёздочки, Обнимашки, Отдых, Итого |
| `I18N.*.buyFor` | `(n) =>` | Buy for ${n} | Comprar por ${n} | Купить за ${n} |
| `I18N.*.tapAgain` | confirm | Tap again to buy | Tocá otra vez para comprar | Нажми ещё раз, чтобы купить |
| `I18N.*.upgradesTab` / `itemsTab` | shop tabs | Upgrades / Items | Mejoras / Cosas | Улучшения / Вещи |
| `I18N.*.upg` | names + effects | Fast feet: +3% speed • Long items: items last longer • Quick help: lift friends faster | Pies rápidos: +3% velocidad • Cosas duraderas: duran más • Ayuda rápida: levantás más rápido | Быстрые ноги: +3% скорости • Долгие вещи: действуют дольше • Быстрая помощь: поднимаешь быстрее |

## Docs to update
`docs/game-design.md` (earning rules, spending shelves, upgrades and their caps, pace targets — kids' vs Claude's decisions; the lines "Монетки за победу …", "Повтор пройденного уровня тоже даёт монетки", "+2 только за обнимашку" and "награда не меньше 5" replaced; generated numbers section via `npm run docs:numbers`), `docs/architecture.md` (ledger, `won`, `owned`, `upgrades`, wardrobe ids, `UPGRADES`, migration, new `__bb` members `ledger()`, `upgrades`, `buyUpgrade`), `README.md` (coins and shop section), `reports/balance.*`.

## Pre-flight notes (2026-11-23)
Synced with `master` at `3d458f0` (after SPEC-006, SPEC-007, SPEC-010, SPEC-018) and with SPEC-008 as rewritten in the same pre-flight. Goals, every AC's intent and all kids' decisions are kept. Bonus star +3, kisses 5 for 20, kits 3 for 15, the glove prices, "replay pays less than the first win" and rest 30 s are unchanged. `Status: ready` was already set.

**What changed and why**
- Context rewritten from the code: today's reward numbers, star coins paid at pickup, the shop's four cards and the phone degrade order, the skins-screen functions, the outfit save shape (indexes), the reward tests that pin the old formula, and exactly what SPEC-008 provides.
- Earning: `progress.worlds[w]` → `progress.worlds[world]`. The save is keyed by world name; `w` stays the index used in the formula. "Leaving early" is now defined (there is no such path in the game today). The removed `COINS_*` keys are listed. "Park 17 → 55" is clarified as levels 1 → 20.
- Wardrobe: only `HATS` have ids, so `JACKETS`/`PANTS`/`BIG_SKINS` get ids. `bebebe-outfits` keeps its index shape (hard rule 7) and never stores an unpaid item. "Bots' random looks" → `botOutfit(i)` (by level, not random).
- Upgrades: saved in `progress.upgrades`; they never change `CFG` (the Big One's cap is a getter on `PLAYER_SPEED`).
- Ledger: wired to SPEC-008's `coins` events and `lastReward.parts` with one list of reasons. `__bb.ledger()` is a session list, because `__bb.events` is cleared at level start.
- AC 2/3/5: layout checks use the current tools (`hudRects`, `TEXT_TEST_SCALE` 1.15, `PHONE_BTN_MIN`, the phone shop tests). The Upgrades tab must keep the SPEC-007 phone degrade order.
- AC 4: uses the SPEC-008 fixture names and adds `pre-spec-009.json`; the outfit migration needs a real reload (outfits are not in `loadProgress`).
- AC 7/8: targets go in `CFG.BALANCE.ECONOMY`; income = the run's `coins` events; the replay pass is defined. AC 8's sample now includes Winter 17–20, which its own target needs ("every 5th level" alone gives only Winter 20).
- AC 9 and steps: `docs:numbers` list extended; current test process (`test:fast` while working, whole suite once); `economy.spec.js` on a shared page.

**Stale references fixed (old → new)**
- "After SPEC-006/007/008: `giveReward(win)` with `COINS_*` …" → values listed; star coins at pickup (`updateStars`), not in `giveReward`.
- `progress.worlds[w].stars[n]` / `progress.worlds[w].won[n]` → `progress.worlds[world].…` (world name key); `cleanWorld` must learn `won`.
- "shop with four cards (desktop + phone)" → `shopCards()`, 880 px desktop panel, phone degrade order, `__bb.shopLayout`, `hudRects` `card-*`.
- "skins screen with cycling of `HAIRS`/`HATS`/… , `randomOutfit`" → `cycleOutfit(pk, slot, d)`, `cycleBig(d)`, `randomOutfit(pk)`, `skinPanels()`, `phoneSkinCols()`.
- "`rng()`, event log, `npm run balance`, `CFG.BALANCE` (SPEC-008)" → + `coins(reason, amount)` events, `lastReward.parts`, `reports/balance.md|json`, `tests/fixtures/saves/*.json`, `scripts/docs-numbers.js`, `__bb.shopCards()`, `tests/invariants.spec.js`.
- "fixtures from SPEC-008 still load" → `tests/fixtures/saves/pre-spec-003.json` … `current.json` (+ new `pre-spec-009.json`).
- "Pace targets — added to `CFG.BALANCE`" → `CFG.BALANCE.ECONOMY`.
- `COINS_PER_HUG` (2) → `REWARD.PER_HUG` 1 (the spec's own number, now stated as a change).

**Open questions and the reading chosen**
- **Crown:** the "first 4 hats" are `none`, `cap`, `beanie`, `crown`, but the spec also puts the crown in the 150 tier. The named 150 list wins: the free hats are `none`, `cap`, `beanie`, `bow`. Both default hats (P1 cap, P2 bow) stay free.
- **"Item life on the map +15 %" (`longItems`):** items on the map are shared. Bots pick them up, and a banana that lives longer also hits the Big One more. So this can't be player-only, which the spec's own rule requires. Reading: only the effect durations of items a player picks up get longer; `ITEM_LIFE` is unchanged. Check with Andrei.
- **Leaving early:** pause → Menu (or a level change) before a win pays the hugs line. Star coins stay paid at pickup, as decided in the SPEC-003 run ("check with the kids" in game-design).
- **Rests line on the win screen:** shown cut, so the shown lines always add up to the total when a floor applies.

**Conflicts found** (kids' decisions kept, nothing changed in their rules)
- `quickHelp` lowers a player's rescue time to as little as 2.1 s. The kids decided "rescue takes 3 s" ("спасать дольше"). The base `RESCUE_TIME` stays 3 and the upgrade list is Claude's in this spec. Still, the kids should confirm a bought upgrade may shorten it.
- `game-design.md` says a level's reward is "не меньше 5 (COINS_MIN_WIN)". The replay floor here is 3. This follows the kids' "replay pays less than the first win", and the first-win floor stays 5, but the line in game-design must change (listed in "Docs to update"). Not marked as a kids' decision there; worth a check.
- Not a conflict, ordering: SPEC-016 (worlds by difficulty index) and SPEC-017 (one shop with tabs incl. Wardrobe and Upgrades) already refer to `REWARD.PER_WORLD`, `won`, the wardrobe and the upgrades tab by these names, so they still match.
