// SPEC-042 AC 11–13: the "New here!" card of a world — shown the first time its level 1 card opens (a new save field progress.seen.trick_<world>), again
// from the ? button, four languages that fit every screen size, the tip pictures (sheets 40 / 41) and the fallback without them.
const { test, expect } = require("./pw");
const { openGame, frames, storedSave } = require("./helpers");

const WORLDS = ["park", "field", "city", "school", "beach", "winter"];
const LANGS = ["en", "es", "pt", "ru"];
// every world open (the bonus worlds need every main level won)
const openAll = `const b = window.__bb; for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])) });`;
const showCard = async (page, world, n = 1) => {
  await page.evaluate(([w, k]) => { const b = window.__bb; b.world = w; b.mode = "map"; b.showCard(k); }, [world, n]);
  await frames(page);
  return page.evaluate(() => ({ ...window.__bb.tipCard, mode: window.__bb.mode }));
};

test("the card shows once per world — on level 1 only — and again from the ? button; it is saved as progress.seen.trick_<world>", async ({ page }) => {
  const errors = await openGame(page, { tips: true });
  await page.evaluate(openAll);
  expect(await page.evaluate(() => window.__bb.progress.seen.trick_park), "a new save field, false at the start").toBe(false);
  for (const w of WORLDS) {
    expect((await showCard(page, w, 2)).open, `${w}: level 2 first: no card`).toBeNull();
    const a = await showCard(page, w, 1);
    expect([a.open, a.mode], `${w}: level 1 shows it`).toEqual([w, "levelCard"]);
    expect(a.info.title.length).toBeGreaterThan(5);
    expect(await page.evaluate(k => window.__bb.progress.seen["trick_" + k], w), `${w}: seen`).toBe(true);
    await page.evaluate(() => window.__bb.tapButton("tip:ok"));
    await frames(page);
    expect((await page.evaluate(() => window.__bb.tipCard)).open, `${w}: OK closes it`).toBeNull();
    expect((await showCard(page, w, 1)).open, `${w}: the second time it does not come by itself`).toBeNull();
    await page.evaluate(() => window.__bb.tapButton("card:tip"));
    await frames(page);
    expect((await page.evaluate(() => window.__bb.tipCard)).open, `${w}: the ? button shows it again`).toBe(w);
    await page.evaluate(() => window.__bb.goBack());   // Back / Escape closes it, the level card is behind
    await frames(page);
    const b = await page.evaluate(() => ({ open: window.__bb.tipCard.open, mode: window.__bb.mode }));
    expect(b, `${w}: Back closes the card, not the level card`).toEqual({ open: null, mode: "levelCard" });
  }
  // saved: the stored save has the fields
  const save = await storedSave(page);
  for (const w of WORLDS) expect(save.progress.seen["trick_" + w], `stored ${w}`).toBe(true);
  expect(errors).toEqual([]);
});

test("an old save with no seen.trick_* fields loads and shows the card; a newer save's unknown seen keys survive", async ({ page }) => {
  const errors = await openGame(page, { tips: true });
  const r = await page.evaluate(() => {
    const b = window.__bb, old = JSON.parse(JSON.stringify(b.progress));
    for (const k of Object.keys(old.seen)) if (k.startsWith("trick_")) delete old.seen[k];
    old.seen.tutorial = true;
    return b.loadProgress(old).seen;
  });
  for (const w of WORLDS) expect(r["trick_" + w], `${w} loads as false`).toBe(false);
  expect(r.tutorial).toBe(true);
  await page.evaluate(() => { const b = window.__bb; b.setProgress(b.loadProgress({ worlds: { park: { unlocked: 3, stars: {}, won: { 1: true } } }, seen: { tutorial: true } })); });
  expect((await showCard(page, "park", 1)).open, "an old save sees it once").toBe("park");
  // a newer save's unknown seen keys survive (fields are only added)
  const keep = await page.evaluate(() => window.__bb.loadProgress({ seen: { trick_park: true, trick_future: true, boss_moon: true } }).seen);
  expect(keep.trick_park).toBe(true);
  expect(errors).toEqual([]);
});

test("the tip picture is a panel of the tip sheet; without the art it is the world's map preview with the trick's icon", async ({ page }) => {
  await page.route("**/assets/tips_*.webp", route => route.abort());
  const errors = await openGame(page, { tips: true });
  await page.evaluate(openAll);
  for (const w of WORLDS) {
    const t = await showCard(page, w, 1);
    expect(t.info.fallback, `${w}: no tip art → the map preview`).toBe(true);
    expect(t.info.picture.w).toBeGreaterThan(100);
    await page.evaluate(() => window.__bb.closeTip());
  }
  expect(errors.filter(e => !/tips_|Failed to load resource|ERR_FAILED/.test(e)), "(the blocked sheets are the only noise)").toEqual([]);
});
test("with the tip art the card draws the panel (not the preview) for every world", async ({ page }) => {
  const errors = await openGame(page, { tips: true });
  await page.evaluate(openAll);
  for (const w of WORLDS) {
    await showCard(page, w, 1);
    await page.waitForFunction(() => window.__bb.artInfo.pending === 0, null, { timeout: 15000 });
    await frames(page);
    const t = await page.evaluate(() => window.__bb.tipCard);
    expect(t.info.fallback, `${w}: the panel`).toBe(false);
    await page.evaluate(() => window.__bb.closeTip());
  }
  expect(errors).toEqual([]);
});

