# SPEC-037 — Dad never stands stuck; the balance autopilot never hangs

Status: ready
Complexity: M
Branch: SPEC-037-dad-unstuck
Decided by: Andrei (2026-11-26): fix the stalls found in earlier runs. The detection thresholds and the pathing fix: Claude.

## Description
Two stalls are noted in `specs/BACKLOG.md`:
- **Dad stands still** for up to the patrol timeout (10 s) or longer while in "search" when his path is blocked (seen on School 19 and 20, not boss-specific; SPEC-022 run). For a child this looks like the game froze, and it makes those levels easier than intended.
- **The balance autopilot hung** on School 20 (reckless, "stuck 480 s, 0 falls", SPEC-019). This may be the same pathing problem, or the autopilot's own.

Find the causes, fix them, and add a guard test so a stall can't come back unnoticed.

## Context
(Pre-flight against master; match names.)
- Dad: `src/core/big.js` (states patrol / search / chase / look / kind, `big.goal`, `big.path`, `big.timer`); pathfinding in `src/core/path.js`; vision and hearing in `src/core/hearing.js`. The level generator and validator are in `src/core/level/`.
- Autopilot: `src/core/autopilot.js`; the balance runs are in `scripts/balance.js` and `CFG.BALANCE`; a run's time limit gives the "stuck 480 s".
- Headless core (SPEC-012) and the fixed 1/60 step (SPEC-034): a sim can step any level quickly.

## Acceptance criteria
1. **Stall detector (test helper).** Over a run, it flags Dad when all of these hold for more than **3 s** of game time (Claude):
   - he moves less than half a cell in total;
   - he is in `patrol` or `search`;
   - he is not stunned, blushing, slipped, looking (after hearing), in his push cooldown, kind or in a scripted tutorial pause.
2. **Guard test: no stalls.** A headless test runs every level of every world (6 × 20) with the careful and the reckless autopilot for 120 s of game time each, seeded, and fails on any Dad stall. It is slow, so CI runs it as one shard job; locally it runs with a flag.
3. **The fix:**
   - When Dad's path is blocked, or he has made no progress towards his goal for 1 s, he picks a new reachable goal: in `search`, the reachable cell nearest the last place he saw or heard a kid; in `patrol`, a new patrol point.
   - An unreachable goal is never kept.
   - The cause (which states, which map pieces) is written in the report.
4. **Autopilot.** The School 20 reckless hang is reproduced (seed from the balance report) and fixed at its cause (Dad, the autopilot, or the level). A second guard: no balance run exceeds **240 s** of game time without a win or a loss (Claude); `scripts/balance.js` reports such a run as "stuck" with its seed.
5. **No rule changes.** Dad's speeds, vision, hearing, hearts and the kids' rules stay as they are; the fix only removes standing still.
   - Run the Balance workflow on the branch and commit the reports.
   - Report the changed level times (School 19/20 are expected to get a bit harder). Targets move only to measured values with a note "SPEC-037: Dad no longer stalls".
6. **Docs:**
   - `docs/architecture.md`: Dad's re-path rule and the stall guard;
   - `specs/BACKLOG.md`: strike the two stall lines (SPEC-019, SPEC-022) with "done in SPEC-037".

## Implementation steps (TDD: failing test first)
1. The detector and the all-levels guard test: red on the known levels.
2. Find the cause; fix Dad's re-path.
3. Reproduce and fix the autopilot hang; the 240 s guard in `balance.js`.
4. Balance workflow, docs.
