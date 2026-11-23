// Playwright config for BeBeBe Atrapar.
// Most tests open index.html from disk; three.js is served from node_modules instead of the CDN
// (see tests/helpers.js), so the tests run offline.
// The PWA tests (tests/pwa.spec.js) need http: scripts/serve.js is started as the webServer.
const { defineConfig } = require("@playwright/test");

// Lets context.route() see the requests a service worker makes (the PWA tests route jsDelivr that way).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

const PORT = Number(process.env.PORT) || 8123;

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
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
    // Software WebGL so the tests also run on machines/VMs without a GPU.
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
    },
    // SPEC-018: "only-on-failure" takes a screenshot of every page at the end of EVERY test (and drops it when the test
    // passed): with software WebGL that cost 1.5–2 s per test, ~4 min of the whole suite. Off by default; to get the
    // failure screenshots back for one run: PW_SCREENSHOT=only-on-failure npx playwright test …
    screenshot: process.env.PW_SCREENSHOT || "off"
  }
});
