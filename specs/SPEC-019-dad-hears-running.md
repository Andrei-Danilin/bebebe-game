# SPEC-019 — Dad hears running kids: tiptoe or he turns around

Status: ready
Complexity: M
Branch: SPEC-019-dad-hears
Decided by: Andrei and the kids (2026-11-23): the dad (the Big One) sometimes turns around when he hears kids running near him — so sneaking pays. Everything else (how to tiptoe on each device, radius, timings, bots, hints, numbers): Claude (spec author).

## Description
The SPEC-008 balance report shows that running straight at the Big One's back beats sneaking (median 38 s vs 61 s, fewer falls). After this spec a Little One can move two ways: **run** (full speed) or **tiptoe** (slower, silent). When someone runs close to the Big One outside his view cone, he "hears" it: an ear/❓ pops above his head and, if the running goes on for a moment, he turns towards the noise — and if he now sees the runner, the usual chase and push follow. Tiptoeing never makes noise. So the last few steps to a hug should be on tiptoe.

## Goal
- `careful` play (tiptoe near him) clearly beats `reckless` play (running at his back) — the SPEC-008 red row "sneaking must pay" turns green.
- The rule is easy for a 6-year-old: "near Dad — tiptoe!", shown in the menu rules and in a first-time hint.

## Context
(Pre-flight: names below are from before SPEC-011…017; match them to the code that is there.)
- Movement: `PLAYER_SPEED` 150, `BOT_SPEED` 135; keyboard moves at full speed; touch stick (`sticks`, `stickR()`, `PHONE_STICK_R`) and gamepad sticks give a direction (check whether their magnitude is used today); boots ×1.55.
- The Big One: states look/patrol/chase/search, vision cone (`VISION_RANGE`, `VISION_HALF`), turning while looking, stun/blush/slip/push stand (`PUSH_STAND`), `noPush`, `bigCalm()`.
- Keys in use: P1 WASD (+ arrows in 1P), E/Space kiss, Q kit; P2 arrows, Enter kiss, ShiftRight kit; gamepad X kiss, Y kit.
- Bots: rescue/flee/attack/lurk, attack token; autopilot `careful`/`reckless` and the balance report (SPEC-008), `CFG.BALANCE`.

## Out of scope
- Noise from other things (items, bushes), the Big One hearing through the whole map, a stealth meter UI.
- Changing vision, push or hug rules.

## Rules
- **Tiptoe vs run:** a Little One moving at ≤ `CFG.TIPTOE_MAX` (60 %) of his current top speed is tiptoeing; faster is running. Tiptoe speed = `CFG.TIPTOE_MULT` (0.55) × top speed.
  - Touch stick and gamepad stick: tilt < 60 % of the stick radius → tiptoe (speed scales with tilt up to the tiptoe speed); more → run. The touch stick shows a small inner ring at 60 % so kids can feel the line.
  - Keyboard: hold **Shift** to tiptoe (one player: either Shift; two players: P1 left Shift, P2 right Ctrl — right Shift stays the kit key).
  - Boots: running in boots is loud; tiptoeing in boots is still silent (tiptoe = 0.55 × boots speed).
- **Hearing:** each frame, every *running* Little One (state `ok`, not invisible by cloak, not in the safe house) within `CFG.HEAR_RADIUS` (5 cells) of the Big One and **outside his view cone** adds noise `CFG.NOISE_RATE` (1 per second); noise decays by `CFG.NOISE_DECAY` (0.8 per second). Through a wall the noise counts half.
- **Turning:** when noise ≥ `CFG.NOISE_TURN` (0.6 — about 0.6 s of running), the Big One turns towards the loudest runner within `CFG.HEAR_TURN_TIME` (0.3 s), shows ❓ (and a small ear doodle), switches to `look` facing that way for 1–1.5 s; noise resets; then `CFG.HEAR_COOLDOWN` (3 s) before he can turn on noise again. If he sees someone after turning, the normal chase starts.
- He does not hear while stunned after a hug, blushing, lying after a banana, standing after a push, or during the final hug. A hug from behind still works exactly as now.
- At the first noise ≥ 0.3 (before he turns) a small "👂" appears above him — a fair warning to slow down.
- **Bots:** in `attack`, within `HEAR_RADIUS + 1` cell of the Big One they tiptoe; when fleeing they run (he sees them anyway). Rescue walks are runs (noise is a real risk near him).
- **Autopilot:** `careful` tiptoes within `HEAR_RADIUS + 1` cell when behind or beside him; `reckless` always runs.

