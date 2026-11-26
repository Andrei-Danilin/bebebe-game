// Every text exists in all four languages (English is the reference). A new string must be added to en, es, pt and ru.
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames, softly, LANGS, ROOT } = require("./helpers");
const fs = require("fs");
const path = require("path");

// SPEC-028: the four languages, in the globe's order
test("the game speaks en, es, pt and ru, in this order", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  expect(LANGS).toEqual(["en", "es", "pt", "ru"]);
  expect(await page.evaluate(() => [window.__bb.LANGS, Object.keys(window.__bb.I18N)])).toEqual([LANGS, LANGS]);
});

test("es, pt and ru have every key that en has, with the same type and function shape", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });   // SPEC-023: texts only, nothing drawn
  const missing = await page.evaluate(langs => {
    const out = [], I = window.__bb.I18N;
    // SPEC-028 AC 3: a function has the same number of arguments and returns the same type (counts 0, 1, 2, 5, 21)
    const ret = (f, n) => { try { const v = f(n, n, n); return Array.isArray(v) ? "array" : typeof v; } catch (e) { return "throws"; } };
    const walk = (ref, other, lang, p) => {
      for (const k of Object.keys(ref)) {
        const a = ref[k], b = other ? other[k] : undefined, key = p ? p + "." + k : k;
        if (b === undefined) { out.push(`${lang}: ${key} missing`); continue; }
        if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(`${lang}: ${key} type`); continue; }
        if (Array.isArray(a) && a.length !== b.length) out.push(`${lang}: ${key} length`);
        else if (typeof a === "function") {
          if (a.length !== b.length) out.push(`${lang}: ${key} takes ${b.length} arguments, en ${a.length}`);
          for (const n of [0, 1, 2, 5, 21]) if (ret(a, n) !== ret(b, n)) out.push(`${lang}: ${key}(${n}) returns ${ret(b, n)}, en ${ret(a, n)}`);
        } else if (typeof a === "string" && !b.trim()) out.push(`${lang}: ${key} empty`);
        else if (a && typeof a === "object" && !Array.isArray(a)) walk(a, b, lang, key);
      }
    };
    for (const lang of langs.slice(1)) walk(I.en, I[lang], lang, "");
    return out;
  }, LANGS);
  expect(missing).toEqual([]);
});

// SPEC-017: every story chapter has its text in every language; SPEC-028: captions, boss lines and bubbles too
test("every STORY text is in every language", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });   // SPEC-023: texts only, nothing drawn
  const bad = await page.evaluate(langs => {
    const out = [], str = (v, min = 10) => typeof v === "string" && v.trim().length > min;
    for (const c of window.__bb.STORY) for (const l of langs) {
      if (!str(c.text[l])) out.push(`${c.id}: text ${l}`);
      if (c.boss && !str(c.boss[l])) out.push(`${c.id}: boss ${l}`);
      if (c.captions && !(Array.isArray(c.captions[l]) && c.captions[l].length === c.captions.en.length && c.captions[l].every(s => str(s)))) out.push(`${c.id}: captions ${l}`);
      if (c.bubbles && !(Array.isArray(c.bubbles[l]) && c.bubbles[l].length === c.bubbles.en.length && c.bubbles[l].every(s => str(s, 2)))) out.push(`${c.id}: bubbles ${l}`);
    }
    return out;
  }, LANGS);
  expect(bad).toEqual([]);
  expect(await page.evaluate(() => window.__bb.STORY.length)).toBe(8);
  // the rules lines (the "How to play" page) and their icons: one icon per line in every language
  const n = await page.evaluate(langs => [window.__bb.RULE_ICONS.length, ...langs.map(l => window.__bb.I18N[l].rules(18).length)], LANGS);
  expect(n.slice(1)).toEqual(LANGS.map(() => n[0]));
});

