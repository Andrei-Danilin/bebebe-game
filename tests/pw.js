// SPEC-023: @playwright/test with failure screenshots: when a test fails, its pages are screenshotted and attached to the
// report — the CI artifacts then show what was on screen. Free when the test passes (unlike `screenshot: "only-on-failure"`,
// which shoots every page after every test and cost 1.5–2 s per test with software WebGL, SPEC-018).
// - `page`: the test's own fresh page, before it closes;
// - auto `failureShots`: every page still open in the worker's browser (the shared pages of a spec).
// A sim page draws nothing: its screenshot throws and is skipped.
// Specs use it as `const base = require("./pw")` / `const { test, expect } = require("./pw")`.
const pw = require("@playwright/test");

async function shoot(pages, testInfo, prefix) {
  let i = 0;
  for (const page of pages) {
    try {
      const body = await page.screenshot({ timeout: 5_000 });
      await testInfo.attach(`${prefix}-${++i}.png`, { body, contentType: "image/png" });
    } catch (e) { /* closed, crashed or in sim mode */ }
  }
}
const failed = testInfo => testInfo.status !== testInfo.expectedStatus;

const test = pw.test.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    if (failed(testInfo)) await shoot([page], testInfo, "failure-page");
  },
  failureShots: [async ({ browser }, use, testInfo) => {
    await use();
    if (failed(testInfo)) await shoot(browser.contexts().flatMap(c => c.pages()), testInfo, "failure-open-page");
  }, { auto: true }]
});

module.exports = { ...pw, test };
