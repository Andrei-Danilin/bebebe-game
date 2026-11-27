// SPEC-011: the Little Ones' and the Big One's models, faces, hair, the cloak, buildCharacters, rebuild3D (the rebuild
// hook). Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { GLOVES, TAU } from "../../core/config.js";
import { noGameRng } from "../../core/util.js";
import { BIG_SKINS } from "../../core/wardrobe.js";
import { KID_HEAD_R, LOOK } from "../look.js";
import { P_COLORS } from "../outfits.js";
import { simMode } from "../screen.js";
import { dressBoss } from "./bosses.js";
import { mergeModel } from "./batch.js";
import { buildMap3D, builtKey, forgetMap, mapKey } from "./map3d.js";
import { mapGroup } from "./mapstate.js";
import { capsule, disposeTree, gradTex, INK3, ownMat, part, sphere, toon, wobbleSeed } from "./materials.js";
import { BIG_SCALE, LITTLE_SCALE, scene } from "./setup.js";
import { clearItemMeshes, clearKissMeshes, clearStarMeshes } from "./pools.js";
import { G } from "../../core/active.js";
import { gloveOf } from "../../core/rules.js";

// ---------- Персонажи ----------
// SPEC-021: лицо. Маленькие (art/6_personas): глаза-точки, румянец, простая улыбка (KID_LOOK). Большой: глаза с белками и брови;
// opts.small — папа (art/1_papa): маленькие сердитые глаза-точки и тяжёлые брови
function addFace(head, r, opts = {}) {
  const f = { eyes: [], brows: [], cheeks: [] }, K = LOOK.KID_LOOK;
  const ey = opts.ey ?? 0.04, ex = opts.ex ?? r * 0.38, ez = Math.sqrt(Math.max(0, r * r - ex * ex - ey * ey)) * 0.92;
  for (const k of [-1, 1]) {
    if (opts.small) {
      const eye = new THREE.Mesh(sphere(r * 0.1, 10, 8), toon("#111111")); eye.scale.y = 0.75; eye.position.set(k * ex, ey, ez + r * 0.06); head.add(eye); f.eyes.push(eye);
      const brow = part(new THREE.BoxGeometry(r * 0.5, r * 0.14, r * 0.1), INK3, 0.01);
      brow.position.set(k * ex, ey + r * 0.24, ez + r * 0.01); head.add(brow); f.brows.push(brow); brow.userData.k = k;
    } else if (opts.big) {
      const white = part(sphere(r * 0.24, 12, 10), "#ffffff", 0.025); white.position.set(k * ex, ey, ez); head.add(white);
      const pupil = new THREE.Mesh(sphere(r * 0.13, 10, 8), toon("#111111")); pupil.position.set(k * ex, ey, ez + r * 0.17); head.add(pupil);
      f.eyes.push(white, pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.42, r * 0.09, r * 0.08), toon(INK3));
      brow.position.set(k * ex, ey + r * 0.32, ez + r * 0.08); head.add(brow); f.brows.push(brow); brow.userData.k = k;
    } else {
      const eye = new THREE.Mesh(sphere(r * K.eye, 10, 8), toon("#111111")); eye.position.set(k * ex, ey, ez + r * 0.04); head.add(eye);
      const cheek = new THREE.Mesh(sphere(r * K.cheekR, 10, 8), toon(K.cheek)); cheek.scale.set(1.2, 0.85, 0.35); cheek.position.set(k * r * 0.56, -r * 0.14, r * 0.78); head.add(cheek);
      f.eyes.push(eye); f.cheeks.push(cheek);
    }
  }
  const kid = !opts.big && !opts.small, mr = kid ? K.smile : 0.17, mw = kid ? K.smileW : 0.045;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(r * mr, r * mw, 6, 12, Math.PI), toon(INK3));
  mouth.rotation.z = Math.PI; mouth.position.set(0, -r * 0.3, r * 0.93); head.add(mouth); f.mouth = mouth;
  // SPEC-040 AC 2: the features of the face cast no shadow of their own (the head's shadow is the same shape; one shadow draw each less)
  head.traverse(o => { if (o.isMesh && (f.eyes.includes(o) || f.cheeks.includes(o) || f.brows.includes(o) || o === mouth)) o.userData.noShadow = true; });
  return f;
}
function addHair(head, look) {
  const r = 0.27;
  const cap = (color, rad = r + 0.025, tilt = -0.4) => { const m = part(new THREE.SphereGeometry(rad, 18, 10, 0, TAU, 0, Math.PI * 0.5), color, 0.02); m.rotation.x = tilt; m.position.set(0, 0.0, -0.02); head.add(m); return m; };
  const hatCovers = ["beanie", "viking", "pirate", "cap", "tophat"].includes(look.acc);
  if (look.style !== "none" && !(hatCovers && look.style === "spiky")) cap(look.hair);
  if (look.style === "long") { const b = part(capsule(0.2, 0.22), look.hair, 0.02); b.position.set(0, -0.2, -0.14); head.add(b); }
  if (look.style === "bun" && !hatCovers) { const b = part(sphere(0.11), look.hair, 0.02); b.position.set(0, 0.27, -0.12); head.add(b); }
  if (look.style === "spiky" && !hatCovers) for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, c = part(new THREE.ConeGeometry(0.07, 0.2, 6), look.hair, 0.015);
    c.position.set(Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14 - 0.04); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); head.add(c);
  }
  switch (look.acc) {
    case "bow":
      for (const k of [-1, 1]) { const c = part(new THREE.ConeGeometry(0.07, 0.15, 8), "#ff6fa8", 0.015); c.rotation.z = k * Math.PI / 2; c.position.set(0.14 + k * 0.07, 0.24, 0.05); head.add(c); }
      { const c = part(sphere(0.04), "#ffd1e3", 0.01); c.position.set(0.14, 0.24, 0.05); head.add(c); }
      break;
    case "cap": {
      const c = part(new THREE.SphereGeometry(r + 0.04, 18, 10, 0, TAU, 0, Math.PI * 0.5), "#ef4444", 0.02); c.rotation.x = -0.15; head.add(c);
      const brim = part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), "#b91c1c", 0.015); brim.position.set(0, 0.07, 0.23); brim.scale.set(1, 1, 0.9); head.add(brim);
      break;
    }
    case "beanie": {
      const c = part(new THREE.SphereGeometry(r + 0.045, 18, 10, 0, TAU, 0, Math.PI * 0.55), "#2563eb", 0.02); c.rotation.x = -0.1; head.add(c);
      const band = part(new THREE.TorusGeometry(r + 0.03, 0.045, 6, 24), "#f8fafc", 0.012); band.rotation.x = Math.PI / 2 - 0.1; band.position.y = 0.04; head.add(band);
      const pom = part(sphere(0.08, 10, 8), "#f8fafc", 0.015); pom.position.y = 0.34; head.add(pom);
      break;
    }
    case "crown": {
      const c = part(new THREE.CylinderGeometry(0.15, 0.15, 0.11, 10), "#facc15", 0.015); c.position.y = 0.3; head.add(c);
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, sp = part(new THREE.ConeGeometry(0.035, 0.09, 5), "#facc15", 0.01); sp.position.set(Math.cos(a) * 0.13, 0.4, Math.sin(a) * 0.13); head.add(sp); }
      const gem = new THREE.Mesh(sphere(0.03), toon("#ef4444")); gem.position.set(0, 0.3, 0.155); head.add(gem);
      break;
    }
    case "flower": {
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, pt = part(sphere(0.05, 8, 6), "#f472b6", 0.01); pt.position.set(0.17 + Math.cos(a) * 0.06, 0.2 + Math.sin(a) * 0.06, 0.12); head.add(pt); }
      const mid = new THREE.Mesh(sphere(0.04, 8, 6), toon("#fde047")); mid.position.set(0.17, 0.2, 0.15); head.add(mid);
      break;
    }
    case "headband": {
      const t = part(new THREE.TorusGeometry(r + 0.01, 0.035, 6, 24), "#ef4444", 0.012); t.rotation.x = Math.PI / 2; t.position.y = 0.08; head.add(t);
      for (const k of [-1, 1]) { const tail = part(new THREE.BoxGeometry(0.05, 0.2, 0.03), "#ef4444", 0.01); tail.position.set(k * 0.05, -0.02, -0.29); tail.rotation.z = k * 0.4; head.add(tail); }
      break;
    }
    case "tophat": {
      const brim = part(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 18), "#111827", 0.015); brim.position.y = 0.22; head.add(brim);
      const top = part(new THREE.CylinderGeometry(0.16, 0.17, 0.32, 16), "#111827", 0.02); top.position.y = 0.39; head.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.06, 16), toon("#ef4444")); band.position.y = 0.27; head.add(band);
      break;
    }
    case "viking": {
      const helm = part(new THREE.SphereGeometry(r + 0.045, 18, 10, 0, TAU, 0, Math.PI * 0.5), "#94a3b8", 0.02); head.add(helm);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.04, 0.03, 6, 24), toon("#a16207")); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; head.add(rim);
      for (const k of [-1, 1]) { const h = part(new THREE.ConeGeometry(0.06, 0.24, 8), "#fef3c7", 0.015); h.position.set(k * 0.28, 0.16, 0); h.rotation.z = -k * 0.9; head.add(h); }
      break;
    }
    case "glasses":
      for (const k of [-1, 1]) { const g = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.013, 6, 16), toon("#111111")); g.position.set(k * 0.1, 0.04, 0.255); head.add(g); }
      { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.015), toon("#111111")); b.position.set(0, 0.05, 0.27); head.add(b); }
      break;
    case "ears":
      for (const k of [-1, 1]) { const e = part(new THREE.ConeGeometry(0.09, 0.18, 4), look.hair, 0.015); e.position.set(k * 0.15, 0.27, 0); e.rotation.z = -k * 0.35; head.add(e); }
      break;
    case "pirate": {
      const c = part(new THREE.SphereGeometry(r + 0.03, 18, 10, 0, TAU, 0, Math.PI * 0.5), "#dc2626", 0.02); c.rotation.x = -0.25; head.add(c);
      for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(sphere(0.025, 6, 5), toon("#ffffff")); d.position.set(Math.cos(k * 1.6) * 0.18, 0.2, Math.sin(k * 1.6) * 0.12 + 0.05); head.add(d); }
      const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 12), toon("#111111")); patch.rotation.x = Math.PI / 2; patch.position.set(0.1, 0.04, 0.255); head.add(patch);
      break;
    }
  }
}
const CLOAK_MAT = new THREE.MeshToonMaterial({ color: "#c4b5fd", gradientMap: gradTex, transparent: true, opacity: 0.28, depthWrite: false });
const CLOAK_OUT = new THREE.MeshBasicMaterial({ color: "#7c3aed", side: THREE.BackSide, transparent: true, opacity: 0.18, depthWrite: false });
export function buildLittleModel(look, isPlayer, pid = 0, glove = null) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const legs = [], arms = [], boots = [], gloveParts = [];
  const tee = look.pattern === "plain" || look.pattern === "stripes";
  const outfit = [];                                       // SPEC-027: новые детали одежды { piece, mesh } (тест: __bb.outfit3D)
  const SMALL = new Set(["band", "pantStripe", "button"]);   // мелкие детали без тени (меньше вызовов отрисовки в проходе теней)
  const wearPart = (piece, mesh, parent) => { parent.add(mesh); outfit.push({ piece, mesh }); if (SMALL.has(piece)) mesh.userData.noShadow = true; return mesh; };
  for (const k of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(k * 0.1, 0.3, 0);
    const leg = part(capsule(0.075, 0.15), look.shorts ? look.skin : look.pants, 0.025); leg.position.y = -0.15; pv.add(leg);
    if (look.shorts) { const sh = part(new THREE.CylinderGeometry(0.095, 0.09, 0.14, 10), look.pants, 0.02); sh.position.y = -0.03; pv.add(sh); }
    else if (look.pantStripes) for (const a of [k * Math.PI / 2, 0, Math.PI]) {   // SPEC-027: полоски сбоку, спереди и сзади штанины
      const st = wearPart("pantStripe", new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.012), toon(look.pantStripes)), pv);
      st.position.set(Math.sin(a) * 0.076, -0.14, Math.cos(a) * 0.076); st.rotation.y = a;
    }
    const shoe = part(new THREE.BoxGeometry(0.13, 0.07, 0.19), "#3b3b4f", 0.015); shoe.position.set(0, -0.28, 0.03); pv.add(shoe);
    const boot = part(new THREE.BoxGeometry(0.17, 0.2, 0.22), "#ef4444", 0.02); boot.position.set(0, -0.23, 0.03); boot.visible = false; pv.add(boot); boots.push(boot);
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toon("#ffffff")); wing.rotation.z = k * 1.2; wing.position.set(k * 0.1, 0.03, -0.05); boot.add(wing);
    rig.add(pv); legs.push(pv);
  }
  const cast = part(new THREE.BoxGeometry(0.2, 0.26, 0.2), "#ffffff", 0.02); cast.position.y = -0.14; cast.visible = false; legs[1].add(cast);
  for (const [w, h] of [[0.05, 0.12], [0.12, 0.05]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), toon("#ef4444")); cr.position.set(0, 0, 0.105); cast.add(cr); }
  const hips = part(new THREE.CylinderGeometry(0.19, 0.17, 0.12, 14), look.pants, 0.02); hips.position.y = 0.34; rig.add(hips);
  const body = part(capsule(0.2, 0.15), look.shirt, 0.03); body.position.y = 0.52; rig.add(body);
  if (look.long) { const hem = wearPart("hem", part(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 14, 1, true), look.shirt, 0.02), rig); hem.position.y = 0.25; }   // SPEC-027: полы плаща
  if (look.overalls) {
    // SPEC-027: комбинезон — нагрудник и две лямки ПОВЕРХ куртки: перед нагрудника (z 0.25) и лямки (дуги радиуса 0.25 через плечо)
    // дальше всех деталей курток (молния ≤ 0.21, кольца полос / пояса / радуги ≤ 0.235, звезда плаща ≤ 0.23), верх нагрудника (0.075)
    // выше колец на 0.04 — ничего не мерцает и не лежит поверх нагрудника
    const bib = wearPart("bib", part(new THREE.BoxGeometry(0.22, 0.225, 0.085), look.pants, 0.012), body); bib.position.set(0, -0.0375, 0.2075);
    for (const k of [-1, 1]) {
      const st = wearPart("strap", part(new THREE.TorusGeometry(0.25, 0.018, 4, 16, Math.PI), look.pants, 0.008), body);
      st.rotation.y = -Math.PI / 2; st.position.set(k * 0.08, 0.06, 0);   // дуга от груди через плечо на спину
      const bt = wearPart("button", new THREE.Mesh(sphere(0.018, 6, 5), toon("#facc15")), body); bt.position.set(k * 0.08, 0.045, 0.252);
    }
  }
  let cape = null;
  switch (look.pattern) {
    case "stripes": for (const y of [-0.08, 0.04, 0.16]) { const sr = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.022, 4, 22), toon(look.trim)); sr.rotation.x = Math.PI / 2; sr.position.y = y; body.add(sr); } break;
    case "zip": {
      const z = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.3, 0.02), toon(look.trim)); z.position.set(0, 0.02, 0.2); body.add(z);
      const col = part(new THREE.TorusGeometry(0.13, 0.04, 6, 18), look.shirt, 0.015); col.rotation.x = Math.PI / 2; col.position.y = 0.2; body.add(col);
      break;
    }
    case "hood": {
      const hood = part(new THREE.SphereGeometry(0.18, 14, 10, 0, TAU, 0, Math.PI * 0.55), look.trim, 0.02); hood.rotation.x = -1.9; hood.position.set(0, 0.2, -0.17); body.add(hood);
      for (const k of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), toon("#ffffff")); st.position.set(k * 0.06, 0.1, 0.2); body.add(st); }
      break;
    }
    case "cape": {
      cape = new THREE.Group(); cape.position.set(0, 0.72, -0.17); rig.add(cape);
      const cl = part(new THREE.BoxGeometry(0.42, 0.55, 0.03), look.trim, 0.015); cl.position.y = -0.27; cape.add(cl);
      const star = part(new THREE.OctahedronGeometry(0.07), "#facc15", 0.012); star.scale.z = 0.4; star.position.set(0, 0.06, 0.2); body.add(star);
      break;
    }
    case "belt": { const bl = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 4, 22), toon(look.trim)); bl.rotation.x = Math.PI / 2; bl.position.y = -0.1; body.add(bl); break; }
    case "rainbow": {                                      // SPEC-027: шесть цветных полос снизу вверх (кольца по радиусу капсулы) и воротник
      const n = look.bands.length, y0 = -0.14, dy = 0.06;
      look.bands.forEach((c, i) => {
        const y = y0 + i * dy, over = Math.max(0, Math.abs(y) - 0.075), r = Math.sqrt(0.04 - over * over) + 0.004;
        const band = wearPart("band", new THREE.Mesh(new THREE.TorusGeometry(r, dy / 2, 4, 22), toon(c)), body); band.rotation.x = Math.PI / 2; band.position.y = y;
      });
      const col = part(new THREE.TorusGeometry(0.13, 0.04, 6, 18), look.trim, 0.015); col.rotation.x = Math.PI / 2; col.position.y = y0 + n * dy + 0.03; body.add(col);
      break;
    }
  }
  for (const k of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(k * 0.24, 0.66, 0); pv.rotation.z = k * 0.18;
    const arm = part(capsule(0.06, 0.15), tee ? look.skin : look.shirt, 0.022); arm.position.y = -0.12; pv.add(arm);
    if (tee) { const sl = part(new THREE.CylinderGeometry(0.075, 0.07, 0.09, 10), look.shirt, 0.015); sl.position.y = -0.02; pv.add(sl); }
    else { const hand = part(sphere(0.06, 8, 6), look.skin, 0.015); hand.position.y = -0.24; pv.add(hand); }
    if (glove) {                                           // рукавицы из магазина
      const gm = part(sphere(0.095, 12, 10), GLOVES[glove].color, 0.018); gm.scale.set(1, 1.15, 0.95); gm.position.y = -0.27; pv.add(gm);
      const cuff = part(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 12), GLOVES[glove].cuff, 0.01); cuff.position.y = -0.18; pv.add(cuff);
      const th = part(sphere(0.04, 8, 6), GLOVES[glove].color, 0.01); th.position.set(-k * 0.07, -0.25, 0.04); pv.add(th);
      gloveParts.push(gm, cuff, th);
    }
    rig.add(pv); arms.push(pv);
  }
  const head = new THREE.Group(); head.position.y = LOOK.KID_LOOK.headY; head.scale.setScalar(LOOK.KID_LOOK.head); rig.add(head);   // SPEC-021: голова больше
  head.add(part(sphere(KID_HEAD_R, 18, 14), look.skin, 0.03));
  const face = addFace(head, KID_HEAD_R);
  addHair(head, look);
  let ring = null;
  if (isPlayer) {
    ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color: P_COLORS[pid], transparent: true, opacity: 0.9, depthWrite: false }));
    ring.material.userData.own = true;
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; root.add(ring);
  }
  const bm = new THREE.MeshToonMaterial({ color: "#7dd3fc", gradientMap: gradTex, transparent: true, opacity: 0.3, depthWrite: false }); bm.userData.own = true;
  const bubR = (LOOK.KID_LOOK.headY + KID_HEAD_R * LOOK.KID_LOOK.head + LOOK.KID_LOOK.bubblePad) / 2;   // SPEC-021: пузырь-щит от земли до макушки
  const bubble = new THREE.Mesh(sphere(bubR, 18, 14), bm); bubble.position.y = bubR; bubble.visible = false; rig.add(bubble);
  // звёздочки «голова кружится»: над головой, на полпути к точке имени (из KID_LOOK, как nameTagH)
  const dizzyStars = new THREE.Group(); dizzyStars.position.y = LOOK.KID_LOOK.headY + (KID_HEAD_R + LOOK.KID_LOOK.tagTop / 2) * LOOK.KID_LOOK.head; dizzyStars.visible = false; rig.add(dizzyStars);
  for (let i = 0; i < 3; i++) { const s = part(new THREE.OctahedronGeometry(0.075), "#fde047", 0.015); s.position.set(Math.cos(i * TAU / 3) * 0.3, 0, Math.sin(i * TAU / 3) * 0.3); dizzyStars.add(s); }
  root.traverse(o => { if (o.isMesh && o !== ring && o !== bubble && !o.userData.noShadow) o.castShadow = true; });
  const ghost = new THREE.Group();
  const gm = ownMat("#ffffff", true); gm.opacity = 0.6; gm.userData.outline.opacity = 0.4;
  ghost.add(part(capsule(0.25, 0.3), "", 0.02, gm));
  for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), toon("#555555")); e.position.set(k * 0.1, 0.12, 0.25); e.rotation.z = 0.7; ghost.add(e); const e2 = e.clone(); e2.rotation.z = -0.7; ghost.add(e2); }
  ghost.visible = false;
  return { root, rig, legs, arms, head, body, cast, face, ghost, ring, boots, bubble, cape, gloveParts, dizzyStars, outfit, cloaked: false };
}
export function setCloak(m, on) {
  if (m.cloaked === on) return;
  m.cloaked = on;
  m.root.traverse(o => {
    if (!o.isMesh || o === m.ring || o === m.bubble) return;
    if (on) { o.userData.mat0 = o.material; o.material = o.material.side === THREE.BackSide ? CLOAK_OUT : CLOAK_MAT; }
    else if (o.userData.mat0) o.material = o.userData.mat0;
  });
}

