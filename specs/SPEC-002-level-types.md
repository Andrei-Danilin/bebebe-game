# SPEC-002 — Level types: meadow, maze, rooms, river, village, arena

Status: ready
Complexity: L
Branch: SPEC-002-level-types
Decided by: the kids with Andrei (2026-11-21): all six types (Meadow, Maze, House with rooms, River with bridges, Village, Ring arena); the same level number always gives the same map; types come in turn as the level grows; level 1 stays their drawing. Everything else below (order, sizes, constraints, wall looks, banner): Claude (spec author).

## Description
Today every level is the same picture (Little Ones' house top-left, the Big One's house bottom-left, a building on the right, scattered trees), only mirrored. After this spec each level has a **type** with its own layout and tactics: an open **Meadow** where the Big One sees far and bushes are the only cover; a **Maze** of hedge corridors to sneak around corners; a **House with rooms** where doorways are dangerous; a **River with bridges** with narrow crossings; a **Village** of little cottages and streets; a **Ring arena** for chases around a ring of walls. Level 1 is still the kids' drawing. When a level starts, a banner shows its number and type; the menu shows the type of the selected level.

## Goal
- Levels 2, 3, 4… cycle through the six types in a fixed order; the same level number always builds the same map (stars stay meaningful).
- Every generated level is fair: the Big One can reach everywhere except the safe house, nobody can get stuck, both houses' doors are clear, and there is enough room for items and cover for hiding.
- All four places (park, beach, winter, schoolyard) dress every type (walls, cottages, river look) in their own style.

## Context
- Generator: `generateLevel(lv, attempt)` → `{ items, small, big, flowers }`; item kinds `wall` (with `kind` home / bighome / build), `floor`, `decor`, `safe`, `pond`, `tree`, `rock`, `bush`; helpers `reserve`, `isFree`, `hWall`/`vWall` with 2-cell door gaps; houses are built at fixed canonical positions (Little Ones' house 7×6 at (0,0) with doors right and bottom, `safe` zone = that box; the Big One's house 6×6 at (0,14)); a global mirror `fx`/`fy` (not on level 1). `applyWorld` turns items into `obstacles` / `bushes` / `floors` / `decor` / `safeZone`; `loadLevel` retries up to 40 seeds until `connectivity()` passes, else fills pockets with `hedge`. Map 30×20 cells (`CELL` 32 px); the 3D camera fits this size (keep it: on a phone a bigger map makes characters too small).
- Obstacle semantics: walls block movement and sight; `pond` blocks movement only (sight passes); trees/rocks are circles blocking both; bushes hide (no blocking). Pathfinding grids: `blocked` (Little Ones) and `blockedBig` (also the safe zone). The Big One's radius is 22 px, so 2-cell (64 px) gaps are the minimum passage.
- 3D: `buildMap3D()` renders walls as boxes coloured by `THEMES[place].walls[kind]`, ponds via `makePondFor`, trees/rocks/bushes via `makeTreeFor`/`makeRockFor`/`makeBushFor`; ground texture `paintGround()` draws floors and decor. `docs/architecture.md` has the map; `docs/game-design.md` "Уровни" the current rules.
- Tests: all gameplay tests use level 1 and fixed coordinates — level 1 must stay byte-for-byte the same layout.

## Out of scope
- Bigger or smaller maps, scrolling camera.
- A level editor or kids drawing their own levels (BACKLOG).
- A mini-map preview in the menu (BACKLOG).
- New items, enemies, or changes to the Big One's or bots' rules beyond what is needed so they work on the new layouts.
- Changing Big One HP/speed scaling per level (stays as is).

## Level types and order
Level 1 = `classic` (the current generator, unchanged). From level 2: `TYPE_ORDER = ["meadow", "maze", "village", "river", "rooms", "arena"]`, `type = TYPE_ORDER[(lv - 2) % 6]`; `tier = Math.floor((lv - 2) / 6)` (0 for levels 2–7, 1 for 8–13, …).

Common to every type (except `classic`):
- **Houses**: the Little Ones' house (7×6, as today, with its `safe` zone, beds and spawns) in one corner; the Big One's house (6×6, as today) in a different corner, either the diagonal or the same side, chosen by the seed. Built in the canonical top-left / bottom-left / bottom-right positions, then the global mirror (`fx`, `fy`) as today, so all four corners occur. Each house door has 2 free cells in front of it.
- **Seeds**: everything comes from `mulberry32` seeded by `lv` (and `attempt`); no `Math.random` in generation.
- **Theme dressing** happens in 3D only (the generator stays place-free).

