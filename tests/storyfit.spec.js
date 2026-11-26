// SPEC-031 AC 4: the story and comic text fits every screen. The font of the story text, the scene captions and Dad's
// bubbles (SPEC-032: letters only, their own floor BUBBLE_MIN) scales with the phone screen (never below CFG.STORY_TEXT_MIN CSS px), the caption never covers the picture and
// nothing is cut — in every language, on every Story chapter (open and locked) and every scene page.
// Speed: one rendered page per kind (phone / desktop), resized to each size; every case of a size is drawn synchronously
// inside one evaluate (__bb.drawNow) and checked there; one expect per test.
const base = require("./pw");   // @playwright/test + failure screenshots
const { expect } = base;
const { LANGS, openGame, frames } = require("./helpers");
const { overflowKeys } = require("./bubble-overflow");   // SPEC-032 AC 11: the bubbles allowed to overflow at BUBBLE_MIN, listed
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
  const bubbleFloor = phone ? b.CFG.BUBBLE_MIN.phone / s : b.CFG.BUBBLE_MIN.desk;   // SPEC-032 AC 10 (UI px)
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
    for (const q of bubbles) {   // SPEC-032 (review fix): no bubble is left empty — every one writes its line
      if (q.skipped || !(q.rows >= 1) || !(q.w > 0)) { fail(at, `bubble "${q.text}" left empty`); continue; }
      if (q.rows > 3) fail(at, `bubble "${q.text}" in ${q.rows} rows`);
      if (!inside(q, q.panel)) fail(at, `the words of "${q.text}" leave their panel`);
      if (!inside(q, pic)) fail(at, `the words of "${q.text}" leave the picture`);   // AC 3: bubbles stay inside the picture
      if (!inside(q.panel, pic)) fail(at, `panel of "${q.text}" outside the picture`);
      // SPEC-032 AC 10: the bubbles' own floor (BUBBLE_MIN), smaller than the caption's
      if (!(q.size >= bubbleFloor - 0.01)) fail(at, `bubble "${q.text}" ${(q.size * s).toFixed(2)} CSS px below BUBBLE_MIN`);
      if (ov(q, t)) fail(at, `bubble "${q.text}" on the text`);
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
    for (const id of [...b.SCENE_IDS, "tutorial_intro", "tutorial_a", "tutorial_b", "tutorial_c", "tutorial_ready"]) {
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

// ---------- SPEC-032 AC 9–12: Dad's words are written only inside the drawn bubble — no own bubble, smaller letters ----------
// For every size of the SPEC-031 matrix, every language, the intro scene and the Story's "How it began" page (runs in the page):
// the text box lies inside its measured bubble box; ≥ 95 % of the picture's pixels under the text box are near-white (the drawn
// bubble); a frame drawn without the letters (__bb.bubbleTextOff) differs from the real one only inside the text boxes (nothing
// else is painted over the art); the size is ≤ bubbleScale × the old size and ≥ BUBBLE_MIN; at most bubbleLines rows.
// No bubble is ever empty (review fix): a line that does not fit even at BUBBLE_MIN is written at BUBBLE_MIN, centred on the bubble —
// only when its case is in the list of tests/bubble-overflow.js (ok: { case: ["lang|i"] }); then only the "inside the bubble" and
// "white under it" checks are waived.
async function bubbleCases([langs, ok]) {
  const b = window.__bb, ui = b.uiSize, S = b.CFG.MENU_LOOK.scene, phone = b.phone, out = { fails: [], over: [], checked: 0 };
  const fail = (at, what) => { if (out.fails.length < 60) out.fails.push(`${at}: ${what}`); };
  const min = phone ? b.CFG.BUBBLE_MIN.phone / ui.scale : b.CFG.BUBBLE_MIN.desk;   // UI px
  const canvas = document.getElementById("game"), g = canvas.getContext("2d"), k = canvas.width / ui.w;
  const img = b.art("story_start"), src = document.createElement("canvas");
  src.width = img.naturalWidth; src.height = img.naturalHeight;
  const sg = src.getContext("2d");
  sg.drawImage(img, 0, 0);
  const srcPx = sg.getImageData(0, 0, src.width, src.height).data;
  const frame = () => g.getImageData(0, 0, canvas.width, canvas.height).data;
  // what to draw for each case, and where its bubbles are reported
  const cases = [["story began", () => { b.openStory("began", "home"); }, () => b.storyInfo.bubbles]];
  for (let p = 0; p < 4; p++) cases.push([`intro page ${p + 1}`, () => { b.openScene("intro", null, { mark: false }); for (let j = 0; j < p; j++) b.sceneNext(); }, () => (b.sceneInfo.bubble ? [b.sceneInfo.bubble] : [])]);
  for (const lang of langs) {
    b.setLang(lang); b.CFG.TEXT_TEST_SCALE = 1; b.setProgress(null);
    for (const [name, open, get] of cases) {
      const at = `${lang} ${name}`;
      b.resetMenus(); open();
      b.drawNow();                                   // a first frame of the screen (caches, picture decoding), then the two compared frames
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      b.resetMenus(); open(); b.drawNow();
      // without the letters and with them, twice each: a pixel counts only where both pairs agree (the first frames of a new screen
      // can still differ by a few pixels from the next ones — a glyph or a cached panel — whatever the bubbles do)
      const shot = off => { b.bubbleTextOff = off; b.drawNow(); return frame(); };
      const off = shot(true), on = shot(false), off2 = shot(true), on2 = shot(false), bubbles = get(), old = phone ? b.CFG.MENU_LOOK.scene.phoneText : S.text;
      if (!bubbles.length) { fail(at, "no bubble"); continue; }
      for (const q of bubbles) {
        out.checked++;
        const t = `"${q.text}"`;
        if (q.skipped || !(q.rows >= 1) || !(q.w > 0) || !(q.h > 0)) { fail(at, `${t} left empty`); continue; }
        if (!(q.size >= min - 0.01)) fail(at, `${t} ${q.size} below BUBBLE_MIN`);
        if (q.rows > S.bubbleLines) fail(at, `${t} ${q.rows} rows`);
        const P = q.panel;
        if (!(q.x >= P.x - 0.5 && q.y >= P.y - 0.5 && q.x + q.w <= P.x + P.w + 0.5 && q.y + q.h <= P.y + P.h + 0.5)) fail(at, `${t} leaves its panel`);
        if (!q.fit) {
          if (!(ok[name] || []).includes(`${lang}|${q.i}`)) { fail(at, `${t} does not fit its bubble at BUBBLE_MIN and is not in tests/bubble-overflow.js`); continue; }
          out.over.push(`${at} #${q.i}: ${t}`);
          if (q.size > min + 0.01) fail(at, `${t} overflows above BUBBLE_MIN (${q.size})`);
          // centred on its bubble — or moved only as far as its panel's edge needs (then it touches that edge)
          const centred = (c, bc, lo, len, half) => Math.abs(c - bc) <= 0.5 || Math.abs(c - half - lo) <= 0.5 || Math.abs(c + half - lo - len) <= 0.5;
          if (!centred(q.x + q.w / 2, q.box.x + q.box.w / 2, P.x, P.w, q.w / 2) || !centred(q.y + q.h / 2, q.box.y + q.box.h / 2, P.y, P.h, q.h / 2)) fail(at, `${t} not centred on its bubble`);
          continue;   // listed: written at the minimum over the bubble's edge — the in-bubble and white checks are waived
        }
        if (!(q.x >= q.box.x - 0.5 && q.y >= q.box.y - 0.5 && q.x + q.w <= q.box.x + q.box.w + 0.5 && q.y + q.h <= q.box.y + q.box.h + 0.5)) fail(at, `${t} text box ${JSON.stringify([q.x, q.y, q.w, q.h].map(Math.round))} leaves its bubble ${JSON.stringify([q.box.x, q.box.y, q.box.w, q.box.h].map(Math.round))}`);
        // the old size was the caption's (× the screen scale on a phone): never more than bubbleScale of it
        const oldMax = phone ? b.storyPx(old) : old;
        if (q.size > oldMax * S.bubbleScale + 0.01) fail(at, `${t} ${q.size} > ${S.bubbleScale} × ${oldMax}`);
        // the picture under the text box: near-white
        const I = q.img, cr = q.crop, sw = img.naturalWidth * cr[2], sh = img.naturalHeight * cr[3];
        let white = 0, all = 0;
        for (let y = Math.ceil(q.y); y < q.y + q.h; y++) for (let x = Math.ceil(q.x); x < q.x + q.w; x++) {
          const u = Math.floor(img.naturalWidth * cr[0] + (x - I.x) / I.w * sw), v = Math.floor(img.naturalHeight * cr[1] + (y - I.y) / I.h * sh), j = (v * src.width + u) * 4;
          all++;
          if (Math.min(srcPx[j], srcPx[j + 1], srcPx[j + 2]) >= 215) white++;
        }
        if (!(all > 0 && white / all >= 0.95)) fail(at, `${t}: ${(100 * white / all).toFixed(1)} % of the picture under the text is white`);
      }
      // nothing but the letters changes: every changed pixel lies in a text box (2 px of anti-aliasing around it, or 0.3 of the
      // font size when that is more: an accent over a capital — "É", "Ó" — rises above the line box; CI run 45741208870)
      const boxes = bubbles.map(q => { const m = Math.max(2, 0.3 * q.size); return [(q.x - m) * k, (q.y - m) * k, (q.x + q.w + m) * k, (q.y + q.h + m) * k]; });
      let stray = 0, changed = 0, sx0 = Infinity, sy0 = Infinity, sx1 = -1, sy1 = -1;
      for (let i = 0; i < on.length; i += 4) {
        const same = (a, c) => a[i] === c[i] && a[i + 1] === c[i + 1] && a[i + 2] === c[i + 2] && a[i + 3] === c[i + 3];
        if (same(on, off) || same(on2, off2) || !same(on, on2) || !same(off, off2)) continue;
        changed++;
        const p = i / 4, x = p % canvas.width, y = Math.floor(p / canvas.width);
        if (!boxes.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) { stray++; sx0 = Math.min(sx0, x); sy0 = Math.min(sy0, y); sx1 = Math.max(sx1, x); sy1 = Math.max(sy1, y); }
      }
      if (!changed) fail(at, "the letters drew nothing");
      if (stray) fail(at, `${stray} pixels outside the text boxes were changed by the bubbles (canvas px ${[sx0, sy0, sx1, sy1]}; text boxes ${JSON.stringify(boxes.map(r => r.map(Math.round)))}; canvas ${canvas.width}×${canvas.height})`);
    }
  }
  b.setLang("en"); b.resetMenus();
  return out;
}
const okFor = sz => ({ "story began": overflowKeys("story began", sz.join("×")) });
test("SPEC-032: Dad's words only inside the drawn bubble, smaller — every phone size and language", async ({ browser }) => {
  test.slow();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const fails = [], over = [];
  let errors, checked = 0;
  try {
    const page = await ctx.newPage();
    errors = await openGame(page, { query: "?phone=1" });
    await page.waitForFunction(() => window.__bb.artInfo.done);
    for (const sz of PHONE_SIZES) {
      await resize(page, sz);
      const r = await page.evaluate(bubbleCases, [LANGS, okFor(sz)]);
      fails.push(...r.fails.map(f => `${sz.join("×")} ${f}`)); over.push(...r.over.map(f => `${sz.join("×")} ${f}`)); checked += r.checked;
      if (sz[0] === 667) await page.screenshot({ path: test.info().outputPath("bubbles-story-667x375.png") });
    }
  } finally { await ctx.close(); }
  expect(checked).toBe(PHONE_SIZES.length * LANGS.length * 8);
  expect(fails, fails.slice(0, 25).join("\n")).toEqual([]);
  console.log("[SPEC-032 AC 11] listed bubbles written at BUBBLE_MIN over their edge here:", JSON.stringify(over));
  expect(errors).toEqual([]);
});
test("SPEC-032: Dad's words only inside the drawn bubble, smaller — every desktop window and language", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done);
  const fails = [], over = [];
  for (const sz of DESK_SIZES) {
    await resize(page, sz);
    const r = await page.evaluate(bubbleCases, [LANGS, okFor(sz)]);
    fails.push(...r.fails.map(f => `${sz.join("×")} ${f}`)); over.push(...r.over.map(f => `${sz.join("×")} ${f}`));
  }
  expect(fails, fails.slice(0, 25).join("\n")).toEqual([]);
  console.log("[SPEC-032 AC 11] listed bubbles written at BUBBLE_MIN over their edge here:", JSON.stringify(over));
  expect(errors).toEqual([]);
});
