// SPEC-040 AC 6 / 7 / 8 (RR-43, D-4, D-17): the quality tiers on a rendered page. Every other test pins the high tier (helpers: quality: "high");
// these ask for the tier they check. The numbers and rules (probe thresholds, decor shares, the step-down rule) are in tests/core/quality.test.mjs.
const { test, expect } = require("./pw");
const { openGame, frames, step, reloadGame, storedSave, LANGS } = require("./helpers");

// what the renderer and the scene are doing, read through the modules the game itself imports
const look = page => page.evaluate(async () => {
  const { renderer, sun } = await import("./src/client/three/setup.js");
  const { mapGroup } = await import("./src/client/three/mapstate.js");
  const b = window.__bb;
  let meshes = 0; mapGroup.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.userData.joined) meshes++; });   // the parts the map was made of (batched or not)
  let tris = 0; mapGroup.traverse(o => { if (o.isMesh && !o.userData.batched && o.visible) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  return { pixelRatio: renderer.getPixelRatio(), msaa: renderer.getContext().getContextAttributes().antialias, shadowType: renderer.shadowMap.type, shadowSize: sun.shadow.mapSize.x,
    grain: b.look3D("paper").paper.shown, canvases: document.querySelectorAll("canvas#gl").length, lost: !!document.getElementById("gl-lost"), meshes, tris: Math.round(tris),
    pieces: b.mapPieces().length, quality: b.quality };
});
const PCF = 1, BASIC = 0;   // three.js: PCFShadowMap, BasicShadowMap

test.describe("the tiers on a screen with twice the pixels", () => {
  test.use({ deviceScaleFactor: 2 });
  test("high is today's renderer; medium and low change what D-4 allows and the level goes on", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await openGame(page);                                    // pinned high, as every test
    await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 3; b.startGame(1); window.__g = b.game; window.__t0 = b.stats.time; });
    await frames(page);
    const hi = await look(page);
    expect(hi.quality).toMatchObject({ tier: "high", mode: "high" });
    expect(hi, "high: today's renderer").toMatchObject({ pixelRatio: 2, msaa: true, shadowType: PCF, shadowSize: 2048, grain: true, canvases: 1, lost: false });
    await page.evaluate(() => { window.__bb.setQuality("medium"); });
    await frames(page);
    const med = await look(page);
    expect(med, "medium: DPR cap 1.5, shadow map 1024, MSAA and grain kept").toMatchObject({ pixelRatio: 1.5, msaa: true, shadowType: PCF, shadowSize: 1024, grain: true, canvases: 1 });
    await page.evaluate(() => { window.__bb.setQuality("low"); });
    await frames(page);
    const low = await look(page);
    expect(low, "low: DPR 1, no MSAA (a new renderer), no grain, a basic 1024 shadow map").toMatchObject({ pixelRatio: 1, msaa: false, shadowType: BASIC, shadowSize: 1024, grain: false, canvases: 1, lost: false });
    // the decor outside the fence: 75 % / 50 % (46 pieces: 34 and 23 kept); the play area, the walls and the level are the same
    expect(med.meshes).toBeLessThan(hi.meshes); expect(low.meshes).toBeLessThan(med.meshes);
    expect(low.tris, "fewer triangles").toBeLessThan(hi.tris);
    expect([med.pieces, low.pieces], "the map's pieces (walls, roofs, …) are untouched").toEqual([hi.pieces, hi.pieces]);
    // the level goes on: the same game object, the clock advances, the game is still in play
    await step(page, 1);
    expect(await page.evaluate(() => { const b = window.__bb; return [window.__g === b.game, b.stats.time > window.__t0, b.mode]; })).toEqual([true, true, "play"]);
    // and back to high: everything as it was (the renderer again with MSAA, the decor back)
    await page.evaluate(() => { window.__bb.setQuality("high"); });
    await frames(page);
    const back = await look(page);
    expect(back, "high again").toMatchObject({ pixelRatio: 2, msaa: true, shadowType: PCF, shadowSize: 2048, grain: true, canvases: 1, meshes: hi.meshes });
    expect(errors).toEqual([]);
  });
});

