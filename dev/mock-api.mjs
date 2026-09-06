// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ФИКСТУРНЫЙ mock-API – ТОЛЬКО для локальной визуальной проверки фронта ║
// ║                                                                      ║
// ║  • Это НЕ проверка реальных интеграций: Directus, PostgreSQL,        ║
// ║    ЮKassa, e-mail, push и авторизация здесь НЕ работают и НЕ         ║
// ║    проверяются. Успешные POST'ы (вход, заказы, RSVP) не имитируются. ║
// ║  • НЕ использовать в проде и НЕ использовать для тестирования        ║
// ║    бизнес-логики: здесь нет валидации, прав доступа и побочных       ║
// ║    эффектов реального apps/api.                                      ║
// ║  • Все данные – вымышленные редакционные плейсхолдеры. Совпадения    ║
// ║    с реальными людьми/событиями случайны.                            ║
// ║                                                                      ║
// ║  Запуск: node dev/mock-api.mjs   (порт: MOCK_PORT, по умолч. 3000)   ║
// ║  Фронт:  pnpm -C apps/web dev    (vite проксирует /api → :3000,      ║
// ║          срезая префикс – поэтому маршруты здесь БЕЗ /api).          ║
// ╚══════════════════════════════════════════════════════════════════════╝

import http from "node:http";

const PORT = Number(process.env.MOCK_PORT) || 3000;

// ── Заголовки ответов ────────────────────────────────────────────────────
function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}
const send404 = (res, path) => sendJson(res, 404, { error: "mock: not implemented", path });
const sendMockUnavailable = (res, code = 503) =>
  sendJson(res, code, { error: "mock: недоступно в фикстурном режиме" });
const send401 = (res) => sendJson(res, 401, { error: "Войдите в личный кабинет" });

// ── Фикстурные данные ────────────────────────────────────────────────────
// Даты событий – в будущем относительно сентября 2026 (момент разработки).

const NEWS = [
  {
    id: "n-001", slug: "vstrecha-vypusknikov-itogi",
    title: "Встреча выпускников: итоги",
    excerpt: "Как прошла очередная встреча клуба: разговор о карьере, практике и планах на сезон.",
    body: "В клубе прошла очередная встреча выпускников факультета права. Обсудили развитие сообщества, форматы карьерных мероприятий и планы совместных проектов. По итогам встречи участники договорились о регулярных тематических встречах по отраслям права и о запуске менторских пар «выпускник – студент».\n\nСпасибо всем, кто пришёл. Следующая встреча – в афише событий.",
    published_at: "2026-09-12T18:00:00.000Z",
  },
  {
    id: "n-002", slug: "pravovoy-daidzhest-izmeneniya-nedeli",
    title: "Правовой дайджест: изменения недели",
    excerpt: "Коротко о главных изменениях законодательства и судебной практики за неделю.",
    body: "Редакция клуба подготовила еженедельный дайджест: изменения в регулировании, свежие позиции высших судов и законопроекты, за которыми стоит следить. Материал носит информационный характер и не является юридической консультацией.\n\nДайджест выходит по понедельникам в канале клуба.",
    published_at: "2026-09-08T09:00:00.000Z",
  },
  {
    id: "n-003", slug: "karernyy-marafon-anons",
    title: "Карьерный марафон: анонс осеннего цикла",
    excerpt: "Разборы резюме, мок-интервью и встречи с практиками – расписание цикла.",
    body: "Осенью клуб проводит цикл карьерных мероприятий для выпускников и студентов старших курсов: разборы резюме, тренировочные интервью и встречи с практикующими юристами из разных отраслей. Участие бесплатное для членов клуба, по регистрации.\n\nРасписание и ссылки на регистрацию – в разделе «События».",
    published_at: "2026-08-28T12:00:00.000Z",
  },
  {
    id: "n-004", slug: "spartakiada-yuristov-2026",
    title: "Спартакиада юристов: клуб на старте",
    excerpt: "Сборная клуба примет участие в спартакиаде – присоединяйтесь к команде.",
    body: "Клуб выпускников формирует команды для участия в спартакиаде юридического сообщества: футбол, волейбол, настольный теннис и шахматы. Опыт не важен – важно желание провести день с однокурсниками.\n\nЗаявки на участие принимаются через событие в афише.",
    published_at: "2026-08-15T10:00:00.000Z",
  },
  {
    id: "n-005", slug: "itogi-uchebnogo-goda-dpo",
    title: "Итоги учебного года: программы ДПО",
    excerpt: "Сколько выпускников прошли программы повышения квалификации и что дальше.",
    body: "Подводим итоги учебного года по направлению дополнительного профессионального образования. Программы клуба прошли выпускники разных лет – от недавних до выпусков первых лет факультета. В новом сезоне каталог пополнится программами по налогам, комплаенсу и медиации.\n\nКаталог программ – в разделе «ДПО».",
    published_at: "2026-06-20T15:00:00.000Z",
  },
  {
    id: "n-006", slug: "klubu-pyat-let",
    title: "Клубу пять лет: как мы росли",
    excerpt: "От первой встречи выпускников до реестра сообщества – главные вехи.",
    body: "Клубу выпускников исполнилось пять лет. За это время сообщество выросло от неформальных встреч до реестра выпускников с уровнями, баллами и скидками на программы ДПО. История клуба – на главной странице, в разделе «История».",
    published_at: "2025-11-05T12:00:00.000Z",
  },
];

