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
  // the notice is in the four languages of the spec, and the "needs internet" hint does not replace it on file:
  expect(fs.readFileSync(INDEX, "utf8")).toContain("location.protocol !== \"file:\"");
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
// import works without a client). Every hook, and what replaces it (SPEC-012 turns sfx, burst, pop, shake, save and inputFor
// into events and input slots and removes them here):
const HOOKS = {
  sfx: "a sound by its SFX name (SPEC-012: an event)",
  burst: "particles (SPEC-012: an event)",
  pop: "a flying text over the game; the core gives the text (SPEC-012: an event)",
  shake: "camera shake (SPEC-012: an event)",
  fx: "the client's own effects step inside update() (and in the menus): flying texts, particles, shake",
  banner: "the level banner's clock: it runs while the level plays (update)",
  save: "write progress to storage — economy.js saves only through it (SPEC-012: an event)",
  rebuild: "rebuild the 3D scene for the game buildGame just built",
  onWin: "a level was won and paid: the client's flow (the map shows a world the win opened)",
  // the one hook in HOOKS_REENTER: it starts the next practice game, whose buildGame draws the gameplay rng() — so it runs
  // without the noGameRng guard every other hook has
  onPracticeWin: "a practice game was won: the next tutorial step (re-enters the core)",
  // one hook for all device input instead of separate keys / sticks / pads hooks (approved in B2): the client's deviceInput(l)
  // reads the held keys (Shift = tiptoe), the touch sticks and the gamepads and shapes the vector; the core's inputFor adds the
  // autopilot's stick
  inputFor: "a player's device input: held keys (Shift = tiptoe), touch sticks, gamepads, shaped (SPEC-012: input slots)"
};
// client code the logic called directly before SPEC-011 (RR-01) and client state it wrote: none of it in the core
const CLIENT_NAMES = ["SFX", "burst", "popText", "texts", "particles", "shake", "banner", "showBanner", "camSnap", "rebuild3D", "sticks",
  "keys", "pads", "deviceInput", "stickR", "tiptoeKey", "PHONE", "isTouch", "skinSel", "skinKeep", "makeLook", "botOutfit",
  "tutorialNext", "openedWorld", "worldBanner", "writeProgress", "localStorage", "document", "simMode", "renderer", "camera", "ctx"];
