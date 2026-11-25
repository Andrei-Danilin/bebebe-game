// SPEC-025 AC 14, 14b, 14c, 14d: the app's lifecycle.
// - AC 14: hidden (visibilitychange / pagehide) or blurred during play → pause, and it stays paused when visible again; audio
//   suspends on hide and resumes on the next tap, key or pad press from any non-running state (iOS "interrupted" too);
// - AC 14b: hidden while a win is already decided (hearts at 0, pendingWin running) → the win is recorded and saved at once
//   (as leaving the level records it); nothing else is settled on hide; a level is paid at most once (visible again, bfcache);
// - AC 14c: WebGL context lost → pause and the "Tap to continue" card; restored → the 3D is rebuilt, a tap continues; no
//   restore within CFG.GL_RESTORE_WAIT s → save and reload;
// - AC 14d: one goBack() — Escape, the back buttons and __bb.goBack() land where Escape lands today; home: nothing (D-14).
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames, step, setupHug, reloadGame } = require("./helpers");

const GL_LOST = { en: "Tap to continue", es: "Tocá para seguir", pt: "Toque para continuar", ru: "Нажми, чтобы продолжить" };
// the page hidden / shown as a phone does it (the document's visibility, then the events)
const hide = page => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
});
const show = page => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
});
const fire = (page, type, init = {}) => page.evaluate(([t, i]) => { window.dispatchEvent(t.startsWith("page") ? new PageTransitionEvent(t, i) : new Event(t)); }, [type, init]);
const mode = page => page.evaluate(() => window.__bb.mode);

test("hidden, pagehide or blur during play pause the game; it stays paused when visible; no dt jump", { tag: "@fast" }, async ({ page }) => {
  await openGame(page);
  for (const how of ["hidden", "pagehide", "blur"]) {
    await page.evaluate(() => { window.__bb.startGame(1); });
    await frames(page);
    const t0 = await page.evaluate(() => window.__bb.stats.time);
    if (how === "hidden") await hide(page); else await fire(page, how);
    expect(await mode(page), how).toBe("pause");
    await page.waitForTimeout(400);
    if (how === "hidden") await show(page); else await fire(page, how === "pagehide" ? "pageshow" : "focus");
    await frames(page);
    expect(await mode(page), `${how}: still paused when back`).toBe("pause");
    const t1 = await page.evaluate(() => window.__bb.stats.time);
    expect(t1 - t0, `${how}: no game time while away`).toBeLessThan(0.2);
    await page.evaluate(() => { window.__bb.mode = "play"; });
    await frames(page);
    const t2 = await page.evaluate(() => window.__bb.stats.time);
    expect(t2 - t1, `${how}: no dt spike after resume`).toBeLessThan(0.2);
  }
  // in the menus nothing changes
  await page.evaluate(() => { window.__bb.toHome(); });
  await hide(page);
  expect(await mode(page)).toBe("home");
  await show(page);
});

test("audio suspends on hide and resumes on the next tap, also from iOS \"interrupted\"", async ({ page }) => {
  await openGame(page);
  await page.mouse.click(5, 5);                                   // a gesture: the audio context starts
  await frames(page);
  const state = () => page.evaluate(() => { const a = window.__bb.audioContext(); return a ? a.state : null; });
  await expect.poll(state).toBe("running");
  await hide(page);
  await expect.poll(state).toBe("suspended");
  await show(page);
  await page.mouse.click(5, 5);
  await expect.poll(state).toBe("running");
  // iOS after a call: "interrupted" (stubbed) — a tap asks it to resume
  await page.evaluate(() => {
    const a = window.__bb.audioContext(); window.__resumed = 0;
    Object.defineProperty(a, "state", { configurable: true, get: () => "interrupted" });
    a.resume = () => { window.__resumed++; return Promise.resolve(); };
  });
  await page.mouse.click(5, 5);
  expect(await page.evaluate(() => window.__resumed)).toBeGreaterThan(0);
});

