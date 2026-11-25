// SPEC-011: the wardrobe previews (skinPanels, previewCache, renderPreviews), outfitModel. Client module (moved out of
// index.html in Phase C).

import * as THREE from "three";
import { BIG_SKINS } from "../../core/wardrobe.js";
import { makeLook, skinSel } from "../outfits.js";
import { CSS_W, PHONE, UH, UW } from "../screen.js";
import { ui } from "../state.js";
import { buildBigModel, buildLittleModel, modelOf } from "./characters.js";
import { disposeTree, toon } from "./materials.js";
import { renderer } from "./setup.js";
import { progressGeom } from "../ui/character/progress.js";
import { phoneSkinCols } from "../ui/menu.js";
import { G } from "../../core/active.js";
import { mode } from "../flow.js";

// SPEC-027 (тесты): модель маленького — номер в littles или «p1» / «p2» (превью гардероба, из кэша)
export const outfitModel = who => (typeof who === "number" ? modelOf(G.littles[who]) : previewCache.get("L" + JSON.stringify(makeLook(skinSel[who]))));
// ---------- Превью нарядов (рисуется в «окошки» UI-слоя) ----------
const previewScene = new THREE.Scene();

const pSun = new THREE.DirectionalLight(0xffffff, 2.2);
const pGround = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), toon("#86cf5c"));
const previewCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
const previewCache = new Map();
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
export const skinPanels = () => progressTab() ? [{ key: "p1", ...progressGeom().preview }]
  : PHONE ? phoneSkinCols().map(col => ({ key: col.key, ...col.panel }))
  : SKIN_KEYS.map((key, i) => ({ key, x: skinCx(i) - 95, y: 136, w: 190, h: 140 }));
export function renderPreviews(t) {
  const lp1 = makeLook(skinSel.p1), lp2 = makeLook(skinSel.p2);
  const defs = {
    p1: ["L" + JSON.stringify(lp1), () => buildLittleModel(lp1, false)],
    p2: ["L" + JSON.stringify(lp2), () => buildLittleModel(lp2, false)],
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

// called once by main.js, in the start order of the one-file game
export function initPreviews() {
  previewScene.background = new THREE.Color("#9be06f");
  previewScene.add(new THREE.HemisphereLight(0xffffff, 0x5d7f45, 1.7));
  pSun.position.set(2, 5, 4);
  previewScene.add(pSun);
  pGround.rotation.x = -Math.PI / 2;
  previewScene.add(pGround);
}
