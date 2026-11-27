// SPEC-025 AC 13: `npm run release -- <version>` — the file part of a release (docs/release.md): sets package.json "version",
// rewrites index.html's game-version meta and sw.js's SW_VERSION (npm run precache), and for a release version (no "-" pre-release part) moves
// the CHANGELOG.md "Unreleased" entries under "## [<version>] - <today>" with a fresh empty "Unreleased" above. Committing,
// merging, tagging (`git tag -a v<version>`) and pushing the tag stay manual steps of the release run (docs/release.md).
// A pre-release version (e.g. 1.1.0-dev, the version after a release) only sets the version.
// It refuses an invalid version or a dirty working tree before writing anything.
//   node scripts/release.js <version> [--dry]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PKG = path.join(ROOT, "package.json"), LOG = path.join(ROOT, "CHANGELOG.md");
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const UNRELEASED = "## [Unreleased]";

// the changelog with the Unreleased entries moved under the version's heading (pure: tests and --dry use it)
function moveUnreleased(log, version, date) {
  const i = log.indexOf(UNRELEASED);
  if (i < 0) throw new Error(`CHANGELOG.md: no "${UNRELEASED}" heading`);
  const from = i + UNRELEASED.length, next = log.indexOf("\n## [", from);
  const body = (next < 0 ? log.slice(from) : log.slice(from, next)).trim();
  if (!body) throw new Error("CHANGELOG.md: nothing under Unreleased — add the release's lines first");
  return log.slice(0, i) + `${UNRELEASED}\n\n## [${version}] - ${date}\n\n${body}\n` + (next < 0 ? "" : log.slice(next));
}

// the working tree's changes to tracked files (git status --porcelain): a release starts from a clean tree, so its commit holds
// only the release. Untracked files are not counted (a run's own untracked run-state file, specs/SPEC-NNN_RUN_STATE.md).
const gitStatus = () => execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: ROOT, encoding: "utf8" });

// Everything is checked before anything is written: the version (semver), a clean tree (not for --dry), the changelog. Then
// package.json is written and npm run precache runs; if precache fails, package.json is put back and the changelog is left
// alone — the changelog is written last, only after precache succeeded.
function release(version, { dry = false, date = new Date().toISOString().slice(0, 10), status = gitStatus } = {}) {
  if (!SEMVER.test(version || "")) throw new Error(`"${version}" is not a semver version (X.Y.Z or X.Y.Z-pre)`);
  if (!dry) { const dirty = status().trim(); if (dirty) throw new Error(`the working tree is not clean — commit or stash first:\n${dirty}`); }
  const pkgText = fs.readFileSync(PKG, "utf8"), pkg = JSON.parse(pkgText);
  const log = version.includes("-") ? null : moveUnreleased(fs.readFileSync(LOG, "utf8").split("\r\n").join("\n"), version, date);
  const from = pkg.version;
  if (dry) return { from, to: version, changelog: !!log };
  fs.writeFileSync(PKG, JSON.stringify({ ...pkg, version }, null, 2) + "\n");
  let r;
  try { r = require("./precache.js").run(); } catch (e) { fs.writeFileSync(PKG, pkgText); throw e; }
  if (log) fs.writeFileSync(LOG, log);
  return { from, to: version, changelog: !!log, wrote: r.stale };
}

module.exports = { release, moveUnreleased, SEMVER };

if (require.main === module) {
  const version = process.argv[2];
  try {
    const r = release(version, { dry: process.argv.includes("--dry") });
    console.log(`release: version ${version}${r.changelog ? ", CHANGELOG.md entries moved under it" : ""}${r.wrote ? ", precache wrote " + (r.wrote.join(", ") || "nothing") : " (dry run)"}`);
    if (!r.wrote) process.exit(0);
    console.log("next (docs/release.md): commit on the release branch, CI green, merge to master, then git tag -a v" + version + " -m \"v" + version + "\" on the merge and git push origin v" + version);
  } catch (e) { console.error("release: " + e.message); process.exit(1); }
}
