// SPEC-011: the story (chapters, scenes) in four languages, the rule icons and the scene ids. Shared data.
import { BONUS_WORLDS, BOSSES, WORLDS } from "./core/config.js";

// =====================================================================
//  ИСТОРИЯ (SPEC-017; SPEC-022: тексты — из истории Кости, docs/story.md): главы по порядку — начало, миры, бонусные миры, конец.
//  Русский — словами Кости (сокращено, только где не влезало), английский, испанский (voseo) и португальский (você, SPEC-028) — простой перевод.
//  Где история молчит (бонусные миры), одна простая фраза тем же голосом — написал Claude, проверить с Костей (specs/BACKLOG.md).
//  captions — подписи комикса «Как всё началось» (по одной на клетку 8_start); text главы «начало» — они же короче (влезает в телефон);
//  boss — фраза заставки перед боссом мира (SPEC-022, только основные миры: у бонусных боссов нет).
//  bubbles — SPEC-026: слова папы в облачках комикса 8_start, по клетке (русские — Андрея, английские и испанские — Claude, португальские — SPEC-028; docs/story.md).
//  image — своя картинка главы (null — комикс из art/, STORY_ART; нет и его — заглушка «Комикс скоро будет»).
// =====================================================================
export const STORY = [
  { id: "began", image: null, captions: {
    en: ["Dad had an ordinary day. He came home from work, and the house was untidy: everything thrown around and dirty. He didn't like it.",
      "Then some kids ran past, playing, and knocked him off his feet. He started to get cross.",
      "Then he opened the fridge: no food, and somebody had eaten his very favourite cupcake. Now he became the grumpiest dad!",
      "Dad went to a café where lots of other dads were sitting, and told them what made him angry. All the dads understood him and got angry too."],
    es: ["Papá tuvo un día común. Volvió del trabajo y la casa estaba desordenada: todo tirado y sucio. No le gustó nada.",
      "Después pasaron corriendo unos chicos que jugaban y lo tiraron al piso. Empezó a enojarse.",
      "Después abrió la heladera: no había comida, ¡y alguien se había comido su cupcake favorito! Ahí se volvió el papá más enojado.",
      "Papá se fue a un café donde había muchos otros papás y les contó lo que lo había enojado. Todos lo entendieron y también se enojaron."],
    pt: ["O Papai teve um dia comum. Ele voltou do trabalho, e a casa estava bagunçada: tudo jogado e sujo. Ele não gostou.",
      "Depois, umas crianças passaram correndo, brincando, e o derrubaram. Ele começou a ficar bravo.",
      "Depois ele abriu a geladeira: não tinha comida, e alguém comeu o cupcake favorito dele. Aí ele virou o papai mais bravo!",
      "O Papai foi a um café cheio de outros papais e contou o que o deixou bravo. Todos os papais entenderam e ficaram bravos também."],
    ru: ["У папы был обычный день. Он пришёл с работы, а дома не убрано, всё разбросано и грязно. Ему это не нравится.",
      "Потом мимо пробегают играющие дети и сбивают его с ног. Он начинает сердиться.",
      "Потом он открывает холодильник, а еды нет, и его самое любимое пирожное съели. Тут он становится самым злым папой!",
      "Папа уходит в кафе, где сидят много других пап, и рассказывает им, что его разозлило. Все папы его понимают и тоже становятся злыми."] },
    text: {
      en: "Dad came home from work to an untidy house. Kids knocked him over, and somebody ate his favourite cupcake. He became the grumpiest dad and went to the café, and the other dads got angry too.",
      es: "Papá volvió del trabajo y la casa estaba desordenada. Unos chicos lo tiraron al piso y alguien se comió su cupcake favorito. Se volvió el papá más enojado, fue al café, y los otros papás también se enojaron.",
      pt: "O Papai voltou do trabalho, e a casa estava bagunçada. Umas crianças o derrubaram, e alguém comeu o cupcake favorito dele. Ele virou o papai mais bravo e foi ao café, e os outros papais ficaram bravos também.",
      ru: "Папа пришёл с работы, а дома не убрано. Дети сбили его с ног, а любимое пирожное съели. Он стал самым злым папой и ушёл в кафе к другим папам — и они тоже стали злыми." },
    bubbles: {
      en: ["Oh, what a mess!", "Oh, kids!", "Where's my cupcake?!", "This is just impossible!!"],
      es: ["¡Uy, qué desorden!", "¡Ay, los chicos!", "¿¡Dónde está mi cupcake!?", "¡¡Esto es imposible!!"],
      pt: ["Nossa, que bagunça!", "Ai, as crianças!", "Cadê meu cupcake?!", "Isso é impossível!!"],   // SPEC-028: «simplesmente» не влезало в облачко «Истории» на телефоне
      ru: ["Ох, какой бардак!", "Ой, дети!", "Где мой кекс?!", "Это просто невозможно!!"] } },
  { id: "park", image: null, text: {
    en: "The angry dads moved to four worlds. The first one is the Park. The kids want to make the dads kind again: you have to hug them, lots of times!",
    es: "Los papás enojados se fueron a vivir a cuatro mundos. El primero es el Parque. Los chicos quieren que los papás vuelvan a ser buenos: ¡hay que abrazarlos, muchas veces!",
    pt: "Os papais bravos se mudaram para quatro mundos. O primeiro é o Parque. As crianças querem que os papais fiquem bonzinhos de novo: é preciso abraçar eles, muitas vezes!",
    ru: "Злые папы поселились в четырёх мирах. Первый — Парк. Дети хотят сделать пап снова добрыми: для этого их надо обнимать, много раз!" },
    boss: {
      en: "This is the boss, the main dad of the Park. He is stronger than ordinary dads. Hug him lots of times until he is kind!",
      es: "Este es el jefe, el papá principal del Parque. Es más fuerte que los papás comunes. ¡Abrazalo muchas veces hasta que vuelva a ser bueno!",
      pt: "Este é o chefe, o papai principal do Parque. Ele é mais forte que os papais comuns. Dê muitos abraços nele até ele ficar bonzinho!",
      ru: "Это босс — главный папа Парка. Он сильнее обычных пап. Обнимай его много раз, пока он не станет добрым!" } },
  { id: "field", image: null, text: {
    en: "The second world is the Football field. It's hard: a dad can push you, you can bump yourself and all that.",
    es: "El segundo mundo es la Cancha. Es difícil: el papá te puede empujar, te podés golpear y todo eso.",
    pt: "O segundo mundo é o Campo de futebol. É difícil: o papai pode te empurrar, você pode levar um tombo e tudo mais.",
    ru: "Второй мир — Футбольное поле. Это сложно: папа может толкнуть, можно удариться и всё такое." },
    boss: {
      en: "This is the boss, the main dad of the Football field. He is stronger than ordinary dads. Hug him lots of times until he is kind!",
      es: "Este es el jefe, el papá principal de la Cancha. Es más fuerte que los papás comunes. ¡Abrazalo muchas veces hasta que vuelva a ser bueno!",
      pt: "Este é o chefe, o papai principal do Campo de futebol. Ele é mais forte que os papais comuns. Dê muitos abraços nele até ele ficar bonzinho!",
      ru: "Это босс — главный папа Футбольного поля. Он сильнее обычных пап. Обнимай его много раз, пока он не станет добрым!" } },
  { id: "city", image: null, text: {
    en: "The third world is the City. When a dad is hugged lots of times, he becomes kind and goes home, and the kids get coins.",
    es: "El tercer mundo es la Ciudad. Cuando a un papá lo abrazan muchas veces, se vuelve bueno y se va a su casa, y los chicos ganan monedas.",
    pt: "O terceiro mundo é a Cidade. Quando um papai ganha muitos abraços, ele fica bonzinho e vai para casa, e as crianças ganham moedas.",
    ru: "Третий мир — Город. Когда папу обняли много раз, он становится добрым и уходит домой, а дети получают монетки." },
    boss: {
      en: "This is the boss, the main dad of the City. He is stronger than ordinary dads. Hug him lots of times until he is kind!",
      es: "Este es el jefe, el papá principal de la Ciudad. Es más fuerte que los papás comunes. ¡Abrazalo muchas veces hasta que vuelva a ser bueno!",
      pt: "Este é o chefe, o papai principal da Cidade. Ele é mais forte que os papais comuns. Dê muitos abraços nele até ele ficar bonzinho!",
      ru: "Это босс — главный папа Города. Он сильнее обычных пап. Обнимай его много раз, пока он не станет добрым!" } },
  { id: "school", image: null, text: {
    en: "The last world is the School. The grumpiest dad lives here, the very dad from the start of the story. He put his own main dad, a boss, in every world.",
    es: "El último mundo es la Escuela. Acá vive el papá más enojado, el mismo papá del principio de la historia. Él puso en cada mundo a su papá principal: un jefe.",
    pt: "O último mundo é a Escola. Aqui mora o papai mais bravo, aquele do começo da história. Ele colocou em cada mundo o seu papai principal: um chefe.",
    ru: "Последний мир — Школа. Тут живёт самый злой папа, тот самый папа из начала истории. Он поставил в каждый мир своего главного папу — босса." },
    boss: {
      en: "This is the grumpiest dad, the angriest of them all. His special power: he can push several kids at once!",
      es: "Este es el papá más enojado, el más enojado de todos. Su poder especial: ¡puede empujar a varios chicos a la vez!",
      pt: "Este é o papai mais bravo, o mais bravo de todos. O poder especial dele: ele pode empurrar várias crianças de uma vez!",
      ru: "Это самый злой папа — самый злой из всех. Его особая сила: он может толкнуть сразу нескольких детей!" } },
  { id: "beach", image: null, text: {   // написал Claude (в истории про Пляж только «бонусный мир») — проверить с Костей
    en: "Bonus world: the Beach. The angry dads grumble and sunbathe. Hug them until they are kind!",
    es: "Mundo bonus: la Playa. Los papás enojados refunfuñan y toman sol. ¡Abrazalos hasta que vuelvan a ser buenos!",
    pt: "Mundo bônus: a Praia. Os papais bravos resmungam e tomam sol. Dê abraços neles até eles ficarem bonzinhos!",
    ru: "Бонусный мир — Пляж. Злые папы ворчат и загорают на солнце. Обнимай их, пока они не станут добрыми!" } },
  { id: "winter", image: null, text: {   // написал Claude (в истории про Зиму только «бонусный мир») — проверить с Костей
    en: "Bonus world: Winter. An angry dad is building a wall of ice. Warm hugs will make him kind!",
    es: "Mundo bonus: el Invierno. Un papá enojado construye una pared de hielo. ¡Unos abrazos calentitos lo van a volver bueno!",
    pt: "Mundo bônus: o Inverno. Um papai bravo está construindo uma parede de gelo. Abraços quentinhos vão deixar ele bonzinho!",
    ru: "Бонусный мир — Зима. Злой папа строит ледяную стену. Тёплые обнимашки сделают его добрым!" } },
  { id: "ended", image: null, text: {
    en: "When all the dads were kind, the kids won against the grumpiest dad. He became kind too, and now he sits at the table with the kids and they eat cupcakes together.",
    es: "Cuando todos los papás se volvieron buenos, los chicos le ganaron al papá más enojado. Él también se volvió bueno, y ahora se sienta a la mesa con los chicos y comen cupcakes juntos.",
    pt: "Quando todos os papais ficaram bonzinhos, as crianças venceram o papai mais bravo. Ele também ficou bonzinho, e agora ele senta à mesa com as crianças e eles comem cupcakes juntos.",
    ru: "Когда все папы стали добрыми, дети побеждают самого злого папу. Он тоже становится добрым, и они вместе с детьми сидят за столом и кушают пирожные." } }
];
// значки строк правил (I18N.*.rules) — по одному на строку, в том же порядке; тест i18n сверяет число (SPEC-019 добавит строку — и значок)
export const RULE_ICONS = ["❤", "👀", "🤝", "⏱", "🏠", "🍌", "👣"];
// SPEC-022: заставки истории: комикс в начале, босс каждого мира из BOSSES, первый уровень бонусного мира, конец
export const SCENE_IDS = Object.freeze(["intro", ...Object.keys(BOSSES).map(w => "boss_" + w), ...BONUS_WORLDS.map(w => "bonus_" + w), "ending"]);
// SPEC-029: страницы обучения — тоже заставки (тот же экран), но не глава истории и не отмечаются в progress.seen по отдельности;
// в seen — одно «tutorial»: обучение закончили или пропустили
export const TUTORIAL_SCENES = Object.freeze(["tutorial_intro", "tutorial_a", "tutorial_b", "tutorial_c", "tutorial_pics", "tutorial_ready"]);   // SPEC-032: tutorial_pics — «Картинки» (A1…C4); SPEC-033: tutorial_intro — карточка «Как играть» после комикса (последняя — tutorial_ready)
// SPEC-042 AC 11: trick_<world> — the "New here!" card of that world has been shown
export const TRICK_SEEN_IDS = Object.freeze(WORLDS.map(w => "trick_" + w));
export const SEEN_IDS = Object.freeze([...SCENE_IDS, ...TRICK_SEEN_IDS, "tutorial"]);
