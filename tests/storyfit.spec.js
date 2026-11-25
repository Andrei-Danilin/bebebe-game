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
  function check(at, key, info, textId, text, bubbles, sc) {
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
    for (const h of hud) if (h !== t && ov(t, h)) fail(at, `text on ${h.id}`);   // the title, the chapter dots, …
    for (const q of bubbles) {
      const r = q.own ? q.bubble : q;
      if (!inside(r, q.panel)) fail(at, `bubble "${q.text}" leaves its panel`);   // AC 6: the bigger fallback bubble stays in its panel
      // the words inside their own bubble (2 UI px slack); only at ×1 — at ×1.15 Andrei's "невозможно!!" touches the edge at 568×320 (BACKLOG)
      if (q.own && sc === 1 && !(q.x >= r.x - 2 && q.x + q.w <= r.x + r.w + 2 && q.y >= r.y - 2 && q.y + q.h <= r.y + r.h + 2)) fail(at, `the words of "${q.text}" leave their own bubble`);
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
        check(at, `${lang} ${sc} story ${c.id} ${open}`, info, info && info.locked ? "story:locked" : "story:text", info && info.text, (info && info.bubbles) || [], sc);
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
        if (info && info.art === "thanks") continue;   // the "Thanks for playing!" card: no picture and no caption box
        check(at, `${lang} ${sc} scene ${id} ${p}`, info, "scene:caption", info && info.caption, info && info.bubble ? [info.bubble] : [], sc);
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
  const fails = [], sizes = {};
  let errors;
  try {
    const page = await ctx.newPage();
    errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done);
    for (const sz of PHONE_SIZES) {
      await resize(page, sz);
      const ui = await page.evaluate(() => window.__bb.uiSize);
      if (ui.cssW !== sz[0] || ui.cssH !== sz[1]) fails.push(`${sz.join("×")}: the game is ${ui.cssW}×${ui.cssH}`);
      const r = await page.evaluate(storyFitCases, [LANGS, SCALES, DESK_MIN]);
      fails.push(...r.fails.map(f => `${sz.join("×")} ${f}`));
      sizes[sz.join("×")] = r.sizes;
    }
  } finally { await ctx.close(); }
  // the smaller the phone, the smaller the text: every case at 568×320 is smaller than at 932×430
  const small = sizes["568×320"], big = sizes["932×430"];
  for (const k of Object.keys(big)) if (!(small[k] < big[k])) fails.push(`${k}: ${small[k] && small[k].toFixed(2)} CSS px at 568×320, ${big[k].toFixed(2)} at 932×430`);
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

// ---------- AC 3: the shrink steps — font first, then the picture share down to STORY_PIC.min; desktop scene: more rows ----------
// The real texts fit before the picture has to give way, so the text is made wider with CFG.TEXT_TEST_SCALE (1 → 12) until even the
// smallest picture is not enough (×12: the desktop caption under the picture). Runs in the page → { fails, seen: which steps happened }.
function shareSteps(cases) {
  const b = window.__bb, P = b.CFG.STORY_PIC, S = b.CFG.MENU_LOOK.scene, fails = [], seen = { shrank: 0, unfit: 0, rows: 0 };
  const ov = (a, c) => a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5;
  b.setLang("en"); b.setProgress(null);
  for (const [kind, id] of cases) {
    let first = null, prev = Infinity;
    for (const sc of [...Array.from({ length: 17 }, (_, i) => 1 + i / 4), 6, 8, 10, 12]) {
      b.CFG.TEXT_TEST_SCALE = sc; b.resetMenus();
      if (kind === "story") b.openStory(id, "home"); else b.openScene(id, null, { mark: false });
      b.drawNow();
      const info = kind === "story" ? b.storyInfo : b.sceneInfo, at = `${kind} ${id} ×${sc}`;
      const t = b.hudRects.find(h => h.id === (kind === "story" ? "story:text" : "scene:caption")), text = kind === "story" ? info.text : info.caption;
      const share = info.picShare, below = !b.phone && kind === "scene";   // desktop scene: caption under the picture, share of the height
      const floor = below ? P.minH : P.min;
      if (first === null) first = share;
      // side by side the share only drops (the font is already at its smallest); under the caption the font shrinks first, the picture may grow back
      if (!below && !(share <= prev + 1e-6)) fails.push(`${at}: picture share grew ${prev} → ${share}`);
      if (!(share >= Math.min(first, floor) - 1e-6)) fails.push(`${at}: picture share ${share} below ${floor}`);
      if (ov(t, info.picBox)) fails.push(`${at}: text on the picture`);
      if (t.rows.join(" ") !== text) fails.push(`${at}: text cut`);
      if (share < first - 0.01) seen.shrank++;
      if (below && info.fit && t.rows.length > S.lines) seen.rows++;
      if (!info.fit) {
        seen.unfit++;
        if (Math.abs(share - Math.min(first, floor)) > 1e-6) fails.push(`${at}: does not fit while the picture still has ${share}`);
        if (!b.textOverflows.some(q => q.text === text)) fails.push(`${at}: an unfit text is not in textOverflows`);
      }
      prev = share;
    }
  }
  b.CFG.TEXT_TEST_SCALE = 1; b.resetMenus();
  return { fails, seen };
}

test("SPEC-031: the picture gives way step by step (phone 568×320), never below 40 %, an unfit text is reported", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });
  try {
    const page = await ctx.newPage();
    const errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done);
    const r = await page.evaluate(shareSteps, [["scene", "intro"], ["scene", "tutorial_a"], ["story", "began"], ["story", "park"]]);
    expect(r.fails, r.fails.slice(0, 20).join("\n")).toEqual([]);
    expect(r.seen.shrank, "the picture got narrower").toBeGreaterThan(0);
    expect(r.seen.unfit, "even 40 % was not enough (reported)").toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

test("SPEC-031: desktop — the chapter picture gives way, the scene caption takes more rows, the picture keeps STORY_PIC.minH", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const r = await page.evaluate(shareSteps, [["scene", "intro"], ["scene", "boss_school"], ["story", "began"]]);
  expect(r.fails, r.fails.slice(0, 20).join("\n")).toEqual([]);
  expect(r.seen.shrank, "a picture gave way").toBeGreaterThan(0);
  expect(r.seen.rows, "a caption took more than scene.lines rows and still fit").toBeGreaterThan(0);
  expect(r.seen.unfit, "a caption that does not fit even then is reported").toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
