// SPEC-025 AC 7, 7b: friendly errors.
// - AC 7: the frame loop schedules the next frame first and runs inside a guard; the first error pauses the game and shows the
//   "Oops" card once (Continue / Restart level); a repeating error is logged once with a count; errors outside the loop (the
//   window's error and unhandledrejection handlers) do the same; rejections marked benign are ignored. The log (__bb.errorLog,
//   localStorage "bebebe-errors") keeps the last CFG.ERROR_LOG_MAX entries of message, stack head, version, mode and level only.
// - AC 7b: startup is one guarded boot(); without WebGL2 the loading screen says noWebGL, any other start error says startFailed
//   with a Try again button, a slow start keeps the progress bar; the internet text only when a game file failed to load while
//   the browser is offline. The texts are inline in index.html's non-module script (the modules may not load).
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { openGame, frames, HTTP_BASE, ROOT } = require("./helpers");

const OOPS = { en: "Oops! Something went wrong", es: "¡Uy! Algo salió mal", pt: "Ops! Algo deu errado", ru: "Ой! Что-то пошло не так" };
const RESTART = { en: "Restart level", es: "Reiniciar nivel", pt: "Recomeçar a fase", ru: "Начать уровень заново" };
const START = {
  noWebGL: { en: "This device can't show the 3D game", es: "Este dispositivo no puede mostrar el juego en 3D", pt: "Este aparelho não consegue mostrar o jogo em 3D", ru: "Это устройство не может показать 3D-игру" },
  startFailed: { en: "Something went wrong while starting the game", es: "Algo salió mal al abrir el juego", pt: "Algo deu errado ao abrir o jogo", ru: "Что-то пошло не так при запуске игры" },
  tryAgain: { en: "Try again", es: "Probá de nuevo", pt: "Tentar de novo", ru: "Попробовать ещё раз" }
};
const INTERNET = /internet|интернет/i;

const card = page => page.evaluate(() => {
  const el = document.getElementById("oops");
  return el && el.style.display !== "none" ? { text: el.innerText, buttons: [...el.querySelectorAll("button")].map(b => b.innerText) } : null;
});
const log = page => page.evaluate(() => window.__bb.errorLog);
// a thrower in the 2D pass of every frame (drawUI clears its canvas first), on or off
const breakFrames = (page, on) => page.evaluate(v => {
  const P = CanvasRenderingContext2D.prototype;
  if (v) { window.__clearRect = window.__clearRect || P.clearRect; P.clearRect = function () { throw new Error("test: a broken frame"); }; }
  else if (window.__clearRect) P.clearRect = window.__clearRect;
}, on);

test("an error on every frame: the loop goes on, one card, one log entry with a count", { tag: "@fast" }, async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__bb.startGame(1); });
  await frames(page);
  const r0 = await page.evaluate(() => window.__bb.sim().renders);
  await breakFrames(page, true);
  // the loop goes on: renders keep advancing while every frame throws (polled, not counted over a fixed time: a SwiftShader
  // frame on CI is slow, so a 2 s wait saw only 2–3 frames there)
  await page.waitForFunction(r => window.__bb.sim().renders >= r + 10, r0, { timeout: 60_000, polling: 100 });
  await breakFrames(page, false);
  await frames(page);
  const c = await card(page);
  expect(c && c.text).toContain(OOPS.en);
  expect(c.buttons).toEqual(["Continue", RESTART.en]);
  expect(await page.evaluate(() => document.querySelectorAll("#oops").length), "exactly one card").toBe(1);
  expect(await page.evaluate(() => window.__bb.mode), "the game paused").toBe("pause");
  const l = await log(page);
  expect(l.length, "one entry").toBe(1);
  expect(Object.keys(l[0]).sort()).toEqual(["count", "level", "message", "mode", "stack", "version"]);
  expect(l[0]).toMatchObject({ message: "test: a broken frame", mode: "play", level: "park 1" });
  expect(l[0].count, "the same error every frame: counted").toBeGreaterThan(1);
  expect(l[0].version).toBe(await page.evaluate(() => document.querySelector("meta[name=src-hash]").content));
  expect(l[0].stack.split("\n").length).toBeLessThanOrEqual(await page.evaluate(() => window.__bb.CFG.ERROR_STACK_LINES));
  // kept in local storage only
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("bebebe-errors")))).toEqual(l);
  // Continue: the card goes, the level plays on
  await page.click("#oops button >> nth=0");
  await frames(page);
  expect(await card(page)).toBeNull();
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
});

