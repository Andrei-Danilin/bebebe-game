# SPEC-007 — Shorter rest (30 s) and the rescue kit 🩹

Status: done (7829676; phone shop fix 011f204)
Complexity: M
Branch: SPEC-007-rescue-kit
Decided by: Andrei and the kids (2026-11-22): a Little One nobody rescued rests 30 s instead of 2 minutes; a new shop item, the rescue kit, 3 for 15 coins, lets a player get up at once and go back into play — usable while lying with a broken leg, while limping home, and while resting in the house; only players use it. Everything else (keys, button place, protection time, coins/stars rules): Claude (spec author).

## Description
Two minutes in the house is too long for kids, so the rest becomes 30 s. And a new item in the shop: the **rescue kit** (🩹). When the player's Little One is down, limping home or resting, a 🩹 button appears; pressing it spends one kit and the Little One jumps up right where he is, with 2 s of protection, and plays on.

## Goal
- Being out of the game is short and can be skipped for coins.
- The kit never makes a player invulnerable for long and never helps bots.

## Context
- States: `ok → down → ok | home → rest → ok`; `updateDowned` (rescue, `DOWN_TIME`), `updateResting` (`HOME_SPEED`, `restSpot`, `REST_TIME` 120 → `restTimer`), `stats.rests++` when a Little One gives up waiting and walks home; rest penalty `COINS_PER_REST` and the "nobody out" star read `stats.rests`. Texts: the help line uses `Math.round(CFG.REST_TIME / 60)` minutes in en/es/ru; `restText` shows the countdown.
- Shop: three cards (mittens, mega mittens, air kisses) on desktop and phone layouts; `progress.inv = { mittens, mega, kisses }` with merge on load (hard rule 7); `buyKisses` pattern; `resetProgress`.
- Kiss button (SPEC-004): touch button on the player's side (phone: bottom right, ≥ 44 CSS px; SPEC-005), keys E/Space (one player), P1 E / P2 Enter (two players); hidden when there are no kisses.
- SPEC-006 (four worlds) may land before or after; nothing here depends on it.

## Out of scope
- Using a kit on a friend or a bot; bots using kits.
- Changing `DOWN_TIME`, the rescue time or the rest penalty.

## Acceptance criteria
### Rest
1. `CFG.REST_TIME` = 30. The help/rules texts in en/es/ru speak in seconds ("rest for 30 s"), computed from `REST_TIME` (no hard-coded number). `restText` countdown as today. → `tests/gameplay.spec.js` "an unrescued Little One rests 30 seconds" (update the existing rest test)

### Rescue kit
2. `RESCUE_KIT = { price: 15, pack: 3 }`; `progress.inv.rescues` (old saves → 0), one shared pool for both players; `buyRescueKit()` like `buyKisses`; `resetProgress` clears it. → "buying rescue kits", "old saves get 0 kits"
3. Shop: a fourth card (picture: a drawn band-aid with a little heart, canvas only), name, description, "pack of 3", how many you have, buy button with the price — desktop and phone layouts, fits in en/es/ru without overlaps, phone buttons ≥ 44×44 CSS px. → screenshot check
4. **Use:** a player Little One in state `down`, `home` or `rest`, with `inv.rescues > 0`: one kit is spent, state → `ok` right where he is (inside the house he simply walks out), `invuln = CFG.KIT_INVULN` (2 s), `rescue`/`downTimer`/`restTimer`/`path` reset, if he was the `attackToken` nothing changes for bots; pop text, a sparkle and the rescue sound. → "a kit gets a downed player up at once", "a kit ends limping home", "a kit ends the rest"
5. **Stats:** using a kit while `down` (before the down timer ran out) is not a rest — no penalty, the "nobody out" star stays possible. Using it in `home`/`rest` does not undo the rest already counted. → "a kit while down keeps the nobody-out star"
6. **Controls:** one player — `KeyQ`; two players — P1 `KeyQ`, P2 `ShiftRight`; gamepad — a free face button (name it in the report). Touch: the 🩹 button with the count appears in the kiss button's place while the player is down/home/rest (the kiss button can't be used then anyway) and only if he has kits; the same size rules; touches on it never start a joystick. Nothing happens for bots, for a player in state `ok`, or with 0 kits (no kit spent). → "kit keys for one and two players", "the kit button shows only when it can be used"
7. A short hint the first time a player goes down while owning kits: "Press 🩹 to get up!" (once per level). → screenshot check
8. `__bb` gets `useRescueKit(playerIndex)`, `buyRescueKit`; all numbers in `CFG`/`RESCUE_KIT`; strings in en/es/ru; whole suite green.
9. Screenshots looked at (throwaway): the shop with four cards (desktop + phone, three languages), the 🩹 button on the phone while down, the hint.
10. **Phone shop text never overlaps** (post-merge fix). At 667×375, 844×390 and 932×430, in en/es/ru, the four shop cards' texts (name, description, pack, have, "not enough coins") never overlap each other, the picture or the buy button, and never drop below the `PHONE_TEXT` minimums — measured with the real text widths and again with a simulated 15 % wider font (CI and iPhone fonts are wider than Windows). When a card runs out of room the layout gives up space step by step (smaller picture, "you have" as a badge, then shorter pack text) instead of overlapping. → `tests/phone.spec.js` "the phone shop fits with wider fonts"

## Post-merge fix
The first deploy of the merge (7829676, run 45076714728) was red on CI only: at 667×375 in Spanish, with the Linux fonts, the names wrapped to two lines and the kisses description to three, so `card-desc:kisses` overlapped `card-pack:kisses` (`tests/phone.spec.js` "every phone button is big enough at 667×375"). AC 10 was added and fixed on branch `SPEC-007-phone-shop-fix` before the spec was closed.

## Implementation steps
1. Failing tests: rest 30 s (AC 1), inventory and migration (AC 2), use cases (AC 4–5).
2. `REST_TIME`, texts; `RESCUE_KIT`, `buyRescueKit`, inventory merge, `resetProgress`.
3. `useRescueKit` and the state resets; stats rule.
4. Keys, touch button (shared slot with the kiss button), gamepad; the first-time hint.
5. Shop fourth card for desktop and phone; screenshots; whole suite, reviews, docs, merge, push, close — as `RUN_M.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `REST_TIME` | 30 s | | | |
| `RESCUE_KIT.price` / `.pack` | 15 / 3 | | | |
| `KIT_INVULN` | 2 s | | | |
| `I18N.*.kit` | shop card | Rescue kit | Curita mágica | Спасалка |
| `I18N.*.kitDesc` | shop description | Get up at once and play on | Levantate al toque y seguí jugando | Сразу встать и играть дальше |
| `I18N.*.kitUsed` | pop text | Back in the game! | ¡De vuelta al juego! | Снова в игре! |
| `I18N.*.kitHint` | first-time hint | Press 🩹 to get up! | ¡Tocá 🩹 para levantarte! | Нажми 🩹, чтобы встать! |
| rest help line | seconds from `REST_TIME` | …rest for ${s} s | …descansás ${s} segundos | …отдыхаешь ${s} сек |

## Docs to update
`docs/game-design.md` (rest 30 s, rescue kit — kids' vs Claude's decisions), `docs/architecture.md` (`inv.rescues`, `useRescueKit`, the shared button slot), `README.md` (shop table, controls).
