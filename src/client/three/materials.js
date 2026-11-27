// SPEC-011: toon materials, outlines, hatching, wobble, part(), the ground texture, the paper grain (syncPaper). Client
// module (moved out of index.html in Phase C).

import * as THREE from "three";
import { H, W } from "../../core/config.js";
import { mulberry32 } from "../../core/util.js";
import { LOOK } from "../look.js";
import { PHONE } from "../screen.js";
import { renderer, scene, sun } from "./setup.js";

// ---------- Материалы ----------
// SPEC-021: два тона, как фломастер — свет и тень (TOON_LOOK.tones), без бликов (MeshToonMaterial)
// SPEC-025 AC 15: marks a texture the whole game shares (the toon gradient, the ground canvas, the paper grain) — disposeTree
// never frees it. A module that makes a texture for the whole game passes it through here.
export function sharedTex(t) { t.userData.shared = true; return t; }
export const gradTex = sharedTex(new THREE.DataTexture(new Uint8Array(LOOK.TOON_LOOK.tones), LOOK.TOON_LOOK.tones.length, 1, THREE.RedFormat));

const matCache = new Map();
export function toon(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: gradTex }); matCache.set(color, m); }
  return m;
}
export const INK3 = LOOK.OUTLINE_LOOK.color;      // SPEC-021: чёрный фломастер 3D (контуры, брови, рты); 2D-слой рисует своим OUT
export const OUTLINE = new THREE.MeshBasicMaterial({ color: INK3, side: THREE.BackSide });
export function ownMat(color, transparent = false, hatch = false) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradTex, transparent });
  m.userData.own = true;
  m.userData.outline = transparent ? Object.assign(new THREE.MeshBasicMaterial({ color: INK3, side: THREE.BackSide, transparent: true }), { userData: { own: true } }) : OUTLINE;
  return hatch ? addHatch(m) : m;
}
// SPEC-021: штриховка фломастером на теневой стороне стен и крыш. Тот же toon-материал; шейдер темнит диагональные полосы
// (в координатах мира — не плывут за камерой) на гранях, мало повёрнутых к солнцу: бока стен (сверху солнце, крыша и верх — без
// штрихов); отвёрнутые от солнца — сильнее (солнце смещено от точки взгляда всегда одинаково).
// Одна программа на все такие материалы (customProgramCacheKey), без новых объектов в кадре.
let hatchSun;   // set by initMaterials()

const hatchU = new THREE.Vector3(LOOK.HATCH_LOOK.freq, LOOK.HATCH_LOOK.width, LOOK.HATCH_LOOK.dark), hatchV = new THREE.Vector2(LOOK.HATCH_LOOK.side, LOOK.HATCH_LOOK.lit);
const HATCH_VS = "vHatchP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvHatchN = normalize(mat3(modelMatrix) * objectNormal);";
const HATCH_FS = "{ float hn = dot(normalize(vHatchN), uHatchSun), hs = (1.0 - step(uHatchV.x, hn)) * mix(uHatchV.y, 1.0, step(hn, 0.0));\n" +
  "  float hd = (vHatchP.x + vHatchP.y + vHatchP.z) * uHatch.x, hf = abs(fract(hd) - 0.5), ha = fwidth(hd);\n" +
  "  float hl = 1.0 - smoothstep(uHatch.y * 0.5 - ha, uHatch.y * 0.5 + ha, hf);\n" +
  "  outgoingLight *= 1.0 - hs * hl * uHatch.z; }\n";
