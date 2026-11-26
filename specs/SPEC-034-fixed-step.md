# SPEC-034 — Fixed 1/60 s game step: the same game on every screen

Status: ready
Complexity: M
Branch: SPEC-034-fixed-step
Decided by: Andrei (2026-11-26, D-11 of the release review, as recommended): live play advances in fixed 1/60 s steps. Accumulator details and the catch-up limit: Claude.

## Description
Today live play takes one game step per animation frame with the frame's own `dt` (capped at 0.05 s). The game behaves slightly differently on a 30 Hz phone, a 60 Hz laptop and a 120 Hz iPad, and differently from the balance report and from a future game server (online, SPEC-013).

After this spec, live play always advances in steps of exactly 1/60 s from an accumulator:
- a frame takes as many steps as the elapsed time needs (0 on a fast screen, 2 on a 30 Hz one);
- drawing shows the latest step.
Nothing should look or feel different on a normal 60 Hz device.

## Goal
The same inputs give the same game on any screen and in the headless core (SPEC-012) — the base for the online server.

## Context
(Pre-flight against master; match names.)
- The frame loop in `src/client/main.js` (`frame(now)`, `dt = min(0.05, …)`) calls the core step through the game object of SPEC-012 (`step`, `withGame`, input slots, events).
- The headless runs, `simRun` and the balance autopilot already step the core with a fixed `dt`: check which value, and make it the same 1/60.
- Timers in the client that are not game state (camera shake, UI animations, toasts) may keep the frame `dt`.
- RR-08 / A5 in `docs/reviews/release-readiness.md`.

## Out of scope
- Render interpolation between steps (not needed at 1/60).
- Any change of game numbers; online.

## Acceptance criteria
1. **Fixed step:**
   - `CFG.STEP` = 1/60 s;
   - live play adds the frame time (clamped to `CFG.MAX_FRAME` 0.25 s, so a tab coming back does not fast-forward) to an accumulator and runs `floor(acc / STEP)` core steps of exactly `STEP`, at most `CFG.MAX_STEPS` 8 per frame (the rest is dropped);
   - the remainder stays in the accumulator;
   - pause, menus and the app in the background add nothing;
   - inputs are read once per frame and apply to every step of that frame.
2. **Same step everywhere.** The headless core, `simRun`, the autopilot and the balance runs use the same `STEP`. Grep test: no other game-step `dt` is used for game state.
3. **Client-only animations** (camera, UI, particles) keep the frame time and are listed in `docs/architecture.md`.
4. **Same game on any screen.** A test runs the same level with the same scripted inputs at frame rates 30, 60, 120 and 144 Hz (simulated frame times), and compares the game state after 20 s: positions, hearts and events are equal.
5. **A slow device is not penalised:** at a simulated 20 Hz (frame time 0.05 s) the game time still keeps up with real time (3 steps per frame); at 4 Hz it is capped (8 steps) and nothing breaks.
6. **Balance:**
   - run the Balance workflow on the branch and commit the reports;
   - any moved number must be explained (expected: tiny or none, since the balance runs already use a fixed step);
   - targets move only to measured values, with a note "SPEC-034: fixed step".
7. **Perf:** frame time on the phone stays within the SPEC-021/025 budget (`perf.spec`); the step itself is p95 ~0.2 ms (SPEC-012), so 2 steps per frame is fine.
8. **Docs:**
   - `docs/architecture.md`: the loop, `STEP`, `MAX_STEPS`, what is game time vs frame time;
   - `docs/reviews/release-readiness.md`: RR-08 done.

## Implementation steps (TDD: failing test first in each)
1. The frame-rate equality test (AC 4) red.
2. `CFG.STEP` / `MAX_FRAME` / `MAX_STEPS`; the accumulator loop in `main.js`; inputs per frame.
3. Headless, sim and balance use `STEP` (AC 2 grep test).
4. Slow-device test (AC 5); perf check; balance run; docs.

## Numbers
- `STEP` 1/60 s.
- `MAX_FRAME` 0.25 s.
- `MAX_STEPS` 8.
