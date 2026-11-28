// SPEC-025 AC 1: fully offline. three.js is vendored (vendor/three/), so no request ever leaves the game's own origin:
// - the shipped files (the site `npm run site` builds, without the Pages-only v1-2d/) name no other host outside comments;
// - the tests themselves never name the CDN any more;
// - a request audit walks the game (page load, the first-run comic, the menus, How to play, one level, the win screen) with every
//   other host blocked from the start and no service worker (the packaged-app case: offline by packaging), and on the installed
//   PWA with the network off after the service worker installed (playwright.config.js lets context routes see the worker's
//   requests too), plus one injected error (AC 7: the error card and the log never use the network). A request to any other host
//   fails the test.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openGame, openGameHttp, frames, step, setupHug, ROOT } = require("./helpers");
const { buildSite } = require("../scripts/site");

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
// SPEC-013: the game's own published origin, which CFG.ONLINE.ORIGINS lists as an origin the online server accepts (a name in a table, never a request target)
const OWN_ORIGINS = ["https://andrei-danilin.github.io"];
// XML namespace names (three.js creates elements in the XHTML namespace, the SVG icon declares its own): identifiers that are
// never fetched, not addresses of a host
const NAMESPACES = /^http:\/\/www\.w3\.org\/(1999\/xhtml|2000\/svg|1999\/xlink)$/;
const TEXT_EXT = [".html", ".js", ".mjs", ".json", ".webmanifest", ".css", ".svg", ".txt", ".md"];

// every http(s):// URL of a text, outside comments (JS: block and line comments, found by espree's tokenizer, so a "//" inside
// a string is no comment; HTML: <!-- -->; the inline scripts of an HTML file are scanned as JS)
function remoteUrls(file, text) {
  const espree = require("espree");
  const found = [];
  const scan = (s, where) => { for (const m of s.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) found.push({ url: m[0], where }); };
  const scanJs = (src, where, module) => {
    let comments;
    try { comments = espree.tokenize(src, { ecmaVersion: "latest", sourceType: module ? "module" : "script", comment: true, range: true }).comments; }
    catch (e) { comments = espree.tokenize(src, { ecmaVersion: "latest", sourceType: "script", comment: true, range: true }).comments; }
    let code = src;
    for (const c of comments) code = code.slice(0, c.range[0]) + " ".repeat(c.range[1] - c.range[0]) + code.slice(c.range[1]);
    scan(code, where);
  };
  if (/\.m?js$/.test(file)) scanJs(text, file, true);
  else if (file.endsWith(".html")) {
    let html = text.replace(/<!--[\s\S]*?-->/g, "");
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/type="importmap"/.test(m[1])) scanJs(m[2], file + " (script)", /type="module"/.test(m[1]));
      else scan(m[2], file + " (import map)");
      html = html.replace(m[0], "");
    }
    scan(html, file);
  } else scan(text, file);
  return found.filter(f => { const u = new URL(f.url.replace(/:\*$/, ""));   // SPEC-013: "http://localhost:*" in CFG.ONLINE.ORIGINS = any port
    return !LOCAL_HOSTS.includes(u.hostname) && !NAMESPACES.test(f.url) && !OWN_ORIGINS.includes(u.origin);
  });
}

