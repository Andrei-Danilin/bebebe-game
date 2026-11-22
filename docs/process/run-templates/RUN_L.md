# RUN_L — large spec, Opus orchestrator + Opus implementer + two Opus reviews

Start: `claude --model opus` at the root of bebebe-game, on `master`. Paste below the line, filled in.

---

You orchestrate `<SPEC>` (`specs/<SPEC file>`) under `docs/process/orchestration-rules.md` tier **L** and `CLAUDE.md`. You write no production code yourself.
- Run state: `specs/<SPEC>_RUN_STATE.md`, updated after every step (what is done, branch, last commit, next step), so a broken session can resume from it; deleted at the end.
- Roles (all model **opus**): implementer `general-purpose` (kept via SendMessage); `tester`; `code-reviewer` and `architect-reviewer` in parallel; `doc-keeper`.
- `npm run claude:sync` first (agents/skills into `.claude/`). Checks: `git status --short` clean, on `master`, spec `Status: ready`. Then `git checkout -b <branch from the spec>`.
- Plan first: split the ACs into steps of the spec's "Implementation steps"; the implementer does one step per brief, each step ends green on its touched tests and is committed (`<SPEC>: step N — …`).
- Implementer brief per step: spec path + step number, `CLAUDE.md`, `game-design.md`, `architecture.md`; TDD (failing Playwright test first); strings en/es/ru; save-format changes keep old saves loading (test with an old save object); report as a table.
- After the last step: `tester` whole suite; one screenshot per new or changed screen/place, looked at.
- Reviews: `code-reviewer` + `architect-reviewer` in parallel, each with the spec path and `git diff master...<branch>`. Fix loop at most two rounds; after the last fix round one `code-reviewer` on the fix commits only. A CRITICAL/HIGH left stops the run before the merge.
- `doc-keeper`: `game-design.md`, `architecture.md`, `README.md`; commit `<SPEC>: docs`.
- Merge: `git checkout master && git merge --no-ff <branch> -m "Merge <SPEC>: <title>"`; whole suite on `master`; `git branch -d <branch>`; never push.
- Close: spec `Status: done (<merge hash>)`, move to `specs/_archive/`, delete the run-state file, commit `<SPEC>: close`.
- Final report short: merge hash, step list with commits, AC → test table, counts, findings by severity (fixed/left), BACKLOG additions.
