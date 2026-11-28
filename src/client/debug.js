// SPEC-011: window.__bb for the tests (getters and setters over the modules' live state, never copies), CFG_ALL (the
// __bb.CFG Proxy over CFG and LOOK), SIM_DRAWN. Client module (moved out of index.html in Phase C).

import { Vector3 } from "three";
import { autopilot } from "../core/autopilot.js";
import { BONUS_WORLDS, BOSSES, CELL, CFG, COLS, GLOVES, KISSES, levelsPerWorld, MAIN_WORLDS, RESCUE_KIT, REWARD, ROWS, UPGRADES, upgBonus, WARDROBE_TIERS, WORLD_SEED, worldDifficulty, WORLDS } from "../core/config.js";
import { bigBoost, bigSpeeds, difficulty } from "../core/difficulty.js";
import { ledger, progress, setProgress } from "../core/economy.js";
import { readInputs, simRun } from "../core/game.js";
import { bigMark, isRunning } from "../core/hearing.js";
import { generateLevel } from "../core/level/build.js";
import { levelType } from "../core/level/generate.js";
import { clearLevelCache } from "../core/level/load.js";
import { levelReport } from "../core/level/report.js";
import { bigMood, bossFor } from "../core/mood.js";
import { bigCalm } from "../core/vision.js";
import { tutorialMapRect } from "../core/practice.js";
import { bonusUnlocked, fastTarget, loadProgress, worldComplete } from "../core/progress-rules.js";
import { spawnItem, spawnStar } from "../core/rules.js";
import { clamp, setStrictRng, strictRng } from "../core/util.js";
import { BIG_SKINS, HAIRS, HATS, JACKETS, PANTS, SLOTS } from "../core/wardrobe.js";
import { inDanger, inSafe, seeSolidAt } from "../core/world.js";
import { detectLang, I18N, L, lang, LANG_NAMES, LANGS } from "../i18n.js";
import { RULE_ICONS, SCENE_IDS, STORY, TUTORIAL_SCENES } from "../story.js";
import { ART_NAMES, ART_RESIDENT } from "./art-names.js";
import { cadence, COVERED, newCadence } from "./cadence.js";
import { qualityFrame, qualityInfo, setQualityMode } from "./adaptive.js";
import { warmInfo } from "./warm.js";
import { artHolding, frameLog, recordFrames, screenArt } from "./screen-art.js";
import { art, ART_FALLBACK, artBytes, artCount, artLazy, artLoad, artDone, artVersion, EMOJI_ART, FX_ART, HEART_ART, ITEM_ART, mapBgArt, PAPER_BTN, POP_ART, SHOP_TAB_ART, STORY_ART, UPG_ART, WARDROBE_ART, worldArt } from "./art.js";
import { orderedEvents } from "../core/events.js";
import { bannerAlpha, chapterOpen, chooseStop, cycleWorld, goBack, nextLevel, closeShop, giveReward, lastReward, mapTick, openFriends, openMap, openScene, openShop, openStory, openTip, closeTip, okTip, playCard, tipDue, resetMenus, resetWorld, rngDraws, sceneNext, scenePageCount, scenePages, sceneSkip, seedRandom, selectWorld, setLastReward, setMode, setShopTab, shopAfterWin, showBanner, showCard, startGame, tapWorldTab, toHome, toMap } from "./flow.js";
import { errorLog, reportError } from "./errors.js";
import { glRestored } from "./lifecycle.js";
import { audioContext, audioDebug, clickSound } from "./sound.js";
import { burst, kissNow, kitNow, popText, runCore, runFrame, stepGame } from "./fx.js";
import { resetPads, toGame } from "./input.js";
import { nameInput, openNameInput, stickR, sticks } from "./devices.js";
import { KID_HEAD_R, LOOK } from "./look.js";
import { allNames, nameOf, setName } from "./names.js";
import { BOSS_LOOKS, botOutfit, buyLook, cloneSkins, cycleBig, cycleOutfit, loadOutfits, LOOK_SLOTS, randomOutfit, resetOutfits, skinKeep, skinSel } from "./outfits.js";
import { setLang } from "./progress.js";
import { resetProgress } from "./reset.js";
import { fingerprint, flushSaves, OLD_KEYS, outfitsOf, promptsForPersist, queueSave, readCode, SAVE_KEYS, SAVE_VERSION, saveCode, saveState, validSave } from "./save.js";
import { updateChecks, updateReady } from "./update.js";
import { CSS_H, CSS_W, fitCount, isStandalone, PHONE, rotateWall, setSimMode, simMode, UH, UW } from "./screen.js";
import { buyGloves, buyKisses, buyRescueKit, buyUpgrade, setEquip } from "./shop.js";
import { mode, MODES, ui } from "./state.js";
import { cam, camDist, camLook, camRect, camSnap, toScreen, updateCamera } from "./three/camera.js";
import { modelOf, rebuild3D, setBigFace } from "./three/characters.js";
import { disposeCheck, look3D } from "./three/look3d.js";
import { perfReport } from "./perf.js";
import { mapGroup } from "./three/mapstate.js";
import { trickMeshes } from "./three/tricks3d.js";
import { worldItemMeshes } from "./three/worlditems3d.js";
import { groundCanvas, OUTLINE } from "./three/materials.js";
import { outfitModel, skinPanels } from "./three/previews.js";
import { camera, LITTLE_SCALE } from "./three/setup.js";
import { THEMES } from "./three/themes.js";
import { openFirstTutorial, openPictures, openPractice, openTutorial, tutorialSkip } from "./tutorial.js";
import { FIRST_STEPS, firstTutorial, tutorial, TUTORIAL_STEPS, tutorialArtNames, tutorialPages, tutorialStep } from "./tutorial-data.js";
import { SHOP_PICTURES, shopCards } from "./ui/character/items.js";
import { clothesCount } from "./ui/character/progress.js";
import { backInfo } from "./back.js";
import { nameTagH, tapLines } from "./ui/draw.js";
import { artUse, resetArtUse } from "./ui/artdraw.js";
import { chooseLang, openLangScreen } from "./ui/lang.js";
import { heardHintOn, heardHintText, heartFill, timerText } from "./ui/hud.js";
import { mmAlpha, mmCount, mmDraws, mmState, updateMinimapFade } from "./ui/minimap.js";
import { clearLevelPreviews, previewCacheSize, previewDataOf, previewStats } from "./preview-data.js";
import { levelPreviewOf } from "./ui/level-preview.js";
import { gateState, openFullCard, openGrownUps, parentGate } from "./ui/grownups.js";
import { canHost, entitlement, entitlementInfo, hasFull, helloFields, initEntitlement, setEntitlement, worldOpenNow } from "./entitlement.js";
import { drawUI } from "./ui/screens.js";
import { fmtHearts, storyPx } from "./ui/text.js";
import { winTitle, loseTitle } from "./ui/win.js";
import { G } from "../core/active.js";

