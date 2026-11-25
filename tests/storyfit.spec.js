// SPEC-031 AC 4: the story and comic text fits every screen. The font of the story text, the scene captions and Dad's
// bubbles scales with the phone screen (never below CFG.STORY_TEXT_MIN CSS px), the caption never covers the picture and
// nothing is cut — in every language, on every Story chapter (open and locked) and every scene page.
// Speed: one rendered page per kind (phone / desktop), resized to each size; every case of a size is drawn synchronously
// inside one evaluate (__bb.drawNow) and checked there; one expect per test.
const base = require("./pw");   // @playwright/test + failure screenshots
const { expect } = base;
const { LANGS, openGame, frames } = require("./helpers");
const test = base.test;

const PHONE_SIZES = [[568, 320], [640, 360], [667, 375], [740, 360], [844, 390], [932, 430]];
const DESK_SIZES = [[960, 540], [1280, 720], [1920, 1080]];
// ×1.15: like CI's wider Linux fonts (CFG.TEXT_TEST_SCALE); STORYFIT_SCALES=1.3 for a one-off check with more margin
const SCALES = (process.env.STORYFIT_SCALES || "1,1.15").split(",").map(Number);
const DESK_MIN = 14;   // desktop floor of the story text, captions and bubbles (logical px, unchanged by SPEC-031)

// runs in the page: every Story chapter (fresh save — most chapters locked; a save with every world won — all open) and every
// scene page, in every language and font scale → { fails, sizes: { case: caption size in CSS px } }
function storyFitCases([langs, scales, deskMin]) {
  const b = window.__bb, ui = b.uiSize, s = ui.scale, phone = b.phone, out = { fails: [], sizes: {} };
  const floor = phone ? b.CFG.STORY_TEXT_MIN / s : deskMin;   // UI px
  const ov = (a, c) => a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5;
  const inside = (a, c) => a.x >= c.x - 0.5 && a.y >= c.y - 0.5 && a.x + a.w <= c.x + c.w + 0.5 && a.y + a.h <= c.y + c.h + 0.5;
  const screen = { x: 0, y: 0, w: ui.w, h: ui.h };
  const won = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
  const setSave = open => { b.setProgress(null); if (open) for (const w of b.MAIN_WORLDS) Object.assign(b.progress.worlds[w], { unlocked: 20, won: won() }); };
  const fail = (at, what) => { if (out.fails.length < 60) out.fails.push(`${at}: ${what}`); };
  function check(at, key, info, textId, text, bubbles) {
    if (!info) return fail(at, "nothing drawn");
    const hud = b.hudRects, t = hud.find(h => h.id === textId), pic = info.picBox;
    if (!t) return fail(at, `no ${textId}`);
    if (!pic) return fail(at, "no picture box");
    if (!t.rows || t.rows.join(" ") !== text) fail(at, `text cut: ${JSON.stringify(t.rows)}`);
    if (info.fit !== true) fail(at, "the text does not fit its box");
    if (!(t.size >= floor - 0.01)) fail(at, `text ${(t.size * s).toFixed(2)} CSS px below the floor`);
    if (!inside(t, screen)) fail(at, `text outside the screen ${JSON.stringify(t)}`);
    for (const h of hud) if (h.text && !/^story:(dots|soon)$/.test(h.id) && ov(h, pic)) fail(at, `${h.id} on the picture ${JSON.stringify(h)} / ${JSON.stringify(pic)}`);
    for (const q of b.buttonRects) if (ov(t, q)) fail(at, `text on button ${q.id}`);
    for (const q of bubbles) {
      const r = q.own ? q.bubble : q;
      if (!inside(r, q.panel)) fail(at, `bubble "${q.text}" leaves its panel`);   // AC 6: the bigger fallback bubble stays in its panel
      if (!inside(q, pic)) fail(at, `the words of "${q.text}" leave the picture`);   // AC 3: bubbles stay inside the picture
      if (!inside(q.panel, pic)) fail(at, `panel of "${q.text}" outside the picture`);
      if (!(q.size >= floor - 0.01)) fail(at, `bubble "${q.text}" ${(q.size * s).toFixed(2)} CSS px below the floor`);
      if (ov(r, t)) fail(at, `bubble "${q.text}" on the text`);
    }
    if (phone && !(b.textSizes.story >= floor - 0.01)) fail(at, `story text sizes not recorded (${b.textSizes.story})`);
    out.sizes[key] = t.size * s;
  }
  for (const lang of langs) for (const sc of scales) {
    b.setLang(lang); b.CFG.TEXT_TEST_SCALE = sc;
    for (const open of [false, true]) {
      setSave(open);
      for (const c of b.STORY) {
        b.resetMenus(); b.openStory(c.id, "home"); b.drawNow();
        const info = b.storyInfo, at = `${lang} ×${sc} Story ${c.id} ${open ? "open" : "fresh"}`;
        check(at, `${lang} ${sc} story ${c.id} ${open}`, info, info && info.locked ? "story:locked" : "story:text", info && info.text, (info && info.bubbles) || []);
      }
    }
    setSave(false);
    for (const id of [...b.SCENE_IDS, "tutorial_a", "tutorial_b", "tutorial_c", "tutorial_ready"]) {
      const n = b.scenePages(id).length;
      for (let p = 0; p < n; p++) {
        b.resetMenus(); b.openScene(id, null, { mark: false });
        for (let j = 0; j < p; j++) b.sceneNext();
        b.drawNow();
        const info = b.sceneInfo, at = `${lang} ×${sc} scene ${id} page ${p + 1}`;
        if (info && info.art === "thanks") continue;
        check(at, `${lang} ${sc} scene ${id} ${p}`, info, "scene:caption", info && info.caption, info && info.bubble ? [info.bubble] : []);
      }
    }
  }
  b.CFG.TEXT_TEST_SCALE = 1; b.setProgress(null); b.setLang("en"); b.resetMenus();
  return out;
}

