// SPEC-011: the art loader (art, artFile, artLoad, artGate, artVersion), the sprite tables (ITEM_ART, POP_ART, EMOJI_ART,
// …), the paper panels (paperUI, paperCache, paperPanel). Client module (moved out of index.html in Phase C).

import { ART_NAMES, ART_RESIDENT } from "./art-names.js";
import { CFG } from "../core/config.js";
import { LOOK } from "./look.js";
import { simMode } from "./screen.js";

// =====================================================================
//  SPEC-020: КАРТИНКИ (assets/*.webp — их делает npm run assets из рисунков в art/)
// =====================================================================
// Постоянные картинки (ART_RESIDENT: HUD, кнопки, значки, вещи, эффекты, бумага, логотип) грузятся и декодируются один раз при старте.
// SPEC-040 AC 1: остальные (комиксы, обучение, фоны карт, гардероб, домики) — когда экран впервые их рисует (art(name) просит файл и пока
// отдаёт null — вызывающий рисует кодом) и отпускаются, когда их не рисовали LOOK.ART.releaseMs (artSweep): в памяти только то, что на
// экране. Фон карты текущего мира держит main.js (artKeep). art(name) — готовая картинка или null; рисуем так:
// const img = art("logo"); if (img) ctx.drawImage(img, …); else <рисунок кодом, как раньше>. Нет папки assets/ (страница
// claude.ai) или файл не загрузился — игра работает и без картинок. Список между метками пишет scripts/assets.js.
// имя или свой путь → { img, state: "idle" | "loading" | "ok" | "bad", own, lazy, seen } (own — картинка по своему пути, в счёт загрузки не
// входит; lazy — не постоянная: idle, пока не попросили; seen — когда её просили в последний раз)
export const artImgs = new Map();
export const artCount = { ok: 0, bad: 0 };            // постоянные: готовы / не загрузились
const RESIDENT = new Set(ART_RESIDENT);
const lazyOk = new Set();                              // имена не постоянных картинок, что сейчас в памяти
let lazyLoading = 0, lazyBad = 0;                      // не постоянные: загружаются (artInfo.pending) / не загрузились
export const artLazy = () => ({ loaded: lazyOk.size, loading: lazyLoading, bad: lazyBad });
// decoded memory of the pictures in memory now (RGBA: width × height × 4; own pictures too), for __bb.artInfo and the perf overlay — does not ask for any
export function artBytes() {
  let n = 0;
  for (const a of artImgs.values()) if (a.state === "ok" && a.img) n += a.img.naturalWidth * a.img.naturalHeight * 4;
  return n;
}
export let artVersion = 0;                              // растёт, когда картинка готова: SPEC-021 (3D) по нему узнаёт, что пора взять текстуры
let artStarted = false, artRoot = "pending";            // artRoot: логотип (проба) сказал, есть ли папка assets/: "pending" | "ok" | "bad"
// экран загрузки ждёт только постоянные картинки; artInfo.done — и тех, что экран попросил и ещё грузятся
const residentDone = () => artCount.ok + artCount.bad >= ART_RESIDENT.length;
export const artDone = () => residentDone() && lazyLoading === 0;
function artSettle(a, ok, name) {
  if (a.state !== "loading") return;
  a.state = ok ? "ok" : "bad";
  if (ok) { artVersion++; a.okAt = performance.now(); }
  if (a.lazy) { lazyLoading--; if (ok) lazyOk.add(name); else { a.img = null; lazyBad++; a.failedAt = performance.now(); } }
  else if (!a.own) { artCount[ok ? "ok" : "bad"]++; artProgress(); }
}
function artFetch(a, src, then, name) {
  try {
    const img = a.img = new Image();
    img.src = src;
    const done = ok => { artSettle(a, ok, name); if (then) then(ok); };
    if (img.decode) img.decode().then(() => done(true), () => done(false));
    else { img.onload = () => done(true); img.onerror = () => done(false); }
  } catch (e) { artSettle(a, false, name); if (then) then(false); }
}
// грузить начинаем, когда игра уже собрана (artGate): картинки не тормозят запуск (уровень, 3D) — экран загрузки их подождёт.
// Сначала логотип: не загрузился (нет папки assets/ — страница claude.ai) — остальные не просим, все «bad» (рисунок кодом).
// Повторный вызов ничего не делает (sim(false) зовёт его, когда страница sim становится обычной)
export function artLoad() {
  if (artStarted) return;
  artStarted = true;
  const probe = artImgs.get("logo");
  artFetch(probe, LOOK.ART.dir + "logo.webp", ok => {
    artRoot = ok ? "ok" : "bad";
    for (const [name, a] of artImgs) {
      if (a.own || a.lazy || a.img) continue;
      if (ok) artFetch(a, LOOK.ART.dir + name + ".webp"); else artSettle(a, false, name);
    }
  }, "logo");
}
export function art(name) {
  const a = artImgs.get(name);
  if (!a) return null;
  if (a.state === "ok") { if (a.lazy) a.seen = performance.now(); return a.img; }
  // SPEC-040: a lazy picture that failed (a dropped connection) is asked for again after LOOK.ART.retryMs, not on every frame
  if (a.state === "bad" && a.lazy && artRoot === "ok" && performance.now() - (a.failedAt || 0) > LOOK.ART.retryMs) { lazyBad--; a.state = "idle"; }
  if (a.state === "idle") artRequest(a, name);
  return null;
}
// SPEC-044: the picture is known to be missing (the assets folder is not there, or its file failed to load — even while it is asked for again), not just still loading
export function artFailed(name) {
  const a = artImgs.get(name);
  return !a || a.state === "bad" || (!!a.failedAt && a.state !== "ok");
}
// SPEC-048 AC 1: every picture of the list is in memory or known to be missing (a failed picture never blocks: the screen draws its fallback)
export function artReady(names) {
  for (const n of names) {
    const a = artImgs.get(n);
    if (!a || a.state === "ok" || artRoot === "bad" || artFailed(n)) continue;
    return false;
  }
  return true;
}
// SPEC-048 AC 1: starts loading the pictures of the next screen and keeps them (main.js asks every frame, so artSweep, which releases what was not
// asked for, never takes them while the screen they are for is on the way)
export function artPrefetch(names) { for (const n of names) art(n); }
// SPEC-048 AC 3: a picture the screen change stopped waiting for (ART_WAIT ran out) fades in over LOOK.ART_FADE s when it arrives (artFade: 0…1)
let lateN = 0;
function lateOff(a) { if (a.late) { a.late = false; lateN--; } }
export function artLate(names) {
  for (const n of names) { const a = artImgs.get(n); if (a && a.state !== "ok" && !a.late && !artFailed(n)) { a.late = true; lateN++; } }
}
export function artFade(name) {
  if (!lateN) return 1;
  const a = artImgs.get(name);
  if (!a || !a.late || a.state !== "ok") return 1;
  const k = (performance.now() - a.okAt) / (LOOK.ART_FADE * 1000);
  if (k >= 1) { lateOff(a); return 1; }
  return Math.max(0, k);
}
export const artLateCount = () => lateN;
// не постоянная картинка: попросили — грузим (не раньше старта загрузки и ответа пробы; нет папки assets/ — «bad», рисунок кодом)
function artRequest(a, name) {
  a.seen = performance.now();
  if (!artStarted || artRoot === "pending") return;
  if (artRoot === "bad") { a.state = "bad"; lazyBad++; return; }
  a.state = "loading"; lazyLoading++;
  artFetch(a, LOOK.ART.dir + name + ".webp", null, name);
}
// фон карты текущего мира и всё, что надо держать на виду: просим картинку, не рисуя её (main.js, каждый кадр)
export const artKeep = name => { art(name); };
// SPEC-040 AC 1: отпустить не постоянные картинки, которых не просили дольше LOOK.ART.releaseMs (main.js, каждый кадр; проверка не чаще
// LOOK.ART.sweepMs). Картинка снова idle: её просят заново, когда экран вернётся (пока — рисунок кодом)
let lastSweep = 0;
export function artSweep(now = performance.now()) {
  if (now - lastSweep < LOOK.ART.sweepMs || !lazyOk.size) return;
  lastSweep = now;
  for (const name of [...lazyOk]) {
    const a = artImgs.get(name);
    if (now - a.seen < LOOK.ART.releaseMs) continue;
    lazyOk.delete(name); insetCache.delete(name);
    a.img = null; a.state = "idle"; lateOff(a);
  }
}
// SPEC-032 AC 6: прозрачные поля картинки (доли её ширины / высоты): l, r — по средней трети строк, t, b — по средней трети столбцов
// (видимый край нарисованной наклейки, не прозрачное поле вокруг); меряется один раз на картинку; нет картинки — нули
const insetCache = new Map();
export function artInset(name) {
  const img = art(name);
  if (!img) return { l: 0, r: 0, t: 0, b: 0 };
  if (insetCache.get(name)?.img === img) return insetCache.get(name).v;
  const W = img.naturalWidth, H = img.naturalHeight, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  let v = { l: 0, r: 0, t: 0, b: 0 };
  try {
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data, A = LOOK.PAPER.insetAlpha;
    let l = W, r = -1, t = H, b = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] <= A) continue;
      if (y > H / 3 && y < 2 * H / 3) { l = Math.min(l, x); r = Math.max(r, x); }
      if (x > W / 3 && x < 2 * W / 3) { t = Math.min(t, y); b = Math.max(b, y); }
    }
    if (r >= l && b >= t) v = { l: l / W, r: (W - 1 - r) / W, t: t / H, b: (H - 1 - b) / H };
  } catch (e) { /* холст недоступен (file://) — поля не известны */ }
  insetCache.set(name, { img, v });
  return v;
}
// картинка по своему пути (глава истории с c.image): грузится один раз при первом запросе, той же таблицей
export function artFile(path) {
  let a = artImgs.get(path);
  if (!a) { a = { img: null, state: "loading", own: true }; artImgs.set(path, a); artFetch(a, path); }
  return a.state === "ok" ? a.img : null;
}
// ---------- имена картинок: все таблицы «что → какая картинка» в одном месте (тест: каждое имя есть в ART_NAMES) ----------
// цвет кнопки → бумажная кнопка 13_interface (цвета — роли из LOOK.MENU_LOOK, см. комментарий там); других цветов — рисунок кодом
export const PAPER_BTN = (() => {
  const M = LOOK.MENU_LOOK;
  return { [M.play]: "btn_green", [M.ok]: "btn_green", [M.storyBtn]: "btn_pink", [M.shop]: "btn_orange", [M.back]: "btn_grey", [M.icon]: "btn_grey", [M.nav]: "btn_grey",
    [M.dice]: "btn_orange", [M.map.ring]: "btn_pink", [LOOK.PAPER.offBtn]: "btn_grey" };
})();
// вещи (магазин, главный экран, HUD) — v1/staff и 12_icons
export const ITEM_ART = { mittens: "item_mittens", mega: "item_mega_mittens", kisses: "item_kiss", rescues: "icon_bandaid" };
// улучшения и вкладки магазина — 22_icons_shop
export const UPG_ART = { fastFeet: "shop_fast_feet", longItems: "shop_long_items", quickHelp: "shop_quick_help" };
export const SHOP_TAB_ART = { progress: "tab_progress", items: "shop_items", wardrobe: "shop_wardrobe", upgrades: "shop_upgrades" };   // SPEC-026: + «Прогресс» (SPEC-027: свой значок)
// рисунки вещей гардероба: 23_wardrobe и (SPEC-027) 29_wardrobe_2 — у каждой шапки (кроме «Ничего»), куртки и штанов есть свой
export const WARDROBE_ART = {
  hat: { cap: "hat_cap", beanie: "hat_beanie", crown: "hat_crown", bow: "hat_bow", flower: "hat_flower", ears: "hat_ears", tophat: "hat_tophat",
    viking: "hat_viking", pirate: "hat_pirate", glasses: "hat_glasses", headband: "hat_ninja" },
  jacket: { hoodie: "jacket_hoodie", tshirt: "jacket_tshirt", stripes: "jacket_orange_stripes", purple: "jacket_purple_zip", pinkhoodie: "jacket_pink_hoodie",
    cape: "jacket_hero_cape", ninja: "jacket_ninja", sailor: "jacket_sailor", raincoat: "jacket_raincoat", teal: "jacket_teal_zip",
    bluezip: "jacket_blue_zip", redzip: "jacket_red_zip", rainbow: "jacket_stripes", magiccape: "jacket_cape", trench: "jacket_trench" },
  pants: { jeans: "pants_jeans", shorts: "pants_shorts", joggers: "pants_joggers", black: "pants_black", red: "pants_red", green: "pants_green",
    pinkshorts: "pants_pink_shorts", purple: "pants_purple", overalls: "pants_overalls", striped: "pants_striped" }
};
// SPEC-027: эмодзи в надписях → картинка (34_small_icons и уже нарисованные). fillT / strokeT рисуют её на месте эмодзи, нет картинки — эмодзи
export const EMOJI_ART = { "👥": "ui_friends", "🎲": "ui_dice", "❓": "ui_question", "✏": "ui_pencil", "📦": "ui_pack", "👂": "ui_ear", "🗺": "ui_map",
  "✔": "ui_check", "✘": "ui_cross", "✕": "ui_cross", "🔒": "padlock", "🩹": "icon_bandaid", "💋": "item_kiss", "⭐": "star_gold", "🪙": "item_coin",
  "📖": "menu_story", "🏆": "tab_progress", "🎒": "menu_character", "🏠": "ui_home", "👕": "shop_wardrobe",
  "🛡": "icon_shield", "🍌": "item_banana", "👟": "item_boots", "👻": "item_cape", "❤": "heart_full", "🤝": "shop_quick_help",
  // SPEC-032 AC 18: emoji still drawn as text → art we already had; AC 19: the new sheet 35_icons_more (ui_hug … ui_tiptoe)
  "🎁": "ui_gift", "🌐": "ui_globe", "🔊": "ui_sound_on", "🔇": "ui_sound_off", "⛶": "ui_fullscreen", "✨": "fx_sparkle", "🎉": "fx_confetti",
  "💗": "fx_hearts", "💫": "fx_dizzy", "💦": "fx_steam_left", "🔁": "round_restart",
  "🌳": "world_park", "⚽": "world_field", "🏙": "world_city", "🏫": "world_school", "🏖": "world_beach", "❄": "world_winter",
  "🍉": "item_watermelon", "🧁": "icon_cupcake", "✈": "item_paperplane", "🧊": "item_snowball",   // SPEC-043: Dad's marks and the tip card (⚽ and ❄ stay the Field's and Winter's world icons above: a frozen Dad shows 🧊)
  "🤗": "ui_hug", "😴": "ui_sleep", "💤": "ui_sleep", "❗": "ui_alert", "🏁": "ui_flag", "👀": "ui_eyes", "⏱": "ui_timer", "👣": "ui_tiptoe" };
