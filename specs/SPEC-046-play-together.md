# SPEC-046 — Play through together: the host's map, a friends' bonus and a coin share

Status: ready
Complexity: M
Branch: SPEC-046-play-together
Depends on: SPEC-013 (online rooms, with its 2026-11-27 amendment), SPEC-045 (Full game groundwork)
Decided by:
- **Andrei and the kids (2026-11-27):**
  - there is one online mode: friends join the room creator and play through **his** levels together, level after level;
  - only the room creator's progress changes (stars, opened levels and worlds);
  - every friend adds a bonus to the level's coins, and the room creator chooses which share goes to the friends: 0, 10, 20 … 100 %, **50 % by default**; the friends' share is split equally between them;
  - guests get no stars or unlocks, even when that level is open in their own save;
  - rooms stay private, by code only; open rooms ("looking for a helper") were considered and are not done for now.
- **Andrei (2026-11-27):** the bonus size is Claude's, to be checked with the kids in play.

Numbers marked "kids may change": Claude. Rooms, the protocol and the lobby are SPEC-013's; this spec only adds to them.

## Description
After SPEC-013, a room plays a level and returns to the lobby. This spec turns the room into a trip through the host's game:
- the lobby shows **the host's map** to everybody: his worlds, open levels and stars. Only the host taps a level;
- after a win, everybody returns to the same map and sees what opened ("Level 4 is open!", "Field is open!");
- the level's coins grow with every friend, and the host decides how much of them goes to the friends;
- each kid still keeps the coins for **his own** hugs and the stars **he** picked up, as in single play.

Example (bonus +50 % per friend, at most +100 %, share 50 %): a level gives 20 coins.
- With one friend: 30 coins. The host gets 15 and the friend 15.
- With two friends: 40 coins. The host gets 20 and each friend 10.
- The bonus stops at +100 %, so two kids can at most double the level's coins by hosting each other.

## Goal
- A host and up to 4 friends play level after level without leaving the room. The host's save gets stars and unlocks exactly as in single play; the guests' progress never changes.
- Before a level, every kid can see how the coins will be shared; after it, what he got and why.
- The split is computed on the server by pure core code, so the numbers are the same on every device and are covered by unit tests.

## Context
- SPEC-013 (amended 2026-11-27):
  - the Room, the lobby and `roomState`;
  - the owner's `setProgress` and `roomState.map`;
  - the server computes the reward with `computeReward(ownerProgress, result)`, and `result` is per slot;
  - ownership passes to another player when the owner leaves; tokens live only in memory.
- `computeReward(p, result)` (`src/core/progress-rules.js`) returns the parts `firstWin`/`replay`, `newStars`, `star`, `hugs` and `rests`.
- `addCoins(reason, amount)` (`src/core/economy.js`) is the only writer of coins; a negative amount is allowed only for rests.
- SPEC-045: `entitlement` and worlds locked with the reason "purchase".

## Out of scope
- Open or public rooms, matchmaking, friends lists, accounts and cloud saves. Decided: rooms by code only.
- Any change to single-play rewards.
- More Dad hearts when several real kids play: the balance spec.
- Mode B rewards (SPEC-015). SPEC-015 decides, and may reuse `splitOnlineReward`.

## Acceptance criteria
### The level's coins (core, pure)
1. **`splitOnlineReward({ levelCoins, friends, share })`** lives in `src/core/online-reward.js`. It is pure and headless, with no client imports.
   - `levelCoins` is the sum of the owner's `computeReward` parts `firstWin`/`replay`, `newStars` and `rests`: the coins that come from the level itself, not from one kid's hugs or picked-up stars. It is 0 on a loss.
   - `bonus = min(friends × CFG.ONLINE.FRIEND_BONUS, CFG.ONLINE.FRIEND_BONUS_MAX)` (0.5 and 1.0; kids may change).
   - `pool = round(levelCoins × (1 + bonus))`.
   - `friendsPool = floor(pool × share / 100)`.
   - `each = friends ? floor(friendsPool / friends) : 0`.
   - `owner = pool − each × friends`: whatever rounding leaves goes to the host.
   - It returns `{ pool, bonusCoins: pool − levelCoins, owner, each }`.
