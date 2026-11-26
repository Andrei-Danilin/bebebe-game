// SPEC-011: index.html split into ES modules (core / client). The checks of the module layout and of what must stay the
// same through the move. Phase A: the __bb surface (AC 5c), service workers blocked (8b), the import map (1b), the lint config (11b);
// Phase B: the references recorded on the unchanged game (same game, AC 7; saves load the same, AC 5b), then the layout,
// dependency and Node checks; Phase C: the shell without game code (AC 1), the client tree (AC 2, 2e), only main.js starts the game.
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

// AC 1b: the game imports the bare name "three"; one <script type="importmap"> in index.html says where it comes from (SPEC-025
// AC 1: the vendored ./vendor/three/three.module.js at its hash, the URL sw.js caches). No game code names a CDN URL.
const INDEX = path.join(ROOT, "index.html");
const srcFiles = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? srcFiles(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []);
test("three.js comes from the import map only", { tag: "@fast" }, () => {
  const html = fs.readFileSync(INDEX, "utf8"), sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  expect(maps.length, "one import map").toBe(1);
  const map = JSON.parse(maps[0][1]);
  expect(map.imports.three, "the import map's three = the vendored module").toMatch(/^\.\/vendor\/three\/three\.module\.js\?v=[0-9a-f]{10}$/);
  expect(sw, "sw.js caches that URL").toContain(JSON.stringify(map.imports.three));
  expect(sw, "no THREE_BASE (SPEC-025)").not.toMatch(/THREE_BASE/);
  expect(html.indexOf("<script type=\"importmap\">"), "the import map comes before the module script").toBeLessThan(html.indexOf("<script type=\"module\""));
  // every piece of game code without the import map: the shell (no game code since Phase C, AC 1) and src/**
  const code = [["index.html", html.replace(maps[0][0], "")], ...srcFiles(path.join(ROOT, "src")).map(f => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")])];
  const bad = [];
  for (const [name, text] of code) {
    if (/\bhttps?:\/\/(?!localhost|127\.0\.0\.1)/.test(text)) bad.push(`${name}: names a remote URL`);   // SPEC-025: no CDN, no other host
    for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) if (/^https?:/.test(m[1]) || /(^|\/)three(\.module)?\.js$/.test(m[1])) bad.push(`${name}: imports ${m[1]}`);
  }
  expect(bad).toEqual([]);
  expect(code.some(([, text]) => /\bimport \* as THREE from "three";/.test(text)), "the game imports the bare name (index.html or src/**)").toBe(true);
});

// AC 11b: `npm run lint` (scripts/lint.js, eslint.config.js) — the minimal rule set on every block, no browser-only globals
// for the core (it runs in Node; AC 3), browser globals for the client, the local imports check for
// module code, and a lint job in every Tests run
const BROWSER_ONLY = ["document", "window", "localStorage", "navigator", "requestAnimationFrame", "Audio", "AudioContext", "globalThis"];
test("lint config covers src/", { tag: "@fast" }, () => {
  const config = require(path.join(ROOT, "eslint.config.js"));
  const block = file => config.find(c => (c.files || []).includes(file));
  const core = block("src/core/**/*.js"), client = block("src/client/**/*.js");
  expect(!!core && !!client, "a src/core and a src/client block").toBe(true);
  for (const f of ["src/i18n.js", "src/story.js"]) expect(block(f), `${f} is linted like the core`).toBe(core);
  // Phase C: no inline module left in the shell, so nothing is extracted for linting any more
  expect(config.flatMap(c => c.files || []).filter(f => f.includes("lint-index")), "no extracted inline module in the config").toEqual([]);
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
// The reference was recorded on the one-file game at its fixed step of 1/30 s (the old CFG.BALANCE.SIM_DT). SPEC-034 made the one game
// step CFG.STEP = 1/60 s everywhere, but this test checks the split of the code, not the step size, so it keeps stepping at the
// recorded dt (an explicit number, the same in the page and here); the reference is not re-recorded (and cannot be).
const REF_DT = 1 / 30;
const BASELINE_FILE = path.join(FIXTURES, "events-baseline.json");
// Snapshots every 2 s (finer than the 10 s asked for: the stocked runs win in 6–64 s). [world, level, players]: the spec's three
// runs and its 2-player run, plus City 18 — the spec's runs win before anyone needs a rescue kit; City 18 uses one.
const BASELINE = { seed: 7, style: "careful", seconds: 120, snapEvery: 2 };
const BASELINE_RUNS = [["park", 1, 1], ["beach", 9, 1], ["winter", 18, 1], ["park", 1, 2], ["city", 18, 1]];
function baselineRun({ world, n, players, style, seed, seconds, snapEvery, save, dt }) {   // runs in the page; plain data only
  const b = window.__bb, f2 = v => v.toFixed(2);
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
// SPEC-012: spent (a kiss, a kit, a glove charge), result (a level won) and practiceWin are new gameplay events (AC 6b, 6, 10)
const NEW_EVENT_TYPES = ["spent", "result", "practiceWin"];
// SPEC-012 AC 6b (review): the star's coins event now names the slot that picked the star — compared without that one new field
const withoutStarSlot = e => { if (e.type !== "coins" || e.reason !== "star") return e; const { slot, ...rest } = e; return rest; };
// SPEC-032 changed hearing on purpose (HEAR_CHANCE 0.6, HEAR_TURN_TIME 0.35): the recorded game is played with the old hearing,
// which CFG still reaches (HEAR_CHANCE 1 draws no rng) — so the reference stays the same and proves nothing else changed
const OLD_HEARING = { HEAR_CHANCE: 1, HEAR_TURN_TIME: 0.15 };
test("same seed, same game after the split", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openGame(page, { sim: true });
  const keep = await page.evaluate(old => { const C = window.__bb.CFG, k = {}; for (const n of Object.keys(old)) { k[n] = C[n]; C[n] = old[n]; } return k; }, OLD_HEARING);
  try { await sameGame(page, errors); } finally { await page.evaluate(k => { Object.assign(window.__bb.CFG, k); }, keep); }
});
async function sameGame(page, errors) {
  const save = readJson(path.join(SAVES_DIR, "baseline-stocked.json")).keys["bebebe-progress"];
  const runs = [];
  for (const [world, n, players] of BASELINE_RUNS) runs.push(await page.evaluate(baselineRun, { world, n, players, save, dt: REF_DT, ...BASELINE }));
  // and scripts/balance.js runLevel itself (its whole level, the balance summary) on the stocked save: Park 1
  const { runLevel } = require(path.join(ROOT, "scripts", "balance.js"));
  const summary = await page.evaluate(runLevel, { world: "park", n: 1, style: BASELINE.style, seed: BASELINE.seed, progress: save, dt: REF_DT });
  // SPEC-012 AC 6 / 10: the events the client acts on that the recorded game did not log (it spent and paid in place) — compared
  // without exactly these types: every recorded event must still come in the same order with the same data
  summary.events -= await page.evaluate(types => window.__bb.events.filter(e => types.includes(e.type)).length, NEW_EVENT_TYPES);
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
    const gotEvents = got.events.filter(e => !NEW_EVENT_TYPES.includes(e.type)).map(withoutStarSlot);
    for (const d of [firstDiff(want.snaps, got.snaps, "state"), firstDiff(want.events, gotEvents, "event")]) if (d) bad.push(`${name}: ${d}`);
    const { snaps: s1, events: e1, ...wantHead } = want, { snaps: s2, events: e2, ...gotHead } = got;
    if (JSON.stringify(wantHead) !== JSON.stringify(gotHead)) bad.push(`${name}: want ${JSON.stringify(wantHead)}, got ${JSON.stringify(gotHead)}`);
  });
  if (JSON.stringify(ref.summary) !== JSON.stringify(summary)) bad.push(`runLevel summary: want ${JSON.stringify(ref.summary)}, got ${JSON.stringify(summary)}`);
  expect(bad, "the game plays differently from the recorded baseline").toEqual([]);
  // a reference that tests something: the stock and the main rules are used
  const types = new Set(ref.runs.flatMap(r => r.events.map(e => e.type)));
  expect(["hug", "push", "down", "item", "kiss", "kit"].filter(t => !types.has(t)), "event types the baseline never saw").toEqual([]);
}

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
  const savedLoads = stored["bebebe-save"] && plain(b.loadProgress(stored["bebebe-save"].progress));   // SPEC-025: what bebebe-save loads into
  return { progress: plain(b.progress), outfits: plain(b.outfits), names: plain(b.names), lang: b.lang, world: b.world, level: b.level, mode: b.mode, stored, savedLoads };
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
  // SPEC-025 AC 3: the old keys are never written again (they stay exactly as the fixture stored them) and everything the start
  // used to write back is in bebebe-save — so `stored` is checked that way; every other loaded field exactly as recorded
  for (const [n, want] of Object.entries(ref)) for (const k of Object.keys(want).filter(q => q !== "stored")) soft(got[n][k], `${n}: ${k}`).toEqual(want[k]);
  for (const f of files) {
    const n = f.slice(0, -5), keys = readJson(path.join(SAVES_DIR, f)).keys, st = got[n].stored;
    const parsed = Object.fromEntries(Object.entries(asStored(keys)).map(([k, v]) => { try { return [k, JSON.parse(v)]; } catch (e) { return [k, v]; } }));
    for (const k of Object.keys(parsed).filter(q => !q.startsWith("bebebe-save"))) soft(st[k], `${n}: the old key ${k} is untouched`).toEqual(parsed[k]);
    soft(Object.keys(st).filter(k => !(k in parsed) && !k.startsWith("bebebe-save")), `${n}: no other old key written`).toEqual([]);
    soft(typeof (st["bebebe-save"] || {}).version, `${n}: bebebe-save written`).toBe("number");
    soft(got[n].savedLoads, `${n}: bebebe-save loads into the same progress`).toEqual(got[n].progress);
  }
  soft.done();
});

