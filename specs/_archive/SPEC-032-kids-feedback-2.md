# SPEC-032 — Kids' feedback, round 2: easier sneaking, How to play, clean comic bubbles, language on first launch, own icons everywhere

Status: done (merged by "Merge SPEC-032", see git log)
Complexity: L
Branch: SPEC-032-kids-feedback-2
Decided by: Andrei and the kids (2026-11-25, after playing the SPEC-026…031 build). Every item below is theirs. Claude (spec author) chose the numbers, the toggle behaviour of the tiptoe button and the layouts; those are marked "(Claude)".

## Description
Seven fixes from the kids' play session:
1. **Sneaking is hard on the phone.**
   - Add a **tiptoe button**.
   - Dad must **not always** hear running behind him, and must not snap around instantly.
2. **Home buttons:** the icons sit too close to (even over) the left edge. They need a small gap inside the button.
3. **How to play:**
   - nicer style, bigger icons and a picture;
   - **two separate actions:** look at the explanation pictures, and run the practice games (games only, no pictures).
4. **Story comic bubbles:**
   - the game draws its own white bubble over the drawn one, and it looks bad;
   - write only inside the drawn bubble, with smaller text.
5. **First launch:** choose the language at the very start; English is the default.
6. **Win and lose screens** still say **Shop**: rename to **Character**.
7. **Icons:** the Hugs row on the win screen uses an emoji (🤗). Every emoji still drawn on screen gets art in our style: existing art where we have it, a new small sheet (35) for the rest.

## Redrawn art on master (Andrei, 2026-11-25; checked by Claude)
Five pictures were regenerated and replaced under the same names (commits a9e25e8 and the one after it):
- **`art/31_tutorial_a.webp`:**
  - panel A4 is redrawn without the vertical line through Dad and without words; panels 1–3 are as before.
  - New size 1200×896 (was 1024×765, the same 4:3 shape).
  - **Remove the A4 `erase` circles from `scripts/assets.json`** (SPEC-029 measured them on the old picture; on the new one they would paint over the drawing), then rebuild.
  - Check that the four panel crops (`MENU_LOOK.scene.panels`) still fit the new frame lines.
- **`art/11_win.webp` (`story_win`):**
  - redrawn without the empty frame and without letters;
  - now **4:3 (1200×896) instead of 16:9**;
  - re-measure every crop of `story_win` (the tutorial fallback figures of SPEC-029, the "You're ready!" page) and check the screenshots.
- **`art/9_2_boss_field.webp` (`story_field`):** one field with exactly two goals, at the ends.
- **`art/26_1_bonus_beach.webp` (`story_beach`)** and **`art/26_2_bonus_winter.webp` (`story_winter`):** four different, friendly grumpy dads, both houses, kids hiding; 16:9 as before.

Run `npm run assets` in the first step of this spec and commit the rebuilt `assets/` (budget still ≤ 4 MB). Phone screenshots of the five new pictures in place (Story chapters Field, Beach, Winter; tutorial A4; the "You're ready!" page) go in the report.

## Context
(Pre-flight against master: runs after SPEC-012 and SPEC-025; the code is in ES modules since SPEC-011 — match every name below to the files.)
- **Hearing:** `src/core/hearing.js`:
  - `audible`, `hearNoise` (noise reaches `NOISE_TURN` → he turns in `HEAR_TURN_TIME` 0.15 s, then `HEAR_COOLDOWN` 4.5 s), `bigMark`;
  - numbers `HEAR_*`, `NOISE_*` in `src/core/config.js`.
  - Tiptoe: `TIPTOE_MAX` 0.85 and `TIPTOE_MULT` 0.8 (light stick tilt or Shift; `isRunning`).
