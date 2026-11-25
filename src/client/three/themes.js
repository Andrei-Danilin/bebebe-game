// SPEC-011: THEMES (colours of the six places) and the place objects: trees, palms, rocks, bushes, ponds, goals, street
// things, cottages, water, fountains, maze decor. Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { CELL, COLS, H, ROWS, TAU, W } from "../../core/config.js";
import { floors, obstacles } from "../../core/world.js";
import { ctx } from "../screen.js";
import { mapGroup, waves } from "./map3d.js";
import { INK3, ownMat, part, sphere, toon, toonH } from "./materials.js";
import { P, WALL_H } from "./setup.js";
import { circle } from "../ui/draw.js";

// ---------- Места: оформление поверх одного и того же генератора ----------
export const THEMES = {
  // walls: [стена, верх]; maze — стены лабиринта (deco: кочки живой изгороди / столбики забора / снежки / дверцы шкафчиков);
  // cottage — домики деревни; water — река (edge — берег, stone — каменный бортик канала, waves/wave — волны и их цвет); bridge — [доски, щели];
  // square — площадь [мостовая, камни]; fountain — чаша фонтана.
  // SPEC-021 (цвета — с картинок мест art/7_1…7_4, 16, 17; домики во всех мирах одинаковые, как в art/15_houses: голубой и выцветший красный): marker — штрихи фломастера по земле [тёмный, светлый]; doodle — рисунки
  // по земле (травинки, тени на снегу, мел); sea — море за забором (Пляж); asphaltMarker — штрихи и крапинки асфальта (Город)
  // deco (SPEC-016, необязательно; одно имя — один смысл в любом месте) — цвета деталей места:
  //   земля: chalk (разметка), asphalt, roadLine, zebra, kerb (бордюр и бортик бассейна); забор: boards [щиты по очереди];
  //   ворота: goal (рама), goalNet, goalArea (площадка под воротами и ворота на мини-карте); flag, flagPole;
  //   «камни»: cone, coneStripe, bag, bagStrap, cars [кузова по очереди], carGlass, carTyre, carLight;
  //   «кусты»: hedge, hedgeLight, planter, soil, leaves, flowers [по очереди];
  //   за оградой: lampPole, lampLight, mastPole, mastLight, benchSeat, benchLeg, hydrant, bin, ballSkin, ballPatch
  park:   { bg: "#5fae3a", outer: "#6dbf42", g1: "#8fd957", g2: "#86d14e", dots: ["#fff27a", "#ff9ecb", "#ffffff", "#b5e3ff"], fence: "#c8935a",
            marker: ["#4f9f2c", "#b9ef7c"], doodle: "#3f8a24",
            walls: { home: ["#9fd3f5", "#dcf0ff"], bighome: ["#c4483e", "#e9a39a"], build: ["#f4b860", "#fde0ad"], arena: ["#9aa0a6", "#d1d5db"] },
            maze: { wall: "#2f8a3a", cap: "#4fb052", deco: "bumps", decoC: "#5fbf5c" },
            cottage: { wall: "#fde68a", roof: "#ef4444", door: "#92400e", window: "#bae6fd" },
            water: { c: "#3fa9e6", edge: "#4a9a3f", waves: true, wave: "#e0f4ff" }, bridge: ["#c8925a", "#8b5a2b"], square: ["#eadcae", "#d8c58e"], fountain: "#cbd5e1" },
  beach:  { bg: "#5ccbe6", outer: "#efcf86", g1: "#f3d690", g2: "#eecd82", dots: ["#fda4af", "#fdba74", "#ffffff", "#fcd34d"], fence: "#c8935a",
            marker: ["#d09c4c", "#fff0c4"], doodle: "#c99a52", sea: "#2fc3d0",
            walls: { home: ["#9fd3f5", "#dcf0ff"], bighome: ["#c4483e", "#e9a39a"], build: ["#fde68a", "#fffbeb"], arena: ["#d6c29a", "#efe3c4"] },
            maze: { wall: "#ecd3a4", cap: "#fbefd5", deco: "posts", decoC: "#a87b45" },
            cottage: { wall: "#ffffff", roof: "#38bdf8", door: "#0e7490", window: "#bae6fd" },
            water: { c: "#2fc3d0", edge: "#fff1c9", waves: true, wave: "#e0fffa" }, bridge: ["#e8c48f", "#b88a4e"], square: ["#fde7c0", "#f0cf98"], fountain: "#fef3c7" },
  winter: { bg: "#c9def4", outer: "#eaf2fb", g1: "#f6faff", g2: "#edf4fc", dots: ["#bfdbfe", "#ffffff", "#93c5fd", "#dbeafe"], fence: "#8b5a2b", snow: true,
            marker: ["#c4daf1", "#ffffff"], doodle: "#a9c8ea",
            walls: { home: ["#9fd3f5", "#ffffff"], bighome: ["#c4483e", "#ffffff"], build: ["#c08457", "#ffffff"], arena: ["#94a3b8", "#ffffff"] },
            maze: { wall: "#8db6dd", cap: "#a9cbec", deco: "snow", decoC: "#ffffff" },   // SPEC-021: ледяные блоки — темнее снега
            cottage: { wall: "#c08457", roof: "#7f1d1d", snow: "#ffffff", door: "#5b3716", window: "#fef3c7" },
            water: { c: "#b7dcf7", edge: "#ffffff", waves: false, wave: "#ffffff" }, bridge: ["#a16207", "#713f12"], square: ["#e2e8f0", "#cbd5e1"], fountain: "#e2e8f0" },
  school: { bg: "#7fb85a", outer: "#7cb556", g1: "#b4b1ad", g2: "#aca9a5", dots: [], fence: "#64748b",
            marker: ["#94918d", "#cfccc8"], doodle: "#ffffff",
            walls: { home: ["#9fd3f5", "#dcf0ff"], bighome: ["#c4483e", "#e9a39a"], build: ["#c0473a", "#eaa290"], arena: ["#a8a29e", "#d6d3d1"] },
            maze: { wall: "#3c6fb8", cap: "#8fb3e6", deco: "seams", decoC: "#1e3a8a" },
            cottage: { wall: "#fca5a5", roof: "#64748b", door: "#7c2d12", window: "#e0f2fe" },
            water: { c: "#3b82f6", edge: "#78716c", stone: true, waves: true, wave: "#dbeafe" }, bridge: ["#b45309", "#78350f"], square: ["#d6d3d1", "#a8a29e"], fountain: "#d6d3d1" },
  // SPEC-016: Футбольное поле — полосы скошенной травы и меловая разметка, рекламные щиты вместо забора, ворота вместо пруда,
  // конусы и сумка вместо камня, круглые кусты; деревня — киоски и раздевалки, река — дренажная канава, дом — клуб, арена — трибуны,
  // лабиринт — живая изгородь с рекламными щитами. deco — цвета деталей места (щиты, ворота, флажки, скамейки, мяч, конусы, мачты)
  field:  { bg: "#53a43a", outer: "#4f9a36", g1: "#74c943", g2: "#63b838", dots: [], fence: "#ffffff",
            marker: ["#4b9a2a", "#a0e36a"], doodle: "#3f8a24",
            walls: { home: ["#9fd3f5", "#dcf0ff"], bighome: ["#c4483e", "#e9a39a"], build: ["#f59e0b", "#fef3c7"], arena: ["#475569", "#c4b5fd"] },
            maze: { wall: "#1f7a3a", cap: "#34a853", deco: "boards", decoC: "#ffffff" },
            cottage: { wall: "#f8fafc", roof: "#16a34a", door: "#1e3a8a", window: "#bae6fd" },
            water: { c: "#4fb3d9", edge: "#a8a29e", stone: true, waves: true, wave: "#e0f2fe" }, bridge: ["#d6a463", "#8b5a2b"], square: ["#e7e5e4", "#d6d3d1"], fountain: "#cbd5e1",
            deco: { chalk: "#ffffff", boards: ["#ef4444", "#2563eb", "#facc15", "#f8fafc", "#16a34a", "#f97316"], goal: "#ffffff", goalNet: "#ffffff", goalArea: "#86d860",
              flag: "#facc15", flagPole: "#f8fafc", benchSeat: "#2563eb", benchLeg: "#475569", ballSkin: "#ffffff", ballPatch: "#1f2937",
              cone: "#f97316", coneStripe: "#ffffff", bag: "#1d4ed8", bagStrap: "#ffffff", mastPole: "#94a3b8", mastLight: "#fef9c3",
              hedge: "#2f9e44", hedgeLight: "#69db7c" } },
  // SPEC-016: Город — тротуарная плитка, две улицы с разметкой и зебрами, низкая ограда; машины вместо камней, клумбы-кадки вместо
  // кустов, пруд — бассейн с каменным бортиком; деревня — городские домики, река — канал с каменными мостами, дом — торговый центр,
  // арена — кольцо-клумба, лабиринт — дворовые заборы. За оградой — фонари, гидранты, скамейки, урны и деревья
  city:   { bg: "#8f959c", outer: "#a9adb3", g1: "#ece3d0", g2: "#e4d9c3", dots: [], fence: "#475569",
            marker: ["#cbbd9f", "#fffaf0"], doodle: "#cbbd9f", asphaltMarker: ["#4d5156", "#868a90"],
            walls: { home: ["#9fd3f5", "#dcf0ff"], bighome: ["#c4483e", "#e9a39a"], build: ["#a78bfa", "#ede9fe"], arena: ["#9ca3af", "#65a30d"] },
            maze: { wall: "#a0703f", cap: "#c9935f", deco: "posts", decoC: "#6b4423" },
            cottage: { wall: "#e7b85a", roof: "#5b6a8c", door: "#7c2d12", window: "#fef9c3" },
            water: { c: "#2b8fd0", edge: "#9ca3af", stone: true, waves: true, wave: "#dbeafe" }, bridge: ["#d6d3d1", "#78716c"], square: ["#f1e9da", "#e2d5bd"], fountain: "#e5e7eb",
            deco: { asphalt: "#63676c", roadLine: "#f8fafc", zebra: "#f8fafc", kerb: "#9ca3af", cars: ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#f97316", "#a855f7"],
              carGlass: "#bae6fd", carTyre: "#1f2937", carLight: "#fef9c3", planter: "#a8a29e", soil: "#7c4a1e", leaves: "#22c55e", flowers: ["#f472b6", "#facc15", "#f87171", "#c084fc"],
              lampPole: "#475569", lampLight: "#fef9c3", hydrant: "#ef4444", benchSeat: "#92400e", benchLeg: "#475569", bin: "#16a34a" } }
};
export const HEDGE_COLORS = ["#3f9a4a", "#7bd07e"];

