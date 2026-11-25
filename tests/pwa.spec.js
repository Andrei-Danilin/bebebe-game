// SPEC-001: installable PWA (manifest, icons, iOS metas, safe areas, service worker, offline,
// standalone mode, install hint). Most tests run over http (scripts/serve.js, the webServer).
// SPEC-011 AC 8b: playwright.config.js blocks service workers for every other spec; this one allows them.
// SPEC-025 AC 1: three.js is vendored (vendor/three/), so nothing is routed: the tests load exactly the files players get.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { openGame, openGameHttp, frames, step, reloadGame, HTTP_BASE, ROOT } = require("./helpers");
const { makeServer } = require("../scripts/serve");

test.use({ serviceWorkers: "allow" });

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SW_FILE = path.join(ROOT, "sw.js");
const SW_SRC = fs.existsSync(SW_FILE) ? fs.readFileSync(SW_FILE, "utf8") : "";
const SW_VERSION = (SW_SRC.match(/const SW_VERSION\s*=\s*"([^"]+)"/) || [])[1];
// SPEC-020: the hash of the art sprites (npm run assets); SPEC-011 AC 9: the hash of the module set (npm run precache)
const ASSETS_HASH = (SW_SRC.match(/const ASSETS_HASH\s*=\s*"([^"]+)"/) || [])[1];
const SRC_HASH = (SW_SRC.match(/const SRC_HASH\s*=\s*"([^"]+)"/) || [])[1];
const THREE_VERSION = (SW_SRC.match(/const THREE_VERSION\s*=\s*"([^"]+)"/) || [])[1];
// SPEC-011 AC 9: three caches — the shell + modules by SRC_HASH, the sprites by ASSETS_HASH, three.js by its version
const CACHE_SRC = SW_VERSION + "-src-" + SRC_HASH, CACHE_ASSETS = SW_VERSION + "-assets-" + ASSETS_HASH, CACHE_THREE = "bebebe-three-" + THREE_VERSION;
// the string items of a `const NAME = [ … ];` list in sw.js
const swList = name => { const m = SW_SRC.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`)); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : []; };
const precache = require("../scripts/precache");

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
    display: "standalone", orientation: "landscape", background_color: "#faf4e2", theme_color: "#faf4e2"
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

// a layout test, no service worker needed: blocked like in the other specs (SPEC-011 review)
test.describe(() => {
  test.use({ serviceWorkers: "block" });
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
});

test("service worker registers and controls the page over http", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGameHttp(page);
  await waitForSW(page);
  // SPEC-025 AC 12: derived by npm run precache — the game version + the build counter (tests/tooling.spec.js)
  expect(SW_VERSION).toBe(`bebebe-${JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version}-b${(SW_SRC.match(/const SW_BUILD = (\d+);/) || [])[1]}`);
  expect(ASSETS_HASH && SRC_HASH && THREE_VERSION).toBeTruthy();
  // SPEC-011 AC 9: exactly the three caches
  expect((await page.evaluate(() => caches.keys())).sort()).toEqual([CACHE_ASSETS, CACHE_SRC, CACHE_THREE].sort());
  const keysOf = name => page.evaluate(async v => (await (await caches.open(v)).keys()).map(r => r.url), name);
  const src = await keysOf(CACHE_SRC), three = await keysOf(CACHE_THREE), art = await keysOf(CACHE_ASSETS);
  for (const u of ["", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/apple-touch-icon.png",
    "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"]) expect(src).toContain(HTTP_BASE + u);
  // the shell's modules, at their versioned URLs, and the marker of a complete install
  expect(swList("PRECACHE_SRC").length).toBeGreaterThan(20);
  expect(swList("PRECACHE_SRC").filter(u => !src.includes(HTTP_BASE + u.slice(2))), "modules not in the src cache").toEqual([]);
  expect(src).toContain(HTTP_BASE + "__installed__");
  expect(three.sort()).toEqual(swList("PRECACHE_THREE").map(u => HTTP_BASE + u.slice(2)).sort());   // SPEC-025: the vendored files
  expect(three.map(u => u.replace(/\?v=[0-9a-f]{10}$/, "")).sort()).toEqual([HTTP_BASE + "vendor/three/three.core.js", HTTP_BASE + "vendor/three/three.module.js"]);
  // SPEC-020: every art sprite is precached too (the list npm run assets writes into sw.js)
  const sprites = await page.evaluate(() => window.__bb.ART_NAMES);
  expect(sprites.filter(n => !art.includes(HTTP_BASE + "assets/" + n + ".webp"))).toEqual([]);
  expect(errors).toEqual([]);
});

// The browser's own fetches of sw.js and of a controlled page are not routable the way we need, so
// these tests run their own server instance; override(path) can swap a file's content or status.
async function withOwnServer(page, override, fn) {
  const server = makeServer({ override: p => override.fn(p) });
  await new Promise(r => server.listen(0, r));
  try {
    const base = `http://localhost:${server.address().port}/`;
    await page.goto(base);
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    await waitForSW(page);
    await fn(base);
  } finally {
    server.close();
  }
}
const INDEX_SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// SPEC-025 AC 1 (replaces SPEC-011's "sw.js precaches the same three.js version index.html imports"): the game imports the
// vendored three.js through the import map, the service worker caches exactly those files under the vendored version, and the
// vendored build is the version of package.json / node_modules (same REVISION, same exports) — Dependabot cannot bump one alone
test("the vendored three.js is the version of package.json and the service worker", { tag: "@fast" }, async () => {
  const map = JSON.parse((INDEX_SRC.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1] || "{}").imports || {};
  expect(map.three, "the import map's three is the vendored module").toMatch(/^\.\/vendor\/three\/three\.module\.js\?v=[0-9a-f]{10}$/);
  expect(map["./vendor/three/three.core.js"], "the core file the module imports, versioned too").toMatch(/^\.\/vendor\/three\/three\.core\.js\?v=[0-9a-f]{10}$/);
  expect(swList("PRECACHE_THREE").sort(), "sw.js caches exactly the imported files").toEqual([map.three, map["./vendor/three/three.core.js"]].sort());
  const rev = (fs.readFileSync(path.join(ROOT, "vendor", "three", "three.core.js"), "utf8").match(/\bREVISION\s*=\s*"(\d+)"/) || [])[1];
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).devDependencies.three;
  const installed = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", "three", "package.json"), "utf8")).version;
  expect(THREE_VERSION, "sw.js THREE_VERSION = r<REVISION> of the vendored build").toBe("r" + rev);
  expect(pkg, "package.json pins three exactly").toMatch(/^\d+\.\d+\.\d+$/);
  expect(installed, "node_modules/three = package.json").toBe(pkg);
  expect(pkg.split(".")[1], "the vendored REVISION = the minor of three in package.json").toBe(rev);
  // the same build: the vendored minified module exports exactly what node_modules' three.module.js exports
  const imp = f => import(require("url").pathToFileURL(f).href);
  const [vendored, npm] = await Promise.all([imp(path.join(ROOT, "vendor", "three", "three.module.js")), imp(path.join(ROOT, "node_modules", "three", "build", "three.module.js"))]);
  expect(Object.keys(vendored).sort()).toEqual(Object.keys(npm).sort());
  expect(vendored.REVISION).toBe(npm.REVISION);
  expect(fs.existsSync(path.join(ROOT, "vendor", "three", "LICENSE")), "the MIT licence ships with it").toBe(true);
});

