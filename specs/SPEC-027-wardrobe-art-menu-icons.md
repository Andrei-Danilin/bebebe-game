# SPEC-027 — Every piece of clothing has a picture, seven new clothes, comic icons for Play / Story / Character

Status: ready (needs `art/28_menu_icons.webp` and `art/29_wardrobe_2.webp` from Andrei — see Pre-flight; `art/34_small_icons.webp` optional)
Complexity: M
Branch: SPEC-027-wardrobe-icons
Decided by: Andrei (2026-11-24):
- every wardrobe item gets a picture;
- the seven clothes already drawn on `art/23_wardrobe.webp` but missing from the game are added as new clothes;
- Play, Story and the new Character button get icons in the comic style.
Tiers (prices), names and 3D colours of the new clothes: Claude, check with the kids.

## Description
The wardrobe shows a picture next to the 3D preview only for items with an exact drawing. Today, of the hats, jackets and pants:
- 1 hat (Ninja band), 9 jackets and 5 pants have no picture;
- 7 drawn items (blue zip jacket, red zip jacket, rainbow jacket, purple jacket with a pink cape, trench coat, overalls, striped pants) are not in the game at all.

Andrei generates two new sheets with Gemini (prompts 28 and 29 in the project's art brief):
- the four menu icons;
- the 15 missing clothes.

This spec cuts them into `assets/`, maps every item, adds the seven new clothes and puts the new icons on the home buttons and the Progress tab.

## Goal
- Every hat (except "None"), jacket and pair of pants in the wardrobe shows its picture.
- Seven more clothes to earn.
- The three home buttons carry hand-drawn icons instead of emoji.

## Pre-flight
1. Check that `art/28_menu_icons.webp` and `art/29_wardrobe_2.webp` exist on master.
   - If either is missing, this spec is skipped for now (queue: mark it `pending`, run the next spec, come back after it). If it is still missing then, stop the queue with "waiting for art 28/29".
2. `node scripts/assets.js --debug <sheet>` on each sheet:
   - count the regions;
   - map them in reading order to the names below;
   - if Gemini drew a different order or count, map by looking at each region (the debug output shows boxes). Note any region you could not use in the report.
3. Names from SPEC-026 (Character, Progress tab): match them to master.

## Context
- Art pipeline (SPEC-020):
  - `scripts/assets.json` sources;
  - `mode: "sheet"` cuts a green sheet into regions in reading order;
  - `npm run assets` writes `assets/*.webp`;
  - budget 4 MB total;
  - `tests/assets.spec.js`, `tests/art.spec.js`.
- Wardrobe data in `index.html`:
  - `HATS`, `JACKETS`, `PANTS` with `id`, `price: tierPrice(t)`, 3D `color` / `pattern` / `trim` / `shorts`, `name: N3(en, es, ru)`;
  - `WARDROBE_ART` (slot → id → asset);
  - outfits are saved as indices: **append only, never reorder** (`loadOutfits`);
  - `botOutfit` picks by index modulo the list length;
  - the 3D look comes from `makeLook()` and the kid model; patterns today: plain / hood / stripes / zip / cape / belt; pants: colour + `shorts`.
- Existing unused assets from `23_wardrobe`:
  - jackets: `jacket_blue_zip`, `jacket_red_zip`, `jacket_stripes` (rainbow), `jacket_cape` (purple with a pink cape), `jacket_trench`;
  - pants: `pants_overalls`, `pants_striped` (red with yellow stripes).
- Home buttons (after SPEC-026): `home:play`, `home:story`, `home:shop` (Character). Today they use emoji ▶ 📖 🛒 or `ui_*` art.

## Out of scope
- Pictures for hairstyles and Big One looks: they stay 3D-only in the preview.
- Portuguese names: SPEC-028. If SPEC-028 is already merged when this runs, add `pt` names to the new items too.

## Acceptance criteria
### New art in the game
1. Add `scripts/assets.json` sources:
   - **`28_menu_icons.webp`** (sheet, size `button`): `menu_play`, `menu_story`, `menu_character`, `tab_progress`.
   - **`29_wardrobe_2.webp`** (sheet, size `icon`), in reading order:
     - tops: `jacket_tshirt`, `jacket_orange_stripes`, `jacket_purple_zip`, `jacket_pink_hoodie`, `jacket_teal_zip`;
     - middle row: `jacket_hero_cape`, `jacket_ninja`, `jacket_sailor`, `jacket_raincoat`, `hat_ninja`;
     - trousers: `pants_black`, `pants_red`, `pants_green`, `pants_pink_shorts`, `pants_purple`.

   `npm run assets` passes and the total budget holds.
2. **Home buttons:**
   - the three home buttons draw `menu_play` / `menu_story` / `menu_character` left of their label (the label stays, in every language);
   - the Character screen's Progress tab uses `tab_progress`;
   - the Story buttons on the level card and the Story screen use `menu_story` instead of 📖.
   - Missing art falls back to today's icon (as every SPEC-020 art does).

### Small icons instead of emoji (sheet 34)
2a. **Sheet `art/34_small_icons.webp`** (optional: skip this criterion if it is missing). It is a green sheet in reading order: `ui_friends`, `ui_dice`, `ui_question`, `ui_pencil`, `ui_pack`, `ui_ear`, `ui_map`, `ui_check`, `ui_cross`.
   Each one replaces its emoji where it is drawn on screen:
   - 👥 → `ui_friends`; 🎲 → `ui_dice`; ❓ → `ui_question`; ✏ → `ui_pencil`; 📦 → `ui_pack`; 👂 → `ui_ear`; 🗺 → `ui_map`; ✔ → `ui_check`; ✘ / ✕ → `ui_cross`.
   - Emoji that already have art (🔒 → `padlock`, 🩹, 💋, ⭐, 🪙…) use it too, where the code still draws the emoji.
   - Every replaced spot keeps the emoji as its fallback.
   - A test lists the drawn labels on home, map, level card, Character tabs and the Story screen, and fails on any emoji from this list while its art is loaded.

### Every item has a picture
3. **`WARDROBE_ART` mapping:**
   - the 15 new pictures for: hat `headband` → `hat_ninja`; jackets `tshirt`, `stripes`, `purple`, `pinkhoodie`, `cape`, `ninja`, `sailor`, `raincoat`, `teal`; pants `black`, `red`, `green`, `pinkshorts`, `purple`;
   - and the 7 new clothes below.
   A test walks `HATS` (except `none`), `JACKETS` and `PANTS` and fails on any item without a `WARDROBE_ART` entry whose asset exists.

### Seven new clothes (from art already drawn)
4. **Appended** to the end of their lists. Saved outfits keep their meaning: an old-save fixture loads the same look. 3D colours are taken from the drawing; names and tiers are by Claude:

   | List | id | Picture | 3D look | Tier (price) | en / es / ru |
   |---|---|---|---|---|---|
   | JACKETS | `bluezip` | `jacket_blue_zip` | blue, `zip` | 1 (40) | Blue zip jacket / Campera azul con cierre / Синяя куртка на молнии |
   | JACKETS | `redzip` | `jacket_red_zip` | red, `zip` | 1 (40) | Red zip jacket / Campera roja con cierre / Красная куртка на молнии |
   | JACKETS | `rainbow` | `jacket_stripes` | new pattern `rainbow` (red, orange, yellow, green, blue, purple bands) | 2 (80) | Rainbow / Arcoíris / Радуга |
   | JACKETS | `magiccape` | `jacket_cape` | purple, `cape` with a pink cape | 3 (150) | Magic cape / Capa mágica / Волшебный плащ |
   | JACKETS | `trench` | `jacket_trench` | brown, `belt`, a longer coat hem | 2 (80) | Detective coat / Gabardina de detective / Плащ сыщика |
   | PANTS | `overalls` | `pants_overalls` | denim, new `overalls` style (bib + two straps over the jacket) | 2 (80) | Overalls / Jardinero / Комбинезон |
   | PANTS | `striped` | `pants_striped` | red with yellow vertical stripes, new `stripes` flag | 1 (40) | Striped pants / Pantalón rayado / Полосатые штаны |
5. **New 3D features:**
   - the patterns `rainbow` and the `overalls` / striped pants work in the 3D kid model and in the wardrobe preview;
   - `look3d.spec` covers each one;
   - frame time stays within the SPEC-021 budget (+10%).
6. **Bots:** bot outfits may now pick the new items (`botOutfit` modulo). Tests that pin a bot's look by index are updated, not the rule.
7. Wardrobe paging and the "Clothes: n / m" count on the Progress page (SPEC-026) include the new items. The economy check (`CFG.BALANCE.ECONOMY`, wardrobe totals) is re-run and the report notes the new wardrobe total.

### Docs
8. Update:
   - `docs/game-design.md`: the wardrobe list;
   - `art/README` (or the assets doc SPEC-020 made): sheets 28 and 29;
   - `specs/BACKLOG.md`: "new clothes' names, tiers and 3D colours — Claude, check with the kids".

## Implementation steps (TDD: failing test first in each)
1. Assets:
   - test that the 19 new asset names exist;
   - then `assets.json` entries (after `--debug` mapping), `npm run assets`.
2. Mapping test (AC 3) red → fill `WARDROBE_ART`.
3. New clothes:
   - tests for append-only (old fixture), names in every language, prices;
   - then the data rows;
   - then the 3D `rainbow` / `overalls` / striped pants with `look3d` tests.
4. Home/Progress/Story icons with the fallback tests.
5. Balance run (wardrobe totals), docs, phone screenshots of the wardrobe and home at 667×375.

## Numbers and texts
Tiers as in AC 4 (`WARDROBE_TIERS` unchanged: 40 / 80 / 150).
