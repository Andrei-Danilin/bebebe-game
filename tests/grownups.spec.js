// SPEC-025 phase 2: the "For grown-ups" page and the reset.
// - AC 6: one parentGate(onPass) guards every adult-only action — a multiplication in words, CFG.GATE_ANSWERS answers, a new
//   question after a wrong answer; the page is reached from How to play.
// - AC 6b: "Reset progress" never from one gesture (resetCancel on the armed button, a separate resetConfirm elsewhere that ignores
//   taps for CFG.RESET_CONFIRM_DELAY s); bebebe-save-before-reset and undo; the migration record survives a reset; erase all data.
//   SPEC-033 AC 10: the reset button lives on the grown-ups page (behind the gate), next to undo — no longer on the Progress page.
// - AC 6c: the parents' code — base64url(JSON) + checksum with version; import through the normal schema, importConfirm, a snapshot
//   first; codeBad / codeTooNew; copy to the clipboard with a selectable-text fallback.
// - AC 4: restoring an older copy (the session copy) from the page.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, reloadGame, frames, storedSave, putOldSave } = require("./helpers");

const SRC = path.join(__dirname, "..", "src", "client", "ui", "grownups.js");
// the gate open: answer it right (or with a wrong number)
const answer = (page, right = true) => page.evaluate(ok => {
  const g = window.__bb.grownUps.gate, want = g.a * g.b;
  [...document.querySelectorAll("#gate button[data-act=answer]")].find(b => (Number(b.textContent) === want) === ok).click();
}, right);
const openPage = async page => { await page.evaluate(() => { window.__bb.mode = "story"; window.__bb.grownUps.open(); }); await answer(page); };
const pageAct = (page, act) => page.click(`#grownups [data-act="${act}"]`);
const bebebeKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("bebebe-")).sort());
// a click on a canvas button of this frame (its centre), as a finger would
async function clickButton(page, id) {
  const at = await page.evaluate(k => {
    const q = window.__bb.buttonRects.find(r => r.id === k), c = document.getElementById("game").getBoundingClientRect(), u = window.__bb.uiSize;
    return q && { x: c.left + (q.x + q.w / 2) * c.width / u.w, y: c.top + (q.y + q.h / 2) * c.height / u.h };
  }, id);
  if (!at) throw new Error("no button " + id);
  await page.mouse.click(at.x, at.y);
}

// ---------- AC 6: the gate ----------
test("the gate: a multiplication in words, four answers; wrong → a new question; right → the page", async ({ page }) => {
  const errors = await openGame(page, { lang: "es" });
  await page.evaluate(() => { window.__bb.mode = "story"; window.__bb.grownUps.open(); });
  const g1 = await page.evaluate(() => ({ g: window.__bb.grownUps.gate, text: document.querySelector("#gate").textContent, n: document.querySelectorAll("#gate button[data-act=answer]").length, C: [window.__bb.CFG.GATE_MIN, window.__bb.CFG.GATE_MAX, window.__bb.CFG.GATE_ANSWERS], words: window.__bb.I18N.es.numberWords }));
  expect(g1.C).toEqual([3, 9, 4]);
  expect(g1.n).toBe(4);
  expect(g1.g.answers).toContain(g1.g.a * g1.g.b);
  expect(new Set(g1.g.answers).size, "four different answers").toBe(4);
  expect(g1.text).toContain(`Para adultos: ¿cuánto es ${g1.words[g1.g.a - 3]} por ${g1.words[g1.g.b - 3]}?`);
  expect(await page.evaluate(() => !!document.getElementById("grownups")), "no page before the answer").toBe(false);
  // the wait after a wrong answer is short here (the guessing test has the real 3 s); restored below
  const wait0 = await page.evaluate(() => { const w = window.__bb.CFG.GATE_WRONG_WAIT; window.__bb.CFG.GATE_WRONG_WAIT = 0.05; return w; });
  await answer(page, false);
  const g2 = await page.evaluate(() => ({ g: window.__bb.grownUps.gate, text: document.querySelector("#gate").textContent }));
  expect(g2.text, "the wrong-answer note").toContain("No es así. Probá con esta otra");
  expect(g2.g, "a new question object").not.toBe(null);
  expect(await page.evaluate(() => !!document.getElementById("grownups"))).toBe(false);
  await page.waitForFunction(() => [...document.querySelectorAll("#gate button[data-act=answer]")].every(b => !b.disabled));
  await page.evaluate(w => { window.__bb.CFG.GATE_WRONG_WAIT = w; }, wait0);
  await answer(page, true);
  expect(await page.evaluate(() => [!!document.getElementById("grownups"), window.__bb.grownUps.gate])).toEqual([true, null]);
  // SPEC-025 AC 12: the page shows the game version (package.json = the game-version meta of index.html) with the module set's hash
  const pkgVersion = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "package.json"), "utf8")).version;
  const srcHash = await page.evaluate(() => document.querySelector("meta[name=src-hash]").content);
  expect(await page.evaluate(() => document.querySelector("#grownups").textContent)).toContain(`Versión: ${pkgVersion}+${srcHash}`);
  // ✕ closes a gate without opening anything
  await page.click("#grownups [data-act=close]");
  await page.evaluate(() => { window.__bb.grownUps.open(); });
  await page.click("#gate [data-act=close]");
  expect(await page.evaluate(() => [!!document.getElementById("gate"), !!document.getElementById("grownups")])).toEqual([false, false]);
  expect(errors).toEqual([]);
});