- **Phone controls:** `src/client/ui/phone.js` (joystick, 💋, 🩹, pause, art `phone_*`); tutorial hints in `src/client/tutorial.js` and `src/story.js` / `src/i18n.js`.
- **Home buttons:** `src/client/ui/home.js` (SPEC-027 icon at the left, 12% gap).
- **How to play:** `src/client/ui/story.js` (`storyPage = "rules"`, `RULE_ICONS` = ❤ 👀 🤝 ⏱ 🏠 🍌 👣, Practice button → `openTutorial("story")`, which runs the whole tutorial). Tutorial pages: `tutorial_a/b/c` art, `TUTORIAL_SCENES`.
- **Bubbles:** `drawBubbles` in `src/client/ui/story.js`.
  - Today, when the text doesn't fit at its minimum, it draws its own bubble (`MENU_LOOK.scene.own*`: `ownCover`, `ownWobble`, `ownLine`…) over the drawn one.
  - Sizes: `bubbleMin`, `STORY_TEXT_MIN`, `textScale()` (SPEC-031).
- **Language:**
  - `src/client/progress.js` calls `detectLang(saved, navigator.languages, played)` on the very first launch (SPEC-028);
  - `LANGS` en/es/pt/ru;
  - first launch: intro comic → tutorial (`seen.intro`, `seen.tutorial`).
- **Win/lose:** `src/client/ui/win.js`:
  - buttons `"🛒 " + L().shop` (`shopAfterWin`, `shopAfterLose`);
  - reward rows `RW_ICONS` = 🏆 🔁 ⭐ ✨ 🤗 😴.
- **Emoji → art:** `EMOJI_ART` in `src/client/art.js` (drawn by `fillT`/`strokeT` in `src/client/ui/draw.js`). Emoji still drawn as emoji (master 502340b):
  - win: 🤗 🔁 ✨ 😴; HUD rest: 💤; 🎉 (world banner, ending title); 🎁 (bonus unlocked);
  - home: 🌐 (where its art fails), 🔊 🔇 ⛶ (fallbacks);
  - world icons 🌳 ⚽ 🏙️ 🏫 🏖️ ❄️ (`WORLD_ICONS`);
  - over Dad: 💗 💦 🍌💫; minimap: ❗; Progress: 🏁;
  - rules: 👀 ⏱ 👣.

## Out of scope
- Gameplay outside sneaking and hearing; new levels; new story text.
- Audio (its own spec when the files exist).

## Acceptance criteria
### 1. Easier sneaking
1. **Tiptoe button on the phone (Claude: a toggle, easier for kids than holding while steering):**
   - a round button next to 💋 and 🩹 with the footprints icon (`ui_tiptoe` on the phone button frame; fallback 👣);
   - **tap = tiptoe on, tap again = off**; while on it glows and the kid moves at `TIPTOE_MULT` speed even at full stick tilt (silent, `isRunning` false);
   - a light stick tilt still tiptoes as today; the state resets to off at each level start;
   - desktop keys are unchanged (Shift / "/");
   - the tutorial A4 caption and the tiptoe hints on the phone say "tap 👣 to tiptoe" (all four languages).
   - Test: with the toggle on and full tilt, `isRunning` is false and the speed is `PLAYER_SPEED × TIPTOE_MULT`.
