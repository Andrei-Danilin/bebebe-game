// SPEC-011: keyboard, touch sticks, pointer buttons, the name input overlay, gamepads, tiptoe keys, deviceInput and fillInputs
// (SPEC-012: the players' input slots). Client module (moved out of index.html in Phase C).

import { CFG } from "../core/config.js";
import { L } from "../i18n.js";
import { backToWardrobe, chooseStop, closeCard, goBack, closeShop, cycleWorld, inWardrobe, mapSelN, mode, moveMapSel, nextLang, nextLevel, openStory, playCard, pressKiss, pressKit, resumeGame, retryLevel, sceneNext, scenePrev, sceneSkip, setMode, setStoryPage, storyBackKey, storyStep, switchShopTab, toggleSound, toMap, watchChapter } from "./flow.js";
import { LOOK } from "./look.js";
import { cleanName, nameFor, setName } from "./names.js";
import { randomOutfit } from "./outfits.js";
import { canvas, CSS_W, PHONE, rotateWall, UH, UW, wrap } from "./screen.js";
import { leaveCancel } from "./back.js";
import { cardOpen, moveCardFocus, pressCard } from "./errors.js";
import { initAudio } from "./sound.js";
import { ui } from "./state.js";
import { openPictures, openPractice, tutorialSkip } from "./tutorial.js";
import { homeActions } from "./ui/home.js";
import { chooseLang, moveLangSel } from "./ui/lang.js";
import { cpx } from "./ui/text.js";
import { G } from "../core/active.js";
import { newInput } from "../core/game.js";

// =====================================================================
//  УПРАВЛЕНИЕ: клавиатура, касания (джойстики), геймпад
// =====================================================================
const keys = new Set();

function onKey(code) {
  if (code === "KeyM") { toggleSound(); return; }
  if (code === "KeyL") { if (mode !== "lang") nextLang(); return; }   // SPEC-032: not under the language screen
  if (code === "Escape") { goBack(); return; }                // SPEC-025 AC 14d: the one "back" (flow.js)
  if (mode === "lang") {                                      // SPEC-032: the language screen — arrows move, Enter / Space pick
    if (code === "ArrowLeft") moveLangSel(-1);
    if (code === "ArrowRight") moveLangSel(1);
    if (code === "ArrowUp" || code === "ArrowDown") moveLangSel(2);
    if (code === "Enter" || code === "NumpadEnter" || code === "Space") chooseLang();
  } else if (mode === "home") {
    const a = homeActions().find(q => q.keys.includes(code));   // SPEC-017: Enter = «Играть», S — история, B — магазин
    if (a) a.act();
  } else if (mode === "map") {
    // SPEC-017: ←/→ — миры, ↑/↓ — остановка с кольцом, Enter — её карточка (решено в ходе работы, проверить с Андреем)
    if (code === "ArrowLeft") cycleWorld(-1);
    if (code === "ArrowRight") cycleWorld(1);
    if (code === "ArrowUp") moveMapSel(-1);
    if (code === "ArrowDown") moveMapSel(1);
    if (code === "Enter" || code === "NumpadEnter" || code === "Space") chooseStop(mapSelN());
  } else if (mode === "levelCard") {
    if (code === "Enter" || code === "NumpadEnter" || code === "Space" || code === "Digit1" || code === "Numpad1") playCard(1);
    if (code === "Digit2" || code === "Numpad2") playCard(2);
    if (code === "KeyS") openStory(G.world, "levelCard");
  } else if (mode === "story") {
    if (ui.storyPage === "chapters" && code === "ArrowLeft") storyStep(-1);
    if (ui.storyPage === "chapters" && code === "KeyV") watchChapter();   // SPEC-022: V — посмотреть заставку главы
    if (ui.storyPage === "chapters" && (code === "ArrowRight" || code === "Enter" || code === "Space")) storyStep(1);
    else if (ui.storyPage === "rules" && (code === "Enter" || code === "NumpadEnter" || code === "Space")) openPractice();   // SPEC-029/032: «Тренировка» (только игры)
    else if (ui.storyPage === "rules" && code === "KeyV") openPictures();   // SPEC-032: V — «Картинки» (как «посмотреть» у глав)
  } else if (mode === "scene") {
    // SPEC-022: заставка — Enter / пробел / → дальше, ← назад, Escape пропустить
    if (code === "ArrowLeft") scenePrev();
    else if (code === "Enter" || code === "NumpadEnter" || code === "Space" || code === "ArrowRight") sceneNext();
  } else if (mode === "shop") {
    if (code === "Enter" || code === "Space") closeShop();
    if (code === "ArrowLeft") switchShopTab(-1);
    if (code === "ArrowRight") switchShopTab(1);
    if (code === "KeyR" && inWardrobe() && ui.wardrobePage === "looks") randomOutfit("p1");
  } else if (mode === "play") {
    if (code === "KeyP") setMode("pause");
    const kp = kissKeyPlayer(code);
    if (kp >= 0) pressKiss(kp);
    const rp = kitKeyPlayer(code);
    if (rp >= 0) pressKit(rp);
  } else if (mode === "pause") {
    if (code === "KeyP") resumeGame();
    if (code === "KeyQ") (G.tutorialGame ? tutorialSkip : toMap)();   // SPEC-029: в тренировке Q — пропустить обучение
  } else if (mode === "win") {
    if (code === "Enter" || code === "Space") nextLevel();
    if (code === "KeyQ") toMap();
  } else if (mode === "lose") {
    if (code === "Enter" || code === "Space") retryLevel();
    if (code === "KeyQ") toMap();
  }
}