// auto, the probe's answer given (the tests give it: the tier does not depend on the machine): 5 ms → high, 15 → medium, 60 → low; the tier's MSAA is in the renderer
for (const [ms, tier] of [[5, "high"], [15, "medium"], [60, "low"]]) {
  test(`the start probe's ${ms} ms picks the ${tier} tier and the renderer follows`, async ({ page }) => {
    await page.addInitScript(([ms]) => { window.__bbQuality = "auto"; window.__bbProbeMs = ms; }, [ms]);
    const errors = await openGame(page, { quality: null });
    expect(await page.evaluate(() => window.__bb.quality)).toMatchObject({ mode: "auto", tier, probeMs: ms, probeTier: "high", pending: tier !== "high" });
    // review fix: the start makes no second renderer and no second map — the shadow map and the pixel ratio follow at once, the MSAA and the decor wait
    expect(await look(page), "the renderer the page started with, the shadow map of the tier").toMatchObject({ msaa: true, shadowSize: tier === "high" ? 2048 : 1024, canvases: 1, lost: false });
    // the first level build (Play, or the warm-up behind the card) makes them
    await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
    await frames(page);
    expect(await look(page)).toMatchObject({ msaa: tier !== "low", shadowSize: tier === "high" ? 2048 : 1024, canvases: 1, lost: false });
    expect(await page.evaluate(() => window.__bb.quality.pending)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test("the start probe really measures: auto picks the tier of its own milliseconds", async ({ page }) => {
  await openGame(page, { quality: null });                                  // no pin, no saved choice: auto
  const r = await page.evaluate(() => { const b = window.__bb, q = b.quality, P = b.CFG.QUALITY.probe; return { q, want: q.probeMs <= P.highMs ? "high" : q.probeMs <= P.mediumMs ? "medium" : "low" }; });
  expect(r.q.mode).toBe("auto");
  expect(r.q.probeMs, "the probe ran").toBeGreaterThan(0);
  expect(r.q.tier).toBe(r.want);
});

// review fix: a re-pick from the grown-ups page draws its probe at the high tier, whatever tier the game was in (the tests give no probe answer: the real probe runs)
test("auto after a lower tier probes at the high tier", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, { quality: null });
  await page.evaluate(() => { delete window.__bbProbeMs; window.__bb.setQuality("low"); });
  await frames(page);
  expect(await look(page)).toMatchObject({ pixelRatio: 1, msaa: false, canvases: 1 });
  await page.evaluate(() => { window.__bb.setQuality("auto"); });
  await frames(page);
  const q = await page.evaluate(() => { const b = window.__bb, P = b.CFG.QUALITY.probe, q = b.quality; return { q, want: q.probeMs <= P.highMs ? "high" : q.probeMs <= P.mediumMs ? "medium" : "low" }; });
  expect(q.q, "the probe drew at the high tier").toMatchObject({ mode: "auto", probeTier: "high" });
  expect(q.q.probeMs).toBeGreaterThan(0);
  expect(q.q.tier, "the tier of its own milliseconds").toBe(q.want);
  expect(await look(page), "one canvas, not lost").toMatchObject({ canvases: 1, lost: false });
  expect(errors).toEqual([]);
});

test("in play the p95 over 45 ms for 5 s steps one tier down; it never steps up; pause and menus do not count", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { window.__bbQuality = "auto"; window.__bbProbeMs = 3; });   // auto, probed as a fast device: high
  const errors = await openGame(page, { quality: null });
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 3; b.startGame(1); window.__g = b.game; });
  expect(await page.evaluate(() => window.__bb.quality)).toMatchObject({ tier: "high", mode: "auto", steps: 0 });
  // 12 s of 80 ms frames in the pause menu and on the home screen: nothing
  const feed = (mode, secs, ms) => page.evaluate(([mode, secs, ms]) => { const b = window.__bb; let t = window.__fakeT || 0; for (let i = 0; i < secs * 1000 / ms; i++) { t += ms; b.qualityFrame(ms / 1000, mode, t); } window.__fakeT = t; return b.quality; }, [mode, secs, ms]);
  expect((await feed("pause", 12, 80)).tier).toBe("high");
  expect((await feed("home", 12, 80)).tier).toBe("high");
  // 4 s of slow play: not yet; 4 more: one step
  expect((await feed("play", 4, 80)).tier).toBe("high");
  expect(await feed("play", 4, 80), "high → medium").toMatchObject({ tier: "medium", steps: 1 });
  expect((await look(page)).shadowSize, "medium: the shadow map at once").toBe(1024);
  expect((await look(page)).pixelRatio, "medium: the pixel ratio at once").toBeLessThanOrEqual(1.5);
  // good frames never bring it back up
  expect((await feed("play", 30, 16.7)).tier).toBe("medium");
  // slow again: medium → low (a new renderer without MSAA), and the level has gone on all the time
  await feed("play", 8, 80);
  const q = await feed("play", 8, 80);
  expect(q).toMatchObject({ tier: "low", steps: 2, pending: true });
  // review fix: in play only the pixel ratio and the shadow map change; the new renderer (MSAA) and the decor wait for a pause — no frame of play is lost to them
  expect(await look(page), "in play: DPR and the shadow map, not the renderer").toMatchObject({ msaa: true, shadowType: BASIC, pixelRatio: 1, canvases: 1, lost: false });
  expect((await feed("pause", 1, 16.7)).pending, "the pause applies what waited").toBe(false);
  const l = await look(page);
  expect(l).toMatchObject({ msaa: false, shadowType: BASIC, pixelRatio: 1, canvases: 1, lost: false });
  expect((await feed("play", 30, 90)).tier, "nothing below low").toBe("low");
  expect(await page.evaluate(() => window.__g === window.__bb.game && window.__bb.mode)).toBe("play");
  // a chosen tier is not stepped down
  await page.evaluate(() => { window.__bb.setQuality("high"); window.__fakeT = 0; });
  expect((await feed("play", 20, 90)).tier).toBe("high");
  expect(errors).toEqual([]);
});

