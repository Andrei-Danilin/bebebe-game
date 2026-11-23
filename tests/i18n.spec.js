// Every text exists in all three languages (English is the reference). A new string must be added to en, es and ru.
const { test, expect } = require("@playwright/test");
const { openGame } = require("./helpers");

test("es and ru have every key that en has, with the same type", { tag: "@fast" }, async ({ page }) => {
  await openGame(page);
  const missing = await page.evaluate(() => {
    const out = [], I = window.__bb.I18N;
    const walk = (ref, other, lang, p) => {
      for (const k of Object.keys(ref)) {
        const a = ref[k], b = other ? other[k] : undefined, key = p ? p + "." + k : k;
        if (b === undefined) { out.push(`${lang}: ${key} missing`); continue; }
        if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(`${lang}: ${key} type`); continue; }
        if (Array.isArray(a) && a.length !== b.length) out.push(`${lang}: ${key} length`);
        else if (a && typeof a === "object" && !Array.isArray(a)) walk(a, b, lang, key);
      }
    };
    for (const lang of ["es", "ru"]) walk(I.en, I[lang], lang, "");
    return out;
  });
  expect(missing).toEqual([]);
});

// SPEC-017: every story chapter has its text in all three languages
test("every STORY text is in en, es and ru", async ({ page }) => {
  await openGame(page);
  const bad = await page.evaluate(() => window.__bb.STORY.flatMap(c => ["en", "es", "ru"].filter(l => !(typeof c.text[l] === "string" && c.text[l].trim().length > 10)).map(l => `${c.id}: ${l}`)));
  expect(bad).toEqual([]);
  expect(await page.evaluate(() => window.__bb.STORY.length)).toBe(8);
  // the rules lines (the "How to play" page) and their icons: one icon per line in every language
  const n = await page.evaluate(() => [window.__bb.RULE_ICONS.length, ...["en", "es", "ru"].map(l => window.__bb.I18N[l].rules(18).length)]);
  expect(n.slice(1)).toEqual([n[0], n[0], n[0]]);
});

// SPEC-019: the tiptoe rule line (7th "How to play" line, its own key too) and the first-time "heard you" hints
test("the tiptoe rule and the heard hints are in en, es and ru", async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => ["en", "es", "ru"].map(l => {
    const I = window.__bb.I18N[l], rules = I.rules(18);
    return { l, n: rules.length, last: rules[rules.length - 1] === I.ruleTiptoe, icon: window.__bb.RULE_ICONS[6],
      texts: [I.ruleTiptoe, I.heardHint(I.heardKey1), I.heardHint(I.heardKey2), I.heardHint(I.heardKeyLeft), I.heardHintTouch].every(t => typeof t === "string" && t.length > 10),
      keys: [I.heardKey1, I.heardKey2, I.heardKeyLeft].every(k => typeof k === "string" && k.length > 0 && I.heardHint(I.heardKey1).includes(I.heardKey1)) };
  }));
  for (const x of r) expect(x, x.l).toEqual({ l: x.l, n: 7, last: true, icon: "👣", texts: true, keys: true });
  const en = await page.evaluate(() => { const I = window.__bb.I18N.en; return [I.ruleTiptoe, I.heardHint(I.heardKey1), I.heardHintTouch]; });
  expect(en).toEqual(["Run near Dad and he hears you — tiptoe!", "Dad heard you running! Tiptoe near him: hold Shift", "Dad heard you running! Push the stick just a little to tiptoe"]);
});
