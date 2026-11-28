# Third-party licences

Code by other people that ships with BeBeBe Atrapar (the site `npm run site` builds, the installed app). Everything else in the
game is written for it. Dev-only tools (Playwright, ESLint, sharp, …) are not shipped and are not listed here.

| Component | Version | Files | Licence | Source |
|---|---|---|---|---|
| three.js | r187 (`three@0.187.0`) | `vendor/three/three.module.js`, `vendor/three/three.core.js` | MIT — `vendor/three/LICENSE` (copyright 2010–2026 three.js authors) | jsDelivr's minified copies (`three.module.min.js`, `three.core.min.js`) of the npm package `three@0.187.0` build files `build/three.module.js` and `build/three.core.js`, written by `npm run vendor:three` |

## three.js

- **What:** the 3D engine (WebGL renderer, scene, materials). The game imports it by the bare name `"three"`; the import map of
  `index.html` points that name at `./vendor/three/three.module.js` (SPEC-025 AC 1), so nothing is loaded from the internet.
- **Which files:** the npm package of r187 ships no minified build, so the vendored files are the minified copies of the two
  build files that jsDelivr generates with Terser (`three.module.min.js`, `three.core.min.js` of `three@0.187.0`), stored
  under the original names because the minified module imports `./three.core.js`. Their headers are kept: jsDelivr's note
  and three.js's `@license` header (MIT, SPDX identifier). Nothing else is changed. `npm run vendor:three`
  (`scripts/vendor-three.js`) re-creates them from the version `package.json` pins and runs `npm run precache`. `vendor/three/package.json` only tells
  Node the files are ES modules (as `src/package.json` does).
- **Licence:** MIT, full text in `vendor/three/LICENSE` (copied from the npm package).
- **Version check:** `tests/pwa.spec.js` "the vendored three.js is the version of package.json and the service worker" — the
  vendored `REVISION` equals the minor version of `three` in `package.json` and `node_modules`, and the vendored module exports
  exactly what the npm build exports. A new three.js version is a spec of its own: new vendored files, this table, and
  `npm run precache` (the service worker's three.js cache is named by the version).

## Audio (`assets/audio/`, made from `audio/src/`)

Not other people's code: the sounds, jingles and music were made for this game by Andrei and the kids, 2026-11-25…27, from the project's audio brief, with paid tools
(`audio/src/SOURCES.md` names the tool of each file). No voice of a real child was uploaded to any tool.

| Files | Made with | Terms |
|---|---|---|
| `theme`, `theme_song` (the melody and lyrics of the song were written for this game) | Suno, Pro plan | made on a paid plan — commercial use allowed (as `audio/src/SOURCES.md` records) |
| `world_field`, `world_city`, `world_school`, `world_beach`, `world_winter`, `boss`, `story` (covers of `theme`) | Suno, Pro plan | the same |
| all sound effects and the jingles `win`, `lose`, `boss_sting`, `world_open` | ElevenLabs Sound Effects, paid plan | made on a paid plan — **the plan is to be confirmed by Andrei** (`SOURCES.md`) |

The files in `assets/audio/` are MP3 conversions of these sources (`npm run audio`, `docs/audio.md`); nothing is loaded from another host.
