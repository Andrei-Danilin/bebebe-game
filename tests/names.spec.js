// Names for the players, the Big One and the bot friends (SPEC-003): saved in `bebebe-names`, cleaned, typed in the shop's
// Wardrobe tab (SPEC-017; the bot friends on its Friends page).
const { test, expect } = require("@playwright/test");
const { openGame, frames } = require("./helpers");

test.beforeEach(async ({ page }) => { page.errors = await openGame(page); });
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// Centre of a button registered this frame (by its id), in page pixels.
async function buttonCenter(page, id) {
  await frames(page);
  const r = await page.evaluate(i => {
    const b = window.__bb.buttonRects.find(q => q.id === i);
    if (!b) return null;
    const c = document.getElementById("game").getBoundingClientRect();
    const k = c.width / 960;
    return { x: c.left + (b.x + b.w / 2) * k, y: c.top + (b.y + b.h / 2) * k, rect: { x: c.left + b.x * k, y: c.top + b.y * k, w: b.w * k, h: b.h * k } };
  }, id);
  expect(r, `button ${id}`).not.toBeNull();
  return r;
}

test("names are saved, cleaned and survive a reload", async ({ page }) => {
  let n = await page.evaluate(() => window.__bb.names);
  expect(n).toEqual({ p1: "Player 1", p2: "Player 2", big: "Big One", bots: ["Bo", "Mia", "Tom", "Lulu"] });
  await page.evaluate(() => window.__bb.setLang("es"));
  n = await page.evaluate(() => window.__bb.names);
  expect(n.big).toBe("Grandote");
  expect(n.bots).toEqual(["Tito", "Mora", "Lupe", "Facu"]);
  await page.evaluate(() => {
    const b = window.__bb;
    b.setName("big", "  Pa\u0007pá\n  ");
    b.setName("p1", "ABCDEFGHIJKLMNOP");
    b.setName("p2", "\u{1F600}".repeat(15));
    b.setName("bot2", "   ");
    b.setName("bot3", "Rex");
    b.setLang("ru");
  });
  n = await page.evaluate(() => window.__bb.names);
  expect(n.big).toBe("Papá");                       // typed: kept as typed in every language
  expect(n.p1).toBe("ABCDEFGHIJKL");                // 12 characters
  expect(Array.from(n.p2).length).toBe(12);         // counted by code points
  expect(n.bots).toEqual(["Тёма", "Маша", "Rex", "Соня"]);   // empty → the default of the language
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  n = await page.evaluate(() => window.__bb.names);
  expect(n).toEqual({ p1: "ABCDEFGHIJKL", p2: "\u{1F600}".repeat(12), big: "Papá", bots: ["Тёма", "Маша", "Rex", "Соня"] });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bebebe-names")));
  expect(Object.keys(saved).sort()).toEqual(["big", "bots", "p1", "p2"]);
  expect(saved.bots.length).toBe(4);
  // broken data → defaults, nothing throws
  await page.evaluate(() => localStorage.setItem("bebebe-names", "{oops"));
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  n = await page.evaluate(() => window.__bb.names);
  expect(n).toEqual({ p1: "Игрок 1", p2: "Игрок 2", big: "Большой", bots: ["Тёма", "Маша", "Вася", "Соня"] });
  // partly wrong data → only the good fields are kept
  await page.evaluate(() => localStorage.setItem("bebebe-names", JSON.stringify({ p1: "Ana", big: 42, bots: "x" })));
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  n = await page.evaluate(() => window.__bb.names);
  expect(n.p1).toBe("Ana");
  expect(n.big).toBe("Большой");
  expect(n.bots).toEqual(["Тёма", "Маша", "Вася", "Соня"]);
});

test("names can be typed in the wardrobe tab", async ({ page }) => {
  await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "wardrobe"; });
  const c = await buttonCenter(page, "name:big");
  await page.mouse.click(c.x, c.y);
  const input = page.locator("#wrap input");
  await expect(input).toHaveCount(1);
  await expect(input).toBeFocused();
  expect(await input.getAttribute("maxlength")).toBe("24");     // room for 12 emoji (2 UTF-16 units each); the save cuts to 12
  expect(await input.getAttribute("enterkeyhint")).toBe("done");
  expect(await input.getAttribute("autocapitalize")).toBe("words");
  expect(await input.inputValue()).toBe("Big One");
  const fs = await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
  const box = await input.boundingBox();                 // exactly over the label
  expect(Math.abs(box.x - c.rect.x)).toBeLessThan(2);
  expect(Math.abs(box.y - c.rect.y)).toBeLessThan(2);
  expect(Math.abs(box.width - c.rect.w)).toBeLessThan(2);
  // game keys are ignored while typing (L would switch the language, Escape would leave the screen)
  await input.fill("");
  await page.keyboard.type("Papa Lolo");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await page.keyboard.press("Enter");
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => window.__bb.names.big)).toBe("Papa Lolo");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.shopTab])).toEqual(["shop", "wardrobe"]);
  // Escape cancels
  const c1 = await buttonCenter(page, "name:p1");
  await page.mouse.click(c1.x, c1.y);
  await expect(input).toHaveCount(1);
  await input.fill("Nope");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => window.__bb.names.p1)).toBe("Player 1");
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.shopTab])).toEqual(["shop", "wardrobe"]);
  // tapping outside saves
  await page.mouse.click(c1.x, c1.y);
  await input.fill("Ana");
  await page.mouse.click(480, 40);
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => window.__bb.names.p1)).toBe("Ana");
  // iPhone landscape: the input still sits on the label
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  const c2 = await buttonCenter(page, "name:p2");
  await page.mouse.click(c2.x, c2.y);
  await expect(input).toHaveCount(1);
  const box2 = await input.boundingBox();
  expect(Math.abs(box2.x - c2.rect.x)).toBeLessThan(2);
  expect(Math.abs(box2.y - c2.rect.y)).toBeLessThan(2);
  expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.keyboard.press("Escape");
});

test("bot names page", async ({ page }) => {
  await page.evaluate(() => { window.__bb.mode = "shop"; window.__bb.shopTab = "wardrobe"; });
  const f = await buttonCenter(page, "openFriends");
  await page.mouse.click(f.x, f.y);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.wardrobePage])).toEqual(["shop", "friends"]);
  for (const id of ["name:bot1", "name:bot2", "name:bot3", "name:bot4"]) await buttonCenter(page, id);
  const c = await buttonCenter(page, "name:bot3");
  await page.mouse.click(c.x, c.y);
  const input = page.locator("#wrap input");
  await expect(input).toHaveCount(1);
  expect(await input.inputValue()).toBe("Tom");
  await input.fill("Rex");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__bb.names.bots)).toEqual(["Bo", "Mia", "Rex", "Lulu"]);
  // in play the bots get the names in slot order
  await page.evaluate(() => window.__bb.startGame(1));
  expect(await page.evaluate(() => window.__bb.littles.filter(l => l.kind === "bot").map(l => window.__bb.nameOf(l)))).toEqual(["Bo", "Mia", "Rex", "Lulu"]);
  await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; b.wardrobePage = "friends"; });
  const back = await buttonCenter(page, "backToWardrobe");
  await page.mouse.click(back.x, back.y);
  expect(await page.evaluate(() => [window.__bb.mode, window.__bb.wardrobePage])).toEqual(["shop", "looks"]);
});
