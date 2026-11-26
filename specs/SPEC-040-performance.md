# SPEC-040 — Performance pass: less memory, fewer draw calls, quality tiers for weak phones

Status: ready
Complexity: L
Branch: SPEC-040-performance
Decided by: Andrei (2026-11-26).
- D-4: what the low quality tier may drop — keep outlines and hatching; drop MSAA and paper grain; basic 1024 or blob shadows instead of PCF; half of the background decor.
- D-17: device thresholds as in `docs/reviews/release-readiness.md` §5.
The release-review performance items (RR-42, 43, 46–51, F13) as written there. Numbers not given there: Claude.

## Description
The game runs well on a good phone, but it is heavy for weak Android phones and older iPads:
- all 155 sprites (~70 MB decoded) load at start;
- the 3D view has many draw calls;
- trees and roofs are always transparent;
- menus redraw the 3D behind full-screen pages;
- the first frames of a new world hitch;
- some code allocates every frame.

Make it lighter without changing the picture on good devices, and add quality tiers that step down on slow ones.

## Context
(Pre-flight against master; match names.)
- 3D:
  - `src/client/three/*` (`part()`, `characters.js`, `map3d.js`, `materials.js`, `houses.js`, `setup.js` renderer, shadows, MSAA, outlines/hatching of SPEC-021, paper grain);
  - `render3D` in `src/client/main.js`;
  - fades of trees, bushes and roofs.
- Art: `src/client/art.js` (`artLoad`, `art()`, `ART_NAMES`), `scripts/assets.json`.
- Text: `src/client/ui/text.js` (`fitText`, `wrapText`, `labelFit`).
- Core garbage:
  - the event log (`logEvent`, `splice`);
  - pathfinder buffers (`src/core/path.js`, or `grid.js` after SPEC-039).
- Perf:
  - `src/client/perf.js`, `tests/perf.spec.js`, the perf overlay;
  - the device checklist and thresholds in `docs/reviews/release-readiness.md` §5.
- Fixed step (SPEC-034): game time is already independent of frame rate.

## Out of scope
Gameplay, balance numbers, new art. The high tier must look the same as today.

## Acceptance criteria
### Memory and loading (RR-46)
1. **Sprites load per screen:**
   - `scripts/assets.json` marks `resident` sprites (HUD, items, effects, buttons, icons, the current world's map background);
   - only those load at start;
   - story, tutorial, map backgrounds and menu backgrounds load when their screen opens (with the existing fallback while loading) and are released when it closes;
   - `__bb.artInfo` reports loaded and resident counts.
   - Decoded image memory at the home screen ≤ 25 MB (Claude), measured by the perf test.
   - The offline cache still holds every sprite (SPEC-038 AC 6).

### Draw calls and rendering (RR-42, 47, 48, 50)
2. **Draw calls:**
   - geometries shared in `part()`;
   - background decor and static map pieces as `InstancedMesh` per part kind;
   - outline hulls never cast shadows.
   - At most **300** draw calls (colour + shadow) on the phone view and **600** on the tablet view of the busiest level of each world (`renderer.info`, perf test).
3. **Render only when needed:**
   - no `render3D` while the 3D is fully covered (story, Character pages, grown-ups, rotate overlay);
   - one render when paused;
   - menus at most `CFG.MENU_FPS` 30 frames per second.
4. **No first-frame hitch:** `renderer.compileAsync` (or a warm-up render) behind the level card, plus a geometry cache, so the first 60 frames of a new world or the first boss have p95 ≤ the level's steady p95 × 1.5.
5. **Trees, bushes and roofs** are opaque until a fade starts, then transparent while fading.

### Quality tiers (RR-43, D-4)
6. **`CFG.QUALITY` tiers:**
   - **high:** today's picture;
   - **medium:** DPR cap 1.5, shadow map 1024, decor 75%;
   - **low** (D-4): keep outlines and hatching; no MSAA, no paper grain; basic 1024 shadows or blob shadows; half the background decor; DPR cap 1.
7. **Tier choice:**
   - a short start probe picks the tier;
   - during play it steps down after 5 s of p95 frame time over the D-17 threshold;
   - it never steps up during a level;
   - `__bb.quality` shows the tier;
   - the grown-ups page shows it and has a manual override (Auto / High / Medium / Low).
8. Screenshots of high vs today are pixel-equal within the art tolerance. Low-tier screenshots of one level per world go in the report.

### Text and garbage (RR-49, RR-51, F13)
9. **Text:** `fitText` / `wrapText` / `labelFit` are memoized per (text, size, weight, width, scale), cleared on language change and resize; the menus' text work per frame drops (perf test counts measureText calls on the home and Character screens: at least 5× fewer).
10. **Core and client garbage:**
    - the core event log is a fixed-size ring buffer;
    - the pathfinder uses per-game scratch buffers: a 600-step headless run allocates no typed arrays after the first step (test);
    - client side: per-frame arrays of `drawUI` reused, wardrobe preview keys cached, a scratch `Vector3` for camera shake.
11. **Perf overlay:** shows game time / real time (F13), draw calls, the tier and decoded sprite memory.

### Checks and docs
12. **Perf numbers:** `tests/perf.spec.js` records phone frame time p50/p95, draw calls and memory before and after on the same machine; numbers in `reports/perf.md`. Nothing regresses beyond noise.
13. **Docs:**
    - `docs/architecture.md`: tiers, resident sprites, render rules, instancing;
    - `docs/reviews/release-readiness.md`: RR-42, 43, 46–51 done;
    - `specs/BACKLOG.md`: strike the done lines.

## Implementation steps (TDD: failing test first in each)
1. Perf test baselines (draw calls, memory, measureText counts, allocations) recorded on master.
2. Resident sprites and per-screen loading.
3. Render-only-when-needed and menu fps.
4. Shared geometry and instancing; shadows off for hulls; opaque until fade.
5. Warm-up and compile behind the level card.
6. Quality tiers, probe, step-down, override.
7. Text memo; core ring buffer and scratch buffers; client reuse.
8. Overlay, numbers, screenshots, docs.
