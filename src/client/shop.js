// SPEC-011: the Character screen's buy actions: gloves, kisses, the rescue kit, upgrades (buyUpgrade, upgLevel), setEquip.
// Client module (moved out of index.html in Phase C).

import { GLOVES, KISSES, RESCUE_KIT, UPGRADES } from "../core/config.js";
import { progress, spendCoins } from "../core/economy.js";
import { playSound } from "./sound.js";
import { redress } from "./flow.js";
import { saveProgress } from "./progress.js";
import { ui } from "./state.js";

export function buyGloves(kind) {
  const g = GLOVES[kind];
  if (!spendCoins(kind, g.price)) { playSound("nope"); return; }
  progress.inv[kind] += g.charges;
  if (progress.equip[0] === "none") progress.equip[0] = kind;
  saveProgress(); playSound("buy");
}
export function buyKisses() {
  if (!spendCoins("kisses", KISSES.price)) { playSound("nope"); return; }
  progress.inv.kisses += KISSES.pack;
  saveProgress(); playSound("buy");
}
export function buyRescueKit() {
  if (!spendCoins("rescues", RESCUE_KIT.price)) { playSound("nope"); return; }
  progress.inv.rescues += RESCUE_KIT.pack;
  saveProgress(); playSound("buy");
}
// SPEC-009: улучшение на уровень выше; не хватает монеток — звук «нет»; последний уровень — ничего
export const upgLevel = k => progress.upgrades[k] || 0;
export function buyUpgrade(k) {
  if (!Object.hasOwn(UPGRADES, k)) return;
  const u = UPGRADES[k], lv = upgLevel(k);
  if (lv >= u.prices.length) return;
  if (!spendCoins("upgrade:" + k, u.prices[lv])) { playSound("nope"); return; }
  progress.upgrades[k] = lv + 1; ui.upgSpark = { k, t0: ui.T };   // SPEC-041: искорки на карточке
  saveProgress(); playSound("buy");
}
export function setEquip(pi, kind) { progress.equip[pi] = kind; saveProgress(); redress(); }
