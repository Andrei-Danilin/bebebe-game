// SPEC-023: @playwright/test with failure screenshots: when a test fails, its pages are screenshotted and attached to the
// report — the CI artifacts then show what was on screen. Free when the test passes (unlike `screenshot: "only-on-failure"`,
// which shoots every page after every test and cost 1.5–2 s per test with software WebGL, SPEC-018).
// - `page`: the test's own fresh page, before it closes;
// - auto `failureShots`: every page still open in the worker's browser (the shared pages of a spec).
// A sim page draws nothing: its screenshot throws and is skipped.
// SPEC-011 AC 8d: a failed test also prints the seed its games were seeded with (tests/helpers.js testSeed(), annotation "seed").
// Specs use it as `const base = require("./pw")` / `const { test, expect } = require("./pw")`.
const pw = require("@playwright/test");
const { installCiFont } = require("./ci-font");   // SPEC-033 AC 14: PW_FONT=ci — the fresh page of a test draws with the CI runner's font

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
    await installCiFont(page);
    await use(page);
    if (failed(testInfo)) await shoot([page], testInfo, "failure-page");
  },
  failureShots: [async ({ browser }, use, testInfo) => {
    await use();
    if (!failed(testInfo)) return;
    const seed = testInfo.annotations.find(a => a.type === "seed");
    if (seed) console.log(`[seed] ${testInfo.titlePath.join(" › ")}: rng seed ${seed.description}`);
    await shoot(browser.contexts().flatMap(c => c.pages()), testInfo, "failure-open-page");
  }, { auto: true }]
});

module.exports = { ...pw, test };
