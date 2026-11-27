# Performance notes

## SPEC-020 — art pass 1 (AC 10), measured 2026-11-24

**Question:** do the drawn sprites (2D layer: HUD, effects, phone controls) make a frame in play slower than today's code drawing?

**Method** (throwaway script, local, Playwright's Chromium with software WebGL — SwiftShader):
- phone viewport 667×375, `?phone=1`, file://;
- the same scene each time: `seedRandom(7)`, Park level 3, one player, 3 kisses and mittens in the HUD, the Big One parked
  (`state = "look"`, long timer), a heart burst every 10 frames;
- `window.requestAnimationFrame` wrapped by an init script: the time of each rAF callback is recorded, which is the game's
  `frame()` — logic, the JS side of the 3D render, and the whole 2D layer (`drawUI`);
- 60 frames per run, the first 5 dropped; 3 rounds, alternating "with art" and "assets/ answered 404" (the code drawing);
  the median per round, then the median of the rounds.

**Result:**

| | JS time per frame (median) | rounds |
|---|---|---|
| with art | **11.1 ms** | 11.3 / 10.6 / 11.1 |
| without art (assets/ 404) | **11.3 ms** | 11.8 / 10.8 / 11.3 |

No regression: the difference is within the noise between rounds. Whole frames could not be compared this way: headless
software rendering throttles them to a fixed 150 ms.

**Start-up:** while every sprite loaded during the start of the module, `window.__bbReady` came about 0.6 s later per fresh
page (median 3.2 s vs 2.6 s). Since the loading starts at `artGate()`, the end of start-up, it is 2.9 s vs 2.7 s (noise).

**First paint:** the loading screen (plain HTML with its own paper background) paints at ~70 ms on a cold cache
(`first-paint`); test "the loading screen shows within 1 s on a cold cache" in `tests/art.spec.js`. `first-contentful-paint`
is ~2 s here on master too (software rendering), so the test uses `first-paint`.

## SPEC-027 — new clothes in 3D, emoji pictures (AC 5), measured 2026-11-24

**Method:** `node scripts/perf.js --base master --rounds 6 --level 16 --wear trench,striped` (paired A/B, local GPU, below-normal
priority, phone 844×390 `?phone=1` and desktop 960×640). Park 16: the bots wear Rainbow, the teal and purple zip jackets and
the Overalls; player 1 wears the Detective coat and the Striped pants (in master the same level, its own clothes). Since
SPEC-027 `perf.js` copies `assets/` next to the base build too, so both builds draw with art (before, the base build had no
sprites and fell back to code drawing). JS = the game's rAF callback; GPU = the same + a 1-pixel readPixels.

| Viewport | JS A → B (median of rounds) | ratio (median of pairs) | GPU A → B | ratio |
|---|---|---|---|---|
| phone 844×390 | 7.2 → 6.8 ms | ×1.10 | 10.9 → 10.3 ms | ×1.01 |
| desktop 960×640 | 9.3 → 9.5 ms | ×1.00 | 13.9 → 14.9 ms | ×1.11 |

The small new parts (rainbow bands, trouser stripes, overall buttons) cast no shadow. Within the SPEC-021 budget (+10 %) on
the medians; the paired ratios sit at the edge. The machine was busy (other runs that hour: the same scene gave ×0.97–×1.4 on
phone JS and ×0.96–×1.16 on GPU between runs; park 2 default scene ×1.29 / ×1.07 phone, ×1.04 / ×1.11 desktop): the spread
between runs is larger than the difference between the builds.

## SPEC-025 — start times before and after vendoring three.js (AC 1b), measured 2026-11-25

**Question:** does shipping three.js with the game (minified, from this origin) instead of loading it from jsDelivr change how
fast the game starts?

**Method:** `node scripts/perf.js --start --rounds 3` with `PW_GPU=0 PW_NICE=0` (software WebGL — SwiftShader, as on CI), the
phone view of the CI runs (667×375, `?phone=1`, touch), no service worker. A = `master` before vendoring (three.js
`three.module.js` + `three.core.js`, 2.1 MB unminified, from jsDelivr over the real network), B = the vendored minified files
(0.8 MB) from the game's own server. Per round a cold start (a new browser context: empty HTTP cache) and a warm one (a second
page of that context: HTTP cache). Times in ms from navigation start, median of 3 rounds:

| | first paint | `__bbReady` | home screen interactive |
|---|---|---|---|
| cold, before (jsDelivr) | 56 | 779 | 5718 |
| cold, after (vendored) | **44** | **491** | 5566 |
| warm, before | 48 | 512 | 5567 |
| warm, after | 44 | 546 | 5518 |

**Result:** a cold start is ready ~0.3 s sooner (no CDN round trips, a third of the bytes to parse); a warm start is the same
within the noise. "Home screen interactive" (the first frame with the home screen's buttons and no loading screen) is ~5.5 s
on both sides: there the loading screen waits for the art sprites (`LOOK.ART.waitMs`, decoding all sprites in software
rendering), not for three.js — RR-46 (load the large pictures per screen) is the lever for that, not this spec.

## SPEC-040 baseline — today's code, before any change (step 1), measured 2026-11-27

**Code:** `master` 0c30772 (SPEC-039 merged). **Machine:** Andrei's Windows PC, Playwright's Chromium, once with the GPU (ANGLE d3d11, 60 Hz
vsync) and once with software WebGL (`PW_GPU=0`, SwiftShader, as on CI). **How:** `PERF_OUT=<file> npx playwright test tests/perf.spec.js -g
"SPEC-040"` (one JSON line per number: `{key, value, gl}`) and `PERF_OUT=<file> node --test tests/core/garbage.test.mjs`. Views: phone =
667×375 `?phone=1`; tablet = 1180×820, no `?phone=1` (a tablet counts as desktop). Counts are the same on the GPU and on SwiftShader;
times are not (frames are 16.7 ms on the GPU, 80–150 ms on SwiftShader, so only the counts are gates). After SPEC-040 the same tests
are run again and the "after" numbers go in the section below this one.

**Draw calls** = `renderer.info.render.calls` of the main pass, shadow pass included (checked on Beach 2, tablet: 3061 calls = 1295
colour + 1766 shadow; 2301 meshes, 947 of them outline hulls that cast a shadow). Sampled after 3 frames of the level. "Busiest" = the
level with the most calls of levels 1–20 of the world on that view, found by the scan test (`PERF_SCAN=1`, 240 levels, ~3 min); the
level is in `BUSIEST` in the test.

| World (busiest level) | phone calls (limit 300) | tablet calls (limit 600) |
|---|---|---|
| Park | 690 (L3) | 1510 (L3) |
| Field | 775 (L3) | 1685 (L3) |
| City | 736 (L3) | 1656 (L3) |
| School | 761 (L3) | 1650 (L2) |
| Beach | **1160** (L3) | **3061** (L2) |
| Winter | 787 (L2) | 1637 (L2) |

Across all 20 levels: phone 556–1160, tablet 1142–3061. Triangles: ~90–100 k phone, 150–200 k tablet. The phone count falls once the
camera follows the hero (Park 3: 690 at the start, 612 after 3 s on the GPU, 328 in the SwiftShader run after 3 s — the camera moves
with real time); the gate takes the level-start view, which is the same on every machine.

| Other numbers | Baseline | Bound (AC) | Flips in |
|---|---|---|---|
| Decoded sprites at the home screen | **83 MB**, 163 of 163 sprites (assets/ is 4.1 MB on disk) | ≤ 25 MB (AC 1) | step 2 |
| `render3D` per 2 s under story / comic scene / Character ×4 tabs / grown-ups | GPU 98–120 (= every frame, 49–60/s); SwiftShader 7–8 | 0 (AC 3) | step 3 |
| `render3D` per 2 s while paused | GPU 107; SwiftShader 7 | ≤ 1 (AC 3) | step 3 |
| `render3D` per 2 s under the rotate overlay (touch, 375×667 `?phone=1`) | GPU 120; SwiftShader 53 | 0 (AC 3) | step 3 |
| `render3D` per second in the menus (home / map) | GPU 55.9 / 54.2 (frame loop 55.9 / 54.2 fps); SwiftShader 3.6 | ≤ 30 (`CFG.MENU_FPS`, AC 3) | step 3 |
| New GPU work inside the first 60 frames: new world (Beach 3 after Park 1, phone) | 5 programs, 477 geometries, 0 textures | 0 (AC 4, the count is the gate) | step 5 |
| same, first boss (Park 20 after Park 1) | 2 programs, 217 geometries, 0 textures | 0 | step 5 |
| Slowest frame in the first 60 of a level (phone) | beach 3: 717 ms GPU / 3700 ms SwiftShader; park 20: 383 / 433; park 3: 617 / 617; winter 2: 367 / 733 | (release-readiness §5: ≤ 500 ms on the weak Android) | step 5 |
| p95 first 60 frames vs steady (AC 4's ratio, ≤ 1.5) | GPU: 1.0 (everything is vsync 16.7 ms; the hitch is 1–3 frames, below the 95th percentile of 60 frames); SwiftShader: 1.5 beach, 0.4 boss (noise) | judged on a real GPU only | step 5 |
| `measureText` calls per 2D frame | home **15** (14.7 GPU, 18.4 SwiftShader); Character progress **111**; items **116**; wardrobe **73**; upgrades **93** | ≥ 5× fewer (AC 9) | step 7 |
| Typed arrays allocated in steps 2–600 of a headless game (`tests/core/garbage.test.mjs`) | Park 1 (1 player + 4 bots): **884** (704 Uint8Array, 60 Int32Array, 120 Float32Array); Winter 18 (5 players): **452** (134 / 106 / 212) | 0 (AC 10) | step 7 |
| Splices of the event log in 100 events on a full log | 100 (one per event) | 0, a ring (AC 10) | step 7 |
| Phone frame time p50 / p95 over frames 61–180 of the busiest level | GPU: 16.7 / 16.8 ms on Park 3, Beach 3 and Winter 2 (vsync-bound, no headroom shown); SwiftShader: 83 / 100, 100 / 100, 117 / 150 ms | no regression beyond noise (AC 12) | recorded each step, not gated |
| Phone draw calls after 180 frames (Park 3 / Beach 3 / Winter 2) | GPU 612 / 1112 / 719; SwiftShader 328 / 967 / 881 | — | — |

**What dominates.**
- *Draw calls:* 947 of the 2301 meshes on Beach 2 are outline hulls and they all cast shadows; every part is two meshes (fill + hull) and the
  shadow pass draws both. The 300 / 600 limits need roughly a 3–5× cut (phone 690–1160, tablet 1510–3061), so hulls-without-shadow
  alone (≈ halves the shadow pass) is not enough: instancing of decor is needed. Beach is the outlier (palms: 30 parts each) at ~1.7×
  the other worlds.
- *Memory:* 83 MB decoded for 4.1 MB of WebP on disk; 163 sprites, the big ones are the backgrounds (map, menu, story), not the HUD.
- *Menu / covered screens:* nothing is skipped today: `render3D` runs on every frame (50–60 per second on a 60 Hz GPU) on every screen.
- *measureText:* the Character tabs call it 73–116 times per frame, 5–8× the home screen's.
- *Frame time:* on the GPU everything is vsync-bound at 16.7 ms, so p50/p95 cannot show a regression there; the count tests and the
  hitch (max) are the useful numbers. Only SwiftShader frame times are informative as a relative measure (and noisy).
- *The first-60 p95 rule of AC 4 is weak:* 60 frames' p95 ignores the worst 3 frames, and the hitch is 1–3 frames. The gate that
  catches it is the count of programs / geometries first made in those frames (the test), plus `max` in the report.

## SPEC-040 step 5 — the warm-up behind the level card (AC 4), measured 2026-11-27

**What changed.** Opening a level's card (`chooseStop`) starts `src/client/warm.js`: one stage a frame — the showcase game of that level
(`game`), its 3D map (`map`: parts, geometries, batches), the fade shader variants (`shaders`: `renderer.compileAsync`), the models
(`chars`), then the world drawn a few top-level parts a frame into a one-pixel scissor (`upload`: geometry, instance and vertex buffers,
the ground and hatch textures) — and a last world frame once it is shown again. Play (`startGame`) ends the warm-up and finds the map
(same `mapKey`) and the models (same looks) already there. If Play is pressed before the end, the normal start builds what is missing
(never more than before). Retry, a practice game and `__bb.startGame` use the same reuse (the map of the same level and the models of
the same team stay), but Next builds its level when it is pressed, as before (the win screen shows the finished game, so the next
level cannot be built under it).

**AC 4 numbers** (phone view 667×375, `?phone=1`, the level started through its card, the warm-up run to its end; programs / geometries /
textures first made in the first 3 frames after Play, slowest frame of the first 60):

| | before (step 4 code, `startGame` straight) | after |
|---|---|---|
| Beach 3 after Park, GPU | first 60 frames made 5 programs, 477 geometries, 0 textures; slowest frame 717 ms | 0 / 0 / 0; slowest frame 16.8 ms (p95 16.7 vs steady 16.8) |
| first boss (Park 20), GPU | 2 programs, 217 geometries; slowest 383 ms | 0 / 0 / 0; slowest 16.8 ms |
| Beach 3, SwiftShader | slowest 3700 ms | 0 / 0 / 0; slowest 200 ms (p95 ratio 1.2) |
| Park 20, SwiftShader | slowest 433 ms | 0 / 0 / 0 in the first 3 frames; slowest 250 ms (5 geometries by frame 60: the items and stars of a game that has run 9 s of game time on a slow machine) |

**Where the time went** (phone, GPU; ms; one fresh level each):

| | Play pressed with nothing warmed (before) | the warm-up, behind the card | Play after the warm-up |
|---|---|---|---|
| Park 1 / Beach 3 / Park 20 / Winter 2 / City 5 | `startGame` 65 / 238 / 114 / 113 / 120, then the first frame 108 / 194 / 110 / 174 / 109 | 1.0–1.4 s in 40–55 frames; the longest frame 112 / 168 / 164 / 112 / 196 (`map` stage; Beach was 423 before the shader stage went async) | `startGame` 3–8, first frame 10–15 (Park 1, the first level of the session: 37) |
| SwiftShader | `startGame` 313–479, first frame 34–479 | 2.6–3.2 s; longest frame 565–812 (the first level of a session: 3107, the shaders) | 4–8 and 12–59 (the first level of a session: 128 and 368) |

Per stage on this machine (GPU, phone): the game of the level 30–120 ms (a first-time level: more), the map 75–195 ms (Beach the most),
the models 25–30 ms, the upload 110–275 ms in all, split over ~6–12 frames.

**Not done / notes.** A cross-level geometry cache is not needed after step 4's geometry scope: each map joins its parts into new buffers
anyway, and what is repeated across levels (the instanced shapes) is small. The wardrobe's previews, the minimap and the paper are not
part of the warm-up. A level started through Next on the win screen still hitches as in step 4 (build + first frame ~100–270 ms GPU):
warming it would need a second scene or a second map group.

## SPEC-040 step 6 — quality tiers (AC 6, 7; D-4, D-17), measured 2026-11-27

**The tiers** (`LOOK.QUALITY`, numbers in `docs/game-design.md` after `npm run docs:numbers`):

| | high (today's picture) | medium | low (D-4) |
|---|---|---|---|
| pixel-ratio cap | 2 (touch 1.5) | 1.5 | 1 |
| MSAA | yes | yes | no (a new canvas and renderer) |
| shadow map | 2048, PCF (soft) | 1024, PCF | 1024, basic (hard-edged) |
| paper grain | yes (not on phones, as before) | yes | no |
| background decor (outside the fence) | all | 3/4 | 1/2 |
| outlines, hatching, the play area, walls, bushes, trees that matter, logic | as is | as is | as is |

Low keeps a basic shadow map rather than blob shadows: it stays a shadow of the right shape from the one pass that exists, while blobs
would need new drawing for every character, tree and house. The decor thinning is positional: the sequence of the seeded decor is drawn in
full and the n-th piece is kept when the running share grows (`keepDecor`), so every device of a tier gets the same decor, and the map's
walls, roofs, trees, bushes and the level are untouched (the pieces count is equal in all tiers; `test:core` and the same-seed tests stay green).

**Choice.** A pinned tier (tests) or the grown-ups' choice (saved) is used as it is. In auto mode a start probe draws the home scene 8 times
at the high tier (the first 2 compile the shaders; ≤ 600 ms in all), waits for the GPU each time (readPixels) and takes the median ms per
frame: ≤ 10 ms high, ≤ 22 ms medium, else low. (10 ms keeps a 60 fps phone's frame inside the iPhone 8 row of D-17, p95 ≤ 25 ms; 22 ms is
what a frame may cost on the weakest row, p95 ≤ 45 ms, after the cuts of the lower tiers.) In play, in auto mode: the p95 of the last 3 s of
frame times (frames over 500 ms — a level build, a hidden tab — are not counted; at least 20 frames) over 45 ms (D-17's loosest p95, the
low-end Android) for 5 s drops one tier; a pause, a menu and a level just built do not count; the tier never goes up during a run; the next
start probes again. Changing the tier rebuilds only what the tier changes: MSAA = a new canvas and renderer (the old context is given
up on purpose: `forceContextLoss`, with its loss listeners moved first, so no "tap to continue" card), shadows, the pixel ratio, the grain,
and the decor = the 3D map is built again; the game and the level go on.

**Draw calls / triangles per tier** (colour + shadow, one level per world at level start, `render3D` at fixed times; `deviceScaleFactor` 2 on the
phone view; GPU). The draw calls are the same in every tier — the decor is instanced or joined — so the tiers cut triangles and pixels:

| | phone 667×375: high | medium | low | tablet 1180×820: high | medium | low |
|---|---|---|---|---|---|---|
| Park 3 | 155 / 177k | 155 / 161k | 155 / 146k | 217 / 189k | 217 / 173k | 216 / 158k |
| Field 3 | 151 / 203k | 151 / 174k | 151 / 148k | 212 / 215k | 212 / 186k | 211 / 160k |
| City 3 | 172 / 169k | 172 / 140k | 172 / 114k | 234 / 181k | 234 / 153k | 233 / 126k |
| School 2 | 144 / 195k | 144 / 167k | 144 / 140k | 203 / 207k | 203 / 178k | 202 / 152k |
| Beach 3 | 167 / 132k | 167 / 115k | 167 / 100k | 235 / 145k | 235 / 128k | 234 / 113k |
| Winter 2 | 156 / 130k | 156 / 125k | 156 / 121k | 215 / 142k | 215 / 137k | 214 / 133k |

Canvas on the phone view with the 2× screen: high and medium 1000×562 (high stops at 1.5 on touch screens as before), low 667×375. High
is pixel-identical to the step-5 picture in Park, Field, City, School, Beach (0 differing pixels, 960×640 and 667×375); in Winter 0.3–0.5 %
of the pixels differ, the snow particles (their start positions come from the view's random stream). Low-tier screenshots: `shots/SPEC-040/step6/`.

## SPEC-040 step 7 — text memo, ring buffer, scratch buffers (AC 9, AC 10), measured 2026-11-27

`ctx.measureText` calls per 2D tick (10-tick windows, the `perf.spec.js` AC 9 test; the baseline is step 1):

| screen | before | after |
|---|---|---|
| home | 15 | 0 |
| Character: progress | 111 | 0 |
| Character: items | 116 | 0 |
| Character: wardrobe | 73 | 0 |
| Character: upgrades | 93 | 0 |

Every measure goes through `textW` (`ui/measure.js`, remembered per font + text) and `fitText` / `wrapText` / `labelFit` remember their
result per (text, size, weight, width, min); both memos are emptied on a language change, a refit (resize), a finished font load and at
`LOOK.TEXT_MEMO_MAX` (6000) entries. After the first frame of a screen a menu measures nothing.

Core garbage (`tests/core/garbage.test.mjs`, steps 2–600 of a headless run):

| | before | after |
|---|---|---|
| typed arrays allocated, Park 1 (1 player + 4 bots) | 884 | 0 |
| typed arrays allocated, Winter 18 (5 players) | 452 | 0 |
| splices of the event log, 100 events on a full log | 100 | 0 |

`npm run bench:core` (100 games × 60 game-s; two runs each, same machine, ms per game step):

| | median | p95 |
|---|---|---|
| before, run 1 / run 2 | 0.053 / 0.075 | 0.226 / 0.318 |
| after, run 1 / run 2 | 0.050 / 0.069 | 0.206 / 0.265 |

Client: `drawUI` empties `hudRects` and `edgeArrows` instead of making new arrays, the wardrobe preview cache key is made from the four
picks (no `JSON.stringify` per frame), the camera shake uses one scratch vector.

## SPEC-040 result — before and after (step 8, AC 12), measured 2026-11-27

**Before** = the step-1 baseline above (`master` 0c30772). **After** = the branch at step 8, same machine (Andrei's Windows PC, Playwright's Chromium), GPU run of `PERF_OUT=<file> npx playwright test tests/perf.spec.js -g "SPEC-040"` and, for the frame times, an A/B of the master tree and the branch in the same session with the same script (SwiftShader, `PW_GPU=0`). Views as in the baseline: phone 667×375 `?phone=1`, tablet 1180×820. Tier: high (the tests pin it).

| What | Before | After | Bound |
|---|---|---|---|
| Draw calls, busiest level, phone (Park / Field / City / School / Beach / Winter) | 690 / 775 / 736 / 761 / **1160** / 787 | **155 / 151 / 172 / 145 / 167 / 156** | ≤ 300 |
| Draw calls, busiest level, tablet (same order) | 1510 / 1685 / 1656 / 1650 / **3061** / 1637 | **217 / 212 / 234 / 203 / 234 / 215** | ≤ 600 |
| Triangles, same levels, high tier, phone | ~90–100 k | **130–203 k** (Park 177 k, Field 203 k, City 169 k, School 196 k, Beach 132 k, Winter 130 k) | recorded |
| Triangles, same levels, high tier, tablet | 150–200 k | 141–215 k | recorded |
| Triangles per tier (phone / tablet) | no tiers | high 130–203 k / 141–215 k; medium 115–174 k / 128–186 k; low 100–148 k / 113–160 k (step 6 table above) | recorded |
| Decoded sprites at the home screen | 83 MB (163 of 163) | **22.2 MB** (105 loaded, 104 resident) | ≤ 25 MB |
| `render3D` per 2 s under story / comic scene / Character ×4 / grown-ups | 98–120 (every frame) | **0** | 0 |
| `render3D` from the pause until quiet | 107 per 2 s | **2** in all, then none | ≤ 1 per 2 s once quiet |
| `render3D` under the rotate overlay | 120 per 2 s | **0** | 0 |
| `render3D` per second in the menus (home / map) | 55.9 / 54.2 | **30.3 / 29.8** | ≤ 30 |
| New programs / geometries / textures in the first 60 frames of a level started through its card: Beach 3 after Park / first boss | 5 / 477 / 0 and 2 / 217 / 0 | **0 / 0 / 0** and **0 / 0 / 0** (GPU; on SwiftShader the boss shows 5 geometries by frame 60: items and stars of a game that has run on a slow machine) | 0 |
| Slowest frame in the first 60 (card start): Beach 3 / first boss, GPU | 717 ms / 383 ms | **16.8 ms / 50 ms** | ≤ 500 ms |
| Slowest frame in the first 60 when a level is started *without* a card (`__bb.startGame`, the `phone frame time` test) | Park 3 617 / Beach 3 717 / Winter 2 367 ms | 683 / 650 / 500 ms | not changed: nothing warms it |
| `measureText` per 2D frame: home / progress / items / wardrobe / upgrades | 15 / 111 / 116 / 73 / 93 | **0 / 0 / 0 / 0 / 0** | ≥ 5× fewer |
| Typed arrays in steps 2–600 of a headless game (Park 1 / Winter 18, 5 players) | 884 / 452 | **0 / 0** | 0 |
| Splices of the event log in 100 events on a full log | 100 | **0** | 0 |
| `npm run bench:core`, ms per game step, median / p95 (3 quiet runs each) | master 0.076–0.079 / 0.322–0.377 | branch 0.074–0.077 / 0.311–0.348 | no regression |
| Phone frame time, steady, GPU (Park 3 / Beach 3 / Winter 2), p50 / p95 | 16.7 / 16.8 for all three | 16.7 / 16.8, 16.7 / 16.7, 16.7 / 16.7 | vsync-bound: no information |
| Phone frame time, steady, SwiftShader, master tree vs branch, same session, p50 / p95 ms (two runs) | Park 117 / 238 and 101 / 188; Beach 111 / 196 and 102 / 163; Winter 114 / 180 and 114 / 136 | Park 122 / 284 and 116 / 228; Beach 118 / 164 and 119 / 173; Winter 113 / 148 and 115 / 149 | see below |

**What got worse.**
- *Triangles at the high tier on the phone* are about 1.3–2× the baseline's (130–203 k against ~90–100 k at the level start; in the SwiftShader A/B, mid-game, 92–137 k against 38–81 k). The cause is most likely the instancing (not separately verified): an `InstancedMesh` is one draw call but three.js culls it as a whole, so the instances outside the view are still sent, where single meshes were culled one by one. The tablet is the same as before.
- *On the software rasteriser* (SwiftShader, which pays per pixel and per triangle, not per draw call) the steady frame is not faster: p50 is 0–15 % slower in Park and Beach (122 against 117 and 101, 118 against 111 and 102), Winter is the same, p95 is mixed (Park slower, Beach and Winter equal or better). It is inside the spread between two runs of the same build, but the direction in Park and Beach is consistent. The 5–8× cut in draw calls is a gain for a device whose cost is per call (the weak Android the review is about); this machine has no such device, so that gain is measured in counts only, and the real check is the device pass.
- *A level started without its card* (`__bb.startGame`; a Next after a win) still hitches 500–700 ms; only the card start is warmed (BACKLOG line from step 5).

Nothing else regresses beyond noise: the GPU frame is vsync-bound at 16.7 ms on both sides, `bench:core` is level, every count above moved the right way.

**AC 8 pictures** (`shots/SPEC-040/final/` in the run's scratch folder, not committed): the high tier of the branch against `master` 0c30772, one level per world (Park 3, Field 3, City 3, School 2, Beach 3, Winter 2), the 3D only, the same seed, the same hand-drawn frame, 960×640 and 667×375 `?phone=1`:

| view | world | pixels that differ | over 40 (of 255) | max channel | mean |
|---|---|---|---|---|---|
| 960×640 | Park / Field / City / School / Beach / Winter | 2.01 / 2.10 / 1.78 / 1.69 / 2.88 / 2.15 % | 0.001 / 0.001 / 0.002 / 0.039 / 0.000 / 0.096 % | 47 / 51 / 54 / 53 / 44 / 211 | 0.24 / 0.23 / 0.22 / 0.24 / 0.27 / 0.35 |
| 667×375 | Park / Field / City / School / Beach / Winter | 1.68 / 1.24 / 1.19 / 1.52 / 1.84 / 1.87 % | 0.000 / 0.000 / 0.000 / 0.000 / 0.000 / 0.057 % | 40 / 34 / 40 / 38 / 40 / 205 | 0.30 / 0.21 / 0.23 / 0.25 / 0.28 / 0.40 |

The differences are thin shadow edges (the joined and instanced pieces rasterise a pixel differently) and, in Winter, the self-shadow of the rocks (max 205–211, 0.06–0.10 % of the pixels). Low-tier pictures of the same levels, both sizes: `low-desk-<world>.png`, `low-phone-<world>.png` in the same folder.