const HATCH_DECL = "\nvarying vec3 vHatchP;\nvarying vec3 vHatchN;";
function addHatch(m) {
  m.userData.hatch = true;
  m.customProgramCacheKey = () => "hatch";
  m.onBeforeCompile = sh => {
    sh.uniforms.uHatchSun = { value: hatchSun }; sh.uniforms.uHatch = { value: hatchU }; sh.uniforms.uHatchV = { value: hatchV };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>" + HATCH_DECL)
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + HATCH_VS);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>" + HATCH_DECL + "\nuniform vec3 uHatchSun;\nuniform vec3 uHatch;\nuniform vec2 uHatchV;")
      .replace("#include <opaque_fragment>", HATCH_FS + "#include <opaque_fragment>");
    // three.js поменял куски шейдера — штриховки не будет: громко, чтобы тесты (страница без ошибок) это заметили
    if (!sh.vertexShader.includes("vHatchN = ") || !sh.fragmentShader.includes("uHatchV.x")) console.error("SPEC-021 hatch: shader chunks not found (three.js changed?)");
  };
  return m;
}
const hatchCache = new Map();
export function toonH(color) {                    // как toon(color), но со штриховкой; общий на цвет (не own — живёт всю игру)
  let m = hatchCache.get(color);
  if (!m) { m = addHatch(new THREE.MeshToonMaterial({ color, gradientMap: gradTex })); m.userData.outline = OUTLINE; hatchCache.set(color, m); }
  return m;
}
// SPEC-021: дрожание контура — своя случайность с зерна (не игровая rng(), не Math.random): одна и та же карта рисуется одинаково.
// wobbleSeed(n) — с начала (buildMap3D — n = 0, персонажи — 1)
let wobRng = mulberry32(LOOK.OUTLINE_LOOK.seed);
export const wobbleSeed = n => { wobRng = mulberry32(LOOK.OUTLINE_LOOK.seed + n); };
const wob = a => (wobRng() * 2 - 1) * a;
// Деталь с контуром (контур — та же форма чуть больше, изнанкой наружу). SPEC-021: толщина × OUTLINE_LOOK.k, чуть неровная:
// по каждой оси своя толщина (± wobble) и оболочка чуть сдвинута (± shift толщины) — одна сторона линии толще другой
// SPEC-040 AC 2: shared geometries. While a map is being built (beginGeoScope … endGeoScope, called by buildMap3D) a standard geometry
// (BoxGeometry, CylinderGeometry, … with plain-number parameters) that has been made before is not made again: part() and the batching
// pass take the first one of the same type and parameters; the duplicate is dropped (it was never uploaded). A geometry that was
// moved after its construction (translate) or has no plain parameters (shapes, custom buffers) is never merged with another.
let geoScope = null;
const plain = p => !!p && Object.values(p).every(v => v === undefined || v === null || typeof v !== "object");
export const geoKey = g => (plain(g.parameters) ? g.type + JSON.stringify(g.parameters) : null);
export const beginGeoScope = () => { geoScope = new Map(); };
export const endGeoScope = () => { geoScope = null; };
export function sharedGeo(g) {
  if (!geoScope) return g;
  const k = geoKey(g);
  if (k === null) return g;
  const first = geoScope.get(k);
  if (!first) { geoScope.set(k, g); return g; }
  if (first !== g) g.dispose();
  return first;
}
// SPEC-040 AC 2: a hull never casts a shadow (the part's own shadow is the same shape; the hull doubled the shadow pass). The many
// "castShadow = true" over a whole model (traverse) must not switch it on again, so this mesh ignores the write.
class HullMesh extends THREE.Mesh {
  /** @param {any} geo @param {any} mat */
  constructor(geo, mat) { super(geo, mat); }
  get castShadow() { return false; }
  set castShadow(v) { /* never */ }
}
export function part(geo, color, outline = 0.03, mat = null) {
  geo = sharedGeo(geo);
  const m = new THREE.Mesh(geo, mat || toon(color));
  m.castShadow = true;
  if (outline > 0) {
    const L = LOOK.OUTLINE_LOOK, on = LOOK.OUTLINE_WOBBLE, t = outline * L.k;
    geo.computeBoundingBox();
    const sz = new THREE.Vector3(); geo.boundingBox.getSize(sz);
    const o = new HullMesh(geo, mat ? mat.userData.outline : OUTLINE);
    const tx = t * (1 + (on ? wob(L.wobble) : 0)), ty = t * (1 + (on ? wob(L.wobble) : 0)), tz = t * (1 + (on ? wob(L.wobble) : 0));
    o.scale.set(1 + 2 * tx / Math.max(sz.x, 0.02), 1 + 2 * ty / Math.max(sz.y, 0.02), 1 + 2 * tz / Math.max(sz.z, 0.02));
    if (on) o.position.set(wob(L.shift) * tx, wob(L.shift) * ty, wob(L.shift) * tz);
    o.userData.hull = outline;                                   // толщина, которую просила деталь (тест look3D)
    m.add(o);
  }
  return m;
}
// SPEC-025 AC 15: ownership. A tree's geometries are its own; an own material (userData.own: ownMat and the like) belongs to the
// tree that uses it, and so do its textures — unless marked by sharedTex() (the whole game's: gradient, ground canvas, paper
// grain). Shared materials (toon(), OUTLINE) and shared textures are never freed here. TEX_SLOTS: the texture slots looked at.
const TEX_SLOTS = ["map", "alphaMap", "aoMap", "bumpMap", "emissiveMap", "gradientMap", "lightMap", "normalMap", "displacementMap", "specularMap"];
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();                  // буфер матриц InstancedMesh
    if (o.material && o.material.userData && o.material.userData.own) {
      for (const k of TEX_SLOTS) { const t = o.material[k]; if (t && t.isTexture && !t.userData.shared) t.dispose(); }
      o.material.dispose();
    }
  });
}
export const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
export const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 12);
// ---------- Текстура земли (трава, полы, кровати) ----------
export let groundCanvas;   // set by initMaterials()
export let groundTex;   // set by initMaterials()

