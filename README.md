# BeBeBe Atrapar

A top-down arcade game designed by kids: the **Little Ones** team against the **Big One**.

- Sneak up **behind** the Big One and hug him — he loses a heart.
- If he **sees** you (yellow vision cone), he pushes you and your leg breaks: you can't move.
- A friend must stand next to you for 1 second to help you up. If nobody helps within 18 seconds, you're out.
- After a push the Big One rests for 2.5 s (pale vision cone) and pushes nobody.
- After a hug he is shocked for 2.5 s: he can't move or push, and he can't be hugged again yet.
- Your house is a safe zone: the Big One can't get in. Bushes hide you.
- 1–2 players + bots (5 Little Ones in total). Bots mostly rescue fallen friends.

## Versions

| Folder | What | Needs internet |
|---|---|---|
| `index.html` | **v2 — 3D** (Three.js r187, toon shading, outlines, shadows) | yes, loads three.js from jsDelivr |
| `v1-2d/index.html` | v1 — 2D canvas version | no |

Open the file in any modern browser — no build step. Works on desktop, tablet and phone.

## Controls

| Input | Player 1 | Player 2 |
|---|---|---|
| Keyboard | W A S D | Arrow keys |
| Touch | finger on the left half | finger on the right half |
| Gamepad | pad 1 | pad 2 |

`P` — pause, `M` — sound, `L` — language (English / Español (AR) / Русский).

## Skins

Menu → **Skins**: 8 looks for the Little Ones (Classic, Sunny, Sporty, King, Smarty, Ninja, Kitty, Pirate)
and 5 for the Big One (Classic, Ogre, Robot, Captain, Bear). Players can't pick the same look; bots get the rest.
Keyboard on the Skins screen: A/D — Player 1, ←/→ — Player 2, Z/X — Big One.

## Levels

Maps are generated from the level number (same number → same map). Level 1 follows the kids' drawing:
the Little Ones' house top-left, the Big One's house bottom-left, a building with rooms on the right,
pine trees, bushes, a pond and rocks. Each next level adds a heart and some speed to the Big One.

## How v2 is built

One HTML file, one ES module:

- **Game logic** (rules, bots, A* pathfinding, level generator, input) is shared with v1 and works in the
  same 960×640 "logic pixels" (32 px = 1 cell = 1 unit in 3D).
- **3D layer** (`#gl` canvas): Three.js scene built from the generated level — walls, trees, bushes,
  pond, rocks, fence, decorative forest; characters are assembled from primitives with `MeshToonMaterial`
  and inverted-hull outlines; the vision cone is a ground mesh rebuilt each frame with ray marching.
- **2D layer** (`#game` canvas on top): menus, HUD, name tags, rescue timers — positions are projected
  from 3D with `toScreen()`. The Skins screen cuts "windows" in this layer where 3D previews are rendered
  with scissor viewports.

## Tuning

`CFG` — gameplay numbers (`HUG_STUN`, `PUSH_RECOVER`, `BOT_ATTACK_PAUSE`, …), `I18N` — texts,
`LITTLE_SKINS` / `BIG_SKINS` — skins, `LITTLE_SCALE` / `BIG_SCALE` — character size in 3D.
