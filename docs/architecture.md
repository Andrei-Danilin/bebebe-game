# Architecture — bebebe-game v2 (3D)

One `index.html` (+ PWA files, see below): a small non-module script (offline hint) and one `<script type="module">` that imports Three.js r187 from jsDelivr. Two stacked canvases inside `#wrap`: `#gl` (WebGL, Three.js) below, `#game` (2D, UI and input) on top.

## Layers (keep them apart)
1. **Logic** — world, level generator, pathfinding, rules, bots, the Big One, items, progress. Works in "logic pixels": 960×640, `CELL = 32` (1 cell = 1 unit in 3D). Knows nothing about Three.js.
2. **3D** — builds meshes from the world (`buildMap3D`, `buildCharacters`) and copies state into them every frame (`syncScene` → `syncLittle`, `syncBig`, `syncItems`, `updateCone`). Only reads game state.
3. **2D UI** — menus, HUD, name tags, timers, shop, skins screen; positions of world things via `toScreen(x, y, heightPx)`. Buttons are registered each frame in `buttons[]` and hit-tested on `pointerdown`.

## Sections of index.html (approximate lines; search the header comment)
| Lines | Section |
|---|---|
| 48–111 | `CFG` (all game numbers), `GLOVES` |
| 112–219 | `I18N` (en / es / ru), `setLang` |
| 220–266 | screen, `fit()` (letterboxing, DPR; also re-places an open name input) |
| 267–338 | helpers, world state (`obstacles`, `bushes`, grids, `safeZone`/`inSafe`, `dangerZone`/`inDanger`, `reachable`, `canAct`) |
| 339–511 | level generator: `hWallTo`/`vWallTo`, **`bigHouse()`**, `generateLevel` (seeded by level), `applyWorld`, `connectivity`, `loadLevel` |
| 512–644 | A* (`findPath`), movement (`resolveWalls`, `steerTo`, `inCone`, `randomFreePoint`) |
| 645–868 | characters data: outfits (`HAIRS`, `HATS`, `JACKETS`, `PANTS`, `makeLook`), `BIG_SKINS`, places (`PLACES`, `currentPlace`), **names** (`NAME_SLOTS`, `cleanName`, `nameFor`, `setName`, `nameOf`), **progress** (`progress`, `giveReward`, `buyGloves`, `setEquip`), `makeLittle`, `resetWorld`, `startGame` |
| 869–900 | sound (`beep`, `SFX`) |
| 901–1074 | input: keyboard `onKey`, touch sticks, `hitButton`/`pendingUp`, **name input overlay** (`openNameInput`, `closeNameInput`, `placeNameInput`), gamepads, `inputFor` |
| 1075–1554 | **logic**: `canSee`, `helps`, `push`, `hug`, items (`spawnItem`, `updateItems`), bonus stars (`starSpotOk`, `spawnStar`, `updateStars`), `updatePlayers`, `updateBots`, `lurkPoint`, `nearestExit`, `updateBig`, `separate`, `checkContacts`, `updateDowned`, `updateDanger`/`throwOut`/`freeCellNear`, `updateResting`, `update` |
| 1555–1921 | 2D layer: drawing helpers (`labelFit`), `drawMarkers`, `drawFx`, `drawHUD`, `drawOverlay` (menu, skins, names, shop, pause, win, lose), `nameLabel`, `drawUI` |
| 1922–2017 | 3D setup: renderer, camera fit, lights, toon materials, `part()` (mesh + outline), ground texture |
| 2018–2353 | places: `THEMES`, `makeTreeFor`, `makeRockFor`, `makeBushFor`, `makePondFor`, `paintGround`, `buildMap3D` (`bigHomeMats`) |
| 2354–2383 | vision cone and hug zone meshes |
| 2384–2618 | characters 3D: `addFace`, `addHair` (hats), `buildLittleModel(look, isPlayer, pid, glove)` (incl. `dizzyStars`), `setCloak`, `buildBigModel(skin)` |
| 2619–2722 | `buildCharacters`, `rebuild3D`, items 3D (`syncItems`), bonus stars 3D (`makeStarMesh`, `syncStars`) |
| 2723–2859 | per-frame sync: `syncLittle`, `syncBig`, `syncScene` (fades, snow, waves, camera shake, red pulse of the Big One's walls) |
| 2860–2912 | skins screen previews (scissor viewports) |
| 2913–end | main loop, `window.__bb` |

## The Big One's house (SPEC-003)
- **`bigHouse(items, x0, y0, doors)`** (generator section) emits everything of the 6×6 house: `bighome` walls with 2-cell doors (`doors: [{ side: "top"|"bottom"|"left"|"right", at }]`), the dark floor, the bed, and the danger item `{ t: "danger", x, y, w, h, exits }` = the floor; `exits` are 2-cell spots `CFG.DANGER_EXIT` cells outside each door. The mirror step in `generateLevel` mirrors `exits` too. Level 1: doors top and right, same layout as before. **SPEC-002 (level types) should place the Big One's house through `bigHouse()`** so every level type gets the danger zone.
- `applyWorld` turns the item into **`dangerZone`** `{ x, y, w, h, exits: [{x, y}] }` (pixels; exits are the spot centres); `inDanger(p)` / `inDangerXY(x, y)` test it. `reachable` (from `connectivity()` in `loadLevel`) marks the cells the Little Ones can reach from their house.
- `updateDanger(dt)`: a Little One in state `ok` inside the zone gets `dangerT += dt` (paused while `hugAnim` > 0, reset to 0 outside or in any other state); at `CFG.DANGER_TIME` → `throwOut(l)`: placed at `nearestExit(l)` (or `freeCellNear` it: not blocked, reachable, not in the zone), `dizzy = CFG.DIZZY_TIME`, pop text `thrownOut`, `SFX.thrown`.
- Bots: `steerTo` adds `CFG.BOT_DANGER_COST` per danger cell to their A* cost (not for the Big One); `fleePoint` and `lurkPoint` never pick a point in the zone; a bot with `dangerT > CFG.BOT_DANGER_LEAVE` gets task `leave` and walks to `nearestExit`.

## Bonus stars (SPEC-003)
- `bonusStars` (`{ id, x, y, t, life }`), separate from `items`; `starCd` counts down `CFG.STAR_EVERY`, at most `CFG.STAR_MAX`, each lives `CFG.STAR_LIFE` and blinks for the last `CFG.STAR_BLINK` (in `syncStars`).
- `starSpotOk(cx, cy)`: not blocked, `reachable`, not in `safeZone`/`dangerZone` nor within `CFG.STAR_HOUSE_MARGIN` cells of the Big One's floor, at least `CFG.STAR_MIN_FROM_HOME` cells (straight line) from the safe house walls, no item or star on the cell. `spawnStar(x?, y?)` picks a random good cell (or the given point, for tests).
- `updateStars`: a `player` with `canAct` within `r + CFG.STAR_PICK` takes it: `stats.starCoins` and `progress.coins` += `CFG.STAR_COINS` at once (saved), pop text, burst, `SFX.star`. `giveReward` reports them as `lastReward.starCoins` (and inside `lastReward.coins`), on top of the `COINS_MIN_WIN` floor; the win and lose screens show them as a separate line.

## Names (SPEC-003)
- Slots `p1`, `p2`, `big`, `bot1`..`bot4`. `namesTyped` holds only what a kid typed (`""` = language default); `nameFor(slot)` = typed or `defaultName(slot)` (`player1`/`player2`, `defaultBig`, `defaultBots[i]` of the current language). `cleanName`: control characters removed, trimmed, at most `CFG.NAME_MAX` code points. `nameOf(l)` maps a character to its slot (bots by `botIndex`). Names are drawn only with `fillText`.
- **Name input overlay**: `nameLabel(rect, slot, color)` draws a label button with ✏️ and registers it with `onUp: true`; such buttons fire on **`pointerup`** of the same pointer (`pendingUp`), because iOS Safari opens the keyboard only for a focus inside a pointerup/click. `openNameInput(rect, slot)` puts an HTML `<input class="name-input">` exactly over the rect (`placeNameInput`, from `CSS_W / W`, font ≥ 16 px, `enterkeyhint="done"`, `autocapitalize="words"`); Enter, blur or a tap on the canvas saves, Escape cancels; saving an unchanged name keeps the default. While `nameInput` is open, `keydown` and gamepad buttons are ignored; `drawUI` closes it when the mode is no longer `skins`/`names`.
- In play: `drawMarkers` draws names above heads (40 % alpha in a bush) and the Big One's name above him; `drawHUD` starts the hearts bar with his name (`labelFit` shrinks or cuts long names; hearts get denser above 8).

## States
- **Game `mode`**: `menu` · `skins` · `names` (bot names, opened by "👥 Friends" on the skins screen) · `shop` · `play` · `pause` · `win` (· `lose` — screen still exists but is not reached since "no game over").
- **Little One `state`**: `ok` → `down` (pushed; `downTimer` = `CFG.DOWN_TIME`) → rescued (`rescue` reaches `CFG.RESCUE_TIME` while a helper stands next to him, drains at `CFG.RESCUE_DRAIN` otherwise, reset to 0 when the helper is pushed) → `ok` (`invuln`) | not rescued → `home` (limps to `restSpot` = its spawn in the house) → `rest` (`restTimer` = `CFG.REST_TIME`) → `ok`. Extra: `hugAnim` > 0 while riding the Big One's shoulders; `fx.boots/cloak/shield` timers; `dangerT` (seconds in the Big One's house); `dizzy` (after being thrown out: can't move or hug, the Big One ignores him); `botWait` (set on a fall from `CFG.BOT_RESCUE_DELAY`; bots ignore the downed one until it is 0). **`canAct(l)`** = `ok`, no `hugAnim`, no `dizzy` — used for moving, hugging, contacts, picking stars.
- **Big One**: `state` `look` / `patrol` / `chase` / `search`; overlays `stun` (after a hug, can't move/push, no new hug), `slip` (banana: lying, can be hugged from any side), `pushCd` (stands after a push), `noPush` (rest after a push: sees nobody).
- **Bots**: `task` `rescue` / `flee` / `attack` / `lurk` / `leave` (walking out of the Big One's house); one attacker at a time (`attackToken`, `botAttackCd`).

## PWA (SPEC-001)
- **Site files** (all that GitHub Pages publishes): `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` (`icon.svg` source → PNGs by `scripts/make-icons.js` / `npm run icons`), `v1-2d/`. Workflow `.github/workflows/pages.yml`: job `test` (whole Playwright suite) → job `deploy`.
- **`index.html` head**: `<link rel="manifest">`, `apple-touch-icon`, `apple-mobile-web-app-*` metas, `viewport-fit=cover`. `body` is padded with `env(safe-area-inset-*)`; `playArea()` (screen section) returns the body's box minus that padding and `fit()` sizes the canvases from it (on `resize` and, a frame later, on `orientationchange`).
- **`isStandalone()`** (screen section, computed once into `STANDALONE`): `navigator.standalone`, `(display-mode: standalone)` or `?standalone=1` (tests). Hides the HUD fullscreen button (`drawHUD`) and the install hint. `isIOS` + `showInstallHint()` → one menu line `I18N.installHint` under the controls text (`drawOverlay`, menu).
- **`sw.js`**: `SW_VERSION` names the cache. `install` precaches `./`, `./index.html`, the manifest, the icons and jsDelivr `three.module.js` + `three.core.js` (CORS), then `skipWaiting()`. `activate` deletes other `bebebe-*` caches only (all Pages projects of the account share the origin), `clients.claim()`. Fetch: navigations and `index.html` network-first — the cache answers when the network fails, returns a non-OK status, or takes longer than `NET_TIMEOUT_MS` (root fallback `./`); three.js and `icons/` cache-first; everything else network-first. Bump `SW_VERSION` when the precache list (e.g. the three.js version), an icon or a strategy changes.
- **Registration guard** (`registerServiceWorker()`, main loop section, after `__bbReady`): only on `http:`/`https:` with `navigator.serviceWorker`, inside `try/catch`, rejected promise swallowed — nothing happens on `file://` or in the claude.ai page.
- On iOS the home-screen app has its own `localStorage`, separate from Safari.

## Save data (localStorage)
- `bebebe-progress`: `{ unlocked, stars: {level: 1..3}, coins, inv: {mittens, mega}, equip: [p1, p2] }` (loaded by merging with defaults).
- `bebebe-outfits`: `{ p1: {hair, hat, jacket, pants}, p2: {...}, big }`. `bebebe-place`: `auto|park|beach|winter|school`. `bebebe-lang`: `en|es|ru`.
- `bebebe-names` (SPEC-003): `{ p1, p2, big, bots: [b1, b2, b3, b4] }` — only typed names, `""` = language default; every field cleaned on load, missing or broken data → defaults.

## window.__bb (for tests)
`mode` (get/set), `littles`, `big`, `stats`, `items`, `progress`, `lastReward`, `level` (get/set), `placeSel` (get/set), `I18N`; functions `update(dt)`, `startGame(n)`, `resetWorld(n)`, `inSafe(p)`, `spawnItem()`, `buyGloves(kind)`, `setEquip(pi, kind)`, `cycleOutfit`, `randomOutfit`, `cycleBig`, `cyclePlace`, `setLang`, `toScreen`, `isStandalone()`; `installHintShown` (the install hint was drawn this frame), `buttonNames` (names of the buttons' handlers this frame, e.g. `toggleFullscreen`), `buttonRects` (`{ id, x, y, w, h }` per button; name labels have id `name:<slot>`). SPEC-003: `names` (get: `{ p1, p2, big, bots }` as shown), `setName(slot, text)`, `nameOf(l)`, `inDanger(p)`, `dangerZone`, `safeZone`, `stars` (the bonus star list), `spawnStar(x?, y?)`, `giveReward(win)`, `texts` (pop texts), `generateLevel(lv, attempt)`, `world` (`COLS`, `ROWS`, `CELL`, `blocked` as an array). `window.__bbReady` is `true` once the first frame can run.
