# SPEC-016 — Worlds by the story: Park, Football field, City, School + bonus Beach and Winter

Status: ready
Complexity: L
Branch: SPEC-016-story-worlds
Decided by: Kostya and Andrei (2026-11-22): the four main worlds are Park → Football field → City → School (the School ends with the grumpiest dad); Beach and Winter become **bonus worlds** that open after all levels of the main worlds are won; the bonus worlds are as hard as the School or harder. Recorded in `claude/story.md` (project doc). Everything else (themes for the two new places, seeds, migration, numbers): Claude (spec author).

## Description
SPEC-006 made four worlds of 20 levels in the order Park, School, Beach, Winter. Kostya's story now has one neighbourhood: the park, the football field, the city streets and the school. This spec adds the **Football field** and the **City** as new places, puts the worlds in the story order, and turns Beach and Winter into bonus worlds (20 levels each, locked until every main level is won). Existing Park, School, Beach and Winter maps stay exactly as they are.

## Goal
- 6 worlds × 20 levels = 120 fixed, fair maps; main order Park, Field, City, School; Beach and Winter after.
- The two new places look like themselves in every level type.
- Nobody loses progress; maps a child already played don't change.

## Context
(Run the pre-flight: by the time this runs, `index.html` may have been split into modules by SPEC-011 and SPEC-007…009 may have landed; match names to the code.)
- SPEC-006: `WORLDS = ["park","school","beach","winter"]`, `WORLD_TYPES` (1 classic, 2–4 meadow, 5–7 village, 8–10 river, 11–13 rooms, 14–16 arena, 17–20 maze), `difficulty(world, n)` with `WORLD_SPEED_START` per world index and hearts `min(12, 6 + floor((n−1)/4) + w)`, `BIG_CHASE_MAX`, `progress.worlds[world] = { unlocked, stars }` (+ `won` if SPEC-009 landed), seeds from the world index, `tests/fixtures/level1.json` and `tests/fixtures/levels-worlds.json`, `levelReport`, world cards in the menu, banner `levelIntro(world, n, type)`, `I18N.*.worlds`.
- Places: `THEMES[place]` with ground painting, wall colours per wall kind, tree/rock/bush/pond makers, cottages, water, bridges, maze/arena walls (SPEC-002), snow particles for winter.
- Online specs (SPEC-013) pick a world and a level from `WORLDS`.

## Out of scope
- Menus and the level map (SPEC-017), boss levels, the dad's look, story comics, the messy dad's house (art spec later).
- New level types or rule changes.

