// SPEC-011: the view cone and hug zone, items / stars / kisses in 3D, the per-frame copy of the game into the scene
// (syncScene), render3D. Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { CFG } from "../../core/config.js";
import { gloveOf } from "../../core/economy.js";
import { bigMood } from "../../core/mood.js";
import { bigCalm, visionPoly } from "../../core/path.js";
import { vrand } from "../../core/util.js";
import { inMenus, inWardrobe, mode } from "../flow.js";
import { LOOK } from "../look.js";
import { CSS_H, CSS_W, PHONE } from "../screen.js";
import { ui } from "../state.js";
import { cam, camDist } from "./camera.js";
import { bossScale, modelOf, setBigFace, setCloak } from "./characters.js";
import { fadeRoofs } from "./houses.js";
import { bigHomeMats, fadeBushes, fadeTrees, safeGlow, snow, waves } from "./map3d.js";
import { disposeTree, ownMat, part, sphere, syncPaper, toon } from "./materials.js";
import { progressTab, renderPreviews } from "./previews.js";
import { BIG_SCALE, camBase, camera, LITTLE_SCALE, P, renderer, scene } from "./setup.js";
import { G } from "../../core/active.js";

// ---------- Конус обзора и «зона обнимашек» ----------
export const CONE_N = 48, coneBuf = [];
const coneGeo = new THREE.BufferGeometry();

const coneIdx = [];
const coneMat = new THREE.MeshBasicMaterial({ color: LOOK.CONE_LOOK.look, transparent: true, opacity: LOOK.CONE_LOOK.lookA, depthWrite: false, side: THREE.DoubleSide });
const coneMesh = new THREE.Mesh(coneGeo, coneMat);
function updateCone() {
  const pos = coneGeo.attributes.position.array, vp = visionPoly(CONE_N, coneBuf);
  for (let i = 0; i <= CONE_N + 1; i++) { pos[i * 3] = P(vp[2 * i]); pos[i * 3 + 1] = 0.05; pos[i * 3 + 2] = P(vp[2 * i + 1]); }
  coneGeo.attributes.position.needsUpdate = true;
  const calm = bigCalm();
  const C = LOOK.CONE_LOOK;                                // SPEC-021: цвета в CFG (жёлтый гуще — виден и на песке Пляжа)
  coneMat.color.set(calm ? C.calm : (G.big.state === "chase" ? C.chase : C.look));
  coneMat.opacity = calm ? C.calmA : (G.big.state === "chase" ? C.chaseA : C.lookA);
}
const backMat = new THREE.MeshBasicMaterial({ color: "#ff78aa", transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
const backMesh = new THREE.Mesh(new THREE.CircleGeometry(P(22 + 20), 20, -(Math.PI - CFG.BEHIND_ANGLE), 2 * (Math.PI - CFG.BEHIND_ANGLE)), backMat);

const backPivot = new THREE.Group();
// ---------- Предметы в 3D ----------
let itemGroup = new THREE.Group();
const itemMeshes = new Map();
export function clearItemMeshes() { scene.remove(itemGroup); disposeTree(itemGroup); itemGroup = new THREE.Group(); scene.add(itemGroup); itemMeshes.clear(); }
function makeItemMesh(kind) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  if (kind === "boots") {
    const shaft = part(new THREE.BoxGeometry(0.2, 0.32, 0.18), "#ef4444", 0.025); shaft.position.y = 0.05; body.add(shaft);
    const foot = part(new THREE.BoxGeometry(0.22, 0.12, 0.34), "#ef4444", 0.025); foot.position.set(0, -0.12, 0.08); body.add(foot);
    for (const k of [-1, 1]) { const w = part(new THREE.ConeGeometry(0.06, 0.22, 4), "#ffffff", 0.012); w.rotation.z = k * 1.2; w.position.set(k * 0.15, 0.12, -0.04); body.add(w); }
  } else if (kind === "cloak") {
    const bottle = part(sphere(0.18, 14, 10), "#a855f7", 0.025); body.add(bottle);
    const neck = part(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 10), "#c4b5fd", 0.015); neck.position.y = 0.2; body.add(neck);
    const cork = part(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 10), "#a16207", 0.012); cork.position.y = 0.3; body.add(cork);
    const hl = new THREE.Mesh(sphere(0.05, 8, 6), toon("#ffffff")); hl.position.set(-0.08, 0.07, 0.12); body.add(hl);
  } else if (kind === "shield") {
    const sh = part(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 22), "#3b82f6", 0.025); sh.rotation.x = Math.PI / 2; body.add(sh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 24), toon("#facc15")); body.add(rim);
    const star = part(new THREE.OctahedronGeometry(0.11), "#facc15", 0.012); star.scale.z = 0.35; star.position.z = 0.05; body.add(star);
  } else {                                               // банан — лежит на земле
    const b = part(new THREE.TorusGeometry(0.22, 0.075, 8, 18, Math.PI * 0.85), "#facc15", 0.02); b.rotation.x = -Math.PI / 2; body.add(b);
    const tip = new THREE.Mesh(sphere(0.045, 6, 5), toon("#7c4a1e")); tip.position.set(0.22, 0, 0); body.add(tip);
    for (const k of [-1, 1]) { const peel = part(new THREE.ConeGeometry(0.06, 0.2, 5), "#fde047", 0.012); peel.rotation.set(Math.PI / 2, 0, k * 0.8); peel.position.set(-0.2, 0, k * 0.08); body.add(peel); }
  }
  if (kind !== "banana") {
    const rm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }); rm.userData.own = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24), rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring); g.userData.ring = ring;
  }
  g.userData.body = body;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function syncItems(t) {
  const alive = new Set(G.items.map(it => it.id));
  for (const [id, g] of itemMeshes) if (!alive.has(id)) { itemGroup.remove(g); disposeTree(g); itemMeshes.delete(id); }
  for (const it of G.items) {
    let g = itemMeshes.get(it.id);
    if (!g) { g = makeItemMesh(it.kind); itemGroup.add(g); itemMeshes.set(it.id, g); }
    g.position.set(P(it.x), 0, P(it.y));
    const body = g.userData.body;
    if (it.kind === "banana") { body.position.y = 0.08; body.rotation.y = it.id; }
    else { body.position.y = 0.5 + Math.sin(t * 3 + it.id) * 0.08; body.rotation.y = t * 2; }
    if (g.userData.ring) g.userData.ring.material.opacity = 0.35 + Math.sin(t * 4) * 0.2;
    g.visible = !(it.life - it.t < 3 && Math.floor(t * 8) % 2);
  }
}

