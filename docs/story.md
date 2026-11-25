# BeBeBe Atrapar — история игры

> Историю рассказал Костя, создатель игры, 2026-11-22. Это основа сюжета. Записано его словами, Claude только расставил по порядку. Менять историю может только Костя.
>
> 2026-11-22, позже: Костя поменял миры — основные теперь Парк, Футбольное поле, Город и Школа (ближе к одной местности и к истории), а Пляж и Зима стали бонусными (передал Андрей).
>
> Копии: проект claude.ai «BeBeBe Atrapar» (`claude/story.md`) и репозиторий (`docs/story.md`). Тексты истории в игре берутся отсюда.
>
> Обучение (SPEC-029: картинки-подсказки и две тренировки после комикса при первом запуске) — не часть истории Кости: его подписи и подсказки придумал Claude (`docs/game-design.md`, «Обучение»).

## Как всё началось

У папы был обычный день. Он пришёл с работы, а дома не убрано, всё разбросано и грязно. Ему это не нравится.

Потом мимо пробегают играющие дети и сбивают его с ног. Он начинает сердиться.

Потом он открывает холодильник и видит, что еды нет, а его самое любимое пирожное съели. Тут он становится **злым папой**. Это и есть **самый злой папа**.

Папа уходит из дома в кафе, где сидят много других пап. Он рассказывает им про всё, что его разозлило. Все папы его понимают и тоже становятся злыми.

## Что было дальше

Злые папы поселились в разных местах — в четырёх мирах. Самый злой папа живёт в последнем мире и в каждый мир поставил своего главного папу — босса.

Дети хотят сделать пап снова добрыми. Для этого их надо **обнимать**, много раз. Когда папу обняли много раз, он становится добрым и **уходит домой**, а дети получают баллы (монетки).

Это сложно: папа может толкнуть, можно удариться и всё такое.

В магазине за монеты можно покупать штуки, которые помогают победить пап. Монеты дают за каждый раунд. Иногда их хватает на покупку, иногда нет.

## Как всё закончилось

Когда все папы стали добрыми, дети побеждают самого злого папу. Он тоже становится добрым, и они **вместе с детьми сидят за столом и кушают пирожные**.

## Миры (по порядку)

Основные:
1. **Парк** — в конце босс, главный папа Парка.
2. **Футбольное поле** — в конце босс, главный папа Футбольного поля.
3. **Город** — в конце босс, главный папа Города.
4. **Школа** — в конце **самый злой папа**.

Бонусные (открываются, когда пройдены все уровни основных миров):
- **Пляж**
- **Зима**

## Боссы

- Боссы Парка, Футбольного поля и Города просто **сильнее обычных пап**. Особых сил пока не придумали.
- **Самый злой папа** — тот самый папа из начала истории. Самый злой из всех. Особая сила: **может толкнуть сразу нескольких детей**.
- Боссы бонусных миров пока не придуманы.

## Как история попадает в игру (решения Андрея, 2026-11-23; Костя может поменять)

- Сердечки Большого — это **злость папы**: обнимашки убирают злость, при нуле папа добреет, улыбается и **уходит домой**; экран победы — «Папа снова добрый!». Имя по умолчанию — «Папа».
- Последний уровень Парка, Футбольного поля и Города — **босс**: свой образ (спортивный костюм со свистком, тренер с мячом, строитель в каске), немного злее и быстрее.
- Последний уровень Школы — **самый злой папа**: толкает сразу всех детей перед собой.
- Дом папы — **грязный домик** (решение Андрея, 2026-11-22).
- **Заставки:** комикс «Как всё началось» при первом запуске, картинка перед каждым боссом, финал «Как всё закончилось» после Школы 20; всё можно пересмотреть в «Истории».
- Внешность боссов и числа (насколько злее и быстрее) придумал Claude.

## Слова папы в облачках комикса «Как всё началось» (слова Андрея, 2026-11-24; английский, испанский и португальский — Claude)

В комиксе `art/8_start.webp` у папы четыре пустых облачка. Игра пишет в них его слова — в заставке при первом запуске и в «Истории».

