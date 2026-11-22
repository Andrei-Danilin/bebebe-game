# Run sizing and rules for spec runs (bebebe-game)

Adapted from ce-fsa-app's orchestration rules (2026-11-21), with two differences agreed by Andrei:
**Claude Code commits and merges itself**, and **every role runs on Opus**. Every run prompt follows these rules; a prompt may only tighten them.

## 1. Size the spec first (the spec's `Complexity:` line decides; when unsure, the smaller tier)

| Tier | What it is | Roles | Review | Target |
|---|---|---|---|---|
| **S** | one rule or number, one item, one text/visual tweak | **one Opus session** implements | one `code-reviewer` (opus) | 20–40 min |
| **M** | several related items, a new screen, a new item type or place | **Opus** orchestrator + **Opus** implementer (`general-purpose`) | one `code-reviewer` (opus); `architect-reviewer` only if the spec changes a state machine, the save format or a section's responsibility | 45–90 min |
| **L** | new game system (economy, progress format, level generator, AI behaviour), a big refactor (e.g. splitting `index.html`) | **Opus** orchestrator + **Opus** implementer | `code-reviewer` + `architect-reviewer` (opus, parallel); after the last fix round one `code-reviewer` on the fix commits | 2–3 h |

All roles use `model: "opus"`. Start every run with `claude --model opus`; the first step of every run is `npm run claude:sync` (agents and skills from `claude-setup/` into `.claude/`).

## 2. Tests
- TDD: each acceptance criterion gets a Playwright test that fails before the change (the run report names it).
- While working: only the touched test files (`npx playwright test tests/<file>`), or `-g "<name>"`.
- **Before the merge: the whole suite once** (`npx playwright test`, ~15–25 min). Rule (Andrei, 2026-11-22): the whole suite runs **once**, on the branch, before the merge; no local rerun on `master` after the merge — the Pages workflow on the push is the check on `master`. Exception: if `master` got code or test commits since the branch was made (not only docs/specs), run the whole suite once on `master` before the push.
- A rule decided by the kids is pinned by a test in `tests/gameplay.spec.js`; changing such a test needs the spec to say the rule changes.
- Visual work: one screenshot per new screen/place via `page.screenshot` in a throwaway script (not committed), looked at before the review.
- Never paste full test logs into reports: counts, failing test names, the first assertion line.

## 3. Context and output discipline
- Brief agents with **paths**, not pasted documents: the spec path, `CLAUDE.md`, `game-design.md`, `architecture.md`, the diff.
- `index.html` is large (~2,500 lines): read the section you need (see `architecture.md` for line ranges), not the whole file.
- Reports are tables and short lines: AC → test, counts, findings by severity, open points.

## 4. Decisions and scope
- All decisions are taken **before** a run (they are in the spec). Anything that comes up during a run goes to `specs/BACKLOG.md`.
- At most two fix rounds; a CRITICAL/HIGH left after them stops the run before the merge (branch kept, reported).
- Small specs of the same area may share one branch (one review, one test pass) only if the run prompt says so.

## 5. Git (this repo: Claude Code commits and merges)
- Branch `SPEC-NNN-short-description` off `master`; commits `SPEC-NNN: <what>` with explicit paths and the attribution lines from the system reminder; the machine's git identity, never changed.
- Merge `--no-ff` into `master` after green tests and a review without open CRITICAL/HIGH; `git branch -d` the spec branch (no local suite rerun on `master`, see §2).
- Remote `origin` = `github.com/Andrei-Danilin/bebebe-game` (public). After the merge: `git push origin master` — only `master`, never `--force`, never spec branches. Then `gh run watch` until the Pages workflow (tests + deploy) is green; a red deploy is reported, not retried blindly.
- No `reset --hard`, no `branch -D`, no history rewrite on `master`.
- The spec file is updated (`Status: done (<hash>)`) and moved to `specs/_archive/` in a final commit on `master` (`SPEC-NNN: close`), which is pushed too (the deploy runs again and must stay green).

## 6. Documentation
- `doc-keeper` updates `docs/game-design.md` when a rule or number changed, `architecture.md` when a section, state or `__bb` field changed, `README.md` when a player-facing feature or command changed. Commit `SPEC-NNN: docs`.
- `game-design.md` is mirrored in the claude.ai project doc `claude/game-design.md` by the spec author after the run.