// ---------- Бонусные звёздочки в 3D: золотая пятиконечная, крутится и подпрыгивает ----------
let starGroup = new THREE.Group();
const starMeshes = new Map();
export function clearStarMeshes() { scene.remove(starGroup); disposeTree(starGroup); starGroup = new THREE.Group(); scene.add(starGroup); starMeshes.clear(); }
function makeStarMesh() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const sh = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.19 : 0.44; if (k) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  geo.center();
  const sm = ownMat("#facc15"); sm.emissive = new THREE.Color("#a16207"); sm.emissiveIntensity = 0.35;
  // звезда смотрит в камеру (камера сверху под 63°), крутится в своей плоскости и покачивается
  const tilt = new THREE.Group(); tilt.rotation.x = -0.95; body.add(tilt);
  const spin = new THREE.Group(); tilt.add(spin);
  spin.add(part(geo, "", 0.03, sm));
  const hl = new THREE.Mesh(sphere(0.05, 8, 6), toon("#fff7c2")); hl.position.set(-0.1, 0.12, 0.1); spin.add(hl);
  const rm = new THREE.MeshBasicMaterial({ color: "#fde047", transparent: true, opacity: 0.6, depthWrite: false }); rm.userData.own = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.48, 5), rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.userData.body = body; g.userData.spin = spin; g.userData.ring = ring;
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function syncStars(t) {
  const alive = new Set(G.bonusStars.map(s => s.id));
  for (const [id, g] of starMeshes) if (!alive.has(id)) { starGroup.remove(g); disposeTree(g); starMeshes.delete(id); }
  for (const s of G.bonusStars) {
    let g = starMeshes.get(s.id);
    if (!g) { g = makeStarMesh(); starGroup.add(g); starMeshes.set(s.id, g); }
    g.position.set(P(s.x), 0, P(s.y));
    g.userData.body.position.y = 0.62 + Math.sin(t * 3.2 + s.id) * 0.1;
    g.userData.body.rotation.y = Math.sin(t * 2.2 + s.id) * 0.5;
    g.userData.spin.rotation.z = t * 2.4;
    g.userData.ring.rotation.z = -t * 1.5;
    g.userData.ring.material.opacity = 0.4 + Math.sin(t * 5) * 0.2;
    g.visible = !(s.life - s.t < LOOK.STAR_BLINK && Math.floor(t * 8) % 2);   // мигает перед исчезновением
  }
}

