# SPEC-006 — Four worlds of 20 levels: Park, School, Beach, Winter

Status: ready
Complexity: L
Branch: SPEC-006-four-worlds
Decided by: Andrei and the kids (2026-11-22): four worlds — Park, School, Beach, Winter — of 20 levels each; inside a world the level types go from easy to the maze (mazes are the hardest, at the end); all four worlds are open from the start, levels open one by one inside each world; difficulty grows inside a world mostly through the Big One moving faster, and each next world starts a little harder than the previous one started. Everything else (formulas, caps, save migration, menu layout, coins): Claude (spec author).

## Description
Today levels are one endless line (1–99), the place is picked separately ("auto" cycles places by level), and the Big One gets 4 px/s faster on every level without a limit — by level 20 he is faster than the players. After this spec the game has **four worlds**. The menu shows the four worlds; a world has 20 levels that open one by one; each level has stars as today. Inside a world the maps go from open to tight: the kids' drawing, meadows, villages, rivers, the house with rooms, arenas, and the last four levels are mazes. The Big One gets faster and a bit tougher level by level, and every next world starts a little harder.

## Goal
- 80 levels, each with a fixed map (same world + level = same map), all fair (the SPEC-002 rules).
- A smooth difficulty curve with a hard ceiling: the Big One never runs faster than a player without boots.
- Old saves keep coins, gloves, kisses and names; their progress moves into the Park.

