// SPEC-040 AC 2 / AC 5 (RR-42, RR-50): fewer draw calls for the map. After buildMap3D has made the whole map as hundreds of small
// meshes, batchMap draws all that stand still as InstancedMeshes: one per (geometry, material, shadow flags), the instance matrices being
// the meshes' world matrices — the outline hulls included (each hull has its own scale and shift, they are just more instances of the
// part's shape). The original meshes stay in the scene graph, hidden (visible = false): tests and probes that walk the graph (look3D)
// still find every part and hull; three.js does not draw an invisible object, nor cast its shadow.
//
// Trees and bushes fade when a Little One or the Big One is behind them. A fading object is drawn from its own transparent materials
// (ownMat(…, true): the same toon colour with alpha), and only while it fades; the rest of the time it is the instanced, opaque twin
// (the same colour from the shared toon(colour) material, the hulls from the shared OUTLINE) — so a tree is transparent "until a fade
// starts, then while fading, and opaque again when it is fully back" (AC 5). Switching is setFading(): the twin's instances are zeroed
// (a zero-scale matrix draws nothing and casts nothing) and the object's own meshes are shown, or the other way round.
// Client module.

import * as THREE from "three";
import { geoKey, gradTex, OUTLINE, sharedGeo, toon } from "./materials.js";

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// A part that a batch draws is taken off the camera's layer instead of being hidden: an invisible mesh hides its children too, and a part's outline
// hull is its child — one that was not joined with the others (a lone hull) must go on being drawn. three.js tests the layer of each object on its
// own, in the colour pass and in the shadow pass.
const RETIRED = 5;
const retire = o => { o.layers.set(RETIRED); o.userData.batched = true; };
const INSTANCE_MIN = 6;                         // a shape used at least this often (a tree, a fence post) is instanced; fewer are joined by material with the other parts
const twins = new Map();                        // "colour|side" → the opaque material a fading material goes back to (shared by all objects, never freed)
function opaqueTwin(mat) {
  const hex = "#" + mat.color.getHexString();
  if (mat.side === THREE.FrontSide) return toon(hex);
  const k = hex + "|" + mat.side;
  let m = twins.get(k);
  if (!m) { m = new THREE.MeshToonMaterial({ color: hex, gradientMap: gradTex, side: mat.side }); twins.set(k, m); }
  return m;
}

/** a fade object: { g, mats, a, fading, meshes (its own meshes: the ones drawn while it fades), inst: [{ im, i, mtx }] } */
function fadeMeshesOf(f) {
  const own = new Set(f.mats), outlines = new Set(f.mats.map(m => m.userData.outline));
  const list = [];
  f.g.traverse(o => { if (o.isMesh && (own.has(o.material) || outlines.has(o.material))) list.push(o); });
  return list;
}

// switches one fade object between its two drawings (true: its own transparent meshes; false: the opaque instances)
export function setFading(f, on) {
  if (f.fading === on) return;
  f.fading = on;
  for (const o of f.own) o.layers.set(on ? 0 : RETIRED);
  for (const q of f.inst) q.im.setMatrixAt(q.i, on ? ZERO : q.mtx);
  for (const q of f.inst) q.im.instanceMatrix.needsUpdate = true;
}

// a mesh that stands still, opaque, with a material of its own kind (own materials — the roofs' and the fading ones, transparent — never)
const batchable = o => o.isMesh && !o.isInstancedMesh && o.visible && !o.isSkinnedMesh && o.material && !o.material.isShaderMaterial && !Array.isArray(o.material)
  && !o.material.transparent && o.renderOrder === 0 && o.frustumCulled && o.matrixWorld.determinant() > 0;
// the hatching shader (materials.js) reads the world position and normal without the instance matrix: hatched parts are joined, not instanced

/** @param {any} root  @param {{ skip?: Set<any>, fades?: any[] }} opts
 *  skip — subtrees that are animated or have their own rules (the roofs, the water waves); fades — the trees and bushes
 *  @returns {{ instanced: number, batches: number, hidden: number }} */
