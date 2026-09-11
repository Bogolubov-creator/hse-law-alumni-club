// Сид каталога ДПО – взят из прототипа club-business-law.html.
// price – в копейках (целое), как в схеме данных.

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

const DOC_PK = "Удостоверение о повышении квалификации НИУ ВШЭ";
const DOC_PP = "Диплом о профессиональной переподготовке НИУ ВШЭ";
const COVER_DPO = "/assets/dpo-hero.jpg";
const COVER_THEMIS = "/assets/themis.jpeg";

/** Типовые модули по направлению – часы и тезисы для карточки программы. */
function mods(topic: string, hours: number[]): ProgramModuleSeed[] {
  const titles = [
    `Введение: ${topic}`,
    "Ключевые конструкции и практика",
    "Кейсы и разбор ошибок",
    "Документы и процессуальные нюансы",
    "Итоговое закрепление",
  ];
  const pointsPool = [
    ["Предмет и источники", "Актуальные позиции судов", "Терминология для практики"],
    ["Сделки и ответственность", "Спорные зоны регулирования", "Чек-лист для консультации"],
    ["Типовые кейсы", "Где спотыкается практика", "Как готовить позицию"],
    ["Формы и шаблоны", "Коммуникация с контрагентом", "Риски исполнения"],
    ["Самопроверка", "Рекомендации к самостоятельной работе", "Что читать дальше"],
  ];
  return hours.map((h, i) => ({
    title: titles[i] ?? `Модуль ${i + 1}`,
    hours: h,
    points: pointsPool[i] ?? ["Основные вопросы модуля"],
  }));
}

function teachers(...pairs: [string, string][]): ProgramTeacherSeed[] {
  return pairs.map(([name, role]) => ({ name, role }));
}

