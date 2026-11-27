// SPEC-029 / SPEC-011: the practice games of the tutorial — their map, setup, scripted bot and Big One, hint state. Core module.
import { CELL, CFG, COLS, ROWS } from "./config.js";
import { angDiff, dist, mulberry32 } from "./util.js";
import { applyWorld, connectivity } from "./level/build.js";
import { houseDoor, placeSmallHome } from "./level/generate.js";
import { BIG_HOUSE, bigHouse, hWallTo, vWallTo } from "./level/layouts.js";
import { G } from "./active.js";
import { emit, stockOf } from "./game.js";

// ---------- SPEC-029: карта тренировок обучения ----------
// Своя, всегда одна и та же (без случайности): поляна в левом верхнем углу ≈ CFG.TUTORIAL.mapArea площади карты (21 × 14 клеток
// из 30 × 20), за живой изгородью — деревья. Домик маленьких слева вверху (как везде), дом папы в правом нижнем углу поляны;
// на поляне — кусты, пара деревьев, камень и лужа (места — CFG.TUTORIAL_LOOK). Уровень Парка 1 и остальные не меняются.
export function tutorialMapRect() {
  const k = Math.sqrt(CFG.TUTORIAL.mapArea);
  return { x: 0, y: 0, w: Math.round(COLS * k), h: Math.round(ROWS * k) };
}
function tutorialLevelGen() {
  const items = [], R = tutorialMapRect(), T = CFG.TUTORIAL_LOOK;
  const lc = { items, hWall: (x1, x2, y, kind, gaps = []) => hWallTo(items, x1, x2, y, kind, gaps), vWall: (x, y1, y2, kind, gaps = []) => vWallTo(items, x, y1, y2, kind, gaps),
    small: null, doors: { small: [], big: [] } };
  placeSmallHome(lc);
  const x0 = R.w - BIG_HOUSE, y0 = R.h - BIG_HOUSE, bigDoors = [{ side: "top", at: 2 }, { side: "left", at: 2 }];
  bigHouse(items, x0, y0, bigDoors);
  hWallTo(items, 0, R.w, R.h, "hedge"); vWallTo(items, R.w, 0, R.h - 1, "hedge");   // изгородь по краю поляны
  for (const [x, y] of T.bushes) items.push({ t: "bush", x, y });
  for (const [x, y] of T.trees) items.push({ t: "tree", x, y, v: "round", s: 1 });
  for (const [x, y] of T.rocks) items.push({ t: "rock", x, y, s: 1 });
  for (const [x, y, w] of T.ponds) items.push({ t: "pond", x, y, w, h: 2 });
  // за изгородью — деревья через одну клетку (просто вид: туда никто не ходит)
  for (let y = 0; y < ROWS; y += T.outStep) for (let x = R.w + 2 + (y / T.outStep) % 2; x < COLS; x += T.outStep) items.push({ t: "tree", x, y, v: (x + y) % 3 ? "pine" : "round", s: 1 });
  for (let y = R.h + 2; y < ROWS; y += T.outStep) for (let x = (y % 2); x < R.w + 2; x += T.outStep) items.push({ t: "tree", x, y, v: (x + y) % 3 ? "round" : "pine", s: 1 });
  const fr = mulberry32(T.flowerSeed), fl = [];
  for (let i = 0; i < T.flowers; i++) fl.push({ x: fr() * R.w * CELL, y: fr() * R.h * CELL, c: T.flowerColors[Math.floor(fr() * T.flowerColors.length)] });
  return { type: "meadow", items, small: lc.small, big: [x0 + 3, y0 + 2], flowers: fl,
    doors: { small: lc.doors.small, big: bigDoors.map(d => houseDoor(x0, y0, BIG_HOUSE, BIG_HOUSE, d)) }, meta: {} };
}
export function applyTutorialMap() {
  applyWorld(tutorialLevelGen());
  G.reachable = connectivity().seen;
  G.levelInfo = { world: G.world, lv: G.level, type: "tutorial", attempt: 0, fallback: false, cached: false, ms: 0 };
}

