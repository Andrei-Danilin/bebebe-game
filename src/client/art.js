// SPEC-011: the art loader (art, artFile, artLoad, artGate, artVersion), the sprite tables (ITEM_ART, POP_ART, EMOJI_ART,
// …), the paper panels (paperUI, paperCache, paperPanel). Client module (moved out of index.html in Phase C).

import { ART_NAMES } from "./art-names.js";
import { LOOK } from "./look.js";
import { ctx, OUT, PHONE, simMode, VIEW } from "./screen.js";
import { noteArt, rr } from "./ui/draw.js";
import { cpx } from "./ui/text.js";
import { mode } from "./flow.js";

// =====================================================================
//  SPEC-020: КАРТИНКИ (assets/*.webp — их делает npm run assets из рисунков в art/)
// =====================================================================
// Каждая картинка грузится и декодируется один раз, сразу при старте. art(name) — готовая картинка или null; рисуем так:
// const img = art("logo"); if (img) ctx.drawImage(img, …); else <рисунок кодом, как раньше>. Нет папки assets/ (страница
// claude.ai) или файл не загрузился — игра работает и без картинок. Список между метками пишет scripts/assets.js.
// имя или свой путь → { img, state: "loading" | "ok" | "bad", own } (own — картинка по своему пути, в счёт загрузки не входит)
export const artImgs = new Map();
export const artCount = { ok: 0, bad: 0 };
export let artVersion = 0;                              // растёт, когда картинка готова: SPEC-021 (3D) по нему узнаёт, что пора взять текстуры
let artStarted = false;
export const artDone = () => artCount.ok + artCount.bad >= ART_NAMES.length;
function artSettle(a, ok) {
  if (a.state !== "loading") return;
  a.state = ok ? "ok" : "bad";
  if (ok) artVersion++;
  if (!a.own) { artCount[ok ? "ok" : "bad"]++; artProgress(); }
}
function artFetch(a, src, then) {
  try {
    const img = a.img = new Image();
    img.src = src;
    const done = ok => { artSettle(a, ok); if (then) then(ok); };
    if (img.decode) img.decode().then(() => done(true), () => done(false));
    else { img.onload = () => done(true); img.onerror = () => done(false); }
  } catch (e) { artSettle(a, false); if (then) then(false); }
}
// грузить начинаем, когда игра уже собрана (artGate): картинки не тормозят запуск (уровень, 3D) — экран загрузки их подождёт.
// Сначала логотип: не загрузился (нет папки assets/ — страница claude.ai) — остальные не просим, все «bad» (рисунок кодом).
// Повторный вызов ничего не делает (sim(false) зовёт его, когда страница sim становится обычной)
export function artLoad() {
  if (artStarted) return;
  artStarted = true;
  const probe = artImgs.get("logo");
  artFetch(probe, LOOK.ART.dir + "logo.webp", ok => {
    for (const [name, a] of artImgs) {
      if (a.own || a.img) continue;
      if (ok) artFetch(a, LOOK.ART.dir + name + ".webp"); else artSettle(a, false);
    }
  });
}
export const art = name => { const a = artImgs.get(name); return a && a.state === "ok" ? a.img : null; };
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
  "🤗": "ui_hug", "😴": "ui_sleep", "💤": "ui_sleep", "❗": "ui_alert", "🏁": "ui_flag", "👀": "ui_eyes", "⏱": "ui_timer", "👣": "ui_tiptoe" };
