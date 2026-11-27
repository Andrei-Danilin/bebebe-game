// Playwright config for BeBeBe Atrapar.
// SPEC-011 AC 8: every test opens the game over http from scripts/serve.js (started as the webServer); three.js is vendored
// (vendor/three/, SPEC-025 AC 1), so the tests run offline and test exactly the files players get.
// SPEC-011 AC 8b: service workers are blocked by default; only the PWA tests (tests/pwa.spec.js) allow them.
// SPEC-023: GPU locally, SwiftShader on CI (PW_GPU=auto|0|1), below-normal priority (PW_NICE=0: off) — tests/test-env.js.
const { defineConfig } = require("@playwright/test");
const { browserArgs } = require("./tests/test-env");

// Lets context.route() see the requests a service worker makes (SPEC-025: the request audit records the worker's requests too).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

const PORT = Number(process.env.PORT) || 8123;

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",           // SPEC-012 AC 7: tests/core/*.test.mjs are Node tests (npm run test:core), never Playwright's
  globalSetup: require.resolve("./tests/global-setup.js"),
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // SPEC-023 / SPEC-039: on CI the suite runs in 10 shards packed by measured time (tests.yml, scripts/shards.js: each shard runs its
  // own `--test-list`). With fullyParallel a test of a big file may go to another shard than its neighbours, still in file order
  // with one worker, so the shared pages work as locally. Locally nothing changes (one worker, no shards).
  fullyParallel: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: "node scripts/serve.js",
    url: `http://localhost:${PORT}/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 20_000
  },
  use: {
    viewport: { width: 960, height: 640 },
    // SPEC-011 AC 8b: over http the game registers sw.js; outside the PWA tests a service worker would only cache and
    // serve files behind the tests' back. pwa.spec.js sets test.use({ serviceWorkers: "allow" }).
    serviceWorkers: "block",
    // SPEC-023: hardware WebGL locally (d3d11/metal/gl), software (SwiftShader) on CI, with PW_GPU=0, or when the global
    // setup finds no GPU context (it sets PW_GL; workers load this config again and see it).
    launchOptions: {
      args: browserArgs(),
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
    },
    // SPEC-018: "only-on-failure" takes a screenshot of every page at the end of EVERY test (and drops it when the test
    // passed): with software WebGL that cost 1.5–2 s per test, ~4 min of the whole suite. Off by default; to get the
    // failure screenshots back for one run: PW_SCREENSHOT=only-on-failure npx playwright test …
    screenshot: process.env.PW_SCREENSHOT || "off"
  }
});
