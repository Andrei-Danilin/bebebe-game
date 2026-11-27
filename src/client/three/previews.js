// SPEC-011: the wardrobe previews (skinPanels, previewCache, renderPreviews), outfitModel. Client module (moved out of
// index.html in Phase C).

import * as THREE from "three";
import { BIG_SKINS } from "../../core/wardrobe.js";
import { makeLook, skinSel } from "../outfits.js";
import { CSS_H, CSS_W, PHONE, UH, UW } from "../screen.js";
import { inWardrobe, mode, ui } from "../state.js";
import { buildBigModel, buildLittleModel, modelOf } from "./characters.js";
import { disposeTree, toon } from "./materials.js";
import { renderer } from "./setup.js";
import { phoneSkinCols, progressGeom } from "../ui/layout.js";
import { G } from "../../core/active.js";

// SPEC-027 (тесты): модель маленького — номер в littles или «p1» / «p2» (превью гардероба, из кэша)
// SPEC-040 AC 10: a look is a pure function of the four picks (makeLook), so the cache key is made from the picks — nothing is stringified or
// built per frame; the look itself is made only when its model is (a cache miss)
const lookKey = o => `L${o.hair}|${o.hat}|${o.jacket}|${o.pants}`;
export const outfitModel = who => (typeof who === "number" ? modelOf(G.littles[who]) : previewCache.get(lookKey(skinSel[who])));
// ---------- Превью нарядов (рисуется в «окошки» UI-слоя) ----------
const previewScene = new THREE.Scene();

const pSun = new THREE.DirectionalLight(0xffffff, 2.2);
const pGround = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), toon("#86cf5c"));
const previewCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
const previewCache = new Map();
export const previewCount = () => previewCache.size;   // SPEC-025 AC 15 / 15b: the cache size (memory test, __bb.perf)
function previewModel(key, build) {
  let m = previewCache.get(key);
  if (!m) {
    if (previewCache.size > 24) { previewCache.forEach(pm => { previewScene.remove(pm.root); disposeTree(pm.root); }); previewCache.clear(); }
    m = build(); m.root.visible = false; previewScene.add(m.root); previewCache.set(key, m);
  }
  return m;
}
const SKIN_KEYS = ["p1", "p2", "big"];   // компьютер; телефон — phoneSkinCols() (SPEC-017: вкладка «Гардероб» магазина)
export const skinCx = i => UW / 2 - (SKIN_KEYS.length - 1) * 125 + i * 250;   // центр колонки
// SPEC-026: на странице «Прогресс» — одно окошко: игрок 1
export const progressTab = () => mode === "shop" && ui.shopTab === "progress";
// SPEC-040 AC 3: the previews are on screen (the wardrobe's looks page, the Progress page)
export const previewsShown = () => (inWardrobe() && ui.wardrobePage === "looks") || progressTab();
export const skinPanels = () => progressTab() ? [{ key: "p1", ...progressGeom().preview }]
  : PHONE ? phoneSkinCols().map(col => ({ key: col.key, ...col.panel }))
  : SKIN_KEYS.map((key, i) => ({ key, x: skinCx(i) - 95, y: 136, w: 190, h: 140 }));
