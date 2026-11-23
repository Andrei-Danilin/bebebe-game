// SPEC-023: runs once in the Playwright runner before any test.
// 1. Below-normal priority for the runner (PW_NICE=0: off); the workers and the browsers it starts inherit it.
// 2. GPU in auto mode (PW_GPU unset): probe once that a hardware WebGL context comes up with the GPU flags; if not,
//    switch the run to SwiftShader (PW_GL=swiftshader — workers load the config again with this env) and say so in one line.
const { chromium } = require("@playwright/test");
const { glBackend, browserArgs, gpuAuto, rendererInPage, isSoftware, lowerPriority } = require("./test-env");

module.exports = async function globalSetup() {
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