const PROGRAMS = [
  {
    id: "p-001", slug: "nalogovoe-administrirovanie",
    title: "Налоговое администрирование",
    direction: "Налоговое право", format: "online", duration: "6 месяцев · 144 ак. ч.",
    price: 8_500_000, enrollment: "actual", source_url: null,
    dates: { start: "2026-10-05" },
    modules: [
      { title: "Налоговая система и администрирование", hours: 36, points: ["Обязанности налоговых органов и налогоплательщиков", "Камеральные и выездные проверки", "Взаимозависимые лица и трансфертное ценообразование"] },
      { title: "Налоговые споры", hours: 40, points: ["Досудебное урегулирование", "Судебная практика по необоснованной выгоде", "Дробление бизнеса: риски и доказывание"] },
      { title: "НДС и налог на прибыль: сложные вопросы", hours: 36, points: ["Вычеты и возмещение НДС", "Расходы и их документальное подтверждение"] },
      { title: "Итоговая аттестация", hours: 32, points: ["Итоговая работа по кейсу"] },
    ],
    teachers: [
      { name: "Преподаватель кафедры", role: "налоговое право" },
      { name: "Практикующий советник", role: "налоговые споры" },
    ],
    description: "Программа о том, как устроено налоговое администрирование на практике: проверки, споры, доказывание. Для юристов компаний и консультантов.",
    document: "Удостоверение о повышении квалификации",
  },
  {
    id: "p-002", slug: "biznes-mediatsiya",
    title: "Бизнес-медиация",
    direction: "ADR и переговоры", format: "blended", duration: "4 месяца · 108 ак. ч.",
    price: 7_200_000, enrollment: "actual", source_url: null,
    dates: { start: "2026-11-02" },
    modules: [
      { title: "Введение в медиацию", hours: 24, points: ["Принципы и процедура медиации", "Правовой статус медиатора"] },
      { title: "Медиация в коммерческих спорах", hours: 36, points: ["Договорные и корпоративные конфликты", "Медиативное соглашение и его исполнение"] },
      { title: "Практикум: ведение медиации", hours: 48, points: ["Ролевые сессии", "Разбор реальных сценариев"] },
    ],
    teachers: [{ name: "Преподаватель кафедры", role: "процессуальное право" }],
    description: "Практическая программа о переговорном урегулировании коммерческих конфликтов: от принципов медиации до ведения сессии.",
    document: "Удостоверение о повышении квалификации",
  },
  {
    id: "p-003", slug: "komplaens-v-kompanii",
    title: "Комплаенс в компании",
    direction: "Корпоративное право", format: "online", duration: "3 месяца · 72 ак. ч.",
    price: 6_400_000, enrollment: "actual", source_url: null,
    dates: { start: "2026-10-19" },
    modules: [
      { title: "Комплаенс-система организации", hours: 24, points: ["Стандарты и внутренние политики", "Антикоррупционный комплаенс"] },
      { title: "Санкционный и антимонопольный комплаенс", hours: 24, points: ["Проверка контрагентов", "Картели и предупреждения ФАС"] },
      { title: "Персональные данные", hours: 24, points: ["152-ФЗ на практике", "Трансграничная передача данных"] },
    ],
    teachers: [{ name: "Преподаватель кафедры", role: "корпоративное право" }],
    description: "Как выстроить комплаенс-функцию: антикоррупционные политики, санкционные риски, персональные данные.",
    document: "Удостоверение о повышении квалификации",
  },
  {
    id: "p-004", slug: "korporativnye-spory",
    title: "Корпоративные споры",
    direction: "Корпоративное право", format: "offline", duration: "5 месяцев · 120 ак. ч.",
    price: 9_800_000, enrollment: "actual", source_url: null,
    dates: { start: "2027-02-01" },
    modules: [
      { title: "Корпоративный конфликт: стадии и стратегии", hours: 40, points: ["Конфликт акционеров", "Оспаривание решений органов управления"] },
      { title: "Корпоративный арбитраж", hours: 40, points: ["Арбитрабельность корпоративных споров", "Корпоративные договоры (КДШ)"] },
      { title: "Судебная практика", hours: 40, points: ["Обзор позиций высших судов"] },
    ],
    teachers: [{ name: "Преподаватель кафедры", role: "гражданское право" }],
    description: "Очная программа о корпоративных конфликтах: от дедлока в совете директоров до корпоративного арбитража.",
    document: "Диплом о профессиональной переподготовке",
  },
  {
    id: "p-005", slug: "intellektualnaya-sobstvennost",
    title: "Интеллектуальная собственность и IT-право",
    direction: "ИС и IT", format: "online", duration: "4 месяца · 96 ак. ч.",
    price: 7_900_000, enrollment: "actual",
    source_url: "https://www.hse.ru/edu/dpo/", // программа на маркетплейсе: запись и оплата там
    dates: { start: "2026-11-16" },
    modules: [
      { title: "Охрана результатов интеллектуальной деятельности", hours: 32, points: ["Товарные знаки", "Авторское право в цифровой среде"] },
      { title: "IT-договоры", hours: 32, points: ["Разработка и SaaS", "Лицензионные модели"] },
      { title: "Данные и платформы", hours: 32, points: ["Регулирование платформ", "Обезличивание данных"] },
    ],
    teachers: [{ name: "Преподаватель кафедры", role: "информационное право" }],
    description: "Программа для юристов технологических компаний: ИС, IT-договоры, данные.",
    document: "Удостоверение о повышении квалификации",
  },
  {
    id: "p-006", slug: "semeynoe-nasledstvenное-pravo",
    title: "Семейное и наследственное право: практика",
    direction: "Частноправовая практика", format: "offline", duration: "3 месяца · 72 ак. ч.",
    price: 5_800_000, enrollment: "nonactual", source_url: null,
    dates: { start: "2026-03-02" },
    modules: [
      { title: "Брачные договоры и раздел имущества", hours: 24, points: ["Судебная практика", "Бизнес-активы в разводе"] },
      { title: "Наследственное планирование", hours: 24, points: ["Наследственные фонды", "Завещания и отказополучатели"] },
      { title: "Споры о детях", hours: 24, points: ["Порядок общения", "Международный элемент"] },
    ],
    teachers: [{ name: "Преподаватель кафедры", role: "семейное право" }],
    description: "Набор в текущий поток закрыт: программа пройдёт в следующем сезоне.",
    document: "Удостоверение о повышении квалификации",
  },
];