test("the shipped files name no other host", { tag: "@fast" }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bebebe-offline-"));
  try {
    buildSite({ out, pages: false });
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const files = walk(out).filter(f => TEXT_EXT.includes(path.extname(f)) || path.basename(f) === "LICENSE");
    expect(files.map(f => path.relative(out, f).replace(/\\/g, "/")), "the vendored three.js ships").toEqual(expect.arrayContaining(["vendor/three/three.module.js", "vendor/three/three.core.js", "vendor/three/LICENSE"]));
    const bad = files.flatMap(f => remoteUrls(path.relative(out, f).replace(/\\/g, "/"), fs.readFileSync(f, "utf8"))).map(f => `${f.where}: ${f.url}`);
    expect(bad).toEqual([]);
    // the scan itself works: a URL in code is found, one in a comment or a licence header is not
    expect(remoteUrls("x.js", "/** @license https://a.example */ // https://b.example\nconst u = \"https://c.example/x.js\";").map(f => f.url)).toEqual(["https://c.example/x.js"]);
    expect(remoteUrls("x.html", "<!-- https://a.example --><script>const s = \"//not-a-comment\"; fetch(\"https://d.example\");</script>").map(f => f.url)).toEqual(["https://d.example"]);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test("the tests never name the CDN", { tag: "@fast" }, () => {
  const cdn = "cdn." + "jsdelivr" + ".net";
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const bad = walk(path.join(ROOT, "tests")).filter(f => /\.(m?js|json)$/.test(f) && fs.readFileSync(f, "utf8").includes(cdn)).map(f => path.relative(ROOT, f));
  expect(bad).toEqual([]);
});

// AC 2: every vendored file is listed in THIRD_PARTY_LICENSES.md with its licence, and the licence text ships next to it
test("THIRD_PARTY_LICENSES.md lists every vendored file and its licence", { tag: "@fast" }, () => {
  const doc = fs.readFileSync(path.join(ROOT, "THIRD_PARTY_LICENSES.md"), "utf8");
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const code = walk(path.join(ROOT, "vendor")).filter(f => f.endsWith(".js")).map(f => path.relative(ROOT, f).replace(/\\/g, "/"));
  expect(code.length).toBeGreaterThan(0);
  expect(code.filter(f => !doc.includes("`" + f + "`")), "vendored files missing from THIRD_PARTY_LICENSES.md").toEqual([]);
  for (const dir of new Set(code.map(f => path.dirname(f)))) {
    expect(fs.existsSync(path.join(ROOT, dir, "LICENSE")), `${dir}/LICENSE`).toBe(true);
    expect(doc).toContain("`" + dir + "/LICENSE`");
  }
  expect(doc).toMatch(/three\.js.*MIT/s);
  expect(fs.readFileSync(path.join(ROOT, "vendor", "three", "LICENSE"), "utf8")).toContain("The MIT License");
});

// Records every request of the context (pages and, with the config's flag, the service worker) and blocks every other host.
async function auditRequests(context) {
  const remote = [];
  await context.route("**/*", route => {
    const u = new URL(route.request().url());
    if (LOCAL_HOSTS.includes(u.hostname)) return route.continue();
    remote.push(u.href);
    return route.abort("internetdisconnected");
  });
  context.on("request", r => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !LOCAL_HOSTS.includes(u.hostname)) remote.push(u.href); });
  return remote;
}

const WIN_WAIT = 4.5;   // the last hug plays out, then Dad walks home (as tests/gameplay.spec.js)
// The walk of the audit: the first-run comic, the menus (home, map, Character with its tabs, the story, How to play, the grown-ups
// page — SPEC-025 phase 2), one level
// and the win screen — on a rendered page, so the art, the 3D and the sounds load as for a player.
async function walkGame(page) {
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__bb.mode === "scene", null, { timeout: 30_000 });   // the first-run comic
  await frames(page);
  await page.keyboard.press("Enter");                             // a key: the sound starts too
  await frames(page);
  await page.evaluate(() => { window.__bb.sceneSkip(); });
  const shots = [];
  const at = async (name, fn, arg) => { await page.evaluate(fn, arg); await frames(page); shots.push([name, await page.evaluate(() => window.__bb.mode)]); };
  await at("home", () => { window.__bb.mode = "home"; });
  await at("map", () => { window.__bb.openMap(); });
  await at("character", () => { window.__bb.openShop("home", "progress"); });
  for (const tab of ["items", "wardrobe", "upgrades"]) await at(tab, t => { window.__bb.shopTab = t; }, tab);
  await at("story", () => { window.__bb.openStory(); });
  await at("rules", () => { window.__bb.tapButton("story:rules"); });
  // SPEC-025 phase 2: the grown-ups page (behind the gate: the right answer), opened and closed
  await at("grownups", () => {
    const b = window.__bb; b.grownUps.open();
    const g = b.grownUps.gate; [...document.querySelectorAll("#gate button")].find(q => q.textContent === String(g.a * g.b)).click();
  });
  shots.push(["grownups page", await page.evaluate(() => { const el = document.getElementById("grownups"); if (el) el.querySelector("[data-act=close]").click(); return !!el; })]);
  await at("level", () => { window.__bb.startGame(1); });
  await page.evaluate(() => { window.__bb.big.hp = 1; });
  await setupHug(page);
  await step(page, WIN_WAIT);
  await frames(page);
  shots.push(["win", await page.evaluate(() => window.__bb.mode)]);
  return shots;
}
const WALKED = [["home", "home"], ["map", "map"], ["character", "shop"], ["items", "shop"], ["wardrobe", "shop"], ["upgrades", "shop"], ["story", "story"], ["rules", "story"],
  ["grownups", "story"], ["grownups page", true], ["level", "play"], ["win", "win"]];

