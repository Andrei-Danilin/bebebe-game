# SPEC-028 — Português (Brasil): the fourth language

Status: done (merged by "Merge SPEC-028", see git log)
Complexity: M
Branch: SPEC-028-portuguese
Decided by: Andrei (2026-11-24): add Portuguese, the Brazilian variety (pt-BR). Translation: Claude, simple words for kids 6–10 — to be checked by a native speaker (BACKLOG).

## Description
The game speaks English, Spanish (Argentina) and Russian. Add **Português (Brasil)** everywhere a player reads text:
- menus, HUD and toasts;
- rules and the level card;
- the Character screen;
- the names of clothes, looks, bosses, worlds and level types;
- the story chapters, boss scenes, ending and thanks card;
- the comic bubble lines (SPEC-026);
- phone hints.

## Goal
A Brazilian kid can play the whole game, story included, in Portuguese, on a phone, with nothing cut off and nothing left in another language.

## Context
(Pre-flight: runs after SPEC-026 (and SPEC-027 if it is merged); match names to master.)
- `I18N` = { en, es, ru } in `index.html`.
- `const LANGS = ["en", "es", "ru"]`, `setLang`, the globe button cycles `nextLang()`, saved in `bebebe-lang`.
- Name objects:
  - `N3(en, es, ru)` for hairs, hats, jackets and pants;
  - inline `{ en, es, ru }` for `BIG_SKINS`, bosses, worlds and level types;
  - `STORY` texts per language (`captions`, `text`, `boss`, `bubbles`);
  - `ruPlural` for Russian counts.
- `tests/i18n.spec.js` checks that every key exists in every language (and `RULE_ICONS` count).
- Font: `system-ui, "Segoe UI", Arial, sans-serif` (covers ã õ ç á â ê é í ó ô ú à).

## Out of scope
Store pages, translating `docs/` (only `docs/story.md` gets the Portuguese story texts as a section).

## Acceptance criteria
1. `LANGS` = `["en", "es", "pt", "ru"]`:
   - the globe button cycles through all four and shows `PT`;
   - `document.documentElement.lang` = `pt-BR` when Portuguese is on;
   - a save with `bebebe-lang` = `pt` loads in Portuguese.
2. **First launch with no saved language:**
   - a browser language starting with `pt` picks Portuguese;
   - the same rule applies to `es` and `ru`; otherwise English.
   If the game already has such detection, extend it; if not, add it for all four (one small function, tested).
3. **`I18N.pt` has every key of `I18N.en`**, with the same function shapes (counts, names).
   - Portuguese plurals: 1 = singular, everything else plural (0 is plural).
   - `N3` becomes `N4(en, es, pt, ru)` (or the name objects get a `pt` field). No name object lacks `pt`.
   - `i18n.spec` checks all four languages, including `STORY` (`captions`, `text`, `boss`, `bubbles`) and every name list.
4. **Translation voice:**
   - pt-BR, *você*, short simple sentences for kids 6–10, the same playful tone as English;
   - game words kept consistent: hug = abraço, Dad = Papai, kind = bonzinho, angry = bravo, coins = moedas, rescue kit = kit de resgate, air kisses = beijinhos, cupcake = cupcake, Character = Personagem, Progress = Progresso, Shop items = Itens, Wardrobe = Guarda-roupa, Upgrades = Melhorias.
   - Worlds: Parque, Campo de futebol, Cidade, Escola, Praia, Inverno.
   - The default Big One name in Portuguese is **Papai**.
5. **Story in Portuguese.** Translated from the English text, staying close to Kostya's Russian meaning. Bubble lines (SPEC-026):
   - "Nossa, que bagunça!"
   - "Ai, as crianças!"
   - "Cadê meu cupcake?!"
   - "Isso é simplesmente impossível!!"
   Thanks card: "Feito por Kostya e Papai" (check against the current English wording and keep its meaning).
   Add a Portuguese section to `docs/story.md`.
6. **Nothing overflows.** Portuguese runs about 20% longer than English, so:
   - every menu, card, tab, toast and HUD label is checked in Portuguese at 667×375 and 1280×720 with the existing fit checks (shrink-to-fit, then a shorter word if needed — never cut text);
   - the report includes a screenshot set: home, level card, Character → Progress, shop items, wardrobe, story scene, HUD at 667×375.
7. **No other language leaks.** A test switches to `pt`, opens every menu screen and a level, and fails on any text drawn from `en`, `es` or `ru` tables (via the existing text-capture hooks, or a check that every visible string comes from `I18N.pt`). Emoji and numbers are fine.

## Implementation steps (TDD: failing test first in each)
1. Extend `i18n.spec` to four languages; it goes red.
2. `LANGS`, `setLang` (`pt-BR`), detection (test with a mocked `navigator.language`).
3. `I18N.pt` and the names (`N4` / `pt` fields), plurals.
4. `STORY` pt texts and bubbles; `docs/story.md` section.
5. Fit pass at both sizes; fix overflows by shorter wording.
6. Leak test (AC 7); screenshots; docs (`docs/game-design.md` languages line, `README.md`).

## Docs to update
`docs/game-design.md`, `docs/story.md`, `README.md`, `specs/BACKLOG.md`: "Portuguese texts by Claude — check with a native speaker".
