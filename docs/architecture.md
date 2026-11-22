# Architecture — bebebe-game v2 (3D)

One `index.html`: a small non-module script (offline hint) and one `<script type="module">` that imports Three.js r187 from jsDelivr. Two stacked canvases inside `#wrap`: `#gl` (WebGL, Three.js) below, `#game` (2D, UI and input) on top.

## Layers (keep them apart)
1. **Logic** — world, level generator, pathfinding, rules, bots, the Big One, items, progress. Works in "logic pixels": 960×640, `CELL = 32` (1 cell = 1 unit in 3D). Knows nothing about Three.js.
2. **3D** — builds meshes from the world (`buildMap3D`, `buildCharacters`) and copies state into them every frame (`syncScene` → `syncLittle`, `syncBig`, `syncItems`, `updateCone`). Only reads game state.
3. **2D UI** — menus, HUD, name tags, timers, shop, skins screen; positions of world things via `toScreen(x, y, heightPx)`. Buttons are registered each frame in `buttons[]` and hit-tested on `pointerdown`.

## Sections of index.html (approximate lines; search the header comment)
| Lines | Section |
|---|---|
| 40–83 | `CFG` (all game numbers), `GLOVES` |
| 84–188 | `I18N` (en / es / ru), `setLang` |
| 189–213 | screen, `fit()` (letterboxing, DPR) |
| 214–279 | helpers, world state (`obstacles`, `bushes`, grids, `safeZone`, `inSafe`) |
| 280–486 | level generator (`generateLevel`, seeded by level; `applyWorld`, `loadLevel`), A* (`findPath`) |
| 487–561 | movement (`resolveWalls`, `steerTo`, `inCone`, `randomFreePoint`) |
| 562–745 | characters data: outfits (`HAIRS`, `HATS`, `JACKETS`, `PANTS`, `makeLook`), `BIG_SKINS`, places (`PLACES`, `currentPlace`), **progress** (`progress`, `giveReward`, `buyGloves`, `setEquip`), `makeLittle`, `resetWorld`, `startGame` |
| 746–775 | sound (`beep`, `SFX`) |
| 776–901 | input: keyboard `onKey`, touch sticks, gamepads, `inputFor` |
| 902–1271 | **logic**: `canSee`, `push`, `hug`, `updateHugAnim`, items (`spawnItem`, `updateItems`), `updatePlayers`, `updateBots`, `updateBig`, `separate`, `checkContacts`, `updateDowned`, `updateResting`, `update` |
| 1272–1581 | 2D layer: drawing helpers, `drawMarkers`, `drawFx`, `drawHUD`, `drawOverlay` (menu, skins, shop, pause, win, lose), `drawUI` |
| 1582–1676 | 3D setup: renderer, camera fit, lights, toon materials, `part()` (mesh + outline), ground texture |
| 1677–2009 | places: `THEMES`, `makeTreeFor`, `makeRockFor`, `makeBushFor`, `makePondFor`, `paintGround`, `buildMap3D` |
| 2010–2039 | vision cone and hug zone meshes |
| 2040–2290 | characters 3D: `addFace`, `addHair` (hats), `buildLittleModel(look, isPlayer, pid, glove)`, `setCloak`, `buildBigModel(skin)` |
| 2291–2337 | items 3D, `buildCharacters`, `rebuild3D` |
| 2338–2465 | per-frame sync: `syncLittle`, `syncBig`, `syncScene` (fades, snow, waves, camera shake) |
| 2466–2519 | skins screen previews (scissor viewports) |
| 2520–end | main loop, `window.__bb` |

## States
- **Game `mode`**: `menu` · `skins` · `shop` · `play` · `pause` · `win` (· `lose` — screen still exists but is not reached since "no game over").
- **Little One `state`**: `ok` → `down` (pushed; `downTimer` = `CFG.DOWN_TIME`) → rescued → `ok` (`invuln`) | not rescued → `home` (limps to `restSpot` = its spawn in the house) → `rest` (`restTimer` = `CFG.REST_TIME`) → `ok`. Extra: `hugAnim` > 0 while riding the Big One's shoulders; `fx.boots/cloak/shield` timers.
- **Big One**: `state` `look` / `patrol` / `chase` / `search`; overlays `stun` (after a hug, can't move/push, no new hug), `slip` (banana: lying, can be hugged from any side), `pushCd` (stands after a push), `noPush` (rest after a push: sees nobody).
- **Bots**: `task` `rescue` / `flee` / `attack` / `lurk`; one attacker at a time (`attackToken`, `botAttackCd`).

## Save data (localStorage)
- `bebebe-progress`: `{ unlocked, stars: {level: 1..3}, coins, inv: {mittens, mega}, equip: [p1, p2] }` (loaded by merging with defaults).
- `bebebe-outfits`: `{ p1: {hair, hat, jacket, pants}, p2: {...}, big }`. `bebebe-place`: `auto|park|beach|winter|school`. `bebebe-lang`: `en|es|ru`.

## window.__bb (for tests)
`mode` (get/set), `littles`, `big`, `stats`, `items`, `progress`, `lastReward`, `level` (get/set), `placeSel` (get/set), `I18N`; functions `update(dt)`, `startGame(n)`, `resetWorld(n)`, `inSafe(p)`, `spawnItem()`, `buyGloves(kind)`, `setEquip(pi, kind)`, `cycleOutfit`, `randomOutfit`, `cycleBig`, `cyclePlace`, `setLang`, `toScreen`. `window.__bbReady` is `true` once the first frame can run.
