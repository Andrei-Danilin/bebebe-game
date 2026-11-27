// SPEC-011: look3D(part): how the 3D scene is drawn, for the tests (SPEC-021). Client module (moved out of index.html in
// Phase C).

import * as THREE from "three";
import { CELL, COLS, ROWS, W } from "../../core/config.js";
import { charGroup, modelOf } from "./characters.js";
import { houseInfo, houseRoofs } from "./houses.js";
import { mapGroup } from "./mapstate.js";
import { disposeTree, gradTex, groundCanvas, groundTex, ownMat, paperMade, paperMat, paperMesh, paperU } from "./materials.js";
import { camera, renderer, scene, sun } from "./setup.js";
import { HATCHED } from "./themes.js";
import { G } from "../../core/active.js";

// SPEC-021 (тесты): как нарисована 3D-сцена. look3D() — всё; look3D("houses") и т. п. — только эта часть (дёшево, для опроса):
// outline — контуры (цвета, во сколько раз толще просьбы детали, неровность, сдвиг, у кого контур, подпись карты), materials — тона
// заливки, типы материалов, тень солнца; paper — бумажное зерно; ground — штрихи земли; hatch — штриховка; houses — домики, крыши
// и луч камеры к голове каждого маленького (roofHides); memory — текстуры и геометрии рендерера
const LOOK_PARTS = {
  outline() {
    const ratios = [], colors = new Set(), kinds = {};
    let hulls = 0, shifted = 0, mapSig = 0;
    const kindOf = o => { for (let q = o; q; q = q.parent) { if (q.userData.piece || q.userData.obj) return q.userData.piece || q.userData.obj; if (q === charGroup) return "character"; } return "other"; };
    const under = (o, root) => { for (let q = o; q; q = q.parent) if (q === root) return true; return false; };
    scene.traverse(o => {
      if (!o.isMesh || !o.userData.hull) return;
      hulls++;
      const box = o.parent.geometry.boundingBox, sz = new THREE.Vector3(); box.getSize(sz);
      const r = ["x", "y", "z"].map(a => (o.scale[a] - 1) * Math.max(sz[a], 0.02) / 2 / o.userData.hull);
      ratios.push(...r);
      colors.add("#" + o.material.color.getHexString());
      if (o.position.lengthSq() > 0) shifted++;
      const k = kindOf(o.parent); kinds[k] = (kinds[k] || 0) + 1;
      if (under(o, mapGroup)) mapSig += r[0] + r[1] * 3 + r[2] * 7 + o.position.x * 11;
    });
    ratios.sort((a, b) => a - b);
    const med = ratios[ratios.length >> 1] || 0;
    return { outline: { colors: [...colors], hulls, k: med, spread: med ? (ratios[ratios.length - 1] - ratios[0]) / med : 0, shifted: hulls ? shifted / hulls : 0, kinds, mapSig: +mapSig.toFixed(6) } };
  },
  materials() {
    const types = new Set();
    let toonOffGradient = 0;
    scene.traverse(o => {
      if (!o.isMesh || o === paperMesh) return;
      types.add(o.material.type);
      if (o.material.isMeshToonMaterial && o.material.gradientMap !== gradTex) toonOffGradient++;
    });
    return { tones: new Set(gradTex.image.data).size === gradTex.image.width ? gradTex.image.width : -1, materials: [...types], toonOffGradient,
      shadow: { intensity: sun.shadow.intensity, radius: sun.shadow.radius } };
  },
  paper: () => ({ paper: { shown: paperMesh.visible, blend: paperMat.blending === THREE.MultiplyBlending ? "multiply" : "other", alpha: paperU.uAlpha.value,
    over3D: paperMesh.parent === scene && !paperMat.depthTest && paperMesh.renderOrder >= Math.max(...scene.children.map(o => o.renderOrder)), made: paperMade } }),
  // земля: по клеткам без пола — сколько разных цветов в середине клетки, во сколько раз цвет меняется поперёк штрихов сильнее,
  // чем вдоль (штрихи идут снизу-слева вверх-вправо), средний цвет
  ground() {
    const gc = groundCanvas, gd = gc.getContext("2d").getImageData(0, 0, gc.width, gc.height).data, k = gc.width / W, B = 12 * k, cols = [], diags = [], mean = [0, 0, 0];
    let nMean = 0;
    const px = (x, y) => (y * gc.width + x) * 4, df = (i, j) => Math.abs(gd[i] - gd[j]) + Math.abs(gd[i + 1] - gd[j + 1]) + Math.abs(gd[i + 2] - gd[j + 2]);
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const x0 = (cx + 0.5) * CELL * k - B / 2, y0 = (cy + 0.5) * CELL * k - B / 2;
      if (G.floors.some(f => (cx + 1) * CELL > f.x && cx * CELL < f.x + f.w && (cy + 1) * CELL > f.y && cy * CELL < f.y + f.h)) continue;
      const seen = new Set(); let along = 0, across = 0;
      for (let y = y0 + 3; y < y0 + B - 3; y++) for (let x = x0 + 3; x < x0 + B - 3; x++) {
        const i = px(x, y); seen.add((gd[i] << 16) | (gd[i + 1] << 8) | gd[i + 2]);
        along += df(i, px(x + 3, y - 3)); across += df(i, px(x + 3, y + 3));
        mean[0] += gd[i]; mean[1] += gd[i + 1]; mean[2] += gd[i + 2]; nMean++;
      }
      cols.push(seen.size); diags.push(along ? across / along : 1);
    }
    const midOf = a => (a.sort((p, q) => p - q), a[a.length >> 1] || 0);
    return { ground: { colors: midOf(cols), diag: midOf(diags), mean: mean.map(v => Math.round(v / Math.max(1, nMean))) } };
  },
  // штриховка: стены, домики и крыши карты — у всех ли материал со штриховкой; сколько программ со штриховкой собрано
  hatch() {
    const plain = [];
    let pieces = 0;
    if (mapGroup) mapGroup.traverse(q => { if (q.isMesh && HATCHED.has(q.userData.piece)) { pieces++; if (!q.material.userData.hatch) plain.push(q.userData.piece); } });
    return { hatch: { pieces, plain: [...new Set(plain)], programs: (renderer.info.programs || []).filter(q => q.cacheKey.includes("hatch")).length } };
  },
  houses: () => ({
    houses: houseInfo && { snow: houseInfo.snow,
      kid: houseInfo.kid && { ...houseInfo.kid, fade: undefined, alpha: houseInfo.kid.fade.a, glow: houseInfo.kid.fade.glowNow || 0 },
      big: houseInfo.big && { ...houseInfo.big, fade: undefined, alpha: houseInfo.big.fade.a } },
    roofHides: G.littles.map(l => {                       // луч от камеры к голове маленького: упирается ли в непрозрачную крышу
      const m = modelOf(l);
      if (!m) return false;
      const head = m.head.getWorldPosition(new THREE.Vector3()), dir = head.clone().sub(camera.position), dist = dir.length();
      const hits = new THREE.Raycaster(camera.position.clone(), dir.normalize(), 0, dist).intersectObjects(houseRoofs.flatMap(hr => hr.meshes), false);
      return hits.some(h => h.object.visible && h.object.material.opacity > 0.5);
    }) }),
  memory: () => ({ memory: { ...renderer.info.memory } })
};
// SPEC-025 AC 15 (tests): disposeTree on a test group — an own material with its own texture map, an own material on the shared
// ground texture (and the shared toon gradient): which of them were freed (three.js "dispose" events)
export function disposeCheck() {
  const freed = new Set(), listeners = [];
  const watch = (o, k) => { const fn = () => freed.add(k); o.addEventListener("dispose", fn); listeners.push([o, fn]); return o; };
  const own = watch(new THREE.CanvasTexture(document.createElement("canvas")), "ownMap");
  const a = watch(ownMat("#ffffff"), "material"); a.map = own;
  const b = ownMat("#ffffff"); b.map = groundTex;
  watch(groundTex, "sharedMap"); watch(gradTex, "gradient");
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), b));
  disposeTree(g);
  for (const [o, fn] of listeners) o.removeEventListener("dispose", fn);   // the shared textures keep no test listener
  return { ownMap: freed.has("ownMap"), sharedMap: freed.has("sharedMap"), gradient: freed.has("gradient"), material: freed.has("material") };
}
export function look3D(only) {
  if (only) return LOOK_PARTS[only] ? LOOK_PARTS[only]() : null;
  return Object.assign({}, ...Object.values(LOOK_PARTS).map(f => f()));
}
