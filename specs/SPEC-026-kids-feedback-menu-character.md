# SPEC-026 — Kids' feedback: cheaper rewards, dearer items, a three-button home, the Character screen, words in the comic bubbles

Status: ready
Complexity: M
Branch: SPEC-026-menu-character
Decided by: Andrei (2026-11-24, after playing SPEC-016…022): every number and screen below is his decision. Claude (spec author) proposed only the layout details, the Progress page contents and the English/Spanish bubble wording; those are marked "(Claude)".

## Description
After playing the new menus and story, Andrei wants:
- **Economy:**
  - a level win pays **30% fewer coins**;
  - the **rescue kit** (🩹) costs **50** (was 15);
  - **permanent upgrades** cost **+50%**.
- **Home menu:**
  - only the logo, language/sound in the corner, and **three buttons: Play, Story, Character**;
  - all the stats leave the home screen, so the doodles on both sides of the menu picture show on the phone too, as they do on a big screen.
- **Character replaces Shop:**
  - the old Shop button becomes **Character**;
  - its first page is new: **Progress**. It shows what has been finished, the coins, and what the character has bought and owns;
  - the Items, Wardrobe and Upgrades tabs follow it.
- **Comic bubbles:** the intro comic (`art/8_start.webp`, four panels) has empty speech bubbles. The game writes Dad's lines into them: on the first-launch intro and in the Story screen.

## Goal
- A kid earns a bit less and thinks a bit more before buying.
- The phone home screen looks like the big one: drawing on both sides, three big buttons in the middle.
- Everything a kid wants to know about their progress and their stuff is on one page.
- No comic panel shows an empty bubble.

## Context
(Pre-flight against master: names below are from 3b0de52 — match them to the code.)
- Economy, all in `index.html`:
  - `REWARD` (BASE 15, PER_LEVEL 1, PER_WORLD 10, NEW_STAR 6, PER_HUG 1, FIRST_MIN 5, REPLAY_MIN 3);
  - `RESCUE_KIT` { price: 15, pack: 3 };
  - `UPGRADES.*.prices` [100, 200, 300] ×3;
  - pace targets `CFG.BALANCE.ECONOMY` (SPEC-009) and the Economy section of `scripts/balance.js`;
  - tests in `tests/economy.spec.js`;
  - `scripts/docs-numbers.js` keeps docs numbers in sync.