test("Restart level after an error starts the level again", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.startGame(1); for (let i = 0; i < 120; i++) b.update(1 / 60); });
  expect(await page.evaluate(() => window.__bb.stats.time)).toBeGreaterThan(1);
  await page.evaluate(() => { setTimeout(() => { throw new Error("test: outside the loop"); }); });
  await expect.poll(() => card(page)).not.toBeNull();
  expect(await page.evaluate(() => window.__bb.mode)).toBe("pause");
  await page.click(`#oops button:has-text("${RESTART.en}")`);
  await frames(page);
  expect(await card(page)).toBeNull();
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.stats.time < 0.5])).toEqual(["play", true]);
  expect((await log(page)).map(e => e.message)).toEqual(["test: outside the loop"]);
});

test("the window handlers: an error and a rejection show the card; a benign rejection is ignored; texts in every language", async ({ page }) => {
  await openGame(page, { lang: "ru" });
  // in the menus: Continue and Home (no level to restart), the screen stays
  await page.evaluate(() => { Promise.reject(Object.assign(new Error("benign"), { benign: true })); });
  await page.waitForTimeout(300);
  expect(await card(page), "a benign rejection: no card").toBeNull();
  expect(await log(page)).toEqual([]);
  await page.evaluate(() => { Promise.reject(new Error("test: a rejection")); });
  await expect.poll(() => card(page)).not.toBeNull();
  const c = await card(page);
  expect(c.text).toContain(OOPS.ru);
  expect(c.buttons).toEqual(["Продолжить", "Главная"]);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  await page.click("#oops button >> nth=0");
  for (const l of ["en", "es", "pt", "ru"]) {
    const t = await page.evaluate(k => ({ oops: window.__bb.I18N[k].oops, restart: window.__bb.I18N[k].restartLevel }), l);
    expect(t).toEqual({ oops: OOPS[l], restart: RESTART[l] });
  }
  expect((await log(page)).map(e => [e.message, e.mode])).toEqual([["test: a rejection", "home"]]);
});

test("the log keeps the last entries, no names or save content", async ({ page }) => {
  await openGame(page, { sim: true });
  const max = await page.evaluate(() => window.__bb.CFG.ERROR_LOG_MAX);
  expect(max).toBe(20);
  await page.evaluate(() => { window.__bb.setName("p1", "Zoltanix"); window.__bb.progress.coins = 4242; });
  await page.evaluate(n => { for (let i = 0; i < n; i++) window.__bb.reportError(new Error("test " + i)); }, max + 5);
  const l = await log(page);
  expect(l.length).toBe(max);
  expect(l.at(-1).message).toBe("test " + (max + 4));
  expect(l[0].message).toBe("test 5");
  const text = JSON.stringify(l);
  expect(text).not.toContain("Zoltanix");
  expect(text).not.toContain("4242");
});

// review fix: a rejected object is logged by its type only (never its content); the message is cut at CFG.ERROR_MESSAGE_MAX
test("rejected values: an object by its type, a long message cut", async ({ page }) => {
  await openGame(page, { sim: true });
  await page.evaluate(() => {
    const b = window.__bb;
    b.reportError({ name: "Zoltanix", coins: 4242 });
    b.reportError("x".repeat(1000));
  });
  const l = await log(page), max = await page.evaluate(() => window.__bb.CFG.ERROR_MESSAGE_MAX);
  expect(l.map(e => e.message.length <= max)).toEqual([true, true]);
  expect(l[0].message).toBe("(object Object)");
  expect(JSON.stringify(l)).not.toMatch(/Zoltanix|4242/);
});

