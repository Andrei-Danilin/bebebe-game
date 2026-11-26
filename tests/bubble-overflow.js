// SPEC-032 AC 11 (review fix): the comic bubbles whose line is written at BUBBLE_MIN although it does not fit the drawn bubble.
// No bubble is ever left empty (Andrei's SPEC-026 rule): a line that does not fit even at BUBBLE_MIN is written at BUBBLE_MIN, at
// most 3 rows, centred on the bubble — and only the cases listed here may do that; every other bubble must fit (the intro comic:
// all of them, at every size).
// Key: case ("story began" = the Story chapter page: the whole 2×2 comic in one small picture), screen size (CSS px), language →
// the bubble numbers 0…3 (panel order of STORY[0].bubbles). Measured locally at CFG.TEXT_TEST_SCALE 1 and 1.15 (the CI fonts are
// wider) and checked at 1, so a listed bubble may fit on one machine and not on another; an unlisted one that does not fit fails.
// Shorter en / es / pt lines were tried (bubble 2 "My cupcake?!" / "¿¡Mi cupcake!?" / "Meu cupcake?!"): still too wide even on the
// desktop (the word "cupcake" alone), and at 568×320 even "Oh, kids!" does not fit — so the lines stay; ru is Andrei's (AC 11).
const PHONE = "phone Story page: the chapter picture already takes the page's whole free height (height-bound, no room to grow); "
  + "each line fits in the intro comic (▶ on the picture), where every panel is shown big";
const DESK = "desktop Story page: bubble 2 (and 3) of the small chapter picture is narrower than its word at BUBBLE_MIN; "
  + "each line fits in the intro comic (▶ on the picture)";
const ALL = [0, 1, 2, 3];
const MID_PHONE = { reason: PHONE, en: [2, 3], es: [0, 2, 3], pt: ALL, ru: [0, 2, 3] };
const DESKTOP = { reason: DESK, en: [2, 3], es: [2], pt: [2, 3], ru: [2, 3] };
const BUBBLE_OVERFLOW = {
  "story began": {
    "568×320": { reason: PHONE, en: ALL, es: ALL, pt: ALL, ru: ALL },
    "640×360": MID_PHONE,
    "667×375": MID_PHONE,
    "740×360": MID_PHONE,
    "844×390": { reason: PHONE, en: [2, 3], es: [2, 3], pt: [2, 3], ru: [2, 3] },
    "932×430": { reason: PHONE, en: [2], es: [2], pt: [2], ru: [2, 3] },
    "960×540": DESKTOP,
    "960×640": DESKTOP,
    "1280×720": DESKTOP,
    "1920×1080": DESKTOP
  }
};
// the listed bubbles of one case and size, as "lang|i" (for page.evaluate)
function overflowKeys(name, size) {
  const { reason, ...langs } = (BUBBLE_OVERFLOW[name] || {})[size] || {};
  if (Object.keys(langs).length && !reason) throw new Error(`bubble-overflow ${name} ${size}: no reason`);
  return Object.entries(langs).flatMap(([lang, ids]) => ids.map(i => `${lang}|${i}`));
}
module.exports = { BUBBLE_OVERFLOW, overflowKeys };
