# SPEC-005 — Phone mode: camera follows the hero, mini-map, big controls

Status: ready
Complexity: L
Branch: SPEC-005-phone-mode
Decided by: Andrei and the kids after playing on the iPhone (2026-11-21): on a phone everything is too small; the camera should come closer and follow the hero, showing about half of the map; the whole map stays visible as a mini-map in a corner; the joystick appears where the finger touches, drawn on screen; phone mode only on phones (iPad and computer stay as they are); on a phone only one player. Everything else (detection rule, sizes, edge arrows, layouts): Claude (spec author).

## Description
On an iPhone in landscape the whole 30×20 map is squeezed into ~390 CSS px of height, with black bars left and right: a cell is ~19 px, characters and buttons are tiny. In **phone mode**:
- the game fills the whole screen (inside the safe areas), no side bars;
- the camera is closer — about half of the map's height is visible (≈10 rows, ≈21 columns on a 19.5:9 phone) — so characters are about twice as big, and it smoothly follows the player's hero;
- a **mini-map** in the top-right corner always shows the whole level: walls, both houses, the hero, friends, the Big One with his view cone, downed friends blinking, stars and items, and a frame of what the camera shows;
- when the Big One or a downed friend is off screen, a small arrow at the screen edge points to them;
- the joystick appears under the finger on the left part of the screen; the right part is for buttons;
- all buttons and texts are big enough for a child's finger on a phone; menus are laid out for a wide, short screen;
- only one player: the "2 players" choice is not offered.

On iPad and computers nothing changes.

## Goal
- On an iPhone (SE 667×375 up to Pro Max 932×430, landscape) a child can play comfortably: hero clearly visible, every button ≥ 44×44 CSS px, no text smaller than 13 CSS px, nothing cut by the notch or the home bar.
- Desktop/iPad rendering and all existing tests stay exactly as they are.

## Context
- Screen: logical size `W × H` = 960 × 640 is both the world size (map 30×20 cells × `CELL` 32) and the UI layout size; `fit()` letterboxes it into `playArea()` (body minus safe-area padding), `VIEW` = canvas px per logic px, `DPR` capped at 1.5 on touch. Two canvases: `#gl` (three.js) under `#game` (2D UI and input). `toGame(e)` maps pointer → logic px.
- Camera: `fitCamera()` puts a `PerspectiveCamera` (FOV 30) at 63° elevation looking at the map centre at a distance that fits the whole map; `camBase` is reused every frame (+ `shake`); `toScreen(x, y, h)` projects world → logic px for 2D overlays (names, pop texts, markers). Shadow camera covers the whole map; fog 40–75.
- Input: touch = `sticks` (pointer → stick, P1 left half / P2 right half with two players), `STICK_R` 55 logic px, stick drawn in the HUD; buttons = `addButton` rects hit-tested on `pointerdown` before sticks.
- Portrait: a "Turn your device sideways" overlay already exists (`L().rotate`), and `update` pauses in portrait.
- UI drawn on canvas for every mode (menu, skins, names, shop, play HUD, pause, win); the name input is an HTML `<input>` placed over a canvas rect (`placeNameInput`).
- By the time this spec runs, SPEC-002/003/004 may have added: level-type banner and menu label, names over heads, danger countdown, bonus stars, the 💋 kiss button with its count. All of them must work in phone mode (whatever is on `master` when this spec starts).

## Out of scope
- Two players on one phone; phone portrait play (the rotate overlay stays).
- Changing the map size or the game rules.
- iPad-specific layout (iPad keeps the desktop layout).
- Pinch-zoom or dragging the camera by hand.

## Phone detection
`PHONE = isTouch && Math.min(screen.width, screen.height) <= CFG.PHONE_MAX_SHORT_SIDE` (500 CSS px) — iPhones and most Android phones yes, iPads (≥ 744) no. Overrides for tests and for Andrei: `?phone=1` / `?phone=0` in the URL. Decided once at start-up (like `STANDALONE`). `__bb.phone` reports it.

