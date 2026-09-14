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
  /** Локальный путь обложки/фото (public) или URL. */
  photo?: string | null;
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
  source_url?: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  published_at: string; // ISO
}

// Проверенная подборка со страницы pravo.hse.ru/businessandlaw/alumni, 14.09.2026.
// Краткие пересказы; полные материалы доступны по ссылкам первоисточников.
export const NEWS_SEED: NewsSeed[] = [
  {
    slug: "hse-alumni-meeting-2026",
    title: "Состоялась встреча выпускников факультета права НИУ ВШЭ",
    excerpt: "27 февраля выпускники разных лет обсудили развитие клуба и встретились с преподавателями факультета.",
    body: "На встрече прошла стратегическая сессия: участники предложили идеи для развития сообщества на ближайшие годы и выбрали лучшие общим голосованием.\n\nПрограмму дополнили викторина, аукцион и архивные студенческие фотографии. Подробный репортаж и ссылки на фотографии опубликованы на сайте факультета.",
    published_at: "2026-03-02T09:00:00.000Z",
    source_url: "https://pravo.hse.ru/news/1133936920.html",
  },
  {
    slug: "hse-salugina-sorokovaya-interview",
    title: "Екатерина Салугина-Сороковая: «Вышка в моей жизни сыграла огромную роль»",
    excerpt: "Выпускница юридического факультета 2006 года рассказала об учёбе в Вышке, профессиональном пути и качествах, важных для молодых специалистов.",
    body: "Анна Концерева и Николай Линдер из проектной группы «Право для всех» поговорили с Екатериной Салугиной-Сороковой о выборе профессии и роли университетского образования.\n\nВ интервью обсуждаются готовность постоянно учиться, ответственность и самостоятельность мышления. Полный разговор опубликован на сайте факультета права.",
    published_at: "2024-02-06T09:00:00.000Z",
    source_url: "https://pravo.hse.ru/news/894336073.html",
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
