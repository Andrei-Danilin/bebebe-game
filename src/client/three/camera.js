// SPEC-011: fitting the camera to the map, the phone camera that follows the hero (camSnap, updateCamera), the moving shadow
// box, toScreen. Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { CELL, COLS, H, ROWS, W } from "../../core/config.js";
import { littles, mode } from "../../core/game.js";
import { clamp } from "../../core/util.js";
import { LOOK } from "../look.js";
import { CSS_H, CSS_W, onFit, PHONE, setOnFit, UH, UW } from "../screen.js";
import { camBase, camera, camTarget, P, sun, U, WALL_H } from "./setup.js";
import { minimapRect, showMinimap } from "../ui/minimap.js";
import { phoneTopBar, teamRect } from "../ui/phone.js";
import { cpx } from "../ui/text.js";

// Камера: наклон сверху, вся карта помещается в кадр
const CAM_EL = 63 * Math.PI / 180, camDir = new THREE.Vector3(0, Math.sin(CAM_EL), Math.cos(CAM_EL));   // камера всегда смотрит под этим углом
function fitCamera() {
  const dir = camDir;
  const corners = [[0, 0, 0], [COLS, 0, 0], [0, 0, ROWS], [COLS, 0, ROWS], [0, WALL_H, 0], [COLS, WALL_H, 0]].map(c => new THREE.Vector3(...c));
  const v = new THREE.Vector3();
  for (let d = 12; d < 90; d += 0.2) {
    camera.position.copy(camTarget).addScaledVector(dir, d);
    camera.lookAt(camTarget); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    if (corners.every(c => { v.copy(c).project(camera); return Math.abs(v.x) <= 0.985 && v.y <= 0.9 && v.y >= -0.985; })) break;
  }
  camBase.copy(camera.position);
}

// Видимая земля: углы кадра — лучи до земли (y = 0); из-за наклона это трапеция (дальний край шире).
// Направление камеры не меняется, поэтому углы = точка взгляда + расстояние × смещения (считаем их при расстоянии 1).
function groundCorners() {
  const D = 10, probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 500);
  probe.position.copy(camDir).multiplyScalar(D); probe.lookAt(0, 0, 0); probe.updateMatrixWorld(); probe.updateProjectionMatrix();
  const p = new THREE.Vector3(), r = new THREE.Vector3();
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([nx, ny]) => {
    p.set(nx, ny, 0.5).unproject(probe); r.copy(p).sub(probe.position);
    const t = -probe.position.y / r.y;
    return { x: (probe.position.x + r.x * t) / D, z: (probe.position.z + r.z * t) / D };
  });
}
// габарит трапеции (в клетках от точки взгляда при расстоянии 1)
const cornersBox = cs => ({ x0: Math.min(...cs.map(c => c.x)), x1: Math.max(...cs.map(c => c.x)), z0: Math.min(...cs.map(c => c.z)), z1: Math.max(...cs.map(c => c.z)) });
export const camLook = camTarget.clone();            // куда камера смотрит сейчас (на компьютере всегда центр карты)
export let camDist;   // set by initCamera()
let camCorners, camOff;   // set by initCamera()
// видимая земля сейчас, в px мира: { x, y, w, h } — габарит трапеции
export function camRect() {
  return { x: (camLook.x + camDist * camOff.x0) * CELL, y: (camLook.z + camDist * camOff.z0) * CELL,
    w: camDist * (camOff.x1 - camOff.x0) * CELL, h: camDist * (camOff.z1 - camOff.z0) * CELL };
}
// ---------- Камера телефона (SPEC-005): ближе, едет за героем, у краёв карты останавливается ----------
// cam.x/y — точка взгляда в режиме «за героем» (px мира), lax/lay — забегание вперёд (px),
// zoom: 0 — за героем, 1 — вся карта (меню, победа); dFollow/dFull — расстояния для этих двух видов.
export let cam;   // set by initCamera()

