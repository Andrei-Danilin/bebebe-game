// SPEC-025 phase 2: saves a child can't lose.
// - AC 3: one key bebebe-save { version, progress, outfits, names, lang, migrated, … }; the old keys migrate once (fingerprints in
//   the record), are never written again, and an old key written after the migration (an old tab) is merged again; a save from a
//   newer version keeps every field it had; unknown fields, worlds and ids are kept.
// - AC 3b: storage only through a backend of Promises (window.__bbSaveBackend in the tests); `await loadSave()` before the first
//   level; a queue (the last write per key) flushed on hide / pagehide.
// - AC 3c: outfits stored by item id; AC 3d: the schema (types and ranges) of every field.
// - AC 4 / 4b: backups, the broken copy, recovery and its notes; storage that cannot be written.
// - AC 5: navigator.storage.persist() once, never where it prompts (Firefox).
const fs = require("fs");
const path = require("path");
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, reloadGame, storedSave, softly } = require("./helpers");

const SAVES_DIR = path.join(__dirname, "fixtures", "saves");
const fixture = n => JSON.parse(fs.readFileSync(path.join(SAVES_DIR, n + ".json"), "utf8"));
const asStored = keys => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
// storage holds exactly these keys (and the tests' own flag), as a device would; the caller reloads
const putStorage = (page, keys) => page.evaluate(k => {
  localStorage.clear(); localStorage.setItem("bb-test-init", "1");
  for (const [n, v] of Object.entries(k)) localStorage.setItem(n, v);
}, asStored(keys));
const rawKey = (page, k) => page.evaluate(n => localStorage.getItem(n), k);
const bebebeKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("bebebe-")).sort());
// a level won the quick way (the economy's own win path): world w, level n
const winLevel = (page, w, n) => page.evaluate(([w2, n2]) => { const b = window.__bb; b.world = w2; b.level = n2; b.startGame(1); b.giveReward(true); b.mode = "home"; }, [w, n]);

// ---------- AC 3: migration, fingerprints, stale tabs, newer versions ----------
test("every save fixture starts the game; the old keys are never written; bebebe-save carries their fingerprints", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, { sim: true });
  const soft = softly();
  for (const f of fs.readdirSync(SAVES_DIR).filter(x => x.endsWith(".json"))) {
    const keys = asStored(fixture(f.slice(0, -5)).keys);
    await putStorage(page, keys);
    await reloadGame(page);
    const after = await page.evaluate(k => Object.fromEntries(Object.keys(k).map(n => [n, localStorage.getItem(n)])), keys);
    for (const [k, v] of Object.entries(keys).filter(([n]) => !n.startsWith("bebebe-save"))) soft(after[k], `${f}: ${k} unchanged`).toBe(v);
    const s = await storedSave(page);
    soft(s && typeof s.version, `${f}: bebebe-save written`).toBe("number");
    if (!("bebebe-save" in keys)) {
      const want = await page.evaluate(k => Object.fromEntries(window.__bb.save.OLD_KEYS.map(n => [n, window.__bb.save.fingerprint(k[n] ?? null)])), keys);
      soft(s.migrated, `${f}: the fingerprint of every old key`).toEqual(want);
    }
  }
  soft.done();
  expect(errors).toEqual([]);
});