test("How to play has the For grown-ups button; it opens the gate", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.openStory("began", "home"); });
  await frames(page);
  await page.evaluate(() => window.__bb.tapButton("story:rules"));
  await frames(page);
  expect(await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "story:grownups")?.text)).toBe("For grown-ups");
  await clickButton(page, "story:grownups");
  expect(await page.evaluate(() => !!window.__bb.grownUps.gate)).toBe(true);
  expect(errors).toEqual([]);
});

// SPEC-047 AC 9: the Music and Sounds switches are not an adult action — a child may touch them on this page as on the home screen
const SWITCHES = ["music", "sounds"];
test("every adult action calls the gate", { tag: "@fast" }, () => {
  const src = fs.readFileSync(SRC, "utf8");
  const body = src.slice(src.indexOf("function showPage("), src.indexOf("function closePage("));
  // every button of the page but OK is made by act(…), which runs its action through parentGate
  const made = [...[...body.matchAll(/\bact\([^,]+, "(\w+)"/g)].map(m => ["act", m[1]]), ...[...body.matchAll(/\bbutton\(row, [^,]+, [^,]+, "(\w+)"\)/g)].map(m => ["button", m[1]])];
  expect(made.filter(([how, name]) => how !== "act" && name !== "close" && !SWITCHES.includes(name)), "page actions not behind the gate").toEqual([]);
  expect(made.map(([, n]) => n).sort()).toEqual(["close", "copyCode", "errorLog", "music", "pasteCode", "quality", "resetProgress", "restoreCopy", "sounds", "undoReset"].sort());   // SPEC-047: + the two switches   // SPEC-040: + quality   // SPEC-033: + resetProgress
  // review fix: erasing everything asks the gate again even with the page open (askGate, not the page's pass)
  expect(body).toMatch(/button\(\s*row,\s*L\(\)\.eraseAll,[^\n]*\baskGate\(\s*confirmErase\b[^\n]*"eraseAll"\s*\)/);
  expect(body).toMatch(/const act = \(label, name, fn\) => button\(row, label, \(\) => parentGate\(fn\), name\);/);
  expect(src, "the page itself is behind the gate").toMatch(/export function openGrownUps\(\) \{ parentGate\(showPage\); \}/);
  expect(src, "no long-press or tap-count gate").not.toMatch(/pointerdown[^\n]*setTimeout|longPress|tapCount/);
});

// ---------- AC 6b: the reset ----------
test("reset: two taps 50 ms apart change nothing; the confirm works after the delay (grown-ups page, SPEC-033 AC 10)", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 345; b.progress.worlds.park.unlocked = 5; Object.assign(b.progress.inv, { kisses: 4 }); b.progress.upgrades.fastFeet = 2; b.mode = "story"; });
  const state = () => page.evaluate(() => [window.__bb.progress.coins, window.__bb.progress.worlds.park.unlocked]);
  const acts = () => page.evaluate(() => [...document.querySelectorAll("#grownups button")].map(b => b.dataset.act));
  // the shipped delay; the delay is wall clock (progress.js resetConfirmReady): the taps "within the delay" run with a long one,
  // and the real reset below with the shipped one again
  expect(await page.evaluate(() => window.__bb.CFG.RESET_CONFIRM_DELAY)).toBe(0.8);
  await page.evaluate(() => { window.__bb.CFG.RESET_CONFIRM_DELAY = 60; });
  await openPage(page);
  expect(await acts(), "Reset progress is on the grown-ups page").toContain("resetProgress");
  // a double tap: the reset button, then 50 ms later where the confirm appears (another view of the page)
  await pageAct(page, "resetProgress");
  expect(await acts(), "the confirm is elsewhere: Yes, erase everything / No, keep it").toEqual(["resetYes", "resetNo"]);
  await page.waitForTimeout(50);
  await pageAct(page, "resetYes");
  expect(await state(), "a tap on the confirm within the delay").toEqual([345, 5]);
  expect(await acts(), "still asking").toEqual(["resetYes", "resetNo"]);
  // No, keep it: back to the page, nothing reset, the next arming starts the delay again
  await pageAct(page, "resetNo");
  expect(await acts()).toContain("resetProgress");
  expect(await state()).toEqual([345, 5]);
  // the real reset: arm, then the confirm after CFG.RESET_CONFIRM_DELAY
  await page.evaluate(() => { window.__bb.CFG.RESET_CONFIRM_DELAY = 0.8; });
  await pageAct(page, "resetProgress");
  await page.waitForTimeout(850);
  await pageAct(page, "resetYes");
  await page.waitForFunction(() => window.__bb.progress.coins === 0);
  expect(await state()).toEqual([0, 1]);
  expect(await page.evaluate(() => { const b = window.__bb; return [b.progress.inv, b.progress.upgrades]; }), "fresh bag and upgrades").toEqual([{ mittens: 0, mega: 0, kisses: 0, rescues: 0 }, { fastFeet: 0, longItems: 0, quickHelp: 0 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-save-before-reset")).save.progress.coins), "the save before the reset").toBe(345);
  // back on the page, with the undo right next to Reset progress
  await page.waitForFunction(() => [...document.querySelectorAll("#grownups button")].some(b => b.dataset.act === "undoReset"));
  const a = await acts();
  expect(a.indexOf("undoReset"), "undo right after reset").toBe(a.indexOf("resetProgress") + 1);
  await pageAct(page, "undoReset");
  await page.waitForFunction(() => window.__bb.progress.coins === 345);
  expect(await state(), "undo brings the progress back").toEqual([345, 5]);
  expect(errors).toEqual([]);
});

// SPEC-033 AC 13 (back.js): a system Back on the reset question presses "No, keep it" — disarmed, the grown-ups page stays; a confirm
// tapped after something disarmed it under the view asks again (the delay starts over) instead of resetting
test("reset: a system Back on the question = No, keep it; a disarmed confirm asks again", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 345; b.mode = "story"; });
  const acts = () => page.evaluate(() => [...document.querySelectorAll("#grownups button")].map(b => b.dataset.act));
  const armed = () => page.evaluate(async () => (await import("./src/client/state.js")).ui.resetArmed);   // the game's own instance (import map)
  const delay0 = await page.evaluate(() => window.__bb.CFG.RESET_CONFIRM_DELAY);
  await page.evaluate(() => { window.__bb.CFG.RESET_CONFIRM_DELAY = 60; });
  await openPage(page);
  await pageAct(page, "resetProgress");
  expect([await acts(), await armed()]).toEqual([["resetYes", "resetNo"], true]);
  await page.evaluate(() => { window.dispatchEvent(new PopStateEvent("popstate")); });   // the system Back
  expect([await acts(), await armed(), await page.evaluate(() => window.__bb.progress.coins)], "back on the grown-ups page, disarmed, nothing reset").toEqual([expect.arrayContaining(["resetProgress"]), false, 345]);
  expect(await page.evaluate(() => [!!document.getElementById("grownups"), !!document.getElementById("leave")]), "the page stays; no Leave dialog").toEqual([true, false]);
  // disarmed under the open question (a screen change): the confirm asks again and re-arms, faded for the delay
  await pageAct(page, "resetProgress");
  await page.evaluate(() => { window.__bb.shopTab = "items"; });
  expect(await armed(), "disarmed under the view").toBe(false);
  await pageAct(page, "resetYes");
  expect([await acts(), await armed(), await page.evaluate(() => window.__bb.progress.coins)], "asked again, armed again, nothing reset").toEqual([["resetYes", "resetNo"], true, 345]);
  expect(await page.evaluate(() => document.querySelector("#grownups [data-act=resetYes]").style.opacity), "the delay starts over").toBe("0.5");
  await page.evaluate(() => { window.__bb.CFG.RESET_CONFIRM_DELAY = 0; });
  await pageAct(page, "resetYes");
  await page.waitForFunction(() => window.__bb.progress.coins === 0);
  await page.evaluate(d => { window.__bb.CFG.RESET_CONFIRM_DELAY = d; }, delay0);
  expect(errors).toEqual([]);
});

