// Shared helpers for the game tests.
// - openGame(): opens index.html over http (scripts/serve.js, the webServer of playwright.config.js; SPEC-011 AC 8; three.js is
//   vendored since SPEC-025, so nothing comes from the internet), collects page errors, waits until the game says it is ready
//   (window.__bbReady) and seeds the game rng from the test's title (SPEC-011 AC 8d, testSeed()).
// - step(page, seconds): advances the game logic by N seconds at 60 fps, without waiting in real time.
// - openGameHttp(): the same at the site root, for the PWA tests (service worker, manifest).
// The game exposes a debug object window.__bb (mode, littles, big, items, progress, update, startGame, ...).
const path = require("path");
const fs = require("fs");
const { expect, test } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
// SPEC-011 AC 8: every test opens the game over http (the webServer of playwright.config.js serves the repo root here);
// scripts outside the Playwright runner (balance.js) start their own makeServer() and pass `base`.
const HTTP_BASE = `http://localhost:${Number(process.env.PORT) || 8123}/`;
// SPEC-028: the game's languages in the globe's order (= __bb.LANGS); fit and coverage loops go over all of them
const LANGS = ["en", "es", "pt", "ru"];

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
// SPEC-011 AC 8d (init script): the game seeds its rng from window.__bbSeed at start, so its start-up resetWorld is seeded too
function bootSeed(seed) { window.__bbSeed = seed; }

// `query` is appended to the URL (e.g. "?phone=1"). SPEC-023: `sim: true` opens the game in sim mode (adds sim=1 to the
// query, so "?phone=1" + sim → "?phone=1&sim=1"): no 3D, no 2D drawing, no audio, the frame loop does not play — for tests
// that check logic or numbers only; they advance the game with step() / __bb.update / __bb.simRun. Drawing helpers
// (frames(), page.screenshot()) and the per-frame drawn state of __bb (buttonRects, hudRects, …) throw in sim mode.
// SPEC-023: a run at below-normal priority on a busy machine can need longer than 30 s to load the game
const READY_MS = process.env.PW_NICE === "0" ? 30_000 : 60_000;
const withSim = (query, sim) => (sim ? query + (query.includes("?") ? "&" : "?") + "sim=1" : query);
// SPEC-022: the very first launch opens the start comic (mode "scene"); the tests start on the home screen instead — the init
// script sets window.__bbNoIntro, which the game reads at start. `intro: true` = a real first launch (the first-launch test).
function noIntro() { window.__bbNoIntro = true; }
// SPEC-029: the tutorial after the intro on the first launch — skipped the same way (window.__bbNoTutorial); `tutorial: true` = its own tests
function noTutorial() { window.__bbNoTutorial = true; }

// SPEC-011 AC 8d: every test game is seeded before it starts. The seed is a stable hash (FNV-1a) of the test's file name and
// title path, so a test plays the same game on every run and machine; openGame / openGameHttp / resetGame / reloadGame seed
// with it (openGame / openGameHttp also before the boot: window.__bbSeed), and ./pw prints it when the test fails
// (annotation "seed"). Outside a test (scripts) → null: the script seeds itself.
function titleSeed(file, titles) {
  let h = 0x811c9dc5;
  for (const ch of [path.basename(file), ...titles].join(" › ")) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function testSeed() {
  let info;
  try { info = test.info(); } catch (e) { return null; }
  const seed = titleSeed(info.file, info.titlePath.slice(1));
  if (!info.annotations.some(a => a.type === "seed")) info.annotations.push({ type: "seed", description: String(seed) });
  return seed;
}
// Seeds the game rng of an open, ready page with the test's seed (no-op outside a test).
async function seedGame(page) {
  const seed = testSeed();
  if (seed != null) await page.evaluate(s => { window.__bb.seedRandom(s); }, seed);
  return seed;
}
// A reload starts the game again with an unseeded rng: reload, wait until it is ready, seed again.
async function reloadGame(page) {
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: READY_MS });
  return seedGame(page);
}

// `base` (SPEC-011 AC 8): the site URL with a trailing slash — HTTP_BASE by default; scripts pass their own server's.
async function openGame(page, { lang = "en", clearStorage = true, query = "", sim = false, intro = false, tutorial = false, base = HTTP_BASE } = {}) {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.addInitScript(strictRng);
  if (testSeed() != null) await page.addInitScript(bootSeed, testSeed());
  if (!intro) await page.addInitScript(noIntro);
  if (!tutorial) await page.addInitScript(noTutorial);
  if (clearStorage) {
    await page.addInitScript(clearOnce, lang);
  }
  if (sim) guardSim(page);
  await page.goto(base + "index.html" + withSim(query, sim));
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: READY_MS });
  await seedGame(page);
  return errors;
}

// SPEC-008: the game in sim mode — the balance tests and scripts/balance.js open it the same way (SPEC-023: = sim: true)
const openSim = (page, opts = {}) => openGame(page, { ...opts, sim: true });

// SPEC-023 AC 5: a page opened in sim mode draws nothing, so a screenshot of it tests nothing — it throws instead.
// (frames() and the drawn state of __bb check the page itself; see frames() and SIM_DRAWN in src/client/debug.js.)
function guardSim(page) {
  page.screenshot = async () => { throw new Error("sim mode: nothing is drawn — a test that takes a screenshot needs a rendered page (openGame without sim)"); };
}

