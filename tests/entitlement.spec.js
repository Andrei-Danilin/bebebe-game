// SPEC-045: the "Full game" groundwork — the Park is free, one purchase opens the rest, switched off in the web beta (CFG.MONETIZATION.enforce false).
// - AC 1: src/client/entitlement.js (entitlement(), hasFull(), setEntitlement(value, source)) and the save field `entitlement: { value, source, at }`; old saves load as free.
// - AC 2: the switch — off: everyone has the Full game (source beta), nothing changes; on (these tests set it and restore it): the stored record decides.
// - AC 3: worldOpen's reason "purchase" (the core rules: tests/core/entitlement.test.mjs); the map tab and the Progress row show a gift (not a padlock) and open the card.
// - AC 4: the online seam (hello's `entitlement`, hosting needs hasFull, joining never does). AC 5: the child's card and the grown-ups section behind the gate.
// - AC 6: ?full=0|1 (debug) and __bb.entitlement.
const { test, expect } = require("./pw");
const { openGame, reloadGame, storedSave, putOldSave, softly } = require("./helpers");

const WON = "Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]))";
const enforce = (page, on = true) => page.evaluate(v => { window.__bb.CFG.MONETIZATION.enforce = v; }, on);
const parkDone = page => page.evaluate(src => { const w = new Function("return " + src)(); window.__bb.setProgress({ worlds: { park: { unlocked: 20, won: w } } }); }, WON);
const reasons = page => page.evaluate(() => Object.fromEntries(window.__bb.WORLDS.map(w => [w, window.__bb.worldOpen(w)])));
const ent = page => page.evaluate(() => window.__bb.entitlement.info);
// a stored save edited by a function body (as switches.spec.js does) and loaded again
async function putSave(page, body) {
  await page.evaluate(f => { window.__bb.save.flush(); const s = JSON.parse(localStorage.getItem("bebebe-save")); new Function("s", f)(s); localStorage.setItem("bebebe-save", JSON.stringify(s)); }, body);
  await reloadGame(page);
}
const answer = page => page.evaluate(() => {
  const g = window.__bb.grownUps.gate, want = g.a * g.b;
  [...document.querySelectorAll("#gate button[data-act=answer]")].find(b => Number(b.textContent) === want).click();
});
const cardInfo = page => page.evaluate(() => {
  const el = document.getElementById("fullgame");
  if (!el) return null;
  const r = el.firstElementChild.getBoundingClientRect();
  return { text: el.textContent, buttons: [...el.querySelectorAll("button")].map(b => ({ act: b.dataset.act, text: b.textContent, disabled: b.disabled })), worlds: [...el.querySelectorAll("[data-world]")].map(i => i.dataset.world),
    box: { x: r.x, y: r.y, w: r.width, h: r.height }, win: { w: innerWidth, h: innerHeight } };
});

test("enforce off (the web beta): everyone has the Full game, nothing is locked, nothing is stored", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  expect(await page.evaluate(() => window.__bb.CFG.MONETIZATION)).toEqual({ enforce: false, freeWorlds: ["park"], product: "full_game", debugParam: true });
  expect(await ent(page)).toEqual({ value: "full", source: "beta", at: null });
  expect(await page.evaluate(() => [window.__bb.entitlement.value, window.__bb.entitlement.hasFull()])).toEqual(["full", true]);
  await parkDone(page);
  const r = await reasons(page);
  expect(r.park).toEqual({ open: true, reason: "start" });
  expect(r.field, "the Field opens as before").toEqual({ open: true, reason: "previous" });
  expect(r.city.reason).toBe("locked");
  await page.evaluate(() => window.__bb.save.flush());
  expect((await storedSave(page)).entitlement, "the beta's access is never written").toBeUndefined();
  expect(errors).toEqual([]);
});

