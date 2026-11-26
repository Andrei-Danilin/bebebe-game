// SPEC-011: every text a player sees, in four languages (en, es, pt-BR, ru), the plural helpers, the language list and the
// current language (L()). Shared by the core (flying texts) and the client. The client detects and saves the language.
import { CFG } from "./core/config.js";

// Русское множественное число: ruPlural(n, ["поцелуй", "поцелуя", "поцелуев"])
const ruPlural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
// SPEC-028: португальское множественное: 1 — единственное, всё остальное (и 0) — множественное
const ptPlural = (n, one, many) => (n === 1 ? one : many);

// =====================================================================
//  ЯЗЫКИ: English (по умолчанию), Español (Argentina), Português (Brasil; SPEC-028), Русский
//  Порядок ключей I18N = LANGS. Португальский — перевод Claude (você, простые слова для детей 6–10), проверить с носителем (BACKLOG)
// =====================================================================
// SPEC-030: первая буква строки — заглавная («the Park» → «The Park»; не строка → как есть)
const capFirst = s => (typeof s === "string" && s ? s[0].toUpperCase() + s.slice(1) : String(s));
export const I18N = {
  en: {
    name: "English",
    rules: n => [
      "Sneak up BEHIND the Big One and hug him: he loses a heart",
      "If he SEES you (yellow beam), he pushes you and you fall down",
      `Friends run over and stand next to you for ${CFG.RESCUE_TIME} seconds to help you up`,
      `If nobody helps you up within ${n} s, you go home to rest for ${CFG.REST_TIME} s`,
      "Bushes hide you. Your house is safe: the Big One can't get in",
      "Grab items: speed boots, invisibility, shield — and a banana he slips on!",
      I18N.en.ruleTiptoe
    ],
    // SPEC-019: на цыпочках; подсказка, когда Большой впервые обернулся на топот игрока (клавиша — отдельно, как у спасалки)
    ruleTiptoe: "Run near Dad and he hears you — tiptoe!",
    heardHint: k => `Dad heard you running! Tiptoe near him: hold ${k}`, heardKey1: "⇦ Shift", heardKey2: "/",
    heardHintTouch: t => `Dad heard you running! ${t}`, tiptoeTap: "Tap 👣 to tiptoe",
    level: "Level", lvShort: "Lv.", onePlayer: "1 player", twoPlayers: "2 players",
    controls1: "Keyboard: Player 1 — W A S D, Player 2 — arrows  •  P — pause  •  M — sound  •  L — language",
    controls2: "Tablet/phone: drag your finger  •  Gamepad: stick, A — choose, B — back, LB/RB — worlds",
    pause: "Paused", play: "Play", resume: "Continue", story: "Story", map: "Map", home: "Home",   // SPEC-017: экраны меню
    glLost: "Tap to continue", oops: "Oops! Something went wrong", restartLevel: "Restart level",   // SPEC-025 AC 7: карточка ошибки (Продолжить — resume)
    // SPEC-025 phase 2: the save notes, the parents' gate and the grown-ups page (the reset's armed texts sure / sureShort are retired)
    saveRecovered: "We fixed your save from a backup", freshStart: "We couldn't read your save, so we started a new game", noSave: "This device isn't keeping progress",
    parentsGate: (a, b) => `For grown-ups: what is ${a} times ${b}?`, numberWords: ["three", "four", "five", "six", "seven", "eight", "nine"], gateWrong: "Not quite. Here is another one",
    forGrownUps: "For grown-ups", copyCode: "Copy my progress code", pasteCode: "Paste a code", codeCopied: "Code copied",
    importConfirm: "Replace the progress on this device with the code?", codeTooNew: "This code is from a newer version of the game", codeBad: "This code doesn't work. Check it and try again",
    undoReset: "Bring back erased progress", resetAsk: "Reset all progress?", restoreCopy: "Restore an older copy", eraseAll: "Erase all data on this device", errorLog: "Error log", copy: "Copy", version: "Version",
    win: "YOU WIN!", winSub: "You hugged him lots of times, and he went home!", next: n => `Level ${n} ▶`,
    // SPEC-022: заголовок победы — папа (босс, набранное имя) снова добрый; «Ура!» друзей, пока он идёт домой; имена боссов
    kindAgain: n => `${n} is kind again!`, cheer: "Yay!", whoosh: "WHOOSH!",
    bossNames: { park: "The park boss", field: "The coach", city: "The builder", school: "The grumpiest dad" },
    lose: "The Big One won...", loseSub: (h, m) => `Hearts taken: ${h} of ${m}. Try again?`, again: "Try again",
    big: "Big One", hug: "Hug! -1", bang: "BAM!", saved: "Saved!", out: "Going home to rest", back: "Back in the game!", resting: (n, t) => `${n}: resting… back in ${t}`, help: n => `${n}: HELP!`,
    touch1: "Drag your finger on the screen to run", touch2: "Player 1: finger on the left  •  Player 2: on the right",
    rotate: "Turn your device sideways ↻", me: "Me", botChip: "B", safe: "SAFE",
    player1: "Player 1", player2: "Player 2", ok: "OK",
    slots: { hair: "Hair", hat: "Hat", jacket: "Jacket", pants: "Pants", look: "Look" },
    worlds: { park: "Park", field: "Football field", city: "City", school: "School", beach: "Beach", winter: "Winter" },
    // SPEC-030: имя мира как дополнение — с артиклем (en, es, pt), в винительном падеже (ru): «Finish the Park…», «Пройди Школу…»
    worldsObj: { park: "the Park", field: "the Football field", city: "the City", school: "the School", beach: "the Beach", winter: "the Winter" }, worldDone: (w, key) => `You finished the ${w}!`,
    bonus: "Bonus", bonusUnlocked: "Bonus worlds unlocked!",
    items: { boots: "Speed boots!", cloak: "Invisible!", shield: "Shield!" }, blocked: "Blocked!", slip: "Whoops!",
    character: "Character", progressTab: "Progress", bag: "Bag", clothes: (n, m) => `Clothes: ${n} / ${m}`, buy: "Get", have: n => `You have: ${n} power ${n === 1 ? "hug" : "hugs"}`, wears: "wears", none: "None",
    gloves: { mittens: "Warm mittens", mega: "Mega hug mittens" }, gloveDesc: p => `Each hug takes ${p} hearts`,
    pack: n => `Pack: ${n} power hugs`, notEnough: "Not enough coins", reset: "Reset progress", resetCancel: "No, keep it", resetCancelShort: "Keep it", resetShort: "Reset", resetConfirm: "Yes, erase everything",
    victory: "Victory", nobodyOut: "Nobody had to rest", fast: t => `Fast: under ${t}`, forHugs: n => `+${n} for hugs`,
    megaHug: p => `Power hug! -${p}`, coinsWord: "coins",
    // SPEC-009: строки награды на экране победы
    buyFor: n => `Get for 🪙 ${n}`, tapAgain: "Tap again to get it",   // SPEC-009: гардероб
    itemsTab: "Items", wardrobeTab: "Wardrobe", upgradesTab: "Upgrades", upgMax: "Max",   // SPEC-017: + гардероб
    worldsDone: (n, max) => `Worlds finished: ${n} / ${max}`, comicSoon: "Comic coming soon",
    lockedLevel: n => `Win level ${n} first`, lockedBonus: "Win all levels of the main worlds to open", boss: "Boss",
    // SPEC-030: главные миры по порядку (аргументы — ключи миров; тексты — Claude)
    lockedWorld: (prev, next) => `Finish ${I18N.en.worldsObj[prev]} to open ${I18N.en.worldsObj[next]}!`, worldOpened: w => `${capFirst(I18N.en.worldsObj[w])} is open!`, done: "✔ Done!",   // SPEC-017: карта
    // SPEC-017: карточка уровня — строка про тип уровня и про босса (уровень 20); история — главы, «Как играть»
    typeLines: { classic: "Our own drawing — the very first map!", meadow: "Open grass — hide in the bushes!", village: "Little houses — sneak around the corners!",
      river: "A river with bridges — choose your way across!", rooms: "A big house — peek through the doors!", arena: "A ring to run around — get behind him!",
      maze: "A maze — find the way between the walls!" },
    // SPEC-022: строка карточки 20-го уровня — по истории Кости: в Школе самый злой папа, в других мирах — главный папа мира (босс)
    bossLine: { park: "Boss: the main dad of the Park. He is stronger than ordinary dads!", field: "Boss: the main dad of the Football field. He is stronger than ordinary dads!",
      city: "Boss: the main dad of the City. He is stronger than ordinary dads!", school: "The grumpiest dad! He can push several kids at once!" },
    // SPEC-022: заставки истории — кнопки («next» занято: кнопка следующего уровня), карточка «Спасибо» после финала
    sceneNext: "Next", sceneSkip: "Skip", thanks: "Thank you for playing!", madeBy: "Made by Kostya and Dad",
    // SPEC-029: обучение — подписи страниц A, B, C (по клетке; A4 — клавиша или джойстик), последняя страница, кнопка «Тренировка»
    tut: {
      a: k => ["Sneak up behind Dad and hug him! Every hug takes away one angry heart.", "If Dad sees you, he pushes — and you fall down!",
        "A friend fell? Stand next to them to help them up. Friends help you too!", `Dad hears running behind him. Close to him, tiptoe! (${k})`],
      tiptoeKey: "hold Shift", tiptoeTouch: "tap 👣",
      b: ["Speed boots: you run faster!", "Invisibility cloak: Dad can't see you!", "Shield: Dad can't push you!",
        "Banana! Lead Dad onto it — he slips, and you can hug him from any side!"],
      c: ["Air kisses 💋: send one from far away. Dad loses half a heart and blushes!", "Rescue kit 🩹: fell down? Get up at once!",
        "Warm mittens: each hug takes 2 hearts. Mega mittens: 3!", "Win levels, get coins, and pick all this up in Character!"],
      ready: "You're ready! Let's make the dads kind again!", practice: "Practice",
      introLine: "Let's learn how to make the dads kind again!", introGo: "Let's learn!",   // SPEC-033: the How to play card
      // подсказки тренировки 1 (по шагам)
      g1rescue: "Your friend fell! Run to them and stand close to help them up.", g1sneak: k => `Now sneak behind Dad — tiptoe close to him! (${k})`,
      g1hug: "Hug him from behind — 3 times!",
      // подсказки тренировки 2 (по одной); клавиша или кнопка — по устройству
      g2item: "Grab an item!", g2banana: "Lead Dad onto a banana!", g2kiss: k => `Send an air kiss 💋 (${k})`, g2kit: k => `Use the rescue kit 🩹 to get up! (${k})`,
      kissKey: "press E", kissTouch: "tap the 💋 button", kitKey: "press Q", kitTouch: "tap 🩹"
    },
    pictures: "Pictures", sceneBack: "Back",   // SPEC-032 AC 8: «Картинки» на «Как играть»; «◀ Назад» листалки
    chapters: { began: "How it began", ended: "How it ended" }, endedLocked: "Win level 20 at the School to read the ending", howToPlay: "How to play",
    upg: { fastFeet: { name: "Fast feet", desc: p => `+${p}% speed` }, longItems: { name: "Long items", desc: () => "Items last longer" },
      quickHelp: { name: "Quick help", desc: () => "Lift friends faster" } },
    rw: { firstWin: "First win", replay: "Replay", newStars: "New stars", star: "Bonus stars", hugs: "Hugs", rests: "Rests", total: "Total" },
    starCoins: n => `Bonus stars: +${n}`, thrownOut: "Get out of my house!", friends: "Friends", tapToRename: "Tap a name to change it",
    // SPEC-022: сердечки Большого — злость папы; имя по умолчанию — Папа (набранное имя остаётся: «злость <имя>»)
    defaultBig: "Dad", defaultBots: ["Bo", "Mia", "Tom", "Lulu"], anger: "Dad's anger", angerOf: n => `${n}'s anger`,
    kisses: "Air kisses", kissDesc: "Send from afar: ½ heart and he blushes", kissPack: n => `Pack: ${n} air kisses`,
    kissHave: n => `You have: ${n} ${n === 1 ? "kiss" : "kisses"}`, kissHit: "Mwah!", noKissHome: "Not from the house!", blush: "So shy!",
    kit: "Rescue kit", kitDesc: "Get up at once and play on", kitPack: n => `Pack: ${n} rescue kits`, kitHave: n => `You have: ${n} ${n === 1 ? "kit" : "kits"}`,
    kitUsed: "Back in the game!", kitHint: "Press 🩹 to get up!", kitKey1: "Q", kitKey2: "Shift ⇨", packShort: n => `📦 ×${n}`,
    types: { classic: "Our drawing", meadow: "Meadow", maze: "Maze", village: "Village", river: "River with bridges", rooms: "House with rooms", arena: "Ring arena" },
    levelIntro: (w, n, t) => `${w} · Level ${n}: ${t}`, levelIntroShort: (w, n, t) => `${w} · ${n}: ${t}`, levelIntroTiny: (w, n, t) => `${n}: ${t}`, worldStars: (n, max) => `⭐ ${n}/${max}`
  },
  es: {
    name: "Español",
    rules: n => [
      "Acercate al Grandote POR DETRÁS y abrazalo: pierde un corazón",
      "Si te VE (rayo amarillo), te empuja y te caés",
      `Tus amigos vienen y se quedan ${CFG.RESCUE_TIME} segundos al lado tuyo para ayudarte`,
      `Si nadie te ayuda a levantarte en ${n} segundos, te vas a casa a descansar ${CFG.REST_TIME} segundos`,
      "En los arbustos no te ve. Tu casa es segura: el Grandote no puede entrar",
      "Agarrá cosas: zapatillas veloces, invisibilidad, escudo ¡y una banana para que se resbale!",
      I18N.es.ruleTiptoe
    ],
    ruleTiptoe: "Si corrés cerca de papá, te escucha: ¡andá en puntitas de pie!",
    heardHint: k => `¡Papá te escuchó correr! Cerca de él andá en puntitas: mantené ${k}`, heardKey1: "⇦ Shift", heardKey2: "/",
    heardHintTouch: t => `¡Papá te escuchó correr! ${t}`, tiptoeTap: "Tocá 👣 para ir en puntitas",
    level: "Nivel", lvShort: "Niv.", onePlayer: "1 jugador", twoPlayers: "2 jugadores",
    controls1: "Teclado: Jugador 1 — W A S D, Jugador 2 — flechas  •  P — pausa  •  M — sonido  •  L — idioma",
    controls2: "Tablet/celu: deslizá el dedo  •  Joystick: palanca, A — elegir, B — volver, LB/RB — mundos",
    pause: "Pausa", play: "Jugar", resume: "Seguir", story: "Historia", map: "Mapa", home: "Inicio",
    glLost: "Tocá para seguir", oops: "¡Uy! Algo salió mal", restartLevel: "Reiniciar nivel",   // SPEC-025 AC 7: карточка ошибки (Продолжить — resume)
    // SPEC-025 phase 2: las notas del guardado, la pregunta para adultos y la página para adultos
    saveRecovered: "Arreglamos tu partida con una copia", freshStart: "No pudimos leer tu partida, así que empezamos una nueva", noSave: "Este dispositivo no está guardando el progreso",
    parentsGate: (a, b) => `Para adultos: ¿cuánto es ${a} por ${b}?`, numberWords: ["tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"], gateWrong: "No es así. Probá con esta otra",
    forGrownUps: "Para adultos", copyCode: "Copiar mi código", pasteCode: "Pegar un código", codeCopied: "Código copiado",
    importConfirm: "¿Reemplazar el progreso de este dispositivo con el código?", codeTooNew: "Este código es de una versión más nueva del juego", codeBad: "Este código no funciona. Revisalo y probá de nuevo",
    undoReset: "Recuperar el progreso borrado", resetAsk: "¿Borrar todo el progreso?", restoreCopy: "Volver a una copia anterior", eraseAll: "Borrar todos los datos de este dispositivo", errorLog: "Registro de errores", copy: "Copiar", version: "Versión",
    win: "¡GANARON!", winSub: "¡Lo abrazaron muchas veces y se fue a su casa!", next: n => `Nivel ${n} ▶`,
    kindAgain: n => `¡${n} volvió a ser bueno!`, cheer: "¡Bien!", whoosh: "¡FIUUU!",
    bossNames: { park: "El jefe del parque", field: "El entrenador", city: "El albañil", school: "El papá más enojado" },
    lose: "Ganó el Grandote...", loseSub: (h, m) => `Corazones: ${h} de ${m}. ¿Otra vez?`, again: "Otra vez",
    big: "Grandote", hug: "¡Abrazo! -1", bang: "¡PUM!", saved: "¡Salvado!", out: "Me voy a descansar", back: "¡De vuelta!", resting: (n, t) => `${n}: descansando… volvés en ${t}`, help: n => `${n}: ¡AYUDA!`,
    touch1: "Deslizá el dedo por la pantalla para correr", touch2: "Jugador 1: dedo a la izquierda  •  Jugador 2: a la derecha",
    rotate: "Girá el dispositivo ↻", me: "Yo", botChip: "B", safe: "ZONA SEGURA",
    player1: "Jugador 1", player2: "Jugador 2", ok: "Listo",
    slots: { hair: "Pelo", hat: "Gorro", jacket: "Campera", pants: "Pantalón", look: "Aspecto" },
    worlds: { park: "Parque", field: "Cancha", city: "Ciudad", school: "Escuela", beach: "Playa", winter: "Invierno" },
    worldsObj: { park: "el Parque", field: "la Cancha", city: "la Ciudad", school: "la Escuela", beach: "la Playa", winter: "el Invierno" }, worldDone: (w, key) => `¡Terminaste ${w}!`,
    bonus: "Bonus", bonusUnlocked: "¡Se abrieron los mundos bonus!",
    items: { boots: "¡Zapatillas veloces!", cloak: "¡Invisible!", shield: "¡Escudo!" }, blocked: "¡Bloqueado!", slip: "¡Upa!",
    character: "Personaje", progressTab: "Progreso", bag: "Mochila", clothes: (n, m) => `Ropa: ${n} / ${m}`, buy: "Conseguir", have: n => `Tenés: ${n} ${n === 1 ? "abrazo potente" : "abrazos potentes"}`, wears: "usa", none: "Nada",
    gloves: { mittens: "Mitones abrigados", mega: "Mitones del abrazo gigante" }, gloveDesc: p => `Cada abrazo saca ${p} corazones`,
    pack: n => `Paquete: ${n} abrazos potentes`, notEnough: "No te alcanzan las monedas", reset: "Borrar progreso", resetCancel: "No, dejalo", resetCancelShort: "Dejalo", resetShort: "Borrar", resetConfirm: "Sí, borrar todo",
    victory: "Victoria", nobodyOut: "Nadie tuvo que descansar", fast: t => `Rápido: menos de ${t}`, forHugs: n => `+${n} por los abrazos`,
    megaHug: p => `¡Abrazo potente! -${p}`, coinsWord: "monedas",
    buyFor: n => `Conseguir por 🪙 ${n}`, tapAgain: "Tocá otra vez para conseguirlo",
    itemsTab: "Cosas", wardrobeTab: "Ropa", upgradesTab: "Mejoras", upgMax: "Máximo",
    worldsDone: (n, max) => `Mundos terminados: ${n} / ${max}`, comicSoon: "El cómic llega pronto",
    lockedLevel: n => `Primero ganá el nivel ${n}`, lockedBonus: "Ganá todos los niveles de los mundos principales para abrirlo", boss: "Jefe",
    lockedWorld: (prev, next) => `¡Terminá ${I18N.es.worldsObj[prev]} para abrir ${I18N.es.worldsObj[next]}!`,
    worldOpened: w => `¡${capFirst(I18N.es.worldsObj[w])} está ${["field", "city", "school", "beach"].includes(w) ? "abierta" : "abierto"}!`, done: "✔ ¡Listo!",   // род — по ключу мира
    typeLines: { classic: "¡Nuestro dibujo, el primer mapa de todos!", meadow: "Pasto abierto: ¡escondete en los arbustos!", village: "Casitas: ¡andá a escondidas por las esquinas!",
      river: "Un río con puentes: ¡elegí por dónde cruzar!", rooms: "Una casa grande: ¡espiá por las puertas!", arena: "Una pista en ronda: ¡ponete detrás de él!",
      maze: "Un laberinto: ¡buscá el camino entre las paredes!" },
    bossLine: { park: "Jefe: el papá principal del Parque. ¡Es más fuerte que los papás comunes!", field: "Jefe: el papá principal de la Cancha. ¡Es más fuerte que los papás comunes!",
      city: "Jefe: el papá principal de la Ciudad. ¡Es más fuerte que los papás comunes!", school: "¡El papá más enojado! ¡Puede empujar a varios chicos a la vez!" },
    sceneNext: "Siguiente", sceneSkip: "Saltar", thanks: "¡Gracias por jugar!", madeBy: "Hecho por Kostya y papá",
    tut: {
      a: k => ["¡Acercate a Papá por detrás y abrazalo! Cada abrazo le saca un corazón enojado.", "Si Papá te ve, te empuja… ¡y te caés!",
        "¿Se cayó un amigo? Parate al lado para ayudarlo a levantarse. ¡Tus amigos también te ayudan!", `Papá escucha si corrés detrás de él. Cerca de él, ¡andá en puntitas! (${k})`],
      tiptoeKey: "mantené Shift", tiptoeTouch: "tocá 👣",
      b: ["Zapatillas veloces: ¡corrés más rápido!", "Capa de invisibilidad: ¡Papá no te ve!", "Escudo: ¡Papá no te puede empujar!",
        "¡Banana! Llevá a Papá hasta ella: se resbala, ¡y lo podés abrazar de cualquier lado!"],
      c: ["Besitos voladores 💋: mandá uno de lejos. ¡Papá pierde medio corazón y se pone colorado!", "Curita mágica 🩹: ¿te caíste? ¡Levantate al toque!",
        "Mitones abrigados: cada abrazo saca 2 corazones. ¡Los mitones gigantes, 3!", "¡Ganá niveles, juntá monedas y conseguí todo esto en Personaje!"],
      ready: "¡Ya estás listo! ¡Vamos a hacer que los papás vuelvan a ser buenos!", practice: "Practicar",
      introLine: "¡Aprendamos a hacer que los papás vuelvan a ser buenos!", introGo: "¡A aprender!",
      g1rescue: "¡Tu amigo se cayó! Corré hasta él y quedate cerca para ayudarlo a levantarse.", g1sneak: k => `Ahora acercate a Papá por detrás: ¡en puntitas cerca de él! (${k})`,
      g1hug: "¡Abrazalo por detrás, 3 veces!",
      g2item: "¡Agarrá un objeto!", g2banana: "¡Llevá a Papá hasta una banana!", g2kiss: k => `Mandá un besito volador 💋 (${k})`, g2kit: k => `¡Usá la curita mágica 🩹 para levantarte! (${k})`,
      kissKey: "apretá E", kissTouch: "tocá el botón 💋", kitKey: "apretá Q", kitTouch: "tocá 🩹"
    },
    pictures: "Dibujos", sceneBack: "Atrás",
    chapters: { began: "Cómo empezó", ended: "Cómo terminó" }, endedLocked: "Ganá el nivel 20 de la Escuela para leer el final", howToPlay: "Cómo se juega",
    upg: { fastFeet: { name: "Pies rápidos", desc: p => `+${p}% velocidad` }, longItems: { name: "Cosas duraderas", desc: () => "Duran más" },
      quickHelp: { name: "Ayuda rápida", desc: () => "Levantás más rápido" } },
    rw: { firstWin: "Primera vez", replay: "Repetición", newStars: "Estrellas nuevas", star: "Estrellitas", hugs: "Abrazos", rests: "Descansos", total: "Total" },
    starCoins: n => `Estrellitas: +${n}`, thrownOut: "¡Fuera de mi casa!", friends: "Amigos", tapToRename: "Tocá un nombre para cambiarlo",
    defaultBig: "Papá", defaultBots: ["Tito", "Mora", "Lupe", "Facu"], anger: "Enojo de papá", angerOf: n => `Enojo de ${n}`,
    kisses: "Besitos voladores", kissDesc: "Mandalo de lejos: ½ corazón y se pone colorado", kissPack: n => `Paquete: ${n} besitos voladores`,
    kissHave: n => `Tenés: ${n} ${n === 1 ? "besito" : "besitos"}`, kissHit: "¡Muak!", noKissHome: "¡Desde la casita no!", blush: "¡Qué vergüenza!",
    kit: "Curita mágica", kitDesc: "Levantate al toque y seguí jugando", kitPack: n => `Paquete: ${n} curitas`, kitHave: n => `Tenés: ${n} ${n === 1 ? "curita" : "curitas"}`,
    kitUsed: "¡De vuelta al juego!", kitHint: "¡Tocá 🩹 para levantarte!", kitKey1: "Q", kitKey2: "Shift ⇨", packShort: n => `📦 ×${n}`,
    types: { classic: "Nuestro dibujo", meadow: "Pradera", maze: "Laberinto", village: "Pueblito", river: "Río con puentes", rooms: "Casa con cuartos", arena: "Arena" },
    levelIntro: (w, n, t) => `${w} · Nivel ${n}: ${t}`, levelIntroShort: (w, n, t) => `${w} · ${n}: ${t}`, levelIntroTiny: (w, n, t) => `${n}: ${t}`, worldStars: (n, max) => `⭐ ${n}/${max}`
  },
  // SPEC-028: português do Brasil — «você», короткие простые фразы; слова игры: abraço, Papai, bonzinho, bravo, moedas, kit de resgate,
  // beijinhos, cupcake; Большой — Grandão; уровень — «fase» (так говорят в играх); сильная обнимашка — superabraço
  pt: {
    name: "Português",
    rules: n => [
      "Chegue POR TRÁS do Grandão e dê um abraço: ele perde um coração",
      "Se ele te VÊ (raio amarelo), ele te empurra e você cai",
      `Os amigos vêm e ficam ${CFG.RESCUE_TIME} segundos do seu lado para te levantar`,
      `Se ninguém te ajudar a levantar em ${n} s, você vai para casa descansar ${CFG.REST_TIME} s`,
      "Nos arbustos ele não te vê. Sua casa é segura: o Grandão não entra",
      "Pegue itens: botas rápidas, invisibilidade, escudo — e uma banana para ele escorregar!",
      I18N.pt.ruleTiptoe
    ],
    ruleTiptoe: "Correu perto do Papai? Ele escuta — ande na ponta dos pés!",
    // SPEC-028: на бразильской клавиатуре (ABNT2) на клавише «/» американской раскладки написано «;»
    heardHint: k => `O Papai ouviu você correr! Perto dele, ande na ponta dos pés: segure ${k}`, heardKey1: "⇦ Shift", heardKey2: "/ (;)",
    heardHintTouch: t => `O Papai ouviu você correr! ${t}`, tiptoeTap: "Toque 👣 para andar na ponta dos pés",
    level: "Fase", lvShort: "Fase", onePlayer: "1 jogador", twoPlayers: "2 jogadores",
    controls1: "Teclado: Jogador 1 — W A S D, Jogador 2 — setas  •  P — pausa  •  M — som  •  L — idioma",
    controls2: "Tablet/celular: arraste o dedo  •  Controle: analógico, A — escolher, B — voltar, LB/RB — mundos",
    pause: "Pausa", play: "Jogar", resume: "Continuar", story: "História", map: "Mapa", home: "Início",
    glLost: "Toque para continuar", oops: "Ops! Algo deu errado", restartLevel: "Recomeçar a fase",   // SPEC-025 AC 7: карточка ошибки (Продолжить — resume)
    // SPEC-025 phase 2: os avisos do progresso salvo, a pergunta para adultos e a página para adultos
    saveRecovered: "Recuperamos seu progresso de uma cópia", freshStart: "Não conseguimos ler seu progresso, então começamos um jogo novo", noSave: "Este aparelho não está salvando o progresso",
    parentsGate: (a, b) => `Para adultos: quanto é ${a} vezes ${b}?`, numberWords: ["três", "quatro", "cinco", "seis", "sete", "oito", "nove"], gateWrong: "Não é bem isso. Tente esta aqui",
    forGrownUps: "Para adultos", copyCode: "Copiar meu código de progresso", pasteCode: "Colar um código", codeCopied: "Código copiado",
    importConfirm: "Substituir o progresso deste aparelho pelo do código?", codeTooNew: "Este código é de uma versão mais nova do jogo", codeBad: "Este código não funciona. Confira e tente de novo",
    undoReset: "Recuperar o progresso apagado", resetAsk: "Apagar todo o progresso?", restoreCopy: "Voltar para uma cópia anterior", eraseAll: "Apagar todos os dados deste aparelho", errorLog: "Registro de erros", copy: "Copiar", version: "Versão",
    win: "VOCÊS GANHARAM!", winSub: "Vocês deram muitos abraços nele, e ele foi para casa!", next: n => `Fase ${n} ▶`,
    kindAgain: n => `${n} ficou bonzinho!`, cheer: "Eba!", whoosh: "VUUUSH!",   // SPEC-028: kindAgain без «de novo» — длинное имя босса не влезало (шрифты CI)
    bossNames: { park: "O chefe do parque", field: "O treinador", city: "O construtor", school: "O papai mais bravo" },
    lose: "Perdemos…", loseSub: (h, m) => `Corações: ${h} de ${m}. Mais uma vez?`, again: "De novo",
    big: "Grandão", hug: "Abraço! -1", bang: "BUM!", saved: "Salvo!", out: "Vou descansar", back: "De volta ao jogo!", resting: (n, t) => `${n}: descansando… volta em ${t}`, help: n => `${n}: SOCORRO!`,
    touch1: "Arraste o dedo na tela para correr", touch2: "Jogador 1: dedo à esquerda  •  Jogador 2: à direita",
    rotate: "Vire o aparelho de lado ↻", me: "Eu", botChip: "B", safe: "SEGURO",
    player1: "Jogador 1", player2: "Jogador 2", ok: "OK",
    slots: { hair: "Cabelo", hat: "Chapéu", jacket: "Jaqueta", pants: "Calça", look: "Visual" },
    worlds: { park: "Parque", field: "Campo de futebol", city: "Cidade", school: "Escola", beach: "Praia", winter: "Inverno" },
    worldsObj: { park: "o Parque", field: "o Campo de futebol", city: "a Cidade", school: "a Escola", beach: "a Praia", winter: "o Inverno" },
    // артикль по миру: a Cidade, a Escola, a Praia; o Parque, o Campo de futebol, o Inverno
    worldDone: (w, key) => `Você terminou ${key === "city" || key === "school" || key === "beach" ? "a" : "o"} ${w}!`,
    bonus: "Bônus", bonusUnlocked: "Mundos bônus liberados!",
    items: { boots: "Botas rápidas!", cloak: "Invisível!", shield: "Escudo!" }, blocked: "Bloqueado!", slip: "Opa!",
    character: "Personagem", progressTab: "Progresso", bag: "Mochila", clothes: (n, m) => `Roupas: ${n} / ${m}`, buy: "Pegar", have: n => `Você tem: ${n} ${ptPlural(n, "superabraço", "superabraços")}`, wears: "usa", none: "Nada",
    gloves: { mittens: "Luvas quentinhas", mega: "Luvas gigantes" }, gloveDesc: p => `Cada abraço tira ${p} corações`,
    pack: n => `Pacote: ${n} ${ptPlural(n, "superabraço", "superabraços")}`, notEnough: "Faltam moedas", reset: "Apagar progresso", resetCancel: "Não, deixe como está", resetCancelShort: "Deixe", resetShort: "Apagar", resetConfirm: "Sim, apagar tudo",
    victory: "Vitória", nobodyOut: "Ninguém descansou", fast: t => `Rápido: menos de ${t}`, forHugs: n => `+${n} pelos abraços`,
    megaHug: p => `Superabraço! -${p}`, coinsWord: "moedas",
    buyFor: n => `Pegar por 🪙 ${n}`, tapAgain: "Toque de novo para pegar",
    itemsTab: "Itens", wardrobeTab: "Guarda-roupa", upgradesTab: "Melhorias", upgMax: "Máximo",
    worldsDone: (n, max) => `Mundos terminados: ${n} / ${max}`, comicSoon: "Quadrinho em breve",
    lockedLevel: n => `Primeiro vença a fase ${n}`, lockedBonus: "Vença todas as fases dos mundos principais para abrir", boss: "Chefe",
    lockedWorld: (prev, next) => `Termine ${I18N.pt.worldsObj[prev]} para abrir ${I18N.pt.worldsObj[next]}!`,
    worldOpened: w => `${capFirst(I18N.pt.worldsObj[w])} está ${["city", "school", "beach"].includes(w) ? "aberta" : "aberto"}!`, done: "✔ Feito!",
    typeLines: { classic: "Nosso desenho — o primeiro mapa de todos!", meadow: "Grama aberta — se esconda nos arbustos!", village: "Casinhas — chegue de fininho pelas esquinas!",
      river: "Um rio com pontes — escolha por onde passar!", rooms: "Uma casa grande — espie pelas portas!", arena: "Uma pista redonda — chegue por trás dele!",
      maze: "Um labirinto — ache a saída entre as paredes!" },
    bossLine: { park: "Chefe: o papai principal do Parque. Ele é mais forte que os papais comuns!", field: "Chefe: o papai principal do Campo de futebol. Ele é mais forte que os papais comuns!",
      city: "Chefe: o papai principal da Cidade. Ele é mais forte que os papais comuns!", school: "O papai mais bravo! Ele pode empurrar várias crianças de uma vez!" },
    sceneNext: "Próximo", sceneSkip: "Pular", thanks: "Obrigado por jogar!", madeBy: "Feito por Kostya e Papai",
    tut: {
      a: k => ["Chegue por trás do Papai e dê um abraço! Cada abraço tira um coração bravo.", "Se o Papai te vê, ele empurra — e você cai!",
        "Um amigo caiu? Fique pertinho dele para ajudar a levantar. Os amigos também te ajudam!", `O Papai ouve quem corre atrás dele. Perto dele, ande na ponta dos pés! (${k})`],
      tiptoeKey: "segure Shift", tiptoeTouch: "toque 👣",
      b: ["Botas rápidas: você corre mais rápido!", "Capa de invisibilidade: o Papai não te vê!", "Escudo: o Papai não consegue te empurrar!",
        "Banana! Leve o Papai até ela — ele escorrega, e você pode abraçar de qualquer lado!"],
      c: ["Beijinhos 💋: mande um de longe. O Papai perde meio coração e fica vermelho!", "Kit de resgate 🩹: caiu? Levante na hora!",
        "Luvas quentinhas: cada abraço tira 2 corações. Luvas gigantes: 3!", "Vença fases, ganhe moedas e pegue tudo isso em Personagem!"],
      ready: "Você está pronto! Vamos deixar os papais bonzinhos de novo!", practice: "Praticar",
      introLine: "Vamos aprender a deixar os papais bonzinhos de novo!", introGo: "Vamos lá!",
      g1rescue: "Seu amigo caiu! Corra até ele e fique pertinho para ajudar a levantar.", g1sneak: k => `Agora chegue por trás do Papai — perto dele, na ponta dos pés! (${k})`,
      g1hug: "Abrace ele por trás — 3 vezes!",
      g2item: "Pegue um item!", g2banana: "Leve o Papai até uma banana!", g2kiss: k => `Mande um beijinho 💋 (${k})`, g2kit: k => `Use o kit de resgate 🩹 para levantar! (${k})`,
      kissKey: "aperte E", kissTouch: "toque no botão 💋", kitKey: "aperte Q", kitTouch: "toque em 🩹"
    },
    pictures: "Figuras", sceneBack: "Voltar",
    chapters: { began: "Como tudo começou", ended: "Como tudo terminou" }, endedLocked: "Vença a fase 20 da Escola para ler o final", howToPlay: "Como jogar",
    upg: { fastFeet: { name: "Pés rápidos", desc: p => `+${p}% de velocidade` }, longItems: { name: "Itens duradouros", desc: () => "Duram mais" },
      quickHelp: { name: "Ajuda rápida", desc: () => "Levante os amigos mais rápido" } },
    rw: { firstWin: "Primeira vitória", replay: "Jogou de novo", newStars: "Estrelas novas", star: "Estrelinhas", hugs: "Abraços", rests: "Descansos", total: "Total" },
    starCoins: n => `Estrelinhas: +${n}`, thrownOut: "Fora da minha casa!", friends: "Amigos", tapToRename: "Toque num nome para mudar",
    defaultBig: "Papai", defaultBots: ["Léo", "Bia", "Davi", "Lulu"], anger: "Papai bravo", angerOf: n => `${n} bravo`,
    kisses: "Beijinhos", kissDesc: "Mande de longe: ½ coração e ele fica vermelho", kissPack: n => `Pacote: ${n} ${ptPlural(n, "beijinho", "beijinhos")}`,
    kissHave: n => `Você tem: ${n} ${ptPlural(n, "beijinho", "beijinhos")}`, kissHit: "Muá!", noKissHome: "Da casinha não!", blush: "Que vergonha!",
    kit: "Kit de resgate", kitDesc: "Levante na hora e continue jogando", kitPack: n => `Pacote: ${n} ${ptPlural(n, "kit", "kits")}`, kitHave: n => `Você tem: ${n} ${ptPlural(n, "kit", "kits")}`,
    kitUsed: "De volta ao jogo!", kitHint: "Aperte 🩹 para levantar!", kitKey1: "Q", kitKey2: "Shift ⇨", packShort: n => `📦 ×${n}`,
    types: { classic: "Nosso desenho", meadow: "Gramado", maze: "Labirinto", village: "Vila", river: "Rio com pontes", rooms: "Casa com quartos", arena: "Arena" },
    levelIntro: (w, n, t) => `${w} · Fase ${n}: ${t}`, levelIntroShort: (w, n, t) => `${w} · ${n}: ${t}`, levelIntroTiny: (w, n, t) => `${n}: ${t}`, worldStars: (n, max) => `⭐ ${n}/${max}`
  },
  ru: {
    name: "Русский",
    rules: n => [
      "Подкрадись к Большому СЗАДИ и обними — минус сердечко",
      "Увидит тебя (жёлтый луч) — толкнёт, и ты упадёшь",
      `Друзья подбегают и стоят рядом ${CFG.RESCUE_TIME} сек — ты снова в игре`,
      `Никто не помог встать за ${n} сек — идёшь домой отдыхать ${CFG.REST_TIME} сек`,
      "В кустах Большой не видит. Домик — безопасная зона, Большой туда не зайдёт",
      "Собирай предметы: сапоги-скороходы, невидимку, щит — и банан, на котором он поскользнётся!",
      I18N.ru.ruleTiptoe
    ],
    ruleTiptoe: "Бежишь рядом с папой — он слышит. Иди на цыпочках!",
    heardHint: k => `Папа услышал топот! Рядом с ним иди на цыпочках: держи ${k}`, heardKey1: "⇦ Shift", heardKey2: "/ (.)",
    heardHintTouch: t => `Папа услышал топот! ${t}`, tiptoeTap: "Нажми 👣, чтобы идти на цыпочках",
    level: "Уровень", lvShort: "Ур.", onePlayer: "1 игрок", twoPlayers: "2 игрока",
    controls1: "Клавиатура: Игрок 1 — W A S D, Игрок 2 — стрелки  •  P — пауза  •  M — звук  •  L — язык",
    controls2: "Планшет/телефон: водите пальцем  •  Геймпад: стик, A — выбрать, B — назад, LB/RB — миры",
    pause: "Пауза", play: "Играть", resume: "Продолжить", story: "История", map: "Карта", home: "Главная",
    glLost: "Нажми, чтобы продолжить", oops: "Ой! Что-то пошло не так", restartLevel: "Начать уровень заново",   // SPEC-025 AC 7: карточка ошибки (Продолжить — resume)
    // SPEC-025 phase 2: заметки о сохранении, вопрос для взрослых и страница для взрослых
    saveRecovered: "Мы восстановили сохранение из копии", freshStart: "Не получилось прочитать сохранение, поэтому начали новую игру", noSave: "Это устройство не сохраняет прогресс",
    parentsGate: (a, b) => `Для взрослых: сколько будет ${a} умножить на ${b}?`, numberWords: ["три", "четыре", "пять", "шесть", "семь", "восемь", "девять"], gateWrong: "Не совсем. Вот другой пример",
    forGrownUps: "Для взрослых", copyCode: "Скопировать код прогресса", pasteCode: "Вставить код", codeCopied: "Код скопирован",
    importConfirm: "Заменить прогресс на этом устройстве прогрессом из кода?", codeTooNew: "Этот код из более новой версии игры", codeBad: "Этот код не подходит. Проверьте его и попробуйте ещё раз",
    undoReset: "Вернуть стёртый прогресс", resetAsk: "Сбросить весь прогресс?", restoreCopy: "Вернуть более старую копию", eraseAll: "Стереть все данные на этом устройстве", errorLog: "Журнал ошибок", copy: "Копировать", version: "Версия",
    win: "ПОБЕДА!", winSub: "Его обняли много раз, и он ушёл домой!", next: n => `Уровень ${n} ▶`,
    kindAgain: n => `${n} снова добрый!`, cheer: "Ура!", whoosh: "ВЖУХ!",
    bossNames: { park: "Босс парка", field: "Тренер", city: "Строитель", school: "Самый злой папа" },
    lose: "Большой победил...", loseSub: (h, m) => `Сердечек забрали: ${h} из ${m}. Ещё разок?`, again: "Ещё раз",
    big: "Большой", hug: "Обнимашки! -1", bang: "БАХ!", saved: "Спасён!", out: "Иду отдыхать", back: "Снова в игре!", resting: (n, t) => `${n}: отдых… вернёшься через ${t}`, help: n => `${n}: ПОМОГИТЕ!`,
    touch1: "Води пальцем по экрану, чтобы бежать", touch2: "Игрок 1 — палец слева, Игрок 2 — палец справа",
    rotate: "Поверни устройство боком ↻", me: "Я", botChip: "Б", safe: "БЕЗОПАСНО",
    player1: "Игрок 1", player2: "Игрок 2", ok: "Готово",
    slots: { hair: "Причёска", hat: "Головной убор", jacket: "Куртка", pants: "Штаны", look: "Вид" },
    worlds: { park: "Парк", field: "Футбольное поле", city: "Город", school: "Школа", beach: "Пляж", winter: "Зима" },
    worldsObj: { park: "Парк", field: "Футбольное поле", city: "Город", school: "Школу", beach: "Пляж", winter: "Зиму" },
    // род по миру: Футбольное поле пройдено, Школа/Зима пройдена, Парк/Город/Пляж пройден
    worldDone: (w, key) => `${w} ${key === "field" ? "пройдено" : key === "school" || key === "winter" ? "пройдена" : "пройден"}!`,
    bonus: "Бонус", bonusUnlocked: "Открылись бонусные миры!",
    items: { boots: "Сапоги-скороходы!", cloak: "Невидимка!", shield: "Щит!" }, blocked: "Щит спас!", slip: "Поскользнулся!",
    character: "Персонаж", progressTab: "Прогресс", bag: "Рюкзак", clothes: (n, m) => `Одежда: ${n} / ${m}`, buy: "Взять", have: n => `У вас: ${n} ${["сильная обнимашка", "сильные обнимашки", "сильных обнимашек"][n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2]}`, wears: "носит", none: "Ничего",
    gloves: { mittens: "Тёплые рукавицы", mega: "Мега-рукавицы" }, gloveDesc: p => `Каждая обнимашка забирает ${p} сердечка`,
    pack: n => `В наборе: ${n} сильные обнимашки`, notEnough: "Не хватает монеток", reset: "Сбросить прогресс", resetCancel: "Нет, оставить", resetCancelShort: "Оставить", resetShort: "Сброс", resetConfirm: "Да, стереть всё",
    victory: "Победа", nobodyOut: "Никто не ушёл отдыхать", fast: t => `Быстро: меньше ${t}`, forHugs: n => `+${n} за обнимашки`,
    megaHug: p => `Сильная обнимашка! -${p}`, coinsWord: "монетки",
    buyFor: n => `Взять за 🪙 ${n}`, tapAgain: "Нажми ещё раз, чтобы взять",
    itemsTab: "Вещи", wardrobeTab: "Гардероб", upgradesTab: "Улучшения", upgMax: "Максимум",
    worldsDone: (n, max) => `Пройдено миров: ${n} / ${max}`, comicSoon: "Комикс скоро будет",
    lockedLevel: n => `Сначала пройди уровень ${n}`, lockedBonus: "Пройди все уровни основных миров, чтобы открыть", boss: "Босс",
    lockedWorld: (prev, next) => `Пройди ${I18N.ru.worldsObj[prev]}, чтобы открыть ${I18N.ru.worldsObj[next]}!`,
    worldOpened: w => `${I18N.ru.worlds[w]} ${w === "field" ? "открыто" : w === "school" || w === "winter" ? "открыта" : "открыт"}!`, done: "✔ Пройдено!",
    typeLines: { classic: "Наш рисунок — самая первая карта!", meadow: "Открытая поляна — прячься в кустах!", village: "Домики — подкрадывайся из-за углов!",
      river: "Река с мостиками — выбирай, где перейти!", rooms: "Большой дом — заглядывай в двери!", arena: "Кольцо — обеги и зайди ему за спину!",
      maze: "Лабиринт — найди дорогу между стенами!" },
    bossLine: { park: "Босс — главный папа Парка. Он сильнее обычных пап!", field: "Босс — главный папа Футбольного поля. Он сильнее обычных пап!",
      city: "Босс — главный папа Города. Он сильнее обычных пап!", school: "Самый злой папа! Может толкнуть сразу нескольких детей!" },
    sceneNext: "Дальше", sceneSkip: "Пропустить", thanks: "Спасибо, что играли!", madeBy: "Сделали Костя и папа",
    tut: {
      a: k => ["Подкрадись к папе сзади и обними! Каждая обнимашка забирает одно злое сердечко.", "Если папа тебя увидит — толкнёт, и ты упадёшь!",
        "Друг упал? Встань рядом — поможешь ему подняться. Друзья помогут и тебе!", `Папа слышит топот за спиной. Рядом с ним иди на цыпочках! (${k})`],
      tiptoeKey: "держи Shift", tiptoeTouch: "нажми 👣",
      b: ["Сапоги-скороходы: бегаешь быстрее!", "Плащ-невидимка: папа тебя не видит!", "Щит: папа не может тебя толкнуть!",
        "Банан! Заведи папу на него — он поскользнётся, и его можно обнять с любой стороны!"],
      c: ["Воздушный поцелуй 💋: пошли издалека. Папа теряет полсердечка и краснеет!", "Спасалка 🩹: упал? Сразу вставай!",
        "Тёплые рукавицы: обнимашка забирает 2 сердечка. Мега-рукавицы — 3!", "Выигрывай уровни, собирай монетки и бери всё это в «Персонаже»!"],
      ready: "Ты готов! Давай сделаем пап снова добрыми!", practice: "Тренировка",
      introLine: "Давай научимся делать пап снова добрыми!", introGo: "Учимся!",
      g1rescue: "Друг упал! Беги к нему и встань рядом — поможешь подняться.", g1sneak: k => `Теперь подкрадись к папе сзади — рядом с ним на цыпочках! (${k})`,
      g1hug: "Обними его сзади — 3 раза!",
      g2item: "Возьми предмет!", g2banana: "Заведи папу на банан!", g2kiss: k => `Пошли воздушный поцелуй 💋 (${k})`, g2kit: k => `Встань спасалкой 🩹! (${k})`,
      kissKey: "нажми E", kissTouch: "нажми кнопку 💋", kitKey: "нажми Q", kitTouch: "нажми 🩹"
    },
    pictures: "Картинки", sceneBack: "Назад",
    chapters: { began: "Как всё началось", ended: "Как всё закончилось" }, endedLocked: "Пройди 20-й уровень в Школе, чтобы прочитать конец", howToPlay: "Как играть",
    upg: { fastFeet: { name: "Быстрые ноги", desc: p => `+${p}% скорости` }, longItems: { name: "Долгие вещи", desc: () => "Действуют дольше" },
      quickHelp: { name: "Быстрая помощь", desc: () => "Поднимаешь быстрее" } },
    rw: { firstWin: "Первая победа", replay: "Повтор", newStars: "Новые звёзды", star: "Звёздочки", hugs: "Обнимашки", rests: "Отдых", total: "Итого" },
    starCoins: n => `Звёздочки: +${n}`, thrownOut: "Вон из моего дома!", friends: "Друзья", tapToRename: "Нажми на имя, чтобы поменять",
    defaultBig: "Папа", defaultBots: ["Тёма", "Маша", "Вася", "Соня"], anger: "Злость папы", angerOf: n => `${n} злится`,
    kisses: "Воздушные поцелуи", kissDesc: "Издалека: ½ сердечка, и он краснеет", kissPack: n => `В наборе: ${n} ${ruPlural(n, ["поцелуй", "поцелуя", "поцелуев"])}`,
    kissHave: n => `У вас: ${n} ${ruPlural(n, ["поцелуй", "поцелуя", "поцелуев"])}`, kissHit: "Чмок!", noKissHome: "Из домика нельзя!", blush: "Ой, смущён!",
    kit: "Спасалка", kitDesc: "Сразу встать и играть дальше", kitPack: n => `В наборе: ${n} ${ruPlural(n, ["спасалка", "спасалки", "спасалок"])}`,
    kitHave: n => `У вас: ${n} ${ruPlural(n, ["спасалка", "спасалки", "спасалок"])}`, kitUsed: "Снова в игре!", kitHint: "Нажми 🩹, чтобы встать!",
    kitKey1: "Q", kitKey2: "Shift ⇨", packShort: n => `📦 ×${n}`,
    types: { classic: "Наш рисунок", meadow: "Поляна", maze: "Лабиринт", village: "Деревня", river: "Река с мостиками", rooms: "Дом с комнатами", arena: "Арена с кольцом" },
    levelIntro: (w, n, t) => `${w} · Уровень ${n}: ${t}`, levelIntroShort: (w, n, t) => `${w} · ${n}: ${t}`, levelIntroTiny: (w, n, t) => `${n}: ${t}`, worldStars: (n, max) => `⭐ ${n}/${max}`
  }
};
// SPEC-032 AC 13: the language screen of the first launch — each language named in itself
export const LANG_NAMES = Object.freeze({ en: "English", es: "Español", pt: "Português", ru: "Русский" });
export const LANGS = ["en", "es", "pt", "ru"];   // SPEC-028: + português (Brasil); порядок — как переключает значок 🌐
export const HTML_LANG = { pt: "pt-BR" };        // <html lang>: португальский — бразильский
// SPEC-028: язык при запуске — сохранённый (bebebe-lang: старые en/es/ru, новый pt); если его нет и это самый первый запуск
// (нет и bebebe-progress) — первый язык браузера из наших (pt-BR, pt-PT → pt; es-AR → es; ru-RU → ru), иначе английский.
// У игрока с прогрессом, но без сохранённого языка, — английский, как раньше. Чистая функция (тест: __bb.detectLang); не бросает.
// Язык, выбранный при самом первом запуске, сразу сохраняется в bebebe-lang (см. ниже)
export function detectLang(saved, navLangs, hasProgress = false) {
  if (LANGS.includes(saved)) return saved;
  if (hasProgress) return "en";
  for (const n of Array.isArray(navLangs) ? navLangs : []) {
    const code = typeof n === "string" ? n.slice(0, 2).toLowerCase() : "";
    if (LANGS.includes(code)) return code;
  }
  return "en";
}
// текущий язык (его меняет клиент: язык при запуске, кнопка 🌐) и тексты на нём — для меню и для летящих надписей игры
export let lang = "en";
export const L = () => I18N[lang];
// SPEC-011 AC 5: other modules change this module's state only through these setters (live bindings are read-only there)
export function setCurrentLang(v) { return (lang = v); }
