# SPEC-022 — Dad's anger, bosses and story scenes

Status: ready
Complexity: L
Branch: SPEC-022-anger-bosses
Decided by: Kostya (story, 2026-11-22: angry dads become kind after many hugs and go home; a boss in every world; the grumpiest dad in the School can push several kids at once) and Andrei (2026-11-23: hearts become the dad's **anger**, the win is **"Dad is kind again!"** with the dad smiling and walking home; bosses are stronger and have their own look; story scenes — the start comic on first launch, a picture before each boss, the ending after School level 20). Numbers, timings, layouts, texts: Claude (spec author).

## Description
The game finally tells Kostya's story while you play:
- The Big One is **Dad**. His hearts are his **anger** — red angry heart-clouds that go out one by one with every hug. While angry he has a red face, steam from his ears and a small dark cloud; as his anger drops his face turns pink and the steam turns into hearts. When the anger is gone he smiles, blushes, waves and **walks home** to his messy house; the win screen says **"Dad is kind again!"**.
- **Bosses** on level 20 of Park, Football field and City: the park boss (red tracksuit, whistle), the coach (football kit, ball under his arm), the builder (orange hard hat, safety vest) — more anger and a bit faster. School level 20 is **the grumpiest dad** (shirt over the red t-shirt, loose tie, work bag) with his special power: a **wide push** that knocks back every Little One close in front of him at once.
- **Story scenes**: the start comic (`art/8_start`) on the first launch (skippable, also in Story); before each boss level the first time — the boss picture (`9_1…9_4`) with one sentence; before the first level of a bonus world — its picture (`26_1/26_2`); after School level 20 — the ending (`art/10_end`, in `art/` since 2026-11-23; a placeholder only if it fails to load) and a short "thank you" from the creators.

## Goal
- A 6-year-old understands "hug Dad until he is not angry any more" from the screen alone.
- Bosses feel special but fair; the final boss is the hardest level of the main game.

## Context
(Pre-flight done 2026-11-23: SPEC-016/017/019 landed; SPEC-020 and SPEC-021 run before this one; SPEC-011 has not landed — one `index.html`. See "Pre-flight notes" at the end.)
- Big One: hearts `big.hp`/`big.maxHp` (halves since SPEC-004), `difficulty(world, n, lost)` (hearts and speeds, difficulty index, `BIG_CHASE_MAX`), states (`big.state` look/patrol/chase/search; overlays `big.stun`, `big.blush`, `big.slip`, push stand `big.pushCd` = `CFG.PUSH_STAND`, rest `big.noPush` = `CFG.PUSH_RECOVER`; SPEC-019 hearing `big.noise`… with `bigDeaf()`/`bigListens()`), push (`push(t)` from `checkContacts()`, one target), win flow (`winSoon()` → `pendingWin`, final hug animation, win screen with reward lines), HUD hearts bar (drawn heart clouds since SPEC-020), names (`nameFor("big")`, default `I18N.*.defaultBig` "Big One"/"Grandote"/"Большой"), dad look `dad` (SPEC-021), costumes (`BIG_SKINS`).
- Story screen and its content — the `STORY` block in `index.html` (SPEC-017; not a separate file, hard rule 1), art sprites and story pictures (SPEC-020), level map boss stop (SPEC-017: `stopRects` `boss`, `drawStop` badge; SPEC-020 draws it).
- `docs/story.md` — Kostya's story (copy of the claude.ai project doc `claude/story.md`); bonus worlds have no bosses yet.

## Out of scope
- Bosses for Beach and Winter (not in the story yet: their level 20 is a normal level without the boss badge).
- Voice, music, animated comics.

## Acceptance criteria
### Anger
1. The hearts bar becomes the **anger meter**: same numbers, drawn as angry heart-clouds (full / half / out); label "Dad's anger" (or the dad's name if renamed) — texts below. A hug (or kiss) puts out clouds exactly as hearts were lost before. → existing hug/kiss tests stay green; "the anger meter shows the dad's anger"
2. The default Big One name (`I18N.*.defaultBig`) becomes **Dad / Papá / Папа** (only the default; typed names stay); costume names unchanged.
3. Mood visuals on the dad by anger fraction: ≥ 2/3 — red face, steam puffs, small dark cloud; 1/3–2/3 — orange-pink face, less steam; < 1/3 — pink face, hearts instead of steam. Push/stun/blush/slip visuals keep working on top.
4. **Becoming kind:** when the anger reaches 0 the dad stops, smiles, blushes, hearts burst, he waves and walks to his house door (≤ 3 s, bots and players cheer), then the win screen with the title **"Dad is kind again!"** (bosses: "<Boss> is kind again!"). Rewards, stars and the ledger exactly as now. → "the dad becomes kind and walks home before the win screen"

### Bosses
5. Level 20 of `park`, `field`, `city` is a boss level: boss look (park — red tracksuit, whistle; field — football kit, shin guards, ball; city — orange hard hat, safety vest, road cone in hand) built on the dad model, slightly bigger (`CFG.BOSS_SCALE` 1.1); anger +`CFG.BOSS_EXTRA_HP` (2) over the level's normal hearts (may exceed `BIG_HP_MAX` by those 2); speed +`CFG.BOSS_SPEED` (5 px/s) but never above `BIG_CHASE_MAX`. → "boss levels have their boss"
6. School level 20 is **the grumpiest dad**: shirt over the red t-shirt, loose tie, work bag, the biggest dark cloud; anger +3; **wide push**: when he pushes, every Little One (state `ok`, not shielded) within `CFG.WIDE_PUSH_R` (2.5 cells) in front of him (180°) is pushed too — one big "WHOOSH!" burst and a ring wave; after a wide push he stands `CFG.WIDE_PUSH_STAND` (1.5 s, longer than a normal push stand) — a window to hug him. Shield blocks it for its owner as usual. → "the grumpiest dad pushes several kids at once", "after a wide push he stands longer"
7. Bonus worlds: no boss; the level-20 stop shows no boss badge.
8. Bots handle bosses (no stuck states; they keep distance in front of the grumpiest dad when he is not standing); `npm run balance` (after SPEC-023: run by the `balance.yml` workflow): boss levels win in ≥ 2 of 3 seeds within 8 min (`CFG.BALANCE.WIN_SEEDS` of `SEEDS`, `TIME_LIMIT` 480 s); School 20 is the slowest main level; report the rest.

### Story scenes
9. **Start comic:** on the very first launch, after the loading screen: `8_start` full screen (fit, paper frame), a short caption per panel in the current language (4 lines, from `docs/story.md`'s "Как всё началось" / "How it began"), "Next"/"Skip"; shown once (`progress.seen.intro`), always available in Story.
10. **Before a boss level** (first time only, `progress.seen.boss_<world>`): the boss picture (`9_1…9_4`) with one sentence ("The park boss is the grumpiest dad in the park. Hug him until he is kind!") and Play/Skip; also before the first bonus level with `26_1/26_2`.
11. **Ending:** after the first win of School level 20: `art/10_end` (it exists now; the placeholder paper frame stays only as the fallback when the picture fails to load), the text of "How it ended" ("Как всё закончилось") from the story, then a "Thank you for playing!" card (creators line: "Made by Kostya and Dad" — **check with Andrei before any public release**, the child's name stays only if the family wants it); shown once (`progress.seen.ending`), always available in Story.
12. All scenes skippable by tap/Enter/Escape/gamepad A, work on desktop and phone, three languages; story texts live in the story content (the `STORY` block in `index.html`).

### Kostya's words
13. Kostya's story is now in the repo as `docs/story.md` (a copy of the project doc `claude/story.md`; Kostya owns it). Every story text in the game — the Story screen chapters written by Claude in SPEC-017, the start comic captions, the boss and bonus lines, the ending — is rewritten from `docs/story.md`: Russian in Kostya's own words (shortened only where a line doesn't fit), English and Spanish as faithful, simple translations (Argentine "vos"). Where the story says nothing (a world chapter's sentence, the bonus worlds), keep it to one plain sentence in the same voice and list those lines in the report as "written by Claude — check with Kostya".

### General
14. All numbers in `CFG`, strings en/es/ru, whole suite green (on CI, SPEC-023), balance run committed (`reports/balance.*` from the balance workflow); screenshots (throwaway): anger meter at full/half/low, the dad in each mood, the walk home, each boss, the wide push, each scene on desktop and phone.

## Implementation steps
1. Pre-flight; tests first (AC 1, 4, 5, 6).
2. Story texts from `docs/story.md` (AC 13).
3. Anger meter, default name, mood visuals, becoming kind + win title.
4. Boss levels and looks; the grumpiest dad and the wide push; bots near bosses.
5. Story scenes (intro, before boss, bonus, ending) with `progress.seen`.
6. Balance run (balance workflow), screenshots, whole suite (CI), reviews, docs, merge, push, close — as `RUN_L.md` (as updated by SPEC-023).

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `BOSS_SCALE` / `BOSS_EXTRA_HP` / `BOSS_SPEED` | 1.1 / 2 (School 3) / 5 px/s | | | |
| `WIDE_PUSH_R` / `WIDE_PUSH_STAND` | 2.5 cells, 180° / 1.5 s | | | |
| mood thresholds | 2/3, 1/3 of anger | | | |
| walk home | ≤ 3 s | | | |
| `I18N.*.anger` | HUD label | Dad's anger | El enojo de papá | Злость папы |
| `I18N.*.defaultBig` | default name (key exists; was Big One / Grandote / Большой) | Dad | Papá | Папа |
| `I18N.*.kindAgain` | win title | ${name} is kind again! | ¡${name} volvió a ser bueno! | ${name} снова добрый! |
| `I18N.*.bossNames` | | Park boss / Coach / Builder / The grumpiest dad | Jefe del parque / Entrenador / Albañil / El papá más enojado | Босс парка / Тренер / Строитель / Самый злой папа |
| `I18N.*.sceneNext` / `sceneSkip` (`next` is taken: `next(n)` = "Level n ▶", the win button) | | Next / Skip | Siguiente / Saltar | Дальше / Пропустить |
| `I18N.*.thanks` | | Thank you for playing! | ¡Gracias por jugar! | Спасибо, что играли! |
| story captions | from `docs/story.md` | | | |

## Docs to update
`docs/story.md` stays Kostya's (only a note at the end of which parts are in the game); `docs/game-design.md` (anger, becoming kind, bosses, wide push, scenes — Kostya's and Andrei's decisions vs Claude's numbers), `docs/architecture.md` (mood visuals, boss looks, wide push, `progress.seen`, scenes), `README.md` (story and bosses).

## Pre-flight notes (2026-11-23)
Changes made in this pre-flight:
- `claude/story.md` → `docs/story.md` everywhere it is the source (Context, AC 9, numbers table); `claude/story.md` stays named only as the claude.ai copy.
- Context pre-flight line → SPEC-016/017/019 landed, SPEC-020/021 run first, SPEC-011 not landed.
- Context Big One: `difficulty(world, n)` → `difficulty(world, n, lost)`; states spelled as the real fields (`big.state`, `stun`, `blush`, `slip`, push stand = `big.pushCd`/`CFG.PUSH_STAND`, rest = `big.noPush`/`CFG.PUSH_RECOVER`, SPEC-019 hearing); `push()` → `push(t)` called from `checkContacts()`; win flow starts in `winSoon()`; default name key `I18N.*.defaultBig`; costumes = `BIG_SKINS`.
- Context "Story screen and content file (SPEC-017)" → there is no content file: SPEC-017's content structure is the `STORY` block in `index.html` (hard rule 1: a `file://` page can't fetch a file). AC 12 "story content file" → the `STORY` block.
- Description / AC 11: `art/10_end` "when it exists, placeholder until then" → it exists (commit `ae495fa`); the placeholder is only the load-failure fallback.
- AC 2: + the key `I18N.*.defaultBig` (exists, only its values change). Table row marked "key exists".
- Table `I18N.*.next` / `skip` → `sceneNext` / `sceneSkip`: `next` already exists (`next: n => "Level n ▶"`, the win screen's next-level button).
- AC 8: + after SPEC-023 the balance run comes from `balance.yml`; "2 of 3 seeds within 8 min" = `CFG.BALANCE.WIN_SEEDS`/`SEEDS`/`TIME_LIMIT` 480 s. AC 14 / step 6: whole suite on CI, balance from the workflow.

What master already does:
- AC 13's first sentence is done: `docs/story.md` is in the repo (commit `d35398c`).
- The SPEC-019 strings already call him Dad: `ruleTiptoe`, `heardHint`, `heardHintTouch` ("Dad heard you running!", "Papá te escuchó", "Папа услышал топот").
- The Story screen already has the chapters "How it began" (`began`, always open) and "How it ended" (`ended`, open after `progress.worlds.school.won[20]`, `chapterOpen`); SPEC-020 gives them `8_start` / `10_end` — "always available in Story" (AC 9, 11) is mostly there.
- The map already has a boss stop on level 20 — but in **every** world, bonus too (`stopRects`: `boss = i === n − 1`, badge `L().boss` in `drawStop`), and the level card shows `bossLine` on level 20 everywhere (`drawLevelCard`) — AC 7 changes both for Beach/Winter.

Facts for the implementer (approx. lines, `docs/architecture.md` table):
- No `progress.seen` exists. It is a new save field: add it to `freshProgress()` and merge it in `loadProgress()` (never throw, broken → defaults; hard rule 7), add a save fixture under `tests/fixtures/saves/`, check shapes with `__bb.loadProgress(save)`. Not decided by the spec — decide, note in the report and BACKLOG as "decided during the run, check with Andrei": does "Reset progress" (`resetProgress`) clear `seen`; does an **old save that already has progress** get the start comic once (it's not literally its first launch)? The bonus scene's key isn't named either (e.g. `seen.bonus_beach`).
- **Tests**: `openGame()` clears `localStorage` once per test, so every fresh page would open on the start comic instead of `home`; make the helpers/`resetGame()` mark it seen (or set it in the init script) and keep a dedicated test for the first launch. A scene is most likely a new `mode`: add it to `MODES` (frozen; the `__bb.mode` setter accepts only `MODES`), `MENU_MODES`/`inMenus` if it's a menu, `resetMenus()`, and the `onKey`/`onPadButton` branches (screens section ~2129–2203, input ~2241–2511).
- `tests/i18n.spec.js` requires `STORY.length === 8` and every `STORY` text > 10 chars in en/es/ru — the four start-comic captions need a place in `STORY` (e.g. an extra field on `began`) or the test is changed on purpose.
- Win flow (logic ~2512–3262): `winSoon()` sets `pendingWin = CFG.HUG_ANIM` (1 s) and `big.stun = 99`; `update()` counts it down → `mode = "win"`, `logEvent("win")`, `giveReward(true)`; `leaveLevel()` (~2034) pays a pending win when the player leaves through pause. **`stats.time` keeps counting during `pendingWin`** (`update()` ~3226) — a ≤ 3 s walk home must not change the fast star or the balance times ("rewards, stars … exactly as now"). The kids' rule "the last hug plays to the end before the win screen" (HUG_ANIM) stays: the walk comes after it. `bigDeaf()` already includes `pendingWin`, so he hears nothing during the walk.
- Win title today: `L().win` ("YOU WIN!") — desktop `drawOverlay` ~5085, phone `drawOverlayPhone` ~5000; the line under it is `winLine` from `winText()` (~4442: `worldDone` after level 20, else `winSub` "The Big One is all hugged out!").
- Anger meter: the bar is drawn by `drawHpHeart(x, y, s, heartFill(i, big.hp))` for `i < big.maxHp`, after `nameFor("big")` — desktop `drawHUD` ~3657, phone `drawHUDPhone` ~3592; the half is drawn left red / right grey (SPEC-020 replaces it with the `13_interface` clouds; its "half" cloud is a whole paler heart).
- Bosses vs `difficulty()` (~2636; `bigHearts` ~2633): level-20 hearts today park 10, field 11, city 12, school 12 (13 capped by `BIG_HP_MAX` 12) → with the boss extra 12 / 13 / 14 / 15. Chase at level 20: park 135, field 140, city and school already at `BIG_CHASE_MAX` 142.5 → `BOSS_SPEED` raises park to 140 and field to the cap; city/school gain only on patrol/search. `tests/levels.spec.js` (~405–422) asserts `hearts = min(12, …)` on every level incl. 20 and `levels`/`invariants` read `__bb.difficulty` — update those on purpose. `resetWorld` takes `big.maxHp` from `difficulty(curWorld, level).hearts`.
- Push (AC 6): `checkContacts()` (~3104) pushes one Little One who `canAct(l)` (state `ok`, no `hugAnim`, no `dizzy`), `invuln ≤ 0`, no cloak (`fx.cloak`), `!inSafe(l)`, within `big.r + l.r + 4` and `angDiff < 1.9` rad of his facing, while `stun`, `slip`, `blush`, `pushCd`, `noPush` are all 0. `push(t)` (~2537): shield (`t.fx.shield`, item `shield`) → "Blocked!" and the shield is used; else `down`, rescue reset for helpers, `big.pushCd = CFG.PUSH_STAND` (0.9 s, Claude's), `big.noPush = CFG.PUSH_RECOVER` (2.5 s, **kids' rule** — keep it after a wide push). A wide push stand via `pushCd` keeps him deaf (`bigDeaf()`), as SPEC-019 wants.
- Bots (`updateBots`): tasks `rescue`/`flee`/`attack`/`lurk`/`leave`, one attacker (`attackToken`); SPEC-019: tiptoe within `HEAR_RADIUS (+ TIPTOE_NEAR)` cells, run when rescuing/fleeing/leaving. Today's balance report (`reports/balance.md`, SPEC-019): level 20 careful wins 3/3 everywhere, medians park 216 s, field 127 s, city 227 s, school 226 s (so School 20 is **not** yet the slowest main level — city 20 is, by 1 s); the school 20 reckless run is stuck at 480 s (BACKLOG: "looks like the autopilot getting stuck").
- New `CFG` keys (`BOSS_SCALE`, `BOSS_EXTRA_HP`, `BOSS_SPEED`, `WIDE_PUSH_R`, `WIDE_PUSH_STAND`) → `npm run docs:numbers` (the generated table) and `tests/invariants.spec.js`.
- Other texts still say "Big One" and are not in the ACs: `big` (Wardrobe column title), `winSub`, `rules` lines 1/2/5, `lose`, the Spanish "Grandote" ones; also `bossLine` ("The boss: the grumpiest dad of this world…") is Claude's and contradicts `docs/story.md` (only the School's is the grumpiest; the others are each world's main dad) — AC 7/13 cover rewriting it; list the rest in BACKLOG.
- Terminology clash in `docs/game-design.md` «Сложность»: "Злость остаётся: +4 за каждое целое потерянное сердечко" (`BIG_SPEED_PER_HIT`, code comment "и злится после каждой обнимашки") — there "anger" grows as hearts are lost, the opposite of the new anger meter; reword that speed-up (numbers unchanged) when documenting.

Pictures for this spec (paper = notebook page, green = keyable sheet; all 1024×572):
- `1_papa` (green, 8 poses): angry (red face, steam, scribble cloud) · "GRRR!" · "???" · BONK push · hugged "¡OY!" · pushing · hugged, spiral eyes · **pink face with steam and hearts** (the middle mood) · smiling, hearts, waving (kind).
- `4_papas_bosses` (green, older sheet): park boss in a red tracksuit with a whistle — angry / kind waving (row 1 left); the rest are **bonus-world dads, not bosses**: beach dad (flowered shirt, swim ring, sunglasses) angry / kind ×2, winter dad (ushanka, parka, scarf) angry / grumpy / kind — out of scope (no bonus bosses).
- `4_papas_bosses_new` (green): coach (white football kit, whistle, shin guards, ball) angry · kind with ball · red-faced waving · kind with ball; builder (orange hard hat, hi-vis vest, road cone) angry · grumpy · calm · kind waving.
- `5_papas_main_boss` (green): the grumpiest dad (stained white shirt over the red t-shirt, loose tie, messenger bag) angry with the big dark cloud and steam · **wide push "WHOOSH!"** with a swoosh arc and three kids flying back · hugged by two kids "¡OY!" · grumpy · hugged by four kids "¡OH!" · kind with a cupcake.
- `9_1_boss_park` · `9_2_boss_field` · `9_3_boss_city` · `9_4_boss_school` (paper): the boss in his world with "GRRR!", the messy house, kids hiding by the blue house. `26_1_bonus_beach` / `26_2_bonus_winter` (paper): angry dads sunbathing / building an ice wall, kids hiding. `8_start` (paper, 1024×765, 4 panels with **empty speech bubbles** — captions can go in them): home to a mess · kids knock him over, BONK · empty fridge, GRRR · dads in the café. `10_end` (paper): everyone at a long table in the schoolyard eating cupcakes (matches "Как всё закончилось"). `11_win` (paper): the dad smiling, walking to his messy house, kids cheering "YAY!" — fits AC 4's "becoming kind" if a picture is wanted on the win screen (not required).
- Effects from SPEC-020's `24_effects`: steam puffs (left/right), dark storm cloud, heart cluster, yellow/red/pink bursts (WHOOSH can sit on one); `13_interface` heart clouds (full / paler / fading / grey) and `12_icons` angry heart for the meter.
