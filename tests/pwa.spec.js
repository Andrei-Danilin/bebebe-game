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
const SW_BUILD = (SW_SRC.match(/const SW_BUILD\s*=\s*(\d+)/) || [])[1];
// SPEC-020: the hash of the art sprites (npm run assets); SPEC-011 AC 9: the hash of the module set (npm run precache)
const ASSETS_HASH = (SW_SRC.match(/const ASSETS_HASH\s*=\s*"([^"]+)"/) || [])[1];
const AUDIO_HASH = (SW_SRC.match(/const AUDIO_HASH = "([^"]+)"/) || [])[1], TRACKS_HASH = (SW_SRC.match(/const TRACKS_HASH = "([^"]+)"/) || [])[1];   // SPEC-047: npm run audio
const SRC_HASH = (SW_SRC.match(/const SRC_HASH\s*=\s*"([^"]+)"/) || [])[1];
const THREE_VERSION = (SW_SRC.match(/const THREE_VERSION\s*=\s*"([^"]+)"/) || [])[1];
// SPEC-011 AC 9: three caches — the shell + modules by SRC_HASH, the sprites by ASSETS_HASH, three.js by its version. SPEC-039 AC 3: the
// first two are named by the build counter and the content hash, never by the game's semver — a release keeps them
const CACHE_SRC = `bebebe-b${SW_BUILD}-src-${SRC_HASH}`, CACHE_ASSETS = `bebebe-b${SW_BUILD}-assets-${ASSETS_HASH}`, CACHE_THREE = "bebebe-three-" + THREE_VERSION;
// SPEC-047: the sounds + the music of the menus at install (named by the manifest's hash); the other tracks, stored whole when first played (named by their hashes; made on first use)
const CACHE_AUDIO = `bebebe-b${SW_BUILD}-audio-${AUDIO_HASH}`, CACHE_TRACKS = `bebebe-b${SW_BUILD}-tracks-${TRACKS_HASH}`;
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
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
    await frames(page);                                  // SPEC-038: fit() waits for the next frame
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
  // SPEC-011 AC 9 (+ SPEC-047: the audio cache): exactly these caches (the tracks cache is made when a track first plays)
  expect((await page.evaluate(() => caches.keys())).sort()).toEqual([CACHE_ASSETS, CACHE_AUDIO, CACHE_SRC, CACHE_THREE].sort());
  expect([CACHE_SRC, CACHE_ASSETS, CACHE_AUDIO, CACHE_TRACKS].filter(n => n.includes(PKG_VERSION)), "no cache name carries the game version (SPEC-039 AC 3)").toEqual([]);
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
// quiet: the page is idle before the test starts (its sprites loaded, the render loop stopped). A new worker takes over only when the active
// one has no request or event in flight, and the page that has just started is still loading its sprites through it while the software
// renderer (SwiftShader: CI, PW_GPU=0) takes every core — on a loaded machine the takeover of the tests that wait for one (a release, a
// new build, a half-installed update, a sprite-only update) sometimes did not come for a minute (one run in ten, also before SPEC-040
// step 2; 0 in 40 with the page idle). These tests are about the worker's downloads and caches, not about drawing.
async function withOwnServer(page, override, fn, quiet = false) {
  const server = makeServer({ override: p => override.fn(p) });
  await new Promise(r => server.listen(0, r));
  try {
    const base = `http://localhost:${server.address().port}/`;
    await page.addInitScript(() => { window.__bbQuality = "high"; });   // SPEC-040: not the start probe's tier
    await page.goto(base);
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 30_000 });
    await waitForSW(page);
    if (quiet) {
      await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 60_000 });
      await page.evaluate(() => { window.__bb.sim(true); });
    }
    await fn(base);
  } finally {
    server.close();
  }
}
const withQuietServer = (page, override, fn) => withOwnServer(page, override, fn, true);
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
test("old caches are removed on a new build (SW_BUILD)", async ({ page }) => {
  test.slow();                       // installs two more service workers: slow under load
  const ov = { fn: () => null };
  const keys = () => page.evaluate(async () => (await caches.keys()).sort());
  const build = n => SW_SRC.replace(/const SW_BUILD\s*=\s*\d+/, `const SW_BUILD = ${n}`);
  const update = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await withQuietServer(page, ov, async () => {
    expect(await keys()).toEqual([CACHE_ASSETS, CACHE_AUDIO, CACHE_SRC, CACHE_THREE].sort());
    // an old-style name, the old jsDelivr three.js cache (SPEC-025: removed) + another app
    await page.evaluate(() => Promise.all([caches.open("bebebe-v0"), caches.open("bebebe-three-0.187.0"), caches.open("other-pages-app")]));
    ov.fn = p => (p === "/sw.js" ? build(9001) : null);
    await update();
    const v2 = ["bebebe-b9001-assets-" + ASSETS_HASH, "bebebe-b9001-audio-" + AUDIO_HASH, "bebebe-b9001-src-" + SRC_HASH];
    await expect.poll(keys, { timeout: 60_000 }).toEqual([...v2, CACHE_ASSETS, CACHE_AUDIO, CACHE_SRC, CACHE_THREE, "other-pages-app"].sort());
    ov.fn = p => (p === "/sw.js" ? build(9002) : null);
    await update();
    await expect.poll(keys, { timeout: 60_000 }).toEqual(["bebebe-b9002-assets-" + ASSETS_HASH, "bebebe-b9002-audio-" + AUDIO_HASH, "bebebe-b9002-src-" + SRC_HASH, ...v2, CACHE_THREE, "other-pages-app"].sort());
  });
});

