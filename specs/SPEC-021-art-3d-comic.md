# SPEC-021 — Art pass 2: the 3D world in the comic style

Status: ready
Complexity: L
Branch: SPEC-021-art-3d
Decided by: Andrei (2026-11-23): keep the game in 3D but restyle it like the pictures in `art/` — thick black outlines, flat felt-tip colours, paper feel; the Big One looks like the dad from the story (bald, stubble, red t-shirt, jeans); the dad's house is the messy, dirty little house (Andrei, 2026-11-22). Everything else (techniques, numbers, per-world palettes): Claude (spec author).

## Description
The 3D today is toon-shaded with thin brown outlines and the colours of the first prototype. After this spec it looks like a felt-tip drawing that moves: thick slightly uneven black outlines, two flat tones per colour, marker-stroke ground textures and a soft paper grain over the whole picture. The Little Ones get rounder heads with rosy cheeks and dot eyes (like `art/6_personas.webp`); the Big One by default is **the dad**: bald with stubble, small grumpy eyes and eyebrows, red t-shirt, jeans (like `art/1_papa.webp`), his old looks stay as costumes. The dad's house becomes the messy little house (faded red walls with mud stains, crooked patched roof, a sock in the window, an overflowing trash bin, pizza boxes, stink lines — `art/15_houses.webp`); the kids' house is the clean light-blue one with a heart on the door. Each world's ground, walls and props take the palette of its map picture.

## Goal
- A screenshot of a level reads as "the same game as the pictures in `art/`" (side-by-side check), on desktop and phone.
- Frame time on the phone viewport not worse than today.

## Context
(Pre-flight: SPEC-016/017/019/020 and maybe SPEC-011 landed; match names.)
- 3D: `THEMES[place]` (ground painting `paintGround`, wall colours per kind, `makeTreeFor`/`makeRockFor`/`makeBushFor`/`makePondFor`, cottages, water, bridges, maze/arena walls, field/city props), toon material with a 3-step gradient, inverted-hull outlines (`part(geo, color, outline, mat)`), shadows (`PCFShadowMap`, camera-following on phone), character builders (`makeLook`, hair/hat/jacket/pants, `BIG_SKINS`), house builders (safe house with beds; Big One's house with walls `kind: "bighome"`), particles, fog.
- References: `art/0_main` (overall), `1_papa`, `3_papas`, `6_personas`, `15_houses`, `7_1…7_4`, `16`, `17` (worlds), palette in `claude/art-style-brief.md` §4.

## Out of scope
- Emotional states and boss looks (SPEC-022), 2D screens (SPEC-020), new level types.
- Changing sizes or collision shapes of anything (only looks).

## Acceptance criteria
1. **Outlines:** black (`#1b1b1b`), about 2× thicker than now, constant-looking thickness at the phone camera distance; a slight per-object wobble (vary hull scale per object/vertex by a seeded small amount) so lines don't look machine-perfect; outlines on characters, houses, walls, trees, rocks, items. Option in `CFG` to switch the wobble off.
2. **Flat colours:** toon gradient with 2 tones (light/shade) for all world materials; no specular; shadows softer and lighter (felt-tip shading, not dark CG shadows).
3. **Marker strokes:** ground textures painted with visible diagonal marker strokes and small doodles per world (grass strokes, sand dots, snow light-blue shadows, asphalt specks, pitch stripes and chalk lines), generated in code (canvas textures, seeded, no new image files needed); walls/roofs get a light hatching on the shade side.
4. **Paper grain:** a subtle full-screen paper texture overlay (multiply, low opacity, generated once) over the 3D, toggleable in `CFG`, off in the test that measures performance.
5. **Kids:** bigger rounder heads, rosy cheeks, dot eyes, simple smile (like `6_personas`); outfits keep their pieces and colours; the HUD/skins previews update automatically.
6. **The dad:** a new default Big One look `dad` — bald head with stubble shading, small grumpy eyes, heavy eyebrows, big nose, red t-shirt (`#eb3e42`), jeans, sneakers; the old five looks remain selectable costumes; old saves that chose a costume keep it; the default for new saves is `dad`. The name default text stays as it is (SPEC-022 renames to "Dad").
7. **Houses:** the dad's house is the messy little house (faded red walls with mud-stain decals, crooked roof with a patch, a sock and a t-shirt hanging from a window, an overflowing trash bin with a few flies-free stink lines, pizza boxes and toys by the door) — same footprint and doors as today's Big One's house; the kids' house is light blue with a heart on the door, beds inside as now. Both in every world (roof snow in Winter).
8. **World palettes:** Park, Field, City, School, Beach, Winter ground/walls/props colours adjusted to their map pictures (`7_1`, `16`, `17`, `7_2`, `7_3`, `7_4`); Winter maze walls clearly darker than the snow; all colours in `THEMES`.
9. **Readability:** characters still clearly visible against every ground (contrast check of the hero's outline colour vs ground in each world); the Big One's view cone and the safe-zone glow still readable.
10. **Performance:** frame time on the 844×390 phone viewport and 960×640 desktop within +10 % of before (report numbers); no new per-frame allocations.
11. Whole suite green; level fixtures unchanged (looks only); screenshots (throwaway): one level of each type across the six worlds, the hero close-up on the phone, the dad and kids next to `1_papa` / `6_personas`, both houses next to `15_houses` — looked at side by side and described in the report.

## Implementation steps
1. Pre-flight; capture "before" screenshots and frame times.
2. Outline and material changes (AC 1–2), paper overlay (AC 4).
3. Ground and hatching textures per world (AC 3, 8).
4. Kids, dad look, houses (AC 5–7).
5. Readability and performance checks (AC 9–10), screenshots, whole suite, reviews, docs, merge, push, close — as `RUN_L.md`.

## Numbers and texts
| Key | Value |
|---|---|
| outline colour / thickness | `#1b1b1b` / ~2× current |
| outline wobble | small, seeded, `CFG.OUTLINE_WOBBLE` (on) |
| toon tones | 2 |
| paper overlay opacity | ~0.08 (multiply), `CFG.PAPER_GRAIN` |
| dad colours | t-shirt `#eb3e42`, jeans blue, skin as today |
| performance budget | ≤ +10 % frame time |
| new strings | `I18N.*.bigSkins.dad` — Dad / Papá / Папа (costume list name) |

## Docs to update
`docs/game-design.md` (look: comic 3D, the dad, the messy house — Andrei's decisions), `docs/architecture.md` (outline wobble, materials, procedural textures, paper overlay, dad look, houses).