## Acceptance criteria
1. Tiptoe speed and threshold on all inputs (keyboard Shift rules for 1 and 2 players, touch stick tilt with the inner ring, gamepad stick tilt); `__bb.isRunning(l)`. → `tests/gameplay.spec.js` "tiptoe with Shift, stick tilt and gamepad"
2. Hearing and turning exactly as in "Rules" (radius, outside the cone only, wall halves, decay, threshold, turn time, cooldown, no hearing in the listed states, cloak and safe house silent); 👂 at 0.3, ❓ on turn. → "the Big One turns when a kid runs behind him", "tiptoeing behind him is silent", "no hearing while stunned or blushing", "cooldown after a turn"
3. A hug from behind after tiptoeing works as before; after a turn caused by noise, a runner in view is chased and pushed as usual. → existing hug/push tests stay green + "noise turn leads to a chase"
4. Bots tiptoe when attacking near him and run otherwise; no bot gets stuck (60 s simulation per level type, as SPEC-002 AC 10). → "bots tiptoe near the Big One"
5. **Balance:** `npm run balance` — the red target "sneaking must pay" (SPEC-008 AC 13: reckless wins less often or slower than careful) turns green; all other targets keep their colour or get better (report before/after in the final report). Park 1–5: 3 stars still reachable by `careful`. If a number needs tuning, only `TIPTOE_*`, `HEAR_*`, `NOISE_*` may change, within ±50 %.
6. Kid-facing texts: one new line in the menu rules and a first-time hint when the Big One first turns on noise in a level ("Dad heard you running! Tiptoe near him: Shift / small push on the stick"), en/es/ru; phone hint without the keyboard part. → `tests/i18n.spec.js`, screenshot check
7. Visuals: tiptoe has shorter, slower steps (body slightly lower); running near him shows small "tap-tap" lines at the feet; 👂 and ❓ above him readable on desktop and phone. Screenshots (throwaway) looked at.
8. All numbers in `CFG`; SPEC-008 invariants still hold, plus a new one: tiptoe speed ≥ 0.5 × `PLAYER_SPEED` (tiptoeing is never painfully slow); whole suite green; `reports/balance.*` committed.

## Implementation steps
1. Pre-flight; failing tests for AC 1–2.
2. Input → speed with the tiptoe threshold (keys, stick ring, gamepad), `isRunning`.
3. Noise and turning in the Big One's update; 👂/❓; states that block hearing.
4. Bots and autopilot; AC 3–4.
5. Texts, hint, visuals; balance run and tuning within the allowed ranges (AC 5); screenshots; whole suite, reviews, docs, merge, push, close — as `RUN_M.md`.

## Numbers and texts
| Key | Value | en | es | ru |
|---|---|---|---|---|
| `TIPTOE_MAX` | 0.6 of top speed / stick radius | | | |
| `TIPTOE_MULT` | 0.55 | | | |
| `HEAR_RADIUS` | 5 cells | | | |
| `NOISE_RATE` / `NOISE_DECAY` / `NOISE_TURN` | 1 /s / 0.8 /s / 0.6 | | | |
| wall factor | 0.5 | | | |
| `HEAR_TURN_TIME` / `HEAR_COOLDOWN` | 0.3 s / 3 s | | | |
| 👂 warning at | noise 0.3 | | | |
| `I18N.*.ruleTiptoe` | menu rule | Run near Dad and he hears you — tiptoe! | Si corrés cerca de papá, te escucha: ¡andá en puntitas de pie! | Бежишь рядом с папой — он слышит. Иди на цыпочках! |
| `I18N.*.heardHint` | first-time hint | Dad heard you running! Tiptoe near him: hold Shift | ¡Papá te escuchó correr! Cerca de él andá en puntitas: mantené Shift | Папа услышал топот! Рядом с ним иди на цыпочках: держи Shift |
| `I18N.*.heardHintTouch` | phone/touch | Dad heard you running! Push the stick just a little to tiptoe | ¡Papá te escuchó correr! Mové el joystick apenas para ir en puntitas | Папа услышал топот! Чуть-чуть наклони джойстик — пойдёшь на цыпочках |

## Docs to update
`docs/game-design.md` (tiptoe and hearing — the kids' decision vs Claude's numbers; generated numbers section), `docs/architecture.md` (speed tiers, noise, bots/autopilot), `README.md` (controls: Shift / stick tilt), `reports/balance.*`.
