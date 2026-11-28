// SPEC-011: the houses (SPEC-021): dressHouses and today's (classic) builders; one pair per world: houses-worlds.js. Client module.

import * as THREE from "three";
import { mulberry32 } from "../../core/util.js";
import { LOOK } from "../look.js";
import { mapGroup } from "./mapstate.js";
import { ownMat, part } from "./materials.js";
import { THEMES } from "./themes.js";
import { G } from "../../core/active.js";
import { addRoofFade, dadMess, roofChimney, roofPatches, houseDoors, houseRect, houseRoof, kidsDoors, kidsFlowers, slopeAt } from "./housekit.js";

import { DAD_WORLD, KIDS_WORLD } from "./houses-worlds.js";

export { fadeRoofs, houseRoofs, houseWallColors } from "./housekit.js";   // SPEC-044: the roofs and their fade live in housekit.js

export let houseInfo = null;           // что построено (тест look3D)
const doorInfo = d => ({ x: d.x, z: d.z, nx: d.nx, nz: d.nz, len: d.len });
// builder «classic»: домик маленьких как в art/15_houses (голубой, синяя крыша с трубой)
// c = { place, build (имя строителя, который работает), look (K: kids / B: dad — HOUSE_LOOK[place] поверх HOUSE_LOOK.kid / .big), rnd, info }
function classicKids(c) {
  const { place, rnd, info, look: K } = c;
  // домик маленьких: голубой, синяя крыша с трубой, створки дверей с сердечком, цветы у стены
  const KR = houseRect("home");
  if (KR) {
    const { doors } = houseDoors("home", KR), roof = houseRoof(KR, K.roof, place, 0);
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
    const heartPts = kidsDoors(doors, K), hearts = heartPts.length, flowers = kidsFlowers(KR, doors, K, rnd);
    info.kid = { build: c.build, roof: true, hearts, heartPts, doors: doors.map(doorInfo), frame: KR, flowers, fade };
    if (THEMES[place].snow) info.snow++;
  }
}
// builder «classic»: грязный дом папы как в art/15_houses (кривая коричневая крыша, пятна, бельё, бак, пицца)
function classicDad(c) {
  const { place, rnd, info, look: B } = c;
  // дом папы: кривая коричневая крыша с заплатками и трубой, грязь на стенах, бельё, бак, пицца, игрушки
  const BR = houseRect("bighome");
  if (BR) {
    const { doors, wallAt } = houseDoors("bighome", BR), roof = houseRoof(BR, B.roof, place, B.crook);
    const patches = roofPatches(roof, B, rnd, 3);
    roofChimney(roof, B);
    mapGroup.add(roof.g);
    const fade = addRoofFade(BR, roof);
    const mess = dadMess(BR, doors, wallAt, B, rnd), { stains } = mess, items = mess.done();
    info.big = { build: c.build, roof: true, crooked: Math.abs(roof.g.rotation.z) > 0.01, patches, stains, ...items, fade };
    if (THEMES[place].snow) info.snow++;
  }
}
// SPEC-044: у каждого мира свои дома — HOUSE_LOOK[мир].kids / .dad = { build: имя строителя, …числа поверх HOUSE_LOOK.kid / .big };
// строитель без имени в таблице (или без таблицы мира) — classic, дом как до SPEC-044
const KIDS_BUILDERS = { classic: classicKids, ...KIDS_WORLD }, DAD_BUILDERS = { classic: classicDad, ...DAD_WORLD };
export const HOUSE_BUILDS = { kids: Object.keys(KIDS_BUILDERS), dad: Object.keys(DAD_BUILDERS) };   // the names a HOUSE_LOOK[world] may use (look3D, for the tests)
export function dressHouses(place) {
  const H = LOOK.HOUSE_LOOK, S = LOOK.HOUSE_STYLE, W = H[place] || {}, rnd = mulberry32(LOOK.GROUND_LOOK.seed + 77 + G.level), info = { kid: null, big: null, snow: 0 };
  // LOOK.HOUSE_STYLE (tests): per house "world" (the table of the world), "classic" (today's pair) or "none"; the builder that runs is the one the name says,
  // classic when the name is not in the table — and info says which one ran
  const make = (who, base, builders) => {
    if (S[who] === "none") return;
    const look = { ...base, ...(S[who] === "world" && W[who]) }, build = builders[look.build] ? look.build : "classic";
    builders[build]({ place, build, rnd, info, look });
  };
  make("kids", H.kid, KIDS_BUILDERS);
  make("dad", H.big, DAD_BUILDERS);
  houseInfo = info;
}
// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setHouseInfo(v) { houseInfo = v; }
