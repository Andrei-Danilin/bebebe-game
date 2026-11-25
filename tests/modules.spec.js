// SPEC-011: index.html split into ES modules (core / client). The checks of the module layout and of what must stay the
// same through the move. Phase A: the window.__bb surface (AC 5c); later phases add the layout, dependency and Node checks.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { openGame, ROOT } = require("./helpers");

// AC 5c: the key list of window.__bb recorded on master before any code moved (tests/fixtures/bb-keys.json). Tests drive the
// game through __bb (hard rule 6): a key may be added, none may disappear. A spec that adds keys may append them to the list.
const BB_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "bb-keys.json"), "utf8"));
test("the __bb surface is unchanged", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const keys = await page.evaluate(() => Object.keys(window.__bb));   // names only: no getter runs (sim throws on drawn state)
  expect(BB_KEYS.length, "the recorded list is not empty").toBeGreaterThan(150);
  expect(BB_KEYS.filter(k => !keys.includes(k)), "__bb keys removed since the recorded list").toEqual([]);
  expect(errors).toEqual([]);
});

// AC 8b: over http the game registers sw.js; playwright.config.js blocks service workers for every spec but pwa.spec.js,
// also in the contexts the shared-page fixtures make with browser.newContext()
test("service workers are blocked outside the PWA tests", async ({ page, browser }) => {
  const registrations = p => p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  const errors = await openGame(page, { sim: true });
  const ctx = await browser.newContext(), other = await ctx.newPage();
  try {
    const more = await openGame(other, { sim: true });
    await page.waitForTimeout(500);
    expect([await registrations(page), await registrations(other)]).toEqual([0, 0]);
    expect(page.url().startsWith("http://"), "the game is opened over http").toBe(true);
    expect([...errors, ...more]).toEqual([]);
  } finally { await ctx.close(); }
});

// AC 1b: the game imports the bare name "three"; one <script type="importmap"> in index.html says where it comes from (today
// jsDelivr, the same URL as sw.js THREE_BASE; SPEC-025 points it at vendor/three/). No game code names the CDN URL.
const INDEX = path.join(ROOT, "index.html");
const srcFiles = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? srcFiles(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []);
test("three.js comes from the import map only", { tag: "@fast" }, () => {
  const html = fs.readFileSync(INDEX, "utf8"), sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  expect(maps.length, "one import map").toBe(1);
  const map = JSON.parse(maps[0][1]), base = (sw.match(/const THREE_BASE\s*=\s*"([^"]+)"/) || [])[1];
  expect(map.imports.three, "the import map's three = sw.js THREE_BASE + three.module.js").toBe(base + "three.module.js");
  expect(html.indexOf("<script type=\"importmap\">"), "the import map comes before the module script").toBeLessThan(html.indexOf("<script type=\"module\""));
  // every piece of game code without the import map: the inline module(s) and, from Phase B on, src/**
  const code = [["index.html", html.replace(maps[0][0], "")], ...srcFiles(path.join(ROOT, "src")).map(f => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")])];
  const bad = [];
  for (const [name, text] of code) {
    if (text.includes("cdn.jsdelivr.net")) bad.push(`${name}: names cdn.jsdelivr.net`);
    for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) if (/^https?:/.test(m[1]) || /(^|\/)three(\.module)?\.js$/.test(m[1])) bad.push(`${name}: imports ${m[1]}`);
  }
  expect(bad).toEqual([]);
  expect(/\bimport \* as THREE from "three";/.test(html), "the game imports the bare name").toBe(true);
});
