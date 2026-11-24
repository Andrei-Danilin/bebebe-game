# SPEC-020 — Art pass 1: the notebook-comic look for every screen (2D)

Status: ready
Complexity: L
Branch: SPEC-020-art-ui
Decided by: Andrei (2026-11-23): the game takes the style of the pictures in `art/` (kids' felt-tip doodles on a notebook page, generated from `claude/art-style-brief.md` — a claude.ai project doc, not in the repo); the 3D stays 3D (SPEC-021 restyles it). Asset pipeline, which picture goes where, fallbacks, sizes: Claude (spec author).

## Description
`art/` now holds the style tile, logo, icons, buttons, level-map pieces and backgrounds, effects, phone controls and story pictures. Today every screen is drawn with plain canvas shapes and emojis. After this spec the 2D layer uses these pictures: the home screen is a notebook page with the logo, the level map shows each world's drawn background with paper level buttons, buttons and icons are the felt-tip ones, the HUD uses the drawn coins/hearts, effects (BONK bursts, steam, hearts, dizzy stars) are drawn sprites, the phone joystick and buttons are the paper ones, and the Story screen shows the comic pictures. All text stays code-drawn in three languages.

## Goal
- Every screen looks like the pictures in `art/`, on desktop and phone, offline (PWA cache), without slowing the game.
- A repeatable pipeline: Andrei drops a new picture into `art/`, `npm run assets` turns it into game-ready files.

## Context
(Pre-flight done 2026-11-23: SPEC-017 (home, level map, level card, story, shop tabs) and SPEC-019 landed; SPEC-011 has not — `index.html` is still one file. See "Pre-flight notes" at the end.)
- `art/` (source, committed by Andrei): `0_main` style tile; `2_icon` app icon; `12_icons` (shield, band-aid, cupcake, angry heart, pause, sound); `13_interface` (paper buttons green/pink/orange/grey, round play/pause/sound/restart, anger-heart clouds full/half/fading/empty, coin badge, level ribbon); `14_interface` notebook menu background; `15_houses`; `18_map_bg_<world>` ×6 (scenery at the edges, empty middle); `19_logo`; `20_levelmap_parts` (empty/current/locked/boss buttons, stars, done stamp, padlock, six world tab icons); `21_icons_ui` (play, back, home, storybook, bag, gear, sound on/off, fullscreen, globe, coin, gift); `22_icons_shop` (fast feet, long items, quick help, wardrobe, items, upgrades); `23_wardrobe` (hats, jackets, pants); `24_effects` (bursts, steam, cloud, stink lines, dizzy stars, hearts, speed lines, dust, sparkle, band-aid, confetti); `25_phone_controls` (joystick base + knob, kiss, kit, pause); story: `8_start`, `9_1…9_4_boss_*`, `26_1/26_2_bonus_*`; `v1/staff.webp` (boots, cape, banana, mittens, mega mittens, kiss, star, coin, hearts — its shield is a superhero-style star shield: **use the `12_icons` shield instead**). Sheets have a solid green background (#00ff00-ish), pictures on paper have none (`v1/staff` is a sheet on paper: framed cells with Spanish labels).
- Now also in `art/` (added 2026-11-23): `10_end` (ending), `11_win` (win picture) — the placeholders stay only as the fallback when a picture fails to load.
- PWA: `sw.js` precache list and `SW_VERSION` (now `"bebebe-v1"`; hard rule 8: bump when the precache list or a strategy changes); the Pages workflow deploys only listed paths.

## Out of scope
- 3D restyle (SPEC-021), anger meter / boss / cut-scenes logic (SPEC-022) — this spec only prepares their 2D pictures.
- New pictures (Andrei generates them); changing texts or rules.

## Asset pipeline
- `scripts/assets.js` (`npm run assets`, Node + `sharp` or similar dev dependency): reads `art/assets.json` (a manifest Claude Code writes: for each source file — whole picture or sheet, how to slice it, output names, max size) → writes `assets/` (committed): sheets are cut into separate sprites by finding objects on the green background (connected regions; order = rows top-to-bottom, left-to-right, mapped to names in the manifest), green is keyed out to transparency with a soft edge (no green fringe), trimmed with a small padding, resized (icons 256 px, buttons 512, backgrounds ≤ 1600 px wide), saved as WebP (+ PNG fallback only if a target browser needs it). Prints a report (count, sizes, total KB). Re-running is deterministic.
- Budget: all `assets/` together ≤ 4 MB; each background ≤ 250 KB.
- Loading: an `assets` loader (images decoded once, ready before the home screen; a progress bar on the existing loading screen); a missing or failed asset falls back to today's canvas drawing (the game never breaks without art).
- `sw.js`: precache `assets/`; bump `SW_VERSION`; Pages workflow deploys `assets/`.

## Acceptance criteria
1. Pipeline: `npm run assets` produces every sprite named in the manifest from the current `art/`; no green pixels left at sprite edges (test: sample edge pixels' hue); deterministic (two runs → identical files); report within budget. → `tests/assets.spec.js` (Node test)
2. Loader + fallbacks: with `assets/` blocked (test routes them to 404) every screen still renders with today's drawing and no page errors. → "the game works without art"
3. **Home:** notebook background (`14_interface` style, or `0_main` paper if cleaner), `19_logo` as the title, paper buttons from `13_interface` with code-drawn labels, round icons for language/sound from `21_icons_ui`, bonus badges with drawn coin and item icons.
4. **Level map:** `18_map_bg_<world>` as the page background (scaled to cover, the empty middle kept for the path); the dotted path drawn by code in blue-pen style over it; level stops from `20_levelmap_parts` (empty → number drawn on it, current glows, locked, boss stop for level 20, stars under, done stamp); the six world tabs use the world icons.
5. **Level card, win, pause, shop, wardrobe, upgrades, story:** paper panels (notebook paper, taped corners), drawn icons for items (`v1/staff` + `12_icons` shield/band-aid/cupcake), wardrobe thumbnails from `23_wardrobe` where an item exists (others keep the 3D preview), upgrade and tab icons from `22_icons_shop`; Story chapters show `8_start`, `9_1…9_4`, `26_1/26_2` (ending: `art/10_end.webp` — it exists now, so the pipeline picks it up; the placeholder stays as the load-failure fallback).
6. **HUD:** coin and item counts with drawn icons; the Big One's hearts with the `13_interface` heart clouds (full / half / empty) — just the look; the anger meaning comes in SPEC-022; pause/sound buttons drawn (the in-play HUD has the pause "II" and fullscreen ⛶ buttons; the only sound button is the home screen's `home:sound`, AC 3).
7. **Effects:** pop-texts keep code text but sit on the drawn bursts (`24_effects`) — BONK/hug/kiss/thrown out; steam puffs, dizzy stars, heart bursts, dust and sparkles replace the current particle shapes where they exist (2D overlay sprites at `toScreen` positions, size scaled with the camera).
8. **Phone controls:** joystick base and knob, kiss, kit and pause buttons from `25_phone_controls`, same sizes as now (≥ 44 CSS px).
9. **App icon & PWA icons** regenerated from `2_icon` (192/512/maskable/apple-touch), `scripts/make-icons.js` updated; splash/theme colours from the paper palette.
10. Performance: no frame-time regression in play on the phone viewport (sprites cached, drawn with `drawImage` only); first load on a cold cache still shows the loading screen within 1 s.
11. Strings unchanged except labels that move onto buttons; all phone size tests still pass; whole suite green (on CI: the sharded tests workflow on the pushed branch, SPEC-023); screenshots (throwaway) of every screen on desktop and 667×375 / 932×430 looked at side by side with the reference pictures.

## Implementation steps
1. Pre-flight; manifest + pipeline + Node test (AC 1); commit `assets/`.
2. Loader, fallbacks, PWA precache, deploy list (AC 2, 9).
3. Home, level map, level card (AC 3, 4).
4. Panels, shop/wardrobe/upgrades, story, win/pause (AC 5).
5. HUD, effects, phone controls (AC 6–8); performance check (AC 10).
6. Screenshots against the references, whole suite (CI), reviews, docs, merge, push, close — as `RUN_L.md` (as updated by SPEC-023).

## Numbers and texts
| Key | Value |
|---|---|
| icon size / button size / background width | 256 / 512 / ≤ 1600 px |
| assets budget | ≤ 4 MB total, ≤ 250 KB per background |
| green key | hue near #00ff00, soft edge 1–2 px, despill |
| new strings | none expected (labels already exist) |

## Docs to update
`docs/architecture.md` (asset pipeline, manifest, loader, fallbacks, PWA cache), `README.md` (how to add a picture: drop into `art/`, edit `art/assets.json`, run `npm run assets`), `docs/game-design.md` (look and feel — Andrei's decision), `claude/art-style-brief.md` is the project doc (Andrei/Claude keep it).

## Pre-flight notes (2026-11-23)
Changes made in this pre-flight:
- Decided by / Docs: `claude/art-style-brief.md` → marked as a claude.ai project doc (not in the repo; no copy in `docs/`).
- Context pre-flight line: "SPEC-017 and maybe SPEC-019 landed; SPEC-011 may have split `index.html`" → SPEC-017 and SPEC-019 landed, SPEC-011 not (one `index.html`, ~6,830 lines).
- Context `v1/staff` "**not the shield**" was wrong — the sheet has a shield (round red/blue/white star shield, superhero-like) → kept the spec's choice (shield icon from `12_icons`), reworded.
- Context "Missing for now: `10_end`, `11_win` — use placeholders" → both exist since commit `ae495fa`; placeholders = load-failure fallback only. AC 5 ending wording updated the same way (requirement unchanged: the ending shows `10_end`).
- Context `SW_VERSION` → current value `"bebebe-v1"`; bump rule quoted from hard rule 8.
- AC 6 "pause/sound buttons" → clarified: in play there is no sound button (pause "II" + fullscreen ⛶ only; sound = `home:sound` + key M). No new HUD sound button is asked for.
- AC 11 / step 6 "whole suite green" → on CI (SPEC-023's sharded tests workflow), `RUN_L.md` as updated by SPEC-023.

**Art sheets as they really are** ("green" = solid #00ff00-ish background with white sticker outlines, "paper" = notebook page, no keying possible). **Sizes: every file is only 1024 px on its long side** — 1024×572 (most), 1024×765 (`0_main`, `8_start`, `21_icons_ui`, `23_wardrobe`), 1024×687 (`12_icons`, `22_icons_shop`), 1024×1024 (`2_icon`, `icon`), 765×1024 (`v1/staff`). So a sliced icon is ~150–250 px and a button ~120–200 px in the source, and backgrounds are 1024 px wide: the AC sizes (icons 256, buttons 512, backgrounds ≤ 1600) can only be upper limits — never upscale.
- `0_main` (paper, 1024×765): style tile — title "BeBeBe Atrapar", park scene (blue kids' house, messy house, angry dad, kind dad hugged, kids), words love/friendship/cupcakes/dad/mom, six colour swatches.
- `2_icon` (opaque square, blue marker background): bald dad in red t-shirt blushing, a kid in a purple beanie hugging him from behind, hearts. (`icon.webp` = alternative icon: big red heart, kid peeking from behind it, same blue — not named by any spec.)
- `12_icons` (green, 3×2): wooden round shield with heart · band-aid with heart · cupcake with cherry / angry red heart · blue round pause · yellow round sound.
- `13_interface` (green, taped paper look): row 1 four square buttons green/pink/orange/grey + four round buttons play/pause/sound/restart; row 2 four heart clouds (heart over a puffy cloud, small lightning): full red · paler red (the "half" is a whole lighter heart, not split) · translucent (fading) · grey (empty); row 3 coin badge (coin + empty plate) · ribbon with a star.
- `14_interface` (paper): notebook page; doodles at the edges (running kids top-left, angry dad bottom-left, kind dad bottom-right, cupcake top-right, words), empty middle.
- `15_houses` (green, 2 objects): messy red house (patched roof, chimney, sock + t-shirt on a line, overflowing bin, pizza boxes, toy car, mud, stink lines) · clean light-blue house with a heart on the door, flowers.
- `18_map_bg_park|field|city|school|beach|winter` (paper, ~16:9): notebook page with a framed world map — blue kids' house bottom-left, messy dad's house top-right, scenery at the edges (river/pitch with goals and ad boards/streets and houses/schoolyard with hopscotch and basketball court/sea with umbrellas/snow with ice blocks and frozen pond), empty middle.
- `19_logo` (green): "BeBeBe" red / "Atrapar" yellow, a kid peeking over the letters, the angry dad's head with steam, stars, a heart — **each letter is a separate region**: key it as one picture, never slice it.
- `20_levelmap_parts` (green, 3 rows): empty stop · current stop (yellow, glowing, taped) · locked stop (grey, padlock) · boss stop (bigger, angry red bald face with a crown) / gold star · empty star · done stamp (red, tick + hearts) · yellow padlock / world icons tree (park) · football (field) · building + street lamp (city) · school · palm + sun (beach) · snowflake + snowman (winter).
- `21_icons_ui` (green, 4×3 round): play · back (curved arrow) · home · storybook / bag · gear · sound on · sound off / fullscreen arrows · globe · coin · gift.
- `22_icons_shop` (green, 3×2 round): fast feet (sneaker) · long items (hourglass) · quick help (hands lifting a kid) / wardrobe (t-shirt on a hanger) · items (toy box) · upgrades (arrow up).
- `23_wardrobe` (green): row 1 cap · beanie · crown · bow · flower · cat ears; row 2 cat ears again (duplicate) · pink hairband · top hat · viking helmet · pirate hat · glasses; row 3 jackets: blue zip jacket · green hoodie · rainbow-striped zip · red zip hoodie · purple jacket with pink cape · brown trench coat; row 4 pants: brown shorts · jeans · red/yellow striped · denim overalls · grey joggers. Clear matches with the game's ids: hats `cap`, `beanie`, `crown`, `bow`, `flower`, `ears`, `tophat`, `viking`, `pirate`, `glasses` (pink hairband ≈ `headband` "Ninja band" — loose); jackets `hoodie` (green), `stripes` (sheet is rainbow, game orange), `cape` (purple+pink cape ≈ Superhero, game red/blue — loose); pants `jeans`, `shorts`, `joggers`. No `none` hat, no hair styles. Everything else keeps the 3D preview.
- `24_effects` (green, 3 rows): yellow burst · red burst · pink burst with speed lines / two steam puffs (left- and right-facing) · angry dark storm cloud with lightning · green stink lines with flies · dizzy-star ring · heart cluster / speed lines (3 strokes) · dust (3 puffs) · yellow sparkle · band-aid · confetti (many bits).
- `25_phone_controls` (green): joystick base with the blue knob drawn **on** it (one region) · kiss button (lips) · kit button (band-aid) · kit button again (duplicate) · blue pause button.
- `8_start` (paper, 4 comic panels, empty speech bubbles): dad comes home to a messy room · kids run past, BONK, he falls · empty fridge, GRRR · dads in a café under storm clouds — = `docs/story.md` "Как всё началось".
- `9_1_boss_park` · `9_2_boss_field` · `9_3_boss_city` · `9_4_boss_school` (paper, framed): each world with its angry boss (red tracksuit · football kit with ball · hard hat + vest · shirt over red t-shirt, tie, bag), "GRRR!", the messy house, kids hiding behind a bush by the blue house.
- `26_1_bonus_beach` (paper): angry dads sunbathing under umbrellas, kids behind a bush. `26_2_bonus_winter` (paper): angry dads in ushankas building an ice-block wall, kids behind snow.
- `10_end` (paper, framed): everyone — kids, the dad, the coach, the builder, the grumpiest dad, other dads — at a long table in the schoolyard eating cupcakes, confetti (= `docs/story.md` "Как всё закончилось").
- `11_win` (paper, framed): the dad smiling and walking to his messy house, kids cheering "YAY!", confetti and coins.
- Not used by this spec: `1_papa`, `3_papas`, `4_papas_bosses`, `4_papas_bosses_new`, `5_papas_main_boss`, `6_personas`, `7_1…7_4`, `16`, `17` (3D / SPEC-021–022 references), `bigone.webp` (paper concept sheet: the five Big One looks + poses), `persons.webp` (paper kids turnaround + poses), `art/v1/*` (old v1 style: `main`, `location_*`).
- `v1/staff` (paper, 3×4 framed cells with Spanish labels): speed boots · invisibility cape · star shield / banana · mittens (red) · super gloves (gold = mega) / kiss (lips + heart) · star · coin / full heart · half heart (split) · empty heart. Slice by fixed cell boxes (labels outside), not by green.

**Pipeline traps**: connected-region slicing splits `19_logo` (letters), `24_effects` (steam pair, 3 dust puffs, 3 speed lines, confetti, flies), and keeps `25`'s knob glued to the base — the manifest needs per-sheet modes: whole-picture key, region slice with a merge distance or explicit boxes, fixed grid (`v1/staff`), and a circle crop for the knob. Paper pictures (`14`, `18_*`, story, `0_main`) are resized only.

**Where things are in `index.html`** (approx. lines, see `docs/architecture.md` section table): loading screen = the `#loading` div ("BeBeBe Atrapar 3D…", line ~34; removed right before `window.__bbReady = true` at the end of the module, ~6718; the 6-s offline hint script ~37) — tests wait 30 s for `__bbReady`, so the loader must not hold it; 2D drawing helpers ~3263–3535 (`drawHpHeart(x, y, s, f)` + `heartFill`, `drawKiss`, `drawKit`, `drawFx`, `addButton`, `drawSticks`); phone HUD ~3542–3767 (`drawHUDPhone`, `drawHUD`, `kissButton`/`kitButton`, `kissBtnRect`; HUD pause "II" ~3606 phone / ~3691 desktop); menus ~3938–4060 (`menuFrame`, `phoneFrame`, `shopCards`, `SHOP_PICTURES`/`shopPicture`, `worldPicture`); level map ~4061–4301 (`WORLD_ICONS`, `mapGeom`, `stopRects` — `boss` = the last stop **in every world, bonus too**, `paintMapPage` (the dotted path is painted there), `drawMapPage` + `mapBgCache`, `drawStop`, `drawMap`, `drawLevelCard`); story ~4302–4414 (`storyArt`, `storyPicture(c)` loader with `bad` fallback, `storyPlaceholder`, `drawStory`); win ~4415–4473 (`RW_ICONS`, `drawRewardLines`); wardrobe ~4474–4540 / 4775–4859 (`wardrobeDesktop`/`wardrobePhone`, previews `skinPanels()` 3D); shop tabs ~4541–4669 (`UPG_ICONS`, `SHOP_TAB_ICONS`, `upgradeCards*`, `phoneShopBar`); home ~4670–4774 (`homeActions`, `homeGroups`, `drawHomeDesktop`/`drawHomePhone`, ids `home:play|story|shop|lang|sound`, `home:title`, `home:bonus:<w>`, `home:inv:<k>`, `coins`); overlays ~4860–5209 (`endActions`, `pauseActions`, `drawOverlayPhone`, `drawOverlay`, `drawUI`). Every menu colour/size is in `CFG.MENU_LOOK` (`map`, `story`, `home`, `frame`, …). `STORY` (~506) chapters have `image: null` (paths not set so `file://` requests nothing) — set them to `assets/…` now.
- Effects today: particles `burst(x, y, kind, color, n)` with kinds `heart` (drawn by `drawHeart`), `star` and `dust` (circles) → map to the hearts / sparkle / dust sprites; pop texts `popText()` → `texts`, drawn in `drawFx` at `toScreen(x, y, 40)`: BONK = `L().bang` ("BAM!"), hug = `hug`/`megaHug`, kiss = `kissHit` ("Mwah!"), thrown out = `thrownOut`. Dizzy stars are **3D** today (`dizzyStars` on the Little One model, the Big One's `stars` group); steam, storm cloud, stink lines, confetti and speed lines have no current counterpart (SPEC-022 uses steam/cloud).
- HUD today: no coin count in play (coins show on home/map/shop via `coinPlate`); item counts = the mittens plate + "💋 ×N" / "🩹 ×N" (no touch) or the kiss/kit button badges; Big One hearts via `drawHpHeart` in `drawHUD` (desktop) and `drawHUDPhone`; the half heart is drawn left red / right grey today (the `13_interface` "half" cloud is a whole paler heart).
- Phone controls: stick `stickR()` = `CFG.PHONE_STICK_R` 60 CSS px (desktop `STICK_R` 55), SPEC-019's dashed tiptoe ring at `TIPTOE_MAX × stickR()` must stay visible on the drawn base; kiss/kit share one slot (`CFG.KISS_BTN` 70, `CFG.PHONE_KISS_BTN` 80 CSS px); `CFG.PHONE_BTN_MIN` 44.
- Icons (AC 9): `scripts/make-icons.js` renders `icons/icon.svg` through Chromium into `icon-192/512.png` (round-rect, transparent corners), `apple-touch-icon.png` and `icon-512-maskable.png` (opaque, BG `#5f9e4a`); `tests/pwa.spec.js` "icons exist" requires `icons/icon.svg` and fully opaque apple/maskable PNGs; `index.html` links `icons/icon.svg` as the favicon; theme/background `#2b3a2e` in `manifest.webmanifest`, the `theme-color` meta and `body`. A redrawn icon → `SW_VERSION` bump (hard rule 8).
- Deploy: `pages.yml` `deploy` copies only `index.html manifest.webmanifest sw.js` + `icons v1-2d` — add `assets/` (in whatever shape SPEC-023 leaves the workflow); `art/` stays source-only. `sw.js`: precache list `PRECACHE_LOCAL`; `icons/` and three.js are cache-first, everything else network-first.
- The published claude.ai single page has no `assets/` folder → it runs on the AC 2 fallbacks (hard rule 1 still holds). From `file://`, `<img>`/`new Image()` of `assets/…` loads; it taints only canvases it is drawn into — never draw assets into `groundCanvas` (`__bb.groundColorAt` reads it with `getImageData`).
- `sharp` is a new devDependency (CI's `npm ci` installs it); `art/assets.json`, `scripts/assets.js`, `assets/`, `tests/assets.spec.js` are all new. BACKLOG has a matching item: "a general `artImage(path)` loader (the `storyPicture` one)".
- `11_win` has no screen in the ACs (only "win picture" in Context): put it through the pipeline; showing it is optional (SPEC-022's "becoming kind" matches it) — if unused, note it in BACKLOG.
- Speed rules vs AC 11: screenshots at 932×430 are required by this AC, although the orchestrator's habit is desktop + 667×375 only — the AC wins.
