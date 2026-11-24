// SPEC-027: every piece of clothing has a picture (WARDROBE_ART), seven new clothes from art already drawn (appended to their
// lists: saved outfits are indexes), bots may wear them, the wardrobe and the "Clothes: n / m" count include them.
// Logic and data only: one shared sim page (the drawn checks are in look3d.spec.js and art.spec.js).
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const path = require("path");
const fs = require("fs");
const { openGame, sharedPage, resetGame, softly } = require("./helpers");

const sharedSim = sharedPage();
const test = base.test.extend({
  simPage: async ({ browser }, use) => {
    const s = await sharedSim.get(browser, "wardrobe-sim", { viewport: { width: 960, height: 640 } }, p => openGame(p, { sim: true }));
    await resetGame(s.page);
    await use(s.page);
    expect(s.errors.splice(0)).toEqual([]);
  }
});
test.afterAll(async () => { await sharedSim.close(); });

// the seven new clothes (AC 4): list, id, picture, tier price, names
const NEW = [
  ["jacket", "bluezip", "jacket_blue_zip", 40, "Blue zip jacket", "Campera azul con cierre", "Blusão azul", "Синяя куртка на молнии"],
  ["jacket", "redzip", "jacket_red_zip", 40, "Red zip jacket", "Campera roja con cierre", "Blusão vermelho", "Красная куртка на молнии"],
  ["jacket", "rainbow", "jacket_stripes", 80, "Rainbow", "Arcoíris", "Arco-íris", "Радуга"],
  ["jacket", "magiccape", "jacket_cape", 150, "Magic cape", "Capa mágica", "Capa mágica", "Волшебный плащ"],
  ["jacket", "trench", "jacket_trench", 80, "Detective coat", "Gabardina de detective", "Capa de detetive", "Плащ сыщика"],
  ["pants", "overalls", "pants_overalls", 80, "Overalls", "Jardinero", "Macacão", "Комбинезон"],
  ["pants", "striped", "pants_striped", 40, "Striped pants", "Pantalón rayado", "Calça listrada", "Полосатые штаны"]
];
// the lists as they were before SPEC-027 (the order an old save's indexes point into)
const OLD = {
  hat: ["none", "cap", "beanie", "crown", "bow", "flower", "ears", "headband", "tophat", "viking", "pirate", "glasses"],
  jacket: ["tshirt", "hoodie", "stripes", "purple", "pinkhoodie", "cape", "ninja", "sailor", "raincoat", "teal"],
  pants: ["jeans", "black", "red", "shorts", "green", "pinkshorts", "joggers", "purple"]
};

// AC 3: every hat (but "None"), jacket and pair of pants has a WARDROBE_ART entry whose sprite exists
test("every wardrobe item has a picture @fast", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe();
    return { W, art: b.WARDROBE_ART, names: b.ART_NAMES };
  });
  const missing = [];
  for (const sl of ["hat", "jacket", "pants"]) for (const it of r.W[sl]) {
    if (sl === "hat" && it.id === "none") continue;
    const name = r.art[sl][it.id];
    if (!name) missing.push(`${sl} ${it.id}: no WARDROBE_ART entry`);
    else if (!r.names.includes(name) || !fs.existsSync(path.join(__dirname, "..", "assets", name + ".webp"))) missing.push(`${sl} ${it.id}: sprite ${name} missing`);
  }
  expect(missing).toEqual([]);
  // the spec's mapping of the 15 new pictures
  const want = { hat: { headband: "hat_ninja" },
    jacket: { tshirt: "jacket_tshirt", stripes: "jacket_orange_stripes", purple: "jacket_purple_zip", pinkhoodie: "jacket_pink_hoodie", cape: "jacket_hero_cape",
      ninja: "jacket_ninja", sailor: "jacket_sailor", raincoat: "jacket_raincoat", teal: "jacket_teal_zip" },
    pants: { black: "pants_black", red: "pants_red", green: "pants_green", pinkshorts: "pants_pink_shorts", purple: "pants_purple" } };
  for (const sl of Object.keys(want)) expect(r.art[sl]).toMatchObject(want[sl]);
  for (const [sl, id, pic] of NEW) expect(r.art[sl][id], `${sl} ${id}`).toBe(pic);
});

