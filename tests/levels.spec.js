// SPEC-002 + SPEC-006: level types and worlds. A level is (world, n), n 1–20; inside every world the types go
// from the kids' drawing (level 1) to the maze (17–20); every generated level is fair (window.__bb.levelReport)
// and the same world + level always builds the same map.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { LANGS, openGame, frames, softly, reloadGame } = require("./helpers");

const LEVEL1 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "level1.json"), "utf8"));
// SPEC-006: worlds and the types inside every world; SPEC-016: the story order — main worlds, then the bonus ones
const MAIN_WORLDS = ["park", "field", "city", "school"];
const BONUS_WORLDS = ["beach", "winter"];
const WORLDS = [...MAIN_WORLDS, ...BONUS_WORLDS];
const OLD_WORLDS = ["park", "school", "beach", "winter"];      // SPEC-006 worlds: their maps never change (levels-worlds.json)
const NEW_WORLDS = ["field", "city"];                          // SPEC-016: levels-field-city.json
// SPEC-016: difficulty index per world (speeds, hearts, coins, fast star)
const DIFFICULTY = { park: 0, field: 1, city: 2, school: 3, beach: 3, winter: 4 };
const WORLD_TYPES = ["classic", "meadow", "meadow", "meadow", "village", "village", "village", "river", "river", "river",
  "rooms", "rooms", "rooms", "arena", "arena", "arena", "maze", "maze", "maze", "maze"];
// tier = position inside the block of one type (0, 1, 2, 3)
const tierOf = n => { let t = 0; for (let k = n - 1; k > 0 && WORLD_TYPES[k - 1] === WORLD_TYPES[n - 1]; k--) t++; return t; };
const levelsOfType = t => WORLDS.flatMap(w => WORLD_TYPES.flatMap((x, i) => x === t ? [`${w}:${i + 1}`] : []));
// limits from the spec ("Fairness rules" and the type table)
const FREE_MIN = { classic: 0.5, meadow: 0.5, maze: 0.4, village: 0.5, river: 0.5, rooms: 0.4, arena: 0.5 };
const BUSH_MIN = { classic: 3, meadow: 7, maze: 2, village: 3, river: 4, rooms: 2, arena: 3 };

// SPEC-018: the generator tests share one page (fixture `levelPage`): they build levels through levelReport,
// generateLevel and startGame and restore what they change in CFG. Before each of them the page is put back on Park 1
// in English with the level cache cleared; page errors fail the test that caused them (then are cleared).
// SPEC-023: that shared page is in sim mode (logic only: no 3D, nothing drawn), so it may stay open while fresh pages
// run. The menu, banner and reload tests and the two tests that look at the 3D map pieces ask for `page`: a fresh
// rendered page each. The fresh-page tests come first in this file (SPEC-018 order, kept; on CI a shard may start in the
// middle of the file, so no test relies on another having run before it).
let shared = null;
const test = base.test.extend({
  levelPage: async ({ browser }, use) => {
    if (!shared) {
      const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
      shared = { page, errors: await openGame(page, { sim: true }) };
    }
    const { page, errors } = shared;
    // Park 1 is running (mode "play") when the test starts, as after openGame + startGame(1)
    await page.evaluate(() => { const b = window.__bb; b.setLang("en"); b.clearLevelCache(); b.mode = "home"; b.world = "park"; b.level = 1; b.startGame(1); });
    await use(page);
    const seen = errors.splice(0);
    expect(seen).toEqual([]);
  },
  page: async ({ page }, use) => {
    const errors = await openGame(page);
    await use(page);
    expect(errors).toEqual([]);
  }
});
test.afterAll(async () => { if (shared) { await shared.page.close(); shared = null; } });

// ---------- SPEC-006 AC 1: level keys and types ----------
test("every world goes from the drawing to the maze", async ({ page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb, out = [];
    for (const w of W) for (let n = 1; n <= 20; n++) out.push({ w, n, type: b.levelType(w, n), gen: b.generateLevel(w, n, 0).type });
    const start = { world: b.world, level: b.level };
    b.world = "beach"; b.level = 9; b.startGame(1);
    const li = b.levelInfo, run = { world: b.world, level: b.level, info: { world: li.world, lv: li.lv, type: li.type } };
    b.world = "nowhere";                                  // not a world: ignored
    const clampLv = [25, 0, -3, 7.6].map(v => { b.level = v; return b.level; });
    b.level = 9;
    return { out, cfg: b.CFG.WORLD_TYPES, worlds: b.WORLDS, start, run, after: b.world, clampLv, placeSel: "placeSel" in b, cyclePlace: "cyclePlace" in b };
  }, WORLDS);
  expect(r.cfg).toEqual(WORLD_TYPES);
  expect(r.worlds).toEqual(WORLDS);
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const x of r.out) {
    const want = WORLD_TYPES[x.n - 1];
    soft(x, `${x.w} ${x.n}`).toEqual({ w: x.w, n: x.n, type: want, gen: want });
  }
  soft.done();
  expect(r.start).toEqual({ world: "park", level: 1 });
  expect(r.run).toEqual({ world: "beach", level: 9, info: { world: "beach", lv: 9, type: "river" } });
  expect(r.after).toBe("beach");
  expect(r.clampLv).toEqual([20, 1, 1, 7]);                // __bb.level stays inside 1–20
  // the place of a level is its world: the place picker is gone
  expect(r.placeSel).toBe(false);
  expect(r.cyclePlace).toBe(false);
  // an old saved place is ignored
  await page.evaluate(() => localStorage.setItem("bebebe-place", "winter"));
  await reloadGame(page);                          // SPEC-011 AC 8d: seeded again after the reload
  expect(await page.evaluate(() => { const b = window.__bb; b.startGame(1); return { world: b.world, built: b.levelInfo.world }; })).toEqual({ world: "park", built: "park" });
});

test("start banner shows the level type", async ({ page }) => {
  // the type names and the intro line, exactly as in the spec
  const I = await page.evaluate(() => {
    const I = window.__bb.I18N, out = {};
    for (const l of ["en", "es", "ru"]) out[l] = { types: I[l].types, intro: I[l].levelIntro(I[l].worlds.beach, 8, I[l].types.river) };
    return out;
  });
  expect(I.en.types).toEqual({ classic: "Our drawing", meadow: "Meadow", maze: "Maze", village: "Village", river: "River with bridges", rooms: "House with rooms", arena: "Ring arena" });
  expect(I.es.types).toEqual({ classic: "Nuestro dibujo", meadow: "Pradera", maze: "Laberinto", village: "Pueblito", river: "Río con puentes", rooms: "Casa con cuartos", arena: "Arena" });
  expect(I.ru.types).toEqual({ classic: "Наш рисунок", meadow: "Поляна", maze: "Лабиринт", village: "Деревня", river: "Река с мостиками", rooms: "Дом с комнатами", arena: "Арена с кольцом" });
  expect([I.en.intro, I.es.intro, I.ru.intro]).toEqual(["Beach · Level 8: River with bridges", "Playa · Nivel 8: Río con puentes", "Пляж · Уровень 8: Река с мостиками"]);

  // the banner appears at the start, does not stop the game and is gone after ~2 s
  const r = await page.evaluate(() => {
    const b = window.__bb; b.world = "park"; b.level = 17; b.startGame(1);
    const start = b.banner && { text: b.banner.text, alpha: b.bannerAlpha() };
    const bot = b.littles[2], from = { x: bot.x, y: bot.y };
    for (let i = 0; i < 60; i++) b.update(1 / 60);
    const mid = b.banner && { text: b.banner.text, alpha: b.bannerAlpha() };
    const moved = Math.hypot(bot.x - from.x, bot.y - from.y);
    for (let i = 0; i < 72; i++) b.update(1 / 60);
    return { start, mid, moved, end: b.banner, mode: b.mode, buttons: b.buttonNames };
  });
  expect(r.start.text).toBe("Park · Level 17: Maze");
  expect(r.start.alpha).toBeLessThan(0.5);          // fades in
  expect(r.mid.alpha).toBeGreaterThan(0.9);         // fully visible in the middle
  expect(r.moved).toBeGreaterThan(20);              // the game runs under the banner
  expect(r.mode).toBe("play");
  expect(r.end).toBeNull();                         // gone after ~2 s

  // a restart within 1 s of the last banner shows no new banner; later it does again
  await page.waitForTimeout(1100);
  const again = await page.evaluate(() => { const b = window.__bb; b.startGame(1); const one = b.banner && b.banner.text; b.startGame(1); return { one, two: b.banner }; });
  expect(again.one).toBe("Park · Level 17: Maze");          // more than 1 s since the last banner: shown
  expect(again.two).toBeNull();                     // restarted right away: not shown again
  const later = await page.evaluate(() => { const b = window.__bb; b.resetBannerTimer(); b.setLang("ru"); b.level = 8; b.startGame(1); return b.banner && b.banner.text; });   // SPEC-018: resetBannerTimer, not a second 1.1 s wait
  expect(later).toBe("Парк · Уровень 8: Река с мостиками");
});

// ---------- SPEC-006 AC 9: the banner names the world ----------
test("the banner names the world", async ({ page }) => {
  const r = [];
  for (const [lang, w, n] of [["en", "winter", 17], ["es", "school", 8], ["ru", "beach", 1], ["en", "park", 14], ["en", "field", 2], ["ru", "field", 5], ["es", "city", 11]]) {
    // resetBannerTimer: as if BANNER_REPEAT had passed since the last start (SPEC-018: was a real 1.1 s wait each;
    // the repeat rule itself is checked with real waits in "start banner shows the level type")
    r.push(await page.evaluate(([l, wd, lv]) => { const b = window.__bb; b.resetBannerTimer(); b.setLang(l); b.world = wd; b.level = lv; b.startGame(1); return b.banner && b.banner.text; }, [lang, w, n]));
  }
  expect(r).toEqual(["Winter · Level 17: Maze", "Escuela · Nivel 8: Río con puentes", "Пляж · Уровень 1: Наш рисунок", "Park · Level 14: Ring arena",
    "Football field · Level 2: Meadow", "Футбольное поле · Уровень 5: Деревня", "Ciudad · Nivel 11: Casa con cuartos"]);   // SPEC-016: the new worlds
});