// SPEC-027: новая картинка не загрузилась — прежняя (а нет и её — рисунок кодом или эмодзи, как у всякой картинки SPEC-020)
export const ART_FALLBACK = { menu_play: "ui_play", menu_story: "ui_story", menu_character: "ui_bag", tab_progress: "star_gold" };
// первая загруженная картинка из name и его запасных (ART_FALLBACK) или null
export function artPick(name) {
  for (let n = name; n; n = ART_FALLBACK[n]) if (art(n)) return n;
  return null;
}
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
  if (artDone()) { el.remove(); return; }
  const bar = /** @type {HTMLElement} */ (el.querySelector("#loadbar i"));
  if (bar) bar.style.width = Math.round(100 * (artCount.ok + artCount.bad) / ART_NAMES.length) + "%";
}
// игра готова: ждём картинки не дольше LOOK.ART.waitMs (window.__bbReady от этого не ждёт)
export function artGate() {
  const el = document.getElementById("loading");
  if (simMode) { if (el) el.remove(); return; }  // sim (баланс, тесты): картинки не нужны, экран загрузки — тоже; sim(false) начнёт загрузку
  artLoad();
  if (!el) return;
  if (artDone()) { el.remove(); return; }
  el.classList.add("art");
  artProgress();
  setTimeout(() => el.remove(), LOOK.ART.waitMs);
}
// SPEC-027: надпись, где эмодзи из EMOJI_ART заменены картинками: картинка встаёт в ту же ширину, что заняло бы эмодзи (раскладка,
// мерки measureText и textW не меняются), остальное — обычным текстом тем же шрифтом; картинки нет — эмодзи. stroke — обводка
// надписи (label): картинки не обводятся. Все надписи UI идут через fillT / strokeT (не земля: в groundCanvas картинок не рисуем)
export const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI_ART).join("|")})\uFE0F?`, "gu");
// бумажные экраны — все, кроме самой игры (в игре HUD и кнопки телефона рисуются картинками сами, где они есть)
export const paperUI = () => mode !== "play";
// бумажная панель: кусок страницы тетради, контур, скотч на верхних углах; false — картинки нет
// бумага панели рисуется один раз в свой холст (по размеру и скруглению) — в кадре одна отрисовка без масштаба
export const paperCache = [];
function paperSheet(w, h, r) {
  for (const q of paperCache) if (q.w === w && q.h === h && q.r === r && q.view === VIEW) return q.cv;
  const img = art("menu_bg"), S = LOOK.PAPER.sheet, cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w * VIEW)); cv.height = Math.max(1, Math.ceil(h * VIEW));
  const g = cv.getContext("2d"), sw = img.naturalWidth * S[2], sh = img.naturalHeight * S[3], kk = Math.min(sw / w, sh / h);
  g.scale(VIEW, VIEW);
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); g.clip();
  g.drawImage(img, img.naturalWidth * S[0] + (sw - w * kk) / 2, img.naturalHeight * S[1] + (sh - h * kk) / 2, w * kk, h * kk, 0, 0, w, h);
  if (paperCache.length >= LOOK.PAPER.cache) paperCache.shift();
  paperCache.push({ w, h, r, view: VIEW, cv });
  return cv;
}
export function paperPanel(x, y, w, h, r) {
  if (!art("menu_bg")) return false;
  const k = PHONE ? cpx(1) : 1;
  ctx.drawImage(paperSheet(w, h, r), x, y, w, h); noteArt("menu_bg");
  rr(x, y, w, h, r); ctx.lineWidth = 3 * k; ctx.strokeStyle = OUT; ctx.stroke();
  tape(x + r * 0.7, y + r * 0.45, -0.7, k); tape(x + w - r * 0.7, y + r * 0.45, 0.7, k);
  return true;
}
export function tape(cx, cy, a, k) {
  const P = LOOK.PAPER, tw = P.tapeW * k, th = P.tapeH * k;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  ctx.fillStyle = P.tape; ctx.fillRect(-tw / 2, -th / 2, tw, th);
  ctx.lineWidth = 1.5 * k; ctx.strokeStyle = P.tapeLine; ctx.strokeRect(-tw / 2, -th / 2, tw, th);
  ctx.restore();
}

// called once by main.js, in the start order of the one-file game
export function initArt() {
  for (const name of ART_NAMES) artImgs.set(name, { img: null, state: "loading", own: false });
}