// SPEC-021: у каждого образа — крючки для SPEC-022 (настроения, наряды боссов): faceMats (материалы лица: [голова, щетина]),
// faceBase (цвет лица образа), headTop (точка над головой: пар, сердечки, облачко), outfitAnchor (на туловище: наряды);
// setBigFace(m, цвет) перекрашивает лицо (null — обратно). Папа (top "dad", art/1_papa): лысый, щетина, нос, уши, три волоска,
// маленькие глаза, тяжёлые брови, футболка с рукавами, джинсы, кроссовки — детали в m.dad
export function buildBigModel(sk) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const legs = [], arms = [], hands = [], dad = sk.top === "dad" ? { jeans: [], sneakers: [], sleeves: [], ears: [], hairs: [] } : null;
  // свои материалы у перекрашиваемых частей (SPEC-022: наряды боссов): штаны у всех, кроссовки у папы; футболка и рукава — bodyMat
  const pantsMat = ownMat(sk.pants || "#2d2d3f"), shoeMat = dad ? ownMat(sk.shoes) : null;
  for (const k of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(k * 0.22, 0.55, 0);
    const leg = part(capsule(0.15, 0.28), "", 0.03, pantsMat); leg.position.y = -0.3; pv.add(leg);
    if (dad) {
      const shoe = part(new THREE.BoxGeometry(0.3, 0.13, 0.42), "", 0.025, shoeMat); shoe.position.set(0, -0.6, 0.07); pv.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.04, 0.43), toon(sk.sole)); sole.position.y = -0.065; shoe.add(sole);
      dad.jeans.push(leg); dad.sneakers.push(shoe);
    }
    rig.add(pv); legs.push(pv);
  }
  const bodyMat = ownMat(sk.shirt); bodyMat.emissive = new THREE.Color("#000000");
  const body = part(capsule(0.46, 0.35), "", 0.04, bodyMat); body.position.y = 1.08; rig.add(body);
  if (sk.top === "pirate") for (const y of [-0.15, 0.05, 0.25]) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.465, 0.035, 4, 24), toon("#e5e7eb")); s.rotation.x = Math.PI / 2; s.position.y = y; body.add(s); }
  else if (sk.top === "robot") { const pnl = part(new THREE.BoxGeometry(0.4, 0.3, 0.06), "#0ea5e9", 0.02); pnl.position.set(0, 0.05, 0.45); body.add(pnl); }
  // SPEC-022: живот папы — материалом футболки (наряды боссов перекрашивают и его)
  else { const bc = sk.top === "bear" ? "#e8b48a" : dad ? sk.shirt : "#" + new THREE.Color(sk.shirt).lerp(new THREE.Color("#ffffff"), 0.3).getHexString(); const belly = new THREE.Mesh(sphere(0.3, 14, 10), dad ? bodyMat : toon(bc)); belly.scale.set(1, 1.1, 0.35); belly.position.set(0, -0.05, 0.36); body.add(belly); }
  for (const k of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(k * 0.58, 1.32, 0); pv.rotation.z = k * 0.25;
    const arm = part(capsule(0.13, 0.36), sk.skin, 0.03); arm.position.y = -0.28; pv.add(arm);
    const hand = part(sphere(0.15), sk.skin, 0.025); hand.position.y = -0.55; pv.add(hand);
    const ha = new THREE.Group(); ha.position.y = -0.55; pv.add(ha); hands.push(ha);   // SPEC-022: точка в руке (качается с рукой)
    if (dad) { const sl = part(new THREE.CylinderGeometry(0.17, 0.16, 0.24, 12), "", 0.025, bodyMat); sl.position.y = -0.04; pv.add(sl); dad.sleeves.push(sl); }
    rig.add(pv); arms.push(pv);
  }
  const head = new THREE.Group(); head.position.y = 1.98; rig.add(head);
  const r = 0.5;
  const headMat = ownMat(sk.skin); headMat.emissive = new THREE.Color("#000000");   // краснеет после поцелуя
  if (sk.top === "robot") head.add(part(new THREE.BoxGeometry(0.92, 0.84, 0.84), "", 0.035, headMat));
  else head.add(part(sphere(r, 20, 16), "", 0.04, headMat));
  const face = addFace(head, sk.top === "robot" ? 0.46 : r, dad ? { small: true, ex: 0.17, ey: 0.17 } : { big: true, ex: 0.18, ey: 0.06 });
  const faceMats = [headMat];
  let stubbleMat = null;
  if (dad) {                                             // папа: щетина на щеках и подбородке, нос, уши, три волоска на макушке
    stubbleMat = ownMat(sk.skin); stubbleMat.color.multiplyScalar(sk.stubble); faceMats.push(stubbleMat);
    const sg = new THREE.SphereGeometry(r * 1.015, 20, 10, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.56, Math.PI * 0.34);
    dad.stubble = new THREE.Mesh(sg, stubbleMat); head.add(dad.stubble);
    const dots = [];                                     // точки щетины: сетка 7 × 4 со сдвигом рядов (без случайности), одним Points — один вызов
    for (let i = 0; i < 28; i++) {
      const row = Math.floor(i / 7), a = Math.PI / 2 - 1.05 + ((i % 7) + (row % 2) * 0.5) / 7 * 2.1, th = Math.PI * (0.63 + row * 0.075);
      dots.push(-Math.cos(a) * Math.sin(th) * r * 1.03, Math.cos(th) * r * 1.03, Math.sin(a) * Math.sin(th) * r * 1.03);
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
    const dm = new THREE.PointsMaterial({ color: INK3, size: 0.03 }); dm.userData.own = true;
    dad.stubble.add(new THREE.Points(dg, dm));
    dad.nose = part(sphere(r * 0.18, 12, 10), "", 0.02, headMat); dad.nose.scale.set(1, 0.85, 0.9); dad.nose.position.set(0, 0.05, r * 0.96); head.add(dad.nose);
    for (const k of [-1, 1]) { const e = part(sphere(r * 0.17, 10, 8), "", 0.02, headMat); e.scale.set(0.55, 1, 0.8); e.position.set(k * r * 0.98, 0, 0); head.add(e); dad.ears.push(e); }
    for (const k of [-1, 0, 1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.16, 4), toon(INK3)); h.position.set(k * 0.07, r + 0.06, 0.02); h.rotation.z = -k * 0.35; head.add(h); dad.hairs.push(h); }
    face.mouth.scale.set(0.8, 0.8, 1); face.mouth.position.set(0, -0.08, Math.sqrt((r * 1.015) ** 2 - 0.08 ** 2) + 0.01);   // ~0.01 перед щетиной
  }
  const cheeks = new THREE.Group(); cheeks.visible = false; head.add(cheeks);   // румянец: красные щёки
  for (const k of [-1, 1]) { const c = new THREE.Mesh(sphere(0.12, 10, 8), toon("#ff1f4b")); c.scale.set(1.35, 0.8, 0.5); c.position.set(k * 0.29, -0.12, sk.top === "robot" ? 0.43 : 0.4); cheeks.add(c); }
  let blink = null;
  if (sk.top === "spiky") {
    const capM = part(new THREE.SphereGeometry(r + 0.03, 20, 10, 0, TAU, 0, Math.PI * 0.5), sk.hair, 0.025); capM.rotation.x = -0.45; head.add(capM);
    for (let k = 0; k < 7; k++) {
      const a = (k / 6 - 0.5) * 2.2;
      const c = part(new THREE.ConeGeometry(0.14, 0.38, 6), sk.hair, 0.02);
      c.position.set(Math.sin(a) * 0.32, 0.42 - Math.abs(Math.sin(a)) * 0.1, -0.12); c.rotation.set(-0.5, 0, -Math.sin(a) * 0.8); head.add(c);
    }
  } else if (sk.top === "horns") for (const k of [-1, 1]) {
    const c = part(new THREE.ConeGeometry(0.1, 0.42, 8), "#fef3c7", 0.02); c.position.set(k * 0.3, 0.5, 0); c.rotation.z = -k * 0.55; head.add(c);
  } else if (sk.top === "robot") {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), toon(INK3)); ant.position.y = 0.57; head.add(ant);
    const bm = ownMat("#ef4444"); bm.emissive = new THREE.Color("#ef4444"); bm.emissiveIntensity = 0.5;
    blink = part(sphere(0.08), "", 0.02, bm); blink.position.y = 0.74; head.add(blink);
  } else if (sk.top === "pirate") {
    const hat = part(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 3), "#111827", 0.03); hat.position.y = 0.42; hat.rotation.y = Math.PI; head.add(hat);
    const dome = part(new THREE.SphereGeometry(0.36, 14, 8, 0, TAU, 0, Math.PI / 2), "#111827", 0.03); dome.position.y = 0.45; head.add(dome);
    const skull = new THREE.Mesh(sphere(0.07), toon("#ffffff")); skull.position.set(0, 0.62, 0.3); head.add(skull);
    const beard = part(sphere(0.34, 14, 10), sk.hair, 0.025); beard.scale.set(1, 0.75, 0.55); beard.position.set(0, -0.3, 0.3); head.add(beard);
    face.mouth.visible = false;
  } else if (sk.top === "bear") {
    for (const k of [-1, 1]) { const e = part(sphere(0.17), sk.skin, 0.025); e.position.set(k * 0.36, 0.38, -0.02); head.add(e); const ei = new THREE.Mesh(sphere(0.09), toon("#e8b48a")); ei.position.set(k * 0.36, 0.38, 0.1); head.add(ei); }
    const snout = part(sphere(0.2), "#e8b48a", 0.02); snout.scale.set(1.1, 0.8, 0.8); snout.position.set(0, -0.12, 0.42); head.add(snout);
    const nose = new THREE.Mesh(sphere(0.07), toon("#2b1a10")); nose.position.set(0, -0.06, 0.58); head.add(nose);
    face.mouth.position.y = -0.24; face.mouth.position.z = 0.55;
  }
  const sweat = new THREE.Mesh(sphere(0.09, 10, 8), toon("#7dd3fc")); sweat.scale.y = 1.4; sweat.position.set(0.45, 0.35, 0.35); sweat.visible = false; head.add(sweat);
  const stars = new THREE.Group(); stars.position.y = 2.75; stars.visible = false; rig.add(stars);
  for (let i = 0; i < 3; i++) { const s = part(new THREE.OctahedronGeometry(0.12), "#fde047", 0.02); s.position.set(Math.cos(i * TAU / 3) * 0.55, 0, Math.sin(i * TAU / 3) * 0.55); stars.add(s); }
  // SPEC-022 точки: head — на макушке (шапки; наклоняется с головой), top — над головой в rig (пар, сердечки, облачко; голова
  // краснеет/кружится — top не наклоняется), torso — на туловище (наряды), handL / handR — в ладонях (качаются с руками)
  const headSurf = new THREE.Group(); headSurf.position.y = r; head.add(headSurf);
  const top = new THREE.Group(); top.position.y = head.position.y + r + 0.2; rig.add(top);
  const torso = new THREE.Group(); torso.position.y = body.position.y; rig.add(torso);
  const anchors = { head: headSurf, top, torso, handL: hands[1], handR: hands[0] };   // лицом к +z: левая рука — +x
  root.traverse(o => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; });
  return { root, rig, legs, arms, head, body, bodyMat, headMat, cheeks, face, sweat, stars, blink,
    look: sk.id, faceMats, faceBase: sk.skin, moodFace: !!sk.mood, topH: top.position.y, stubbleMat, stubbleK: sk.stubble || 1, anchors, headTop: top, outfitAnchor: torso,
    mats: { shirt: bodyMat, pants: pantsMat, shoes: shoeMat, face: headMat, stubble: stubbleMat }, dad };
}
// SPEC-021 (для SPEC-022): цвет лица Большого — color (строка/число), null — цвет образа; щетина остаётся на тон темнее
export function setBigFace(m, color) {
  m.headMat.color.set(color == null ? m.faceBase : color);
  if (m.stubbleMat) m.stubbleMat.color.copy(m.headMat.color).multiplyScalar(m.stubbleK);
  m.faceHex = "#" + m.headMat.color.getHexString();       // SPEC-022: цвет лица для moodInfo (меняется только здесь)
}