// SPEC-028 AC 5: Dad's lines in the start comic and the thanks card in Portuguese; AC 4: the game words
test("Portuguese: the comic bubbles, the thanks card and the game words", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  const r = await page.evaluate(() => {
    const b = window.__bb, P = b.I18N.pt;
    return { bubbles: b.STORY[0].bubbles.pt, madeBy: P.madeBy, big: P.defaultBig, words: [P.character, P.progressTab, P.itemsTab, P.wardrobeTab, P.upgradesTab, P.kit, P.kisses, P.coinsWord],
      worlds: P.worlds, anger: P.anger, html: document.documentElement.lang };
  });
  expect(r.bubbles).toEqual(["Nossa, que bagunça!", "Ai, as crianças!", "Cadê meu cupcake?!", "Isso é impossível!!"]);   // AC 5; "simplesmente" did not fit the phone Story page
  expect(r.madeBy).toBe("Feito por Kostya e Papai");
  expect(r.big).toBe("Papai");
  expect(r.words).toEqual(["Personagem", "Progresso", "Itens", "Guarda-roupa", "Melhorias", "Kit de resgate", "Beijinhos", "moedas"]);
  expect(r.worlds).toEqual({ park: "Parque", field: "Campo de futebol", city: "Cidade", school: "Escola", beach: "Praia", winter: "Inverno" });
  expect(r.anger).toContain("Papai");
});

// SPEC-028 AC 5: the Portuguese story is written down in docs/story.md (its own section), as the game shows it
test("the Portuguese story texts are in docs/story.md", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  const md = fs.readFileSync(path.join(ROOT, "docs", "story.md"), "utf8");
  const texts = await page.evaluate(() => window.__bb.STORY.flatMap(c => [c.text.pt, ...(c.captions ? c.captions.pt : []), ...(c.bubbles ? c.bubbles.pt : []), ...(c.id === "school" ? [c.boss.pt] : [])]));
  expect(md).toContain("## Português (Brasil)");
  expect(texts.filter(t => !md.includes(t))).toEqual([]);
});

// SPEC-028 AC 3: no name object lacks a language (hairs, hats, jackets, pants, Big One looks)
test("every name of hair, hat, jacket, pants and Big One look is in every language", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  const r = await page.evaluate(langs => {
    const N = window.__bb.itemNames(), out = [];
    for (const [slot, list] of Object.entries(N)) list.forEach((nm, i) => {
      for (const l of langs) if (!(typeof nm[l] === "string" && nm[l].trim())) out.push(`${slot} ${i}: ${l}`);
      if (Object.keys(nm).sort().join() !== [...langs].sort().join()) out.push(`${slot} ${i}: keys ${Object.keys(nm)}`);
    });
    return { out, slots: Object.keys(N), counts: Object.values(N).map(l => l.length) };
  }, LANGS);
  expect(r.out).toEqual([]);
  expect(r.slots).toEqual(["hair", "hat", "jacket", "pants", "big"]);
  expect(r.counts.every(n => n > 3)).toBe(true);
  // the seven SPEC-027 clothes, in Portuguese
  const W = await page.evaluate(() => { const w = window.__bb.wardrobeNames(); return [w.jacket.bluezip, w.jacket.redzip, w.jacket.rainbow, w.jacket.magiccape, w.jacket.trench, w.pants.overalls, w.pants.striped].map(q => q.pt); });
  expect(W.every(s => typeof s === "string" && s.length > 2)).toBe(true);
});

// SPEC-028 AC 3: Portuguese plurals — 1 is singular, every other count (0 too) plural
test("Portuguese counts: 1 singular, everything else (0 too) plural", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  const r = await page.evaluate(() => {
    const P = window.__bb.I18N.pt;
    return [0, 1, 2, 3, 5, 11, 21, 22, 101].map(n => [n, P.have(n), P.kissHave(n), P.kitHave(n), P.kissPack(n), P.kitPack(n)]);
  });
  const soft = softly();
  for (const [n, have, kiss, kit, kissPack, kitPack] of r) {
    const one = n === 1;
    soft(have, `have ${n}`).toBe(`Você tem: ${n} ${one ? "superabraço" : "superabraços"}`);
    soft(kiss, `kissHave ${n}`).toBe(`Você tem: ${n} ${one ? "beijinho" : "beijinhos"}`);
    soft(kit, `kitHave ${n}`).toBe(`Você tem: ${n} ${one ? "kit" : "kits"}`);
    soft(kissPack.endsWith(one ? `${n} beijinho` : `${n} beijinhos`), `kissPack ${n}: ${kissPack}`).toBe(true);
    soft(kitPack.endsWith(one ? `${n} kit` : `${n} kits`), `kitPack ${n}: ${kitPack}`).toBe(true);
  }
  soft.done();
});

