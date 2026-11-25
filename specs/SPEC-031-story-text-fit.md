# SPEC-031 — Story and comic text fits every screen: the font scales down, never covers the picture

Status: ready
Complexity: M
Branch: SPEC-031-story-text-fit
Decided by: Andrei (2026-11-24): on small screens the story text takes more and more room and covers the picture; the font must get smaller as the screen gets smaller. The scale formula and the sizes are Claude's.

## Description
On the phone, the text sizes are fixed CSS pixels with a floor (`PHONE_TEXT.main` 15, `MENU_LOOK.story.phoneText` 18, `MENU_LOOK.scene.phoneText` 17). The interface layer itself scales with the screen (`UH = PHONE_UI_H`, `cpx`). The smaller the phone, the bigger a share of the screen the same text takes. On the Story screen and on comic pages, the text grows into the picture.

The fix has two parts:
- text on the story and comic screens scales with the screen, with a lower floor;
- the layout guarantees the picture and the text never overlap: the text box is measured first, the picture gets the rest, and nothing is drawn over it.

## Goal
On every screen, from a small phone to a desktop window:
- the comic picture is fully visible;
- the caption sits next to it or under it, readable;
- the caption is smaller on smaller screens.

## Context
(Pre-flight against master: runs after SPEC-030; match names.)
- **Story screen, chapters page:**
  - picture left (`MENU_LOOK.story.pic` 0.47 of the width, capped by `mh * 1.4`), text right;
  - `noteRows(text, size, min, maxW, lines)` shrinks to `min` and then **cuts rows** (`rows.slice(0, lines)`): text can be lost silently;
  - `rowsAt(...)` draws the rows;
  - bubbles (SPEC-026) are drawn on the picture.
- **Scene screen (intro, boss scenes, ending, tutorial pages):**
  - phone: picture left (`scene.phonePic` 0.6), caption right;
  - desktop: caption under the picture (`scene.lines` 3).
- **Sizes:**
  - phone uses `cpx(...)` (CSS px → UI px) and floors `minPx("main")` = 15 CSS px;
  - desktop draws on the fixed logical canvas `W × H`, scaled uniformly by `fit()`, so desktop text already scales with the window.
- `PHONE` is decided once at start (touch and short side ≤ `PHONE_MAX_SHORT_SIDE` 500).
- Fit and overflow test hooks exist: `textOverflows` (SPEC-028), the fit checks used by the phone tests.

## Out of scope
- Other screens (map, level card, Character): only report in the final report whether they show the same problem at the small sizes; no changes.
- New art or new texts, except shortening a text that cannot fit at the floor (AC 5).

## Acceptance criteria
1. **Screen scale for text.** On the phone, story and scene text uses a screen scale `s = clamp(min(CSS_W / 844, CSS_H / 390), 0.72, 1.1)`, where 844×390 is a mid-size phone in landscape (Claude's reference).
   - Base sizes are multiplied by `s`: story text, scene caption, bubble text, the chapter title.
   - Applied through one helper (e.g. `textScale()`), not per call site.
   - Desktop and tablet are unchanged: their canvas already scales with the window.
2. **Lower floor for these captions only:**
   - story text, scene captions and bubbles may shrink to **12 CSS px** (`CFG.STORY_TEXT_MIN`);
   - all other phone text keeps the existing floors (`PHONE_TEXT`).
   - The phone text tracker (`noteText`) records these under their own category, so other phone tests' floors are untouched.
3. **Measure first, then lay out. The picture is never covered.**
   - **Chapters page and phone scene:** the caption box gets its width from the layout; the font shrinks until the whole text fits in the box's height.
     - If it still doesn't fit at the floor, the picture's share of the width shrinks step by step, down to **40%** of the content width, and the text box grows.
     - If it *still* doesn't fit, see AC 5.
   - **Desktop scene:** the caption takes up to `scene.lines` rows, measured first; the picture gets the rest of the height.
   - **Nothing is cut silently:** `noteRows` no longer drops rows. When the rows don't fit, the caller gets a "doesn't fit" result and applies the steps above.
   - **Never overlap:** the text box and the picture box (frame included) never intersect. Bubbles stay inside the picture.
4. **Test sizes:** run in all four languages, on the Story screen (every chapter, including locked ones) and on every scene page (intro, the four boss scenes, ending, tutorial pages A–C).
   - **Phone (CSS px):** 568×320, 640×360, 667×375, 740×360, 844×390, 932×430.
   - **Desktop window:** 960×540, 1280×720, 1920×1080.
   For each case:
   - no text box intersects the picture box;
   - every word of the text is drawn (row text joined = source text);
   - the font is ≥ the floor;
   - on the phone, the font at 568×320 is smaller than at 932×430.
   Two screenshots go in the report: 568×320 and 844×390, Story "How it began" and tutorial page A1, in en and pt.
5. **A text that cannot fit even at the floor with the picture at 40%:**
   - **en / es / pt** (Claude's translations): shorten the wording and keep the meaning;
   - **ru** (Kostya's words): shorten only the minimum, note it in the report and in `specs/BACKLOG.md` ("shortened for small phones — check with Kostya").
   The AC 4 test must pass for every text.
6. Bubble text (SPEC-026) uses the same scale and floor; the bigger fallback bubble still never leaves its panel.

### Docs
7. Update:
   - `docs/game-design.md` / `docs/architecture.md`: the text scale and the floor for story captions;
   - `specs/BACKLOG.md`: any text shortened.

## Implementation steps (TDD: failing test first in each)
1. The size-matrix test (AC 4) goes red at the small sizes.
2. `textScale()` and `STORY_TEXT_MIN`; apply them on the story, scene and bubble text.
3. `noteRows` reports "doesn't fit" instead of cutting; the chapters page and phone scene apply the shrink steps (font, then picture share down to 40%); desktop scene: measure the caption first.
4. Shorten any text that still fails (AC 5).
5. Screenshots; the report line on other screens; docs.

## Numbers
- Reference phone 844×390.
- `s` clamped to 0.72–1.1.
- `STORY_TEXT_MIN` 12 CSS px.
- Picture share: at least 40% of the content width.