function fadeHelper(fade) {
  const mats = [];
  const M = c => { if (!fade) return null; const m = ownMat(c, true); mats.push(m); return m; };
  return { mats, M };
}
function makeTree(variant, s, fade) {
  const g = new THREE.Group(), { mats, M } = fadeHelper(fade);
  const trunk = part(new THREE.CylinderGeometry(0.15, 0.21, 0.9, 8), "#8b5a2b", 0.03, M("#8b5a2b"));
  trunk.position.y = 0.45; g.add(trunk);
  if (variant === "pine" || variant === "snowpine") {
    const c1 = part(new THREE.ConeGeometry(0.8, 1.3, 9), "#2f9e44", 0.04, M("#2f9e44")); c1.position.y = 1.35; g.add(c1);
    const c2 = part(new THREE.ConeGeometry(0.62, 1.05, 9), "#40c057", 0.04, M("#40c057")); c2.position.y = 2.0; g.add(c2);
    if (variant === "snowpine") {
      const s1 = part(new THREE.ConeGeometry(0.5, 0.5, 9), "#ffffff", 0.03, M("#ffffff")); s1.position.y = 1.78; g.add(s1);
      const s2 = part(new THREE.ConeGeometry(0.36, 0.42, 9), "#ffffff", 0.03, M("#ffffff")); s2.position.y = 2.36; g.add(s2);
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.08, 14), M("#ffffff") || toon("#ffffff")); pile.position.y = 0.04; g.add(pile);
    }
  } else {
    const crown = part(sphere(0.78, 16, 12), "#40c057", 0.04, M("#40c057")); crown.position.y = 1.55; g.add(crown);
    const hi = new THREE.Mesh(sphere(0.3, 10, 8), M("#7ee08a") || toon("#7ee08a")); hi.position.set(-0.3, 1.85, 0.35); g.add(hi);
    for (const [x, y, z] of [[0.45, 1.4, 0.5], [-0.5, 1.3, 0.35], [0.2, 1.95, 0.55], [0.6, 1.75, -0.1]]) {
      const a = part(sphere(0.1, 8, 6), "#ff5252", 0.02, M("#ff5252")); a.position.set(x, y, z); g.add(a);
    }
  }
  g.scale.setScalar(s);
  return { g, mats };
}
function makePalm(s, fade) {
  const g = new THREE.Group(), { mats, M } = fadeHelper(fade);
  let x = 0, y = 0;
  for (let i = 0; i < 5; i++) {
    const seg = part(new THREE.CylinderGeometry(0.13 - i * 0.012, 0.16 - i * 0.012, 0.5, 8), "#a16207", 0.025, M("#a16207"));
    seg.position.set(x, y + 0.25, 0); seg.rotation.z = -0.08 * i; g.add(seg);
    x += Math.sin(0.08 * i) * 0.5 * 0.3; y += 0.48;
  }
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * TAU, leaf = part(new THREE.ConeGeometry(0.17, 1.15, 4), "#22c55e", 0.025, M("#22c55e"));
    leaf.position.set(x + Math.cos(a) * 0.45, y + 0.05, Math.sin(a) * 0.45);
    leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25); leaf.scale.z = 0.35; g.add(leaf);
  }
  for (const [dx, dz] of [[0.12, 0.1], [-0.1, 0.12], [0.02, -0.14]]) { const c = part(sphere(0.11, 8, 6), "#7c4a1e", 0.015, M("#7c4a1e")); c.position.set(x + dx, y - 0.1, dz); g.add(c); }
  g.scale.setScalar(s);
  return { g, mats };
}
export function makeTreeFor(place, o, fade) {
  if (place === "beach") return makePalm(o.s, fade);
  if (place === "winter") return makeTree("snowpine", o.s, fade);
  if (place === "school" || place === "field" || place === "city") return makeTree("round", o.s, fade);   // SPEC-016: деревья у поля, на улицах
  return makeTree(o.v, o.s, fade);
}
const CAR_LEN = 1.0;   // SPEC-016: длина машины в клетках = диаметр круга камня (r 16 px), им она и мешает идти и смотреть
export function makeRockFor(place, o) {
  const g = new THREE.Group(), s = o.s;
  if (place === "beach") {                               // песочный замок
    const base = part(new THREE.BoxGeometry(0.8, 0.4, 0.8), "#e9c46a", 0.03); base.position.y = 0.2; g.add(base);
    for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) {
      const t = part(new THREE.CylinderGeometry(0.14, 0.16, 0.55, 8), "#e9c46a", 0.025); t.position.set(x, 0.42, z); g.add(t);
      const c = part(new THREE.ConeGeometry(0.17, 0.25, 8), "#d4a24c", 0.02); c.position.set(x, 0.82, z); g.add(c);
    }
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), toon("#ef4444")); flag.position.set(0.42, 1.1, 0.32); g.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4), toon(INK3)); pole.position.set(0.32, 1.0, 0.32); g.add(pole);
  } else if (place === "winter") {                       // снеговик
    const b1 = part(sphere(0.42, 16, 12), "#ffffff", 0.035); b1.position.y = 0.4; g.add(b1);
    const b2 = part(sphere(0.31, 16, 12), "#ffffff", 0.03); b2.position.y = 0.98; g.add(b2);
    const b3 = part(sphere(0.23, 16, 12), "#ffffff", 0.03); b3.position.y = 1.42; g.add(b3);
    const nose = part(new THREE.ConeGeometry(0.05, 0.22, 8), "#f97316", 0.015); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.42, 0.3); g.add(nose);
    for (const k of [-1, 1]) { const e = new THREE.Mesh(sphere(0.035, 6, 5), toon("#111111")); e.position.set(k * 0.08, 1.5, 0.2); g.add(e); }
    const scarf = part(new THREE.TorusGeometry(0.22, 0.06, 6, 16), "#ef4444", 0.015); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.22; g.add(scarf);
    const hat = part(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 12), "#1f2937", 0.02); hat.position.y = 1.7; g.add(hat);
    for (const k of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.55, 5), toon("#7c4a1e")); arm.position.set(k * 0.45, 1.05, 0); arm.rotation.z = k * 1.0; g.add(arm); }
  } else if (place === "school") {                       // большой футбольный мяч
    const ball = part(sphere(0.48, 18, 14), "#ffffff", 0.035); ball.position.y = 0.48; g.add(ball);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, yy = Math.cos(k * 1.3) * 0.38;
      const spot = new THREE.Mesh(sphere(0.12, 8, 6), toon("#1f2937"));
      const rr2 = Math.sqrt(Math.max(0, 0.48 * 0.48 - yy * yy));
      spot.position.set(Math.cos(a) * rr2 * 0.95, 0.48 + yy, Math.sin(a) * rr2 * 0.95); spot.scale.setScalar(0.85); g.add(spot);
    }
  } else if (place === "field") {                        // SPEC-016: конусы и спортивная сумка
    const D = THEMES[place].deco;
    const bag = part(new THREE.BoxGeometry(0.72, 0.34, 0.38), D.bag, 0.03); bag.position.set(0, 0.17, 0.12); bag.rotation.y = o.x * 0.37; g.add(bag);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.08), toon(D.bagStrap)); strap.position.set(0, 0.36, 0.12); strap.rotation.y = o.x * 0.37; g.add(strap);
    for (const [x, z] of [[-0.3, -0.28], [0.08, -0.36], [0.36, -0.12]]) {
      const c = part(new THREE.ConeGeometry(0.16, 0.42, 10), D.cone, 0.02); c.position.set(x, 0.21, z); g.add(c);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 10), toon(D.coneStripe)); st.position.set(x, 0.24, z); g.add(st);
    }
  } else if (place === "city") {                         // SPEC-016: машина у тротуара (как камень: не пройти и не видно)
    const D = THEMES[place].deco, k = Math.floor(o.x / CELL) * 7 + Math.floor(o.y / CELL) * 3, col = D.cars[k % D.cars.length];
    const car = new THREE.Group();
    const body = part(new THREE.BoxGeometry(1.15, 0.36, 0.62), col, 0.03); body.position.y = 0.3; car.add(body);
    const glass = part(new THREE.BoxGeometry(0.62, 0.24, 0.56), D.carGlass, 0.02); glass.position.set(-0.05, 0.6, 0); car.add(glass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.6), toon(col)); roof.position.set(-0.05, 0.74, 0); car.add(roof);
    const wheel = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12);
    for (const [x, z] of [[-0.36, 0.31], [0.36, 0.31], [-0.36, -0.31], [0.36, -0.31]]) { const w = new THREE.Mesh(wheel, toon(D.carTyre)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.15, z); car.add(w); }
    for (const z of [-0.2, 0.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.12), toon(D.carLight)); l.position.set(0.58, 0.34, z); car.add(l); }
    car.scale.setScalar(CAR_LEN / (1.15 * s)); if (k % 2) car.rotation.y = Math.PI / 2;   // длина ≈ круг камня (1 клетка): что видно — то и мешает
    g.add(car);
  } else {                                               // камень
    const r = part(new THREE.DodecahedronGeometry(0.58, 0), "#8e98a3", 0.04);
    r.scale.y = 0.72; r.position.y = 0.3; r.rotation.y = o.x * 0.37; g.add(r);
  }
  g.scale.setScalar(s);
  g.traverse(q => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
  return g;
}
export function makeBushFor(place) {
  const g = new THREE.Group(), mats = [];
  const fm = c => { const m = ownMat(c, true); mats.push(m); return m; };
  if (place === "beach") {                               // пляжный зонтик: под ним Большой не видит
    const pole = part(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), "#f8fafc", 0.015, fm("#f8fafc")); pole.position.y = 0.7; g.add(pole);
    const cols = ["#ef4444", "#ffffff"];
    for (let k = 0; k < 8; k++) {
      const seg = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.42, 8, 1, true, k * TAU / 8, TAU / 8), fm(cols[k % 2]));
      seg.material.side = THREE.DoubleSide; seg.position.y = 1.45; seg.castShadow = true; g.add(seg);
    }
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 1.0), toon("#38bdf8")); towel.position.set(0.25, 0.015, 0.2); towel.rotation.y = 0.4; g.add(towel);
    return { g, mats };
  }
  if (place === "field") {                               // SPEC-016: круглый подстриженный куст
    const D = THEMES[place].deco;
    const b = part(sphere(0.68, 16, 12), "", 0.035, fm(D.hedge)); b.scale.y = 0.85; b.position.y = 0.58; g.add(b);
    const hl = new THREE.Mesh(sphere(0.24, 10, 8), fm(D.hedgeLight)); hl.position.set(-0.2, 1.0, -0.15); g.add(hl);
    return { g, mats };
  }
  if (place === "city") {                                // SPEC-016: кадка с цветами
    const D = THEMES[place].deco;
    const box = part(new THREE.BoxGeometry(1.4, 0.5, 1.2), D.planter, 0.035, fm(D.planter)); box.position.y = 0.25; g.add(box);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.04, 1.04), fm(D.soil)); soil.position.y = 0.51; g.add(soil);
    const lm = fm(D.leaves);
    for (const [x, z, r] of [[-0.3, -0.2, 0.36], [0.3, -0.15, 0.34], [0, 0.22, 0.38]]) { const l = part(sphere(r, 12, 8), "", 0.03, lm); l.position.set(x, 0.62, z); g.add(l); }
    D.flowers.forEach((c, i) => { const f = part(sphere(0.11, 8, 6), "", 0.015, fm(c)); f.position.set(-0.38 + i * 0.25, 0.92 - (i % 2) * 0.08, 0.1 + (i % 2 ? 0.25 : -0.1)); g.add(f); });
    return { g, mats };
  }
  const c0 = place === "winter" ? "#ffffff" : "#51cf66", c1 = place === "winter" ? "#e0f2fe" : "#8ce99a";
  if (place === "school") {                              // подстриженный куст-изгородь
    const box = part(new THREE.BoxGeometry(1.5, 0.9, 1.3), HEDGE_COLORS[0], 0.035, fm(HEDGE_COLORS[0])); box.position.y = 0.45; g.add(box);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.1), fm(HEDGE_COLORS[1])); top.position.y = 0.92; g.add(top);
    for (const [x, z] of [[-0.5, 0.66], [0.1, 0.66], [0.55, 0.66]]) { const f = part(sphere(0.07, 8, 6), "#fde047", 0.015, fm("#fde047")); f.position.set(x, 0.6, z); g.add(f); }
    return { g, mats };
  }
  const m0 = fm(c0), m1 = fm(c1);
  for (const [x, z, r] of [[-0.42, 0.05, 0.48], [0.42, 0.05, 0.48], [0, -0.3, 0.55], [-0.15, 0.32, 0.42], [0.25, 0.3, 0.42]]) {
    const b = part(sphere(r, 14, 10), "", 0.035, m0); b.position.set(x, r * (place === "winter" ? 0.55 : 0.75), z); g.add(b);
  }
  const hl = new THREE.Mesh(sphere(0.2, 10, 8), m1); hl.position.set(-0.15, place === "winter" ? 0.65 : 0.85, -0.2); g.add(hl);
  if (place !== "winter") {
    const mb = fm("#e64980");
    for (const [x, y, z] of [[-0.35, 0.6, 0.38], [0.32, 0.55, 0.42], [0.05, 0.75, 0.3]]) { const be = part(sphere(0.07, 8, 6), "", 0.015, mb); be.position.set(x, y, z); g.add(be); }
  }
  return { g, mats };
}
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function flat(shapeGeo, color, y, cx, cz) {
  const m = new THREE.Mesh(shapeGeo, toon(color));
  m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); m.receiveShadow = true;
  return m;
}
export function makePondFor(place, o) {
  const w = P(o.w), d = P(o.h), cx = P(o.x) + w / 2, cz = P(o.y) + d / 2;
  if (place === "school") {                              // песочница
    const sand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), toon("#f5deb3")); sand.position.set(cx, 0.06, cz); sand.receiveShadow = true; mapGroup.add(sand);
    for (const [x, z, ww, dd] of [[cx, cz - d / 2 - 0.08, w + 0.4, 0.16], [cx, cz + d / 2 + 0.08, w + 0.4, 0.16], [cx - w / 2 - 0.12, cz, 0.16, d + 0.1], [cx + w / 2 + 0.12, cz, 0.16, d + 0.1]]) {
      const b = part(new THREE.BoxGeometry(ww, 0.24, dd), "#b45309", 0.02); b.position.set(x, 0.12, z); mapGroup.add(b);
    }
    const bucket = part(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 12), "#ef4444", 0.02); bucket.position.set(cx - w / 4, 0.25, cz); mapGroup.add(bucket);
    const spade = part(new THREE.BoxGeometry(0.14, 0.03, 0.4), "#3b82f6", 0.015); spade.position.set(cx + w / 4, 0.14, cz + 0.1); spade.rotation.y = 0.6; mapGroup.add(spade);
    return;
  }
  if (place === "field") { makeGoal(place, o); return; }   // SPEC-016: ворота
  const rimC = place === "beach" ? "#ffffff" : place === "winter" ? "#ffffff" : place === "city" ? THEMES[place].deco.kerb : INK3;
  const waterC = place === "beach" ? "#2dd4bf" : place === "winter" ? "#cfe9ff" : place === "city" ? THEMES[place].water.c : "#5ab8f0";
  mapGroup.add(flat(new THREE.ShapeGeometry(roundedRectShape(w + (place === "beach" ? 0.6 : 0.42), d + (place === "beach" ? 0.5 : 0.3), 0.7)), rimC, 0.012, cx, cz));
  if (place === "beach") mapGroup.add(flat(new THREE.ShapeGeometry(roundedRectShape(w + 0.62, d + 0.52, 0.72)), INK3, 0.008, cx, cz));
  const water = flat(new THREE.ShapeGeometry(roundedRectShape(w + 0.3, d + 0.18, 0.65)), waterC, 0.025, cx, cz);
  mapGroup.add(water);
  if (place === "winter") {                              // лёд с трещинками
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5 + k * 0.1, 0.005, 0.025), toon("#93c5fd")); c.position.set(cx - w / 3 + k * w / 4, 0.03, cz + (k % 2 ? 0.15 : -0.15)); c.rotation.y = k * 0.9; mapGroup.add(c); }
    return;
  }
  for (let k = 0; k < 3; k++) {
    const wv = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 12, Math.PI * 0.8), toon("#e0f4ff"));
    wv.rotation.x = -Math.PI / 2; wv.position.set(cx - w / 3 + k * w / 3, 0.04, cz + (k % 2 ? 0.2 : -0.2));
    mapGroup.add(wv); waves.push(wv);
  }
  if (place === "beach") {                               // лесенка бассейна
    for (const k of [-1, 1]) { const bar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), toon("#cbd5e1")); bar.position.set(cx + w / 2 - 0.2 + k * 0.12, 0.1, cz - d / 2 - 0.05); mapGroup.add(bar); }
  } else {
    const pad = part(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), "#4caf50", 0.02); pad.position.set(cx + w / 2 - 0.4, 0.045, cz - d / 2 + 0.35); mapGroup.add(pad);
  }
}