## Worlds
- `MAIN_WORLDS = ["park", "field", "city", "school"]`, `BONUS_WORLDS = ["beach", "winter"]`, `WORLDS = [...MAIN_WORLDS, ...BONUS_WORLDS]`.
- **Seeds are keyed by the world name, not its position** (a fixed number per world, e.g. a small hash of the name), so Park, School, Beach and Winter keep exactly the maps they have now (`levels-worlds.json` unchanged); Field and City get their own.
- **Difficulty index** per world (replaces the position in the formulas): park 0, field 1, city 2, school 3, beach 3, winter 4. `WORLD_SPEED_START` by index: [0, 5, 10, 15, 18] (winter 18); hearts use the index (beach 9 → 12, winter 10 → 12); the cap `BIG_CHASE_MAX` stays. Coins per world (`COINS_PER_WORLD` or SPEC-009's `REWARD.PER_WORLD`) use the index too.
- **Unlocking:** main worlds open from the start (SPEC-006 rule); inside a world levels open one by one. Bonus worlds open when all 80 main levels are won (`bonusUnlocked()`); a save that already has progress in Beach or Winter keeps them open (nobody loses what they had).

## New places
**Football field** (`field`): ground — striped mown grass with white chalk lines, centre circle and penalty boxes painted on the ground texture; edges — low advertising boards; decor — goals at both ends (movement blocked, sight passes through the net, like a pond), corner flags, benches, a ball or two (decor only); trees outside the fence. Per level type: meadow = open pitch with a few bushes; village = kiosks and locker-room huts; river = a drainage stream with small footbridges; rooms = the clubhouse with changing rooms; arena = the stands as the ring; maze = rows of advertising boards and hedges; bushes = round hedges; rocks = kit bags/cones piles; trees = lamp masts or trees.
**City** (`city`): ground — grey asphalt streets with crosswalks and dashed lines, light pavements, small squares; decor — lamp posts, hydrants, benches, bins; obstacles — parked cars (block movement and sight, like rocks); per level type: village = little town houses; river = a canal with stone bridges; rooms = a shopping centre with shops; arena = a roundabout ring; maze = yard fences and hedges; bushes = flower planters; trees = street trees.
Both get full `THEMES` entries (all wall kinds, cottage, water, bridge, maze, arena colours), the kids' safe house and the dad's house in theme colours, and pass the SPEC-002 fairness rules.

## Progress and saves
- `progress.worlds` gets `field` and `city` (`unlocked: 1`); existing entries untouched. `progress.lastWorld` keeps working.
- Migration test: a save with Park 20 won, School 5, Beach 3 → Park/School/Beach unchanged, Beach still open (has progress), Winter locked, Field/City fresh.

## Acceptance criteria
1. `MAIN_WORLDS`, `BONUS_WORLDS`, `WORLDS` in the order above; `__bb.worlds`, `__bb.bonusUnlocked()`. → `tests/levels.spec.js` "worlds follow the story order"
2. **Existing maps unchanged:** `level1.json` and `levels-worlds.json` still match for Park, School, Beach, Winter. Field and City get new fixtures. → "old worlds keep their maps"
3. **Fairness for all 120 levels** (SPEC-002 rules, no fallback, < 200 ms each). → "all 120 levels are fair"
4. **Difficulty:** formulas by difficulty index; the SPEC-008 invariants (if landed) hold for all six worlds; Field 1 easier than Park 20, City 1 easier than Field 20, School 1 easier than City 20; Beach ≥ School, Winter ≥ Beach at the same level. → "difficulty follows the story order"
5. **Bonus lock:** locked until all 80 main levels are won; opening it shows a one-time "Bonus worlds unlocked!" message; saves with Beach/Winter progress keep them open. → "bonus worlds open after all main levels"
6. **Themes:** Field and City render every level type without errors in 3D (smoke for 2 places × 7 types), all colours in `THEMES`; screenshots (throwaway) of each type in both places looked at — pitch lines, goals, crosswalks, cars clearly readable; characters visible.
7. **Migration** (above). → "old saves get the new worlds"
8. Menu world cards (SPEC-006) show six worlds in this order with the bonus ones locked/unlocked (the full level map comes in SPEC-017); banner and texts use the new names.
9. Online (if SPEC-013 landed): the room's world picker offers unlocked worlds only.
10. Strings en/es/ru, numbers in `CFG`, whole suite green, `npm run balance` re-run if SPEC-008 landed (6 worlds).

## Implementation steps
1. Pre-flight: match names to the current code; tests first for AC 1, 2, 7.
2. World lists, name-keyed seeds, difficulty index; AC 4.
3. Field and City themes and per-type dressing; fairness for 120; AC 3, 6.
4. Bonus lock and message; migration; menu cards and texts; AC 5, 8, 9.
5. Balance report (if available), screenshots, whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `MAIN_WORLDS` | park, field, city, school | | | |
| `BONUS_WORLDS` | beach, winter | | | |
| difficulty index | park 0, field 1, city 2, school 3, beach 3, winter 4 | | | |
| `WORLD_SPEED_START` | [0, 5, 10, 15, 18] by index | | | |
| `I18N.*.worlds` | names | Park, Football field, City, School, Beach, Winter | Parque, Cancha, Ciudad, Escuela, Playa, Invierno | Парк, Футбольное поле, Город, Школа, Пляж, Зима |
| `I18N.*.bonus` | label | Bonus | Bonus | Бонус |
| `I18N.*.bonusUnlocked` | message | Bonus worlds unlocked! | ¡Se abrieron los mundos bonus! | Открылись бонусные миры! |

## Docs to update
`docs/game-design.md` (worlds by the story, bonus rule, difficulty index — Kostya/Andrei vs Claude decisions), `docs/architecture.md` (world lists, name-keyed seeds, difficulty index, new themes), `README.md` (worlds table).