async function resize(page, [w, h]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction(([vw, vh]) => window.innerWidth === vw && window.innerHeight === vh, [w, h]);
  await frames(page);
}

test("SPEC-031: story and comic text fits every phone size, scales with the screen, never covers the picture", async ({ browser }) => {
  test.slow();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = await openGame(page, { query: "?phone=1" });
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const fails = [], sizes = {};
  for (const sz of PHONE_SIZES) {
    await resize(page, sz);
    const ui = await page.evaluate(() => window.__bb.uiSize);
    if (ui.cssW !== sz[0] || ui.cssH !== sz[1]) fails.push(`${sz.join("×")}: the game is ${ui.cssW}×${ui.cssH}`);
    const r = await page.evaluate(storyFitCases, [LANGS, SCALES, DESK_MIN]);
    fails.push(...r.fails.map(f => `${sz.join("×")} ${f}`));
    sizes[sz.join("×")] = r.sizes;
  }
  // the smaller the phone, the smaller the text: every case at 568×320 is smaller than at 932×430
  const small = sizes["568×320"], big = sizes["932×430"];
  for (const k of Object.keys(big)) if (!(small[k] < big[k])) fails.push(`${k}: ${small[k] && small[k].toFixed(2)} CSS px at 568×320, ${big[k].toFixed(2)} at 932×430`);
  await ctx.close();
  expect(fails, fails.slice(0, 25).join("\n")).toEqual([]);
  expect(errors).toEqual([]);
});

test("SPEC-031: story and comic text fits every desktop window, never covers the picture", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const fails = [];
  for (const sz of DESK_SIZES) {
    await resize(page, sz);
    const r = await page.evaluate(storyFitCases, [LANGS, SCALES, DESK_MIN]);
    fails.push(...r.fails.map(f => `${sz.join("×")} ${f}`));
  }
  expect(fails, fails.slice(0, 25).join("\n")).toEqual([]);
  expect(errors).toEqual([]);
});
