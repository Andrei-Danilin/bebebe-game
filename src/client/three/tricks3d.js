// SPEC-042: the 3D pieces of the world tricks, drawn from G.trick of the built level — puddles (flat decals), sprinklers (a head and a faint
// ring of its reach, static; the spray is its own animated group, never batched: `sprays`). buildTrick3D is called by buildMap3D before the
// map is batched and returns the animated groups for batchMap's skip set; syncTrick3D moves them every frame. Client module.
import * as THREE from "three";
import { G } from "../../core/active.js";
import { sprinklerPhase } from "../../core/tricks/sprinklers.js";
import { LOOK } from "../look.js";
import { mapGroup } from "./mapstate.js";
import { toon } from "./materials.js";

/** the sprays of the built map: { g (group), disc (wet ground), pts (the drops), p (the piece) } — rebuilt with the map */
export const sprays = [];
const flat = (geo, mat, x, y, z, sx = 1, sz = 1, piece = "") => {
  const m = new THREE.Mesh(geo, mat); m.userData.piece = piece;   // piece: the probes' tag (__bb.mapPieces, trickMeshes)
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(sx, sz, 1); m.receiveShadow = true;
  return m;
};
// → the animated groups (batchMap leaves them alone)
export function buildTrick3D() {
  sprays.length = 0;
  const T = G.trick, skip = [];
  if (!T || !mapGroup) return skip;
  const L = LOOK.TRICK_LOOK;
  if (T.name === "puddles") {
    T.pieces.forEach((p, i) => {
      const sx = 1.12 + 0.18 * Math.sin(i * 2.7 + p.cx), sz = 0.92 + 0.14 * Math.cos(i * 1.9 + p.cy);   // not quite round, the same on every device
      mapGroup.add(flat(new THREE.CircleGeometry(p.r * 1.08, 24), toon(L.puddleRim), p.cx, L.puddleY, p.cy, sx, sz, "puddle"));
      mapGroup.add(flat(new THREE.CircleGeometry(p.r * 0.9, 24), toon(L.puddle), p.cx, L.puddleY + 0.004, p.cy, sx, sz, "puddle"));
      mapGroup.add(flat(new THREE.CircleGeometry(p.r * 0.22, 12), toon(L.puddleShine), p.cx - p.r * 0.25 * sx, L.puddleY + 0.008, p.cy - p.r * 0.2 * sz, 1.4, 0.7, "puddle"));
    });
  } else if (T.name === "sprinklers") {
    T.pieces.forEach((p, i) => {
      mapGroup.add(flat(new THREE.RingGeometry(p.r * 0.96, p.r, 40), toon(L.sprayRing), p.cx, L.puddleY, p.cy, 1, 1, "sprayRing"));   // how far it reaches
      const head = new THREE.Group(); head.position.set(p.cx, 0, p.cy);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 12), toon(L.headBase)); base.position.y = 0.05; head.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8), toon(L.headStem)); stem.position.y = 0.23; head.add(stem);
      const nozzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(L.headNozzle)); nozzle.position.y = 0.4; head.add(nozzle);
      mapGroup.add(head);
      // the spray: wet ground + drops, shown while it drips or sprays
      const g = new THREE.Group(); g.position.set(p.cx, 0, p.cy); g.visible = false;
      const dm = new THREE.MeshBasicMaterial({ color: L.sprayWet, transparent: true, opacity: L.sprayWetAlpha, depthWrite: false }); dm.userData.own = true;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r, 36), dm); disc.rotation.x = -Math.PI / 2; disc.position.y = L.puddleY + 0.01; g.add(disc);
      const pos = new Float32Array(L.dropN * 3), geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color: L.sprayDrop, size: L.dropSize, transparent: true, opacity: 0.9, depthWrite: false }); pm.userData.own = true;
      const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; g.add(pts);
      mapGroup.add(g); skip.push(g);
      sprays.push({ g, disc, pts, p, i });
    });
  }
  return skip;
}
// the probe (__bb.trickMeshes): what the map has of the trick — the puddle parts, the ring parts, and each spray: shown, its wet ground shown, drawn by a batch (it must not be)
export function trickMeshes() {
  let puddles = 0, rings = 0;
  if (mapGroup) mapGroup.traverse(o => { if (o.userData.piece === "puddle") puddles++; else if (o.userData.piece === "sprayRing") rings++; });
  return { puddles, rings, sprays: sprays.map(s => ({ i: s.i, on: s.g.visible, wet: s.disc.visible, batched: [s.g, s.disc, s.pts].some(o => o.layers.mask !== 1) })) };
}
// every frame: the sprays follow the sprinklers' cycle (the game's trick clock) and the drops fly (the frame time t)
export function syncTrick3D(t) {
  const T = G.trick, L = LOOK.TRICK_LOOK;
  if (!T || !sprays.length) return;
  for (const s of sprays) {
    const ph = sprinklerPhase(s.p, T.t);
    s.g.visible = ph !== "off";
    if (ph === "off") { s.disc.visible = false; continue; }
    const spray = ph === "spray", a = s.pts.geometry.attributes.position.array, n = a.length / 3, R = s.p.r * L.reach;
    s.disc.visible = spray;
    if (spray) s.disc.material.opacity = L.sprayWetAlpha * (0.8 + 0.2 * Math.sin(t * 5 + s.i));
    for (let k = 0; k < n; k++) {
      if (spray) {
        const u = (t * L.dropSpeed + k / n) % 1, ang = k * 2.39996;        // a drop leaves the nozzle and lands on the ring
        a[k * 3] = Math.cos(ang) * R * u; a[k * 3 + 2] = Math.sin(ang) * R * u; a[k * 3 + 1] = 0.4 + L.dropH * 4 * u * (1 - u);
      } else if (k < L.dripN) {                                              // the warning: a few drops fall from the nozzle
        const u = (t * L.dripSpeed + k / L.dripN) % 1;
        a[k * 3] = Math.cos(k * 2.4) * 0.12 * u; a[k * 3 + 2] = Math.sin(k * 2.4) * 0.12 * u; a[k * 3 + 1] = 0.4 * (1 - u * u);
      } else { a[k * 3] = 0; a[k * 3 + 1] = -5; a[k * 3 + 2] = 0; }
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
  }
}
