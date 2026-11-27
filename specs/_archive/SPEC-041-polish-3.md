# SPEC-041 — Polish 3: richer Upgrades tab, a map preview on every level card, the ninja band and overalls look right

Status: done (merged by "Merge SPEC-041", see git log)
Complexity: M
Branch: SPEC-041-polish-3
Decided by: Andrei (2026-11-26): do these four items. Layouts, numbers and wording: Claude.

## Description
1. **Upgrades tab looks sparse:** an empty area under the cards on desktop, room under the effect text on the phone (backlog, SPEC-009). Make it a real "level up" page:
   - bigger pictures;
   - level pips;
   - the effect now → next;
   - a clear "max" state;
   - a note that upgrades help players only.
2. **A picture on the level card.** Before a level, the card shows the title, the type and its line (backlog: "a short intro card with a picture and a sentence before every level"). Add a picture that needs no new art: a small **top-down preview of this very level** (the real map: walls, bushes, ponds, both houses), drawn by the game, plus the boss face on level 20.
3. **Ninja band:** the 3D headband is red, its wardrobe picture is black with red tails. The 3D one follows the picture (SPEC-027 backlog).
4. **Overalls straps** poke through a resting cape (`cape` / `magiccape`) at the back. Shorten the strap arcs so they end above the cape (SPEC-027 fix-check MEDIUM).

## Context
(Pre-flight against master; match names.)
- **Upgrades:**
  - `src/client/ui/character/upgrades.js` (`upgradeCards`, `upgradeCardsPhone`, `upgradeCardsDesktop`);
  - `UPGRADES` (`step`, `prices` [150, 300, 450], `upgTop`), `playerBonus`;
  - icons `shop_fast_feet`, `shop_long_items`, `shop_quick_help`;
  - "Get for 🪙" wording (SPEC-033).
- **Level card:**
  - `drawLevelCard()` in `src/client/ui/map.js` (`card:title`, `card:type`, `card:line`, `card:story`, `card:play`);
  - the level generator is deterministic per level (`src/core/level/`, `WORLD_SEED`);
  - the minimap drawing is in `src/client/ui/minimap.js` (`drawMinimap`, cached by level key);
  - boss data `BOSSES`, `stop_boss` art.
- **Ninja band:** `HATS` id `headband` in the wardrobe data; 3D accessory in `src/client/three/look3d.js` / `characters.js`; picture `hat_ninja`.
- **Overalls:** `PANTS` id `overalls` (bib + two straps over the jacket, SPEC-027); cape patterns `cape` / `magiccape`; `tests/look3d.spec.js`.

## Acceptance criteria
### 1. Upgrades tab
1. **Each upgrade card shows:**
   - its picture at about 1.6× today's size;
   - its name;
   - **level pips** (●●○ for level 2 of 3);
   - **the effect now → next** in plain words with numbers: "Speed +3% → +6%" / "Items last +15% → +30%" / "Help up in 2.7 s → 2.4 s" (en/es/pt/ru, Claude);
   - the price "Get for 🪙 N", or **MAX** with a gold ribbon (`ribbon_star`) when bought out.
2. **Under the cards,** one line: "Upgrades help players only, not the bots." (four languages).
3. **No empty block** on desktop or phone: the cards use the height. Fits at 568×320, 667×375 and 1280×720 in four languages with the font scales the tests use.
4. **Buying an upgrade** shows a short sparkle on its card (the existing `fx_sparkle`).
5. Tests in `menus.spec`: pips match the save, now → next numbers come from `UPGRADES` / `playerBonus`, MAX at the top level, fits.

### 2. Level card preview
6. **Preview picture:**
   - the level card draws a **top-down preview** of the level it opens: the real generated map for that world and number, with walls, bushes, trees, ponds and water, the kids' house and Dad's house, in the minimap's colours on a paper frame;
   - no characters;
   - cached per level, built the first time the card opens; generating it never changes game state or the level's random sequence (same seed, same level after the preview).
7. **Level 20:** the preview has the boss face (`stop_boss` or the boss look) over Dad's house.
8. **Layout:**
   - desktop: preview on the left, title / type / line on the right, buttons below;
   - phone: preview above the line, or left of it when there is room.
   - Fits at 568×320, 667×375 and 1280×720 in four languages; locked levels show their preview dimmed with the padlock.
9. Tests: the preview's cells equal the generated level's cells (wall / free / bush / water counts) for a sample of levels in every world; opening the card twice uses the cache; a level played after opening its card is identical to one played without it.

### 3. Ninja band
10. The 3D `headband` is a black band with two short red tails at the back, matching `hat_ninja`. `look3d.spec` checks its colours; the wardrobe preview shows it.

### 4. Overalls straps
11. The strap arcs end above the cape line (about 0.55–0.6 π instead of today's longer arc, Claude), so no strap shows through `cape` or `magiccape` from any camera angle in the wardrobe preview or in play. `look3d.spec`: with overalls + cape, no strap vertex lies behind the cape surface.

### Docs
12. Update:
    - `docs/game-design.md`: level card preview, upgrades page;
    - `docs/architecture.md`: preview cache;
    - `specs/BACKLOG.md`: strike the four lines, add "upgrade texts and preview layout — Claude, check with the kids".

## Implementation steps (TDD: failing test first in each)
1. Upgrades: tests → layout, pips, now → next, MAX, note, sparkle.
2. Preview: tests → offscreen map drawing from the level data, cache, card layout, boss face.
3. Ninja band colours.
4. Overalls straps.
5. Phone screenshots (667×375: Upgrades, a level card, level 20 card, wardrobe with overalls + cape and the ninja band); docs.