test("an old tab writes bebebe-progress after the migration: merged once (best stars, higher unlocked, owned joined), coins stay", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const f = fixture("current");
  await putStorage(page, f.keys);
  await reloadGame(page);
  const p0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  // the old tab: one more star on Park 3, the Field further on, a hat bought there — and its own (stale) coins and stock
  const old = JSON.parse(JSON.stringify(f.keys["bebebe-progress"]));
  old.worlds.park.stars["3"] = 2; old.worlds.park.won["3"] = true; old.worlds.field.unlocked = 6; old.worlds.park.stars["1"] = 1;
  old.owned.hats = [...old.owned.hats, "crown"]; old.coins = 9999; old.inv.kisses = 50; old.seen.ending = true;
  await page.evaluate(v => { localStorage.setItem("bebebe-progress", v); }, JSON.stringify(old));
  await reloadGame(page);
  const p1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  expect(p1.worlds.park.stars, "the best stars of each level").toEqual({ ...p0.worlds.park.stars, 3: 2 });
  expect(p1.worlds.field.unlocked, "the higher unlocked").toBe(6);
  expect(p1.owned.hats, "owned items joined").toContain("crown");
  expect(p1.seen.ending, "seen scenes joined").toBe(true);
  expect([p1.coins, p1.inv.kisses], "coins and stock from bebebe-save (Claude's choice)").toEqual([p0.coins, p0.inv.kisses]);
  expect(await rawKey(page, "bebebe-progress"), "the old key itself untouched").toBe(JSON.stringify(old));
  const s = await storedSave(page);
  expect(s.migrated["bebebe-progress"], "the new fingerprint is stored").toBe(await page.evaluate(v => window.__bb.save.fingerprint(v), JSON.stringify(old)));
  expect(await rawKey(page, "bebebe-save-before-migration"), "a snapshot before the merge").not.toBeNull();
  // merged once: the next start changes nothing
  await reloadGame(page);
  expect(await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)))).toEqual(p1);
  expect(errors).toEqual([]);
});

test("a save from a newer version: played, saved, reloaded — nothing lost but the new result, the changed field byte-for-byte", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const f = fixture("future-version"), orig = f.keys["bebebe-save"];
  await putStorage(page, f.keys);
  await reloadGame(page);
  const loaded = await page.evaluate(() => ({ p: JSON.parse(JSON.stringify(window.__bb.progress)), lang: window.__bb.lang, names: window.__bb.names, o: window.__bb.outfits.saved, W: window.__bb.wardrobe() }));
  expect(loaded.lang).toBe("es");
  expect(loaded.p.equip, "the changed shape: the default in memory").toEqual(["none", "none"]);
  expect(loaded.W.hat[loaded.o.p1.hat].id).toBe("crown");
  expect(loaded.p.worlds.park.unlocked, "unlocked 25 of a newer version: 20 here").toBe(20);
  await winLevel(page, "park", 3);
  await reloadGame(page);
  const s = await storedSave(page);
  expect(s.version, "written back with its own version").toBe(2);
  expect(JSON.stringify(s.progress.equip), "the changed-shape field byte-for-byte").toBe(JSON.stringify(orig.progress.equip));
  expect(s.progress.worlds.park.won["3"], "the new result").toBe(true);
  const keep = softly();
  keep(s.pets, "an extra top-level field").toEqual(["cat"]);
  keep(s.progress.gems, "an extra progress field").toBe(7);
  keep(s.progress.worlds.moon, "an extra world").toEqual(orig.progress.worlds.moon);
  keep(s.progress.worlds.park.best, "an extra field of a known world").toEqual({ 1: 41 });
  keep([s.progress.worlds.park.unlocked, s.progress.worlds.park.stars["25"], s.progress.worlds.park.won["25"]], "a level past this build's last (review fix)").toEqual([25, 2, true]);
  keep(s.progress.owned.hats, "an unknown hat id").toEqual(["crown", "jetpack"]);
  keep(s.progress.owned.shoes, "an unknown owned list").toEqual(["boots"]);
  keep(s.progress.inv.rockets, "an unknown stock key").toBe(3);
  keep(s.progress.upgrades.jump, "an unknown upgrade").toBe(2);
  keep(s.progress.seen.boss_moon, "an unknown scene").toBe(true);
  keep(s.outfits.p2.hat, "an unknown outfit id still worn").toBe("jetpack");
  keep(s.progress.coins, "coins (plus the win)").toBeGreaterThan(orig.progress.coins);
  keep.done();
  expect(errors).toEqual([]);
});