test("enforce on, free: the Park is open, the Field is locked by purchase after Park 20; buying opens it and everything earned", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  try {
    await enforce(page);
    expect(await ent(page), "no record: free").toEqual({ value: "free", source: null, at: null });
    await parkDone(page);
    await page.evaluate(() => { const b = window.__bb; b.progress.worlds.city.unlocked = 3; b.progress.worlds.city.won = { 1: true, 2: true }; b.progress.coins = 77; });
    const r = await reasons(page);
    expect(r.park.open).toBe(true);
    expect(r.field).toMatchObject({ open: false, reason: "purchase" });
    expect(r.city, "even a world with progress").toMatchObject({ open: false, reason: "purchase" });
    for (const w of ["school", "beach", "winter"]) expect(r[w].reason, w).toBe("purchase");
    expect(await page.evaluate(() => { const b = window.__bb; b.mode = "map"; b.selectWorld("field"); return b.world; }), "a locked world cannot be chosen").toBe("park");
    // buying (the test source): what was earned opens
    expect(await page.evaluate(() => window.__bb.entitlement.set("full", "test"))).toBe(true);
    expect(await ent(page)).toMatchObject({ value: "full", source: "test" });
    const after = await reasons(page);
    expect(after.field).toEqual({ open: true, reason: "previous" });
    expect(after.city, "the City with its progress").toEqual({ open: true, reason: "played" });
    expect(await page.evaluate(() => { const b = window.__bb; return [b.progress.worlds.city.unlocked, b.progress.coins]; })).toEqual([3, 77]);
    const stored = (await storedSave(page)).entitlement;
    expect(stored).toMatchObject({ value: "full", source: "test" });
    expect(Number.isFinite(stored.at)).toBe(true);
    // a bad value or source is refused
    expect(await page.evaluate(() => [window.__bb.entitlement.set("gold", "test"), window.__bb.entitlement.set("full", "beta"), window.__bb.entitlement.set("full", "x")])).toEqual([false, false, false]);
  } finally { await enforce(page, false); }
  expect((await reasons(page)).field.open, "switched off again: open").toBe(true);
  expect(errors).toEqual([]);
});

test("the stored record survives a reload; old saves, junk and newer fields load as designed", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  try {
    await enforce(page);
    await page.evaluate(() => window.__bb.entitlement.set("full", "store"));
    await reloadGame(page); await enforce(page);
    expect(await ent(page), "kept after a reload").toMatchObject({ value: "full", source: "store" });
    // a save without the field (every save before SPEC-045) → free
    await putSave(page, "delete s.entitlement;"); await enforce(page);
    expect(await ent(page)).toEqual({ value: "free", source: null, at: null });
    expect((await storedSave(page)).entitlement, "loading writes nothing new").toBeUndefined();
    // junk: a wrong value, a beta record, an unknown source, not an object → free
    for (const junk of [{ value: "gold", source: "store", at: 1 }, { value: "full", source: "beta", at: 1 }, { value: "full", source: "hacked", at: 1 }, 7, "full"]) {
      await putSave(page, `s.entitlement = ${JSON.stringify(junk)};`); await enforce(page);
      expect((await ent(page)).value, JSON.stringify(junk)).toBe("free");
    }
    // a later version's fields inside the record stay when this version writes it
    await putSave(page, "s.entitlement = { value: 'full', source: 'store', at: 5, receipt: 'abc', future: { n: 1 } };"); await enforce(page);
    expect(await ent(page)).toEqual({ value: "full", source: "store", at: 5 });
    await page.evaluate(() => window.__bb.entitlement.set("free", "store"));
    expect((await storedSave(page)).entitlement).toMatchObject({ value: "free", source: "store", receipt: "abc", future: { n: 1 } });
  } finally { await enforce(page, false); }
  expect(errors).toEqual([]);
});

test("an old-keys save loads as free; the parents' code never carries a purchase", async ({ page }) => {
  await openGame(page, { sim: true });
  const p = JSON.stringify({ worlds: { park: { unlocked: 20, stars: { 1: 3 }, won: { 1: true } } }, coins: 5 });
  await putOldSave(page, { "bebebe-progress": p });
  await reloadGame(page);
  try {
    await enforce(page);
    expect(await ent(page)).toEqual({ value: "free", source: null, at: null });
    await page.evaluate(() => window.__bb.entitlement.set("full", "test"));
    const code = await page.evaluate(() => window.__bb.save.code());
    const json = await page.evaluate(c => atob(c.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), code);
    expect(JSON.parse(json).entitlement, "a code on another device must not hand out a purchase").toBeUndefined();
    expect((await storedSave(page)).entitlement, "this device keeps its own").toMatchObject({ value: "full", source: "test" });
  } finally { await enforce(page, false); }
});