// SPEC-039 AC 3: a release (a new game version: SW_VERSION changes, the modules, the sprites and three.js do not) installs without
// downloading a module, a sprite, an icon or three.js — only index.html (and the worker itself): the caches are named by the build
// counter and the content hashes, so the new worker finds them complete and keeps them as they are
test("a release with the same files downloads only index.html and sw.js", async ({ page }) => {
  test.slow();                       // installs another service worker
  const ov = { fn: () => null }, asked = [];
  const keys = () => page.evaluate(async () => (await caches.keys()).sort());
  const version = () => page.evaluate(() => new Promise(res => {
    const ch = new MessageChannel();
    ch.port1.onmessage = e => res(e.data.version);
    navigator.serviceWorker.getRegistration().then(r => r.active.postMessage({ type: "VERSION" }, [ch.port2]));
  }));
  await withQuietServer(page, ov, async () => {
    const names = await keys();
    expect(names).toEqual([CACHE_ASSETS, CACHE_AUDIO, CACHE_SRC, CACHE_THREE].sort());
    const next = SW_SRC.replace(/const SW_VERSION\s*=\s*"[^"]+"/, 'const SW_VERSION = "bebebe-9.9.9-b' + SW_BUILD + '"');
    expect(next, "only the version differs").not.toBe(SW_SRC);
    ov.fn = p => { if (p !== "/sw.js") asked.push(p); return p === "/sw.js" ? next : null; };
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await expect.poll(version, { timeout: 60_000 }).toBe("bebebe-9.9.9-b" + SW_BUILD);   // the new worker took over
    expect(await keys(), "the same caches: nothing new, nothing deleted").toEqual(names);
    expect([...new Set(asked)].filter(p => p !== "/" && p !== "/index.html"), "downloaded besides index.html and sw.js").toEqual([]);
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
  await withQuietServer(page, ov, async () => {
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
  await withQuietServer(page, ov, async () => {
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
    await expect.poll(keys, { timeout: 60_000 }).toEqual([...names, `bebebe-b${SW_BUILD}-assets-testart0001`].sort());
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
    expect(d.ids).toEqual(["home:lang", "home:music", "home:play", "home:shop", "home:sound", "home:story"]);
    expect(d.hud).toEqual(["home:title"]);
    expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
  });
});

// SPEC-038 AC 5: the "new version" hint. A waiting (or just activated) worker means a newer version than the page runs: the home
// screen shows a small paper note, a tap activates the waiting worker (SKIP_WAITING) and reloads. Never in a level; nothing is
// lost (the save is on the device).
const UPDATE_TEXTS = { en: "A new version is ready — tap to update", es: "Hay una versión nueva — tocá para actualizar", pt: "Tem uma versão nova — toque para atualizar", ru: "Готова новая версия — нажми, чтобы обновить" };
// a registration with a worker waiting; its postMessage is reported to the test (exposeFunction survives the reload) and answered
// by a controllerchange, as a real worker that skipped waiting would
function stubWaitingWorker() {
  const real = ServiceWorkerContainer.prototype.register;
  ServiceWorkerContainer.prototype.register = function (...a) {
    real.apply(this, a).catch(() => {});
    const worker = {
      state: "installed", addEventListener() {},
      postMessage: (m, ports) => {
        if (m.type === "VERSION") { ports[0].postMessage({ srcHash: "another-module-set" }); return; }   // a worker of other modules than the page's
        window.__swPosted(m); setTimeout(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")), 20);
      }
    };
    return Promise.resolve({ waiting: worker, installing: null, active: {}, addEventListener() {}, update: () => Promise.resolve() });
  };
}
const homeNote = page => page.evaluate(() => { const b = window.__bb; return { rect: b.hudRects.find(h => h.id === "home:update") || null, button: b.buttonRects.find(r => r.id === "home:update") || null, mode: b.mode }; });

test("a waiting worker shows the new-version note on the home screen; a tap activates it and reloads", async ({ page }) => {
  const posted = [];
  await page.exposeFunction("__swPosted", m => posted.push(m));
  await page.addInitScript(stubWaitingWorker);
  const errors = await openGameHttp(page);
  await page.waitForFunction(() => window.__bb.updateReady === true);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.mode)).toBe("home");
  for (const l of ["en", "es", "pt", "ru"]) {
    await page.evaluate(v => { window.__bb.setLang(v); }, l);
    await frames(page);
    const n = await homeNote(page);
    expect(n.rect && n.rect.text, `${l}: the note`).toBe(UPDATE_TEXTS[l]);
    expect(n.button, `${l}: it is a button`).not.toBeNull();
  }
  await page.evaluate(() => { window.__bb.setLang("en"); });
  // never in a level (or any screen but home)
  await page.evaluate(() => { window.__bb.startGame(1); });
  await frames(page);
  expect((await homeNote(page)).rect, "not in a level").toBeNull();
  await page.evaluate(() => { window.__bb.mode = "map"; });
  await frames(page);
  expect((await homeNote(page)).rect, "not on the map").toBeNull();
  await page.evaluate(() => { window.__bb.mode = "home"; });
  await frames(page);
  // a tap: SKIP_WAITING goes to the waiting worker, then the page reloads
  const b = (await homeNote(page)).button, c = await page.locator("#game").boundingBox(), s = c.width / (await page.evaluate(() => window.__bb.uiSize.w));
  const load = page.waitForEvent("load");
  await page.mouse.click(c.x + (b.x + b.w / 2) * s, c.y + (b.y + b.h / 2) * s);
  await load;
  expect(posted).toEqual([{ type: "SKIP_WAITING" }]);
  expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
});

test("no waiting worker: no note", async ({ page }) => {
  await openGameHttp(page);
  await waitForSW(page);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.updateReady)).toBe(false);
  expect((await homeNote(page)).rect).toBeNull();
});

// the real thing: the installed app (controlled page) is online when a new sw.js arrives; the new worker installs and takes over
// (skipWaiting). The note shows only when its modules differ from the page's (SRC_HASH): index.html is network-first, so a page
// that was loaded after the deploy already runs them
const takeover = page => page.evaluate(() => { window.__took = false; navigator.serviceWorker.addEventListener("controllerchange", () => { window.__took = true; }); });
const updateSw = page => page.evaluate(async () => { try { await (await navigator.serviceWorker.getRegistration()).update(); } catch (e) { /* ok */ } });
const newModulesSw = () => SW_SRC.replace(`const SRC_HASH = "${SRC_HASH}";`, "const SRC_HASH = \"testnew999\";").replace(/"\.\/src\/client\/art-names\.js\?v=[0-9a-f]+"/, "\"./src/client/art-names.js?v=testnew001\"");
test("a new worker with other modules taking over a running page shows the note", async ({ page }) => {
  test.slow();
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    await page.reload();                                      // now the page is controlled (the note rules start from a controlled page)
    await page.waitForFunction(() => window.__bbReady === true && !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
    await page.evaluate(() => { const b = window.__bb; b.resetMenus(); b.mode = "home"; });
    expect(await page.evaluate(() => window.__bb.updateReady)).toBe(false);
    const v = newVersion(), sw = newModulesSw();               // other modules: another SRC_HASH, shell and module served to match
    ov.fn = p => (p === "/sw.js" ? sw : p === "/index.html" ? v.html : p === ART_FILE ? v.art : null);
    await takeover(page);
    await updateSw(page);
    await page.waitForFunction(() => window.__bb.updateReady === true, null, { timeout: 60_000 });
    // (a first launch opens the language screen and the comic: back to home until a frame draws the note)
    await page.waitForFunction(() => { const b = window.__bb; if (b.mode !== "home") b.mode = "home"; return b.hudRects.some(h => h.id === "home:update"); }, null, { timeout: 15_000 });
  });
});

