// SPEC-011: the bosses' clothes (BOSS_PARTS, dressBoss). Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { BOSSES, TAU } from "../../core/config.js";
import { BOSS_LOOKS } from "../outfits.js";
import { capsule, OUTLINE, ownMat, part, sphere, toon } from "./materials.js";

// SPEC-022: детали образов боссов — к точкам папы (m.anchors) и к рукам/ногам (m.arms / m.legs); look — запись BOSS_LOOKS
const BOSS_PARTS = {
  tracksuit(m, look) {                                    // длинные рукава и белые лампасы на рукавах и штанах, молния
    const g = new THREE.Group(); m.anchors.torso.add(g);
    m.arms.forEach((pv, i) => {
      const k = i ? 1 : -1, sl = part(capsule(0.145, 0.34), "", 0.025, m.mats.shirt); sl.position.y = -0.26; pv.add(sl);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.04), toon(look.trim)); st.position.set(k * 0.14, -0.26, 0); pv.add(st);
    });
    m.legs.forEach((pv, i) => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.52, 0.04), toon(look.trim)); st.position.set((i ? 1 : -1) * 0.155, -0.3, 0); pv.add(st); });
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.02), toon(look.trim)); zip.position.set(0, 0.05, 0.47); g.add(zip);
    return g;
  },
  whistle(m) {                                            // свисток на шнурке
    const g = new THREE.Group(); g.position.set(0, 0.18, 0.47); m.anchors.torso.add(g);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 5, 18, Math.PI), toon("#d4d4d8")); cord.rotation.z = Math.PI; cord.position.y = 0.2; g.add(cord);
    const w = part(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), "#a1a1aa", 0.012); w.rotation.z = Math.PI / 2; g.add(w);
    return g;
  },
  kit(m, look) {                                             // воротник и эмблема, синие шорты, белые гетры со щитками
    const g = new THREE.Group(); m.anchors.torso.add(g);
    const col = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 18), toon(look.trim)); col.rotation.x = Math.PI / 2; col.position.y = 0.56; g.add(col);
    const badge = part(new THREE.BoxGeometry(0.11, 0.13, 0.03), look.trim, 0.01); badge.position.set(0.2, 0.22, 0.43); g.add(badge);
    m.legs.forEach(pv => {
      const sh = part(new THREE.CylinderGeometry(0.19, 0.2, 0.26, 12), look.trim, 0.025); sh.position.y = -0.1; pv.add(sh);
      const sock = part(new THREE.CylinderGeometry(0.16, 0.155, 0.3, 12), "#f8fafc", 0.02); sock.position.y = -0.42; pv.add(sock);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.05, 12), toon(look.trim)); band.position.y = -0.3; pv.add(band);
      const guard = part(new THREE.BoxGeometry(0.17, 0.2, 0.05), "#94a3b8", 0.012); guard.position.set(0, -0.43, 0.15); pv.add(guard);
    });
    return g;
  },
  ball(m) {                                               // мяч в руке (под мышкой)
    const g = new THREE.Group(); g.position.set(0, 0.06, 0.12); m.anchors.handL.add(g);
    g.add(part(sphere(0.21, 16, 12), "#ffffff", 0.02));
    for (const [x, y, z] of [[0, 0, 0.2], [0.19, 0.05, 0.03], [-0.17, 0.1, 0.06], [0.05, 0.19, -0.05], [-0.06, -0.18, 0.05]]) {
      const p = new THREE.Mesh(sphere(0.06, 8, 6), toon("#1f2937")); p.position.set(x, y, z); p.scale.setScalar(0.9); g.add(p);
    }
    return g;
  },
  hardhat(m) {                                            // оранжевая каска на макушке (наклоняется с головой)
    const g = new THREE.Group(); g.position.y = -0.14; m.anchors.head.add(g);
    const dome = part(new THREE.SphereGeometry(0.44, 18, 10, 0, TAU, 0, Math.PI / 2), "#f97316", 0.03); g.add(dome);
    const brim = part(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 20), "#f97316", 0.02); brim.position.set(0, 0.02, 0.04); g.add(brim);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.8), toon("#ea580c")); ridge.position.y = 0.42; g.add(ridge);
    return g;
  },
  vest(m, look) {                                            // жилет: оранжевый, две светоотражающие полосы
    const g = new THREE.Group(); m.anchors.torso.add(g);
    const v = part(capsule(0.48, 0.3), "#fb923c", 0.03); v.scale.set(1, 0.95, 1.02); g.add(v);
    for (const y of [-0.12, 0.14]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.07, 20, 1, true), toon(look.trim)); b.position.y = y; g.add(b); }
    return g;
  },
  cone(m) {                                               // дорожный конус в руке
    const g = new THREE.Group(); g.position.set(0, -0.12, 0.12); g.rotation.x = 0.5; m.anchors.handR.add(g);
    g.add(part(new THREE.ConeGeometry(0.17, 0.5, 14), "#f97316", 0.02));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 0.1, 14), toon("#ffffff")); band.position.y = 0.02; g.add(band);
    const base = part(new THREE.BoxGeometry(0.36, 0.05, 0.36), "#f97316", 0.012); base.position.y = -0.25; g.add(base);
    return g;
  },
  overshirt(m, look) {                                       // белая рубашка нараспашку поверх красной футболки, в пятнах, рукава
    const g = new THREE.Group(); m.anchors.torso.add(g);
    const sm = ownMat(look.trim); sm.side = THREE.DoubleSide;
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.78, 22, 1, true, 0.42, TAU - 0.84), sm); sh.position.y = 0.06; sh.castShadow = true; g.add(sh);
    const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.535, 0.8, 22, 1, true, 0.42, TAU - 0.84), OUTLINE); ink.position.y = 0.06; g.add(ink);
    for (const [a, y] of [[0.7, 0.1], [0.95, -0.15], [-0.75, 0.2], [-1.1, -0.05], [0.55, -0.25]]) {
      const st = new THREE.Mesh(sphere(0.045, 8, 6), toon("#a16207")); st.scale.set(1, 0.8, 0.3);
      st.position.set(Math.sin(a) * 0.525, y + 0.06, Math.cos(a) * 0.525); st.rotation.y = a; g.add(st);
    }
    m.arms.forEach(pv => { const sl = part(new THREE.CylinderGeometry(0.18, 0.17, 0.42, 12), "", 0.025, sm); sl.position.y = -0.12; pv.add(sl); });
    return g;
  },
  tie(m) {                                                // галстук, ослабленный (чуть набок)
    const g = new THREE.Group(); g.position.set(0.03, 0.32, 0.47); g.rotation.z = 0.18; m.anchors.torso.add(g);
    g.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), "#334155", 0.01));
    const t = part(new THREE.BoxGeometry(0.11, 0.48, 0.03), "#334155", 0.012); t.position.y = -0.27; g.add(t);
    return g;
  },
  bag(m) {                                                // сумка через плечо: ремень наискосок и сумка у бедра
    const g = new THREE.Group(); m.anchors.torso.add(g);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.15, 0.03), toon("#5b3a29")); strap.position.set(0, 0.02, 0.5); strap.rotation.z = 0.78; g.add(strap);
    const bag = part(new THREE.BoxGeometry(0.42, 0.32, 0.15), "#7c4a2d", 0.025); bag.position.set(0.52, -0.42, 0.12); g.add(bag);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.12, 0.16), toon("#5b3a29")); flap.position.set(0.52, -0.31, 0.125); g.add(flap);
    return g;
  }
};
// одеть модель папы в образ босса id (BOSS_LOOKS): цвета своих материалов и детали; m.boss, m.bossParts — для тестов
export function dressBoss(m, id) {
  const look = BOSS_LOOKS[BOSSES[id] ? BOSSES[id].look : id];
  if (!look) return;
  m.mats.shirt.color.set(look.shirt);
  m.mats.pants.color.set(look.legs === "skin" ? m.faceBase : look.pants);
  if (m.mats.shoes) m.mats.shoes.color.set(look.shoes);
  m.boss = id; m.bossParts = {};
  for (const p of look.parts) m.bossParts[p] = BOSS_PARTS[p](m, look);
  m.root.traverse(o => { if (o.isMesh && !o.material.side) o.castShadow = true; });
}
