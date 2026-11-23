// Shared helpers for the game tests.
// - openGame(): opens index.html from disk, serves three.js from node_modules (no internet needed),
//   collects page errors, waits until the game says it is ready (window.__bbReady).
// - step(page, seconds): advances the game logic by N seconds at 60 fps, without waiting in real time.
// - openGameHttp(): the same over http (scripts/serve.js), for the PWA tests (service worker, manifest).
// The game exposes a debug object window.__bb (mode, littles, big, items, progress, update, startGame, ...).
const path = require("path");
const fs = require("fs");
const { expect } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const GAME_URL = "file://" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const THREE_DIR = path.join(ROOT, "node_modules", "three", "build");

// Init script (runs before every document of the page): clears localStorage once per test and sets the language.
// Every test gets a fresh browser context, so only its first document clears. A reload or a later goto never clears:
// on CI the sessionStorage flag alone was sometimes gone after page.reload(), and saved data vanished
// ("names are saved, cleaned and survive a reload", "star coins are added to the reward"). So the flag is kept in
// localStorage too, and a reload is recognised by its navigation type.
function clearOnce(l) {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") return;
    if (sessionStorage.getItem("bb-test-init") || localStorage.getItem("bb-test-init")) return;
    localStorage.clear(); localStorage.setItem("bebebe-lang", l);
    localStorage.setItem("bb-test-init", "1"); sessionStorage.setItem("bb-test-init", "1");
  } catch (e) { /* ok */ }
}

// SPEC-008 (init script): the level generator and the 3D build must not touch the gameplay rng(). In the tests that
// throws (the game reads window.__bbStrictRng at start); in normal play the game falls back to visual randomness.
function strictRng() { window.__bbStrictRng = true; }

