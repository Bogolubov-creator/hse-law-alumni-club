// Сид каталога ДПО — взят из прототипа club-business-law.html.
// price — в копейках (целое), как в схеме данных.

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
}

export interface NewsSeed {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  published_at: string; // ISO
}

// Сид новостей — тексты из дизайна Главной (тире – en dash, по канону).
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
}

// Сид мерча — из админ-дизайна. price в копейках.
export const PRODUCTS_SEED: ProductSeed[] = [
  {
    slug: "hoodie-faculty", title: "Худи с логотипом факультета", category: "Одежда", price: 420_000, stock: 18,
    variants_json: [
      { sku: "hoodie-graphite-M", size: "M", color: "графит", stock: 6 },
      { sku: "hoodie-graphite-L", size: "L", color: "графит", stock: 7 },
      { sku: "hoodie-graphite-XL", size: "XL", color: "графит", stock: 5 },
    ],
  },
  {
    slug: "shopper-themis", title: "Шоппер с Фемидой", category: "Аксессуары", price: 120_000, stock: 30,
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

const DOC_PK = "Удостоверение о повышении квалификации НИУ ВШЭ";
const DOC_PP = "Диплом о профессиональной переподготовке НИУ ВШЭ";

// Каталог отражает реальные программы ДПО факультета права НИУ ВШЭ (orgUnit 22753,
// набор на 2026). Title/price/format/start/document — по данным hse.ru; длительность
// без данных в листинге помечена приблизительной и уточняется живой синхронизацией.
// См. scripts/src/sync-hse-dpo.ts.
export const PROGRAMS_SEED: ProgramSeed[] = [
  // ── Повышение квалификации (ПК) ──
  {
    slug: "legal-english-mastery", title: "Мастерство юридического английского: продвинутые навыки для юристов", direction: "Юридический английский", format: "online", duration: "онлайн, свой темп", price: 4_500_000,
    dates: { start: "1 июля 2026" }, document: DOC_PK,
    description: "Продвинутые навыки юридического английского: терминология, документы и аргументация для практикующих юристов. Онлайн, асинхронный формат.",
  },
  {
    slug: "civil-law-current", title: "Актуальные вопросы гражданского права", direction: "Гражданское право", format: "online", duration: "онлайн, свой темп", price: 2_200_000,
    dates: { start: "6 июля 2026" }, document: DOC_PK,
    description: "Разбор актуальных проблем гражданского права и свежей судебной практики. Онлайн, асинхронный формат.",
  },
  {
    slug: "tax-administration", title: "Актуальные вопросы налогового администрирования и современные подходы в налоговой оптимизации бизнеса", direction: "Налоговое право", format: "online", duration: "онлайн, свой темп", price: 5_700_000,
    dates: { start: "7 сентября 2026" }, document: DOC_PK,
    description: "Налоговое администрирование и законные подходы к налоговой оптимизации бизнеса. Онлайн, асинхронный формат.",
  },
  {
    slug: "bankruptcy-law", title: "Правовые вопросы банкротства: теории и практики", direction: "Банкротство", format: "online", duration: "около 6 недель", price: 5_000_000,
    dates: { start: "10 сентября 2026" }, document: DOC_PK,
    description: "Материальные и процессуальные вопросы банкротства: от возбуждения дела до оспаривания сделок. Онлайн, синхронный формат.",
  },
  {
    slug: "hong-kong-contract-law", title: "Контрактное право Гонконга", direction: "Международное право", format: "online", duration: "около 1 месяца", price: 5_000_000,
    dates: { start: "15 сентября 2026" }, document: DOC_PK,
    description: "Основы контрактного права Гонконга для трансграничной практики. Онлайн, синхронный формат.",
  },
  {
    slug: "china-legal-system", title: "Введение в правовую систему Китая", direction: "Международное право", format: "online", duration: "около 1,5 месяца", price: 12_500_000,
    dates: { start: "18 сентября 2026" }, document: DOC_PK,
    description: "Обзор правовой системы КНР: источники права, судоустройство и практика для работы с китайскими контрагентами. Онлайн, синхронный формат.",
  },
  {
    slug: "personal-assistant-pro", title: "Персональный ассистент PRO", direction: "Soft skills", format: "blended", duration: "2 недели", price: 4_700_000,
    dates: { start: "19 сентября 2026" }, document: DOC_PK,
    description: "Практические навыки персонального и бизнес-ассистента: организация, коммуникация, документооборот. Смешанный формат.",
  },
  {
    slug: "digital-law-business", title: "Цифровое право для бизнеса", direction: "Цифровое право", format: "online", duration: "1,5 месяца", price: 5_500_000,
    dates: { start: "23 сентября 2026" }, document: DOC_PK,
    description: "Правовое сопровождение цифрового бизнеса: данные, платформы, электронные сделки и новые технологии. Онлайн, синхронный формат.",
  },
  {
    slug: "copyright-info-society", title: "Авторское право в информационном обществе", direction: "Интеллектуальная собственность", format: "offline", duration: "5 недель", price: 7_500_000,
    dates: { start: "5 октября 2026" }, document: DOC_PK,
    description: "Авторское право в цифровую эпоху: объекты, оборот прав и защита в информационном обществе. Очный формат.",
  },
  {
    slug: "french-legal-language", title: "Французский юридический язык: право, терминология и аргументация", direction: "Юридический иностранный язык", format: "online", duration: "около 2 месяцев", price: 9_000_000,
    dates: { start: "26 октября 2026" }, document: DOC_PK,
    description: "Французский юридический язык: терминология, право и аргументация (le français juridique). Онлайн, синхронный формат.",
  },
  {
    slug: "english-contract-law", title: "Английское контрактное право", direction: "Международное право", format: "online", duration: "1 месяц", price: 5_000_000,
    dates: { start: "9 ноября 2026" }, document: DOC_PK,
    description: "Английское договорное право для международной практики: заключение, толкование и средства защиты. Онлайн, синхронный формат.",
  },
  {
    slug: "maritime-arbitration", title: "Морской арбитраж", direction: "Разрешение споров", format: "online", duration: "около 3 недель", price: 6_000_000,
    dates: { start: "10 ноября 2026" }, document: DOC_PK,
    description: "Разрешение споров в морском арбитраже: регламенты, оговорки и исполнение решений. Онлайн, синхронный формат.",
  },
  {
    slug: "corporate-law-issues", title: "Корпоративное право: основные проблемы", direction: "Корпоративное право", format: "online", duration: "5 недель", price: 6_000_000,
    dates: { start: "16 ноября 2026" }, document: DOC_PK,
    description: "Ключевые проблемы корпоративного права: управление, сделки и корпоративные споры. Онлайн, синхронный формат.",
  },
  {
    slug: "neurolaw", title: "Нейроправо", direction: "Цифровое право", format: "offline", duration: "около 4 недель", price: 5_000_000,
    dates: { start: "30 ноября 2026" }, document: DOC_PK,
    description: "Право на стыке нейротехнологий и когнитивных наук: регулирование, этика и практика. Очный формат.",
  },
  // ── Профессиональная переподготовка (ПП) ──
  {
    slug: "french-economic-law", title: "Французское (европейское) экономическое право", direction: "Международное право", format: "blended", duration: "около 6 месяцев", price: 18_000_000,
    dates: { start: "14 сентября 2026" }, document: DOC_PP,
    description: "Профпереподготовка по французскому и европейскому экономическому праву (droit économique). Смешанный формат.",
  },
  {
    slug: "legal-english-retraining", title: "Право на английском / Legal English", direction: "Юридический английский", format: "blended", duration: "8 месяцев", price: 13_000_000,
    dates: { start: "30 сентября 2026" }, document: DOC_PP,
    description: "Программа профессиональной переподготовки «Право на английском»: изучение права на английском языке. Гибридный формат.",
  },
];