test("the choice is saved on this device, survives a reload, and an old save without it loads", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, { quality: null });
  expect(await page.evaluate(() => window.__bb.quality.mode), "never chosen: auto").toBe("auto");
  expect((await storedSave(page)).quality, "nothing written until it is chosen").toBeUndefined();
  await page.evaluate(() => { window.__bb.setQuality("low"); });
  expect((await storedSave(page)).quality).toBe("low");
  await reloadGame(page);
  expect(await page.evaluate(() => window.__bb.quality), "after a reload: low, no probe").toMatchObject({ mode: "low", tier: "low", probeMs: null });
  expect((await look(page)).msaa).toBe(false);
  // an old save (no field) with a field this version does not know: loads as auto; the unknown field is written back unchanged
  await page.evaluate(() => { window.__bb.save.flush(); const s = JSON.parse(localStorage.getItem("bebebe-save")); delete s.quality; s.futureThing = { a: [1, 2] }; localStorage.setItem("bebebe-save", JSON.stringify(s)); localStorage.removeItem("bebebe-save-backup"); localStorage.removeItem("bebebe-save-session"); });
  await reloadGame(page);
  expect(await page.evaluate(() => window.__bb.quality.mode)).toBe("auto");
  await page.evaluate(() => { window.__bb.setQuality("medium"); });
  const s = await storedSave(page);
  expect([s.quality, s.futureThing]).toEqual(["medium", { a: [1, 2] }]);
  // a field that is not one of the four modes is dropped as invalid and the game starts on auto
  await page.evaluate(() => { window.__bb.save.flush(); const s = JSON.parse(localStorage.getItem("bebebe-save")); s.quality = "ultra"; localStorage.setItem("bebebe-save", JSON.stringify(s)); localStorage.removeItem("bebebe-save-backup"); localStorage.removeItem("bebebe-save-session"); });
  await reloadGame(page);
  expect(await page.evaluate(() => window.__bb.quality.mode)).toBe("auto");
});

