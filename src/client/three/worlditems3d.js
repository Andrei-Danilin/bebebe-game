// SPEC-043: the world items in 3D — the comic meshes (football, cupcake, paper plane, watermelon slice, snowball pile; SPEC-021 outlines through part()),
// the flying ones (G.shots: the football rolls and hops, the plane glides and banks, the snowball arcs) and Dad's own poses under them (the cupcake in his
// hands and the chewing, the ice tint and shiver, the head up for the plane). Client module; reads the game only.
import * as THREE from "three";
import { CELL, CFG } from "../../core/config.js";
import { G } from "../../core/active.js";
import { LOOK } from "../look.js";
import { disposeTree, part, sphere, toon } from "./materials.js";
import { itemMeshes, shotGroup, shotMeshes } from "./pools.js";
import { P } from "./setup.js";

const L = () => LOOK.WORLD_ITEM_LOOK;
/** the kinds that lie flat on the ground (the pickups hover and turn) */
export const LYING_KINDS = Object.freeze(["watermelon", "cupcake"]);

function football() {
  const c = L().football, g = new THREE.Group();
  g.add(part(sphere(0.2, 14, 10), c.ball, 0.025));
  for (const [x, y, z] of [[0, 1, 0], [0.9, 0.35, 0], [-0.9, 0.35, 0], [0, 0.35, 0.9], [0, 0.35, -0.9], [0, -1, 0]]) {   // dark patches on the ball
    const n = new THREE.Vector3(x, y, z).normalize(), p = new THREE.Mesh(sphere(0.07, 8, 6), toon(c.patch));
    p.scale.set(1, 1, 0.45); p.position.copy(n).multiplyScalar(0.19); p.lookAt(n.clone().multiplyScalar(2)); g.add(p);
  }
  return g;
}
function cupcake() {
  const c = L().cupcake, g = new THREE.Group();
  const cup = part(new THREE.CylinderGeometry(0.2, 0.14, 0.17, 14), c.cup, 0.02); cup.position.y = 0.09; g.add(cup);
  const ice = part(sphere(0.21, 14, 10), c.icing, 0.02); ice.scale.y = 0.75; ice.position.y = 0.26; g.add(ice);
  const top = part(new THREE.ConeGeometry(0.13, 0.2, 10), c.icing2, 0.02); top.position.y = 0.46; g.add(top);
  const cherry = part(sphere(0.06, 8, 6), c.cherry, 0.012); cherry.position.y = 0.6; g.add(cherry);
  return g;
}
function plane() {
  const c = L().plane, g = new THREE.Group();
  const wing = new THREE.Shape();                          // a dart: nose along +x, two wings, a notch at the tail
  wing.moveTo(0.34, 0); wing.lineTo(-0.26, 0.24); wing.lineTo(-0.14, 0); wing.lineTo(-0.26, -0.24); wing.closePath();
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.03, bevelEnabled: false }); wg.rotateX(-Math.PI / 2); wg.translate(0, 0.015, 0);
  g.add(part(wg, c.paper, 0.02));
  const keel = new THREE.Shape();                          // the fold down the middle, standing on its edge
  keel.moveTo(0.3, 0); keel.lineTo(-0.2, 0); keel.lineTo(-0.2, -0.13); keel.closePath();
  const kg = new THREE.ExtrudeGeometry(keel, { depth: 0.025, bevelEnabled: false }); kg.translate(0, 0, -0.0125);
  g.add(part(kg, c.fold, 0.015));
  return g;
}
function watermelon() {
  const c = L().melon, g = new THREE.Group();
  const rind = part(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 22, 1, false, 0, Math.PI), c.rind, 0.02); rind.position.y = 0.03; g.add(rind);
  const pale = part(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 22, 1, false, 0, Math.PI), c.rindIn, 0); pale.position.y = 0.04; g.add(pale);
  const flesh = part(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 22, 1, false, 0, Math.PI), c.flesh, 0); flesh.position.y = 0.05; g.add(flesh);
  for (const [x, z] of [[-0.1, 0.1], [0.08, 0.12], [0.0, 0.2], [-0.15, 0.2], [0.14, 0.2]]) { const sd = new THREE.Mesh(sphere(0.022, 6, 4), toon(c.seed)); sd.scale.set(1, 0.5, 1.5); sd.position.set(x, 0.095, z); g.add(sd); }
  return g;
}
function pile() {
  const c = L().snow, g = new THREE.Group();
  for (const [x, z, r] of [[0, 0, 0.24], [0.2, 0.08, 0.17], [-0.17, 0.1, 0.15], [0.02, -0.1, 0.14]]) { const b = part(sphere(r, 12, 9), r > 0.2 ? c.snow : c.shade, 0.02); b.position.set(x, r * 0.8, z); g.add(b); }
  return g;
}
function snowball() { return part(sphere(0.16, 12, 9), L().snow.snow, 0.02); }
const BUILD = { football, cupcake, plane, watermelon, snowball: pile };
/** the mesh of a world item lying on the map (a group with a `body`, like the other pickups); null for a kind that is not one */
export function makeWorldItemMesh(kind) {
  if (!BUILD[kind]) return null;
  const g = new THREE.Group(), body = BUILD[kind]();
  g.add(body); g.userData.body = body; g.userData.kind = kind;
  return g;
}