test("reset, play a level, undo: the old progress is back; the armed texts sure / sureShort are retired", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 120; b.progress.worlds.park.unlocked = 7; b.progress.worlds.park.won = { 1: true, 6: true }; b.save.queue(); });
  await page.evaluate(() => { window.__bb.resetProgress(); });
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); b.giveReward(true); b.mode = "story"; });
  await openPage(page);
  await pageAct(page, "undoReset");
  await page.waitForFunction(() => window.__bb.progress.coins === 120);
  expect(await page.evaluate(() => [window.__bb.progress.worlds.park.unlocked, window.__bb.level, window.__bb.save.info.copies.reset])).toEqual([7, 7, false]);
  expect(await page.evaluate(() => [...document.querySelectorAll("#grownups button")].map(b => b.dataset.act)), "undo offered only while the copy exists").not.toContain("undoReset");
  expect(await page.evaluate(() => window.__bb.LANGS.filter(l => "sure" in window.__bb.I18N[l] || "sureShort" in window.__bb.I18N[l]))).toEqual([]);
  expect(errors).toEqual([]);
});

test("reset, reload: still reset although bebebe-progress still holds the old progress (the migration record stays)", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  await putOldSave(page, { "bebebe-progress": { coins: 70, worlds: { park: { unlocked: 9, won: { 1: true } } } } });
  await reloadGame(page);
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(70);
  await page.evaluate(() => { window.__bb.resetProgress(); });
  await reloadGame(page);
  expect(await page.evaluate(() => [window.__bb.progress.coins, window.__bb.progress.worlds.park.unlocked, localStorage.getItem("bebebe-progress") !== null])).toEqual([0, 1, true]);
  expect(Object.keys((await storedSave(page)).migrated).length, "the migration record survives the reset").toBe(4);
  expect(errors).toEqual([]);
});