export const camHero = () => littles.find(l => l.kind === "player") || null;
// оси камеры тени (как в three.js: смотрит от солнца на цель, «верх» — +y); смещение солнца от цели постоянно
let sunOff;   // set by initCamera()
let LZ, LX, LY;   // set by initCamera()
let SHADOW_FULL;   // set by initCamera()
let shadowBox;   // set by initCamera()
// где на экране окажется точка мира (dx, dz px от точки взгляда, высота h px) в виде «за героем»
const camProbe = new THREE.PerspectiveCamera(camera.fov, W / H, camera.near, camera.far), _pv = new THREE.Vector3();
function uiOf(dx, dz, h = 0) {
  _pv.set(P(dx), h * U, P(dz)).project(camProbe);
  return { x: (_pv.x + 1) / 2 * UW, y: (1 - _pv.y) / 2 * UH };
}
// точку взгляда двигаем так, чтобы видимая земля выходила за край карты не больше CAM_EDGE (+ extra) клеток
function clampLook(x, y, extra = 0) {
  const m = (LOOK.CAM_EDGE + extra) * CELL, d = cam.dFollow * CELL;
  const axis = (v, o0, o1, size) => {
    const lo = -m - o0 * d, hi = size + m - o1 * d;
    return lo > hi ? size / 2 - (o0 + o1) * d / 2 : clamp(v, lo, hi);
  };
  return { x: axis(x, camOff.x0, camOff.x1, W), y: axis(y, camOff.z0, camOff.z1, H) };
}
// цель камеры для героя в (x, y): с краю карты — упор; если ноги или имя героя попали под верхнюю полосу,
// под мини-карту с кружками команды или к самому краю экрана (дальний край видимой земли шире ближнего),
// камера заходит за край карты дальше — всего не больше CAM_EDGE_MAX клеток. Всё плавно, без скачков цели:
// под мини-карту — сначала вниз, и уже на подходе слева (полоса CAM_HERO_RAMP) понемногу; если вниз упёрлось —
// понемногу вбок (на той же полосе остатка), поэтому на переходе имя может ненадолго задеть угол кружков.
function followGoal(l, x, y) {
  const g = clampLook(x, y);
  if (!showMinimap()) return g;
  const pad = cpx(LOOK.CAM_HERO_PAD), side = cpx(LOOK.CAM_HERO_SIDE), ramp = cpx(LOOK.CAM_HERO_RAMP), extra = LOOK.CAM_EDGE_MAX - LOOK.CAM_EDGE;
  const mm = minimapRect(), tr = teamRect(), topY = phoneTopBar() + pad, mmX = Math.min(mm.x, tr.x) - pad, mmY = tr.y + tr.h + pad;   // левый край угла — мини-карта или кружки, что левее
  const move = (dx, dy) => { const c = clampLook(g.x + dx, g.y + dy, extra), d = Math.hypot(c.x - g.x, c.y - g.y); g.x = c.x; g.y = c.y; return d; };
  for (let pass = 0; pass < 3; pass++) {
    for (const h of [0, LOOK.CAM_HERO_H]) {
      let p = uiOf(l.x - g.x, l.y - g.y, h);
      const kx = (uiOf(l.x - g.x + CELL, l.y - g.y, h).x - p.x) / CELL, ky = (uiOf(l.x - g.x, l.y - g.y + CELL, h).y - p.y) / CELL;   // UI px на px мира
      if (p.x < side) move(-(side - p.x) / kx, 0);                       // у левого края экрана — камера левее
      else if (p.x > UW - side) move((p.x - UW + side) / kx, 0);         // у правого — правее
      p = uiOf(l.x - g.x, l.y - g.y, h);
      if (p.y < topY) move(0, -(topY - p.y) / ky);                       // под верхней полосой — камера выше (герой ниже)
      p = uiOf(l.x - g.x, l.y - g.y, h);
      if (p.y < mmY && p.x > mmX - ramp) {                               // мини-карта с кружками и полоса подхода слева
        const t = clamp((p.x - mmX + ramp) / ramp, 0, 1), want = (mmY - p.y) / ky * t;
        const got = move(0, -want), rest = (want - got) * ky;            // сколько (UI px) не хватило, если упёрлись в край
        if (t >= 1 && rest > 0.5) move(((p.x - mmX) / kx) * clamp(rest / ramp, 0, 1), 0);
      }
    }
  }
  return g;
}
// поставить камеру по состоянию cam (сразу, чтобы toScreen был верным и без кадра)
function applyCamera() {
  const z = cam.zoom, e = z * z * (3 - 2 * z);   // плавное начало и конец
  camDist = cam.dFollow + (cam.dFull - cam.dFollow) * e;
  camLook.set(P(cam.x) + (cam.full.x - P(cam.x)) * e, 0, P(cam.y) + (cam.full.z - P(cam.y)) * e);
  camBase.copy(camLook).addScaledVector(camDir, camDist);
  camera.position.copy(camBase); camera.updateMatrixWorld();
  // тень едет с камерой: рамка по видимой земле в осях света, центр — на сетке текселей тени (без мерцания при движении)
  const tu = (shadowBox.r - shadowBox.l) / sun.shadow.mapSize.x, tv = (shadowBox.t - shadowBox.b) / sun.shadow.mapSize.y;
  const u = camLook.dot(LX), v = camLook.dot(LY), du = Math.round(u / tu) * tu - u, dv = Math.round(v / tv) * tv - v, k = 1 - e;
  sun.target.position.copy(camLook).addScaledVector(LX, du * k).addScaledVector(LY, dv * k);
  sun.position.copy(sun.target.position).add(sunOff);
  const mix = key => shadowBox[key] + (SHADOW_FULL[key] - shadowBox[key]) * e;
  Object.assign(sun.shadow.camera, { left: mix("l"), right: mix("r"), bottom: mix("b"), top: mix("t") });
  sun.shadow.camera.updateProjectionMatrix();
}
// новый уровень: камера сразу у героя, без долгого полёта от центра карты
export function camSnap() {
  if (!PHONE) return;
  const l = camHero();
  const g = l ? followGoal(l, l.x, l.y) : { x: W / 2, y: H / 2 };
  Object.assign(cam, { x: g.x, y: g.y, lax: 0, lay: 0, zoom: 0 });
  applyCamera();
}
// каждый кадр из главного цикла: плавно за героем, вперёд по ходу; не в игре (меню, победа) — вся карта
export function updateCamera(dt) {
  if (!PHONE) return;
  const l = camHero();
  const k = 1 - Math.exp(-LOOK.CAM_FOLLOW * dt), kl = 1 - Math.exp(-LOOK.CAM_LOOKAHEAD_RATE * dt);
  // вперёд смотрим, только пока герой идёт сам (упал, отдыхает, обнимает — камера на нём)
  const ahead = !!l && l.moving && l.state === "ok" && !(l.hugAnim > 0), la = LOOK.CAM_LOOKAHEAD * CELL;
  cam.lax += ((ahead ? Math.cos(l.dir) * la : 0) - cam.lax) * kl;
  cam.lay += ((ahead ? Math.sin(l.dir) * la : 0) - cam.lay) * kl;
  if (l) { const g = followGoal(l, l.x + cam.lax, l.y + cam.lay); cam.x += (g.x - cam.x) * k; cam.y += (g.y - cam.y) * k; }
  const out = mode !== "play" && mode !== "pause";
  cam.zoom = clamp(cam.zoom + (out ? dt : -dt) / LOOK.CAM_ZOOM_TIME, 0, 1);
  applyCamera();
}