// ---------- the flying ones ----------
function makeShotMesh(kind) { const m = new THREE.Group(); m.add(kind === "snowball" ? snowball() : BUILD[kind]()); m.traverse(o => { if (o.isMesh) o.castShadow = true; }); return m; }
export function syncShots(t) {
  if (!G.shots.length && !shotMeshes.size) return;
  const K = L(), alive = new Set(G.shots.map(s => s.id));
  for (const [id, g] of shotMeshes) if (!alive.has(id)) { shotGroup.remove(g); disposeTree(g); shotMeshes.delete(id); }
  for (const s of G.shots) {
    let g = shotMeshes.get(s.id);
    if (!g) { g = makeShotMesh(s.kind); shotGroup.add(g); shotMeshes.set(s.id, g); }
    const u = 1 - s.left / (CFG.WORLD_ITEMS[s.kind].cells * CELL), ang = Math.atan2(s.dy, s.dx), inner = g.children[0];
    if (s.kind === "football") {                          // rolls about the axis across its way, with a little hop
      g.position.set(P(s.x), 0.2 + Math.abs(Math.sin(s.t * 18)) * K.hop, P(s.y));
      inner.rotation.set(0, 0, 0); inner.rotateOnWorldAxis(new THREE.Vector3(-s.dy, 0, s.dx), s.t * CFG.WORLD_ITEMS.football.speed * K.roll * 6);
    } else if (s.kind === "plane") {                      // glides high, banks and bobs
      g.position.set(P(s.x), K.plane.alt + Math.sin(s.t * 6) * K.plane.bob, P(s.y));
      g.rotation.set(0, -ang, 0); inner.rotation.set(Math.sin(s.t * 5) * K.plane.bank, 0, -0.12);
    } else {                                              // the snowball goes up and down in an arc and turns
      g.position.set(P(s.x), 0.3 + Math.sin(Math.PI * u) * K.arc, P(s.y));
      inner.rotation.set(s.t * 9, s.t * 7, 0);
    }
  }
}

// ---------- Dad under the items ----------
const ICE = new THREE.Color();
let held = null;
/** after syncBig's own pose: the cupcake in his hands and the chewing, the ice tint and shiver, the head up for the plane (m: his model, b: G.big, t: seconds) */
export function bigWorldPose(m, b, t) {
  const K = L(), eat = b.slip > 0 && b.slipKind === "eat", freeze = b.slip > 0 && b.slipKind === "freeze", watch = b.watch > 0 && b.slip <= 0;
  if (!held || held.userData.model !== m) { if (held && held.parent) held.parent.remove(held); held = cupcake(); held.userData.model = m; held.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
  if (eat) {
    if (held.parent !== m.rig) m.rig.add(held);
    held.visible = true; held.position.set(0, K.held.y, K.held.z); held.scale.setScalar(K.held.s);
    m.arms[0].rotation.x = -1.2; m.arms[1].rotation.x = -1.2; m.arms[0].rotation.z = -0.3; m.arms[1].rotation.z = 0.3;
    m.head.rotation.x = Math.sin(t * K.chewSpeed) * K.chew; m.face.mouth.rotation.z = Math.PI;
    m.stars.visible = false;
  } else held.visible = false;
  if (freeze) {
    ICE.set(K.ice); m.bodyMat.emissive.copy(ICE).multiplyScalar(K.iceK);
    for (const fm of m.faceMats) fm.emissive.copy(ICE).multiplyScalar(K.iceK);
    m.rig.rotation.z = Math.sin(t * 60) * K.shiver; m.arms[0].rotation.x = -0.9; m.arms[1].rotation.x = -0.9; m.arms[0].rotation.z = -0.5; m.arms[1].rotation.z = 0.5;
    m.stars.visible = false;
  }
  if (watch) m.head.rotation.x = -0.25;
}
/** Dad's model is in the pose of lying on his back (the banana, the watermelon), not just standing shocked */
export const lyingPose = b => b.slip > 0 && (b.slipKind === "banana" || b.slipKind === "melon");
/** the probe of the tests (__bb.worldItemMeshes): the world items on the map, the flying ones, and Dad's cupcake in his hands (meshes: parts incl. outlines) */
export function worldItemMeshes() {
  const count = g => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
  return {
    items: [...itemMeshes].filter(([, g]) => g.userData.kind).map(([id, g]) => ({ id, kind: g.userData.kind, y: g.userData.body.position.y, ring: !!g.userData.ring, visible: g.visible, meshes: count(g) })),
    shots: [...shotMeshes].map(([id, g]) => ({ id, kind: (G.shots.find(s => s.id === id) || {}).kind, x: g.position.x, y: g.position.y, z: g.position.z, meshes: count(g) })),
    held: !!held && held.visible && !!held.parent
  };
}