test("erase all data: every bebebe-* key goes, the old keys too; the game starts as on a new device", async ({ page }) => {
  const errors = await openGame(page, { intro: true });
  await page.waitForFunction(() => window.__bb.mode === "scene", null, { timeout: 30_000 });
  await page.evaluate(() => { window.__bb.sceneSkip(); });
  await putOldSave(page, { "bebebe-progress": { coins: 70 }, "bebebe-names": { p1: "Ana" }, "bebebe-place": "x", "bebebe-skins": "y" });
  await reloadGame(page);
  await page.evaluate(() => { localStorage.setItem("bebebe-future-key", "z"); window.__bb.reportError(new Error("test: for the log")); });
  await page.evaluate(() => { document.getElementById("oops")?.querySelector("button")?.click(); });
  expect((await bebebeKeys(page)).length).toBeGreaterThan(5);
  await openPage(page);
  await pageAct(page, "eraseAll");
  await answer(page);                                               // review fix: erase all asks the gate again
  await Promise.all([page.waitForEvent("load"), pageAct(page, "eraseYes")]);
  await page.waitForFunction(() => window.__bbReady === true);
  // a new device again: SPEC-032's language screen first (English highlighted, Enter picks it), then the first-run comic
  await page.waitForFunction(() => window.__bb.mode === "lang", null, { timeout: 30_000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__bb.mode === "scene", null, { timeout: 30_000 });   // the first-run comic again
  const r = await page.evaluate(() => ({ coins: window.__bb.progress.coins, intro: window.__bb.progress.seen.intro, name: window.__bb.names.p1,
    keys: Object.keys(localStorage).filter(k => k.startsWith("bebebe-") && k !== "bebebe-save-backup").sort() }));   // the new game's own save (and its backup)
  expect(r).toEqual({ coins: 0, intro: false, name: "Player 1", keys: ["bebebe-save"] });
  expect(errors.filter(e => !e.includes("test: for the log"))).toEqual([]);
});

// ---------- AC 6c: the parents' code ----------
test("the code: copy → change → paste → confirm → the progress of the code; a snapshot first; the code carries the version", async ({ page }) => {
  await page.addInitScript(() => { navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 222; b.progress.worlds.park.unlocked = 6; b.setName("p1", "Lía"); b.save.queue(); });
  await openPage(page);
  await pageAct(page, "copyCode");
  await page.waitForSelector("#grownups [data-note=codeCopied]");
  const code = await page.evaluate(() => window.__copied);
  expect(await page.inputValue("#code-text"), "the selectable-text fallback holds the code").toBe(code);
  expect(code).toMatch(/^BB1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  const json = Buffer.from(code.split(".")[1], "base64url").toString("utf8");
  expect(JSON.parse(json).version, "the code carries version").toBe(1);
  expect(JSON.parse(json).migrated, "not this device's migration record").toBeUndefined();
  await pageAct(page, "back");
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 5; b.progress.worlds.park.unlocked = 1; b.setName("p1", ""); });
  await pageAct(page, "pasteCode");
  await page.fill("#code-text", "  " + code.slice(0, 40) + "\n" + code.slice(40) + "  ");   // pasted with spaces and a line break
  await pageAct(page, "importCode");
  expect(await page.textContent("#grownups")).toContain("Replace the progress on this device with the code?");
  await pageAct(page, "importYes");
  await page.waitForFunction(() => window.__bb.progress.coins === 222);
  expect(await page.evaluate(() => [window.__bb.progress.worlds.park.unlocked, window.__bb.names.p1, JSON.parse(localStorage.getItem("bebebe-save-before-import")).save.progress.coins])).toEqual([6, "Lía", 5]);
  expect(errors).toEqual([]);
});

