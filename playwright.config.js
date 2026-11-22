// Playwright config for BeBeBe Atrapar.
// The game is a single index.html opened from disk; three.js is served from node_modules
// instead of the CDN (see tests/helpers.js), so the tests run offline.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
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