// SPEC-011 AC 9: the cache rotation with three kinds of caches. A new version keeps the caches of the version before (a page of
// it may still be open) and deletes older ones and old-style names; three.js is kept while its version is the same; other apps
// on the origin are never touched
test("old caches are removed on a new SW_VERSION", async ({ page }) => {
  test.slow();                       // installs two more service workers: slow under load
  const ov = { fn: () => null };
  const keys = () => page.evaluate(async () => (await caches.keys()).sort());
  const version = v => SW_SRC.replace(/const SW_VERSION\s*=\s*"[^"]+"/, `const SW_VERSION = "${v}"`);
  const update = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await withOwnServer(page, ov, async () => {
    expect(await keys()).toEqual([CACHE_ASSETS, CACHE_SRC, CACHE_THREE].sort());
    // an old-style name, the old jsDelivr three.js cache (SPEC-025: removed) + another app
    await page.evaluate(() => Promise.all([caches.open("bebebe-v0"), caches.open("bebebe-three-0.187.0"), caches.open("other-pages-app")]));
    ov.fn = p => (p === "/sw.js" ? version("bebebe-test-v2") : null);
    await update();
    const v2 = ["bebebe-test-v2-assets-" + ASSETS_HASH, "bebebe-test-v2-src-" + SRC_HASH];
    await expect.poll(keys, { timeout: 60_000 }).toEqual([...v2, CACHE_ASSETS, CACHE_SRC, CACHE_THREE, "other-pages-app"].sort());
    ov.fn = p => (p === "/sw.js" ? version("bebebe-test-v3") : null);
    await update();
    await expect.poll(keys, { timeout: 60_000 }).toEqual(["bebebe-test-v3-assets-" + ASSETS_HASH, "bebebe-test-v3-src-" + SRC_HASH, ...v2, CACHE_THREE, "other-pages-app"].sort());
  });
});

