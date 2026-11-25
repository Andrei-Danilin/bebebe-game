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