// AC 6: opened from disk (file:), the game's modules cannot load: instead of a black page the small non-module script shows
// how to open it, in the saved language (bebebe-lang) or else the browser's, English when neither is one of ours
const FILE_NOTICE = { en: "Open the game from the website or run npm run serve", es: "Abrí el juego desde la página o corré npm run serve",
  pt: "Abra o jogo pelo site ou rode npm run serve", ru: "Откройте игру с сайта или запустите npm run serve" };
test("file:// shows the notice", async ({ browser }) => {
  const url = require("url").pathToFileURL(INDEX).href;
  const cases = [["en", "en-US", "en"], ["es", "en-US", "es"], ["pt", "en-US", "pt"], ["ru", "en-US", "ru"],
    [null, "es-AR", "es"], [null, "pt-BR", "pt"], [null, "ru-RU", "ru"], [null, "de-DE", "en"], ["xx", "de-DE", "en"]];
  const got = [];
  for (const [saved, locale, want] of cases) {
    const ctx = await browser.newContext({ locale });
    try {
      const page = await ctx.newPage();
      if (saved) await page.addInitScript(l => { try { localStorage.setItem("bebebe-lang", l); } catch (e) { /* ok */ } }, saved);
      await page.goto(url);
      const text = await page.locator("#file-notice").textContent({ timeout: 10_000 });
      got.push([saved, locale, text === FILE_NOTICE[want] ? want : text]);
    } finally { await ctx.close(); }
  }
  expect(got).toEqual(cases.map(([saved, locale, want]) => [saved, locale, want]));
  // the notice is in the four languages of the spec, and the failed-start card (SPEC-025 AC 7b) does not replace it on file:
  expect(fs.readFileSync(INDEX, "utf8")).toContain("location.protocol === \"file:\") return;");
});

// ---------- The core's code: the files of src/core/ (relative names with /)
const relName = f => path.relative(ROOT, f).replace(/\\/g, "/");
const coreCode = () => srcFiles(path.join(ROOT, "src", "core")).map(f => [relName(f), fs.readFileSync(f, "utf8")]);
const allSrc = () => srcFiles(path.join(ROOT, "src")).map(relName).sort();
const readRoot = f => fs.readFileSync(path.join(ROOT, f), "utf8");
// code without comments and string contents (a comment or a text may name anything)
const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1")
  .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "\"\"");