// Каталог отражает реальные программы ДПО факультета права НИУ ВШЭ (orgUnit 22753,
// набор на 2026). Title/price/format/start/document – по данным hse.ru; длительность
// без данных в листинге помечена приблизительной и уточняется живой синхронизацией.
// См. scripts/src/sync-hse-dpo.ts.
export const PROGRAMS_SEED: ProgramSeed[] = [
  // ── Повышение квалификации (ПК) ──
  {
    slug: "legal-english-mastery", title: "Мастерство юридического английского: продвинутые навыки для юристов", direction: "Юридический английский", format: "online", duration: "онлайн, свой темп", price: 4_500_000,
    dates: { start: "1 июля 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Продвинутые навыки юридического английского: терминология, документы и аргументация для практикующих юристов. Онлайн, асинхронный формат.",
    modules: mods("юридический английский", [8, 10, 8, 6]),
    teachers: teachers(["Елена Морозова", "Преподаватель Legal English"], ["James Hartley", "Носитель, договорная практика"]),
  },
  {
    slug: "civil-law-current", title: "Актуальные вопросы гражданского права", direction: "Гражданское право", format: "online", duration: "онлайн, свой темп", price: 2_200_000,
    dates: { start: "6 июля 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_THEMIS,
    description: "Разбор актуальных проблем гражданского права и свежей судебной практики. Онлайн, асинхронный формат.",
    modules: mods("гражданское право", [6, 8, 6]),
    teachers: teachers(["Андрей Соколов", "К.ю.н., гражданское право"], ["Мария Левина", "Арбитражный практик"]),
  },
  {
    slug: "tax-administration", title: "Актуальные вопросы налогового администрирования и современные подходы в налоговой оптимизации бизнеса", direction: "Налоговое право", format: "online", duration: "онлайн, свой темп", price: 5_700_000,
    dates: { start: "7 сентября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Налоговое администрирование и законные подходы к налоговой оптимизации бизнеса. Онлайн, асинхронный формат.",
    modules: mods("налоговое администрирование", [8, 10, 8, 6]),
    teachers: teachers(["Игорь Васильев", "Налоговый консультант"], ["Ольга Ким", "Экс-сотрудник ФНС"]),
  },
  {
    slug: "bankruptcy-law", title: "Правовые вопросы банкротства: теории и практики", direction: "Банкротство", format: "online", duration: "около 6 недель", price: 5_000_000,
    dates: { start: "10 сентября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Материальные и процессуальные вопросы банкротства: от возбуждения дела до оспаривания сделок. Онлайн, синхронный формат.",
    modules: mods("банкротство", [10, 12, 10, 8]),
    teachers: teachers(["Дмитрий Орлов", "Арбитражный управляющий"], ["Светлана Юрьева", "Банкротный юрист"]),
  },
  {
    slug: "hong-kong-contract-law", title: "Контрактное право Гонконга", direction: "Международное право", format: "online", duration: "около 1 месяца", price: 5_000_000,
    dates: { start: "15 сентября 2026" }, document: DOC_PK, enrollment: "nonactual", cover: COVER_THEMIS,
    description: "Основы контрактного права Гонконга для трансграничной практики. Онлайн, синхронный формат.",
    modules: mods("контрактное право Гонконга", [8, 10, 8]),
    teachers: teachers(["Wei Chen", "Counsel, Hong Kong"], ["Анна Белова", "МЧП, НИУ ВШЭ"]),
  },
  {
    slug: "china-legal-system", title: "Введение в правовую систему Китая", direction: "Международное право", format: "online", duration: "около 1,5 месяца", price: 12_500_000,
    dates: { start: "18 сентября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Обзор правовой системы КНР: источники права, судоустройство и практика для работы с китайскими контрагентами. Онлайн, синхронный формат.",
    modules: mods("правовая система Китая", [10, 12, 10, 8, 6]),
    teachers: teachers(["Li Wei", "PRC counsel"], ["Павел Новиков", "Китайское коммерческое право"]),
  },
  {
    slug: "personal-assistant-pro", title: "Персональный ассистент PRO", direction: "Soft skills", format: "blended", duration: "2 недели", price: 4_700_000,
    dates: { start: "19 сентября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Практические навыки персонального и бизнес-ассистента: организация, коммуникация, документооборот. Смешанный формат.",
    modules: mods("работа ассистента", [6, 8, 6, 4]),
    teachers: teachers(["Наталья Егорова", "Бизнес-тренер"], ["Кирилл Данилов", "Executive assistant"]),
  },
  {
    slug: "digital-law-business", title: "Цифровое право для бизнеса", direction: "Цифровое право", format: "online", duration: "1,5 месяца", price: 5_500_000,
    dates: { start: "23 сентября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_THEMIS,
    description: "Правовое сопровождение цифрового бизнеса: данные, платформы, электронные сделки и новые технологии. Онлайн, синхронный формат.",
    modules: mods("цифровое право", [8, 10, 10, 8]),
    teachers: teachers(["Алексей Гордеев", "IT-юрист"], ["Юлия Самойлова", "Персональные данные"]),
  },
  {
    slug: "copyright-info-society", title: "Авторское право в информационном обществе", direction: "Интеллектуальная собственность", format: "offline", duration: "5 недель", price: 7_500_000,
    dates: { start: "5 октября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Авторское право в цифровую эпоху: объекты, оборот прав и защита в информационном обществе. Очный формат.",
    modules: mods("авторское право", [10, 12, 10, 8]),
    teachers: teachers(["Екатерина Власова", "ИС и медиа"], ["Роман Титов", "Патентный поверенный"]),
  },
  {
    slug: "french-legal-language", title: "Французский юридический язык: право, терминология и аргументация", direction: "Юридический иностранный язык", format: "online", duration: "около 2 месяцев", price: 9_000_000,
    dates: { start: "26 октября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Французский юридический язык: терминология, право и аргументация (le français juridique). Онлайн, синхронный формат.",
    modules: mods("французский юридический язык", [10, 12, 10, 8, 6]),
    teachers: teachers(["Claire Dupont", "Français juridique"], ["Ирина Фомина", "Романо-германское право"]),
  },
  {
    slug: "english-contract-law", title: "Английское контрактное право", direction: "Международное право", format: "online", duration: "1 месяц", price: 5_000_000,
    dates: { start: "9 ноября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_THEMIS,
    description: "Английское договорное право для международной практики: заключение, толкование и средства защиты. Онлайн, синхронный формат.",
    modules: mods("английское контрактное право", [8, 10, 8, 6]),
    teachers: teachers(["Richard Cole", "English contract law"], ["Татьяна Миронова", "Common law"]),
  },
  {
    slug: "maritime-arbitration", title: "Морской арбитраж", direction: "Разрешение споров", format: "online", duration: "около 3 недель", price: 6_000_000,
    dates: { start: "10 ноября 2026" }, document: DOC_PK, enrollment: "nonactual", cover: COVER_DPO,
    description: "Разрешение споров в морском арбитраже: регламенты, оговорки и исполнение решений. Онлайн, синхронный формат.",
    modules: mods("морской арбитраж", [8, 10, 8]),
    teachers: teachers(["Сергей Лапин", "Морское право"], ["Helena Brooks", "LMAA arbitrator"]),
  },
  {
    slug: "corporate-law-issues", title: "Корпоративное право: основные проблемы", direction: "Корпоративное право", format: "online", duration: "5 недель", price: 6_000_000,
    dates: { start: "16 ноября 2026" }, document: DOC_PK, enrollment: "actual", cover: COVER_DPO,
    description: "Ключевые проблемы корпоративного права: управление, сделки и корпоративные споры. Онлайн, синхронный формат.",
    modules: mods("корпоративное право", [10, 12, 10, 8]),
    teachers: teachers(["Владимир Чернов", "M&A counsel"], ["Анна Кузнецова", "Корпоративные споры"]),
  },
  {
    slug: "neurolaw", title: "Нейроправо", direction: "Цифровое право", format: "offline", duration: "около 4 недель", price: 5_000_000,
    dates: { start: "30 ноября 2026" }, document: DOC_PK, enrollment: "nonactual", cover: COVER_THEMIS,
    description: "Право на стыке нейротехнологий и когнитивных наук: регулирование, этика и практика. Очный формат.",
    modules: mods("нейроправо", [8, 10, 8, 6]),
    teachers: teachers(["Михаил Зайцев", "Право и технологии"], ["Дарья Семёнова", "Биоэтика"]),
  },
  // ── Профессиональная переподготовка (ПП) ──
  {
    slug: "french-economic-law", title: "Французское (европейское) экономическое право", direction: "Международное право", format: "blended", duration: "около 6 месяцев", price: 18_000_000,
    dates: { start: "14 сентября 2026" }, document: DOC_PP, enrollment: "actual", cover: COVER_DPO,
    description: "Профпереподготовка по французскому и европейскому экономическому праву (droit économique). Смешанный формат.",
    modules: mods("французское экономическое право", [16, 20, 18, 16, 12]),
    teachers: teachers(["Jean-Luc Martin", "Droit économique"], ["Елена Крылова", "ЕС и конкуренция"], ["Пьер Лоран", "Практика Парижа"]),
  },
  {
    slug: "legal-english-retraining", title: "Право на английском / Legal English", direction: "Юридический английский", format: "blended", duration: "8 месяцев", price: 13_000_000,
    dates: { start: "30 сентября 2026" }, document: DOC_PP, enrollment: "actual", cover: COVER_DPO,
    description: "Программа профессиональной переподготовки «Право на английском»: изучение права на английском языке. Гибридный формат.",
    modules: mods("Legal English / common law", [20, 24, 20, 18, 16]),
    teachers: teachers(["Sarah Mitchell", "Common law lecturer"], ["Ольга Петрова", "Legal English"], ["David Grant", "Contract drafting"]),
  },
];
