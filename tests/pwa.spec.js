// SPEC-001: installable PWA (manifest, icons, iOS metas, safe areas, service worker, offline,
// standalone mode, install hint). Most tests run over http (scripts/serve.js, the webServer).
// Notes: jsDelivr is routed at context level (routeThree) so the service worker's requests are
// intercepted too; that needs PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 (set in playwright.config.js).
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { openGame, openGameHttp, routeThree, frames, step, HTTP_BASE, ROOT } = require("./helpers");
const { makeServer } = require("../scripts/serve");

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SW_FILE = path.join(ROOT, "sw.js");
const SW_SRC = fs.existsSync(SW_FILE) ? fs.readFileSync(SW_FILE, "utf8") : "";
const SW_VERSION = (SW_SRC.match(/const SW_VERSION\s*=\s*"([^"]+)"/) || [])[1];

// PNG width/height from the IHDR chunk
function pngSize(file) {
  const b = fs.readFileSync(file);
  expect(b.slice(1, 4).toString()).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function waitForSW(page) {
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 30_000 });
}

test("manifest is linked and complete", async ({ page, request }) => {
  await openGameHttp(page);
  const href = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href"));
  expect(href).toBe("manifest.webmanifest");
  const res = await request.get(HTTP_BASE + href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const m = await res.json();
  expect(m).toMatchObject({
    name: "BeBeBe Atrapar", short_name: "BeBeBe", start_url: "./", scope: "./",
    display: "standalone", orientation: "landscape", background_color: "#2b3a2e", theme_color: "#2b3a2e"
  });
  const icon = (sizes, purpose) => m.icons.find(i => i.sizes === sizes && i.purpose === purpose && i.type === "image/png");
  expect(icon("192x192", "any")).toBeTruthy();
  expect(icon("512x512", "any")).toBeTruthy();
  expect(icon("512x512", "maskable")).toBeTruthy();
  for (const i of m.icons) expect((await request.get(HTTP_BASE + i.src)).status()).toBe(200);
});

test("icons exist with the right sizes", async ({ page }) => {
  const dir = path.join(ROOT, "icons");
  expect(fs.existsSync(path.join(dir, "icon.svg"))).toBe(true);
  expect(fs.existsSync(path.join(ROOT, "scripts", "make-icons.js"))).toBe(true);
  const want = { "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512, "icon-512-maskable.png": 512 };
  for (const [name, size] of Object.entries(want)) expect(pngSize(path.join(dir, name)), name).toEqual({ w: size, h: size });
  // apple-touch-icon and the maskable icon are fully opaque (iOS shows transparency as black)
  await page.goto(HTTP_BASE + "icons/icon.svg");
  for (const name of ["apple-touch-icon.png", "icon-512-maskable.png"]) {
    const minAlpha = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let min = 255; for (let i = 3; i < d.length; i += 4) min = Math.min(min, d[i]);
      return min;
    }, name);
    expect(minAlpha, name).toBe(255);
  }
});

test("iOS home-screen metas are present", async ({ page }) => {
  await openGameHttp(page);
  const head = await page.evaluate(() => {
    const meta = n => document.querySelector(`meta[name="${n}"]`)?.getAttribute("content");
    return {
      touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
      capable: meta("apple-mobile-web-app-capable"),
      status: meta("apple-mobile-web-app-status-bar-style"),
      title: meta("apple-mobile-web-app-title"),
      viewport: meta("viewport")
    };
  });
  expect(head.touchIcon).toBe("icons/apple-touch-icon.png");
  expect(head.capable).toBe("yes");
  expect(head.status).toBe("black-translucent");
  expect(head.title).toBe("BeBeBe");
  expect(head.viewport).toContain("viewport-fit=cover");
});