// AC 3b: the core reaches the client only through one port, src/core/hooks.js: setHooks({ … }) with no-op defaults (the Node
// import works without a client). SPEC-012 AC 5: the effects (sfx, burst, pop, shake, fx, banner) became events in G.fx and the
// input hook became the input slots G.inputs (AC 3); the hooks left, each with why ("core hook list"):
const HOOKS = {
  // the one hook left: the 3D scene must be rebuilt at once, inside buildGame, for the game just built (its map and characters);
  // everything else is an event the client applies after the step (effects AC 5, economy and win AC 6, practice win AC 10)
  rebuild: "rebuild the 3D scene for the game buildGame just built"
};
// client code the logic called directly before SPEC-011 (RR-01) and client state it wrote: none of it in the core
const CLIENT_NAMES = ["SFX", "burst", "popText", "texts", "particles", "shake", "banner", "showBanner", "camSnap", "rebuild3D", "sticks",
  "keys", "pads", "deviceInput", "stickR", "tiptoeKey", "PHONE", "isTouch", "skinSel", "skinKeep", "makeLook", "botOutfit",
  "tutorialNext", "openedWorld", "worldBanner", "writeProgress", "localStorage", "document", "simMode", "renderer", "camera", "ctx"];
test("core hook list", { tag: "@fast" }, () => {
  const core = coreCode();
  expect(core.map(([f]) => f), "the core and the hooks port exist").toEqual(expect.arrayContaining(["src/core/hooks.js", "src/core/economy.js", "src/core/game.js"]));
  const bad = [];
  for (const [file, text] of core) {
    if (/\bimport\b[^;]*?from\s*["'][^"']*client\//.test(text)) bad.push(`${file}: imports src/client/`);
    const code = codeOnly(text);
    for (const name of CLIENT_NAMES) if (new RegExp(`(?<![.\\w$])${name}\\b(?!\\s*:)`).test(code)) bad.push(`${file}: uses ${name}`);
  }
  expect(bad, "client names in the core (call hooks.<name>() instead)").toEqual([]);
  // the port: exactly the listed hooks, each a no-op by default, each but onPracticeWin under the game-rng guard (a hook is client
  // code: it must not draw the gameplay rng()); onPracticeWin starts the next practice game, whose buildGame draws rng() on purpose
  const port = codeOnly(core.find(([f]) => f === "src/core/hooks.js")[1]);
  const defaults = port.match(/HOOK_DEFAULTS\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\)/);
  expect(!!defaults, "HOOK_DEFAULTS in hooks.js").toBe(true);
  expect([...defaults[1].matchAll(/^\s*(\w+):/gm)].map(m => m[1])).toEqual(Object.keys(HOOKS));
  const raw = readRoot("src/core/hooks.js").replace(/\r\n/g, "\n").match(/HOOK_DEFAULTS\s*=\s*Object\.freeze\(\{\n([\s\S]*?)\n\}\)/)[1].split("\n");
  expect(raw.filter(l => !l.includes("//")), "every hook says why it is still a hook").toEqual([]);
  expect(port).toMatch(/noGameRng\(""\s*\+\s*k\b/);
  expect(port).toMatch(/function setHooks\(/);
  expect(readRoot("src/core/hooks.js"), "no hook re-enters the core (SPEC-012: the practice win is an event)").not.toMatch(/HOOKS_REENTER/);
  // and the core uses the port: every hook is called somewhere in the core
  const all = core.map(([, t]) => codeOnly(t)).join("\n");
  expect(Object.keys(HOOKS).filter(h => !new RegExp(`\\bhooks\\.${h}\\(`).test(all)), "hooks the core never calls").toEqual([]);
});

// SPEC-012 AC 7: the headless core's Node tests (tests/core/*.test.mjs) run with node --test (npm run test:core) as their own job of
// every Tests run (spec branches and, through pages.yml, every deploy), and Playwright never loads them
test("core tests run in Node on every Tests run", { tag: "@fast" }, () => {
  expect(JSON.parse(readRoot("package.json")).scripts["test:core"]).toBe("node --test \"tests/core/*.test.mjs\"");
  expect(readRoot(".github/workflows/tests.yml"), "a core job runs npm run test:core").toMatch(/\n {2}core:\n[\s\S]*?run: npm run test:core/);
  expect(require(path.join(ROOT, "playwright.config.js")).testMatch, "Playwright runs *.spec.js only").toBe("**/*.spec.js");
  const files = fs.readdirSync(path.join(ROOT, "tests", "core")).filter(f => f.endsWith(".test.mjs")).sort();
  expect(files).toEqual(expect.arrayContaining(["inputs.test.mjs", "instances.test.mjs", "practice.test.mjs", "result.test.mjs", "run.test.mjs"]));
});

// SPEC-012 AC 1c: the core never reads or writes the client's screen — no `mode` identifier in src/core/ (code, not comments or
// texts); the game has its own phase G.phase ("play" | "hugEnd" | "kindWalk" | "won"), set only by the core
test("no `mode` identifier in src/core/", { tag: "@fast" }, () => {
  const MODE = /(?<![.\w$])mode\b/;
  expect(coreCode().filter(([, t]) => MODE.test(codeOnly(t))).map(([f]) => f), "src/core/ files that name `mode`").toEqual([]);
  expect(MODE.test(codeOnly("if (mode === \"play\") x();")), "the scan sees a planted use").toBe(true);
  const sets = [...coreCode().map(([, t]) => t).join("\n").matchAll(/G\.phase = "(\w+)"/g)].map(m => m[1]);
  expect([...new Set(sets)].sort(), "the phases the core sets").toEqual(["hugEnd", "kindWalk", "play", "won"]);
  expect(allSrc().filter(f => f.startsWith("src/client/") && /G\.phase\s*=[^=]/.test(readRoot(f))), "the client never sets the phase").toEqual([]);
});

// SPEC-012 AC 1 / 1b: a game's state lives in its game object (src/core/game.js newGame). Module level of src/core/ keeps only what
// AC 1 allows: the active-game pointer, the hooks, the rng test switches, the level cache and the session economy (progress and
// the coin book ledger), plus constant tables. A module-level `let` and a `const` holding a container (array, object, Map, Set,
// typed array, or anything a call makes) that is not frozen must be in this list — a `let`-only scan would miss grids filled in
// place. Each entry says why.
const CORE_MODULE_STATE = {
  "src/core/active.js:G": "the active-game pointer (AC 1)",
  "src/core/util.js:rngOff": "the gameplay-rng guard: the name of the code that must not draw it (test switch, AC 1)",
  "src/core/util.js:strictRng": "the strict rng guard of the tests (AC 1)",
  "src/core/hooks.js:hookImpl": "the hooks the client registered (AC 1: the hooks)",
  "src/core/level/build.js:levelCache": "the accepted attempt per level key: pure per key, shared by all games (AC 1)",
  "src/core/economy.js:progress": "the player's economy (AC 1b: session economy data)",
  "src/core/economy.js:ledger": "the session coin book: survives startGame, the shop writes it (AC 1b)",
  // constant tables: data the game reads and never writes (CFG and the price tables are tuned by tests through __bb.CFG / __bb.*)
  "src/core/config.js:CFG": "the rule numbers (constant table; tests tune them)",
  "src/core/config.js:GLOVES": "constant table", "src/core/config.js:KISSES": "constant table", "src/core/config.js:RESCUE_KIT": "constant table",
  "src/core/config.js:REWARD": "constant table", "src/core/config.js:WARDROBE_TIERS": "constant table", "src/core/config.js:UPGRADES": "constant table",
  "src/core/wardrobe.js:HAIRS": "constant table", "src/core/wardrobe.js:HATS": "constant table", "src/core/wardrobe.js:JACKETS": "constant table",
  "src/core/wardrobe.js:PANTS": "constant table", "src/core/wardrobe.js:BIG_SKINS": "constant table"
};
const SCALAR_INIT = ["ArrowFunctionExpression", "FunctionExpression", "Literal", "TemplateLiteral", "UnaryExpression", "BinaryExpression"];
function coreModuleState(files) {                    // [file, kind, name] of every module-level let and container const
  const espree = require("espree"), out = [];
  for (const [f, text] of files) {
    for (const n0 of espree.parse(text, { ecmaVersion: "latest", sourceType: "module" }).body) {
      const n = n0.type === "ExportNamedDeclaration" ? n0.declaration : n0;
      if (!n || n.type !== "VariableDeclaration") continue;
      for (const d of n.declarations) {
        const i = d.init, frozen = i && i.type === "CallExpression" && i.callee.type === "MemberExpression" && i.callee.object.name === "Object" && i.callee.property.name === "freeze";
        if (n.kind === "let" || (i && !SCALAR_INIT.includes(i.type) && !frozen)) out.push(`${f}:${d.id.name}`);
      }
    }
  }
  return out;
}
test("no mutable module-level containers in core", { tag: "@fast" }, () => {
  const found = coreModuleState(coreCode());
  expect(found.filter(k => !CORE_MODULE_STATE[k]), "module-level state in src/core/ (move it into the game object, newGame)").toEqual([]);
  expect(Object.keys(CORE_MODULE_STATE).filter(k => !found.includes(k)), "listed but gone (drop the line)").toEqual([]);
  // the scan sees what it is for: a typed array, a Map, an array, a let, a call — and not a frozen table or a function
  const planted = coreModuleState([["x.js", "export const a = new Uint8Array(4), b = new Map(), c = [];\nlet d = 0;\nconst e = make(), f = Object.freeze([1]), g = () => 1, h = 3;"]]);
  expect(planted).toEqual(["x.js:a", "x.js:b", "x.js:c", "x.js:d", "x.js:e"]);
});

// SPEC-012 AC 5: the core never translates — a pop text is an I18N key and its arguments (emit("pop", { key, args, … })), each
// client says it in its own language; no L(), I18N or import of src/i18n.js in src/core/
test("no `L()` / `I18N` use in src/core/", { tag: "@fast" }, () => {
  const bad = [];
  for (const [f, text] of coreCode()) {
    if (/from\s*["'][^"']*i18n\.js["']/.test(text)) bad.push(`${f}: imports i18n.js`);
    const code = codeOnly(text);
    if (/(?<![.\w$])L\(\)/.test(code)) bad.push(`${f}: calls L()`);
    if (/(?<![.\w$])I18N\b/.test(code)) bad.push(`${f}: uses I18N`);
  }
  expect(bad).toEqual([]);
  // and the effect events are the core's way to the client: every pop names a key (or a null key with the text itself)
  const pops = coreCode().flatMap(([f, t]) => [...t.matchAll(/emit\("pop", \{ key: ([^,]+),/g)].map(m => m[1]));
  expect(pops.length, "the core emits pop texts").toBeGreaterThan(15);
  expect(pops.filter(k => !/^("\w+"|null|power > 1 \? "megaHug" : "hug")$/.test(k)), "pop keys that are not a key or null").toEqual([]);
});

// AC 2c: CFG is split by meaning — src/core/config.js holds the rules, generator and balance, src/client/look.js (LOOK) the look/UI
// keys; key names did not change. No key in both; no look-named key in the core config except these (each with why); the core
// never reads a LOOK key.
const LOOK_NAME = /^(CAM_|PHONE_|MINIMAP_|ART$|PAPER|STORY_TEXT_|STORY_PIC$|TEXT_TEST_SCALE$|NAME_TAG$|BANNER_|PAD_|KISS_BTN$|TIPTOE_BTN$|STICK_ZONE$|ARROW_D$|OUTLINE_|SAFE_GLOW$|BOSS_SCALE$|STAR_BLINK$|DANGER_WARN$|BUBBLE_MIN$|LANG_SCREEN$|WIN_|PRICE_FIT_MARGIN$|BACK_CLOSE_WAIT$|VIEW_DT_MAX$)|_LOOK$/;   // SPEC-032: + TIPTOE_BTN, BUBBLE_MIN, LANG_SCREEN; SPEC-033: + WIN_GAP; SPEC-034: + VIEW_DT_MAX
const CONFIG_LOOK_ALLOW = {
  TUTORIAL_LOOK: "the practice game reads TUTORIAL_LOOK.dadStart (where Dad stands in practice 1): gameplay, so the whole table stays in core config",
  HEAR_LOOK: "a rule, not a look: how many seconds the Big One keeps looking where he heard running feet (hearing.js)"
};
const importSrc = f => import(require("url").pathToFileURL(path.join(ROOT, f)).href);
test("core config holds no look keys", { tag: "@fast" }, async () => {
  const { CFG } = await importSrc("src/core/config.js"), { LOOK } = await importSrc("src/client/look.js");
  expect(Object.keys(CFG).filter(k => Object.hasOwn(LOOK, k)), "keys in both objects").toEqual([]);
  expect(Object.keys(CFG).filter(k => LOOK_NAME.test(k) && !CONFIG_LOOK_ALLOW[k]), "look keys in the core config").toEqual([]);
  expect(Object.keys(CONFIG_LOOK_ALLOW).filter(k => !Object.hasOwn(CFG, k)), "allowed keys that are not there").toEqual([]);
  expect(Object.keys(LOOK).filter(k => !LOOK_NAME.test(k)), "LOOK keys that do not look like look keys").toEqual([]);
  expect(Object.keys(LOOK).length).toBeGreaterThan(50);
  const reads = coreCode().flatMap(([f, t]) => [...codeOnly(t).matchAll(/\bCFG\.([A-Z][A-Z0-9_]*)/g)].filter(m => Object.hasOwn(LOOK, m[1])).map(m => `${f}: CFG.${m[1]}`));
  expect(reads, "the core reads look keys").toEqual([]);
});

// AC 2c: __bb.CFG is one view over both objects: reading, writing and restoring any key through it (as tests do) reaches the real
// object — seen in the modules themselves and in the game's behaviour; `in`, a new key and its delete, spread, JSON and the key
// list (no duplicates) work as on a plain object; a getter keeps its `this`
test("__bb.CFG writes reach config.js and look.js", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const r = await page.evaluate(async () => {
    const b = window.__bb, C = b.CFG, out = {};
    const core = (await import("./src/core/config.js")).CFG, look = (await import("./src/client/look.js")).LOOK;   // the game's own instances (import map)
    const hp0 = b.difficulty("park", 1).hearts, big0 = C.BIG_HP, story0 = C.STORY_TEXT_MIN;
    C.BIG_HP = big0 + 3; C.STORY_TEXT_MIN = story0 + 5;
    out.written = [core.BIG_HP === big0 + 3, look.STORY_TEXT_MIN === story0 + 5, !Object.hasOwn(core, "STORY_TEXT_MIN"), !Object.hasOwn(look, "BIG_HP")];
    out.behaviour = [b.difficulty("park", 1).hearts - hp0, b.textFloors.story - story0];
    C.BIG_HP = big0; C.STORY_TEXT_MIN = story0;
    out.restored = [core.BIG_HP === big0, look.STORY_TEXT_MIN === story0, b.difficulty("park", 1).hearts === hp0];
    out.in = ["BIG_HP" in C, "MENU_LOOK" in C, "NOPE_NOT_A_KEY" in C];
    C.TEST_NEW_KEY = 1; out.added = [core.TEST_NEW_KEY === 1, "TEST_NEW_KEY" in C];
    delete C.TEST_NEW_KEY; out.deleted = [Object.hasOwn(core, "TEST_NEW_KEY"), "TEST_NEW_KEY" in C];
    const keys = Reflect.ownKeys(C), spread = { ...C }, json = JSON.parse(JSON.stringify(C));
    out.keys = [keys.length, new Set(keys).size, Object.keys(core).length + Object.keys(look).length, Object.keys(spread).length];
    out.json = [json.DOWN_TIME === core.DOWN_TIME, JSON.stringify(json.MENU_LOOK) === JSON.stringify(look.MENU_LOOK)];
    const ps = C.PLAYER_SPEED, cap = C.BIG_CHASE_MAX; C.PLAYER_SPEED = ps * 2;
    out.getter = [cap === core.BIG_CHASE_MAX * 0.5, C.BIG_CHASE_MAX === core.BIG_CHASE_MAX];
    C.PLAYER_SPEED = ps;
    return out;
  });
  expect(r.written).toEqual([true, true, true, true]);
  expect(r.behaviour, "the game reads the written values").toEqual([3, 5]);
  expect(r.restored).toEqual([true, true, true]);
  expect(r.in).toEqual([true, true, false]);
  expect(r.added).toEqual([true, true]);
  expect(r.deleted).toEqual([false, false]);
  expect(r.keys[0]).toBe(r.keys[1]);
  expect(r.keys[0]).toBe(r.keys[2]);
  expect(r.keys[3]).toBe(r.keys[2]);
  expect(r.json).toEqual([true, true]);
  expect(r.getter).toEqual([true, true]);
  expect(errors).toEqual([]);
});

// AC 3: the dependency rule. src/core/** imports only src/core/**, src/i18n.js and src/story.js (relative paths; no bare names
// such as "three", no dynamic import()), and never uses the browser's globals. Exceptions still needed are listed in
// CORE_DOM_ALLOW as [file, name, why] — SPEC-012 must empty it (today it is empty: the client seeds the rng and sets the strict
// guard from window, and every storage access is the client's).
const SHARED = ["src/i18n.js", "src/story.js"];
const CORE_FORBIDDEN = ["document", "window", "globalThis", "self", "localStorage", "sessionStorage", "navigator", "requestAnimationFrame", "Audio", "AudioContext"];
const CORE_DOM_ALLOW = [];
test("core does not depend on the client", { tag: "@fast" }, () => {
  const bad = [];
  for (const f of [...coreCode().map(([f]) => f), ...SHARED]) {
    const text = readRoot(f), code = codeOnly(text);
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)) {
      const target = m[1].startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])) : m[1];
      if (!(target.startsWith("src/core/") || SHARED.includes(target))) bad.push(`${f}: imports ${m[1]}`);
    }
    if (/\bimport\s*\(/.test(code)) bad.push(`${f}: dynamic import()`);
    for (const name of CORE_FORBIDDEN) {
      if (new RegExp(`(?<![.\\w$])${name}\\b`).test(code) && !CORE_DOM_ALLOW.some(([af, an]) => af === f && an === name)) bad.push(`${f}: uses ${name}`);
    }
  }
  expect(bad, "the core depends on the client or the browser").toEqual([]);
  expect(CORE_DOM_ALLOW, "exceptions left (SPEC-012 empties the list)").toEqual([]);
  // the scan catches what it is for
  const planted = codeOnly("const a = window.innerWidth; localStorage.getItem(\"x\");");
  expect(CORE_FORBIDDEN.filter(n => new RegExp(`(?<![.\\w$])${n}\\b`).test(planted))).toEqual(["window", "localStorage"]);
});