## Context
- Levels: `level` 1–99, `progress.unlocked` (number), `progress.stars` keyed by level number, `changeLevel`, menu level box with ◀ ▶ / 🔒 and stars (desktop and phone layouts, `fz`/`c` helpers in phone mode).
- Level types: `levelType(lv)` / `levelTier(lv)` from `CFG.TYPE_ORDER` (cycle from level 2), `LAYOUTS`, `placeHomes`, `validateLevel`, `levelReport`, `generateLevel(lv, attempt)` seeded by `lv`; `tests/fixtures/level1.json` pins level 1 (the kids' drawing); `tests/levels.spec.js` checks fairness for 1–60.
- Places: `PLACES`, `placeSel` ("auto" or a place, saved in `bebebe-place`), `currentPlace()`, `cyclePlace`, `THEMES[place]`, `buildMap3D` keyed by level + place.
- Difficulty: `BIG_HP` 6 + `HP_PER_LEVEL` 1 per level up to `BIG_HP_MAX` 12; `bigBoost()` = (level − 1) × `CHASE_PER_LEVEL` 4 + whole hearts lost × `BIG_SPEED_PER_HIT` 4, added to `BIG_CHASE_SPEED` 112 (×0.85 when searching) and half of it to `BIG_PATROL_SPEED` 70. `PLAYER_SPEED` 150, `BOT_SPEED` 135.
- Rewards: `giveReward` uses `level` for `COINS_PER_LEVEL` and `FAST_TIME(level)`.
- Banner: `levelIntro(n, t)`; phone mode (SPEC-005) has its own layouts for the menu.

## Out of scope
- New level types, new places, a world map screen with paths (a simple menu is enough).
- Boss levels or special rules per world.
- Changing the rest time or adding the rescue kit (SPEC-007).

## Worlds and levels
- `WORLDS = ["park", "school", "beach", "winter"]` (this order everywhere). A level is `(world, n)` with `n` 1–20.
- Types inside every world: `n = 1` classic (the kids' drawing, in the world's theme), 2–4 `meadow`, 5–7 `village`, 8–10 `river`, 11–13 `rooms`, 14–16 `arena`, 17–20 `maze` (`CFG.WORLD_TYPES` as a 20-entry list, so it is easy to change). The type's `tier` = the position inside its block (0, 1, 2, 3), so later levels of a block have less cover.
- Seed: `generateLevel` takes a level key; Park level 1 must stay exactly `tests/fixtures/level1.json`. The other worlds' level 1 is the same kids' drawing (same layout) in their theme. Levels 2–20 use a seed from `(worldIndex, n)` so every world has different maps.
- The place of a level is its world; the place picker and `bebebe-place` go away (the key is ignored if present).

## Difficulty
With `w` = world index (0–3) and `n` = level (1–20):
- Chase speed: `BIG_CHASE_SPEED` + `CFG.WORLD_SPEED_START[w]` + (n − 1) × `CFG.SPEED_PER_LEVEL`, with `WORLD_SPEED_START = [0, 5, 10, 15]` and `SPEED_PER_LEVEL = 1.2` (Park 112 → 135, School 117 → 140, Beach 122 → 145, Winter 127 → 150 before the cap). Searching ×0.85 and patrol + half of the boost as today.
- The per-hug anger boost (`BIG_SPEED_PER_HIT` × whole hearts lost) stays.
- **Cap:** the final chase speed (with the anger boost) never exceeds `CFG.BIG_CHASE_MAX` = 0.95 × `PLAYER_SPEED` (142.5).
- Hearts: `min(BIG_HP_MAX, BIG_HP + floor((n − 1) / 4) + w)` → Park 6 → 10, School 7 → 11, Beach 8 → 12, Winter 9 → 12.
- Check: each world's level 1 is easier than the previous world's level 20 (speed and hearts), and each world's level 20 is harder than its level 1 → test.

## Progress and saves
- `progress.worlds = { park: { unlocked, stars: { [n]: 0–3 } }, school: …, beach: …, winter: … }`; every world starts with `unlocked: 1`. Winning level `n` unlocks `n + 1` in that world (max 20).
- `progress.lastWorld` remembers which world the menu shows.
- **Migration of old saves** (once, on load, kept compatible with hard rule 7): old `unlocked` → `worlds.park.unlocked = min(20, unlocked)`; old `stars[n]` for n ≤ 20 → `worlds.park.stars[n]`; higher old levels are dropped. Coins, inventory, equip and names are untouched. A test loads an old save object and checks the result.
- Rewards: coins = `COINS_WIN` + n × `COINS_PER_LEVEL` + w × `CFG.COINS_PER_WORLD` (10) + the existing bonuses/penalty, then the floor, then star coins as today; `FAST_TIME(n)` uses `n` (+ `CFG.FAST_PER_WORLD` × w, 10 s, because the Big One has more hearts).

## Acceptance criteria
1. **Level keys and types.** `__bb.levelType(world, n)` follows `WORLD_TYPES`; `__bb.world` (get/set), `__bb.level` = n. → `tests/levels.spec.js` "every world goes from the drawing to the maze"
2. **Park level 1 unchanged** (fixture) and the other worlds' level 1 have the same layout. → "level 1 is the kids' drawing in every world"
3. **Determinism and variety.** Same world + level → identical map; the four worlds' level 7 (for example) are different maps. → "maps are fixed and differ between worlds"
4. **Fairness for all 80 levels.** `levelReport(world, n)` for every world × 1–20: no fallback, every SPEC-002 rule holds, under 200 ms each. (Replaces the 1–60 test.) → "all 80 levels are fair and build fast"
5. **Difficulty curve.** `__bb.difficulty(world, n)` returns `{ chase, patrol, hearts }`; the test checks the formulas, the cap (also with the anger boost at the last heart), the "next world starts below the previous world's level 20" rule and "level 20 harder than level 1" in each world. → "the Big One gets faster inside a world and never outruns a player"
6. **Progress.** Winning unlocks the next level in that world only; all worlds open from the start; stars per world. → "worlds unlock their own levels"
7. **Migration.** An old save (`unlocked: 23, stars: {1:3, 5:2, 21:1}, coins: 140, inv: {…}`) becomes Park unlocked 20, stars {1:3, 5:2}, coins/inv unchanged; a save without `worlds` and without old fields gets the fresh structure. → "old saves move into the Park"
8. **Menu.** Shows the four worlds as big tabs or cards (world name, a small picture drawn from its theme colours, stars collected / 60), the selected world highlighted; under it the level selector 1–20 for that world (◀ ▶ / 🔒 as today) with the level's stars and type name. Desktop and phone layouts (phone: SPEC-005 sizes, every button ≥ 44×44 CSS px). The place row is gone. Screenshot check en/es/ru, desktop 960×640 and phone 844×390.
9. **Banner** at level start: "Park · Level 17: Maze" (new `levelIntro(world, n, type)` in all three languages).
10. **Win screen** "next level" goes to the next level of the same world; after level 20 it says the world is done (new string) and offers the menu.
11. **No regressions.** Whole suite green (tests that used `level` numbers above 20 or `placeSel` are moved to the world API; their intent stays). `__bb.placeSel`/`cyclePlace` removed or mapped to worlds (say which).
12. Screenshots looked at (throwaway): the menu in all three languages on desktop and phone; one level of each type in a different world; a maze in Winter.
13. **Phone banner never covers the hero** (post-merge fix). In phone mode the level banner sits in the vertical half of the screen where the hero isn't (top or bottom band, centred in the widest free strip of that band), clear of the mini-map, HUD, joystick hint and buttons; its width is limited with `fitText`; if the full text still doesn't fit, it uses the short phone variant `levelIntroShort(world, n, type)` ("Park · 1: Our drawing", en/es/ru); if nothing fits, the banner is skipped. For 667×375, 844×390 and 932×430, every world, en/es/ru, the hero at his start position and at the screen centre: the banner rect keeps ≥ 8 CSS px from the hero's screen rect and from the mini-map, HUD and buttons, measured with the real text width and again with a simulated 15 % wider font. Desktop unchanged. → `tests/phone.spec.js` "the phone banner never covers the hero"

## Post-merge fix
The first deploy of the merge (25e2c47, run 45051462306) was red on CI only: at 667×375 the longer banner "Park · Level 1: Our drawing", measured with the Linux fonts, reached the Little Ones' house top-left and covered the hero (`tests/phone.spec.js` "every phone button is big enough at 667×375"). AC 13 was added and fixed on branch `SPEC-006-phone-banner` before the spec was closed.

## Implementation steps
1. Tests first: fixture still green, `difficulty` formulas (AC 5), migration (AC 7).
2. Level keys: `WORLDS`, `WORLD_TYPES`, `levelType(world, n)`, tier, seed from `(world, n)`; `generateLevel`/`levelReport`/`loadLevel` take the key; replace the place picker with the world. AC 1–4.
3. Difficulty: `difficulty(world, n)` used by `resetWorld` (hearts) and the Big One's speeds (with the cap). AC 5.
4. Progress structure, migration, rewards; win flow. AC 6, 7, 10.
5. Menu (desktop and phone) and banner. AC 8, 9.
6. Fairness run for 80 levels, screenshots, whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `WORLDS` | park, school, beach, winter | | | |
| `WORLD_TYPES` | 1 classic, 2–4 meadow, 5–7 village, 8–10 river, 11–13 rooms, 14–16 arena, 17–20 maze | | | |
| `WORLD_SPEED_START` | [0, 5, 10, 15] px/s | | | |
| `SPEED_PER_LEVEL` | 1.2 px/s | | | |
| `BIG_CHASE_MAX` | 0.95 × `PLAYER_SPEED` | | | |
| hearts | `min(12, 6 + floor((n − 1)/4) + w)` | | | |
| `COINS_PER_WORLD` | 10 | | | |
| `FAST_PER_WORLD` | 10 s | | | |
| `I18N.*.worlds` | world names | Park, School, Beach, Winter | Parque, Escuela, Playa, Invierno | Парк, Школа, Пляж, Зима |
| `I18N.*.levelIntro` | `(world, n, t) =>` | ${world} · Level ${n}: ${t} | ${world} · Nivel ${n}: ${t} | ${world} · Уровень ${n}: ${t} |
| `I18N.*.worldDone` | after level 20 | You finished the ${world}! | ¡Terminaste ${world}! | ${world} пройден! |
| `I18N.*.worldStars` | `(s) =>` menu | ⭐ ${s}/60 | ⭐ ${s}/60 | ⭐ ${s}/60 |
| CHASE_PER_LEVEL, HP_PER_LEVEL | removed (replaced by the above) | | | |

## Docs to update
`docs/game-design.md` (worlds, order of types, difficulty curve with the cap, unlocking, migration — who decided what), `docs/architecture.md` (level key, `WORLDS`/`WORLD_TYPES`, `difficulty`, `progress.worlds`, migration, removed place picker, `__bb` changes), `README.md` (worlds and levels table).
