// SPEC-011: the renderer (created by initThree), the scene and the lights (set up by initScene), the base camera, U/P,
// WALL_H. A leaf of the client (imports no client module). Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { CELL, COLS, H, ROWS, W } from "../../core/config.js";
import { LOOK } from "../look.js";
import { tierNumbers } from "../quality.js";

export let renderer = null;           // создаёт initThree()

// =====================================================================
//  3D (Three.js): мультяшный стиль — toon-освещение + чёрный контур
// =====================================================================
export const U = 1 / CELL;                       // 1 клетка логики = 1 единица 3D
export const P = v => v * U;
export const WALL_H = 0.85;
let glCanvas;   // set by initThree()

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 200);
export const LITTLE_SCALE = 1.6, BIG_SCALE = 1.4;   // герои крупнее клетки — так их лучше видно
export const camTarget = new THREE.Vector3(COLS / 2, 0, ROWS / 2 + 0.4);
export const camBase = new THREE.Vector3();

export const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);

// SPEC-025 AC 7b: three.js r187 needs WebGL2 — a probe on a canvas of its own (the game's canvas keeps its context attributes
// free for the renderer); the probe's context is released at once
export function hasWebGL2() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    const x = gl.getExtension("WEBGL_lose_context");
    if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}
let msaa = true;                       // the renderer's MSAA (a property of the WebGL context: changing it means a new canvas and renderer)
export const msaaOn = () => msaa;
function makeRenderer(canvas, antialias) {
  let r;
  try { r = new THREE.WebGLRenderer({ canvas, antialias }); }
  catch (e) { throw Object.assign(new Error("the WebGL renderer cannot be created: " + (e && e.message)), { noWebGL: true }); }   // SPEC-025 AC 7b
  r.shadowMap.enabled = true;
  r.shadowMap.type = tierNumbers().shadowType === "basic" ? THREE.BasicShadowMap : THREE.PCFShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  msaa = antialias;
  return r;
}
// called once by main.js, in the start order of the one-file game
export function initThree() {
  glCanvas = document.getElementById("gl");
  renderer = makeRenderer(glCanvas, tierNumbers().msaa);   // SPEC-040: MSAA by the tier chosen so far (a saved or pinned one; the start probe may change it)
}
// SPEC-040 AC 7: a tier with another MSAA than the renderer has: a new canvas (a context's attributes are fixed) and a new renderer in the old
// one's place — the scene, its materials and textures are the game's, the new renderer uploads them on first use. onCanvas(new canvas) runs
// before the old context is given up (the lifecycle moves its context-loss listeners: giving up a context must not look like a loss). The caller
// sets the size again (fit) and rebuilds nothing. Returns the new canvas.
export function recreateRenderer(antialias, onCanvas = null) {
  const old = renderer, oldCanvas = old.domElement, cv = document.createElement("canvas");
  cv.id = oldCanvas.id; cv.className = oldCanvas.className; cv.style.cssText = oldCanvas.style.cssText;
  oldCanvas.replaceWith(cv);
  glCanvas = cv;
  renderer = makeRenderer(cv, antialias);
  if (onCanvas) onCanvas(cv);
  old.dispose();
  old.forceContextLoss();               // the old context is released at once, not when the garbage collector gets to it
  return cv;
}
// the shadow map of the tier: its size (a new target is made on the next frame) and kind (PCF: soft; basic: hard-edged and cheaper)
export function setShadowQuality(size, basic) {
  const type = basic ? THREE.BasicShadowMap : THREE.PCFShadowMap, changed = renderer.shadowMap.type !== type;
  renderer.shadowMap.type = type;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  return changed;                        // true: every material that receives a shadow needs its shader again
}
// In the start order of the one-file game (after fit(): main.js calls it, so this module imports no client module except
// the data leaf look.js — no evaluation-order risk).
// called once by main.js
export function initScene() {
  scene.background = new THREE.Color("#6fb24f");
  scene.fog = new THREE.Fog("#6fb24f", 40, 75);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d7f45, LOOK.TOON_LOOK.sky));
  sun.position.set(COLS / 2 - 9, 24, ROWS / 2 + 9);
  sun.target.position.copy(camTarget);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tierNumbers().shadow, tierNumbers().shadow);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 17, bottom: -17, near: 1, far: 70 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.intensity = LOOK.TOON_LOOK.shadow;
  sun.shadow.radius = LOOK.TOON_LOOK.shadowRadius; // SPEC-021: тень светлее и мягче (как штриховка)
  scene.add(sun, sun.target);
}
