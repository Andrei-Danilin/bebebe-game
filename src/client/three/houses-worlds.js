// SPEC-044: the houses of every world — the kids' clean one with the heart on the door and Dad's messy one (HOUSE_LOOK[world].kids / .dad
// name the builder): Park treehouse + garden shed, Field dugout + groundskeeper's hut, City shop + garage, School bus + caretaker's room,
// Beach hut on posts + shabby shack, Winter igloo + log cabin. The frame, the doors and the safe zone are the level's own (houseRect,
// houseDoors); only the look changes. Static pieces are plain toon parts (batched by batchMap); the roofs fade (houseRoofs). Client module.

import * as THREE from "three";
import { TAU } from "../../core/config.js";
import { mapGroup } from "./mapstate.js";
import { ownMat, part, sphere, toon } from "./materials.js";
import { WALL_H } from "./setup.js";
import { THEMES } from "./themes.js";
import { addRoofFade, dadMess, decal, domeRoof, faceTo, flatRoof, heartGeo, houseDoors, houseRect, houseRoof, kidsDoors, kidsFlowers, roofChimney, roofPatches, slopeAt, wallFace } from "./housekit.js";

const shade = (c, k) => "#" + new THREE.Color(c).multiplyScalar(k).getHexString();
// a prop in the world (cells): placed, turned, no shadow (small things)
const put = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; m.traverse(o => { o.castShadow = false; }); mapGroup.add(m); return m; };
const box = (w, h, d, c, o = 0.012) => part(new THREE.BoxGeometry(w, h, d), c, o);
const cyl = (r0, r1, h, c, o = 0.012, seg = 10) => part(new THREE.CylinderGeometry(r0, r1, h, seg), c, o);
const grp = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
const at = (m, x, y, z, rx = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; return m; };
// the longest stretch of a wall face (or null)
const longest = f => f.runs.reduce((b, r) => (!b || r[1] - r[0] > b[1] - b[0] ? r : b), null);