2. **Who counts as a friend:** a human player other than the owner who is in the room when the result arrives, either connected or within `REJOIN_TIME`. Bots and removed players don't count. With 0 friends, the owner gets exactly `levelCoins`, the single-play number.
3. **Each kid's own coins:**
   - every kid gets `hugs × REWARD.PER_HUG` for his own hugs;
   - the stars he picked up are already in his piggy bank from the pickup, as in single play;
   - rests are team-wide and already inside `levelCoins`.

### Server (Room)
4. **The share setting:**
   - `setShare { pct }` comes from the owner, in the lobby or result phase only;
   - `pct` must be in 0…100 in steps of `CFG.ONLINE.SHARE_STEP` (10); anything else, or a `setShare` during play, gets `error`;
   - the value is shown to everybody as `roomState.share`, and a change sends `shareChanged { by, pct }` to everybody;
   - the creator's `create` carries his saved `online.share` (default `CFG.ONLINE.SHARE_DEFAULT`, 50);
   - the share is kept in the lobby storage and restored after a Room restart (SPEC-013 AC 6).
5. **At the result**, the Room:
   - computes the owner's reward from his last `setProgress`, then `levelCoins`, the friends and the split;
   - gives every result an `id` (a counter per room);
   - sends every slot `coins: { level, bonus, toFriends, share, hugs, total }`. The owner gets `level`, `bonus` and `toFriends`; a friend gets `share`; both get their own `hugs`;
   - adds `world` (stars and the unlock) and the reward flags (`first`, `newStars`, `worldOpened`, `bonusUnlocked`) for the owner only;
   - updates `roomState.map` from the result it computed, so the map is right before the owner's client sends `setProgress` again.
6. **The owner is away at the finish:**
   - the level goes on with a bot in his slot (SPEC-013);
   - if the level ends while he is away, his result is kept in the Room's storage until his `REJOIN_TIME` runs out and is sent when he rejoins with his token; the friends get their shares at once;
   - if he doesn't come back, his result is dropped and ownership passes as in SPEC-013. The new owner sends `setProgress` and `setShare`, the map becomes his, and with `enforce` on, worlds he hasn't bought show the purchase lock.

### Client
7. **The lobby is the host's map:**
   - everybody sees the owner's world strip (world icons) and level buttons with stars, as on the menu map, titled with `hostMap`;
   - guests see it read-only, with the level the owner picked highlighted; the owner taps a level and then **Start**;
   - locked levels and worlds look locked for everybody, including "purchase" locks;
   - the big code, the slots, Lock, Remove and Leave stay as in SPEC-013.
8. **The share control (owner):**
   - "Coins for friends: 50 %" with − and + buttons (step 10, 0…100), working with keyboard, gamepad and touch;
   - saved as `online.share`, and disabled during play.
9. **What guests see:**
   - a line in the lobby, "{name} shares {pct}% of the level's coins", readable on phones (not below `PHONE_TEXT`);
   - a change shows everybody the toast "{name} now shares {pct}%".
10. **The online result screen:**
    - **The owner** sees his lines: Level +L, Friends bonus +B, To friends −F, Hugs +H, and the total; plus stars, "Level n is open!" and a world opening, as in single play.
    - **A friend** sees: Your share +S, Hugs +H, and the total; plus "{name}: level n is open!" when the owner's win opened one.
    - **Back to map**: everybody sees the newly opened level highlighted.
11. **Applying coins:**
    - The owner applies `world` through the single-play path. He adds coins with `addCoins("onlineLevel", owner)` and `addCoins("hugs", h)`.
    - A friend adds coins with `addCoins("onlineShare", each)` and `addCoins("hugs", h)`.
    - No negative ledger lines: "To friends" is shown on screen only. Zero lines are not written.
    - The client applies each result `id` once. It keeps the applied ids in memory for the session; the token isn't stored, so a rejoin only happens within the same session.
