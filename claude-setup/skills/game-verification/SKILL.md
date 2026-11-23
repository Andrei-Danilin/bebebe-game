---
name: game-verification
description: Use after every change to bebebe-game's index.html or tests, before review and before merge — runs the module syntax check, the Playwright suite and a screenshot check of changed screens.
---

# Game verification — bebebe-game

## 1. Module syntax (seconds, no browser)
```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');const a=s.indexOf('<script type=\"module\">')+22;const b=s.indexOf('</script>',a);require('fs').writeFileSync('.tmp-module.mjs',s.slice(a,b));" && node --check .tmp-module.mjs && echo SYNTAX_OK; rm -f .tmp-module.mjs
```

## 2. Tests
- While working: `npm run test:fast` (~1.5 min) + the touched area: `npx playwright test tests/<file>` or `-g "<name>"`.
- Before review and before merge: `npx playwright test` (all, once, ~10 min). Report counts + failing names + first assertion line.
- Any page error (`errors` array not empty) is a failure.

## 3. Screenshots of changed screens (not committed)
Write a throwaway script in the OS temp folder, e.g.:
```js
// node shot.mjs  (run from the repo root)
import { chromium } from "@playwright/test";
import path from "path";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 960, height: 640 } });
await p.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ path: path.resolve("node_modules/three/build/" + r.request().url().split("/").pop()), contentType: "application/javascript" }));
await p.goto("file://" + path.resolve("index.html"));
await p.waitForFunction(() => window.__bbReady);
await p.evaluate(() => { window.__bb.startGame(1); /* put the scene you changed here */ });
await p.waitForTimeout(500);
await p.screenshot({ path: process.env.TEMP ? process.env.TEMP + "/bb-shot.png" : "/tmp/bb-shot.png" });
await b.close();
```
Look at the image (Read tool) before the review: overlaps, text that does not fit (check `es` and `ru` — they are longer), characters hidden behind walls.

## 4. Languages
Switch with `window.__bb.setLang("es" | "ru")` before the screenshot when the change has text.