test("the code: a broken one → codeBad, a newer one → codeTooNew, No keeps the progress, broken fields through the schema", async ({ page }) => {
  const errors = await openGame(page);
  const make = (page2, save) => page2.evaluate(s => {   // a code made the game's way from a save object
    const json = JSON.stringify(s), bin = [...new TextEncoder().encode(json)].map(c => String.fromCharCode(c)).join("");
    return `BB1.${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${window.__bb.save.fingerprint(json)}`;
  }, save);
  const good = await page.evaluate(() => window.__bb.save.code());
  const r = await page.evaluate(([g, n, f]) => { const rc = window.__bb.save.readCode; return [rc(g), rc(g.slice(0, -3) + "zzz"), rc(g.replace("BB1.", "BB1.x")), rc("hello"), rc(""), rc(n), rc(f)]; },
    [good, await make(page, { version: 2, progress: {} }), await make(page, { version: 1, progress: "x" })]);
  expect(r.map(q => q.error)).toEqual([null, "codeBad", "codeBad", "codeBad", "codeBad", "codeTooNew", "codeBad"]);
  await openPage(page);
  for (const [code, text] of [[good.slice(0, -2), "This code doesn't work. Check it and try again"], [await make(page, { version: 2, progress: {} }), "This code is from a newer version of the game"]]) {
    await pageAct(page, "pasteCode");
    await page.fill("#code-text", code);
    await pageAct(page, "importCode");
    expect(await page.textContent("#grownups")).toContain(text);
    await pageAct(page, "back");
  }
  // No: nothing changes
  await page.evaluate(() => { window.__bb.progress.coins = 9; });
  await pageAct(page, "pasteCode");
  await page.fill("#code-text", await make(page, { version: 1, progress: { coins: 50 } }));
  await pageAct(page, "importCode");
  await pageAct(page, "importNo");
  expect(await page.evaluate(() => window.__bb.progress.coins)).toBe(9);
  // AC 3d through a code: broken fields defaulted by the schema
  await pageAct(page, "pasteCode");
  await page.fill("#code-text", await make(page, { version: 1, progress: { coins: -4, inv: { mittens: 1e9, kisses: "x" }, equip: ["mega", "rocket"], owned: { hats: ["crown", 5] }, seen: "no" } }));
  await pageAct(page, "importCode");
  await pageAct(page, "importYes");
  const p = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bb.progress)));
  expect([p.coins, p.inv.mittens, p.inv.kisses, p.equip, p.owned.hats, p.seen.intro]).toEqual([0, 9999, 0, ["mega", "none"], ["crown"], false]);
  expect(errors).toEqual([]);
});

