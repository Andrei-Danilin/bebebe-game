# Third-party licences

Code by other people that ships with BeBeBe Atrapar (the site `npm run site` builds, the installed app). Everything else in the
game is written for it. Dev-only tools (Playwright, ESLint, sharp, …) are not shipped and are not listed here.

| Component | Version | Files | Licence | Source |
|---|---|---|---|---|
| three.js | r187 (`three@0.187.0`) | `vendor/three/three.module.js`, `vendor/three/three.core.js` | MIT — `vendor/three/LICENSE` (copyright 2010–2026 three.js authors) | the npm package `three@0.187.0`, files `build/three.module.js` and `build/three.core.js` |

## three.js

- **What:** the 3D engine (WebGL renderer, scene, materials). The game imports it by the bare name `"three"`; the import map of
  `index.html` points that name at `./vendor/three/three.module.js` (SPEC-025 AC 1), so nothing is loaded from the internet.
- **Which files:** the npm package of r187 ships no minified build, so the vendored files are the minified copies of the two
  build files that jsDelivr generates with Terser (`three.module.min.js`, `three.core.min.js` of `three@0.187.0`), stored
  under the original names because the minified module imports `./three.core.js`. Their headers are kept: jsDelivr's note
  and three.js's `@license` header (MIT, SPDX identifier). Nothing else is changed. `vendor/three/package.json` only tells
  Node the files are ES modules (as `src/package.json` does).
- **Licence:** MIT, full text in `vendor/three/LICENSE` (copied from the npm package).
- **Version check:** `tests/pwa.spec.js` "the vendored three.js is the version of package.json and the service worker" — the
  vendored `REVISION` equals the minor version of `three` in `package.json` and `node_modules`, and the vendored module exports
  exactly what the npm build exports. A new three.js version is a spec of its own: new vendored files, this table, and
  `npm run precache` (the service worker's three.js cache is named by the version).
