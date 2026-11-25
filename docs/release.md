# Releases and rollback

How a version of BeBeBe Atrapar is released, and how a bad deploy is rolled back (SPEC-025 AC 13). The Pages deploy itself
does not change: every push to `master` is tested and deployed by `.github/workflows/pages.yml`. A release only gives one
of those deploys a version number, a changelog entry and a git tag.

## Versions

- The version is `package.json` `version` ([semver](https://semver.org/)). Between releases it is a pre-release such as
  `1.0.0-dev` or `1.1.0-dev`.
- `npm run precache` copies it into `src/version.js` (`VERSION`) and derives the service worker's `SW_VERSION`
  (`bebebe-<version>-b<SW_BUILD>`, CLAUDE.md hard rule 8). Nobody edits either by hand.
- The "For grown-ups" page and the error log show `<version>+<SRC_HASH>`. The hash names the exact module set, because a
  `-dev` version covers many deploys.
- `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)): every spec adds a line under **Unreleased**
  when it closes (the run templates say so).

## Making a release

A release runs on its own spec branch, like any other change (CLAUDE.md "Workflow").

1. Check that `CHANGELOG.md` **Unreleased** lists what the release brings, in plain words.
2. `npm run release -- X.Y.Z`. It sets the version in `package.json`, moves the Unreleased lines under
   `## [X.Y.Z] - <today>` and runs `npm run precache`, which rewrites `src/version.js` and `SW_VERSION`. Use `--dry` first to
   see what it would do.
3. Commit (`package.json`, `CHANGELOG.md`, `src/version.js`, `index.html`, `sw.js`), push the branch, and wait for a green
   Tests run. Then merge into `master` as usual. The Pages run deploys it.
4. When the Pages run is green, tag the merge commit and push the tag (a tag only, never a branch):
   `git tag -a vX.Y.Z -m "vX.Y.Z" <merge sha>`, then `git push origin vX.Y.Z`. A release tag is never moved or deleted: the
   ruleset `.github/rulesets/tags.json` blocks that once Andrei has applied it (next to the `master` ruleset; CLAUDE.md).
5. Start the next pre-release on the next spec: `npm run release -- X.Y.(Z+1)-dev`. A pre-release version only changes the
   version and leaves the changelog alone.

Note: a new version changes `SW_VERSION`, which names the src and assets caches (`<SW_VERSION>-src-…`,
`<SW_VERSION>-assets-…`). So after every release, installed apps download all the modules and all the sprites once more, even the
unchanged ones. three.js has its own cache and is not downloaded again. (BACKLOG: name those caches by the build counter only.)

## Rollback

### 1. Which commit is live?

- `curl -s https://andrei-danilin.github.io/bebebe-game/version.txt` prints the sha of the deployed commit (the `build`
  job stamps it, and the `deploy` job checks it).
- `git describe --tags <sha>` gives the nearest release tag. On a device, the "For grown-ups" page shows the version.
- `gh run list --workflow pages.yml --limit 5` lists the recent deploys and their commits.

### 2. Redeploy a known-good tag (fast, temporary)

`gh workflow run pages.yml --ref master -f ref=vX.Y.Z`

- The workflow comes from `master`. The `ref` input (SPEC-025 AC 13) makes it test, build and deploy that tag. The first job
  resolves the tag to its commit sha once. The sharded tests run on that sha, then its site is built, deployed and checked
  (`version.txt` = that sha).
- Pages runs share one concurrency group that keeps only one pending run: a push to `master` while the rollback run waits
  replaces it. Check that the rollback run really starts (`gh run list --workflow pages.yml --limit 3`), and push nothing to
  `master` until it has finished.
- Watch it: `gh run list --workflow pages.yml --limit 1`, then `gh run watch <id> --exit-status`.
- This is temporary. The next push to `master` deploys `master` again. Follow it with a revert (3) or a fix.
- The workflow files are always `master`'s (`--ref master`; `tests.yml` is reused from the same commit). Only the code is
  the ref's. So a commit from before SPEC-025 phase 3 works too, given as a sha (tags start with the first release): it has
  no `npm run typecheck`, and the typecheck job skips it (`--if-present`). The ref still needs `npm run lint`,
  `npm run test:core` and `npm run site`, so nothing older than SPEC-012. For older commits, use a revert (3). A pre-phase-3
  redeploy has not been tried on CI yet.

### 3. Revert (the lasting fix)

- Revert the bad merge on a spec branch: `git revert -m 1 <merge sha>`, commit `SPEC-NNN: revert <what>`, push, wait for a
  green Tests run, then merge and deploy as usual (CLAUDE.md "Workflow"). Never `git push --force`, never rewrite `master`.
- Whether a revert may go straight to `master` without a spec-branch run is **decision D-7** (Andrei,
  `docs/reviews/release-readiness.md`). Until he answers, today's rule holds: a revert is a change like any other and goes
  through a spec branch with a green Tests run.

### 4. Children's saves during a rollback

- A rollback keeps every child's save. Since SPEC-025 phase 2 an older build keeps unknown fields and never downgrades a
  newer save: it plays a save from a newer version and writes it back with its own version and every field it had. Coins and
  stars earned in the newer build stay.
- **Exception: a rollback to a build from before Phase 2.** Those builds don't know `bebebe-save`. They read the old keys
  (`bebebe-progress`, `bebebe-outfits`, `bebebe-names`, `bebebe-lang`), which were frozen at the migration, so a child sees
  the progress as it was at the migration. When the game moves forward again, the newer build notices that those keys changed
  (fingerprints) and merges them back: best stars, the higher unlocked level, owned items and seen scenes. But **coins earned
  on the old build in between are not kept**, because coins come from `bebebe-save`. Avoid such a rollback unless the newer
  build is unplayable.
- The installed app follows the deployed site: `index.html` is network-first, so the next online launch runs the
  redeployed version (`tests/pwa.spec.js` "a broken shell is replaced on the next online launch").
