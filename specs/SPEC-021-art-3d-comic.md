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
(Pre-flight done 2026-11-23: SPEC-016/017/019 landed, SPEC-020 runs right before this one, SPEC-011 has not landed — one `index.html`. See "Pre-flight notes" at the end.)
- 3D: `THEMES[place]` (ground painting `paintGround` + `paintPitch`/`paintStreets`, wall colours per kind, `makeTreeFor`/`makeRockFor`/`makeBushFor`/`makePondFor`, cottages `makeCottage`, water `makeWaterFor`/`riverBanks`, bridges, maze/arena walls + `mazeDeco`, field/city props `makeGoal`/`makeStreetThing`/`adBoards`), toon material with a 3-step gradient (`gradTex`, `toon(color)`, `ownMat`), inverted-hull outlines (`part(geo, color, outline, mat)`, colour `OUT`), shadows (`PCFShadowMap`, camera-following on phone), character data and builders (`makeLook(o)` — outfit indexes → look data; `buildLittleModel(look, isPlayer, pid, glove)`, `addFace`, `addHair` (hats); `buildBigModel(skin)` with `headMat`, `cheeks`; `BIG_SKINS`), houses (no builder of their own: `buildMap3D` makes them from the level's walls `kind: "home"` / `"bighome"` — `bigHomeMats` pulse red — and floor items (beds), plus `safeGlow`), particles (2D, `burst`/`drawFx`), fog (`scene.fog`, colour = `THEMES[place].bg`).
- References: `art/0_main` (overall), `1_papa`, `3_papas`, `6_personas`, `15_houses`, `7_1…7_4`, `16`, `17` (worlds), palette in `claude/art-style-brief.md` §4 (a claude.ai project doc, not in the repo; `0_main` has the six palette swatches).

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
11. Whole suite green (on CI: the sharded tests workflow on the pushed branch, SPEC-023); level fixtures unchanged (looks only: `tests/fixtures/level1.json`, `levels-worlds.json`, `levels-field-city.json`); screenshots (throwaway): one level of each type across the six worlds, the hero close-up on the phone, the dad and kids next to `1_papa` / `6_personas`, both houses next to `15_houses` — looked at side by side and described in the report.

## Implementation steps
1. Pre-flight; capture "before" screenshots and frame times.
2. Outline and material changes (AC 1–2), paper overlay (AC 4).
3. Ground and hatching textures per world (AC 3, 8).
4. Kids, dad look, houses (AC 5–7).
5. Readability and performance checks (AC 9–10), screenshots, whole suite (CI), reviews, docs, merge, push, close — as `RUN_L.md` (as updated by SPEC-023).

## Numbers and texts
| Key | Value |
|---|---|
| outline colour / thickness | `#1b1b1b` / ~2× current |
| outline wobble | small, seeded, `CFG.OUTLINE_WOBBLE` (on) |
| toon tones | 2 |
| paper overlay opacity | ~0.08 (multiply), `CFG.PAPER_GRAIN` |
| dad colours | t-shirt `#eb3e42`, jeans blue, skin as today |
| performance budget | ≤ +10 % frame time |
| new strings | the `dad` entry's name in `BIG_SKINS` (`name: { en, es, ru }`, where the five looks keep their names — there is no `I18N.*.bigSkins`) — Dad / Papá / Папа (costume list name) |

## Docs to update
`docs/game-design.md` (look: comic 3D, the dad, the messy house — Andrei's decisions), `docs/architecture.md` (outline wobble, materials, procedural textures, paper overlay, dad look, houses).

## Pre-flight notes (2026-11-23)
Changes made in this pre-flight:
- Context pre-flight line → SPEC-016/017/019 landed, SPEC-020 runs just before, SPEC-011 not landed.
- Context "character builders (`makeLook`, …)" → `makeLook(o)` only maps outfit indexes to look data; the 3D builders are `buildLittleModel`, `addFace`, `addHair`, `buildBigModel(skin)`.
- Context "house builders (safe house with beds; Big One's house …)" → there are no house builders: `buildMap3D` builds both houses from `home`/`bighome` walls and floor items; named the real helpers (`bigHomeMats`, `safeGlow`).
- Context: + the real names of the ground/prop helpers (`paintPitch`, `paintStreets`, `makeCottage`, `makeWaterFor`, `riverBanks`, `mazeDeco`, `makeGoal`, `makeStreetThing`, `adBoards`), materials (`gradTex`, `toon`, `ownMat`, `OUT`); particles are 2D, fog colour follows `THEMES[place].bg`.
- Context `claude/art-style-brief.md` §4 → marked as a claude.ai project doc (not in the repo).
- Numbers table "new strings `I18N.*.bigSkins.dad`" → no such key: Big One look names live in `BIG_SKINS[i].name { en, es, ru }`; the dad's name goes there (same three texts).
- AC 11 / step 5 "whole suite" → on CI (SPEC-023); fixture file names spelled out.

Facts for the implementer:
- Where (approx. lines, `docs/architecture.md` table): `OUT = "#3d2b1f"` (screen section, ~568) — **also the 2D layer's outline/text-stroke colour** (`fillStroke` default stroke, `label` text stroke, ~3283–3295), so changing it for 3D changes the UI too: give the 3D its own `CFG` colour or coordinate with SPEC-020's look. Materials ~5401–5438: `gradTex` = 3 steps `[105, 180, 255]` (nearest filter), `toon(color)` cached per colour in `matCache`, `ownMat(color, transparent)` (own outline material when transparent), `OUTLINE` (one shared `MeshBasicMaterial`, BackSide), `part(geo, color, outline = 0.03, mat)` scales a hull by `1 + 2·outline/size` per axis (characters use 0.02–0.04). Renderer/scene ~5210–5279 (`PCFShadowMap`, `scene.background`/`scene.fog` set per theme in `buildMap3D`). `THEMES` ~5448 (park, beach, winter, school, field, city), places ~5439–6088, `paintGround(place)` ~5900, `buildMap3D` ~5978; characters ~6111–6348 (`addFace`, `addHair`, `buildLittleModel` incl. `dizzyStars`, `setCloak`, `buildBigModel`); `syncLittle`/`syncBig`/`syncScene` ~6502–6647; wardrobe previews ~6648–6704 (`skinPanels()`).
- **Houses have no roof today** — both are open wall boxes, because the kids walk inside (beds and spawns in the safe house; the danger floor in the dad's house, kids' rule "кто простоит внутри 5 сек…"). The "crooked roof with a patch" (AC 7) and Winter roof snow must not hide anyone inside (e.g. roof edges/eaves only, or a roof that fades like `fadeTrees` when someone is inside); footprints/doors stay (`bigHouse()` 6×6, safe house 7×6, `placeHomes`). The kids' house is already light blue in most worlds (`walls.home` e.g. park `#7cc6fe`), the dad's already red (`walls.bighome` `#e5534b`).
- **Dad look and saves** (AC 6): `bebebe-outfits` stores the Big One's look as an **index** into `BIG_SKINS` (`skinSel.big`, `DEFAULT_SKINS.big = 0` = Classic). Add `dad` **at the end** (index 5, `price: tierPrice(0)`) and set `DEFAULT_SKINS.big` to it, so every stored index keeps its meaning; an old save with `big: 0` (Classic, the old default) keeps Classic. `resetOutfits()`, `fitOutfitsToOwned()` and `resetProgress` fall back to `DEFAULT_SKINS.big`; `cleanOwned` only keeps paid ids, so a free `dad` needs no `owned` entry. `__bb.wardrobe().big` lists ids/prices (tests). `buildBigModel(sk)` styles by `sk.top` (`spiky`, `horns`, `robot`, `pirate`, `bear`) — `dad` needs a new `top` (bald + stubble, eyebrows, nose); blush (`headMat.emissive`, `cheeks`) must keep working. game-design "Большой — 5 образов" becomes 6 (doc-keeper).
- AC 5 "HUD/skins previews": the wardrobe previews are 3D (`skinPanels()` scissor viewports) and update by themselves; the HUD team chips are 2D circles (`teamRect`, chips "Me/1/2/B") — nothing 3D there.
- AC 3 ground: `tests/levels.spec.js` (~929–941) compares `__bb.mapPieces()` colours with `THEMES` and samples `__bb.groundColorAt(x, y)` on a village `square` cell (+1 px) and a `bridge` cell (+6 px) expecting `th.square[0]` / `th.bridge[0]` — marker strokes must keep those samples or the test is changed on purpose.
- AC 4 "the test that measures performance": no such test exists today — it comes with AC 10's measurement. AC 10: phone viewport 844×390 (`?phone=1`), desktop 960×640 (`playwright.config.js`).
- AC 8: Winter maze walls today `THEMES.winter.maze.wall` `#dbe8f6` on ground `g1` `#f6faff` (nearly the same). Palette pictures: `7_1_location_park`, `16_location_field`, `17_location_city`, `7_2_location_school`, `7_3_location_beach`, `7_4_location_winter` (paper, 1024×572: the world from above with the blue house, the messy house bottom-left, the dad in the middle, kids, coins and stars).
- References (all 1024×572): `1_papa` (green bg, 8 poses: angry red face with steam and a scribble cloud · "GRRR!" · "???" · BONK push · hugged "¡OY!" · pushing · hugged, dizzy eyes · pink face with steam and hearts · smiling, waving, hearts — bald, stubble dots, red t-shirt, jeans, brown shoes); `3_papas` (green, 4 other dads angry/kind: green sweater + moustache, beard + cap / striped shirt + glasses, plaid shirt, grey hoodie); `6_personas` (green, kids: helping a friend up, sitting with a band-aid crying, hugging the dad from behind, blowing a kiss in a viking hat, eating a cupcake in a cape, "YAY!" jump — round heads, dot eyes, rosy cheeks); `15_houses` (green: messy red house — patched crooked roof, chimney, sock + t-shirt on a line from the window, overflowing bin, pizza boxes, toy car, bone, mud, stink lines · clean light-blue house, heart on the door, flowers); `0_main` (paper, 1024×765, overall look + six swatches). `bigone.webp` (paper) shows today's five looks + poses; `persons.webp` (paper) kids turnaround + "tip-toe" pose.
- The name default stays `I18N.*.defaultBig` ("Big One" / "Grandote" / "Большой") until SPEC-022.