// ---------- SPEC-006 AC 8 (SPEC-016 AC 8: six worlds in the story order, the bonus ones locked; SPEC-017: the level map's tabs) ----------
// __bb.mapInfo — the map drawn this frame: tabs { world, locked, selected }, stops; the page title (hudRects map:title) names the world
test("the map shows six worlds and switches between them", async ({ page }) => {
  await page.evaluate(() => {
    const b = window.__bb, p = b.progress.worlds;
    p.park.stars = { 1: 3, 2: 2 }; p.park.unlocked = 3; p.school.stars = { 1: 1 }; p.school.unlocked = 4; p.winter.unlocked = 2;   // Winter has progress: open
    b.world = "park"; b.level = 3; b.mode = "map";
  });
  await frames(page);
  const title = () => page.evaluate(() => window.__bb.hudRects.find(h => h.id === "map:title").text);
  const d = await page.evaluate(() => ({ m: window.__bb.mapInfo, rects: window.__bb.buttonRects, names: window.__bb.buttonNames }));
  expect(d.m.tabs.map(t => t.world)).toEqual(WORLDS);
  expect(d.m.tabs.map(t => t.selected)).toEqual([true, false, false, false, false, false]);
  // SPEC-016: Beach locked (🔒 on its tab), Winter open with progress; SPEC-030: Field and City locked (the Park is not finished),
  // the School open with progress
  expect(d.m.tabs.map(t => t.locked)).toEqual([false, true, true, false, true, false]);
  expect(d.rects.find(q => q.id === "maptab:beach").text).toBe("🔒");
  expect(d.names).not.toContain("cyclePlace");                                      // the old place button is gone
  expect(await title()).toBe("🌳 Park  ⭐ 5/60");                                    // the world's stars in its title
  // the tabs: one row, left to right, not on each other, inside the screen card
  const tr = WORLDS.map(w => d.rects.find(q => q.id === "maptab:" + w)), layout = [];
  if (new Set(tr.map(q => q.y)).size !== 1) layout.push("tabs not in one row");
  for (let i = 1; i < tr.length; i++) if (tr[i].x < tr[i - 1].x + tr[i - 1].w + 6) layout.push(`${tr[i].id} too close to ${tr[i - 1].id}`);
  for (const q of tr) if (q.x < 80 || q.x + q.w > 880) layout.push(`${q.id} outside the card: ${q.x}…${q.x + q.w}`);
  expect(layout).toEqual([]);
  // a click on the School tab selects it, remembers it and builds its newest open level behind the map
  const at = await page.evaluate(() => {
    const q = window.__bb.buttonRects.find(r => r.id === "maptab:school"), c = document.getElementById("game").getBoundingClientRect();
    return { x: c.left + (q.x + q.w / 2) * c.width / 960, y: c.top + (q.y + q.h / 2) * c.height / 640 };
  });
  await page.mouse.click(at.x, at.y);
  await frames(page);
  const after = await page.evaluate(() => ({ world: window.__bb.world, level: window.__bb.level, mode: window.__bb.mode, last: JSON.parse(localStorage.getItem("bebebe-progress")).lastWorld,
    selected: window.__bb.mapInfo.tabs.map(c => c.selected), built: window.__bb.levelInfo.world }));
  expect(after).toEqual({ world: "school", level: 4, mode: "map", last: "school", selected: [false, false, false, true, false, false], built: "school" });
  expect(await title()).toBe("🏫 School  ⭐ 1/60");
  // the keyboard: → next world, ← previous world in the story order (wraps around), the locked Field, City and Beach skipped
  const seq = [];
  for (const k of ["ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) { await page.keyboard.press(k); seq.push(await page.evaluate(() => window.__bb.world)); }
  expect(seq).toEqual(["winter", "school", "park", "winter", "school", "park"]);
  // the names and the star line in every language
  const I = await page.evaluate(() => window.__bb.LANGS.map(l => window.__bb.I18N[l].worldStars(7, 60)));
  expect(I).toEqual(LANGS.map(() => "⭐ 7/60"));
  await page.evaluate(() => { window.__bb.world = "field"; });   // the debug setter (the Field is locked here)
  for (const [lang, want] of [["es", "⚽ Cancha  ⭐ 0/60"], ["pt", "⚽ Campo de futebol  ⭐ 0/60"], ["ru", "⚽ Футбольное поле  ⭐ 0/60"]]) {
    await page.evaluate(l => window.__bb.setLang(l), lang);
    await frames(page);
    expect(await title()).toBe(want);
  }
});

// SPEC-017: the level type is on the level card (a tap on an open stop)
test("the level card shows the level's type and it fits", async ({ page }) => {
  for (const [lang, lv, want] of [["en", 8, "River with bridges"], ["es", 11, "Casa con cuartos"], ["ru", 8, "Река с мостиками"], ["ru", 14, "Арена с кольцом"], ["pt", 11, "Casa com quartos"], ["pt", 8, "Rio com pontes"], ["en", 1, "Our drawing"]]) {
    await page.evaluate(([l, n]) => { const b = window.__bb; b.setLang(l); b.progress.worlds.park.unlocked = 20; b.world = "park"; b.mode = "map"; }, [lang, lv]);
    await frames(page);
    await page.evaluate(n => window.__bb.tapButton("stop:" + n), lv);
    await frames(page);
    const r = await page.evaluate(() => ({ card: window.__bb.levelCard, hud: window.__bb.hudRects, rects: window.__bb.buttonRects }));
    expect(r.card.type, `${lang} level ${lv}`).toBe(want);
    const L = r.hud.find(h => h.id === "card:type");
    expect(L.text).toBe(want);
    for (const q of [...r.rects, ...r.hud.filter(h => h.id !== "card:type")]) {
      const overlap = L.x < q.x + q.w && L.x + L.w > q.x && L.y < q.y + q.h && L.y + L.h > q.y;
      expect(overlap, `${lang}: "${want}" overlaps ${q.id}`).toBe(false);
    }
    await page.keyboard.press("Escape");
  }
});

// ---------- SPEC-016 AC 1: the worlds follow Kostya's story ----------
test("worlds follow the story order", { tag: "@fast" }, async ({ levelPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb;
    const out = { worlds: b.WORLDS, main: b.MAIN_WORLDS, bonus: b.BONUS_WORLDS, seed: b.WORLD_SEED, diff: b.CFG.WORLD_DIFFICULTY,
      names: b.LANGS.map(l => b.I18N[l].worlds), progressWorlds: Object.keys(b.progress.worlds),
      // review fix: every per-world table has exactly the worlds of WORLDS; the lists can't be changed at run time
      keys: { seed: Object.keys(b.WORLD_SEED), diff: Object.keys(b.CFG.WORLD_DIFFICULTY), themes: Object.keys(b.THEMES), names: b.LANGS.map(l => Object.keys(b.I18N[l].worlds)) },
      speedStarts: b.CFG.WORLD_SPEED_START.length, frozen: [b.WORLDS, b.MAIN_WORLDS, b.BONUS_WORLDS, b.WORLD_SEED].map(Object.isFrozen) };
    if (typeof b.bonusUnlocked !== "function") return out;
    // bonusUnlocked(): every level of every main world won (the progress is put back after)
    const keep = JSON.parse(JSON.stringify(b.progress));
    const won = (a, z) => ({ unlocked: 20, stars: {}, won: Object.fromEntries(Array.from({ length: z - a + 1 }, (_, i) => [a + i, true])) });
    const allMain = Object.fromEntries(b.MAIN_WORLDS.map(w => [w, won(1, 20)]));
    try {
      b.setProgress(null); out.fresh = b.bonusUnlocked();
      b.setProgress({ worlds: allMain }); out.allMain = b.bonusUnlocked();
      b.setProgress({ worlds: { ...allMain, city: won(1, 19) } }); out.cityShort = b.bonusUnlocked();
      b.setProgress({ worlds: { ...allMain, field: won(2, 20) } }); out.fieldShort = b.bonusUnlocked();
      // stars count as won (old saves), so all stars everywhere opens them too
      b.setProgress({ worlds: Object.fromEntries(b.MAIN_WORLDS.map(w => [w, { unlocked: 20, stars: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 1])) }])) });
      out.allStars = b.bonusUnlocked();
      // the four SPEC-006 worlds all won: Field and City are new, so the bonus worlds stay locked
      b.setProgress({ worlds: { park: won(1, 20), school: won(1, 20), beach: won(1, 20), winter: won(1, 20) } }); out.oldFour = b.bonusUnlocked();
    } finally { b.setProgress(keep); }
    return out;
  });
  expect(r.main).toEqual(MAIN_WORLDS);
  expect(r.bonus).toEqual(BONUS_WORLDS);
  expect(r.worlds).toEqual(["park", "field", "city", "school", "beach", "winter"]);
  expect(r.progressWorlds).toEqual(WORLDS);
  // seeds keyed by the name: the four old worlds keep 1–4 (their maps), the new ones get 5 and 6
  expect(r.seed).toEqual({ park: 1, school: 2, beach: 3, winter: 4, field: 5, city: 6 });
  const sorted = a => [...a].sort();
  expect({ seed: sorted(r.keys.seed), diff: sorted(r.keys.diff), themes: sorted(r.keys.themes), names: r.keys.names.map(sorted) })
    .toEqual({ seed: sorted(WORLDS), diff: sorted(WORLDS), themes: sorted(WORLDS), names: [sorted(WORLDS), sorted(WORLDS), sorted(WORLDS), sorted(WORLDS)] });
  expect(new Set(Object.values(r.seed)).size, "WORLD_SEED values are unique (each world its own maps)").toBe(WORLDS.length);
  expect(Math.max(...Object.values(r.diff)), "every difficulty index has a WORLD_SPEED_START").toBeLessThan(r.speedStarts);
  expect(r.frozen).toEqual([true, true, true, true]);
  expect(r.diff).toEqual(DIFFICULTY);
  expect(r.names).toEqual([
    { park: "Park", field: "Football field", city: "City", school: "School", beach: "Beach", winter: "Winter" },
    { park: "Parque", field: "Cancha", city: "Ciudad", school: "Escuela", beach: "Playa", winter: "Invierno" },
    { park: "Parque", field: "Campo de futebol", city: "Cidade", school: "Escola", beach: "Praia", winter: "Inverno" },   // SPEC-028
    { park: "Парк", field: "Футбольное поле", city: "Город", school: "Школа", beach: "Пляж", winter: "Зима" }]);
  expect({ fresh: r.fresh, allMain: r.allMain, cityShort: r.cityShort, fieldShort: r.fieldShort, allStars: r.allStars, oldFour: r.oldFour })
    .toEqual({ fresh: false, allMain: true, cityShort: false, fieldShort: false, allStars: true, oldFour: false });
});

