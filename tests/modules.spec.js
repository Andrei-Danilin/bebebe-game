// SPEC-011: index.html split into ES modules (core / client). The checks of the module layout and of what must stay the
// same through the move. Phase A: the __bb surface (AC 5c), service workers blocked (8b), the import map (1b), the lint config (11b);
// Phase B: the references recorded on the unchanged game (same game, AC 7; saves load the same, AC 5b), then the layout,
// dependency and Node checks.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const fs = require("fs");
const path = require("path");
const { openGame, reloadGame, softly, ROOT } = require("./helpers");

// AC 5c: the keys of window.__bb and their kind (getter / getter+setter / function / value, from the property descriptor),
// recorded before any code moved (tests/fixtures/bb-keys.json). Tests drive the game through __bb (hard rule 6) and write
// through its setters (`__bb.mode = x`): a key may be added, none may disappear, a getter must not become a copied value,
// a getter+setter must keep its setter, a function stays a function (a value may become a getter: a live binding).
// A spec that adds keys may add them to the fixture.
const BB_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "bb-keys.json"), "utf8"));
const bbKinds = () => {                       // runs in the page: descriptors only, no getter runs (sim throws on drawn state)
  const b = window.__bb, out = {};
  for (const k of Object.keys(b)) {
    const d = Object.getOwnPropertyDescriptor(b, k);
    out[k] = d.get ? (d.set ? "getter+setter" : "getter") : typeof d.value === "function" ? "function" : "value";
  }
  return out;
};
// what a recorded kind may be now
const KIND_OK = { "getter+setter": ["getter+setter"], getter: ["getter", "getter+setter"], function: ["function"], value: ["value", "getter", "getter+setter"] };
test("the __bb surface is unchanged", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const now = await page.evaluate(bbKinds);
  expect(Object.keys(BB_KEYS).length, "the recorded list is not empty").toBeGreaterThan(150);
  const bad = Object.entries(BB_KEYS).filter(([k, kind]) => !KIND_OK[kind].includes(now[k])).map(([k, kind]) => `${k}: was ${kind}, now ${now[k] || "gone"}`);
  expect(bad, "__bb keys removed or weakened since the recorded list").toEqual([]);
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
  expect(code.some(([, text]) => /\bimport \* as THREE from "three";/.test(text)), "the game imports the bare name (index.html or src/**)").toBe(true);
});

// AC 11b: `npm run lint` (scripts/lint.js, eslint.config.js) — the minimal rule set on every block, no browser-only globals
// for the core (it runs in Node; AC 3), browser globals for the client and the inline module, the local imports check for
// module code, and a lint job in every Tests run
const BROWSER_ONLY = ["document", "window", "localStorage", "navigator", "requestAnimationFrame", "Audio", "AudioContext", "globalThis"];
test("lint config covers src/", { tag: "@fast" }, () => {
  const config = require(path.join(ROOT, "eslint.config.js"));
  const block = file => config.find(c => (c.files || []).includes(file));
  const core = block("src/core/**/*.js"), client = block("src/client/**/*.js");
  expect(!!core && !!client, "a src/core and a src/client block").toBe(true);
  for (const f of ["src/i18n.js", "src/story.js"]) expect(block(f), `${f} is linted like the core`).toBe(core);
  // the inline module is linted like the client while index.html still has one (Phase C empties the shell)
  if (/<script type="module">/.test(fs.readFileSync(INDEX, "utf8"))) expect(client.files, "the inline module is linted like the client").toContain(".lint-index.mjs");
  expect(BROWSER_ONLY.filter(g => g in core.languageOptions.globals), "browser-only globals allowed in the core").toEqual([]);
  // globalThis is an ES built-in ESLint always knows: no-restricted-globals bans it (and the rest) in the core
  const banned = (core.rules["no-restricted-globals"] || []).slice(1).map(g => (typeof g === "string" ? g : g.name));
  expect(BROWSER_ONLY.filter(g => !banned.includes(g)), "browser-only globals not banned in the core").toEqual([]);
  expect(core.languageOptions.globals.console, "the core may log (globals Node and browsers share)").toBeDefined();
  expect(client.languageOptions.globals.document, "the client gets browser globals").toBeDefined();
  for (const c of [core, client]) {
    expect(c.languageOptions.sourceType).toBe("module");
    for (const r of ["no-undef", "no-unused-vars", "no-var", "prefer-const", "no-import-assign", "local/imports"]) expect(c.rules[r], r).toBeDefined();
  }
  expect(block("scripts/**/*.js"), "the scripts are linted").toBeDefined();
  const lint = fs.readFileSync(path.join(ROOT, "scripts", "lint.js"), "utf8");
  expect(lint, "lint.js lints src/ once it exists").toContain("\"src\"");
  expect(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts.lint).toBe("node scripts/lint.js");
  expect(fs.readFileSync(path.join(ROOT, ".github", "workflows", "tests.yml"), "utf8"), "every Tests run lints").toMatch(/run: npm run lint/);
});

