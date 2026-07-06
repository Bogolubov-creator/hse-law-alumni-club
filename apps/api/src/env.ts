import { z } from "zod";

const schema = z.object({
  API_PORT: z.coerce.number().default(3000),
  DIRECTUS_URL: z.string().url(),
  DIRECTUS_SERVICE_TOKEN: z.string().min(1, "DIRECTUS_SERVICE_TOKEN обязателен"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET минимум 32 символа"),
  // Отдельный секрет для админ-сессий (defense-in-depth). Пусто = используется AUTH_SECRET.
  ADMIN_AUTH_SECRET: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""), // пусто = mini-app + webhook-бот BLOCKED
  // Секрет webhook (setWebhook secret_token). Пусто = проверка заголовка отключена.
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  // Доп. разрешённые cross-origin источники (через запятую); same-origin и Telegram разрешены всегда.
  CORS_ORIGINS: z.string().default(""),
  // Уведомление офиса (решение 3.2) — на старте telegram
  OFFICE_NOTIFY_CHANNEL: z.enum(["telegram", "email", "both"]).default("telegram"),
  OFFICE_TG_BOT_TOKEN: z.string().default(""),
  OFFICE_TG_CHAT_ID: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  // Оплата через ЮKassa (yookassa.ru). Оба ключа заданы = оплата включена,
  // иначе прежний режим «заявка без оплаты» (BLOCKED до получения ключей магазина).
  YOOKASSA_SHOP_ID: z.string().default(""),
  YOOKASSA_SECRET_KEY: z.string().default(""),
  // Публичный адрес сайта — для return_url после оплаты.
  PUBLIC_URL: z.string().default("http://localhost"),
  // Web-push (VAPID). Пусто = пуши выключены, сайт работает как раньше.
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
