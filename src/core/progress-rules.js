// SPEC-011 AC 2b: the progress rules — the save shape (fresh, clean, load), which worlds are open, the reward of a level.
// Core module.
import { BONUS_WORLDS, CFG, GLOVES, MAIN_WORLDS, REWARD, UPGRADES, WORLDS, levelsPerWorld, upgTop, worldDifficulty } from "./config.js";
import { clamp } from "./util.js";
import { BIG_SKINS, HATS, JACKETS, PANTS } from "./wardrobe.js";
import { SEEN_IDS } from "../story.js";
import { progress } from "./economy.js";
import { G } from "./active.js";

// ---------- Прогресс: миры (открытые уровни, звёзды), монетки, рукавицы (хранится в этом браузере) ----------
// SPEC-006: progress.worlds = { [мир из WORLDS]: { unlocked, stars: { [n]: 1..3 } } }, lastWorld — мир в меню
// (SPEC-016: шесть миров; в старом сохранении нет field/city — они приходят новыми)
// SPEC-009: won = { [n]: true } — уровни, уже выигранные хоть раз (первая победа платит всю основу, повтор — половину)
function freshWorld() { return { unlocked: 1, stars: {}, won: {} }; }
// SPEC-022: seen = { [заставка из SCENE_IDS]: true, если уже показана } — все ключи всегда есть (SPEC-029: + tutorial)
// SPEC-011: function declarations (hoisted) — economy.js builds its first progress at import, while this module may still be
// in the middle of its import cycle; everything they call is a function declaration or data of config/story/wardrobe
export function freshProgress() {
  return { worlds: Object.fromEntries(WORLDS.map(w => [w, freshWorld()])), lastWorld: WORLDS[0],
    coins: 0, inv: { mittens: 0, mega: 0, kisses: 0, rescues: 0 }, equip: ["none", "none"], owned: cleanOwned(null),
    upgrades: cleanUpgrades(null), seen: cleanSeen(null) };
}
// SPEC-022: показанные заставки из сохранения: только true у известных заставок; нет, испорчено или чужой ключ → не показана
function cleanSeen(v) {
  const ok = !!v && typeof v === "object" && !Array.isArray(v);
  return Object.fromEntries(SEEN_IDS.map(id => [id, ok && v[id] === true]));
}
// SPEC-009: уровни улучшений { fastFeet, longItems, quickHelp } — целые 0…последний; нет или испорчено → 0
function cleanUpgrades(v) {
  const out = {};
  for (const k of Object.keys(UPGRADES)) {
    const n = Math.floor(Number(v && typeof v === "object" ? v[k] : 0));
    out[k] = Number.isFinite(n) ? clamp(n, 0, upgTop(k)) : 0;
  }
  return out;
}
// SPEC-009: купленные наряды { hats, jackets, pants, big: [id] } — только id платных вещей своего списка, без повторов; испорченное → пусто
function cleanOwned(v) {
  const lists = { hats: HATS, jackets: JACKETS, pants: PANTS, big: BIG_SKINS }, out = { hats: [], jackets: [], pants: [], big: [] };
  if (!v || typeof v !== "object") return out;
  for (const [k, list] of Object.entries(lists)) if (Array.isArray(v[k])) for (const id of v[k]) {
    const it = list.find(q => q.id === id);
    if (it && it.price > 0 && !out[k].includes(id)) out[k].push(id);
  }
  return out;
}
// один мир из сохранения: испорченное → по умолчанию, уровни за пределами мира отбрасываются
function cleanWorld(v) {
  const max = levelsPerWorld(), out = freshWorld();
  if (!v || typeof v !== "object") return out;
  const u = Math.floor(Number(v.unlocked));
  if (Number.isFinite(u)) out.unlocked = clamp(u, 1, max);
  if (v.stars && typeof v.stars === "object") for (const [k, x] of Object.entries(v.stars)) {
    const n = Number(k), st = Math.floor(Number(x));
    if (Number.isInteger(n) && n >= 1 && n <= max && st > 0) out.stars[n] = Math.min(CFG.STARS_PER_LEVEL, st);
  }
  // won: только true для уровней 1…max; старые сохранения без won — уровень со звёздами считается выигранным
  if (v.won && typeof v.won === "object" && !Array.isArray(v.won)) for (const [k, x] of Object.entries(v.won)) {
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= max && x === true) out.won[n] = true;
  }
  for (const n of Object.keys(out.stars)) out.won[n] = true;
  return out;
}
// Сохранение → прогресс. Старое (до SPEC-006: unlocked и stars без миров) переезжает в Парк; если есть и worlds,
// и старые поля (старая вкладка дописала их), они сливаются с Парком: больший unlocked, лучшие звёзды уровня.
// Поля unlocked/stars из объекта убираются. Никогда не бросает.
// монетки из сохранения: целое 0…CFG.SAVE_MAX_COINS (испорченное → 0, дробное → вниз, больше — обрезается); правильное число не меняется
const wholeCoins = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(CFG.SAVE_MAX_COINS, Math.floor(n)) : 0; };
// SPEC-025 AC 3d: заряды запаса — целые 0…CFG.SAVE_MAX_CHARGES (испорченное → 0)
const wholeCharges = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(CFG.SAVE_MAX_CHARGES, Math.floor(n)) : 0; };
const INV_KEYS = Object.freeze(["mittens", "mega", "kisses", "rescues"]);
// SPEC-025 AC 3d: надетые рукавицы — два значения из none / id рукавиц; не список → обе none, чужое значение → none
const EQUIP_IDS = () => ["none", ...Object.keys(GLOVES)];
function cleanEquip(v) {
  if (!Array.isArray(v)) return ["none", "none"];
  return [0, 1].map(i => (EQUIP_IDS().includes(v[i]) ? v[i] : "none"));
}
const plainObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const wholeIn = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
// SPEC-025 AC 3 / 3d: known fields of a stored progress that fail this version's schema (type and range) → their names. loadProgress
// defaults them; the save module writes them back unchanged in a save from a newer version (its own shape of that field)
export function badProgressFields(pv) {
  if (!plainObj(pv)) return [];
  const bad = [], has = k => Object.hasOwn(pv, k);
  if (has("worlds") && !plainObj(pv.worlds)) bad.push("worlds");
  if (has("lastWorld") && typeof pv.lastWorld !== "string") bad.push("lastWorld");
  if (has("coins") && !wholeIn(pv.coins, CFG.SAVE_MAX_COINS)) bad.push("coins");
  if (has("inv") && (!plainObj(pv.inv) || INV_KEYS.some(k => Object.hasOwn(pv.inv, k) && !wholeIn(pv.inv[k], CFG.SAVE_MAX_CHARGES)))) bad.push("inv");
  if (has("equip") && !(Array.isArray(pv.equip) && pv.equip.length === 2 && pv.equip.every(q => EQUIP_IDS().includes(q)))) bad.push("equip");
  if (has("owned") && (!plainObj(pv.owned) || ["hats", "jackets", "pants", "big"].some(k => Object.hasOwn(pv.owned, k) && !Array.isArray(pv.owned[k])))) bad.push("owned");
  if (has("upgrades") && !plainObj(pv.upgrades)) bad.push("upgrades");
  if (has("seen") && !plainObj(pv.seen)) bad.push("seen");
  return bad;
}
export const hasFlatProgress = pv => !!pv && typeof pv === "object" && ("unlocked" in pv || "stars" in pv);
export function loadProgress(pv) {
  const p = freshProgress();
  if (!pv || typeof pv !== "object" || Array.isArray(pv)) return p;   // SPEC-025 AC 3d: the root must be a plain object
  const { unlocked, stars, worlds, lastWorld, ...rest } = pv;
  const src = worlds && typeof worlds === "object" ? worlds : {};
  const out = { ...p, ...rest, worlds: {}, lastWorld: WORLDS.includes(lastWorld) ? lastWorld : WORLDS[0],
    inv: { ...p.inv, ...(pv.inv && typeof pv.inv === "object" ? pv.inv : {}) }, equip: cleanEquip(pv.equip), owned: cleanOwned(pv.owned), upgrades: cleanUpgrades(pv.upgrades), coins: wholeCoins(pv.coins), seen: cleanSeen(pv.seen) };
  for (const w of WORLDS) out.worlds[w] = cleanWorld(src[w]);
  if (hasFlatProgress(pv)) {
    const old = cleanWorld({ unlocked, stars }), park = out.worlds[WORLDS[0]];
    park.unlocked = Math.max(park.unlocked, old.unlocked);
    for (const [n, st] of Object.entries(old.stars)) park.stars[n] = Math.max(park.stars[n] || 0, st);
    for (const n of Object.keys(old.won)) park.won[n] = true;
  }
  // старые сохранения без поцелуев и спасалок (или испорченные) → 0; SPEC-025 AC 3d: каждый заряд — целый 0…SAVE_MAX_CHARGES
  for (const key of INV_KEYS) out.inv[key] = wholeCharges(out.inv[key]);
  if (!isOpen(out.lastWorld, out)) out.lastWorld = WORLDS[0];   // SPEC-016/030: закрытый мир → меню открывается на Парке
  return out;
}
// мир пройден: выиграны все его уровни (20-й, босс, открывается последним — значит, «20-й выигран»); p — прогресс, по умолчанию текущий
// (сохранение может быть неполным — нет мира или полей: значит, не выиграно и прогресса нет)
export const worldComplete = (w = G.world, p = progress) => { const won = p?.worlds?.[w]?.won ?? {}; for (let n = 1; n <= levelsPerWorld(); n++) if (won[n] !== true) return false; return true; };
// SPEC-016: бонусные миры открываются, когда пройдены все главные миры
export const bonusUnlocked = (p = progress) => MAIN_WORLDS.every(w => worldComplete(w, p));
// в мире есть прогресс: открыт дальше 1-го уровня или есть победа/звёзды
const worldHasProgress = (w, p = progress) => { const v = p?.worlds?.[w]; return !!v && (v.unlocked > 1 || Object.keys(v.won ?? {}).length > 0 || Object.keys(v.stars ?? {}).length > 0); };
// SPEC-030 (решение Андрея): единственное место, где решается «мир открыт». Главные — по порядку: Парк сразу («start»), следующий —
// когда пройден предыдущий («previous»); бонусные — когда пройдены все главные («bonus»); мир, где уже есть прогресс, открыт всегда
// («played»: старые сохранения времён «все миры открыты» ничего не теряют); иначе «locked» и needs — что пройти: главный мир перед
// ним или null (бонусный — все главные; неизвестный мир). Сюда же — другая причина (и что для неё нужно), если появится
export function worldOpen(world, p = progress) {
  const i = MAIN_WORLDS.indexOf(world);
  if (i === 0) return { open: true, reason: "start" };
  if (i > 0 && worldComplete(MAIN_WORLDS[i - 1], p)) return { open: true, reason: "previous" };
  if (BONUS_WORLDS.includes(world) && bonusUnlocked(p)) return { open: true, reason: "bonus" };
  if (WORLDS.includes(world) && worldHasProgress(world, p)) return { open: true, reason: "played" };
  return { open: false, reason: "locked", needs: i > 0 ? MAIN_WORLDS[i - 1] : null };
}
export const isOpen = (w, p = progress) => worldOpen(w, p).open;
export const worldProgress = (w = G.world) => progress.worlds[w];
// SPEC-009: основа награды уровня n мира (SPEC-016: по индексу сложности мира, 0–4)
const rewardBase = (world, n) => REWARD.BASE + REWARD.PER_LEVEL * n + REWARD.PER_WORLD * worldDifficulty(world);
// SPEC-026: строка победы × REWARD.WIN_SCALE и округление (toFixed убирает хвост дробей: 45 × 0,7 = 31,4999… → 31,5 → 32)
const winScale = v => Math.round(Number((v * REWARD.WIN_SCALE).toFixed(6)));
// время третьей звезды уровня n мира (сек); его же берёт отчёт баланса (scripts/balance.js)
export const fastTarget = (world, n) => CFG.FAST_TIME(n) + worldDifficulty(world) * CFG.FAST_PER_WORLD;
// Награда (SPEC-009). Строки по порядку экрана победы: первая победа / повтор, новые звёзды, бонусные звёздочки, обнимашки, отдых.
// SPEC-012 AC 6: чистая — computeReward(p, result): прогресс p (не меняется) и итог уровня (levelResult в rules.js) →
// { reward — награда (клиент хранит её как lastReward), lines — строки в книгу (addCoins по порядку; кроме звёздочек — они уже в
// копилке с подбора; нулевых нет), world — что победа меняет в мире { name, n, stars, unlocked } (или null) }. Клиент применяет
// её (flow.js payLevel). Числа те же, что раньше у payReward
export function computeReward(p, result) {
  const st = result.stats, starCoins = st.starCoins;        // монетки за звёздочки уже в копилке (начислены при подборе)
  const partsOf = list => list.filter(([, a]) => a !== 0).map(([reason, amount]) => ({ reason, amount }));
  const hugs = st.playerHugs * REWARD.PER_HUG;
  if (!result.win) {
    const lines = partsOf([["hugs", hugs]]);
    return { reward: { win: false, coins: hugs + starCoins, starCoins, parts: partsOf([["hugs", hugs], ["star", starCoins]]) }, lines, world: null };
  }
  const q = structuredClone(p), w = result.world, n = result.n, wp = q.worlds[w];
  const nobodyOut = result.nobodyOut, target = fastTarget(w, n), fast = result.fast;
  const stars = 1 + (nobodyOut ? 1 : 0) + (fast ? 1 : 0);
  const first = !wp.won[n], base = rewardBase(w, n);
  const min = first ? REWARD.FIRST_MIN : REWARD.REPLAY_MIN;
  const line = Math.max(winScale(first ? base : Math.floor(base / 2)), min);   // повтор — половина основы; SPEC-026: × WIN_SCALE
  const restCut = Math.min(st.rests * CFG.COINS_PER_REST, line - min);   // отдых срезается до пола: строки всегда сходятся с итогом
  const prevStars = wp.stars[n] || 0, newStars = Math.max(0, stars - prevStars), bonusBefore = bonusUnlocked(q), openBefore = MAIN_WORLDS.filter(x => isOpen(x, q));
  const parts = partsOf([[first ? "firstWin" : "replay", line], ["newStars", winScale(newStars * REWARD.NEW_STAR)], ["star", starCoins], ["hugs", hugs], ["rests", -restCut]]);
  wp.stars[n] = Math.max(prevStars, stars);
  wp.won[n] = true;
  wp.unlocked = Math.max(wp.unlocked, Math.min(levelsPerWorld(), n + 1));   // только в этом мире
  q.lastWorld = w;
  const reward = { win: true, coins: parts.reduce((s2, x) => s2 + x.amount, 0), starCoins, stars, nobodyOut, fast, target, first, base, newStars,
    newBest: stars > prevStars, world: w, level: n, worldDone: n >= levelsPerWorld(), parts,
    bonusUnlocked: !bonusBefore && bonusUnlocked(q),   // SPEC-016: эта победа открыла бонусные миры — сказать один раз
    worldOpened: MAIN_WORLDS.find(x => !openBefore.includes(x) && isOpen(x, q)) ?? null };   // SPEC-030: эта победа открыла следующий главный мир
  return { reward, lines: parts.filter(x => x.reason !== "star"), world: { name: w, n, stars: wp.stars[n], unlocked: wp.unlocked } };
}