// ---------- AC 3b: the backend seam, the queue ----------
// an async in-memory backend with a delay: the store is a plain object kept in sessionStorage (it survives a reload); every
// answer comes after a delay, as a native bridge would answer
function memoryBackend() {
  const store = () => JSON.parse(sessionStorage.getItem("mem-store") || "{}"), put = o => sessionStorage.setItem("mem-store", JSON.stringify(o));
  const later = v => new Promise(r => setTimeout(() => r(v), 30));
  window.__bbSaveBackend = {
    get: k => later(k in store() ? store()[k] : null),
    set: (k, v) => { const o = store(); o[k] = v; put(o); return later(true); },
    remove: k => { const o = store(); delete o[k]; put(o); return later(true); },
    keys: () => later(Object.keys(store()).filter(k => k.startsWith("bebebe-")))
  };
}
test("an async in-memory backend: play a level, buy an item, reload — all kept; nothing in localStorage", async ({ page }) => {
  await page.addInitScript(memoryBackend);
  const errors = await openGame(page, { sim: true });
  await winLevel(page, "park", 1);
  const k0 = await page.evaluate(() => { const b = window.__bb, k = b.progress.inv.kisses; b.progress.coins += 200; b.buyKisses(); return k; });
  expect(await page.evaluate(() => window.__bb.progress.inv.kisses), "bought").toBeGreaterThan(k0);
  const before = await page.evaluate(() => ({ won: window.__bb.progress.worlds.park.won["1"], coins: window.__bb.progress.coins, kisses: window.__bb.progress.inv.kisses }));
  await page.waitForTimeout(200);                                  // the backend's answers
  await reloadGame(page);
  const after = await page.evaluate(() => ({ won: window.__bb.progress.worlds.park.won["1"], coins: window.__bb.progress.coins, kisses: window.__bb.progress.inv.kisses }));
  expect(after).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("bebebe-save"))), "nothing in localStorage").toEqual([]);
  expect(errors).toEqual([]);
});

test("a write queued just before pagehide is in storage after the event", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const r = await page.evaluate(() => {
    const b = window.__bb, coins = () => JSON.parse(localStorage.getItem("bebebe-save")).progress.coins;
    b.save.flush();
    b.progress.coins = 4321; b.save.queue();
    const queued = [b.save.info.pending, coins()];                  // queued, not written yet
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    return { queued, after: coins(), pending: b.save.info.pending };
  });
  expect(r.queued[0], "one write waits").toBe(1);
  expect(r.queued[1]).not.toBe(4321);
  expect([r.after, r.pending], "written by the pagehide flush").toEqual([4321, 0]);
  expect(errors).toEqual([]);
});

// ---------- AC 3c: outfits by id ----------
test("outfits are stored by id: reordering a list in a test build does not change a loaded outfit", async ({ page }) => {
  // the test build: the hat list with the crown moved to the front (the module is served changed)
  await page.route(/\/src\/core\/wardrobe\.js(\?.*)?$/, async route => {
    const res = await route.fetch(), src = await res.text();
    const line = src.match(/^.*id: "crown".*\r?\n/m)[0];
    const moved = src.replace(line, "").replace(/export const HATS = \[\r?\n/, m => m + line);
    await route.fulfill({ response: res, body: moved });
  });
  const errors = await openGame(page, { sim: true });
  expect(await page.evaluate(() => window.__bb.wardrobe().hat[0].id), "the list is reordered").toBe("crown");
  await putStorage(page, { "bebebe-save": { version: 1, progress: { owned: { hats: ["crown", "glasses"], jackets: ["cape"], pants: [], big: ["robot"] } },
    outfits: { p1: { hair: "ginger", hat: "crown", jacket: "cape", pants: "red" }, p2: { hair: "bun", hat: "glasses", jacket: "tshirt", pants: "nope" }, big: "robot" } } });
  await reloadGame(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe(), o = b.outfits.saved, H = ["brown", "blonde", "black", "ginger", "bun", "bald", "pink", "bluepunk"];
    const ids = pk => ({ hair: H[o[pk].hair], hat: W.hat[o[pk].hat].id, jacket: W.jacket[o[pk].jacket].id, pants: W.pants[o[pk].pants].id });
    return { p1: ids("p1"), p2: ids("p2"), big: W.big[o.big].id };
  });
  expect(r.p1).toEqual({ hair: "ginger", hat: "crown", jacket: "cape", pants: "red" });
  expect(r.p2, "an unknown id → that slot's default (shorts)").toEqual({ hair: "bun", hat: "glasses", jacket: "tshirt", pants: "shorts" });
  expect(r.big).toBe("robot");
  expect(errors).toEqual([]);
});

