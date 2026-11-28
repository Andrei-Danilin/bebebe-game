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
    const L = await page.evaluate(() => window.__bb.look3D("houses")), h = L.houses;
    expect([h.kid.build, h.big.build], `${w}: builders (the one that ran, "classic" for a name that is not a builder)`).toEqual(table[w]);
    expect(L.builders.kids.includes(table[w][0]), `${w}: the kids builder is in the table of builders`).toBe(true);
    expect(L.builders.dad.includes(table[w][1]), `${w}: Dad builder is in the table of builders`).toBe(true);
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
  // the card is drawn again and again until the pictures it waits for are there (a sprite loads, or its failure is known: slower on a software renderer, so no fixed number of frames)
  const draw = async (w, lv, shown) => {
    await page.evaluate(([w, lv]) => { const b = window.__bb; b.progress.worlds[w].unlocked = Math.max(b.progress.worlds[w].unlocked || 1, lv); b.world = w; b.mode = "map"; }, [w, lv]);
    await frames(page);
    await page.evaluate(n => { window.__bb.showCard(n); window.__bb.drawNow(); }, lv);
    await page.waitForFunction(() => window.__bb.artInfo.pending === 0, null, { timeout: 60_000 });
    let use = {};
    for (let i = 0; i < 120; i++) {                          // at most ~30 s
      use = await page.evaluate(() => { const b = window.__bb; b.drawNow(); b.resetArtUse(); b.drawNow(); return { ...b.artUse }; });
      if (shown.every(n => use[n] >= 1)) break;
      await page.waitForTimeout(250);
    }
    return use;
  };
  for (const w of WORLDS.filter(w => w !== "winter")) {
    const use = await draw(w, 3, [`house_${w}_kids`, `house_${w}_dad`]);
    expect(use[`house_${w}_kids`], `${w}: the kids' house of the world`).toBeGreaterThanOrEqual(1);
    expect(use[`house_${w}_dad`], `${w}: Dad's house of the world`).toBeGreaterThanOrEqual(1);
  }
  const use = await draw("winter", 4, ["house_kids", "house_messy"]);
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
// the game frozen in the same state (the pause draws the scene as it stands: no bot, no Big One, no particle moves between two variants; the
// positions are set again in the pause, so the frame before it does not matter), then waited for until it has drawn its last frame
const freeze = page => page.evaluate(() => {
  const b = window.__bb;
  b.mode = "pause";
  b.littles.forEach((l, i) => { l.x = 15 * 32 + i * 40; l.y = 10 * 32; });
  Object.assign(b.big, { x: 20 * 32, y: 12 * 32, state: "look", timer: 9999 });
});
const rendersSettled = page => page.evaluate(async () => {
  const b = window.__bb, raf = () => new Promise(r => requestAnimationFrame(r));
  let last = b.sim().renders, quiet = 0;
  for (let i = 0; i < 600 && quiet < 8; i++) { await raf(); const n = b.sim().renders; quiet = n === last ? quiet + 1 : 0; last = n; }
});
const solidRoofs = page => page.waitForFunction(() => { const h = window.__bb.look3D("houses").houses; return (!h.kid || h.kid.alpha > 0.95) && (!h.big || h.big.alpha > 0.95); }, null, { timeout: 20_000 });