// the card fits: the picture, the two lines with their icons, the title and the buttons are inside the card and the screen, none on another;
// the text does not overflow; on a phone the smallest text is at least the floor. All six worlds in four languages at the tests' font scales.
const overlaps = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
async function fitProblems(page, phone, scales) {
  const fails = [];
  await page.evaluate(openAll);
  for (const lang of LANGS) for (const scale of scales) for (const w of WORLDS) {
    const at = `${lang} ×${scale} ${w}`;
    const d = await page.evaluate(([l, s, k]) => {
      const b = window.__bb; b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.world = k; b.mode = "map"; b.showCard(1); b.openTip(); b.drawNow();
      return { ui: b.uiSize, hud: b.hudRects.filter(h => h.id.startsWith("tip:")), buttons: b.buttonRects, rect: b.tipCard.info && b.tipCard.info.rect, over: b.textOverflows, texts: b.textSizes, min: b.textFloors };
    }, [lang, scale, w]);
    if (!d.rect) { fails.push(`${at}: no card`); continue; }
    const parts = [...d.hud, ...d.buttons.filter(q => q.id.startsWith("tip:"))];
    for (const h of parts) {
      if (h.x < -0.01 || h.y < -0.01 || h.x + h.w > d.ui.w + 0.01 || h.y + h.h > d.ui.h + 0.01) fails.push(`${at}: ${h.id} leaves the screen`);
      if (h.x < d.rect.x - 0.01 || h.x + h.w > d.rect.x + d.rect.w + 0.01 || h.y < d.rect.y - 0.01 || h.y + h.h > d.rect.y + d.rect.h + 0.01) fails.push(`${at}: ${h.id} leaves the card`);
    }
    parts.forEach((a, i) => parts.slice(i + 1).forEach(b => { if (overlaps(a, b)) fails.push(`${at}: ${a.id} on ${b.id}`); }));
    const ids = d.hud.map(h => h.id);
    for (const id of ["tip:title", "tip:picture", "tip:trick", "tip:item"]) if (!ids.includes(id)) fails.push(`${at}: no ${id}`);
    if (d.over.length) fails.push(`${at}: text overflows ${JSON.stringify(d.over)}`);
    const pic = d.hud.find(h => h.id === "tip:picture");
    if (pic && pic.w < d.ui.w * 0.14) fails.push(`${at}: the picture is small (${pic.w} of ${d.ui.w})`);
    if (phone) for (const cat of ["main", "hint"]) if (d.texts[cat] && !(d.texts[cat] * d.ui.scale >= d.min[cat] - 0.01)) fails.push(`${at}: smallest ${cat} text ${d.texts[cat] * d.ui.scale}`);
  }
  await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.setLang("en"); b.closeTip(); b.mode = "home"; });
  return fails;
}
for (const [label, vp, query, phone, scales] of [
  ["desktop 960×640", { width: 960, height: 640 }, "", false, [1, 1.15, 1.3]],
  ["desktop 1280×720", { width: 1280, height: 720 }, "", false, [1, 1.15, 1.3]],
  ["phone 667×375", { width: 667, height: 375 }, "?phone=1", true, [1, 1.15]],
  ["phone 568×320", { width: 568, height: 320 }, "?phone=1", true, [1, 1.15]]
]) {
  test.describe(label, () => {
    test.use({ viewport: vp, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
    test(`the New here! card fits in every language and world (${label}, fonts ${scales.join(" / ")})`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = await openGame(page, { tips: true, query });
      await page.waitForFunction(() => window.__bb.artInfo.pending === 0, null, { timeout: 15000 }).catch(() => {});
      const fails = await fitProblems(page, phone, scales);
      expect(fails, fails.slice(0, 10).join("\n")).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test("the level card gets a ? button next to the story button; Play still fits", async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => { const b = window.__bb; b.world = "school"; b.mode = "map"; b.showCard(1); b.drawNow(); return b.buttonRects.map(q => q.id); });
  expect(r).toEqual(expect.arrayContaining(["card:story", "card:tip", "card:1", "card:2", "card:close"]));
  expect(errors).toEqual([]);
});