export function renderPreviews(t) {
  const defs = {
    p1: [lookKey(skinSel.p1), () => buildLittleModel(makeLook(skinSel.p1), false)],
    p2: [lookKey(skinSel.p2), () => buildLittleModel(makeLook(skinSel.p2), false)],
    big: ["B" + skinSel.big, () => buildBigModel(BIG_SKINS[skinSel.big])]
  };
  const s = CSS_W / UW;
  renderer.setScissorTest(true);
  skinPanels().forEach(p => {
    previewCache.forEach(m => { m.root.visible = false; });
    const [key, build] = defs[p.key], m = previewModel(key, build), isBig = key.startsWith("B");
    m.root.visible = true;
    m.root.rotation.y = t * 0.9;
    const walk = t * (isBig ? 6 : 8);
    m.legs[0].rotation.x = Math.sin(walk) * 0.5; m.legs[1].rotation.x = -Math.sin(walk) * 0.5;
    m.arms[0].rotation.x = -Math.sin(walk) * 0.4; m.arms[1].rotation.x = Math.sin(walk) * 0.4;
    if (m.cape) m.cape.rotation.x = 0.4 + Math.sin(t * 6) * 0.1;
    pGround.scale.setScalar(isBig ? 1.5 : 0.8);
    if (isBig) { previewCam.position.set(0, 2.0, 6.4); previewCam.lookAt(0, 1.4, 0); }
    else { previewCam.position.set(0, 1.0, 3.2); previewCam.lookAt(0, 0.66, 0); }
    previewCam.aspect = p.w / p.h; previewCam.updateProjectionMatrix();
    const vx = p.x * s, vy = (UH - p.y - p.h) * s, vw = p.w * s, vh = p.h * s;
    renderer.setViewport(vx, vy, vw, vh); renderer.setScissor(vx, vy, vw, vh);
    renderer.render(previewScene, previewCam);
  });
  renderer.setScissorTest(false);
}

// ---------- SPEC-040 AC 3: the previews without the world ----------
// The Character pages cover the 3D, so the world is not drawn there; but the previews are drawn into the same canvas, and a canvas
// that is drawn into only in some windows shows nothing in the rest (its buffer is cleared after each frame). So the last picture of
// the world is saved (snapshotWorld: a copy of the framebuffer, taken by the world frame that opens the page) and each preview frame
// first puts it back with one full-screen draw (blitSnapshot), then draws the previews on it. A resize or a rebuilt scene drops it
// (invalidateSnapshot: main.js asks cadence.js for a world frame again, which saves a new one).
let snapTex = null, snapW = 0, snapH = 0, snapValid = false;
const snapSize = new THREE.Vector2();
export const snapshotValid = () => snapValid;
export function invalidateSnapshot() { snapValid = false; }
export function snapshotWorld() {
  renderer.getDrawingBufferSize(snapSize);
  const w = Math.max(1, Math.floor(snapSize.x)), h = Math.max(1, Math.floor(snapSize.y));
  if (!snapTex || w !== snapW || h !== snapH) {
    if (snapTex) snapTex.dispose();
    snapTex = new THREE.FramebufferTexture(w, h); snapTex.minFilter = snapTex.magFilter = THREE.NearestFilter; snapW = w; snapH = h;
  }
  renderer.copyFramebufferToTexture(snapTex);
  snapValid = true;
}
// the saved picture drawn as it is (raw colour values: it came out of the framebuffer already encoded)
const blitMat = new THREE.ShaderMaterial({
  uniforms: { tMap: { value: null } }, depthTest: false, depthWrite: false, toneMapped: false,
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D tMap; varying vec2 vUv; void main() { gl_FragColor = texture2D(tMap, vUv); }"
});
const blitScene = new THREE.Scene(), blitQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat), blitCam = new THREE.Camera();
// one frame of the Character pages' previews on the saved world (main.js, when cadence.js says "previews")
export function previewsOverSnapshot(t) {
  blitMat.uniforms.tMap.value = snapTex;
  renderer.setViewport(0, 0, CSS_W, CSS_H);
  renderer.render(blitScene, blitCam);
  renderPreviews(t);
}

// called once by main.js, in the start order of the one-file game
export function initPreviews() {
  blitQuad.frustumCulled = false; blitScene.add(blitQuad);
  previewScene.background = new THREE.Color("#9be06f");
  previewScene.add(new THREE.HemisphereLight(0xffffff, 0x5d7f45, 1.7));
  pSun.position.set(2, 5, 4);
  previewScene.add(pSun);
  pGround.rotation.x = -Math.PI / 2;
  previewScene.add(pGround);
}
