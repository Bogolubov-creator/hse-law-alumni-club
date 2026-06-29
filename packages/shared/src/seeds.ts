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

export const PROGRAMS_SEED: ProgramSeed[] = [
  { slug: "anticorruption-compliance", title: "Антикоррупционный комплаенс в бизнесе", direction: "Комплаенс", format: "online", duration: "6 недель", price: 4_800_000 },
  { slug: "digital-law-ai", title: "Цифровое право и ИИ", direction: "Цифровое право", format: "blended", duration: "8 недель", price: 6_200_000 },
  { slug: "gr-public-policy", title: "GR и взаимодействие с государством", direction: "GR & публичная политика", format: "offline", duration: "5 недель", price: 5_400_000 },
  { slug: "ma-deals", title: "Сделки M&A: практикум", direction: "Корпоративное право", format: "online", duration: "7 недель", price: 7_100_000 },
  { slug: "arbitration-mediation", title: "Арбитраж и медиация", direction: "Разрешение споров", format: "online", duration: "6 недель", price: 4_600_000 },
  { slug: "lawyer-leader", title: "Юрист как лидер: переговоры", direction: "Soft skills", format: "offline", duration: "4 недели", price: 3_900_000 },
];