export function batchMap(root, { skip = new Set(), fades = [] } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();                      // key → [{ o, mat, mtx, fade }]
  const add = (o, mat, fade) => {
    o.geometry = sharedGeo(o.geometry);
    const gk = geoKey(o.geometry) || o.geometry.uuid;
    const key = [gk, mat.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0].join("|");
    let a = groups.get(key);
    if (!a) groups.set(key, a = []);
    a.push({ o, mat, mtx: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), fade });
  };
  const fadeOf = new Map();                      // mesh → its fade object
  for (const f of fades) { f.meshes = fadeMeshesOf(f); f.own = []; f.inst = []; f.fading = false; for (const o of f.meshes) fadeOf.set(o, f); }
  const visit = o => {
    if (skip.has(o)) return;
    if (o.isMesh) {
      const f = fadeOf.get(o);
      if (f) { if (o.matrixWorld.determinant() > 0) { add(o, o.userData.hull ? OUTLINE : opaqueTwin(o.material), f); f.own.push(o); } }
      else if (batchable(o)) add(o, o.material, null);
    }
    for (const c of o.children) visit(c);                       // a part's outline hull is its child
  };
  visit(root);
  let instanced = 0, batches = 0;
  const singles = new Map();                     // (material, shadow flags) → the lone meshes, joined below
  for (const list of groups.values()) {
    const fadeList = list.some(q => q.fade), hatched = !!list[0].mat.userData.hatch;
    if (hatched || (list.length < INSTANCE_MIN && !fadeList)) {   // a few static parts of a shape (and any hatched one) are joined with the others of their material; a fading one must have its opaque twin
      for (const q of list) {
        const k = joinKey(q.o);
        let a = singles.get(k);
        if (!a) singles.set(k, a = []);
        a.push(q.o);
      }
      continue;
    }
    const first = list[0], im = new THREE.InstancedMesh(first.o.geometry, first.mat, list.length);
    im.castShadow = first.o.castShadow; im.receiveShadow = first.o.receiveShadow;
    list.forEach((q, i) => {
      im.setMatrixAt(i, q.mtx);
      if (q.fade) q.fade.inst.push({ im, i, mtx: q.mtx });
      retire(q.o);
    });
    im.instanceMatrix.needsUpdate = true;
    root.add(im);
    instanced += list.length; batches++;
  }
  for (const list of singles.values()) if (list.length > 1) instanced += joinMeshes(root, list, inv) && list.length;
  // a fade object whose parts were not all batched (a mirrored one) stays what it was: its own meshes, shown
  for (const f of fades) if (!f.inst.length) { f.fading = true; for (const o of f.own) o.layers.set(0); }
  return { instanced, batches, hidden: instanced };
}

/** the opacity a fade object shows, for the probes: drawn from which material */
export function fadeState(f) {
  const drawn = f.fading ? f.meshes[0] && f.meshes[0].material : f.inst[0] && f.inst[0].im.material;
  return { a: +f.a.toFixed(3), fading: !!f.fading, transparent: !!(drawn && drawn.transparent), instanced: !f.fading && f.inst.length > 0 };
}

