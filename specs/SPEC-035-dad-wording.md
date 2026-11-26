# SPEC-035 — "Dad" and "kids" instead of "the Big One" in every text

Status: ready
Complexity: S
Branch: SPEC-035-dad-wording
Decided by: Andrei (2026-11-26): the How to play rules still say "the Big One"; the texts should speak about the kids and Dad, as the story does. Wording in all four languages: Claude.

## Description
Since SPEC-022 the Big One is Dad from Kostya's story (default name Dad / Papá / Papai / Папа), but some texts still use the old game word:
- the rules: "the Big One" / "el Grandote" / "o Grandão" / "Большой", "Friends";
- the lose title "The Big One won...";
- the wardrobe column title "Big One".

Rewrite them with **Dad** and **the kids**. Nothing else changes.

## Context
(Pre-flight against master 7d7b188; match names.)
- `src/i18n.js`:
  - `rules: n => [...]` per language;
  - `lose` ("The Big One won..." / "Ganó el Grandote..." / pt / "Большой победил...");
  - `big` ("Big One" / "Grandote" / "Grandão" / "Большой", used as the Big One column title in `src/client/ui/character/wardrobe.js` `LOOK_TITLES`);
  - `ruleTiptoe` already says Dad.
- The Big One's current name: the names module (`nameOf(big)`, default `Dad` per language, SPEC-022).
- Careful in Russian: "Большой дом" in the level-type lines means "a big house", not the character — keep it.
- Kostya's `STORY` texts are not touched.

## Acceptance criteria
1. **Rules (How to play)** become, in this order (`{RESCUE_TIME}`, `{n}`, `{REST_TIME}` as today; line 7 stays `ruleTiptoe`):

   **en**
   1. Sneak up BEHIND Dad and hug him: he loses an angry heart
   2. If Dad SEES you (yellow beam), he pushes you and you fall down
   3. Other kids run over and stand next to you for {RESCUE_TIME} seconds to help you up
   4. If nobody helps you up within {n} s, you go home to rest for {REST_TIME} s
   5. Bushes hide you. The kids' house is safe: Dad can't get in
   6. Grab items: speed boots, invisibility, shield — and a banana Dad slips on!

   **es**
   1. Acercate a Papá POR DETRÁS y abrazalo: pierde un corazón enojado
   2. Si Papá te VE (rayo amarillo), te empuja y te caés
   3. Los otros chicos vienen y se quedan {RESCUE_TIME} segundos al lado tuyo para ayudarte a levantarte
   4. Si nadie te ayuda a levantarte en {n} segundos, te vas a casa a descansar {REST_TIME} segundos
   5. En los arbustos no te ve. La casa de los chicos es segura: Papá no puede entrar
   6. Agarrá cosas: zapatillas veloces, invisibilidad, escudo ¡y una banana para que Papá se resbale!

   **pt**
   1. Chegue POR TRÁS do Papai e dê um abraço: ele perde um coração bravo
   2. Se o Papai te VÊ (raio amarelo), ele te empurra e você cai
   3. As outras crianças vêm e ficam {RESCUE_TIME} segundos do seu lado para te levantar
   4. Se ninguém te ajudar a levantar em {n} s, você vai para casa descansar {REST_TIME} s
   5. Nos arbustos ele não te vê. A casa das crianças é segura: o Papai não entra
   6. Pegue itens: botas rápidas, invisibilidade, escudo — e uma banana para o Papai escorregar!

   **ru**
   1. Подкрадись к папе СЗАДИ и обними — у него минус злое сердечко
   2. Папа увидит тебя (жёлтый луч) — толкнёт, и ты упадёшь
   3. Другие дети подбегают и стоят рядом {RESCUE_TIME} сек — ты снова в игре
   4. Никто не помог встать за {n} сек — идёшь домой отдыхать {REST_TIME} сек
   5. В кустах папа не видит. Домик детей — безопасная зона, папа туда не зайдёт
   6. Собирай предметы: сапоги-скороходы, невидимку, щит — и банан, на котором папа поскользнётся!
2. **Lose title** uses the Big One's current name (default Dad / Papá / Papai / Папа):
   - "{name} is still grumpy…" / "{name} sigue enojado…" / "{name} ainda está bravo…" / "{name} всё ещё сердится…".
   - The subtitle is unchanged.
3. **Wardrobe column title** (`big`): "Grumpy dad" / "Papá gruñón" / "Papai bravo" / "Злой папа". The name field under it is unchanged.
4. **No other player-visible "Big One".** No player-visible string in `src/` names the character "Big One" / "Grandote" / "Grandão" / "Большой" (any case form: Большого, Большому, Большим) any more. Kostya's `STORY` texts and "Большой дом" (a big house) are excluded.
   - A test greps `I18N` (all keys, all languages) and fails on a hit.
   - Comments and code identifiers (`big`, `BIG_*`) stay as they are.
5. Fits: How to play at 568×320, 667×375 and 1280×720 in all four languages, with the font scales the tests already use (SPEC-033), and the lose screen title at the same sizes.
6. Docs:
   - `docs/game-design.md`: the rules lines and the lose title, if quoted there;
   - `README.md`, if it quotes them;
   - `specs/BACKLOG.md`: "es/pt/ru rule wording — Claude, check with native speakers".

## Implementation steps (TDD: failing test first)
1. The grep test (AC 4) and the wording test (AC 1–3) red.
2. Change the strings.
3. Fit tests (AC 5).
4. Docs.
