// SPEC-023: runs once in the Playwright runner before any test.
// 0. SPEC-011 review: the http server on the port (started by the webServer, or an `npm run serve` it reuses locally) must
//    serve THIS checkout: scripts/serve.js names its tree in the X-Bebebe-Root header; another tree fails the run. A server
//    from before that header (an older serve.js still running) passes only if it serves this checkout's very files.
// 1. Below-normal priority for the runner (PW_NICE=0: off); the workers and the browsers it starts inherit it.
// 2. GPU in auto mode (PW_GPU unset): probe once that a hardware WebGL context comes up with the GPU flags; if not,
//    switch the run to SwiftShader (PW_GL=swiftshader — workers load the config again with this env) and say so in one line.
const { chromium } = require("@playwright/test");
const { glBackend, browserArgs, gpuAuto, rendererInPage, isSoftware, lowerPriority } = require("./test-env");
const fs = require("fs");
const path = require("path");
const { rootIdOf, ROOT } = require("../scripts/serve");

const SAME_FILES = ["index.html", "sw.js", "tests/helpers.js", "scripts/serve.js"];
async function checkServer() {
  const base = `http://localhost:${Number(process.env.PORT) || 8123}/`, want = rootIdOf(ROOT);
  const stop = why => new Error(`[tests] the server at ${base} ${why}: stop it (an npm run serve of another checkout?) or set PORT`);
  let got;
  try { got = (await fetch(base + "index.html", { method: "HEAD" })).headers.get("x-bebebe-root"); } catch (e) { throw new Error(`[tests] no http server at ${base}: ${e.message}`); }
  if (got === want) return;
  if (got) throw stop(`serves another tree (X-Bebebe-Root ${got}, this checkout ${want})`);
  // no header: an older serve.js — it must serve exactly this checkout's files
  for (const f of SAME_FILES) {
    const served = Buffer.from(await (await fetch(base + f)).arrayBuffer());
    if (!served.equals(fs.readFileSync(path.join(ROOT, f)))) throw stop(`serves another tree (its ${f} differs from this checkout's)`);
  }
  console.log(`[tests] reusing an older serve.js on ${base} (same files as this checkout); restart it to get the X-Bebebe-Root check`);
}

module.exports = async function globalSetup() {
  await checkServer();
  lowerPriority();
  if (glBackend() !== "gpu" || !gpuAuto()) return;
  let renderer = "", browser;
  try {
    browser = await chromium.launch({ args: browserArgs("gpu"), ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage();
    renderer = await page.evaluate(rendererInPage);
  } catch (e) {
    renderer = "";
  } finally {
    if (browser) await browser.close();
  }
  if (!renderer || isSoftware(renderer)) {
    process.env.PW_GL = "swiftshader";
    console.log(`[tests] no GPU WebGL context (${renderer || "none"}) — falling back to SwiftShader`);
  }
};