// SPEC-021: бумажное зерно поверх 3D — картинка делается один раз (canvas, своя случайность с зерна), LOOK.PAPER_GRAIN включает.
// Рисуется последним в той же 3D-сцене: прямоугольник на весь экран, умножение цвета (MultiplyBlending) — под 2D-интерфейсом.
// (Слой CSS mix-blend-mode: multiply поверх WebGL стоил на телефоне ~+20 % времени кадра — смешивание в композиторе.)
export let paperMade = 0, paperOn = false;
export const paperU = { uTex: { value: null }, uTile: { value: LOOK.PAPER_GRAIN_LOOK.size }, uAlpha: { value: LOOK.PAPER_GRAIN_LOOK.alpha } };
export const paperMat = new THREE.ShaderMaterial({ uniforms: paperU, transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.MultiplyBlending, premultipliedAlpha: true,
  vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D uTex; uniform float uTile; uniform float uAlpha; void main() { vec3 g = texture2D(uTex, gl_FragCoord.xy / uTile).rgb; gl_FragColor = vec4(mix(vec3(1.0), g, uAlpha), 1.0); }" });
export const paperMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), paperMat);

function makePaperGrain() {
  const G = LOOK.PAPER_GRAIN_LOOK, S = G.size, rnd = mulberry32(G.seed), cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d"), img = g.createImageData(S, S), d = img.data, [l0, l1, l2] = G.light, [d0, d1, d2] = G.dark;
  for (let i = 0; i < S * S; i++) {                  // зерно: почти везде светлое, изредка тёмные крупинки
    const n = rnd() ** 3, k = i * 4;
    d[k] = l0 + (d0 - l0) * n; d[k + 1] = l1 + (d1 - l1) * n; d[k + 2] = l2 + (d2 - l2) * n; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const dark = `rgb(${G.dark.join(",")})`;
  g.globalAlpha = 0.18; g.fillStyle = dark;
  for (let i = 0; i < G.blots; i++) { g.beginPath(); g.arc(rnd() * S, rnd() * S, G.blotR * (0.4 + rnd()), 0, Math.PI * 2); g.globalAlpha = 0.05 + rnd() * 0.1; g.fill(); }
  g.strokeStyle = dark; g.lineWidth = 1; g.lineCap = "round";
  for (let i = 0; i < G.fibers; i++) {               // волокна бумаги
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, len = G.fiberLen * (0.4 + rnd());
    g.globalAlpha = 0.2 + rnd() * 0.3; g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len / 2 + (rnd() - 0.5) * 4, y + Math.sin(a) * len / 2 + (rnd() - 0.5) * 4, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  const tex = sharedTex(new THREE.CanvasTexture(cv)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  paperU.uTex.value = tex;
  paperMade++;
}
let paperPR = 0;
export function syncPaper() {                                // каждый кадр: только сравнения, без новых объектов
  const want = !!LOOK.PAPER_GRAIN && (!PHONE || !!LOOK.PAPER_GRAIN_PHONE), pr = renderer.getPixelRatio();
  if (pr !== paperPR) { paperPR = pr; paperU.uTile.value = LOOK.PAPER_GRAIN_LOOK.size * pr; }   // плитка в px экрана
  if (want === paperOn) return;
  if (want && !paperMade) makePaperGrain();
  paperMesh.visible = want;
  paperOn = want;
}

// called once by main.js, in the start order of the one-file game
export function initMaterials() {
  gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
  gradTex.needsUpdate = true;
  hatchSun = sun.position.clone().sub(sun.target.position).normalize();
  groundCanvas = document.createElement("canvas");
  groundCanvas.width = W * 2;
  groundCanvas.height = H * 2;
  groundTex = sharedTex(new THREE.CanvasTexture(groundCanvas));   // SPEC-025 AC 15: repainted per level, never freed
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  paperMesh.frustumCulled = false;
  paperMesh.renderOrder = 1e6;
  paperMesh.visible = false;
  scene.add(paperMesh);
}
