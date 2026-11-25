// SPEC-011: index.html split into ES modules (core / client). The checks of the module layout and of what must stay the
// same through the move. Phase A: the window.__bb surface (AC 5c); later phases add the layout, dependency and Node checks.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { openGame, ROOT } = require("./helpers");

// AC 5c: the key list of window.__bb recorded on master before any code moved (tests/fixtures/bb-keys.json). Tests drive the
// game through __bb (hard rule 6): a key may be added, none may disappear. A spec that adds keys may append them to the list.
const BB_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "bb-keys.json"), "utf8"));
test("the __bb surface is unchanged", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const keys = await page.evaluate(() => Object.keys(window.__bb));   // names only: no getter runs (sim throws on drawn state)
  expect(BB_KEYS.length, "the recorded list is not empty").toBeGreaterThan(150);
  expect(BB_KEYS.filter(k => !keys.includes(k)), "__bb keys removed since the recorded list").toEqual([]);
  expect(errors).toEqual([]);
});