// ---------- AC 14b: a decided win when the app is hidden ----------
// the last hug: the Big One's last heart is taken, the win is pending (the hug ends, then the kind walk home)
async function lastHug(page) {
  await page.evaluate(() => { window.__bb.startGame(1); window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, 0.3);
  expect(await page.evaluate(() => [window.__bb.big.hp, window.__bb.game.pendingWin > 0, window.__bb.mode])).toEqual([0, true, "play"]);
}
const coinLines = page => page.evaluate(() => window.__bb.ledger().length);

test("the last hug, then the page is hidden and the app killed: after a reload the level is won", { tag: "@fast" }, async ({ page }) => {
  await openGame(page);
  await lastHug(page);
  await fire(page, "pagehide", { persisted: false });
  // already in storage when the page could be killed
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-progress")));
  expect([saved.worlds.park.won["1"], saved.worlds.park.unlocked]).toEqual([true, 2]);
  await reloadGame(page);
  expect(await page.evaluate(() => [window.__bb.progress.worlds.park.won["1"], window.__bb.progress.worlds.park.unlocked])).toEqual([true, 2]);
});

test("hide and show during the kind walk, and pagehide + pageshow from the back/forward cache: paid once", async ({ page }) => {
  await openGame(page);
  for (const how of ["visibility", "bfcache"]) {
    await page.evaluate(() => { window.__bb.setProgress(null); });
    await lastHug(page);
    await step(page, 1.2);                                        // the hug is over: Dad walks home
    expect(await page.evaluate(() => window.__bb.big.kind), how).toBe(true);
    const n0 = await coinLines(page);
    if (how === "visibility") { await hide(page); await show(page); }
    else { await fire(page, "pagehide", { persisted: true }); await fire(page, "pageshow", { persisted: true }); }
    const n1 = await coinLines(page), coins1 = await page.evaluate(() => window.__bb.progress.coins);
    expect(n1, `${how}: the win paid on hide`).toBeGreaterThan(n0);
    expect(await page.evaluate(() => window.__bb.ledger().map(e => e.reason)), how).toEqual(expect.arrayContaining([expect.stringMatching(/hug/)]));
    await page.evaluate(() => { window.__bb.mode = "play"; });
    await step(page, 5);                                          // the walk ends: the win screen
    expect(await mode(page), how).toBe("win");
    expect([await coinLines(page), await page.evaluate(() => window.__bb.progress.coins)], `${how}: not paid again`).toEqual([n1, coins1]);
    expect(await page.evaluate(() => window.__bb.lastReward && window.__bb.lastReward.win), how).toBe(true);
    await page.evaluate(() => { window.__bb.toMap(); });          // leaving the win screen pays nothing more
    expect(await coinLines(page)).toBe(n1);
  }
});

test("hidden in the middle of a level: no coins, no ledger line", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__bb.startGame(1); });
  await step(page, 1);
  const before = await page.evaluate(() => [window.__bb.progress.coins, window.__bb.ledger().length, JSON.stringify(window.__bb.progress)]);
  await hide(page);
  await fire(page, "pagehide", { persisted: false });
  expect(await page.evaluate(() => [window.__bb.progress.coins, window.__bb.ledger().length, JSON.stringify(window.__bb.progress)])).toEqual(before);
  await show(page);
});

// ---------- AC 14c: WebGL context loss ----------
// the extension object is kept: a lost context gives no extensions
const glExt = "(window.__loseExt = window.__loseExt || document.getElementById('gl').getContext('webgl2').getExtension('WEBGL_lose_context'))";
test("a lost WebGL context: the card, then after the restore the scene is back and a tap continues", async ({ page }) => {
  await openGame(page, { lang: "ru" });
  await page.evaluate(() => { window.__bb.startGame(1); });
  await frames(page);
  const pieces = await page.evaluate(() => window.__bb.mapPieces().length);
  await page.evaluate(`${glExt}.loseContext()`);
  await page.waitForFunction(() => !!document.getElementById("gl-lost"));
  expect(await page.evaluate(() => document.getElementById("gl-lost").innerText)).toContain(GL_LOST.ru);
  expect(await mode(page)).toBe("pause");
  await page.evaluate(`${glExt}.restoreContext()`);
  await page.waitForFunction(() => window.__bb.glRestored === true);
  await page.click("#gl-lost");
  await frames(page);
  const r0 = await page.evaluate(() => window.__bb.sim().renders);
  await frames(page); await frames(page);
  const d = await page.evaluate(() => ({ card: !!document.getElementById("gl-lost"), mode: window.__bb.mode, renders: window.__bb.sim().renders, pieces: window.__bb.mapPieces().length,
    models: [window.__bb.model(0), window.__bb.model("big")].every(Boolean), lost: document.getElementById("gl").getContext("webgl2").isContextLost() }));
  expect(d).toMatchObject({ card: false, mode: "play", pieces, models: true, lost: false });
  expect(d.renders).toBeGreaterThan(r0);
  for (const l of ["en", "es", "pt", "ru"]) expect(await page.evaluate(k => window.__bb.I18N[k].glLost, l)).toBe(GL_LOST[l]);
});