2. **Dad doesn't always hear (Claude's numbers):**
   - when the noise reaches `NOISE_TURN`, he turns only with chance `HEAR_CHANCE` **0.6** (the game's seeded random, so sims and tests are repeatable);
   - otherwise he "missed it": the noise resets and a short `HEAR_MISS_COOLDOWN` **1.5 s** follows (the 👂 mark may show; no turn).
3. **The turn is no longer a snap:** `HEAR_TURN_TIME` 0.15 → **0.35 s**.
4. **Tutorial:** practice game 1 keeps `HEAR_CHANCE` 1 so the tiptoe lesson is clear (`CFG.TUTORIAL`).
5. **Balance:** run the Balance workflow on the branch and commit the reports.
   - Targets that move because of 2–3 are updated to the measured values with a note "SPEC-032: Dad hears less (kids)"; never the other way round.
   - The report states careful vs reckless times (the SPEC-019 "sneaking must pay" check), before and after.

### 2. Home buttons: icon inside with a gap
6. **Icon position:**
   - the icon sits fully inside the painted button, its left edge **0.3 × button height** from the button art's *visible* left edge (measured on the painted sticker, not the transparent margin; Claude);
   - icon height 0.8 × button height;
   - the label stays centred and shifts right only if it would touch the icon.
   - Test at 667×375 and 1280×720 in en and pt: icon box inside the visible button box, gap ≥ 0.3 h, no overlap with the label.

### 3. How to play
7. **New layout:**
   - **Rules list on the left** with **art icons** at about 1.6× the text height: ❤ `heart_full`, 👀 `ui_eyes`, 🤝 `shop_quick_help`, ⏱ `ui_timer`, 🏠 `house_kids`, 🍌 `item_banana`, 👣 `ui_tiptoe`; emoji only as fallback.
   - **Picture on the right:** the tutorial page A (`tutorial_a`, all four panels) in the same paper frame as the Story pictures.
   - **Controls lines under them;** on the phone the keyboard line is hidden (touch line only).
   - Phone 667×375: everything fits without overlap (SPEC-031 fit rules).
8. **Two buttons at the bottom right:**
   - **Pictures** (icon `menu_story`): opens the tutorial picture pages A1…C4 as a viewer (Next / Back / dots); the last page and Back return to How to play.
   - **Practice** (icon `menu_play`): runs **only the two practice games**, with no picture pages in between (game 1 → game 2 → back to How to play); Skip works as today.
   - The first launch still runs the full tutorial (pictures and games), unchanged.
   - Tests: Pictures shows 12 pages and returns; Practice starts game 1 directly, then game 2, then returns; the first-launch flow is unchanged.

### 4. Comic bubbles: write inside the drawn bubble
9. **No own bubble:**
   - the "own bubble" fallback is removed (`own*` settings deleted);
   - the game draws only the letters, inside the drawn bubble's white area, with no fill and no outline over the art.
10. **Smaller text:**
    - bubble text max = 0.75 × today's size;
    - it shrinks to fit the bubble, up to **3 lines**, down to `BUBBLE_MIN` (**8 CSS px** on the phone, **9 px** on desktop; Claude);
    - the SPEC-031 screen scale applies.
11. **If a line still doesn't fit at the minimum:**
    - en / es / pt (Claude's): use a shorter line;
    - ru (Andrei's lines): keep, and note it in the report.
12. **Test (size matrix of SPEC-031, all languages, the intro scene and the Story "How it began" page):**
    - every bubble's text box lies inside its measured bubble box;
    - ≥ 95% of the image pixels under the text box are near-white (the drawn bubble);
    - no pixel outside the text box is changed by bubble drawing;
    - two screenshots in the report (Story page at 1280×720 and 667×375).

### 5. Language on first launch
13. **The very first launch** (no save) opens a **language screen** before the intro comic:
    - four big paper buttons with the language names in their own language: English, Español, Português, Русский;
    - **English is highlighted as the default** (Andrei), so Enter / A / tapping the highlighted one picks it;
    - choosing saves the language, then the intro comic and tutorial follow as today.
14. **No auto-detection on first launch:** the screen replaces `detectLang` there (Andrei: default English). Keep `detectLang` only if tests or other code need it, and note it.
15. **Old saves** (any save present) never see the language screen; the globe button keeps working as today.
16. Tests: first launch order is language → intro → tutorial → map; Enter picks English; tapping Português gives pt everywhere; an old save skips it.

### 6. Character, not Shop, on win and lose
17. **Win and lose screens:**
    - the button reads **Character** (`L().character`) with the `menu_character` icon (fallback 🎒) and opens the Character screen on the Items tab, as today;
    - a search over the client code finds no player-visible use of `L().shop` or "🛒" left (or each remaining one is listed in the report with why);
    - `I18N.*.shop` is removed if unused.

### 7. Own icons instead of emoji
18. **Existing art first** (add to `EMOJI_ART` or draw directly):
    - 🎁 `ui_gift`; 🌐 `ui_globe`; 🔊 `ui_sound_on`; 🔇 `ui_sound_off`; ⛶ `ui_fullscreen`;
    - ✨ `fx_sparkle`; 🎉 `fx_confetti`; 💗 `fx_hearts`; 💫 `fx_dizzy`; 💦 `fx_steam_left`;
    - 🔁 `round_restart`; 🏆 `tab_progress`;
    - world icons 🌳 ⚽ 🏙️ 🏫 🏖️ ❄️ → `world_park` … `world_winter`.
19. **New sheet `art/35_icons_more.webp`** (green, reading order): `ui_hug`, `ui_sleep`, `ui_alert`, `ui_flag`, `ui_eyes`, `ui_timer`, `ui_tiptoe`.
    - Mapping: 🤗 → `ui_hug`; 😴 and 💤 → `ui_sleep`; ❗ → `ui_alert`; 🏁 → `ui_flag`; 👀 → `ui_eyes`; ⏱ → `ui_timer`; 👣 → `ui_tiptoe`.
    - Map regions with `node scripts/assets.js --debug 35_icons_more.webp`; small stray strokes are merged or dropped.
    - If the sheet is missing, these keep their emoji (fallback), and the rest of the spec still ships.
20. **Test:** home, map, level card, Character (all tabs), Story, How to play, Pictures, win, lose, pause, HUD and phone controls, with art loaded. Fail on any emoji drawn as text, except an explicit allow-list in the test with a reason per entry (expected: empty or near-empty).

### Docs
21. Update:
    - `docs/game-design.md`: tiptoe button, hearing chance, How to play, language screen, bubbles;
    - `README.md` (controls);
    - the project art brief note (in the report): sheet 35;
    - `specs/BACKLOG.md`: "hearing chance 0.6 and turn 0.35 s, tiptoe as a toggle, icon gap, bubble minimum — Claude, check with the kids".

## Implementation steps (TDD: failing test first in each)
1. Hearing: tests for the chance (seeded), the miss cooldown, the turn time and tutorial chance 1; then the config and `hearNoise`; balance run.
2. Tiptoe toggle: tests; then the phone button, state and hints.
3. Home icon gap: test; then the layout.
4. How to play: tests for the layout, Pictures and Practice; then the screen and the two flows.
5. Bubbles: tests (AC 12); remove the own bubble; new sizes; shorten lines if needed.
6. Language screen: tests; then the screen; drop first-launch detection.
7. Win/lose Character: test; then the buttons and the strings.
8. Icons: the no-emoji test; `EMOJI_ART` and direct art; sheet 35 in `scripts/assets.json`; `npm run assets`.
9. Phone screenshots at 667×375 (home, How to play, Pictures, a comic bubble page, the language screen, win screen, phone controls with the tiptoe button on); docs.

## Numbers
- `HEAR_CHANCE` 0.6 (tutorial game 1: 1); `HEAR_MISS_COOLDOWN` 1.5 s; `HEAR_TURN_TIME` 0.35 s.
- Home icon gap 0.3 × button height from the visible edge; icon height 0.8 × button height.
- Rule icons 1.6 × text height.
- Bubble text max 0.75 × today's size, up to 3 lines; `BUBBLE_MIN` 8 CSS px (phone) / 9 px (desktop).
- Strings (en / es / pt / ru):
  - `pictures`: Pictures / Dibujos / Figuras / Картинки;
  - `tiptoeTap`: "Tap 👣 to tiptoe" / "Tocá 👣 para ir en puntitas" / "Toque 👣 para andar na ponta dos pés" / "Нажми 👣, чтобы идти на цыпочках";
  - language screen title: none (the four names are enough).
