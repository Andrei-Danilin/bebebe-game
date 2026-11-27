# SPEC-042 — Every world has its own trick: puddles, sprinklers, the ice-cream truck, the school bell, waves, footprints

Status: ready (art 37, 40, 41 on master, checked by Claude 2026-11-26:
- **sheet 37** has 13 icons, not 10: Gemini repeated the wave, the football and the plane. In reading order: `ui_puddle`, `ui_sprinkler`, `ui_truck`, `ui_bell`, `ui_wave`, `item_football`, `item_paperplane`, (wave again: drop), `ui_snowprints`, (football again: drop), (plane again: drop), `item_watermelon`, `item_snowball`. Motion lines and drops are separate small regions: merge them into their icon.
- **sheet 40** is a clean 2×2 page (Park, Field, City, School) like `8_start`: same panel crops.
- **sheet 41** has its two panels side by side in the **top half** only; the lower half is an empty notebook page. Crop each panel (about x 0.03–0.49 and 0.51–0.97, y 0.08–0.56; measure) and ignore the rest.)
Complexity: L
Branch: SPEC-042-world-tricks
Decided by: Andrei (2026-11-26): each world gets one special mechanic (idea 1 of "how to make the worlds different"). Which trick goes to which world, the numbers and the "new here" card: Claude, check with the kids. Art: sheets 37 (icons) and 40 / 41 (world tip pictures) from Andrei.

## Description
Today the worlds differ mostly in colours and decor. Each world now gets one trick that changes how you play there:

| World | Trick | What it does |
|---|---|---|
| Park | **Puddles** | Running through a puddle makes a loud SPLASH: Dad hears it from twice as far. Tiptoeing through is quiet. |
| Football field | **Sprinklers** | Every 20 s a sprinkler sprays a circle for 5 s. Dad never walks into the spray, and a kid inside it is hidden (like in a bush). |
| City | **Ice-cream truck** | A slow truck drives a loop along the streets. Dad can't see through it, so kids can sneak along behind it. It stops when someone is in front of it. |
| School | **The bell ("Freeze!")** | Every 30 s the bell rings for 3 s, with a 2 s warning. Dad looks all around; any kid who runs while it rings is spotted. Kids who stand still or tiptoe are not. |
| Beach | **Waves** | Every 20 s a wave rolls 2 cells up the beach for 6 s. Kids in the water move at 60%; Dad won't go in. |
| Winter | **Footprints** | Running kids leave footprints in the snow for 8 s, and Dad follows fresh prints. Tiptoeing leaves none. |

The first time a world opens, a **"New here!"** card shows its trick and its item (SPEC-043) with a comic picture. It can be watched again from the level card.

## Goal
Each world plays differently and teaches one idea, from what the game already has (hearing, hiding, sneaking), without breaking the level rules or the balance targets the kids care about (difficulty grows, mazes hardest).

## Context
(Pre-flight against master; match names.)
- **Core:**
  - `src/core/` — `big.js` (vision, search, chase, look), `hearing.js` (`audible`, `HEAR_RADIUS`, noise), `world.js` (`los`, `seeSolidAt`, `inSafe`, bushes hide);
  - `rules.js` (items, slip); `bots.js`, `autopilot.js`;
  - `level/` — `generate.js`, `layouts.js`, `validate.js`: the fairness rules `DOOR_APRON`, `HOUSE_PATH`, `FREE_MIN`;
  - `config.js` (`CFG`), the fixed step (SPEC-034), events (`emit`).
- **Client:** 3D map pieces `src/client/three/map3d.js` / `themes.js`; effects `fx.js`; HUD `ui/hud.js`; scenes and tutorial pages `ui/story.js` / `tutorial.js`; level card `ui/map.js`.
- **Worlds:** `WORLDS`, `MAIN_WORLDS`, `BONUS_WORLDS`, `WORLD_SEED`, `worldOpen` (SPEC-030).
- Practice games and the tutorial are on the Park map with no tricks.
- **Art:**
  - `art/37_world_icons.webp`: icons `ui_puddle`, `ui_sprinkler`, `ui_truck`, `ui_bell`, `ui_wave`, `ui_snowprints` used by this spec; the item icons are for SPEC-043;
  - `art/40_world_tips_main.webp` (2×2: Park, Field, City, School);
  - `art/41_world_tips_bonus.webp` (2 panels: Beach, Winter).
  - All optional: missing art falls back to existing icons and a map-preview panel.

## Out of scope
World items (SPEC-043), world houses (SPEC-044), new level types.

## Acceptance criteria
### General
1. **Core, deterministic, data-driven:**
   - each trick is a core module (`src/core/tricks/<name>.js`) driven by the fixed step and the seeded random, switched on per world by `CFG.WORLD_TRICK` (`park: "puddles"`, `field: "sprinklers"`, `city: "truck"`, `school: "bell"`, `beach: "waves"`, `winter: "footprints"`);
   - numbers live in `CFG.TRICKS`;
   - the same seed gives the same level and the same trick timing;
   - the headless core runs the tricks; the server can later (SPEC-013).
