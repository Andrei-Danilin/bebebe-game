# RUN_QUEUE — run several ready specs one after another, unattended

Start: `claude --model opus` at the root of bebebe-game, on `master`, clean tree. Paste below the line; edit the queue if needed. If the session breaks or runs out of context, start a new session with the same text: it resumes from the queue state file.

---

You run a queue of specs one after another, unattended, under `CLAUDE.md` and `docs/process/orchestration-rules.md`. Nobody is watching: do not ask questions, do not wait for confirmation.

**Queue, in this order:** SPEC-001, SPEC-003, SPEC-004, SPEC-002.

**Queue state:** `.claude/RUN_QUEUE_STATE.md` (gitignored, never committed). Create it if missing: one row per spec (spec, status `pending | running | done | stopped`, merge hash, deploy, one-line result). Read it first; update it after every spec and whenever a spec stops. Resume rule: a spec marked `running` resumes from its own `specs/<SPEC>_RUN_STATE.md`; specs marked `done` are skipped.

**Before each spec:**
1. `git status --short` clean, on `master`, the last Pages deploy green (`gh run list --limit 1`).
2. The spec file in `specs/` with `Status: ready`. If it is already `done` or in `specs/_archive/`, mark it `done` in the queue state and go to the next one.
3. Pick the template by the spec's `Complexity`: S → `docs/process/run-templates/RUN_S.md`, M → `RUN_M.md`, L → `RUN_L.md`. Read that template and follow everything below its line for this spec (`<SPEC>` = the spec id, `<SPEC file>` = its file name, branch = the spec's `Branch:`), including the roles, TDD steps, reviews, docs, merge, push, deploy watch and close.
4. Cross-spec notes: several specs say "whichever lands second wires in the other" (SPEC-002 ↔ SPEC-003 danger zone, SPEC-003 ↔ SPEC-004 dizzy). Check what is already on `master` and do the wiring the spec asks for in that case; say in the report which way it went.

**Unattended decisions:** when a spec leaves something open, take the reading closest to its text and to `docs/game-design.md`, note it in the spec's final report and in `specs/BACKLOG.md` as "decided during the run, check with the kids". Never change a rule marked as the kids' decision.

**Stop the whole queue** (mark the spec `stopped`, write why in the queue state, leave the branch as it is, do not start the next spec) when: a CRITICAL/HIGH finding is left after the template's fix rounds; the Pages workflow tests are red on `master` after the merge; the Pages deploy is red; a merge conflict you cannot resolve without changing another spec's behaviour; anything in `CLAUDE.md` "Never" would be needed. Later specs build on earlier ones, so never skip a stopped spec.

**Context:** keep each spec's work in its own run-state file and subagents; after a spec is closed, keep only its queue-state row in mind and re-read the template and the next spec from disk.

**Balance:** the templates' balance step applies to every spec that changes gameplay numbers or rules (`npm run balance` before the merge, `reports/balance.*` committed); red targets do not stop the queue unless the spec's ACs say so.

**After the last spec:** a final report in the chat: per spec — merge hash, deploy status, AC → test summary, findings fixed/left, red balance targets, decisions made during the run; then the BACKLOG additions and anything Andrei should check on the iPhone or with the kids.
