// SPEC-033 AC 13 (D-14): the system Back (Android, installed or in the browser) and Escape on the home screen ask "Leave the game?".
// - history.pushState keeps one guard entry on top (pushed at the player's first tap or key but Escape — Chrome skips entries made
//   before a user activation): a real Back (popstate) lands one entry below it; the game handles that Back and
//   puts the guard back, so one Back = one step. On the home screen the dialog opens with the guard back under it (another Back = No).
// - Back anywhere else does what Escape / ◀ does there (goBack): map → home, card → map, play → pause, pause → play, win → map…
// - Yes goes back in history past the guard (the installed app closes); the tests count the leaves with __bb.back.noLeave so nothing
//   really leaves, and one test leaves for real. With nothing behind the game Yes closes the window; refused, the game steps off its guard.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames } = require("./helpers");

const dialog = page => page.evaluate(() => {
  const el = document.getElementById("leave");
  return el ? { text: el.firstChild.firstChild.textContent, buttons: [...el.querySelectorAll("button")].map(b => b.textContent), hl: [...el.querySelectorAll("button")].map(b => b.classList.contains("hl")) } : null;
});
const mode = page => page.evaluate(() => window.__bb.mode);
const guard = page => page.evaluate(() => !!(history.state && history.state.bbGuard));
// a real Back: history.back(), then wait for the popstate to be handled
async function back(page) {
  await page.evaluate(() => { window.__popped = false; window.addEventListener("popstate", () => setTimeout(() => { window.__popped = true; }, 0), { once: true }); history.back(); });
  await page.waitForFunction(() => window.__popped === true);
  await frames(page);
}
// the player's first key: puts the guard entry on (a Shift press does nothing in the game; any key but Escape — a user activation)
const touch = page => page.keyboard.press("Shift");
const press = (page, text) => page.locator("#leave button", { hasText: new RegExp(`^${text}$`) }).click();

test("a Back on the home screen asks 'Leave the game?'; No keeps home and the next Back asks again", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  expect(await guard(page), "no guard entry before the first touch").toBe(false);
  await touch(page);
  expect(await guard(page), "the guard entry is on top from the first key on").toBe(true);
  const len = await page.evaluate(() => history.length);
  await back(page);
  expect(await dialog(page)).toMatchObject({ text: "Leave the game?", buttons: ["Yes", "No"] });
  expect(await mode(page), "still home").toBe("home");
  expect((await dialog(page)).hl, "the highlight starts on No (the safe button)").toEqual([false, true]);
  await press(page, "No");
  expect(await dialog(page)).toBe(null);
  expect([await mode(page), await guard(page), await page.evaluate(() => history.length)], "No: home, the guard back on top, no entry added").toEqual(["home", true, len]);
  await back(page);                                   // the next Back asks again
  expect(await dialog(page)).not.toBe(null);
  await back(page);                                   // a Back with the dialog open is a No
  expect([await dialog(page), await guard(page)]).toEqual([null, true]);
  expect(errors).toEqual([]);
});

test("Yes leaves: the path is called once and the dialog closes (nothing really leaves with noLeave)", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.back.noLeave = true; window.__bb.mode = "home"; });
  await touch(page);
  await back(page);
  await press(page, "Yes");
  expect(await page.evaluate(() => window.__bb.back.leaves)).toBe(1);
  expect(await dialog(page)).toBe(null);
  expect(errors).toEqual([]);
});

test("Yes really goes back in history, past our guard entry", async ({ page }) => {
  const errors = await openGame(page);
  await page.goto("about:blank");
  await page.goto("http://localhost:" + (process.env.PORT || 8123) + "/index.html");
  await page.waitForFunction(() => window.__bbReady === true);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await touch(page);
  await back(page);
  await Promise.all([page.waitForURL("about:blank"), press(page, "Yes")]);
  expect(page.url()).toBe("about:blank");
  expect(errors.filter(e => !/closed|destroyed|Execution context/.test(e))).toEqual([]);
});

test("Escape on the home screen asks too; Escape again, or Enter on the highlighted No, closes it", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.back.noLeave = true; window.__bb.mode = "home"; });
  await page.keyboard.press("Escape");
  await frames(page);
  expect(await dialog(page)).toMatchObject({ text: "Leave the game?", buttons: ["Yes", "No"] });
  expect(await guard(page), "Escape is no user activation (Chrome): it puts no guard entry on").toBe(false);
  await page.keyboard.press("Escape");
  expect(await dialog(page), "Escape again = No").toBe(null);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");                 // the highlight starts on No
  expect(await dialog(page)).toBe(null);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowLeft");             // ← moves to Yes, Enter presses it
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__bb.back.leaves)).toBe(1);
  expect(await mode(page)).toBe("home");
  expect(errors).toEqual([]);
});