| Type | Layout | Cover and extras (tier 0; each tier: −1 bush, never below the minimum) |
|---|---|---|
| `meadow` | no buildings; open grass | bushes 10–12 (min 7), trees 6–9, rocks 2–4, 0–2 small ponds |
| `maze` | the area outside the two houses (with their 2-cell door aprons) is a maze on a coarse grid of 3-cell modules: **2-cell corridors, 1-cell walls** (new wall kind `maze`); generated as a perfect maze, then **braided**: walls are knocked out until at most 25 % of dead ends remain; plus 1–2 open plazas of 4×4 to 5×5 cells | bushes 3–4 in plazas and wide spots (min 2), trees 0–2 in plazas, no rocks/ponds |
| `village` | 5–8 cottages: solid blocks 3×3 to 4×5 cells (new item `cottage`, blocks movement and sight, drawn as a little house with a roof), streets ≥ 2 cells between any two cottages and around them; a central square 5×4 to 6×5 with a fountain (a `pond` 2×2) | bushes 5–7 in yards (min 3), trees 3–6, rocks 0–2 |
| `river` | a river (new item `water`, blocks movement, not sight) 2–3 cells wide crossing the map from edge to edge, horizontal or vertical, meandering by ±1 cell every 4–6 cells; **2–3 bridges**, each 2–3 cells wide (new floor kind `bridge`, walkable, wooden planks on the ground texture); the two houses on opposite banks | bushes 6–8 (min 4), trees 5–8, rocks 1–3, on both banks |
| `rooms` | one big building filling the map except the two houses and a 2-cell yard around them (wall kind `build`, floor `tile` inside); split recursively (BSP) into rooms with an inner size ≥ 4×4; every split wall has 1 door (2 wide), and about a third of them a second door so there are loops; the building has ≥ 3 outside doors | bushes 3–5 as indoor plants (min 2), rocks 2–4 as furniture (big rooms only), no trees inside |
| `arena` | a central block 4×4 to 6×4 (wall kind `arena`, solid); around it a ring of walls (kind `arena`) at a distance of 3 cells, with 3–4 gaps 2–3 cells wide; outside the ring an optional half-ring (50 % of levels) with 2 gaps | bushes 4–6 inside the ring corridor (min 3), trees 4–7 outside, rocks 0–2 |