| Клетка | Что на картинке | Слова папы | English | Español | Português |
|---|---|---|---|---|---|
| 1 | дома бардак | Ох, какой бардак! | Oh, what a mess! | ¡Uy, qué desorden! | Nossa, que bagunça! |
| 2 | дети сбивают его с ног | Ой, дети! | Oh, kids! | ¡Ay, los chicos! | Ai, as crianças! |
| 3 | пустой холодильник | Где мой кекс?! | Where's my cupcake?! | ¿¡Dónde está mi cupcake!? | Cadê meu cupcake?! |
| 4 | кафе пап | Это просто невозможно!! | This is just impossible!! | ¡¡Esto es imposible!! | Isso é impossível!! |

Португальский в клетке 4 — короче английского («simplesmente» не влезало в облачко на странице «Истории» на телефоне; SPEC-028).

## Português (Brasil) — тексты истории в игре (SPEC-028; перевёл Claude с английского, по смыслу Кости; проверить с носителем языка)

Пирожное — *cupcake*, папа — *Papai*, злой — *bravo*, добрый — *bonzinho*, босс — *chefe*.

**Como tudo começou** (подписи комикса, по клетке):
1. O Papai teve um dia comum. Ele voltou do trabalho, e a casa estava bagunçada: tudo jogado e sujo. Ele não gostou.
2. Depois, umas crianças passaram correndo, brincando, e o derrubaram. Ele começou a ficar bravo.
3. Depois ele abriu a geladeira: não tinha comida, e alguém comeu o cupcake favorito dele. Aí ele virou o papai mais bravo!
4. O Papai foi a um café cheio de outros papais e contou o que o deixou bravo. Todos os papais entenderam e ficaram bravos também.

Коротко (глава в «Истории»): O Papai voltou do trabalho, e a casa estava bagunçada. Umas crianças o derrubaram, e alguém comeu o cupcake favorito dele. Ele virou o papai mais bravo e foi ao café, e os outros papais ficaram bravos também.

**Миры:**
- Parque: Os papais bravos se mudaram para quatro mundos. O primeiro é o Parque. As crianças querem que os papais fiquem bonzinhos de novo: é preciso abraçar eles, muitas vezes!
- Campo de futebol: O segundo mundo é o Campo de futebol. É difícil: o papai pode te empurrar, você pode levar um tombo e tudo mais.
- Cidade: O terceiro mundo é a Cidade. Quando um papai ganha muitos abraços, ele fica bonzinho e vai para casa, e as crianças ganham moedas.
- Escola: O último mundo é a Escola. Aqui mora o papai mais bravo, aquele do começo da história. Ele colocou em cada mundo o seu papai principal: um chefe.
- Praia (бонус): Mundo bônus: a Praia. Os papais bravos resmungam e tomam sol. Dê abraços neles até eles ficarem bonzinhos!
- Inverno (бонус): Mundo bônus: o Inverno. Um papai bravo está construindo uma parede de gelo. Abraços quentinhos vão deixar ele bonzinho!

**Боссы** (заставка перед последним уровнем):
- Parque / Campo de futebol / Cidade: Este é o chefe, o papai principal do Parque (do Campo de futebol / da Cidade). Ele é mais forte que os papais comuns. Dê muitos abraços nele até ele ficar bonzinho!
- Escola: Este é o papai mais bravo, o mais bravo de todos. O poder especial dele: ele pode empurrar várias crianças de uma vez!

**Como tudo terminou:** Quando todos os papais ficaram bonzinhos, as crianças venceram o papai mais bravo. Ele também ficou bonzinho, e agora ele senta à mesa com as crianças e eles comem cupcakes juntos.

**Карточка «Спасибо»:** Obrigado por jogar! · Feito por Kostya e Papai

## Что из истории уже в игре (заметка, SPEC-022; саму историю меняет только Костя)

- Начало («Как всё началось») — комикс при первом запуске; конец («Как всё закончилось») — после 20-го уровня Школы. Оба — в «Истории».
- Сердечки Большого — злость папы; при нуле папа добреет и уходит домой; экран победы — «Папа снова добрый!».
- Боссы на последнем уровне Парка, Футбольного поля и Города (сильнее обычных пап) и самый злой папа в Школе, который толкает сразу нескольких детей.
- Миры по порядку и бонусные Пляж и Зима (без боссов). Магазин и монетки за раунд были в игре и раньше.
