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
  if (clearStorage) {
    await page.addInitScript(clearOnce, lang);
  }
  await page.goto(GAME_URL + query);
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
  return errors;
}

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
  const show = v => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const soft = (got, msg = "") => {
    const matchers = neg => {
      const m = (ok, want) => { if (ok === neg) fails.push(`${msg}: got ${show(got)}, want ${neg ? "not " : ""}${want}`); };
      return {
        toBe: v => m(Object.is(got, v), show(v)),
        toEqual: v => m(same(got, v), show(v)),
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

// Puts player 1 right behind a calm Big One so the next update() makes a hug.
async function setupHug(page) {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
  });
}

module.exports = { openGame, openGameHttp, routeThree, frames, step, setupHug, softly, GAME_URL, HTTP_BASE, ROOT };