## Acceptance criteria
### Screen and camera
1. **Desktop unchanged.** With `PHONE` false every screen renders as before; the whole existing suite stays green without changes to its expectations. A screenshot of menu and play at 960×640 is compared before/after by eye (and the camera position/`toScreen` of fixed points equal the old values in a test). → `tests/phone.spec.js` "desktop camera and layout are unchanged"
2. **Full screen.** In phone mode both canvases fill `playArea()` exactly (no letterbox bars); safe areas respected (nothing under the notch/home bar). The world stays 960×640 logic px; the UI layer gets its own logical size: height `CFG.PHONE_UI_H` (420), width = 420 × aspect. Every UI coordinate in phone mode is in this UI space; `toGame` maps pointers into it. → "phone mode fills the screen" at 667×375, 844×390, 932×430
3. **Follow camera.** Visible area ≈ `CFG.PHONE_VIEW_ROWS` (10) rows tall at the hero's position, width from the aspect. The camera target follows the player's hero with smoothing (`CFG.CAM_FOLLOW` ≈ 6 /s, frame-rate independent) and a small look-ahead in the moving direction (`CFG.CAM_LOOKAHEAD` ≈ 1.5 cells); it is clamped so the view does not show more than ~1 cell beyond the map edges. While the hero is resting in the house, downed, or hugging, the camera stays on him. After the win, the camera smoothly zooms out to the whole map for the win screen. → "the camera follows the hero and stops at the map edges" (hero's `toScreen` stays within the centre third while walking in the middle; at a corner the view clamps)
4. `toScreen` uses the current camera, so names, pop texts, countdowns, item markers stay glued to their characters. Shadows still cover what is visible (move the shadow camera with the camera target, or keep the full-map shadow box if it looks fine — say which); fog distances adjusted if the closer camera makes the scene foggy. → screenshot check
5. Performance: at 844×390 the frame time in the test browser is not worse than the desktop full-map view (report numbers).

### Mini-map and edge arrows
6. Mini-map in the top-right corner, `CFG.MINIMAP_W` (≈ 26 % of the UI width, aspect 3:2), semi-transparent background, rounded, inside the safe area. Drawn from the level data (cached into an offscreen canvas per level and place, redrawn only on level/place change): ground, walls, water/ponds, bushes (dots), the safe house (blue) and the Big One's house (red). Live layer every frame: the hero (bigger dot in his colour with a white ring), bots (white), downed Little Ones (blinking), the Big One (red dot + his view cone as a translucent wedge), bonus stars (yellow), items (small icons/dots), and a white frame of the camera's visible area. → "mini-map shows the level and everyone on it" (`__bb.minimap` returns its rect and the list of drawn markers)
7. Edge arrows: when the Big One or a downed friend is outside the camera view, an arrow (red for the Big One, green with a ❗ for a downed friend) sits at the screen edge on the line from the hero to them, clear of the mini-map and buttons. → "edge arrows point to the off-screen Big One and downed friends"

### Controls
8. Joystick: a touch that starts in the left `CFG.STICK_ZONE` (55 %) of the screen and not on a button creates the stick there; the base (radius ≈ 60 CSS px) and knob are drawn under the finger; the base follows the finger when dragged far, as now. Touches in the right part that are not on a button do nothing. Movement speed and direction mapping as today. → "joystick appears under the finger on the left only"
9. Buttons in phone mode: every button's rect is ≥ 44×44 CSS px (`__bb.buttons` exposes rects; the test converts UI px → CSS px), with ≥ 8 CSS px between neighbours. Play HUD: pause button top-centre-left area; the kiss button (SPEC-004) bottom-right ≈ 80 CSS px; nothing overlaps the mini-map. → "every phone button is big enough" (all modes)
10. One player: in phone mode the menu offers only "Play" (no "2 players"), `startGame(2)` and key `2` fall back to 1 player, and the skins screen shows Player 1 and the Big One (Player 2's panel hidden); the shop's "who wears what" shows only Player 1. → "phones play with one player"

### Layouts and texts
11. Every mode has a phone layout in the UI space: menu, skins (+ friends/names screen if present), shop, play HUD, pause, win, the rotate overlay, the install hint. Rules: main texts ≥ 15 CSS px, small hints ≥ 13 CSS px, titles ≥ 24 CSS px; nothing overlaps; long es/ru strings fit (use `fitText`). The HUD keeps: the Big One's name + hearts (half hearts if present), level/time, the team chips (move them under the mini-map or into the top bar — no overlap), the hero's status (kisses, gloves). The name `<input>` is placed correctly in the phone UI space with font ≥ 16 CSS px. → screenshot check of every mode at 667×375 and 932×430, in en/es/ru (looked at, not committed)
12. Touch hint text for phone mode: one line, the existing `touch1` reworded only if needed (all 3 languages).

### General
13. All numbers in `CFG`, all strings in en/es/ru, `__bb` additions: `phone`, `camera` (target and visible rect in world px), `minimap`, `uiSize`. No page errors. Whole suite green; new tests run with `viewport` 844×390, `hasTouch`, `isMobile` and `?phone=1`.
14. Manual check by Andrei on the iPhone (installed PWA and Safari): listed in the final report as "to check".

## Implementation steps
1. Tests first for detection + "desktop unchanged" (AC 1) — capture the current camera position and a few `toScreen` values as fixtures.
2. Introduce the UI logical size (`UW`, `UH`; on desktop `UW = W`, `UH = H` so nothing changes) and switch every UI drawing and hit-test from `W/H` to `UW/UH` where they mean the screen, not the world. Do this as a pure refactor first (desktop suite green), then turn on the phone size.
3. Follow camera (`updateCamera(dt)` replacing the fixed `camBase` in phone mode), clamping, win zoom-out, shadows/fog (AC 3–5).
4. Joystick zone and drawing (AC 8), one-player rules (AC 10).
5. Mini-map with its cached base layer, then edge arrows (AC 6–7).
6. Phone layouts for every mode and button sizes (AC 9, 11, 12); screenshots for all modes, three languages, three phone sizes.
7. Whole suite, reviews, docs, merge, push, close — as in `RUN_L.md`.

## Numbers and texts
| Key | Value |
|---|---|
| `PHONE_MAX_SHORT_SIDE` | 500 CSS px |
| `PHONE_UI_H` | 420 UI px |
| `PHONE_VIEW_ROWS` | 10 rows visible |
| `CAM_FOLLOW` | 6 /s |
| `CAM_LOOKAHEAD` | 1.5 cells |
| `MINIMAP_W` | 26 % of UI width |
| `STICK_ZONE` | 55 % of UI width |
| min button | 44×44 CSS px, gap 8 CSS px |
| min text | titles 24, main 15, hints 13 CSS px; inputs 16 |
| new strings | only if a phone layout needs a shorter variant (en/es/ru) |

## Docs to update
`docs/game-design.md` (phone mode: what changes on a phone, one player, mini-map and arrows — who decided what), `docs/architecture.md` (`PHONE`, UI space `UW/UH` vs world `W/H`, `updateCamera`, mini-map cache, edge arrows, new `__bb` members), `README.md` (playing on a phone), `specs/BACKLOG.md` (two players on a tablet with split controls; camera options toggle).
