// SPEC-040 AC 3 (RR-47): when a frame draws the 3D world. A pure function of the screen and the clock — no DOM, no three.js — so a test can
// drive it with fake timestamps (__bb.view3D). main.js asks it once per frame; the answer is
//   "world"    — render3D (sync the scene, draw it);
//   "previews" — the wardrobe's previews on the saved picture of the world behind (the world itself is not drawn);
//   null       — draw nothing: the canvas keeps its last picture.
// The screens fall in four kinds:
//   live    — a level in play: every frame;
//   frozen  — the pause menu: the scene stands still, so once when the pause starts (and while a fade is still moving, or after a
//             change of screen), then nothing;
//   covered — a full-screen page (story, the comic scenes, Character, the language page, the grown-ups page, the rotate overlay): nothing
//             (the Character's wardrobe / progress previews keep drawing, on the saved picture);
//   menu    — home, map, level card, win, lose: at most LOOK.MENU_FPS frames per second.
// A resized canvas (fit) or a rebuilt scene (a new look, a restored context) is empty or stale: it gets one world frame whatever the screen.
// Client module (a leaf: imports nothing).

export const COVERED = Object.freeze(["story", "shop", "scene", "lang"]);   // modes whose page covers the 3D

// one state per game: when the world was last drawn, and what the last frame saw
export const newCadence = () => ({ last: -Infinity, kind: "", seq: -1, fit: -1, builds: -1, stale: true });

/** @param {ReturnType<typeof newCadence>} st
 *  @param {{ mode: string, rotated: boolean, page: boolean, previews: boolean, snap: boolean, menuFps: number, seq: number, fit: number, builds: number, settling: boolean }} s
 *  @param {number} now ms
 *  @returns {"world" | "previews" | null} */
export function cadence(st, s, now) {
  const kind = s.mode === "play" && !s.rotated ? "live" : s.rotated || s.page || COVERED.includes(s.mode) ? "covered" : s.mode === "pause" ? "frozen" : "menu";
  const blank = s.fit !== st.fit || s.builds !== st.builds;                 // the canvas was resized / the scene rebuilt
  const moved = kind !== st.kind || s.seq !== st.seq;                          // another screen since the last frame
  const interval = 900 / s.menuFps;                                           // ms; 0.9 of the frame so a 60 Hz loop gets exactly every other frame
  st.fit = s.fit; st.builds = s.builds; st.seq = s.seq;
  const kindChanged = kind !== st.kind;
  st.kind = kind;
  if (moved) st.stale = true;
  let answer = null;
  if (kind === "live" || blank) answer = "world";
  else if (kind === "frozen") answer = st.stale || s.settling ? "world" : null;
  else if (kind === "menu") answer = kindChanged || now - st.last >= interval ? "world" : null;
  else if (s.previews) answer = !s.snap ? "world" : now - st.last >= interval ? "previews" : null;   // no saved picture yet: draw the world (it is saved)
  if (answer === "world") st.stale = false;
  if (answer) st.last = now;
  return answer;
}