12. **Guests' progress never changes from online play:** `stars`, `won`, `unlocked` and `lastWorld` stay the same. Spent kisses and kits still come from each kid's own save (SPEC-013).

### Tests and docs
13. **Unit tests (core)** for `splitOnlineReward`:
    | levelCoins, friends, share | expected |
    |---|---|
    | 20, 0, 50 | owner 20 |
    | 20, 1, 50 | pool 30, owner 15, each 15 |
    | 20, 2, 50 | pool 40, owner 20, each 10 |
    | 20, 4, 50 | pool 40, owner 20, each 5 |
    | 20, 1, 0 | pool 30, owner 30, each 0 |
    | 20, 1, 100 | owner 0, each 30 |
    | 7, 3, 30 | pool 14, owner 11, each 1 |
    | 0 (a loss), 2, 50 | all 0 |

    Plus: the result is never negative, and `owner + each × friends === pool`. `levelCoins` is taken from the right `computeReward` parts.
14. **Online node tests:**
    - `setShare` validation and phases;
    - per-slot results with 0, 1, 2 and 4 friends;
    - a friend who left and was replaced by a bot doesn't count; a friend within `REJOIN_TIME` counts; a removed player doesn't count;
    - the owner away: his result is held and delivered on rejoin;
    - the owner gone: ownership passes and the map switches;
    - a Room restart keeps the share;
    - guests never get `world`.
15. **Playwright (3 contexts):**
    - create with share 30, two joins, guests see "shares 30%";
    - win a level with the debug win, and the totals match the split;
    - the owner's save has the stars and the next level; the guests' saves have only the new coins;
    - "Back to map" shows the opened level to all three.
16. **Docs:** `docs/game-design.md` (online play-through, the bonus and the share, with the example); `docs/architecture.md` (`setShare`, `shareChanged`, the per-slot `result`, held owner results).

## Implementation steps (TDD: failing test first in each)
1. `splitOnlineReward` and `levelCoins` from the reward parts (unit tests).
2. The Room: `setShare`, the split at the result, held owner results, the share in storage (node tests).
3. The client lobby as the host's map; the share control; the guest line and the toast.
4. The online result screen; ledger lines; the applied-id guard.
5. Playwright; docs; reviews; merge.

## Numbers and texts
| Key | Value / en | es | pt | ru |
|---|---|---|---|---|
| `FRIEND_BONUS` / `FRIEND_BONUS_MAX` | 0.5 / 1.0 (kids may change) | | | |
| `SHARE_STEP` / `SHARE_DEFAULT` | 10 / 50 | | | |
| `hostMap` | {name}'s map | Mapa de {name} | Mapa de {name} | Карта: {name} |
| `shareLabel` | Coins for friends | Monedas para amigos | Moedas para amigos | Монетки друзьям |
| `shareInfo` | {name} shares {pct}% of the level's coins | {name} comparte el {pct}% de las monedas del nivel | {name} divide {pct}% das moedas do nível | {name} делится {pct}% монеток уровня |
| `shareChanged` | {name} now shares {pct}% | {name} ahora comparte el {pct}% | {name} agora divide {pct}% | Теперь {name} делится {pct}% |
| `rLevel` | Level | Nivel | Nível | Уровень |
| `rFriendsBonus` | Friends bonus | Bonus de amigos | Bônus de amigos | Бонус за друзей |
| `rToFriends` | To friends | Para los amigos | Para os amigos | Друзьям |
| `rYourShare` | Your share | Tu parte | Sua parte | Твоя доля |
| `openedForHost` | {name}: level {n} is open! | {name}: ¡nivel {n} abierto! | {name}: nível {n} liberado! | {name}: открылся уровень {n}! |

Use the pt word for "level" that `src/i18n.js` already uses, if it differs from "nível". The Russian lines are written so that the name stays in the nominative ("Быстрый Пингвин").