test("the online seam: hello carries the entitlement, hosting needs the Full game, joining never does", async ({ page }) => {
  await openGame(page, { sim: true });
  const seam = () => page.evaluate(() => ({ hello: window.__bb.entitlement.hello, host: window.__bb.entitlement.canHost() }));
  expect(await seam(), "beta: everyone hosts").toEqual({ hello: { entitlement: "full" }, host: true });
  try {
    await enforce(page);
    expect(await seam()).toEqual({ hello: { entitlement: "free" }, host: false });
    await page.evaluate(() => window.__bb.entitlement.set("full", "test"));
    expect(await seam()).toEqual({ hello: { entitlement: "full" }, host: true });
  } finally { await enforce(page, false); }
});

test("?full=0 forces free (and enforces), ?full=1 forces full; a release build (debugParam off) ignores it", async ({ page }) => {
  await openGame(page, { sim: true, query: "?full=0" });
  expect(await ent(page)).toMatchObject({ value: "free", source: "test" });
  await parkDone(page);
  expect((await reasons(page)).field).toMatchObject({ open: false, reason: "purchase" });
  try {
    await page.evaluate(() => { window.__bb.CFG.MONETIZATION.debugParam = false; window.__bb.entitlement.init(); });
    expect(await ent(page), "ignored: the beta").toEqual({ value: "full", source: "beta", at: null });
  } finally { await page.evaluate(() => { window.__bb.CFG.MONETIZATION.debugParam = true; }); }
  await openGame(page, { sim: true, query: "?full=1" });
  try {
    await enforce(page);
    expect(await ent(page)).toMatchObject({ value: "full", source: "test" });
    expect((await reasons(page)).city.reason, "full: the normal rules").toBe("locked");
  } finally { await enforce(page, false); }
});