// AC 4 / 4b: the core, the shared data and the client files that scripts import run in plain Node: they load without a DOM, and
// their top level holds only imports, exports and declarations (no storage, no DOM, no window read at import). src/package.json
// says "type": "module", so Node loads them as ES modules without a warning.
const NODE_FILES = ["src/core/index.js", "src/i18n.js", "src/story.js", "src/client/look.js", "src/client/art-names.js"];
test("core loads in Node", { tag: "@fast" }, () => {
  const { spawnSync } = require("child_process");
  const script = `Promise.all(${JSON.stringify(NODE_FILES.map(f => "./" + f))}.map(f => import(f)))` +
    ".then(ms => console.log(JSON.stringify(ms.map(m => Object.keys(m).length))), e => { console.error(e.stack || e); process.exit(1); })";
  const r = spawnSync(process.execPath, ["-e", script], { cwd: ROOT, encoding: "utf8" });
  expect(r.stderr, "Node prints nothing to stderr (no error, no warning)").toBe("");
  expect(r.status).toBe(0);
  const counts = JSON.parse(r.stdout);
  expect(counts[0], "src/core/index.js exports the core").toBeGreaterThan(150);
  expect(counts.every(n => n > 0)).toBe(true);
  // index.js re-exports every core module
  const index = readRoot("src/core/index.js");
  expect(coreCode().map(([f]) => f).filter(f => f !== "src/core/index.js" && !index.includes(`"./${f.slice("src/core/".length)}"`)), "core modules index.js misses").toEqual([]);
  expect(JSON.parse(readRoot("src/package.json")).type).toBe("module");
  // AC 4b: only declarations at the top level
  const espree = require("espree");
  const OK = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "VariableDeclaration", "FunctionDeclaration", "ClassDeclaration"];
  const bad = [];
  for (const f of [...coreCode().map(([f]) => f), ...NODE_FILES.slice(1)]) {
    const ast = espree.parse(readRoot(f), { ecmaVersion: "latest", sourceType: "module", loc: true });
    for (const n of ast.body) if (!OK.includes(n.type)) bad.push(`${f}:${n.loc.start.line} ${n.type}`);
  }
  expect(bad, "top-level statements other than declarations").toEqual([]);
});

