// Shared helpers for the game tests.
// - openGame(): opens index.html from disk, serves three.js from node_modules (no internet needed),
//   collects page errors, waits until the game says it is ready (window.__bbReady).
// - step(page, seconds): advances the game logic by N seconds at 60 fps, without waiting in real time.
// - openGameHttp(): the same over http (scripts/serve.js), for the PWA tests (service worker, manifest).
// The game exposes a debug object window.__bb (mode, littles, big, items, progress, update, startGame, ...).
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const GAME_URL = "file://" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const THREE_DIR = path.join(ROOT, "node_modules", "three", "build");

// Init script (runs before every document of the page): clears localStorage once per test and sets the language.
// A reload never clears: on CI the sessionStorage flag alone was sometimes gone after page.reload(),
// so saved data vanished in the "survives a reload" tests.
function clearOnce(l) {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") return;
    if (sessionStorage.getItem("bb-test-init")) return;
    localStorage.clear(); localStorage.setItem("bebebe-lang", l); sessionStorage.setItem("bb-test-init", "1");
  } catch (e) { /* ok */ }
}

async function openGame(page, { lang = "en", clearStorage = true } = {}) {
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
  await page.goto(GAME_URL);
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

// Puts player 1 right behind a calm Big One so the next update() makes a hug.
async function setupHug(page) {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
  });
}

module.exports = { openGame, openGameHttp, routeThree, frames, step, setupHug, GAME_URL, HTTP_BASE, ROOT };
