# SPEC-010 — Smaller, see-through mini-map

Status: done (c72bcdf)
Complexity: S
Branch: SPEC-010-minimap-lighter
Decided by: the kids (2026-11-22): the mini-map is in the way — make it a bit smaller and as transparent as possible. Exact sizes, what stays visible, the fade-under rule: Claude (spec author).

## Description
On the phone the mini-map (SPEC-005) takes 26 % of the screen width and is almost opaque: a dark panel with the whole level painted in full ground colours. The kids say it hides the game. After this spec it is smaller and see-through: no ground fill, only thin silhouettes of walls, water and the two houses, a barely visible panel, and the dots of the characters stay bright so it is still useful. When the hero or the Big One walks under it, it fades almost away.

## Context
- `CFG.MINIMAP_W` 0.26 of the UI width, `MINIMAP_MARGIN` 8; `minimapRect()`; `minimapBase(r)` caches the level layer (ground fill `th.g1`, floors, safe zone blue .45, danger zone red .4, obstacles, bushes); drawing: panel `rgba(15,23,42,.35)`, base layer at `globalAlpha` 0.85, the Big One's view cone, dots for the hero/bots/Big One/stars/items, the camera frame. `__bb.minimap` returns its rect and markers. Edge arrows, the HUD, the banner (SPEC-006 fix) and buttons keep clear of its rect.
- Phone only (`PHONE`); desktop has no mini-map.

## Out of scope
- Tapping the mini-map (zoom/toggle), moving it to another corner, a desktop mini-map.

## Acceptance criteria
1. Size: `CFG.MINIMAP_W` = 0.18 (≈ 30 % smaller in each direction); margin unchanged; aspect 3:2. Everything that keeps clear of the mini-map (edge arrows, HUD chips, banner, buttons) uses the new rect; the phone layout tests still pass at 667×375, 844×390, 932×430. → `tests/phone.spec.js` "the mini-map is smaller" (rect width = 18 % of the UI width)
2. See-through base layer: no ground fill and no floor fills; walls, cottages and arena/maze walls as their dark silhouettes, water/ponds as light blue, the safe house and the Big One's house as outlines with a light tint, bushes as small dots; drawn at `CFG.MINIMAP_BASE_ALPHA` 0.45. Panel background `CFG.MINIMAP_BG_ALPHA` 0.12 (just enough to read the dots on snow and sand). → screenshot check in all four worlds (snow and sand are the hardest)
3. Markers stay readable: hero, bots, downed friends (blinking), the Big One, bonus stars and items at full opacity with a thin dark outline (dots ≥ 3 UI px radius); the Big One's view cone at 0.35; the camera frame a thin white line at 0.6. → `__bb.minimap` markers unchanged in count and kind
4. Fade under: if the hero's or the Big One's screen position is inside the mini-map rect (+ 12 UI px), the whole mini-map fades to `CFG.MINIMAP_UNDER_ALPHA` 0.2 within ~0.2 s and comes back when they leave. → "the mini-map fades when someone is under it"
5. All numbers in `CFG`; no new strings; whole suite green; screenshots looked at (throwaway): the four worlds, hero under the mini-map, 667×375 and 932×430.

## Implementation steps
1. Failing tests (AC 1, 4).
2. `MINIMAP_W` and the new `CFG` alphas; rewrite `minimapBase` without fills; marker outlines; fade with a smoothed alpha.
3. Phone layout tests, screenshots, whole suite, `code-reviewer`, docs, merge, push, close — as `RUN_S.md`.

## Numbers and texts
| Key | Value |
|---|---|
| `MINIMAP_W` | 0.18 (was 0.26) |
| `MINIMAP_BASE_ALPHA` | 0.45 |
| `MINIMAP_BG_ALPHA` | 0.12 (was 0.35) |
| `MINIMAP_UNDER_ALPHA` | 0.2 |
| new strings | none |

## Docs to update
`docs/game-design.md` (phone mode: the mini-map is small and see-through — kids' decision), `docs/architecture.md` (mini-map constants, fade rule).