// SPEC-011 AC 9: the module list of sw.js is every module on disk at its content hash; the shell list comes from the one site
// list (scripts/site.js SITE through npm run precache)
test("precache lists every module", { tag: "@fast" }, () => {
  const onDisk = precache.lists().modules;
  expect(onDisk.length).toBeGreaterThan(20);
  expect(swList("PRECACHE_SRC"), "sw.js PRECACHE_SRC: run npm run precache").toEqual(onDisk.map(m => `${m.url}?v=${m.hash}`));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
  expect(swList("PRECACHE_SRC").map(u => u.replace(/\?v=[0-9a-f]{10}$/, "")).sort(), "every src/**/*.js").toEqual(walk(path.join(ROOT, "src")).map(f => "./" + path.relative(ROOT, f).replace(/\\/g, "/")).sort());
  expect(swList("PRECACHE_LOCAL"), "sw.js PRECACHE_LOCAL: the shell").toEqual(precache.lists().shell);
  expect(swList("PRECACHE_LOCAL")).toEqual(expect.arrayContaining(["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg"]));
});

// SPEC-011 AC 9: the import map pins every module URL to its hash (so a shell can only load its own module versions), the shell
// carries SRC_HASH in <meta name="src-hash"> like sw.js; committed hashes, map or SRC_HASH that do not match the files fail
// (rerun npm run precache — also after merging master); no dynamic import() in the game; ?v= lives only in the import map
test("the import map pins every module to its hash", { tag: "@fast" }, () => {
  const map = JSON.parse(INDEX_SRC.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const { modules, srcHash } = precache.lists();
  expect(Object.keys(map).sort()).toEqual(["three", "./vendor/three/three.core.js", ...modules.map(m => m.url)].sort());   // SPEC-025: + the vendored core
  for (const t of precache.lists().three) expect(map[t.url === precache.THREE_ENTRY ? "three" : t.url], t.url).toBe(`${t.url}?v=${t.hash}`);
  for (const m of modules) expect(map[m.url], m.url).toBe(`${m.url}?v=${precache.fileHash(path.join(ROOT, m.url))}`);
  expect((INDEX_SRC.match(/<meta name="src-hash" content="([^"]+)">/) || [])[1], "index.html src-hash").toBe(srcHash);
  expect(SRC_HASH, "sw.js SRC_HASH").toBe(srcHash);
  expect(precache.run({ check: true }).stale, "run npm run precache").toEqual([]);
  // the guard fires: one module's bytes changed → the map and SRC_HASH written from the files differ from the committed ones
  const L = precache.lists(), changed = { ...L, modules: L.modules.map((m, i) => (i ? m : { ...m, hash: "0000000000" })) };
  expect(precache.writeIndex(INDEX_SRC.split("\r\n").join("\n"), changed)).not.toBe(INDEX_SRC.split("\r\n").join("\n"));
  // the game never loads a module around the map, and no import names a version
  const { gameSource } = require("./helpers");
  const code = gameSource();
  expect(/\bimport\s*\(/.test(code), "no dynamic import() in the game").toBe(false);
  expect(code.match(/\bfrom\s+["'][^"']*\?v=/g), "?v= only in the import map").toBeNull();
});

// SPEC-011 AC 9: a changed module with its old version still cached — a new shell asks for the new URL (its hash) and gets the
// new module, never the cached old one: the page runs one version
const ART_FILE = "/src/client/art-names.js";
const ART_URL = "." + ART_FILE;
const newVersion = (marker = "new") => {
  const map = JSON.parse(INDEX_SRC.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const html = INDEX_SRC.replace(map[ART_URL], ART_URL + "?v=testnew001").replace(`<meta name="src-hash" content="${SRC_HASH}">`, "<meta name=\"src-hash\" content=\"testnew999\">");
  const art = fs.readFileSync(path.join(ROOT, ART_FILE), "utf8") + `\nglobalThis.__bbModuleVersion = "${marker}";\n`;
  return { html, art };
};
test("a new shell never loads an old module", async ({ page }) => {
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    const asked = [];
    page.on("request", r => { if (r.url().includes(ART_FILE)) asked.push(new URL(r.url()).search); });
    const v = newVersion();
    ov.fn = p => (p === "/index.html" ? v.html : p === ART_FILE ? v.art : null);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.evaluate(() => document.querySelector("meta[name=src-hash]").content)).toBe("testnew999");
    expect(await page.evaluate(() => window.__bbModuleVersion), "the new module, not the cached old one").toBe("new");
    expect(asked).toEqual(["?v=testnew001"]);
  });
});

// SPEC-025 AC 13 (the rollback runbook relies on it): the installed app (worker active) gets a broken deploy — a shell whose
// module throws at load: that launch shows the failed-start card, never a frozen screen. Then the fix (or a redeployed good
// tag) goes live: the next online launch runs the fixed version, not a cached broken one (index.html is network-first, a
// broken shell is never cached: its modules are not the worker's)
test("a broken shell is replaced on the next online launch", async ({ page }) => {
  test.slow();                       // serves three versions to an installed app
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    const map = JSON.parse(INDEX_SRC.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    const broken = {
      html: INDEX_SRC.replace(map[ART_URL], ART_URL + "?v=testbad001").replace(`<meta name="src-hash" content="${SRC_HASH}">`, "<meta name=\"src-hash\" content=\"testbad999\">"),
      art: fs.readFileSync(path.join(ROOT, ART_FILE), "utf8") + "\nthrow new Error(\"test: a broken build\");\n"
    };
    ov.fn = p => (p === "/index.html" || p === "/" ? broken.html : p === ART_FILE ? broken.art : null);
    await page.reload();
    await page.waitForSelector("#start-failed", { timeout: 30_000 });
    expect(await page.evaluate(() => [document.querySelector("meta[name=src-hash]").content, window.__bbReady === true]), "the broken deploy").toEqual(["testbad999", false]);
    // the fix is deployed: the next online launch runs it
    const fixed = newVersion("fixed");
    ov.fn = p => (p === "/index.html" || p === "/" ? fixed.html : p === ART_FILE ? fixed.art : null);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.evaluate(() => [document.querySelector("meta[name=src-hash]").content, window.__bbModuleVersion, !!document.getElementById("start-failed")]),
      "the fixed version runs").toEqual(["testnew999", "fixed", false]);
    await page.evaluate(() => { window.__bb.seedRandom(1); window.__bb.startGame(1); });
    await step(page, 1);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
  });
});

// SPEC-011 AC 9 (check of the fix round): the old worker is active; a new shell and a changed module are deployed, the new shell
// is fetched once online, and the phone goes offline before the new worker has installed (here its install cannot finish: one
// file of its list is missing). The fetched new shell was shown but not cached (no complete cache of its SRC_HASH), so the next
// launch starts the old version from the old cache — with all its modules
test("an offline launch after a half-installed update starts the old version", async ({ page, context }) => {
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    const v = newVersion();
    const sw = SW_SRC.replace(`const SRC_HASH = "${SRC_HASH}";`, "const SRC_HASH = \"testnew999\";")
      .replace(/"\.\/src\/client\/art-names\.js\?v=[0-9a-f]+"/, "\"./src/client/art-names.js?v=testnew001\", \"./src/client/not-deployed-yet.js?v=0\"");
    ov.fn = p => (p === "/index.html" ? v.html : p === ART_FILE ? v.art : p === "/sw.js" ? sw : null);
    await page.reload();                                       // online: the new version runs
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__bbModuleVersion)).toBe("new");
    await page.evaluate(async () => { try { await (await navigator.serviceWorker.getRegistration()).update(); } catch (e) { /* the install fails */ } });
    expect(await page.evaluate(async () => (await caches.keys()).filter(n => n.includes("testnew999")).length
      ? !!(await (await caches.open((await caches.keys()).find(n => n.includes("testnew999")))).match("./__installed__")) : false), "no complete cache of the new version").toBe(false);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.evaluate(() => document.querySelector("meta[name=src-hash]").content), "the old shell").toBe(SRC_HASH);
    expect(await page.evaluate(() => window.__bbModuleVersion), "the old modules").toBeUndefined();
    await page.evaluate(() => { window.__bb.seedRandom(1); window.__bb.startGame(1); });
    await step(page, 2);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
  });
});