// ---------- AC 3d: the schema of every field ----------
test("the schema: every broken field is defaulted (types and ranges), unknown ids kept in the save", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const r = await page.evaluate(() => {
    const b = window.__bb, C = b.CFG, L = s => JSON.parse(JSON.stringify(b.loadProgress(s))), fresh = L(null);
    return {
      max: [C.SAVE_MAX_COINS, C.SAVE_MAX_CHARGES], fresh,
      coins: [L({ coins: -5 }).coins, L({ coins: "lots" }).coins, L({ coins: 2e9 }).coins, L({ coins: 12.7 }).coins, L({ coins: 40 }).coins],
      inv: L({ inv: { mittens: 99999, mega: "x", kisses: 2.7, rescues: -1 } }).inv, invJunk: L({ inv: "junk" }).inv,
      equip: [L({ equip: ["mittens", "rocket"] }).equip, L({ equip: "mega" }).equip, L({ equip: ["mega"] }).equip, L({ equip: ["none", "mega"] }).equip],
      owned: L({ owned: { hats: ["crown", "zzz", 5, "cap"], jackets: "junk" } }).owned,
      seen: L({ seen: "oops" }).seen, worlds: L({ worlds: "junk" }).worlds, upgrades: L({ upgrades: [1, 2] }).upgrades, last: L({ lastWorld: 7 }).lastWorld,
      root: [L([1, 2]), L("text"), L(7)]
    };
  });
  const soft = softly();
  soft(r.max).toEqual([1000000, 9999]);
  soft(r.coins, "coins: whole 0…SAVE_MAX_COINS").toEqual([0, 0, 1000000, 12, 40]);
  soft(r.inv, "inv: whole 0…SAVE_MAX_CHARGES").toEqual({ mittens: 9999, mega: 0, kisses: 2, rescues: 0 });
  soft(r.invJunk).toEqual(r.fresh.inv);
  soft(r.equip, "equip: two of none / glove ids").toEqual([["mittens", "none"], ["none", "none"], ["mega", "none"], ["none", "mega"]]);
  soft(r.owned, "owned: known paid ids").toEqual({ hats: ["crown"], jackets: [], pants: [], big: [] });
  soft(r.seen).toEqual(r.fresh.seen);
  soft(r.worlds).toEqual(r.fresh.worlds);
  soft(r.upgrades).toEqual(r.fresh.upgrades);
  soft(r.last).toBe("park");
  for (const x of r.root) soft(x, "the root must be a plain object").toEqual(r.fresh);
  soft.done();
  // through a real start: the broken fields defaulted in the game, the unknown hat id kept in the save it writes
  await putStorage(page, { "bebebe-save": { version: 1, progress: { coins: "lots", inv: { mittens: -2, mega: 3 }, equip: ["mega", 7], owned: { hats: ["crown", "zzz"] } } } });
  await reloadGame(page);
  const p = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  expect([p.coins, p.inv.mittens, p.inv.mega, p.equip, p.owned.hats]).toEqual([0, 0, 3, ["mega", "none"], ["crown"]]);
  await page.evaluate(() => { window.__bb.progress.coins = 5; window.__bb.save.queue(); });
  expect((await storedSave(page)).progress.owned.hats, "an unknown id is kept (a newer version's item)").toEqual(["crown", "zzz"]);
  expect(errors).toEqual([]);
});

