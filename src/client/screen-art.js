// SPEC-048: the pictures of every screen and the wait in a screen change. A screen with a big picture (a story page, the How to play card, a tutorial
// sheet, the level card's map and houses, the "New here!" card) lists the pictures it shows (screenArt: `now`) and the ones the next screen will show
// (`next`); the frame loop asks for both every frame (artPrefetch, so the next screen's pictures are in memory before it opens), and a change to a
// screen whose pictures are not ready keeps the old screen on the canvas — no frame is drawn, the buttons of the old screen are stale, a key or a pad
// button does nothing (artHolding) — until artReady, but at most LOOK.ART_WAIT s: then the new screen shows with its fallback and the late pictures fade
// in (artLate / artFade). The recorder (`__bb.recordFrames` / `__bb.frameLog`) logs per frame the screen shown and the listed pictures it lacked.
// Logic never waits: the game state changes at once (a test reads it at once); only what is drawn waits. Client module.
import { G } from "../core/active.js";
import { artFade, artLate, artPrefetch, artReady, cardArt, levelArt, mapBgArt, RULE_ART, STORY_ART, tipArt } from "./art.js";
import { cardLevel, chapterOpen, scenePages, storyCh, tipDue } from "./flow.js";
import { LOOK } from "./look.js";
import { simMode } from "./screen.js";
import { mode, ui } from "./state.js";
import { sheetAfter, sheetArt, stepArt, tutorial, tutorialPages } from "./tutorial-data.js";
import { STORY } from "../story.js";

// The lists below name nothing themselves: the pictures of the card, the tip, the level start and the tutorial come from art.js / tutorial-data.js, the
// same functions the screens draw with (a test compares what each screen drew with its `now`).
// RULE: what the player flips quickly on a screen (the map's world tabs, the story's chapters, the level arrows) is never in the screen key `sig`: such a
// flip is no screen change, never waits and never swallows a press — its picture is prefetched (`next`) and, if it is late, fades in.
const pageArt = pg => (pg && !pg.thanks && pg.art ? [pg.art] : []);
function sceneArt(sc) {
  const pages = scenePages(sc.id), pg = pages[sc.page] || null, now = pageArt(pg), after = pg && sheetAfter(pg.art);
  let next = after ? [after] : pageArt(pages[sc.page + 1]);   // the card → sheet a → b → c → the last page (the practice games play between)
  if (sc.id === "intro") { const p = tutorialPages("intro")[0]; next = [p.art, p.art2]; }   // How it began → the How to play card and page A
  return { sig: `scene:${sc.id}:${sc.page}`, now, next };
}
// the picture of the chapter i if it is open
const chapterArt = i => { const c = STORY[i]; return c && chapterOpen(c) && STORY_ART[c.id] ? [STORY_ART[c.id]] : []; };
// the picture of the first step after the running one that has one (the practice game plays on, its picture comes next)
function nextStepArt() {
  if (!tutorial) return [];
  for (let i = tutorial.i + 1; i < tutorial.steps.length; i++) { const a = stepArt(tutorial.steps[i]); if (a) return [a]; }
  return [];
}
// → { sig, now, next }: the screen (a string that changes when the screen does: the mode, the page, the card), the pictures it shows and the ones the
// next screen shows
export function screenArt() {
  if (mode === "scene" && ui.storyScene) return sceneArt(ui.storyScene);
  if (mode === "story") {
    const rules = ui.storyPage === "rules";
    return { sig: `story:${ui.storyPage}`, now: rules ? [sheetArt("a"), ...RULE_ART] : chapterArt(storyCh), next: rules ? [] : [...chapterArt(storyCh - 1), ...chapterArt(storyCh + 1)] };
  }
  if (mode === "map") return { sig: "map", now: [mapBgArt(G.world)], next: [...cardArt(G.world), ...levelArt(G.world), ...(tipDue(G.world) ? tipArt(G.world) : [])] };
  if (mode === "levelCard") {
    if (ui.tip) return { sig: `tip:${ui.tip}`, now: [mapBgArt(ui.tip), ...tipArt(ui.tip)], next: [] };   // (the map page is under the dimmed card)
    return { sig: `levelCard:${G.world}:${cardLevel}`, now: cardArt(G.world), next: [...levelArt(G.world), ...(cardLevel === 1 && tipDue(G.world) ? tipArt(G.world) : [])] };
  }
  if (mode === "play") return { sig: "play", now: [], next: G.tutorialGame ? nextStepArt() : [] };
  if (mode === "win") return { sig: "win", now: [], next: [...cardArt(G.world), ...levelArt(G.world)] };   // the next level's card
  if (mode === "home") return { sig: "home", now: [], next: ui.introDue ? ["story_start"] : [] };   // the first launch's comic comes next
  return { sig: mode, now: [], next: [] };
}

let shown = null, shownFit = -1, holdSince = 0, pendingSince = 0, holding = false, frameNo = 0;
// a key, a pad button or a tap goes to nothing while a screen change waits for its pictures — for at most ART_WAIT, and also in the frame of the change itself,
// before the loop has seen it (a second key within that frame must not reach the new screen)
export function artHolding() {
  const cap = LOOK.ART_WAIT * 1000, now = performance.now();
  if (holding) return now - holdSince < cap;
  if (simMode || shown === null) return false;   // (sim draws nothing: `shown` goes stale there and no picture would ever load)
  const s = screenArt();
  if (s.sig === shown || artReady(s.now)) { pendingSince = 0; return false; }
  if (!pendingSince) pendingSince = now;
  return now - pendingSince < cap;
}
// a frame that threw must not leave input dead (main.js frame())
export function clearHold() { holding = false; shown = null; holdSince = 0; pendingSince = 0; }
const rec = { on: false, log: /** @type {any[]} */ ([]) };
// SPEC-048 AC 9: the recorder — each frame the loop ran: the screen on the canvas, whether the frame was held (nothing drawn), the screen the game is
// at, and (for a frame that drew) the listed pictures the screen lacked, whether the wait had run out (`late`) and how far a late picture has faded in (`fade`, 0…1)
export function recordFrames(on) { rec.on = !!on; if (on) rec.log = []; }
export const frameLog = () => rec.log.map(f => ({ ...f, missing: [...f.missing] }));
// the frame loop (main.js, before drawUI): asks for the pictures, decides whether this frame draws → true: draw the 2D layer, false: keep the canvas
export function screenGate(now, fitN) {
  const s = screenArt();
  artPrefetch(s.now); artPrefetch(s.next);
  let draw = true, late = false;
  if (shown !== null && s.sig !== shown) {
    const waited = holdSince > 0 && now - holdSince >= LOOK.ART_WAIT * 1000;
    if (artReady(s.now) || fitN !== shownFit || waited || LOOK.ART_WAIT <= 0) late = !artReady(s.now);   // (a resize emptied the canvas: nothing to keep)
    else { if (!holdSince) holdSince = now; draw = false; }
  }
  if (draw) { if (late) artLate(s.now); shown = s.sig; shownFit = fitN; holdSince = 0; }
  if (draw && !late) artLate(s.now);   // the same screen asks for a picture that is not in yet (the map's world changed): no wait, it fades in when it comes
  holding = !draw; pendingSince = 0;
  if (rec.on && rec.log.length < LOOK.ART_LOG_MAX) rec.log.push({ n: frameNo, t: Math.round(now), screen: shown, target: s.sig, held: !draw, late, fade: draw ? Math.round(100 * Math.min(1, ...s.now.map(artFade))) / 100 : 1, missing: draw ? s.now.filter(n => !artReady([n])) : [] });
  frameNo++;
  return draw;
}