// SPEC-011 review: a sprite-only deploy (same SRC_HASH, new ASSETS_HASH) keeps the complete code cache of the active version and
// downloads no module; and an install whose shell check fails (a half-deployed site) writes and deletes nothing
test("a sprite-only update keeps the code cache and downloads no module", async ({ page }) => {
  test.slow();                       // installs another service worker
  const ov = { fn: () => null }, asked = [];
  const keys = () => page.evaluate(async () => (await caches.keys()).sort());
  const srcState = () => page.evaluate(async n => { const c = await caches.open(n), k = await c.keys(); return { n: k.length, done: !!(await c.match("./__installed__")) }; }, CACHE_SRC);
  const settled = () => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !r.installing && !r.waiting; });
  const update = () => page.evaluate(async () => { try { await (await navigator.serviceWorker.getRegistration()).update(); } catch (e) { /* a failed install */ } });
  await withOwnServer(page, ov, async () => {
    const before = await srcState(), names = await keys();
    expect(before.done).toBe(true);
    const next = SW_SRC.replace(`const ASSETS_HASH = "${ASSETS_HASH}";`, "const ASSETS_HASH = \"testart0001\";");
    // 1. the site is half deployed: index.html belongs to another module set → the new worker does not install, nothing changes
    const other = INDEX_SRC.replace(`<meta name="src-hash" content="${SRC_HASH}">`, "<meta name=\"src-hash\" content=\"someother9\">");
    ov.fn = p => (p === "/sw.js" ? next : p === "/index.html" ? other : null);
    await update();
    await expect.poll(settled, { timeout: 30_000 }).toBe(true);
    expect(await keys(), "no cache written or deleted").toEqual(names);
    expect(await srcState()).toEqual(before);
    // 2. the right shell → the new worker installs: a new sprite cache, the same complete code cache, no module downloaded
    ov.fn = p => { if (p.startsWith("/src/")) asked.push(p); return p === "/sw.js" ? next : null; };
    await update();
    await expect.poll(keys, { timeout: 60_000 }).toEqual([...names, SW_VERSION + "-assets-testart0001"].sort());
    expect(await srcState()).toEqual(before);
    expect(asked, "modules downloaded by a sprite-only update").toEqual([]);
  });
});

