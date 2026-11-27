// SPEC-011: the 3D map: mapKey, buildMap3D, the painted ground (paintGround, marker strokes, doodles), fading trees and
// bushes. Client module (moved out of index.html in Phase C).

import * as THREE from "three";
import { CELL, COLS, H, ROWS, TAU, W, WORLD_SEED } from "../../core/config.js";
import { mulberry32, vrand } from "../../core/util.js";
import { LOOK } from "../look.js";
import { dressHouses, houseRoofs, setHouseInfo } from "./houses.js";
import { mapGroup, setMapGroup, waves } from "./mapstate.js";
import { batchMap } from "./batch.js";
import { beginGeoScope, disposeTree, endGeoScope, gradTex, groundCanvas, groundTex, ownMat, part, toon, toonH, wobbleSeed } from "./materials.js";
import { keepDecor, tierNumbers } from "../quality.js";
import { camera, P, renderer, scene, WALL_H } from "./setup.js";
import { adBoards, HEDGE_COLORS, makeBushFor, makeCottage, makeFountain, makePondFor, makeRockFor, makeStreetThing, makeTreeFor, makeWaterFor, mazeDeco, paintPitch, paintStreets, riverBanks, tag, THEMES } from "./themes.js";
import { circleOn, fillStrokeOn, rrOn } from "../ui/canvas.js";
import { G } from "../../core/active.js";

export let builtKey = "";
export const forgetMap = () => { builtKey = ""; };   // SPEC-040: the next rebuild builds the map whatever its key
export const mapKey = () => { const li = G.levelInfo || {}; return [li.world, li.lv, li.type === "tutorial" ? "tutorial" : "", li.attempt, li.fallback].join(":"); };   // какой уровень построен в 3D (SPEC-029: карта тренировок — свой ключ)
export const fadeTrees = [], fadeBushes = [];
export let safeGlow = null, snow = null;
export const bigHomeMats = [];   // материалы стен дома Большого — мигают красным при обратном отсчёте