const PRODUCTS = [
  {
    id: "m-001", slug: "hoodie-themis", title: "Худи «Фемида»",
    category: "Одежда", price: 4_900_00,
    images: ["/assets/merch-hoodie.jpg"], // фикстура: фото-плейсхолдер склада клуба
    variants_json: [
      { sku: "HD-TH-S", size: "S", stock: 3 },
      { sku: "HD-TH-M", size: "M", stock: 7 },
      { sku: "HD-TH-L", size: "L", stock: 5 },
      { sku: "HD-TH-XL", size: "XL", stock: 2 },
    ],
    stock: 17,
    description: "Плотное худи с фасеточной Фемидой клуба. Утеплённое, унисекс. Фото на витрине – складской плейсхолдер.",
  },
  {
    id: "m-002", slug: "tshirt-club", title: "Футболка клубная",
    category: "Одежда", price: 2_400_00,
    images: ["/assets/merch-hoodie.jpg"],
    variants_json: [
      { sku: "TS-CL-S", size: "S", stock: 10 },
      { sku: "TS-CL-M", size: "M", stock: 12 },
      { sku: "TS-CL-L", size: "L", stock: 8 },
    ],
    stock: 30,
    description: "Базовая футболка со знаком клуба на груди. Фото на витрине – складской плейсхолдер.",
  },
  {
    id: "m-003", slug: "tote-veritas", title: "Шоппер «Veritas»",
    category: "Аксессуары", price: 1_500_00,
    images: ["/assets/merch-hoodie.jpg"],
    variants_json: [{ sku: "TT-VR-ONE", stock: 25 }],
    stock: 25,
    description: "Плотный шоппер для кодексов и ноутбука. Фото на витрине – складской плейсхолдер.",
  },
  {
    id: "m-004", slug: "cup-club", title: "Кружка клубная",
    category: "Аксессуары", price: 900_00,
    images: ["/assets/merch-hoodie.jpg"],
    variants_json: null,
    stock: 40,
    description: "Керамическая кружка 330 мл с монограммой клуба. Фото на витрине – складской плейсхолдер.",
  },
];