const _v = new THREE.Vector3();
export function toScreen(x, y, h = 0) {
  _v.set(P(x), h * U, P(y)).project(camera);
  return { x: (_v.x + 1) / 2 * UW, y: (1 - _v.y) / 2 * UH };
}
// то же в готовый объект o (без нового объекта каждый кадр)
export function toScreenTo(o, x, y, h = 0) {
  _v.set(P(x), h * U, P(y)).project(camera);
  o.x = (_v.x + 1) / 2 * UW; o.y = (1 - _v.y) / 2 * UH;
  return o;
}

// called once by main.js, in the start order of the one-file game
export function initCamera() {
  fitCamera();
  camDist = camBase.distanceTo(camTarget); // расстояние от камеры до точки взгляда
  camCorners = groundCorners();
  camOff = cornersBox(camCorners);
  cam = { x: W / 2, y: H / 2, lax: 0, lay: 0, zoom: 1, dFollow: camDist, dFull: camDist, full: camTarget.clone() };
  sunOff = sun.position.clone().sub(camTarget);
  LZ = sunOff.clone().normalize();
  LX = new THREE.Vector3(0, 1, 0).cross(LZ).normalize();
  LY = LZ.clone().cross(LX);
  SHADOW_FULL = { l: sun.shadow.camera.left, r: sun.shadow.camera.right, b: sun.shadow.camera.bottom, t: sun.shadow.camera.top }; // на всю карту, как на компьютере
  shadowBox = SHADOW_FULL; // рамка тени вида «за героем» (оси света, от точки взгляда)
  // телефон: холст любой формы — камера берёт его соотношение сторон (без растяжения)
  if (PHONE) {
    setOnFit(() => {
      camera.aspect = CSS_W / CSS_H; fitCamera();
      cam.full.copy(camTarget); cam.dFull = camBase.distanceTo(camTarget);
      camCorners = groundCorners(); camOff = cornersBox(camCorners); cam.dFollow = LOOK.PHONE_VIEW_ROWS / (camOff.z1 - camOff.z0);
      camProbe.aspect = camera.aspect; camProbe.position.copy(camDir).multiplyScalar(cam.dFollow); camProbe.lookAt(0, 0, 0);
      camProbe.updateMatrixWorld(); camProbe.updateProjectionMatrix();
      // рамка тени вида «за героем»: углы видимой земли на земле и на высоте стен/героев, в осях света, + запас
      const pts = camCorners.flatMap(c => [0, LOOK.CAM_SHADOW_H].map(h => new THREE.Vector3(c.x * cam.dFollow, h, c.z * cam.dFollow)));
      const us = pts.map(q => q.dot(LX)), vs = pts.map(q => q.dot(LY)), pad = LOOK.CAM_SHADOW_PAD;
      shadowBox = { l: Math.min(...us) - pad, r: Math.max(...us) + pad, b: Math.min(...vs) - pad, t: Math.max(...vs) + pad };
      applyCamera();
    });
    onFit();
  }
}
