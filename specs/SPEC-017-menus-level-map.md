# SPEC-017 — Minimal home screen, level map, level card, story screen, one shop

Status: ready
Complexity: L
Branch: SPEC-017-menus-level-map
Decided by: Andrei (2026-11-22): the home screen is minimal — progress, available bonuses (bonus worlds and owned items) and buttons; **Play** opens a level map, one page per world, with navigation between the 4 main and 2 bonus worlds at the top, like level maps in Angry Birds or Red Ball; tapping a level opens a small level card; **Story** shows the comic and a short description for the whole story and for each world; **Shop** holds both the outfit setup and the purchases. Layout details, texts, sizes, what the placeholders look like: Claude (spec author).

## Description
Today the menu is one crowded screen: world cards, level arrows, players, skins, shop, language, sound. After this spec:
- **Home**: the title, a small progress line, a row of bonus badges (Beach and Winter locked/open; coins and the items you own), and three big buttons — **Play**, **Story**, **Shop** (plus Online if SPEC-013 has landed). Language and sound are small icons in a corner.
- **Level map** (after Play): a tab bar at the top with the six worlds (bonus ones with a lock until open); below, the selected world's page: a drawn background in the world's colours and 20 level stops along a winding dotted path, each with its number and 0–3 stars, locked ones with a padlock, the next level gently bouncing, level 20 bigger with a "boss" badge. Swipe or arrows switch worlds.
- **Level card** (tap a stop): world · level, the level type, best stars, one sentence about the level, and **Play** (on computers also the 1/2 players choice). A 📖 button opens that world's story chapter.
- **Story**: chapters — "How it began", one per world (main worlds, then bonus), "How it ended" (shown after the School's level 20). Each chapter: a comic picture and a short text. Pictures are placeholders (a paper frame with a pencil doodle and "Comic coming soon") until art arrives; the texts come from `claude/story.md` (Kostya's words, shortened only where needed).
- **Shop**: one screen with tabs — **Items** (gloves, kisses, kits…), **Wardrobe** (today's skins screen: Player 1 / Player 2 / the dad, names, the friends' names; plus paid clothes if SPEC-009 landed), **Upgrades** (if SPEC-009 landed). The separate Skins button goes away.
- **Win screen**: Next level · Map · Shop.

## Goal
- A 6-year-old gets from opening the app to playing in two taps (Play → level stop → Play on the card, or Play → the bouncing next level).
- Every screen works on desktop (960×640) and phone (667×375 … 932×430) with SPEC-005 sizes (buttons ≥ 44×44 CSS px, gaps ≥ 8).
- The look is minimal and ready to be skinned with the notebook art later (all colours and paddings in one place).

## Context
(Pre-flight first: names below are from before SPEC-007…011; match them to the code that is there.)
- Modes today: menu, skins (+ names/friends screen), shop (cards; tabs if SPEC-009), play, pause, win; desktop and phone layouts (`UW/UH`, `PHONE`, `fz`/`c` helpers); world cards and level ◀ ▶ from SPEC-006 / SPEC-016; `progress.worlds`, `bonusUnlocked()`, `progress.lastWorld`; `inv` (mittens, mega, kisses, rescues); outfits and names screens (SPEC-003); shop items (SPEC-004/007); online menu (SPEC-013, if landed); `drawStar`, `addButton`, `fitText`.
- Level types and their names (`I18N.*.types`), banner, `WORLD_TYPES`.

## Out of scope
- The notebook/comic art itself (the art spec will skin these screens and replace placeholders with pictures).
- Boss rules, cut-scenes before levels (the story screen is read on demand).
- New items or economy changes.

## Acceptance criteria
### Home
1. Shows: title; progress "⭐ s / 240" (main worlds) and how many worlds are finished; bonus badges — Beach and Winter (🔒 or open), coins, and owned items with counts (only those > 0); buttons Play, Story, Shop (+ Online if present); small language and sound icons. Nothing else. → `tests/menus.spec.js` "home is minimal"
2. Two players: the old 1/2 choice moves to the level card on desktop; phones stay one player (SPEC-005).

