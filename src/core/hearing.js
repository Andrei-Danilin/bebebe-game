// SPEC-019 / SPEC-011: the Big One hears running feet. Core module.
import { CELL, CFG } from "./config.js";
import { angDiff, dist, normAng, rand, rng } from "./util.js";
import { emit, logEvent } from "./events.js";
import { inSafe, los, seeSolidAt } from "./world.js";
import { trickHearMul, trickMark } from "./tricks/query.js";
import { G } from "./active.js";

// ---------- SPEC-019: Большой слышит топот ----------
// Бежит (не на цыпочках): на ногах, идёт, доля скорости ≥ TIPTOE_MAX (на цыпочках — не больше TIPTOE_MULT)
export const isRunning = l => !!l && l.state === "ok" && l.moving && l.speedFrac >= CFG.TIPTOE_MAX;
// Не слышит: в шоке (и при последней обнимашке), красный, лежит после банана, стоит после толчка, уровень выигран
export const bigDeaf = () => G.phase === "won" || G.pendingWin > 0 || G.big.stun > 0 || G.big.blush > 0 || G.big.slip > 0 || G.big.pushCd > 0;
export const stopHearing = () => { G.big.noise = 0; G.big.hearTurnT = 0; G.big.hearLook = 0; };
// Прислушивается: не в шоке, не красный, не лежит, не стоит после толчка. Пока видит кого-то и гонится — не слышит (ранний выход
// в updateBig); ищет того, кого только что потерял, — слышит (решение прогона: баланс SPEC-019 AC 5)
export const bigListens = () => !bigDeaf();
// Шум за кадр: каждый бегущий рядом (HEAR_RADIUS клеток) вне взгляда (по углу), не невидимка и не в домике, — NOISE_RATE
// (через стену × HEAR_WALL); никто не шумит — шум тает. Набралось NOISE_TURN — поворачивается к самому громкому (при равных —
// к ближнему) за HEAR_TURN_TIME, потом стоит и смотрит туда HEAR_LOOK сек; HEAR_COOLDOWN сек — снова не слышит.
// насколько слышно бегущего l: 0 — не слышно; 1 — рядом и видно по прямой; HEAR_WALL — через стену (кулдаун и «не слышит» — не здесь)
export function audible(l) {
  const loud = trickHearMul(l);                              // SPEC-042: a puddle's splash is heard from loud × HEAR_RADIUS for a second, running or not
  if ((!isRunning(l) && !(loud > 1 && l.state === "ok")) || l.fx.cloak > 0 || inSafe(l)) return 0;
  const dx = l.x - G.big.x, dy = l.y - G.big.y;
  if (Math.hypot(dx, dy) > CFG.HEAR_RADIUS * CELL * loud || angDiff(G.big.dir, Math.atan2(dy, dx)) < CFG.VISION_HALF) return 0;
  return los(G.big.x, G.big.y, l.x, l.y, seeSolidAt) ? 1 : CFG.HEAR_WALL;
}
export function hearNoise(dt) {
  let add = 0, loud = null, best = 0, bestD = Infinity;
  if (G.big.hearCd <= 0 && bigListens()) for (const l of G.littles) {
    const k = audible(l);
    if (!k) continue;
    const d = dist(l, G.big), c = CFG.NOISE_RATE * dt * k;
    add += c;
    if (c > best || (c === best && d < bestD)) { best = c; bestD = d; loud = l; }
  }
  G.big.noise = add > 0 ? G.big.noise + add : Math.max(0, G.big.noise - CFG.NOISE_DECAY * dt);
  if (G.big.noise < CFG.NOISE_TURN || !loud) return;
  // SPEC-032: не всегда слышит — с вероятностью HEAR_CHANCE (тренировка 1 — TUTORIAL.hearChance); шанс 1 — без броска (игра до SPEC-032).
  // Не расслышал: шум сброшен, HEAR_MISS_COOLDOWN сек снова не слышит, не оборачивается
  const chance = G.tutorialGame === 1 ? CFG.TUTORIAL.hearChance : CFG.HEAR_CHANCE;
  if (chance < 1 && rng() >= chance) {
    G.big.noise = 0; G.big.hearCd = CFG.HEAR_MISS_COOLDOWN;
    logEvent("hearMiss", { who: loud.id, kind: loud.kind });
    return;
  }
  const a = Math.atan2(loud.y - G.big.y, loud.x - G.big.x);
  G.big.noise = 0; G.big.hearCd = CFG.HEAR_COOLDOWN;
  G.big.hearFace = a; G.big.hearTurnT = CFG.HEAR_TURN_TIME; G.big.hearRate = Math.abs(normAng(a - G.big.dir)) / CFG.HEAR_TURN_TIME;
  G.big.hearLook = rand(CFG.HEAR_LOOK[0], CFG.HEAR_LOOK[1]);
  G.big.state = "look"; G.big.timer = Math.max(G.big.timer, CFG.HEAR_TURN_TIME + G.big.hearLook); G.big.goal = null; G.big.path = [];
  logEvent("heard", { who: loud.id, kind: loud.kind });
  emit("sfx", { name: "heard", slot: "big" });                // SPEC-047
  if (loud.kind === "player" && !G.heardHintDone) { G.heardHintDone = true; emit("hint", { kind: "heard", slot: loud.slot }); }
}
const SLIP_MARK = Object.freeze({ banana: "🍌💫", melon: "🍉💫", ball: "💫", eat: "🧁💗", freeze: "🧊" });   // SPEC-043
export const SLIP_MARKS = Object.freeze(Object.values(SLIP_MARK));   // every mark of the things that lay him down (draw.js puts them all at the same spot)
// значок над Большим (тот же порядок, что рисуется): 🍌💫, ?!, 💗, ❓ (обернулся на топот), 👂 (слышит), 💦, !
export function bigMark() {
  if (G.big.kind) return "💗";                               // SPEC-022: подобрел — не «!» и не «👂»
  if (G.big.slip > 0) return SLIP_MARK[G.big.slipKind] || "🍌💫";   // SPEC-043: the mark follows what laid him down
  if (G.big.stun > 0) return "?!";
  if (G.big.blush > 0) return "💗";
  if (trickMark()) return trickMark();                     // SPEC-042: the school bell holds him: 🔔
  if (G.big.watch > 0) return "✈";                          // SPEC-043: watching the paper plane
  if (G.big.cake > 0) return "🧁";                          // SPEC-043: walking to a cupcake
  if (G.big.state === "look" && (G.big.hearTurnT > 0 || G.big.hearLook > 0)) return "❓";
  if (G.big.noise >= CFG.NOISE_WARN) return "👂";
  if (G.big.noPush > 0) return "💦";
  if (G.big.state === "chase") return "!";
  return "";
}
