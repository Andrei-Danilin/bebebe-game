# SPEC-003 — Slower rescue, bonus stars, the Big One's house is dangerous, names

Status: ready
Complexity: M
Branch: SPEC-003-rescue-stars-names
Decided by: the kids with Andrei (2026-11-21): rescue takes 3 s and bots set off to rescue a little later; bonus stars give +3 coins and only players can pick them up; staying 5 s in the Big One's house throws you out (dizzy 2 s, leg fine); names for the players, the Big One and the bots. Everything else below (exact timings, spawn rules, dizzy protection, default names, layout): Claude (spec author).

## Description
Four small changes the kids asked for after playing:
1. **Rescue is harder.** Today one second next to a friend is enough and bots run to help at once, so a fall costs almost nothing. Now lifting a friend takes 3 s, the progress drains if the helper steps away, it is lost if the helper gets pushed, and bots wait 2–3 s before they go to help.
2. **Bonus stars.** Spinning golden stars pop up on the map from time to time; a player who runs over one gets +3 coins. Bots ignore them, so the players have to take the risk themselves.
3. **The Big One's house is dangerous.** A Little One who stays inside it for 5 s gets thrown out of the door and is dizzy for 2 s. A countdown warns him.
4. **Names.** Players, the Big One and the bot friends can get names; names show above heads and in the hearts bar, and are saved.

## Goal
- A fall matters again: rescues take long enough that the Big One can catch the helper.
- Stars give the players a reason to leave cover; they never end up in walls, in the house, or in the Big One's house.
- Kids can call the Big One "Papá" and see it on screen.

## Context
- Rescue: `updateDowned(dt)` — `helper` = any `ok` Little One within `o.r + l.r + 12`; `l.rescue` grows by `dt`, otherwise drains by `dt`; at `CFG.RESCUE_TIME` (1.0) the friend gets up with `INVULN_AFTER_RESCUE`. The ring in the 2D layer already scales with `RESCUE_TIME`. Bots: `updateBots` assigns the nearest free bot to each downed Little One at once (`rescueTarget`).
- Items: `items`, `spawnItem`, `ITEM_EVERY`/`ITEM_MAX`/`ITEM_LIFE`; pickups and their 3D models in `rebuild3D`/sync; `popText`, `burst`, `SFX`.
- Rewards: `awardLevel(win)` computes `coins` with `COINS_MIN_WIN` as a floor, stores `lastReward`; the win screen lists the parts.
- The Big One's house: built in `generateLevel` as walls `kind: "bighome"` around cells (0,14)–(5,19) (before the mirror), floor `dark`. There is no zone object for it yet (unlike `safe`).
- Names: none today. The skins screen (`mode === "skins"`) has three panels (Player 1, Player 2, Big One) with 3D previews (`skinPanels()`). All UI is drawn on canvas; there is no HTML input yet. Touch: dragging anywhere is the joystick.
- SPEC-002 (level types) may be merged before or after this spec. Whichever lands second makes `placeHomes` / the classic generator emit the danger zone below for the Big One's house in every level type.