// ---------- Воздушные поцелуи в 3D: розовое сердечко на высоте груди и искристый хвостик ----------
const KISS_Y = 0.8;                       // высота полёта (грудь маленького)
let kissGroup = new THREE.Group();
const kissMeshes = new Map();
export function clearKissMeshes() { scene.remove(kissGroup); disposeTree(kissGroup); kissGroup = new THREE.Group(); scene.add(kissGroup); kissMeshes.clear(); }
function makeKissMesh() {
  const g = new THREE.Group();
  const sh = new THREE.Shape();                          // сердечко
  sh.moveTo(0, -0.2);
  sh.bezierCurveTo(-0.05, -0.12, -0.24, -0.02, -0.24, 0.1);
  sh.bezierCurveTo(-0.24, 0.24, -0.06, 0.26, 0, 0.14);
  sh.bezierCurveTo(0.06, 0.26, 0.24, 0.24, 0.24, 0.1);
  sh.bezierCurveTo(0.24, -0.02, 0.05, -0.12, 0, -0.2);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1 });
  geo.center();
  const hm = ownMat("#ff4d8d"); hm.emissive = new THREE.Color("#ff2d75"); hm.emissiveIntensity = 0.45;
  const tilt = new THREE.Group(); tilt.rotation.x = -0.95; g.add(tilt);   // смотрит в камеру
  const heart = part(geo, "", 0.025, hm); tilt.add(heart);
  const trail = [];
  for (let i = 0; i < 5; i++) {                          // хвостик из искорок
    const sm = new THREE.MeshBasicMaterial({ color: i % 2 ? "#ffffff" : "#ff8fb8", transparent: true, opacity: 0.95 - i * 0.15, depthWrite: false }); sm.userData.own = true;
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 - i * 0.017), sm); g.add(s); trail.push(s);
  }
  g.userData.heart = heart; g.userData.trail = trail;
  heart.castShadow = true;
  return g;
}
function syncKisses(t) {
  if (!G.kisses.length && !kissMeshes.size) return;
  const alive = new Set(G.kisses.map(k => k.id));
  for (const [id, g] of kissMeshes) if (!alive.has(id)) { kissGroup.remove(g); disposeTree(g); kissMeshes.delete(id); }
  for (const k of G.kisses) {
    let g = kissMeshes.get(k.id);
    if (!g) { g = makeKissMesh(); kissGroup.add(g); kissMeshes.set(k.id, g); }
    g.position.set(P(k.x), KISS_Y + Math.sin(t * 14 + k.id) * 0.04, P(k.y));
    g.userData.heart.rotation.z = Math.sin(t * 10 + k.id) * 0.25;
    g.userData.heart.scale.setScalar(1.25 + Math.sin(t * 16) * 0.1);
    g.userData.trail.forEach((s, i) => {
      const back = Math.min(k.travel, (i + 1) * 8);       // искорки позади, в пределах пройденного пути
      s.position.set(P(-k.dx * back) + Math.sin(t * 20 + i) * 0.04, Math.cos(t * 18 + i * 2) * 0.05, P(-k.dy * back));
      s.rotation.y = t * 6 + i;
    });
  }
}

