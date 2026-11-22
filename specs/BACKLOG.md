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
- Decided during the run, check with the kids: the blushing Big One does not turn while blushing; afterwards he walks to where the thrower is (turning on the way) instead of snapping round.
- Decided during the run, check with the kids: a kiss on a Big One lying after a banana takes half a heart and he blushes; the blush time runs while he lies; if it ends before he stands up he just looks around (no chase).
- Decided during the run, check with the kids: bots do not run away from a blushing Big One (he cannot push); a kiss during his short stand after a push ends that stand.
- Decided during the run, check with the kids: a hit shows two pop texts ("Mwah!" and "So shy!"); a kiss during shock or blush only makes hearts; the lose screen writes half hearts as "2½".