test("the map tab shows a gift, not a padlock, and tapping it opens the Full game card (no toast); the gate leads to the grown-ups section", async ({ page }) => {
  const errors = await openGame(page);
  try {
    await enforce(page);
    await parkDone(page);
    await page.evaluate(() => window.__bb.openMap());
    await page.waitForFunction(() => window.__bb.mapInfo && window.__bb.mapInfo.tabs.length === 6);
    const tabs = await page.evaluate(() => window.__bb.mapInfo.tabs.map(t => [t.world, t.locked, t.reason]));
    expect(tabs).toEqual([["park", false, undefined], ["field", true, "purchase"], ["city", true, "purchase"], ["school", true, "purchase"], ["beach", true, "purchase"], ["winter", true, "purchase"]].map(t => [t[0], t[1], t[2] ?? "start"]));
    expect(await page.evaluate(() => window.__bb.buttonRects.find(b => b.id === "maptab:field").text), "a gift on the tab").toBe("🎁");
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/map-tabs.png` });
    await page.evaluate(() => window.__bb.tapButton("maptab:field"));
    const c = await cardInfo(page);
    expect(c, "the card is open").toBeTruthy();
    expect(await page.evaluate(() => window.__bb.screenState.toast), "no toast").toBeFalsy();
    const soft = softly();
    soft(c.text.includes(await page.evaluate(() => window.__bb.I18N.en.moreWorlds)), "More worlds are waiting! Ask a grown-up.").toBe(true);
    soft(c.worlds, "the pictures of the worlds that wait").toEqual(["field", "city", "school", "beach", "winter"]);
    soft(c.buttons.map(b => b.act), "one way on (for grown-ups) and a close").toEqual(["forGrownUps", "close"]);
    soft(/[$€£]|\d/.test(c.text), "no price, no number").toBe(false);
    soft(c.buttons.every(b => !b.disabled), "buttons work").toBe(true);
    soft.done();
    // the gate, then the section
    await page.click("#fullgame [data-act=forGrownUps]");
    expect(await page.evaluate(() => [!!document.getElementById("fullgame"), !!document.getElementById("gate"), !!document.getElementById("grownups")]), "the card gave way to the gate").toEqual([false, true, false]);
    await answer(page);
    const s = await page.evaluate(() => {
      const el = document.getElementById("grownups"), I = window.__bb.I18N.en;
      return { text: el.textContent, buttons: [...el.querySelectorAll("button")].map(b => [b.dataset.act, b.disabled]), I: { opens: I.fullGameOpens, terms: I.fullGameTerms, soon: I.soonInApp, get: I.getFull, restore: I.restorePurchase } };
    });
    expect(s.buttons).toEqual([["getFull", true], ["restorePurchase", true], ["back", false]]);
    for (const t of [...s.I.opens, s.I.terms, s.I.soon, s.I.get, s.I.restore]) expect(s.text, t).toContain(t);
    expect(/[$€£]\s?\d|\d[.,]\d\d/.test(s.text), "no price in the section").toBe(false);
    await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector("#grownups [data-act=getFull]")).click());
    expect(await page.evaluate(() => !!document.getElementById("grownups")), "a disabled button does nothing").toBe(true);
    await page.click("#grownups [data-act=back]");
    expect(await page.evaluate(() => [...document.querySelectorAll("#grownups button")].map(b => b.dataset.act)), "back to the grown-ups page, which lists the section").toContain("fullGame");
  } finally { await enforce(page, false); }
  expect(errors).toEqual([]);
});

test("the Progress page shows a gift on each locked world and a tap opens the card; the ✕ and the system Back close it", async ({ page }) => {
  const errors = await openGame(page);
  try {
    await enforce(page);
    await parkDone(page);
    await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; });
    await page.waitForFunction(() => window.__bb.progressInfo);
    const info = await page.evaluate(() => ({ worlds: window.__bb.progressInfo.worlds.map(w => [w.world, w.open, w.reason]), hud: window.__bb.hudRects.map(h => h.id) }));
    expect(info.worlds.filter(w => w[0] !== "park").every(w => !w[1] && w[2] === "purchase")).toBe(true);
    expect(info.hud).toContain("progress:gift:field");
    expect(info.hud).not.toContain("progress:lock:field");
    await page.evaluate(() => window.__bb.tapButton("progress:world:city"));
    expect((await cardInfo(page))?.buttons.map(b => b.act)).toEqual(["forGrownUps", "close"]);
    await page.click("#fullgame [data-act=close]");
    expect(await page.evaluate(() => !!document.getElementById("fullgame"))).toBe(false);
    await page.evaluate(() => window.__bb.tapButton("progress:world:city"));
    await page.evaluate(() => history.back());   // the system Back (back.js) presses the card's ✕
    await page.waitForFunction(() => !document.getElementById("fullgame"), null, { timeout: 5000 });
  } finally { await enforce(page, false); }
  expect(errors).toEqual([]);
});

test("the card and the strings speak every language, with no price", async ({ page }) => {
  const errors = await openGame(page);
  try {
    await enforce(page);
    for (const l of ["en", "es", "pt", "ru"]) {
      await page.evaluate(lang => { window.__bb.setLang(lang); window.__bb.entitlement.openCard(); }, l);
      const r = await page.evaluate(() => { const I = window.__bb.I18N, l = window.__bb.lang, t = document.getElementById("fullgame").textContent; return { t, want: [I[l].fullGame, I[l].moreWorlds, I[l].forGrownUps] }; });
      for (const w of r.want) expect(r.t, `${l}: ${w}`).toContain(w);
      expect(/\d|[$€£]/.test(r.t), l).toBe(false);
      await page.click("#fullgame [data-act=close]");
    }
    const same = await page.evaluate(() => {
      const I = window.__bb.I18N, keys = ["moreWorlds", "fullGame", "fullGameOpens", "fullGameTerms", "fullGameFriends", "fullGameOwned", "getFull", "restorePurchase", "soonInApp"];
      return keys.filter(k => ["es", "pt", "ru"].some(l => !I[l][k] || JSON.stringify(I[l][k]) === JSON.stringify(I.en[k])));
    });
    expect(same, "every new string is written in every language").toEqual([]);
  } finally { await enforce(page, false); }
  expect(errors).toEqual([]);
});

// the card and the section fit the phone (667×375) and a small one (568×320), also with CI's wider font (PW_FONT=ci)
for (const [w, h] of [[667, 375], [568, 320]]) {
  test(`the Full game card and section fit ${w}×${h}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await openGame(page, { query: "?phone=1" });
    try {
      await enforce(page);
      for (const l of ["en", "es", "pt", "ru"]) {
        await page.evaluate(lang => { window.__bb.setLang(lang); window.__bb.entitlement.openCard(); }, l);
        await page.waitForFunction(() => [...document.querySelectorAll("#fullgame img")].every(i => i.complete) || !document.querySelector("#fullgame img"), null, { timeout: 10000 });
        const c = await cardInfo(page);
        const soft = softly();
        soft(c.box.y >= 0 && c.box.y + c.box.h <= c.win.h, `${l} card inside the height`).toBe(true);
        soft(c.box.x >= 0 && c.box.x + c.box.w <= c.win.w, `${l} card inside the width`).toBe(true);
        if (process.env.SHOTS && l === "en") await page.screenshot({ path: `${process.env.SHOTS}/card-${w}x${h}.png` });
        await page.click("#fullgame [data-act=forGrownUps]");
        await answer(page);
        const g = await page.evaluate(() => {
          const box = /** @type {HTMLElement} */ (document.getElementById("grownups").firstElementChild), r = box.getBoundingClientRect();
          const reach = [...box.querySelectorAll("button")].every(b => { b.scrollIntoView({ block: "nearest" }); const q = b.getBoundingClientRect(), p = box.getBoundingClientRect(); return q.top >= p.top - 1 && q.bottom <= p.bottom + 1; });
          return { reach, scroll: box.scrollHeight - box.clientHeight, r: { x: r.x, y: r.y, w: r.width, h: r.height }, win: [innerWidth, innerHeight], out: [...box.querySelectorAll("button")].filter(b => { const q = b.getBoundingClientRect(); return q.left < 0 || q.right > innerWidth; }).map(b => b.dataset.act) };
        });
        soft(g.r.x >= 0 && g.r.x + g.r.w <= g.win[0], `${l} section inside the width`).toBe(true);
        if (h >= 375) soft(g.scroll <= 1, `${l} section needs no scrolling (${g.scroll}px more)`).toBe(true);   // (a smaller screen scrolls the page, like the grown-ups page itself)
        soft(g.reach, `${l} every button can be scrolled into view`).toBe(true);
        soft(g.out, `${l} buttons inside the width`).toEqual([]);
        if (process.env.SHOTS && l === "en") await page.screenshot({ path: `${process.env.SHOTS}/section-${w}x${h}.png` });
        soft.done();
        await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector("#grownups [data-act=back]")).click());
        await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector("#grownups [data-act=close]")).click());
      }
    } finally { await enforce(page, false); await ctx.close(); }
    expect(errors).toEqual([]);
  });
}