const EVENTS = [
  {
    id: "1d3f9c2e-7a41-4c5f-9a2b-0e1c4d5a6b71", title: "Встреча выпускников: осенний сезон",
    description: "Открытая встреча клуба: итоги лета, планы на учебный год, нетворкинг по отраслям права.",
    starts_at: "2026-10-08T18:30:00.000Z", location: "Москва, кампус на Покровском бульваре",
    cover: null, reg_url: "https://example.com/reg/osenniy-sezon", format: "offline",
    points: 60, status: "published",
  },
  {
    id: "2e4a0d3f-8b52-4d6a-ab3c-1f2d5e6b7c82", title: "Правовой дайджест: разбор изменений (онлайн)",
    description: "Ежемесячный онлайн-разбор: что изменилось в законодательстве и практике за месяц.",
    starts_at: "2026-10-15T17:00:00.000Z", location: null,
    cover: null, reg_url: "https://example.com/reg/daidzhest-oktyabr", format: "online",
    points: 30, status: "published",
  },
  {
    id: "3f5b1e4a-9c63-4e7b-bc4d-2a3e6f7c8d93", title: "Карьерный марафон: мок-интервью",
    description: "Тренировочные интервью с выпускниками-практиками: резюме, кейсы, обратная связь.",
    starts_at: "2026-11-05T18:00:00.000Z", location: "Москва, кампус на Покровском бульваре",
    cover: null, reg_url: "https://example.com/reg/mok-intervyu", format: "offline",
    points: 80, status: "published",
  },
  {
    id: "4a6c2f5b-ad74-4f8c-cd5e-3b4f7a8d9e04", title: "Спартакиада юристов: тренировка сборной",
    description: "Открытая тренировка сборной клуба перед спартакиадой. Форма – спортивная.",
    starts_at: "2026-11-21T11:00:00.000Z", location: "Спортзал кампуса",
    cover: null, reg_url: "https://example.com/reg/spartakiada-tren", format: "offline",
    points: 40, status: "published",
  },
  {
    id: "5b7d3a6c-be85-4a9d-de6f-4c5a8b9eaf15", title: "Лекция клуба: искусственный интеллект и право (онлайн)",
    description: "Открытая лекция о регулировании ИИ: ответственность, данные, интеллектуальная собственность.",
    starts_at: "2026-12-03T18:00:00.000Z", location: null,
    cover: null, reg_url: "https://example.com/reg/ii-i-pravo", format: "online",
    points: 30, status: "published",
  },
].map((e, i) => ({ ...e, going: 4 + i * 3, my_rsvp: false, my_attended: false }));