// ---------- the grown-ups page ----------
const answer = page => page.evaluate(() => { const g = window.__bb.grownUps.gate, want = g.a * g.b; [...document.querySelectorAll("#gate button[data-act=answer]")].find(b => Number(b.textContent) === want).click(); });
const openPage = async page => { await page.evaluate(() => { window.__bb.mode = "story"; window.__bb.grownUps.open(); }); await answer(page); };
test("the grown-ups page shows the tier and has Auto / High / Medium / Low", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { window.__bbProbeMs = 15; });             // the probe says medium
  await openGame(page, { quality: null });
  await openPage(page);
  const note = () => page.evaluate(() => document.querySelector("#grownups [data-note=quality]").textContent);
  expect(await note()).toBe("Picture quality: Auto (now Medium)");
  await page.click('#grownups [data-act="quality"]');
  expect(await page.evaluate(() => [...document.querySelectorAll("#grownups button")].map(b => [b.dataset.act, b.textContent]))).toEqual(
    [["qualityAuto", "✓ Auto"], ["qualityHigh", "High"], ["qualityMedium", "Medium"], ["qualityLow", "Low"], ["back", "OK"]]);
  await page.click('#grownups [data-act="qualityHigh"]');
  expect(await page.evaluate(() => window.__bb.quality)).toMatchObject({ mode: "high", tier: "high" });
  expect(await page.evaluate(() => document.querySelector('#grownups [data-act="qualityHigh"]').textContent)).toBe("✓ High");
  await page.click('#grownups [data-act="back"]');
  expect(await note()).toBe("Picture quality: High");
  expect((await storedSave(page)).quality).toBe("high");
  await page.click('#grownups [data-act="quality"]'); await page.click('#grownups [data-act="qualityAuto"]');
  expect(await page.evaluate(() => window.__bb.quality)).toMatchObject({ mode: "auto", tier: "medium", probeMs: 15 });
});

test.describe("the quality texts at the phone size", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  for (const lang of LANGS) {
    test(`the grown-ups quality page fits at 667×375 in ${lang} (667)`, async ({ page }) => {
      test.setTimeout(90_000);
      await openGame(page, { lang, query: "?phone=1", quality: null });
      await openPage(page);
      const fits = () => page.evaluate(() => {
        const box = document.querySelector("#grownups > div"), r = box.getBoundingClientRect(), bad = [];
        if (box.scrollWidth > box.clientWidth + 1) bad.push(`box scrolls sideways ${box.scrollWidth} > ${box.clientWidth}`);
        for (const b of box.querySelectorAll("button, div")) { const q = b.getBoundingClientRect(); if (q.width > 0 && (q.left < r.left - 1 || q.right > r.right + 1)) bad.push(`${b.textContent.slice(0, 30)} sticks out`); }
        return { bad, text: document.querySelector("#grownups [data-note=quality]").textContent, buttons: [...box.querySelectorAll("button")].map(b => b.textContent) };
      });
      const main = await fits();
      expect(main.bad, `main page ${lang}`).toEqual([]);
      await page.click('#grownups [data-act="quality"]');
      const sub = await fits().catch(() => ({ bad: [] }));
      expect((await page.evaluate(() => { const box = document.querySelector("#grownups > div"); return box.scrollWidth <= box.clientWidth + 1; })), `quality page ${lang}`).toBe(true);
      expect(sub.bad ?? [], `quality page ${lang}`).toEqual([]);
    });
  }
});
