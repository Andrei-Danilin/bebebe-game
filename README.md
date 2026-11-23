# BeBeBe Atrapar

A top-down arcade game designed by kids: the **Little Ones** team against the **Big One**.

**Play:** https://andrei-danilin.github.io/bebebe-game/

- Sneak up **behind** the Big One and hug him — he loses a heart.
- If he **sees** you (yellow vision cone), he pushes you and your leg breaks: you can't move.
- A friend must stand next to you for 3 seconds to help you up. If the friend steps away, the progress slowly
  drains; if the friend gets pushed, it starts over. Bots set off to help 2–3 seconds after you fall.
  If nobody helps within 18 seconds, you limp home and rest there for 30 seconds, then come back.
  There is no game over — but every rest costs coins (−3).
- After a push the Big One rests for 2.5 s (pale vision cone) and pushes nobody.
- After a hug he is shocked for 2.5 s: he can't move or push, and he can't be hugged again yet.
- Your house is a safe zone: the Big One can't get in. Bushes hide you.
- The Big One's house is not for you: stay inside for 5 seconds (a big "3, 2, 1" warns you) and he throws you
  out of the door — "Get out of my house!" You are dizzy for 2 seconds (you can't move, but he can't push you
  either); your leg is fine.
- Golden **bonus stars** pop up around the map now and then: run over one for +3 coins. Only players can pick
  them up — bots leave them to you.
- When you hug him, you jump on his back for a second — hearts everywhere.
- **Air kisses** (from the shop): send one from afar and it flies where you look. A hit takes half a heart and the
  Big One blushes for 1.5 s: he stands still, pushes nobody — and you can hug him from behind. Walls, trees and
  rocks stop a kiss; ponds and bushes don't. No kissing from your house.
- **Rescue kits** 🩹 (from the shop): while your leg is broken, while you limp home or while you rest in the
  house, use one and you jump up right where you are, with 2 s of protection. Used before the 18 seconds run
  out, it doesn't count as a rest (no coin penalty, the "nobody rested" star stays). Only players use them.
- 1–2 players + bots (5 Little Ones in total; one player on a phone). Bots mostly rescue fallen friends.

## Install on iPhone

1. Open https://andrei-danilin.github.io/bebebe-game/ in **Safari** (the menu shows a hint).
2. Tap **Share** ⬆️ → **Add to Home Screen** → **Add**.
3. Start **BeBeBe** from the home screen: full screen, no browser bar. Turn the phone sideways.

- After the first open it works **offline** (airplane mode too).
- The home-screen app keeps its **own progress**, separate from Safari (coins, stars and outfits from Safari do not carry over).
- The ring/silent switch mutes the sound; sound starts after the first tap.

## Install on Android

Open the link in **Chrome** → menu ⋮ → **Install app** (or **Add to Home screen**).

## Playing on a phone

On a phone (held sideways) the game switches to **phone mode**; iPads and computers keep the normal view.

- The game fills the whole screen (clear of the notch and the home bar).
- The camera comes closer — about half of the map, 10 rows tall — and follows your hero, so everyone is
  twice as big.
- A **mini-map** in the top-right corner shows the whole level: walls, both houses, you, your friends, the Big One
  with his vision cone, stars and items, and a frame of what the screen shows. Fallen friends blink.
- When the Big One or a fallen friend is off screen, an **arrow at the screen edge** points to them
  (red with a heart = the Big One, green with ❗ = a friend who needs help).
- Put a finger anywhere on the **left part** of the screen: the joystick appears right there. The right part is
  for buttons; the 💋 button is bottom right (while you are down, limping or resting, the 🩹 button takes its place).
- Big buttons and texts; menus laid out for a wide, short screen.
- **One player** only (bots fill the team).

A phone is a touch screen whose short side is at most 500 CSS px. To force it: add `?phone=1` to the address
(phone mode on any device, handy for trying it on a computer) or `?phone=0` (never phone mode).

## Versions

| Folder | What | Needs internet |
|---|---|---|
| `index.html` | **v2 — 3D** (Three.js r187, toon shading, outlines, shadows) | the first time (three.js from jsDelivr); offline afterwards when opened from the web |
| `v1-2d/index.html` | v1 — 2D canvas version | no |

Open the file in any modern browser — no build step. Works on desktop, tablet and phone.

## Controls

| Input | Player 1 | Player 2 |
|---|---|---|
| Keyboard | W A S D | Arrow keys |
| Touch | finger on the left half (phone: joystick under the finger, left part of the screen) | finger on the right half (not on a phone) |
| Gamepad | pad 1 | pad 2 |
| Air kiss 💋 — keyboard | `E` or `Space` (one player) / `E` (two players) | `Enter` |
| Air kiss 💋 — touch | 💋 button bottom right (one player) / bottom left (two players) | 💋 button bottom right |
| Air kiss 💋 — gamepad | X (Xbox) / □ (PlayStation) | X / □ on pad 2 |
| Rescue kit 🩹 — keyboard | `Q` | `Right Shift` |
| Rescue kit 🩹 — touch | 🩹 button in the 💋 button's place (shows only while you are down, limping home or resting, and have kits) | 🩹 button in the 💋 button's place |
| Rescue kit 🩹 — gamepad | Y (Xbox) / △ (PlayStation) | Y / △ on pad 2 |