// ---------- Phase B references, recorded on the unchanged one-file game (step B1, master 1cdda42) ----------
// They are compared exactly after every move of Phase B and C. Recording: BB_RECORD_REFERENCE=1 npx playwright test
// tests/modules.spec.js -g "after the split|after a real reload" — refused once src/core/ exists: a reference is never
// re-recorded to make moved code pass.
const FIXTURES = path.join(ROOT, "tests", "fixtures"), SAVES_DIR = path.join(FIXTURES, "saves");
const RECORD = process.env.BB_RECORD_REFERENCE === "1";
const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
const writeRef = (file, text) => {
  if (fs.existsSync(path.join(ROOT, "src", "core"))) throw new Error("references are recorded on the unchanged game only (src/core/ exists)");
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n"));
};
// a save fixture's keys as localStorage holds them (a string as is, an object as JSON), like invariants.spec.js
const asStored = keys => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));

// AC 7: the SPEC-008 event log of fixed runs, plus (orchestrator, Phase A review) the rng draws and a line of every actor's
// state every snapEvery s of game time, so a reordered rng() draw that does not change the events is caught too (the rng
// draws are counted from the seed on, so a draw added or dropped anywhere shows in the first snapshot after it).
// The runs follow scripts/balance.js runLevel (progress → autopilot → seedRandom → world/level → startGame → step), with the
// stocked save tests/fixtures/saves/baseline-stocked.json and the level cache cleared first; Beach and Winter (locked bonus
// worlds since SPEC-030) through the __bb.world setter. The loop is simRun's, cut at every snapshot: update(dt) while the
// level plays and the time is not up, then simRun(0) plays a started win to its end (as simRun does). runLevel itself is
// checked too (its summary of Park 1).
const BASELINE_FILE = path.join(FIXTURES, "events-baseline.json");
// Snapshots every 2 s (finer than the 10 s asked for: the stocked runs win in 6–64 s). [world, level, players]: the spec's three
// runs and its 2-player run, plus City 18 — the spec's runs win before anyone needs a rescue kit; City 18 uses one.
const BASELINE = { seed: 7, style: "careful", seconds: 120, snapEvery: 2 };
const BASELINE_RUNS = [["park", 1, 1], ["beach", 9, 1], ["winter", 18, 1], ["park", 1, 2], ["city", 18, 1]];
function baselineRun({ world, n, players, style, seed, seconds, snapEvery, save }) {   // runs in the page; plain data only
  const b = window.__bb, dt = b.CFG.BALANCE.SIM_DT, f2 = v => v.toFixed(2);
  b.clearLevelCache();
  b.setProgress(save);
  b.autopilot(true, style); b.seedRandom(seed);
  const draws0 = b.rngDraws;
  b.world = world; b.level = n; b.startGame(players);
  const snap = () => {
    const g = b.big, s = b.stats;
    return `t${f2(s.time)} d${b.rngDraws - draws0} h${s.hugs} i${b.items.length} k${b.kisses.length} s${b.stars.length} | ` +
      `B ${f2(g.x)},${f2(g.y)},${f2(g.dir)},${g.state},${g.hp},${f2(g.stun)} | ` +
      b.littles.map(l => `${f2(l.x)},${f2(l.y)},${l.state},${l.task}`).join(" ; ");
  };
  const steps = Math.round(seconds / dt), every = Math.round(snapEvery / dt), snaps = [];
  let i = 0;
  for (; b.mode === "play" && i < steps; i++) { if (i % every === 0) snaps.push(snap()); b.update(dt); }
  const res = b.simRun(0, dt);
  snaps.push(snap());
  const out = { world, n, players, steps: i, win: res.win, ended: res.ended, time: res.time, rngDraws: b.rngDraws - draws0,
    hp: b.big.hp, inv: { ...b.progress.inv }, coins: b.progress.coins, snaps, events: b.events };
  b.autopilot(false); b.seedRandom(); b.mode = "home";
  return out;
}
// the first difference of two lists, for a readable failure
const firstDiff = (want, got, name) => {
  const show = v => JSON.stringify(v);
  for (let i = 0; i < Math.max(want.length, got.length); i++) if (show(want[i]) !== show(got[i])) return `${name}[${i}] (of ${want.length} / ${got.length}): want ${show(want[i])}, got ${show(got[i])}`;
  return null;
};
test("same seed, same game after the split", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openGame(page, { sim: true });
  const save = readJson(path.join(SAVES_DIR, "baseline-stocked.json")).keys["bebebe-progress"];
  const runs = [];
  for (const [world, n, players] of BASELINE_RUNS) runs.push(await page.evaluate(baselineRun, { world, n, players, save, ...BASELINE }));
  // and scripts/balance.js runLevel itself (its whole level, the balance summary) on the stocked save: Park 1
  const { runLevel } = require(path.join(ROOT, "scripts", "balance.js"));
  const summary = await page.evaluate(runLevel, { world: "park", n: 1, style: BASELINE.style, seed: BASELINE.seed, progress: save });
  expect(errors).toEqual([]);
  if (RECORD) {
    const run = r => {
      const { snaps, events, ...head } = r, list = a => "[\n" + a.map(x => "    " + JSON.stringify(x)).join(",\n") + "\n   ]";
      return "  {\n   " + JSON.stringify(head).slice(1, -1) + ",\n   \"snaps\": " + list(snaps) + ",\n   \"events\": " + list(events) + "\n  }";
    };
    writeRef(BASELINE_FILE, "{\n \"about\": " + JSON.stringify("SPEC-011 AC 7: recorded on the unchanged one-file game (master 1cdda42) by tests/modules.spec.js " +
      "\"same seed, same game after the split\" (BB_RECORD_REFERENCE=1). Per run: the SPEC-008 event log, the rng draws, every actor's state each snapEvery s; " +
      "summary = scripts/balance.js runLevel on Park 1. Never re-recorded: the moved code must play exactly this.") +
      ",\n \"settings\": " + JSON.stringify(BASELINE) + ",\n \"summary\": " + JSON.stringify(summary) + ",\n \"runs\": [\n" + runs.map(run).join(",\n") + "\n ]\n}\n");
    return;
  }
  const ref = readJson(BASELINE_FILE);
  expect(ref.settings).toEqual(BASELINE);
  expect(ref.runs.map(r => [r.world, r.n, r.players])).toEqual(BASELINE_RUNS);
  const bad = [];
  ref.runs.forEach((want, k) => {
    const got = runs[k], name = `${want.world} ${want.n} (${want.players}P)`;
    for (const d of [firstDiff(want.snaps, got.snaps, "state"), firstDiff(want.events, got.events, "event")]) if (d) bad.push(`${name}: ${d}`);
    const { snaps: s1, events: e1, ...wantHead } = want, { snaps: s2, events: e2, ...gotHead } = got;
    if (JSON.stringify(wantHead) !== JSON.stringify(gotHead)) bad.push(`${name}: want ${JSON.stringify(wantHead)}, got ${JSON.stringify(gotHead)}`);
  });
  if (JSON.stringify(ref.summary) !== JSON.stringify(summary)) bad.push(`runLevel summary: want ${JSON.stringify(ref.summary)}, got ${JSON.stringify(summary)}`);
  expect(bad, "the game plays differently from the recorded baseline").toEqual([]);
  // a reference that tests something: the stock and the main rules are used
  const types = new Set(ref.runs.flatMap(r => r.events.map(e => e.type)));
  expect(["hug", "push", "down", "item", "kiss", "kit"].filter(t => !types.has(t)), "event types the baseline never saw").toEqual([]);
});