// ---------- AC 4 / AC 7: restore an older copy, the error log ----------
test("a valid save with all worlds reset by a bug: restored from the session copy on the grown-ups page", async ({ page }) => {
  const errors = await openGame(page);
  const good = { version: 1, progress: { coins: 300, worlds: { park: { unlocked: 12, stars: { 1: 3 }, won: { 1: true } } } }, lang: "en" };
  const bug = { version: 1, progress: { coins: 300 }, lang: "en" };
  await page.evaluate(([g, b]) => {
    localStorage.clear(); localStorage.setItem("bb-test-init", "1");
    localStorage.setItem("bebebe-save", JSON.stringify(b)); localStorage.setItem("bebebe-save-session", JSON.stringify({ at: Date.now(), save: g }));
  }, [good, bug]);
  await reloadGame(page);
  expect(await page.evaluate(() => window.__bb.progress.worlds.park.unlocked)).toBe(1);
  await openPage(page);
  await pageAct(page, "restoreCopy");
  await page.waitForSelector("#grownups [data-act='copy:session']");
  expect(await page.textContent("#grownups [data-act='copy:session']")).toMatch(/⭐ 3 · 🪙 300/);
  await page.click("#grownups [data-act='copy:session']");
  await page.waitForFunction(() => window.__bb.progress.worlds.park.unlocked === 12);
  expect(await page.evaluate(() => [window.__bb.level, (window.__bb.save.flush(), JSON.parse(localStorage.getItem("bebebe-save")).progress.worlds.park.unlocked)])).toEqual([12, 12]);
  expect(errors).toEqual([]);
});

test("the error log on the grown-ups page, with Copy", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.reportError(new Error("test: shown to grown-ups")); });
  await page.evaluate(() => { document.querySelector("#oops button").click(); });
  await openPage(page);
  await pageAct(page, "errorLog");
  expect(await page.inputValue("#code-text")).toContain("test: shown to grown-ups");
  expect(await page.textContent("#grownups [data-act=copyLog]")).toBe("Copy");
  expect(errors.filter(e => !e.includes("test: shown to grown-ups"))).toEqual([]);
});

