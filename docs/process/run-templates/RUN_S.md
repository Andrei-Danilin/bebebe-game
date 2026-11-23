# RUN_S — small spec, one Opus session + one Opus review

Start: `claude --model opus` at the root of bebebe-game, on `master` (on Windows at low priority: `start /belownormal claude --model opus`). Paste below the line, with `<SPEC>` filled in.

---

Implement `<SPEC>` (`specs/<SPEC file>`) yourself, following `docs/process/orchestration-rules.md` tier **S** and `CLAUDE.md` (speed rules: no local whole suite — CI on the pushed branch gates the merge).
1. `npm run claude:sync` (agents/skills into `.claude/`). Checks: `git status --short` clean; on `master`; the spec file exists and its `Status:` is `ready`. Stop if one fails.
2. `git checkout -b <branch from the spec>`.
3. Read `CLAUDE.md`, the spec, `docs/game-design.md`, and only the `index.html` sections that `architecture.md` points to.
4. TDD per AC: failing Playwright test first, then code. Tests while working: `npm run test:fast` + the test files of what changed (never the whole suite locally); phone layouts locally at 667×375 only (`-g "667"`).
5. Commits `<SPEC>: <what>`, explicit paths, attribution lines from your system reminder. New strings in `en`, `es` (voseo), `ru`.
6. If the spec changes gameplay numbers or rules: `npm run docs:numbers`; balance on GitHub after the first push (`gh workflow run balance.yml -f ref=<branch>`, `gh run watch <id> --exit-status`, `gh run download <id> -n balance -D reports`), commit `reports/balance.*` (`<SPEC>: balance report`), note the red targets for the report.
7. CI: `git push -u origin <branch>` (never `--force`), `gh run list --branch <branch> --workflow tests.yml --limit 1`, `gh run watch <id> --exit-status`. Red → investigate from the artifacts (`gh run download <id>`: `html-report`, `test-results-<n>`), fix, push again.
8. ONE read-only `code-reviewer` (model opus) with only the spec path and `git diff master...<branch>`. Fix CRITICAL/HIGH and cheap MEDIUM in one round, then one check of the fix commits only if a HIGH was fixed. After a fix that changes gameplay numbers or rules: `npm run docs:numbers` and the balance workflow again, commit the updated `reports/balance.*`.
9. Close on the branch: `doc-keeper` (model opus) updates `game-design.md` / `architecture.md` / `README.md` if needed (commit `<SPEC>: docs`); spec `Status: done (merged by "Merge <SPEC>", see git log)`, move it to `specs/_archive/`, commit `<SPEC>: close`; push the branch and `gh run watch` its Tests run — merge only when it is green.
10. `git checkout master && git merge --no-ff <branch> -m "Merge <SPEC>: <title>"`; `git branch -d <branch>` (no local suite on `master`). `git push origin master` (never `--force`), `git push origin --delete <branch>`, `gh run watch` until the Pages workflow (tests + deploy) is green; a red deploy is reported, not retried blindly (red deploy with green tests → a fresh `gh workflow run pages.yml --ref master`, never `gh run rerun --failed`).
11. Report (short): merge hash, AC → test table, local test counts, CI run ids and results, review findings (fixed/left), new strings, red balance targets (if the report ran), open points for BACKLOG.
