// SPEC-048: the pictures of every screen and the wait in a screen change. A screen with a big picture (a story page, the How to play card, a tutorial
// sheet, the level card's map and houses, the "New here!" card) lists the pictures it shows (screenArt: `now`) and the ones the next screen will show
// (`next`); the frame loop asks for both every frame (artPrefetch, so the next screen's pictures are in memory before it opens), and a change to a
// screen whose pictures are not ready keeps the old screen on the canvas — no frame is drawn, the buttons of the old screen are stale, a key or a pad
// button does nothing (artHolding) — until artReady, but at most LOOK.ART_WAIT s: then the new screen shows with its fallback and the late pictures fade
// in (artLate / artFade). The recorder (`__bb.recordFrames` / `__bb.frameLog`) logs per frame the screen shown and the listed pictures it lacked.
// Logic never waits: the game state changes at once (a test reads it at once); only what is drawn waits. Client module.
import { G } from "../core/active.js";
import { CFG } from "../core/config.js";
import { progress } from "../core/economy.js";
import { artReady, itemIcon, mapBgArt, STORY_ART, TIP_ART, TRICK_ICON } from "./art.js";
import { cardLevel, chapterOpen, scenePages, storyCh, tipDue } from "./flow.js";
import { LOOK } from "./look.js";
import { mode, ui } from "./state.js";
import { STORY } from "../story.js";

// the "New here!" card's pictures: the world's sheet, its trick's icon and its item's icon (the lazy ones; the rest are resident)
const tipArt = world => [TIP_ART[world]?.[0], TRICK_ICON[CFG.WORLD_TRICK[world]], itemIcon(world)].filter(Boolean);
// the level card's pictures: the map page behind it and the houses of its preview
const cardArt = world => [mapBgArt(world), `house_${world}_kids`, `house_${world}_dad`];
const pageArt = pg => (pg && !pg.thanks && pg.art ? [pg.art] : []);
// the sheet that follows a tutorial sheet (the practice game plays between a and b, and between c and the last page)
const NEXT_SHEET = { tutorial_a: "tutorial_b", tutorial_b: "tutorial_c", tutorial_c: "story_win" };
function sceneArt(sc) {
  const pages = scenePages(sc.id), pg = pages[sc.page] || null, now = pageArt(pg);
  let next = pageArt(pages[sc.page + 1]);
  if (sc.id === "intro") next = ["howto_card", "tutorial_a"];   // How it began → the How to play card and page A
  else if (sc.id === "tutorial_intro") next = ["tutorial_a"];
  else if (pg && NEXT_SHEET[pg.art]) next = [NEXT_SHEET[pg.art]];
  return { sig: `scene:${sc.id}:${sc.page}`, now, next };
}
// → { sig, now, next }: the screen (a string that changes when the screen does: the mode, the page, the card), the pictures it shows and the ones the
// next screen shows
export function screenArt() {
  if (mode === "scene" && ui.storyScene) return sceneArt(ui.storyScene);
  if (mode === "story") {
    const c = STORY[storyCh], rules = ui.storyPage === "rules";
    return { sig: `story:${ui.storyPage}:${storyCh}`, now: rules ? ["tutorial_a"] : c && chapterOpen(c) && STORY_ART[c.id] ? [STORY_ART[c.id]] : [], next: [] };
  }
  if (mode === "map") return { sig: `map:${G.world}`, now: [mapBgArt(G.world)], next: [...cardArt(G.world), ...(tipDue(G.world) ? tipArt(G.world) : [])] };
  if (mode === "levelCard") {
    if (ui.tip) return { sig: `tip:${ui.tip}`, now: tipArt(ui.tip), next: [] };
    return { sig: `levelCard:${G.world}:${cardLevel}`, now: cardArt(G.world), next: cardLevel === 1 && tipDue(G.world) ? tipArt(G.world) : [] };
  }
  if (mode === "play") return { sig: "play", now: [], next: G.tutorialGame === 1 ? ["tutorial_b"] : G.tutorialGame === 2 ? ["story_win"] : [] };
  if (mode === "win") return { sig: "win", now: [], next: [mapBgArt(G.world)] };
  if (mode === "home") return { sig: "home", now: [], next: progress.seen.intro ? [] : ["story_start"] };
  return { sig: mode, now: [], next: [] };
}

let shown = null, shownFit = -1, holdSince = 0, holding = false, frameNo = 0;
export const artHolding = () => holding;
const rec = { on: false, log: /** @type {any[]} */ ([]) };
// SPEC-048 AC 9: the recorder — each frame the loop ran: the screen on the canvas, whether the frame was held (nothing drawn), the screen the game is
// at, and (for a frame that drew) the listed pictures the screen lacked and whether the wait had run out (`late`)
export function recordFrames(on) { rec.on = !!on; if (on) rec.log = []; }
export const frameLog = () => rec.log.map(f => ({ ...f, missing: [...f.missing] }));
// the frame loop (main.js, before drawUI): the recorder only, for now (the wait and the prefetch come with the next step)
export function screenGate(now, fitN) {
  const s = screenArt();
  if (shown !== null && s.sig !== shown) { /* the screen changed */ }
  shown = s.sig; shownFit = fitN;
  if (rec.on && rec.log.length < 2000) rec.log.push({ n: frameNo, screen: shown, target: s.sig, held: false, late: false, missing: s.now.filter(n => !artReady([n])) });
  frameNo++;
  return true;
}