// SPEC-027: новая картинка не загрузилась — прежняя (а нет и её — рисунок кодом или эмодзи, как у всякой картинки SPEC-020)
export const ART_FALLBACK = { menu_play: "ui_play", menu_story: "ui_story", menu_character: "ui_bag", tab_progress: "star_gold" };
// первая загруженная картинка из name и его запасных (ART_FALLBACK) или null
export function artPick(name) {
  for (let n = name; n; n = ART_FALLBACK[n]) if (art(n)) return n;
  return null;
}
// SPEC-042 AC 11 / 13: the "New here!" card — which sheet and panel of it shows each world's trick (40: Park, Field, City, School; 41: Beach, Winter; the panels'
// fractions are LOOK.TIP_LOOK.panels), the trick icons and the world items' icons (sheet 37 and the older ones), and their emoji for when the art is missing
export const TIP_ART = { park: ["tips_main", 0], field: ["tips_main", 1], city: ["tips_main", 2], school: ["tips_main", 3], beach: ["tips_bonus", 0], winter: ["tips_bonus", 1] };
export const TRICK_ICON = { puddles: "ui_puddle", sprinklers: "ui_sprinkler", truck: "ui_truck", bell: "ui_bell", waves: "ui_wave", footprints: "ui_snowprints" };
export const TRICK_EMOJI = { puddles: "💦", sprinklers: "🚿", truck: "🍦", bell: "🔔", waves: "🌊", footprints: "👣" };
// SPEC-043: the one table of the world items' pictures — item → [icon of sheet 37 (or the older one), emoji]; a world's item is CFG.WORLD_ITEM[world]
export const WORLD_ITEM_ART = { banana: ["item_banana", "🍌"], football: ["item_football", "⚽"], cupcake: ["icon_cupcake", "🧁"], plane: ["item_paperplane", "✈️"], watermelon: ["item_watermelon", "🍉"], snowball: ["item_snowball", "❄️"] };
export const itemIcon = world => (WORLD_ITEM_ART[CFG.WORLD_ITEM[world]] || WORLD_ITEM_ART.banana)[0];
export const itemEmoji = world => (WORLD_ITEM_ART[CFG.WORLD_ITEM[world]] || WORLD_ITEM_ART.banana)[1];
// комиксы глав (8_start, 9_1…9_4, 26_1/26_2, 10_end)
export const STORY_ART = { began: "story_start", park: "story_park", field: "story_field", city: "story_city", school: "story_school",
  beach: "story_beach", winter: "story_winter", ended: "story_end" };