// ---------- review fixes ----------
test("guessing never passes the gate: random taps after a wrong answer and pad A / Enter mashing never open the page", async ({ page }) => {
  const errors = await openGame(page);
  expect(await page.evaluate(() => window.__bb.CFG.GATE_WRONG_WAIT)).toBe(3);
  await page.evaluate(() => { window.__bb.mode = "story"; window.__bb.grownUps.open(); });
  await answer(page, false);                                          // one wrong answer: the new question ignores taps for 3 s
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {                                     // random answer buttons, as fast as a child taps
    await page.evaluate(() => { const bs = [...document.querySelectorAll("#gate button[data-act=answer]")]; if (bs.length) bs[Math.floor(Math.random() * bs.length)].click(); });
    await page.waitForTimeout(60);
  }
  expect(await page.evaluate(() => [!!document.getElementById("grownups"), !!document.getElementById("gate")]), "taps ignored after a wrong answer").toEqual([false, true]);
  expect(await page.textContent("#gate"), "the new question keeps the wrong-answer note").toContain("Not quite. Here is another one");
  // mashing Enter (and the pad's A presses the same highlighted button): the highlight is on ✕ — the gate closes, no page
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { window.__bb.grownUps.open(); });
    for (let k = 0; k < 6; k++) await page.keyboard.press("Enter");
    expect(await page.evaluate(() => [!!document.getElementById("grownups"), !!document.getElementById("gate")]), "Enter mashing").toEqual([false, false]);
  }
  await page.evaluate(() => { window.__pads = [{ index: 0, id: "pad", mapping: "standard", connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }]; navigator.getGamepads = () => window.__pads; window.__bb.grownUps.open(); });
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => { window.__pads[0].buttons[0].pressed = true; }); await frames(page);
    await page.evaluate(() => { window.__pads[0].buttons[0].pressed = false; }); await frames(page);
  }
  expect(await page.evaluate(() => [!!document.getElementById("grownups"), !!document.getElementById("gate")]), "pad A mashing").toEqual([false, false]);
  await page.evaluate(() => { delete navigator.getGamepads; window.__bb.resetPads(); });
  expect(errors).toEqual([]);
});

test("erase all asks the gate again with the page open; Enter on its confirm keeps the data", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { window.__bb.progress.coins = 66; window.__bb.save.queue(); });
  await openPage(page);
  await pageAct(page, "eraseAll");
  expect(await page.evaluate(() => [!!window.__bb.grownUps.gate, !!document.getElementById("grownups")]), "the gate again, the page closed").toEqual([true, false]);
  await page.click("#gate [data-act=close]");                         // ✕ goes back to the page
  expect(await page.evaluate(() => !!document.getElementById("grownups"))).toBe(true);
  await pageAct(page, "eraseAll");
  await answer(page);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.dataset.act), "the confirm starts on No").toBe("eraseNo");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [window.__bb.progress.coins, localStorage.getItem("bebebe-save") !== null, !!document.querySelector("#grownups [data-act=copyCode]")])).toEqual([66, true, true]);
  expect(errors).toEqual([]);
});

test("a second reset after a little play keeps the first undo snapshot; undo gives back the first progress", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb; b.progress.coins = 500; b.progress.worlds.park.unlocked = 9; b.progress.worlds.park.stars = { 1: 3, 2: 3, 3: 2 }; b.progress.worlds.park.won = { 1: true, 2: true, 3: true }; b.save.queue(); });
  await page.evaluate(() => window.__bb.resetProgress());
  await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); b.giveReward(true); b.mode = "home"; });
  // a later day: the same child resets again
  await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 3 * 86400000; window.__bb.resetProgress(); });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-save-before-reset")).save.progress.coins), "the first snapshot kept").toBe(500);
  await page.evaluate(() => { window.__bb.mode = "story"; });
  await openPage(page);
  await pageAct(page, "undoReset");
  await page.waitForFunction(() => window.__bb.progress.coins === 500);
  expect(await page.evaluate(() => window.__bb.progress.worlds.park.unlocked)).toBe(9);
  expect(errors).toEqual([]);
});