// SPEC-016: сетка ворот — прозрачная текстура-клетка, одна на цвет за всю игру (материал общий, не удаляется с картой)
const netMats = new Map();
function goalNetMat(color) {
  if (netMats.has(color)) return netMats.get(color);
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d"); g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  netMats.set(color, m);
  return m;
}
// SPEC-016: ворота на месте пруда (стоять нельзя, сквозь сетку видно): штанги и перекладина со стороны центра поля, сетка — коробка
function makeGoal(place, o) {
  const D = THEMES[place].deco, w = P(o.w), d = P(o.h), cx = P(o.x) + w / 2, cz = P(o.y) + d / 2, H = 0.9;
  mapGroup.add(flat(new THREE.PlaneGeometry(w + 0.3, d + 0.3), D.goalArea, 0.01, cx, cz));
  const net = new THREE.Mesh(new THREE.BoxGeometry(w, H * 0.85, d), goalNetMat(D.goalNet)); net.position.set(cx, H * 0.425, cz); mapGroup.add(net);
  const along = w >= d, len = along ? w : d, dep = along ? d : w;
  // рот ворот смотрит к центру карты
  const toC = along ? (cz < ROWS / 2 ? 1 : -1) : (cx < COLS / 2 ? 1 : -1);
  const post = new THREE.CylinderGeometry(0.07, 0.07, H, 8);
  for (const k of [-1, 1]) {
    const p = part(post, D.goal, 0.02);
    p.position.set(along ? cx + k * len / 2 : cx + toC * dep / 2, H / 2, along ? cz + toC * dep / 2 : cz + k * len / 2); mapGroup.add(p);
    const back = part(new THREE.CylinderGeometry(0.04, 0.04, H * 0.85, 6), D.goal, 0.015);
    back.position.set(along ? cx + k * len / 2 : cx - toC * dep / 2, H * 0.425, along ? cz - toC * dep / 2 : cz + k * len / 2); mapGroup.add(back);
  }
  const bar = part(new THREE.CylinderGeometry(0.07, 0.07, len + 0.14, 8), D.goal, 0.02);
  bar.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
  bar.position.set(along ? cx : cx + toC * dep / 2, H, along ? cz + toC * dep / 2 : cz); mapGroup.add(bar);
}
// SPEC-016: украшения за оградой Поля и Города (только вид, не препятствия): фонарь, мачта света, скамейка, гидрант, урна, флажок, мяч
export function makeStreetThing(kind, D) {
  const g = new THREE.Group();
  if (kind === "lamp" || kind === "mast") {
    const mast = kind === "mast", tall = mast ? 3.6 : 2.0, poleC = mast ? D.mastPole : D.lampPole, lightC = mast ? D.mastLight : D.lampLight;
    const pole = part(new THREE.CylinderGeometry(0.06, 0.09, tall, 8), poleC, 0.02); pole.position.y = tall / 2; g.add(pole);
    const head = part(mast ? new THREE.BoxGeometry(0.9, 0.4, 0.2) : sphere(0.18, 10, 8), poleC, 0.02); head.position.y = tall + 0.1; g.add(head);
    const glow = new THREE.Mesh(mast ? new THREE.BoxGeometry(0.8, 0.3, 0.05) : sphere(0.13, 10, 8), toon(lightC));
    glow.position.set(0, tall + (mast ? 0.1 : 0.02), mast ? 0.12 : 0); g.add(glow);
  } else if (kind === "bench") {
    const seat = part(new THREE.BoxGeometry(1.2, 0.08, 0.36), D.benchSeat, 0.02); seat.position.y = 0.36; g.add(seat);
    const back = part(new THREE.BoxGeometry(1.2, 0.3, 0.07), D.benchSeat, 0.02); back.position.set(0, 0.6, -0.16); g.add(back);
    for (const x of [-0.5, 0.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.3), toon(D.benchLeg)); l.position.set(x, 0.18, 0); g.add(l); }
  } else if (kind === "hydrant") {
    const b = part(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 10), D.hydrant, 0.02); b.position.y = 0.25; g.add(b);
    const t = part(sphere(0.14, 10, 8), D.hydrant, 0.02); t.position.y = 0.52; g.add(t);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), toon(D.hydrant)); s.rotation.z = Math.PI / 2; s.position.y = 0.32; g.add(s);
  } else if (kind === "bin") {
    const b = part(new THREE.CylinderGeometry(0.2, 0.17, 0.55, 10), D.bin, 0.02); b.position.y = 0.28; g.add(b);
  } else if (kind === "flag") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), toon(D.flagPole)); pole.position.y = 0.5; g.add(pole);
    const f = part(new THREE.BoxGeometry(0.3, 0.2, 0.02), D.flag, 0.01); f.position.set(0.15, 0.88, 0); g.add(f);
  } else if (kind === "ball") {
    const b = part(sphere(0.2, 12, 10), D.ballSkin, 0.02); b.position.y = 0.2; g.add(b);
    for (const [x, y, z] of [[0, 0.38, 0], [0.17, 0.24, 0.06], [-0.12, 0.22, 0.13]]) { const sp = new THREE.Mesh(sphere(0.06, 6, 5), toon(D.ballPatch)); sp.position.set(x, y, z); g.add(sp); }
  }
  g.traverse(q => { if (q.isMesh) q.castShadow = true; });
  return g;
}
// SPEC-016: рекламные щиты вместо забора (у места с deco.boards — Поле) — одним InstancedMesh, цвет каждого щита по очереди из boards
export function adBoards(D) {
  const segs = [];
  for (let x = 0; x < COLS; x += 2) segs.push([x + 1, -0.15, false], [x + 1, ROWS + 0.15, false]);
  for (let z = 0; z < ROWS; z += 2) segs.push([-0.15, z + 1, true], [COLS + 0.15, z + 1, true]);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.92, 0.42, 0.12), toon("#ffffff"), segs.length);
  const mtx = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationY(Math.PI / 2), col = new THREE.Color();
  segs.forEach(([x, z, vert], i) => { mtx.makeTranslation(x, 0.21, z); if (vert) mtx.multiply(rot); inst.setMatrixAt(i, mtx); inst.setColorAt(i, col.set(D.boards[i % D.boards.length])); });
  inst.castShadow = true; mapGroup.add(inst);
}
// SPEC-016: меловая разметка футбольного поля поверх полос травы (центральный круг, штрафные и вратарские площади, угловые дуги)
export function paintPitch(th, under = null) {
  ctx.fillStyle = th.g2;
  for (let x = 0; x < COLS; x += 4) ctx.fillRect(x * CELL, 0, 2 * CELL, H);
  if (under) under();                                    // SPEC-021: штрихи фломастера — под меловой разметкой
  const m = CELL * 0.6;
  ctx.strokeStyle = th.deco.chalk; ctx.fillStyle = th.deco.chalk; ctx.lineWidth = 4;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.beginPath(); ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); ctx.stroke();
  circle(W / 2, H / 2, 3 * CELL); ctx.stroke(); circle(W / 2, H / 2, 6); ctx.fill();
  for (const sd of [-1, 1]) {
    const edge = sd < 0 ? m : W - m;
    ctx.strokeRect(sd < 0 ? edge : edge - 4.5 * CELL, H / 2 - 5.5 * CELL, 4.5 * CELL, 11 * CELL);
    ctx.strokeRect(sd < 0 ? edge : edge - 1.8 * CELL, H / 2 - 2.6 * CELL, 1.8 * CELL, 5.2 * CELL);
    circle(edge - sd * 3.2 * CELL, H / 2, 5); ctx.fill();
    ctx.beginPath(); ctx.arc(edge - sd * 3.2 * CELL, H / 2, 2.2 * CELL, sd < 0 ? -0.93 : Math.PI - 0.93, sd < 0 ? 0.93 : Math.PI + 0.93); ctx.stroke();
  }
  for (const [x, y, a] of [[m, m, 0], [W - m, m, Math.PI / 2], [W - m, H - m, Math.PI], [m, H - m, -Math.PI / 2]]) { ctx.beginPath(); ctx.arc(x, y, 0.6 * CELL, a, a + Math.PI / 2); ctx.stroke(); }
}
// SPEC-016: две улицы Города (поперёк и вдоль) с бордюром, пунктиром посередине и зебрами у перекрёстка — поверх тротуарной плитки
export function paintStreets(th) {
  const D = th.deco, sy = 9 * CELL, sx = 14 * CELL, sw = 2 * CELL;
  ctx.fillStyle = D.kerb; ctx.fillRect(0, sy - 4, W, sw + 8); ctx.fillRect(sx - 4, 0, sw + 8, H);
  ctx.fillStyle = D.asphalt; ctx.fillRect(0, sy, W, sw); ctx.fillRect(sx, 0, sw, H);
  ctx.strokeStyle = D.roadLine; ctx.lineWidth = 3; ctx.setLineDash([16, 14]);
  ctx.beginPath(); ctx.moveTo(0, sy + sw / 2); ctx.lineTo(sx - 2.6 * CELL, sy + sw / 2); ctx.moveTo(sx + sw + 2.6 * CELL, sy + sw / 2); ctx.lineTo(W, sy + sw / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx + sw / 2, 0); ctx.lineTo(sx + sw / 2, sy - 2.6 * CELL); ctx.moveTo(sx + sw / 2, sy + sw + 2.6 * CELL); ctx.lineTo(sx + sw / 2, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = D.zebra;
  for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) {
    ctx.fillRect(sd < 0 ? sx - 2.3 * CELL + k * 13 : sx + sw + 0.5 * CELL + k * 13, sy + 4, 7, sw - 8);   // через улицу поперёк
    ctx.fillRect(sx + 4, sd < 0 ? sy - 2.3 * CELL + k * 13 : sy + sw + 0.5 * CELL + k * 13, sw - 8, 7);   // через улицу вдоль
  }
  return [{ x: 0, y: sy, w: W, h: sw }, { x: sx, y: 0, w: sw, h: H }];   // SPEC-021: где асфальт (для крапинок)
}