// review fix: a repeat is counted in memory and written at most every CFG.ERROR_LOG_WRITE_EVERY s (a new entry at once; on hide)
test("the log is not rewritten on every repeat", async ({ page }) => {
  await openGame(page, { sim: true });
  const writes = await page.evaluate(() => {
    let n = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === "bebebe-errors") n++; return set.call(this, k, v); };
    const err = new Error("test: repeat");
    for (let i = 0; i < 50; i++) window.__bb.reportError(err);
    Storage.prototype.setItem = set;
    return n;
  });
  expect(writes, "one write for the new entry, the repeats wait").toBe(1);
  const l = await log(page);                                     // reading flushes the count
  expect(l[0].count).toBe(50);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("bebebe-errors")))[0].count).toBe(50);
});

// review fix: an error that repeats on a menu screen must not trap the child — Home leaves it; the same error again offers a reload
test("an error on every frame of a menu: Home leads out, the same error again offers Try again", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype; window.__clearRect = P.clearRect; window.__breakOn = ["map"];
    P.clearRect = function (...a) { if (window.__breakOn.includes(window.__bb.mode)) throw new Error("test: a broken menu"); return window.__clearRect.apply(this, a); };
    window.__bb.openMap();
  });
  await expect.poll(() => card(page)).not.toBeNull();
  expect((await card(page)).buttons).toEqual(["Continue", "Home"]);
  await page.click("#oops button:has-text('Home')");
  await frames(page); await frames(page);
  expect([await page.evaluate(() => window.__bb.mode), await card(page)], "a working screen").toEqual(["home", null]);
  // the keyboard: the highlight starts on Continue; → moves it to Home; Enter presses it
  const highlight = () => page.evaluate(() => { const b = document.querySelector("#oops button.hl"); return b && b.innerText; });
  await page.evaluate(() => { window.__bb.openMap(); });
  await expect.poll(() => card(page)).not.toBeNull();
  expect(await highlight()).toBe("Continue");
  await page.keyboard.press("ArrowRight");
  expect(await highlight()).toBe("Home");
  await page.keyboard.press("Enter");
  await frames(page); await frames(page);
  expect([await page.evaluate(() => window.__bb.mode), await card(page)], "keyboard: out through Home").toEqual(["home", null]);
  // the gamepad: D-pad → to Home, A presses it
  await page.evaluate(() => {
    window.__padDown = k => { window.__pads = [{ index: 0, id: "pad", mapping: "standard", axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === k, value: 0 })) }]; };
    window.__padDown(-1);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pads });
  });
  await frames(page);
  const pad = async k => { await page.evaluate(n => window.__padDown(n), k); await frames(page); await page.evaluate(() => window.__padDown(-1)); await frames(page); };
  await page.evaluate(() => { window.__bb.openMap(); });
  await expect.poll(() => card(page)).not.toBeNull();
  await pad(15);
  expect(await highlight()).toBe("Home");
  await pad(0);
  await frames(page);
  expect([await page.evaluate(() => window.__bb.mode), await card(page)], "gamepad: out through Home").toEqual(["home", null]);
  await page.evaluate(() => { window.__pads = []; delete navigator.getGamepads; });
  // broken at home too: Continue → the same error opens the card again, now with Try again (reload)
  await page.evaluate(() => { window.__breakOn = ["home", "map"]; });
  await expect.poll(() => card(page)).not.toBeNull();
  await page.click("#oops button >> nth=0");
  await expect.poll(() => card(page)).not.toBeNull();
  expect((await card(page)).buttons).toEqual(["Continue", "Home", START.tryAgain.en]);
  await page.click(`#oops button:has-text("${START.tryAgain.en}")`);
  await page.waitForFunction(() => window.__bbReady === true && !window.__breakOn, null, { timeout: 60_000 });
  await frames(page);
  expect([await page.evaluate(() => window.__bb.mode), await card(page)]).toEqual(["home", null]);
});