// Воздушный поцелуй: один игрок — E или пробел; двое — игрок 1 E, игрок 2 Enter
function kissKeyPlayer(code) {
  if (code === "KeyE") return 0;
  if (G.players === 1) return code === "Space" ? 0 : -1;
  return code === "Enter" || code === "NumpadEnter" ? 1 : -1;
}

// Спасалка 🩹 (SPEC-007): один игрок — Q; двое — игрок 1 Q, игрок 2 правый Shift
function kitKeyPlayer(code) {
  if (code === "KeyQ") return 0;
  return G.players === 2 && code === "ShiftRight" ? 1 : -1;
}

// Касания: левая половина — игрок 1, правая — игрок 2 (в игре на одного — весь экран)
export const sticks = new Map();
export const chipName = l => G.players === 1 ? L().me : String(l.id + 1);   // короткая метка игрока в кружке HUD
const STICK_R = 55;
// радиус джойстика в UI px: на телефоне — PHONE_STICK_R в CSS px (под палец), иначе как было
export const stickR = () => PHONE ? LOOK.PHONE_STICK_R * UW / CSS_W : STICK_R;
export function toGame(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * UW / rect.width, y: (e.clientY - rect.top) * UH / rect.height };
}
// SPEC-025 AC 7d: this frame's buttons belong to an older screen (a tap, key or pad press changed it since it was drawn: state.js
// screenChanged) — a pointer then does nothing until the next frame draws the screen shown now
const staleButtons = () => ui.buttonsGen !== ui.screenSeq;
const hitButton = p => ui.buttons.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
let pendingUp = null;   // кнопка, которая срабатывает на отпускании (поле имени: iOS даёт фокус только в pointerup/click)

const endStick = e => sticks.delete(e.pointerId);
// SPEC-038 AC 1: a player's stick is a stack of his pointers (the Map keeps them in the order they landed): the newest finger
// steers; lifting it falls back to the previous one; lifting an older one changes nothing; all lifted — the hero stops
export const activeStick = player => { let a = null; for (const s of sticks.values()) if (s.player === player) a = s; return a; };
export const clearSticks = () => sticks.clear();   // SPEC-038: the fingers are gone (the "turn your device" wall, a level left)
export const activeSticks = () => [0, 1].map(activeStick).filter(Boolean);