// для отладки и тестов
// SPEC-011 AC 2c: __bb.CFG — один вид на числа ядра (src/core/config.js CFG) и вида (src/client/look.js LOOK): чтение, запись и
// возврат любого ключа доходят до объекта, где он лежит (тесты меняют ключи и возвращают их через __bb.CFG)
const CFG_ALL = new Proxy({}, {
  get: (t, k) => Reflect.get(Object.hasOwn(LOOK, k) ? LOOK : CFG, k),
  set: (t, k, v) => { (Object.hasOwn(LOOK, k) ? LOOK : CFG)[k] = v; return true; },   // a plain write (the coin scan allows no Reflect.set)
  has: (t, k) => k in LOOK || k in CFG,
  deleteProperty: (t, k) => Reflect.deleteProperty(Object.hasOwn(LOOK, k) ? LOOK : CFG, k),
  ownKeys: () => [...Reflect.ownKeys(CFG), ...Reflect.ownKeys(LOOK)],
  getOwnPropertyDescriptor: (t, k) => {
    const o = Object.hasOwn(LOOK, k) ? LOOK : Object.hasOwn(CFG, k) ? CFG : null, d = o && Reflect.getOwnPropertyDescriptor(o, k);
    if (d) d.configurable = true;                           // a proxy may not report a non-configurable key its target lacks
    return d;
  }
});
// SPEC-023 AC 5: в sim ничего не рисуется — состояние, которое заполняют drawUI / 3D, устарело или пусто. Чтение бросает
// ошибку, чтобы визуальный тест, открытый в sim, падал громко, а не проверял пустоту.
const SIM_DRAWN = ["buttonRects", "buttonNames", "tapButton", "hudRects", "mapInfo", "levelCard", "storyInfo", "textSizes", "minimap",
  "bannerRect", "bellHud", "tipCard", "trickMeshes", "worldItemMeshes", "rotateShown", "winPanel", "winLine", "bonusNote", "shopLayout", "kitHint", "heardHint", "edgeArrows", "downDrawn", "stickMarks",
  "tapLines", "textOverflows", "tutorialHint", "homeInfo", "progressInfo", "outfit3D", "bibClear", "hat3D", "capeClear", "cardRect", "mapPieces", "groundColorAt", "camera", "minimapAlpha", "artUse", "bigTag", "frameLog", "sceneInfo", "moodInfo", "bigLook", "look3D", "drawNow", "model",
  "perf", "disposeCheck"];   // SPEC-025 AC 15 / 15b: the renderer's numbers and textures — a rendered page only