// review fix: while a card is open, keys and pad buttons do not act on the game under it; Enter presses the card
test("an open card takes the keys: Escape and P do nothing, Enter presses Continue", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__bb.startGame(1); });
  await frames(page);
  await page.evaluate(() => { setTimeout(() => { throw new Error("test: card keys"); }); });
  await expect.poll(() => card(page)).not.toBeNull();
  for (const k of ["Escape", "KeyP", "KeyQ"]) await page.keyboard.press(k);
  await frames(page);
  expect([await page.evaluate(() => window.__bb.mode), !!(await card(page))]).toEqual(["pause", true]);
  await page.keyboard.press("Enter");
  await frames(page);
  expect([await page.evaluate(() => window.__bb.mode), await card(page)]).toEqual(["play", null]);
});

// ---------- AC 7b: the start ----------
// `goto` without waiting for the game (a failed start never becomes ready)
async function openRaw(page, { lang = "en", init = null } = {}) {
  await page.addInitScript(l => { try { localStorage.clear(); localStorage.setItem("bebebe-lang", l); } catch (e) { /* ok */ } }, lang);
  if (init) await page.addInitScript(init);
  await page.goto(HTTP_BASE + "index.html", { waitUntil: "commit" });   // the load event waits for the module graph
}
const loadingText = page => page.evaluate(() => { const el = document.getElementById("loading"); return el ? el.innerText : null; });

test("no WebGL2: the device text within 1 s, in the saved language", async ({ page }) => {
  for (const lang of ["en", "es"]) {
    await openRaw(page, { lang, init: () => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...a) { return kind === "webgl2" ? null : get.call(this, kind, ...a); };
    } });
    await expect.poll(() => loadingText(page), { timeout: 1000 }).toContain(START.noWebGL[lang]);
    expect(await loadingText(page)).not.toMatch(INTERNET);
    expect(await page.evaluate(() => window.__bbReady === true)).toBe(false);
  }
});

const CAMERA = "/src/client/three/camera.js";
test("a start error shows the retry card; Try again reloads", async ({ page }) => {
  const original = fs.readFileSync(path.join(ROOT, CAMERA), "utf8");
  let broken = true;
  await page.route(u => u.pathname === CAMERA, route => (broken
    ? route.fulfill({ contentType: "application/javascript", body: original.replace("export function initCamera() {", "export function initCamera() { throw new Error(\"test: init\");") })
    : route.continue()));
  await openRaw(page, { lang: "pt" });
  await expect.poll(() => loadingText(page), { timeout: 10_000 }).toContain(START.startFailed.pt);
  expect(await loadingText(page)).not.toMatch(INTERNET);
  expect(await page.locator("#loading button").innerText()).toBe(START.tryAgain.pt);
  broken = false;
  await page.click("#loading button");
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
});

test("a slow start keeps the progress bar; a file that cannot load is no internet problem online", async ({ page }) => {
  test.slow();
  await page.route(u => u.pathname === "/src/core/rules.js", async route => { await new Promise(r => setTimeout(r, 8000)); await route.continue(); });
  await openRaw(page);
  await page.waitForTimeout(7000);                              // the module is 8 s late
  expect(await page.evaluate(() => !!document.querySelector("#loading #loadbar")), "still the progress bar").toBe(true);
  expect(await loadingText(page)).not.toMatch(INTERNET);
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 60_000 });
  // a module that cannot be fetched while online: the start failed, not the internet
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route(u => u.pathname === "/src/core/rules.js", route => route.abort("failed"));
  await page.reload();
  await expect.poll(() => loadingText(page), { timeout: 10_000 }).toContain(START.startFailed.en);
  expect(await loadingText(page)).not.toMatch(INTERNET);
});

test("a game file that cannot load while offline: the internet text", async ({ page }) => {
  await page.route(u => u.pathname.startsWith("/vendor/three/"), route => route.abort("internetdisconnected"));
  await openRaw(page, { init: () => { Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }); } });
  await expect.poll(() => loadingText(page), { timeout: 10_000 }).toMatch(INTERNET);
});