// ---------- SPEC-006 AC 2: level 1 is the kids' drawing everywhere ----------
test("level 1 is the kids' drawing in every world", { tag: "@fast" }, async ({ levelPage: page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb, out = {};
    for (const w of W) {
      const g = b.generateLevel(w, 1, 0), rep = b.levelReport(w, 1);
      b.world = w; b.level = 1; b.startGame(1);
      out[w] = { gen: JSON.parse(JSON.stringify({ items: g.items, small: g.small, big: g.big })), attempt: rep.attempt, fallback: rep.fallback, info: { type: b.levelInfo.type, attempt: b.levelInfo.attempt } };
    }
    return out;
  }, WORLDS);
  expect(r.park.gen).toEqual(LEVEL1);                     // Park level 1: exactly the fixture
  for (const w of WORLDS) {
    expect(r[w].gen, `${w} level 1 has the drawing's layout`).toEqual(LEVEL1);
    expect([r[w].attempt, r[w].fallback], w).toEqual([0, false]);
    expect(r[w].info, w).toEqual({ type: "classic", attempt: 0 });
  }
});

// ---------- SPEC-006 AC 3: determinism and variety ----------
test("maps are fixed and differ between worlds", async ({ levelPage: page }) => {
  test.setTimeout(120_000);
  const r = await page.evaluate(W => {
    const b = window.__bb, same = [], strip = rep => JSON.stringify({ ...rep, ms: 0 });
    for (const w of W) for (const n of [1, 2, 7, 12, 17, 20]) {
      const a = JSON.stringify(b.generateLevel(w, n, 0)), a3 = JSON.stringify(b.generateLevel(w, n, 3)), ra = strip(b.levelReport(w, n));
      b.world = W[(W.indexOf(w) + 1) % W.length]; b.level = n === 20 ? 1 : n + 1; b.startGame(1);   // another level running in between
      same.push({ key: `${w}:${n}`, gen: a === JSON.stringify(b.generateLevel(w, n, 0)), gen3: a3 === JSON.stringify(b.generateLevel(w, n, 3)), report: ra === strip(b.levelReport(w, n)) });
    }
    // the six worlds' level n (as the game accepts it) are six different maps
    const differ = [];
    for (let n = 2; n <= 20; n++) {
      const maps = W.map(w => JSON.stringify(b.generateLevel(w, n, b.levelReport(w, n).attempt).items));
      differ.push({ n, distinct: new Set(maps).size });
    }
    return { same, differ };
  }, WORLDS);
  for (const x of r.same) expect(x, x.key).toEqual({ key: x.key, gen: true, gen3: true, report: true });
  for (const x of r.differ) expect(x, `level ${x.n} in the six worlds`).toEqual({ n: x.n, distinct: 6 });
});

// "The same level always builds the same map" also across releases (the kids' rule: stars stay meaningful).
// A change here must be deliberate: regenerate the fixture and say why in the commit.
// SPEC-016: tests/fixtures/levels-worlds.json (made at SPEC-006) still pins the 80 levels of Park, School, Beach and Winter —
// the story order must not change a map a child already played; tests/fixtures/levels-field-city.json pins the 40 levels of
// the Football field and the City (made once at SPEC-016 by this same evaluate).
test("old worlds keep their maps", { tag: "@fast" }, async ({ levelPage: page }) => {
  test.setTimeout(120_000);
  const fixture = name => { const f = path.join(__dirname, "fixtures", name); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
  const old = fixture("levels-worlds.json"), fresh = fixture("levels-field-city.json");
  const r = await page.evaluate(W => {
    const b = window.__bb, out = {};
    const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
    for (const w of W) for (let n = 1; n <= 20; n++) { const q = b.levelReport(w, n); out[`${w}:${n}`] = { type: q.type, attempt: q.attempt, hash: fnv(JSON.stringify(b.generateLevel(w, n, q.attempt))) }; }
    return out;
  }, WORLDS);
  const of = ws => Object.fromEntries(Object.entries(r).filter(([k]) => ws.includes(k.split(":")[0])));
  expect(Object.keys(r).length).toBe(120);
  expect(Object.keys(old).length, "levels-worlds.json: the 80 SPEC-006 levels").toBe(80);
  expect(of(OLD_WORLDS)).toEqual(old);
  expect(fresh, "tests/fixtures/levels-field-city.json exists").not.toBeNull();
  expect(Object.keys(fresh).length, "levels-field-city.json: 40 levels").toBe(40);
  expect(of(NEW_WORLDS)).toEqual(fresh);
});

// ---------- SPEC-006 AC 4: fairness for every level (SPEC-016 AC 3: 6 worlds × 20 = 120) ----------
test("all 120 levels are fair", async ({ levelPage: page }) => {
  test.setTimeout(180_000);
  const r = await page.evaluate(W => {
    const b = window.__bb;
    b.world = "park"; b.level = 1; b.startGame(1);
    const before = b.worldState();
    const out = [], retried = [];
    // SPEC-018: a build that took ≥ 200 ms is timed again (up to 2 more full builds, the fastest counts): a busy machine
    // once made park 12 take 450 ms; a level that is really slow to build stays slow every time. The retried levels
    // and their first time go into the test's annotations (visible in the report).
    for (const w of W) for (let n = 1; n <= 20; n++) {
      const rep = b.levelReport(w, n), first = rep.ms;
      for (let k = 0; k < 2 && rep.ms >= 200; k++) rep.ms = Math.min(rep.ms, b.levelReport(w, n).ms);
      if (first >= 200) retried.push(`${w} ${n}: first ${Math.round(first)} ms, fastest ${Math.round(rep.ms)} ms`);
      out.push({ w, n, ...rep });
    }
    const after = b.worldState();   // every field levelReport saves: obstacles, bushes, floors, zones, spawns, reachable, all 5 grids…
    return { out, retried, untouched: before === after };
  }, WORLDS);
  for (const d of r.retried) test.info().annotations.push({ type: "timing retry", description: d });
  expect(r.untouched).toBe(true);   // the running game's world is left as it was
  expect(r.out.length).toBe(120);
  const bad = [];
  for (const x of r.out) {
    const why = [];
    const want = WORLD_TYPES[x.n - 1];
    if (x.type !== want) why.push(`type ${x.type}`);
    if (x.tier !== tierOf(x.n)) why.push(`tier ${x.tier}`);
    if (x.fallback !== false) why.push("fallback");
    if (x.smallReachAll !== true) why.push("Little Ones can't reach every free cell");
    if (x.bigReachAll !== true) why.push("the Big One can't reach every free cell");
    // level 1 is the kids' drawing: its houses face each other (path 8), the path rule is for generated levels
    if (x.type !== "classic" && !(x.housePath >= 18 && x.housePath <= 70)) why.push(`house path ${x.housePath}`);
    if (!(x.freeRatio >= FREE_MIN[x.type])) why.push(`free ${x.freeRatio}`);
    if (x.doorClear !== true) why.push("door not clear");
    if (x.type === "maze") { if (!(x.deadEnds.before > 0 && x.deadEnds.count <= Math.floor(x.deadEnds.before * 0.25))) why.push(`maze dead ends ${JSON.stringify(x.deadEnds)}`); }
    else if (!(x.deadEnds.longest <= 6)) why.push(`dead end ${x.deadEnds.longest} cells`);
    if (!(x.bushes >= BUSH_MIN[x.type])) why.push(`bushes ${x.bushes}`);
    if (!(x.ms < 200)) why.push(`${Math.round(x.ms)} ms`);
    if (why.length) bad.push(`${x.w} ${x.n} (${x.type}, ${x.attempts} attempts): ${why.join(", ")}`);
  }
  expect(bad).toEqual([]);
});

// ---------- SPEC-006 AC 5: difficulty curve with a ceiling ----------
test("the Big One gets faster inside a world and never outruns a player", async ({ levelPage: page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb, C = b.CFG, d = {};
    for (const w of W) { d[w] = []; for (let n = 1; n <= 20; n++) d[w].push(b.difficulty(w, n)); }
    const cfg = { start: C.WORLD_SPEED_START, per: C.SPEED_PER_LEVEL, max: C.BIG_CHASE_MAX, oldChase: "CHASE_PER_LEVEL" in C, oldHp: "HP_PER_LEVEL" in C };
    // a CFG change can never make any speed outrun a player; a short WORLD_SPEED_START list falls back to its last value
    const keep = { patrol: C.BIG_PATROL_SPEED, start: C.WORLD_SPEED_START };
    try {
      C.BIG_PATROL_SPEED = 400; cfg.fastPatrol = b.difficulty("park", 1);
      C.BIG_PATROL_SPEED = keep.patrol; C.WORLD_SPEED_START = [0, 5]; cfg.shortStart = b.difficulty("winter", 1).boost;
    } finally { C.BIG_PATROL_SPEED = keep.patrol; C.WORLD_SPEED_START = keep.start; }
    // the game uses it: hearts at the start and the Big One's real speeds
    const game = {};
    b.world = "school"; b.level = 5; b.startGame(1);
    game.school5 = { maxHp: b.big.maxHp, hp: b.big.hp, speeds: b.bigSpeeds() };
    // the last heart in the hardest level: the anger boost must not push him past the ceiling
    b.world = "winter"; b.level = 20; b.startGame(1);
    game.winter20 = { maxHp: b.big.maxHp };
    b.big.hp = 1; game.winter20.lastHeart = b.bigSpeeds(); game.winter20.boost = b.bigBoost(); game.winter20.d = b.difficulty("winter", 20, 11);
    b.big.hp = 0.5; game.winter20.halfHeart = b.bigSpeeds();
    b.world = "park"; b.level = 20; b.startGame(1);
    b.big.hp = 1; game.park20 = { lastHeart: b.bigSpeeds() };
    return { d, cfg, game };
  }, WORLDS);
  const START = [0, 5, 10, 15, 18], PER = 1.2, MAX = 0.95 * 150;   // SPEC-016: start by the difficulty index
  expect(r.cfg.start).toEqual(START);
  expect(r.cfg.per).toBe(PER);
  expect(r.cfg.max).toBeCloseTo(MAX, 6);                  // 142.5, from PLAYER_SPEED
  expect([r.cfg.oldChase, r.cfg.oldHp]).toEqual([false, false]);
  expect(r.cfg.fastPatrol.patrol).toBeCloseTo(MAX, 6);
  expect(r.cfg.shortStart).toBe(5);
  // the formulas
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  WORLDS.forEach(w => {
    const wi = DIFFICULTY[w];
    for (let n = 1; n <= 20; n++) {
      const x = r.d[w][n - 1], boost = START[wi] + (n - 1) * PER, at = `${w} ${n}`;
      // SPEC-022: level 20 of a main world is a boss: + 5 px/s on every speed (still capped), + 2 hearts (School: + 3), above the cap of 12
      const boss = n === 20 && ["park", "field", "city", "school"].includes(w), bs = boss ? 5 : 0, extra = !boss ? 0 : w === "school" ? 3 : 2;
      soft(Object.keys(x).sort(), at).toEqual(["boost", "chase", "hearts", "patrol", "search"]);
      soft(x.boost, at).toBeCloseTo(boost, 6);
      soft(x.chase, at).toBeCloseTo(Math.min(MAX, 112 + boost + bs), 6);
      soft(x.search, at).toBeCloseTo(Math.min(MAX, 112 * 0.85 + boost + bs), 6);
      soft(x.patrol, at).toBeCloseTo(70 + boost / 2 + bs, 6);
      soft(x.hearts, at).toBe(Math.min(12, 5 + Math.floor((n - 1) / 4) + wi) + extra);   // SPEC-029: Park 1 = 5 (was 6)
      soft(x.chase, `${at}: faster than a player`).toBeLessThanOrEqual(MAX + 1e-9);
      if (n > 1) soft(x.chase, `${at}: slower than the level before`).toBeGreaterThanOrEqual(r.d[w][n - 2].chase);
      if (n > 1) soft(x.hearts, `${at}: fewer hearts than the level before`).toBeGreaterThanOrEqual(r.d[w][n - 2].hearts);   // SPEC-008 AC 7
    }
  });
  // the spec's numbers (SPEC-016: park, field, city, school, beach, winter)
  expect(WORLDS.map(w => r.d[w][0].chase)).toEqual([112, 117, 122, 127, 127, 130]);
  expect(r.d.park[19].chase).toBeCloseTo(139.8, 6);      // SPEC-022: the park boss, 134.8 + 5
  expect(r.d.winter[19].chase).toBeCloseTo(MAX, 6);       // 152.8 before the cap
  expect(WORLDS.map(w => [r.d[w][0].hearts, r.d[w][19].hearts])).toEqual([[5, 11], [6, 12], [7, 13], [8, 15], [8, 12], [9, 12]]);   // SPEC-022: bosses; SPEC-029: one fewer, the cap of 12 stays
  // level 20 is harder than level 1 in every world; every world starts below the previous world's level 20
  WORLDS.forEach((w, wi) => {
    const first = r.d[w][0], last = r.d[w][19];
    soft(last.chase > first.chase && last.hearts > first.hearts, `${w}: level 20 harder than level 1`).toBe(true);
    if (wi) {
      const prev = r.d[WORLDS[wi - 1]][19];
      soft(first.chase < prev.chase && first.hearts < prev.hearts, `${w} level 1 easier than ${WORLDS[wi - 1]} level 20`).toBe(true);
    }
  });
  soft.done();
  // in the game
  expect(r.game.school5.maxHp).toBe(9);                   // SPEC-016: School is difficulty 3 (SPEC-029: 5 + 1 + 3)
  expect(r.game.school5.hp).toBe(9);
  expect(r.game.school5.speeds.chase).toBeCloseTo(r.d.school[4].chase, 6);
  expect(r.game.school5.speeds.patrol).toBeCloseTo(r.d.school[4].patrol, 6);
  expect(r.game.winter20.maxHp).toBe(12);
  expect(r.game.winter20.boost).toBeCloseTo(r.game.winter20.d.boost, 6);
  expect(r.game.winter20.lastHeart).toEqual({ chase: r.game.winter20.d.chase, search: r.game.winter20.d.search, patrol: r.game.winter20.d.patrol });
  for (const s of [r.game.winter20.lastHeart, r.game.winter20.halfHeart, r.game.park20.lastHeart]) {
    expect(s.chase).toBeCloseTo(MAX, 6);                  // capped (with 11 hearts of anger: far above before the cap)
    expect(s.search).toBeLessThanOrEqual(MAX + 1e-9);
  }
  expect(r.game.winter20.lastHeart.patrol).toBeCloseTo(70 + (18 + 19 * PER + 11 * 4) / 2, 6);   // patrol + half of the boost, as before (under the cap)

  // the real movement: an angry Big One at the last heart of Winter 20 runs no faster than the ceiling
  const run = await page.evaluate(() => {
    const b = window.__bb, g = b.grid, C = g.CELL, COLS = g.COLS, ROWS = g.ROWS;
    const pt = (x, y) => ({ x: (x + 0.5) * C, y: (y + 0.5) * C });
    // an open map to measure on: a straight run of 8 cells free for the Big One, outside both houses, no bush at the end
    let band = null;
    for (let n = 1; n <= 4 && !band; n++) {
      b.world = "park"; b.level = n; b.startGame(1);
      const bl = g.blockedBig, free = (x, y) => !bl[y * COLS + x];
      for (let y = 0; y < ROWS && !band; y++) for (let x = 0; x + 7 < COLS && !band; x++) {
        let ok = true;
        for (let k = 0; k <= 7 && ok; k++) { const p = pt(x + k, y); ok = free(x + k, y) && !b.inSafe(p) && !b.inDanger(p); }
        const end = pt(x + 7, y);
        if (ok && !g.bushes.some(q => Math.hypot(q.x - end.x, q.y - end.y) < q.r + 12)) band = { x, y };
      }
    }
    if (!band) return null;
    b.world = "winter"; b.level = 20;                         // …with the hardest level's speed
    Object.assign(b.big, { maxHp: 12, hp: 1 });
    const L = b.littles, from = pt(band.x, band.y), to = pt(band.x + 7, band.y);
    L.forEach((l, i) => { if (i) Object.assign(l, { state: "rest", restTimer: 999 }); });
    Object.assign(L[0], { x: to.x, y: to.y, state: "ok", invuln: 0, dizzy: 0 });
    Object.assign(b.big, { x: from.x, y: from.y, dir: 0, state: "look", timer: 999, stun: 0, slip: 0, blush: 0, noPush: 0, pushCd: 0, path: [], repath: 0 });
    const T = 0.5, steps = 30;
    for (let i = 0; i < steps; i++) b.update(T / steps);
    return { moved: Math.hypot(b.big.x - from.x, b.big.y - from.y), state: b.big.state, T, speeds: b.bigSpeeds() };
  });
  expect(run, "found an open band to measure on").not.toBeNull();
  expect(run.state).toBe("chase");
  expect(run.moved / run.T, "real speed at most the ceiling").toBeLessThanOrEqual(MAX + 0.5);
  expect(run.moved / run.T, "real speed close to the ceiling").toBeGreaterThan(MAX * 0.9);
});