// sim(on): включить/выключить режим симуляции; без аргумента — только узнать. Выключили — 3D строится заново (SPEC-039: из screen.js —
// ему нельзя импортировать ни 3D, ни картинки, а режим только переключается его setSimMode)
function sim(on) {
  if (typeof on === "boolean" && on !== simMode) { setSimMode(on); if (!on) { rebuild3D(); artLoad(); } }
  return { on: simMode, renders: ui.renders, draws: ui.draws, sounds: ui.sounds };
}

// called once by main.js, in the start order of the one-file game
export function installDebug() {
  window.__bb = {
    // SPEC-020: art(name) — картинка или null; artInfo — сколько картинок готово / не загрузилось, всё ли решено
    back: backInfo,   // SPEC-033: { leaves, noLeave } — the "Yes" of the Leave dialog counted (noLeave: not really leaving)
    get artUse() { return { ...artUse }; }, resetArtUse, get artVersion() { return artVersion; },
    // SPEC-020: все имена картинок, которые могут выдать таблицы (тест: каждое есть в ART_NAMES)
    artTableNames: () => [...Object.values(PAPER_BTN), ...Object.values(ITEM_ART), ...Object.values(UPG_ART), ...Object.values(SHOP_TAB_ART),
      ...Object.values(WARDROBE_ART).flatMap(Object.values), ...Object.values(EMOJI_ART), ...Object.entries(ART_FALLBACK).flat(), ...Object.values(STORY_ART), ...tutorialArtNames(), ...HEART_ART, ...Object.values(FX_ART), ...Object.values(POP_ART),
      ...WORLDS.flatMap(w => [worldArt(w), mapBgArt(w)])], fxBurst: burst, popText,   // SPEC-020: частицы и всплывающие надписи (тест картинок эффектов)
    art, ART_NAMES, ART_RESIDENT,
    // SPEC-040 AC 1: total — every sprite; resident — those loaded at start; ok — resident ones loaded, bad — sprites that failed to load (any); loaded — in memory now (resident + the
    // non-resident ones a screen is using); pending — non-resident ones still loading; bytes — their decoded RGBA; done — the resident ones settled and nothing pending
    get artInfo() { const z = artLazy(); return { total: ART_NAMES.length, resident: ART_RESIDENT.length, ok: artCount.ok, bad: artCount.bad + z.bad, loaded: artCount.ok + z.loaded, pending: z.loading, bytes: artBytes(), done: artDone(), holding: artHolding(), loadingShown: !!document.getElementById("loading") }; },
    // SPEC-048 AC 9: the frame recorder (recordFrames(true) starts it, false stops it; frameLog = the frames: { n, screen, target, held, late, missing }) and the pictures of the screen now
    recordFrames, get frameLog() { return frameLog(); }, get screenArt() { return screenArt(); },
    get mode() { return mode; }, set mode(v) { if (MODES.includes(v)) setMode(v); },   // SPEC-017: только экраны из MODES
    // SPEC-017: экраны меню; wardrobePage — «looks» (наряды) или «friends» (имена друзей) во вкладке «Гардероб»; resetMenus — как при запуске
    MODES, toMap, toHome, resetMenus, shopAfterWin, closeShop, get muted() { return !ui.sfx; },   // SPEC-030: и магазин после победы → «Готово»
    get wardrobePage() { return ui.wardrobePage; }, set wardrobePage(v) { if (v === "looks" || v === "friends") ui.wardrobePage = v; },
    get littles() { return G.littles; }, get big() { return G.big; }, get stats() { return G.stats; },
    get level() { return G.level; }, set level(v) { G.level = clamp(Math.floor(v) || 1, 1, levelsPerWorld()); },
    // SPEC-006: world — мир идущего/выбранного уровня (не мир — игнорируется), level — номер в мире
    get world() { return G.world; }, set world(v) { if (WORLDS.includes(v)) G.world = v; }, WORLDS, difficulty, bigSpeeds,
    // SPEC-016: списки миров, сиды по имени, индекс сложности, время третьей звезды, бонусные миры (p — прогресс, по умолчанию текущий)
    MAIN_WORLDS, BONUS_WORLDS, WORLD_SEED, worldDifficulty, fastTarget, chapterOpen,
    // SPEC-039: the progress rules are stateless — here p is the current progress when the test gives none, w the active game's world
    bonusUnlocked: (p = progress) => bonusUnlocked(p), worldOpen: (w, p = progress) => worldOpenNow(w, p), worldComplete: (w = G.world, p = progress) => worldComplete(w, p),
    get bonusNote() { return ui.bonusNote && { ...ui.bonusNote }; },   // SPEC-016: плашка «Открылись бонусные миры!» этого кадра (или null)
    get winLine() { return ui.winLine; }, selectWorld, cycleWorld,
    // SPEC-017: карта этого кадра, подсказка, карточка уровня; tapButton(id) — нажать кнопку этого кадра (как пальцем)
    get mapInfo() { return ui.mapState && JSON.parse(JSON.stringify(ui.mapState)); }, get toast() { return ui.toast && { ...ui.toast }; },
    // SPEC-030: мир, который карта покажет при входе (или null); плашка «<мир> открыт!» { world, t, text } (или null)
    get openedWorld() { return ui.openedWorld; }, get mapTab() { return ui.mapTab; },   // SPEC-045: the 🎁 tab the ring is on (or null)
     mapTick, get worldBanner() { return ui.worldBanner && { ...ui.worldBanner, text: L().worldOpened(ui.worldBanner.world) }; },
    get levelCard() { return ui.cardInfo && { ...ui.cardInfo }; }, get cardRect() { return ui.cardRect && { ...ui.cardRect }; }, openMap,
    RULE_ICONS, STORY, openStory, get storyInfo() { return ui.storyInfo && { ...ui.storyInfo }; },
    // SPEC-022: заставки (scene — логика: { id, page, pages } или null; sceneInfo — нарисованное в этом кадре), боссы уровней
    SCENE_IDS, openScene, sceneNext, sceneSkip, scenePages, bigMood,
    // SPEC-029: обучение — шаги, идёт ли ({ step, page — страница листа, game — 1 / 2 в тренировке, иначе 0, back } или null), начать
    // (back «map» / «story», с шага from), пропустить; firstTutorial(p) — откроется ли само после комикса (чистая)
    TUTORIAL_STEPS, get tutorial() { const s = tutorialStep(); return s && { step: s, page: ui.storyScene && TUTORIAL_SCENES.includes(ui.storyScene.id) ? ui.storyScene.page : 0, game: s.startsWith("game") ? Number(s.slice(4)) : 0, hint: G.tutorialGame ? G.tut.hint : 0, back: tutorial.back }; },
    FIRST_STEPS, openTutorial, openFirstTutorial, tutorialSkip, firstTutorial, openPictures, openPractice,   // SPEC-032 AC 8: «Картинки» и «Тренировка» на «Как играть»
    // SPEC-029: клетки поляны тренировок { x, y, w, h }; подпись времени в HUD; подсказка тренировки этого кадра (плашка) или null
    get tutorialMapRect() { return tutorialMapRect(); }, timerText, loseTitle, get tutorialHint() { return ui.tutorialHintRect && { ...ui.tutorialHintRect, rows: [...ui.tutorialHintRect.rows] }; }, winTitle, get pushWaves() { return ui.waves.map(w => ({ ...w })); }, get scene() { return ui.storyScene && { id: ui.storyScene.id, page: ui.storyScene.page, pages: scenePageCount() }; },
    get bigTag() { return ui.bigTag && { ...ui.bigTag, blocks: ui.bigTag.blocks.map(b => ({ ...b })) }; }, get sceneInfo() { return ui.sceneInfo && { ...ui.sceneInfo }; }, drawNow() { drawUI(ui.T); }, bossFor,   // SPEC-031: drawNow — нарисовать слой интерфейса сейчас (тест раскладки рисует много экранов за один evaluate)
    BOSSES, BOSS_LOOKS, bigCalm, KID_HEAD_R, LITTLE_SCALE,   // SPEC-021 размеры героев (тест look3d)
    // SPEC-022: вид Большого в 3D (для тестов): образ, босс и его детали, масштаб, цвета футболки и штанов
    bigLook() { const m = modelOf(G.big); return m ? { look: m.look, boss: m.boss || null, parts: Object.keys(m.bossParts || {}), scale: m.rig.scale.x,
      shirt: "#" + m.mats.shirt.color.getHexString(), pants: "#" + m.mats.pants.color.getHexString() } : null; }, get moodInfo() { return ui.moodInfo && { ...ui.moodInfo, sprites: [...ui.moodInfo.sprites] }; },   // SPEC-017: главы истории (живой список), экран истории этого кадра
    // SPEC-012 AC 1b: the 3D model of Little One i or of the Big One ("big") — models are kept by the client, not on the entities
    model: who => modelOf(who === "big" ? G.big : G.littles[who]) || null,
    get game() { return G; },   // SPEC-012: the active game (plain data)
    get acc() { return ui.acc; },   // SPEC-034: the game-time accumulator of live play (s, read-only; < CFG.STEP between frames)
    // SPEC-025 AC 7: the local error log (copies); an error as the game reports it (card, log); nextLevel (AC 7d)
    get errorLog() { return errorLog(); }, reportError, nextLevel,
    // SPEC-025: forget every pad (AC 7e: the tests' gamepad stubs); the one "back" (AC 14d); the audio context (AC 14); restored (AC 14c)
    resetPads, goBack, audioContext, get glRestored() { return glRestored; },
    // SPEC-047: the audio, for the tests (sound.js audioDebug): log — the last 50 plays { name, at, n, synth?, loop?, other?, stolen? }, track — the music that sounds, music — its pair, levels — the bus gains
    // (null before the first gesture), loaded / failed / loops / voices, settings, musicPaused, decodedBytes, loopRegion(buffer), seekMusic(s), tick() — one audioTick
    audio: audioDebug,
    // SPEC-025 phase 2: the save module — info (noSave, notes, copies, persist, pending writes), queue / flush the whole save, the
    // parents' code (code(), readCode(text) → { ok, error }), the keys, the pure helpers (validSave, fingerprint, outfits by id ↔ indexes)
    save: Object.freeze({ get info() { return saveState(); }, queue: queueSave, flush: flushSaves, code: saveCode, readCode: t => { const r = readCode(t); return { ok: r.ok, error: r.error || null }; },
      KEYS: SAVE_KEYS, OLD_KEYS, VERSION: SAVE_VERSION, validSave, fingerprint, promptsForPersist, outfitsFromIds: v => outfitsOf(v), outfitsToIds: o => outfitsOf(o, true) }),
    // SPEC-025 AC 6: the grown-ups page (open — behind the gate), the gate itself, the open question { a, b, answers } or null
    // SPEC-040 AC 3: the pure rule of when a frame draws the 3D (a test drives it with fake timestamps): view3D.wanted(view3D.newState(), inputs, ms)
    get quality() { return qualityInfo(); }, setQuality: setQualityMode, qualityFrame,   // SPEC-040 AC 6 / 7: { tier, mode, probeMs, steps }; setQuality("auto" | "high" | "medium" | "low")
    get warm() { return warmInfo(); },   // SPEC-040 AC 4: { key, phase: "" | game | map | chars | upload | done, done } of the warm-up behind the level card
    view3D: Object.freeze({ newState: newCadence, wanted: cadence, COVERED }),
    grownUps: Object.freeze({ open: openGrownUps, parentGate, get gate() { return gateState(); } }),
    // SPEC-045: the Full game — value / info (live), hasFull, set(value, source) (a test's purchase), the online seam (hello, canHost), the child's card
    entitlement: Object.freeze({ get value() { return entitlement(); }, get info() { return entitlementInfo(); }, hasFull, set: setEntitlement, get hello() { return helloFields(); }, canHost, openCard: openFullCard, init: initEntitlement }),
    // SPEC-012 AC 1f: the menus' state a screen change resets (logic state: the same in sim and rendered pages) and the actions
    // that set it up: the shop, its friends page, the name input of a slot, a map stop or world tab (a locked one shows a hint)
    get screenState() { return { mode, shopTab: ui.shopTab, wardrobePage: ui.wardrobePage, toast: ui.toast && ui.toast.text, mapBgCache: !!ui.mapBgCache, nameInput: !!nameInput }; },
    openShop, openFriends, chooseStop, tapWorldTab, openNameInput: slot => openNameInput({ x: 0, y: 0, w: 100, h: 30 }, slot),
    tapButton(id) { const q = ui.buttons.find(r => (r.id || r.act.name) === id); if (q) { clickSound(q); q.act(); } return !!q; },
    LANGS, detectLang, get lang() { return lang; },   // SPEC-028: языки по порядку значка 🌐, язык при запуске (чистая), текущий язык
    update: stepGame, frame: runFrame, inSafe, I18N, startGame, resetWorld, cycleOutfit, randomOutfit, cycleBig, setLang, toScreen,
    get items() { return G.items; }, get progress() { return progress; }, buyGloves, setEquip, get lastReward() { return lastReward; }, spawnItem,
    UPGRADES, upgBonus, buyUpgrade, get upgrades() { return { ...progress.upgrades }; }, get shopTab() { return ui.shopTab; }, set shopTab(v) { setShopTab(v); },   // SPEC-009 (SPEC-017: + «wardrobe»)
    WARDROBE_TIERS, buyLook, resetOutfits, loadOutfits,   // SPEC-021: loadOutfits(save) — чистое «сохранение → наряды»
    get outfits() { return { shown: cloneSkins(skinSel), saved: cloneSkins(skinKeep) }; },   // SPEC-009: гардероб
    // SPEC-027: новые детали одежды модели: who — номер маленького или «p1» / «p2» (превью гардероба) → [{ piece, color }]
    outfit3D(who) {
      const m = outfitModel(who);
      return m && m.outfit ? m.outfit.map(q => ({ piece: q.piece, color: "#" + q.mesh.material.color.getHexString() })) : null;
    },
    // SPEC-027 (review): перед нагрудника комбинезона и самая передняя точка остальных деталей туловища в его ширину и высоту
    // (z в координатах туловища) — тест «нагрудник поверх куртки»; null — нет нагрудника
    bibClear(who) {
      const m = outfitModel(who), bib = m && m.outfit && m.outfit.find(q => q.piece === "bib");
      if (!bib) return null;
      const box = o => { o.geometry.computeBoundingBox(); return o.geometry.boundingBox.clone().applyMatrix4(o.matrix); };
      const own = new Set(m.outfit.map(q => q.mesh)), b = box(bib.mesh);
      const under = m.body.children.filter(o => o.isMesh && !own.has(o) && o.material !== OUTLINE).map(box)
        .filter(q => q.max.x > b.min.x && q.min.x < b.max.x && q.max.y > b.min.y && q.min.y < b.max.y);
      return { bibFront: b.max.z, bibTop: b.max.y, jacketFront: Math.max(0, ...under.map(q => q.max.z)), parts: under.length };
    },
    // SPEC-041: детали шапки модели (помеченные userData.hat) → [{ piece, color, z }] (z — где в голове: сзади меньше 0); null — нет модели
    hat3D(who) {
      const m = outfitModel(who);
      return m && m.head ? m.head.children.filter(o => o.userData.hat).map(o => ({ piece: o.userData.hat, color: "#" + o.material.color.getHexString(), z: o.position.z })) : null;
    },
    // SPEC-041: лямки комбинезона против плаща: самая задняя точка лямок под плащом (в тех же x и y, в координатах модели) и передняя грань
    // ткани плаща — лямка не должна заходить за неё; null — нет лямок или плаща
    capeClear(who) {
      const m = outfitModel(who), straps = m && m.outfit && m.outfit.filter(q => q.piece === "strap"), cloth = m && m.cape && m.cape.children[0];
      if (!straps || !straps.length || !cloth) return null;
      cloth.updateMatrix(); cloth.geometry.computeBoundingBox();
      const cb = cloth.geometry.boundingBox.clone().applyMatrix4(cloth.matrix).translate(m.cape.position);
      let back = Infinity, n = 0;
      for (const { mesh } of straps) {
        mesh.updateMatrix();
        const pos = mesh.geometry.attributes.position, v = new Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix).add(m.body.position);
          if (v.x >= cb.min.x && v.x <= cb.max.x && v.y >= cb.min.y && v.y <= cb.max.y) { back = Math.min(back, v.z); n++; }
        }
      }
      return { strapBack: n ? back : null, capeFront: cb.max.z, covered: n };
    },
    wardrobe: () => ({ hat: HATS.map(({ id, price }) => ({ id, price })), jacket: JACKETS.map(({ id, price }) => ({ id, price })),
      pants: PANTS.map(({ id, price }) => ({ id, price })), big: BIG_SKINS.map(({ id, price }) => ({ id, price })), hairs: HAIRS.length }),
    // SPEC-027: рисунки вещей, имена вещей по слотам ({ slot: { id: { en, es, pt, ru } } }), наряд бота i на этом уровне (номера)
    WARDROBE_ART: Object.freeze(Object.fromEntries(Object.entries(WARDROBE_ART).map(([k, v]) => [k, Object.freeze({ ...v })]))), wardrobeNames: () => Object.fromEntries(LOOK_SLOTS.map(sl => [sl, Object.fromEntries(SLOTS[sl].map(q => [q.id, { ...q.name }]))])),
    botOutfit: i => botOutfit(i),
    // SPEC-028: все имена-объекты одежды и образов Большого по спискам (копии): { hair, hat, jacket, pants, big: [{ en, es, pt, ru }] }
    itemNames: () => Object.fromEntries(Object.entries({ hair: HAIRS, hat: HATS, jacket: JACKETS, pants: PANTS, big: BIG_SKINS }).map(([k, l]) => [k, l.map(q => ({ ...q.name }))])),
    REWARD, get winPanel() { return ui.winPanel && { ...ui.winPanel }; },   // SPEC-009: числа награды; рамка строк награды на экране победы
    seedRandom,     // SPEC-008: seedRandom(n) — игровая случайность rng() с зерна n; seedRandom() — снова случайно
    sim, simRun: (seconds, dt) => simRun(seconds, dt, stepGame), get events() { return orderedEvents().map(e => ({ ...e })); },   // SPEC-008: режим симуляции, журнал событий (копии)
    ledger: () => ledger.map(e => ({ ...e })),   // SPEC-009: события coins за сессию (с загрузки страницы), копии
    get rngDraws() { return rngDraws(); },   // SPEC-008: сколько раз тянули игровую случайность
    setProgress(save) { G.rewardDue = false; setLastReward(null); ui.openedWorld = null; ui.worldBanner = null; setProgress(save); },   // SPEC-008 (баланс): прогресс из сохранения (null — новый), не записывает
    levelsPerWorld,
    autopilot, autoThink: dt => runCore(() => readInputs(dt)),   // SPEC-008: autopilot(on, "careful"|"reckless") → { on, style }; autoThink(dt) — только решение (для теста)
    autoStick: i => G.autoMove[i] ? { x: G.autoMove[i].x, y: G.autoMove[i].y } : null,   // SPEC-019: «стик» автопилота игрока i после autoThink (копия)
    get strictRng() { return strictRng; }, set strictRng(v) { setStrictRng(!!v); },   // SPEC-008: тесты — генератор/3D с игровым rng() падает
    // SPEC-008 AC 10: карточки магазина простыми данными (без функций); picture — у карточки есть картинка
    shopCards: () => shopCards().map(({ k, price, packN, name, desc }) => ({ k, price, packN, name, desc, picture: k in SHOP_PICTURES })),
    loadProgress,   // SPEC-018 (тесты): чистая функция «сохранение → прогресс», та же, что при запуске; игру не трогает
    // SPEC-005 (телефон): phone; camera — позиция и точка взгляда в единицах 3D (1 = клетка), точка взгляда и видимая земля в px мира,
    // ahead — забегание вперёд (px); shake — тряска сейчас
    phone: PHONE, get shake() { return ui.shake; },
    get camera() {
      const v = q => ({ x: q.x, y: q.y, z: q.z });
      return { pos3: v(camera.position), look3: v(camLook), target: { x: camLook.x * CELL, y: camLook.z * CELL }, aspect: camera.aspect,
        rect: camRect(), zoom: PHONE ? cam.zoom : 1, dist: camDist, ahead: { x: cam.lax, y: cam.lay } };
    },
    isStandalone, get homeInfo() { return ui.homeInfo && JSON.parse(JSON.stringify(ui.homeInfo)); }, get progressInfo() { return ui.progressInfo && JSON.parse(JSON.stringify(ui.progressInfo)); }, clothesCount, get buttonNames() { return ui.buttons.map(b => b.act.name); },
    get buttonRects() { return ui.buttons.map(b => ({ id: b.id || b.act.name, x: b.x, y: b.y, w: b.w, h: b.h, text: b.text, textW: b.textW, on: b.on })); },
    nameTagH,   // SPEC-021: высота точки имени над ногами (px мира)
    updateCamera, camSnap, stickR, updateMinimapFade, get minimapAlpha() { return mmAlpha; }, skinPanels, resetBannerTimer() { ui.bannerShownAt = -Infinity; }, showBanner,
    // SPEC-031: textFloors — самый мелкий текст телефона по видам textSizes (CSS px)
    get textSizes() { return { ...ui.textSizes }; }, get textFloors() { return { ...LOOK.PHONE_TEXT, story: LOOK.STORY_TEXT_MIN, bubble: LOOK.BUBBLE_MIN.phone }; },
    // SPEC-032 AC 12: облачка без букв (кадр сравнивается с обычным); кегль текста истории на телефоне
    get bubbleTextOff() { return ui.bubbleTextOff; }, set bubbleTextOff(v) { ui.bubbleTextOff = !!v; }, storyPx,
    get textOverflows() { return ui.textOverflows.map(q => ({ ...q })); }, get rotateShown() { return ui.rotateShown; }, get bannerRect() { return ui.bannerRect && { ...ui.bannerRect }; },
    get minimap() { return ui.mmShown ? { x: mmState.x, y: mmState.y, w: mmState.w, h: mmState.h, alpha: mmState.alpha, baseDraws: mmDraws, markers: mmState.markers.slice(0, mmCount).map(m => ({ ...m })) } : null; },
    get edgeArrows() { return ui.edgeArrows.map(a => ({ ...a })); }, get hudRects() { return ui.hudRects.map(r => ({ ...r })); }, get downDrawn() { return ui.downDrawn.map(r => ({ ...r })); },
    get sticks() { return [...sticks].map(([id, s]) => ({ id, ...s })); },
    // слой интерфейса: размер в UI px, размер холста в CSS px, scale = CSS px на UI px (SPEC-005)
    get fitCount() { return fitCount; }, rotateWall, get updateReady() { return updateReady(); }, get updateChecks() { return updateChecks(); },   // SPEC-038: how many times fit() rebuilt the canvases; the "turn your device" test
    get uiSize() { return { w: UW, h: UH, cssW: CSS_W, cssH: CSS_H, scale: CSS_W / UW }; }, toGame,
    get names() { return allNames(); }, setName, nameOf, inDanger, get stars() { return G.bonusStars; }, spawnStar, giveReward,
    get dangerZone() { return G.dangerZone; }, get safeZone() { return G.safeZone; }, get texts() { return ui.texts; }, generateLevel,
    // сетка карты (до SPEC-006 называлась world)
    grid: { COLS, ROWS, CELL, get blocked() { return Array.from(G.blocked); }, get blockedBig() { return Array.from(G.blockedBig); }, seeSolid: seeSolidAt, get bushes() { return G.bushes.map(q => ({ ...q })); },
      get obstacles() { return G.obstacles.map(o => ({ kind: o.kind, shape: o.shape, x: o.x, y: o.y, w: o.w, h: o.h, r: o.r, move: o.move, sight: o.sight })); } },
    get kisses() { return G.kisses; }, get shots() { return G.shots; }, throwKiss: kissNow, buyKisses, resetProgress, heartFill, bigBoost, fmtHearts,
    RESCUE_KIT, buyRescueKit, useRescueKit: kitNow, get kitHint() { return ui.kitHintRect; },   // SPEC-007
    // SPEC-019: бежит ли маленький i (true/false); значок над Большим; подсказка «услышал топот» (текст, чья, плашка этого кадра) или null;
    // джойстики этого кадра с кольцом «на цыпочках»
    isRunning: i => isRunning(G.littles[i]), get bigMark() { return bigMark(); },
    // SPEC-032 AC 1: кнопки 👣 игроков (включено ли «на цыпочках»); текст подсказки «услышал топот» по устройству; страницы листа обучения
    get tiptoe() { return [...ui.tiptoe]; }, heardHintText, tutorialPages,
    // SPEC-032 AC 13: the language screen of the first launch (open it, pick a language or the highlighted one), its names and highlight
    openLangScreen, chooseLang, LANG_NAMES, get langSel() { return ui.langSel; },
    get heardHint() { return heardHintOn() ? { text: heardHintText(), pi: ui.heardHintPi, rect: ui.heardHintRect && { ...ui.heardHintRect, rows: [...ui.heardHintRect.rows] } } : null; },
    get stickMarks() { return ui.stickMarks.map(q => ({ ...q })); }, get tapLines() { return [...tapLines]; },
    GLOVES, KISSES, get shopLayout() { return ui.shopLayout; },                         // SPEC-007 AC 10
    // SPEC-041: картинка карточки уровня — levelPreview(мир, n) → { canvas, data } (из кеша или построить), previewInfo — сколько построено / взято из кеша / держится
    showCard, levelPreview: (world, lv) => { previewDataOf(world, lv); return levelPreviewOf(world, lv); }, get previewInfo() { return { ...previewStats, size: previewCacheSize() }; }, clearLevelPreviews,
    levelType, levelReport, get levelInfo() { return G.levelInfo; }, get trick() { return G.trick; }, trickMeshes, worldItemMeshes, get tipCard() { return { open: ui.tip, play: ui.tipPlay, info: ui.tipInfo && { ...ui.tipInfo } }; }, openTip, closeTip, okTip, playCard, tipDue, get bellHud() { return { bell: ui.bellRect && { ...ui.bellRect }, freeze: ui.freezeRect && { ...ui.freezeRect }, freezeT: ui.freezeT }; }, clearLevelCache: () => { clearLevelCache(); clearLevelPreviews(); },   // SPEC-041: the card previews live with the level cache
     CFG: CFG_ALL, THEMES, look3D, disposeCheck, perf: perfReport, setBigFace,   // SPEC-021: look3D() — как нарисована 3D-сцена
    get banner() { return ui.banner; }, bannerAlpha,
    // всё состояние мира, которое levelReport сохраняет и возвращает (для теста «не трогает идущую игру»)
    worldState() { return JSON.stringify({ obstacles: G.obstacles, bushes: G.bushes, floors: G.floors, decor: G.decor, trees: G.trees, flowers: G.flowers, safeZone: G.safeZone, dangerZone: G.dangerZone, trick: G.trick && { name: G.trick.name, pieces: G.trick.pieces, meta: G.trick.meta }, spawns: G.spawns, reachable: Array.from(G.reachable).join(""), grids: [G.blocked, G.blockedBig, G.moveGrid, G.seeGrid, G.moveGridBig].map(g => g.join("")) }); },
    // детали 3D-карты с метками: [{ piece, color }] (для тестов оформления) и цвет текстуры земли в точке
    mapPieces() { const r = []; if (mapGroup) mapGroup.traverse(q => { if (q.userData.piece && q.material && q.material.color) r.push({ piece: q.userData.piece, color: "#" + q.material.color.getHexString(), y: q.position.y }); }); return r; },
    groundColorAt(x, y) { const d = groundCanvas.getContext("2d").getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data; return "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join(""); }
  };
  window.__bb.SIM_DRAWN = SIM_DRAWN;
  window.__bb = new Proxy(window.__bb, {
    get(t, k, r) {
      if (simMode && SIM_DRAWN.includes(/** @type {string} */ (k))) throw new Error(`sim mode: __bb.${String(k)} is drawn state and nothing is drawn — this test needs a rendered page (openGame without sim)`);
      return Reflect.get(t, k, r);
    }
  });
}
