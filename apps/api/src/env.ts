import { z } from "zod";

const schema = z.object({
  API_PORT: z.coerce.number().default(3000),
  // Явный флаг «боевой прод». NODE_ENV в образе всегда production, поэтому для
  // fail-fast нужен отдельный сигнал, который оператор включает на VPS (APP_ENV=production).
  // Локальный стенд оставляет development → проверки только предупреждают, не роняют старт.
  APP_ENV: z.enum(["development", "production"]).default("development"),
  DIRECTUS_URL: z.string().url(),
  DIRECTUS_SERVICE_TOKEN: z.string().min(1, "DIRECTUS_SERVICE_TOKEN обязателен"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET минимум 32 символа"),
  // Отдельный секрет для админ-сессий (defense-in-depth). Пусто = используется AUTH_SECRET.
  ADMIN_AUTH_SECRET: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""), // пусто = mini-app + webhook-бот BLOCKED
  // Секрет webhook (setWebhook secret_token). Пусто = проверка заголовка отключена.
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  TELEGRAM_POLLING: z.string().default(""), // "true" = long-polling вместо вебхука (локальный стенд)
  TELEGRAM_BOT_USERNAME: z.string().default("pravohse_alumni_bot"),
  // Доп. разрешённые cross-origin источники (через запятую); same-origin и Telegram разрешены всегда.
  CORS_ORIGINS: z.string().default(""),
  // Уведомление офиса (решение 3.2) – на старте telegram
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
  // Публичный адрес сайта – для return_url после оплаты.
  PUBLIC_URL: z.string().default("http://localhost"),
  // Web-push (VAPID). Пусто = пуши выключены, сайт работает как раньше.
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  SENTRY_DSN: z.string().default(""), // пусто = мониторинг ошибок выключен
  ORDER_RETENTION_DAYS: z.coerce.number().int().positive().default(1095), // 3 года – срок хранения заявок (152-ФЗ)
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),  // 1 год – срок хранения аудита
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;

/**
 * Fail-fast небезопасной прод-конфигурации. Возвращает список фатальных проблем
 * (пусто – всё ок). Активна только при APP_ENV=production, чтобы локальный стенд
 * (собранный тем же production-образом) не падал на плейсхолдерах.
 */
export function assertProdConfig(): string[] {
  if (env.APP_ENV !== "production") return [];
  const errs: string[] = [];
  const looksPlaceholder = (v: string) => /replace_with|сгенерируйте|changeme|your[_-]?secret|example/i.test(v);
  if (looksPlaceholder(env.AUTH_SECRET)) errs.push("AUTH_SECRET выглядит как плейсхолдер – сгенерируйте настоящий (openssl rand -hex 32)");
  if (looksPlaceholder(env.DIRECTUS_SERVICE_TOKEN)) errs.push("DIRECTUS_SERVICE_TOKEN выглядит как плейсхолдер");
  if (!env.ADMIN_AUTH_SECRET) errs.push("ADMIN_AUTH_SECRET пуст – задайте отдельный секрет админ-сессий (defense-in-depth)");
  if (!env.PUBLIC_URL.startsWith("https://")) errs.push("PUBLIC_URL должен быть https://<домен> на проде (return_url оплаты, sitemap, canonical)");
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_POLLING !== "true" && !env.TELEGRAM_WEBHOOK_SECRET)
    errs.push("бот на webhook без TELEGRAM_WEBHOOK_SECRET – кто угодно сможет слать поддельные апдейты");
  return errs;
}
