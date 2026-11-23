# SPEC-022 — Dad's anger, bosses and story scenes

Status: ready
Complexity: L
Branch: SPEC-022-anger-bosses
Decided by: Kostya (story, 2026-11-22: angry dads become kind after many hugs and go home; a boss in every world; the grumpiest dad in the School can push several kids at once) and Andrei (2026-11-23: hearts become the dad's **anger**, the win is **"Dad is kind again!"** with the dad smiling and walking home; bosses are stronger and have their own look; story scenes — the start comic on first launch, a picture before each boss, the ending after School level 20). Numbers, timings, layouts, texts: Claude (spec author).

## Description
The game finally tells Kostya's story while you play:
- The Big One is **Dad**. His hearts are his **anger** — red angry heart-clouds that go out one by one with every hug. While angry he has a red face, steam from his ears and a small dark cloud; as his anger drops his face turns pink and the steam turns into hearts. When the anger is gone he smiles, blushes, waves and **walks home** to his messy house; the win screen says **"Dad is kind again!"**.
- **Bosses** on level 20 of Park, Football field and City: the park boss (red tracksuit, whistle), the coach (football kit, ball under his arm), the builder (orange hard hat, safety vest) — more anger and a bit faster. School level 20 is **the grumpiest dad** (shirt over the red t-shirt, loose tie, work bag) with his special power: a **wide push** that knocks back every Little One close in front of him at once.
- **Story scenes**: the start comic (`art/8_start`) on the first launch (skippable, also in Story); before each boss level the first time — the boss picture (`9_1…9_4`) with one sentence; before the first level of a bonus world — its picture (`26_1/26_2`); after School level 20 — the ending (`art/10_end` when it exists, a placeholder until then) and a short "thank you" from the creators.

## Goal
- A 6-year-old understands "hug Dad until he is not angry any more" from the screen alone.
- Bosses feel special but fair; the final boss is the hardest level of the main game.

## Context
(Pre-flight: SPEC-016…021 and maybe SPEC-011 landed; match names.)
- Big One: hearts `big.hp`/`big.maxHp` (halves since SPEC-004), `difficulty(world, n)` (hearts and speeds, difficulty index, `BIG_CHASE_MAX`), states (look/patrol/chase/search, stun, blush, slip, push stand), push (`push()`, one target), win flow (`pendingWin`, final hug animation, win screen with reward lines), HUD hearts bar (drawn heart clouds since SPEC-020), names (`nameFor("big")`, default "Big One"/"Grandote"/"Большой"), dad look `dad` (SPEC-021), costumes.
- Story screen and content file (SPEC-017), art sprites and story pictures (SPEC-020), level map boss stop (SPEC-017/020).
- `claude/story.md` — Kostya's story; bonus worlds have no bosses yet.

## Out of scope
- Bosses for Beach and Winter (not in the story yet: their level 20 is a normal level without the boss badge).
- Voice, music, animated comics.

## Acceptance criteria
### Anger
1. The hearts bar becomes the **anger meter**: same numbers, drawn as angry heart-clouds (full / half / out); label "Dad's anger" (or the dad's name if renamed) — texts below. A hug (or kiss) puts out clouds exactly as hearts were lost before. → existing hug/kiss tests stay green; "the anger meter shows the dad's anger"
2. The default Big One name becomes **Dad / Papá / Папа** (only the default; typed names stay); costume names unchanged.
3. Mood visuals on the dad by anger fraction: ≥ 2/3 — red face, steam puffs, small dark cloud; 1/3–2/3 — orange-pink face, less steam; < 1/3 — pink face, hearts instead of steam. Push/stun/blush/slip visuals keep working on top.
4. **Becoming kind:** when the anger reaches 0 the dad stops, smiles, blushes, hearts burst, he waves and walks to his house door (≤ 3 s, bots and players cheer), then the win screen with the title **"Dad is kind again!"** (bosses: "<Boss> is kind again!"). Rewards, stars and the ledger exactly as now. → "the dad becomes kind and walks home before the win screen"

### Bosses
5. Level 20 of `park`, `field`, `city` is a boss level: boss look (park — red tracksuit, whistle; field — football kit, shin guards, ball; city — orange hard hat, safety vest, road cone in hand) built on the dad model, slightly bigger (`CFG.BOSS_SCALE` 1.1); anger +`CFG.BOSS_EXTRA_HP` (2) over the level's normal hearts (may exceed `BIG_HP_MAX` by those 2); speed +`CFG.BOSS_SPEED` (5 px/s) but never above `BIG_CHASE_MAX`. → "boss levels have their boss"
6. School level 20 is **the grumpiest dad**: shirt over the red t-shirt, loose tie, work bag, the biggest dark cloud; anger +3; **wide push**: when he pushes, every Little One (state `ok`, not shielded) within `CFG.WIDE_PUSH_R` (2.5 cells) in front of him (180°) is pushed too — one big "WHOOSH!" burst and a ring wave; after a wide push he stands `CFG.WIDE_PUSH_STAND` (1.5 s, longer than a normal push stand) — a window to hug him. Shield blocks it for its owner as usual. → "the grumpiest dad pushes several kids at once", "after a wide push he stands longer"
7. Bonus worlds: no boss; the level-20 stop shows no boss badge.
8. Bots handle bosses (no stuck states; they keep distance in front of the grumpiest dad when he is not standing); `npm run balance`: boss levels win in ≥ 2 of 3 seeds within 8 min; School 20 is the slowest main level; report the rest.

### Story scenes
9. **Start comic:** on the very first launch, after the loading screen: `8_start` full screen (fit, paper frame), a short caption per panel in the current language (4 lines, from `claude/story.md`'s "How it began"), "Next"/"Skip"; shown once (`progress.seen.intro`), always available in Story.
10. **Before a boss level** (first time only, `progress.seen.boss_<world>`): the boss picture (`9_1…9_4`) with one sentence ("The park boss is the grumpiest dad in the park. Hug him until he is kind!") and Play/Skip; also before the first bonus level with `26_1/26_2`.
11. **Ending:** after the first win of School level 20: `art/10_end` (placeholder paper frame with "The end — coming soon" until the picture exists), the text of "How it ended" from the story, then a "Thank you for playing!" card (creators line: "Made by Kostya and Dad" — **check with Andrei before any public release**, the child's name stays only if the family wants it); shown once (`progress.seen.ending`), always available in Story.
12. All scenes skippable by tap/Enter/Escape/gamepad A, work on desktop and phone, three languages; story texts live in the story content file.

### General
13. All numbers in `CFG`, strings en/es/ru, whole suite green, balance run committed; screenshots (throwaway): anger meter at full/half/low, the dad in each mood, the walk home, each boss, the wide push, each scene on desktop and phone.

## Implementation steps
1. Pre-flight; tests first (AC 1, 4, 5, 6).
2. Anger meter, default name, mood visuals, becoming kind + win title.
3. Boss levels and looks; the grumpiest dad and the wide push; bots near bosses.
4. Story scenes (intro, before boss, bonus, ending) with `progress.seen`.
5. Balance run, screenshots, whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `BOSS_SCALE` / `BOSS_EXTRA_HP` / `BOSS_SPEED` | 1.1 / 2 (School 3) / 5 px/s | | | |
| `WIDE_PUSH_R` / `WIDE_PUSH_STAND` | 2.5 cells, 180° / 1.5 s | | | |
| mood thresholds | 2/3, 1/3 of anger | | | |
| walk home | ≤ 3 s | | | |
| `I18N.*.anger` | HUD label | Dad's anger | El enojo de papá | Злость папы |
| `I18N.*.defaultBig` | default name | Dad | Papá | Папа |
| `I18N.*.kindAgain` | win title | ${name} is kind again! | ¡${name} volvió a ser bueno! | ${name} снова добрый! |
| `I18N.*.bossNames` | | Park boss / Coach / Builder / The grumpiest dad | Jefe del parque / Entrenador / Albañil / El papá más enojado | Босс парка / Тренер / Строитель / Самый злой папа |
| `I18N.*.next` / `skip` | | Next / Skip | Siguiente / Saltar | Дальше / Пропустить |
| `I18N.*.thanks` | | Thank you for playing! | ¡Gracias por jugar! | Спасибо, что играли! |
| story captions | from `claude/story.md` | | | |

## Docs to update
`docs/game-design.md` (anger, becoming kind, bosses, wide push, scenes — Kostya's and Andrei's decisions vs Claude's numbers), `docs/architecture.md` (mood visuals, boss looks, wide push, `progress.seen`, scenes), `README.md` (story and bosses).