// AC 2d: no module over 900 lines (a file that grows past it is split, as the big sections of index.html were)
test("no module over 900 lines", { tag: "@fast" }, () => {
  const big = allSrc().map(f => [f, readRoot(f).replace(/\r?\n$/, "").split(/\r?\n/).length]).filter(([, n]) => n > 900);
  expect(big).toEqual([]);
});

// AC 2 / 2b / 2e: docs/architecture.md has the module table (between <!-- modules:start --> and <!-- modules:end -->): every file of
// src/ is listed, every listed file exists, the spec's core tree is there, and the state column names every module-level let
const ARCH = path.join(ROOT, "docs", "architecture.md");
const SPEC_CORE = ["index", "config", "util", "hooks", "world", "level/layouts", "level/generate", "level/build", "level/validate", "path",
  "difficulty", "rules", "bots", "big", "game", "mood", "hearing", "autopilot", "practice", "progress-rules", "economy"].map(n => `src/core/${n}.js`);
// AC 2 / 2e (Phase C): the client tree of the spec. Two names of AC 2 are not files, as architecture.md says: three/skins.js
// (the wardrobe previews are three/previews.js, AC 2e) and ui/overlay.js / ui/overlay-phone.js (replaced by the screen modules)
const SPEC_CLIENT = ["main", "state", "debug", "screen", "input", "sound", "progress", "outfits", "art", "flow", "tutorial",
  "ui/draw", "ui/text", "ui/hud", "ui/phone", "ui/minimap", "ui/home", "ui/map", "ui/story", "ui/win",
  "ui/character/progress", "ui/character/items", "ui/character/wardrobe", "ui/character/upgrades",
  "three/setup", "three/camera", "three/themes", "three/map3d", "three/characters", "three/sync", "three/houses", "three/materials",
  "three/bosses", "three/previews"].map(n => `src/client/${n}.js`);
