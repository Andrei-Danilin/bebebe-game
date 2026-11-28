# SPEC-048 — No flashes between screens; the tip card on its own; padding after Dad's hearts

Status: done (merged by "Merge SPEC-048", see git log)
Complexity: M
Branch: SPEC-048-no-flashes
Decided by:
- **Andrei (2026-11-28), from playing on his phone:**
  1. A picture flashes for a split second between screens:
     - after the story "How it began", before the How to play card;
     - after the first part of the tutorial;
     - between the tutorial pictures about the power-ups and about the kisses.
  2. Before level 1 of a world, the level card with its map shows first and the "New here!" picture appears only after it, so for a moment two dialog windows are visible. It doesn't look good.
  3. The "Dad's anger" plate has no padding after the hearts; it needs the same padding as on the left.
- Everything else: Claude (spec author).

## Description
Since SPEC-040, most pictures load per screen (`art()` returns nothing until the picture is decoded). A screen opened before its picture is ready draws a frame without it — a placeholder, the previous layout or an empty frame — and then redraws with the picture. On a phone that frame is visible as a flash.

After this spec:
- a screen appears only when its pictures are ready, and the next screen's pictures are loaded while the current one is shown;
- the "New here!" card is never drawn together with the level card;
- the anger plate has even padding.

## Goal
- No frame of a screen without its main picture, on a phone with an empty cache too.
- Every screen change in the story → tutorial → practice → map → level path looks like one clean change.

## Context
- `src/client/art.js`:
  - `art(name)` (lazy, null until loaded), `artKeep`, `artSweep`, `artLazy()` (`loaded`, `loading`, `bad`), `artDone`, `artFailed`;
  - resident sprites (`ART_RESIDENT`);
  - `STORY_ART`, `TIP_ART`, the tutorial pages (`tutorial-data.js`, `howto_card`).
- `src/client/flow.js`: `showCard`; `tipDue(world)` sets `ui.tip` when the level 1 card of a world shows (SPEC-042 AC); `ui/tip.js` draws the tip card.
- `src/client/ui/story.js`: the story, the How to play card and the tutorial picture pages.
- The HUD plate "Dad's anger" + heart clouds (`HEART_ART`), drawn in the game HUD on desktop and phone.

## Out of scope
- Changing pictures, texts or the order of the tutorial; new art.

## Acceptance criteria
### Pictures before screens
1. **`artReady(names)` and `artPrefetch(names)`** in `art.js`:
   - `artReady` is true when every name is loaded or has failed (a failed picture never blocks: the screen shows its existing fallback);
   - `artPrefetch` starts loading and keeps the pictures for the next screen (they are not swept while waiting).
2. **Every screen that shows a big picture lists its pictures:** story chapters, "How it began", the How to play card, each tutorial page, the practice-game intro, the level card (map preview, world icons), the tip card, the win and lose pictures, the boss card and the ending.
3. **A screen change waits for its pictures:**
   - on a change, the current screen stays on screen, still drawn and still working, until `artReady` for the new screen, but at most `ART_WAIT` (0.6 s). Then the new screen appears in a single frame, with no cross-fade;
   - if the wait runs out, the new screen shows with its fallback, and the picture fades in over 0.15 s when it arrives (never a hard pop);
   - input during the wait goes to nothing: no double taps into the next screen.
4. **Prefetch one step ahead:**
   - "How it began" prefetches the How to play card and tutorial page A;
   - each tutorial page prefetches the next one, and the last page prefetches the practice intro;
   - the level map prefetches the level card pictures of the bouncing next level and the tip picture of its world if `tipDue`;
   - the level card prefetches what the level start needs (the tip, the world's sprites for the 3D scene);
   - the win screen prefetches the next level's card.
5. **No stray frame:**
   - find and remove whatever draws the split-second picture between the story and the How to play card, after tutorial part 1, and between the power-ups page and the kisses page;
   - possible causes to check: a screen drawn for one frame with the previous screen's picture, a page index advanced before its picture, a loading placeholder, the resident "loading" overlay;
   - record the frames of each of these changes on a phone viewport with an empty cache, a 4× CPU slowdown (CDP `Emulation.setCPUThrottlingRate`) and a slow network, and say in the report what caused each flash.

### The tip card on its own
6. **"New here!" never shares the screen with the level card:**
   - the tip card shows **after Play is tapped** on the level card of a world's level 1, while the level loads behind it;
   - the level card closes first, so the tip card is the only dialog, on the dimmed map;
   - OK starts the level; Back / Esc returns to the map, and the tip stays due;
   - the picture is prefetched when the card opens (AC 4), so the tip card appears complete in one frame;
   - the ? button on the level card (SPEC-042) still opens the tip card on its own and returns to the level card;
   - `progress.seen.trick_<world>` is set when the tip card is shown, as today.

### The anger plate
7. **Even padding:** the gap between the last heart cloud and the plate's right edge equals the gap between the plate's left edge and the text, at every heart count (6–12, halves included), on desktop and phone, in all four languages. The plate grows with the content and never overlaps the next HUD element.
8. **Spotted in the same screenshot (Claude):** Dad's red name tag can sit under the team chips (Me / !) at the right edge. When Dad's name tag overlaps the team chips or the mini-map, it is drawn below Dad's feet instead of above his head.

### Tests
9. **Playwright, phone viewport, empty cache, slowed CPU and network** (a debug hook records per frame the screen name and which listed pictures were missing):
   - no frame of a listed screen with a missing picture while `artReady` was reachable within `ART_WAIT`;
   - the story → How to play → page A → page B → page C → practice changes each show exactly one screen change, with no frame of a third screen in between;
   - level 1 of a world with the tip due: level card → Play → the tip card alone (no frame with both) → OK → the level;
   - a failed picture doesn't block: a 404 for `howto_card` shows the card with its fallback after at most `ART_WAIT`;
   - a double tap during a wait doesn't skip a page;
   - the anger plate's right padding equals its left padding (±1 px) for 6, 9½ and 12 hearts, on desktop and phone, in en and ru;
   - Dad's tag never overlaps the team chips.
10. **Docs:** `docs/architecture.md` (screen changes wait for pictures, prefetch), `docs/game-design.md` (the tip card after Play).

## Implementation steps (TDD: failing test first in each)
1. The frame recorder and the failing transition tests; find the flash causes.
2. `artReady` / `artPrefetch`, the picture lists per screen, the wait in screen changes, the prefetch chain.
3. The tip card after Play.
4. The anger plate padding; Dad's tag vs the team chips.
5. Docs; reviews; merge.

## Numbers
| Key | Value |
|---|---|
| `ART_WAIT` | 0.6 s |
| late picture fade-in | 0.15 s |
