import { z } from "zod";

const schema = z.object({
  API_PORT: z.coerce.number().default(3000),
  DIRECTUS_URL: z.string().url(),
  DIRECTUS_SERVICE_TOKEN: z.string().min(1, "DIRECTUS_SERVICE_TOKEN обязателен"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET минимум 32 символа"),
  TELEGRAM_BOT_TOKEN: z.string().default(""), // пусто = mini-app авторизация BLOCKED
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
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