test("a Back elsewhere does what Escape does there, one step per Back", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.mode = "home"; window.__bb.openMap(); });
  await touch(page);
  await frames(page);
  const len = await page.evaluate(() => history.length);
  await back(page);
  expect([await mode(page), await dialog(page), await guard(page), await page.evaluate(() => history.length)], "map → home, one step").toEqual(["home", null, true, len]);
  await page.evaluate(() => { const b = window.__bb; b.openMap(); b.chooseStop(1); });
  await frames(page);
  expect(await mode(page)).toBe("levelCard");
  await back(page);
  expect(await mode(page), "card → map").toBe("map");
  await back(page);
  expect(await mode(page), "map → home").toBe("home");
  expect(await dialog(page), "no dialog until the next Back on home").toBe(null);
  await page.evaluate(() => { window.__bb.startGame(1); });
  await frames(page);
  await back(page);
  expect(await mode(page), "play → pause").toBe("pause");
  await back(page);
  expect(await mode(page), "pause → play").toBe("play");
  await page.evaluate(() => { window.__bb.mode = "win"; });
  await back(page);
  expect(await mode(page), "win → map").toBe("map");
  expect(errors).toEqual([]);
});

test("a synthetic popstate on the map goes home; one on home asks", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.openMap(); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(await mode(page)).toBe("home");
  await page.evaluate(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(await dialog(page)).not.toBe(null);
  expect(errors).toEqual([]);
});

test("a reload keeps a single guard entry: one Back asks", async ({ page }) => {
  const errors = await openGame(page, { clearStorage: false });
  await touch(page);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  expect(await guard(page)).toBe(true);
  await back(page);
  expect(await dialog(page), "one Back after a reload asks").not.toBe(null);
  expect(errors).toEqual([]);
});

test("the Leave texts are in every language; the sim page has no guard", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  expect(await page.evaluate(() => window.__bb.LANGS.map(l => { const I = window.__bb.I18N[l]; return [I.leaveAsk, I.yes, I.no]; }))).toEqual([
    ["Leave the game?", "Yes", "No"], ["¿Salir del juego?", "Sí", "No"], ["Sair do jogo?", "Sim", "Não"], ["Выйти из игры?", "Да", "Нет"]]);
  expect(await guard(page), "sim mode: history untouched").toBe(false);
  expect(errors).toEqual([]);
});

