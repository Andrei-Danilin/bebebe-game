// SPEC-025 AC 15b: the perf hook for the manual device checks (debug only, not player-facing: no I18N). noteFrame — called by
// main.js's frame loop with each frame's real and game time; perfReport — what __bb.perf() returns: fps and frame time p50 /
// p95 / max over the last LOOK.PERF_LOOK.frames frames, the draw calls and triangles of the main 3D pass (its shadow pass included:
// three.js counts both in one render call), renderer.info.memory and programs, the cache sizes, the JS heap (where the browser
// tells it), DPR, the canvas sizes, the level and the game-time / real-time ratio; SPEC-040 AC 11: the quality tier and its mode, the decoded
// sprite memory, the fps at p50 / p95. The draw counts are those of the LAST world frame: the 3D is not drawn under a cover (menus, pause), so
// they stay at the last frame drawn — the overlay says so. ?perf=1 shows it as a small overlay with a
// "copy" button (initPerf). Client module.

import { G } from "../core/active.js";
import { artBytes, artImgs } from "./art.js";
import { paperCache } from "./ui/paper.js";
import { LOOK } from "./look.js";
import { Q } from "./quality.js";
import { canvas, DPR } from "./screen.js";
import { ui } from "./state.js";
import { previewCount } from "./three/previews.js";
import { renderer } from "./three/setup.js";
import { mmBase } from "./ui/minimap.js";

const frames = { real: new Float64Array(LOOK.PERF_LOOK.frames), game: new Float64Array(LOOK.PERF_LOOK.frames), n: 0, i: 0 };

// one frame: its real length and the game time it advanced (s; the loop clamps a long frame, so game ≤ real)
export function noteFrame(real, game) {
  frames.real[frames.i] = real; frames.game[frames.i] = game;
  frames.i = (frames.i + 1) % frames.real.length;
  frames.n = Math.min(frames.n + 1, frames.real.length);
}
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function perfReport() {
  const real = Array.from(frames.real.subarray(0, frames.n)), game = Array.from(frames.game.subarray(0, frames.n));
  const sumReal = real.reduce((s, v) => s + v, 0), sumGame = game.reduce((s, v) => s + v, 0);
  const ms = real.map(v => v * 1000).sort((a, b) => a - b);
  const info = renderer ? renderer.info : null, mem = typeof performance !== "undefined" && performance.memory;
  const gl = renderer ? renderer.domElement : null;
  return {
    frames: frames.n,
    fps: sumReal > 0 ? round(frames.n / sumReal, 1) : 0,
    frameMs: { p50: round(pct(ms, 0.5)), p95: round(pct(ms, 0.95)), max: round(ms.length ? ms[ms.length - 1] : 0) },
    draw: { calls: ui.mainPass.calls, triangles: ui.mainPass.triangles },   // of the last world frame (the 3D is not drawn when covered)
    fpsP: { p50: ms.length && pct(ms, 0.5) > 0 ? round(1000 / pct(ms, 0.5), 1) : 0, p95: ms.length && pct(ms, 0.95) > 0 ? round(1000 / pct(ms, 0.95), 1) : 0 },   // p95 = the slow end (95 % of frames are at least this fast)
    tier: { name: Q.tier, mode: Q.pinned ? "pinned" : Q.mode },
    artBytes: artBytes(),
    memory: info ? { ...info.memory } : null,
    programs: info && info.programs ? info.programs.length : 0,
    caches: { previews: previewCount(), art: artImgs.size, paper: paperCache.length, mapBg: ui.mapBgCache ? 1 : 0, minimap: mmBase ? 1 : 0 },
    heap: mem && mem.usedJSHeapSize ? mem.usedJSHeapSize : null,
    dpr: DPR,
    canvas: { ui: { w: canvas.width, h: canvas.height }, gl: gl ? { w: gl.width, h: gl.height } : null },
    level: G ? `${G.world} ${G.level}` : null,
    gameRealRatio: sumReal > 0 ? round(sumGame / sumReal, 3) : 1,
    gameSec: round(sumGame, 2), realSec: round(sumReal, 2)
  };
}

// ?perf=1: the report as a small overlay (top left, over the game) with a copy button; refreshed every LOOK.PERF_LOOK.overlayMs
// called once by main.js
export function initPerf() {
  let on = false;
  try { on = new URLSearchParams(location.search).get("perf") === "1"; } catch (e) { /* no location */ }
  if (!on) return;
  const box = document.createElement("div"), pre = document.createElement("pre"), copy = document.createElement("button");
  box.id = "perf";
  box.style.cssText = "position:fixed;left:4px;top:4px;z-index:50;background:rgba(0,0,0,.7);color:#fff;font:11px/1.3 monospace;padding:4px 6px;border-radius:6px;max-width:46vw;pointer-events:auto";
  pre.style.cssText = "margin:0;white-space:pre-wrap";
  copy.textContent = "copy";
  copy.onclick = () => { try { navigator.clipboard.writeText(JSON.stringify(perfReport())).catch(() => { /* not allowed */ }); } catch (e) { /* no clipboard */ } };
  box.append(pre, copy);
  document.body.appendChild(box);
  const show = () => {
    const r = perfReport();
    pre.textContent = `${r.fps} fps (p50 ${r.fpsP.p50} · p95 ${r.fpsP.p95}) · ${r.frameMs.p50}/${r.frameMs.p95}/${r.frameMs.max} ms
` +
      `last world frame: ${r.draw.calls} calls ${r.draw.triangles} tris · tier ${r.tier.name} (${r.tier.mode})
` +
      `geo ${r.memory && r.memory.geometries} tex ${r.memory && r.memory.textures} prog ${r.programs} · heap ${r.heap ? Math.round(r.heap / 1048576) + " MB" : "?"} · sprites ${(r.artBytes / 1048576).toFixed(1)} MB
` +
      `dpr ${r.dpr} · ${r.canvas.ui.w}×${r.canvas.ui.h} · ${r.level} · game time/real time ${r.gameRealRatio} (${r.gameSec} s / ${r.realSec} s)`;
  };
  show();
  setInterval(show, LOOK.PERF_LOOK.overlayMs);
}
