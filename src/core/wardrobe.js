// SPEC-011: the clothes and the Big One's looks (ids, prices, names, colours): data — the core checks owned ids against
// them, the client draws them. Core module.
import { tierPrice } from "./config.js";

// =====================================================================
//  ПЕРСОНАЖИ
// =====================================================================
// ---------- Наряды маленьких: причёска, головной убор, куртка, штаны ----------
const Nm = (en, es, pt, ru) => ({ en, es, pt, ru });   // SPEC-028: имя вещи на четырёх языках (было N3; N4 — соседи клетки)
export const HAIRS = [
  { skin: "#ffd8b5", hair: "#6b3e1f", style: "short", name: Nm("Brown", "Castaño", "Castanho", "Каштановые") },
  { skin: "#ffe0c2", hair: "#f2c14e", style: "long",  name: Nm("Blonde", "Rubia", "Loiro", "Светлые") },
  { skin: "#c68642", hair: "#2b2b2b", style: "short", name: Nm("Black", "Negro", "Preto", "Чёрные") },
  { skin: "#f1c27d", hair: "#c2410c", style: "spiky", name: Nm("Ginger", "Colorado", "Ruivo", "Рыжие") },
  { skin: "#8d5524", hair: "#3b2a20", style: "bun",   name: Nm("Bun", "Rodete", "Coque", "Пучок") },
  { skin: "#ffd8b5", hair: "#6b3e1f", style: "none",  name: Nm("Bald", "Pelado", "Careca", "Лысый") },
  { skin: "#ffe0c2", hair: "#f472b6", style: "long",  name: Nm("Pink", "Rosa", "Rosa", "Розовые") },
  { skin: "#c68642", hair: "#3b82f6", style: "spiky", name: Nm("Blue punk", "Punk azul", "Moicano azul", "Синий ирокез") }
];
export const HATS = [
  { id: "none",     price: tierPrice(0), name: Nm("None", "Nada", "Nada", "Ничего") },
  { id: "cap",      price: tierPrice(0), name: Nm("Cap", "Gorra", "Boné", "Кепка") },
  { id: "beanie",   price: tierPrice(0), name: Nm("Beanie", "Gorro de lana", "Gorro", "Шапка") },
  { id: "crown",    price: tierPrice(3), name: Nm("Crown", "Corona", "Coroa", "Корона") },
  { id: "bow",      price: tierPrice(0), name: Nm("Bow", "Moño", "Laço", "Бантик") },
  { id: "flower",   price: tierPrice(1), name: Nm("Flower", "Flor", "Flor", "Цветок") },
  { id: "ears",     price: tierPrice(2), name: Nm("Kitty ears", "Orejas de gato", "Orelhas de gato", "Кошачьи ушки") },
  { id: "headband", price: tierPrice(2), name: Nm("Ninja band", "Vincha ninja", "Faixa ninja", "Повязка ниндзя") },
  { id: "tophat",   price: tierPrice(3), name: Nm("Top hat", "Galera", "Cartola", "Цилиндр") },
  { id: "viking",   price: tierPrice(3), name: Nm("Viking", "Vikingo", "Viking", "Викинг") },
  { id: "pirate",   price: tierPrice(2), name: Nm("Pirate", "Pirata", "Pirata", "Пират") },
  { id: "glasses",  price: tierPrice(1), name: Nm("Glasses", "Anteojos", "Óculos", "Очки") }
];
export const JACKETS = [
  { id: "tshirt", price: tierPrice(0), color: "#3b82f6", pattern: "plain",   trim: "#ffffff", name: Nm("Blue T-shirt", "Remera azul", "Camiseta azul", "Синяя футболка") },
  { id: "hoodie", price: tierPrice(0), color: "#22c55e", pattern: "hood",    trim: "#15803d", name: Nm("Green hoodie", "Buzo verde", "Moletom verde", "Зелёная толстовка") },
  { id: "stripes", price: tierPrice(0), color: "#f59e0b", pattern: "stripes", trim: "#ffffff", name: Nm("Striped", "Rayada", "Listrada", "Полосатая") },
  { id: "purple", price: tierPrice(0), color: "#a855f7", pattern: "zip",     trim: "#f5f3ff", name: Nm("Purple jacket", "Campera violeta", "Jaqueta roxa", "Фиолетовая куртка") },
  { id: "pinkhoodie", price: tierPrice(1), color: "#ec4899", pattern: "hood",    trim: "#be185d", name: Nm("Pink hoodie", "Buzo rosa", "Moletom rosa", "Розовая толстовка") },
  { id: "cape", price: tierPrice(3), color: "#dc2626", pattern: "cape",    trim: "#2563eb", name: Nm("Superhero", "Superhéroe", "Super-herói", "Супергерой") },
  { id: "ninja", price: tierPrice(2), color: "#1f2937", pattern: "belt",    trim: "#ef4444", name: Nm("Ninja", "Ninja", "Ninja", "Ниндзя") },
  { id: "sailor", price: tierPrice(2), color: "#f8fafc", pattern: "stripes", trim: "#1d4ed8", name: Nm("Sailor", "Marinero", "Marinheiro", "Тельняшка") },
  { id: "raincoat", price: tierPrice(2), color: "#facc15", pattern: "hood",    trim: "#ca8a04", name: Nm("Raincoat", "Piloto", "Capa de chuva", "Дождевик") },
  { id: "teal", price: tierPrice(1), color: "#14b8a6", pattern: "zip",     trim: "#ccfbf1", name: Nm("Teal jacket", "Campera turquesa", "Blusa turquesa", "Бирюзовая куртка") },
  // SPEC-027 (решение Андрея: нарисованные в art/23_wardrobe вещи — в игру; имена, ступени и цвета придумал Claude, проверить с детьми).
  // Только в конец списка: сохранённые наряды — номера. bands — полосы радуги снизу вверх; long — длинные полы плаща
  { id: "bluezip", price: tierPrice(1), color: "#3a86c8", pattern: "zip",     trim: "#f8fafc", name: Nm("Blue zip jacket", "Campera azul con cierre", "Blusa azul", "Синяя куртка на молнии") },
  { id: "redzip", price: tierPrice(1), color: "#d83838", pattern: "zip",     trim: "#f8fafc", name: Nm("Red zip jacket", "Campera roja con cierre", "Blusa vermelha", "Красная куртка на молнии") },
  { id: "rainbow", price: tierPrice(2), color: "#2bb5a5", pattern: "rainbow", trim: "#2bb5a5", name: Nm("Rainbow", "Arcoíris", "Arco-íris", "Радуга"),
    bands: ["#a855f7", "#3b82f6", "#22c55e", "#facc15", "#f97316", "#ef4444"] },
  { id: "magiccape", price: tierPrice(3), color: "#4b3a75", pattern: "cape",    trim: "#ec4899", name: Nm("Magic cape", "Capa mágica", "Capa mágica", "Волшебный плащ") },
  { id: "trench", price: tierPrice(2), color: "#7a5634", pattern: "belt",    trim: "#3b2a1a", long: true, name: Nm("Detective coat", "Gabardina de detective", "Sobretudo", "Плащ сыщика") }
];
export const PANTS = [
  { id: "jeans", price: tierPrice(0), color: "#3b5b92", shorts: false, name: Nm("Jeans", "Jean", "Jeans", "Джинсы") },
  { id: "black", price: tierPrice(0), color: "#2d2d3f", shorts: false, name: Nm("Black", "Negro", "Preta", "Чёрные") },
  { id: "red", price: tierPrice(0), color: "#dc2626", shorts: false, name: Nm("Red", "Rojo", "Vermelha", "Красные") },
  { id: "shorts", price: tierPrice(0), color: "#c8a96a", shorts: true,  name: Nm("Shorts", "Bermuda", "Bermuda", "Шорты") },
  { id: "green", price: tierPrice(1), color: "#15803d", shorts: false, name: Nm("Green", "Verde", "Verde", "Зелёные") },
  { id: "pinkshorts", price: tierPrice(2), color: "#f472b6", shorts: true,  name: Nm("Pink shorts", "Short rosa", "Short rosa", "Розовые шорты") },
  { id: "joggers", price: tierPrice(1), color: "#9ca3af", shorts: false, name: Nm("Joggers", "Jogging", "Moletom", "Спортивные") },
  { id: "purple", price: tierPrice(1), color: "#7c3aed", shorts: false, name: Nm("Purple", "Violeta", "Roxa", "Фиолетовые") },
  // SPEC-027: в конец списка. overalls — нагрудник и две лямки поверх куртки; stripes — цвет вертикальных полосок на штанинах
  { id: "overalls", price: tierPrice(2), color: "#4a7ba0", shorts: false, overalls: true, name: Nm("Overalls", "Jardinero", "Macacão", "Комбинезон") },
  { id: "striped", price: tierPrice(1), color: "#d84838", shorts: false, stripes: "#facc15", name: Nm("Striped pants", "Pantalón rayado", "Calça listrada", "Полосатые штаны") }
];
export const SLOTS = Object.freeze({ hair: HAIRS, hat: HATS, jacket: JACKETS, pants: PANTS });
// ---------- Скины Большого ----------
export const BIG_SKINS = [
  // mood: true — лицо человека: краснеет / розовеет по злости (SPEC-022); у огра, робота и медведя лицо остаётся своим
  { id: "classic", price: tierPrice(0), shirt: "#9b2c3a", skin: "#f4b183", hair: "#3a2418", top: "spiky",  name: { en: "Classic", es: "Clásico", pt: "Clássico", ru: "Классика" }, mood: true },
  { id: "ogre", price: tierPrice(0), shirt: "#7c5a2e", skin: "#8fcf6a", hair: "#4d7c2a", top: "horns",  name: { en: "Ogre", es: "Ogro", pt: "Ogro", ru: "Огр" } },
  { id: "robot", price: tierPrice(3), shirt: "#64748b", skin: "#cbd5e1", hair: "#475569", top: "robot",  name: { en: "Robot", es: "Robot", pt: "Robô", ru: "Робот" } },
  { id: "captain", price: tierPrice(3), shirt: "#1e3a8a", skin: "#f1c27d", hair: "#1f2937", top: "pirate", name: { en: "Captain", es: "Capitán", pt: "Capitão", ru: "Капитан" }, mood: true },
  { id: "bear", price: tierPrice(2), shirt: "#92400e", skin: "#b7793f", hair: "#78350f", top: "bear",   name: { en: "Bear", es: "Oso", pt: "Urso", ru: "Медведь" } },
  // SPEC-021 (решение Андрея): папа из истории — лысый, щетина, красная футболка, джинсы, кроссовки (art/1_papa). В конце списка:
  // сохранённые номера образов не меняют смысла; он — образ новой игры (DEFAULT_SKINS.big). stubble — щетина (доля цвета лица)
  { id: "dad", price: tierPrice(0), shirt: "#eb3e42", skin: "#f4b183", hair: "#3a2418", top: "dad", pants: "#3b6db5", shoes: "#5b3a29", sole: "#f5f5f4", stubble: 0.8,
    name: { en: "Dad", es: "Papá", pt: "Papai", ru: "Папа" }, mood: true }
];