// ---------- AC 4: copies, the broken save, recovery ----------
const goodSave = coins => ({ version: 1, progress: { coins, worlds: { park: { unlocked: 3, stars: { 1: 2 }, won: { 1: true } } } }, lang: "en" });
const copy = (save, at = Date.now()) => JSON.stringify({ at, save });
test("a broken save loads the newest valid copy (truncated JSON, wrong types, empty) or starts fresh — never a crash", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const cases = [
    ["truncated JSON, a backup", { "bebebe-save": "{\"version\":1,\"progress\":{\"coins\":5", "bebebe-save-backup": copy(goodSave(77)) }, 77, "saveRecovered", "backup"],
    ["wrong types, nothing else", { "bebebe-save": JSON.stringify({ version: "one", progress: [1, 2] }) }, 0, "freshStart", "fresh"],
    ["empty, a session copy", { "bebebe-save": "", "bebebe-save-session": copy(goodSave(31)) }, 31, "saveRecovered", "session"],
    ["not an object, a snapshot", { "bebebe-save": "[1,2,3]", "bebebe-save-before-reset": copy(goodSave(12), 1000), "bebebe-save-before-import": copy(goodSave(13), 2000) }, 13, "saveRecovered", "import"]
  ];
  const soft = softly();
  for (const [name, keys, coins, note, from] of cases) {
    await putStorage(page, keys);
    await reloadGame(page);
    const r = await page.evaluate(() => ({ coins: window.__bb.progress.coins, info: window.__bb.save.info, broken: localStorage.getItem("bebebe-save-broken") }));
    soft(r.coins, `${name}: coins`).toBe(coins);
    soft(r.info.notes, `${name}: the note`).toEqual([note]);
    soft(r.info.recovered, `${name}: from`).toBe(from);
    soft(r.broken, `${name}: the broken save kept unchanged`).toBe(keys["bebebe-save"]);
    soft((await storedSave(page)).version, `${name}: a valid save written`).toBe(1);
  }
  soft.done();
  // a broken copy already kept is not overwritten by a later failure
  await putStorage(page, { "bebebe-save": "{oops", "bebebe-save-broken": "{the first" });
  await reloadGame(page);
  expect(await rawKey(page, "bebebe-save-broken")).toBe("{the first");
  expect(errors).toEqual([]);
});

test("a truncated save wearing paid clothes: its raw text stays in bebebe-save-broken after the start and the first coin; no gifts", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const W = await page.evaluate(() => window.__bb.wardrobe());
  const crown = W.hat.findIndex(q => q.id === "crown");
  // the broken save, and the old keys of the same device: a save without owned wearing the crown (a real migration would give it)
  const broken = JSON.stringify({ version: 1, progress: { coins: 40 }, outfits: { p1: { hat: "crown" }, p2: {}, big: "robot" } }).slice(0, -9);
  await putStorage(page, { "bebebe-save": broken, "bebebe-progress": { coins: 40, worlds: {} }, "bebebe-outfits": { p1: { hair: 0, hat: crown, jacket: 0, pants: 0 }, p2: { hair: 1, hat: 4, jacket: 1, pants: 3 }, big: 2, v: 2 } });
  await reloadGame(page);
  const r = await page.evaluate(() => ({ owned: window.__bb.progress.owned, hat: window.__bb.outfits.saved.p1.hat, info: window.__bb.save.info }));
  expect(r.owned, "no adoptWorn after a failed load").toEqual({ hats: [], jackets: [], pants: [], big: [] });
  expect(r.hat, "the crown is not owned: the slot's default").not.toBe(crown);
  expect(r.info.recovered).toBe("old");
  expect(await rawKey(page, "bebebe-save-broken"), "after the start").toBe(broken);
  await page.evaluate(() => { window.__bb.progress.coins += 1; window.__bb.save.queue(); window.__bb.save.flush(); });
  expect(await rawKey(page, "bebebe-save-broken"), "after the first coin").toBe(broken);
  expect(errors).toEqual([]);
});

