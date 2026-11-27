// SPEC-040 AC 3 (RR-47): when a frame draws the 3D world — the pure rule of src/client/cadence.js, driven with fake timestamps, so it runs
// on CI whatever the speed of the machine (the real-frame-rate test in tests/perf.spec.js skips itself below 40 fps). Plain Node.
import test from "node:test";
import assert from "node:assert/strict";
import { LOOK } from "../../src/client/look.js";
import { cadence, COVERED, newCadence } from "../../src/client/cadence.js";

const inp = o => ({ mode: "home", rotated: false, page: false, previews: false, snap: false, menuFps: LOOK.MENU_FPS, seq: 0, fit: 0, builds: 0, settling: false, ...o });
// a loop at `hz` for `sec` seconds: what cadence answers each frame (the state is kept; `get(i)` gives the inputs of frame i)
function run(hz, sec, get, st = newCadence()) {
  const out = [];
  for (let i = 0; i < Math.round(hz * sec); i++) out.push(cadence(st, get(i), (i * 1000) / hz));
  return out;
}
const count = (a, v = "world") => a.filter(x => x === v).length;

test("LOOK.MENU_FPS is 30", () => assert.equal(LOOK.MENU_FPS, 30));

test("a level in play draws the world on every frame, at any frame rate", () => {
  for (const hz of [20, 60, 144]) assert.equal(count(run(hz, 1, () => inp({ mode: "play" }))), hz, `${hz} Hz`);
});

test("the menus draw the world at most LOOK.MENU_FPS times a second: home, map, level card, win, lose", () => {
  for (const mode of ["home", "map", "levelCard", "win", "lose"]) {
    for (const hz of [30, 60, 90, 120, 144, 240]) {
      const n = count(run(hz, 4, () => inp({ mode })));
      assert.ok(n <= 4 * LOOK.MENU_FPS + 1, `${mode} at ${hz} Hz: ${n} frames in 4 s`);
      assert.ok(n >= 4 * LOOK.MENU_FPS * 0.85, `${mode} at ${hz} Hz: ${n} frames in 4 s is not much less than the cap`);
    }
  }
  // a loop slower than the cap draws every frame
  assert.equal(count(run(20, 2, () => inp({ mode: "home" }))), 40);
});

test("a full-screen page draws no world: story, scene, Character, language, the grown-ups page, the rotate overlay", () => {
  const screens = [...COVERED.map(mode => ({ mode })), { mode: "home", page: true }, { mode: "map", page: true }, { mode: "home", rotated: true }, { mode: "play", rotated: true }, { mode: "pause", rotated: true }];
  for (const s of screens) {
    const st = newCadence(), first = run(60, 0.1, () => inp(s), st);       // the first frame of a new state draws once (nothing was drawn yet)
    assert.ok(count(first) <= 1, JSON.stringify(s));
    assert.equal(count(run(60, 3, () => inp(s), st)), 0, `covered ${JSON.stringify(s)} keeps drawing`);
  }
});

test("a page that covers the 3D hands it back with one frame, whatever the way back", () => {
  const st = newCadence();
  run(60, 1, () => inp({ mode: "story" }), st);
  assert.equal(cadence(st, inp({ mode: "home" }), 5000), "world", "back from the story page");
  assert.equal(cadence(st, inp({ mode: "home" }), 5001), null, "then the menu cap");
  run(60, 1, () => inp({ mode: "home", rotated: true }), st);
  assert.equal(cadence(st, inp({ mode: "home" }), 9000), "world", "the rotate overlay gone");
});

test("a paused scene is drawn when the pause starts, while a fade moves, and when something changes — then never", () => {
  const st = newCadence();
  run(60, 0.5, () => inp({ mode: "play" }), st);
  const a = run(60, 3, i => inp({ mode: "pause", settling: i < 5 }), st);   // five frames of fade
  assert.deepEqual(a.slice(0, 6), ["world", "world", "world", "world", "world", null], "the start and the fade");
  assert.equal(count(a), 5);
  assert.equal(count(run(60, 5, () => inp({ mode: "pause" }), st)), 0, "frozen");
  assert.equal(cadence(st, inp({ mode: "pause", seq: 1 }), 1e6), "world", "a changed screen (seq)");
  assert.equal(cadence(st, inp({ mode: "pause", seq: 1 }), 1e6 + 16), null);
  assert.equal(cadence(st, inp({ mode: "pause", seq: 1, fit: 1 }), 1e6 + 33), "world", "a resized canvas is empty");
  assert.equal(cadence(st, inp({ mode: "pause", seq: 1, fit: 1, builds: 1 }), 1e6 + 50), "world", "a rebuilt scene (a new look, a restored context)");
  assert.equal(cadence(st, inp({ mode: "pause", seq: 1, fit: 1, builds: 1 }), 1e6 + 66), null);
});

test("a resized canvas or a rebuilt scene under a full-screen page is drawn once", () => {
  const st = newCadence();
  run(60, 1, () => inp({ mode: "shop" }), st);
  assert.equal(cadence(st, inp({ mode: "shop", fit: 1 }), 2000), "world");
  assert.equal(cadence(st, inp({ mode: "shop", fit: 1 }), 2016), null);
  assert.equal(cadence(st, inp({ mode: "shop", fit: 1, builds: 1 }), 2033), "world");
  assert.equal(cadence(st, inp({ mode: "shop", fit: 1, builds: 1 }), 2050), null);
});

test("the Character previews: the world once (it is saved), then previews on the saved picture at most LOOK.MENU_FPS a second", () => {
  const st = newCadence();
  const first = cadence(st, inp({ mode: "shop", previews: true, snap: false }), 0);
  assert.equal(first, "world");
  assert.equal(cadence(st, inp({ mode: "shop", previews: true, snap: false }), 16), "world", "until the picture is saved");
  const a = run(60, 4, () => inp({ mode: "shop", previews: true, snap: true }), st);
  assert.equal(count(a), 0, "no world once it is saved");
  assert.ok(count(a, "previews") <= 4 * LOOK.MENU_FPS + 1 && count(a, "previews") >= 4 * LOOK.MENU_FPS * 0.85, `${count(a, "previews")} preview frames in 4 s`);
  // a Character page without previews (items, upgrades) draws nothing
  assert.equal(count(run(60, 2, () => inp({ mode: "shop", previews: false, snap: true }), st), "previews"), 0);
});
