// SPEC-043 AC 5: the world items in 3D and in the pops — each item's comic mesh (parts + outlines) lies on the map, the launched ones fly as their own
// meshes and vanish with the shot, Dad's poses under them (the cupcake in his hands), the pops "Bonk! / Yum! / Brrr! / Whee!" in four languages.
// (The rules are in tests/core/world-items.test.mjs.)
const { test, expect } = require("./pw");
const { openGame, frames } = require("./helpers");

const KINDS = ["football", "cupcake", "plane", "watermelon", "snowball"];

test("every world item has a mesh with outlines on the map; the ones you run into hover on a ring, the lying ones do not", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.world = "field"; b.level = 3; b.startGame(1); });
  await frames(page);
  await page.evaluate(kinds => { const b = window.__bb; b.items.length = 0; kinds.forEach((kind, i) => b.items.push({ id: 900 + i, kind, x: 120 + 60 * i, y: 300, t: 0, life: 99 })); }, KINDS);
  await frames(page, 3);
  const r = await page.evaluate(() => window.__bb.worldItemMeshes());
  expect(r.items.map(i => i.kind).sort()).toEqual([...KINDS].sort());
  for (const it of r.items) {
    expect(it.meshes, `${it.kind}: a part and its outline at least`).toBeGreaterThanOrEqual(2);
    const lying = it.kind === "cupcake" || it.kind === "watermelon";
    expect(it.ring, `${it.kind} ring`).toBe(!lying);
  }
  expect(errors).toEqual([]);
});

test("a launched football, plane and snowball are meshes of their own while they fly, and are gone with the shot", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.world = "winter"; b.level = 3; b.startGame(1); });
  await frames(page);
  await page.evaluate(() => { const b = window.__bb; b.shots.length = 0; ["football", "plane", "snowball"].forEach((kind, i) => b.shots.push({ id: 700 + i, kind, x: 200 + 80 * i, y: 300, dx: 1, dy: 0, left: 100, bounces: 0, t: 0.2, by: 0, seen: false })); });
  await frames(page, 2);
  const r = await page.evaluate(() => window.__bb.worldItemMeshes());
  expect(r.shots.map(s => s.kind).sort()).toEqual(["football", "plane", "snowball"]);
  const plane = r.shots.find(s => s.kind === "plane"), ball = r.shots.find(s => s.kind === "football");
  expect(plane.y, "the plane glides high").toBeGreaterThan(0.6);
  expect(ball.y, "the football rolls on the ground").toBeLessThan(0.4);
  expect(r.shots.every(s => s.meshes >= 2)).toBe(true);
  await page.evaluate(() => { window.__bb.shots.length = 0; });
  await frames(page, 2);
  expect((await page.evaluate(() => window.__bb.worldItemMeshes())).shots).toEqual([]);
  expect(errors).toEqual([]);
});

test("Dad eating a cupcake holds it in his hands; the other things that lay him down do not show one", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.world = "city"; b.level = 3; b.startGame(1); });
  await frames(page);
  const held = async (kind, slip = 2) => {
    await page.evaluate(([k, s]) => { const b = window.__bb; b.big.slip = s; b.big.slipKind = k; b.big.stun = 0; }, [kind, slip]);
    await frames(page, 2);
    return page.evaluate(() => window.__bb.worldItemMeshes().held);
  };
  expect(await held("eat")).toBe(true);
  expect(await held("banana")).toBe(false);
  expect(await held("freeze")).toBe(false);
  expect(await held("eat", 0)).toBe(false);
  expect(errors).toEqual([]);
});

test("Bonk, Yum, Brrr and Whee are pop texts in all four languages", async ({ page }) => {
  await openGame(page, { sim: true });
  const t = await page.evaluate(() => Object.fromEntries(["bonk", "yum", "brr", "whee"].map(k => [k, Object.fromEntries(["en", "es", "pt", "ru"].map(l => [l, window.__bb.I18N[l][k]]))])));
  for (const [k, v] of Object.entries(t)) {
    expect(Object.values(v).every(s => typeof s === "string" && s.length > 1), `${k}: ${JSON.stringify(v)}`).toBe(true);
    expect(new Set(Object.values(v)).size, `${k}: not one word for all four`).toBeGreaterThan(1);
  }
});

// ================= step 3: the icons and the texts =================
const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
const ICON = { banana: "item_banana", football: "item_football", cupcake: "icon_cupcake", plane: "item_paperplane", watermelon: "item_watermelon", snowball: "item_snowball" };

test("the New here! card's item icon follows CFG.WORLD_ITEM (the sheet-37 picture), one table for the card and the core", async ({ page }) => {
  const errors = await openGame(page, { tips: true });
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
  const iconDrawn = async (world, name) => {
    await page.evaluate(w => { const b = window.__bb; b.resetArtUse(); b.world = w; b.mode = "map"; b.showCard(1); b.openTip(w); }, world);
    await frames(page);
    await page.evaluate(() => window.__bb.resetArtUse());
    await frames(page);
    return page.evaluate(n => window.__bb.artUse[n] > 0, name);
  };
  for (const w of WORLDS) {
    const kind = await page.evaluate(k => window.__bb.CFG.WORLD_ITEM[k], w);
    expect(await iconDrawn(w, ICON[kind]), `${w}: the ${kind} icon`).toBe(true);
  }
  // change the table: the card follows it
  await page.evaluate(() => { window.__bb.CFG.WORLD_ITEM.field = "snowball"; });
  expect(await iconDrawn("field", "item_snowball"), "field with a snowball: its icon").toBe(true);
  await page.evaluate(() => { window.__bb.CFG.WORLD_ITEM.field = "football"; });
  expect(errors).toEqual([]);
});

test("How to play rule 6 ends with its own surprise in each world, in all four languages", async ({ page }) => {
  await openGame(page, { sim: true });
  const t = await page.evaluate(() => Object.fromEntries(["en", "es", "pt", "ru"].map(l => [l, window.__bb.I18N[l].rules(10)[5]])));
  expect(t.en).toContain("in each world its own surprise");
  expect(t.es).toContain("en cada mundo, su propia sorpresa");
  expect(t.pt).toContain("em cada mundo, uma surpresa");
  expect(t.ru).toContain("в каждом мире — своя неожиданность");
});
