// SPEC-029 / SPEC-011: the practice games of the tutorial — their map, setup, scripted bot and Big One, hint state. Core module.
import { CELL, CFG, COLS, ROWS } from "./config.js";
import { hooks } from "./hooks.js";
import { angDiff, dist, mulberry32 } from "./util.js";
import { L } from "../i18n.js";
import { big, curWorld, level, littles, setHeardHintDone, setItemCd, setKitHintDone, stats } from "./game.js";
import { applyWorld, connectivity, setLevelInfo } from "./level/build.js";
import { houseDoor, placeSmallHome } from "./level/generate.js";
import { BIG_HOUSE, bigHouse, hWallTo, vWallTo } from "./level/layouts.js";
import { setReachable, spawns } from "./world.js";

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
  setReachable(connectivity().seen);
  setLevelInfo({ world: curWorld, lv: level, type: "tutorial", attempt: 0, fallback: false, cached: false, ms: 0 });
}

export let tutorialGame = 0, tut = { script: false, hint: 0, bothDown: 0 }, tutorialInv = { kisses: 0, rescues: 0, mittens: 0, mega: 0 };
// тренировка построена (resetWorld): свой запас (тренировка 2 — поцелуи и спасалка из CFG.TUTORIAL), свои подсказки вместо
// «Нажми 🩹» и «Папа услышал топот»; тренировка 1 — сценарий: папа стоит на поляне лицом к боту, бот бежит на него
export function tutorialSetup() {
  const T = CFG.TUTORIAL, g2 = tutorialGame === 2;
  tut = { script: tutorialGame === 1, scriptT: 0, hint: g2 ? 1 : 0, bothDown: 0, seq: 1, hintT: 0, fell: false, did: [false, false, false, false, false] };
  tutorialInv = { kisses: g2 ? T.kisses : 0, rescues: g2 ? T.kits : 0, mittens: 0, mega: 0 };
  setKitHintDone(true); setHeardHintDone(true);
  if (g2) setItemCd(T.itemEvery);                            // первый предмет — через itemEvery сек
  if (tutorialGame === 1) {
    const [x, y] = CFG.TUTORIAL_LOOK.dadStart, b = littles[1];
    Object.assign(big, { x: x * CELL, y: y * CELL, state: "look", timer: T.scriptMax, dir: Math.atan2(b.y - y * CELL, b.x - x * CELL) });
  }
}
// каждый кадр тренировки: лежат оба — через bothDownStand сек встают в домике маленьких (проиграть нельзя);
// тренировка 1: конец сценария (бот упал) и шаги подсказки — 1 «друг упал» → 2 «подкрадись сзади» → 3 «обними 3 раза»
export function updateTutorial(dt) {
  const T = CFG.TUTORIAL;
  if (littles.every(l => l.state === "down")) {
    tut.bothDown += dt;
    if (tut.bothDown >= T.bothDownStand) {
      tut.bothDown = 0;
      for (const l of littles) {
        const sp = spawns.small[l.id];
        Object.assign(l, { state: "ok", x: sp.x, y: sp.y, kx: 0, ky: 0, rescue: 0, path: [], moving: false, invuln: CFG.INVULN_AFTER_RESCUE });
        hooks.pop(l.x, l.y - 40, L().back, "#7CFC9A");
      }
    }
  } else tut.bothDown = 0;
  if (tutorialGame === 2) { updateHints2(dt); return; }
  const p = littles[0], bot = littles[1];
  // сценарий кончается, когда бот упал, — или через scriptMax сек (бота так и не толкнули: сразу подсказка 2)
  if (tut.script && bot.state !== "ok") tut.script = false;
  else if (tut.script && (tut.scriptT += dt) >= T.scriptMax) { tut.script = false; if (!tut.hint) tut.hint = 2; }
  if (tut.hint !== 1 && bot.state === "down") tut.hint = 1;   // друг упал (и снова) — подсказка 1; один шаг назад разрешён
  else if (tut.hint === 1 && bot.state === "ok") tut.hint = 2;
  else if (tut.hint === 2 && (stats.playerHugs > 0 || (p.state === "ok" && dist(p, big) < big.r + p.r + T.nearCells * CELL
    && angDiff(big.dir, Math.atan2(p.y - big.y, p.x - big.x)) > CFG.BEHIND_ANGLE))) tut.hint = 3;
}
// тренировка 2: подсказки по одной — 1 «возьми предмет» → 2 «заведи папу на банан» → 3 «пошли поцелуй»; каждая — пока её не сделали
// хоть раз или hintTimeout сек (сделанные раньше пропускаются); первое падение игрока — 4 «встань спасалкой» (вместо обычной
// «Нажми 🩹»; пока лежит, не дольше hintTimeout), потом снова та, что прервали. tut.seq — следующая по порядку
function updateHints2(dt) {
  const p = littles[0], did = tut.did;                     // флаги ставит tutorialNote (по событиям) и throwKiss
  const nextSeq = () => { while (tut.seq <= 3 && did[tut.seq]) tut.seq++; return tut.seq <= 3 ? tut.seq : 0; };
  if (!tut.fell && p.state === "down") { tut.fell = true; if (!did[4]) { tut.hint = 4; tut.hintT = 0; } }
  if (!tut.hint) return;
  tut.hintT += dt;
  if (did[tut.hint] || tut.hintT >= CFG.TUTORIAL.hintTimeout || (tut.hint === 4 && p.state !== "down")) {
    if (tut.hint !== 4) tut.seq = tut.hint + 1;
    tut.hint = nextSeq(); tut.hintT = 0;
  }
}
// событие игры в тренировке 2 → флаг сделанного для подсказок: предмет взял игрок, папа поскользнулся, спасалка игрока
export function tutorialNote(e) {
  const p = littles[0];
  if (e.type === "item" && e.who === p.id) tut.did[1] = true;
  else if (e.type === "slip") tut.did[2] = true;
  else if (e.type === "kit" && e.who === p.id) tut.did[4] = true;
}
// SPEC-011 AC 5: other modules change this module's state only through these setters (live bindings are read-only there)
export function setTutorialGame(v) { return (tutorialGame = v); }