const PODCASTS = {
  items: [
    {
      id: "c1", title: "Как устроен клуб: пилотный выпуск",
      description: "Пробный выпуск: о том, зачем клуб выпускников, чем занимается реестр и как вступить.",
      cover: null, duration: "24:10", is_free: true,
      audio_url: "/api/podcasts/c1/audio?h=free&exp=0&sig=mock", // пробный выпуск – слушается без подписки
      video_url: null,
    },
    {
      id: "c2", title: "Карьера в налоговой практике",
      description: "Разговор о том, как расти в налоговой практике: с чего начать и что читают партнёры.",
      cover: null, duration: "41:32", is_free: false,
      audio_url: null, // закрытый выпуск: ссылка на аудио только у подписчика
      video_url: null,
    },
    {
      id: "c3", title: "Медиация вместо суда",
      description: "О переговорном урегулировании споров: когда медиация работает, а когда нет.",
      cover: null, duration: "36:05", is_free: false,
      audio_url: null,
      video_url: null,
    },
  ],
  subscribed: false, sub_until: null, price: 399_900,
};

const TIMELINE = [
  { id: "t-1", year: "2021", title: "Первая встреча выпускников", text: "Несколько выпусков факультета права собрались вместе – так появился клуб.", metric: "первые участники", sort: 1 },
  { id: "t-2", year: "2022", title: "Регулярные события и дайджесты", text: "Афиша встреч стала регулярной, запущен правовой дайджест канала клуба.", metric: "ежемесячная афиша", sort: 2 },
  { id: "t-3", year: "2023", title: "Скидки на программы ДПО", text: "Выпускникам клуба открыли цену выпускника на программы факультета.", metric: "каталог ДПО", sort: 3 },
  { id: "t-4", year: "2024", title: "Реестр выпускников", text: "Появился личный кабинет: статус, уровни, баллы за участие в жизни клуба.", metric: "4 уровня статуса", sort: 4 },
  { id: "t-5", year: "2025", title: "Подкасты и сообщество", text: "Запущены подкасты клуба и раздел «Сообщество» – однокурсники в одном месте.", metric: "закрытые выпуски", sort: 5 },
];

const PAGE_HOME = {
  slug: "home", title: "Клуб выпускников факультета права НИУ ВШЭ",
  blocks: {
    hero: {
      badge: "клуб выпускников",
      title_pre: "Статус выпускника,",
      title_accent: "который работает",
      subtitle: "Личный кабинет со статусом, скидка на программы ДПО, события клуба и однокурсники.",
      cta_primary: "Вступить в клуб",
      cta_secondary: "Уже в клубе – войти",
      history_eyebrow: "реестр",
      history_title: "История клуба",
      history_hint: "Записи реестра по годам.",
      marquee: ["статус выпускника", "скидка на дпо", "события клуба", "сообщество"],
    },
    cta: {
      title: "Вступайте в клуб",
      text: "Верификация по диплому – статус и скидки в тот же день.",
      button: "Оставить заявку",
    },
  },
};