// a round decal on a wall face: r wide, centre t along, y high
function disc(face, t, y, r, color, thick = 0.03) {
  const p = face.at(t, 0.012 + thick / 2), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, 16), toon(color));
  m.rotation.x = Math.PI / 2;
  const g = grp(m); g.position.set(p.x, y, p.z); g.rotation.y = Math.atan2(face.nx, face.nz); m.castShadow = false; mapGroup.add(g);
}
const windowDecal = (face, t, y, w, h, frame, glass) => { decal(face, t, y, w, h, frame, 0.03); decal(face, t, y, w * 0.74, h * 0.7, glass, 0.045); };
// a sock hanging (cells): white leg and a grey toe
function sock(x, y, z, ry, B) {
  const g = grp(box(0.08, 0.2, 0.03, B.sock, 0.008), at(box(0.14, 0.07, 0.03, B.sockToe, 0.008), 0.03, -0.1, 0));
  return put(g, x, y, z, ry);
}
// a flat ellipse on the ground (a puddle, sand)
function patch(x, z, rx, rz, color, ry = 0) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 14), toon(color));
  m.rotation.x = -Math.PI / 2; m.scale.set(rx, rz, 1);
  const g = grp(m); g.position.set(x, 0.014, z); g.rotation.y = ry; m.castShadow = false; mapGroup.add(g);
}
// balls of leaves on a roof (instanced: the fill and its outline are one call each; they fade with the roof): [{ x, y, z, r, c }] in the roof's frame.
// A ball never reaches more than `over` cells past the roof's edge (a roof only fades for someone inside its frame: nobody may stand under a solid ball outside it)
function blobs(roof, list, over = 0.3) {
  const clamp = (v, half, r) => Math.max(-(half + over - r), Math.min(half + over - r, v));
  for (const b of list) { b.x = clamp(b.x, roof.len / 2, b.r); b.z = clamp(b.z, roof.span / 2, b.r); }
  const mat = ownMat("#ffffff", true), geo = sphere(1, 12, 8), im = new THREE.InstancedMesh(geo, mat, list.length), hm = new THREE.InstancedMesh(geo, mat.userData.outline, list.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  list.forEach((b, i) => {
    p.set(b.x, b.y, b.z);
    im.setMatrixAt(i, mtx.compose(p, q, s.set(b.r, b.r * 0.85, b.r))); im.setColorAt(i, col.set(b.c));
    hm.setMatrixAt(i, mtx.compose(p, q, s.set(b.r + 0.07, b.r * 0.85 + 0.07, b.r + 0.07)));
  });
  roof.add(im, mat); roof.g.add(hm);
}
// a row of instanced pieces on a roof (thatch ends, icicles): [{ x, y, z, rx }]
function strands(roof, geo, color, list) {
  const mat = ownMat(color, true), im = new THREE.InstancedMesh(geo, mat, list.length), mtx = new THREE.Matrix4(), e = new THREE.Euler(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  list.forEach((b, i) => im.setMatrixAt(i, mtx.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(b.rx || 0, 0, b.rz || 0)), one)));
  roof.add(im, mat);
}
// a flat plate on the top of a flat roof (a windshield, a hatch, a stain): w along x, d along z, at (x, z) of the roof's frame
function plate(roof, w, d, x, z, color, o = 0.012) {
  const m = ownMat(color, true), q = roof.add(part(new THREE.BoxGeometry(w, 0.03, d), "", o, m), m);
  q.position.set(x, roof.rh + 0.015, z); q.castShadow = false; return q;
}
// planks on a hip roof: n strips down the front slope (one instanced mesh)
function plankStrips(roof, color, n) {
  const mat = ownMat(color, true), im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.012, roof.span * 0.5), mat, n), mtx = new THREE.Matrix4(), rot = new THREE.Matrix4();
  for (let i = 0; i < n; i++) im.setMatrixAt(i, mtx.makeTranslation((i / n - 0.5) * (roof.len - 0.6), roof.rh * 0.42 + 0.03, roof.span / 2 * 0.58).multiply(rot.makeRotationX(Math.atan2(roof.rh, roof.span / 2))));
  roof.add(im, mat);
}
// SPEC-044 AC 2: Dad's mess on the roof, where the top-down camera sees it: a sock lying on it, a heap of trash, wavy stink lines over it
// (the sock and the trash are own transparent parts: they fade with the roof; the stink lines are one instanced tube)
function roofMess(roof, B) {
  const spot = (t, x) => (roof.flat ? { x, y: roof.rh + 0.01, z: roof.span / 2 * (1 - t * 1.4), rx: 0 } : slopeAt(roof, t, x));
  const a = ownMat(B.sock, true), b = ownMat(B.sockToe, true), leg = part(new THREE.BoxGeometry(0.22, 0.03, 0.6), "", 0.008, a), toe = part(new THREE.BoxGeometry(0.32, 0.03, 0.2), "", 0.008, b), sg = new THREE.Group();
  toe.position.set(0.06, 0, 0.38); sg.add(leg, toe);
  const s = spot(0.3, -roof.len * 0.3);
  sg.position.set(s.x, s.y + 0.03, s.z); sg.rotation.set(s.rx, 0.6, 0);
  leg.castShadow = toe.castShadow = false; roof.g.add(sg); roof.mats.push(a, b); roof.meshes.push(leg, toe);
  const heap = [], t0 = spot(0.3, roof.len * 0.24);
  [[0, 0, 0.17], [0.24, 0.1, 0.14], [-0.2, 0.12, 0.15], [0.08, -0.22, 0.13], [-0.1, -0.2, 0.12]].forEach(([dx, dz, r], i) => heap.push({ x: t0.x + dx, y: t0.y + r * 0.5, z: t0.z + dz, r, c: B.trash[i % B.trash.length] }));
  blobs(roof, heap);
  const pts = [];
  for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(Math.sin(k * 1.3) * 0.15, k * 0.18, 0));
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.05, 5), base = roof.rh + 0.1;
  strands(roof, tube, B.stink, [-0.34, 0, 0.34].map(f => ({ x: f * roof.len * 0.35, y: base, z: -roof.span * 0.12 })));
  return { sock: true, trash: heap.length, stink: 3 };
}
// strips of a clipped run: the stretches of the runs of a face that stay `gap` away from the doors' leaves (the open leaves stand beside the door)
function clearRuns(face, doors, gap) {
  const out = [];
  for (const [a, b] of face.runs) {
    let cur = [[a, b]];
    for (const d of doors.filter(d => d.side === face.side)) {
      const m = face.tx ? d.x - face.at(0).x : d.z - face.at(0).z, lo = m - d.len / 2 - gap, hi = m + d.len / 2 + gap;
      cur = cur.flatMap(([x, y]) => (hi <= x || lo >= y ? [[x, y]] : [[x, Math.min(y, lo)], [Math.max(x, hi), y]].filter(r => r[1] - r[0] > 0.1)));
    }
    out.push(...cur);
  }
  return out;
}
const VISIBLE = ["bottom", "left", "right"];           // the faces the camera sees (it looks from the south)