### Level map
3. Tab bar with six worlds in story order (`MAIN_WORLDS`, then `BONUS_WORLDS` with 🔒 until open); opens on `progress.lastWorld` (or the first world with an unwon level). Swipe left/right on touch, ←/→ keys, gamepad shoulder buttons switch worlds; tapping a locked bonus tab shows "Win all levels of the main worlds to open". → "the map switches worlds"
4. Page: background drawn from the world's theme colours (ground, a few theme doodles: trees for Park, pitch lines for Field, houses for City, school building for School, palms for Beach, snowflakes for Winter); 20 stops on a winding dotted path (serpentine rows: desktop 4 × 5, phone 4 × 5 or 2 pages if it doesn't fit — keep stops ≥ 44 CSS px); a stop shows its number, 0–3 stars, 🔒 if locked; the next unwon level bounces; level 20 is bigger with a boss badge; a finished world shows a "done" stamp. → "level stops show number, stars and locks"; screenshot check
5. A back button returns home; the coin counter is visible.

### Level card
6. Tap an unlocked stop → card: "World · Level n", type name, best stars, one sentence for the type (7 types + a boss line for level 20, en/es/ru), Play (+ 1/2 players on desktop), 📖 (opens the world's story chapter), close. Locked stop → "Win level n − 1 first". → "the level card starts the level"
7. Play starts the level exactly as today (same `loadLevel`, banner, phone camera).

### Story
8. Chapters in order: How it began; Park; Football field; City; School; Beach; Winter; How it ended. A world chapter is visible once that world has an unlocked level (bonus chapters once open); "How it ended" after School level 20 is won; hidden ones show 🔒. → "story chapters unlock with progress"
9. Chapter page: picture area (an image from `art/story/<chapter>.webp` if the file exists, otherwise the placeholder) and the text in the current language; ←/→ between chapters. Story texts live in one content file (`story` entries with `{ id, image, text: { en, es, ru } }`), written from `claude/story.md` (the "began" and "ended" chapters in Kostya's words; world chapters one or two sentences each: "The grumpy dads moved into the park. Hug them until they are kind again!" etc.). Texts are kid-friendly, short, plain.

### Shop
10. One shop with tabs Items / Wardrobe / Upgrades (Upgrades only if SPEC-009 landed); Wardrobe contains everything the skins and names screens had (previews, cycling, random, names, friends), working on desktop and phone; the home has no Skins button anymore. → "the shop holds the wardrobe"

### Win screen and flow
11. Win: Next level (same world; after level 20 → the map with the world "done" stamp), Map, Shop. Pause: Continue, Map, Home.
12. All texts en/es/ru (`tests/i18n.spec.js`), every phone button ≥ 44×44 CSS px with ≥ 8 px gaps on all screens (extend the SPEC-005 size test to the new modes), whole suite green, existing gameplay tests moved to the new flow where they used the old menu.
13. Screenshots looked at (throwaway): home, map (each world incl. a locked bonus tab), level card, story chapter (placeholder), shop tabs — desktop and phone 667×375, three languages.

## Implementation steps
1. Pre-flight; tests first for the flows (AC 1, 3, 6, 8, 10, 11).
2. Home and the new mode list (`home`, `map`, `levelCard` overlay, `story`, `shop` with tabs); move the skins/names screens into the Wardrobe tab.
3. Level map: tab bar, serpentine layout helper (desktop/phone), stops, bounce, boss stop, done stamp, swipe/keys/gamepad.
4. Level card, story screen with the content file and placeholders.
5. Win/pause flows; size tests; screenshots; whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value / en | es | ru |
|---|---|---|---|
| `I18N.*.play` / `story` / `shop` / `map` | Play / Story / Shop / Map | Jugar / Historia / Tienda / Mapa | Играть / История / Магазин / Карта |
| `I18N.*.lockedLevel` | Win level ${n} first | Primero ganá el nivel ${n} | Сначала пройди уровень ${n} |
| `I18N.*.lockedBonus` | Win all levels of the main worlds to open | Ganá todos los niveles de los mundos principales para abrirlo | Пройди все уровни основных миров, чтобы открыть |
| `I18N.*.comicSoon` | Comic coming soon | El cómic llega pronto | Комикс скоро будет |
| `I18N.*.chapters` | How it began / How it ended | Cómo empezó / Cómo terminó | Как всё началось / Как всё закончилось |
| `I18N.*.typeLines` | one sentence per level type + boss | | |
| `I18N.*.boss` | Boss | Jefe | Босс |
| `I18N.*.tabs` | Items / Wardrobe / Upgrades | Cosas / Ropa / Mejoras | Вещи / Гардероб / Улучшения |
| sizes | phone buttons ≥ 44×44 CSS px, gaps ≥ 8; level stops ≥ 44 | | |

## Docs to update
`docs/game-design.md` (screens and flow — Andrei's decisions vs Claude's layout), `docs/architecture.md` (modes, map layout helper, story content file, shop tabs), `README.md` (how to start a level, story, shop).
