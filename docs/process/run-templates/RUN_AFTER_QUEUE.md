# RUN_AFTER_QUEUE — wait until the running queue is finished, then run one more spec

Start: a **second** `claude --model opus` window at the root of bebebe-game, while the queue session is still working (on Windows at low priority: `start /belownormal claude --model opus`). Paste below the line; set the spec and the times. While waiting it only reads; it never touches the checkout the queue is using.

---

You wait for the spec queue that another Claude Code session is running in this same checkout, and when it has finished you run **SPEC-005** (`specs/SPEC-005-phone-mode.md`). Nobody is watching: do not ask questions.

**Waiting (read-only, change nothing):**
- First check **3 hours** after you start, then every **30 minutes**. Wait with `sleep 540` Bash calls (each under the 10-minute tool limit; 20 calls ≈ 3 h, 3–4 calls ≈ 30 min) — no other commands in between, no file changes, no git commands that write (no checkout, fetch, gc, stash).
- A check is: `cat .claude/RUN_QUEUE_STATE.md`, `git branch --show-current`, `git status --short`, `ls specs`, `git log --oneline -1 master`, `git rev-parse master origin/master`, `gh run list --limit 1`. Log each check in one line in the chat (time, queue rows, verdict).
- **Ready** when all of these hold: every row in the queue state is `done`; no `specs/*_RUN_STATE.md` file; current branch `master`; `git status --short` shows nothing except the untracked `Claude outputs/` folder (that one is fine, leave it); `master` equals `origin/master`; the latest Pages run is `completed success`; the same is true at two checks in a row 30 minutes apart (so the queue's final report and push are really done).
- **Give up** (report and stop, start nothing) if: a queue row is `stopped`; a `*_RUN_STATE.md` or a spec branch hasn't changed for 3 checks in a row while the queue isn't done (the queue session probably died); or 12 hours have passed since you started.

**When ready:**
1. `npm run claude:sync`, then check `specs/SPEC-005-phone-mode.md` exists with `Status: ready`.
2. Run it exactly as `docs/process/run-templates/RUN_L.md` says below its line (`<SPEC>` = SPEC-005, branch from the spec), unattended, with the speed rules of `CLAUDE.md` (no local whole suite: push the branch, the Tests workflow gates the merge; close on the branch before the merge; delete the remote branch after it): when the spec leaves something open, take the reading closest to its text and `docs/game-design.md`, note it in the final report and in `specs/BACKLOG.md` as "decided during the run, check with the kids"; never change a rule marked as the kids' decision.
3. This spec re-lays-out every screen, so check what SPEC-002/003/004 added on `master` (level banner and menu label, names, danger countdown, stars, the 💋 button, half hearts) and make each of them work in phone mode; list them in the report.
4. Stop rules as in `RUN_QUEUE.md`: a CRITICAL/HIGH left after the fix rounds, the branch's Tests workflow red after the fix rounds, red tests on `master`, red deploy (a red deploy with green tests: first once `gh run rerun <id> --failed` (reruns only the failed `deploy` job; since SPEC-011 the site is uploaded once, by the `build` job) or a fresh `gh workflow run pages.yml --ref master`), or anything in `CLAUDE.md` "Never" → stop, leave the branch, report.
5. Final report in the chat: the waiting log in short, then the RUN_L report (with the CI run ids, and the red balance targets if the spec changed gameplay numbers or rules and ran the Balance workflow), and the list of things Andrei should check on the iPhone (installed PWA and Safari).