// ---------- the kids' house: a roof that fades (and glows green while solid), the walls' decals, the door with hearts ----------
// o: roof(KR, K, place) → roof; extras(roof, KR, K); walls(KR, doors, K, rnd); doors(doors, K) → hearts (default: leaves with hearts and a heart mat)
function kidsHouse(c, o) {
  const { place, build, rnd, info, look: K } = c, KR = houseRect("home");
  if (!KR) return;
  const { doors } = houseDoors("home", KR), roof = o.roof(KR, K, place);
  if (o.extras) o.extras(roof, KR, K);
  mapGroup.add(roof.g);
  const fade = addRoofFade(KR, roof); fade.glow = true;
  if (o.walls) o.walls(KR, doors, K, rnd, roof);
  const heartPts = (o.doors || kidsDoors)(doors, K, KR), flowers = K.flowerN ? kidsFlowers(KR, doors, K, rnd) : 0;
  info.kid = { build, roof: true, hearts: heartPts.length, heartPts, doors: doors.map(d => ({ x: d.x, z: d.z, nx: d.nx, nz: d.nz, len: d.len })), frame: KR, flowers, clean: true, fade };
  if (THEMES[place].snow) info.snow++;
}
const hipRoof = (KR, K, place) => houseRoof(KR, K.roof, place, 0, { roofH: K.roofH, side: K.roofShade, snow: K.snow, eave: K.eave });
const slabRoof = (KR, K) => flatRoof(KR, { color: K.roof, side: K.roofSide ?? shade(K.roof, K.roofShade ?? 0.78), panel: K.panel, panelPad: K.panelPad, thick: K.thick, eave: K.eave });
// vertical plank lines on the faces
function plankLines(KR, doors, K) {
  for (const side of VISIBLE) {
    const f = wallFace(KR, doors, side);
    for (const [a, b] of f.runs) for (let t = a + 0.3; t < b - 0.1; t += K.plankStep) decal(f, t, WALL_H / 2, 0.03, WALL_H - 0.12, K.plankLine, 0.02);
  }
}