test("no request leaves the origin: network blocked from the start, no service worker", async ({ page, context }) => {
  test.slow();
  const remote = await auditRequests(context);
  const errors = await openGame(page, { intro: true });
  expect(await walkGame(page)).toEqual(WALKED);
  expect(await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)), "no service worker").toBe(false);
  expect(errors).toEqual([]);
  // AC 7: an injected error — the card and the log, and still nothing sent anywhere
  await page.evaluate(() => { setTimeout(() => { throw new Error("test: injected"); }); });
  await page.waitForFunction(() => !!document.getElementById("oops"));
  await page.click("#oops button >> nth=0");
  await frames(page);
  expect(await page.evaluate(() => window.__bb.errorLog.map(e => e.message))).toEqual(["test: injected"]);
  expect(remote).toEqual([]);
});

test.describe("installed app", () => {
  test.use({ serviceWorkers: "allow" });

  test("no request leaves the origin: the installed app with the network off", async ({ page, context }) => {
    test.slow();
    const remote = await auditRequests(context);
    const errors = await openGameHttp(page, { intro: true });
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 30_000 });
    await context.setOffline(true);                               // the first launch after the install, offline
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true, null, { timeout: 60_000 });
    expect(await walkGame(page)).toEqual(WALKED);
    // SPEC-038 AC 6 (RR-39), SPEC-040 AC 1: every sprite is in the cache — the resident ones loaded at start, the walk's screens loaded the
    // others (story, map pages, wardrobe) as they opened; none failed. "ok" is no longer "every sprite decoded": only the resident ones are
    const art = await page.evaluate(() => { const a = window.__bb.artInfo; return { done: a.done, ok: a.ok, resident: a.resident, total: a.total, bad: a.bad }; });
    expect(art.total, "the sprite list is not empty").toBeGreaterThan(100);
    expect(art, "every resident sprite loaded offline, none failed").toEqual({ done: true, ok: art.resident, resident: art.resident, total: art.total, bad: 0 });
    // every sprite file is answered offline (the cache holds all of them, resident or not) …
    const notCached = await page.evaluate(names => Promise.all(names.map(n => fetch("assets/" + n + ".webp").then(r => (r.ok ? null : n), () => n))).then(r => r.filter(Boolean)), await page.evaluate(() => window.__bb.ART_NAMES));
    expect(notCached, "sprites the offline cache does not answer").toEqual([]);
    // … and a screen opened offline loads its own pictures from it
    await page.evaluate(() => { window.__bb.CFG.ART.releaseMs = 100; window.__bb.mode = "home"; });   // what the walk's screens loaded goes first
    await page.waitForFunction(() => window.__bb.artInfo.loaded === window.__bb.artInfo.resident + 1, null, { timeout: 15_000 });   // the resident ones and the map page
    const before = await page.evaluate(() => window.__bb.artInfo.loaded);
    await page.evaluate(() => { window.__bb.openStory("began", "home"); });
    await frames(page);
    // (SPEC-048: the page also asks for what the next screen shows — screenArt().next — so those came from the cache too)
    expect(await page.evaluate(() => { const b = window.__bb, s = b.screenArt; return { ...b.artInfo, shown: b.artUse.story_start > 0, now: s.now, next: s.next, nextIn: s.next.every(n => !!b.art(n)) }; }))
      .toMatchObject({ bad: 0, pending: 0, shown: true, now: ["story_start"], nextIn: true });
    expect(await page.evaluate(() => window.__bb.artInfo.loaded), "its picture and exactly those of the next screen").toBe(before + 1 + (await page.evaluate(() => window.__bb.screenArt.next.length)));
    expect(remote).toEqual([]);
    expect(errors.filter(e => !e.includes("Failed to load resource"))).toEqual([]);
  });
});