test("a lost WebGL context that never comes back: the game saves and reloads", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.CFG.GL_RESTORE_WAIT = 0.5; b.progress.coins = 777; window.__notReloaded = true; });
  await page.evaluate(`${glExt}.loseContext()`);
  await page.waitForFunction(() => window.__notReloaded !== true, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => [window.__notReloaded, window.__bb.progress.coins])).toEqual([undefined, 777]);
});

// ---------- AC 14d: goBack() ----------
// Where Escape landed before SPEC-025 (master's onKey, checked by hand): each screen as the code that opens it and where "back"
// goes from it — { mode, page (the story's page, drawn), ward (the wardrobe page) }. Escape, __bb.goBack() and the back buttons
// must all land there; the home screen stays (decision D-14).
const BACK = [
  ["home", "b.mode = 'home'", { mode: "home" }],
  ["map", "b.openMap()", { mode: "home" }],
  ["levelCard", "b.openMap(); b.chooseStop(1)", { mode: "map" }],
  ["story from home", "b.openStory()", { mode: "home" }],
  ["story from the level card", "b.openMap(); b.chooseStop(1); b.openStory(b.world, 'levelCard')", { mode: "levelCard" }],
  ["How to play", "b.openStory() | b.tapButton('story:rules')", { mode: "story", page: "chapters" }],
  ["scene", "b.openScene('intro')", { mode: "home" }],
  ["shop", "b.openShop('home', 'items')", { mode: "home" }],
  ["friends", "b.openShop('home', 'wardrobe'); b.openFriends()", { mode: "shop", ward: "looks" }],
  ["play", "b.startGame(1)", { mode: "pause" }],
  ["pause", "b.startGame(1); b.mode = 'pause'", { mode: "play" }],
  ["win", "b.startGame(1); b.mode = 'win'", { mode: "map" }]
];
const where = page => page.evaluate(() => { const b = window.__bb; return { mode: b.mode, page: b.mode === "story" && b.storyInfo ? b.storyInfo.page : undefined, ward: b.mode === "shop" ? b.wardrobePage : undefined }; });
test("goBack() and Escape land where Escape landed before, from every screen", async ({ page }) => {
  await openGame(page);
  const fails = [];
  for (const [name, open, want] of BACK) {
    for (const how of ["Escape", "goBack"]) {
      for (const [k, step] of ["b.toHome()", ...open.split(" | ")].entries()) {   // " | ": a frame between (a tap needs the drawn screen)
        await page.evaluate(`(() => { const b = window.__bb; ${step}; })()`);
        if (k) await frames(page);
      }
      if (how === "Escape") await page.keyboard.press("Escape"); else await page.evaluate(() => { window.__bb.goBack(); });
      await frames(page);
      const norm = o => JSON.stringify(Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => [k, o[k]]));
      const got = await where(page), exp = want;
      if (norm(got) !== norm(exp)) fails.push(`${name} (${how}): ${JSON.stringify(got)}, want ${JSON.stringify(exp)}`);
    }
  }
  expect(fails).toEqual([]);
  // the back buttons are goBack too
  for (const [open, id, want] of [["b.openMap()", "back:home", "home"], ["b.openMap(); b.chooseStop(1)", "card:close", "map"], ["b.openStory()", "back:story", "home"]]) {
    await page.evaluate(`(() => { const b = window.__bb; b.toHome(); ${open}; })()`);
    await frames(page);
    expect(await page.evaluate(k => { window.__bb.tapButton(k); return window.__bb.mode; }, id), id).toBe(want);
  }
});

// review fix (AC 14c): the restore wait runs only while the game is on screen — lost while hidden, nothing reloads until it is back
test("a context lost while hidden waits until the game is visible again", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__bb.CFG.GL_RESTORE_WAIT = 0.5; window.__notReloaded = true; });
  await hide(page);
  await page.evaluate(`${glExt}.loseContext()`);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__notReloaded), "no reload while hidden").toBe(true);
  await show(page);
  await page.waitForFunction(() => window.__notReloaded !== true, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__notReloaded), "reloaded once visible").toBeUndefined();
});