// SPEC-019: the tiptoe rule line (7th "How to play" line, its own key too) and the first-time "heard you" hints
test("the tiptoe rule and the heard hints are in every language", async ({ page }) => {
  await openGame(page, { sim: true });   // SPEC-023: texts only, nothing drawn
  const r = await page.evaluate(langs => langs.map(l => {
    const I = window.__bb.I18N[l], rules = I.rules(18);
    return { l, n: rules.length, last: rules[rules.length - 1] === I.ruleTiptoe, icon: window.__bb.RULE_ICONS[6],
      texts: [I.ruleTiptoe, I.heardHint(I.heardKey1), I.heardHint(I.heardKey2), I.heardHintTouch].every(t => typeof t === "string" && t.length > 10),
      keys: [I.heardKey1, I.heardKey2].every(k => typeof k === "string" && k.length > 0 && I.heardHint(k).includes(k)) };
  }), LANGS);
  const soft = softly();
  for (const x of r) soft(x, x.l).toEqual({ l: x.l, n: 7, last: true, icon: "👣", texts: true, keys: true });
  soft.done();
  const en = await page.evaluate(() => { const I = window.__bb.I18N.en; return [I.ruleTiptoe, I.heardHint(I.heardKey1), I.heardHintTouch]; });
  expect(en).toEqual(["Run near Dad and he hears you — tiptoe!", "Dad heard you running! Tiptoe near him: hold ⇦ Shift", "Dad heard you running! Tap 👣 to tiptoe"]);   // SPEC-032 AC 1: the 👣 button
});

// SPEC-028 AC 2: a true first launch (no saved language and no progress) follows the browser: pt*, es*, ru* → that language,
// anything else English; a saved language always wins (old saves: en / es / ru; new: pt); a player with progress but no saved
// language keeps English, as before SPEC-028; a broken save → the same rules. SPEC-032 AC 14: the pure rule stays (old devices'
// saves, a save without a language), but the very first launch no longer calls it — it starts in English on the language screen
test("the language on first launch: a saved one, else the browser's (pt, es, ru) on a first launch, else English", { tag: "@fast" }, async ({ page }) => {
  await openGame(page, { sim: true });
  const cases = [
    [null, ["pt-BR"], false, "pt"], [null, ["pt-PT", "en"], false, "pt"], [null, ["PT"], false, "pt"], [null, ["es-AR"], false, "es"], [null, ["es"], false, "es"],
    [null, ["ru-RU"], false, "ru"], [null, ["en-US"], false, "en"], [null, ["de-DE", "fr"], false, "en"], [null, ["de-DE", "pt-BR"], false, "pt"],
    [null, [], false, "en"], [null, undefined, false, "en"], [null, [null, 3, ""], false, "en"],
    ["en", ["pt-BR"], false, "en"], ["es", ["ru"], false, "es"], ["ru", ["pt"], false, "ru"], ["pt", ["en-US"], false, "pt"], ["xx", ["ru"], false, "ru"], ["", ["es-MX"], false, "es"],
    // progress but no saved language: English, whatever the browser says; a saved language still wins
    [null, ["pt-BR"], true, "en"], [null, ["ru-RU"], true, "en"], ["xx", ["es"], true, "en"], ["pt", ["en-US"], true, "pt"], ["ru", ["pt-BR"], true, "ru"]
  ];
  const got = await page.evaluate(cs => cs.map(([saved, nav, played]) => window.__bb.detectLang(saved, nav, played)), cases);
  expect(got).toEqual(cases.map(c => c[3]));
});

