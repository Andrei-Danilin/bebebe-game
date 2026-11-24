# SPEC-029 — Tutorial: funny pictures and two practice games; Dad starts with 5 hearts

Status: ready (the pictures `art/30…33` from Andrei are optional: without them the game keeps the old item crops and uses the fallback tutorial pages)
Complexity: L
Branch: SPEC-029-tutorial
Decided by: Andrei (2026-11-24, after playing):
- Dad starts with **5** hearts: one fewer on every level, the growth stays;
- a short tutorial **after the intro comic on the first launch, with Skip**, replayable later;
- its order and contents as below;
- new pictures drawn with Gemini (prompts 30–33 in the project's art brief), including a banana in our style.

The captions, hints, map size, speeds and timings are Claude's (spec author), to be checked with the kids.

## Description
New players don't know the rules. The tutorial is short and goes in four steps:
1. **Picture page A** (4 panels):
   - sneak up behind Dad and hug him;
   - if he sees you, he pushes and you fall;
   - stand next to a fallen friend to help them up;
   - Dad hears running behind him, so tiptoe.
2. **Practice game 1:**
   - one player, one bot, a slow Dad with **3 hearts**;
   - the bot runs straight at Dad and gets pushed;
   - the player rescues the friend, then hugs Dad three times.
3. **Picture pages B and C:**
   - B: the items that appear (speed boots, invisibility cloak, shield) and the banana Dad slips on;
   - C: air kisses, the rescue kit, warm/mega mittens, and buying them with coins.
4. **Practice game 2:**
   - player + bot + a slow, weak Dad with **5 hearts**;
   - the player has 5 air kisses and 1 rescue kit;
   - lots of bananas and items (shield, invisibility, speed boots) appear.

Then: "You're ready!" and the Park level map with level 1 waiting.

Separately: Dad's hearts drop by one everywhere (`CFG.BIG_HP` 6 → 5).

## Goal
- A child who never played understands hugs, pushes, rescue, tiptoeing, items, the banana, kisses, the rescue kit and mittens in about 3–4 minutes, and cannot lose the tutorial.
- The first real levels feel easier.

## Context
(Pre-flight against master: runs after SPEC-026/027/028; match every name.)
- **Hearts:**
  - `CFG.BIG_HP` 6 (Park 1), `HP_LEVELS_PER_HEART` 4, `HP_PER_WORLD` 1, `BIG_HP_MAX` 12;
  - `bigHearts(world, n)`;
  - boss extras `BOSS_EXTRA_HP` / `MAIN_BOSS_EXTRA_HP`.
- **First launch:**
  - `introDue` / `progress.seen.intro` opens `openScene("intro")`;
  - scenes are `storyPages(id)` pages `{ art, crop, text }` drawn by the scene screen;
  - tests set `window.__bbNoIntro`.
- **Level and gameplay:**
  - `startGame(n)` / `resetWorld(n)`;
  - level types and the generator (`WORLD_TYPES`, `meadow`…);
  - items `boots` / `cloak` / `shield` / `banana` (`SLIP_STUN`);
  - kisses (`KISSES`), rescue kit (`RESCUE_KIT`, keys Q / Shift ⇨, phone button);
  - tiptoe (`TIPTOE_*`, Shift / a light stick tilt, `heardHintTouch`), hearing (SPEC-019);
  - push, `DOWN_TIME`, `RESCUE_TIME`;
  - rewards and progress (`REWARD`, stars), the economy ledger (SPEC-009).
- **Story screen:** has a "How to play" page (`storyPage = "rules"`).
- **Art:**
  - `item_banana`, `item_boots`, `item_cape` come from the old `v1/staff.webp` boxes in `scripts/assets.json`;
  - `icon_shield` comes from `12_icons`.

## Out of scope
- New gameplay rules outside the tutorial (the tutorial's own tuning applies only to the tutorial).
- Voice-over and sound beyond the existing effects.

## Acceptance criteria
### Dad starts with 5 hearts
1. `CFG.BIG_HP` = 5.
   - Every ordinary level has exactly one heart fewer than before (the cap of 12 still applies).
   - Bosses keep their extras on top.
   - A test pins Park 1 = 5, Park 20, Field 1, School 20 (boss).
   - The balance workflow runs on the branch; the report notes the change ("SPEC-029: Andrei, one heart fewer everywhere"). Targets that move because of it are updated to the measured values, never the other way round.

### When the tutorial shows
2. **First launch:** intro comic → tutorial → the Park level map with level 1 highlighted.
   - `progress.seen.tutorial` is set when the tutorial ends or is skipped.
   - An old save that has already seen the intro but has no `seen.tutorial`: the tutorial does **not** open by itself (they already play); it is only offered from the Story screen.
   - Tests skip it the way they skip the intro (`window.__bbNoTutorial`, or extend `__bbNoIntro`), except the tests of the tutorial itself.
3. **Skip:**
   - every tutorial page and both practice games have a **Skip** button (games: in the pause menu and a small corner button);
   - Skip goes straight to the end (the Park map) and sets `seen.tutorial`.
4. **Replay:** the Story screen's "How to play" page gets a **Practice** button that runs the whole tutorial again (Skip works the same; it ends back on the Story screen).

### Picture pages
5. Pages work like the intro comic:
   - 4 panels per sheet, one panel per page;
   - a caption under the panel;
   - Next / Skip and dots;
   - on the phone at 667×375 the caption fits (the scene's existing fit rules).
6. **Art:**
   - `art/31_tutorial_a.webp`, `art/32_tutorial_b.webp`, `art/33_tutorial_c.webp` (2×2 panels each) → `tutorial_a/b/c` in `assets/` (paper mode, like `8_start`);
   - `art/30_items.webp` (green sheet, 11 items in reading order) → `item_boots`, `item_cape`, `item_banana`, `item_mittens`, `item_mega_mittens`, `item_kiss`, `item_star`, `item_coin`, `heart_full`, `heart_half`, `heart_empty`. This replaces every crop from the old `v1/staff.webp`; that source entry is removed from `scripts/assets.json`.
   - **Fallback when an art file is missing:** each panel is built from existing art on paper: the item / effect icons (`icon_*`, `item_*`, `fx_*`) and a kid or Dad figure from the 3D preview or the `story_*` art, with the same caption. A test runs the tutorial with the new art missing and checks every page draws.
7. **Captions** (en / es / ru / pt; English below; Claude's wording, check with Kostya). The control hint on page A4 follows the device: Shift on keyboard, "push the stick just a little" on the phone.
   - **A1:** "Sneak up behind Dad and hug him! Every hug takes away one angry heart."
   - **A2:** "If Dad sees you, he pushes — and you fall down!"
   - **A3:** "A friend fell? Stand next to them to help them up. Friends help you too!"
   - **A4:** "Dad hears running behind him. Close to him, tiptoe! (hold Shift / push the stick just a little)"
   - **B1:** "Speed boots: you run faster!"
   - **B2:** "Invisibility cloak: Dad can't see you!"
   - **B3:** "Shield: Dad can't push you!"
   - **B4:** "Banana! Lead Dad onto it — he slips, and you can hug him from any side!"
   - **C1:** "Air kisses 💋: send one from far away. Dad loses half a heart and blushes!"
   - **C2:** "Rescue kit 🩹: fell down? Get up at once!"
   - **C3:** "Warm mittens: each hug takes 2 hearts. Mega mittens: 3!"
   - **C4:** "Win levels, get coins, and buy all this in Character!"

### Practice game 1 — rescue and hug
8. **Setup:**
   - always one player (also on desktop with two players set), one bot, Dad;
   - a small fixed open map (meadow-like, about half the Park 1 area, the same every time) with the kids' house and Dad's house;
   - no stars, items, bananas or coins.
9. **Dad:**
   - **3 hearts**, slow: patrol and chase at 60% of Park 1 speeds (`TUTORIAL.speedMult` 0.6);
   - hearing on, so tiptoeing matters.
10. **Script:**
    - at the start the bot runs straight at Dad from the front and is pushed (guaranteed: Dad turns to it);
    - the bot stays down **without a timer** until rescued.
11. **Step hints:** a hint banner shows the current step (same style as existing hints; device-specific controls):
    1. "Your friend fell! Run to them and stand close to help them up." (until rescued)
    2. "Now sneak behind Dad — tiptoe close to him!" (until the player is behind Dad within hug range)
    3. "Hug him from behind — 3 times!" (until 3 hugs)
12. **The tutorial cannot be lost:**
    - when the player is pushed, the bot comes to rescue them (normal bot rescue);
    - down time has no limit in the tutorial;
    - if both are down, both stand up at the kids' house after 3 s.
    - When Dad's hearts are gone: the normal "Dad is kind again!" moment, then page B.

### Practice game 2 — items, banana, kisses, rescue kit
13. **Setup:**
    - one player, one bot (normal bot), Dad with **5 hearts**, slow (0.6) and weak: his push cooldown ×2 (`TUTORIAL.pushCooldownMult` 2);
    - the same map.
    - The player gets **5 air kisses and 1 rescue kit for this game only**: the real stock is neither used nor changed.
14. **Lots of items:**
    - bananas and items (boots, cloak, shield) appear much more often than in Park 1: a new one every 3 s while fewer than 6 are on the map (`TUTORIAL.itemEvery` 3, `TUTORIAL.itemMax` 6);
    - at least 2 bananas are on the map most of the time (bananas 40%, others 20% each).
15. **Hints:** one at a time, each shown once until its action has happened at least once (or after 12 s, move to the next):
    - "Grab an item!"
    - "Lead Dad onto a banana!"
    - "Send an air kiss 💋 (key / button)"
    - after the player's first fall: "Use the rescue kit 🩹 to get up!"
16. **Same no-lose rules as game 1.** When Dad's hearts are gone: "You're ready! Let's make the dads kind again!" → the Park level map with level 1 highlighted (on replay: back to the Story screen).

### Nothing leaks into the real game
17. **No effect on progress:**
    - no coins, no stars and no level progress;
    - no economy ledger entries;
    - the real stocks of kisses, kits and mittens unchanged (test: the save before and after the tutorial is equal except `seen.tutorial`);
    - the tutorial's speeds, cooldowns and item rates exist only in `CFG.TUTORIAL` and do not change any real level (a test plays Park 1 after the tutorial and compares its numbers).

### Tests and docs
18. **Tests** (`tutorial.spec.js`):
    - first launch order: intro → tutorial → map;
    - Skip from each step;
    - Practice replay from Story;
    - game 1 script: bot pushed, rescue, 3 hugs, win;
    - game 2: items appear, kisses 5, kit 1, real stock untouched;
    - fallback pages;
    - phone 667×375 screenshots of one page per sheet and both games for the report.
19. **Docs:**
    - `docs/game-design.md`: tutorial, 5 hearts;
    - `docs/story.md`: a short note that the tutorial is not part of Kostya's story;
    - `README.md`;
    - `specs/BACKLOG.md`: "tutorial captions, hints and tuning — Claude, check with the kids".

## Implementation steps (TDD: failing test first in each)
1. Hearts:
   - test for the four pinned levels;
   - then `CFG.BIG_HP` = 5; balance workflow.
2. Flow:
   - tests for the first-launch order, `seen.tutorial`, old saves, Skip, Practice;
   - then the tutorial steps as scenes and two practice modes, reusing the scene screen and `startGame` with a tutorial config.
3. Game 1:
   - script test;
   - then the map, Dad tuning, scripted bot push, untimed down, hints, no-lose.
4. Game 2:
   - item-rate and stock-isolation tests;
   - then the item spawner config, temporary kisses and kit, hints.
5. Art:
   - `scripts/assets.json` entries for 30–33 (`--debug` to map 30's 11 regions in reading order), removing the `v1/staff.webp` entry;
   - fallback pages;
   - asset tests.
6. Captions and hints in all languages (`i18n.spec` covers the new keys); phone fit; docs.

## Numbers and texts
- `CFG.BIG_HP` 5.
- `CFG.TUTORIAL`:
  - `hearts1` 3, `hearts2` 5;
  - `speedMult` 0.6, `pushCooldownMult` 2;
  - `itemEvery` 3 s, `itemMax` 6, `bananaShare` 0.4;
  - `kisses` 5, `kits` 1;
  - `bothDownStand` 3 s, `hintTimeout` 12 s;
  - map about half the Park 1 area.
- Captions: AC 7; hints: AC 11, 15, 16.
