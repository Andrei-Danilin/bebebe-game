// SPEC-011: the Character screen's buy actions: gloves, kisses, the rescue kit, upgrades (buyUpgrade, upgLevel), setEquip.
// Client module (moved out of index.html in Phase C).

import { GLOVES, KISSES, RESCUE_KIT, UPGRADES } from "../core/config.js";
import { progress, saveProgress, spendCoins } from "../core/economy.js";
import { SFX } from "./sound.js";
import { redress } from "./flow.js";

export function buyGloves(kind) {
  const g = GLOVES[kind];
  if (!spendCoins(kind, g.price)) { SFX.out(); return; }
  progress.inv[kind] += g.charges;
  if (progress.equip[0] === "none") progress.equip[0] = kind;
  saveProgress(); SFX.item();
}
export function buyKisses() {
  if (!spendCoins("kisses", KISSES.price)) { SFX.out(); return; }
  progress.inv.kisses += KISSES.pack;
  saveProgress(); SFX.item();
}
export function buyRescueKit() {
  if (!spendCoins("rescues", RESCUE_KIT.price)) { SFX.out(); return; }
  progress.inv.rescues += RESCUE_KIT.pack;
  saveProgress(); SFX.item();
}
// SPEC-009: улучшение на уровень выше; не хватает монеток — звук «нет»; последний уровень — ничего
export const upgLevel = k => progress.upgrades[k] || 0;
export function buyUpgrade(k) {
  if (!Object.hasOwn(UPGRADES, k)) return;
  const u = UPGRADES[k], lv = upgLevel(k);
  if (lv >= u.prices.length) return;
  if (!spendCoins("upgrade:" + k, u.prices[lv])) { SFX.out(); return; }
  progress.upgrades[k] = lv + 1;
  saveProgress(); SFX.item();
}
export function setEquip(pi, kind) { progress.equip[pi] = kind; saveProgress(); redress(); }