// ---------- SPEC-016 AC 4: the difficulty index follows the story ----------
// Speeds, hearts, coins and the fast-star time use CFG.WORLD_DIFFICULTY (park 0, field 1, city 2, school 3, beach 3, winter 4),
// not the world's place in WORLDS; the balance script's fast-star target and autopilot seeds follow too.
test("difficulty follows the story order", async ({ levelPage: page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb, C = b.CFG, d = {}, reward = {};
    for (const w of W) { d[w] = []; for (let n = 1; n <= 20; n++) d[w].push(b.difficulty(w, n)); }
    const out = { d, start: C.WORLD_SPEED_START, diff: C.WORLD_DIFFICULTY, hasHelper: typeof b.worldDifficulty === "function", hasTarget: typeof b.fastTarget === "function",
      R: { ...b.REWARD }, fastPer: C.FAST_PER_WORLD, fast5: C.FAST_TIME(5) };
    if (out.hasHelper) out.index = Object.fromEntries(W.map(w => [w, b.worldDifficulty(w)]));
    if (out.hasTarget) out.target = Object.fromEntries(W.map(w => [w, b.fastTarget(w, 5)]));
    // the reward of a first win of level 5 in every world: its base and the fast-star time (the progress is put back after)
    const keep = JSON.parse(JSON.stringify(b.progress));
    try {
      for (const w of W) {
        b.setProgress(null); b.world = w; b.level = 5; b.startGame(1);
        Object.assign(b.stats, { playerHugs: 0, rests: 0, time: 9999, starCoins: 0 });
        b.giveReward(true); b.mode = "home";
        reward[w] = { base: b.lastReward.base, target: b.lastReward.target };
      }
    } finally { b.setProgress(keep); b.world = "park"; b.level = 1; }
    out.reward = reward;
    return out;
  }, WORLDS);
  expect(r.diff).toEqual(DIFFICULTY);
  expect(r.start).toEqual([0, 5, 10, 15, 18]);
  expect(r.hasHelper, "__bb.worldDifficulty").toBe(true);
  expect(r.index).toEqual(DIFFICULTY);
  // coins and the fast star by the index: Beach pays like the School, Winter one step more
  const base = w => r.R.BASE + r.R.PER_LEVEL * 5 + r.R.PER_WORLD * DIFFICULTY[w], target = w => r.fast5 + DIFFICULTY[w] * r.fastPer;
  expect(r.reward).toEqual(Object.fromEntries(WORLDS.map(w => [w, { base: base(w), target: target(w) }])));
  expect(r.hasTarget, "__bb.fastTarget").toBe(true);
  expect(r.target).toEqual(Object.fromEntries(WORLDS.map(w => [w, target(w)])));
  expect(WORLDS.map(w => r.reward[w].target)).toEqual([135, 145, 155, 165, 165, 175]);
  const soft = softly(), harder = (a, z) => a.chase <= z.chase && a.hearts <= z.hearts && a.boost <= z.boost;
  // every main world's level 1 is easier than the previous main world's level 20
  for (const [prev, w] of [["park", "field"], ["field", "city"], ["city", "school"]]) {
    const first = r.d[w][0], last = r.d[prev][19];
    soft(first.chase < last.chase && first.hearts < last.hearts, `${w} 1 easier than ${prev} 20`).toBe(true);
  }
  // the bonus worlds: Beach as hard as the School or harder, Winter at least as hard as the Beach, level by level
  // (SPEC-022: but School 20 is the grumpiest dad, a boss — the bonus worlds have no boss on level 20)
  for (let n = 1; n <= 20; n++) {
    if (n < 20) soft(harder(r.d.school[n - 1], r.d.beach[n - 1]), `beach ${n} ≥ school ${n}`).toBe(true);
    soft(harder(r.d.beach[n - 1], r.d.winter[n - 1]), `winter ${n} ≥ beach ${n}`).toBe(true);
  }
  soft(r.d.winter[0].chase > r.d.beach[0].chase, "winter 1 faster than beach 1").toBe(true);
  soft.done();
  // scripts/balance.js: the autopilot seeds are keyed by WORLD_SEED (the old worlds keep their seeds: 100003 × (old place + 1) + …)
  const { economyPlan } = require("../scripts/balance.js");
  const B = { ECONOMY: { REPLAY: [], UPG_EVERY: 20, UPG_EXTRA: ["none", 0, 0] } };
  const seeds = { park: 1, school: 2, beach: 3, winter: 4, field: 5, city: 6 };
  const plan = economyPlan([], B, WORLDS, 20, [["fastFeet", 3]], seeds);
  expect(plan.upgrades.map(j => [j.world, j.seed])).toEqual(WORLDS.map(w => [w, 100003 * seeds[w] + 1009 * 20 + 1]));
});