const KIDS = {
  // Park: a treehouse — a thick trunk behind it, a crown of leaves round the roof, a rope ladder at the wall, windows
  treehouse: c => kidsHouse(c, {
    roof: hipRoof,
    extras(roof, KR, K) {
      const hx = roof.len / 2, hz = roof.span / 2, [l0, l1, l2] = K.leaves;
      blobs(roof, [{ x: -0.78 * hx, y: 0.5, z: -0.9 * hz, r: 1, c: l0 }, { x: -0.35 * hx, y: 0.95, z: -hz - 0.2, r: 1.15, c: l1 }, { x: 0.15 * hx, y: 1.15, z: -hz - 0.15, r: 1.3, c: l0 },
        { x: 0.62 * hx, y: 0.85, z: -0.95 * hz, r: 1.1, c: l2 }, { x: 0.95 * hx, y: 0.3, z: -0.1 * hz, r: 0.85, c: l1 }, { x: -0.97 * hx, y: 0.25, z: 0.1 * hz, r: 0.8, c: l2 },
        { x: -0.97 * hx, y: 0.15, z: 0.8 * hz, r: 0.6, c: l0 }, { x: 0.97 * hx, y: 0.15, z: 0.8 * hz, r: 0.6, c: l1 }]);
    },
    walls(KR, doors, K) {
      plankLines(KR, doors, K);
      const top = wallFace(KR, doors, "top"), tr = longest(top), tt = tr ? (tr[0] + tr[1]) / 2 : null;
      if (tt !== null) { const p = top.at(tt, 0.1); put(cyl(0.55, 0.8, 2.6, K.trunk, 0.02), p.x, 1.3, p.z); }   // the trunk stands behind the house, the leaves on the roof sit on it
      const f = wallFace(KR, doors, "bottom");
      f.runs.forEach(([a, b], i) => {
        if (b - a >= 1.6 || i === 0) windowDecal(f, b - 0.6, 0.5, 0.55, 0.4, K.winFrame, K.win);
        if (i === 0) {                                      // a ladder leaning on the wall
          const p = f.at(a + 0.45, 0.27), g = new THREE.Group();
          for (const x of [-0.14, 0.14]) g.add(at(box(0.04, 1.0, 0.04, K.ladder, 0.008), x, 0.43, 0, -0.5));
          for (let k = 0; k < 5; k++) { const y = 0.1 + k * 0.17; g.add(at(box(0.32, 0.03, 0.03, K.ladder, 0.006), 0, y, -0.546 * (y - 0.43))); }   // a rung sits on the leaning rails
          put(g, p.x, 0, p.z, 0);
        }
      });
    }
  }),
  // Field: a team dugout — a light-blue box with an open top, a string of little flags along the front
  dugout: c => kidsHouse(c, {
    roof: slabRoof,
    extras(roof, KR, K) {                                   // a string of little flags hangs from the front rim (instanced, coloured one by one)
      const tri = new THREE.Shape(), n = Math.floor(roof.len / 0.45);
      tri.moveTo(-0.13, 0); tri.lineTo(0.13, 0); tri.lineTo(0, -0.34);
      const mat = ownMat("#ffffff", true), im = new THREE.InstancedMesh(new THREE.ShapeGeometry(tri), mat, n), mtx = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < n; i++) { im.setMatrixAt(i, mtx.makeTranslation((i + 0.5) * roof.len / n - roof.len / 2, 0.12, roof.span / 2 + 0.02)); im.setColorAt(i, col.set(K.flags[i % K.flags.length])); }
      roof.add(im, mat);
      plate(roof, roof.len - 0.4, 0.04, 0, roof.span / 2 - 0.04, K.string);
    }
  }),
  // City: a corner shop — a striped awning, a shop window, a round window on the side
  shop: c => kidsHouse(c, {
    roof: slabRoof,
    walls(KR, doors, K) {
      const f = wallFace(KR, doors, "bottom");
      for (const [a, b] of clearRuns(f, doors, 0.93)) {      // the awning: stripes tilted down, only where no open door leaf stands
        const n = Math.floor((b - a) / 0.3);
        for (let i = 0; i < n; i++) {
          const p = f.at(a + (i + 0.5) * (b - a) / n, 0.3), s = at(box((b - a) / n, 0.05, 0.55, K.awning[i % 2], 0.008), 0, 0, 0, 0.42);
          put(s, p.x, WALL_H - 0.04, p.z);
        }
      }
      for (const [a, b] of f.runs) if (b - a >= 1.1) windowDecal(f, (a + b) / 2, 0.42, Math.min(1.1, b - a - 0.3), 0.45, K.winFrame, K.glass);
      for (const side of ["left", "right"]) { const s = wallFace(KR, doors, side), r = longest(s); if (r && r[1] - r[0] > 1) { const t = (r[0] + r[1]) / 2; disc(s, t, 0.5, 0.26, K.winFrame); disc(s, t, 0.5, 0.19, K.glass, 0.045); } }
    }
  }),
  // School: a yellow school bus — a black stripe, round windows, wheels, headlights and a bumper
  bus: c => kidsHouse(c, {
    roof: slabRoof,
    extras(roof, KR, K) {                                   // from above: the windshield and the hood at the front, two hatches, a dark rib
      const hz = roof.span / 2;
      plate(roof, roof.len * 0.82, 0.9, 0, hz - 1.15, K.glass);
      plate(roof, roof.len * 0.82, 0.55, 0, hz - 0.4, shade(K.roof, 0.88));
      for (const x of [-roof.len * 0.22, roof.len * 0.22]) plate(roof, 0.8, 0.8, x, -0.3, shade(K.roof, 1.12));
      plate(roof, roof.len * 0.8, 0.05, 0, -hz + 0.5, K.stripe);
    },
    walls(KR, doors, K) {
      for (const side of VISIBLE) {
        const f = wallFace(KR, doors, side);
        for (const [a, b] of f.runs) {
          decal(f, (a + b) / 2, 0.36, b - a, 0.07, K.stripe, 0.025);
          const n = Math.floor((b - a) / 0.8);
          for (let i = 0; i < n; i++) { const t = a + (i + 0.5) * (b - a) / n; disc(f, t, 0.62, 0.17, K.stripe); disc(f, t, 0.62, 0.13, K.glass, 0.045); }
          if (side === "bottom") {
            decal(f, (a + b) / 2, 0.1, b - a, 0.09, K.stripe, 0.04);                    // the bumper
            if (b - a > 1) for (const t of [a + 0.25, b - 0.25]) disc(f, t, 0.3, 0.1, K.light, 0.045);   // headlights
          }
        }
      }
      for (const [x, nx] of [[KR.x, -1], [KR.x + KR.w, 1]]) for (const z of [KR.y + 1.3, KR.y + KR.h - 1.3]) {
        if (doors.some(d => d.nx === nx && Math.abs(d.z - z) < d.len / 2 + 0.4)) continue;
        const w = cyl(0.3, 0.3, 0.2, K.tyre, 0.012, 14), hub = cyl(0.12, 0.12, 0.23, K.hub, 0.006, 10);
        put(grp(w, hub), x + nx * 0.02, 0.28, z); w.rotation.z = hub.rotation.z = Math.PI / 2;
      }
    }
  }),
  // Beach: a striped hut on posts — pastel bands, a thatched roof with a fringe, corner posts, a little ladder
  hut: c => kidsHouse(c, {
    roof: hipRoof,
    extras(roof, KR, K) {
      const list = [];
      for (let x = -roof.len / 2 + 0.2; x < roof.len / 2; x += 0.22) list.push({ x, y: -0.1, z: roof.span / 2 - 0.02, rx: 0.25 });
      strands(roof, new THREE.BoxGeometry(0.05, 0.3, 0.05), K.fringe, list);
    },
    walls(KR, doors, K) {
      for (const side of VISIBLE) {
        const f = wallFace(KR, doors, side);
        for (const [a, b] of f.runs) K.bands.forEach((col, i) => decal(f, (a + b) / 2, 0.2 + i * 0.28, b - a, 0.2, col, 0.02));
      }
      for (const [x, z] of [[KR.x, KR.y], [KR.x + KR.w, KR.y], [KR.x, KR.y + KR.h], [KR.x + KR.w, KR.y + KR.h]]) put(box(0.18, WALL_H + 0.1, 0.18, K.post, 0.015), x, (WALL_H + 0.1) / 2, z);
      const f = wallFace(KR, doors, "bottom"), r = longest(f);
      if (r && r[1] - r[0] > 1) {
        const p = f.at(r[0] + 0.3, 0.2), g = new THREE.Group();
        for (const x of [-0.12, 0.12]) g.add(at(box(0.04, 0.85, 0.04, K.post, 0.008), x, 0.4, 0, -0.35));
        for (let k = 0; k < 4; k++) { const y = 0.12 + k * 0.17; g.add(at(box(0.28, 0.03, 0.03, K.post, 0.006), 0, y, -0.365 * (y - 0.4))); }
        put(g, p.x, 0, p.z);
      }
    }
  }),
  // Winter: an igloo — ice blocks on a round dome, round doors (an arch in every gap) with a heart above
  igloo: c => kidsHouse(c, {
    roof: (KR, K) => domeRoof(KR, { color: K.roof, line: K.line, roofH: K.roofH, k: K.k }),
    doors(doors, K, KR) {
      const pts = [], cx = KR.x + KR.w / 2, cz = KR.y + KR.h / 2, y0 = K.domeHeart, f = Math.sqrt(1 - (y0 / K.roofH) ** 2);   // the heart sits on the dome, K.domeHeart above its foot
      for (const d of doors) {
        const arch = part(new THREE.TorusGeometry(d.len / 2 - 0.1, 0.13, 8, 18, Math.PI), K.arch, 0.015);
        arch.scale.set(1, 0.85, 1); put(grp(arch), d.x + d.nx * 0.5, 0, d.z + d.nz * 0.5, Math.atan2(d.nx, d.nz));
        const ht = faceTo(new THREE.Mesh(heartGeo(K.heartS), toon(K.heart)), d);
        ht.position.set(d.nx ? cx + d.nx * (KR.w / 2 * K.k * f + 0.04) : d.x, WALL_H + y0, d.nz ? cz + d.nz * (KR.h / 2 * K.k * f + 0.04) : d.z); mapGroup.add(ht); pts.push({ x: ht.position.x, y: ht.position.y, z: ht.position.z });
        const mat = new THREE.Mesh(heartGeo(K.mat), toon(K.heart)); mat.rotation.x = -Math.PI / 2; mat.position.set(d.x + d.nx * 1.05, 0.012, d.z + d.nz * 1.05); mapGroup.add(mat);
      }
      return pts;
    }
  })
};

