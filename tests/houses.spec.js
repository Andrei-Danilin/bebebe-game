// SPEC-044: every world has its own houses — HOUSE_LOOK[world].kids / .dad name a builder (the kids' clean house with the heart on the
// door, Dad's messy one); the footprint, the doors and the fading roofs are the same as before. Rendered pages only (the 3D scene is
// not built in sim mode); the scene is read through __bb.look3D("houses") (drawn state).
const { test, expect } = require("./pw");
const { openGame, frames } = require("./helpers");

const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
const play = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.mode = "map"; b.world = w; b.level = n; b.startGame(1); }, [world, level]);

test("AC 1: HOUSE_LOOK has a kids' and a Dad's builder for each world, and look3D says which one built the houses @fast", async ({ page }) => {
  const errors = await openGame(page);
  const table = await page.evaluate(() => { const H = window.__bb.CFG.HOUSE_LOOK; return Object.fromEntries(["park", "field", "city", "school", "beach", "winter"].map(w => [w, [H[w] && H[w].kids && H[w].kids.build, H[w] && H[w].dad && H[w].dad.build]])); });
  for (const w of WORLDS) for (const b of table[w]) expect(typeof b, `${w}: builder name`).toBe("string");
  for (const w of WORLDS) {
    await play(page, w, 1);
    await frames(page);
    const h = (await page.evaluate(() => window.__bb.look3D("houses"))).houses;
    expect([h.kid.build, h.big.build], `${w}: builders`).toEqual(table[w]);
  }
  expect(errors).toEqual([]);
});