// Every level of one type in all four worlds as the game accepts it: the fairness report and the accepted map (report.attempt).
async function levelsOf(page, type) {
  return page.evaluate(([t, W]) => {
    const b = window.__bb, out = [];
    for (const w of W) for (let n = 1; n <= 20; n++) if (b.levelType(w, n) === t) {
      const r = b.levelReport(w, n);
      out.push({ lv: `${w}:${n}`, n, r, gen: b.generateLevel(w, n, r.attempt) });
    }
    return out;
  }, [type, WORLDS]).then(list => list.map(x => ({ ...x, tier: tierOf(x.n) })));
}
const count = (gen, pred) => gen.items.filter(pred).length;
const inRange = (n, [a, b]) => n >= a && n <= b;
const bushRange = (min, [a, b], tier) => [Math.max(min, a - tier), Math.max(min, b - tier)];
// cells of the map covered by items that match pred
function cellsOf(gen, pred) {
  const g = Array.from({ length: 20 }, () => Array(30).fill(false));
  for (const it of gen.items) if (pred(it)) for (let y = it.y; y < it.y + (it.h || 1); y++) for (let x = it.x; x < it.x + (it.w || 1); x++) if (y >= 0 && y < 20 && x >= 0 && x < 30) g[y][x] = true;
  return g;
}
const houseCorners = gen => {
  const s = gen.items.find(it => it.t === "safe"), d = gen.items.find(it => it.t === "danger");
  return { small: [s.x < 15, s.y < 10], big: [d.x < 15, d.y < 10] };
};


test("meadow is open with bushes", async ({ levelPage: page }) => {
  const levels = await levelsOf(page, "meadow");
  expect(levels.map(x => x.lv)).toEqual(levelsOfType("meadow"));
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    soft(r.fallback, at).toBe(false);
    soft([...new Set(gen.items.filter(it => it.t === "wall").map(it => it.kind))].sort(), at).toEqual(["bighome", "home"]);
    soft(count(gen, it => it.t === "cottage" || it.t === "water"), at).toBe(0);
    const bushes = count(gen, it => it.t === "bush");
    soft(inRange(bushes, bushRange(7, [10, 12], tier)), `${at}: ${bushes} bushes`).toBe(true);
    soft(inRange(count(gen, it => it.t === "tree"), [6, 9]), at).toBe(true);
    soft(inRange(count(gen, it => it.t === "rock"), [2, 4]), at).toBe(true);
    soft(inRange(count(gen, it => it.t === "pond"), [0, 2]), at).toBe(true);
    const c = houseCorners(gen);   // open type: the houses are on the diagonal
    soft(c.small[0] !== c.big[0] && c.small[1] !== c.big[1], at).toBe(true);
  }
  soft.done();
});

test("maze has 2-wide corridors and few dead ends", async ({ levelPage: page }) => {
  const levels = await levelsOf(page, "maze");
  expect(levels.map(x => x.lv)).toEqual(levelsOfType("maze"));
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    soft(r.fallback, at).toBe(false);
    const maze = gen.items.filter(it => it.t === "wall" && it.kind === "maze");
    soft(maze.length, at).toBeGreaterThan(10);
    for (const w of maze) soft(w.w === 1 || w.h === 1, `${at}: wall ${JSON.stringify(w)}`).toBe(true);
    const mz = cellsOf(gen, it => it.t === "wall" && it.kind === "maze");
    const solid = cellsOf(gen, it => ["wall", "cottage", "pond", "water", "tree", "rock"].includes(it.t));
    // walls are 1 cell thick: no 2×2 block of maze wall
    const thick = [];
    for (let y = 0; y < 19; y++) for (let x = 0; x < 29; x++) if (mz[y][x] && mz[y][x + 1] && mz[y + 1][x] && mz[y + 1][x + 1]) thick.push(`${x},${y}`);
    soft(thick, `${at}: thick maze walls`).toEqual([]);
    // corridors are 2 wide: no free run of exactly 1 cell between two maze walls (rows and columns)
    const narrow = [];
    for (let y = 0; y < 20; y++) for (let x = 1; x < 29; x++) if (!solid[y][x] && mz[y][x - 1] && mz[y][x + 1]) narrow.push(`${x},${y} row`);
    for (let x = 0; x < 30; x++) for (let y = 1; y < 19; y++) if (!solid[y][x] && mz[y - 1][x] && mz[y + 1][x]) narrow.push(`${x},${y} column`);
    soft(narrow, at).toEqual([]);
    // braided: at most a quarter of the perfect maze's dead ends are left
    soft(r.deadEnds.before, at).toBeGreaterThan(0);
    soft(r.deadEnds.count, `${at}: ${JSON.stringify(r.deadEnds)}`).toBeLessThanOrEqual(Math.floor(r.deadEnds.before * 0.25));
    // 1–2 open plazas of 4×4 to 5×5 without maze walls
    const plazas = gen.meta.areas.plazas;
    soft(inRange(plazas.length, [1, 2]), at).toBe(true);
    for (const q of plazas) {
      soft(inRange(q.w, [4, 5]) && inRange(q.h, [4, 5]), `${at}: plaza ${JSON.stringify(q)}`).toBe(true);
      const inPlaza = [];
      for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (mz[y][x]) inPlaza.push(`${x},${y}`);
      soft(inPlaza, `${at}: maze walls in plaza ${JSON.stringify(q)}`).toEqual([]);
    }
    const bushes = count(gen, it => it.t === "bush"), trees = count(gen, it => it.t === "tree");
    soft(inRange(bushes, bushRange(2, [3, 4], tier)), `${at}: ${bushes} bushes`).toBe(true);
    soft(trees <= Math.min(2, plazas.length), at).toBe(true);
    soft(count(gen, it => it.t === "rock" || it.t === "pond"), at).toBe(0);
  }
  soft.done();
});

test("village has cottages, streets and a square", async ({ levelPage: page }) => {
  const levels = await levelsOf(page, "village");
  expect(levels.map(x => x.lv)).toEqual(levelsOfType("village"));
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    soft(r.fallback, at).toBe(false);
    const cot = gen.items.filter(it => it.t === "cottage");
    soft(inRange(cot.length, [5, 8]), `${at}: ${cot.length} cottages`).toBe(true);
    for (const c of cot) {
      const [a, b] = [Math.min(c.w, c.h), Math.max(c.w, c.h)];
      soft(inRange(a, [3, 4]) && inRange(b, [3, 5]), `${at}: cottage ${JSON.stringify(c)}`).toBe(true);
    }
    // streets: no two cottages closer than 2 cells
    for (let i = 0; i < cot.length; i++) for (let j = i + 1; j < cot.length; j++) {
      const p = cot[i], q = cot[j], gap = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w), q.y - (p.y + p.h), p.y - (q.y + q.h));
      soft(gap, `${at}: cottages ${i} and ${j}`).toBeGreaterThanOrEqual(2);
    }
    // the square with a 2×2 fountain in it
    const sq = gen.items.find(it => it.t === "floor" && it.kind === "square");
    soft(sq, at).toBeTruthy();
    if (!sq) continue;
    soft(inRange(sq.w, [5, 6]) && inRange(sq.h, [4, 5]), at).toBe(true);
    const f = gen.items.find(it => it.t === "pond" && it.w === 2 && it.h === 2 && it.x >= sq.x && it.y >= sq.y && it.x + 2 <= sq.x + sq.w && it.y + 2 <= sq.y + sq.h);
    soft(f, `${at}: fountain`).toBeTruthy();
    const bushes = count(gen, it => it.t === "bush");
    soft(inRange(bushes, bushRange(3, [5, 7], tier)), `${at}: ${bushes} bushes`).toBe(true);
    soft(inRange(count(gen, it => it.t === "tree"), [3, 6]), at).toBe(true);
    soft(inRange(count(gen, it => it.t === "rock"), [0, 2]), at).toBe(true);
  }
  soft.done();
  // in the game a cottage blocks walking and sight (so air kisses stop at it too)
  const o = await page.evaluate(() => {
    const b = window.__bb; b.world = "park"; b.level = 5; b.startGame(1);   // a village
    const c = b.grid.obstacles.find(q => q.kind === "cottage");
    return c && { move: c.move, sight: c.sight, see: b.grid.seeSolid(c.x + c.w / 2, c.y + c.h / 2) };
  });
  expect(o).toEqual({ move: true, sight: true, see: true });
});

// Flood fill over cells that are not solid; returns the reached grid. solid[y][x] === true blocks.
function flood(solid, start) {
  const seen = Array.from({ length: 20 }, () => Array(30).fill(false)), q = [start];
  if (solid[start[1]][start[0]]) return seen;
  seen[start[1]][start[0]] = true;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 30 || ny >= 20 || seen[ny][nx] || solid[ny][nx]) continue;
      seen[ny][nx] = true; q.push([nx, ny]);
    }
  }
  return seen;
}
const front = d => [d.x + d.dx, d.y + d.dy];   // first cell in front of a house door (gen.doors)
const SOLID = ["wall", "cottage", "pond", "water", "tree", "rock"];

