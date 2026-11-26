# SPEC-036 — While a friend helps you up, your "go home" timer stops

Status: ready
Complexity: S
Branch: SPEC-036-rescue-pauses-timer
Decided by: the kids (2026-11-26, via Andrei). While someone is helping a fallen kid up, that kid's "go home" timer stops. If the helper runs away, the timer goes on from where it stopped. The kids' rule; how the pause looks: Claude.

## Description
Today a fallen kid's timer (`DOWN_TIME` 18 s) keeps running while a friend is helping them up (`RESCUE_TIME` 3 s). A rescue started late can fail even though the friend is right there.

New rule:
- the timer **pauses while a helper is next to the fallen kid**;
- when the helper leaves, it **continues from the paused value**;
- the rescue progress itself behaves as today (it melts at `RESCUE_DRAIN` when the helper leaves).

## Context
(Pre-flight against master; match names.)
- `src/core/rules.js` `updateDowned(dt)`:
  - `l.downTimer -= dt` every step (not in the practice games);
  - `helper` = a player, else any kid, next to the fallen one (`helps(o, l)`);
  - `l.rescue` grows with a helper and melts without one;
  - `downTimer <= 0` → goes home to rest.
- The fallen kid's timer is drawn over them (ring or number) and on the phone HUD (`src/client/ui/draw.js` / `hud.js`).
- Bots sort the fallen by `downTimer` (`src/core/bots.js`).
- The autopilot's kit rule reads `downTimer` (`src/core/autopilot.js`).
- Kids' rules are pinned by `tests/gameplay.spec.js` (and core tests in `tests/core/`).

## Acceptance criteria
1. **The rule in `updateDowned`:** while `helper` exists, `downTimer` does not decrease; without a helper it decreases as today. Practice games keep no timer at all (unchanged).
2. **Pinned in tests** (the kids' rule):
   - a kid falls, waits 5 s, a friend helps for 2 s then leaves: the timer shows 13 s at the moment of leaving and keeps counting down from 13;
   - with a helper present the whole time, the timer never reaches 0;
   - the rescue progress melts as today after the helper leaves.
3. **The pause is visible (Claude).** While paused, the fallen kid's timer drawing (ring or number) stops and shows the "being helped" look: the existing rescue glow, and the ring drawn in the rescue green instead of the warning colour. Phone HUD the same. Screenshot at 667×375 in the report.
4. **Balance.** Run the Balance workflow on the branch and commit `reports/balance.*`; report the rests per level before and after (the red "median rests ≤ 2" target is expected to improve). Targets move only to measured values, with a note "SPEC-036: kids' rescue rule".
5. **Docs:**
   - `docs/game-design.md`: the rescue rule;
   - How to play: the rule line "If nobody helps you up within {n} s…" stays true; no text change needed unless the tutorial A3 caption contradicts it;
   - `specs/BACKLOG.md`: "paused timer look — Claude, check with the kids".

## Implementation steps (TDD: failing test first)
1. Core test (AC 2) red → change `updateDowned`.
2. Drawing of the paused timer (AC 3).
3. Balance workflow, docs.
