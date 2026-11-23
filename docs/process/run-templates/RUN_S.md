# RUN_S — small spec, one Opus session + one Opus review

Start: `claude --model opus` at the root of bebebe-game, on `master`. Paste below the line, with `<SPEC>` filled in.

---

Implement `<SPEC>` (`specs/<SPEC file>`) yourself, following `docs/process/orchestration-rules.md` tier **S** and `CLAUDE.md`.
1. `npm run claude:sync` (agents/skills into `.claude/`). Checks: `git status --short` clean; on `master`; the spec file exists and its `Status:` is `ready`. Stop if one fails.
2. `git checkout -b <branch from the spec>`.
3. Read `CLAUDE.md`, the spec, `docs/game-design.md`, and only the `index.html` sections that `architecture.md` points to.
4. TDD per AC: failing Playwright test first, then code. Tests while working: `npm run test:fast` + the touched test files (not the whole suite).
5. Commits `<SPEC>: <what>`, explicit paths, attribution lines from your system reminder. New strings in `en`, `es` (voseo), `ru`.
6. Whole suite once (`npx playwright test`, ~10 min); the Pages workflow checks `master` after the push. Then ONE read-only `code-reviewer` (model opus) with only the spec path and `git diff master...<branch>`. Fix CRITICAL/HIGH and cheap MEDIUM in one round; a second review only if a HIGH was fixed.
7. `doc-keeper` (model opus): update `game-design.md` / `architecture.md` / `README.md` if needed; commit `<SPEC>: docs`.
8. `git checkout master && git merge --no-ff <branch> -m "Merge <SPEC>: <title>"`; `git branch -d <branch>` (no local suite rerun on `master` unless it got code commits since the branch; the Pages workflow checks it). Then `git push origin master` (only `master`, never `--force`, never spec branches) and `gh run watch` until the Pages deploy is green; a red deploy is reported, not retried blindly.
9. Spec `Status: done (<merge hash>)`, move it to `specs/_archive/`, commit `<SPEC>: close` on `master`, `git push origin master`, `gh run watch` (must stay green).
10. Report (short): merge hash, AC → test table, test counts, review findings (fixed/left), new strings, open points for BACKLOG.