// Деталь карты с меткой для тестов (__bb.mapPieces)
export const tag = (m, piece) => { m.userData.piece = piece; return m; };
export const HATCHED = new Set(["home", "bighome", "build", "arena", "maze", "hedge", "cottage", "roof", "houseRoof"]);   // SPEC-021: детали со штриховкой в тени
// Домик деревни: стены, двускатная крыша вдоль длинной стороны (зимой — снег на крыше), дверь и окошки
export function makeCottage(place, o) {
  const c = THEMES[place].cottage, w = P(o.w), d = P(o.h), cx = P(o.x) + w / 2, cz = P(o.y) + d / 2, wh = 0.75;
  const g = new THREE.Group();
  const body = tag(part(new THREE.BoxGeometry(w, wh, d), c.wall, 0.025, toonH(c.wall)), "cottage"); body.position.set(cx, wh / 2, cz); body.receiveShadow = true; g.add(body);
  const alongX = w >= d, span = (alongX ? d : w) + 0.24, len = (alongX ? w : d) + 0.2, rh = 0.55;
  const roofShape = new THREE.Shape(); roofShape.moveTo(-span / 2, 0); roofShape.lineTo(span / 2, 0); roofShape.lineTo(0, rh); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: len, bevelEnabled: false }); roofGeo.translate(0, 0, -len / 2);
  const roof = tag(part(roofGeo, c.roof, 0.025, toonH(c.roof)), "roof"); roof.position.set(cx, wh, cz); if (alongX) roof.rotation.y = Math.PI / 2; g.add(roof);
  if (c.snow) {
    const snowGeo = new THREE.ExtrudeGeometry(roofShape, { depth: len, bevelEnabled: false }); snowGeo.translate(0, 0, -len / 2);
    const sn = tag(new THREE.Mesh(snowGeo, toon(c.snow)), "snow"); sn.scale.set(0.9, 0.55, 1.02); sn.position.set(cx, wh + rh * 0.5, cz); if (alongX) sn.rotation.y = Math.PI / 2; g.add(sn);
  }
  // дверь и окошки на «южной» стороне (к камере)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.03), toon(c.door)); door.position.set(cx, 0.225, cz + d / 2 + 0.015); g.add(door);
  for (const k of [-1, 1]) if (w > 1.6) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.03), toon(c.window)); win.position.set(cx + k * w / 3.2, 0.48, cz + d / 2 + 0.015); g.add(win); }
  g.traverse(q => { if (q.isMesh) q.castShadow = true; });
  return g;
}
// Кусок реки: плоская вода без бортика — куски стыкуются в одну реку; берег рисуется потом по клеткам
export function makeWaterFor(place, o) {
  const t = THEMES[place].water, w = P(o.w), d = P(o.h), cx = P(o.x) + w / 2, cz = P(o.y) + d / 2;
  const m = tag(new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), toon(t.c)), "water"); m.position.set(cx, 0.015, cz); m.receiveShadow = true; mapGroup.add(m);
  if (!t.waves) return;                                  // зимой лёд — без волн
  for (let k = 0; k < Math.max(1, Math.round((w + d) / 3)); k++) {
    const wv = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 12, Math.PI * 0.8), toon(t.wave));
    wv.rotation.x = -Math.PI / 2; wv.position.set(cx + (w > d ? -w / 2 + (k + 0.5) * w / Math.round((w + d) / 3 || 1) : 0), 0.04, cz + (w > d ? 0 : -d / 2 + (k + 0.5) * d / Math.round((w + d) / 3 || 1)));
    mapGroup.add(wv); waves.push(wv);
  }
}
// Берег реки: полоска на каждой стороне клетки воды, где рядом не вода и не мостик (у края карты — нет)
export function riverBanks(place) {
  const t = THEMES[place].water, wet = new Uint8Array(COLS * ROWS), deck = new Uint8Array(COLS * ROWS);
  const mark = (g, r) => { for (let y = r.y / CELL; y < (r.y + r.h) / CELL; y++) for (let x = r.x / CELL; x < (r.x + r.w) / CELL; x++) g[y * COLS + x] = 1; };
  for (const o of obstacles) if (o.kind === "water") mark(wet, o);
  for (const f of floors) if (f.kind === "bridge") mark(deck, f);
  const strips = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!wet[y * COLS + x]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || wet[ny * COLS + nx] || deck[ny * COLS + nx]) continue;
      strips.push([x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5, dx !== 0]);
    }
  }
  if (!strips.length) return;
  const hgt = t.stone ? 0.14 : 0.035, th = t.stone ? 0.16 : 0.1;
  const inst = tag(new THREE.InstancedMesh(new THREE.BoxGeometry(1, hgt, th), toon(t.edge), strips.length), "bank");
  const mtx = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  strips.forEach(([x, z, vert], i) => { mtx.makeTranslation(x, hgt / 2, z); if (vert) mtx.multiply(rot); inst.setMatrixAt(i, mtx); });
  inst.receiveShadow = true; mapGroup.add(inst);
}
// Фонтан на площади деревни: каменная чаша, вода и столбик посередине
export function makeFountain(place, o) {
  const th = THEMES[place], w = P(o.w), d = P(o.h), cx = P(o.x) + w / 2, cz = P(o.y) + d / 2, r = Math.min(w, d) / 2;
  const bowl = tag(part(new THREE.CylinderGeometry(r, r * 1.04, 0.3, 24), th.fountain, 0.025), "fountain"); bowl.position.set(cx, 0.15, cz); mapGroup.add(bowl);
  const wat = tag(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.02, 24), toon(th.water.c)), "water"); wat.position.set(cx, 0.31, cz); mapGroup.add(wat);
  const col = part(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 12), th.fountain, 0.02); col.position.set(cx, 0.45, cz); mapGroup.add(col);
  const top = tag(new THREE.Mesh(sphere(0.14), toon(th.water.c)), "fountainDrop"); top.position.set(cx, 0.8, cz); top.userData.baseY = 0.8; mapGroup.add(top); waves.push(top);
}
// Украшения стен лабиринта по клеткам — одним InstancedMesh: кочки изгороди, столбики забора, снежки, дверцы шкафчиков
export function mazeDeco(place, walls) {
  const m = THEMES[place].maze, pts = [];
  for (const o of walls) {
    const n = Math.max(o.w, o.h) / CELL, alongX = o.w >= o.h;
    for (let k = 0; k <= n; k++) {
      if (m.deco === "seams" && (k === 0 || k === n)) continue;
      if ((m.deco === "bumps" || m.deco === "snow" || m.deco === "boards") && k === n) continue;
      const off = m.deco === "bumps" || m.deco === "snow" || m.deco === "boards" ? k + 0.5 : k;
      pts.push([P(o.x) + (alongX ? off : 0.5), P(o.y) + (alongX ? 0.5 : off), alongX]);
    }
  }
  if (!pts.length) return;
  const geo = m.deco === "bumps" ? sphere(0.36, 10, 8) : m.deco === "snow" ? sphere(0.3, 10, 8)
    : m.deco === "posts" ? new THREE.BoxGeometry(0.16, WALL_H + 0.14, 1.08)
    : m.deco === "boards" ? new THREE.BoxGeometry(0.86, WALL_H * 0.5, 1.06) : new THREE.BoxGeometry(0.035, WALL_H * 0.8, 1.04);
  const inst = tag(new THREE.InstancedMesh(geo, toon(m.decoC), pts.length), "mazeDeco");
  const mtx = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationY(Math.PI / 2), col = new THREE.Color();
  const y = m.deco === "bumps" ? WALL_H + 0.02 : m.deco === "snow" ? WALL_H + 0.04 : m.deco === "posts" ? (WALL_H + 0.14) / 2 : m.deco === "boards" ? WALL_H * 0.42 : WALL_H * 0.45;
  // SPEC-016: рекламные щиты на изгороди — цвет щита по очереди из deco.boards (умножается на decoC = белый)
  const boards = m.deco === "boards" ? THEMES[place].deco.boards : null;
  pts.forEach(([x, z, alongX], i) => {
    mtx.makeTranslation(x, y, z); if ((m.deco === "seams" || m.deco === "posts" || boards) && !alongX) mtx.multiply(rot);
    inst.setMatrixAt(i, mtx); if (boards) inst.setColorAt(i, col.set(boards[i % boards.length]));
  });
  inst.castShadow = true; mapGroup.add(inst);
}