test("game fills the viewport minus the safe-area padding", async ({ page }) => {
  const errors = await openGame(page);
  // the stylesheet pads body with the safe-area insets
  const css = await page.evaluate(() => [...document.querySelectorAll("style")].map(s => s.textContent).join("\n"));
  for (const side of ["top", "right", "bottom", "left"]) expect(css).toContain(`env(safe-area-inset-${side}`);
  const box = () => page.evaluate(() => { const r = document.getElementById("wrap").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  // desktop: insets are 0, size unchanged (960×640 viewport → 960×640 game)
  expect(await box()).toMatchObject({ w: 960, h: 640 });
  // emulate a notch + home indicator: top 40, right 30, bottom 20, left 50 → space 880×580
  await page.evaluate(() => { document.body.style.padding = "40px 30px 20px 50px"; window.dispatchEvent(new Event("resize")); });
  const b = await box();
  const s = Math.min(880 / 960, 580 / 640);
  expect(b.w).toBe(Math.floor(960 * s));
  expect(b.h).toBe(Math.floor(640 * s));
  expect(b.x).toBeGreaterThanOrEqual(50);
  expect(b.y).toBeGreaterThanOrEqual(40);
  expect(b.x + b.w).toBeLessThanOrEqual(960 - 30);
  expect(b.y + b.h).toBeLessThanOrEqual(640 - 20);
  expect(errors).toEqual([]);
});

test("service worker registers and controls the page over http", async ({ page }) => {
  const errors = await openGameHttp(page);
  await waitForSW(page);
  expect(SW_VERSION).toBeTruthy();
  const keys = await page.evaluate(async v => (await (await caches.open(v)).keys()).map(r => r.url), SW_VERSION);
  for (const u of ["", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/apple-touch-icon.png",
    "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"]) expect(keys).toContain(HTTP_BASE + u);
  expect(keys).toContain("https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js");
  expect(keys).toContain("https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.js");
  expect(errors).toEqual([]);
});

test("old caches are removed on a new SW_VERSION", async ({ page }) => {
  // The browser's own fetch of sw.js (update check) is not routable, so this test runs its own
  // server instance that can switch sw.js to a new version.
  let nextVersion = null;
  const server = makeServer({
    override: p => (p === "/sw.js" && nextVersion ? SW_SRC.replace(/const SW_VERSION\s*=\s*"[^"]+"/, `const SW_VERSION = "${nextVersion}"`) : null)
  });
  await new Promise(r => server.listen(0, r));
  try {
    const base = `http://localhost:${server.address().port}/`;
    await routeThree(page.context());
    await page.goto(base);
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    await waitForSW(page);
    expect(await page.evaluate(() => caches.keys())).toEqual([SW_VERSION]);
    await page.evaluate(() => caches.open("bebebe-v0"));             // a cache of an older version
    nextVersion = "bebebe-test-v2";
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 30_000 }).toEqual(["bebebe-test-v2"]);
  } finally {
    server.close();
  }
});

test("no service worker and no errors on file://", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForTimeout(500);
  const sw = await page.evaluate(async () => {
    try { return navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0; } catch (e) { return 0; }
  });
  expect(sw).toBe(0);
  expect(errors).toEqual([]);
});

test("a refused registration (like the claude.ai page) is silent", async ({ page }) => {
  await page.addInitScript(() => {
    try { navigator.serviceWorker.register = () => Promise.reject(new DOMException("refused", "SecurityError")); } catch (e) { /* ok */ }
  });
  const errors = await openGameHttp(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(false);
  expect(errors).toEqual([]);
});

test("the game starts offline after the first visit", async ({ page, context }) => {
  const errors = await openGameHttp(page);
  await waitForSW(page);
  // network gone: the browser is offline and jsDelivr does not answer either
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.route("https://cdn.jsdelivr.net/**", route => route.abort("internetdisconnected"));
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__bb.startGame(1));
  await step(page, 5);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
  expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
});

test("fullscreen button is hidden in standalone mode", async ({ page }) => {
  await openGameHttp(page);
  await page.evaluate(() => window.__bb.startGame(1));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.isStandalone())).toBe(false);
  expect(await page.evaluate(() => window.__bb.buttonNames)).toContain("toggleFullscreen");

  await openGameHttp(page, { query: "?standalone=1" });
  await page.evaluate(() => window.__bb.startGame(1));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.isStandalone())).toBe(true);
  expect(await page.evaluate(() => window.__bb.buttonNames)).not.toContain("toggleFullscreen");
});

test("install hint texts exist in every language", async ({ page }) => {
  await openGameHttp(page);
  const t = await page.evaluate(() => Object.fromEntries(Object.entries(window.__bb.I18N).map(([k, v]) => [k, v.installHint])));
  expect(t).toEqual({
    en: "Install on iPhone: Share ⬆️ → Add to Home Screen",
    es: "Instalala en el iPhone: Compartir ⬆️ → Agregar a pantalla de inicio",
    ru: "Установить на iPhone: Поделиться ⬆️ → На экран «Домой»"
  });
});

test("install hint is not shown on desktop", async ({ page }) => {
  await openGameHttp(page);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("menu");
  expect(await page.evaluate(() => window.__bb.installHintShown)).toBe(false);
});

test.describe("on iPhone Safari", () => {
  test.use({ userAgent: IPHONE_UA, hasTouch: true });

  test("install hint shows on iPhone Safari only", async ({ page }) => {
    const errors = await openGameHttp(page);
    for (const lang of ["en", "es", "ru"]) {
      await page.evaluate(l => window.__bb.setLang(l), lang);
      await frames(page);
      expect(await page.evaluate(() => window.__bb.installHintShown), lang).toBe(true);
    }
    // only in the menu
    await page.evaluate(() => { window.__bb.mode = "shop"; });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.installHintShown)).toBe(false);
    // not in the installed app
    await openGameHttp(page, { query: "?standalone=1" });
    await frames(page);
    expect(await page.evaluate(() => window.__bb.installHintShown)).toBe(false);
    expect(errors).toEqual([]);
  });
});