// сердечко Большого по заполнению (0 пустое, 1 половинка — бледное облачко, 2 целое) — 13_interface
export const HEART_ART = ["cloud_heart_empty", "cloud_heart_half", "cloud_heart_full"];
// частицы burst(kind) и взрыв под всплывающей надписью popText(…, meaning) — 24_effects, v1/staff
export const FX_ART = { heart: "heart_full", star: "fx_sparkle", dust: "fx_dust" };
export const POP_ART = { bang: "fx_burst_red", hug: "fx_burst_pink", mega: "fx_burst_yellow", kiss: "fx_burst_pink", out: "fx_burst_yellow", whoosh: "fx_burst_yellow" };
// мир → значок (20_levelmap_parts) и страница карты (18_map_bg_*)
export const worldArt = w => "world_" + w, mapBgArt = w => "map_bg_" + w;
// экран загрузки: полоска — доля готовых картинок; убираем, когда всё готово (или по таймеру из artGate)
function artProgress() {
  const el = document.getElementById("loading");
  if (!el || !el.classList.contains("art")) return;
  if (residentDone()) { el.remove(); return; }
  const bar = /** @type {HTMLElement} */ (el.querySelector("#loadbar i"));
  if (bar) bar.style.width = Math.round(100 * (artCount.ok + artCount.bad) / ART_RESIDENT.length) + "%";
}
// игра готова: ждём картинки не дольше LOOK.ART.waitMs (window.__bbReady от этого не ждёт)
export function artGate() {
  const el = document.getElementById("loading");
  if (simMode) { if (el) el.remove(); return; }  // sim (баланс, тесты): картинки не нужны, экран загрузки — тоже; sim(false) начнёт загрузку
  artLoad();
  if (!el) return;
  if (residentDone()) { el.remove(); return; }
  el.classList.add("art");
  artProgress();
  setTimeout(() => el.remove(), LOOK.ART.waitMs);
}
// SPEC-027: надпись, где эмодзи из EMOJI_ART заменены картинками: картинка встаёт в ту же ширину, что заняло бы эмодзи (раскладка,
// мерки measureText и textW не меняются), остальное — обычным текстом тем же шрифтом; картинки нет — эмодзи. stroke — обводка
// надписи (label): картинки не обводятся. Все надписи UI идут через fillT / strokeT (не земля: в groundCanvas картинок не рисуем)
export const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI_ART).join("|")})\uFE0F?`, "gu");
// called once by main.js, in the start order of the one-file game
export function initArt() {
  for (const name of ART_NAMES) { const lazy = !RESIDENT.has(name); artImgs.set(name, { img: null, state: lazy ? "idle" : "loading", own: false, lazy, seen: 0 }); }
}