// SPEC-012: G.tutorialGame (номер тренировки, 0 — обычный уровень), G.tut (сценарий и подсказки), G.tutorialInv (свой запас) — в игре.
// тренировка построена (resetWorld): свой запас (тренировка 2 — поцелуи и спасалка из CFG.TUTORIAL), свои подсказки вместо
// «Нажми 🩹» и «Папа услышал топот»; тренировка 1 — сценарий: папа стоит на поляне лицом к боту, бот бежит на него
export function tutorialSetup() {
  const T = CFG.TUTORIAL, g2 = G.tutorialGame === 2;
  G.tut = { script: G.practice.script === "game1", scriptT: 0, hint: g2 ? 1 : 0, bothDown: 0, seq: 1, hintT: 0, fell: false, did: [false, false, false, false, false] };
  G.tutorialInv = stockOf(G.practice.stock);              // свой запас (настоящий не тратится; ни coins, ни spent)
  G.kitHintDone = true; G.heardHintDone = true;
  if (g2) G.itemCd = T.itemEvery;                            // первый предмет — через itemEvery сек
  if (G.tutorialGame === 1) {
    const [x, y] = CFG.TUTORIAL_LOOK.dadStart, b = G.littles[1];
    Object.assign(G.big, { x: x * CELL, y: y * CELL, state: "look", timer: T.scriptMax, dir: Math.atan2(b.y - y * CELL, b.x - x * CELL) });
  }
}
// каждый кадр тренировки: лежат оба — через bothDownStand сек встают в домике маленьких (проиграть нельзя);
// тренировка 1: конец сценария (бот упал) и шаги подсказки — 1 «друг упал» → 2 «подкрадись сзади» → 3 «обними 3 раза»
export function updateTutorial(dt) {
  const T = CFG.TUTORIAL;
  if (G.littles.every(l => l.state === "down")) {
    G.tut.bothDown += dt;
    if (G.tut.bothDown >= T.bothDownStand) {
      G.tut.bothDown = 0;
      for (const l of G.littles) {
        const sp = G.spawns.small[l.id];
        Object.assign(l, { state: "ok", x: sp.x, y: sp.y, kx: 0, ky: 0, rescue: 0, helped: false, path: [], moving: false, invuln: CFG.INVULN_AFTER_RESCUE });
        emit("pop", { key: "back", args: [], x: l.x, y: l.y - 40, color: "#7CFC9A" });
      }
    }
  } else G.tut.bothDown = 0;
  if (G.tutorialGame === 2) { updateHints2(dt); return; }
  const p = G.littles[0], bot = G.littles[1];
  // сценарий кончается, когда бот упал, — или через scriptMax сек (бота так и не толкнули: сразу подсказка 2)
  if (G.tut.script && bot.state !== "ok") G.tut.script = false;
  else if (G.tut.script && (G.tut.scriptT += dt) >= T.scriptMax) { G.tut.script = false; if (!G.tut.hint) G.tut.hint = 2; }
  if (G.tut.hint !== 1 && bot.state === "down") G.tut.hint = 1;   // друг упал (и снова) — подсказка 1; один шаг назад разрешён
  else if (G.tut.hint === 1 && bot.state === "ok") G.tut.hint = 2;
  else if (G.tut.hint === 2 && (G.stats.playerHugs > 0 || (p.state === "ok" && dist(p, G.big) < G.big.r + p.r + T.nearCells * CELL
    && angDiff(G.big.dir, Math.atan2(p.y - G.big.y, p.x - G.big.x)) > CFG.BEHIND_ANGLE))) G.tut.hint = 3;
}
// тренировка 2: подсказки по одной — 1 «возьми предмет» → 2 «заведи папу на банан» → 3 «пошли поцелуй»; каждая — пока её не сделали
// хоть раз или hintTimeout сек (сделанные раньше пропускаются); первое падение игрока — 4 «встань спасалкой» (вместо обычной
// «Нажми 🩹»; пока лежит, не дольше hintTimeout), потом снова та, что прервали. tut.seq — следующая по порядку
function updateHints2(dt) {
  const p = G.littles[0], did = G.tut.did;                     // флаги ставит tutorialNote (по событиям) и throwKiss
  const nextSeq = () => { while (G.tut.seq <= 3 && did[G.tut.seq]) G.tut.seq++; return G.tut.seq <= 3 ? G.tut.seq : 0; };
  if (!G.tut.fell && p.state === "down") { G.tut.fell = true; if (!did[4]) { G.tut.hint = 4; G.tut.hintT = 0; } }
  if (!G.tut.hint) return;
  G.tut.hintT += dt;
  if (did[G.tut.hint] || G.tut.hintT >= CFG.TUTORIAL.hintTimeout || (G.tut.hint === 4 && p.state !== "down")) {
    if (G.tut.hint !== 4) G.tut.seq = G.tut.hint + 1;
    G.tut.hint = nextSeq(); G.tut.hintT = 0;
  }
}
// событие игры в тренировке 2 → флаг сделанного для подсказок: предмет взял игрок, папа поскользнулся, спасалка игрока
export function tutorialNote(e) {
  const p = G.littles[0];
  if (e.type === "item" && e.who === p.id) G.tut.did[1] = true;
  else if (e.type === "slip") G.tut.did[2] = true;
  else if (e.type === "kit" && e.who === p.id) G.tut.did[4] = true;
}
