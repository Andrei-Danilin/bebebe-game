# BeBeBe Atrapar

A top-down arcade game designed by kids: the **Little Ones** team against the **Big One**.

- Sneak up **behind** the Big One and hug him — he loses a heart.
- If he **sees** you (yellow vision cone), he pushes you and your leg breaks: you can't move.
- A friend must stand next to you for 1 second to help you up. If nobody helps within 18 seconds, you're out.
- After a push the Big One rests for 2.5 s (pale vision cone) and pushes nobody.
- After a hug he is shocked for 2.5 s: he can't move or push, and he can't be hugged again yet.
- Your house is a safe zone: the Big One can't get in. Bushes hide you.
- When you hug him, you jump on his back for a second — hearts everywhere.
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

## Items

Items pop up on the map every 7–11 s (max 3, they vanish after 20 s):

| Item | Effect |
|---|---|
| 👟 Speed boots | 1.55× faster for 6 s |
| 👻 Invisibility potion | the Big One can't see you for 6 s |
| 🛡 Shield | blocks one push |
| 🍌 Banana | a trap for the Big One: he slips and lies down for 2.5 s — and can be hugged from any side |

## Progress, coins and the shop

Progress is saved in the browser (`localStorage`, key `bebebe-progress`): unlocked levels, best stars per level,
coins and gloves. Win a level to unlock the next one.

| Stars | For |
|---|---|
| ⭐ | winning the level |
| ⭐ | nobody was out |
| ⭐ | winning fast: under `60 + 15 × level` seconds |

Coins for a win: `10 + 5 × level`, +10 if nobody was out, +10 if fast, +2 for every hug by a player.
A lost level still pays +2 per player hug.

**Shop** (menu, or after a level): gloves bought with coins as packs of power hugs.

| Gloves | Price | Pack | Effect |
|---|---|---|---|
| Warm mittens | 30 | 3 power hugs | a hug takes 2 hearts |
| Mega hug mittens | 60 | 3 power hugs | a hug takes 3 hearts |

Each player chooses which gloves to wear; a power hug uses one charge from the shared stock, and when it runs
out hugs are normal again. Gloves show on the character's hands; the HUD shows how many power hugs are left.
"Reset progress" (tap twice) starts over.

## Places

Park, Beach (palms, sandcastles, umbrellas, pool, sea), Winter (snowy pines, snowmen, snowdrifts, frozen pond,
snowfall) and Schoolyard (court lines, hopscotch, footballs, hedges, sandbox, school windows).
Menu → **Place**: *Auto* (changes every level) or a fixed place.

## Outfits

Menu → **Skins**: each player builds an outfit from 4 parts — hair (8), hat (12), jacket (10, incl. hoodies,
superhero cape, ninja) and pants (8, incl. shorts); 🎲 picks a random outfit. The Big One has 5 looks
(Classic, Ogre, Robot, Captain, Bear). Bots get different outfits every level.

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

`CFG` — gameplay numbers (`HUG_STUN`, `PUSH_RECOVER`, `BOT_ATTACK_PAUSE`, `ITEM_*`, `SLIP_STUN`, `COINS_*`, `FAST_TIME`, …),
`GLOVES` — gloves (power, price, pack size), `I18N` — texts,
`HAIRS` / `HATS` / `JACKETS` / `PANTS` / `BIG_SKINS` — outfits, `THEMES` — places, `LITTLE_SCALE` / `BIG_SCALE` — character size in 3D.
