# SPEC-020 — Art pass 1: the notebook-comic look for every screen (2D)

Status: ready
Complexity: L
Branch: SPEC-020-art-ui
Decided by: Andrei (2026-11-23): the game takes the style of the pictures in `art/` (kids' felt-tip doodles on a notebook page, generated from `claude/art-style-brief.md`); the 3D stays 3D (SPEC-021 restyles it). Asset pipeline, which picture goes where, fallbacks, sizes: Claude (spec author).

## Description
`art/` now holds the style tile, logo, icons, buttons, level-map pieces and backgrounds, effects, phone controls and story pictures. Today every screen is drawn with plain canvas shapes and emojis. After this spec the 2D layer uses these pictures: the home screen is a notebook page with the logo, the level map shows each world's drawn background with paper level buttons, buttons and icons are the felt-tip ones, the HUD uses the drawn coins/hearts, effects (BONK bursts, steam, hearts, dizzy stars) are drawn sprites, the phone joystick and buttons are the paper ones, and the Story screen shows the comic pictures. All text stays code-drawn in three languages.

## Goal
- Every screen looks like the pictures in `art/`, on desktop and phone, offline (PWA cache), without slowing the game.
- A repeatable pipeline: Andrei drops a new picture into `art/`, `npm run assets` turns it into game-ready files.

## Context
(Pre-flight: SPEC-017 (home, level map, level card, story, shop tabs) and maybe SPEC-019 landed after this was written; SPEC-011 may have split `index.html` into modules — match names.)
- `art/` (source, committed by Andrei): `0_main` style tile; `2_icon` app icon; `12_icons` (shield, band-aid, cupcake, angry heart, pause, sound); `13_interface` (paper buttons green/pink/orange/grey, round play/pause/sound/restart, anger-heart clouds full/half/fading/empty, coin badge, level ribbon); `14_interface` notebook menu background; `15_houses`; `18_map_bg_<world>` ×6 (scenery at the edges, empty middle); `19_logo`; `20_levelmap_parts` (empty/current/locked/boss buttons, stars, done stamp, padlock, six world tab icons); `21_icons_ui` (play, back, home, storybook, bag, gear, sound on/off, fullscreen, globe, coin, gift); `22_icons_shop` (fast feet, long items, quick help, wardrobe, items, upgrades); `23_wardrobe` (hats, jackets, pants); `24_effects` (bursts, steam, cloud, stink lines, dizzy stars, hearts, speed lines, dust, sparkle, band-aid, confetti); `25_phone_controls` (joystick base + knob, kiss, kit, pause); story: `8_start`, `9_1…9_4_boss_*`, `26_1/26_2_bonus_*`; `v1/staff.webp` (boots, cape, banana, mittens, mega mittens, kiss, star, coin, hearts — **not the shield**). Sheets have a solid green background (#00ff00-ish), pictures on paper have none.
- Missing for now: `10_end` (ending), `11_win` (win picture) — use placeholders.
- PWA: `sw.js` precache list and `SW_VERSION` (hard rule: bump on every change of cached files); the Pages workflow deploys only listed paths.

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
5. **Level card, win, pause, shop, wardrobe, upgrades, story:** paper panels (notebook paper, taped corners), drawn icons for items (`v1/staff` + `12_icons` shield/band-aid/cupcake), wardrobe thumbnails from `23_wardrobe` where an item exists (others keep the 3D preview), upgrade and tab icons from `22_icons_shop`; Story chapters show `8_start`, `9_1…9_4`, `26_1/26_2` (ending: placeholder until `art/10_end.webp` exists — the pipeline picks it up when it appears).
6. **HUD:** coin and item counts with drawn icons; the Big One's hearts with the `13_interface` heart clouds (full / half / empty) — just the look; the anger meaning comes in SPEC-022; pause/sound buttons drawn.
7. **Effects:** pop-texts keep code text but sit on the drawn bursts (`24_effects`) — BONK/hug/kiss/thrown out; steam puffs, dizzy stars, heart bursts, dust and sparkles replace the current particle shapes where they exist (2D overlay sprites at `toScreen` positions, size scaled with the camera).
8. **Phone controls:** joystick base and knob, kiss, kit and pause buttons from `25_phone_controls`, same sizes as now (≥ 44 CSS px).
9. **App icon & PWA icons** regenerated from `2_icon` (192/512/maskable/apple-touch), `scripts/make-icons.js` updated; splash/theme colours from the paper palette.
10. Performance: no frame-time regression in play on the phone viewport (sprites cached, drawn with `drawImage` only); first load on a cold cache still shows the loading screen within 1 s.
11. Strings unchanged except labels that move onto buttons; all phone size tests still pass; whole suite green; screenshots (throwaway) of every screen on desktop and 667×375 / 932×430 looked at side by side with the reference pictures.

## Implementation steps
1. Pre-flight; manifest + pipeline + Node test (AC 1); commit `assets/`.
2. Loader, fallbacks, PWA precache, deploy list (AC 2, 9).
3. Home, level map, level card (AC 3, 4).
4. Panels, shop/wardrobe/upgrades, story, win/pause (AC 5).
5. HUD, effects, phone controls (AC 6–8); performance check (AC 10).
6. Screenshots against the references, whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value |
|---|---|
| icon size / button size / background width | 256 / 512 / ≤ 1600 px |
| assets budget | ≤ 4 MB total, ≤ 250 KB per background |
| green key | hue near #00ff00, soft edge 1–2 px, despill |
| new strings | none expected (labels already exist) |

## Docs to update
`docs/architecture.md` (asset pipeline, manifest, loader, fallbacks, PWA cache), `README.md` (how to add a picture: drop into `art/`, edit `art/assets.json`, run `npm run assets`), `docs/game-design.md` (look and feel — Andrei's decision), `claude/art-style-brief.md` is the project doc (Andrei/Claude keep it).
