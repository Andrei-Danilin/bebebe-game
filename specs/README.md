# Specs — format and lifecycle

One feature = one file `SPEC-NNN-short-name.md` (NNN = next free number, 3 digits). Written by Claude in the claude.ai project "BeBeBe Atrapar" with Andrei and the kids, committed to `master` before the run; implemented by Claude Code with the run template of the spec's tier.

## Lifecycle
`Status: draft` (being discussed) → `ready` (all decisions taken; a run may start) → `done (<merge hash>)` (the run moves it to `_archive/`). A spec that cannot be done stays `ready` with a `Blocked:` line.

## Template
```markdown
# SPEC-NNN — <title>

Status: ready
Complexity: S | M | L   (orchestration-rules.md §1)
Branch: SPEC-NNN-short-description
Decided by: <the kids / Andrei / Claude — for each rule below>

## Description
What the player will see and do, in plain words (2–5 sentences).

## Goal
What is true when the spec is done.

## Context
Current behaviour, the relevant rules in game-design.md, the index.html sections (architecture.md), CFG names.

## Out of scope
What this spec does not do (so the run does not drift).

## Acceptance criteria
1. Testable statement. → test: `tests/<file>` "<test name>"
2. ...
(Every new player-visible text: in en, es, ru.)

## Implementation steps
1. Failing test(s) for AC 1, then the change. ...
(Ordered; each step ends green.)

## Numbers and texts
| CFG / I18N key | value | en | es | ru |

## Docs to update
game-design.md (rules), architecture.md (states / __bb), README.md (players).
```
