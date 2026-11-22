# SPEC-004 — Air kisses

Status: ready
Complexity: M
Branch: SPEC-004-air-kisses
Decided by: the kids with Andrei (2026-11-21): air kisses are bought with coins, 5 for 20; a player sends one with a 💋 button, it flies where the player looks; a hit takes half a heart and the Big One blushes and stands still for a moment; only players send kisses, bots don't. Everything else (range, speed, half hearts, blush rules, no kissing from the house, layout): Claude (spec author).

## Description
A new shop item: **air kisses**. In play, a player presses 💋 (or a key) and a little pink heart flies straight ahead. If it reaches the Big One he blushes: he loses half a heart, stands still for 1.5 s and cannot push anyone, and while he blushes he **can** be hugged — so the best trick is a kiss from afar and then a hug from behind. Walls, trees and rocks stop kisses; water, ponds and bushes don't. A hug is still stronger, so kisses help but don't replace sneaking.

## Goal
- Players get a ranged move that costs coins, so coins have a second use besides gloves.
- The Big One's hearts can be halves; the hearts bar shows half hearts.
- Kisses never make the safe house a sniper nest.

## Context
- Shop: `mode === "shop"` draws two glove cards (`GLOVES` mittens/mega, `buyGloves`) and the "who wears what" rows; progress `progress.inv = { mittens, mega }`, saved in `bebebe-progress` (merge on load keeps old saves working — hard rule 7).
- Damage: `hug(l, a)` does `big.hp = Math.max(0, big.hp - power)`, sets `big.stun` (`HUG_STUN`, during which he can't be hugged), and the last hug triggers `pendingWin`. The hearts bar draws `big.maxHp` hearts filled while `i < big.hp`. `loseSub` and the speed boost read `big.maxHp - big.hp`.
- Input: per-player key maps in `resetWorld` (single player: WASD + arrows; two players: WASD / arrows); touch = drag anywhere is the joystick (P1 left half, P2 right half with two players); gamepads read via `navigator.getGamepads()`.
- Sight: `losWide(…, solid)` and the `seeGrid` (walls, trees, rocks block; ponds don't; bushes don't). SPEC-002 adds `water` (doesn't block sight), `cottage`, `maze`, `arena` walls (block).
- SPEC-003 adds `l.dizzy` and the danger zone; a dizzy Little One can't throw. Either order of merging works; the second one to land wires the other's state in.

## Out of scope
- Bots throwing kisses.
- Other ranged items, aiming with a second stick, kisses bouncing off walls.
- Coins for kiss hits (only hugs give `COINS_PER_HUG`).

## Acceptance criteria
### Shop and inventory
1. `KISSES = { price: 20, pack: 5 }`; `progress.inv.kisses` (missing in old saves → 0), one shared pool for both players. `buyKisses()` takes the coins and adds 5; not enough coins → the existing "not enough" behaviour. `resetProgress` clears it. → `tests/gameplay.spec.js` "buying air kisses", "old saves get 0 kisses"
2. The shop shows three cards in one row (mittens, mega mittens, air kisses) — each card: picture, name, description, "pack of 5", how many you have, buy button with the price. Fits at 960×640 in en/es/ru without overlaps (screenshot check). The kiss picture is a drawn pink lips/heart (canvas, no image file).

### Throwing
3. A player in state `ok`, not hugging, not dizzy (SPEC-003), with `inv.kisses > 0` and `kissCd <= 0` throws: one kiss is spent, `kissCd = CFG.KISS_COOLDOWN` = 1 s. A miss is still spent. → "throwing spends a kiss and has a cooldown"
4. Controls: single player — `KeyE` and `Space`; two players — P1 `KeyE`, P2 `Enter`/`NumpadEnter`; gamepad — a free face button (name it in the report). Touch: a round 💋 button with the count in the bottom corner on the player's side (single player: bottom right; two players: bottom left for P1, bottom right for P2), about 70 logic px; touches that start on it never start a joystick. The button is hidden when there are no kisses, greyed during the cooldown and in the house. → "kiss keys for one and two players", "touch kiss button does not move the player"
5. **Not from the house:** inside the safe zone the throw does nothing except a short pop text (table). → "no kisses from the safe house"
6. Flight: starts at the player's front, flies along `l.dir` at `CFG.KISS_SPEED` = 420 px/s up to `CFG.KISS_RANGE` = 224 px (7 cells); stops (with a small puff) on anything that blocks sight on the `seeGrid` (walls of every kind, trees, rocks, cottages) and at the map edge; passes over ponds, water and bushes. Drawn as a pink heart with a short sparkly trail at chest height. → "kisses stop at walls and fly over ponds"
7. **Hit:** a kiss within `big.r + CFG.KISS_HIT_PAD` (8 px) of the Big One hits from any side. If the Big One is not stunned after a hug and not already blushing: `big.hp -= 0.5` (never below 0), `big.blush = CFG.KISS_BLUSH` = 1.5 s, his face/cheeks turn red, hearts burst, pop text. While blushing he doesn't move or push, **can be hugged** (a hug ends the blush and starts the usual hug stun), and further kisses only give a heart burst without damage. After the blush he turns to the thrower and goes to chase (`big.state = "chase"`, `lastSeen` = thrower). → "a kiss takes half a heart and makes him blush", "kisses during shock or blush do no damage", "a blushing Big One can be hugged"
8. If a kiss takes the last half heart, the level is won exactly like after the last hug (`pendingWin`, rewards, stars). → "the last half heart by a kiss wins the level"

### Half hearts
9. `big.hp` may hold halves (only 0.5 steps; keep it exact). The hearts bar draws full, half (left half red, right half grey) and empty hearts. `loseSub` and the chase-speed boost work with halves (the speed boost counts whole hearts lost: `Math.floor(maxHp - hp)`). → "hearts bar shows half hearts" (screenshot check + unit check of the fill function)

### General
10. `__bb` gets `kisses` (the flying list), `throwKiss(playerIndex)`, `buyKisses`. All numbers in `CFG`/`KISSES`, all strings in en/es/ru, whole suite green.
11. Screenshots looked at (throwaway, not committed): the shop in three languages; a kiss in flight; the blushing Big One; a half heart in the bar; the touch button on a phone-landscape viewport with one and two players.

## Implementation steps
1. Failing tests for shop/inventory (AC 1), then `KISSES`, `buyKisses`, save merge.
2. Half hearts: tests (AC 9), fill function, hearts bar, `loseSub`, speed boost — check the existing hug tests still pass.
3. Throwing and flight: tests AC 3–6; `kissCd`, the flying list, sight-grid collision, keys, touch button (exclude its rect from joystick starts), gamepad.
4. Hit and blush: tests AC 7–8; `big.blush` in the Big One's update (no movement, no push), hug interaction, 3D blush (cheek material colour), win path.
5. Shop layout with three cards; screenshots (AC 11); whole suite, reviews, docs, merge, push, close — as in `RUN_M.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `KISSES.price` / `.pack` | 20 / 5 | | | |
| `KISS_COOLDOWN` | 1 s | | | |
| `KISS_SPEED` / `KISS_RANGE` | 420 px/s / 224 px | | | |
| `KISS_HIT_PAD` | 8 px | | | |
| `KISS_DAMAGE` | 0.5 heart | | | |
| `KISS_BLUSH` | 1.5 s | | | |
| `I18N.*.kisses` | shop card name | Air kisses | Besitos voladores | Воздушные поцелуи |
| `I18N.*.kissDesc` | shop description | Send from afar: ½ heart and he blushes | Mandalo de lejos: ½ corazón y se pone colorado | Издалека: ½ сердечка, и он краснеет |
| `I18N.*.kissHit` | pop text on hit | Mwah! | ¡Muak! | Чмок! |
| `I18N.*.noKissHome` | pop text in the house | Not from the house! | ¡Desde la casita no! | Из домика нельзя! |
| `I18N.*.blush` | pop text, Big One | So shy! | ¡Qué vergüenza! | Ой, смущён! |
| pack line | existing `pack(n)` | | | |

## Docs to update
`docs/game-design.md` (air kisses: price, controls, hit, blush, half hearts, no kissing from the house — kids' vs Claude's decisions), `docs/architecture.md` (`progress.inv.kisses`, `kissCd`, flying list, `big.blush`, half hearts, new `__bb` members), `README.md` (shop table, controls table).