test("every write keeps the previous save as bebebe-save-backup; the session copy rotates at most once a day", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  // two writes, each confirmed by storage before the next (a stored text becomes the backup only once storage said it is stored)
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 10; b.save.queue(); b.save.flush(); });
  const r = await page.evaluate(() => {
    const b = window.__bb, get = k => JSON.parse(localStorage.getItem(k));
    b.progress.coins = 20; b.save.queue(); b.save.flush();
    return { save: get("bebebe-save").progress.coins, backup: get("bebebe-save-backup").save.progress.coins, days: b.CFG.SAVE_SESSION_DAYS };
  });
  expect(r).toEqual({ save: 20, backup: 10, days: 1 });
  // a session copy from an earlier day is replaced by the save as loaded; one from today is kept
  const yesterday = Date.now() - 2 * 86400000;
  await putStorage(page, { "bebebe-save": goodSave(55), "bebebe-save-session": copy(goodSave(5), yesterday) });
  await reloadGame(page);
  const s1 = JSON.parse(await rawKey(page, "bebebe-save-session"));
  expect([s1.save.progress.coins, s1.at > yesterday]).toEqual([55, true]);
  await page.evaluate(() => { window.__bb.progress.coins = 99; window.__bb.save.queue(); });
  await reloadGame(page);
  expect(JSON.parse(await rawKey(page, "bebebe-save-session")).save.progress.coins, "rotated at most once a day").toBe(55);
  expect(errors).toEqual([]);
});

test("a broken save shows the note once, in the menus", async ({ page }) => {
  const errors = await openGame(page);
  await putStorage(page, { "bebebe-save": "{broken", "bebebe-save-backup": copy(goodSave(8)) });
  await reloadGame(page);
  await page.waitForFunction(() => !!document.getElementById("save-note"), null, { timeout: 30_000 });
  expect(await page.evaluate(() => [document.getElementById("save-note").textContent, window.__bb.save.info.shown, window.__bb.mode])).toEqual(["We fixed your save from a backup", ["saveRecovered"], "home"]);
  expect(errors).toEqual([]);
});

// ---------- AC 4b: storage that cannot be written ----------
test("localStorage access throws: the game opens, a level can be won, noSave shows once; no error card", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("denied", "SecurityError"); } }); });
  const errors = await openGame(page);
  await winLevel(page, "park", 1);
  expect(await page.evaluate(() => [window.__bb.progress.worlds.park.won["1"], window.__bb.save.info.noSave])).toEqual([true, true]);
  await page.waitForFunction(() => !!document.getElementById("save-note"), null, { timeout: 30_000 });
  expect(await page.evaluate(() => [document.getElementById("save-note").dataset.note, !!document.getElementById("oops"), window.__bb.errorLog.length])).toEqual(["noSave", false, 0]);
  expect(errors).toEqual([]);
});

test("setItem throws QuotaExceededError mid-game: no error, the game goes on from memory, noSave shows", async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__bb.artInfo.done && !document.getElementById("loading"));
  expect(await page.evaluate(() => window.__bb.save.info.noSave)).toBe(false);
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); }; });
  await winLevel(page, "park", 1);
  await page.waitForFunction(() => !!document.getElementById("save-note"), null, { timeout: 30_000 });
  expect(await page.evaluate(() => [window.__bb.progress.worlds.park.won["1"], window.__bb.save.info.noSave, document.getElementById("save-note").textContent, !!document.getElementById("oops")]))
    .toEqual([true, true, "This device isn't keeping progress", false]);
  expect(errors).toEqual([]);
});

