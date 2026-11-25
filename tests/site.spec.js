// SPEC-011 AC 10b: the site is built from ONE list (scripts/site.js, `npm run site` → _site/, what Pages publishes). This test
// builds the site into a temp folder, serves it with scripts/serve.js and plays it: the game starts, every file sw.js
// precaches is in the site, and every same-origin file the game asks for during the start and one level is in the site.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openGame, step, frames } = require("./helpers");
const { startServer } = require("../scripts/serve");
const { buildSite, SITE, PAGES_ONLY } = require("../scripts/site");

let out, site, entries;
test.beforeAll(async () => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "bebebe-site-"));
  entries = buildSite({ out });
  site = await startServer({ root: out });
});
test.afterAll(async () => {
  if (site) await site.close();
  if (out) fs.rmSync(out, { recursive: true, force: true });
});

// "./assets/x.webp" → its path in the built site ("./" = index.html)
const fileOf = rel => path.join(out, rel === "./" ? "index.html" : rel.replace(/^\.\//, ""));
// the string items of a `const NAME = [ … ];` list in sw.js
const swList = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
};

test("the built site has the listed files and everything sw.js precaches", { tag: "@fast" }, () => {
  for (const e of [...SITE, ...PAGES_ONLY]) expect(fs.existsSync(path.join(out, e)), e).toBe(true);
  expect(fs.readdirSync(out).sort(), "nothing else in the site").toEqual([...entries].sort());
  const sw = fs.readFileSync(path.join(out, "sw.js"), "utf8");
  const local = swList(sw, "PRECACHE_LOCAL"), art = swList(sw, "PRECACHE_ASSETS");
  expect(local && local.length, "PRECACHE_LOCAL read from sw.js").toBeGreaterThan(3);
  expect(art && art.length, "PRECACHE_ASSETS read from sw.js").toBeGreaterThan(10);
  expect([...local, ...art].filter(rel => !fs.existsSync(fileOf(rel))), "precached but missing from the site").toEqual([]);
});

test("the game runs from the built site and asks only for files that are in it", async ({ page }) => {
  const asked = new Set(), failed = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.origin === new URL(site.base).origin) asked.add(decodeURIComponent(u.pathname)); });
  page.on("response", r => { if (r.url().startsWith(site.base) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  const errors = await openGame(page, { base: site.base });
  await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 30_000 });
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); });
  await step(page, 3);
  await frames(page);
  for (const m of ["home", "map", "story", "shop"]) { await page.evaluate(v => { window.__bb.mode = v; }, m); await frames(page); }
  const info = await page.evaluate(() => window.__bb.artInfo);
  expect(info.bad, "every sprite loaded").toBe(0);
  expect(asked.size, "the game asked the site for files").toBeGreaterThan(5);
  expect([...asked].filter(p => !fs.existsSync(path.join(out, p === "/" ? "index.html" : p))), "asked for but not in the site").toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
