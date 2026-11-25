// SPEC-019 / SPEC-011: the Big One hears running feet. Core module.
import { CELL, CFG } from "./config.js";
import { angDiff, dist, normAng, rand } from "./util.js";
import { big, heardHintDone, littles, logEvent, mode, pendingWin, setHeardHintDone, setHeardHintPi, setHeardHintT } from "./game.js";
import { inSafe, los, seeSolidAt } from "./world.js";

// ---------- SPEC-019: Большой слышит топот ----------
// Бежит (не на цыпочках): на ногах, идёт, доля скорости ≥ TIPTOE_MAX (на цыпочках — не больше TIPTOE_MULT)
export const isRunning = l => !!l && l.state === "ok" && l.moving && l.speedFrac >= CFG.TIPTOE_MAX;
// Не слышит: в шоке (и при последней обнимашке), красный, лежит после банана, стоит после толчка, не идёт игра
export const bigDeaf = () => mode !== "play" || pendingWin > 0 || big.stun > 0 || big.blush > 0 || big.slip > 0 || big.pushCd > 0;
export const stopHearing = () => { big.noise = 0; big.hearTurnT = 0; big.hearLook = 0; };
// Прислушивается: не в шоке, не красный, не лежит, не стоит после толчка. Пока видит кого-то и гонится — не слышит (ранний выход
// в updateBig); ищет того, кого только что потерял, — слышит (решение прогона: баланс SPEC-019 AC 5)
export const bigListens = () => !bigDeaf();
// Шум за кадр: каждый бегущий рядом (HEAR_RADIUS клеток) вне взгляда (по углу), не невидимка и не в домике, — NOISE_RATE
// (через стену × HEAR_WALL); никто не шумит — шум тает. Набралось NOISE_TURN — поворачивается к самому громкому (при равных —
// к ближнему) за HEAR_TURN_TIME, потом стоит и смотрит туда HEAR_LOOK сек; HEAR_COOLDOWN сек — снова не слышит.
// насколько слышно бегущего l: 0 — не слышно; 1 — рядом и видно по прямой; HEAR_WALL — через стену (кулдаун и «не слышит» — не здесь)
export function audible(l) {
  if (!isRunning(l) || l.fx.cloak > 0 || inSafe(l)) return 0;
  const dx = l.x - big.x, dy = l.y - big.y;
  if (Math.hypot(dx, dy) > CFG.HEAR_RADIUS * CELL || angDiff(big.dir, Math.atan2(dy, dx)) < CFG.VISION_HALF) return 0;
  return los(big.x, big.y, l.x, l.y, seeSolidAt) ? 1 : CFG.HEAR_WALL;
}
export function hearNoise(dt) {
  let add = 0, loud = null, best = 0, bestD = Infinity;
  if (big.hearCd <= 0 && bigListens()) for (const l of littles) {
    const k = audible(l);
    if (!k) continue;
    const d = dist(l, big), c = CFG.NOISE_RATE * dt * k;
    add += c;
    if (c > best || (c === best && d < bestD)) { best = c; bestD = d; loud = l; }
  }
  big.noise = add > 0 ? big.noise + add : Math.max(0, big.noise - CFG.NOISE_DECAY * dt);
  if (big.noise < CFG.NOISE_TURN || !loud) return;
  const a = Math.atan2(loud.y - big.y, loud.x - big.x);
  big.noise = 0; big.hearCd = CFG.HEAR_COOLDOWN;
  big.hearFace = a; big.hearTurnT = CFG.HEAR_TURN_TIME; big.hearRate = Math.abs(normAng(a - big.dir)) / CFG.HEAR_TURN_TIME;
  big.hearLook = rand(CFG.HEAR_LOOK[0], CFG.HEAR_LOOK[1]);
  big.state = "look"; big.timer = Math.max(big.timer, CFG.HEAR_TURN_TIME + big.hearLook); big.goal = null; big.path = [];
  logEvent("heard", { who: loud.id, kind: loud.kind });
  if (loud.kind === "player" && !heardHintDone) { setHeardHintDone(true); setHeardHintT(CFG.HEAR_HINT_TIME); setHeardHintPi(loud.id); }
}
// значок над Большим (тот же порядок, что рисуется): 🍌💫, ?!, 💗, ❓ (обернулся на топот), 👂 (слышит), 💦, !
export function bigMark() {
  if (big.kind) return "💗";                               // SPEC-022: подобрел — не «!» и не «👂»
  if (big.slip > 0) return "🍌💫";
  if (big.stun > 0) return "?!";
  if (big.blush > 0) return "💗";
  if (big.state === "look" && (big.hearTurnT > 0 || big.hearLook > 0)) return "❓";
  if (big.noise >= CFG.NOISE_WARN) return "👂";
  if (big.noPush > 0) return "💦";
  if (big.state === "chase") return "!";
  return "";
}