// ---------- AC 5: persistent storage ----------
// navigator.storage stubbed: persisted() answers `already`; persist() calls are counted (in sessionStorage: they survive a reload)
function stubPersist(already) {
  const n = () => Number(sessionStorage.getItem("persist-calls") || 0);
  Object.defineProperty(navigator.storage, "persisted", { configurable: true, value: () => Promise.resolve(already) });
  Object.defineProperty(navigator.storage, "persist", { configurable: true, value: () => { sessionStorage.setItem("persist-calls", String(n() + 1)); return Promise.resolve(true); } });
}
const persistCalls = page => page.evaluate(() => Number(sessionStorage.getItem("persist-calls") || 0));
test("persist() is asked once, the answer kept in the save; never where persisted() is already true", async ({ page }) => {
  await page.addInitScript(stubPersist, false);
  const errors = await openGame(page, { sim: true });
  await page.waitForFunction(() => window.__bb.save.info.persist !== null);
  expect([await persistCalls(page), (await storedSave(page)).persist]).toEqual([1, { asked: true, granted: true }]);
  await reloadGame(page);
  expect(await persistCalls(page), "asked once").toBe(1);
  expect(errors).toEqual([]);
});
test("persist() already true: kept without asking", async ({ page }) => {
  await page.addInitScript(stubPersist, true);
  await openGame(page, { sim: true });
  await page.waitForFunction(() => window.__bb.save.info.persist !== null);
  expect([await persistCalls(page), (await storedSave(page)).persist]).toEqual([0, { asked: true, granted: true }]);
});
test.describe("Firefox", () => {
  test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0" });
  test("persist() is skipped in Firefox (it shows a permission doorhanger)", async ({ page }) => {
    await page.addInitScript(stubPersist, false);
    const errors = await openGame(page, { sim: true });
    await page.waitForTimeout(300);
    expect([await persistCalls(page), await page.evaluate(() => window.__bb.save.info.persist)]).toEqual([0, null]);
    expect(await page.evaluate(() => ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"].map(ua => window.__bb.save.promptsForPersist(ua)))).toEqual([false, true]);
    expect(errors).toEqual([]);
  });
});

// ---------- review fixes ----------
// storage nearly full: a new key (the probe) is refused, replacing an existing key would work — the session plays from memory
// and never writes the save, so the real save and its backup survive
test("a failed probe never overwrites the real save: play from memory, the old progress intact after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("almost-full") !== "1") return;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (this.getItem(k) === null) throw new DOMException("full", "QuotaExceededError"); return set.call(this, k, v); };
  });
  const errors = await openGame(page, { sim: true });
  await winLevel(page, "park", 1);
  await winLevel(page, "park", 2);
  const before = { save: await rawKey(page, "bebebe-save"), backup: await rawKey(page, "bebebe-save-backup") };
  await page.evaluate(() => sessionStorage.setItem("almost-full", "1"));
  await reloadGame(page);
  const r = await page.evaluate(() => ({ won: window.__bb.progress.worlds.park.won, info: window.__bb.save.info }));
  expect(r.won, "the stored progress was read").toEqual({ 1: true, 2: true });
  expect([r.info.noSave, r.info.saveOff, r.info.notes]).toEqual([true, true, ["noSave"]]);
  await winLevel(page, "park", 3);                                  // played from memory
  await page.evaluate(() => { window.__bb.save.queue(); window.__bb.save.flush(); });
  expect({ save: await rawKey(page, "bebebe-save"), backup: await rawKey(page, "bebebe-save-backup") }, "nothing of the save written").toEqual(before);
  await reloadGame(page);
  expect(await page.evaluate(() => window.__bb.progress.worlds.park.won), "the old progress intact").toEqual({ 1: true, 2: true });
  expect(errors).toEqual([]);
});

// an async backend whose answers come back in a different order: the writes are still applied in call order
test("writes reach an async backend in call order", async ({ page }) => {
  await page.addInitScript(() => {
    const store = {}, log = [];
    let n = 0;
    window.__setLog = log;
    window.__bbSaveBackend = {
      get: k => Promise.resolve(k in store ? store[k] : null),
      set: (k, v) => new Promise(r => setTimeout(() => { store[k] = v; if (k === "bebebe-save") log.push(JSON.parse(v).progress.coins); r(true); }, (n++ % 2) ? 5 : 40)),
      remove: k => { delete store[k]; return Promise.resolve(true); },
      keys: () => Promise.resolve(Object.keys(store))
    };
  });
  const errors = await openGame(page, { sim: true });
  const log = await page.evaluate(async () => {
    const b = window.__bb;
    await new Promise(r => setTimeout(r, 300));                      // the start's own writes answered
    window.__setLog.length = 0;
    for (const c of [11, 22, 33, 44]) { b.progress.coins = c; b.save.queue(); b.save.flush(); }
    await new Promise(r => setTimeout(r, 400));
    return window.__setLog;
  });
  expect(log).toEqual([11, 22, 33, 44]);
  expect(errors).toEqual([]);
});