2. **Fair levels:** trick pieces are placed by the level generator and checked by `validate.js`:
   - never in a house, its door apron or the path between the houses' doors where that would block it;
   - the level stays winnable (the existing fairness checks pass for all 120 levels).
3. **Bots and autopilot understand the trick enough not to break it:**
   - they tiptoe around puddles near Dad;
   - they use the spray and the truck to hide when sneaking;
   - they freeze at the bell;
   - they keep out of waves when chased;
   - they stop running near Dad on snow.
   The SPEC-037 stall guard still passes.
4. **Tutorial and practice games have no tricks.**

### The six tricks (numbers: Claude, in `CFG.TRICKS`)
5. **Park — puddles:**
   - 3–5 puddles per level (1-cell circles) on free ground;
   - a running kid crossing one emits a splash (SPLASH pop, water fx, `sfx: "splash"` placeholder) that counts as noise at `2 × HEAR_RADIUS` for 1 s;
   - tiptoeing through is silent;
   - Dad stepping in one only splashes (no effect).
6. **Field — sprinklers:**
   - 2–3 sprinklers per level, each on a 20 s cycle: 1 s drip warning, 5 s spray (radius 2 cells), off;
   - phases offset so they don't all spray at once;
   - Dad never enters an active spray (re-paths; if inside when it starts, he steps out);
   - a kid inside an active spray is hidden from his view, like in a bush.
7. **City — ice-cream truck:**
   - one truck per level drives a closed loop along open lanes (generated with the level), at 0.5 × kid speed;
   - it blocks Dad's line of sight like a wall (2 × 1 cells) and never hurts anyone;
   - it stops while a kid or Dad is in the cell in front of it, then goes on;
   - levels with no loop of at least 16 cells have no truck (logged; the generator should usually make one).
8. **School — the bell:**
   - every 30 s: a 2 s warning (the bell icon shakes in the HUD with "2, 1"), then a 3 s ring;
   - during the ring Dad stops and looks all around (his cone sweeps 360°);
   - any kid moving faster than tiptoe in his line of sight is spotted (Dad chases them after the ring);
   - kids standing still or tiptoeing are not spotted;
   - a short "Freeze!" banner on the first ring of each level (four languages).
9. **Beach — waves:**
   - the water edge of the level rises 2 cells for 6 s every 20 s (wave fx);
   - kids in the wave area move at 60%;
   - Dad doesn't enter it (re-paths; if caught inside he walks out at normal speed);
   - houses and their aprons are never in the wave area.
10. **Winter — footprints:**
    - a running kid leaves a footprint every 0.4 s, fading over 8 s (drawn on the snow);
    - tiptoeing leaves none;
    - Dad in patrol or search who sees a print within his cone goes to the freshest print of that trail;
    - prints in the kids' house are not followed.

### "New here!" card
11. **When:**
    - the first time a world's level 1 card opens (after the world is open), a card shows: the world's tip picture (sheet 40 / 41 panel), a title "New in the {world}!", two lines (the trick and the world item of SPEC-043), and OK;
    - `progress.seen.trick_<world>` is set;
    - the level card gets a small **?** button that shows it again.
12. **Texts** (en / es / pt / ru, Claude). For example the School: "When the bell rings — freeze! Dad looks everywhere and sees anyone running." All six in the spec's string table, written by the implementer in the same voice.
13. **Fallback:** without the tip art, the card shows the world's map preview (SPEC-041) with the trick icon.

