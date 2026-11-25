// SPEC-021 AC 10: paired A/B frame times — another build of the site (a git ref, default master) against the working copy.
// SPEC-011 AC 8b: both sides over http, each from its own server (scripts/serve.js startServer): A = the whole tree of the ref
// (git archive) in a temp folder, B = the repo root.
// Rounds alternate A, B, A, B… in one browser (the tests' WebGL flags: GPU locally), so a busy machine slows both alike.
// Scene: park level 2, seed 7, the Big One looking away; per viewport (phone 844×390 with ?phone=1, desktop 960×640):
//   JS — the game's rAF callback time (logic + three.js command submission);
//   GPU — the same plus a 1-pixel readPixels after the frame (waits for the GPU to finish it).
// Prints the median of the round medians for A and B and the median of the paired B/A ratios. Not part of any test run.
//   node scripts/perf.js [--base <git ref>] [--rounds N] [--grain] [--level N] [--wear id,id]   (--grain: paper grain on where the build
// has it; --level: park level, default 2; --wear: player 1 owns and wears these jacket / pants ids where the build has them — SPEC-027)
/* global window, document */   // initScript() and the evaluate bodies run in the page
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require("@playwright/test");
const { browserArgs } = require("../tests/test-env");
const { startServer } = require("./serve");

const ROOT = path.resolve(__dirname, "..");
const THREE_DIR = path.join(ROOT, "node_modules", "three", "build");
const arg = (name, def) => { const i = process.argv.indexOf(name); return i < 0 ? def : process.argv[i + 1]; };
const baseRef = arg("--base", "master"), rounds = Number(arg("--rounds", 4)), grain = process.argv.includes("--grain");
const level = Number(arg("--level", 2)), wear = (arg("--wear", "") || "").split(",").filter(Boolean);
const FRAMES = 240;

// Runs in the page before the game: wraps requestAnimationFrame to time the game's callback
function initScript() {
  try { if (!sessionStorage.getItem("perf")) { localStorage.clear(); localStorage.setItem("bebebe-lang", "en"); sessionStorage.setItem("perf", "1"); } } catch (e) { /* ok */ }
  const raf = window.requestAnimationFrame.bind(window);
  window.__ft = { on: false, sync: false, js: [], all: [] };
  window.requestAnimationFrame = cb => raf(now => {
    const f = window.__ft, t0 = performance.now();
    cb(now);
    const t1 = performance.now();
    if (!f.on) return;
    if (f.sync) { const gl = document.getElementById("gl").getContext("webgl2"); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); f.all.push(performance.now() - t0); }
    else f.js.push(t1 - t0);
  });
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function measure(browser, base, vw, vh, query) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, serviceWorkers: "block" });
  await page.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ path: path.join(THREE_DIR, r.request().url().split("/").pop()), contentType: "application/javascript", headers: { "Access-Control-Allow-Origin": "*" } }));
  await page.addInitScript(initScript);
  await page.goto(base + "index.html" + query);
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.evaluate(([g, n, ids]) => {
    const b = window.__bb, W = b.wardrobe(), own = { jacket: "jackets", pants: "pants" };
    if ("PAPER_GRAIN" in b.CFG) { b.CFG.PAPER_GRAIN = g; b.CFG.PAPER_GRAIN_PHONE = g; }
    for (const id of ids) for (const sl of ["jacket", "pants"]) {
      const i = W[sl].findIndex(q => q.id === id);
      if (i >= 0) { b.progress.owned[own[sl]].push(id); b.cycleOutfit("p1", sl, i - b.outfits.shown.p1[sl]); }
    }
    b.seedRandom(7); b.clearLevelCache(); b.world = "park"; b.level = n; b.startGame(1);
    b.big.state = "look"; b.big.timer = 999;
  }, [grain, level, wear]);
  await page.waitForTimeout(2600);                       // the level banner is gone
  const out = {};
  for (const sync of [false, true]) {
    await page.evaluate(s => { const f = window.__ft; f.js = []; f.all = []; f.sync = s; f.on = true; }, sync);
    await page.waitForFunction(([s, n]) => (s ? window.__ft.all : window.__ft.js).length >= n, [sync, FRAMES], { timeout: 120_000 });
    const d = await page.evaluate(() => { const f = window.__ft; f.on = false; return { js: f.js, all: f.all }; });
    out[sync ? "gpu" : "js"] = median(sync ? d.all : d.js);
  }
  await page.close();
  return out;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bebebe-perf-"));
  // SPEC-011 AC 8b: the whole tree of the ref (index.html, sw.js, icons/, its own assets/ — SPEC-027: so it draws with art —
  // and src/ once it exists), so the A build loads exactly its own files
  const tar = execFileSync("git", ["archive", "--format=tar", baseRef], { cwd: ROOT, maxBuffer: 1024 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-f", "-"], { cwd: dir, input: tar, maxBuffer: 64 * 1024 * 1024 });
  const siteA = await startServer({ root: dir }), siteB = await startServer();
  const A = siteA.base, B = siteB.base;
  const browser = await chromium.launch({ args: browserArgs() });
  console.log(`A = ${baseRef}, B = working copy, ${rounds} rounds, paper grain ${grain ? "on" : "off"}, park ${level}${wear.length ? ", player 1 wears " + wear : ""}`);
  for (const [name, vw, vh, q] of [["phone 844x390", 844, 390, "?phone=1"], ["desktop 960x640", 960, 640, ""]]) {
    const ra = [], rb = [];
    for (let k = 0; k < rounds; k++) { ra.push(await measure(browser, A, vw, vh, q)); rb.push(await measure(browser, B, vw, vh, q)); }
    const f = x => Number(x.toFixed(2)), m = (r, k) => f(median(r.map(x => x[k])));
    const ratio = k => f(median(ra.map((a, i) => rb[i][k] / a[k])));
    console.log(`${name}: JS ${m(ra, "js")} → ${m(rb, "js")} ms (×${ratio("js")}), GPU ${m(ra, "gpu")} → ${m(rb, "gpu")} ms (×${ratio("gpu")})`);
  }
  await browser.close();
  await siteA.close(); await siteB.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