// ---------- Dad's house: the same pieces of mess in every world (stains, a bin with trash and stink lines, a sock), plus the world's own ----------
// o: roof(BR, B, place) → roof; patches (n) / chimney on a hip roof; roofExtras(roof, BR, B); walls(BR, doors, B); mess (what dadMess leaves out);
// props(mess, BR, doors, B, rnd) → { sock: true } when it hung a sock
function dadHouse(c, o) {
  const { place, build, rnd, info, look: B } = c, BR = houseRect("bighome");
  if (!BR) return;
  const { doors, wallAt } = houseDoors("bighome", BR), roof = o.roof(BR, B, place);
  if (B.crook && roof.flat) roof.g.rotation.set(B.crook * 0.4, 0, B.crook);
  const patches = o.patches ? roofPatches(roof, B, rnd, o.patches) : 0;
  if (o.chimney) roofChimney(roof, B);
  if (o.roofExtras) o.roofExtras(roof, BR, B);
  const roofMessInfo = roofMess(roof, B);
  mapGroup.add(roof.g);
  const fade = addRoofFade(BR, roof);
  if (o.walls) o.walls(BR, doors, B);
  const mess = dadMess(BR, doors, wallAt, B, rnd, o.mess), more = (o.props && o.props(mess, BR, doors, B, rnd)) || {}, items = mess.done();
  info.big = { build, roof: true, crooked: Math.abs(roof.g.rotation.z) > 0.01, patches, stains: mess.stains, ...items, sock: items.laundry.includes("sock") || !!more.sock, trash: items.bin, messy: true, roofMess: roofMessInfo, fade };
  if (THEMES[place].snow) info.snow++;
}
const hipDad = (BR, B, place) => houseRoof(BR, B.roof, place, B.crook, { roofH: B.roofH, snow: B.snow, eave: B.eave });
const slabDad = (BR, B) => flatRoof(BR, { color: B.roof, side: B.roofSide ?? shade(B.roof, B.roofShade ?? 0.78), thick: B.thick, eave: B.eave });
// a window with a sock hung on its sill: the window on the biggest stretch of the front face
function windowSock(BR, doors, B) {
  const f = wallFace(BR, doors, "bottom"), r = longest(f);
  if (!r || r[1] - r[0] < 1) return false;
  const t = (r[0] + r[1]) / 2, p = f.at(t, 0.06);
  windowDecal(f, t, 0.5, 0.55, 0.42, B.winFrame, B.win);
  sock(p.x + 0.1, 0.3, p.z, Math.atan2(f.nx, f.nz), B);
  return true;
}
// the first free place among the offered, for a prop with a footprint of its own
const place1 = (mess, d, list) => list.map(([off, out]) => mess.at(d, off, out)).find(mess.free);