`P` — pause, `M` — sound, `L` — language (English / Español (AR) / Русский).

In the menu: `↑` / `↓` (or the gamepad D-pad up/down) switch worlds, `←` / `→` (D-pad left/right) pick the level;
on a touch screen tap a world card and the ◀ ▶ buttons.

## Items

Items pop up on the map every 7–11 s (max 3, they vanish after 20 s):

| Item | Effect |
|---|---|
| 👟 Speed boots | 1.55× faster for 6 s |
| 👻 Invisibility potion | the Big One can't see you for 6 s |
| 🛡 Shield | blocks one push |
| 🍌 Banana | a trap for the Big One: he slips and lies down for 2.5 s — and can be hugged from any side |

## Progress, coins and the shop

Progress is saved in the browser (`localStorage`, key `bebebe-progress`): unlocked levels and best stars in each
world, the last world you picked, coins, gloves, air kisses and rescue kits. Win a level to unlock the next one in that world.
Saves from before the worlds move into the Park (levels above 20 are dropped; coins, gloves, kisses and names stay).

In the table, `n` is the level number in its world (1–20) and `w` the world: Park 0, School 1, Beach 2, Winter 3.

| Stars | For |
|---|---|
| ⭐ | winning the level |
| ⭐ | nobody had to rest |
| ⭐ | winning fast: under `60 + 15 × n + 10 × w` seconds |

Coins for a win: `10 + 5 × n + 10 × w`, +10 if nobody had to rest, +10 if fast, +2 for every hug by a player,
−3 for every rest (never below 5). Bonus stars add +3 each on top (rests never eat them); they go into the
coin box the moment you pick them up, so you keep them even without a win.

**Shop** (menu, or after a level): gloves, air kisses and rescue kits, bought with coins in packs.

| Item | Price | Pack | Effect |
|---|---|---|---|
| Warm mittens | 30 | 3 power hugs | a hug takes 2 hearts |
| Mega hug mittens | 60 | 3 power hugs | a hug takes 3 hearts |
| 💋 Air kisses | 20 | 5 kisses | flies up to 7 cells; a hit takes ½ heart and the Big One blushes for 1.5 s |
| 🩹 Rescue kit | 15 | 3 kits | get up at once (down, limping home or resting) with 2 s of protection |