// a fresh browser context (nothing saved; `progress` = a bebebe-progress saved before the page loads, no language). SPEC-032 AC 14:
// the very first launch starts in English (no detection: the language screen asks); a returning player without a saved language
// gets English (SPEC-028); the language is saved in bebebe-save in both cases (the old key bebebe-lang is never written)
for (const [locale, progress, want, html] of [["pt-BR", false, "en", "en"], ["es-AR", false, "en", "en"], ["fr-FR", false, "en", "en"], ["pt-BR", true, "en", "en"]]) {
  test(`a ${progress ? "returning player (progress, no saved language)" : "first launch"} in a ${locale} browser starts in ${want}`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    try {
      if (progress) await context.addInitScript(() => { try { if (!localStorage.getItem("bebebe-progress")) localStorage.setItem("bebebe-progress", JSON.stringify({ coins: 5 })); } catch (e) { /* ok */ } });
      const page = await context.newPage();
      const errors = await openGame(page, { sim: true, clearStorage: false });
      expect(await page.evaluate(() => [JSON.parse(localStorage.getItem("bebebe-save")).lang, localStorage.getItem("bebebe-lang"), window.__bb.lang, document.documentElement.lang])).toEqual([want, null, want, html]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// ---------- SPEC-032 AC 13–16: the language screen of the very first launch ----------
// a true first launch: a fresh context, nothing stored (not even the language the test helpers write), the intro and the tutorial on
async function firstLaunch(browser, locale) {
  const context = await browser.newContext({ locale, viewport: { width: 960, height: 640 } });
  const page = await context.newPage();
  const errors = await openGame(page, { clearStorage: false, intro: true, tutorial: true });
  await page.waitForFunction(() => window.__bb.artInfo.done && window.__bb.mode === "lang", null, { timeout: 15_000 });
  await frames(page);
  return { context, page, errors };
}
test("first launch: the language screen, English highlighted (Enter picks it), then the intro, the tutorial and the map", async ({ browser }) => {
  const { context, page, errors } = await firstLaunch(browser, "pt-BR");   // a Portuguese browser: still English (no detection)
  try {
    const d = await page.evaluate(() => { const b = window.__bb; return { lang: b.lang, buttons: b.buttonRects.filter(q => q.id.startsWith("lang:")), all: b.buttonRects.length, sel: b.langSel, names: b.LANG_NAMES }; });
    expect(d.lang).toBe("en");
    expect(d.buttons.map(q => q.id)).toEqual(["lang:en", "lang:es", "lang:pt", "lang:ru"]);
    expect(d.buttons.map(q => q.text)).toEqual(["English", "Español", "Português", "Русский"]);
    expect(d.names).toEqual({ en: "English", es: "Español", pt: "Português", ru: "Русский" });
    expect(d.buttons.map(q => q.on), "English is highlighted").toEqual([true, false, false, false]);
    expect(d.all, "nothing else to tap: the four languages").toBe(4);
    for (const q of d.buttons) expect(q.h, "big buttons").toBeGreaterThanOrEqual(60);
    // Enter picks the highlighted English → the intro comic
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__bb.mode === "scene");
    let s = await page.evaluate(() => ({ lang: window.__bb.lang, scene: window.__bb.scene, saved: JSON.parse(localStorage.getItem("bebebe-save")).lang }));
    expect([s.lang, s.scene.id, s.saved]).toEqual(["en", "intro", "en"]);
    // the intro skipped → the tutorial (page A), skipped → the Park map
    await page.keyboard.press("Escape");
    await frames(page);
    s = await page.evaluate(() => ({ mode: window.__bb.mode, scene: window.__bb.scene, tutorial: window.__bb.tutorial }));
    expect([s.mode, s.scene && s.scene.id, s.tutorial && s.tutorial.step]).toEqual(["scene", "tutorial_a", "a"]);
    await page.keyboard.press("Escape");
    await frames(page);
    expect(await page.evaluate(() => window.__bb.mode)).toBe("map");
    // the next launch has a save: no language screen
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true && window.__bb.artInfo.done);
    await frames(page); await frames(page);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.lang])).toEqual(["home", "en"]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
test("first launch: tapping Português gives Portuguese everywhere (saved, the intro, after a reload)", async ({ browser }) => {
  const { context, page, errors } = await firstLaunch(browser, "en-US");
  try {
    const q = await page.evaluate(() => window.__bb.buttonRects.find(r => r.id === "lang:pt"));
    const box = await page.locator("#game").boundingBox(), sc = await page.evaluate(() => window.__bb.uiSize.scale);
    await page.mouse.click(box.x + (q.x + q.w / 2) * sc, box.y + (q.y + q.h / 2) * sc);   // a real tap on the button
    await page.waitForFunction(() => window.__bb.mode === "scene");
    await frames(page);
    const s = await page.evaluate(() => ({ lang: window.__bb.lang, html: document.documentElement.lang, saved: JSON.parse(localStorage.getItem("bebebe-save")).lang,
      caption: window.__bb.sceneInfo.caption, want: window.__bb.STORY[0].captions.pt[0] }));
    expect([s.lang, s.html, s.saved, s.caption]).toEqual(["pt", "pt-BR", "pt", s.want]);
    await page.keyboard.press("Escape");   // the intro
    await page.keyboard.press("Escape");   // the tutorial
    await page.reload();
    await page.waitForFunction(() => window.__bbReady === true && window.__bb.artInfo.done);
    await frames(page); await frames(page);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.lang, document.documentElement.lang])).toEqual(["home", "pt", "pt-BR"]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
// review fix: the first save is written before the screen is answered — it carries langAsked: false (an added field, hard rule 7),
// so an app closed on the language screen asks again next time; a choice (or Escape = English) sets it true; a bebebe-save without
// the field (every save before SPEC-032) never asks
const reopen = async page => {
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true && window.__bb.artInfo.done);
  await frames(page); await frames(page);
};
const storedLangAsked = page => page.evaluate(() => { window.__bb.save.flush(); const s = JSON.parse(localStorage.getItem("bebebe-save")); return Object.hasOwn(s, "langAsked") ? s.langAsked : "absent"; });
test("first launch: closed on the language screen → it comes back; answered (or Escape) → never again", async ({ browser }) => {
  for (const answer of ["Enter", "Escape"]) {
    const { context, page, errors } = await firstLaunch(browser, "en-US");
    try {
      expect(await storedLangAsked(page), "the first save is written before the answer").toBe(false);
      await reopen(page);
      await page.waitForFunction(() => window.__bb.mode === "lang", null, { timeout: 15_000 });
      await page.keyboard.press(answer);
      await page.waitForFunction(() => window.__bb.mode !== "lang");
      expect(await storedLangAsked(page), `answered with ${answer}`).toBe(true);
      await reopen(page);
      expect(await page.evaluate(() => [window.__bb.mode, window.__bb.lang]), answer).toEqual(["scene", "en"]);   // straight to the intro comic
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});
test("an existing bebebe-save without langAsked never sees the language screen", async ({ browser }) => {
  const { context, page, errors } = await firstLaunch(browser, "pt-BR");
  try {
    // the same save as a pre-SPEC-032 game wrote it: no langAsked field
    await page.evaluate(() => { window.__bb.save.flush(); const s = JSON.parse(localStorage.getItem("bebebe-save")); delete s.langAsked; localStorage.setItem("bebebe-save", JSON.stringify(s)); });
    await reopen(page);
    expect(await page.evaluate(() => [window.__bb.mode, window.__bb.scene && window.__bb.scene.id, window.__bb.lang])).toEqual(["scene", "intro", "en"]);
    expect(await storedLangAsked(page), "the field is not added to an old save").toBe("absent");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
test("an old save never sees the language screen (an old key, or the language the globe saved)", async ({ browser }) => {
  for (const keys of [{ "bebebe-progress": JSON.stringify({ coins: 5 }) }, { "bebebe-lang": "ru" }]) {
    const context = await browser.newContext({ locale: "pt-BR" });
    try {
      await context.addInitScript(k => { try { if (!localStorage.getItem("bb-k")) { for (const [n, v] of Object.entries(k)) localStorage.setItem(n, v); localStorage.setItem("bb-k", "1"); } } catch (e) { /* ok */ } }, keys);
      const page = await context.newPage();
      const errors = await openGame(page, { clearStorage: false, intro: true });
      await page.waitForFunction(() => window.__bb.artInfo.done);
      await frames(page); await frames(page);
      const r = await page.evaluate(() => [window.__bb.mode, window.__bb.lang]);
      expect(r[0], JSON.stringify(keys)).not.toBe("lang");
      expect(r[1]).toBe(keys["bebebe-lang"] || "en");
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});

// SPEC-028 AC 1: a save with bebebe-lang = pt loads in Portuguese; the globe goes en → es → pt → ru → en and shows PT;
// <html lang> is pt-BR while Portuguese is on
test("the globe cycles through the four languages; pt is pt-BR and is saved", async ({ page }) => {
  const errors = await openGame(page, { lang: "pt" });
  expect(await page.evaluate(() => [window.__bb.lang, document.documentElement.lang])).toEqual(["pt", "pt-BR"]);
  await frames(page);
  expect(await page.evaluate(() => window.__bb.buttonRects.find(q => q.id === "home:lang").text)).toBe("🌐 PT");
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { window.__bb.tapButton("home:lang"); });
    await frames(page);
    seen.push(await page.evaluate(() => [window.__bb.lang, document.documentElement.lang, JSON.parse(localStorage.getItem("bebebe-save")).lang, window.__bb.buttonRects.find(q => q.id === "home:lang").text]));
  }
  expect(seen).toEqual([["ru", "ru", "ru", "🌐 RU"], ["en", "en", "en", "🌐 EN"], ["es", "es", "es", "🌐 ES"], ["pt", "pt-BR", "pt", "🌐 PT"]]);
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await page.evaluate(() => [window.__bb.lang, window.__bb.I18N[window.__bb.lang].play])).toEqual(["pt", "Jogar"]);
  expect(errors).toEqual([]);
});

// SPEC-028 AC 7: in Portuguese no screen draws a word that only English, Spanish or Russian have. Every text the 2D layer writes
// (fillText / strokeText) on every menu screen, the story scenes and a level is split into words; a word that appears in the en,
// es or ru texts (I18N with its functions called, STORY, the clothes and look names) but nowhere in the pt texts is a leak, and so
// is any Cyrillic letter. Emoji and numbers are not words; names typed by a kid are not texts of the game.
// The same screens are drawn with CFG.TEXT_TEST_SCALE 1.15 (CI's wider fonts), and no line may overflow (__bb.textOverflows).
async function drawnTexts(page, setup, arg) {
  await page.evaluate(setup, arg);
  await frames(page);
  return page.evaluate(() => new Promise(res => {
    const proto = CanvasRenderingContext2D.prototype, of = proto.fillText, os = proto.strokeText, seen = new Set();
    proto.fillText = function (t, ...a) { seen.add(String(t)); return of.call(this, t, ...a); };
    proto.strokeText = function (t, ...a) { seen.add(String(t)); return os.call(this, t, ...a); };
    requestAnimationFrame(() => requestAnimationFrame(() => { proto.fillText = of; proto.strokeText = os; res([...seen]); }));
  }));
}
const LEAK_SCREENS = [
  ["home", () => { window.__bb.toHome(); }],
  ["map", () => { const b = window.__bb; Object.assign(b.progress.worlds.park, { unlocked: 3, won: { 1: true, 2: true }, stars: { 1: 3, 2: 1 } }); b.toMap(); }],
  ["map bonus", () => { const b = window.__bb; b.world = "beach"; b.toMap(); }],
  ["map toast", () => { window.__bb.tapButton("maptab:winter"); }],
  ["map toast level", () => { const b = window.__bb; b.world = "park"; b.toMap(); }],
  ["map toast locked", () => { window.__bb.tapButton("stop:9"); }],
  ["level card", () => { const b = window.__bb; b.world = "park"; b.level = 2; b.toMap(); b.mode = "levelCard"; }],
  ["level card boss", () => { const b = window.__bb; b.world = "school"; b.level = 20; b.toMap(); b.mode = "levelCard"; }],
  ["progress", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "progress"; Object.assign(b.progress.inv, { mittens: 2, mega: 1, kisses: 3, rescues: 1 }); }],
  ["items", () => { const b = window.__bb; b.mode = "shop"; b.shopTab = "items"; }],
  ["wardrobe", () => { const b = window.__bb, W = b.wardrobe(); b.mode = "shop"; b.shopTab = "wardrobe"; b.progress.coins = 0;
    b.cycleOutfit("p1", "jacket", W.jacket.findIndex(q => q.id === "redzip") - b.outfits.shown.p1.jacket); }],
  ["wardrobe armed", () => { const b = window.__bb; b.progress.coins = 999; b.buyLook("p1"); }],
  ["friends", () => { const b = window.__bb; b.resetOutfits(); b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "friends"; }],
  ["upgrades", () => { const b = window.__bb; b.wardrobePage = "looks"; b.mode = "shop"; b.shopTab = "upgrades"; b.progress.upgrades.fastFeet = 3; }],
  ["story", () => { window.__bb.openStory("park", "home"); }],
  ["story began", () => { window.__bb.openStory("began", "home"); }],
  ["story closed", () => { window.__bb.openStory("ended", "home"); }],
  ["story rules", () => { window.__bb.tapButton("story:rules"); }],
  ["intro comic 1", () => { window.__bb.openScene("intro"); }],
  ["intro comic 2", () => { window.__bb.sceneNext(); }],
  ["intro comic 3", () => { window.__bb.sceneNext(); }],
  ["intro comic 4", () => { window.__bb.sceneNext(); }],
  ["boss scene", () => { window.__bb.openScene("boss_school"); }],
  ["bonus scene", () => { window.__bb.openScene("bonus_winter"); }],
  ["ending", () => { window.__bb.openScene("ending"); }],
  ["thanks", () => { window.__bb.sceneNext(); }],
  ["level", () => { const b = window.__bb; b.world = "field"; b.level = 8; b.resetBannerTimer(); b.startGame(2); b.mode = "play"; }],
  ["win", () => { const b = window.__bb; b.world = "park"; b.level = 3; b.startGame(1); b.stats.playerHugs = 2; b.giveReward(true); b.mode = "win"; }],
  ["win world", () => { const b = window.__bb; b.world = "city"; b.progress.worlds.city.unlocked = 20; b.level = 20; b.startGame(1); b.giveReward(true); b.mode = "win"; }],
  ["lose", () => { const b = window.__bb; b.world = "park"; b.level = 2; b.startGame(1); b.giveReward(false); b.mode = "lose"; }],
  ["pause", () => { const b = window.__bb; b.startGame(1); b.mode = "pause"; }]
];
async function leaks(page) {
  const words = await page.evaluate(() => {
    const b = window.__bb, out = {}, split = s => String(s).toLocaleLowerCase().split(/[^\p{L}]+/u).filter(w => w.length > 1);
    const texts = (v, acc) => {
      if (typeof v === "string") acc.push(v);
      else if (Array.isArray(v)) v.forEach(x => texts(x, acc));
      else if (typeof v === "function") for (const n of [1, 2]) { try { texts(v(n, n, n), acc); } catch (e) { /* ok */ } }
      else if (v && typeof v === "object") Object.values(v).forEach(x => texts(x, acc));
      return acc;
    };
    const names = b.itemNames();
    for (const l of b.LANGS) {
      const acc = texts(b.I18N[l], []);
      for (const c of b.STORY) for (const k of ["captions", "text", "boss", "bubbles"]) if (c[k]) texts(c[k][l], acc);
      for (const list of Object.values(names)) for (const nm of list) acc.push(nm[l]);
      out[l] = [...new Set(acc.flatMap(split))];
    }
    return out;
  });
  const pt = new Set(words.pt), foreign = new Set(["en", "es", "ru"].flatMap(l => words[l]).filter(w => !pt.has(w)));
  const bad = [], seen = [], over = [];
  await page.evaluate(() => { window.__bb.CFG.TEXT_TEST_SCALE = 1.15; });   // AC 6 on the same screens: nothing would overflow with CI's wider fonts
  for (const [name, fn] of LEAK_SCREENS) {
    const t = await drawnTexts(page, fn);
    seen.push(...t);
    for (const q of await page.evaluate(() => window.__bb.textOverflows)) over.push(`${name}: "${q.text}" ${q.w} > ${q.maxW}`);
    for (const s of t) {
      const w = s.toLocaleLowerCase().split(/[^\p{L}]+/u).filter(x => foreign.has(x));
      if (w.length || /[Ѐ-ӿ]/.test(s)) bad.push(`${name}: "${s}" (${w.join(", ") || "Cyrillic"})`);
    }
  }
  // the check itself: the same home screen in Spanish and in Russian is caught
  const control = [];
  for (const l of ["es", "ru"]) {
    const t = await drawnTexts(page, lg => { window.__bb.setLang(lg); window.__bb.toHome(); }, l);
    control.push(t.some(s => s.toLocaleLowerCase().split(/[^\p{L}]+/u).some(x => foreign.has(x))));
  }
  await page.evaluate(() => { window.__bb.setLang("pt"); window.__bb.CFG.TEXT_TEST_SCALE = 1; });
  return { bad, over, seen: seen.length, foreign: foreign.size, control };
}
for (const [name, ctx] of [["1280×720 desktop", { viewport: { width: 1280, height: 720 }, query: "" }],
  ["667×375 phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, query: "?phone=1" }]]) {
  test.describe(name, () => {
    test.use({ viewport: ctx.viewport, hasTouch: !!ctx.hasTouch, isMobile: !!ctx.isMobile });
    test(`in Portuguese no screen draws an English, Spanish or Russian word (${name})`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = await openGame(page, { lang: "pt", query: ctx.query });
      await page.waitForFunction(() => window.__bb.artInfo.done, null, { timeout: 15_000 });
      const r = await leaks(page);
      expect(r.foreign).toBeGreaterThan(300);                                 // the check has words to find
      expect(r.seen).toBeGreaterThan(100);                                    // and the screens drew texts
      expect(r.control, "Spanish and Russian home screens are caught").toEqual([true, true]);
      expect(r.bad).toEqual([]);
      expect(r.over, "no Portuguese line overflows (×1.15)").toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

// SPEC-028 AC 6: every wardrobe name (hair, hat, jacket, pants, Big One look) fits its row between the arrows — shrunk at most to
// the smallest size, never out of the row (__bb.textOverflows: a line that would not fit even at the smallest size, measured
// ×1.15 too, like CI's wider fonts). Every item of every slot in Portuguese and English, phone 667×375 and desktop 1280×720.
// (Spanish and Russian SPEC-027 names overflow the phone row today — specs/BACKLOG.md; add them here when they are shortened.)
const FIT_LANGS = ["en", "pt"];
for (const [name, ctx] of [["667×375 phone", { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, query: "?phone=1" }],
  ["1280×720 desktop", { viewport: { width: 1280, height: 720 }, query: "" }]]) {
  test.describe(name, () => {
    test.use({ viewport: ctx.viewport, hasTouch: !!ctx.hasTouch, isMobile: !!ctx.isMobile });
    test(`every wardrobe name fits its row, en and pt (${name})`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors = await openGame(page, { query: ctx.query });
      const n = await page.evaluate(() => { const N = window.__bb.itemNames(); return Math.max(...Object.values(N).map(l => l.length)); });
      const bad = [];
      for (const lang of FIT_LANGS) for (const scale of [1, 1.15]) {
        await page.evaluate(([l, s]) => { const b = window.__bb; b.setLang(l); b.CFG.TEXT_TEST_SCALE = s; b.resetOutfits(); b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "looks"; }, [lang, scale]);
        for (let i = 0; i < n; i++) {
          await frames(page);
          const o = await page.evaluate(() => window.__bb.textOverflows);
          for (const q of o) bad.push(`${lang} ×${scale}: "${q.text}" ${q.w} > ${q.maxW}`);
          await page.evaluate(() => { const b = window.__bb; for (const s of ["hair", "hat", "jacket", "pants"]) b.cycleOutfit("p1", s, 1); b.cycleBig(1); });
        }
      }
      await page.evaluate(() => { const b = window.__bb; b.CFG.TEXT_TEST_SCALE = 1; b.resetOutfits(); b.setLang("en"); });
      expect([...new Set(bad)]).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