test("AC 2: the heart on the door of the kids' house shows in the picture of every world (pixels), and Dad's roof carries his mess", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openGame(page);
  const heartPixel = (r, g, b) => r > 150 && r > g + 50 && b > g + 15;      // the door pink (#ff7eb3, lit or in the toon shade)
  const problems = [];
  for (const w of WORLDS) {
    await play(page, w, 1);
    await clearHouses(page); await freeze(page); await solidRoofs(page); await frames(page); await frames(page);
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
// The busiest level of each world on the desktop view (960×640: the whole map is in view, so no camera or culling decides what is drawn), the game
// frozen in the same state, roofs solid, everyone away. A house's own draw calls (colour + shadow) are the
// scene's calls minus those of a scene without that house (LOOK.HOUSE_STYLE "none"); the world's house must cost at most 1.3 × today's (style "classic"), the
// kids' house and Dad's each on its own.
test("AC 3: each house of a world draws at most 30% more calls than today's house (desktop view, the busiest levels)", async ({ page }) => {
  test.setTimeout(900_000);                               // 30 level builds; about 5 minutes on a software renderer
  const errors = await openGame(page);
  const BUSIEST = { park: 3, field: 3, city: 3, school: 2, beach: 2, winter: 2 };
  const calls = async (w, kids, dad) => {
    // another level first: the same level is not rebuilt, and the style is read when the map is built
    await page.evaluate(([w, k, d, lv]) => { const b = window.__bb; Object.assign(b.CFG.HOUSE_STYLE, { kids: k, dad: d }); b.mode = "map"; b.world = w; b.level = lv === 1 ? 2 : 1; b.seedRandom(5); b.startGame(1); }, [w, kids, dad, BUSIEST[w]]);
    await play(page, w, BUSIEST[w]);
    await clearHouses(page);
    await freeze(page);
    await solidRoofs(page);
    await rendersSettled(page);
    return page.evaluate(() => window.__bb.perf().draw.calls);
  };
  const out = {}, over = [];
  try {
    for (const w of WORLDS) {
      const none = await calls(w, "none", "none"), r = { none };
      for (const [who, mk] of [["kids", s => [s, "none"]], ["dad", s => ["none", s]]]) {
        const classic = (await calls(w, ...mk("classic"))) - none, world = (await calls(w, ...mk("world"))) - none;
        r[who] = { world, today: classic };
        if (world > 1.3 * classic) over.push(`${w} ${who}: ${world} calls, today's house ${classic}`);
      }
      out[w] = r;                                         // (the whole scene's limit is tests/perf.spec.js's)
    }
  } finally {
    await page.evaluate(() => { Object.assign(window.__bb.CFG.HOUSE_STYLE, { kids: "world", dad: "world" }); });
  }
  console.log("[houses] draw calls " + JSON.stringify(out));
  expect(over).toEqual([]);
  expect(errors).toEqual([]);
});

// ---------- the crown of the treehouse and the dome of the igloo stay within the roof's frame ----------
// A roof fades only for someone inside its frame (or the player next to it): so nothing of it may hang over the ground outside — a kid or the Big One at a door
// must not stand under a solid ball of leaves. (1) the roof of every kids' house reaches at most OVER cells past its frame on the sides and the front (behind it
// the roof also fades for someone up to LOOK.HOUSE_LOOK.behind cells away); (2) the Big One and a bot standing out there, the player far away, are seen.
test("the roof of a kids' house does not cover the ground outside it: the Big One and a bot beside it are seen", async ({ page }) => {
  test.setTimeout(240_000);
  const OVER = 0.25;                                      // (the outline hulls count: 0.13 of crown or 0.14 of dome + about 0.07 of ink)
  const errors = await openGame(page);
  const problems = [];
  for (const w of WORLDS) {
    await play(page, w, 1);
    await clearHouses(page); await freeze(page); await solidRoofs(page);
    const L = await page.evaluate(() => window.__bb.look3D("houses")), F = L.houses.kid.frame, box = L.roofBoxes[0];
    const over = { west: F.x - box.x0, east: box.x1 - (F.x + F.w), south: box.z1 - (F.y + F.h) };
    for (const [side, v] of Object.entries(over)) if (v > OVER) problems.push(`${w} (${L.houses.kid.build}): the roof reaches ${v.toFixed(2)} cells past the ${side} side`);
    // beside the frame (east, west, south), middle of the side, 0.25 / 0.5 cells out
    const spots = [];
    for (const out of [0.25, 0.5]) spots.push([F.x - out, F.y + F.h / 2], [F.x + F.w + out, F.y + F.h / 2], [F.x + F.w / 2, F.y + F.h + out], [F.x - out, F.y + F.h * 0.75], [F.x + F.w + out, F.y + F.h * 0.25]);
    for (const [x, z] of spots) {
      if (x < 0.3 || z < 0.3 || x > 29.7 || z > 19.7) continue;                       // outside the map
      const r0 = await page.evaluate(() => window.__bb.sim().renders);
      await page.evaluate(([p]) => {
        const b = window.__bb;
        b.mode = "play";
        Object.assign(b.big, { x: p.x, y: p.y, state: "look", timer: 9999 });
        const l = b.littles[1]; l.x = p.x; l.y = p.y;
        b.mode = "pause";                                   // frozen: the bot stays where it is, the scene still renders
      }, [{ x: x * 32, y: z * 32 }]);
      await page.waitForFunction(n => window.__bb.sim().renders > n, r0, { timeout: 30_000 });   // the frozen scene has been drawn with them where they now stand
      await frames(page);
      const H = await page.evaluate(() => { const b = window.__bb.look3D("houses"); return { big: b.bigHides, kid: b.roofHides[1], alpha: b.houses.kid.alpha }; });
      if (H.big || H.kid) problems.push(`${w}: at ${x.toFixed(2)},${z.toFixed(2)}: Big One hidden ${H.big}, bot hidden ${H.kid} (roof alpha ${H.alpha.toFixed(2)})`);
    }
  }
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});