// the Progress page with the gift rows: the "More worlds are waiting" line replaces the progress hints, everything inside the screen (desktop and phone, ×1.15 text for CI's font)
for (const [name, ctxOpts, query] of [["667×375", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }, "?phone=1"], ["960×640", { viewport: { width: 960, height: 640 } }, ""]]) {
  test(`the Progress page with gift rows fits ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage();
    const errors = await openGame(page, { query });
    try {
      await enforce(page);
      const fails = [];
      for (const l of ["en", "es", "pt", "ru"]) {
        await page.evaluate(([lang, src]) => {
          const b = window.__bb; b.setLang(lang); b.CFG.TEXT_TEST_SCALE = 1.15;
          b.setProgress({ worlds: { park: { unlocked: 20, won: new Function("return " + src)() } } }); b.mode = "shop"; b.shopTab = "progress";
        }, [l, WON]);
        await page.waitForFunction(() => window.__bb.progressInfo);
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const d = await page.evaluate(() => { const b = window.__bb; return { hud: b.hudRects, ui: b.uiSize, over: b.textOverflows, text: b.I18N[b.lang].moreWorlds, info: b.progressInfo.worlds.map(w => w.reason) }; });
        const lock = d.hud.find(h => h.id === "progress:lockText");
        if (!lock) fails.push(`${l}: no gift line`); else if (lock.rows ? lock.rows.join(" ") !== d.text : false) fails.push(`${l}: gift line "${lock.rows && lock.rows.join(" ")}"`);
        if (d.info.filter(r => r === "purchase").length !== 5) fails.push(`${l}: reasons ${d.info}`);
        for (const h of d.hud) if (h.x < -0.01 || h.y < -0.01 || h.x + h.w > d.ui.w + 0.01 || h.y + h.h > d.ui.h + 0.01) fails.push(`${l}: ${h.id} outside`);
        if (d.over.length) fails.push(`${l}: text overflows ${JSON.stringify(d.over).slice(0, 120)}`);
        if (process.env.SHOTS && l === "en") await page.screenshot({ path: `${process.env.SHOTS}/progress-${name.replace("×", "x")}.png` });
      }
      expect(fails).toEqual([]);
    } finally { await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1; }); await enforce(page, false); await ctx.close(); }
    expect(errors).toEqual([]);
  });
}
