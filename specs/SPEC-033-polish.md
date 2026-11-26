# SPEC-033 — Polish after the review: a "How to play" card after the intro, one big panel in Story, softer rules, "Get for 🪙", reset behind the parents' gate, win title room

Status: ready (art `art/36_howto_card.webp` optional — without it the card uses a crop of `tutorial_a`)
Complexity: L
Branch: SPEC-033-polish
Decided by: Andrei (2026-11-26):
- a separate "How to play" card between the intro comic and the tutorial pages;
- Story "How it began" shows one big panel;
- D-1 softer rules wording;
- D-8 "Get for 🪙 N";
- D-12 Reset progress behind the parents' gate;
- D-14 Android Back asks before leaving;
- D-3 a CI font mode for local tests now, the bundled font later;
- D-7 a revert of a merge commit may go straight to master, and a known-good tag can be redeployed;
- D-15 no automatic CI retries.
The win-title fix comes from the SPEC-032 report. Wording in es / pt / ru and the card layout: Claude.

## Description
1. **"How to play" card.** On the first launch the intro comic ends and the tutorial pictures start at once; kids will tap through and miss that a lesson begins. Add a title card between them: a picture, a big "How to play" title, one line, and **Let's learn! ▶** / **Skip**.
2. **Story, "How it began":**
   - the whole four-panel page is too small for the bubble text on phones (SPEC-032 waiver: at 568×320 every bubble overflows onto the art);
   - the chapter page shows **only panel 1, big**, with its bubble; the ▶ button plays the whole comic as today.
3. **D-1, softer rules.** The How to play lines say "he pushes you and breaks your leg" and "you limp home". Change them to falling down and going home to rest; the mechanic and numbers stay.
4. **D-8, "Get for 🪙 N".** Every price shows the coin icon, and the word "Buy" goes away: there are no money purchases, only coins.
5. **D-12, Reset behind the gate.** "Reset progress" leaves the child's Progress page and lives on the grown-ups page (SPEC-025), next to "bring back erased progress".
6. **Win title room.** At 667×375 the title "Dad is kind again!" crowds its subtitle (SPEC-032 report).

## Context
(Pre-flight against master 27e17f3; match names.)
- **First launch:** language screen (SPEC-032) → intro comic (`openScene("intro")`, `seen.intro`) → tutorial (`TUTORIAL_SCENES` = tutorial_a, tutorial_b, tutorial_c, tutorial_pics, tutorial_ready; `seen.tutorial`).
  - Scenes are drawn in `src/client/ui/story.js` (pages `{ art, crop, text }`, bubbles, `drawTutorialFallback`).
  - Practice (SPEC-032) runs the games only; Pictures runs A1…C4.
- **Story chapter "began":**
  - `STORY_ART.began` = `story_start` drawn whole, with `drawBubbles` for all four panels;
  - `MENU_LOOK.scene.panels` (quarters), `scene.bubbles` (boxes as fractions of the whole image);
  - the overflow list is `tests/bubble-overflow.js` (SPEC-032 waiver).
- **Rules text:** `src/i18n.js` `rules: n => [...]` per language.
  - en: "breaks your leg", "you limp home and rest"; es: "te rompés la pierna"; pt: "sua perna quebra"; ru: check the Russian lines too.
  - Other player-visible mentions: grep `leg|limp|pierna|perna|ногу|хрома` in `src/`.
- **Prices:**
  - `I18N.*.buy`, `buyFor(n)`, `tapAgain` ("Tap again to buy");
  - the Items, Upgrades and Wardrobe cards in `src/client/ui/character/*.js`;
  - the tutorial C4 caption "buy all this in Character".
- **Reset:**
  - `armReset` / `confirmReset` / `resetConfirmReady` (`src/client/progress.js`), the button on `src/client/ui/character/progress.js`;
  - the grown-ups page `src/client/ui/grownups.js` (gate, `undoReset`, erase all, save code).
