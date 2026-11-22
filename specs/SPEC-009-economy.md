# SPEC-009 — Coins economy: clear earning rules, wardrobe for coins, permanent upgrades

Status: ready
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
- After SPEC-006/007/008: `giveReward(win)` with `COINS_WIN`, `COINS_PER_LEVEL`, `COINS_PER_WORLD`, `COINS_NOBODY_OUT`, `COINS_FAST`, `COINS_PER_HUG`, `COINS_PER_REST`, `COINS_MIN_WIN`, star coins (`STAR_COINS` 3); stars = 1 + nobody out + fast; `progress.worlds[w].stars[n]`; `inv = { mittens, mega, kisses, rescues }`; shop with four cards (desktop + phone); skins screen with cycling of `HAIRS`/`HATS`/`JACKETS`/`PANTS`/`BIG_SKINS`, `randomOutfit`, outfits saved in `bebebe-outfits`; `rng()`, event log, `npm run balance`, `CFG.BALANCE` (SPEC-008).
- Hard rule 7: old saves keep working.

## Out of scope
- Real money, ads, daily rewards, chests.
- New consumables or new outfit items (only prices for existing ones).
- Story content (BACKLOG).

## Earning rules (starting numbers; tune with the report, see "Pace targets")
With world index `w` (0–3) and level `n` (1–20):
- **Base** = `REWARD.BASE` 15 + `REWARD.PER_LEVEL` 2 × n + `REWARD.PER_WORLD` 10 × w (Park 17 → 55, Winter 47 → 85).
- **First win** of `(w, n)`: base − `COINS_PER_REST` 3 × rests, floor `REWARD.FIRST_MIN` 5. **Replay win:** floor(base / 2) − 3 × rests, floor `REWARD.REPLAY_MIN` 3.
- **New stars:** `REWARD.NEW_STAR` 8 for each star above the level's previous best (max 3 × 8 per level, ever). The separate "nobody out" and "fast" coin bonuses are removed (they are the stars now).
- **Every time** (win or leaving early): hugs by players × `REWARD.PER_HUG` 1; bonus star pickups × `STAR_COINS` 3 (kids' number, fixed).
- **Leaving early** pays only the "every time" lines.
- `progress.worlds[w].won[n]` marks first wins (old saves: a level with stars counts as won).

## Spending
- **Consumables:** unchanged items and prices.
- **Wardrobe:** each entry of `HATS`, `JACKETS`, `PANTS`, `BIG_SKINS` gets `price` (0 = free). Starting set: all hairs free; the first 4 hats, 4 jackets, 4 pants and 2 Big One looks free; the rest in tiers `WARDROBE_TIERS` = 40 / 80 / 150 (the most special ones — crown, viking, top hat, cape, robot, pirate Big One — in the 150 tier). Bought items are kept in `progress.owned = { hats: [], jackets: [], pants: [], big: [] }` (ids, not indexes). The list of paid items is a "check with the kids" decision in the final report.
- **Upgrades** (`UPGRADES`, levels 0–3, player Little Ones only, never bots, never the Big One):
  - `fastFeet` — player speed +3 % per level (max +9 %); the Big One's cap stays relative to the base `PLAYER_SPEED`;
  - `longItems` — boots/cloak/shield durations and item life on the map +15 % per level;
  - `quickHelp` — a player's rescue time −10 % per level (3.0 → 2.1 s).
  Prices per level 100 / 200 / 300 (all upgrades maxed = 1800).

## Ledger
- `addCoins(reason, amount)` and `spendCoins(item, amount)` are the only code that changes `progress.coins`; both append to the event log (`coins` events) and save. A source-scan test fails on any other write to `progress.coins`.

## Acceptance criteria
1. **Reward rules:** scenario tests for first win, replay, new stars (0/1/3 new), rests with floors, leaving early, worlds 0 and 3; `lastReward` parts sum to the total; new-star coins are paid once per star ever. → `tests/economy.spec.js`
2. **Win screen** shows one line per non-zero part with its own icon: First win / Replay, New stars, Bonus stars, Hugs, Rests (negative in red), and the total; fits desktop and phone in en/es/ru (screenshot check).
3. **Wardrobe:** locked items appear in the skins screen with 🔒 and the price; cycling onto one shows it on the preview ("try on"); a "Buy N" button buys it (second tap confirms, like reset); not enough coins → the existing message; leaving the screen with a locked item selected falls back to the last owned item; `randomOutfit` picks only owned items; bots' random looks may use any item (they don't cost the player anything). Desktop and phone layouts, buttons ≥ 44 CSS px on phone. → "locked clothes can be tried on and bought", "random outfit uses only owned items"
4. **Migration:** items worn in `bebebe-outfits` become owned; levels with stars count as won; coins and inventory untouched; fixtures from SPEC-008 still load. → "old saves keep their outfits"
5. **Upgrades:** a second shop tab "Upgrades" (the first tab is today's items) with the three upgrades, their level (●●○), next price, effect text; buying raises the level, max 3; effects apply only to players; `__bb.upgrades`. → "upgrades apply to players only and stop at level 3"
6. **Ledger:** AC from "Ledger" above; `__bb.ledger()` returns the coin events of the session. → "every coin change is in the ledger"
7. **Pace targets** — added to `CFG.BALANCE` and to the balance report's new "Economy" section (careful autopilot, first playthrough of all 80 levels, no purchases):
   - Park median first-win income per level (all lines) between 2× and 4× the cheapest pack (30–60 coins) — enough for a cheap pack almost every level and savings for the rest;
   - income of any 4 first wins in a row ≥ mega mittens + 2 cheapest packs (90) in every world;
   - each world's total first-win income ≥ one 150-tier item + 10 cheapest packs;
   - all upgrades (1800) ≤ 60 % of the income of the first 60 levels;
   - replay income per game-minute ≤ 60 % of first-win income per game-minute (on Park 1–5 and Beach 1–5).
   Claude Code tunes only the `REWARD.*` numbers (within ±50 % of the starting values) and the wardrobe tier prices until all are green; the kids' fixed numbers stay. Final numbers and the report diff go in the final report.
8. **Upgrades don't break difficulty:** the report runs a second pass with all upgrades maxed (1 seed, every 5th level): median win time on Winter 17–20 is ≥ 70 % of the no-upgrade time, and every invariant from SPEC-008 still holds.
9. All numbers in `CFG`/`REWARD`/`UPGRADES`; all strings in en/es/ru; whole suite green; `npm run balance` run and `reports/balance.*` committed (SPEC-008 rule).

## Implementation steps
1. Ledger first (`addCoins`/`spendCoins`, source-scan test), switch existing purchases and rewards to it.
2. Reward rules + `won` flags + migration; tests (AC 1, 4); win screen (AC 2).
3. Wardrobe prices, `owned`, skins screen buy flow (AC 3).
4. Upgrades and the shop tab (AC 5).
5. Economy section of the balance report, tuning (AC 7–8).
6. Screenshots (win screen, skins with locks, upgrades tab — desktop/phone, three languages), whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Start value | en | es | ru |
|---|---|---|---|---|
| `REWARD.BASE` / `PER_LEVEL` / `PER_WORLD` | 15 / 2 / 10 | | | |
| `REWARD.NEW_STAR` | 8 | | | |
| `REWARD.PER_HUG` | 1 | | | |
| `REWARD.FIRST_MIN` / `REPLAY_MIN` | 5 / 3 | | | |
| `COINS_PER_REST`, `STAR_COINS` | 3, 3 (unchanged) | | | |
| `WARDROBE_TIERS` | 40 / 80 / 150 | | | |
| `UPGRADES` prices | 100 / 200 / 300 per level | | | |
| `I18N.*.rw` | win-screen lines | First win, Replay, New stars, Bonus stars, Hugs, Rests, Total | Primera vez, Repetición, Estrellas nuevas, Estrellitas, Abrazos, Descansos, Total | Первая победа, Повтор, Новые звёзды, Звёздочки, Обнимашки, Отдых, Итого |
| `I18N.*.buyFor` | `(n) =>` | Buy for ${n} | Comprar por ${n} | Купить за ${n} |
| `I18N.*.tapAgain` | confirm | Tap again to buy | Tocá otra vez para comprar | Нажми ещё раз, чтобы купить |
| `I18N.*.upgradesTab` / `itemsTab` | shop tabs | Upgrades / Items | Mejoras / Cosas | Улучшения / Вещи |
| `I18N.*.upg` | names + effects | Fast feet: +3% speed • Long items: items last longer • Quick help: lift friends faster | Pies rápidos: +3% velocidad • Cosas duraderas: duran más • Ayuda rápida: levantás más rápido | Быстрые ноги: +3% скорости • Долгие вещи: действуют дольше • Быстрая помощь: поднимаешь быстрее |

## Docs to update
`docs/game-design.md` (earning rules, spending shelves, upgrades and their caps, pace targets — kids' vs Claude's decisions; generated numbers section via `npm run docs:numbers`), `docs/architecture.md` (ledger, `won`, `owned`, `UPGRADES`, migration), `README.md` (coins and shop section), `reports/balance.*`.
