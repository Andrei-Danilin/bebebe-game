# SPEC-049 — Polish 4: small fixes from the backlog, new icons, the map backgrounds with the world houses

Status: ready
Complexity: M
Branch: SPEC-049-polish-4
Decided by:
- **Andrei (2026-11-28):** agreed with every recommendation of Claude's backlog review:
  - a quit first-launch tutorial is offered once more;
  - 568×320 is dropped as a required screen size: the smallest tested size is 640×360, and the smallest iPhone that runs the game (iOS 16.4) is 667×375;
  - the reset button order stays;
  - no Prettier pass;
  - a player-controlled Dad keeps no trick effects;
  - the Beach waves stay a band of wet sand.
- Art: `art/42_icons_extra.webp` (skip, music on, music off). `art/18_map_bg_*` redrawn with the world houses, if they are on master when this spec runs (AC 9).
- Everything else: Claude (spec author).

## Description
A batch of small fixes collected in `specs/BACKLOG.md`, plus three new icons and the level-map backgrounds that show each world's own houses (SPEC-044).

## Goal
- Every item below is fixed and covered by a test.
- The BACKLOG rows it closes are struck through with "done in SPEC-049". The rows Andrei decided "keep as is" are struck through with "decided 2026-11-28: keep".

## Acceptance criteria
### Fixes
1. **A quit first-launch tutorial comes back once** (BACKLOG, SPEC-029 review):
   - if the first-launch tutorial (the pictures or either practice game) was left before its end, the save keeps `seen.tutorialPending` with where it stopped;
   - on the next launch, after the language screen if any, a small card asks "Shall we finish learning how to play?" — **Yes** goes on from that page or practice game, **Later** clears the flag (the tutorial stays under How to play → Practice);
   - it never asks twice;
   - texts in four languages.
2. **Smallest checked screen 640×360:**
   - the fit tests that run at 568×320 move to 640×360;
   - `docs/architecture.md` and `CLAUDE.md` say which sizes are checked and why (iOS 16.4 floor → 667×375; small Android phones → 640×360);
   - code that only exists for 568×320 stays: nothing is removed, it just isn't required any more.
3. **No stutter on 59.94 / 60.05 Hz screens** (BACKLOG, SPEC-034 check, MEDIUM):
   - frame times within ~0.3 ms of a multiple of `STEP / 2` are snapped (or there is a small hysteresis), so the start phase (`CFG.STEP_PHASE`) holds on real panels;
   - test: a simulated rAF at 59.94 Hz and at 60.05 Hz with ±0.5 ms jitter for 120 s has at most 2 frames with 0 or 2 steps (today 43 / 34).
4. **Desktop Back** (BACKLOG, SPEC-033 check, MEDIUM + LOW):
   - after a refused `window.close`, an Alt+← or a mouse back button no longer reopens the Leave dialog: `arm` ignores modifier and BrowserBack keydowns and pointerup with button > 2;
   - a tap during the 0.6 s close wait cancels the leave;
   - tests for both.
5. **The How to play card picture:** re-crop `howto_card` in `scripts/assets.json` (or erase the spot), so the small arrow fragment at its bottom left is gone; the picture is not made smaller than today's crop needs.
6. **"… is open!" after a quick retry** (BACKLOG, SPEC-030 fix-check LOW): `startGame` clears `openedWorld` before `leaveLevel()`, so the banner still shows when level 20 is won and Retry is pressed while the win is pending. Test.
7. **New mittens are worn at once** (BACKLOG, SPEC-012 review): `buyGloves` re-dresses the menu kid after a first purchase or a refill of the worn glove (`redress()`). Test.

### Art
8. **`art/42_icons_extra.webp`** → `ui_skip`, `ui_music_on`, `ui_music_off` (sheet mode, left to right):
   - the music note keeps its sound lines and heart; the crossed note keeps its red line;
   - **check the keying:** the white triangles of the skip icon have light green marker strokes inside. If keying leaves holes, fill the inside of closed outlines (a pipeline option for this sprite, e.g. fill enclosed transparent areas with the nearest light colour). Test: no transparent pixels inside the triangles and the bar;
   - `ui_skip` replaces the practice's ⏭ (and leaves the no-emoji test's allow-list, which becomes empty);
   - `ui_music_on` / `ui_music_off` are the home screen's music switch (SPEC-047), replacing its emoji.
9. **The level-map backgrounds with the world houses** (BACKLOG, SPEC-044 art task):
   - run this AC only if master has the six redrawn `art/18_map_bg_{park,field,city,school,beach,winter}.webp` (a commit "art: 18 map backgrounds with the world houses"). Otherwise skip it, keep the BACKLOG row and say so in the report;
   - regenerate the six backgrounds with `npm run assets` (same names, the same `background` size class, each ≤ 250 KB, the art budget of 5 MB);
   - check that the middle stays empty enough for the 20 stops: the map test that checks stops against the background still passes;
   - screenshots of the six maps in the report.

### Backlog housekeeping
10. **Strike through in `specs/BACKLOG.md`:**
    - with "done in SPEC-049": the rows for AC 1, 3, 4, 5, 6, 7, the ⏭ art row and the `18_map_bg` art row (if AC 9 ran);
    - with "decided 2026-11-28: keep": the 568×320 rows (How to play strip, Character screen, Spanish 7th rule at ×1.3, the Russian bubble at ×1.3), the reset button order, Prettier, the SPEC-015 tricks row, the Beach waves row.
    - The Russian short rules row stays: Andrei reads them himself.

### Docs
11. **Docs to update:**
    - `docs/game-design.md`: the tutorial comes back once; the checked screen sizes;
    - `docs/architecture.md`: frame snapping, the Back guard rules.

## Implementation steps (TDD: failing test first in each)
1. AC 3 (frame snapping) and AC 4 (Back).
2. AC 6, AC 7.
3. AC 1 (the tutorial comes back).
4. AC 2 (screen sizes in tests and docs).
5. Art: AC 8, AC 5, AC 9 if the art is there.
6. Backlog housekeeping, docs, reviews, merge.

## Texts
| Key | en | es | pt | ru |
|---|---|---|---|---|
| `tutorialResume` | Shall we finish learning how to play? | ¿Terminamos de aprender a jugar? | Vamos terminar de aprender a jogar? | Доучимся играть? |
| `tutorialResumeYes` / `tutorialResumeLater` | Yes! / Later | ¡Sí! / Después | Sim! / Depois | Да! / Потом |
