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
