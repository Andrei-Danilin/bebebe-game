// SPEC-033 AC 13 (D-14): the system Back (Android, installed or in the browser) and Escape on the home screen ask "Leave the game?".
// - history.pushState keeps one guard entry on top: a real Back (popstate) lands one entry below it; the game handles that Back and
//   puts the guard back, so one Back = one step. On the home screen the dialog opens and the guard comes back only with "No".
// - Back anywhere else does what Escape / ◀ does there (goBack): map → home, card → map, play → pause, pause → play, win → map…
// - Yes goes back in history past the guard (the installed app closes); the tests count the leaves with __bb.back.noLeave so nothing
//   really leaves, and one test leaves for real.
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
const press = (page, text) => page.locator("#leave button", { hasText: new RegExp(`^${text}$`) }).click();

test("a Back on the home screen asks 'Leave the game?'; No keeps home and the next Back asks again", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.mode = "home"; });
  expect(await guard(page), "the guard entry is on top from the start").toBe(true);
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
  expect(await guard(page), "asked by a key: the guard entry is still on top").toBe(true);
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