// Like openGame(), but at the site root (HTTP_BASE + query). SPEC-011 AC 8b: Playwright blocks service workers by default (playwright.config.js); a spec
// that needs the service worker allows it with test.use({ serviceWorkers: "allow" }) (pwa.spec.js does).
// `query` is appended to the URL (e.g. "?standalone=1").
async function openGameHttp(page, { lang = "en", query = "", clearStorage = true, intro = false, tutorial = false } = {}) {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.addInitScript(strictRng);
  if (testSeed() != null) await page.addInitScript(bootSeed, testSeed());
  if (!intro) await page.addInitScript(noIntro);
  if (!tutorial) await page.addInitScript(noTutorial);
  if (clearStorage) {
    await page.addInitScript(clearOnce, lang);
  }
  await page.goto(HTTP_BASE + query);
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: READY_MS });
  await seedGame(page);
  return errors;
}

// Waits for two animation frames, so the 2D layer has redrawn after a state change.
// SPEC-023 AC 5: in sim mode the frame loop draws nothing (and plays no logic), so waiting for frames there means the
// test checks drawing on a page that does not draw — it throws.
async function frames(page) {
  await page.evaluate(() => {
    if (window.__bb && window.__bb.sim().on) throw new Error("sim mode: frames() waits for drawing, but nothing is drawn — this test needs a rendered page (openGame without sim)");
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
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
// rendered page is open: a second open game page keeps rendering 3D in software and makes every other test 3–5× slower, so
// get() with another key closes the old page first, and a spec closes it before any fresh-page test and in afterAll.
// SPEC-023: a page in sim mode draws nothing, so a spec keeps its sim pages in a second sharedPage() next to the rendered one.
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
// (only the language), English, fresh progress and names, no gamepad stubs, an empty level cache, Park 1 on the home screen,
// the gameplay randomness seeded from the test's title (SPEC-011 AC 8d) and the autopilot off (SPEC-008), the skin picker back to the default looks (SPEC-009),
// the menu screens' own state as at start (SPEC-017 resetMenus: shop tab, wardrobe page, where the shop goes back to).
// Tests still restore any CFG value they change (the fixtures check CFG is unchanged after each test). Not reset: held
// gamepad buttons (a gamepad test releases its buttons at the end), mute and the phone camera zoom.
async function resetGame(page) {
  await page.evaluate(seed => {
    const b = window.__bb;
    b.resetMenus();                                            // SPEC-029: no tutorial left running (resetWorld below builds a normal level)
    delete navigator.getGamepads; window.__pads = [];          // gamepad stubs some tests leave behind
    b.setLang("en"); b.clearLevelCache(); b.resetBannerTimer(); b.mode = "home"; b.seedRandom(seed); b.autopilot(false, "careful");   // SPEC-011 AC 8d: seeded; no autopilot, default style
    for (const s of ["p1", "p2", "big", "bot1", "bot2", "bot3", "bot4"]) b.setName(s, "");
    b.world = "park"; b.resetProgress(); b.resetProgress();   // two calls, like the button: fresh progress, level 1
    b.resetOutfits();                                          // SPEC-009: default looks, nothing tried on
    b.world = "park"; b.level = 1; b.resetWorld(1); b.mode = "home"; b.resetMenus();   // SPEC-017: home, the menus' state as at start
    for (let i = 0; i < 60; i++) b.updateMinimapFade(1 / 60);    // phone: the mini-map fully back (no-op on desktop)
    b.seedRandom(seed);                                         // again: the test's first game starts from the seed itself
    try { localStorage.clear(); localStorage.setItem("bebebe-lang", "en"); localStorage.setItem("bb-test-init", "1"); } catch (e) { /* ok */ }
  }, testSeed());
}

// SPEC-011 AC 8c: the game's code as one text — every src/**/*.js file (index.html is only the shell since Phase C) — for the
// tests that scan the source (art names, Math.random, lookbehind, …).
function gameSource() {
  const walk = d => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
  return walk(path.join(ROOT, "src")).sort().map(f => fs.readFileSync(f, "utf8")).join("\n");
}

// Puts player 1 right behind a calm Big One so the next update() makes a hug.
async function setupHug(page) {
  await page.evaluate(() => {
    const b = window.__bb, big = b.big, l = b.littles[0];
    Object.assign(big, { state: "look", timer: 999, stun: 0, hugCd: 0, noPush: 0, slip: 0, pushCd: 0, x: 500, y: 320, dir: 0 });
    Object.assign(l, { state: "ok", hugCd: 0, hugAnim: 0, invuln: 0, kx: 0, ky: 0, x: 500 - 34, y: 320 });
  });
}

// SPEC-031: the floor (CSS px) of a textSizes kind on the phone; floors = __bb.textFloors (CFG.PHONE_TEXT + story = STORY_TEXT_MIN);
// "drawn" (label/fitText) counts against the hint floor. A kind with no floor throws, so a new kind cannot slip past the checks.
function textFloor(floors, cat) {
  const v = cat === "drawn" ? floors.hint : floors[cat];
  if (typeof v !== "number") throw new Error(`no phone text floor for the kind "${cat}" (add it to __bb.textFloors)`);
  return v;
}

module.exports = { gameSource, textFloor, LANGS, openGame, openSim, openGameHttp, frames, step, setupHug, softly, sharedPage, resetGame, seedGame, reloadGame, testSeed, titleSeed, HTTP_BASE, ROOT };