test("index.html is network-first: a new version shows up online and stays offline", async ({ page, context }) => {
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    const updated = INDEX_SRC.replace("<title>BeBeBe Atrapar 3D</title>", "<title>BeBeBe updated</title>");
    ov.fn = p => (p === "/index.html" ? updated : null);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.title()).toBe("BeBeBe updated");
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.title()).toBe("BeBeBe updated");
  });
});

test("a server error (404/503) still opens the cached game", async ({ page }) => {
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    ov.fn = p => (p === "/index.html" ? { status: 503, body: "down" } : null);
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    expect(await page.title()).toBe("BeBeBe Atrapar 3D");
  });
});

// SPEC-011 AC 6: the game needs http now (ES modules); the old file:// test is replaced by tests/modules.spec.js "file:// shows the notice"

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
  // network gone: the browser is offline
  await context.setOffline(true);
  await reloadGame(page);                          // SPEC-011 AC 8d: seeded again after the reload
  await page.evaluate(() => window.__bb.startGame(1));
  await step(page, 5);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("play");
  expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
});

// SPEC-011 Phase C (review of Phase B): the shell only asks for versioned module URLs (the import map); an unversioned one is
// answered by the network only — offline it fails instead of getting a cached copy of some version (no ignoreSearch fallback)
test("an unversioned module URL is network-only", async ({ page, context }) => {
  const errors = await openGameHttp(page);
  await waitForSW(page);
  const versioned = swList("PRECACHE_SRC").find(u => u.startsWith("./src/core/util.js?v="));
  const get = u => page.evaluate(async x => { try { const r = await fetch(x); return r.ok ? "ok" : "status " + r.status; } catch (e) { return "failed"; } }, u);
  expect(await get("./src/core/util.js"), "online: from the network").toBe("ok");
  await context.setOffline(true);
  expect(await get(versioned), "offline: the versioned URL from the src cache").toBe("ok");
  expect(await get("./src/core/util.js"), "offline: the unversioned URL is not served from a cache").toBe("failed");
  expect(errors.filter(e => !e.includes("Failed to load resource") && !e.includes("Failed to fetch")), "only the refused offline fetch").toEqual([]);
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

// SPEC-026 (Andrei: remove the install hint completely): no strings, no __bb flag, and iPhone Safari's home screen shows only
// the logo, language, sound and the three buttons
test.describe("on iPhone Safari", () => {
  test.use({ userAgent: IPHONE_UA, hasTouch: true });

  test("no install hint: the home screen is the same on iPhone Safari", async ({ page }) => {
    const errors = await openGameHttp(page);
    await frames(page);
    const d = await page.evaluate(() => {
      const b = window.__bb;
      return { texts: Object.values(b.I18N).map(v => "installHint" in v), flag: "installHintShown" in b, mode: b.mode,
        ids: b.buttonRects.map(q => q.id).sort(), hud: b.hudRects.map(h => h.id) };
    });
    expect(d.texts.length, "every language").toBe(4);
    expect(d.texts.every(x => !x), "no language has installHint").toBe(true);
    expect(d.flag).toBe(false);
    expect(d.mode).toBe("home");
    expect(d.ids).toEqual(["home:lang", "home:play", "home:shop", "home:sound", "home:story"]);
    expect(d.hud).toEqual(["home:title"]);
    expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
  });
});
