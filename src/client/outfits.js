// SPEC-011: the wardrobe state and looks: makeLook, BOSS_LOOKS, skinSel/skinKeep, try-on (tryingOn, endTryOn), buyLook,
// adoptWorn, fitOutfitsToOwned, botOutfit. Client module (moved out of index.html in Phase C).

import { progress, saveProgress, spendCoins } from "../core/economy.js";
import { level, numPlayers } from "../core/game.js";
import { clamp, vrand } from "../core/util.js";
import { BIG_SKINS, HAIRS, HATS, JACKETS, PANTS, SLOTS } from "../core/wardrobe.js";
import { resetWorld } from "./flow.js";
import { writeOutfits } from "./progress.js";
import { SFX } from "./sound.js";

export const P_COLORS = ["#3b82f6", "#22c55e"];        // цвет меток игрока 1 и 2
export function makeLook(o) {
  const h = HAIRS[o.hair], hat = HATS[o.hat], j = JACKETS[o.jacket], pn = PANTS[o.pants];
  return { skin: h.skin, hair: h.hair, style: h.style, acc: hat.id, shirt: j.color, pattern: j.pattern, trim: j.trim, pants: pn.color, shorts: pn.shorts,
    bands: j.bands || null, long: !!j.long, overalls: !!pn.overalls, pantStripes: pn.stripes || null };   // SPEC-027: радуга, полы плаща, комбинезон, полоски
}
// SPEC-022: образы боссов (Андрей: свой образ у каждого; вид придумал Claude по art/4_papas_bosses, 4_papas_bosses_new,
// 5_papas_main_boss). Строятся на папе (образ "dad", точки m.anchors и свои материалы m.mats): цвета футболки, штанов, обуви
// (legs: "skin" — голые ноги, шорты отдельной деталью) и список деталей (BOSS_PARTS); крупнее на LOOK.BOSS_SCALE (bossScale).
// Босс уровня носит свой образ, какой бы образ Большого ни выбрали в гардеробе
export const BOSS_LOOKS = Object.freeze({
  park: { shirt: "#d7322f", pants: "#c62828", shoes: "#f1f5f9", trim: "#ffffff", parts: ["tracksuit", "whistle"] },          // красный спортивный костюм, свисток
  field: { shirt: "#f8fafc", legs: "skin", shoes: "#1e3a8a", trim: "#2563eb", parts: ["kit", "whistle", "ball"] },             // белая форма, синие шорты, гетры со щитками, мяч
  city: { shirt: "#4d8b3a", pants: "#3b6db5", shoes: "#7c5a33", trim: "#facc15", parts: ["hardhat", "vest", "cone"] },          // оранжевая каска, жилет, конус
  school: { shirt: "#eb3e42", pants: "#3b6db5", shoes: "#5b3a29", trim: "#f8fafc", parts: ["overshirt", "tie", "bag"] }        // рубашка в пятнах поверх футболки, галстук, сумка
});
// SPEC-009: skinSel — что показано (на экране нарядов можно примерить купленное и ещё не купленное), skinKeep — последний
// свой вид (только купленное или бесплатное): его сохраняет bebebe-outfits (форма — индексы, как раньше) и с ним начинается игра
const DEFAULT_SKINS = { p1: { hair: 0, hat: 1, jacket: 0, pants: 0 }, p2: { hair: 1, hat: 4, jacket: 1, pants: 3 }, big: BIG_SKINS.findIndex(q => q.id === "dad") };   // SPEC-021: папа
export const cloneSkins = o => ({ p1: { ...o.p1 }, p2: { ...o.p2 }, big: o.big });
// SPEC-021: v — версия формы bebebe-outfits (пишем OUTFITS_V). В сохранении без неё или с v < DAD_SINCE_V (до SPEC-021) big: 0 —
// почти всегда «не выбирал» (Классика была образом по умолчанию), поэтому такой Большой становится папой (решение координатора,
// BACKLOG: проверить с Андреем); другие номера остаются. Классика, выбранная после этого, сохраняется с v и остаётся Классикой.
const OUTFITS_V = 2, DAD_SINCE_V = 2;
// чистая функция «сохранение → наряды» (то же при запуске; тесты проверяют формы через __bb.loadOutfits); никогда не бросает
export function loadOutfits(sv) {
  const out = cloneSkins(DEFAULT_SKINS);
  if (!sv || typeof sv !== "object" || !sv.p1 || !sv.p2) return out;
  for (const pk of ["p1", "p2"]) for (const k of Object.keys(SLOTS)) out[pk][k] = clamp((typeof sv[pk] === "object" ? sv[pk][k] : 0) | 0, 0, SLOTS[k].length - 1);
  const big = Number(sv.big) || 0;
  out.big = (Number(sv.v) || 0) < DAD_SINCE_V && big === 0 ? DEFAULT_SKINS.big : clamp(big | 0, 0, BIG_SKINS.length - 1);
  return out;
}
export let skinSel = cloneSkins(DEFAULT_SKINS);   // из bebebe-outfits — initSaves
export let skinKeep = cloneSkins(skinSel);
const saveSkins = () => writeOutfits({ ...skinKeep, v: OUTFITS_V });   // хранилище — progress.js
// гардероб (SPEC-009): купленное — в progress.owned по id; ключ списка для слота; бесплатное (price 0, причёски) — всегда своё
const OWN_KEY = { hat: "hats", jacket: "jackets", pants: "pants", big: "big" };
export const LOOK_SLOTS = ["hat", "jacket", "pants"];   // платные слоты маленьких (причёски бесплатные)
export const ownsItem = (slot, idx) => {
  const it = slot === "big" ? BIG_SKINS[idx] : SLOTS[slot][idx];
  return !it.price || progress.owned[OWN_KEY[slot]].includes(it.id);
};
let tryingOn = false;  // на экране нарядов примерено некупленное (skinSel ≠ skinKeep)
const updateTryOn = () => { tryingOn = ["p1", "p2", "big"].some(k => lockedItems(k).length > 0); };
export let buyArmed = null;   // колонка («p1» | «p2» | «big»), где кнопку «Купить» уже нажали раз: второе нажатие покупает
// примеренные некупленные вещи колонки: [{ slot, idx, id, price }]
export function lockedItems(key) {
  const pick = (slot, idx) => { const it = slot === "big" ? BIG_SKINS[idx] : SLOTS[slot][idx]; return { slot, idx, id: it.id, price: it.price }; };
  if (key === "big") return ownsItem("big", skinSel.big) ? [] : [pick("big", skinSel.big)];
  return LOOK_SLOTS.filter(sl => !ownsItem(sl, skinSel[key][sl])).map(sl => pick(sl, skinSel[key][sl]));
}
export const lockedPrice = key => lockedItems(key).reduce((a, it) => a + it.price, 0);
export function cycleOutfit(pk, slot, d) {
  const n = SLOTS[slot].length;
  skinSel[pk][slot] = (skinSel[pk][slot] + d + n) % n;
  if (ownsItem(slot, skinSel[pk][slot])) skinKeep[pk][slot] = skinSel[pk][slot];   // своё — сразу запоминается; чужое — только примерка
  buyArmed = null; updateTryOn(); saveSkins(); resetWorld(numPlayers);
}
// случайный вид — только из своего
export function randomOutfit(pk) {
  for (const k of Object.keys(SLOTS)) {
    const mine = SLOTS[k].map((_, i) => i).filter(i => ownsItem(k, i));
    skinSel[pk][k] = skinKeep[pk][k] = mine[Math.floor(vrand() * mine.length)];
  }
  buyArmed = null; updateTryOn(); saveSkins(); resetWorld(numPlayers);
}
export function cycleBig(d) {
  skinSel.big = (skinSel.big + d + BIG_SKINS.length) % BIG_SKINS.length;
  if (ownsItem("big", skinSel.big)) skinKeep.big = skinSel.big;
  buyArmed = null; updateTryOn(); saveSkins(); resetWorld(numPlayers);
}
// кнопка «Купить N» колонки: не хватает монеток — звук «нет»; первое нажатие только спрашивает, второе покупает всё примеренное
export function buyLook(key) {
  const items = lockedItems(key), total = lockedPrice(key);
  if (!items.length) return;
  if (progress.coins < total) { buyArmed = null; SFX.out(); return; }
  if (buyArmed !== key) { buyArmed = key; return; }
  buyArmed = null;
  for (const it of items) if (spendCoins(it.slot + ":" + it.id, it.price)) progress.owned[OWN_KEY[it.slot]].push(it.id);
  for (const it of items) if (ownsItem(it.slot, it.idx)) { if (key === "big") skinKeep.big = it.idx; else skinKeep[key][it.slot] = it.idx; }
  updateTryOn(); saveProgress(); saveSkins(); SFX.item();
}
// конец примерки (ушли с экрана нарядов, началась игра): снова последний свой вид. true — что-то поменялось
export function endTryOn() {
  buyArmed = null;
  if (!tryingOn) return false;
  skinSel = cloneSkins(skinKeep); tryingOn = false;
  return true;
}
// некупленное (после сброса прогресса) → стартовый вид этого слота
export function fitOutfitsToOwned() {
  for (const pk of ["p1", "p2"]) for (const sl of LOOK_SLOTS) if (!ownsItem(sl, skinKeep[pk][sl])) skinKeep[pk][sl] = DEFAULT_SKINS[pk][sl];
  if (!ownsItem("big", skinKeep.big)) skinKeep.big = DEFAULT_SKINS.big;
  skinSel = cloneSkins(skinKeep); buyArmed = null; tryingOn = false; saveSkins();
}
// для тестов: стартовые виды, ничего не примерено
export function resetOutfits() { skinSel = cloneSkins(DEFAULT_SKINS); skinKeep = cloneSkins(DEFAULT_SKINS); buyArmed = null; tryingOn = false; saveSkins(); resetWorld(numPlayers); }

export const botOutfit = i => ({ hair: (i * 3 + level) % HAIRS.length, hat: (i * 5 + level * 2 + 1) % HATS.length, jacket: (i * 3 + 2 + level) % JACKETS.length, pants: (i * 2 + level) % PANTS.length });
// SPEC-009: надетое в bebebe-outfits становится своим — только для сохранений без owned (до SPEC-009 всё было бесплатно), один раз
export function adoptWorn() {
  let changed = false;
  const own = (slot, idx) => { if (!ownsItem(slot, idx)) { progress.owned[OWN_KEY[slot]].push((slot === "big" ? BIG_SKINS[idx] : SLOTS[slot][idx]).id); changed = true; } };
  for (const pk of ["p1", "p2"]) for (const sl of LOOK_SLOTS) own(sl, skinSel[pk][sl]);
  own("big", skinSel.big);
  if (changed) saveProgress();
}

// setters (SPEC-011 AC 5: other modules change this module's state only through them)
export function setSkinSel(v) { skinSel = v; }
export function setSkinKeep(v) { skinKeep = v; }