Each player chooses which gloves to wear; a power hug uses one charge from the shared stock, and when it runs
out hugs are normal again. Gloves show on the character's hands; the HUD shows how many power hugs are left.
Air kisses are one shared stock for both players (bots don't throw them); each throw uses one, even a miss, and
a player can throw one per second. Rescue kits are one shared stock too; the first time a player with kits
falls in a level, a hint says "Press 🩹 to get up!". The Big One's hearts bar shows half hearts.
"Reset progress" (tap twice) starts over.

## Worlds

Four worlds of 20 levels each, all open from the start: **Park**, **School** (court lines, hopscotch, footballs,
hedges, sandbox, school windows), **Beach** (palms, sandcastles, umbrellas, pool, sea) and **Winter** (snowy pines,
snowmen, snowdrifts, frozen pond, snowfall). The menu shows the four worlds as cards (name, a small picture, stars
collected out of 60); under them you pick a level of the selected world. Levels open one by one inside each world.
After level 20 the win screen says the world is done and offers the menu and the shop.

## Outfits

Menu → **Skins**: each player builds an outfit from 4 parts — hair (8), hat (12), jacket (10, incl. hoodies,
superhero cape, ninja) and pants (8, incl. shorts); 🎲 picks a random outfit. The Big One has 5 looks
(Classic, Ogre, Robot, Captain, Bear). Bots get different outfits every level.

## Names

Player 1, Player 2, the Big One and the four bot friends have names. On the **Skins** screen tap the name under
a character (✏️) and type a new one — up to 12 characters, emoji welcome; Enter or a tap outside saves, Escape
cancels. **👥 Friends** opens the bot names. Names float above heads in the game, and the Big One's name starts
the hearts bar — call him "Papá"! Untouched names follow the language (e.g. bots Bo, Mia, Tom, Lulu in English);
typed names are kept. Saved in the browser (`localStorage`, key `bebebe-names`).

## Levels

Maps are generated from the world and the level number: the same level always gives the same map, and each
world has its own maps. Inside every world the levels go from open maps to the mazes:

| Levels | Type | What it is like |
|---|---|---|
| 1 | Our drawing | the kids' own map: the Little Ones' house top-left, the Big One's house bottom-left, a building with rooms on the right, pine trees, bushes, a pond and rocks (the same map in every world) |
| 2–4 | Meadow | open grass: the Big One sees far, only bushes hide you |
| 5–7 | Village | little cottages with roofs, streets between them and a square with a fountain |
| 8–10 | River with bridges | the houses are on opposite banks; you can see across the water but cross only on the bridges |
| 11–13 | House with rooms | a big building with rooms and doors, careful in the doorways; some rooms have two doors |
| 14–16 | Ring arena | a ring of walls with gaps around a block in the middle, made for chases |
| 17–20 | Maze | hedge corridors to sneak around corners, with one or two open plazas |

Later levels of the same type have one bush fewer each. When a level starts, a banner shows
"World · Level N: type" (e.g. "Park · Level 17: Maze"); the menu shows the type of the selected level. Every
world has its own look for each type: hedges, lockers, fences or snow walls in the maze, a blue, canal,
turquoise or icy river, and so on. Every level is checked to be fair: nobody gets stuck, the Big One can go
everywhere except your house, and both houses' doors are clear.

The Big One gets a little faster with each level of a world, and each next world starts a little faster than
the one before. He never runs faster than 95 % of a player without boots, even when angry. His hearts:

| World | Level 1 | Level 20 |
|---|---|---|
| Park | 6 | 10 |
| School | 7 | 11 |
| Beach | 8 | 12 |
| Winter | 9 | 12 |

## How v2 is built

One HTML file, one ES module:

- **Game logic** (rules, bots, A* pathfinding, level generator, input) is shared with v1 and works in the
  same 960×640 "logic pixels" (32 px = 1 cell = 1 unit in 3D).
- **3D layer** (`#gl` canvas): Three.js scene built from the generated level — walls, trees, bushes,
  pond, rocks, fence, decorative forest; characters are assembled from primitives with `MeshToonMaterial`
  and inverted-hull outlines; the vision cone is a ground mesh rebuilt each frame with ray marching.
- **2D layer** (`#game` canvas on top): menus, HUD, name tags, rescue timers, the phone mini-map — positions are
  projected from 3D with `toScreen()`. On a phone the camera follows the hero and the 2D layer has its own size. The Skins screen cuts "windows" in this layer where 3D previews are rendered
  with scissor viewports.

## Tuning

`CFG` — gameplay numbers (`HUG_STUN`, `PUSH_RECOVER`, `BOT_ATTACK_PAUSE`, `ITEM_*`, `SLIP_STUN`, `COINS_*`, `FAST_TIME`, `RESCUE_*`, `STAR_*`, `DANGER_*`, `NAME_MAX`, `KISS_*`, `PAD_KISS`, `REST_TIME`, `KIT_*`, `PAD_KIT`, `WORLD_TYPES` (level types in a world), difficulty `WORLD_SPEED_START` / `SPEED_PER_LEVEL` / `CHASE_MAX_SHARE` / `HP_*`, `LAYOUT` (level type sizes), `BANNER_*`, fairness limits, phone mode `PHONE_*` / `CAM_*` / `MINIMAP_*` / `STICK_ZONE`, …),
`GLOVES` — gloves (power, price, pack size), `KISSES` — air kiss price and pack, `RESCUE_KIT` — rescue kit price and pack, `I18N` — texts,
`HAIRS` / `HATS` / `JACKETS` / `PANTS` / `BIG_SKINS` — outfits, `THEMES` — worlds (places), `LITTLE_SCALE` / `BIG_SCALE` — character size in 3D.

## Development

Work is spec-driven: Claude (in the claude.ai project "BeBeBe Atrapar") writes a spec with Andrei and the kids
into `specs/`, Claude Code implements it on a branch with tests first, reviews, merges into `master`.
Rules for Claude Code: [`CLAUDE.md`](CLAUDE.md). Game rules: [`docs/game-design.md`](docs/game-design.md).

```bash
npm run setup          # once: Playwright + three.js for the tests, Chromium, Claude Code agents
npm run test:fast      # the @fast set while working (~1.5 min)
npx playwright test    # all tests: smoke, gameplay rules, levels, phone, i18n, PWA (~10 min; starts scripts/serve.js itself)
npm run serve          # the game over http on http://localhost:8123/ (service worker, manifest)
npm run icons          # icons/icon.svg → the PNG app icons
npm run docs:numbers   # rewrite the generated numbers table in docs/game-design.md from index.html (-- --check: only check)
npm run balance        # play every level with the autopilot in sim mode → reports/balance.md + reports/balance.json
```

Every push to `master` runs the tests on GitHub Actions and publishes the site (`index.html`, `manifest.webmanifest`,
`sw.js`, `icons/`, `v1-2d/`) to GitHub Pages (`.github/workflows/pages.yml`).

A spec that changes gameplay numbers or rules runs `npm run balance` before the merge and commits the updated
`reports/balance.*`; the numbers table in `docs/game-design.md` is generated (`npm run docs:numbers`), never edited by hand.

Run a spec: `claude --model opus` at the repo root, paste `docs/process/run-templates/RUN_S.md`
(or `RUN_M` / `RUN_L`, as the spec's `Complexity:` says) with the spec name filled in.