// ── .ics для события (минимальный валидный VCALENDAR, как в apps/api) ─────
function icsFor(ev) {
  const dt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = new Date(ev.starts_at);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const esc = (t) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Клуб выпускников факультета права НИУ ВШЭ//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${ev.id}@club-pravo-hse`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(start)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${esc(ev.description + (ev.reg_url ? `\nРегистрация: ${ev.reg_url}` : ""))}`] : []),
    ...(ev.location && ev.format !== "online" ? [`LOCATION:${esc(ev.location)}`] : []),
    "URL:http://localhost/events",
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.title)} – через 2 часа`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// ── Минимальный WAV (3 с тишины) – чтобы плеер пробного выпуска «играл» ───
function silenceWav(seconds = 3) {
  const rate = 8000, n = rate * seconds, dataSize = n;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  buf.fill(128, 44); // 8-bit PCM: тишина = 128
  return buf;
}
const FREE_WAV = silenceWav();

// ── Маршрутизация ────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname;
  const method = req.method ?? "GET";

  // Приватные разделы: токена в фикстурном режиме нет → всегда 401.
  if (path === "/me" || path.startsWith("/me/")) return send401(res);

  // Любые POST/PATCH/DELETE: честно отказываем – вход, заказы, RSVP,
  // подписки и админка в фикстурном режиме не имитируются.
  if (method !== "GET" && method !== "HEAD") {
    if (path.startsWith("/auth/")) return sendMockUnavailable(res, 503);
    return sendMockUnavailable(res, path === "/podcasts/subscribe" ? 401 : 503);
  }

  // Health/readiness (формы как у реального apps/api + ok:true).
  if (path === "/health") return sendJson(res, 200, { ok: true, status: "ok", service: "club-api-mock", ts: new Date().toISOString() });
  if (path === "/ready") return sendJson(res, 200, { ok: true, status: "ok", directus: { ok: true } });

  // Публичные счётчики клуба для главной.
  if (path === "/stats") return sendJson(res, 200, { alumni: 312, events: EVENTS.length, programs: PROGRAMS.length });

  // Новости.
  if (path === "/news") {
    const raw = Number(url.searchParams.get("limit"));
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(100, raw) : NEWS.length;
    return sendJson(res, 200, NEWS.slice(0, limit));
  }
  let m = path.match(/^\/news\/([^/]+)$/);
  if (m) {
    const item = NEWS.find((n) => n.slug === decodeURIComponent(m[1]));
    return item ? sendJson(res, 200, item) : sendJson(res, 404, { error: "Новость не найдена" });
  }

  // Каталог ДПО.
  if (path === "/programs") {
    return sendJson(res, 200, PROGRAMS.map(({ id, slug, title, direction, format, duration, price, enrollment, source_url }) =>
      ({ id, slug, title, direction, format, duration, price, enrollment, source_url })));
  }
  m = path.match(/^\/programs\/([^/]+)$/);
  if (m) {
    const p = PROGRAMS.find((x) => x.slug === decodeURIComponent(m[1]));
    return p ? sendJson(res, 200, p) : sendJson(res, 404, { error: "Программа не найдена" });
  }

  // Каталог мерча.
  if (path === "/products") return sendJson(res, 200, PRODUCTS);

  // Афиша событий + экспорт в календарь.
  m = path.match(/^\/events\/([0-9a-f-]{36})\.ics$/i);
  if (m) {
    const ev = EVENTS.find((e) => e.id === m[1].toLowerCase());
    if (!ev) return sendJson(res, 404, { error: "Событие не найдено" });
    res.writeHead(200, {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="club-event.ics"',
      "cache-control": "no-store",
    });
    return res.end(icsFor(ev));
  }
  if (path === "/events") return sendJson(res, 200, EVENTS);

  // Подкасты: список публичен, audio_url только у пробного выпуска.
  if (path === "/podcasts") return sendJson(res, 200, PODCASTS);
  m = path.match(/^\/podcasts\/([^/]+)\/audio$/);
  if (m) {
    const p = PODCASTS.items.find((x) => x.id === m[1]);
    if (!p?.audio_url) return sendJson(res, 403, { error: "Ссылка недействительна или истекла" });
    res.writeHead(200, {
      "content-type": "audio/wav", "cache-control": "private, max-age=60",
      "accept-ranges": "bytes", "x-content-type-options": "nosniff",
    });
    return res.end(FREE_WAV);
  }

  // Главная страница (M2A-блоки, свёрнутые в { hero, cta }).
  m = path.match(/^\/pages\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    return slug === "home" ? sendJson(res, 200, PAGE_HOME) : sendJson(res, 404, { error: "Страница не найдена" });
  }

  // «История» на главной.
  if (path === "/timeline") return sendJson(res, 200, TIMELINE);

  // Гостевая корзина: чтение отдаёт пустую сводку (как apps/api для новой
  // сессии), изменения корзины в фикстурном режиме не имитируются (503 выше).
  if (path === "/cart") return sendJson(res, 200, { items: [], count: 0, subtotal: 0 });

  // Онлайн-оплата и push выключены (как apps/api без ключей).
  if (path === "/payments/config") return sendJson(res, 200, { enabled: false });
  if (path === "/push/vapid") return sendJson(res, 200, { enabled: false, key: null });

  return send404(res, path);
});

server.listen(PORT, () => {
  console.log(`[mock-api] фикстурный сервер слушает http://localhost:${PORT}`);
  console.log(`[mock-api] фронт: pnpm -C apps/web dev  →  http://localhost:5173 (прокси /api → :${PORT})`);
});
