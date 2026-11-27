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