// ---------- SPEC-040 AC 2: a character's parts that move together are drawn together ----------
// A model is a few moving nodes (the rig, two legs, two arms, the head, the cape, the mouth, the brows) each carrying a dozen small meshes
// — a part and its outline hull each, a mesh per colour of the face, the hair, the hat, the outfit. mergeModel joins, per moving node,
// the meshes of one material (and one shadow flag) into one mesh in that node's own space, so the model costs a draw call per node and
// material instead of one per part: the hulls (one OUTLINE material) of a leg are one mesh, the pants-coloured parts of it another. The
// materials are the very same objects (the cloak, the blush and the colour changes of a boss still work on them) and the original meshes
// stay in the graph, hidden. What is not joined: a part that is hidden when the model is built (boots, the cast, the shield, the ghost:
// switched on and off during play), the things the game switches or moves by themselves (m.dyn: gloves, the dizzy stars, the blush,
// the sweat, the blink light), transparent ones, mirrored ones.
const normalM = new THREE.Matrix3(), vv = new THREE.Vector3();
// Parts of different colours are joined into one mesh when their material is a plain toon one (toon(colour): the shared 2-tone gradient, front
// faces, no emission, not changed during play): the colour of each part goes into a vertex colour and the mesh is drawn with this one
// material — the same colour times the same light, one draw call (and one shadow draw) instead of one per colour.
const VERTEX_TOON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex });
const plainToon = m => m.isMeshToonMaterial && !m.userData.own && !m.userData.hatch && !m.transparent && m.side === THREE.FrontSide && m.gradientMap === gradTex && m.emissive.getHex() === 0 && !m.map;
const joinKey = o => (plainToon(o.material) ? "vc" : o.material.uuid) + "|" + (o.castShadow ? 1 : 0) + "|" + (o.receiveShadow ? 1 : 0);
// joins the meshes of one material into one mesh of `parent` (inv: the inverse of the parent's world matrix: the vertices go into its space);
// the originals are hidden. Returns the number of meshes joined
function joinMeshes(parent, list, inv) {
  const first = list[0], lit = first.material.side !== THREE.BackSide && !first.material.isMeshBasicMaterial, vc = plainToon(first.material);
  const parts = list.map(o => { const tmp = !!o.geometry.index, g = tmp ? o.geometry.toNonIndexed() : o.geometry; return { g, tmp, mtx: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }; });
  const n = parts.reduce((s, p) => s + p.g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = lit ? new Float32Array(n * 3) : null, col = vc ? new Float32Array(n * 3) : null;
  let at = 0;
  for (let pi = 0; pi < parts.length; pi++) {
    const { g, tmp, mtx } = parts[pi], cl = vc ? list[pi].material.color : null;
    const p = g.attributes.position, nr = g.attributes.normal;
    normalM.getNormalMatrix(mtx);
    for (let i = 0; i < p.count; i++, at++) {
      vv.fromBufferAttribute(p, i).applyMatrix4(mtx); pos[at * 3] = vv.x; pos[at * 3 + 1] = vv.y; pos[at * 3 + 2] = vv.z;
      if (nor && nr) { vv.fromBufferAttribute(nr, i).applyMatrix3(normalM).normalize(); nor[at * 3] = vv.x; nor[at * 3 + 1] = vv.y; nor[at * 3 + 2] = vv.z; }
      if (col) { col[at * 3] = cl.r; col[at * 3 + 1] = cl.g; col[at * 3 + 2] = cl.b; }
    }
    if (tmp) g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (nor) geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, vc ? VERTEX_TOON : first.material);
  mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.userData.joined = list.length;
  parent.add(mesh);
  for (const o of list) retire(o);
  return list.length;
}
export function mergeModel(m) {
  m.root.updateMatrixWorld(true);
  const domains = new Set([m.rig, ...m.legs, ...m.arms, m.head, m.cape, m.face && m.face.mouth, ...(m.face ? m.face.brows : [])].filter(Boolean));
  const dyn = new Set([m.cast, m.ghost, m.bubble, m.ring, m.dizzyStars, m.stars, m.sweat, m.blink, m.cheeks, ...(m.gloveParts || []), ...(m.boots || [])].filter(Boolean));
  const lists = new Map();                          // domain → Map(key → [mesh])
  const visit = (o, d) => {
    if (dyn.has(o) || !o.visible) return;
    if (domains.has(o)) d = o;
    if (o.isMesh && d && !o.isInstancedMesh && o.material && !Array.isArray(o.material) && !o.material.transparent && !o.material.isShaderMaterial
        && o.matrixWorld.determinant() > 0 && o.geometry.attributes.position) {
      let km = lists.get(d);
      if (!km) lists.set(d, km = new Map());
      const key = joinKey(o);
      let a = km.get(key);
      if (!a) km.set(key, a = []);
      a.push(o);
    }
    for (const c of o.children) visit(c, d);
  };
  visit(m.root, null);
  let joined = 0;
  for (const [d, km] of lists) {
    const inv = new THREE.Matrix4().copy(d.matrixWorld).invert();
    for (const list of km.values()) {
      if (list.length < 2) continue;
      joined += joinMeshes(d, list, inv);
    }
  }
  return joined;
}