## Fairness rules (checked for every generated level; a level that fails is regenerated with the next `attempt`)
1. Little Ones' grid: every free cell is reachable from the Little Ones' spawn (existing `connectivity()`).
2. Big One's grid (`blockedBig`): every free cell outside the safe zone is reachable from the Big One's spawn.
3. Path length (A* on `blockedBig`) from the Big One's door to the cell in front of the Little Ones' door: 18–70 cells.
4. Free cells (not blocked, outside both houses): ≥ 40 % of the map for `maze` and `rooms`, ≥ 50 % for the others.
5. Each house door has 2 free cells in front of it on both grids.
6. Dead ends (free cells with exactly one free 4-neighbour on the Big One's grid, counted per corridor end): `maze` ≤ 25 % of its module dead ends after braiding; other types: no dead-end corridor longer than 6 cells.
7. At least the type's minimum number of bushes is placed.
If 40 attempts fail, the existing pocket-filling fallback runs and the failure is logged with `console.warn` (tests treat any fallback as a failure, see AC 3).

## Acceptance criteria
1. **Level 1 unchanged.** A snapshot of `generateLevel(1, 0)` (items, spawns) is saved to `tests/fixtures/level1.json` **before** any generator change; after the change level 1 produces exactly the same JSON. → `tests/levels.spec.js` "level 1 is still the kids' drawing"
2. **Type order and determinism.** `window.__bb.levelType(lv)` returns `classic` for 1 and the `TYPE_ORDER` cycle from 2; generating any level twice gives identical JSON. → "levels 2–13 follow the type order", "the same level number always builds the same map"
3. **Fairness, levels 1–60.** A new `window.__bb.levelReport(lv)` builds the level (without touching the running game) and returns `{ type, attempts, fallback, freeRatio, bigReachAll, smallReachAll, housePath, doorClear, deadEnds, bushes }`. For every level 1–60: `fallback === false` and every rule above holds. Generation of one level (all attempts) takes under 200 ms in the test browser. → "levels 1–60 are fair and build fast"
4. **Meadow.** No walls except the two houses; bush count within the table range for its tier. → "meadow is open with bushes"
5. **Maze.** Corridors are 2 cells wide (no free cell of the maze area has a free run of exactly 1 cell between two maze walls), walls 1 cell, braided (dead-end rule), 1–2 plazas present. → "maze has 2-wide corridors and few dead ends"
6. **Village.** 5–8 `cottage` blocks, no two cottages closer than 2 cells, a fountain square. → "village has cottages, streets and a square"
7. **River.** `water` crosses from one map edge to the opposite edge, 2–3 bridges, the houses on opposite banks; the Big One can see across the water (sight not blocked) but crosses only on bridges. → "river has bridges and the houses on opposite banks"
8. **Rooms.** Every room has a door; ≥ 3 outside doors; at least one loop (removing any single door leaves the building connected for at least one door). → "rooms all have doors and the building has loops"
9. **Arena.** A central block, a ring with 3–4 gaps, the ring corridor reachable from outside through every gap. → "arena has a ring with gaps"
10. **Play on every type.** For each type, 60 s of simulated play (`update()` steps) with 1 player + 4 bots runs without page errors; the Big One moves more than 300 px in total and never enters the safe zone; every bot moves more than 200 px; a downed Little One far from the house is rescued or walks home (no state stuck). → "<type>: 60 s of play, nobody stuck" (6 tests)
11. **Every place dresses every type.** For each place × each type, `buildMap3D` runs without errors (smoke, 24 combinations, short); the new pieces have a theme look: `maze` walls (park: green hedge; beach: light wooden fence; winter: snow wall; schoolyard: blue lockers), `cottage` (walls + pitched roof in theme colours; winter: snow on the roof), `water` (park: blue; beach: turquoise; winter: icy pale blue; schoolyard: blue canal with a stone edge), `bridge` planks, `arena` walls (stone). All theme colours live in `THEMES`. → "every place dresses every level type"
12. **Banner and menu.** When a level starts, a banner "Level N: <type>" fades in and out over ~2 s (not blocking play, not shown on restart within 1 s of the last banner); the menu shows the selected level's type name near the level selector, fitting in en/es/ru without overlapping (screenshot check). New strings in all three languages (table below). → "start banner shows the level type", `tests/i18n.spec.js`
13. **No regressions.** The whole existing suite stays green (it uses level 1). 
14. **Screenshots looked at** (throwaway script, not committed): one per type in a different place each (6), plus maze in all 4 places; checked for: characters visible in corridors (walls are 0.85 high — if a 2-cell corridor hides the Little Ones behind walls from the camera, lower `maze` walls to ~0.6 or fade them like trees, and say which in the report), banner readable, menu label fits.

## Implementation steps
1. **Before touching the generator**: write `tests/fixtures/level1.json` from the current `generateLevel(1, 0)` and the "level 1 unchanged" test (green now). Add `levelType`, `levelReport` stubs to `__bb` and the failing tests for AC 2–3 with the fairness checks (a `validateLevel()` function in the generator section, used by both `loadLevel` and `levelReport`).
2. Split the generator: `generateLevel` keeps the common parts (seed, houses, mirror, flowers) and calls `LAYOUTS[type](ctx)`; move today's body into `LAYOUTS.classic` without changing its behaviour (AC 1 stays green). Houses for non-classic types: a `placeHomes(ctx, variant)` helper.
3. One step per type, each with its tests first (AC 4–9) and its fairness passing for its levels in 1–60: meadow → maze → village → river → rooms → arena. New item kinds (`cottage`, `water`, `bridge` floor, wall kinds `maze`, `arena`) in `applyWorld` with the right movement/sight flags.
4. `validateLevel()` wired into `loadLevel` (retry on failure; fallback + `console.warn`). AC 3 green for 1–60, timing under 200 ms.
5. 3D: theme looks for the new pieces in `buildMap3D` / `THEMES` (river as one continuous water body without rims between segments; bridges on the ground texture; cottages with roofs); AC 11 smoke.
6. Banner + menu label + strings (AC 12).
7. Play tests per type (AC 10); fix any AI that gets stuck (most likely spots: bots' `lurk`/`flee` targets inside walls → snap to the nearest free cell; the Big One's `randomFreePoint` must stay on his grid).
8. Screenshots (AC 14), whole suite, reviews (`code-reviewer` + `architect-reviewer`), docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `TYPE_ORDER` | meadow, maze, village, river, rooms, arena | | | |
| `I18N.*.types.classic` | level 1 | Our drawing | Nuestro dibujo | Наш рисунок |
| `I18N.*.types.meadow` | | Meadow | Pradera | Поляна |
| `I18N.*.types.maze` | | Maze | Laberinto | Лабиринт |
| `I18N.*.types.village` | | Village | Pueblito | Деревня |
| `I18N.*.types.river` | | River with bridges | Río con puentes | Река с мостиками |
| `I18N.*.types.rooms` | | House with rooms | Casa con cuartos | Дом с комнатами |
| `I18N.*.types.arena` | | Ring arena | Arena | Арена с кольцом |
| `I18N.*.levelIntro` | `(n, t) =>` | Level ${n}: ${t} | Nivel ${n}: ${t} | Уровень ${n}: ${t} |
| fairness limits | see "Fairness rules" | | | |
| maze dead ends after braiding | ≤ 25 % | | | |
| generation time per level | < 200 ms | | | |

## Docs to update
`docs/game-design.md` "Уровни": the six types, their order, "same number = same map", level 1 = the kids' drawing, the fairness rules in one line each (who decided what: the types, determinism and order — the kids/Andrei; sizes and rules — Claude). `docs/architecture.md`: generator structure (`LAYOUTS`, `placeHomes`, `validateLevel`, `levelType`, `levelReport`), new item kinds and their flags, theme keys. `README.md`: "Levels" section with the six types. `specs/BACKLOG.md`: mini-map preview in the menu; kids' level editor.