const DAD = {
  // Park: a crooked garden shed (today's red one, patched roof, bin, pizza, washing) with a broken rake against the wall
  shed: c => dadHouse(c, {
    roof: hipDad, patches: 3, chimney: true,
    props(mess, BR, doors, B) {
      const f = wallFace(BR, doors, "bottom"), r = f.runs[f.runs.length - 1];
      if (!r) return;
      const p = f.at(r[1] - 0.3, 0.2), g = grp(at(cyl(0.025, 0.025, 1.15, B.rake, 0.006, 6), 0, 0.55, 0, -0.35), at(box(0.34, 0.04, 0.05, B.rakeHead, 0.006), 0, 0.03, 0.18, 0.2));
      for (const x of [-0.14, -0.07, 0, 0.07, 0.14]) g.add(at(box(0.02, 0.1, 0.02, B.rakeHead, 0.004), x, 0.05, 0.2));
      put(g, p.x, 0, p.z);
      mess.props.push(g);
    }
  }),
  // Field: a groundskeeper's hut — plank roof, an old lawn mower and muddy boots by the door, a window with a sock
  hut: c => dadHouse(c, {
    roof: hipDad, patches: 2,
    roofExtras(roof, BR, B) { plankStrips(roof, B.plank, 8); },
    mess: { pizza: false, laundry: false, toys: false },
    props(mess, BR, doors, B) {
      const sk = windowSock(BR, doors, B), d = mess.d0;
      if (d) {
        const m = place1(mess, d, [[-(d.len / 2 + 0.9), 0.95], [-(d.len / 2 + 1.3), 0.95]]);
        if (m) {                                             // the lawn mower: red body, a dark deck, four wheels, a handle
          const g = grp(at(box(0.52, 0.22, 0.34, B.mower, 0.012), 0, 0.26, 0), at(box(0.58, 0.07, 0.42, B.deck, 0.01), 0, 0.14, 0), at(box(0.04, 0.5, 0.04, B.deck, 0.008), -0.3, 0.45, 0, 0, 0.5),
            at(box(0.04, 0.04, 0.34, B.deck, 0.008), -0.42, 0.66, 0));
          for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const w = cyl(0.09, 0.09, 0.05, B.tyre, 0.008, 10); w.rotation.x = Math.PI / 2; w.position.set(x, 0.09, z); g.add(w); }
          put(g, m.x, 0, m.z, 0.5); mess.props.push(g);
        }
        const bp = place1(mess, d, [[d.len / 2 + 0.7, 1.35], [d.len / 2 + 1.2, 1.4]]);
        if (bp) {                                            // muddy boots
          const g = new THREE.Group();
          for (const x of [-0.09, 0.09]) g.add(at(grp(at(cyl(0.065, 0.075, 0.24, B.boots, 0.008, 8), 0, 0.12, 0), at(box(0.1, 0.06, 0.2, B.boots, 0.008), 0, 0.03, 0.06)), x, 0, 0));
          put(g, bp.x, 0, bp.z, 0.8); mess.props.push(g);
        }
      }
      return { sock: sk };
    }
  }),
  // City: a messy garage — a dented roller door, pizza boxes, a sock on the line
  garage: c => dadHouse(c, {
    roof: hipDad, patches: 3,
    roofExtras(roof, BR, B) {                               // a crooked satellite dish on the roof
      const m = ownMat(B.dish, true), dish = roof.add(part(new THREE.ConeGeometry(0.34, 0.2, 10), "", 0.012, m), m), s = slopeAt(roof, 0.42, roof.len * 0.28);
      dish.position.set(s.x, s.y + 0.18, s.z); dish.rotation.set(-1.9, 0, 0.5);
    },
    walls(BR, doors, B) {
      const f = wallFace(BR, doors, "bottom"), r = longest(f);
      if (!r || r[1] - r[0] < 1.4) return;
      const t = (r[0] + r[1]) / 2, w = Math.min(2.6, r[1] - r[0] - 0.2);
      decal(f, t, 0.4, w, 0.68, B.garage, 0.03);
      for (let k = 0; k < 5; k++) decal(f, t, 0.12 + k * 0.13, w, 0.02, B.groove, 0.045);
      decal(f, t + w * 0.25, 0.28, 0.4, 0.28, B.dent, 0.05);
    },
    mess: { toys: false }
  }),
  // School: the caretaker's room — flat roof, a leaking pipe with a tap and a puddle, a mop and a bucket, a sock on the tap
  caretaker: c => dadHouse(c, {
    roof: slabDad,
    roofExtras(roof, BR, B) {                               // water stains on the roof and a vent pipe
      for (const [x, z, w, d] of [[-0.25, 0.25, 1.6, 1.1], [0.3, -0.2, 1.2, 0.9], [-0.1, 0.1, 0.8, 0.6]]) plate(roof, w * roof.len * 0.12, d * roof.span * 0.12, x * roof.len * 0.5, z * roof.span * 0.5, B.stain, 0.001);
      const vp = ownMat(B.pipe, true), v = roof.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.75, 8), "", 0.015, vp), vp);
      v.position.set(roof.len * 0.28, roof.rh + 0.37, -roof.span * 0.22);
    },
    props(mess, BR, doors, B) {
      let sk = false;
      for (const side of ["right", "left"]) {
        const nx = side === "right" ? 1 : -1;
        const f = wallFace(BR, doors, side), r = longest(f);
        if (!r || r[1] - r[0] < 1.2) continue;
        const p = f.at(r[1] - 0.5, 0.1), q = { x: p.x + nx * 0.6, z: p.z };
        if (!mess.free(q)) continue;
        const g = grp(at(cyl(0.07, 0.07, 1.5, B.pipe, 0.01), 0, 0.75, 0), at(cyl(0.06, 0.06, 0.4, B.pipe, 0.01), nx * 0.2, 1.0, 0, 0, Math.PI / 2));
        for (const [dy, k] of [[0.75, 1], [0.5, 0.8], [0.25, 0.7]]) g.add(at(new THREE.Mesh(sphere(0.04 * k, 8, 6), toon(B.water)), nx * 0.4, dy, 0));
        put(g, p.x, 0, p.z); patch(q.x + nx * 0.2, q.z, 0.55, 0.38, B.water);
        sock(p.x + nx * 0.4, 1.05, p.z, nx > 0 ? Math.PI / 2 : -Math.PI / 2, B); sk = true;
        break;
      }
      const d = mess.d0, m = d && place1(mess, d, [[-(d.len / 2 + 0.9), 0.95], [-(d.len / 2 + 1.4), 0.95]]);
      if (m) {                                              // a mop leaning on the wall and a bucket in a puddle
        const mop = grp(at(cyl(0.025, 0.025, 1.1, B.stick, 0.006, 6), 0, 0.55, 0, -0.3), at(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 8), toon(B.mop)), 0, 0.1, 0.16, Math.PI));
        const bucket = at(cyl(0.17, 0.13, 0.3, B.bucket, 0.012, 12), 0.45, 0.15, 0.1);
        put(grp(mop, bucket), m.x, 0, m.z, 0.3); patch(m.x + 0.45, m.z + 0.1, 0.5, 0.35, B.water); mess.props.push(mop);
      }
      return { sock: sk };
    },
    mess: { pizza: false, laundry: false, toys: false }
  }),
  // Beach: a shabby shack — faded stripes, a torn umbrella, pizza boxes in the sand, a sock in the window
  shack: c => dadHouse(c, {
    roof: hipDad, patches: 2,
    roofExtras(roof, BR, B) { plankStrips(roof, B.plank, 7); },
    walls(BR, doors, B) {
      for (const side of VISIBLE) {
        const f = wallFace(BR, doors, side);
        for (const [a, b] of f.runs) B.bands.forEach((col, i) => decal(f, (a + b) / 2, 0.22 + i * 0.4, b - a, 0.16, col, 0.02));
      }
    },
    mess: { laundry: false, toys: false },
    props(mess, BR, doors, B) {
      const sk = windowSock(BR, doors, B), d = mess.d0;
      if (d) {
        const sp = mess.at(d, 0, 1.0);
        patch(sp.x, sp.z, 1.5, 0.9, B.sand);
        const u = place1(mess, d, [[d.len / 2 + 1.7, 1.1], [d.len / 2 + 2.2, 1.1], [-(d.len / 2 + 2.0), 1.4]]);
        if (u) {                                             // an umbrella with a torn canopy
          const g = grp(at(cyl(0.02, 0.02, 1.3, B.pole, 0.006, 6), 0, 0.62, 0, 0, 0.32), at(part(new THREE.ConeGeometry(0.65, 0.3, 10, 1, false, 0, TAU * 0.78), B.umbrella[0], 0.012), -0.2, 1.2, 0, 0, 0.32));
          put(g, u.x, 0, u.z, 0.6); mess.props.push(g);
        }
      }
      return { sock: sk };
    }
  }),
  // Winter: a log cabin — logs, a crooked roof with snow and icicles, socks on a line, the bin
  cabin: c => dadHouse(c, {
    roof: hipDad, patches: 2, chimney: true,
    roofExtras(roof, BR, B) {
      const list = [];
      for (let x = -roof.len / 2 + 0.3; x < roof.len / 2; x += 0.42) list.push({ x, y: -0.14, z: roof.span / 2 - 0.02, rx: Math.PI });
      strands(roof, new THREE.ConeGeometry(0.05, 0.26, 5), B.icicle, list);
    },
    walls(BR, doors, B) {
      for (const side of VISIBLE) {
        const f = wallFace(BR, doors, side);
        for (const [a, b] of f.runs) for (let k = 0; k < 5; k++) decal(f, (a + b) / 2, 0.12 + k * 0.15, b - a, 0.03, B.log, 0.02);
      }
    },
    mess: { pizza: false, toys: false }
  })
};

export const KIDS_WORLD = KIDS, DAD_WORLD = DAD;
