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

export const PROGRAMS_SEED: ProgramSeed[] = [
  {
    slug: "anticorruption-compliance", title: "Антикоррупционный комплаенс в бизнесе", direction: "Комплаенс", format: "online", duration: "6 недель", price: 4_800_000,
    dates: { start: "15 сентября 2026" }, document: DOC_PK,
    description: "Как выстроить антикоррупционную функцию в компании: от политики и оценки рисков до расследований и отчётности перед регулятором.",
    modules: [
      { title: "Правовые основы: 273-ФЗ, FCPA, UK Bribery Act", hours: 12, points: ["Российское и экстерриториальное регулирование", "Ответственность юрлиц и должностных лиц"] },
      { title: "Оценка коррупционных рисков", hours: 14, points: ["Риск-карта процессов", "Due diligence контрагентов и посредников"] },
      { title: "Комплаенс-политики и контроли", hours: 12, points: ["Кодекс, подарки и гостеприимство", "Конфликт интересов"] },
      { title: "Расследования и горячая линия", hours: 12, points: ["Порядок внутренних проверок", "Защита заявителей"] },
    ],
    teachers: [
      { name: "Мария Орлова", role: "Руководитель комплаенс-практики" },
      { name: "Дмитрий Ветров", role: "Партнёр, антикоррупционные расследования" },
    ],
  },
  {
    slug: "digital-law-ai", title: "Цифровое право и ИИ", direction: "Цифровое право", format: "blended", duration: "8 недель", price: 6_200_000,
    dates: { start: "1 октября 2026" }, document: DOC_PK,
    description: "Регулирование данных, платформ и искусственного интеллекта: персональные данные, ответственность за ИИ, цифровые права и оборот.",
    modules: [
      { title: "Персональные данные и приватность", hours: 16, points: ["152-ФЗ и GDPR: сопоставление", "Трансграничная передача"] },
      { title: "Право и искусственный интеллект", hours: 16, points: ["Ответственность за решения ИИ", "Авторские права на сгенерированный контент"] },
      { title: "Платформы и цифровые сервисы", hours: 14, points: ["Регулирование маркетплейсов", "Модерация и ответственность посредников"] },
      { title: "Цифровые активы и обороты", hours: 14, points: ["ЦФА и смарт-контракты", "Практика споров"] },
    ],
    teachers: [
      { name: "Анна Соколова", role: "Доцент, цифровое право" },
      { name: "Игорь Лебедев", role: "Советник по IT и данным" },
    ],
  },
  {
    slug: "gr-public-policy", title: "GR и взаимодействие с государством", direction: "GR & публичная политика", format: "offline", duration: "5 недель", price: 5_400_000,
    dates: { start: "22 сентября 2026" }, document: DOC_PK,
    description: "Практика government relations: как выстраивать легальное взаимодействие с органами власти и участвовать в нормотворчестве.",
    modules: [
      { title: "Система органов власти и компетенции", hours: 10, points: ["Кто и как принимает решения", "Каналы коммуникации"] },
      { title: "Участие в нормотворчестве", hours: 12, points: ["ОРВ и публичные консультации", "Позиция бизнеса и отраслевые ассоциации"] },
      { title: "Легальный GR и антикоррупционные границы", hours: 12, points: ["Прозрачность и раскрытие", "Границы лоббизма"] },
    ],
    teachers: [
      { name: "Сергей Кондратьев", role: "Эксперт по публичному праву" },
      { name: "Ольга Наумова", role: "Руководитель GR-направления" },
    ],
  },
  {
    slug: "ma-deals", title: "Сделки M&A: практикум", direction: "Корпоративное право", format: "online", duration: "7 недель", price: 7_100_000,
    dates: { start: "6 октября 2026" }, document: DOC_PK,
    description: "От due diligence до closing: структурирование сделок слияний и поглощений на практических кейсах.",
    modules: [
      { title: "Структурирование сделки", hours: 14, points: ["Share deal vs asset deal", "Налоговые и корпоративные последствия"] },
      { title: "Due diligence", hours: 14, points: ["Правовой аудит цели", "Красные флаги и их отражение в цене"] },
      { title: "Договорная архитектура", hours: 16, points: ["SPA: заверения и гарантии", "Механизмы цены и эскроу"] },
      { title: "Closing и пост-интеграция", hours: 12, points: ["Условия закрытия", "Интеграция и earn-out"] },
    ],
    teachers: [
      { name: "Павел Гордеев", role: "Партнёр корпоративной практики" },
      { name: "Екатерина Жукова", role: "Советник M&A" },
    ],
  },
  {
    slug: "arbitration-mediation", title: "Арбитраж и медиация", direction: "Разрешение споров", format: "online", duration: "6 недель", price: 4_600_000,
    dates: { start: "29 сентября 2026" }, document: DOC_PK,
    description: "Альтернативное разрешение споров: коммерческий арбитраж, медиация и исполнение решений.",
    modules: [
      { title: "Коммерческий арбитраж", hours: 14, points: ["Арбитражная оговорка", "Выбор регламента и места"] },
      { title: "Медиация в спорах", hours: 12, points: ["Техники и этапы", "Медиативное соглашение"] },
      { title: "Признание и исполнение решений", hours: 12, points: ["Нью-Йоркская конвенция", "Основания для отказа"] },
    ],
    teachers: [
      { name: "Наталья Белова", role: "Арбитр, коммерческие споры" },
      { name: "Роман Кузьмин", role: "Медиатор, преподаватель" },
    ],
  },
  {
    slug: "lawyer-leader", title: "Юрист как лидер: переговоры", direction: "Soft skills", format: "offline", duration: "4 недели", price: 3_900_000,
    dates: { start: "8 сентября 2026" }, document: DOC_PK,
    description: "Переговорные и лидерские навыки для юриста: как вести сложные переговоры и управлять юридической функцией.",
    modules: [
      { title: "Подготовка к переговорам", hours: 10, points: ["Интересы и позиции", "BATNA и сценарии"] },
      { title: "Тактики и сложные ситуации", hours: 10, points: ["Работа с давлением", "Многосторонние переговоры"] },
      { title: "Лидерство юридической функции", hours: 10, points: ["Коммуникация с бизнесом", "Управление командой"] },
    ],
    teachers: [
      { name: "Алексей Морозов", role: "Тренер по переговорам" },
      { name: "Вера Ильина", role: "Коуч, развитие юрфункции" },
    ],
  },
];
