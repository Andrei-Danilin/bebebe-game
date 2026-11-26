// SPEC-011: ui: the client state several modules write — flying texts and particles, shake, the banner, the shop tab and
// wardrobe page, the story page and scene, the map toast and swipe, the opened world, the per-frame drawn state the tests
// read (buttons, hudRects, …), the draw counters, the frame clock T. Client module (moved out of index.html in Phase C).

export const ui = {
  // SPEC-008: режим симуляции (?sim=1 или __bb.sim(true)): без 3D, без 2D, без звука, цикл кадров игру не двигает —
  // её шагает __bb.simRun. Счётчики — для теста: сколько раз рисовали 3D, 2D и сколько звуков просили (не в sim).
  renders: 0,
  draws: 0,
  // SPEC-025 AC 15b: the draw calls and triangles of the last main 3D render (its shadow pass included), for __bb.perf()
  mainPass: { calls: 0, triangles: 0 },
  sounds: 0,
  // SPEC-030: openedWorld — главный мир, который открыла победа и который карта ещё не показала (или null); worldBanner — плашка
  // «<мир> открыт!» на карте { world, t } (или null). Карта при входе (после экрана победы и заставки финала, если она есть) переходит
  // в этот мир и показывает плашку — один раз (showOpenedWorld)
  openedWorld: null,
  worldBanner: null,
  texts: [],
  particles: [],
  muted: false,
  shake: 0,
  acc: 0,                    // SPEC-034: the game-time accumulator of live play (s; < CFG.STEP between frames); a new game starts it at CFG.STEP_PHASE × CFG.STEP
  // SPEC-012 AC 5: the client's timers of the core's hints (who, how long still) and the wide-push rings { x, y, t, r }
  kitHintT: 0, kitHintPi: 0, heardHintT: 0, heardHintPi: 0, waves: [],
  tiptoe: [false, false],   // SPEC-032 AC 1: кнопка 👣 каждого игрока (касания) — на цыпочках включено; в начале уровня — выключено
  bubbleTextOff: false,     // SPEC-032 AC 12 (тесты): облачка меряются, но букв не рисуют — кадр без них сравнивается с обычным
  langSel: 0,               // SPEC-032 AC 13: the highlighted button of the language screen (index in LANGS; English at start)
  menuSpin: 0,   // SPEC-012 AC 1d: how far the Big One has turned in the menus (a view angle; the game's big.dir is untouched)
  buttons: [],
  // SPEC-025 AC 7d: generations of the button list — screenSeq goes up whenever the screen changes (screenChanged(): the mode,
  // a page, a tab, a scene page, the world, an armed button); buttonsGen is the screenSeq the list of this frame was drawn for
  // (drawUI). A tap on a list of an older generation runs nothing (input.js)
  screenSeq: 0,
  buttonsGen: 0,
  resetArmed: false,
  homeBack: /** @type {null | (() => void)} */ (null),   // SPEC-033: what goBack does on the home screen (back.js sets it: the Leave dialog); null — nothing
  kitHintRect: null,
  heardHintRect: null,
  tutorialHintRect: null,   // плашки подсказок этого кадра (рисование)
  // Надпись в начале уровня: не мешает играть; при быстром перезапуске (< BANNER_REPEAT сек) не показывается снова
  banner: null,
  bannerShownAt: -Infinity,
  shopTab: "items",
  wardrobePage: "looks",
  // ---------- SPEC-017: карта уровней ----------
  // мир карты — G.world (выбор мира — selectWorld, он же запоминает progress.lastWorld); mapSel — остановка с кольцом выбора
  // (клавиатура, геймпад) в этом мире, null — следующий уровень; toast — короткая подсказка внизу карты { text, t };
  // cardLevel — уровень открытой карточки; mapSwipe — палец/мышь, нажатые на карте (смена мира — на отпускании)
  toast: null,
  mapSwipe: null,
  // ---------- SPEC-017: история — главы по порядку и страница «Как играть» ----------
  // storyCh — глава на экране; storyBack — куда ведёт «назад» (главный экран или карточка уровня); storyPage — «chapters» или «rules»
  storyPage: "chapters",
  // ---------- SPEC-022: заставки истории ----------
  // storyScene — заставка на экране { id, page, then, mark, play }: id из SCENE_IDS, page — страница, then — что дальше (уровень, карта,
  // глава истории; null — главный экран). Открытая сама (mark) отмечается в progress.seen, когда с неё уходят (и сохраняется) —
  // второй раз сама не откроется; пересмотр из «Истории» не отмечается
  storyScene: null,
  stickMarks: [],   // SPEC-019: нарисованные в этом кадре джойстики { x, y, R, ring } (для тестов)
  // SPEC-028: строка, которая не влезла бы даже самым мелким кеглем (ширина при min × LOOK.TEXT_TEST_SCALE — так тесты изображают
  // шрифты CI), — в textOverflows этого кадра (__bb.textOverflows): fitText вылез бы за край, labelFit обрезал бы «…».
  // scaled — вызывающий уже разделил maxW на LOOK.TEXT_TEST_SCALE (надпись уровня, плашка бонусов, подпись злости)
  textOverflows: [],
  // SPEC-022: над головой папы по настроению — пар (24_effects fx_steam_left/right), тёмное облачко (fx_storm_cloud), сердечки
  // (fx_hearts); нет картинок — рисунок кодом. Точка — m.anchors.top (над головой, не наклоняется). Лёжа после банана — ничего.
  // moodInfo (для тестов) — { mood, face, sprites, cloud }
  moodInfo: null,
  // самый мелкий шрифт за кадр (UI px): по видам (title/main/hint) и всего нарисованного (drawn); где была надпись уровня
  textSizes: {},
  bannerRect: null,
  rotateShown: false,
  shopLayout: null,   // shopLayout — шаг раскладки магазина телефона (тесты)
  // ---------- Мини-карта и стрелки у края (SPEC-005, только телефон) ----------
  // mmState — один объект на все кадры; маркеры — переиспользуемые объекты (mmCount штук нарисовано в этом кадре)
  mmShown: false,
  edgeArrows: [],
  hudRects: [],
  // карта этого кадра (для тестов): { world, sel, done, tabs, stops }; карточка уровня: { world, n, title, type }
  mapState: null,
  cardInfo: null,
  cardRect: null,
  mapBgCache: null,
  // ---------- SPEC-017: история — глава (картинка и текст) или «Как играть» (правила и управление) ----------
  storyInfo: null,   // экран истории этого кадра (для тестов)
  // ---------- SPEC-022: заставка истории — картинка (комикс 8_start — по клетке), подпись, «Пропустить» и «Дальше» / «Играть» ----------
  // Компьютер: картинка над подписью; телефон: картинка слева, подпись справа. Нет картинки — заглушка истории (бумажный лист).
  // sceneInfo (для тестов) — { id, page, pages, art: "image" | "placeholder" | "fallback" | "thanks", caption, crop, bubble, panel, pieces }
  // (SPEC-026: bubble, panel; SPEC-029: "fallback" и pieces — страница обучения без своей картинки)
  sceneInfo: null,
  // SPEC-016: «Открылись бонусные миры!» на экране победы — только после победы, открывшей их (lastReward.bonusUnlocked);
  // плашка в hudRects (bonus-note), для тестов — bonusNote { text, x, y, w, h, size, textW }
  bonusNote: null,
  // строка под «Победа!»: после последнего уровня мира — «мир пройден» (SPEC-006); winLine — для тестов
  winLine: "",
  winPanel: null,
  // SPEC-026: главный экран этого кадра (тесты): bg — видимая часть menu_bg (доли ширины картинки: x — левый край, w — ширина; null —
  // картинки нет, бумажная карточка), col — колонка кнопок (UI px), paper — бумажные кнопки по порядку (зелёная, розовая, оранжевая)
  homeInfo: null,
  // страница этого кадра (тесты): числа, как нарисованы
  progressInfo: null,
  T: 0
};
// SPEC-025 AC 7d: the screen changed — the button list drawn before is stale until the next frame draws it again
export function screenChanged() { ui.screenSeq++; }