test("river has bridges and the houses on opposite banks", async ({ levelPage: page }) => {
  const levels = await levelsOf(page, "river");
  expect(levels.map(x => x.lv)).toEqual(levelsOfType("river"));
  let verticals = 0;
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    soft(r.fallback, at).toBe(false);
    const water = cellsOf(gen, it => it.t === "water"), bridge = cellsOf(gen, it => it.t === "floor" && it.kind === "bridge");
    const river = (x, y) => water[y][x] || bridge[y][x];
    const vertical = !water.some(row => row[0]) && !water.some(row => row[29]);
    if (vertical) verticals++;
    // from one map edge to the opposite one: every line across the river has one run of 2–3 river cells
    const along = vertical ? 20 : 30, tops = [];
    for (let p = 0; p < along; p++) {
      const across = [];
      for (let q = 0; q < (vertical ? 30 : 20); q++) if (vertical ? river(q, p) : river(p, q)) across.push(q);
      soft(across.length >= 2 && across.length <= 3 && across[across.length - 1] - across[0] === across.length - 1, `${at}: river at ${p}: ${across}`).toBe(true);
      tops.push(across[0]);
    }
    for (let p = 1; p < along; p++) soft(Math.abs(tops[p] - tops[p - 1]), `${at}: meander at ${p}`).toBeLessThanOrEqual(1);
    // 2–3 bridges, 2–3 cells wide, no water under them
    const bridges = gen.items.filter(it => it.t === "floor" && it.kind === "bridge");
    soft(inRange(bridges.length, [2, 3]), `${at}: ${bridges.length} bridges`).toBe(true);
    for (const b of bridges) {
      soft(inRange(vertical ? b.h : b.w, [2, 3]), `${at}: bridge ${JSON.stringify(b)}`).toBe(true);
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) soft(water[y][x], `${at}: water under bridge`).toBe(false);
    }
    // the houses on opposite banks: without bridges the Little Ones' door can't reach the Big One's door; with them it can
    const solid = cellsOf(gen, it => SOLID.includes(it.t));
    const noBridge = solid.map((row, y) => row.map((v, x) => v || bridge[y][x]));
    const s = front(gen.doors.small[0]), bd = front(gen.doors.big[0]);
    soft(flood(noBridge, s)[bd[1]][bd[0]], `${at}: banks joined without a bridge`).toBe(false);
    soft(flood(solid, s)[bd[1]][bd[0]], `${at}: bridges don't join the banks`).toBe(true);
    // bushes on both banks
    const bush = gen.items.filter(it => it.t === "bush"), reachS = flood(noBridge, s);
    soft(inRange(bush.length, bushRange(4, [6, 8], tier)), `${at}: ${bush.length} bushes`).toBe(true);
    soft(bush.some(q => reachS[q.y][q.x]) && bush.some(q => !reachS[q.y][q.x]), `${at}: bushes on both banks`).toBe(true);
    soft(inRange(count(gen, it => it.t === "tree"), [5, 8]) && inRange(count(gen, it => it.t === "rock"), [1, 3]), at).toBe(true);
  }
  soft.done();
  expect(verticals, "some rivers run top to bottom").toBeGreaterThan(0);
  expect(verticals, "some rivers run left to right").toBeLessThan(levels.length);
  // in the game: water blocks walking but not sight (the Big One sees across, kisses fly over)
  const o = await page.evaluate(() => {
    const b = window.__bb; b.world = "park"; b.level = 8; b.startGame(1);   // a river
    const w = b.grid, o = w.obstacles.find(q => q.kind === "water");
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    return { move: o.move, sight: o.sight, see: w.seeSolid(cx, cy), blocked: w.blocked[Math.floor(cy / w.CELL) * w.COLS + Math.floor(cx / w.CELL)] };
  });
  expect(o).toEqual({ move: true, sight: false, see: false, blocked: 1 });
});

test("rooms all have doors and the building has loops", async ({ levelPage: page }) => {
  const levels = await levelsOf(page, "rooms");
  expect(levels.map(x => x.lv)).toEqual(levelsOfType("rooms"));
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    soft(r.fallback, at).toBe(false);
    soft([...new Set(gen.items.filter(it => it.t === "wall").map(it => it.kind))].sort(), at).toEqual(["bighome", "build", "home"]);
    const wall = cellsOf(gen, it => it.t === "wall"), { rooms, doors } = gen.meta.areas;
    const roomAt = (x, y) => rooms.findIndex(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    soft(rooms.length, at).toBeGreaterThanOrEqual(3);
    for (const q of rooms) {
      soft(q.w >= 4 && q.h >= 4, `${at}: room ${JSON.stringify(q)}`).toBe(true);
      const inside = [];
      for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (wall[y][x]) inside.push(`${x},${y}`);
      soft(inside, `${at}: walls inside room ${JSON.stringify(q)}`).toEqual([]);
    }
    // doors are 2-cell gaps in the walls; each side is a room (index) or a yard ("small" / "big")
    for (const d of doors) {
      soft(d.w * d.h, at).toBe(2);
      const vert = d.w === 1;
      for (let k = 0; k < 2; k++) {
        const x = d.x + (vert ? 0 : k), y = d.y + (vert ? k : 0);
        soft(wall[y][x], `${at}: door ${JSON.stringify(d)} is walled`).toBe(false);
        const sides = vert ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]];
        for (const [sx, sy] of sides) soft(wall[sy][sx], `${at}: door ${JSON.stringify(d)} opens on a wall`).toBe(false);
        const rs = sides.map(([sx, sy]) => roomAt(sx, sy));
        const ab = [d.a, d.b].map(v => typeof v === "number" ? v : -1);
        soft(rs.slice().sort(), `${at}: door ${JSON.stringify(d)} sides`).toEqual(ab.slice().sort());
      }
    }
    // every room has a door, ≥ 3 outside doors, everything connected, and some door can be removed (a loop)
    for (let k = 0; k < rooms.length; k++) soft(doors.some(d => d.a === k || d.b === k), `${at}: room ${k} without a door`).toBe(true);
    soft(doors.filter(d => typeof d.a !== "number" || typeof d.b !== "number").length, at).toBeGreaterThanOrEqual(3);
    const nodes = [...rooms.map((_, k) => k), "small", "big"];
    const connected = list => {
      const seen = new Set(["small"]), q = ["small"];
      while (q.length) { const n = q.pop(); for (const d of list) for (const [u, v] of [[d.a, d.b], [d.b, d.a]]) if (u === n && !seen.has(v)) { seen.add(v); q.push(v); } }
      return nodes.every(n => seen.has(n));
    };
    soft(connected(doors), `${at}: building not connected`).toBe(true);
    soft(doors.some((d, k) => connected(doors.filter((_, j) => j !== k))), `${at}: no loop`).toBe(true);
    // plants inside rooms, rocks only in big rooms, no trees
    const bush = gen.items.filter(it => it.t === "bush");
    soft(inRange(bush.length, bushRange(2, [3, 5], tier)), `${at}: ${bush.length} bushes`).toBe(true);
    for (const q of bush) soft(roomAt(q.x, q.y) >= 0 && roomAt(q.x, q.y) === roomAt(q.x + 1, q.y + 1), `${at}: bush outside rooms`).toBe(true);
    for (const q of gen.items.filter(it => it.t === "rock")) { const k = roomAt(q.x, q.y); soft(k >= 0 && rooms[k].w * rooms[k].h >= 30, `${at}: rock outside a big room`).toBe(true); }
    soft(inRange(count(gen, it => it.t === "rock"), [2, 4]), at).toBe(true);
    soft(count(gen, it => it.t === "tree"), at).toBe(0);
  }
  soft.done();
});

test("arena has a ring with gaps", async ({ levelPage: page }) => {
  const levels = await levelsOf(page, "arena");
  expect(levels.map(x => x.lv)).toEqual(levelsOfType("arena"));
  let withHalf = 0;
  const soft = softly();   // SPEC-018: checks in the loop are collected, asserted once below
  for (const { lv, tier, r, gen } of levels) {
    const at = `level ${lv}`;
    soft(r.fallback, at).toBe(false);
    const { block: [bl], ring: [rg], gaps, halfGaps } = gen.meta.areas;
    const arena = cellsOf(gen, it => it.t === "wall" && it.kind === "arena");
    // the central block is one solid arena wall 4–5 × 4
    soft(gen.items.some(it => it.t === "wall" && it.kind === "arena" && it.x === bl.x && it.y === bl.y && it.w === bl.w && it.h === bl.h), at).toBe(true);
    soft(inRange(bl.w, [4, 5]) && bl.h === 4, `${at}: block ${JSON.stringify(bl)}`).toBe(true);   // 6×4 never fits (BACKLOG)
    // the ring is 3 cells away from the block
    soft([rg.x, rg.y, rg.w, rg.h], at).toEqual([bl.x - 4, bl.y - 4, bl.w + 8, bl.h + 8]);
    // 3–4 gaps 2–3 wide; every other ring cell is an arena wall
    soft(inRange(gaps.length, [3, 4]), at).toBe(true);
    const inGap = (x, y) => gaps.some(g => x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h);
    for (const g of gaps) soft(inRange(g.w * g.h, [2, 3]) && (g.w === 1 || g.h === 1), `${at}: gap ${JSON.stringify(g)}`).toBe(true);
    const ringBad = [];
    for (let x = rg.x; x < rg.x + rg.w; x++) for (const y of [rg.y, rg.y + rg.h - 1]) if (arena[y][x] === inGap(x, y)) ringBad.push(`${x},${y}`);
    for (let y = rg.y; y < rg.y + rg.h; y++) for (const x of [rg.x, rg.x + rg.w - 1]) if (arena[y][x] === inGap(x, y)) ringBad.push(`${x},${y}`);
    soft(ringBad, `${at}: ring cells`).toEqual([]);
    // the ring corridor is reachable from outside through every single gap
    const solid = cellsOf(gen, it => SOLID.includes(it.t)), s = front(gen.doors.small[0]);
    for (const g of gaps) {
      const only = solid.map((row, y) => row.map((v, x) => v || (inGap(x, y) && !(x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h))));
      soft(flood(only, s)[bl.y - 2][bl.x + 1], `${at}: corridor not reached through gap ${JSON.stringify(g)}`).toBe(true);
    }
    // bushes in the ring corridor, trees outside
    const bush = gen.items.filter(it => it.t === "bush");
    soft(inRange(bush.length, bushRange(3, [4, 6], tier)), `${at}: ${bush.length} bushes`).toBe(true);
    for (const q of bush) soft(q.x > rg.x && q.y > rg.y && q.x + 1 < rg.x + rg.w - 1 && q.y + 1 < rg.y + rg.h - 1, `${at}: bush outside the ring`).toBe(true);
    for (const q of gen.items.filter(it => it.t === "tree")) soft(q.x < rg.x || q.y < rg.y || q.x >= rg.x + rg.w || q.y >= rg.y + rg.h, `${at}: tree inside the ring`).toBe(true);
    soft(inRange(count(gen, it => it.t === "tree"), [4, 7]) && inRange(count(gen, it => it.t === "rock"), [0, 2]), at).toBe(true);
    if (halfGaps.length) { withHalf++; soft(halfGaps.length, at).toBe(2); }
  }
  soft.done();
  expect(withHalf, "some arenas have a half-ring").toBeGreaterThan(0);
  expect(withHalf, "some arenas have none").toBeLessThan(levels.length);
});

