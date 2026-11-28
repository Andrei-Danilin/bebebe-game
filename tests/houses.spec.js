// SPEC-044: every world has its own houses — HOUSE_LOOK[world].kids / .dad name a builder (the kids' clean house with the heart on the
// door, Dad's messy one); the footprint, the doors and the fading roofs are the same as before. Rendered pages only (the 3D scene is
// not built in sim mode); the scene is read through __bb.look3D("houses") (drawn state).
const { test, expect } = require("./pw");
const { openGame, frames } = require("./helpers");

const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
// the pair of each world (the spec's table): kids' builder, Dad's builder
const PAIRS = { park: ["treehouse", "shed"], field: ["dugout", "hut"], city: ["shop", "garage"], school: ["bus", "caretaker"], beach: ["hut", "shack"], winter: ["igloo", "cabin"] };
const play = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.mode = "map"; b.world = w; b.level = n; b.startGame(1); }, [world, level]);

test("AC 1: HOUSE_LOOK has a kids' and a Dad's builder for each world, and look3D says which one built the houses @fast", async ({ page }) => {
  const errors = await openGame(page);
  const table = await page.evaluate(() => { const H = window.__bb.CFG.HOUSE_LOOK; return Object.fromEntries(["park", "field", "city", "school", "beach", "winter"].map(w => [w, [H[w] && H[w].kids && H[w].kids.build, H[w] && H[w].dad && H[w].dad.build]])); });
  for (const w of WORLDS) expect(table[w], `${w}: the pair`).toEqual(PAIRS[w]);
  for (const w of WORLDS) {
    await play(page, w, 1);
    await frames(page);
    const h = (await page.evaluate(() => window.__bb.look3D("houses"))).houses;
    expect([h.kid.build, h.big.build], `${w}: builders`).toEqual(table[w]);
  }
  expect(errors).toEqual([]);
});

// AC 4: the sprites house_<world>_kids / _dad of the sheets 38 / 39 are in the manifest, and the level card draws the world's pair —
// the one of every world (house_kids / house_messy) when the picture is missing
test("AC 4: sheets 38 and 39 give house_<world>_kids / _dad; the level card shows the world's pair, today's pair when the picture is missing", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const manifest = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "scripts", "assets.json"), "utf8"));
  const names = src => manifest.sources.find(q => q.src === src).names;
  expect(names("38_houses_main.webp")).toEqual(["park", "field", "city", "school"].map(w => `house_${w}_kids`).concat(["park", "field", "city", "school"].map(w => `house_${w}_dad`)));
  expect(names("39_houses_bonus.webp")).toEqual(["house_beach_kids", "house_winter_kids", "house_beach_dad", "house_winter_dad"]);
  await page.route("**/assets/house_winter_*.webp", r => r.abort());          // Winter's pair is missing: today's pair
  const draw = async (w, lv) => {
    await page.evaluate(([w, lv]) => { const b = window.__bb; b.progress.worlds[w].unlocked = Math.max(b.progress.worlds[w].unlocked || 1, lv); b.world = w; b.mode = "map"; }, [w, lv]);
    await frames(page);
    await page.evaluate(n => { window.__bb.showCard(n); window.__bb.drawNow(); }, lv);
    await page.waitForFunction(() => window.__bb.artInfo.pending === 0, null, { timeout: 60_000 });
    return page.evaluate(() => { const b = window.__bb; b.drawNow(); b.resetArtUse(); b.drawNow(); return b.artUse; });
  };
  for (const w of WORLDS.filter(w => w !== "winter")) {
    const use = await draw(w, 3);
    expect(use[`house_${w}_kids`], `${w}: the kids' house of the world`).toBeGreaterThanOrEqual(1);
    expect(use[`house_${w}_dad`], `${w}: Dad's house of the world`).toBeGreaterThanOrEqual(1);
  }
  const use = await draw("winter", 4);
  expect(use.house_kids, "no house_winter_kids: today's kids' house").toBeGreaterThanOrEqual(1);
  expect(use.house_messy, "no house_winter_dad: today's Dad's house").toBeGreaterThanOrEqual(1);
  expect(use.house_winter_kids).toBeUndefined();
  expect(errors.filter(e => !/house_winter|Failed to load resource|net::ERR/.test(e))).toEqual([]);
});
