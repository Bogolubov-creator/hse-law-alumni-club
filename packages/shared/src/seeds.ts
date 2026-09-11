// Сид каталога ДПО – полный зеркальный импорт itspecR/dpo-pravo-hse
// (см. scripts/src/import-dpo-mirror-catalog.ts). price – в копейках.

export interface ProgramModuleSeed {
  title: string;
  hours: number;
  points: string[];
}
export interface ProgramTeacherSeed {
  name: string;
  role: string;
}
export interface ProgramSeed {
  slug: string;
  title: string;
  direction: string;
  format: "online" | "offline" | "blended";
  duration: string;
  price: number; // копейки
  dates?: { start: string }; // человекочитаемая дата старта
  document?: string; // выдаваемый документ
  description?: string;
  modules?: ProgramModuleSeed[];
  teachers?: ProgramTeacherSeed[];
  /** Актуальный набор / набор закрыт. По умолчанию – actual. */
  enrollment?: "actual" | "nonactual";
  /** Обложка карточки/героя: путь в public или URL. */
  cover?: string | null;
  /** Страница программы на hse.ru. */
  source_url?: string | null;
  /** Числовой id программы на hse.ru. */
  hse_id?: string;
  /** Короткий слоган с витрины ДПО. */
  tagline?: string;
  /** «Кому подойдёт». */
  audience?: string[];
  /** «Чему научитесь». */
  results?: string[];
  /** «Преимущества». */
  advantages?: string[];
}

export interface NewsSeed {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  published_at: string; // ISO
}

// Сид новостей – тексты из дизайна Главной (тире – en dash, по канону).
export const NEWS_SEED: NewsSeed[] = [
  {
    slug: "novyy-nabor-dpo-osenyu",
    title: "Новый набор ДПО осенью",
    excerpt: "Открыта запись на осенние программы – со скидкой выпускника в витрине ДПО.",
    body: "Учебный офис открыл осенний набор на программы дополнительного профессионального образования.\n\nВыпускникам клуба доступна цена со скидкой уровня – она показана прямо в витрине ДПО. Записаться можно через корзину: оформление ведёт к заявке с контактами, дальше с вами свяжется офис.",
    published_at: "2026-06-24T09:00:00.000Z",
  },
  {
    slug: "vstrecha-vypuskov-24-25",
    title: "Встреча выпусков ’24 и ’25",
    excerpt: "Собираемся вживую: нетворкинг, менторы и анонс новинок мерча.",
    body: "Клуб проводит ежегодную встречу выпусков ’24 и ’25.\n\nВ программе – нетворкинг, общение с менторами и анонс новинок фирменного мерча. Участие в событии приносит баллы активности в личном кабинете.",
    published_at: "2026-06-18T09:00:00.000Z",
  },
  {
    slug: "novye-beydzhi-v-kabinete",
    title: "Новые бейджи в кабинете",
    excerpt: "Добавили достижения за активность – проверьте свой уровень в ЛК.",
    body: "В личном кабинете появились новые достижения за активность в клубе.\n\nБейджи открываются за пройденные программы, участие в событиях и менторство. Загляните в кабинет – возможно, вы уже поднялись на следующий уровень.",
    published_at: "2026-06-05T09:00:00.000Z",
  },
];

export interface ProductSeed {
  slug: string;
  title: string;
  category: string;
  price: number; // копейки
  stock: number;
  variants_json: { sku: string; size?: string; color?: string; stock: number }[];
  /** Пути/URL фото в apps/web/public – то, чего не хватало V3 vs живой стенд/V1. */
  images?: string[] | null;
}

// Сид мерча – из админ-дизайна. price в копейках.
// Фото: hoodie – assets/merch-hoodie.jpg (a66558f); shopper – фасеточная Фемида
// (assets/themis.jpeg = design-export). Мантия – отдельного кадра в репо нет.
export const PRODUCTS_SEED: ProductSeed[] = [
  {
    slug: "hoodie-faculty", title: "Худи с логотипом факультета", category: "Одежда", price: 420_000, stock: 18,
    images: ["/assets/merch-hoodie.jpg"],
    variants_json: [
      { sku: "hoodie-graphite-M", size: "M", color: "графит", stock: 6 },
      { sku: "hoodie-graphite-L", size: "L", color: "графит", stock: 7 },
      { sku: "hoodie-graphite-XL", size: "XL", color: "графит", stock: 5 },
    ],
  },
  {
    slug: "shopper-themis", title: "Шоппер с Фемидой", category: "Аксессуары", price: 120_000, stock: 30,
    images: ["/assets/themis.jpeg"],
    variants_json: [{ sku: "shopper-kost", color: "кост", stock: 30 }],
  },
  {
    slug: "graduate-robe", title: "Мантия выпускника", category: "Одежда", price: 690_000, stock: 6,
    variants_json: [
      { sku: "robe-M", size: "M", stock: 3 },
      { sku: "robe-L", size: "L", stock: 3 },
    ],
  },
];

// Источник – itspecR/dpo-pravo-hse `.catalog-data.json` (см. scripts/src/import-dpo-mirror-catalog.ts).
export { DPO_MIRROR_PROGRAMS as PROGRAMS_SEED } from "./dpo-mirror-catalog.generated.js";