## Out of scope
- Names for things other than characters (teams, saves).
- Changing how the Big One pushes, or the down timer (`DOWN_TIME` stays 18 s).
- Bots collecting stars, star shop, star leaderboard.
- Profanity filtering (kids' home game; names are only shown locally).

## Acceptance criteria
### Rescue
1. `CFG.RESCUE_TIME` = 3.0. The friend gets up only after 3 s of a helper standing next to him; stepping away drains progress at `CFG.RESCUE_DRAIN` = 1.5 per second (so a short step back does not lose everything). → `tests/gameplay.spec.js` "rescue takes 3 seconds and drains when the helper leaves" (update the existing rescue test to the new time).
2. If the helper is pushed while rescuing, the progress resets to 0. → "pushing the helper resets the rescue"
3. A bot starts moving to a downed friend only after `CFG.BOT_RESCUE_DELAY` = [2, 3] s (random per fall) from the moment of the fall; players are never delayed. While waiting, the bot keeps doing what it was doing. → "bots wait before they go to rescue"
4. Balance check (report, not a hard test): in a 3-minute simulation on levels 1–3 with 1 player idle in the house, report how many bot falls were rescued before and after the change. Bots must still rescue at least half of the falls (otherwise lower `BOT_RESCUE_DELAY` to [1.5, 2.5] and say so).

### Bonus stars
5. A star appears every `CFG.STAR_EVERY` = [10, 15] s, at most `CFG.STAR_MAX` = 2 at once, lives `CFG.STAR_LIFE` = 12 s, blinks for the last 3 s. Stars are separate from items (not counted in `ITEM_MAX`). → "bonus stars appear and disappear"
6. Spawn point: a free cell reachable by the Little Ones, not in the safe house, not in the Big One's house, not on an item or another star, and at least 6 cells (path or straight distance) from the safe house door, so getting it is a small adventure. → "stars spawn only in fair places" (200 spawns on levels 1–5)
7. Only `kind === "player"` Little Ones in state `ok` pick a star up (radius `l.r + 14`); bots and the Big One pass through it. Pickup: +`CFG.STAR_COINS` = 3 to the level's star coins, `popText` "+3", a sparkle and a sound. → "only players pick up stars"
8. Star coins are added on top of the level reward after the `COINS_MIN_WIN` floor (rest penalties never eat them), shown as their own line on the win screen, and also kept if the level ends without a win. `lastReward.starCoins` holds the amount. → "star coins are added to the reward"
9. Look: golden 5-point star, spinning and bobbing, clearly different from the level-rating stars (those stay flat icons in the UI only).

### The Big One's house
10. The generator emits `{ t: "danger", x, y, w, h }` for the inside of the Big One's house (the floor area, mirrored with the rest); `applyWorld` turns it into `dangerZone`; `__bb.inDanger(p)` reports it. Level 1's other items stay exactly the same.
11. Each Little One in state `ok` has `dangerT`: it grows while inside the danger zone and resets to 0 the moment he leaves. At `CFG.DANGER_TIME` = 5 s he is thrown out: placed on the free cell 2 cells outside the house door (nearest free one if that is blocked), state stays `ok`, `l.dizzy = CFG.DIZZY_TIME` = 2 s (cannot move, stars circle his head), `dangerT` = 0, `popText` of the thrown-out line. While dizzy he is also protected from pushes (kid-friendly: being thrown out is the punishment, not a broken leg). → "staying 5 s in the Big One's house throws you out"
12. Warning: during the last `CFG.DANGER_WARN` = 3 s a big countdown "3, 2, 1" floats above the Little One, and for players the house walls pulse red. → screenshot check
13. Bots avoid it: their paths treat danger cells as expensive (`extraCost`), their flee/lurk/random targets are never inside the zone, and a bot inside the zone for more than 2 s heads for the door. The Big One is not affected. → "bots don't linger in the Big One's house" (60 s simulation, no bot is ever thrown out)
14. A downed, walking-home or resting Little One has no timer (only state `ok` counts). The shield does not protect from being thrown out.

### Names
15. Saved in a new key `bebebe-names` = `{ p1, p2, big, bots: [b1, b2, b3, b4] }`; missing or broken data → defaults; old saves keep working. A name is trimmed, control characters removed, at most `CFG.NAME_MAX` = 12 characters counted by code points (emoji are fine); empty → the default. Names are drawn only with `fillText` (never inserted as HTML). → "names are saved, cleaned and survive a reload"
16. Defaults depend on the language and change when the language changes, unless the kid typed a name (a typed name is kept as typed). Defaults in the table below.
17. Editing: on the skins screen each of the three panels shows its name under the preview with a ✏️; tapping it opens an HTML `<input>` placed exactly over the label (positioned from the canvas scale, `maxlength` 12, `enterkeyhint="done"`, `autocapitalize="words"`, font size ≥ 16 px so iPhone Safari does not zoom). Enter or tapping outside saves, Escape cancels. A new button "👥 Friends" on the skins screen opens a `names` screen with four rows for the bot names, edited the same way, and a back button. While an input has focus, game keys (`onKey`, WASD, M, L) are ignored. → "names can be typed on the skins screen", "bot names screen"
18. In play: each character's name floats above its head (`toScreen` at head height + a little), small with a dark outline: players in their colour (`P_COLORS`), bots white, the Big One red; inside a bush the name is drawn at 40 % opacity. The hearts bar starts with the Big One's name; the players' status shows their names. Bots get names in slot order (bot 1 = first bot created). → screenshot check
19. `__bb` gets `names` (get), `setName(slot, text)` (`"p1" | "p2" | "big" | "bot1".."bot4"`), `inDanger`, `stars` (the bonus star list), `spawnStar(x?, y?)`.

### General
20. All new strings in en/es/ru (`tests/i18n.spec.js` stays green). All numbers in `CFG`. No page errors in the smoke test. The whole suite green.
21. Screenshots looked at (throwaway script, not committed): rescue ring at 3 s; a star in park and winter; the countdown in the Big One's house; dizzy stars; the skins screen with an input open on a 960×640 and an iPhone-landscape (844×390) viewport; the friends screen in all three languages; names above heads with 2 players + 3 bots.

## Implementation steps
1. Failing tests first for AC 1–3 (rescue), then change `updateDowned` / `push` / `updateBots`.
2. Danger zone: generator item + `applyWorld` + `inDanger`; tests for AC 10–14 first; then `dangerT`, throw-out, dizzy, bot path costs, warning visuals.
3. Bonus stars: tests AC 5–8; spawner, pickup, reward line, 3D model (reuse the item pickup pattern), blink.
4. Names: storage + cleaning tests (AC 15–16); then the input overlay helper (one function that opens an `<input>` over a canvas rect and calls back with the result), skins panels, the `names` screen, labels above heads and in the HUD.
5. Balance report (AC 4), screenshots (AC 21), whole suite, reviews, docs, merge, push, close — as in `RUN_M.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `RESCUE_TIME` | 3.0 s | | | |
| `RESCUE_DRAIN` | 1.5 /s | | | |
| `BOT_RESCUE_DELAY` | [2, 3] s | | | |
| `STAR_EVERY` / `STAR_MAX` / `STAR_LIFE` | [10, 15] s / 2 / 12 s | | | |
| `STAR_COINS` | 3 | | | |
| `STAR_MIN_FROM_HOME` | 6 cells | | | |
| `DANGER_TIME` / `DANGER_WARN` | 5 s / 3 s | | | |
| `DIZZY_TIME` | 2 s | | | |
| `NAME_MAX` | 12 | | | |
| `I18N.*.starCoins` | `n =>` win-screen line | Bonus stars: +${n} | Estrellitas: +${n} | Звёздочки: +${n} |
| `I18N.*.thrownOut` | pop text | Get out of my house! | ¡Fuera de mi casa! | Вон из моего дома! |
| `I18N.*.friends` | button / screen title | Friends | Amigos | Друзья |
| `I18N.*.tapToRename` | hint | Tap a name to change it | Tocá un nombre para cambiarlo | Нажми на имя, чтобы поменять |
| `I18N.*.defaultBig` | default name | Big One | Grandote | Большой |
| `I18N.*.defaultBots` | default names | Bo, Mia, Tom, Lulu | Tito, Mora, Lupe, Facu | Тёма, Маша, Вася, Соня |
| players' defaults | | existing `player1` / `player2` | | |

## Docs to update
`docs/game-design.md`: rescue (3 s, drain, reset on push, bot delay), bonus stars, the Big One's house danger zone, names — marking what the kids decided and what Claude added. `docs/architecture.md`: `dangerZone`, `dangerT`/`dizzy`, the star spawner, `bebebe-names`, the input overlay, new `__bb` members. `README.md`: rules and the names feature.