// Поле ввода имени: HTML <input> ровно поверх прямоугольника на холсте (rect в логических пикселях)
export let nameInput = null;   // { el, slot, rect }
export function placeNameInput() {
  if (!nameInput) return;
  const k = CSS_W / UW, r = nameInput.rect;
  Object.assign(nameInput.el.style, { left: r.x * k + "px", top: r.y * k + "px", width: r.w * k + "px", height: r.h * k + "px", fontSize: Math.max(LOOK.PHONE_TEXT.input, r.h * k * 0.5) + "px" });
}
export function openNameInput(rect, slot) {
  closeNameInput(true);
  const el = document.createElement("input");
  el.type = "text"; el.className = "name-input"; el.maxLength = CFG.NAME_MAX * 2; el.value = nameFor(slot);   // эмодзи — 2 знака UTF-16; cleanName режет до NAME_MAX
  el.setAttribute("enterkeyhint", "done"); el.setAttribute("autocapitalize", "words"); el.setAttribute("autocomplete", "off"); el.spellcheck = false;
  nameInput = { el, slot, rect };
  placeNameInput();
  el.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); closeNameInput(true); }
    else if (e.key === "Escape") { e.preventDefault(); closeNameInput(false); }
  });
  el.addEventListener("blur", () => closeNameInput(true));
  wrap.appendChild(el);
  el.focus(); el.select();
}
export function closeNameInput(save) {
  if (!nameInput) return;
  const { el, slot } = nameInput;
  nameInput = null;
  if (save && cleanName(el.value) !== nameFor(slot)) setName(slot, el.value);   // не менял — имя по умолчанию остаётся «языковым»
  el.remove();
}

