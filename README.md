# BeBeBe Atrapar

A top-down arcade game designed by kids: the **Little Ones** team against the **Big One**.

- Sneak up **behind** the Big One and hug him — he loses a heart.
- If he **sees** you (yellow vision cone), he pushes you and your leg breaks: you can't move.
- A friend must stand next to you for 1 second to help you up. If nobody helps within 18 seconds, you're out.
- Your house is a safe zone: the Big One can't get in. Bushes hide you.
- After a push the Big One rests for 2.5 s (pale vision cone) and pushes nobody.
- After a hug he is shocked for 2.5 s: he can't move or push, and he can't be hugged again yet.
- 1–2 players + bots (5 Little Ones in total). Bots mostly rescue fallen friends.

## Play

Open `index.html` in any modern browser — no build, no dependencies.
Works on desktop, tablet and phone.

| Input | Player 1 | Player 2 |
|---|---|---|
| Keyboard | W A S D | Arrow keys |
| Touch | finger on the left half | finger on the right half |
| Gamepad | pad 1 | pad 2 |

`P` — pause, `M` — sound, `L` — language (English / Español (AR) / Русский).

## Skins

Menu → **Skins**: 8 looks for the Little Ones (Classic, Sunny, Sporty, King, Smarty, Ninja, Kitty, Pirate)
and 5 for the Big One (Classic, Ogre, Robot, Captain, Bear). Players can't pick the same look; bots get the rest.
Choices are remembered in the browser. Keyboard on the Skins screen: A/D — Player 1, ←/→ — Player 2, Z/X — Big One.

## Levels

Maps are generated from the level number (same number → same map). Level 1 follows the kids' drawing:
the Little Ones' house top-left, the Big One's house bottom-left, a building with rooms on the right,
pine trees, bushes, a pond and rocks. Each next level adds a heart and some speed to the Big One.

## Tuning

All gameplay numbers live in the `CFG` object at the top of the script (e.g. `HUG_STUN`, `PUSH_RECOVER`,
`BOT_ATTACK_PAUSE`); all texts live in `I18N`; skins live in `LITTLE_SKINS` / `BIG_SKINS`.