- Home: `drawHomeDesktop()` / `drawHomePhone()`:
  - the items to remove: the stars pill, the "Worlds finished" pill, the Beach/Winter chips, the coins pill and the install hint (`showInstallHint`, `installHintShown`, `I18N.*.installHint`);
  - buttons `home:play`, `home:story`, `home:shop`;
  - background `menu_bg` (from `art/14_interface.webp`); on the phone today it falls back to plain lined paper (Andrei's screenshot).
- Shop:
  - `MENU_MODES` "shop", `openShop(back)`, `shopTab` ∈ `SHOP_TABS` (items / wardrobe / upgrades), `wardrobePage` (looks / friends);
  - the "Reset progress" button is in the Items tab (arm-to-confirm);
  - `I18N.*.shop` = "Shop" / "Tienda" / "Магазин".
- Story:
  - `STORY[0]` "began" with `captions` (one per panel);
  - `storyPages("intro")` crops the four panels with `CFG.MENU_LOOK.scene.panels`;
  - the Story screen's "How it began" chapter shows the same art.

## Out of scope
- New pictures for the Play / Story / Character buttons and the missing wardrobe pictures: SPEC-027 (uses the existing icons until then).
- Portuguese: SPEC-028 (it translates every string this spec adds).
- Wardrobe tier prices, mittens, air kisses: unchanged (Andrei didn't ask).

## Acceptance criteria
### Economy (Andrei's numbers)
1. **Win reward −30%.**
   - New constant `REWARD.WIN_SCALE: 0.7` multiplies what a win pays:
     - the level base (first win in full, replay half);
     - plus the new-star coins;
     - then `Math.round`.
   - Unchanged: the floors `FIRST_MIN` / `REPLAY_MIN`, the per-hug coins (`PER_HUG`), and the in-level bonus stars (+3 each).
   - Andrei chose this split: −30% applies to the win and the new stars, not to hugs and bonus stars.
   - A test pins the payout of three cases: Park 1 first win, School 20 first win, Park 1 replay.
2. `RESCUE_KIT.price` = **50**, pack stays 3.
3. Every upgrade price ×1.5: `[150, 300, 450]`.
4. **Old saves:**
   - bought items, kits and upgrade levels are kept as they are;
   - nothing is refunded or re-charged;
   - a save fixture from before this spec loads with the same counts.
5. **Balance:**
   - run the Balance workflow on the branch and commit `reports/balance.*`.
   - The pace targets (`CFG.BALANCE.ECONOMY`) are measured with the new numbers. A target that now fails *because of these decisions* is moved to the measured value, with a note "SPEC-026: Andrei's prices". Never move a price to meet a target.
   - The report states the new pace: levels per pack in the Park, levels per upgrade.

### Home: three buttons
6. **Home shows:**
   - the logo;
   - the language and sound buttons (and fullscreen where it exists today);
   - three buttons in one centred column, in this order: **Play** (green), **Story** (pink), **Character** (orange).
   Nothing else: no stars, worlds, bonus chips, coins or install hint.
   Remove the install-hint code and its strings (Andrei: remove it completely) and update the PWA tests that read `installHintShown`.
7. **Same layout on desktop and phone:**
   - the button column is centred and at most 40% of the width;
   - `menu_bg` is drawn so its left and right doodles show;
   - the plain-paper phone fallback is used only when the art is missing.
   Test at 667×375 and 1280×720:
   - the three buttons fit;
   - the outer 25% of the width on each side has no menu control.
   Also take a screenshot at 667×375 for the report.
8. **Keys and labels:**
   - keys stay: Enter/Space = Play, S = Story; the old shop key opens Character;
   - the Character button's label is `I18N.*.character`: "Character" / "Personaje" / "Персонаж";
   - its icon until SPEC-027: the existing `ui_bag` art, else an emoji.

### Character screen
9. **Rename only, no new mode:**
   - the "shop" mode stays (rename only what the player sees);
   - its title and the home button read Character;
   - tabs in order: **Progress** (new, first), Items, Wardrobe, Upgrades.
   Opened from home → Progress. Opened from anywhere else (level card, map coin badge…) → the same tab as today.
10. **Progress page** (layout: Claude). It is read-only; one screen with no scrolling at 667×375 and 1280×720. It shows:
    - **Look:** player 1's look (the same 3D preview as the Wardrobe) with their name.
    - **Coins:** the coins badge.
    - **Stars:** total stars `n / 240`, and "Worlds finished: n / 4".
    - **One row per world** (6: four main, two bonus):
      - world icon, stars `n / 60`, levels done `n / 20`;
      - the done stamp when all 20 are won;
      - a padlock on a locked bonus world, with the existing "opens after the four worlds" wording.
    - **Bag:** owned counts of warm mittens, mega mittens, air kisses and rescue kits (item icons + numbers).
    - **Upgrades:** the three icons with their level `n / 3`.
    - **Wardrobe:** clothes owned `n / total` (hats, jackets, pants, Big One looks; free items count as owned).
    - **Reset progress** moves here from the Items tab, with the same arm-to-confirm and the same effect.
11. Tests (`menus.spec`, `phone.spec`):
    - the Progress numbers equal the save (fixture with mixed progress);
    - the tab order;
    - home → Progress, level card → Items;
    - Reset works from Progress and is gone from Items;
    - no text overflows its box (the existing fit checks) in en/es/ru at both sizes.

### Words in the comic bubbles
12. **Bubbles hold Dad's lines.** The four bubbles of `art/8_start.webp` get Dad's lines (Andrei's lines; English and Spanish by Claude), in panel order:

    | Panel | ru (Andrei) | en | es |
    |---|---|---|---|
    | 1 — messy house | Ох, какой бардак! | Oh, what a mess! | ¡Uy, qué desorden! |
    | 2 — kids knock him over | Ой, дети! | Oh, kids! | ¡Ay, los chicos! |
    | 3 — empty fridge | Где мой кекс?! | Where's my cupcake?! | ¿¡Dónde está mi cupcake!? |
    | 4 — dads' café | Это просто невозможно!! | This is just impossible!! | ¡¡Esto es imposible!! |

    Stored with the story texts as `STORY[0].bubbles[lang][i]`, and written into `docs/story.md` as Andrei's lines.
13. **Where the bubbles sit.** Bubble boxes are kept as fractions of the whole image in `CFG.MENU_LOOK.scene.bubbles`, so the same boxes work for a cropped panel and the whole page. Measured from the white regions of `art/8_start.webp` (1024×765, without the tail; verify with the image):
    - panel 1: x 255–432, y 28–115;
    - panel 2: x 785–940, y 43–130;
    - panel 3: x 132–245, y 412–490;
    - panel 4: x 633–809, y 396–480.
14. **How the text is drawn:**
    - centred in the bubble, dark ink `#1b1b1b`, bold, up to 2 lines, auto-fit;
    - never below the phone's minimum readable size (the size the captions already use as their minimum).
    - If it can't fit at that size, the game draws its own comic bubble over the drawn one: white fill, black wobbly marker outline, a tail pointing the same way, inside the panel, just big enough.
    - Shown in two places: the first-launch intro, and the Story screen's "How it began" (cropped panels or the whole page, whichever that screen shows).
    - Missing art (placeholder) shows no bubbles.
15. Tests (`story.spec`):
    - every intro page reports its bubble text in `sceneInfo` (`bubble`);
    - the text box lies inside the panel;
    - all three languages have 4 lines;
    - a 667×375 screenshot of panel 3 (the smallest bubble) goes in the report.

### Docs
16. Update:
    - `docs/game-design.md`: economy numbers, home, Character/Progress, bubbles;
    - `docs/story.md`: the bubble lines;
    - `README.md`: if it names the Shop button;
    - `docs/architecture.md`: the screen list.
    `scripts/docs-numbers.js` passes.

## Implementation steps (TDD: failing test first in each)
1. Economy:
   - tests for the three payouts, the kit price, the upgrade prices and an old-save fixture;
   - then `REWARD.WIN_SCALE`, `RESCUE_KIT`, `UPGRADES`.
2. Home:
   - tests for the button set, layout bands at both sizes and no stats;
   - then strip the home drawing to three buttons, background fit, remove the install hint.
3. Character/Progress:
   - tests for the tab order, entry tabs, Progress numbers from a fixture and Reset moved;
   - then the tab and the page.
4. Bubbles:
   - tests for `sceneInfo.bubble`, the box inside the panel and 4 lines per language;
   - then `bubbles` data, boxes in CFG, drawing with the fallback bubble.
5. Balance workflow, reports, docs, phone screenshots.

## Numbers and texts
- `REWARD.WIN_SCALE` 0.7; `RESCUE_KIT.price` 50; `UPGRADES.*.prices` [150, 300, 450].
- New strings in en / es / ru:
  - `character`: Character / Personaje / Персонаж;
  - `progressTab`: Progress / Progreso / Прогресс;
  - Progress labels: Bag / Mochila / Рюкзак; Upgrades (reuse the existing one); Wardrobe (reuse); "Clothes: n / m" / "Ropa: n / m" / "Одежда: n / m".
- Andrei's bubble lines: the table in AC 12.

## Docs to update
`docs/game-design.md`, `docs/story.md`, `docs/architecture.md`, `README.md`, `specs/BACKLOG.md`:
- "Progress page layout — Claude, check with the kids";
- "en/es bubble lines — Claude".
