/** Публичные соцсети клуба (витрина, не бот поддержки). */
export const TELEGRAM_CHANNEL = {
  username: "AlumniLawHSE",
  url: "https://t.me/AlumniLawHSE",
  title: "ALUMNI.ПРАВО.ВЫШКА",
  handle: "@AlumniLawHSE",
  description:
    "Канал сообщества выпускников факультета права НИУ ВШЭ: встречи, новости клуба и анонсы.",
} as const;

export const telegramChannelUrl = TELEGRAM_CHANNEL.url;