// a worker of the same modules (only SW_VERSION changed: a sprite-only deploy, a strategy change) taking over a page that already
// runs these modules: nothing to update, no note
test("a new worker with the same modules shows no note", async ({ page }) => {
  test.slow();
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true && !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
    await page.evaluate(() => { const b = window.__bb; b.resetMenus(); b.mode = "home"; });
    const checks0 = await page.evaluate(() => window.__bb.updateChecks);
    ov.fn = p => (p === "/sw.js" ? SW_SRC.replace(/const SW_VERSION\s*=\s*"[^"]+"/, "const SW_VERSION = \"bebebe-test-same\"") : null);
    await takeover(page);
    await updateSw(page);
    await page.waitForFunction(() => window.__took === true, null, { timeout: 60_000 });                    // the new worker took over
    await page.waitForFunction(c => window.__bb.updateChecks > c, checks0, { timeout: 15_000 });            // and answered which modules it is
    await frames(page);
    expect(await page.evaluate(() => window.__bb.updateReady), "the page already runs these modules").toBe(false);
    expect((await homeNote(page)).rect).toBeNull();
  });
});

// a first visit (no worker at the start): the first install claiming the page is no update; a later takeover with other modules is
test("a first visit sees a later update", async ({ page }) => {
  test.slow();
  const ov = { fn: () => null };
  await withOwnServer(page, ov, async () => {                  // loaded without a worker; the worker installs and claims the page
    expect(await page.evaluate(() => window.__bb.updateReady), "the first install is no update").toBe(false);
    const v = newVersion(), sw = newModulesSw();
    ov.fn = p => (p === "/sw.js" ? sw : p === "/index.html" ? v.html : p === ART_FILE ? v.art : null);
    await updateSw(page);                                       // no reload in between
    await page.waitForFunction(() => window.__bb.updateReady === true, null, { timeout: 60_000 });
  });
});

