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

// ---------- AC 2: the kids' door heart is seen; Dad's mess is seen from above ----------
const sharp = require("sharp");
// every Little One and the Big One away from both houses: the roofs are solid
const clearHouses = page => page.evaluate(() => {
  const b = window.__bb;
  b.mode = "play";
  b.littles.forEach((l, i) => { l.x = 15 * 32 + i * 40; l.y = 10 * 32; });
  Object.assign(b.big, { x: 20 * 32, y: 12 * 32, state: "look", timer: 9999 });
});
const solidRoofs = page => page.waitForFunction(() => { const h = window.__bb.look3D("houses").houses; return h.kid.alpha > 0.95 && h.big.alpha > 0.95; }, null, { timeout: 20_000 });

test("AC 2: the heart on the door of the kids' house shows in the picture of every world (pixels), and Dad's roof carries his mess", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openGame(page);
  const heartPixel = (r, g, b) => r > 150 && r > g + 50 && b > g + 15;      // the door pink (#ff7eb3, lit or in the toon shade)
  const problems = [];
  for (const w of WORLDS) {
    await play(page, w, 1);
    await clearHouses(page); await solidRoofs(page); await frames(page); await frames(page);
    const h = await page.evaluate(() => window.__bb.look3D("houses").houses);
    const pts = await page.evaluate(list => {
      const b = window.__bb, r = document.getElementById("game").getBoundingClientRect(), u = b.uiSize;
      return list.map(p => { const s = b.toScreen(p.x * 32, p.z * 32, p.y * 32); return { x: r.left + s.x * r.width / u.w, y: r.top + s.y * r.height / u.h }; });
    }, h.kid.heartPts);
    await page.evaluate(() => { document.getElementById("game").style.visibility = "hidden"; });   // only the 3D world (no HUD over it)
    const png = await page.screenshot();
    await page.evaluate(() => { document.getElementById("game").style.visibility = ""; });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const seen = pts.map(p => {
      let n = 0;
      for (let y = Math.max(0, Math.round(p.y) - 7); y < Math.min(info.height, Math.round(p.y) + 8); y++) for (let x = Math.max(0, Math.round(p.x) - 7); x < Math.min(info.width, Math.round(p.x) + 8); x++) {
        const i = (y * info.width + x) * info.channels;
        if (heartPixel(data[i], data[i + 1], data[i + 2])) n++;
      }
      return n;
    });
    if (!(Math.max(0, ...seen) >= 6)) problems.push(`${w} (${h.kid.build}): door heart pixels ${seen.join(",")}`);
    const m = h.big.roofMess;
    if (!(m && m.sock && m.trash >= 3 && m.stink >= 2)) problems.push(`${w}: Dad's roof mess ${JSON.stringify(m)}`);
  }
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

// ---------- AC 3: draw calls per house ----------
// The busiest level of each world on the phone view (tests/perf.spec.js BUSIEST), roofs solid, everyone away: the houses' own draw calls (colour + shadow)
// are the scene's calls minus those of a scene without houses (HOUSE_LOOK.style "none"); the world's pair must cost at most 1.3 × today's (style "classic").
test("AC 3: a world's pair of houses draws at most 30% more calls than today's pair (phone view, the busiest levels)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 667, height: 375 });
  const errors = await openGame(page, { query: "?phone=1" });
  const BUSIEST = { park: 3, field: 3, city: 3, school: 3, beach: 3, winter: 2 };
  const calls = async (w, style) => {
    // another level first: the same level is not rebuilt, and the style is read when the map is built
    await page.evaluate(([w, st, lv]) => { const b = window.__bb; b.CFG.HOUSE_LOOK.style = st; b.mode = "map"; b.world = w; b.level = lv === 1 ? 2 : 1; b.seedRandom(5); b.startGame(1); }, [w, style, BUSIEST[w]]);
    await play(page, w, BUSIEST[w]);
    await clearHouses(page);
    if (style !== "none") await solidRoofs(page);
    await frames(page); await frames(page); await frames(page);
    return page.evaluate(() => window.__bb.perf().draw.calls);
  };
  const out = {}, over = [];
  try {
    for (const w of WORLDS) {
      const none = await calls(w, "none"), classic = await calls(w, "classic"), world = await calls(w, "world");
      out[w] = { none, classic, world, houses: world - none, today: classic - none };
      if (world - none > 1.3 * (classic - none)) over.push(`${w}: ${world - none} calls for the houses, today's pair ${classic - none}`);
      if (world > 300) over.push(`${w}: ${world} calls in all (SPEC-040: 300 on the phone)`);
    }
  } finally {
    await page.evaluate(() => { window.__bb.CFG.HOUSE_LOOK.style = "world"; });
  }
  console.log("[houses] draw calls " + JSON.stringify(out));
  expect(over).toEqual([]);
  expect(errors).toEqual([]);
});
