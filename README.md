# BeBeBe Atrapar

A top-down arcade game designed by kids: the **Little Ones** team against the **Big One**.

**Play:** https://andrei-danilin.github.io/bebebe-game/

- Sneak up **behind** the Big One and hug him — he loses a heart.
- If he **sees** you (yellow vision cone), he pushes you and your leg breaks: you can't move.
- A friend must stand next to you for 3 seconds to help you up. If the friend steps away, the progress slowly
  drains; if the friend gets pushed, it starts over. Bots set off to help 2–3 seconds after you fall.
  If nobody helps within 18 seconds, you limp home and rest there for 2 minutes, then come back.
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
- 1–2 players + bots (5 Little Ones in total). Bots mostly rescue fallen friends.

## Install on iPhone

1. Open https://andrei-danilin.github.io/bebebe-game/ in **Safari** (the menu shows a hint).
2. Tap **Share** ⬆️ → **Add to Home Screen** → **Add**.
3. Start **BeBeBe** from the home screen: full screen, no browser bar. Turn the phone sideways.

- After the first open it works **offline** (airplane mode too).
- The home-screen app keeps its **own progress**, separate from Safari (coins, stars and outfits from Safari do not carry over).
- The ring/silent switch mutes the sound; sound starts after the first tap.

## Install on Android

Open the link in **Chrome** → menu ⋮ → **Install app** (or **Add to Home screen**).

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
| Touch | finger on the left half | finger on the right half |
| Gamepad | pad 1 | pad 2 |
| Air kiss 💋 — keyboard | `E` or `Space` (one player) / `E` (two players) | `Enter` |
| Air kiss 💋 — touch | 💋 button bottom right (one player) / bottom left (two players) | 💋 button bottom right |
| Air kiss 💋 — gamepad | X (Xbox) / □ (PlayStation) | X / □ on pad 2 |

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
coins, gloves and air kisses. Win a level to unlock the next one.

| Stars | For |
|---|---|
| ⭐ | winning the level |
| ⭐ | nobody had to rest |
| ⭐ | winning fast: under `60 + 15 × level` seconds |

Coins for a win: `10 + 5 × level`, +10 if nobody had to rest, +10 if fast, +2 for every hug by a player,
−3 for every rest (never below 5). Bonus stars add +3 each on top (rests never eat them); they go into the
coin box the moment you pick them up, so you keep them even without a win.

**Shop** (menu, or after a level): gloves and air kisses, bought with coins in packs.

| Item | Price | Pack | Effect |
|---|---|---|---|
| Warm mittens | 30 | 3 power hugs | a hug takes 2 hearts |
| Mega hug mittens | 60 | 3 power hugs | a hug takes 3 hearts |
| 💋 Air kisses | 20 | 5 kisses | flies up to 7 cells; a hit takes ½ heart and the Big One blushes for 1.5 s |

Each player chooses which gloves to wear; a power hug uses one charge from the shared stock, and when it runs
out hugs are normal again. Gloves show on the character's hands; the HUD shows how many power hugs are left.
Air kisses are one shared stock for both players (bots don't throw them); each throw uses one, even a miss, and
a player can throw one per second. The Big One's hearts bar shows half hearts.
"Reset progress" (tap twice) starts over.

## Places

Park, Beach (palms, sandcastles, umbrellas, pool, sea), Winter (snowy pines, snowmen, snowdrifts, frozen pond,
snowfall) and Schoolyard (court lines, hopscotch, footballs, hedges, sandbox, school windows).
Menu → **Place**: *Auto* (changes every level) or a fixed place.

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

`CFG` — gameplay numbers (`HUG_STUN`, `PUSH_RECOVER`, `BOT_ATTACK_PAUSE`, `ITEM_*`, `SLIP_STUN`, `COINS_*`, `FAST_TIME`, `RESCUE_*`, `STAR_*`, `DANGER_*`, `NAME_MAX`, `KISS_*`, `PAD_KISS`, …),
`GLOVES` — gloves (power, price, pack size), `KISSES` — air kiss price and pack, `I18N` — texts,
`HAIRS` / `HATS` / `JACKETS` / `PANTS` / `BIG_SKINS` — outfits, `THEMES` — places, `LITTLE_SCALE` / `BIG_SCALE` — character size in 3D.

## Development

Work is spec-driven: Claude (in the claude.ai project "BeBeBe Atrapar") writes a spec with Andrei and the kids
into `specs/`, Claude Code implements it on a branch with tests first, reviews, merges into `master`.
Rules for Claude Code: [`CLAUDE.md`](CLAUDE.md). Game rules: [`docs/game-design.md`](docs/game-design.md).

```bash
npm run setup          # once: Playwright + three.js for the tests, Chromium, Claude Code agents
npx playwright test    # all tests: smoke, gameplay rules, i18n, PWA (starts scripts/serve.js itself)
npm run serve          # the game over http on http://localhost:8123/ (service worker, manifest)
npm run icons          # icons/icon.svg → the PNG app icons
```

Every push to `master` runs the tests on GitHub Actions and publishes the site (`index.html`, `manifest.webmanifest`,
`sw.js`, `icons/`, `v1-2d/`) to GitHub Pages (`.github/workflows/pages.yml`).

Run a spec: `claude --model opus` at the repo root, paste `docs/process/run-templates/RUN_S.md`
(or `RUN_M` / `RUN_L`, as the spec's `Complexity:` says) with the spec name filled in.
