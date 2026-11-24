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