// `query` is appended to the URL (e.g. "?phone=1").
async function openGame(page, { lang = "en", clearStorage = true, query = "" } = {}) {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.route("https://cdn.jsdelivr.net/**", async route => {
    const file = path.join(THREE_DIR, route.request().url().split("/").pop());
    if (!fs.existsSync(file)) return route.abort();
    await route.fulfill({ path: file, contentType: "application/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.addInitScript(strictRng);
  if (clearStorage) {
    await page.addInitScript(clearOnce, lang);
  }
  await page.goto(GAME_URL + query);
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
  return errors;
}

// SPEC-008: the game in sim mode (?sim=1) — the balance tests and scripts/balance.js open it the same way
const openSim = (page, opts = {}) => openGame(page, { ...opts, query: "?sim=1" });

const HTTP_BASE = `http://localhost:${Number(process.env.PORT) || 8123}/`;

// Serves jsDelivr's three.js from node_modules at CONTEXT level, so requests made by the
// service worker are intercepted too (needs PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1, set in the config).
async function routeThree(context) {
  await context.route("https://cdn.jsdelivr.net/**", async route => {
    const file = path.join(THREE_DIR, route.request().url().split("/").pop());
    if (!fs.existsSync(file)) return route.abort();
    await route.fulfill({ path: file, contentType: "application/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
  });
}

// Like openGame(), but over http from scripts/serve.js (the webServer in playwright.config.js),
// so the service worker and the manifest work. `query` is appended to the URL (e.g. "?standalone=1").
async function openGameHttp(page, { lang = "en", query = "", clearStorage = true } = {}) {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await routeThree(page.context());
  await page.addInitScript(strictRng);
  if (clearStorage) {
    await page.addInitScript(clearOnce, lang);
  }
  await page.goto(HTTP_BASE + query);
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
  return errors;
}

// Waits for two animation frames, so the 2D layer has redrawn after a state change.
async function frames(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function step(page, seconds) {
  await page.evaluate(sec => { for (let i = 0; i < Math.round(sec * 60); i++) window.__bb.update(1 / 60); }, seconds);
}

// SPEC-018: a cheap expect for checks inside loops. Every Playwright expect() records a test step (with a stack), a few ms
// each; the level-type tests made thousands of them (rooms: 37 s). soft(value, message).toBe(…) etc. only collects the
// failures; soft.done() asserts once with every failure in the message. Same matchers and the same meaning as expect
// (toBe = Object.is, toEqual = deep equality that ignores key order and undefined properties).
function softly() {
  const fails = [];
  const same = (a, b) => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
  };
  // like expect().toMatchObject: every key of `want` matches (objects recursively, arrays element by element), extra keys allowed
  const sub = (got, want) => {
    if (!want || typeof want !== "object") return Object.is(got, want);
    if (!got || typeof got !== "object" || Array.isArray(got) !== Array.isArray(want)) return false;
    if (Array.isArray(want) && got.length !== want.length) return false;
    return Object.keys(want).every(k => sub(got[k], want[k]));
  };
  const show = v => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const soft = (got, msg = "") => {
    const matchers = neg => {
      const m = (ok, want) => { if (ok === neg) fails.push(`${msg}: got ${show(got)}, want ${neg ? "not " : ""}${want}`); };
      return {
        toBe: v => m(Object.is(got, v), show(v)),
        toEqual: v => m(same(got, v), show(v)),
        toMatchObject: v => m(sub(got, v), `to match ${show(v)}`),
        toBeTruthy: () => m(!!got, "truthy"),
        toBeNull: () => m(got === null, "null"),
        toContain: v => m(got != null && got.includes(v), `to contain ${show(v)}`),
        toBeGreaterThan: v => m(got > v, `> ${v}`),
        toBeGreaterThanOrEqual: v => m(got >= v, `>= ${v}`),
        toBeLessThan: v => m(got < v, `< ${v}`),
        toBeLessThanOrEqual: v => m(got <= v, `<= ${v}`),
        toBeCloseTo: (v, digits = 2) => m(Math.abs(got - v) < Math.pow(10, -digits) / 2, `≈ ${v}`)
      };
    };
    return { ...matchers(false), not: matchers(true) };
  };
  soft.fails = fails;
  soft.done = () => expect(fails, fails.slice(0, 20).join("\n")).toEqual([]);
  return soft;
}

// SPEC-018: one game page shared by the tests of a file (a fresh page costs ~2 s of load per test). At most ONE shared
// page is open: a second open game page keeps rendering 3D in software and makes every other test 3–5× slower, so
// get() with another key closes the old page first, and a spec closes it before any fresh-page test and in afterAll.
// get(browser, key, contextOptions, open) → { page, errors }; open(page) loads the game and returns its error list.
function sharedPage() {
  let cur = null;
  const close = async () => { if (cur) { const c = cur; cur = null; await c.ctx.close(); } };
  const get = async (browser, key, contextOptions, open) => {
    if (cur && cur.key !== key) await close();
    if (!cur) {
      const ctx = await browser.newContext(contextOptions), page = await ctx.newPage();
      cur = { key, ctx, page, errors: await open(page) };
    }
    return cur;
  };
  return { get, close };
}

// SPEC-018: puts a shared game page back to the state of a freshly opened one: localStorage as openGame leaves it
// (only the language), English, fresh progress and names, no gamepad stubs, an empty level cache, Park 1 in the menu,
// unseeded gameplay randomness and the autopilot off (SPEC-008), the skin picker back to the default looks (SPEC-009).
// Tests still restore any CFG value they change (the fixtures check CFG is unchanged after each test). Not reset: held
// gamepad buttons (a gamepad test releases its buttons at the end), mute and the phone camera zoom.
async function resetGame(page) {
  await page.evaluate(() => {
    const b = window.__bb;
    delete navigator.getGamepads; window.__pads = [];          // gamepad stubs some tests leave behind
    b.setLang("en"); b.clearLevelCache(); b.resetBannerTimer(); b.mode = "menu"; b.seedRandom(); b.autopilot(false, "careful");   // SPEC-008: unseeded, no autopilot, default style
    for (const s of ["p1", "p2", "big", "bot1", "bot2", "bot3", "bot4"]) b.setName(s, "");
    b.world = "park"; b.resetProgress(); b.resetProgress();   // two calls, like the button: fresh progress, level 1
    b.resetOutfits();                                          // SPEC-009: default looks, nothing tried on
    b.world = "park"; b.level = 1; b.resetWorld(1); b.mode = "menu";
    for (let i = 0; i < 60; i++) b.updateMinimapFade(1 / 60);    // phone: the mini-map fully back (no-op on desktop)
    try { localStorage.clear(); localStorage.setItem("bebebe-lang", "en"); localStorage.setItem("bb-test-init", "1"); } catch (e) { /* ok */ }
  });
}

// Puts player 1 right behind a calm Big One so the next update() makes a hug.
async function setupHug(page) {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
  });
}

module.exports = { openGame, openSim, openGameHttp, routeThree, frames, step, setupHug, softly, sharedPage, resetGame, GAME_URL, HTTP_BASE, ROOT };