// the rows of the module table: file → the rest of its row
function moduleTable() {
  const doc = fs.readFileSync(ARCH, "utf8").split("\r\n").join("\n");
  const a = doc.indexOf("<!-- modules:start -->"), b = doc.indexOf("<!-- modules:end -->");
  expect(a > 0 && b > a, "the module table markers").toBe(true);
  return Object.fromEntries([...doc.slice(a, b).matchAll(/^\| `(src\/[^`]+)` \|(.*)$/gm)].map(m => [m[1], m[2]]));
}
// every listed file exists, the table names every module-level let of the files of `files`
function tableCovers(rows, files) {
  const missing = [];
  for (const f of files) {
    const lets = [...readRoot(f).matchAll(/^(?:export )?let (.+)$/gm)].flatMap(m => [...m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)].map(x => x[1]));
    for (const l of lets) if (!rows[f].includes("`" + l + "`")) missing.push(`${f}: ${l}`);
  }
  expect(missing, "module-level lets the table does not name").toEqual([]);
}
test("every core module listed in architecture.md exists", { tag: "@fast" }, () => {
  const rows = moduleTable(), listed = Object.keys(rows);
  expect(listed.filter(f => !fs.existsSync(path.join(ROOT, f))), "listed but missing").toEqual([]);
  const core = allSrc().filter(f => !f.startsWith("src/client/"));
  expect(core.filter(f => !listed.includes(f)), "core and shared files not in the table").toEqual([]);
  expect([...SPEC_CORE, ...SHARED].filter(f => !listed.includes(f)), "the spec's core modules").toEqual([]);
  tableCovers(rows, core);
});
test("every module listed in architecture.md exists", { tag: "@fast" }, () => {
  const rows = moduleTable(), listed = Object.keys(rows);
  expect(listed.filter(f => !fs.existsSync(path.join(ROOT, f))), "listed but missing").toEqual([]);
  expect(allSrc().filter(f => !listed.includes(f)), "in src/ but not in the table").toEqual([]);
  expect(["src/client/look.js", "src/client/art-names.js", ...SPEC_CLIENT].filter(f => !listed.includes(f)), "the spec's client modules").toEqual([]);
  tableCovers(rows, allSrc().filter(f => f.startsWith("src/client/")));
});

// AC 5: the live-bindings rule — a module's `let` is reassigned only in that module; others call its setter. ESLint's
// no-import-assign enforces it for src/** (linted by npm run lint): the config has it, no src file
// breaks it, and it really fires on a planted write
test("live bindings: no module reassigns another module's let", async () => {
  test.setTimeout(60_000);
  const { ESLint } = require("eslint");
  const eslint = new ESLint({ cwd: ROOT });
  for (const f of ["src/core/game.js", "src/client/look.js", "src/i18n.js"]) {
    const cfg = await eslint.calculateConfigForFile(path.join(ROOT, f));
    expect(cfg.rules["no-import-assign"], f).toEqual([2]);
  }
  const results = await eslint.lintFiles(["src"]);
  const hits = results.flatMap(r => r.messages.filter(m => m.ruleId === "no-import-assign").map(m => `${relName(r.filePath)}:${m.line} ${m.message}`));
  expect(hits).toEqual([]);
  const [planted] = await eslint.lintText("import { mode } from \"./game.js\";\nmode = \"play\";\n", { filePath: path.join(ROOT, "src", "core", "planted.js") });
  expect(planted.messages.map(m => m.ruleId)).toContain("no-import-assign");
});

// AC 5b: the saves are read in one place, before the first game. SPEC-025 AC 3b: one save module owns storage — nothing in src/
// touches localStorage but the storage backend (src/client/storage.js); the game boots with `await loadSave()` once, in boot().
test("only the storage backend touches localStorage; loadSave once at start", { tag: "@fast" }, () => {
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");   // comments may name it
  const uses = t => /\blocalStorage\b|\bsessionStorage\b/.test(strip(t));
  const bad = allSrc().filter(f => f !== "src/client/storage.js" && uses(readRoot(f)));
  expect(bad, "storage outside src/client/storage.js").toEqual([]);
  expect(readRoot("src/client/storage.js"), "the backend is localStorage").toMatch(/localStorage\.setItem\(/);
  // the scan sees a planted use (and ignores a comment)
  expect(uses("// localStorage here\nconst a = 1;"), "a comment").toBe(false);
  expect(uses("const a = localStorage.getItem(\"x\");"), "code").toBe(true);
  const all = allSrc().filter(f => f.startsWith("src/client/")).map(f => readRoot(f).replace(/\r\n/g, "\n")).join("\n").replace(/^[ \t]+/gm, "");
  expect([...all.matchAll(/^await loadSave\(\);$/gm)].length, "await loadSave() once, in main.js's boot()").toBe(1);
  expect(/initSaves/.test(all.replace(/\/\/.*$/gm, "")), "initSaves is gone (replaced by loadSave)").toBe(false);
});

// AC 1 (Phase C): index.html is the shell — markup, CSS, the small non-module script (offline hint, file:// notice), the import
// map and one entry script <script type="module" src="./src/client/main.js?v=<hash>">. An entry script's src is not remapped by
// the import map, so npm run precache writes main.js's version into the tag (the same URL as the map's): a shell only ever
// loads its own module versions. No inline module, no game code.
test("index.html has no inline game code", { tag: "@fast" }, () => {
  const html = fs.readFileSync(INDEX, "utf8").replace(/\r\n/g, "\n");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ attrs: m[1].trim(), body: m[2].trim(), all: m[0] }));
  const map = JSON.parse(scripts.find(s => s.attrs === "type=\"importmap\"").body).imports;
  const entry = map["./src/client/main.js"];
  expect(entry, "main.js is in the import map at its hash").toMatch(/^\.\/src\/client\/main\.js\?v=[0-9a-f]{10}$/);
  expect(scripts.filter(s => /type="module"/.test(s.attrs)).map(s => [s.attrs, s.body]), "one module script: the entry, no inline code")
    .toEqual([[`type="module" src="${entry}"`, ""]]);
  expect(scripts.map(s => s.attrs.replace(/ src=.*/, "")).sort(), "the three scripts of the shell").toEqual(["", "type=\"importmap\"", "type=\"module\""]);
  const plain = scripts.find(s => s.attrs === "").body;
  // SPEC-025 AC 7b: + the start's own texts in four languages, the failed-start card and the first error handlers
  expect(plain.split("\n").length, "the non-module script stays small (start texts, failed start, error handlers, file:// notice)").toBeLessThan(45);
  expect(plain, "the non-module script imports nothing").not.toMatch(/\bimport\b/);
  const shell = scripts.reduce((h, s) => (s.attrs === "type=\"importmap\"" ? h.replace(s.all, "") : h), html);
  expect(shell.split("\n").length, "the shell without the import map is small").toBeLessThan(120);
});

// AC 2e and the review of Phase B: only src/client/main.js starts the game. Every other client module holds only imports,
// exports and declarations at its top level (its start-up work is an init function marked "called once by main.js"); main.js
// calls each of them once, in the start order of the one-file game — the tests' rng flags, setHooks before initSaves, initSaves
// before the renderer and the first resetWorld, then the loop, the service worker and window.__bb (debug.js). three.js is
// imported by its bare name only.
test("only main.js starts the game", { tag: "@fast" }, () => {
  const espree = require("espree");
  const OK = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "VariableDeclaration", "FunctionDeclaration", "ClassDeclaration"];
  const client = allSrc().filter(f => f.startsWith("src/client/")), MAIN = "src/client/main.js";
  expect(client).toContain(MAIN);
  const bad = [];
  for (const f of client.filter(x => x !== MAIN)) {
    const ast = espree.parse(readRoot(f), { ecmaVersion: "latest", sourceType: "module", loc: true });
    for (const n of ast.body) if (!OK.includes(n.type)) bad.push(`${f}:${n.loc.start.line} ${n.type}`);
  }
  expect(bad, "top-level statements other than declarations outside main.js").toEqual([]);
  const main = readRoot(MAIN).replace(/\r\n/g, "\n").replace(/^[ \t]+/gm, "");   // SPEC-025: the start steps are inside boot()
  const inits = client.flatMap(f => [...readRoot(f).replace(/\r\n/g, "\n").matchAll(/^\/\/ called once by main\.js.*\nexport function (\w+)\(\)/gm)].map(m => [f, m[1]]));
  expect(inits.map(([, n]) => n), "the init functions").toEqual(expect.arrayContaining(["initThree", "initScene", "initScreen", "initInput", "installDebug"]));
  for (const [f, n] of inits) {
    expect([...main.matchAll(new RegExp(`^${n}\\(\\);$`, "gm"))].length, `${n} (${f}) is called once by main.js`).toBe(1);
    const others = client.filter(x => x !== MAIN && new RegExp(`(?<!function )\\b${n}\\(`).test(readRoot(x).replace(/\/\/.*$/gm, "")));
    expect(others, `${n} is called only by main.js`).toEqual([]);
  }
  const at = ["setStrictRng(window.__bbStrictRng", "seedRandom(window.__bbSeed)", "setHooks({", "await loadSave();", "initThree();\nfit();\ninitScene();", "resetWorld(1);",
    "window.__bbReady = true;", "requestAnimationFrame(frame);", "registerServiceWorker();", "installDebug();"].map(t => [t, main.indexOf(t)]);
  expect(at.filter(([, i]) => i < 0).map(([t]) => t), "main.js runs every start step").toEqual([]);
  expect(at.map(([t]) => t), "in the start order").toEqual([...at].sort((x, y) => x[1] - y[1]).map(([t]) => t));
  for (const f of client.filter(x => x.startsWith("src/client/three/"))) {
    if (/\bTHREE\./.test(readRoot(f))) expect(readRoot(f), `${f} imports three by its bare name`).toMatch(/^import \* as THREE from "three";$/m);
  }
});

// The review of Phase C: the client's imports form cycles, and inside a cycle a module may be evaluated before a module it
// imports. A declaration initialiser at the top level (evaluated at load, outside any function) that reads an imported binding
// of a module in the same import cycle which is evaluated later would throw (TDZ) or read a half-built value. Evaluation order
// as the browser does it: depth-first from src/client/main.js, imports in source order, a module after its imports.
test("no top-level read of a module evaluated later in the same import cycle", { tag: "@fast" }, () => {
  const espree = require("espree");
  const files = allSrc(), info = {};
  for (const f of files) {
    const ast = espree.parse(readRoot(f), { ecmaVersion: "latest", sourceType: "module", loc: true });
    const imported = new Map(), deps = [];
    for (const n of ast.body) {
      if (n.type !== "ImportDeclaration" || !n.source.value.startsWith(".")) continue;
      const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), n.source.value));
      deps.push(to);
      for (const s of n.specifiers) imported.set(s.local.name, to);
    }
    // identifiers read while the module evaluates: in declaration initialisers, outside function bodies
    const reads = [];
    const visit = (node, key) => {
      if (!node || typeof node.type !== "string" || /Function/.test(node.type)) return;
      if (node.type === "Identifier" && imported.has(node.name) && key !== "skip") reads.push([node.name, node.loc.start.line]);
      for (const k of Object.keys(node)) {
        if (k === "loc" || k === "range") continue;
        const skip = ((node.type === "Property" || node.type === "PropertyDefinition") && k === "key" && !node.computed) || (node.type === "MemberExpression" && k === "property" && !node.computed);
        const v = node[k];
        if (Array.isArray(v)) v.forEach(x => visit(x, skip ? "skip" : k)); else if (v && typeof v.type === "string") visit(v, skip ? "skip" : k);
      }
    };
    for (const n of ast.body) {
      const d = n.type === "ExportNamedDeclaration" ? n.declaration : n;
      if (d && (d.type === "VariableDeclaration" || d.type === "ClassDeclaration")) visit(d);
    }
    info[f] = { imported, deps, reads };
  }
  // evaluation order and the import cycles (Tarjan's strongly connected components)
  const order = [], seen = new Set();
  const post = f => { if (seen.has(f) || !info[f]) return; seen.add(f); info[f].deps.forEach(post); order.push(f); };
  post("src/client/main.js");
  const pos = new Map(order.map((f, i) => [f, i]));
  let idx = 0;
  const st = [], on = new Set(), I = {}, low = {}, comp = {};
  const sc = v => {
    I[v] = low[v] = idx++; st.push(v); on.add(v);
    for (const w of info[v].deps.filter(x => info[x])) {
      if (!(w in I)) { sc(w); low[v] = Math.min(low[v], low[w]); } else if (on.has(w)) low[v] = Math.min(low[v], I[w]);
    }
    if (low[v] === I[v]) { let w; do { w = st.pop(); on.delete(w); comp[w] = v; } while (w !== v); }
  };
  files.forEach(f => { if (!(f in I)) sc(f); });
  const bad = [];
  let reads = 0;
  for (const f of files) for (const [name, line] of info[f].reads) {
    reads++;
    const from = info[f].imported.get(name);
    if (comp[from] === comp[f] && pos.has(from) && pos.has(f) && pos.get(from) > pos.get(f)) bad.push(`${f}:${line} reads ${name} of ${from}, evaluated later in the same cycle`);
  }
  expect(order.length, "main.js reaches the client and the core").toBeGreaterThan(60);
  expect(reads, "the scan sees top-level reads (LOOK, CFG, …)").toBeGreaterThan(20);
  expect(bad).toEqual([]);
  expect(info["src/client/three/setup.js"].deps.filter(d => d.startsWith("src/client/") && !/\/(look|art-names)\.js$/.test(d)), "three/setup.js is a leaf of the client").toEqual([]);
});

// AC 8c: no script or test reads game code from index.html. The files that still read index.html read the shell (since Phase C
// it has no game code) — each named here with why; a new reader fails.
const INDEX_READERS = {
  "scripts/eslint-imports.js": "the import map (shell): which bare names resolve",
  "scripts/precache.js": "writes the shell's import map (module hashes), <meta name=\"src-hash\"> (AC 9) and the entry script's version",
  "tests/modules.spec.js": "the shell: the import map, the file:// notice, no inline game code (AC 1)",
  "tests/pwa.spec.js": "the shell: the import map (three.js version) and the page the network-first test serves"
};
test("no script or test reads game code from index.html", { tag: "@fast" }, () => {
  const found = [];
  for (const dir of ["scripts", "tests"]) for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(n => n.endsWith(".js"))) {
    const text = fs.readFileSync(path.join(ROOT, dir, f), "utf8");
    if (/readFileSync/.test(text) && /path\.(?:join|resolve)\(\s*(?:ROOT|__dirname)[^)]*["']index\.html["']/.test(text)) found.push(`${dir}/${f}`);
  }
  expect(found.sort()).toEqual(Object.keys(INDEX_READERS).sort());
  // the numbers, the art names and the menus' look come from src/ (AC 8c)
  expect(readRoot("scripts/docs-numbers.js")).toContain("\"src\", \"core\", \"config.js\"");
  expect(readRoot("scripts/assets.js")).toContain("\"src\", \"client\", \"art-names.js\"");
});
