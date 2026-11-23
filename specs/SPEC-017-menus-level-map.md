# SPEC-017 — Minimal home screen, level map, level card, story screen, one shop

Status: ready
Complexity: L
Branch: SPEC-017-menus-level-map
Decided by: Andrei (2026-11-22): the home screen is minimal — progress, available bonuses (bonus worlds and owned items) and buttons; **Play** opens a level map, one page per world, with navigation between the 4 main and 2 bonus worlds at the top, like level maps in Angry Birds or Red Ball; tapping a level opens a small level card; **Story** shows the comic and a short description for the whole story and for each world; **Shop** holds both the outfit setup and the purchases. Layout details, texts, sizes, what the placeholders look like: Claude (spec author).

## Description
Today the menu is one crowded screen: world cards, level arrows, players, skins, shop, language, sound. After this spec:
- **Home**: the title, a small progress line, a row of bonus badges (Beach and Winter locked/open; coins and the items you own), and three big buttons — **Play**, **Story**, **Shop** (SPEC-013 has not landed: no Online button now; SPEC-013's pre-flight adds it here). Language and sound are small icons in a corner.
- **Level map** (after Play): a tab bar at the top with the six worlds (bonus ones with a lock until open); below, the selected world's page: a drawn background in the world's colours and 20 level stops along a winding dotted path, each with its number and 0–3 stars, locked ones with a padlock, the next level gently bouncing, level 20 bigger with a "boss" badge. Swipe or arrows switch worlds.
- **Level card** (tap a stop): world · level, the level type, best stars, one sentence about the level, and **Play** (on computers also the 1/2 players choice). A 📖 button opens that world's story chapter.
- **Story**: chapters — "How it began", one per world (main worlds, then bonus), "How it ended" (shown after the School's level 20). Each chapter: a comic picture and a short text. Pictures are placeholders (a paper frame with a pencil doodle and "Comic coming soon") until art arrives; the texts come from `claude/story.md` (Kostya's words, shortened only where needed).
- **Shop**: the existing tabbed shop (SPEC-009: **Items** and **Upgrades**) gets a third tab, **Wardrobe**, between them: today's skins screen moves into it (Player 1 / Player 2 / the dad, with the SPEC-009 paid clothes — lock, price, try on, buy), plus the names and the friends' names. Tabs: **Items** · **Wardrobe** · **Upgrades**. The separate Skins button goes away.
- **Win screen**: Next level · Map · Shop.

## Goal
- A 6-year-old gets from opening the app to playing in two taps (Play → level stop → Play on the card, or Play → the bouncing next level).
- Every screen works on desktop (960×640) and phone (667×375 … 932×430) with SPEC-005 sizes (buttons ≥ 44×44 CSS px, gaps ≥ 8: `CFG.PHONE_BTN_MIN`, `CFG.PHONE_BTN_GAP`).
- The look is minimal and ready to be skinned with the notebook art later (all colours and paddings in one place).

## Context
State of `master` (after SPEC-006…010 and SPEC-018; SPEC-011 modules and SPEC-013 online have **not** landed — `index.html` is still one file). **SPEC-016 runs first**: it adds `MAIN_WORLDS`, `BONUS_WORLDS`, `bonusUnlocked()`, the Field and City worlds and six world cards; this spec builds on those names.
- **Modes today** (`mode`, `__bb.mode` get/set): `menu`, `play`, `pause`, `win`, `lose`, `skins` (outfits; `skinPanels()`, desktop three columns, phone `phoneSkinCols()` = Player 1 + the Big One), `names` (friends' names; `openFriends()`, `backToSkins()`, name input `closeNameInput`), `shop` (SPEC-009 tabs: `shopTab` = `"items"` | `"upgrades"`, `shopTabs(…)` draws them with ids `tab:<k>`, `switchShopTab()` toggles two tabs on ←/→ and D-pad left/right, `__bb.shopTab` get/set accepts those two; outside the shop `shopTab` resets to `"items"`). `toMenu()` = `leaveLevel()` + `resetWorld` + `mode = "menu"`.
- **Menu today** (SPEC-006 + SPEC-016): world cards `worldCard(w, …)` (button `world:<w>` → `selectWorld(w)`, `__bb.worldCards`), level ◀ ▶ via `changeLevel(d)` (←/→, D-pad left/right; 🔒 if the next level is not open), the type label `typeLabel`, ↑/↓ and D-pad up/down → `cycleWorld(d)`; 1 player / 2 players (Digit1/Digit2, pad A / X·Y); Skins and Shop buttons; `progress.worlds[w] = { unlocked, stars, won }`, `progress.lastWorld`; the total ⭐ counter next to the coins (`totalStars()`).
- **Wardrobe today** (SPEC-003 + SPEC-009): `cycleOutfit(pk, slot, d)`, `cycleBig(d)`, 🎲 `randomOutfit(pk)` (R / pad X; pad Y = Player 2 on desktop); paid items show 🔒 + price, cycling onto one tries it on, "Buy for N" (`I18N.*.buyFor`) then "Tap again to buy" (`tapAgain`, `buyArmed`) buys it (`__bb.buyLook`); not enough coins → `notEnough` + `SFX.out`; leaving with a locked item selected falls back to the last owned one (`endTryOn()`); `bebebe-outfits` never stores a locked item.
- **Inventory and coins**: `progress.coins`; `progress.inv = { mittens, mega, kisses, rescues }`; `progress.owned`, `progress.upgrades` (SPEC-009).
- **End screens**: `endActions("win")` = Next level (`nextLevel`) · 🛒 Shop (advances the level, then the shop) · Menu; after level 20: Menu · Shop with the `worldDone` line; `endActions("lose")` = Try again · Shop · Menu; pause = Play (continue) · Menu (`toMenu`; Q / pad B).
- **Drawing helpers**: `UW`/`UH` (UI size; desktop = 960×640, phone = `CFG.PHONE_UI_H` high), `PHONE`, `cpx(n)` (aliased `c` in `drawOverlayPhone`), `fz(size, cat)`, `minPx(cat)` (`CFG.PHONE_TEXT`), `pText`, `pLabel`, `pButton`, `phoneFrame()`, `addButton(x, y, w, h, text, color, act, size)`, `fitButton`, `fitText`, `label`, `drawStar(x, y, r, filled)`, `drawCoin`, `worldPicture(w, x, y, sz)` (a mini picture from `THEMES[w]`), `hudRects`, `CFG.TEXT_TEST_SCALE`; precedent for "all looks in one place": `CFG.MINIMAP_LOOK`, `CFG.PHONE_SHOP`. Desktop overlay `drawOverlay()`, phone `drawOverlayPhone()`.
- **Starting a level**: `startGame(n)` = `leaveLevel()`, `endTryOn()`, `resetWorld(n)` (→ `loadLevel(curWorld, level)`), `mode = "play"`, `showBanner()`, `camSnap()` (phone camera).
- Level types and their names (`I18N.*.types`), banner `I18N.*.levelIntro`, `CFG.WORLD_TYPES`.
- **Strings that exist**: `play` (Play / Jugar / Играть), `shop` (Shop / Tienda / Магазин), `menu`, `skins`, `itemsTab` (Items / Cosas / Вещи), `upgradesTab` (Upgrades / Mejoras / Улучшения), `friends`, `tapToRename`, `buyFor`, `tapAgain`, `worlds`, `types`.
- **Tests that use the old flow**: about 48 places set `mode = "menu"` (9 files, incl. `resetGame()` in `tests/helpers.js`); `"skins"`/`"names"` in `tests/economy.spec.js`, `tests/names.spec.js`, `tests/phone.spec.js`, `tests/smoke.spec.js`; menu tests in `tests/levels.spec.js` ("the menu shows six worlds…" after SPEC-016, "the menu shows the selected level's type and it fits") and `tests/phone.spec.js` ("tapping a world card selects that world", "tapping the real menu Play button starts a one-player game", "tapping a name on the skins screen opens a big enough input right over it"). Size and fit checks: `tests/phone.spec.js` "every phone button is big enough at W×H" (`PHONE_SIZES` 667×375, 844×390 `@fast`, 932×430; scenes in `PHONE_SCENES`: menu, skins, names, shop, win, lose, pause, …), `tests/economy.spec.js` "the skins screen with locked items fits (desktop 960×640 / phone 667×375)", "the Upgrades tab fits (desktop / phone 667, 844, 932)".
- Concept pictures `art/18_map_bg_*.webp`, `art/20_levelmap_parts.webp`, `art/13_interface.webp`, `art/14_interface.webp` are in the repo for reference only (the art spec will use them); `art/story/` does not exist yet.

## Out of scope
- The notebook/comic art itself (the art spec will skin these screens and replace placeholders with pictures).
- Boss rules, cut-scenes before levels (the story screen is read on demand).
- New items or economy changes.

## Acceptance criteria
### Home
1. Shows: title; progress "⭐ s / 240" (main worlds: `CFG.STARS_PER_LEVEL × levelsPerWorld() × MAIN_WORLDS.length`) and how many worlds are finished (all 20 levels `won`); bonus badges — Beach and Winter (🔒 or open, SPEC-016 `bonusUnlocked()` / kept-open rule), coins (`progress.coins`), and owned items with counts (`progress.inv` entries > 0 only); buttons Play, Story, Shop (no Online: SPEC-013 has not landed); small language and sound icons. Nothing else. → `tests/menus.spec.js` "home is minimal"
2. Two players: the old 1/2 choice moves to the level card on desktop; phones stay one player (SPEC-005; `tests/phone.spec.js` "phones play with one player").

### Level map
3. Tab bar with six worlds in story order (`MAIN_WORLDS`, then `BONUS_WORLDS` with 🔒 until open); opens on `progress.lastWorld` (or the first world with an unwon level). Swipe left/right on touch, ←/→ keys, gamepad shoulder buttons (standard mapping 4/5, in `CFG` like `PAD_KISS`) switch worlds; tapping a locked bonus tab shows "Win all levels of the main worlds to open". → "the map switches worlds"
4. Page: background drawn from the world's theme colours (`THEMES[w]`: ground, a few theme doodles: trees for Park, pitch lines for Field, houses for City, school building for School, palms for Beach, snowflakes for Winter); 20 stops on a winding dotted path (serpentine rows: desktop 4 × 5, phone 4 × 5 or 2 pages if it doesn't fit — keep stops ≥ 44 CSS px, `CFG.PHONE_BTN_MIN`); a stop shows its number, 0–3 stars, 🔒 if locked; the next unwon level bounces; level 20 is bigger with a boss badge; a finished world shows a "done" stamp. → "level stops show number, stars and locks"; screenshot check
5. A back button returns home; the coin counter is visible.

### Level card
6. Tap an unlocked stop → card: "World · Level n", type name, best stars, one sentence for the type (7 types + a boss line for level 20, en/es/ru), Play (+ 1/2 players on desktop), 📖 (opens the world's story chapter), close. Locked stop → "Win level n − 1 first". → "the level card starts the level"
7. Play starts the level exactly as today (same `startGame(n)`: `resetWorld` → `loadLevel`, `showBanner()`, `camSnap()` for the phone camera).

### Story
8. Chapters in order: How it began; Park; Football field; City; School; Beach; Winter; How it ended. A world chapter is visible once that world has an unlocked level (bonus chapters once open); "How it ended" after School level 20 is won (`progress.worlds.school.won[20]`); hidden ones show 🔒. → "story chapters unlock with progress"
9. Chapter page: picture area (an image from `art/story/<chapter>.webp` if the file exists, otherwise the placeholder) and the text in the current language; ←/→ between chapters. Story texts live in one content block in `index.html` (`STORY` entries `{ id, image, text: { en, es, ru } }`; not a separate file: the game must open from disk and a `file://` page cannot fetch one — hard rule 1), written from `claude/story.md` (the "began" and "ended" chapters in Kostya's words; world chapters one or two sentences each: "The grumpy dads moved into the park. Hug them until they are kind again!" etc.). Texts are kid-friendly, short, plain. The image check must not break `file://` or the claude.ai page (missing image → placeholder, no error); `sw.js` precache is unchanged (no `SW_VERSION` bump) unless files are added to it. `tests/i18n.spec.js` also checks every `STORY` text in en/es/ru.

### Shop
10. One shop with tabs Items / Wardrobe / Upgrades (SPEC-009 landed: Items and Upgrades exist; `shopTab` gets `"wardrobe"`, `__bb.shopTab` accepts it, `switchShopTab()` cycles three tabs); Wardrobe contains everything the skins and names screens had (previews, cycling, random, the SPEC-009 lock / try-on / "Buy for N" flow, names, friends), working on desktop and phone; leaving the Wardrobe tab (another tab or out of the shop) ends a try-on like leaving the skins screen does today; the `skins` and `names` modes go away (friends become a sub-page of the tab); the home has no Skins button anymore. → "the shop holds the wardrobe"; the economy wardrobe tests ("locked clothes can be tried on and bought", "random outfit uses only owned items", "the skins screen with locked items fits …") and `tests/names.spec.js` move to the tab.

### Win screen and flow
11. Win: Next level (same world; after level 20 → the map with the world "done" stamp), Map, Shop. Pause: Continue, Map, Home. The lose screen's Menu becomes Map too (Try again · Shop · Map).
12. All texts en/es/ru (`tests/i18n.spec.js`), every phone button ≥ 44×44 CSS px with ≥ 8 px gaps on all screens (`tests/phone.spec.js` "every phone button is big enough at W×H": `PHONE_SCENES` gets home, map, level card, story, shop Wardrobe tab; menu/skins/names scenes go), whole suite green, existing gameplay tests moved to the new flow where they used the old menu (`mode = "menu"` → the new mode, incl. `resetGame()` in `tests/helpers.js`, which also resets the new state: map world/page, open level card, story chapter, shop tab).
13. Screenshots looked at (throwaway): home, map (each world incl. a locked bonus tab), level card, story chapter (placeholder), shop tabs — desktop and phone 667×375, three languages.

## Implementation steps
1. Tests first for the flows (AC 1, 3, 6, 8, 10, 11); `tests/menus.spec.js` uses one shared page (`sharedPage()` + `resetGame()` from `tests/helpers.js`, SPEC-018), one test of it tagged `@fast`.
2. Home and the new mode list (`home`, `map`, `levelCard` overlay, `story`, `shop` with tabs); move the skins/names screens into the Wardrobe tab.
3. Level map: tab bar, serpentine layout helper (desktop/phone), stops, bounce, boss stop, done stamp, swipe/keys/gamepad.
4. Level card, story screen with the `STORY` content block and placeholders.
5. Win/pause/lose flows; size tests; screenshots; whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value / en | es | ru |
|---|---|---|---|
| `I18N.*.play` / `story` / `shop` / `map` | Play / Story / Shop / Map | Jugar / Historia / Tienda / Mapa | Играть / История / Магазин / Карта |
| `I18N.*.home` (pause, back) | Home | Inicio | Главная |
| `I18N.*.lockedLevel` | Win level ${n} first | Primero ganá el nivel ${n} | Сначала пройди уровень ${n} |
| `I18N.*.lockedBonus` | Win all levels of the main worlds to open | Ganá todos los niveles de los mundos principales para abrirlo | Пройди все уровни основных миров, чтобы открыть |
| `I18N.*.comicSoon` | Comic coming soon | El cómic llega pronto | Комикс скоро будет |
| `I18N.*.chapters` | How it began / How it ended | Cómo empezó / Cómo terminó | Как всё началось / Как всё закончилось |
| `I18N.*.typeLines` | one sentence per level type + boss | | |
| `I18N.*.boss` | Boss | Jefe | Босс |
| `I18N.*.itemsTab` / `wardrobeTab` / `upgradesTab` | Items / Wardrobe / Upgrades | Cosas / Ropa / Mejoras | Вещи / Гардероб / Улучшения |
| sizes | phone buttons ≥ 44×44 CSS px, gaps ≥ 8 (`CFG.PHONE_BTN_MIN`, `PHONE_BTN_GAP`); level stops ≥ 44 | | |
| looks | all colours, paddings and map layout numbers in one `CFG` object (like `CFG.MINIMAP_LOOK`) | | |

## Docs to update
`docs/game-design.md` (screens and flow — Andrei's decisions vs Claude's layout), `docs/architecture.md` (modes, map layout helper, `STORY` content block, shop tabs, `__bb` changes), `README.md` (how to start a level, story, shop).

## Pre-flight notes (2026-11-23)
- Context rewritten from the code; the "pre-flight first" note removed. SPEC-011 and SPEC-013 have not landed; SPEC-007…010 and SPEC-018 have; SPEC-016 must be merged before this spec (it provides `MAIN_WORLDS`, `BONUS_WORLDS`, `bonusUnlocked()`).
- Modes listed as they are (`menu`, `play`, `pause`, `win`, `lose`, `skins`, `names`, `shop`); the `lose` screen was missing — its Menu button becomes Map like the win screen's (layout, Claude).
- Helpers renamed to the real ones: the `c` helper is `cpx` (local alias), plus `fz`, `minPx`, `pText`/`pLabel`/`pButton`, `phoneFrame`, `fitButton`, `worldPicture`; `addButton`, `fitText`, `drawStar`, `UW/UH`, `PHONE` confirmed.
- `inv` → `progress.inv = { mittens, mega, kisses, rescues }` (confirmed), coins `progress.coins`.
- Shop: "tabs if SPEC-009" / "Upgrades only if SPEC-009 landed" / "paid clothes if SPEC-009 landed" made definite — the tabbed shop (`shopTab`, `shopTabs`, `switchShopTab`, `__bb.shopTab`) and the wardrobe buy flow (`buyFor`, `tapAgain`, `buyLook`, `endTryOn`) exist; the shop part is now "move the skins + names screens into the existing tabbed shop as a Wardrobe tab".
- Strings: `I18N.*.tabs` → existing `itemsTab`, `upgradesTab` (values match the table) + new `wardrobeTab`; `play` and `shop` already exist with the table's values; `home` added (the pause "Home" button and the back button need it).
- Online: "if SPEC-013 has landed" → SPEC-013 has not landed, no Online button; its pre-flight adds it.
- AC 1: "/ 240" written as `STARS_PER_LEVEL × levelsPerWorld() × MAIN_WORLDS.length` (hard rule 3).
- AC 3: gamepad shoulder buttons named (standard mapping 4/5) and put in `CFG` like `PAD_KISS`/`PAD_KIT`.
- AC 7: "same `loadLevel`" → `startGame(n)` (which calls `resetWorld` → `loadLevel`, `showBanner`, `camSnap`).
- AC 9: "one content file" → a `STORY` block inside `index.html` (a separate file cannot be fetched from `file://`, hard rule 1); missing `art/story/` images fall back to the placeholder; no `sw.js` change; i18n test covers `STORY`.
- AC 10: Wardrobe tab definition matches the SPEC-009 flow; leaving the tab ends a try-on; the tests that move are named.
- AC 12: "extend the SPEC-005 size test" → `tests/phone.spec.js` "every phone button is big enough at W×H" / `PHONE_SCENES`; `resetGame()` must reset the new state (SPEC-018 shared pages); `tests/menus.spec.js` follows the shared-page pattern with one `@fast` test.
- "All colours and paddings in one place" pinned to one `CFG` object (hard rule 3, precedent `CFG.MINIMAP_LOOK`).
- Open for the run (not decided here): how a keyboard / gamepad player picks a level on the map (today ←/→ and D-pad left/right pick levels, and this spec gives ←/→ to worlds); record the choice as "decided during the run, check with Andrei".
- Story source (queue run decision, 2026-11-23): `claude/story.md` is a claude.ai project doc, not in the repo; the run prompt says it is mirrored in the spec text. The run writes the `STORY` chapters from what this spec, SPEC-016 ("Decided by", the neighbourhood: park, football field, city streets, school, the grumpiest dad at the School) and `docs/game-design.md` say, short and kid-friendly, and lists them in `specs/BACKLOG.md` as "decided during the run, check with the kids" so Andrei can replace them with Kostya's exact words.