// the note fits one phone screen (667×375) in every language, also with wider fonts (CI and iPhone fonts are wider than Windows):
// whole text, inside the screen, on no other control
const NOTE_FIT_SETUPS = [["on a phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, "?phone=1", "667×375"],
  ["on the desktop", { viewport: { width: 960, height: 640 } }, "", "960×640"]];
for (const [name, ctxOpts, query, size] of NOTE_FIT_SETUPS) test.describe(`the new-version note ${name}`, () => {
  test.use(ctxOpts);

  test(`it fits at ${size} in every language and font scale`, async ({ page }) => {
    const errors = [];
    await page.exposeFunction("__swPosted", () => {});
    await page.addInitScript(stubWaitingWorker);
    errors.push(...await openGameHttp(page, { query }));
    await page.waitForFunction(() => window.__bb.updateReady === true);
    const problems = [];
    for (const l of ["en", "es", "pt", "ru"]) for (const scale of [1, 1.15, 1.3]) {
      await page.evaluate(([v, sc]) => { const b = window.__bb; b.setLang(v); b.CFG.TEXT_TEST_SCALE = sc; b.mode = "home"; }, [l, scale]);
      await frames(page);
      const d = await page.evaluate(() => { const b = window.__bb; return { hud: b.hudRects, buttons: b.buttonRects, ui: b.uiSize, min: b.textSizes }; });
      const n = d.hud.find(h => h.id === "home:update"), at = `${l} ×${scale}`;
      if (!n) { problems.push(`${at}: no note`); continue; }
      if (n.text !== UPDATE_TEXTS[l]) problems.push(`${at}: text cut to "${n.text}"`);
      if (n.x < 0 || n.x + n.w > d.ui.w || n.y < 0 || n.y + n.h > d.ui.h) problems.push(`${at}: off the screen ${JSON.stringify(n)}`);
      for (const q of [...d.buttons.filter(b => b.id !== "home:update"), ...d.hud.filter(h => h.id === "home:title")]) {
        if (n.x < q.x + q.w && n.x + n.w > q.x && n.y < q.y + q.h && n.y + n.h > q.y) problems.push(`${at}: the note covers ${q.id}`);
      }
      if (name === "on a phone" && n.h * d.ui.scale < 28) problems.push(`${at}: the note is ${n.h * d.ui.scale} CSS px tall`);
    }
    await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; });
    expect(problems).toEqual([]);
    expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
  });
});

// SPEC-038 AC 6 (RR-39): a sprite missing from the sprite cache (evicted, or one the install could not fetch) is fetched again on
// the next online start; the page need not ask for it
test("an online start re-fetches a sprite missing from the cache", async ({ page }) => {
  test.slow();
  await openGameHttp(page);
  await waitForSW(page);
  const sprite = HTTP_BASE + "assets/" + swList("PRECACHE_ASSETS")[5].slice(9);
  const has = () => page.evaluate(async ([n, u]) => !!(await (await caches.open(n)).match(u)), [CACHE_ASSETS, sprite]);
  expect(await has(), "installed with it").toBe(true);
  expect(await page.evaluate(async ([n, u]) => (await caches.open(n)).delete(u), [CACHE_ASSETS, sprite])).toBe(true);
  expect(await has()).toBe(false);
  // an online start = a navigation the network answers; a plain document (not the game, which would ask for the sprite itself)
  await page.goto(HTTP_BASE + "icons/icon.svg");
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), "still the worker's page").toBe(true);
  await expect.poll(has, { timeout: 30_000, message: "the worker put the sprite back" }).toBe(true);
  // and the whole list is there again
  const art = await page.evaluate(async n => (await (await caches.open(n)).keys()).map(r => r.url), CACHE_ASSETS);
  expect(swList("PRECACHE_ASSETS").filter(u => !art.includes(HTTP_BASE + u.slice(2)))).toEqual([]);
});
