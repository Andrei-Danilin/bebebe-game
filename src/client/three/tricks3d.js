// SPEC-042: the 3D pieces of the world tricks, drawn from G.trick of the built level — puddles (flat decals), sprinklers (a head and a faint
// ring of its reach, static; the spray is its own animated group, never batched: `sprays`). buildTrick3D is called by buildMap3D before the
// map is batched and returns the animated groups for batchMap's skip set; syncTrick3D moves them every frame. Client module.
import * as THREE from "three";
import { G } from "../../core/active.js";
import { printAge } from "../../core/tricks/footprints.js";
import { sprinklerPhase } from "../../core/tricks/sprinklers.js";
import { CELL, CFG, COLS, ROWS } from "../../core/config.js";
import { normAng } from "../../core/util.js";
import { LOOK } from "../look.js";
import { mapGroup } from "./mapstate.js";
import { part, toon } from "./materials.js";

/** the sprays of the built map: { g (group), disc (wet ground), pts (the drops), p (the piece) } — rebuilt with the map */
export const sprays = [];
/** the ice-cream trucks (one): { g (group), rot (the angle it is drawn at) } */
export const trucks = [];
/** the waves: { g (group at the strip's edge line), water, foam, p (the piece) } — one per shore strip, the water scaled by the wave's k */
export const waveMeshes = [];
/** Winter's footprints: one pooled InstancedMesh with room for CFG.TRICKS.footprints.max prints, made with the map (so the warm-up has it), shown count prints at a time */
export const prints3d = { im: null };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _from = new THREE.Color(), _to = new THREE.Color();
// a code-built ice-cream truck, 2 cells long along +x, 1 across: cream body, a pink cabin at the front, a striped roof, a cone and a scoop on top, four wheels
function makeTruck(L) {
  const g = new THREE.Group(), box = (w, h, d, c, x, y, z, o = 0.02) => { const m = part(new THREE.BoxGeometry(w, h, d), c, o); m.position.set(x, y, z); g.add(m); return m; };
  box(1.35, 0.55, 0.82, L.body, -0.3, 0.46, 0);                 // the box with the ice cream
  box(0.6, 0.45, 0.8, L.cabin, 0.68, 0.4, 0);                    // the cabin
  box(0.4, 0.2, 0.7, L.window, 0.78, 0.5, 0, 0);                 // the windscreen
  box(1.4, 0.07, 0.86, L.roof, -0.3, 0.76, 0);                   // the roof
  box(1.0, 0.1, 0.86, L.stripe, -0.3, 0.55, 0);                  // the stripe
  for (const z of [-0.43, 0.43]) box(0.5, 0.22, 0.02, L.window, -0.55, 0.55, z, 0);   // the serving windows
  const cone = part(new THREE.ConeGeometry(0.16, 0.34, 10), L.cone, 0.02); cone.rotation.z = Math.PI; cone.position.set(-0.3, 0.97, 0); g.add(cone);
  const scoop = part(new THREE.SphereGeometry(0.17, 12, 8), L.scoop, 0.02); scoop.position.set(-0.3, 1.2, 0); g.add(scoop);
  for (const x of [-0.7, 0.62]) for (const z of [-0.4, 0.4]) { const w = part(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12), L.wheel, 0.02); w.rotation.x = Math.PI / 2; w.position.set(x, 0.17, z); g.add(w); }
  return g;
}
const flat = (geo, mat, x, y, z, sx = 1, sz = 1, piece = "") => {
  const m = new THREE.Mesh(geo, mat); m.userData.piece = piece;   // piece: the probes' tag (__bb.mapPieces, trickMeshes)
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(sx, sz, 1); m.receiveShadow = true;
  return m;
};
// → the animated groups (batchMap leaves them alone)
export function buildTrick3D() {
  sprays.length = 0; trucks.length = 0; waveMeshes.length = 0; prints3d.im = null;
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
  else if (T.name === "waves") {
    const d = CFG.TRICKS.waves.depth;
    T.pieces.forEach((p, i) => {
      // calm: a strip of wet sand with a darker line along its inner edge — the reach of the wave, readable from above (static, batched)
      mapGroup.add(flat(new THREE.PlaneGeometry(1, 1), toon(L.wetSand), p.x + p.w / 2, L.puddleY, p.y + p.h / 2, p.w, p.h, "wave"));
      const horizontal = p.edge === "bottom" || p.edge === "top", inner = p.edge === "bottom" ? p.y : p.edge === "top" ? p.y + p.h : p.edge === "left" ? p.x + p.w : p.x;
      mapGroup.add(flat(new THREE.PlaneGeometry(1, 1), toon(L.wetEdge), horizontal ? p.x + p.w / 2 : inner, L.puddleY + 0.004, horizontal ? inner : p.y + p.h / 2, horizontal ? p.w : 0.1, horizontal ? 0.1 : p.h, "wave"));
      // the wave: a sheet of water that rolls in from the edge (its depth follows k), a foam line at its front; one animated group, never batched
      const ix = p.edge === "left" ? 1 : p.edge === "right" ? -1 : 0, iz = p.edge === "bottom" ? -1 : p.edge === "top" ? 1 : 0;
      const g = new THREE.Group();
      g.position.set(p.edge === "left" ? 0 : p.edge === "right" ? COLS : p.x + p.w / 2, 0, p.edge === "top" ? 0 : p.edge === "bottom" ? ROWS : p.y + p.h / 2);
      g.rotation.y = Math.atan2(-ix, -iz); g.visible = false;
      const wm = new THREE.MeshBasicMaterial({ color: L.water, transparent: true, opacity: L.waterAlpha, depthWrite: false }); wm.userData.own = true;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(p.len, 1).rotateX(-Math.PI / 2), wm); water.position.y = L.puddleY + 0.012; g.add(water);
      const fm = new THREE.MeshBasicMaterial({ color: L.foam, transparent: true, opacity: 0.9, depthWrite: false }); fm.userData.own = true;
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(p.len, 0.16).rotateX(-Math.PI / 2), fm); foam.position.y = L.puddleY + 0.02; g.add(foam);
      mapGroup.add(g); skip.push(g);
      waveMeshes.push({ g, water, foam, p, i, d });
    });
  } else if (T.name === "footprints") {
    const geo = new THREE.CircleGeometry(1, 12); geo.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, toon("#ffffff"), CFG.TRICKS.footprints.max);
    im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
    for (let i = 0; i < im.instanceMatrix.count; i++) im.setColorAt(i, _c.set(L.print));
    mapGroup.add(im); skip.push(im); prints3d.im = im;
  } else if (T.name === "truck" && T.pieces.length) {
    const g = makeTruck(L.truck), st = T.st;
    g.position.set(st.x / CELL, 0, st.y / CELL); g.rotation.y = -st.dir;
    mapGroup.add(g); skip.push(g);
    trucks.push({ g, rot: -st.dir });
  }
  return skip;
}
// the probe (__bb.trickMeshes): what the map has of the trick — the puddle parts, the ring parts, and each spray: shown, its wet ground shown, drawn by a batch (it must not be)
export function trickMeshes() {
  let puddles = 0, rings = 0;
  if (mapGroup) mapGroup.traverse(o => { if (o.userData.piece === "puddle") puddles++; else if (o.userData.piece === "sprayRing") rings++; });
  return { puddles, rings, waves: waveMeshes.map(w => ({ i: w.i, on: w.g.visible, k: +w.water.scale.z.toFixed(3), batched: [w.g, w.water, w.foam].some(o => o.layers.mask !== 1) })), prints: prints3d.im ? { shown: prints3d.im.count, room: prints3d.im.instanceMatrix.count, batched: prints3d.im.layers.mask !== 1 } : null, trucks: trucks.map(t => ({ x: t.g.position.x * CELL, y: t.g.position.z * CELL, batched: t.g.layers.mask !== 1 || t.g.children.some(c => c.layers.mask !== 1) })), sprays: sprays.map(s => ({ i: s.i, on: s.g.visible, wet: s.disc.visible, batched: [s.g, s.disc, s.pts].some(o => o.layers.mask !== 1) })) };
}
// the prints: every print of the game's trail (oldest first) is an instance; it shrinks a little and fades toward the snow as it ages, and goes
function syncPrints(T, L) {
  const im = prints3d.im, list = T.st.prints, n = Math.min(list.length, im.instanceMatrix.count), life = CFG.TRICKS.footprints.life;
  _from.set(L.print); _to.set(L.printFaded);
  for (let i = 0; i < n; i++) {
    const p = list[i], left = Math.max(0, 1 - printAge(T, p) / life), k = L.printSize * (0.7 + 0.3 * left);
    _e.set(0, -p.dir, 0); _q.setFromEuler(_e);
    _p.set(p.x / CELL - Math.sin(p.dir) * p.side * L.printSide, L.printY, p.y / CELL + Math.cos(p.dir) * p.side * L.printSide);
    _s.set(k * L.printLen, 1, k * L.printWide);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
    im.setColorAt(i, _c.copy(_from).lerp(_to, 1 - left));
  }
  im.count = n;
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
}
// every frame: the sprays follow the sprinklers' cycle (the game's trick clock) and the drops fly (the frame time t)
export function syncTrick3D(t) {
  const T = G.trick, L = LOOK.TRICK_LOOK;
  if (!T) return;                                                        // (the map in 3D may be one game behind the game: each piece reads only its own trick)
  if (T.name === "truck") for (const k of trucks) {                                              // the truck: where the core has it, turning smoothly, bouncing while it drives
    const st = T.st, want = -st.dir;
    k.rot += normAng(want - k.rot) * L.truck.turn;
    k.g.position.set(st.x / CELL, st.stopped ? 0 : Math.abs(Math.sin(t * L.truck.bobSpeed)) * L.truck.bob, st.y / CELL);
    k.g.rotation.y = k.rot;
  }
  if (T.name === "footprints" && prints3d.im) syncPrints(T, L);
  if (T.name === "waves") for (const w of waveMeshes) {                    // the wave rolls in over the band and runs back; the foam wobbles at its front
    const k = T.st.k, depth = w.d * k;
    w.g.visible = k > 0.001;
    w.water.scale.z = Math.max(depth, 0.0001); w.water.position.z = -depth / 2;
    w.foam.position.z = -depth; w.foam.scale.x = 0.96 + 0.04 * Math.sin(t * 3 + w.i);
  }
  if (T.name !== "sprinklers" || !sprays.length) return;
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