// Геймпады. SPEC-025 AC 7e: by Gamepad.index; padSlots[n] — the pad of player n (players in the order the pads first connected):
// { index, id, connected, prev, x, y }. A pad that comes back (maybe at another index) takes the free slot it had (same id),
// else the first free one; its first poll fires no button edges; only pads with the standard mapping press buttons
const padSlots = [];
export function resetPads() { padSlots.length = 0; }
// кнопки, у которых ловим нажатие: A, B, X, Y, Start, крестовина (+ поцелуй, спасалка и бамперы карты из CFG — читаем каждый раз)
const padEdge = () => [...new Set([0, 1, 2, 3, 9, 12, 13, 14, 15, LOOK.PAD_KISS, LOOK.PAD_KIT, LOOK.PAD_PREV_WORLD, LOOK.PAD_NEXT_WORLD])];
export function pollPads() {
  let list = [];
  try { list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { /* not allowed */ }
  const edge = padEdge(), seen = new Set();
  list.forEach((p, i) => {
    if (!p || p.connected === false) return;
    const index = Number.isInteger(p.index) ? p.index : i, standard = p.mapping === "standard";
    const btn = standard ? p.buttons.map(b => !!(b && b.pressed)) : [];
    seen.add(index);
    let s = padSlots.find(q => q.connected && q.index === index);
    if (!s) {
      s = padSlots.find(q => !q.connected && q.id === p.id) || padSlots.find(q => !q.connected);
      if (!s) { s = {}; padSlots.push(s); }
      Object.assign(s, { index, id: p.id, connected: true, prev: btn });   // (re)connected: no edges on this poll
    }
    const pi = padSlots.indexOf(s);
    for (const b of edge) if (btn[b] && !s.prev[b]) onPadButton(b, pi);
    s.prev = btn;
    let x = p.axes[0] || 0, y = p.axes[1] || 0;
    if (Math.hypot(x, y) < 0.25) { x = 0; y = 0; }
    if (btn[14]) x = -1; if (btn[15]) x = 1; if (btn[12]) y = -1; if (btn[13]) y = 1;
    // SPEC-025: the stick (not the D-pad: its buttons do it above) pushed half-way left / right also moves a card's highlight
    const side = Math.sign(Math.round(p.axes[0] || 0));
    if (side && side !== s.side && cardOpen()) moveCardFocus(side);
    s.side = side;
    s.x = x; s.y = y;
  });
  padSlots.forEach((s, pi) => { if (s.connected && !seen.has(s.index)) { s.connected = false; s.x = 0; s.y = 0; padLost(pi); } });
}
// a pad gone during play: pause if a player lost his controller (two players: the pad of player 1 or 2; one player: the last pad)
function padLost(pi) {
  if (mode !== "play") return;
  if (G.players === 1 ? !padSlots.some(s => s.connected) : pi < G.players) setMode("pause");
}
function onPadButton(b, pad = 0) {
  if (nameInput) return;
  if (cardOpen()) {                         // SPEC-025: a card over the game — D-pad ←/→ pick its button, A / Start press it, nothing else
    if (b === 14 || b === 15) moveCardFocus(b === 14 ? -1 : 1);
    else if (b === 0 || b === 9) pressCard();
    else if (b === 1) leaveCancel();       // SPEC-033: B on the Leave dialog = No
    return;
  }
  initAudio();
  if (mode === "lang") {                                      // SPEC-032: the language screen — the cross moves, A / Start pick
    if (b === 14) moveLangSel(-1);
    if (b === 15) moveLangSel(1);
    if (b === 12 || b === 13) moveLangSel(2);
    if (b === 0 || b === 9) chooseLang();
  } else if (mode === "home") {
    const a = homeActions().find(q => q.pad.includes(b));   // SPEC-017: A — «Играть», X — история, Y — магазин
    if (a) a.act();
    else if (b === 1) goBack();                              // SPEC-033: B — как Escape: «Выйти из игры?»
  } else if (mode === "map") {
    if (b === 14 || b === LOOK.PAD_PREV_WORLD) cycleWorld(-1);   // крестовина ←/→ и бамперы — миры
    if (b === 15 || b === LOOK.PAD_NEXT_WORLD) cycleWorld(1);
    if (b === 12) moveMapSel(-1);                  // крестовина ↑/↓ — остановки
    if (b === 13) moveMapSel(1);
    if (b === 0) chooseStop(mapSelN());
    if (b === 1) setMode("home");
  } else if (mode === "levelCard") {
    if (b === 0 || b === 9) playCard(1);
    if (b === 2) playCard(2);                      // X — вдвоём (на телефоне startGame сам оставит одного игрока)
    if (b === 3) openStory(G.world, "levelCard"); // Y — 📖 глава мира
    if (b === 1) closeCard();
  } else if (mode === "story") {
    if (b === 1) storyBackKey();
    if (b === 3) setStoryPage(ui.storyPage === "rules" ? "chapters" : "rules");   // Y — «Как играть»
    if (b === 2 && ui.storyPage === "chapters") watchChapter();               // SPEC-022: X — посмотреть заставку главы
    if (ui.storyPage === "chapters") {
      if (b === 14 || b === LOOK.PAD_PREV_WORLD) storyStep(-1);
      if (b === 15 || b === LOOK.PAD_NEXT_WORLD || b === 0) storyStep(1);
    } else if (b === 0) openPractice();            // SPEC-029/032: A на «Как играть» — «Тренировка» (только игры)
    else if (b === 2) openPictures();              // SPEC-032: X — «Картинки»
  } else if (mode === "scene") {
    if (b === 0 || b === 9 || b === 15) sceneNext();   // SPEC-022: A / Start / крестовина → — дальше, ← — назад, B — пропустить
    if (b === 14) scenePrev();
    if (b === 1) sceneSkip();
  } else if (mode === "shop") {
    const friends = inWardrobe() && ui.wardrobePage === "friends";
    if (b === 1 && friends) backToWardrobe();
    else if (b === 0 || b === 1 || b === 9) closeShop();
    if (b === 14) switchShopTab(-1);               // крестовина влево/вправо — вкладки
    if (b === 15) switchShopTab(1);
    if (inWardrobe() && !friends) {
      if (b === 2) randomOutfit("p1");
      if (b === 3 && !PHONE) randomOutfit("p2");   // на телефоне игрока 2 нет
    }
  } else if (mode === "play") {
    if (b === 9) setMode("pause");
    if (b === LOOK.PAD_KISS && (G.players === 1 || pad < G.players)) pressKiss(G.players === 1 ? 0 : pad);
    if (b === LOOK.PAD_KIT && (G.players === 1 || pad < G.players)) pressKit(G.players === 1 ? 0 : pad);
  }
  else if (mode === "pause") { if (b === 9 || b === 0) resumeGame(); if (b === 1) (G.tutorialGame ? tutorialSkip : toMap)(); }
  else if (mode === "win") { if (b === 0 || b === 9) nextLevel(); if (b === 1) toMap(); }
  else if (mode === "lose") { if (b === 0 || b === 9) retryLevel(); if (b === 1) toMap(); }
}

// SPEC-019: на цыпочках с клавиатуры: один игрок — любой Shift (в подсказке — левый: правый Shift в Windows — залипание);
// двое — игрок 1 левый Shift, игрок 2 «/» (клавиша слева от правого Shift; на русской раскладке «.»). Не Ctrl: с ним клавиши
// игрока 1 — сочетания браузера (Ctrl+W закрывает вкладку). Правый Shift остаётся спасалкой игрока 2.
const TIPTOE_KEYS = [["ShiftLeft", "ShiftRight"], ["ShiftLeft"], ["Slash"]];
const tiptoeKey = pi => (G.players === 1 ? TIPTOE_KEYS[0] : TIPTOE_KEYS[pi + 1] || []).some(k => keys.has(k));
// Длина вектора — доля скорости. Стик/геймпад: наклон t < TIPTOE_MAX — на цыпочках (до TIPTOE_MULT), больше — бегом (t);
// Shift — не быстрее TIPTOE_MULT. Автопилот — как есть (его длина и есть доля скорости).
// SPEC-011 AC 3b / SPEC-012 AC 3: ввод игрока l с устройств (клавиши, Shift — на цыпочках; геймпады; джойстики касаний) — в
// слот игрока (fillInputs); автопилот добавляет игра
// the keys of player pi (one player: WASD and the arrows; two: WASD and the arrows each); a test may give a Little One its own l.controls
const KEYS_ONE = Object.freeze({ up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"] });
const KEYS_TWO = Object.freeze([{ up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"] }, { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] }]);
const NO_KEYS = Object.freeze({ up: [], down: [], left: [], right: [] });
const controlsOf = l => l.controls || (G.players === 1 ? (l.id === 0 ? KEYS_ONE : NO_KEYS) : KEYS_TWO[l.id] || NO_KEYS);
export function deviceInput(l) {
  const pi = l.id;
  let x = 0, y = 0;
  const c = controlsOf(l), pressed = arr => arr.some(k => keys.has(k));
  x += (pressed(c.right) ? 1 : 0) - (pressed(c.left) ? 1 : 0);
  y += (pressed(c.down) ? 1 : 0) - (pressed(c.up) ? 1 : 0);
  padSlots.forEach((p, i) => { if (p.connected && (G.players === 1 || i === pi)) { x += p.x; y += p.y; } });
  const s = activeStick(pi);                   // SPEC-038 AC 1: the newest finger of this player's stack
  if (s) {
    const R = stickR(), dx = (s.x - s.ox) / R, dy = (s.y - s.oy) / R;
    if (Math.hypot(dx, dy) > 0.15) { x += dx; y += dy; }
  }
  const t = Math.min(1, Math.hypot(x, y));
  if (t > 0) {
    let f = t < CFG.TIPTOE_MAX ? CFG.TIPTOE_MULT * t / CFG.TIPTOE_MAX : t;
    if (tiptoeKey(pi)) f = Math.min(f, CFG.TIPTOE_MULT);
    const k = f / Math.hypot(x, y);
    x *= k; y *= k;
  }
  return { x, y };
}
// SPEC-012 AC 3: the device sticks of every player into the input slots (before each step; the flags stay until the step fires them)
export function fillInputs() {
  for (const l of G.littles) {
    if (l.kind !== "player") continue;
    const inp = G.inputs[l.slot] || (G.inputs[l.slot] = newInput()), v = deviceInput(l);
    inp.mx = v.x; inp.my = v.y;
    inp.tiptoe = !!ui.tiptoe[l.id];          // SPEC-032 AC 1: кнопка 👣 включена — не быстрее TIPTOE_MULT (ядро режет стик), тихо
  }
}

// called once by main.js, in the start order of the one-file game
export function initInput() {
  window.addEventListener("keydown", e => {
    if (nameInput) return;                     // печатают имя: игровые клавиши (WASD, M, L, Esc…) не трогаем
    if (cardOpen()) {                          // SPEC-025: a card over the game — keys do not reach the game; Enter / Space press the card
      if (e.code === "Escape" && !e.repeat && leaveCancel()) { keys.add(e.code); return; }   // SPEC-033: Escape on the Leave dialog = No (holding it must not close what it just opened)
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") { e.preventDefault(); moveCardFocus(e.code === "ArrowLeft" ? -1 : 1); }
      else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") { e.preventDefault(); if (!keys.has(e.code)) pressCard(); }   // the highlighted (or Tab-focused) button
      keys.add(e.code);
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "Slash" && mode === "play") e.preventDefault();   // SPEC-019: «/» — на цыпочках игрока 2 (в Firefox «/» — быстрый поиск)
    initAudio();
    if (!keys.has(e.code)) onKey(e.code);
    keys.add(e.code);
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => { keys.clear(); sticks.clear(); });
  window.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (rotateWall()) return;                          // SPEC-038 AC 2: the "turn your device" overlay is on — nothing under it reacts
    initAudio();
    if (nameInput) { closeNameInput(true); return; }   // тап мимо поля — имя сохраняется
    // SPEC-025 AC 7d: in the frame that changed the screen the drawn buttons (and the screen-wide taps: next comic page, resume,
    // close the card) belong to the old screen — they do nothing; a stick, a swipe or a drag still starts
    const stale = staleButtons();
    const p = toGame(e);
    const hit = stale ? null : hitButton(p);
    // SPEC-017: на карте и в главах истории кнопки срабатывают на отпускании — палец, сдвинутый вбок, листает миры / главы
    if (mode === "map" || mode === "story" && ui.storyPage === "chapters") {
      ui.mapSwipe = { id: e.pointerId, x: p.x, y: p.y, hit: hit ? hit.id : null, mode };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }   // отпускание за краем холста — тоже наше
      return;
    }
    if (stale && mode !== "play") return;
    if (mode === "levelCard" && !hit && ui.cardRect && !(p.x >= ui.cardRect.x && p.x <= ui.cardRect.x + ui.cardRect.w && p.y >= ui.cardRect.y && p.y <= ui.cardRect.y + ui.cardRect.h)) { closeCard(); return; }
    if (hit && hit.onUp) { pendingUp = { id: hit.id, pointerId: e.pointerId }; return; }
    if (hit) { hit.act(); return; }
    if (mode === "scene") { sceneNext(); return; }      // SPEC-022: тап по заставке — дальше
    if (mode === "play" && e.pointerType !== "mouse") {
      if (PHONE && p.x > UW * LOOK.STICK_ZONE) return;   // телефон: справа — только кнопки
      const player = G.players === 2 && p.x > UW / 2 ? 1 : 0;
      const mine = [...sticks].filter(([, q]) => q.player === player);   // SPEC-038 AC 1: the stack grows; only its depth is capped (a lost pointerup must not pile up)
      for (const [id] of mine.slice(0, Math.max(0, mine.length + 1 - LOOK.STICK_STACK_MAX))) sticks.delete(id);
      sticks.set(e.pointerId, { player, ox: p.x, oy: p.y, x: p.x, y: p.y });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    } else if (mode === "pause") resumeGame();
  });
  canvas.addEventListener("pointermove", e => {
    const s = sticks.get(e.pointerId);
    if (!s) return;
    const p = toGame(e);
    s.x = p.x; s.y = p.y;
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
    const R = stickR();
    if (d > R * 1.6) { s.ox = s.x - dx / d * R * 1.6; s.oy = s.y - dy / d * R * 1.6; }  // джойстик «едет» за пальцем
  });
  canvas.addEventListener("pointerup", e => {
    initAudio();                                       // SPEC-025 AC 14: WebKit unlocks audio on the release
    endStick(e);
    if (rotateWall()) { pendingUp = null; ui.mapSwipe = null; return; }   // SPEC-038 AC 2: a release under the overlay presses nothing
    const stale = staleButtons();                      // SPEC-025 AC 7d: a swipe still works; a button of an older screen does not
    const sw = ui.mapSwipe;
    if (sw && sw.id === e.pointerId) {
      ui.mapSwipe = null;
      if (mode !== sw.mode) return;
      const p = toGame(e), dx = p.x - sw.x, dy = p.y - sw.y;
      if (Math.abs(dx) >= cpx(LOOK.MENU_LOOK.map.swipe) && Math.abs(dx) > Math.abs(dy)) {   // влево — следующий мир / глава
        if (mode === "map") cycleWorld(dx < 0 ? 1 : -1); else storyStep(dx < 0 ? 1 : -1);
        return;
      }
      const h = stale ? null : hitButton(p);
      if (h && sw.hit && h.id === sw.hit) h.act();
      return;
    }
    const pu = pendingUp; pendingUp = null;
    if (!pu || pu.pointerId !== e.pointerId || stale) return;
    const hit = hitButton(toGame(e));
    if (hit && hit.id === pu.id) hit.act();              // тот же жест — фокус в поле, клавиатура на iOS открывается
  });
  canvas.addEventListener("pointercancel", e => { endStick(e); ui.mapSwipe = null; });
  canvas.addEventListener("lostpointercapture", endStick);   // SPEC-038 AC 1: a pointer the browser no longer follows leaves the stack
}
