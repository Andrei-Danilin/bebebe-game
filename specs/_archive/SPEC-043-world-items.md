# SPEC-043 — Every world has its own item: football, cupcake, paper plane, watermelon, snowball

Status: done (merged by "Merge SPEC-043", see git log)
Art notes: art 37 on master, mapped as SPEC-042's status line says — `item_football`, `item_paperplane`, `item_watermelon`, `item_snowball`; the duplicates are dropped
Complexity: M
Branch: SPEC-043-world-items
Decided by: Andrei (2026-11-26): each world gets its own item, next to the banana (idea 4). Which item, its effect and numbers: Claude, check with the kids. Art: icon sheet 37 from Andrei.

## Description
Today every world spawns the same items: speed boots, invisibility cloak, shield and banana. Each world now also spawns **its own item**, used like the banana: it lies on the map, and the kids use it by leading Dad onto it or running into it. No new buttons.

| World | Item | How it works | Effect on Dad |
|---|---|---|---|
| Park | **Banana** (as today) | lead Dad onto it | slips, lies 2.5 s, huggable from any side |
| Football field | **Football** | run into it: it rolls 6 cells in your direction, bouncing off walls | hit by it → stunned 1.5 s, huggable from any side |
| City | **Cupcake** (his favourite, from Kostya's story) | it lies there; when Dad sees it within 5 cells he walks over and eats it | eating 3 s, huggable from any side |
| School | **Paper plane** | run into it: it flies 8 cells in your direction | if he sees it fly, he turns to watch it for 2 s (looks away from the kids) |
| Beach | **Watermelon slice** | lead Dad onto it | slides 2 cells and lies 3.5 s, huggable from any side |
| Winter | **Snowball pile** | run into it: a snowball flies 7 cells in your direction | hit → "Brrr!" frozen 1.5 s, huggable from any side |

The banana stays in every world, at a smaller share; the world item takes the rest of the banana's share (Claude).

## Context
(Pre-flight against master; match names.)
- Items in `src/core/rules.js`:
  - `spawnItem` (kind shares: boots 0.3, cloak 0.25, shield 0.2, banana 0.25; practice shares in `CFG.TUTORIAL`), `G.items`;
  - `ITEM_EVERY` / `ITEM_MAX` / `ITEM_LIFE`, the banana's slip (`SLIP_STUN`), `big.slip`.
- Dad: `src/core/big.js` (states, `look`, vision cone), `hearing.js`.
- 3D items: `src/client/three/` (item meshes, banana); icons via `ITEM_ART` / `EMOJI_ART` in `src/client/art.js`; HUD pops (`L().items`).
- How to play rules line 6, tutorial page B4 and the "New here!" card (SPEC-042, which names the world item).
- Art: `art/37_world_icons.webp` → `item_football`, `item_paperplane`, `item_watermelon`, `item_snowball` (the cupcake uses the existing `icon_cupcake`).

## Out of scope
New buttons; the world tricks (SPEC-042).

## Acceptance criteria
1. **Shares:** `CFG.WORLD_ITEM` = park: banana (no extra), field: football, city: cupcake, school: plane, beach: watermelon, winter: snowball. In worlds other than the Park, the spawn shares become boots 0.3, cloak 0.25, shield 0.2, banana 0.1, world item 0.15. Practice games are unchanged.
2. **Each item works as in the table**, in the core, deterministic, numbers in `CFG.WORLD_ITEMS`. Launched items (football, plane, snowball) move in the kid's run direction (tiptoe launches too, at the same distance), stop at walls (the football bounces once), and vanish after their flight or after `ITEM_LIFE` on the ground.
3. **Effects reuse existing states where possible:**
   - "stunned / frozen / eating" are huggable from any side like `slip`;
   - the plane uses the `look` state facing the plane;
   - Dad never chases while eating, stunned or frozen;
   - a boss (level 20) is affected for half the time (Claude).
4. **Bots and autopilot use them like the banana:** they lead Dad onto it, or kick or throw when Dad is in line within range. The SPEC-037 stall guard still passes.
5. **3D and 2D:**
   - simple comic meshes (football, cupcake, paper plane, watermelon slice, snowball pile) with the SPEC-021 outlines;
   - flight and roll animations; pops ("Bonk!", "Yum!", "Brrr!", "Whee!" in four languages);
   - item icons from sheet 37 in the HUD and tips, falling back to emoji ⚽ 🧁 ✈ 🍉 ❄ (the no-emoji test of SPEC-032 then lists them only while the art is missing).
6. **Texts:**
   - How to play rule 6 mentions "and in each world its own surprise!" (four languages);
   - the "New here!" card (SPEC-042) names the item;
   - tutorial B4 unchanged (the Park banana).
7. **Tests:**
   - core tests per item (spawn share per world, launch distance, hit and effect duration, boss half time, no effect in practice);
   - same seed, same game.
8. **Balance:** run the Balance workflow on the branch and commit the reports; the kids' targets stay (tune `CFG.WORLD_ITEMS` first).
9. **Docs:**
   - `docs/game-design.md`: items per world;
   - `specs/BACKLOG.md`: "world items and numbers — Claude, check with the kids".

## Implementation steps (TDD: failing test first in each)
1. Shares and `CFG.WORLD_ITEM(S)`.
2. One item per step: football → cupcake → plane → watermelon → snowball (core, 3D, pops, bots).
3. Icons (sheet 37), texts.
4. Balance, screenshots (each item in its world at 667×375), docs.