### AC 12 string table (as built: `I18N.newIn`, `I18N.tipTrick[world]`, `I18N.tipItem[world]`; the item lines follow SPEC-043's table)
| World | | en | es (voseo) | pt (pt-BR) | ru |
|---|---|---|---|---|---|
| all | title | New in {the world}! | ¡Novedad en {el mundo}! | Novidade {no mundo}! | Новое: {мир}! |
| Park | trick | Run through a puddle and it goes SPLASH — Dad hears it from far away! Tiptoe to stay quiet. | Si corrés por un charco, ¡CHAPA! Papá lo escucha de lejos. ¡Pasá en puntitas! | Se você correr numa poça, vai PLOFT! O Papai ouve de longe. Ande na ponta dos pés! | Побежишь по луже — ПЛЮХ! Папа услышит издалека. Пройди на цыпочках! |
| Park | item | Lead Dad onto a banana peel: he slips and you can hug him from any side! | Hacé que Papá pise una cáscara de banana: se resbala y podés abrazarlo desde cualquier lado. | Faça o Papai pisar numa casca de banana: ele escorrega e você pode abraçá-lo por qualquer lado! | Заведи Папу на банановую кожуру: он поскользнётся, и его можно обнять с любой стороны! |
| Field | trick | A sprinkler sprays now and then. Dad won't walk into the spray — and you can hide in it! | A veces un regador echa agua. Papá no entra en el chorro, ¡y vos podés esconderte adentro! | De vez em quando um irrigador espirra água. O Papai não entra no jato — e você pode se esconder nele! | Время от времени поливалка брызгает водой. Папа в брызги не зайдёт — а ты там можешь спрятаться! |
| Field | item | Run into the football: it rolls away and bonks Dad! | Corré hacia la pelota: sale rodando y le pega a Papá. | Corra na bola de futebol: ela rola e acerta o Papai! | Набеги на мяч: он покатится и стукнет Папу! |
| City | trick | A slow ice-cream truck drives around. Dad can't see through it — sneak along behind it! | Un camión de helados pasa despacito. Papá no ve a través de él: ¡andá escondido detrás! | Um carrinho de sorvete passa devagar. O Papai não enxerga através dele — vá escondido atrás! | По улице медленно едет грузовик с мороженым. Папа не видит сквозь него — пробирайся за ним! |
| City | item | Leave a cupcake out: Dad can't resist and stops to eat it! | Dejá un cupcake: ¡Papá no se resiste y para a comérselo! | Deixe um cupcake: o Papai não resiste e para para comer! | Оставь кексик: Папа не удержится и остановится поесть! |
| School | trick | When the bell rings — freeze! Dad looks everywhere and sees anyone running. | Cuando suena la campana, ¡quietos! Papá mira por todos lados y ve a cualquiera que corra. | Quando o sinal tocar — congele! O Papai olha para todo lado e vê quem estiver correndo. | Когда звенит звонок — замри! Папа смотрит по сторонам и видит всех, кто бежит. |
| School | item | Run into a paper plane: it flies off, and Dad turns to watch it! | Corré hacia el avioncito de papel: sale volando y Papá se da vuelta a mirarlo. | Corra no aviãozinho de papel: ele sai voando e o Papai vira para olhar! | Набеги на бумажный самолётик: он улетит, а Папа обернётся посмотреть! |
| Beach | trick | Waves roll up the beach. They slow you down — and Dad won't go into the water! | Las olas suben por la playa. Te frenan, ¡y Papá no se mete en el agua! | As ondas sobem pela praia. Elas atrasam você — e o Papai não entra na água! | Волны накатывают на пляж. Они замедляют тебя — а Папа в воду не пойдёт! |
| Beach | item | Lead Dad onto the watermelon slice: he slides and falls! | Hacé que Papá pise la sandía: ¡se resbala y se cae! | Faça o Papai pisar na fatia de melancia: ele escorrega e cai! | Заведи Папу на ломтик арбуза: он поскользнётся и упадёт! |
| Winter | trick | Running leaves footprints in the snow, and Dad follows them. Tiptoe leaves none! | Si corrés dejás huellas en la nieve, y Papá las sigue. ¡En puntitas no dejás ninguna! | Correr deixa pegadas na neve, e o Papai segue elas. Na ponta dos pés você não deixa nenhuma! | Бегущий оставляет следы на снегу, и Папа идёт по ним. На цыпочках следов нет! |
| Winter | item | Run into the snowballs: one flies at Dad and he freezes — Brrr! | Corré hacia las bolas de nieve: una le da a Papá y se congela. ¡Brrr! | Corra nas bolas de neve: uma voa no Papai e ele congela — Brrr! | Набеги на снежки: один полетит в Папу, и он замёрзнет — Брр! |

(The titles: en "New in the Park!" … "New in the Winter!"; es "¡Novedad en el Parque!" / "la Cancha" / "la Ciudad" / "la Escuela" / "la Playa" / "el Invierno"; pt "Novidade no Parque!" / "no Campo de futebol" / "na Cidade" / "na Escola" / "na Praia" / "no Inverno"; ru "Новое: Парк!" … "Новое: Зима!".)

### Balance and tests
14. **Tests:**
    - core tests per trick (timing, effect, determinism, no effect in practice);
    - the generator never breaks the fairness checks with tricks on (all 120 levels);
    - the card shows once per world and again from **?**.
15. **Balance:**
    - run the Balance workflow on the branch and commit the reports;
    - "difficulty grows" and "mazes hardest" (the kids' rules) stay as targets: if a trick breaks one, tune the trick's numbers first (`CFG.TRICKS`), not the target;
    - report per world before and after.
16. **Docs:**
    - `docs/game-design.md`: the tricks and their numbers via `docs:numbers`;
    - `docs/architecture.md`: the tricks modules;
    - `specs/BACKLOG.md`: "trick numbers and texts — Claude, check with the kids";
    - sound placeholders for SPEC (audio): splash, sprinkler, truck tune, bell, wave, snow crunch.

## Implementation steps (TDD: failing test first in each)
1. The tricks framework (`CFG.WORLD_TRICK`, `CFG.TRICKS`, core hook per step, generator hook, validator).
2. One trick per step: puddles → sprinklers → truck → bell → waves → footprints; each with core tests, 3D / fx pieces and bot / autopilot handling.
3. "New here!" card, **?** button, texts, art mapping (`37` icons, `40` / `41` panels).
4. Balance workflow and tuning, screenshots (one per world at 667×375, the card), docs.