export const bossScale = b => (b.boss ? LOOK.BOSS_SCALE : 1);   // SPEC-022: босс крупнее (вид; круг столкновений тот же)
export let charGroup = new THREE.Group();
// SPEC-012 AC 1b: the 3D models of the shown game, keyed by entity ("L<id>" for a Little One, "big"): game entities hold only plain data
export const models = new Map();
export const modelOf = e => (e ? models.get(e.isBig ? "big" : "L" + e.id) : undefined);
function buildCharacters() {
  scene.remove(charGroup); disposeTree(charGroup);
  charGroup = new THREE.Group(); scene.add(charGroup);
  wobbleSeed(1);                         // SPEC-021: контуры героев дрожат одинаково при каждой постройке
  models.clear();
  for (const l of G.littles) {
    const m = buildLittleModel(l.look, l.kind === "player", l.id, l.kind === "player" ? gloveOf(l.id) : null);
    m.rig.scale.setScalar(LITTLE_SCALE); m.ghost.scale.setScalar(LITTLE_SCALE);
    charGroup.add(m.root, m.ghost);
    mergeModel(m);                       // SPEC-040 AC 2: a draw call per moving node and material, not per part
    models.set("L" + l.id, m);
  }
  // SPEC-022: босс уровня — папа в образе босса (BOSS_LOOKS), крупнее (bossScale)
  const bm = buildBigModel(G.big.boss ? BIG_SKINS.find(s => s.id === "dad") : G.big.skin);
  if (G.big.boss) dressBoss(bm, G.big.boss);
  bm.rig.scale.setScalar(BIG_SCALE * bossScale(G.big));
  charGroup.add(bm.root);
  mergeModel(bm);
  models.set("big", bm);
}
// SPEC-040 AC 3: how many times the scene was rebuilt (a new look, a new level, a restored context): main.js draws the world once after each,
// even under a full-screen page (the picture on the canvas is stale)
export const rebuilt = { n: 0 };
export const noteRebuilt = () => { rebuilt.n++; };
// SPEC-040 AC 4: the build in its parts, so the warm-up behind the level card (warm.js) can do them one frame at a time. The map is built
// when the level is not the one built (mapKey); the characters when their looks (and the Big One's) are not those of the models there —
// a new game of the same level with the same team (Play after the warm-up, Retry) keeps the models. Both return whether they built.
export function rebuildMap3D() {
  if (builtKey === mapKey() && mapGroup) return false;
  noGameRng("rebuild3D", () => buildMap3D());
  return true;
}
let charsBuilt = "";
const charsKey = () => G.littles.map(l => l.id + ":" + l.kind + ":" + JSON.stringify(l.look) + ":" + (l.kind === "player" ? gloveOf(l.id) : "")).join("|") + "|" + (G.big.boss || "") + ":" + (G.big.skin && G.big.skin.id);
export function rebuildChars3D() {
  const key = charsKey(), did = key !== charsBuilt || !models.size;
  noGameRng("rebuild3D", () => {
    if (did) { buildCharacters(); charsBuilt = key; }
    clearItemMeshes();
    clearStarMeshes();
    clearKissMeshes();
  });
  return did;
}
// show / hide the whole 3D world (the warm-up keeps what it has built hidden until it has uploaded it)
export function showWorld(on) { if (mapGroup) mapGroup.visible = on; charGroup.visible = on; }
let deferred = false;                    // the warm-up makes the game of the card's level and builds the 3D itself, a stage at a time
export const deferRebuild = on => { deferred = on; };
// force: build everything again whatever the keys say (a restored WebGL context)
export function rebuild3D(force = false) {
  if (simMode || deferred) return;
  if (force) { forgetMap(); charsBuilt = ""; }       // sim: 3D не нужен; sim(false) построит заново
  const a = rebuildMap3D(), b = rebuildChars3D();
  if (a || b) rebuilt.n++;               // (nothing rebuilt: the same level and team — the picture on the canvas is still right)
  showWorld(true);                       // a warm-up that was cut short by Play leaves nothing hidden
}

// called once by main.js, in the start order of the one-file game
export function initCharacters() {
  scene.add(charGroup);
}
