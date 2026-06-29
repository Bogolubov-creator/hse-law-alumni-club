// Сид каталога ДПО — взят из прототипа club-business-law.html.
// price — в копейках (целое), как в схеме данных.

export interface ProgramSeed {
  slug: string;
  title: string;
  direction: string;
  format: "online" | "offline" | "blended";
  duration: string;
  price: number; // копейки
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

export const PROGRAMS_SEED: ProgramSeed[] = [
  { slug: "anticorruption-compliance", title: "Антикоррупционный комплаенс в бизнесе", direction: "Комплаенс", format: "online", duration: "6 недель", price: 4_800_000 },
  { slug: "digital-law-ai", title: "Цифровое право и ИИ", direction: "Цифровое право", format: "blended", duration: "8 недель", price: 6_200_000 },
  { slug: "gr-public-policy", title: "GR и взаимодействие с государством", direction: "GR & публичная политика", format: "offline", duration: "5 недель", price: 5_400_000 },
  { slug: "ma-deals", title: "Сделки M&A: практикум", direction: "Корпоративное право", format: "online", duration: "7 недель", price: 7_100_000 },
  { slug: "arbitration-mediation", title: "Арбитраж и медиация", direction: "Разрешение споров", format: "online", duration: "6 недель", price: 4_600_000 },
  { slug: "lawyer-leader", title: "Юрист как лидер: переговоры", direction: "Soft skills", format: "offline", duration: "4 недели", price: 3_900_000 },
];
