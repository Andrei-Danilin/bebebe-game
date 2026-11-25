// SPEC-011: the renderer (created by initThree), the scene and the lights (set up by initScene), the base camera, U/P,
// WALL_H. A leaf of the client (imports no client module). Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { CELL, COLS, H, ROWS, W } from "../../core/config.js";
import { LOOK } from "../look.js";

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
// called once by main.js, in the start order of the one-file game
export function initThree() {
  glCanvas = document.getElementById("gl");
  try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true }); }
  catch (e) { throw Object.assign(new Error("the WebGL renderer cannot be created: " + (e && e.message)), { noWebGL: true }); }   // SPEC-025 AC 7b
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 17, bottom: -17, near: 1, far: 70 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.intensity = LOOK.TOON_LOOK.shadow;
  sun.shadow.radius = LOOK.TOON_LOOK.shadowRadius; // SPEC-021: тень светлее и мягче (как штриховка)
  scene.add(sun, sun.target);
}