// AC 4: appended (old indexes keep their meaning), tier prices, names in every language
test("seven new clothes are appended with their tier prices and names in every language @fast", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe();
    return { W, tiers: b.WARDROBE_TIERS, names: b.wardrobeNames() };
  });
  const soft = softly();
  for (const sl of ["hat", "jacket", "pants"]) soft(r.W[sl].slice(0, OLD[sl].length).map(q => q.id), `${sl}: the old items keep their indexes`).toEqual(OLD[sl]);
  soft(r.W.jacket.slice(OLD.jacket.length).map(q => q.id), "new jackets at the end").toEqual(NEW.filter(q => q[0] === "jacket").map(q => q[1]));
  soft(r.W.pants.slice(OLD.pants.length).map(q => q.id), "new pants at the end").toEqual(NEW.filter(q => q[0] === "pants").map(q => q[1]));
  soft(r.W.hat.length, "no new hats").toBe(OLD.hat.length);
  soft(r.tiers, "WARDROBE_TIERS unchanged").toEqual([40, 80, 150]);
  for (const [sl, id, , price, en, es, pt, ru] of NEW) {
    soft(r.W[sl].find(q => q.id === id)?.price, `${id} price`).toBe(price);
    soft(r.names[sl][id], `${id} names`).toEqual({ en, es, pt, ru });   // SPEC-028: + pt
  }
  soft.done();
});

// AC 4: a save from before SPEC-027 (indexes into the old lists, bought clothes by id) loads the same look
test("an old save wears the same clothes after the new ones are added", async ({ simPage: page }) => {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saves", "pre-spec-027.json"), "utf8"));
  const r = await page.evaluate(([outfits, prog]) => {
    const b = window.__bb, W = b.wardrobe(), o = b.loadOutfits(outfits), owned = b.loadProgress(prog).owned;
    const ids = pk => ({ hat: W.hat[o[pk].hat].id, jacket: W.jacket[o[pk].jacket].id, pants: W.pants[o[pk].pants].id });
    return { p1: ids("p1"), p2: ids("p2"), big: W.big[o.big].id, owned: JSON.parse(JSON.stringify(owned)) };
  }, [f.keys["bebebe-outfits"], f.keys["bebebe-progress"]]);
  expect(r).toEqual(f.expect);
});

// AC 6: bots pick by index modulo the list length, so the new clothes turn up on bots too
test("bots may wear the new clothes @fast", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe(), seen = { jacket: new Set(), pants: new Set() };
    for (let n = 1; n <= b.levelsPerWorld(); n++) {
      b.level = n;
      for (let i = 0; i < 4; i++) { const o = b.botOutfit(i); seen.jacket.add(W.jacket[o.jacket].id); seen.pants.add(W.pants[o.pants].id); }
    }
    b.level = 1;
    return { jacket: [...seen.jacket], pants: [...seen.pants] };
  });
  for (const [sl, id] of NEW) expect(r[sl], `a bot wears ${id} on some level`).toContain(id);
});

// AC 7: paging through a slot reaches every item (the new ones too); "Clothes: n / m" counts them
test("the wardrobe pages through the new clothes and the Progress count includes them @fast", async ({ simPage: page }) => {
  const r = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe(), pages = {};
    b.mode = "shop"; b.shopTab = "wardrobe";
    for (const sl of ["jacket", "pants"]) {
      pages[sl] = [];
      for (let i = 0; i < W[sl].length; i++) { b.cycleOutfit("p1", sl, 1); pages[sl].push(W[sl][b.outfits.shown.p1[sl]].id); }
    }
    b.resetOutfits(); b.mode = "home";
    const before = b.clothesCount();
    b.progress.owned.jackets.push("rainbow"); b.progress.owned.pants.push("overalls");
    const after = b.clothesCount();
    return { W, pages, before, after };
  });
  for (const sl of ["jacket", "pants"]) expect([...r.pages[sl]].sort()).toEqual(r.W[sl].map(q => q.id).sort());
  const all = r.W.hat.length + r.W.jacket.length + r.W.pants.length + r.W.big.length;
  expect(all).toBe(12 + 15 + 10 + 6);
  expect(r.before[1]).toBe(all);
  expect(r.after).toEqual([r.before[0] + 2, all]);
});
