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
    screenshot: "only-on-failure"
  }
});
