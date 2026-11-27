// SPEC-011: the houses (SPEC-021): roofs, doors, dressHouses, fading roofs. Client module (moved out of index.html in Phase
// C).

import * as THREE from "three";
import { CELL, COLS, ROWS, TAU } from "../../core/config.js";
import { mulberry32 } from "../../core/util.js";
import { LOOK } from "../look.js";
import { mapGroup } from "./mapstate.js";
import { INK3, ownMat, part, sphere, toon } from "./materials.js";
import { WALL_H } from "./setup.js";
import { tag, THEMES } from "./themes.js";
import { G } from "../../core/active.js";

// ---------- SPEC-021: домики (art/15_houses) ----------
// Оба дома строятся из стен уровня (home / bighome) — их места, размеры и двери не меняются; здесь только вид: крыша (гаснет,
// когда внутри кто-то есть — она не прячет маленьких), у домика маленьких — створки дверей с сердечком и цветы, у дома папы —
// кривая крыша с заплатками, пятна грязи, бельё, мусорный бак с «вонью», коробки пиццы, игрушки (грязь на земле — paintGround).
export const houseRoofs = [];          // { x0, y0, x1, y1 (px мира), mats, meshes, a } — крыши, которые гаснут (fadeRoofs)
export let houseInfo = null;           // что построено (тест look3D)
// рамка дома в клетках по его стенам (или null)
function houseRect(kind) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of G.obstacles) if (o.kind === kind && o.shape === "rect") { x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h); }
  return x0 === Infinity ? null : { x: x0 / CELL, y: y0 / CELL, w: (x1 - x0) / CELL, h: (y1 - y0) / CELL };
}
// двери — пропуски в стенах по краю рамки: сторона, середина пропуска на линии стены (клетки), ширина, наружу (nx, nz), вдоль (tx, tz)
function houseDoors(kind, R) {
  const wallAt = (cx, cy) => G.obstacles.some(o => o.kind === kind && (cx + 0.5) * CELL > o.x && (cx + 0.5) * CELL < o.x + o.w && (cy + 0.5) * CELL > o.y && (cy + 0.5) * CELL < o.y + o.h);
  const doors = [];
  for (const side of ["top", "bottom", "left", "right"]) {
    const horiz = side === "top" || side === "bottom", n = horiz ? R.w : R.h;
    const cell = i => side === "top" ? [R.x + i, R.y] : side === "bottom" ? [R.x + i, R.y + R.h - 1] : side === "left" ? [R.x, R.y + i] : [R.x + R.w - 1, R.y + i];
    let run = null;
    for (let i = 1; i <= n - 1; i++) {
      const gap = i < n - 1 && !wallAt(...cell(i));
      if (gap && run === null) run = i;
      if (!gap && run !== null) {
        const len = i - run, mid = run + len / 2;
        const nx = side === "left" ? -1 : side === "right" ? 1 : 0, nz = side === "top" ? -1 : side === "bottom" ? 1 : 0;
        doors.push({ side, len, nx, nz, tx: horiz ? 1 : 0, tz: horiz ? 0 : 1,
          x: horiz ? R.x + mid : side === "left" ? R.x + 0.5 : R.x + R.w - 0.5, z: horiz ? (side === "top" ? R.y + 0.5 : R.y + R.h - 0.5) : R.y + mid });
        run = null;
      }
    }
  }
  return { doors, wallAt };
}
// крыша: вальмовая (четыре ската) над рамкой — сверху видно, что это крыша: передний скат цвета крыши, боковые темнее (тень
// нарисована цветом — двух тонов освещения сверху не хватает), конёк чёрным; всё, что на ней (заплатки, труба, снег), — в одной
// группе с прозрачными материалами, чтобы гаснуть вместе
function hipPieces(Wd, Dp, rh) {
  const L = Math.max(0.4, Wd - Dp), A = [-Wd / 2, 0, Dp / 2], B = [Wd / 2, 0, Dp / 2], C = [Wd / 2, 0, -Dp / 2], D = [-Wd / 2, 0, -Dp / 2], R1 = [-L / 2, rh, 0], R2 = [L / 2, rh, 0];
  const geo = tris => {                                  // треугольники → геометрия с центром в 0 (и где этот центр)
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3));
    g.computeBoundingBox(); const c = new THREE.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z); g.computeVertexNormals(); return { g, c };
  };
  return { front: geo([[A, B, R2], [A, R2, R1]]), back: geo([[C, D, R1], [C, R1, R2]]), left: geo([[D, A, R1]]), right: geo([[B, C, R2]]), L };
}
function houseRoof(R, color, place, crook) {
  const H = LOOK.HOUSE_LOOK, g = new THREE.Group(), mats = [], meshes = [];
  const span = R.h + 2 * H.eave, len = R.w + 2 * H.eave, rh = H.roofH;
  const add = (mesh, mat) => { g.add(mesh); mats.push(mat); meshes.push(mesh); return mesh; };
  const shade = "#" + new THREE.Color(color).multiplyScalar(H.side).getHexString();
  const pieces = (c0, c1, tagName, raise = 0, k = 1) => {
    const hp = hipPieces(len * k, span * k, rh);
    for (const [name, c] of [["front", c0], ["back", c1], ["left", c1], ["right", c1]]) {
      const m = ownMat(c, true, true), q = add(tag(part(hp[name].g, "", 0.02, m), tagName), m);
      q.position.copy(hp[name].c); q.position.y += raise; q.castShadow = !raise;
    }
    return hp;
  };
  const hp = pieces(color, shade, "houseRoof");
  const rm = ownMat(INK3, true), ridge = add(new THREE.Mesh(new THREE.BoxGeometry(hp.L + 0.12, 0.07, 0.07), rm), rm); ridge.position.y = rh;   // конёк
  g.position.set(R.x + R.w / 2, WALL_H, R.y + R.h / 2);
  g.rotation.set(crook * 0.4, 0, crook);
  const roof = { g, mats, meshes, span, len, rh, L: hp.L, add };
  if (THEMES[place].snow) {                              // снег на крыше (Зима): сугробики на переднем скате и у конька
    const sm = ownMat("#ffffff", true), rnd = mulberry32(Math.round(R.x * 31 + R.y * 7));
    for (let i = 0; i < H.snowN; i++) {
      const s = slopeAt(roof, 0.35 + rnd() * 0.6, (rnd() - 0.5) * (len - 1.2)), q = add(tag(part(sphere(0.28 + rnd() * 0.2, 12, 8), "", 0.02, sm), "roofSnow"), sm);
      q.scale.set(1.3, 0.3, 1); q.position.set(s.x, s.y + 0.02, s.z); q.rotation.x = s.rx;
    }
  }
  return roof;
}
// точка на переднем скате (к камере): t — доля высоты, along — вдоль конька (сжимается к коньку)
const slopeAt = (roof, t, along) => ({ x: along * (1 - t * (1 - roof.L / roof.len)), y: roof.rh * t + 0.015, z: (roof.span / 2) * (1 - t) + 0.015, rx: Math.atan2(roof.rh, roof.span / 2) });
function addRoofFade(R, roof) {
  const H = LOOK.HOUSE_LOOK, hr = { g: roof.g, x0: R.x * CELL, y0: (R.y - H.behind) * CELL, x1: (R.x + R.w) * CELL, y1: (R.y + R.h) * CELL, mats: roof.mats, meshes: roof.meshes, a: 1 };
  hr.a = roofInside(hr) ? H.faded : 1;                    // сразу как надо: в начале уровня маленькие в доме — без вспышки крыши
  for (const mt of hr.mats) { mt.opacity = hr.a; mt.userData.outline.opacity = hr.a; mt.depthWrite = hr.a > 0.95; }
  hr.g.visible = hr.a > H.hide;
  houseRoofs.push(hr);
  return hr;
}
// сердечко: плоская фигура лицом к +z
function heartGeo(s) {
  const h = new THREE.Shape();
  h.moveTo(0, -s); h.bezierCurveTo(-s * 1.6, -s * 0.1, -s * 0.8, s * 1.1, 0, s * 0.45); h.bezierCurveTo(s * 0.8, s * 1.1, s * 1.6, -s * 0.1, 0, -s);
  return new THREE.ShapeGeometry(h);
}
const faceTo = (m, d) => { m.rotation.y = Math.atan2(d.nx, d.nz); return m; };
export function dressHouses(place) {
  const H = LOOK.HOUSE_LOOK, rnd = mulberry32(LOOK.GROUND_LOOK.seed + 77 + G.level), info = { kid: null, big: null, snow: 0 };
  // домик маленьких: голубой, синяя крыша с трубой, створки дверей с сердечком, цветы у стены
  const KR = houseRect("home");
  if (KR) {
    const K = H.kid, { doors } = houseDoors("home", KR), roof = houseRoof(KR, K.roof, place, 0);
    const cm = ownMat(K.chimney, true), chim = roof.add(part(new THREE.BoxGeometry(0.34, 0.6, 0.34), "", 0.02, cm), cm), cs = slopeAt(roof, 0.62, roof.len / 5);
    chim.position.set(cs.x, cs.y + 0.22, cs.z);
    const pm = ownMat(K.plank, true), planks = roof.add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.012, roof.span * 0.52), pm, K.planks - 1), pm);
    const pMtx = new THREE.Matrix4(), pRot = new THREE.Matrix4();
    for (let i = 1; i < K.planks; i++) {                  // полосы листов крыши (как в art/15_houses) — вдоль ската, один InstancedMesh
      const s0 = slopeAt(roof, 0.42, (i / K.planks - 0.5) * (roof.len - 0.6));
      planks.setMatrixAt(i - 1, pMtx.makeTranslation(s0.x, s0.y, s0.z).multiply(pRot.makeRotationX(s0.rx)));
    }
    mapGroup.add(roof.g);
    const fade = addRoofFade(KR, roof); fade.glow = true;
    let hearts = 0;
    for (const d of doors) for (const k of [-1, 1]) {      // створки открыты к стене, снаружи, по бокам двери
      const off = d.len / 2 + 0.48, px = d.x + d.tx * off * k + d.nx * 0.53, pz = d.z + d.tz * off * k + d.nz * 0.53;
      if (px < 0 || pz < 0 || px > COLS || pz > ROWS) continue;
      const leaf = faceTo(part(new THREE.BoxGeometry(0.9, 0.66, 0.05), K.door, 0.015), d); leaf.position.set(px, 0.36, pz); leaf.castShadow = false; mapGroup.add(leaf);
      const ht = faceTo(new THREE.Mesh(heartGeo(0.11), toon(K.heart)), d); ht.position.set(px + d.nx * 0.03, 0.42, pz + d.nz * 0.03); mapGroup.add(ht); hearts++;
    }
    for (const d of doors) {                               // коврик-сердечко у каждой двери снаружи — его видно и сверху, под крышей
      const mat = new THREE.Mesh(heartGeo(K.mat), toon(K.heart)); mat.rotation.x = -Math.PI / 2;
      mat.position.set(d.x + d.nx * 1.05, 0.012, d.z + d.nz * 1.05); mapGroup.add(mat);
    }
    // цветы — у стены, которая смотрит внутрь карты (лучше всего — к камере)
    const side = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([nx, nz]) => nz > 0 ? KR.y + KR.h < ROWS - 0.5 : nz < 0 ? KR.y > 0.5 : nx > 0 ? KR.x + KR.w < COLS - 0.5 : KR.x > 0.5);
    let flowers = 0;
    const fls = [];
    if (side) {
      const [nx, nz] = side, n = nz ? KR.w : KR.h;
      for (let i = 0; i < K.flowerN; i++) {
        const t = 0.4 + rnd() * (n - 0.8), x = nz ? KR.x + t : nx > 0 ? KR.x + KR.w + 0.2 : KR.x - 0.2, z = nz ? (nz > 0 ? KR.y + KR.h + 0.2 : KR.y - 0.2) : KR.y + t;
        if (doors.some(d => d.nx === nx && d.nz === nz && Math.abs(nz ? x - d.x : z - d.z) < d.len / 2 + 0.2)) continue;
        fls.push({ x, z, c: K.flowers[i % K.flowers.length] }); flowers++;
      }
    }
    if (fls.length) {                                      // цветы — три InstancedMesh (стебли, лепестки своим цветом, серединки): три вызова на все
      const mtx = new THREE.Matrix4(), col = new THREE.Color();
      const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4), toon(K.leaf), fls.length);
      const mids = new THREE.InstancedMesh(sphere(0.03, 6, 5), toon("#fde047"), fls.length);
      const petals = new THREE.InstancedMesh(sphere(0.045, 6, 5), toon("#ffffff"), fls.length * 5);
      fls.forEach((f, i) => {
        stems.setMatrixAt(i, mtx.makeTranslation(f.x, 0.09, f.z)); mids.setMatrixAt(i, mtx.makeTranslation(f.x, 0.21, f.z));
        for (let p = 0; p < 5; p++) { petals.setMatrixAt(i * 5 + p, mtx.makeTranslation(f.x + Math.cos(p * TAU / 5) * 0.05, 0.2, f.z + Math.sin(p * TAU / 5) * 0.05)); petals.setColorAt(i * 5 + p, col.set(f.c)); }
      });
      mapGroup.add(stems, mids, petals);
    }
    info.kid = { roof: true, hearts, flowers, fade };
    if (THEMES[place].snow) info.snow++;
  }
  // дом папы: кривая коричневая крыша с заплатками и трубой, грязь на стенах, бельё, бак, пицца, игрушки
  const BR = houseRect("bighome");
  if (BR) {
    const B = H.big, { doors, wallAt } = houseDoors("bighome", BR), roof = houseRoof(BR, B.roof, place, B.crook);
    let patches = 0;
    const fm = ownMat(B.stitch, true);                     // «строчка» заплаток — один материал на крышу
    for (let i = 0; i < 3; i++) {                          // заплатки на переднем скате — плоские, вразброс вдоль ската
      const s = slopeAt(roof, 0.15 + rnd() * 0.35, ((i + 0.5) / 3 - 0.5) * (roof.len - 1.6) + (rnd() - 0.5) * 0.4), pm = ownMat(B.patches[i % B.patches.length], true);
      const pw = 0.7 + rnd() * 0.35, pd = 0.5 + rnd() * 0.25;   // заплатка без контура (иначе похожа на коробку):
      const fr = roof.add(new THREE.Mesh(new THREE.BoxGeometry(pw + 0.06, 0.004, pd + 0.06), fm), fm);   // тёмная «строчка» по краю и сама заплатка
      const p = roof.add(new THREE.Mesh(new THREE.BoxGeometry(pw, 0.004, pd), pm), pm);
      for (const q of [fr, p]) { q.position.set(s.x, s.y + (q === p ? 0.004 : 0), s.z); q.rotation.set(s.rx, 0, 0); }
      p.rotateY((rnd() - 0.5) * 0.5); fr.rotation.copy(p.rotation); patches++;
    }
    const cm = ownMat(B.chimney, true), chim = roof.add(part(new THREE.BoxGeometry(0.4, 0.7, 0.4), "", 0.02, cm), cm), cs = slopeAt(roof, 0.6, -roof.len / 5);
    chim.position.set(cs.x, cs.y + 0.25, cs.z); chim.rotation.z = 0.15;
    mapGroup.add(roof.g);
    const fade = addRoofFade(BR, roof);
    // пятна грязи на стенах, которые видно (не задней): плоские кляксы у земли
    let stains = 0;
    const stainM = [], sMtx = new THREE.Matrix4(), sQ = new THREE.Quaternion(), sE = new THREE.Euler(), sP = new THREE.Vector3(), sS = new THREE.Vector3();
    for (const [nx, nz] of [[0, 1], [-1, 0], [1, 0]]) {
      const n = nz ? BR.w : BR.h;
      for (let i = 0; i < B.stains; i++) {
        const t = 0.3 + rnd() * (n - 0.6), cx = nz ? BR.x + t : nx > 0 ? BR.x + BR.w - 0.5 : BR.x + 0.5, cz = nz ? BR.y + BR.h - 0.5 : BR.y + t;
        if (!wallAt(Math.floor(cx), Math.floor(cz))) continue;
        const rr0 = 0.1 + rnd() * 0.14;
        sS.set(rr0, rr0 * (0.6 + rnd() * 0.6), 1); sQ.setFromEuler(sE.set(0, Math.atan2(nx, nz), 0)); sP.set(cx + nx * 0.512, 0.08 + rnd() * 0.32, cz + nz * 0.512);
        stainM.push(sMtx.compose(sP, sQ, sS).clone()); stains++;
      }
    }
    if (stainM.length) {                                   // пятна грязи — один InstancedMesh
      const inst = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9), toon(B.mud), stainM.length);
      stainM.forEach((m, i) => inst.setMatrixAt(i, m)); mapGroup.add(inst);
    }
    // у дверей снаружи: d0 — бак (с одной стороны) и пицца (с другой); d1 — бельё на верёвке и игрушки
    doors.sort((p, q) => Math.abs(q.nx) - Math.abs(p.nx) || q.nz - p.nz);   // сначала боковая дверь (её видно), потом нижняя, верхняя
    const d0 = doors[0], d1 = doors[1] || doors[0], at = (d, off, out) => ({ x: d.x + d.tx * off + d.nx * out, z: d.z + d.tz * off + d.nz * out });
    const items = { bin: false, stink: 0, pizza: 0, toys: 0, laundry: [] }, props = [];
    const free = q => q.x > 0.3 && q.z > 0.3 && q.x < COLS - 0.3 && q.z < ROWS - 0.3 && !G.obstacles.some(o => o.shape === "circle"   // не на занятой клетке и в карте
      ? Math.hypot(o.x - q.x * CELL, o.y - q.z * CELL) < (o.r || 0) + 8 : q.x * CELL > o.x - 6 && q.x * CELL < o.x + o.w + 6 && q.z * CELL > o.y - 6 && q.z * CELL < o.y + o.h + 6);
    if (d0) {
      const p = at(d0, d0.len / 2 + 0.75, 0.95);
      if (free(p)) {
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z); mapGroup.add(g); props.push(g);
      const bin = part(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 12), B.bin, 0.02); bin.position.y = 0.25; g.add(bin); items.bin = true;
      const lid = part(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 12), B.bin, 0.012); lid.position.set(0.18, 0.5, 0.05); lid.rotation.z = -0.9; g.add(lid);
      for (let i = 0; i < 6; i++) { const tr = new THREE.Mesh(sphere(0.07 + rnd() * 0.04, 8, 6), toon(B.trash[i % B.trash.length])); tr.position.set((rnd() - 0.5) * 0.24, 0.52 + rnd() * 0.12, (rnd() - 0.5) * 0.24); g.add(tr); }
      for (let i = 0; i < B.stinkN; i++) {                 // «вонючие» волнистые линии над баком (без мух)
        const pts = [];
        for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3((i - 1) * 0.16 + Math.sin(k * 1.3 + i) * 0.05, 0.75 + k * 0.08, 0));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.016, 4), toon(B.stink))); items.stink++;
      }
      }
      const q = at(d0, -(d0.len / 2 + 0.75), 0.95);
      if (free(q)) {
      const pz = new THREE.Group(); pz.position.set(q.x, 0, q.z); pz.rotation.y = rnd() * 0.6; mapGroup.add(pz); props.push(pz);
      for (let i = 0; i < 2; i++) { const bx = part(new THREE.BoxGeometry(0.42, 0.05, 0.42), B.pizza, 0.012); bx.position.set(0, 0.03 + i * 0.055, 0); bx.rotation.y = i * 0.25; pz.add(bx); items.pizza++; }
      const open = new THREE.Group(); open.position.set(0.5, 0, 0.1); pz.add(open);
      const base = part(new THREE.BoxGeometry(0.42, 0.04, 0.42), B.pizza, 0.012); base.position.y = 0.02; open.add(base); items.pizza++;
      const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14, 1, false, 0, TAU * 0.8), toon(B.pizzaTop)); pie.position.y = 0.05; open.add(pie);
      const lidP = part(new THREE.BoxGeometry(0.42, 0.04, 0.42), B.pizza, 0.012); lidP.position.set(0, 0.2, -0.22); lidP.rotation.x = -1.2; open.add(lidP);
      }
    }
    // SPEC-022 (из проверки SPEC-021): верёвка с бельём — первое свободное место: у второй двери справа, слева, у первой двери,
    // короче; раньше при занятой клетке столба бельё пропадало (~половина уровней)
    const lineSpot = (() => {
      for (const d of [d1, d0]) if (d) for (const sd of [1, -1]) for (const [o0, o1, out] of [[0.2, 1.8, 0.7], [0.2, 1.3, 0.7], [0.2, 1.8, 1.1], [0.2, 1.3, 1.1]]) {
        const a = at(d, sd * (d.len / 2 + o0), out), b = at(d, sd * (d.len / 2 + o1), out), mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        if (free(a) && free(b) && free(mid)) return { a, b, d };
      }
      return null;
    })();
    if (lineSpot) {
      const { a, b } = lineSpot, ld = lineSpot.d;
      {
      const lg = new THREE.Group(); mapGroup.add(lg); props.push(lg);
      for (const p of [a, b]) { const post = part(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), B.line, 0.01); post.position.set(p.x, 0.4, p.z); lg.add(post); }
      const lineLen = Math.hypot(b.x - a.x, b.z - a.z), line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, lineLen, 4), toon(B.line));
      line.position.set((a.x + b.x) / 2, 0.76, (a.z + b.z) / 2); line.rotation.order = "YXZ"; line.rotation.set(Math.PI / 2, Math.atan2(b.x - a.x, b.z - a.z), 0); lg.add(line);
      const on = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }), ry = Math.atan2(ld.nx, ld.nz);
      const s = on(0.3), sock = new THREE.Group(); sock.position.set(s.x, 0.62, s.z); sock.rotation.y = ry; lg.add(sock);
      sock.add(part(new THREE.BoxGeometry(0.09, 0.24, 0.03), B.sock, 0.01));
      const toe = part(new THREE.BoxGeometry(0.16, 0.08, 0.03), B.sockToe, 0.01); toe.position.set(0.04, -0.12, 0); sock.add(toe); items.laundry.push("sock");
      const c = on(0.68), shirt = new THREE.Group(); shirt.position.set(c.x, 0.56, c.z); shirt.rotation.y = ry; lg.add(shirt);
      shirt.add(part(new THREE.BoxGeometry(0.28, 0.3, 0.03), B.shirt, 0.01));
      const arms = part(new THREE.BoxGeometry(0.46, 0.1, 0.03), B.shirt, 0.01); arms.position.y = 0.12; shirt.add(arms); items.laundry.push("shirt");
      }
    }
    if (d1) {
      const tp = at(d1, -(d1.len / 2 + 0.9), 0.9);
      if (free(tp)) {
      const car = new THREE.Group(); car.position.set(tp.x, 0, tp.z); car.rotation.y = 0.7; mapGroup.add(car); props.push(car);
      const body = part(new THREE.BoxGeometry(0.28, 0.08, 0.15), B.toyCar, 0.012); body.position.y = 0.07; car.add(body);
      const cab = part(new THREE.BoxGeometry(0.14, 0.07, 0.13), B.toyCar, 0.01); cab.position.set(-0.02, 0.14, 0); car.add(cab);
      for (const [x, z] of [[-0.09, -0.08], [0.09, -0.08], [-0.09, 0.08], [0.09, 0.08]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), toon(B.tyre)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.035, z); car.add(w); }
      items.toys++;
      }
      const bp = at(d1, -(d1.len / 2 + 0.5), 1.35);
      if (free(bp)) {
      const bone = new THREE.Group(); bone.position.set(bp.x, 0.04, bp.z); bone.rotation.y = 1.1; mapGroup.add(bone); props.push(bone);
      const bar = part(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), B.bone, 0.008); bar.rotation.z = Math.PI / 2; bone.add(bar);
      for (const x of [-0.12, 0.12]) for (const z of [-0.03, 0.03]) { const kn = new THREE.Mesh(sphere(0.035, 6, 5), toon(B.bone)); kn.position.set(x, 0, z); bone.add(kn); }
      items.toys++;
      }
    }
    for (const q of props) q.traverse(o => { o.castShadow = false; });   // мелочь у дома — без теней (меньше вызовов в проходе тени)
    info.big = { roof: true, crooked: Math.abs(roof.g.rotation.z) > 0.01, patches, stains, ...items, fade };
    if (THEMES[place].snow) info.snow++;
  }
  houseInfo = info;
}
// SPEC-021: крыша гаснет, пока в доме кто-то есть (рамка чуть шире к дальней стороне), а у игрока — и когда он рядом; без новых объектов
const inHouse = (q, hr, m) => q.x > hr.x0 - m && q.x < hr.x1 + m && q.y > hr.y0 - m && q.y < hr.y1 + m;
const roofGlow = new THREE.Color(LOOK.HOUSE_LOOK.kid.glow);
// кто-то (или предмет на полу) в доме — крыша гаснет
function roofInside(hr) {
  const near = LOOK.HOUSE_LOOK.near * CELL;
  if (G.big && inHouse(G.big, hr, 0)) return true;
  for (const l of G.littles) if (inHouse(l, hr, l.kind === "player" ? near : 0)) return true;
  for (const it of G.items) if (inHouse(it, hr, 0)) return true;
  return false;
}
// returns true while a roof is still fading (SPEC-040: a frozen scene is drawn again until it has settled)
export function fadeRoofs(dt, t) {
  const H = LOOK.HOUSE_LOOK;
  let moving = false;
  for (const hr of houseRoofs) {
    const target = roofInside(hr) ? H.faded : 1;
    if (Math.abs(target - hr.a) > LOOK.FADE_SETTLED) moving = true;
    hr.a += (target - hr.a) * Math.min(1, dt / H.fade);
    hr.g.visible = hr.a > H.hide;                       // почти погасла — не рисуем совсем (на телефоне крыша во весь экран)
    hr.glowNow = hr.glow ? H.kid.glowK * (0.75 + 0.25 * Math.sin(t * 3)) * (hr.a - H.faded) / (1 - H.faded) : 0;   // зелёный свет безопасного дома на крыше
    for (const mt of hr.mats) {
      mt.opacity = hr.a; mt.userData.outline.opacity = hr.a; mt.depthWrite = hr.a > 0.95;
      if (hr.glow && mt.emissive) mt.emissive.setRGB(roofGlow.r * hr.glowNow, roofGlow.g * hr.glowNow, roofGlow.b * hr.glowNow);
    }
  }
  return moving;
}

// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setHouseInfo(v) { houseInfo = v; }