// AC 5b: every save fixture through a real page reload (the game's own start-up load) gives what it gave on the unchanged
// game: progress, the outfits shown and saved, the names, the language, the world and level the menu is on, the screen,
// and every bebebe-* key in storage after the start (what the start wrote back: a migrated save, adopted clothes).
// A new save fixture needs its loaded state here (recorded on the code that adds it, never on moved code).
const LOADED_FILE = path.join(FIXTURES, "saves-loaded.json");
function loadedState() {                       // runs in the page; plain data only
  const b = window.__bb, plain = v => JSON.parse(JSON.stringify(v)), stored = {};
  for (const k of Object.keys(localStorage).filter(q => q.startsWith("bebebe-")).sort()) {
    const v = localStorage.getItem(k);
    try { stored[k] = JSON.parse(v); } catch (e) { stored[k] = v; }
  }
  return { progress: plain(b.progress), outfits: plain(b.outfits), names: plain(b.names), lang: b.lang, world: b.world, level: b.level, mode: b.mode, stored };
}
test("every save fixture loads the same after a real reload", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, { sim: true });
  const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith(".json")).sort(), got = {};
  for (const f of files) {
    await page.evaluate(keys => {
      localStorage.clear(); localStorage.setItem("bb-test-init", "1");   // the test's init script must not clear it again
      for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v);
    }, asStored(readJson(path.join(SAVES_DIR, f)).keys));
    await reloadGame(page);
    got[f.slice(0, -5)] = await page.evaluate(loadedState);
  }
  expect(errors).toEqual([]);
  if (RECORD) {
    writeRef(LOADED_FILE, "{\n \"about\": " + JSON.stringify("SPEC-011 AC 5b: what every file in tests/fixtures/saves/ loads into after a real page reload, recorded on the " +
      "unchanged one-file game (master 1cdda42) by tests/modules.spec.js \"every save fixture loads the same after a real reload\" (BB_RECORD_REFERENCE=1).") +
      ",\n \"saves\": {\n" + Object.entries(got).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n }\n}\n");
    return;
  }
  const ref = readJson(LOADED_FILE).saves;
  expect(Object.keys(got), "a loaded state recorded for every save fixture").toEqual(Object.keys(ref).sort());
  const soft = softly();
  for (const [n, want] of Object.entries(ref)) for (const k of Object.keys(want)) soft(got[n][k], `${n}: ${k}`).toEqual(want[k]);
  soft.done();
});