// ---------- Анимация каждый кадр ----------
const swing = (m, a) => { m.legs[0].rotation.x = a; m.legs[1].rotation.x = -a; m.arms[0].rotation.x = -a * 0.8; m.arms[1].rotation.x = a * 0.8; };
function syncLittle(l, t) {
  const m = modelOf(l), down = l.state === "down", going = l.state === "home", resting = l.state === "rest";
  m.root.visible = !(l.invuln > 0 && Math.floor(t * 12) % 2);
  m.ghost.visible = false;
  m.root.position.set(P(l.x), 0, P(l.y));
  m.cast.visible = down || going || resting;
  if (going || resting) {
    if (m.ring) m.ring.visible = false;
    m.bubble.visible = false; for (const bt of m.boots) bt.visible = false;
    m.dizzyStars.visible = false; m.head.rotation.z = 0;
    setCloak(m, false);
    m.arms[0].rotation.z = -0.18; m.arms[1].rotation.z = 0.18;
    m.root.rotation.y = Math.PI / 2 - l.dir;
    if (going) {                                          // хромает к домику
      m.rig.rotation.set(0, 0, Math.sin(l.walk) * 0.12);
      m.rig.position.set(0, Math.abs(Math.sin(l.walk)) * 0.04, 0);
      m.legs[0].rotation.x = Math.sin(l.walk) * 0.5; m.legs[1].rotation.x = 0.1;
      m.arms[0].rotation.x = 0; m.arms[1].rotation.x = 0;
      m.head.rotation.x = 0.25;
      m.face.mouth.rotation.z = 0;
    } else {                                              // сидит и отдыхает
      m.rig.rotation.set(0, 0, 0);
      m.rig.position.set(0, -0.2, 0);
      m.legs[0].rotation.x = -1.45; m.legs[1].rotation.x = -1.45;
      m.arms[0].rotation.x = -0.5; m.arms[1].rotation.x = -0.5;
      m.head.rotation.x = 0.35 + Math.sin(t * 1.5 + l.id) * 0.08;
      m.face.mouth.rotation.z = Math.PI;
    }
    return;
  }
  m.head.rotation.x = 0;
  const dizzy = !down && l.dizzy > 0;                    // выкинули из дома Большого: звёздочки вокруг головы
  m.dizzyStars.visible = dizzy; m.dizzyStars.rotation.y = t * 6;
  m.head.rotation.z = dizzy ? Math.sin(t * 9) * 0.25 : 0;
  if (m.ring) m.ring.visible = !down && l.hugAnim <= 0;
  const fx = l.fx || { boots: 0, cloak: 0, shield: 0 };
  for (const bt of m.boots) bt.visible = fx.boots > 0 && !down;
  if (m.gloveParts.length) { const on = l.kind === "player" && !!gloveOf(l.id); for (const gp of m.gloveParts) gp.visible = on; }
  m.bubble.visible = fx.shield > 0 && !down;
  if (m.bubble.visible) m.bubble.scale.setScalar(1 + Math.sin(t * 5) * 0.04);
  setCloak(m, fx.cloak > 0);
  if (m.cape) m.cape.rotation.x = 0.25 + (l.moving ? 0.35 + Math.sin(t * 12) * 0.12 : Math.sin(t * 2) * 0.05);
  if (l.hugAnim > 0) {                                   // висит на спине у Большого и обнимает
    m.rig.rotation.set(0.45, 0, 0);
    m.rig.position.set(0, 1.75 + Math.abs(Math.sin(t * 14)) * 0.08, 0.15);   // на плечах — голова и руки видны
    m.legs[0].rotation.x = -1.1; m.legs[1].rotation.x = -1.1;
    m.arms[0].rotation.x = -2.0 + Math.sin(t * 14) * 0.1; m.arms[1].rotation.x = -2.0 - Math.sin(t * 14) * 0.1;
    m.arms[0].rotation.z = 0.5; m.arms[1].rotation.z = -0.5;
    m.root.rotation.y = Math.PI / 2 - l.dir;
    m.face.mouth.rotation.z = Math.PI;
    return;
  }
  m.arms[0].rotation.z = -0.18; m.arms[1].rotation.z = 0.18;
  if (down) {
    m.rig.rotation.set(-Math.PI / 2, 0, 0); m.rig.position.set(0, 0.22 * LITTLE_SCALE, 0.42 * LITTLE_SCALE);
    swing(m, 0); m.arms[0].rotation.x = -0.6; m.arms[1].rotation.x = 0.4;
    m.root.rotation.y = 0;
    m.face.mouth.rotation.z = 0;
  } else {
    // SPEC-019: на цыпочках — шаги короче (и реже: шаг растёт с долей скорости), тело ниже и чуть вперёд
    const tip = l.moving && l.speedFrac > 0 && l.speedFrac < CFG.TIPTOE_MAX, T = LOOK.TIPTOE_LOOK;
    m.rig.rotation.set(tip ? T.lean : 0, 0, 0);
    m.rig.position.set(0, l.moving ? Math.abs(Math.sin(l.walk)) * (tip ? T.bob : 0.07) + (tip ? T.low : 0) : 0, 0);
    swing(m, l.moving ? Math.sin(l.walk) * (tip ? T.swing : 0.75) : 0);
    m.root.rotation.y = Math.PI / 2 - l.dir;
    m.face.mouth.rotation.z = Math.PI;
  }
}
// SPEC-022: настроение на экране: злой / средний / добреет (bigMood), подобрел и идёт домой — "happy" (лицо как у образа)
export const moodOf = b => (b.kind ? "happy" : bigMood());
function syncBig(b, t) {
  const m = modelOf(b);
  const mood = moodOf(b);
  if (m.mood !== mood) {                                   // перекрашиваем только при смене; лицо не человека (огр, робот, медведь) — своё
    m.mood = mood; setBigFace(m, m.moodFace ? LOOK.MOOD_LOOK.face[mood] ?? null : null);
  }
  m.root.position.set(P(b.x), 0, P(b.y));
  m.root.rotation.y = Math.PI / 2 - b.dir;
  const slipped = b.slip > 0, shocked = b.stun > 0 || slipped, resting = b.noPush > 0 && !shocked;
  const hugged = G.littles.some(l => l.hugAnim > 0);
  if (slipped) {                                         // упал на спину после банана
    m.rig.rotation.set(-1.3, 0, 0); m.rig.position.set(0, 0.55, 0.9);
    m.legs[0].rotation.x = -0.6 + Math.sin(t * 10) * 0.4; m.legs[1].rotation.x = -0.6 - Math.sin(t * 10) * 0.4;
  } else {
    m.rig.rotation.set(0, 0, 0);
    m.rig.position.set(0, b.moving ? Math.abs(Math.sin(b.walk)) * 0.07 : 0, 0);
    m.legs[0].rotation.x = b.moving ? Math.sin(b.walk) * 0.6 : 0; m.legs[1].rotation.x = -m.legs[0].rotation.x;
  }
  const bs = BIG_SCALE * bossScale(b), s = bs * (hugged ? 1 + Math.sin(t * 20) * 0.03 : 1);   // SPEC-022: босс крупнее
  m.rig.scale.set(s, bs * (hugged ? 1 - Math.sin(t * 20) * 0.03 : 1), s);
  const armX = shocked ? -2.7 : (b.state === "chase" ? -1.25 : (b.moving ? -Math.sin(b.walk) * 0.5 : 0));
  m.arms[0].rotation.x = shocked ? armX + Math.sin(t * 14) * 0.2 : armX;
  m.arms[1].rotation.x = shocked ? armX - Math.sin(t * 14) * 0.2 : (b.state === "chase" ? armX : -armX);
  m.stars.visible = shocked; m.stars.rotation.y = t * 4;
  m.sweat.visible = resting; m.sweat.position.y = 0.35 - ((t * 0.8) % 1) * 0.3;
  const angry = b.state === "chase" || b.state === "search";
  for (const br of m.face.brows) br.rotation.z = angry && !shocked ? -br.userData.k * 0.45 : (resting || shocked ? br.userData.k * 0.3 : 0);
  m.face.mouth.rotation.z = (angry && !shocked) || resting ? 0 : Math.PI;
  m.head.rotation.z = shocked ? Math.sin(t * 6) * 0.15 : 0;
  m.bodyMat.emissive.set(b.flash > 0 ? "#ff8fb0" : "#000000");
  const blushing = b.blush > 0 || !!b.kind;               // покраснел после воздушного поцелуя или подобрел (SPEC-022)
  m.cheeks.visible = blushing;
  const br = blushing ? 0.55 + Math.sin(t * 8) * 0.12 : 0, bb2 = blushing ? 0.1 : 0;
  for (const fm of m.faceMats) fm.emissive.setRGB(br, 0, bb2);   // SPEC-021: всё лицо (и щетина) краснеет
  // смущается: голову чуть вверх (красное лицо видно сверху), руки вместе, улыбается
  if (blushing && !shocked) { m.head.rotation.x = -0.2; m.arms[0].rotation.x = -0.5; m.arms[1].rotation.x = -0.5; m.face.mouth.rotation.z = Math.PI; }
  else m.head.rotation.x = 0;
  // SPEC-022: подобрел (идёт домой, art/11_win, art/1_papa): улыбается, краснеет (румянец — blush), машет одной рукой, другая качается
  const ML = LOOK.MOOD_LOOK;
  if (b.kind) {
    m.face.mouth.rotation.z = Math.PI;
    for (const brw of m.face.brows) brw.rotation.z = brw.userData.k * 0.2;
    m.arms[0].rotation.x = 0; m.arms[0].rotation.z = -(ML.wave + Math.sin(t * ML.waveSpeed) * ML.waveAmp);
    m.arms[1].rotation.x = b.moving ? Math.sin(b.walk) * 0.5 : 0; m.arms[1].rotation.z = 0.25;
  } else { m.arms[0].rotation.z = -0.25; m.arms[1].rotation.z = 0.25; }   // как при постройке (k × 0.25)
  if (m.blink) m.blink.material.emissiveIntensity = Math.floor(t * 3) % 2 ? 1 : 0.2;
}
let lastSyncT = 0;
function syncScene(t) {
  const dt = Math.min(0.05, Math.max(0, t - lastSyncT)); lastSyncT = t;
  for (const l of G.littles) syncLittle(l, t);
  syncBig(G.big, t);
  syncItems(t);
  syncStars(t);
  syncKisses(t);
  updateCone();
  // обратный отсчёт у игрока в доме Большого — стены мигают красным
  const warn = mode === "play" && G.littles.some(l => l.kind === "player" && l.state === "ok" && l.dangerT > CFG.DANGER_TIME - LOOK.DANGER_WARN);
  const glow = warn ? 0.45 + Math.sin(t * 12) * 0.35 : 0;
  for (const m of bigHomeMats) m.emissive.setRGB(glow, 0, 0);
  backPivot.position.set(P(G.big.x), 0.045, P(G.big.y));
  backPivot.rotation.y = -(G.big.dir + Math.PI);
  backPivot.visible = G.big.stun <= 0 && G.big.slip <= 0 && !inMenus();
  backMat.opacity = 0.3 + Math.sin(t * 5) * 0.1;
  fadeRoofs(dt, t);                       // SPEC-021: крыша не прячет тех, кто в доме; у безопасного — зелёный свет
  for (const ft of fadeTrees) {
    const o = ft.o;
    const behind = G.littles.some(l => l.y < o.y + 4 && l.y > o.y - 80 && Math.abs(l.x - o.x) < 30) || (G.big.y < o.y + 4 && G.big.y > o.y - 90 && Math.abs(G.big.x - o.x) < 40);
    ft.a += ((behind ? 0.35 : 1) - ft.a) * 0.2;
    for (const mt of ft.mats) { mt.opacity = ft.a; mt.userData.outline.opacity = ft.a; mt.depthWrite = ft.a > 0.95; }
  }
  for (const fb of fadeBushes) {
    const inside = G.littles.some(l => l.kind === "player" && Math.hypot(l.x - fb.b.x, l.y - fb.b.y) < fb.b.r + 4);
    fb.a += ((inside ? 0.45 : 1) - fb.a) * 0.2;
    for (const mt of fb.mats) { mt.opacity = fb.a; mt.userData.outline.opacity = fb.a; mt.depthWrite = fb.a > 0.95; }
  }
  for (const [i, wv] of waves.entries()) wv.position.y = (wv.userData.baseY ?? 0.04) + Math.sin(t * 2 + i) * 0.01, wv.rotation.z = Math.sin(t + i) * 0.3;
  if (snow) {
    const pa = snow.geometry.attributes.position.array;
    for (let i = 0; i < pa.length; i += 3) {
      pa[i + 1] -= dt * (1.2 + (i % 7) * 0.1); pa[i] += Math.sin(t + i) * dt * 0.3;
      if (pa[i + 1] < 0) pa[i + 1] += 14;
    }
    snow.geometry.attributes.position.needsUpdate = true;
  }
  if (safeGlow) safeGlow.material.opacity = 0.18 + Math.sin(t * 2) * 0.08;
  camera.position.copy(camBase);
  if (ui.shake > 0) camera.position.add(new THREE.Vector3(vrand(-1, 1), vrand(-1, 1), vrand(-1, 1)).multiplyScalar(ui.shake * 0.6 * (PHONE ? camDist / cam.dFull : 1)));   // телефон: камера ближе — трясёт слабее
}

export function render3D(t) {
  ui.renders++;
  syncPaper();
  syncScene(t);
  renderer.setViewport(0, 0, CSS_W, CSS_H);
  renderer.render(scene, camera);
  if ((inWardrobe() && ui.wardrobePage === "looks") || progressTab()) renderPreviews(t);   // SPEC-026: и на странице «Прогресс»
}

// called once by main.js, in the start order of the one-file game
export function initSync() {
  coneGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((CONE_N + 2) * 3), 3));
  for (let i = 1; i <= CONE_N; i++) coneIdx.push(0, i + 1, i);
  coneGeo.setIndex(coneIdx);
  coneMesh.frustumCulled = false;
  coneMesh.renderOrder = 2;
  scene.add(coneMesh);
  backMesh.rotation.x = -Math.PI / 2;
  backMesh.renderOrder = 2;
  backPivot.add(backMesh);
  scene.add(backPivot);
  scene.add(itemGroup);
  scene.add(starGroup);
  scene.add(kissGroup);
}