- **Win screen:** `src/client/ui/win.js` (title, subtitle, reward rows).

## Out of scope
- Kostya's story texts (`STORY` text / boss / captions): not reworded. If one says "broken leg", list it in the report and leave it.
- D-11 (fixed 1/60 step): SPEC-034.
- Choosing and bundling a font (D-3, second half): before packaging.
- Economy numbers.

## Acceptance criteria
### 1. "How to play" card after the intro
1. **Order on the first launch:** language → intro comic → **How to play card** → tutorial pictures → practice games → map.
   - The card is a scene page `tutorial_intro` (added before `tutorial_a` in the first-launch flow only).
   - Practice and Pictures from How to play do not show it.
2. **Card layout (Claude):**
   - a big comic title `L().howToPlay` ("How to play" / "Cómo se juega" / "Como jogar" / "Как играть") in the title style;
   - one line under it: "Let's learn how to make the dads kind again!" / "¡Aprendamos a hacer que los papás vuelvan a ser buenos!" / "Vamos aprender a deixar os papais bonzinhos de novo!" / "Давай научимся делать пап снова добрыми!";
   - the picture: `howto_card` (from `art/36_howto_card.webp`, paper mode) if present; else the A1 panel of `tutorial_a` (kid hugging Dad from behind) in the paper frame;
   - buttons: **Let's learn! ▶** (green; "¡A aprender! ▶" / "Vamos lá! ▶" / "Учимся! ▶") → tutorial A1; **Skip** → the same as skipping the tutorial (map, `seen.tutorial`).
3. Tests (`tutorial.spec`):
   - the first-launch order including the card;
   - Skip on the card skips the whole tutorial;
   - Practice and Pictures don't show it;
   - fits at 568×320, 667×375 and 1280×720 in all four languages (SPEC-031 fit rules).

### 2. Story "How it began": one big panel
4. **The chapter page shows panel 1 only:**
   - crop `MENU_LOOK.scene.panels[0]`, as big as the picture area allows;
   - its bubble text ("Oh, what a mess!") inside its bubble (SPEC-032 rules: letters only, inside the drawn bubble);
   - the ▶ corner button plays the whole intro comic as today.
   Other chapters are unchanged.
5. **The waiver goes away.**
   - Remove the "How it began" entries from `tests/bubble-overflow.js`. Delete the file if nothing is left.
   - The bubble test passes at every SPEC-031 size and language with no waiver.
   - Screenshots in the report: 568×320 and 1280×720.

### 3. Softer rules (D-1)
6. **Rules lines.** The How to play rule lines become (en; es / pt / ru the same meaning, Claude):
   - "If he SEES you (yellow beam), he pushes you and you fall down"
   - "If nobody helps you up within {n} s, you go home to rest for {REST_TIME} s"
