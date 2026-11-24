# SPEC-030 — Worlds open one after another; home button icons on the left, labels centred

Status: ready
Complexity: M
Branch: SPEC-030-worlds-in-order
Decided by: Andrei (2026-11-24, after SPEC-026):
- the main worlds open one after another (at first only the Park; finish the Park and the Football field opens, and so on);
- on the home buttons the icon sits near the left edge (a small gap, not touching it) and the label is centred in the button.
Gap size and lock texts: Claude.

## Description
- Today all four main worlds are open from the start (SPEC-006/016: "all worlds open"); only the bonus worlds wait for the four main ones.
- Andrei changes this: **Park → Football field → City → School**, each opening when the previous one is **finished**, i.e. its level 20 (the boss) is won.
- Bonus worlds stay as they are: they open when all four main worlds are finished.
- **Home buttons (SPEC-026/027):** the icon and the label are centred together. Andrei wants the icon at the left with a small gap and the label centred in the whole button.

Andrei may later make only the first world free and the others a one-time purchase (not decided; publishing is parked). This spec **does not add any purchase**. It only keeps the "is this world open" decision in one place, so a later spec could add another reason.

## Goal
- A new player sees one open world and a clear path: finish it, and the next one opens.
- The three home buttons look aligned: icons in one column on the left, labels in the middle.

## Context
(Pre-flight against master: runs after SPEC-027…029; match names.)
- `bonusOpen(world, p)`:
  - true for main worlds;
  - for bonus worlds: `bonusUnlocked(p)` or `worldHasProgress(world, p)`.
- Places that use it today:
  - `selectWorld` and the world arrows;
  - `tapWorldTab` (toast `L().lockedBonus`);
  - `loadProgress` (`lastWorld`), reset, the "continue" world pick;
  - `chapterOpen` (main world chapters open on `progress.worlds[id].unlocked >= 1`);
  - the map's world tabs and the Progress page rows (SPEC-026).
- Level 20 win: `worldComplete(w)` / `worldWins(w)`. The ending scene follows School 20.
- Levels inside a world already open one after another.
- Home buttons: `home:play`, `home:story`, `home:shop` (Character), drawn with `fitButton` (icon + label as one centred text today). Icons come from `menu_play` / `menu_story` / `menu_character` (SPEC-027) or the fallback.

## Out of scope
- Any purchase, price, parental gate or store code.
- Level order inside a world; bonus world rules.

## Acceptance criteria
### Worlds in order
1. **One place decides.** One function `worldOpen(world, p = progress)` replaces `bonusOpen` everywhere (keep `bonusOpen` only if tests import it, as an alias). It returns `{ open, reason }`:
   - `reason` is `"start"` (the Park), `"previous"` (the world before it is finished), `"bonus"` (all four main worlds finished), `"played"` (old save, below), or `"locked"`;
   - a test covers every reason.
2. **The rule:**
   - Park always open;
   - Field open when Park is finished, City when Field is, School when City is;
   - Beach and Winter when all four main worlds are finished (unchanged).
   - "Finished" = level 20 of that world won at least once (`worldComplete`).
3. **Old saves keep what they had.**
   - A world that already has any win stays open (`reason: "played"`), even if the world before it is not finished (the kids played in "all worlds open" times).
   - Nothing that was open becomes closed. A save fixture with wins in Park 3, Field 5, City 1 opens Park, Field and City, but not School.
4. **Locked world tabs** on the level map look like locked bonus tabs (padlock, dimmed).
   - A tap shows a toast: "Finish the Park to open the Football field!" (and the same for each pair; bonus worlds keep `lockedBonus`).
   - Arrows and swipes skip locked worlds, as they skip locked bonus worlds today.
5. **When a world opens** (its previous world's level 20 is won for the first time):
   - after the win screen (and after the story scene if one shows), the map switches to the new world;
   - a short banner: "The Football field is open!";
   - the new world's story chapter opens in the Story screen (`chapterOpen` follows `worldOpen`).
6. **Other places follow `worldOpen`:**
   - the Progress page rows (SPEC-026) show the padlock and the same "Finish the … to open" line for locked main worlds;
   - "continue" (Play from home) never lands on a locked world;
   - Reset progress leaves only the Park open.
7. **Balance, tests, sims:** levels can still be started directly in sim/test mode (the debug API ignores locks, as today for bonus worlds). Tests that opened later worlds through the UI get a progress fixture; the rule is not weakened.

### Home buttons: icon left, label centred
8. **Layout of each home button** (Play, Story, Character):
   - the icon is drawn at the left with a gap of 12% of the button height from the left edge (desktop and phone; Claude's number);
   - it is vertically centred, its size unchanged;
   - the label is centred in the whole button;
   - if a long label (pt, ru) would overlap the icon, it shrinks first (the existing fit), then shifts right just enough to clear the icon plus the gap.
   The three icons line up in one column because the buttons share their left edge.
   Test at 667×375 and 1280×720, in en and pt: icon box left = button left + gap; label centre = button centre (unless shifted); no overlap.
9. The same layout is used wherever these three buttons appear (only home today). Other icon buttons are not changed.

### Docs
10. Update:
    - `docs/game-design.md`: worlds open in order, replacing "all worlds open";
    - `docs/story.md`: if it says the worlds are all open;
    - `README.md`;
    - `specs/BACKLOG.md`: "lock toasts and new-world banner wording — Claude";
    - `claude/publishing-plan` note (in the final report only): `worldOpen` is the hook for a possible paid unlock.

## Implementation steps (TDD: failing test first in each)
1. `worldOpen` tests (every reason, old-save fixture, reset); then the function and replace `bonusOpen` callers.
2. Map tabs, arrows, toasts, the opening moment and banner; Progress rows; continue world.
3. Home button layout tests; then the layout in the home drawing.
4. i18n strings (en / es / pt / ru), phone screenshots (home, map with locked tabs, the new-world banner), docs.

## Numbers and texts
- Icon gap: 12% of the button height.
- New strings in en / es / pt / ru (Claude):
  - `lockedWorld(prev, next)`: "Finish the {prev} to open the {next}!" / "¡Terminá {prev} para abrir {next}!" / "Termine {prev} para abrir {next}!" / "Пройди {prev}, чтобы открыть {next}!" (use the world names with the right article per language);
  - `worldOpened(w)`: "{w} is open!" / "¡{w} está abierto!" / "{w} está aberto!" / "{w} открыт!" (gender per world name where the language needs it).