// SPEC-033 review: "Yes" with nothing behind the game (an installed app, a tab with no earlier entry) closes the window. Chrome refuses
// window.close() for a window no script opened unless its history has one entry, and our guard makes it two: so when the page is still
// there after LOOK.BACK_CLOSE_WAIT, the game steps off its guard (back to its own entry: no dialog, no new guard) and the next system
// Back leaves (the Android app closes, the tab goes back). The next tap or key puts the guard back: a kid who stays is asked again.
const isOff = () => !(history.state && history.state.bbGuard);
async function refusedClose(page, query, { oneEntry = false, reopen = false } = {}) {
  await page.addInitScript(() => { window.__closed = 0; window.close = () => { window.__closed++; }; });
  // a tab with no earlier entry has history.length 2 (the game + our guard)
  if (oneEntry) await page.addInitScript(() => { Object.defineProperty(History.prototype, "length", { configurable: true, get: () => 2 }); });
  const errors = await openGame(page, { query });
  if (reopen) {                                       // a real page behind the game, to see where the next Back goes
    await page.goto("about:blank");
    await page.goto("http://localhost:" + (process.env.PORT || 8123) + "/index.html" + query);
    await page.waitForFunction(() => window.__bbReady === true);
  }
  const wait = await page.evaluate(() => window.__bb.CFG.BACK_CLOSE_WAIT * 1000);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await touch(page);
  await back(page);
  const t0 = Date.now();
  await press(page, "Yes");
  expect(await page.evaluate(() => window.__closed), "window.close() called").toBe(1);
  expect([await dialog(page), await guard(page)], "the dialog is closed; the window gets BACK_CLOSE_WAIT to close, the guard waits on top").toEqual([null, true]);
  await page.waitForFunction(isOff, null, { timeout: wait + 5000 });
  expect(Date.now() - t0, "stepped off only after BACK_CLOSE_WAIT").toBeGreaterThanOrEqual(wait - 50);
  await frames(page);
  expect([await dialog(page), await mode(page), await guard(page), await page.evaluate(() => window.__bb.back.leaves)], "still here: off the guard, no dialog").toEqual([null, "home", false, 1]);
  return errors;
}
test("Yes in an installed app closes the window; if it stays open the game steps off its guard, a new tap puts it back", async ({ page }) => {
  const errors = await refusedClose(page, "?standalone=1");
  const len = await page.evaluate(() => history.length);
  await page.evaluate(() => { window.dispatchEvent(new Event("touchend")); });   // a new tap (touchend is a user activation)
  expect([await guard(page), await page.evaluate(() => history.length)], "the guard is back, in place of the old one").toEqual([true, len]);
  await touch(page);
  expect(await page.evaluate(() => history.length), "once").toBe(len);
  await back(page);
  expect(await dialog(page), "the next Back asks again").not.toBe(null);
  expect(errors).toEqual([]);
});
test("Yes in a tab with no earlier entry closes the window; if it stays open the next Back leaves unasked", async ({ page }) => {
  const errors = await refusedClose(page, "", { oneEntry: true, reopen: true });
  await Promise.all([page.waitForURL("about:blank"), page.evaluate(() => { setTimeout(() => history.back(), 0); })]);   // after evaluate returns: the page goes away
  expect(page.url(), "the next Back is not intercepted").toBe("about:blank");
  expect(errors.filter(e => !/closed|destroyed|Execution context/.test(e))).toEqual([]);
});
test("a pagehide while the window closes keeps the guard; pageshow (back from the cache) steps off again after a refusal", async ({ page }) => {
  await page.addInitScript(() => { window.__closed = 0; window.close = () => { window.__closed++; }; });
  const errors = await openGame(page, { query: "?standalone=1" });
  const wait = await page.evaluate(() => window.__bb.CFG.BACK_CLOSE_WAIT * 1000);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await touch(page);
  await back(page);
  await press(page, "Yes");
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent("pagehide")); });   // the window is going away
  await page.waitForTimeout(wait + 300);
  expect(await guard(page), "closing: the guard is left alone").toBe(true);
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
  await back(page);
  await press(page, "Yes");
  await page.waitForFunction(isOff, null, { timeout: wait + 5000 });
  expect([await page.evaluate(() => window.__closed), await dialog(page)]).toEqual([2, null]);
  expect(errors).toEqual([]);
});

test("the guard is pushed at the first touch, not before; a pointer does it too, on its release", async ({ page }) => {
  const errors = await openGame(page);
  expect(await guard(page)).toBe(false);
  await page.mouse.move(5, 5);
  await page.mouse.down();
  await page.evaluate(() => { window.dispatchEvent(new Event("touchstart")); });
  expect(await guard(page), "a press is not yet a user activation for a touch: the release arms").toBe(false);
  await page.mouse.up();
  expect(await guard(page)).toBe(true);
  const len = await page.evaluate(() => history.length);
  await page.keyboard.press("Shift");
  expect(await page.evaluate(() => history.length), "once").toBe(len);
  expect(errors).toEqual([]);
});

test("a held Escape opens the Leave dialog and leaves it open; pad B on home asks like Escape", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await page.keyboard.down("Escape");
  await page.keyboard.down("Escape");                 // auto-repeat
  await page.keyboard.down("Escape");
  await page.keyboard.up("Escape");
  await frames(page);
  expect(await dialog(page), "still open after the repeats").not.toBe(null);
  await page.keyboard.press("Escape");
  expect(await dialog(page)).toBe(null);
  await page.evaluate(() => {
    const pad = on => ({ index: 0, mapping: "standard", axes: [0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: on && k === 1, value: 0 })) });
    window.__pads = [pad(false)];                      // a pad's first poll fires no buttons
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
    window.__padB = () => { window.__pads = [pad(true)]; };
  });
  await frames(page);
  await page.evaluate(() => window.__padB());
  await page.waitForFunction(() => !!document.getElementById("leave"), null, { timeout: 5000 });
  expect(await dialog(page)).toMatchObject({ text: "Leave the game?" });
  await page.evaluate(() => { window.__pads = []; delete navigator.getGamepads; });
  expect(errors).toEqual([]);
});

test("a closed shop menu or a reset leaves no Leave dialog behind (resetMenus)", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.mode = "home"; window.__bb.goBack(); });
  expect(await dialog(page)).not.toBe(null);
  await page.evaluate(() => window.__bb.resetMenus());
  expect(await dialog(page)).toBe(null);
  expect(errors).toEqual([]);
});