// SPEC-021: штрихи фломастера по земле — диагональные, своя случайность с зерна уровня (не игровая rng()). Штрихи собраны в
// несколько путей (цвет × прозрачность): несколько stroke() на всю землю, а не тысячи. rect — где рисовать (по умолчанию вся земля)
function markerStrokes(ctx, rnd, colors, rect = null) {
  const GL = LOOK.GROUND_LOOK, a = GL.angle * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a), nx = -dy, ny = dx;
  const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0, x1 = rect ? rect.x + rect.w : W, y1 = rect ? rect.y + rect.h : H;
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]], ns = corners.map(([x, y]) => x * nx + y * ny), ts = corners.map(([x, y]) => x * dx + y * dy);
  const n0 = Math.min(...ns), n1 = Math.max(...ns), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const paths = colors.map(() => GL.alpha.map(() => new Path2D()));
  for (let n = n0; n < n1; n += GL.gap * (0.8 + rnd() * 0.4)) {
    for (let t = t0 + rnd() * GL.len[1]; t < t1;) {
      const len = GL.len[0] + rnd() * (GL.len[1] - GL.len[0]), ci = Math.floor(rnd() * colors.length), ai = Math.floor(rnd() * GL.alpha.length);
      const p = paths[ci][ai], wob = (rnd() - 0.5) * GL.wobble;
      p.moveTo(n * nx + t * dx, n * ny + t * dy);
      p.quadraticCurveTo(n * nx + (t + len / 2) * dx + wob * nx, n * ny + (t + len / 2) * dy + wob * ny, n * nx + (t + len) * dx, n * ny + (t + len) * dy);
      t += len + GL.skip[0] + rnd() * (GL.skip[1] - GL.skip[0]);
    }
  }
  ctx.save();
  if (rect) { ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip(); }
  ctx.lineCap = "round"; ctx.lineWidth = GL.width;
  colors.forEach((c, ci) => GL.alpha.forEach((al, ai) => { ctx.globalAlpha = al; ctx.strokeStyle = c; ctx.stroke(paths[ci][ai]); }));
  ctx.restore();
}
// SPEC-021: мелкие рисунки по земле своего мира (одним путём на вид): травинки, крапинки асфальта, точки песка, синие тени на
// снегу, меловые каракули. Цвета — THEMES[place].marker / doodle
function groundDoodles(ctx, place, th, rnd, streets) {
  const GL = LOOK.GROUND_LOOK, D = GL.doodle, [dark, light] = th.marker, path = new Path2D(), dots = (n, r, c, a, rect = null) => {
    const q = new Path2D();
    for (let i = 0; i < n; i++) {
      const x = rect ? rect.x + rnd() * rect.w : rnd() * W, y = rect ? rect.y + rnd() * rect.h : rnd() * H, rr2 = r * (0.5 + rnd());
      q.moveTo(x + rr2, y); q.arc(x, y, rr2, 0, TAU);
    }
    ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fill(q);
  };
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (place === "park" || place === "field") {           // травинки: «v» из трёх штрихов
    for (let i = 0, n = place === "park" ? GL.tufts : GL.tufts / 2; i < n; i++) {
      const x = rnd() * W, y = rnd() * H, s = D.tuft[0] + rnd() * D.tuft[1];
      for (const k of [-1, 0, 1]) { path.moveTo(x + k * 2, y); path.lineTo(x + k * s * 0.7, y - s * (k ? 0.8 : 1.1)); }
    }
    ctx.globalAlpha = D.tuftA; ctx.strokeStyle = th.doodle; ctx.lineWidth = D.tuftW; ctx.stroke(path);
  } else if (place === "beach") {                        // песок в точку
    dots(GL.dots, 1.3, dark, D.sandA[0]); dots(GL.dots / 2, 1.2, light, D.sandA[1]);
  } else if (place === "winter") {                       // голубые тени сугробов — длинные мягкие волны
    for (let i = 0; i < GL.drifts; i++) {
      const x = rnd() * W, y = rnd() * H, len = D.drift[0] + rnd() * D.drift[1], h = D.drift[2] + rnd() * D.drift[3];
      path.moveTo(x, y); path.bezierCurveTo(x + len * 0.3, y - h, x + len * 0.7, y + h, x + len, y - h * 0.3);
    }
    ctx.globalAlpha = D.driftA; ctx.strokeStyle = th.doodle; ctx.lineWidth = D.driftW; ctx.stroke(path);
    dots(GL.dots / 3, 1, dark, D.snowA);
  } else if (place === "city") {                         // крапинки на асфальте улиц, штрихи по асфальту
    for (const r of streets) { markerStrokes(ctx, rnd, th.asphaltMarker, r); dots(GL.specks / 2, 1, th.asphaltMarker[0], D.streetA[0], r); dots(GL.specks / 4, 0.9, th.asphaltMarker[1], D.streetA[1], r); }
  } else if (place === "school") {                       // асфальт двора в крапинку и меловые каракули: звёздочки, сердечки, спирали
    dots(GL.specks, 1, dark, D.yardA[0]); dots(GL.specks / 2, 0.9, light, D.yardA[1]);
    for (let i = 0; i < GL.chalk; i++) {
      const x = CELL + rnd() * (W - 2 * CELL), y = CELL + rnd() * (H - 2 * CELL), s = D.chalkS[0] + rnd() * D.chalkS[1], kind = i % 3;
      if (kind === 0) for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; k ? path.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s) : path.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
      else if (kind === 1) { path.moveTo(x, y + s * 0.8); path.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.4, y - s, x, y - s * 0.3); path.bezierCurveTo(x + s * 0.4, y - s, x + s * 1.4, y - s * 0.2, x, y + s * 0.8); }
      else for (let k = 0; k < 24; k++) { const a = k * 0.5, r = s * k / 24; k ? path.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : path.moveTo(x, y); }
    }
    ctx.globalAlpha = D.chalkA; ctx.strokeStyle = th.doodle; ctx.lineWidth = D.chalkW; ctx.stroke(path);
  }
  ctx.restore();
}
function paintGround(place) {
  const th = THEMES[place], ctx = groundCanvas.getContext("2d"), rnd = mulberry32(LOOK.GROUND_LOOK.seed + WORLD_SEED[place] * 101 + G.level * 7);   // SPEC-021: своя случайность
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = th.g1; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.g2;
  if (place === "field") paintPitch(ctx, th, () => markerStrokes(ctx, rnd, th.marker));   // SPEC-016: полосы травы и разметка (SPEC-021: штрихи под мелом)
  else {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    markerStrokes(ctx, rnd, th.marker);                    // SPEC-021: штрихи фломастера поверх клеток
  }
  const streets = place === "city" ? paintStreets(ctx, th) : [];   // SPEC-016: улицы, разметка, зебры
  groundDoodles(ctx, place, th, rnd, streets);                // SPEC-021: травинки, крапинки, точки, тени на снегу, мел
  if (place === "field") { /* без цветочков: газон */ }
  else if (place === "city") { /* улицы уже нарисованы */ }
  else if (place === "school") {                              // разметка на асфальте и классики
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 4;
    ctx.strokeRect(9 * CELL, 6 * CELL, 9 * CELL, 8 * CELL);
    ctx.beginPath(); ctx.moveTo(13.5 * CELL, 6 * CELL); ctx.lineTo(13.5 * CELL, 14 * CELL); ctx.stroke();
    circleOn(ctx, 13.5 * CELL, 10 * CELL, 1.4 * CELL); ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const x = 8 * CELL + k * 26, y = 17.2 * CELL;
      ctx.fillStyle = k % 2 ? "#fde68a" : "#fca5a5"; ctx.fillRect(x, y, 24, 24);
      ctx.fillStyle = "#475569"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(k + 1), x + 12, y + 13);
    }
  } else {
    G.flowers.forEach((f, i) => {
      const c = th.dots[i % th.dots.length];
      if (place === "beach") {                           // ракушки и звёздочки
        ctx.fillStyle = c;
        if (i % 3 === 0) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k % 2 ? 2.2 : 5; ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); } ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(f.x, f.y, 3.5, Math.PI, 0); ctx.fill(); }
      } else if (place === "winter") {
        ctx.fillStyle = c; circleOn(ctx, f.x, f.y, 1.8); ctx.fill();
      } else {
        ctx.fillStyle = c;
        for (let k = 0; k < 4; k++) { circleOn(ctx, f.x + Math.cos(k * TAU / 4) * 2.5, f.y + Math.sin(k * TAU / 4) * 2.5, 2); ctx.fill(); }
        ctx.fillStyle = "#f59e0b"; circleOn(ctx, f.x, f.y, 1.6); ctx.fill();
      }
    });
  }
  if (G.dangerZone) {                                      // SPEC-021: грязь на земле вокруг дома папы (до полов: пол поверх, если клякса залезла)
    const B = LOOK.HOUSE_LOOK.big, x0 = G.dangerZone.x - CELL, y0 = G.dangerZone.y - CELL, x1 = G.dangerZone.x + G.dangerZone.w + CELL, y1 = G.dangerZone.y + G.dangerZone.h + CELL, m = CELL * 1.2;
    ctx.fillStyle = B.ground;
    for (let i = 0; i < B.groundN; i++) {
      const x = x0 - m + rnd() * (x1 - x0 + 2 * m), y = y0 - m + rnd() * (y1 - y0 + 2 * m);
      if (x > x0 && x < x1 && y > y0 && y < y1) continue;    // только снаружи, у стен
      ctx.beginPath(); ctx.ellipse(x, y, 5 + rnd() * 9, 3 + rnd() * 5, rnd() * 3, 0, TAU); ctx.fill();
    }
  }
  for (const f of G.floors) {
    if (f.kind === "bridge") {                           // доски поперёк пути через реку
      const [plank, gap] = th.bridge;
      ctx.fillStyle = plank; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = gap; ctx.lineWidth = 2.5;
      if (f.across === "x") for (let x = f.x + 10; x < f.x + f.w; x += 10) { ctx.beginPath(); ctx.moveTo(x, f.y); ctx.lineTo(x, f.y + f.h); ctx.stroke(); }
      else for (let y = f.y + 10; y < f.y + f.h; y += 10) { ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); ctx.stroke(); }
      ctx.lineWidth = 4; ctx.strokeRect(f.x + 2, f.y + 2, f.w - 4, f.h - 4);
      continue;
    }
    if (f.kind === "square") {                           // мостовая площади
      const [base, stone] = th.square;
      ctx.fillStyle = base; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = stone;
      for (let y = f.y + 6; y < f.y + f.h; y += 12) for (let x = f.x + 6 + ((y - f.y) / 12 % 2) * 6; x < f.x + f.w; x += 12) { circleOn(ctx, x, y, 4); ctx.fill(); }
      continue;
    }
    if (f.kind === "tile") {
      ctx.fillStyle = place === "school" ? "#e7d7b8" : "#f2ebdf"; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = place === "school" ? "#dbc59c" : "#e4d9c6";
      for (let y = 0; y < f.h / CELL; y++) for (let x = 0; x < f.w / CELL; x++) if ((x + y) % 2) ctx.fillRect(f.x + x * CELL, f.y + y * CELL, CELL, CELL);
    } else {
      const FL = LOOK.FLOOR_LOOK[f.kind === "wood" ? "wood" : "dark"];   // SPEC-021: цвета полов в CFG (тест читаемости)
      ctx.fillStyle = FL[0]; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = FL[1]; ctx.lineWidth = 2;
      for (let y = f.y + 16; y < f.y + f.h; y += 16) { ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); ctx.stroke(); }
    }
  }
  for (const d of G.decor) {
    if (d.kind === "bed") {
      rrOn(ctx, d.x + 4, d.y + 3, d.w - 8, d.h - 6, 6); fillStrokeOn(ctx, d.c, 2.5);
      rrOn(ctx, d.x + 7, d.y + 5, d.w - 14, 9, 4); fillStrokeOn(ctx, "#fff", 2);
    } else if (d.kind === "bigbed") {
      rrOn(ctx, d.x + 4, d.y + 4, d.w - 8, d.h - 8, 8); fillStrokeOn(ctx, "#7f1d1d", 3);
      rrOn(ctx, d.x + 8, d.y + 8, d.w - 16, 14, 5); fillStrokeOn(ctx, "#fff", 2);
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(d.x + d.w / 2 - 4, d.y + 26, 8, 26); ctx.fillRect(d.x + d.w / 2 - 13, d.y + 35, 26, 8);
    }
  }
  groundTex.needsUpdate = true;
}