test("restoring a copy keeps the save before it as bebebe-save-before-restore, which the page restores back", async ({ page }) => {
  const errors = await openGame(page);
  const old = { version: 1, progress: { coins: 40, worlds: { park: { unlocked: 2, stars: { 1: 1 }, won: { 1: true } } } }, lang: "en" };
  await page.evaluate(o => { localStorage.setItem("bebebe-save-session", JSON.stringify({ at: Date.now(), save: o })); const b = window.__bb; b.progress.coins = 900; b.save.queue(); }, old);
  await page.evaluate(() => { window.__bb.mode = "story"; });
  await openPage(page);
  await pageAct(page, "restoreCopy");
  await page.click("#grownups [data-act='copy:session']");
  await page.waitForFunction(() => window.__bb.progress.coins === 40);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-save-before-restore")).save.progress.coins)).toBe(900);
  await pageAct(page, "restoreCopy");
  await page.click("#grownups [data-act='copy:restore']");
  await page.waitForFunction(() => window.__bb.progress.coins === 900);
  expect(errors).toEqual([]);
});

test("numberWords cover every gate factor in all four languages", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  const r = await page.evaluate(() => { const b = window.__bb, n = b.CFG.GATE_MAX - b.CFG.GATE_MIN + 1; return b.LANGS.map(l => [l, b.I18N[l].numberWords.length === n && b.I18N[l].numberWords.every(w => typeof w === "string" && w.length > 0)]); });
  expect(r).toEqual([["en", true], ["es", true], ["pt", true], ["ru", true]]);
});

test("two reset copies: a 60-star reset, play to 30 stars, reset again — both can be restored", async ({ page }) => {
  const errors = await openGame(page);
  const stars = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 3]));
  await page.evaluate(s => { const b = window.__bb, w = b.progress.worlds.park; w.unlocked = 20; w.stars = s; w.won = Object.fromEntries(Object.keys(s).map(k => [k, true])); b.save.queue(); }, stars(20));
  await page.evaluate(() => window.__bb.resetProgress());
  await page.waitForTimeout(100);
  await page.evaluate(s => { const b = window.__bb, w = b.progress.worlds.park; w.unlocked = 11; w.stars = s; w.won = Object.fromEntries(Object.keys(s).map(k => [k, true])); b.save.queue(); }, stars(10));
  await page.evaluate(() => window.__bb.resetProgress());
  await page.waitForTimeout(100);
  const starsOf = k => page.evaluate(n => Object.values(JSON.parse(localStorage.getItem(n)).save.progress.worlds.park.stars).reduce((a, b) => a + b, 0), k);
  expect([await starsOf("bebebe-save-before-reset"), await starsOf("bebebe-save-before-reset-2")], "undo = the bigger, -2 = this reset").toEqual([60, 30]);
  const parkStars = () => page.evaluate(() => Object.values(window.__bb.progress.worlds.park.stars).reduce((a, b) => a + b, 0));
  await page.evaluate(() => { window.__bb.mode = "story"; });
  await openPage(page);
  await pageAct(page, "restoreCopy");
  await page.waitForSelector("#grownups [data-act='copy:reset2']");
  await page.click("#grownups [data-act='copy:reset2']");
  await page.waitForFunction(() => window.__bb.progress.worlds.park.unlocked === 11);
  expect(await parkStars()).toBe(30);
  await pageAct(page, "restoreCopy");
  await page.click("#grownups [data-act='copy:reset']");
  await page.waitForFunction(() => window.__bb.progress.worlds.park.unlocked === 20);
  expect(await parkStars()).toBe(60);
  expect(errors).toEqual([]);
});

test("during the gate's wait, ←/→ and the highlight skip the disabled answers: Enter only closes", async ({ page }) => {
  const errors = await openGame(page);
  // the wait is wall clock: a long one, so slow (software-rendered) key presses all land inside it
  await page.evaluate(() => { window.__bb.CFG.GATE_WRONG_WAIT = 60; window.__bb.mode = "story"; window.__bb.grownUps.open(); });
  await answer(page, false);
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowRight", "ArrowLeft", "ArrowRight"]) {
    await page.keyboard.press(k);
    expect(await page.evaluate(() => { const h = document.querySelector("#gate button.hl"); return h && h.dataset.act; }), k).toBe("close");
  }
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => [!!document.getElementById("gate"), !!document.getElementById("grownups")])).toEqual([false, false]);
  await page.evaluate(() => { window.__bb.CFG.GATE_WRONG_WAIT = 3; });
  expect(errors).toEqual([]);
});
