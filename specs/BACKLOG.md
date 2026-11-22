# Backlog — ideas and open points (not specs yet)

One line each: what, where it came from. The spec author turns a line into a spec when Andrei and the kids want it.

- Option: gloves bought once and kept forever instead of charges (Claude's choice in the shop; kids may prefer permanent).
- Offline 3D: ship three.js in the repo (then the game needs a tiny local server instead of double-click).
- Progress shared between devices (needs a server-side save; today it is per browser).
- More items: trampoline, snowballs (winter), water pistol (beach) — Claude's suggestions, not asked yet.
- Hug visibility when the Big One faces the camera (the Little One on his shoulders is partly hidden).
- The lose screen code is unreachable since "no game over" — remove it or reuse it for a "Give up" button.
- `index.html` is ~2,950 lines: consider splitting into modules (needs a decision: it breaks "opens by double-click" from file://).
- Progress between Safari and the installed iPhone app (separate storage on iOS) — out of scope in SPEC-001.
- `navigator.storage.persist()` once, so iOS is less likely to clear the home-screen app's progress when the phone is low on space (SPEC-001 architect review).
- An "update available" hint in the installed app (today a new version shows on the next launch, because `index.html` is network-first) — SPEC-001 run.
- SPEC-003 run, open point: a Little One knocked down **inside** the Big One's house can only be rescued by a player (bots leave the house after 2 s, a rescue takes 3 s).
- SPEC-003 run, open point: the menu rules do not mention the bonus stars and the dangerous Big One's house yet (the six rule lines are full).
- SPEC-003 balance: with 1 idle player, bots rescue ~55 % of bot falls (before: ~100 %); most unrescued falls are one chain per level where the Big One picks off each bot that comes to help. Maybe the kids want the bots to wait until the Big One walks away.
- Decided during the run, check with the kids: star coins go into the coin box the moment a star is picked up (so they are kept if the level is left or the page closed); the win screen shows them as their own line and inside the total.
- Decided during the run, check with the kids: the Big One's house has two doors; a Little One who stays too long is thrown out 2 cells outside the door nearest to him.
- Decided during the run, check with the kids: "6 cells from the safe house door" for stars is measured in a straight line from the house walls (so from both doors).
- Decided during the run, check with the kids: a push blocked by the shield also resets the rescue the helper was doing.
- Decided during the run, check with the kids: while dizzy a Little One also cannot hug; his house timer pauses while he rides on the Big One's shoulders.
- Decided during the run, check with the kids: the small HUD chips keep "Me" / "1" / "2" / "B"; names are shown above heads, in the hearts bar, in "HELP!" and in the resting bar.
- Decided during the run, check with the kids: opening a name field and closing it without a change keeps the language default (only a changed name counts as typed).
- SPEC-004 run, open point: the menu controls line does not mention the kiss keys yet (E / Space, two players E / Enter, gamepad X) and the six rule lines do not mention air kisses.
- Decided during the run, check with the kids: the kiss button on the gamepad is X (Xbox) / □ (PlayStation); in a two-player game the second gamepad throws for player 2.
- Decided during the run, check with the kids: Space throws a kiss only in a one-player game (with two players: E and Enter).
- Decided during the run, check with the kids: the kiss shop card says "Pack: 5 air kisses" and "You have: N kisses" (new texts; the glove texts talk about power hugs).
- Decided during the run, check with the kids: on a keyboard the HUD shows "💋 ×N" next to the mittens; on a touch screen the count is on the 💋 button. The button is also grey when the player is down, dizzy or on the Big One's shoulders.
- Decided during the run, check with the kids: the blushing Big One does not turn while blushing; when the blush ends he turns to face the thrower at once and goes after him.
- Decided during the run, check with the kids: a kiss on a Big One lying after a banana takes half a heart and he blushes; the blush time runs while he lies; if it ends before he stands up he just looks around (no chase).
- Decided during the run, check with the kids: bots do not run away from a blushing Big One (he cannot push); a kiss during his short stand after a push ends that stand.
- Decided during the run, check with the kids: a kiss does no damage in the last 0.3 s after a hug's shock (while he cannot be hugged yet), so a kiss never makes a blush nobody can hug; a kiss never hits him through a wall (it needs a clear line to him).
- Decided during the run, check with the kids: a hit shows two pop texts ("Mwah!" and "So shy!"); a kiss during shock or blush only makes hearts; the lose screen writes half hearts as "2½".
- SPEC-002 decided during the run, check with Andrei: fairness rule 3 (house path 18–70) is not enforced on level 1 — the kids' drawing has the two houses' doors facing each other (path 8) and level 1 must not change; its value is still reported.
- SPEC-002 decided during the run, check with Andrei: the house path (rule 3) is the A* path length in cells on the Big One's grid with a diagonal step counted as √2, from any Big One door to the cell in front of any Little Ones' door (the shortest pair).
- SPEC-002 decided during the run, check with Andrei: dead ends (rule 6) are measured on the places where the Big One fits (2×2 free windows of his grid), because a 2-cell corridor has no cell with exactly one free neighbour; a dead-end corridor is a chain of such windows that ends; pockets 3+ cells wide count as rooms. In the maze only dead ends outside the two houses and their door aprons are counted.
- SPEC-002 decided during the run, check with Andrei: on open level types (meadow, village, arena) the Big One's house is always on the diagonal from the Little Ones' house (same-side houses there are always closer than 18 cells); maze, rooms and river may also put them on the same side. The mirror still chooses which corners.
- SPEC-002 decided during the run, check with Andrei: the river runs top to bottom only when the houses are on the diagonal (otherwise both houses would be on one bank); with houses on the same side its bridges are not next to the houses (so the Big One's way to the Little Ones' door stays ≥ 18 cells).
