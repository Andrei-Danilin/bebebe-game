# SPEC-015 — Online mode B: a kid plays the Big One

Status: ready
Complexity: L
Branch: SPEC-015-big-one-player
Decided by: Andrei and the kids (2026-11-22): a mode where only players play and one of them is the Big One. Andrei accepted Claude's proposed rules below (what the Big One sees, push button, how he wins, coins, who is the Big One); **the kids may change any of them** — then the spec changes before the run. The turn-speed limit and all numbers: Claude (spec author).

Update (Andrei, 2026-11-26): the server is Cloudflare Durable Objects (SPEC-013/014 rewritten); mode B runs inside the same `Room`. New strings also in pt. "Breaks a leg" wording is gone since SPEC-033 (the kid falls down); the Big One is called Dad in all texts (SPEC-035). Hosting a mode-B room needs the Full game like mode A (SPEC-045, enforced only after the web beta).

## Description
In the online lobby the room owner switches the mode to **"Big One — a player"** and picks who is the Big One (or taps 🎲). That kid controls the Big One: he walks, looks around and pushes with a button. He sees only the Little Ones in his view cone, so hiding in bushes and sneaking behind him still works. He wins if he still has a heart when the round timer runs out; the Little Ones win as always by taking all his hearts. Bots fill the empty Little One slots and mostly rescue, as today.

## Goal
- A kid playing the Big One has a fair, fun game: he can push, but he can't see through walls or spin on the spot to stop every hug.
- The Big One's device never receives positions it should not see.
- Balance: in autopilot games the Big One wins 40–60 % of rounds.

## Context
- After SPEC-012: `big` slot `kind: "player"` moves from `g.inputs.big` without AI; after SPEC-013: rooms, lobby, snapshots, prediction, rewards per slot through the ledger; after SPEC-014: the server online.
- Rules that stay as with the AI Big One (`docs/game-design.md`): vision cone (90°, walls/trees/rocks block, bushes hide, ponds/water don't), push → broken leg / rescue / rest, rest after a push (`PUSH_RECOVER`, pale cone), shock after a hug (`HUG_STUN`), banana slip (hug from any side), air kiss blush (can't move, turn or push), the safe house (he can't enter or see inside), his own house (Little Ones thrown out after `DANGER_TIME`), shield, cloak (he can't see the cloaked one), boots.
- The action button for Little Ones = the kiss (keys E/Space, pad X/□, touch 💋).
- `visionPoly`, `inCone`, `canSee`, `bigCalm`, `big.dir`, `difficulty()`; phone camera follows `camHero()`.

## Out of scope
- A human Big One in local (one-screen) play — BACKLOG.
- Automatic rotation of the Big One role between rounds (lobby "Again" keeps the same Big One; the owner can change it) — BACKLOG if the kids want it.
- Changing anything in mode A or single play.

## Acceptance criteria
### Lobby
1. The owner switches `mode` A ↔ B in the lobby; in B there are 6 slots: the Big One + 5 Little Ones; max humans `CFG.ONLINE.MAX_HUMANS_B` (6). The owner taps a player to make him the Big One, or 🎲 (random among humans). The Big One picks one of the 5 Big One looks (incl. paid ones he owns, SPEC-009). If the Big One leaves during play, the AI takes over at once (`kind` → `bot`) and gives control back on rejoin. → `tests/online.spec.js` "mode B lobby: choose the Big One"

### Controls and rules (kids may change)
2. **Movement and turning:** the Big One faces where he walks, but his facing turns at most `CFG.BIG_TURN_RATE` (270°/s) — he can't spin on the spot to block hugs. Speed: his `difficulty(world, n).chase` speed (same cap `BIG_CHASE_MAX` < `PLAYER_SPEED`), no patrol/search speeds. → `tests/core/big-player.test.mjs` "turn rate is limited"
3. **Push button** (the action button: E/Space, pad X/□, touch button in the 💋 place with a ✋ icon): a short dash `CFG.BIG_DASH_DIST` (40 px) over `CFG.BIG_DASH_TIME` (0.2 s) along `big.dir`. A Little One he **can see** (`canSee`: in the cone, not in a bush, not cloaked, not in the safe house) touched during the dash is pushed with all the usual rules (broken leg, shield, invulnerability, rest after a push). A miss → cooldown `CFG.BIG_MISS_CD` (1 s). No push during shock, slip, blush or the rest after a push (button grey). → `tests/core/big-player.test.mjs` "dash pushes only a seen Little One", "no push while calm"
4. **Hearts and timer:** in mode B the Big One has `CFG.BIG_PLAYER_HEARTS` (8) hearts, not by level; hugs, mittens, kisses, bananas work as today. The round lasts `CFG.ROUND_TIME` (180 s); a timer is on top of every screen; the last 10 s blink.
5. **Win:** the Little Ones win at 0 hearts (as today). The Big One wins when the timer ends and he has hearts left. Both win screens in en/es/ru: "The Big One held out!" / "The Little Ones won!". → `tests/core/big-player.test.mjs` "the Big One wins on time"