export function buildMap3D() {
  const place = (G.levelInfo && G.levelInfo.world) || G.world, th = THEMES[place];   // место — мир построенного уровня
  if (mapGroup) { scene.remove(mapGroup); disposeTree(mapGroup); }
  setMapGroup(new THREE.Group()); scene.add(mapGroup);
  fadeTrees.length = 0; fadeBushes.length = 0; waves.length = 0; snow = null; bigHomeMats.length = 0; houseRoofs.length = 0; setHouseInfo(null);
  builtKey = mapKey();
  beginGeoScope();                       // SPEC-040 AC 2: one geometry per shape and size while the map is built
  wobbleSeed(0);                         // SPEC-021: одна и та же карта — те же неровные контуры
  scene.background.set(th.bg); scene.fog.color.set(th.bg);
  paintGround(place);

  const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), toon(th.outer));
  outer.rotation.x = -Math.PI / 2; outer.position.set(COLS / 2, -0.02, ROWS / 2); outer.receiveShadow = true;
  mapGroup.add(outer);
  if (place === "beach") {                               // море за забором снизу
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(160, 40), toon(th.sea));
    sea.rotation.x = -Math.PI / 2; sea.position.set(COLS / 2, -0.01, ROWS + 24); mapGroup.add(sea);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(160, 0.5), toon("#ffffff"));
    foam.rotation.x = -Math.PI / 2; foam.position.set(COLS / 2, 0, ROWS + 4.1); mapGroup.add(foam); waves.push(foam);
  }
  const gm = new THREE.MeshToonMaterial({ map: groundTex, gradientMap: gradTex }); gm.userData.own = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), gm);
  ground.rotation.x = -Math.PI / 2; ground.position.set(COLS / 2, 0, ROWS / 2); ground.receiveShadow = true;
  mapGroup.add(ground);

  // забор (SPEC-016: у Поля — рекламные щиты)
  if (th.deco && th.deco.boards) adBoards(th.deco);
  else {
  const postGeo = new THREE.BoxGeometry(0.12, 0.42, 0.12), posts = [];
  for (let x = 0; x <= COLS; x += 1) posts.push([x, -0.12], [x, ROWS + 0.12]);
  for (let z = 1; z < ROWS; z += 1) posts.push([-0.12, z], [COLS + 0.12, z]);
  const inst = new THREE.InstancedMesh(postGeo, toon(th.fence), posts.length);
  const mtx = new THREE.Matrix4();
  posts.forEach(([x, z], i) => { mtx.makeTranslation(x, 0.21, z); inst.setMatrixAt(i, mtx); });
  inst.castShadow = true; mapGroup.add(inst);
  for (const [x, z, w, d] of [[COLS / 2, -0.12, COLS + 0.3, 0.06], [COLS / 2, ROWS + 0.12, COLS + 0.3, 0.06], [-0.12, ROWS / 2, 0.06, ROWS + 0.3], [COLS + 0.12, ROWS / 2, 0.06, ROWS + 0.3]]) {
    for (const y of [0.16, 0.32]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), toon(th.fence)); rail.position.set(x, y, z); rail.castShadow = true; mapGroup.add(rail); }
  }
  }

  const mazeWalls = [];
  for (const o of G.obstacles) {
    if (o.kind === "cottage") mapGroup.add(makeCottage(place, o));
    else if (o.kind === "water") makeWaterFor(place, o);
    else if (o.kind === "pond" && o.fountain) makeFountain(place, o);
    else if (o.shape === "rect" && o.kind !== "pond") {
      const w = P(o.w), d = P(o.h), [c0, c1] = o.kind === "hedge" ? HEDGE_COLORS : o.kind === "maze" ? [th.maze.wall, th.maze.cap] : th.walls[o.kind];
      if (o.kind === "maze") mazeWalls.push(o);
      let wm = null;
      if (o.kind === "bighome") { wm = ownMat(c0, false, true); wm.emissive = new THREE.Color("#000000"); bigHomeMats.push(wm); }
      const wall = tag(part(new THREE.BoxGeometry(w, WALL_H, d), c0, 0.025, wm || toonH(c0)), o.kind);
      wall.position.set(P(o.x) + w / 2, WALL_H / 2, P(o.y) + d / 2); wall.receiveShadow = true;
      mapGroup.add(wall);
      const capGeo = new THREE.BoxGeometry(w - (place === "winter" ? 0 : 0.1), place === "winter" ? 0.12 : 0.05, d - (place === "winter" ? 0 : 0.1));
      const cap = place === "winter" ? part(capGeo, c1, 0.02) : new THREE.Mesh(capGeo, toon(c1));
      cap.castShadow = false;                                       // тень даёт сама стена   // SPEC-021: снег на стене выше её контура — свой контур
      cap.position.set(P(o.x) + w / 2, WALL_H + (place === "winter" ? 0.05 : 0.02), P(o.y) + d / 2); mapGroup.add(cap);
      if ((place === "school" || place === "city") && o.kind === "build" && (o.w > CELL * 2 || o.h > CELL * 2)) {   // окна на школе и витрины торгового центра
        const along = o.w > o.h, len = along ? w : d, n = Math.floor(len / 1.6);
        for (let k = 0; k < n; k++) {
          const off = -len / 2 + (k + 0.5) * len / n;
          for (const side of [-1, 1]) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.5 : 0.02, 0.32, along ? 0.02 : 0.5), toon("#bae6fd"));
            win.position.set(P(o.x) + w / 2 + (along ? off : side * (w / 2 + 0.01)), 0.5, P(o.y) + d / 2 + (along ? side * (d / 2 + 0.01) : off));
            mapGroup.add(win);
          }
        }
      }
    } else if (o.kind === "pond") makePondFor(place, o);
    else if (o.kind === "rock") { const r = makeRockFor(place, o); r.userData.obj = "rock"; r.position.set(P(o.x), 0, P(o.y)); mapGroup.add(r); }
    else if (o.kind === "tree") {
      const t = makeTreeFor(place, o, true); t.g.userData.obj = "tree";   // SPEC-021: obj — что это (тест контуров look3D)
      t.g.position.set(P(o.x), 0, P(o.y)); t.g.traverse(q => { if (q.isMesh) q.castShadow = true; }); mapGroup.add(t.g);
      fadeTrees.push({ o, g: t.g, mats: t.mats, a: 1, fading: false });
    }
  }
  mazeDeco(place, mazeWalls);
  riverBanks(place);
  dressHouses(place);                    // SPEC-021: крыши, двери с сердечком, грязный дом папы
  for (const b of G.bushes) {
    const k = makeBushFor(place); k.g.position.set(P(b.x), 0, P(b.y)); mapGroup.add(k.g);
    fadeBushes.push({ b, g: k.g, mats: k.mats, a: 1, fading: false });
  }
  // декорации за забором
  const rng = mulberry32(G.level * 31 + 7);
  for (let i = 0, made = 0; i < 400 && made < 46; i++) {
    const x = -7 + rng() * (COLS + 14), z = -6 + rng() * (ROWS + 12);
    if (x > -1.2 && x < COLS + 1.2 && z > -1.2 && z < ROWS + 1.2) continue;
    if (place === "beach" && z > ROWS + 3.5) continue;   // там море
    const fake = { s: 0.9 + rng() * 0.5, v: rng() < 0.6 ? "pine" : "round" };
    // SPEC-040 AC 6: the tier keeps a share of this decor (medium 3/4, low 1/2) — by its number in the sequence, so every device of a tier draws
    // the same decor; the seeded sequence itself is drawn in full (the rest of the decor stays where it was) and nothing of the play area is thinned
    if (!keepDecor(made, tierNumbers().decor)) { if (place === "city" && made % 2) rng(); made++; continue; }
    if (place === "city" && made % 2) {                  // SPEC-016: на улицах за оградой — фонари, гидранты, скамейки, урны
      const thing = makeStreetThing(["lamp", "hydrant", "lamp", "bench", "lamp", "bin"][(made >> 1) % 6], th.deco);
      thing.position.set(x, 0, z); thing.rotation.y = Math.round(rng() * 3) * Math.PI / 2; mapGroup.add(thing); made++; continue;
    }
    const t = makeTreeFor(place, fake, false);
    t.g.traverse(q => { if (q.isMesh) q.castShadow = true; });
    t.g.position.set(x, 0, z); mapGroup.add(t.g); made++;
  }
  if (place === "field") {                               // SPEC-016: мачты света по углам, угловые флажки, скамейки запасных с мячами
    const D = th.deco, add = (kind, x, z, ry = 0) => { const q = makeStreetThing(kind, D); q.position.set(x, 0, z); q.rotation.y = ry; mapGroup.add(q); };
    for (const [x, z] of [[-2.2, -2.2], [COLS + 2.2, -2.2], [-2.2, ROWS + 2.2], [COLS + 2.2, ROWS + 2.2]]) add("mast", x, z, Math.atan2(COLS / 2 - x, ROWS / 2 - z));
    for (const [x, z] of [[-0.55, -0.55], [COLS + 0.55, -0.55], [-0.55, ROWS + 0.55], [COLS + 0.55, ROWS + 0.55]]) add("flag", x, z);
    for (const x of [COLS / 2 - 4, COLS / 2 + 4]) { add("bench", x, ROWS + 1.1); add("bench", x, -1.1, Math.PI); }
    for (const [x, z] of [[COLS / 2 - 2.4, ROWS + 1.0], [COLS / 2 + 5.7, ROWS + 1.2], [COLS / 2 + 1.5, -1.0]]) add("ball", x, z);
  }
  safeGlow = null;
  if (G.safeZone) {
    const f = G.floors.find(fl => fl.x >= G.safeZone.x && fl.y >= G.safeZone.y && fl.x < G.safeZone.x + G.safeZone.w && fl.y < G.safeZone.y + G.safeZone.h);
    if (f) {
      const m = new THREE.MeshBasicMaterial({ color: LOOK.SAFE_GLOW.color, transparent: true, opacity: LOOK.SAFE_GLOW.alpha, depthWrite: false }); m.userData.own = true;
      safeGlow = new THREE.Mesh(new THREE.PlaneGeometry(P(f.w) - 0.1, P(f.h) - 0.1), m);
      safeGlow.rotation.x = -Math.PI / 2; safeGlow.position.set(P(f.x + f.w / 2), 0.03, P(f.y + f.h / 2));
      mapGroup.add(safeGlow);
    }
  }
  if (th.snow) {                                         // снегопад
    const N = 700, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = vrand(-4, COLS + 4); pos[i * 3 + 1] = vrand(0, 14); pos[i * 3 + 2] = vrand(-4, ROWS + 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: "#ffffff", size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }); pm.userData.own = true;
    snow = new THREE.Points(g, pm); snow.frustumCulled = false; mapGroup.add(snow);
  }
  // SPEC-040 AC 2 / 5: what stands still is drawn instanced; trees and bushes are drawn opaque from the instances until a fade starts (batch.js)
  batchMap(mapGroup, { skip: new Set([...houseRoofs.map(r => r.g), ...waves]), fades: [...fadeTrees, ...fadeBushes] });
  endGeoScope();
  if (!compileLater) warmFadeVariants();
}
// SPEC-040 AC 4: the warm-up behind the level card compiles the shader variants on its own (compileFadeVariants, without blocking a frame)
let compileLater = false;
export const setCompileLater = on => { compileLater = on; };
// the transparent drawing of a fading tree, bush or roof is a shader variant the first frame does not use (they start opaque): compile it
// now, with the map, so the first fade in play is not a hitch. renderer.compile draws nothing; it only makes the programs
function warmFadeVariants() {
  if (!renderer) return;
  const set = roofSetter();
  set(true);
  renderer.compile(scene, camera);                       // the transparent variants (a fading tree, bush, roof)
  set(false);
  renderer.compile(scene, camera);                       // and the opaque roofs (where they start: a = 1)
}
const roofSetter = () => { const mats = houseRoofs.flatMap(r => r.mats.flatMap(mt => [mt, mt.userData.outline])); return on => { for (const mt of mats) if (mt.transparent !== on) { mt.transparent = on; mt.needsUpdate = true; } }; };
// the same without blocking: compileAsync polls the driver (KHR_parallel_shader_compile where there is one) and the promise resolves when the programs are ready
export async function compileFadeVariants() {
  if (!renderer) return;
  const set = roofSetter();
  set(true);
  await renderer.compileAsync(scene, camera);
  set(false);
  await renderer.compileAsync(scene, camera);
}