7. **Nowhere else either.** No player-visible string in `src/` (except Kostya's `STORY` texts, see Out of scope) mentions a broken leg, limping or injury: test greps `I18N` for `leg|limp|pierna|perna|ногу|хрома|cojea|manca` and fails on a hit.

### 4. "Get for 🪙 N" (D-8)
8. **Wording:**
   - `buyFor(n)` → "Get for 🪙 {n}" / "Conseguir por 🪙 {n}" / "Pegar por 🪙 {n}" / "Взять за 🪙 {n}";
   - `buy` → "Get" / "Conseguir" / "Pegar" / "Взять";
   - `tapAgain` → "Tap again to get it" / "Tocá otra vez para conseguirlo" / "Toque de novo para pegar" / "Нажми ещё раз, чтобы взять";
   - tutorial C4 → "Win levels, get coins, and pick all this up in Character!" (and the other languages).
   The 🪙 is drawn as `item_coin` (`EMOJI_ART`).
9. **Every price shows the coin icon:** Items, Upgrades and Wardrobe cards, and the Big One looks. No player-visible "Buy", "Comprar", "Купить" or 🛒 is left (test).

### 5. Reset behind the parents' gate (D-12)
10. **Moved:**
    - "Reset progress" is removed from the Progress page;
    - it is on the grown-ups page (behind the existing gate), with the same safe flow (SPEC-025: confirm at another spot, delayed, undo);
    - "Bring back erased progress" (undo) is right next to it.
    The Progress page layout closes the gap (it is read-only now).
11. Tests (`grownups.spec`, `menus.spec`):
    - no reset control on Progress;
    - reset works from the grown-ups page through the gate;
    - undo restores;
    - the Progress page fits at 667×375 and 1280×720 in all languages.

### 6. Win title room
12. On the win screen the title and the subtitle never overlap and keep a gap ≥ 0.25 × the subtitle size, at 568×320, 667×375 and 1280×720, in all four languages (title shrinks first). Test with the existing text-box hooks.

### 7. Android Back (D-14)
13. **Back on the home screen asks first.** On Android (installed app and browser), the system Back button on the home screen opens a dialog "Leave the game?" with big **Yes** / **No** buttons (en / es / pt / ru, Claude); on desktop the same dialog comes from Escape on home.
    - Yes leaves (the page goes back in history; in the installed app it closes).
    - No keeps playing.
    - Back anywhere else does what Escape / ◀ does there today (map → home, card → map, pause in a level…).
    - Built on `history.pushState` / `popstate`, so one Back = one step.
    - Tests: a `popstate` on home shows the dialog, No keeps home, Yes calls the leave path; a `popstate` on the map goes home.

### 8. CI font mode (D-3)
14. **`PW_FONT=ci` for local tests.** Locally the browser uses the CI runner's fonts (the same family the CI Linux image renders, served from a test-only folder and never part of the site), so text that only misfits on CI shows up locally.
    - Documented in `CLAUDE.md` and `docs/process/` test notes.
    - The site is unchanged.

### 9. Revert and redeploy (D-7, D-15)
15. **Process docs and run templates:**
    - when a deploy breaks the game for kids, a **revert of a merge commit** may be pushed straight to `master`; the Pages workflow tests still gate the deploy;
    - `pages.yml` gets a `workflow_dispatch` input `ref`, so a known-good tag can be redeployed;
    - CI keeps `retries: 0` (flaky tests are fixed at the root).

### Docs
16. Update:
    - `docs/game-design.md`: first-launch flow, How to play card, rules wording, "Get for 🪙", reset place;
    - `README.md`;
    - `docs/reviews/release-readiness.md`:
      - mark decided by Andrei (2026-11-26), as recommended: D-1, D-2 (Capacitor), D-3, D-4, D-7, D-8, D-10, D-11 (→ SPEC-034), D-12, D-14, D-15, D-16 (not now), D-17;
      - still open: D-5, D-6, D-9, D-13;
      - mark RR-54, RR-60, RR-18, RR-70, RR-79 (CI font mode), RR-82 done;
      - the SPEC-025 run decisions confirmed (blur pauses but keeps the sound; Try again on a repeated Oops; the gate waits 3 s after a wrong answer; two reset copies; a release re-downloads the caches; the version label 1.0.0-dev+<hash>);
    - `specs/BACKLOG.md`: "card line and es/pt/ru wording — Claude".

## Implementation steps (TDD: failing test first in each)
1. Card: flow test red → `tutorial_intro` page, layout, fallback picture, `art/36` in `scripts/assets.json` if present.
2. Story "began": bubble test without the waiver red → panel 1 crop on the chapter page.
3. Rules wording: grep test red → texts in four languages.
4. Prices: wording test red → strings, coin icon on every price.
5. Reset: tests red → move to the grown-ups page.
6. Win title: test red → layout.
7. Android Back: tests red → `history` / `popstate` and the dialog.
8. `PW_FONT=ci`, `pages.yml` redeploy input, process docs.
9. Phone screenshots (card, Story began, How to play rules, a Character card price, grown-ups page, win screen, the Leave dialog at 667); docs.
