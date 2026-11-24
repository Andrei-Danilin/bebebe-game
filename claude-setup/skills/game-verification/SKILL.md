---
name: game-verification
description: Use after every change to bebebe-game's index.html or tests, before review and before merge — runs the module syntax check, the fast set and the changed tests locally, the whole suite on CI (sharded Tests workflow on the pushed branch), and a screenshot check of changed screens.
---

# Game verification — bebebe-game

## 1. Module syntax (seconds, no browser)
```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');const a=s.indexOf('<script type=\"module\">')+22;const b=s.indexOf('</script>',a);require('fs').writeFileSync('.tmp-module.mjs',s.slice(a,b));" && node --check .tmp-module.mjs && echo SYNTAX_OK; rm -f .tmp-module.mjs
```

## 2. Tests
- **Locally**: `npm run test:fast` (~1.5 min) + the test files of what changed: `npx playwright test tests/<file>` or `-g "<name>"`; phone layouts at 667×375 only. Locally the browser uses the GPU at below-normal priority (`PW_GPU=0` → SwiftShader, then also `PW_NICE=0` on a busy machine; `PW_NICE=0` → normal priority). Never the whole suite locally unless the spec asks for it.
- **The whole suite on CI**: `git push -u origin <branch>`; then the run of exactly this commit:
  ```bash
  sha=$(git rev-parse HEAD); id=""
  until [ -n "$id" ]; do id=$(gh run list --workflow tests.yml --commit $sha --limit 1 --json databaseId --jq '.[0].databaseId'); [ -n "$id" ] || sleep 10; done
  gh run watch $id --exit-status
  ```
  Red → `gh run download $id -n html-report` (merged report) and `-n test-results-<shard>` (error context + failure screenshots). Report counts + failing names + first assertion line. Merge only on green.
- Any page error (`errors` array not empty) is a failure.
- Sim vs rendered: logic-only tests use `simPage` / `openGame(page, { sim: true })`; drawn checks use a rendered `page` (in sim, `frames()`, `page.screenshot()` and `__bb.SIM_DRAWN` throw). Specs require `./pw`, not `@playwright/test`.

## 3. Screenshots of changed screens (not committed)
Write a throwaway script in the OS temp folder and run it from the repo root (it uses the same GPU flags and priority as the tests):
```js
// node <temp>/shot.cjs   (run from the repo root)
const path = require("path");
const { chromium } = require(path.resolve("node_modules/@playwright/test"));
const { browserArgs, lowerPriority } = require(path.resolve("tests/test-env.js"));
(async () => {
  lowerPriority();
  const b = await chromium.launch({ args: browserArgs() });
  const p = await b.newPage({ viewport: { width: 960, height: 640 } });
  await p.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ path: path.resolve("node_modules/three/build/" + r.request().url().split("/").pop()), contentType: "application/javascript" }));
  await p.goto("file://" + path.resolve("index.html"));
  await p.waitForFunction(() => window.__bbReady, null, { timeout: 60_000 });
  await p.evaluate(() => { window.__bb.startGame(1); /* put the scene you changed here */ });
  await p.waitForTimeout(500);
  await p.screenshot({ path: (process.env.TEMP || "/tmp") + "/bb-shot.png" });
  await b.close();
})();
```
Look at the image (Read tool) before the review: overlaps, text that does not fit (check `es` and `ru` — they are longer), characters hidden behind walls.

## 4. Languages
Switch with `window.__bb.setLang("es" | "ru")` before the screenshot when the change has text.
