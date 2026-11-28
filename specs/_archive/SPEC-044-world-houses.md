# SPEC-044 — Every world has its own houses: treehouse, dugout, shop, school bus, beach hut, igloo — and Dad's messy versions

Status: done (merged by "Merge SPEC-044", see git log)
Art notes (art 38, 39, checked by Claude 2026-11-26):
- **38**: top row kids' Park treehouse, Field changing room with flags (flat open top), City shop with awning, School bus; bottom row Dad's red shed with rake and sock, groundskeeper hut with mower, boots and trash, garage with pizza boxes, caretaker room with leaking pipe and mop.
- **39**: kids' striped beach hut on stilts, kids' igloo (heart above the door), Dad's shabby beach hut with torn umbrella and pizza boxes, Dad's snowy log cabin with socks and trash.
The sprites have white sticker edges and small ground patches: keep them in the cut-out.
Complexity: M
Branch: SPEC-044-world-houses
Decided by: Andrei (2026-11-26): the kids' house and Dad's house look different in every world (idea 3). Which house per world: Claude, from the art sheets 38 / 39 that Andrei generates.
Decisions during the run: Andrei (2026-11-27): the art budget is raised instead of shrinking art — `scripts/assets.json` `budget.totalKB` 4096 → 5120 (`backgroundKB` stays 250; SPEC-040's 25 MB decoded memory at home is unchanged, the house sprites are non-resident); the pinned value in `tests/assets.spec.js` follows, the backlog line "Art budget (SPEC-042)" is gone. Claude: the rules page (`ui/story.js` `RULE_ART`) keeps `house_kids` on purpose — it explains the game, it is not tied to a world; the level card is the one place that shows the current world's pair.

## Description
Today both houses look the same in every world: a light-blue kids' house and a faded-red messy Dad's house (only the roof gets snow in Winter; backlog SPEC-021). Each world now gets its own pair, modelled in 3D in the comic style from the concept sheets:

| World | Kids' house (clean, light colours, a heart on the door) | Dad's house (messy: stains, a sock in the window, trash, stink lines) |
|---|---|---|
| Park | treehouse on a short thick trunk with a ladder | a crooked garden shed with a broken rake and a full trash bin |
| Football field | a team dugout / changing room with little flags | a groundskeeper's hut with an old lawn mower and muddy boots |
| City | a small corner shop with a striped awning | a messy garage with a dented door and pizza boxes |
| School | a yellow school bus with round windows | the caretaker's room with a mop bucket and a leaking pipe |
| Beach | a striped beach hut on short stilts | a shabby hut with a torn umbrella and pizza boxes in the sand |
| Winter | an igloo with a round door | a log cabin with snow on a crooked roof and a frozen sock on a line |

The gameplay sizes (house cells, door, safe zone, door apron) do not change.

## Context
(Pre-flight against master; match names.)
- 3D houses: `src/client/three/houses.js` (`dressHouses(place)`, roof fade `fadeRoofs`, `houseInfo`); themes `three/themes.js`; materials and outlines `three/materials.js` (SPEC-021).
- House footprint and doors come from the core level (`src/core/level/`); safe zone `inSafe`; Dad thrown out of the kids' house (SPEC-003 danger zone in Dad's house).
- 2D house sprites `house_kids`, `house_messy` (`art/15_houses`) used in menus / map; the map backgrounds `18_map_bg_*` show the old houses.
- Art (optional):
  - `art/38_houses_main.webp`: row 1 = kids' houses Park, Field, City, School; row 2 = Dad's houses in the same order;
  - `art/39_houses_bonus.webp`: kids' Beach, kids' Winter, Dad's Beach, Dad's Winter.
  - Sprites `house_<world>_kids` / `house_<world>_dad`; the 3D is built in code from these as references. Missing art → today's houses.

## Out of scope
House sizes, doors, the safe-zone rules; redrawing the level-map backgrounds (`18_*`): that is a later art task.

## Acceptance criteria
1. **3D houses per world:**
   - `dressHouses` builds the kids' and Dad's house of the current world from per-world builders (`HOUSE_LOOK[world].kids / .dad`), in the SPEC-021 comic style (outlines, two-tone toon, marker textures), matching the concept sheets' shapes and colours;
   - same footprint and door position as today; roofs or tops still fade when a kid is inside.
2. **Dad's houses stay recognisably messy** (stains, sock, trash, stink lines) and the kids' houses clean, with the heart on the door, so children can tell them apart at a glance in every world. Test: screenshots of both houses in every world at 667×375 and 1280×720, looked at; a pixel test that the door heart is visible on every kids' house.
3. **Perf:** draw calls per house ≤ today's + 30%, inside SPEC-040's budget (shared geometry, instancing where repeated); frame time unchanged within noise (`perf.spec`).
4. **Sprites:** `scripts/assets.json` maps sheets 38 / 39 to `house_<world>_kids` / `house_<world>_dad`. 2D places that show a house (level card preview of SPEC-041, menus that use `house_kids` / `house_messy`) use the current world's sprite, falling back to today's.
5. **Docs:**
   - `docs/game-design.md` (houses per world);
   - `docs/architecture.md` (`HOUSE_LOOK`);
   - `specs/BACKLOG.md`: "regenerate the level-map backgrounds 18_* with the new houses — art task for Andrei".

## Implementation steps (TDD where testable)
1. The `HOUSE_LOOK` table and the builder switch, with today's houses as the default builder.
2. One world per step (Park, Field, City, School, Beach, Winter): kids' and Dad's builders from the sheet, screenshots looked at.
3. Sprites mapping, 2D uses.
4. Perf check, docs.
