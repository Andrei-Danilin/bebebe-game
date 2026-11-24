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