test("the game starts exactly the level that levelReport checks", async ({ levelPage: page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb, w = b.grid, C = w.CELL, out = [];
    // obstacles the game should build from a generated map
    const expected = gen => gen.items.flatMap(it => {
      if (["wall", "cottage", "water", "pond"].includes(it.t)) return [{ kind: it.t === "wall" ? it.kind : it.t, x: it.x * C, y: it.y * C, w: it.w * C, h: it.h * C }];
      if (it.t === "tree" || it.t === "rock") return [{ kind: it.t, x: it.x * C + 16, y: it.y * C + 16 }];
      return [];
    });
    const key = list => list.map(o => JSON.stringify([o.kind, o.x, o.y, o.w || 0, o.h || 0])).sort().join("|");
    let retried = null;   // a level whose first attempt is not fair
    for (const w of W) for (let n = 2; n <= 20 && !retried; n++) { const q = b.levelReport(w, n); if (q.attempt > 0 && !q.fallback) retried = [w, n]; }
    // one level of every type (in different worlds) and the retried one
    for (const [wd, lv] of [["park", 1], ["school", 2], ["beach", 5], ["winter", 8], ["park", 11], ["school", 14], ["beach", 17], retried]) {
      b.world = wd; b.level = lv; b.startGame(1);
      const info = { ...b.levelInfo }, rep = b.levelReport(wd, lv), gen = b.generateLevel(wd, lv, rep.attempt);
      const same = key(w.obstacles) === key(expected(gen));
      const spawns = b.littles.map(l => [l.x / C, l.y / C]);
      out.push({ wd, lv, retried: wd === retried[0] && lv === retried[1], info, attempt: rep.attempt, type: rep.type, same, spawnsOk: JSON.stringify(spawns) === JSON.stringify(gen.small), bigOk: b.big.x / C === gen.big[0] && b.big.y / C === gen.big[1] });
    }
    return out;
  }, WORLDS);
  for (const x of r) {
    const at = `${x.wd} level ${x.lv}`;
    expect([x.info.world, x.info.lv], at).toEqual([x.wd, x.lv]);
    expect(x.info.type, at).toBe(x.type);
    expect(x.info.fallback, at).toBe(false);
    expect(x.info.attempt, at).toBe(x.attempt);
    expect(x.same, `${at}: obstacles differ from generateLevel(lv, attempt)`).toBe(true);
    expect(x.spawnsOk && x.bigOk, `${at}: spawns`).toBe(true);
    expect(x.info.ms, `${at}: level build ms`).toBeLessThan(200);
  }
  expect(r.find(x => x.retried).info.attempt, "a retried level: the game takes the same accepted attempt").toBeGreaterThan(0);
  expect(r.find(x => x.lv === 1).info.attempt, "level 1 is attempt 0").toBe(0);
  expect(r.map(x => x.type).slice(0, 7)).toEqual(["classic", "meadow", "village", "river", "rooms", "arena", "maze"]);
});

test("restarting a retried level builds it from the cache, the same as a fresh build", async ({ levelPage: page }) => {
  const r = await page.evaluate(W => {
    const b = window.__bb;
    let lv = 0, rep = null;
    for (const w of W) for (let n = 2; n <= 20 && !lv; n++) { const q = b.levelReport(w, n); if (q.attempt > 0 && !q.fallback) { lv = n; rep = q; b.world = w; } }
    b.level = lv; b.startGame(1);
    const first = { info: { ...b.levelInfo }, world: b.worldState() };
    b.startGame(1);                                       // restart: from the cache
    const again = { info: { ...b.levelInfo }, world: b.worldState() };
    b.clearLevelCache(); b.startGame(1);                  // fresh build again
    const fresh = { info: { ...b.levelInfo }, world: b.worldState() };
    return { lv, attempt: rep.attempt, first, again, fresh };
  }, WORLDS);
  expect(r.attempt).toBeGreaterThan(0);
  expect([r.first.info.cached, r.again.info.cached, r.fresh.info.cached]).toEqual([false, true, false]);
  expect([r.first.info.attempt, r.again.info.attempt, r.fresh.info.attempt]).toEqual([r.attempt, r.attempt, r.attempt]);
  expect(r.again.world === r.first.world && r.fresh.world === r.first.world, `level ${r.lv}: worlds differ`).toBe(true);
});