### What each device sees
6. **The Big One's snapshot is filtered on the server:** it contains only the Little Ones he can see right now (same `canSee` as the rules) plus downed/resting ones in his cone; items and bonus stars as for everybody. His mini-map and edge arrows show only what he sees (edge arrows only for the last-seen spot for 2 s). His screen shows a soft dark vignette outside the cone (no other change to the 3D). The Little Ones' snapshots are unchanged (they see him and his cone). → `tests/server/filter.test.mjs` "hidden Little Ones never reach the Big One's client"
7. The Big One's phone camera follows the Big One (`camHero()` = the controlled character); the HUD shows his hearts, the timer and the ✋ button with its cooldown arc.

### Rewards (ledger lines, SPEC-009)
8. The Big One gets `CFG.COINS_BIG_PUSH` (2) per push and, if he wins, the level's base reward (first win / replay rules of his own save, no stars for the Big One). Little Ones: on a win as in mode A; on a loss `CFG.COINS_LOSE_B` (5) each. The win screen lists the lines as in SPEC-009. → `tests/online.spec.js` "mode B rewards"

### Balance
9. SPEC-008 balance tools get a mode-B run: the AI Big One (today's `updateBig` driven through the `big` input slot as an "autopilot Big One" with the turn limit and the dash) vs 5 `careful` autopilot Little Ones, 3 seeds × 8 sampled levels (two per world). Target: the Big One wins 40–60 %; tune `BIG_PLAYER_HEARTS` and `ROUND_TIME` (within 6–10 hearts, 150–240 s) until green; the chosen numbers and the table go into `reports/balance.md`. → `npm run balance -- --mode b`

## Implementation steps
1. Core: turn rate, dash push, mode-B hearts/timer/win (AC 2–5) — Node tests first.
2. Autopilot Big One through the input slot; balance run and tuning (AC 9).
3. Server: mode switch, Big One slot, AI takeover/rejoin (AC 1), snapshot filter (AC 6).
4. Client: lobby mode B, ✋ button, vignette, filtered mini-map/arrows, camera (AC 1, 6, 7); rewards (AC 8).
5. Docs; whole suite + node tests + balance; reviews (code + architect); merge, push (staging deploys; tag for prod), close.

## Numbers and texts
| CFG / I18N key | value | en | es | ru |
|---|---|---|---|---|
| `CFG.ONLINE.MAX_HUMANS_B` | 6 | | | |
| `CFG.BIG_TURN_RATE` | 270 °/s | | | |
| `CFG.BIG_DASH_DIST` / `BIG_DASH_TIME` / `BIG_MISS_CD` | 40 px / 0.2 s / 1 s | | | |
| `CFG.BIG_PLAYER_HEARTS` | 8 (tuned by AC 9) | | | |
| `CFG.ROUND_TIME` | 180 s (tuned by AC 9) | | | |
| `CFG.COINS_BIG_PUSH` / `COINS_LOSE_B` | 2 / 5 | | | |
| `modeA` | | Little Ones vs Big One | Chiquitos contra el Grandote | Малыши против Большого |
| `modeB` | | Big One — a player | Grandote: un jugador | Большой — игрок |
| `chooseBig` | | Who is the Big One? | ¿Quién es el Grandote? | Кто будет Большим? |
| `bigHeldOut` | | The Big One held out! | ¡El Grandote aguantó! | Большой продержался! |
| `littlesWon` | | The Little Ones won! | ¡Ganaron los chiquitos! | Малыши победили! |
| `push` (button label for screen readers / hint) | | Push | Empujar | Толкнуть |
| `coinsPush` (ledger line) | | Pushes +{n} | Empujones +{n} | Толчки +{n} |

(The Big One is "Grandote" / "Большой" as in `I18N.defaultBig`. The UI has no word for the team of Little Ones yet: "chiquitos" / "Малыши" are new.)

## Docs to update
`game-design.md` (section "Онлайн → Режим «Большой — игрок»" with every rule and "предложил Claude, одобрил папа"), `architecture.md` (mode B in the core, snapshot filter, autopilot Big One), `README.md` (how to play mode B), `reports/balance.*`.
