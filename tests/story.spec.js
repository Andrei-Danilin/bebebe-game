// SPEC-022: Kostya's story in the game — the story texts (from docs/story.md), the story scenes (the start comic on the
// first launch, a picture before each boss level and before the first bonus level, the ending and the thank-you card),
// Dad's anger meter and the "kind again" win title.
const base = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { expect } = base;
const fs = require("fs");
const path = require("path");
const { openGame, frames, softly, ROOT } = require("./helpers");
const test = base.test;

const STORY_MD = fs.readFileSync(path.join(ROOT, "docs", "story.md"), "utf8");
const LANGS = ["en", "es", "ru"];

// ---------- AC 13: every story text is rewritten from docs/story.md ----------
test("the story texts come from Kostya's story (docs/story.md)", { tag: "@fast" }, async ({ page }) => {
  const errors = await openGame(page, { sim: true });   // texts only, nothing drawn
  const d = await page.evaluate(() => {
    const b = window.__bb;
    return { story: b.STORY.map(c => ({ id: c.id, text: c.text, captions: c.captions || null, boss: c.boss || null })),
      bossLine: Object.fromEntries(["en", "es", "ru"].map(l => [l, b.I18N[l].bossLine])) };
  });
  const soft = softly(), by = id => d.story.find(c => c.id === id);
  // the start comic: four captions (one per panel of 8_start), in every language, Kostya's words in Russian
  const began = by("began");
  soft(!!began.captions, "began has captions").toBe(true);
  for (const l of LANGS) soft(began.captions && began.captions[l].length, `began captions ${l}`).toBe(4);
  const ru = began.captions ? began.captions.ru : [];
  ["пришёл с работы", "сбивают его с ног", "любимое пирожное", "в кафе"].forEach((w, i) => {
    soft(ru[i] || "", `caption ${i + 1} (ru) has Kostya's "${w}"`).toContain(w);
    soft(STORY_MD, `"${w}" is in docs/story.md`).toContain(w);
  });
  // the ending: "они вместе с детьми сидят за столом и кушают пирожные"
  soft(by("ended").text.ru, "the ending (ru)").toContain("сидят за столом и кушают пирожные");
  // the world chapters and the boss lines: the School holds the grumpiest dad; the other bosses are each world's main dad
  for (const w of ["park", "field", "city", "school"]) for (const l of LANGS) soft(typeof (by(w).boss || {})[l], `${w} boss line ${l}`).toBe("string");
  for (const w of ["beach", "winter"]) soft(by(w).boss, `${w}: no boss in the bonus worlds`).toBeNull();
  soft(by("school").boss.ru, "the school boss (ru)").toContain("самый злой папа");
  soft(by("school").boss.ru, "the school boss's power (ru)").toContain("сразу нескольких детей");
  for (const w of ["park", "field", "city"]) {
    soft(by(w).boss.ru, `${w} boss (ru) is the world's main dad`).toContain("главный папа");
    soft(by(w).boss.ru.includes("самый злой"), `${w} boss (ru) is not the grumpiest dad`).toBe(false);
    soft(by(w).boss.en.includes("grumpiest"), `${w} boss (en) is not the grumpiest dad`).toBe(false);
  }
  // the level card's boss line: one per main world, the same meaning
  for (const l of LANGS) soft(Object.keys(d.bossLine[l]).sort(), `bossLine ${l}`).toEqual(["city", "field", "park", "school"]);
  soft(d.bossLine.ru.school, "bossLine school (ru)").toContain("Самый злой папа");
  for (const w of ["park", "field", "city"]) soft(d.bossLine.ru[w].includes("злой"), `bossLine ${w} (ru)`).toBe(false);
  // Claude's SPEC-017 wording ("grumpy dads", "ворчливые папы") is gone: Kostya's dads are angry ("злые")
  for (const c of d.story) for (const l of LANGS) soft(/ворчлив|gruñon|grumpy dads/i.test(c.text[l]), `${c.id} ${l}: no SPEC-017 wording`).toBe(false);
  soft.done();
  expect(errors).toEqual([]);
});