test("a level with no fair layout falls back and warns", async ({ levelPage: page }) => {
  const warns = [];
  const onConsole = m => { if (m.type() === "warning") warns.push(m.text()); };
  page.on("console", onConsole);   // the page is shared: the listener goes away right after the evaluate (finally)
  const r = await page.evaluate(() => {
    const b = window.__bb, w = b.grid, C = w.CELL, keep = b.CFG.HOUSE_PATH;
    b.CFG.HOUSE_PATH = [999, 1000];   // no generated level can pass rule 3
    b.clearLevelCache();
    const flood = (grid, x, y) => {
      const seen = new Uint8Array(grid.length), s0 = Math.floor(y / C) * w.COLS + Math.floor(x / C), q = [s0]; seen[s0] = 1;
      while (q.length) { const i = q.pop(), cx = i % w.COLS, cy = (i / w.COLS) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w.COLS || ny >= w.ROWS) continue; const j = ny * w.COLS + nx; if (!grid[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
      return grid.every((v, i) => v || seen[i]);
    };
    try {
      const report = b.levelReport("park", 2);
      b.world = "park"; b.level = 2; b.startGame(1);
      const reach = { small: flood(w.blocked, b.littles[0].x, b.littles[0].y), big: flood(w.blockedBig, b.big.x, b.big.y) };
      for (let i = 0; i < 120; i++) b.update(1 / 60);   // the fallback level still plays
      return { info: { ...b.levelInfo }, report: { attempt: report.attempt, rejects: report.rejects, fallback: report.fallback }, reach, mode: b.mode, littles: b.littles.length };
    } finally { b.CFG.HOUSE_PATH = keep; b.clearLevelCache(); }
  }).finally(() => page.off("console", onConsole));
  expect(r.info.fallback).toBe(true);
  expect(r.report.fallback).toBe(true);
  expect(r.report.rejects.length).toBe(40);
  // kept attempt: fewest failed rules, attempts that break reachability last, the earliest of equals
  const score = why => why.split("/").length + (/smallReach|bigReach/.test(why) ? 100 : 0);
  let want = 0;
  r.report.rejects.forEach((why, a) => { if (score(why) < score(r.report.rejects[want])) want = a; });
  expect(r.report.attempt).toBe(want);
  expect(r.info.attempt).toBe(want);
  // the hedges leave no pocket: everything free is reachable for the Little Ones and (outside their house) for the Big One
  expect(r.reach).toEqual({ small: true, big: true });
  expect(r.mode).toBe("play");
  expect(r.littles).toBe(5);
  expect(warns.some(t => t.includes("park:2") && t.includes("housePath"))).toBe(true);
});

test("every world dresses every level type", async ({ page }) => {
  test.setTimeout(180_000);
  const r = await page.evaluate(W => {
    const b = window.__bb, C = b.grid.CELL, out = [];
    for (const place of W) for (const lv of [1, 2, 5, 8, 11, 14, 17]) {   // one level of every type in every world (SPEC-016: six)
      b.world = place; b.level = lv; b.startGame(1);
      for (let i = 0; i < 5; i++) b.update(1 / 60);
      const th = b.THEMES[place], type = b.levelType(place, lv), gen = b.generateLevel(place, lv, b.levelInfo.attempt);
      const pieces = b.mapPieces(), colorOf = name => [...new Set(pieces.filter(q => q.piece === name).map(q => q.color))];
      const want = {}, got = {};
      if (type === "maze") { want.maze = [th.maze.wall]; want.mazeDeco = [th.maze.decoC]; }
      if (type === "village") {
        want.cottage = [th.cottage.wall]; want.roof = [th.cottage.roof]; want.fountain = [th.fountain];
        if (th.cottage.snow) want.snow = [th.cottage.snow];
        const sq = gen.items.find(it => it.t === "floor" && it.kind === "square");
        got.square = [b.groundColorAt(sq.x * C + 1, sq.y * C + 1)]; want.square = [th.square[0]];
      }
      if (type === "river") {
        want.water = [th.water.c]; want.bank = [th.water.edge];
        const br = gen.items.find(it => it.t === "floor" && it.kind === "bridge");
        got.bridge = [b.groundColorAt(br.x * C + 6, br.y * C + 6)]; want.bridge = [th.bridge[0]];
      }
      if (type === "rooms") want.build = [th.walls.build[0]];
      if (type === "arena") want.arena = [th.walls.arena[0]];
      for (const k of Object.keys(want)) if (!got[k]) got[k] = colorOf(k);
      out.push({ place, lv, type, want, got, built: pieces.length });
    }
    return out;
  }, WORLDS);
  expect(r.length).toBe(42);
  for (const x of r) expect(x.got, `${x.place} ${x.type} (level ${x.lv})`).toEqual(x.want);
  // the new pieces really have their own look in every place (not one shared colour)
  const mazeColors = new Set(r.filter(x => x.type === "maze").map(x => x.got.maze[0]));
  const waterColors = new Set(r.filter(x => x.type === "river").map(x => x.got.water[0]));
  expect(mazeColors.size).toBe(WORLDS.length);
  expect(waterColors.size).toBe(WORLDS.length);
});

// ---------- AC 10: every type plays for 60 s and nobody gets stuck ----------
// One player (standing still in the house) + 4 bots; two levels per type (tier 0 and tier 1).
// At 10 s a bot far from the house is knocked down: it must be rescued, or walk home and lie down to rest.
// Also checks SPEC-003 (stars only in fair cells, no bot thrown out of the Big One's house, exits are free) on every map.
function playLevel(wd, lv) {
  const b = window.__bb, w = b.grid, C = w.CELL, COLS = w.COLS, ROWS = w.ROWS;
  b.world = wd; b.level = lv; b.startGame(1);
  const L = b.littles, big = b.big, bl = w.blocked;
  // cells the Little Ones can reach from their house
  const s0 = Math.floor(L[0].y / C) * COLS + Math.floor(L[0].x / C), reach = new Uint8Array(COLS * ROWS), q = [s0]; reach[s0] = 1;
  while (q.length) { const i = q.pop(), cx = i % COLS, cy = (i / COLS) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue; const j = ny * COLS + nx; if (!bl[j] && !reach[j]) { reach[j] = 1; q.push(j); } } }
  const cellOf = p => Math.floor(p.y / C) * COLS + Math.floor(p.x / C);
  const out = { lv, type: b.levelType(wd, lv), badStars: [], badExits: [] };
  // SPEC-003: the thrown-out spots are free and reachable
  for (const e of b.dangerZone.exits) if (bl[cellOf(e)] || !reach[cellOf(e)]) out.badExits.push(e);
  // SPEC-003: bonus stars only in fair cells
  for (let k = 0; k < 15; k++) {
    b.stars.length = 0; b.spawnStar();
    for (const st of b.stars) if (bl[cellOf(st)] || !reach[cellOf(st)] || b.inSafe(st) || b.inDanger(st)) out.badStars.push([st.x, st.y]);
  }
  b.stars.length = 0;
  // the downed bot: a reachable free cell far from the house
  const home = b.safeZone, hx = home.x + home.w / 2, hy = home.y + home.h / 2;
  let far = null;
  for (let i = 0; i < COLS * ROWS; i++) {
    if (bl[i] || !reach[i]) continue;
    const p = { x: (i % COLS + 0.5) * C, y: (((i / COLS) | 0) + 0.5) * C };
    if (b.inDanger(p) || b.inSafe(p)) continue;
    if (!far || Math.hypot(p.x - hx, p.y - hy) > Math.hypot(far.x - hx, far.y - hy)) far = p;
  }
  const bots = L.filter(l => l.kind === "bot"), moved = bots.map(() => 0), last = bots.map(l => ({ x: l.x, y: l.y }));
  let bigMoved = 0, bigLast = { x: big.x, y: big.y }, bigInSafe = 0, thrown = 0, downed = null;
  const seq = [];
  for (let f = 0; f < 60 * 60; f++) {
    if (f === 600) { downed = bots[0]; Object.assign(downed, { x: far.x, y: far.y, state: "down", downTimer: 18, botWait: 0, rescue: 0, invuln: 0, path: [] }); seq.push("down"); }
    b.update(1 / 60);
    bigMoved += Math.hypot(big.x - bigLast.x, big.y - bigLast.y); bigLast = { x: big.x, y: big.y };
    if (b.inSafe(big)) bigInSafe++;
    bots.forEach((l, i) => { moved[i] += Math.hypot(l.x - last[i].x, l.y - last[i].y); last[i] = { x: l.x, y: l.y }; if (l.dizzy > 0) thrown++; });
    if (downed && seq[seq.length - 1] !== downed.state) seq.push(downed.state);
    if (b.mode !== "play") { b.mode = "play"; b.world = wd; b.level = lv; }   // a win would end the level: keep playing
  }
  return { ...out, bigMoved: Math.round(bigMoved), bigInSafe, botMoved: moved.map(Math.round), thrown, seq: seq.join(">"), far };
}

// SPEC-006: tier 0 and tier 1 of every type, in different worlds
for (const [type, levels] of [["meadow", [["park", 2], ["school", 3]]], ["maze", [["park", 17], ["winter", 18]]], ["village", [["park", 5], ["beach", 6]]],
  ["river", [["park", 8], ["winter", 9]]], ["rooms", [["park", 11], ["school", 12]]], ["arena", [["park", 14], ["beach", 15]]]]) {
  test(`${type}: 60 s of play, nobody stuck`, async ({ levelPage: page }) => {
    test.setTimeout(180_000);
    await page.evaluate(`window.__playLevel = ${playLevel.toString()}`);
    for (const lv of levels) {
      const r = await page.evaluate(([w, n]) => window.__playLevel(w, n), lv);
      const at = `${type} level ${lv.join(" ")}`;
      console.log(`${at}: Big One ${r.bigMoved} px, bots ${r.botMoved.join("/")} px, downed bot ${r.seq}`);
      expect(r.type, at).toBe(type);
      expect(r.bigMoved, `${at}: the Big One moved`).toBeGreaterThan(300);
      expect(r.bigInSafe, `${at}: the Big One in the safe house`).toBe(0);
      for (const [i, d] of r.botMoved.entries()) expect(d, `${at}: bot ${i + 1} moved`).toBeGreaterThan(200);
      // rescued (down > ok) or walked home and lay down to rest (down > home > rest)
      expect(/^down>ok/.test(r.seq) || /^down>home>rest/.test(r.seq), `${at}: downed bot went ${r.seq}`).toBe(true);
      expect(r.thrown, `${at}: a bot was thrown out of the Big One's house`).toBe(0);
      expect(r.badStars, `${at}: stars in unfair cells`).toEqual([]);
      expect(r.badExits, `${at}: blocked exits`).toEqual([]);
    }
  });
}

test("kisses stop at maze walls and cottages and fly over the river", async ({ levelPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, w = b.grid, C = w.CELL, out = {};
    const prep = lv => {
      b.world = "park"; b.level = lv; b.startGame(1);
      const L = b.littles;
      L.forEach((l, i) => { if (i) Object.assign(l, { kind: "player", controls: { up: [], down: [], left: [], right: [] }, state: "rest", restTimer: 999, x: 40 + i * 40, y: 40 }); });
      b.progress.inv.kisses = 9;
      return L[0];
    };
    const free = (x, y) => !w.blocked[Math.floor(y / C) * w.COLS + Math.floor(x / C)];
    // flies a kiss from (x, y) along dir until it is gone; returns the farthest point along dir
    const fly = (p, x, y, dir) => {
      Object.assign(b.big, { x: 15 * C, y: 10 * C, state: "look", timer: 999, stun: 0, slip: 0, noPush: 999, pushCd: 0 });
      Object.assign(p, { x, y, dir, state: "ok", kissCd: 0, dizzy: 0, hugAnim: 0, invuln: 0 });
      if (!b.throwKiss(0)) return null;
      const k = b.kisses[b.kisses.length - 1];
      let far = 0, n = 0;
      for (; n < 60 && b.kisses.includes(k); n++) { far = Math.max(far, (k.x - x) * Math.cos(dir) + (k.y - y) * Math.sin(dir)); b.update(1 / 60); }
      return { far, frames: n };
    };
    // a wall piece of a kind with a free cell right below it (kiss flies up into it)
    const wallTest = (lv, kind) => {
      const p = prep(lv);
      for (const o of w.obstacles.filter(q => q.kind === kind && q.shape === "rect")) {
        const x = o.x + Math.min(o.w, C) / 2, y = o.y + o.h + 20;
        if (!free(x, y) || !free(x, y + 30) || b.inSafe({ x, y }) || b.inDanger({ x, y })) continue;
        const r = fly(p, x, y, -Math.PI / 2);
        if (r) return { ...r, gap: 20 };
      }
      return null;
    };
    out.maze = wallTest(17, "maze");
    out.cottage = wallTest(5, "cottage");
    out.arena = wallTest(14, "arena");
    // the river: across the longest water piece, from 20 px before it
    {
      const p = prep(8), vertical = b.generateLevel("park", 8, b.levelInfo.attempt).meta.vertical;
      const s = w.obstacles.filter(q => q.kind === "water").sort((a, c) => (vertical ? c.h - a.h : c.w - a.w))[0];
      const x = vertical ? s.x - 20 : s.x + s.w / 2, y = vertical ? s.y + s.h / 2 : s.y - 20;
      const r = fly(p, x, y, vertical ? 0 : Math.PI / 2);
      out.river = r && { ...r, width: vertical ? s.w : s.h, startFree: free(x, y) };
    }
    return out;
  });
  for (const k of ["maze", "cottage", "arena"]) {
    expect(r[k], k).not.toBeNull();
    expect(r[k].far, `${k}: the kiss went through the wall`).toBeLessThan(r[k].gap + 4);
    expect(r[k].frames, k).toBeLessThan(10);
  }
  expect(r.river).not.toBeNull();
  expect(r.river.startFree).toBe(true);
  expect(r.river.far, "the kiss flew over the whole river").toBeGreaterThan(20 + r.river.width);
});

test("the fountain drop stays on top of the fountain while the water moves", async ({ page }) => {
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 5; b.startGame(1); });
  await frames(page); await frames(page);
  const y = await page.evaluate(() => window.__bb.mapPieces().find(q => q.piece === "fountainDrop").y);
  expect(y).toBeGreaterThan(0.7);
});

test("rooms and arena need diagonal houses even if the CFG pairing is removed", async ({ levelPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, L = b.CFG.LAYOUT, keep = [L.rooms.homes, L.arena.homes], out = {};
    L.rooms.homes = undefined; L.arena.homes = undefined;   // the seed may now pick same-side houses
    try {
      // same side = both houses on the left half or both on the right half of the map
      const sameSide = ([w, lv], a) => { const g = b.generateLevel(w, lv, a), sz = g.items.find(i => i.t === "safe"), d = g.items.find(i => i.t === "danger"); return (sz.x < 15) === (d.x < 15); };
      for (const lv of [["park", 11], ["park", 14], ["school", 12], ["beach", 15], ["winter", 13], ["winter", 16]]) {
        const q = b.levelReport(...lv);
        out[lv.join(" ")] = { fallback: q.fallback, rejects: q.rejects, sides: q.rejects.map((_, a) => sameSide(lv, a)), acceptedSameSide: sameSide(lv, q.attempt) };
      }
    } finally { [L.rooms.homes, L.arena.homes] = keep; }
    return out;
  });
  let homesRejects = 0;
  for (const [lv, x] of Object.entries(r)) {
    expect(x.fallback, `level ${lv}`).toBe(false);
    expect(x.acceptedSameSide, `level ${lv}: built with same-side houses`).toBe(false);
    x.rejects.forEach((why, a) => {
      if (x.sides[a]) expect(why, `level ${lv} attempt ${a}: same-side houses not refused`).toContain("layout:homes");
      if (why.includes("layout:homes")) homesRejects++;
    });
  }
  expect(homesRejects, "some attempt had same-side houses").toBeGreaterThan(0);
});