test("core reaches the client only through hooks", { tag: "@fast" }, () => {
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
  expect(port).toMatch(/noGameRng\(""\s*\+\s*k\b/);
  expect(port).toMatch(/function setHooks\(/);
  expect(readRoot("src/core/hooks.js"), "only onPracticeWin runs without the rng guard").toMatch(/HOOKS_REENTER = Object\.freeze\(\["onPracticeWin"\]\)/);
  // and the core uses the port: every hook is called somewhere in the core
  const all = core.map(([, t]) => codeOnly(t)).join("\n");
  expect(Object.keys(HOOKS).filter(h => !new RegExp(`\\bhooks\\.${h}\\(`).test(all)), "hooks the core never calls").toEqual([]);
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

// AC 2 / 2b: docs/architecture.md has the module table (between <!-- modules:start --> and <!-- modules:end -->): every file of
// src/ is listed, every listed file exists, the spec's core tree is there, and the state column names every module-level let
const ARCH = path.join(ROOT, "docs", "architecture.md");
const SPEC_CORE = ["index", "config", "util", "hooks", "world", "level/layouts", "level/generate", "level/build", "level/validate", "path",
  "difficulty", "rules", "bots", "big", "game", "mood", "hearing", "autopilot", "practice", "progress-rules", "economy"].map(n => `src/core/${n}.js`);
test("every core module listed in architecture.md exists", { tag: "@fast" }, () => {
  const doc = fs.readFileSync(ARCH, "utf8").replace(/\r\n/g, "\n");
  const a = doc.indexOf("<!-- modules:start -->"), b = doc.indexOf("<!-- modules:end -->");
  expect(a > 0 && b > a, "the module table markers").toBe(true);
  const rows = Object.fromEntries([...doc.slice(a, b).matchAll(/^\| `(src\/[^`]+)` \|(.*)$/gm)].map(m => [m[1], m[2]]));
  const listed = Object.keys(rows);
  expect(listed.filter(f => !fs.existsSync(path.join(ROOT, f))), "listed but missing").toEqual([]);
  expect(allSrc().filter(f => !listed.includes(f)), "in src/ but not in the table").toEqual([]);
  expect([...SPEC_CORE, ...SHARED, "src/client/look.js", "src/client/art-names.js"].filter(f => !listed.includes(f)), "the spec's modules").toEqual([]);
  const missing = [];
  for (const f of listed) {
    const lets = [...readRoot(f).matchAll(/^(?:export )?let (.+)$/gm)].flatMap(m => [...m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)].map(x => x[1]));
    for (const l of lets) if (!rows[f].includes("`" + l + "`")) missing.push(`${f}: ${l}`);
  }
  expect(missing, "module-level lets the table does not name").toEqual([]);
});

// AC 5: the live-bindings rule — a module's `let` is reassigned only in that module; others call its setter. ESLint's
// no-import-assign enforces it for src/** (and for the inline module, linted by npm run lint): the config has it, no src file
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

// AC 5b: the saves are read in one place, before the first game: storage is read (getItem) only in initSaves and the two
// helpers it calls (language, names) — today in the inline client, from Phase C in src/client/; the core never touches storage
// (the dependency test above); initSaves runs once at the top level, initLang and initNames only from it.
const SAVE_READERS = ["initSaves", "initLang", "initNames"];
test("the saves are read only by initSaves at start", { tag: "@fast" }, () => {
  const html = fs.readFileSync(INDEX, "utf8").replace(/\r\n/g, "\n"), open = "<script type=\"module\">\n";
  const inline = html.slice(html.indexOf(open) + open.length, html.indexOf("</script>", html.indexOf(open)));
  const client = [["index.html (module)", inline], ...allSrc().filter(f => f.startsWith("src/client/")).map(f => [f, readRoot(f).replace(/\r\n/g, "\n")])];
  const bad = [];
  let readers = 0;
  for (const [name, text] of client) {
    const code = text;   // raw: the client has regex literals that confuse codeOnly; no comment names localStorage.getItem(
    for (const m of code.matchAll(/\blocalStorage\.getItem\(/g)) {
      const fn = [...code.slice(0, m.index).matchAll(/^(?:export )?function (\w+)\(/gm)].pop();
      if (!fn || !SAVE_READERS.includes(fn[1])) bad.push(`${name}: getItem in ${fn ? fn[1] : "top level"}`); else readers++;
    }
  }
  expect(bad, "storage read outside initSaves").toEqual([]);
  expect(readers, "initSaves reads progress, outfits, names and the language").toBeGreaterThanOrEqual(4);
  const all = client.map(([, t]) => t).join("\n");
  expect([...all.matchAll(/^initSaves\(\);$/gm)].length, "initSaves() once, at the top level").toBe(1);
  for (const h of ["initLang", "initNames"]) {
    const calls = [...all.matchAll(new RegExp(`(?<!function )\\b${h}\\(\\)`, "g"))].map(m => [...all.slice(0, m.index).matchAll(/^(?:export )?function (\w+)\(/gm)].pop()[1]);
    expect(calls, `${h}() only from initSaves`).toEqual(["initSaves"]);
  }
});

// AC 8c: no script or test reads game code from index.html. The files that still read index.html read the shell, or (until
// Phase C empties it) the inline client module for linting and source scans — each named here with why; a new reader fails.
const INDEX_READERS = {
  "scripts/lint.js": "lints the inline client module (until Phase C)",
  "scripts/eslint-imports.js": "the import map (shell): which bare names resolve",
  "tests/helpers.js": "gameSource(): the inline client module next to src/** for the source scans (until Phase C)",
  "tests/modules.spec.js": "the shell: the import map, the file:// notice, the inline module (lint config, saves check)",
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
