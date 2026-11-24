# SPEC-024 — Release-readiness review and architecture plan update

Status: ready
Complexity: M
Branch: SPEC-024-readiness-review
Decided by: Andrei (2026-11-23): before the module split and the store releases, an independent read-only review of the code and the game logic; right after the report the queue goes on with the module split (SPEC-011), the headless core (SPEC-012) and the production foundation (SPEC-025), with their plans corrected by the review. How the review is done, report format, what may change in the plans: Claude (spec author).

## Description
A read-only audit by fresh agents that did not write the code. It produces `docs/reviews/release-readiness.md` with prioritised findings, and then updates the three following specs (SPEC-011, SPEC-012, SPEC-025) so their plans fix what the review found — without changing their goals or any kids'/Kostya's/Andrei's decision. No game code changes in this spec.

## Goal
- A clear picture of what stands between today's game and a reliable kids' app in the App Store (Kids) and Google Play (Families): free, no ads, no purchases, no data collection, fully offline, online play later.
- SPEC-011/012/025 corrected before they run, so the refactor and the production work address the real problems.

## Context
- Product decisions: project doc "publishing plan" (summarised here): kids' game, free, no ads, no purchases, nothing collected, everything on the device, Capacitor (Android + iOS) or TWA, offline, online (SPEC-013…015) as a second wave with names from a list.
- Plans waiting: `specs/SPEC-011-modules.md` (split into `src/core` / `src/client`), `SPEC-012-headless-core.md` (many games, input slots, events), `SPEC-025-production-foundation.md` (offline three.js, saves, errors, linting/type checks, versioning), `SPEC-013…015` (online, later).
- Docs: `docs/architecture.md`, `docs/game-design.md`, `docs/story.md`, `specs/BACKLOG.md`, `reports/balance.md`, `reports/test-times.md`.

## Out of scope
- Any change to game code, tests or assets (only the report and the three specs).
- Packaging itself, store accounts, legal texts (publishing is parked).

## Acceptance criteria
1. Seven review lenses run in parallel as separate subagents (model opus), each reading the code fresh, then merged and de-duplicated:
   1. Architecture — structure, state and mode handling, coupling of logic / rendering / UI, globals, file sizes; does the SPEC-011/012 split fix the main problems.
   2. Saves and data — format and versioning, every migration path, corrupted or missing data, localStorage limits, iOS eviction (`navigator.storage.persist`), reset flows, what a lost save costs a child.
   3. Packaging and offline — CDN dependencies (three.js), the service worker inside a native wrapper, asset loading, safe areas / orientation / fullscreen in Capacitor, icons and splash, what breaks without network.
   4. Performance on weak devices — memory growth over long sessions and many levels, draw calls, textures, per-frame allocations, shadow/fog cost, first-load time; a measurement plan for a real low-end Android and an older iPhone.
   5. Store policy and privacy — anything that sends data or loads third-party code, links out (need a parental gate), permissions, what the privacy policy must say to match the code, age-rating questions, the online names plan.
   6. Robustness — error handling, what a child sees when something fails, unhandled rejections, input edge cases (gamepad, touch, keyboard), app going to background and back.
   7. Maintainability and release process — tests (coverage gaps in risky areas, flaky tests, speed), linting/type safety, dependency updates, versioning, changelog, signed builds, rollback, how a fix reaches players.
2. `docs/reviews/release-readiness.md`: summary (ready / not ready, top 5 risks); findings by area with severity (BLOCKER / HIGH / MEDIUM / LOW), location (file:line or function), why it matters for a store release, a one-or-two-sentence fix, and **which spec should fix it** (SPEC-011, 012, 025, a later release spec, or BACKLOG); a manual device checklist for Andrei (old Android, iPhone; what to try, for how long, what to watch).
3. **Plan update:** every BLOCKER/HIGH finding is assigned. Findings that belong to SPEC-011, SPEC-012 or SPEC-025 are added to those specs as new or changed acceptance criteria and steps, each marked "(from review)", plus a "Review notes" section explaining the changes. Goals, out-of-scope lines that are decisions, and all kids'/Kostya's/Andrei's decisions stay untouched; if a finding would need such a change, it goes to the report's "decisions for Andrei" list instead. Findings for later (packaging, store texts, online) go to BACKLOG with "(release review)".
4. Commit on the branch: the report, the updated specs, BACKLOG; merge to `master` (docs only — CI as usual), push.
5. Final chat report: summary, BLOCKER/HIGH list with the spec each one went to, the "decisions for Andrei" list.

## Implementation steps
1. Read docs, plans and code; run the seven lenses in parallel.
2. Merge, de-duplicate, rank; write the report.
3. Update SPEC-011, SPEC-012, SPEC-025 and BACKLOG; merge, push.

## Docs to update
`docs/reviews/release-readiness.md` (new), `specs/SPEC-011-modules.md`, `specs/SPEC-012-headless-core.md`, `specs/SPEC-025-production-foundation.md`, `specs/BACKLOG.md`.
