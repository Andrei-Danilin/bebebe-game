# RUN_M — medium spec, Opus orchestrator + Opus implementer + Opus review

Start: `claude --model opus` at the root of bebebe-game, on `master`. Paste below the line, filled in.

---

You orchestrate `<SPEC>` (`specs/<SPEC file>`) under `docs/process/orchestration-rules.md` tier **M** and `CLAUDE.md`. You write no production code yourself.
- Roles (all model **opus**): implementer `general-purpose` (kept for fixes via SendMessage); `tester`; `code-reviewer` (+ `architect-reviewer` only if the spec changes a state machine, the save format or a section's responsibility — say which); `doc-keeper`.
- `npm run claude:sync` first (agents/skills into `.claude/`). Checks: `git status --short` clean, on `master`, spec `Status: ready`. Then `git checkout -b <branch from the spec>`.
- Implementer brief: the spec path, `CLAUDE.md`, `game-design.md`, `architecture.md` (read only the needed `index.html` sections); TDD per AC (failing Playwright test first); `npm run test:fast` + the touched test files while working (never the whole suite); strings in en/es/ru; commits `<SPEC>: …` with explicit paths and the attribution lines; report as a table (AC → file:line + test, counts, new strings, changed files, open points), no pasted logs.
- `tester`: whole suite once (~10 min), on the branch before the merge; failures go back to the implementer. The Pages workflow checks `master`.
- Balance (if the spec changes gameplay numbers or rules): the implementer runs `npm run docs:numbers` and `npm run balance` (~30 s) before the merge and commits `reports/balance.*` (`<SPEC>: balance report`); red targets go into the final report (red is not a stop unless the spec's ACs say so).
- Visual check: for each new screen/place/model one screenshot (throwaway script), looked at before the review.
- Review: reviewer(s) get the spec path and `git diff master...<branch>` only. Fix loop at most two rounds; a CRITICAL/HIGH left stops the run before the merge.
- `doc-keeper`: docs as in `orchestration-rules.md` §6; commit `<SPEC>: docs`.
- Merge: `git checkout master && git merge --no-ff <branch> -m "Merge <SPEC>: <title>"`; `git branch -d <branch>` (no local suite rerun on `master` unless it got code commits since the branch; the Pages workflow checks it); then `git push origin master` (only `master`, never `--force`, never spec branches) and `gh run watch` until the Pages deploy is green (a red deploy is reported, not retried blindly).
- Close: spec `Status: done (<merge hash>)`, move to `specs/_archive/`, commit `<SPEC>: close`, `git push origin master`, `gh run watch` (must stay green).
- Final report short: merge hash, AC → test table, counts, review findings by severity (fixed/left), screenshots looked at, red balance targets, BACKLOG additions.
