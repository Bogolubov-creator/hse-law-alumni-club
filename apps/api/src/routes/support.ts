import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z, ZodError } from "zod";
import { checkoutPool } from "../lib/checkout-store.js";
import { env } from "../env.js";
import { requireAdmin, requireFullAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { faqGapStats, logFaqEvent } from "../lib/faq-events.js";
import { rangeSince } from "../lib/admin-analytics.js";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const access = z.string().regex(/^[a-f0-9]{64}$/);
const message = z.string().trim().min(5).max(4000);
const idSchema = z.object({ id: z.string().uuid() });
export function supportConfig() {
  const draft = env.APP_ENV !== "production";
  const configured = !!(env.SUPPORT_OPERATOR_NAME && env.SUPPORT_OPERATOR_CONTACT && env.SUPPORT_OPERATOR_ADDRESS);
  const enabled = draft || (env.SUPPORT_ENABLED === "true" && configured);
  const operator = configured ? `${env.SUPPORT_OPERATOR_NAME}, ${env.SUPPORT_OPERATOR_ADDRESS}. Контакт: ${env.SUPPORT_OPERATOR_CONTACT}.` : "Локальный тестовый стенд. Оператор и его реквизиты для публикации ещё не определены. Используйте только вымышленные данные.";
  const consent = `${operator} Цель: рассмотрение моего обращения и предоставление ответа в поддержке сайта. Данные: тема и содержание сообщений, включая добровольно указанные мной сведения, технический номер обращения и время отправки. Действия: сбор, запись, хранение, чтение, уточнение и удаление с использованием средств автоматизации. Доступ: уполномоченные сотрудники поддержки. Передача в сторонние чат-сервисы и использование для рекламы не предусмотрены. Срок: ${env.SUPPORT_RETENTION_DAYS} дней после последнего сообщения или закрытия обращения. Отозвать согласие и удалить переписку можно кнопкой «Удалить обращение» с кодом доступа; также можно обратиться к оператору по указанному контакту. Не сообщайте данные третьих лиц, сведения о здоровье, документы и платёжные реквизиты.`;
  return { enabled, draft, consent, version: hash(consent), retentionDays: env.SUPPORT_RETENTION_DAYS };
}
export async function purgeSupport() {
  if (!env.CHECKOUT_DATABASE_URL) return;
  await checkoutPool().query("DELETE FROM club_support_tickets WHERE expires_at <= now()");
}
export async function supportRoutes(app: FastifyInstance) {
  // Сообщения и ключи не уходят в журналы ошибок или внешний мониторинг.
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "Проверьте поля обращения и согласие" });
    const status = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
    if (status && status < 500) return reply.code(status).send({ error: status === 429 ? "Слишком много запросов. Попробуйте позднее." : "Запрос не может быть выполнен" });
    app.log.error({ event: "support.failed" }, "support request failed");
    return reply.code(500).send({ error: "Не удалось обработать обращение. Повторите позднее." });
  });
  app.addHook("onSend", async (_req, reply) => { reply.header("Cache-Control", "no-store"); });
  app.get("/support/config", async () => supportConfig());
  /** Счётчик FAQ-gap / unmatched – без текста вопроса. */
  app.post("/support/faq-event", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const body = z.object({
      kind: z.enum(["gap", "none"]),
      gapId: z.string().trim().min(1).max(64).optional(),
      channel: z.enum(["site", "telegram"]).default("site"),
    }).parse(req.body);
    void logFaqEvent({ kind: body.kind, gapId: body.gapId, channel: body.channel });
    return { ok: true };
  });
  app.post("/support", { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const config = supportConfig();
    if (!config.enabled) return reply.code(503).send({ error: "Поддержка пока не принимает обращения" });
    const data = z.object({ id: z.string().uuid(), key: access, topic: z.enum(["account", "order", "personal_data", "other"]), message, consent: z.literal(true), consentVersion: z.string(), website: z.string().max(0).optional() }).strict().parse(req.body);
    if (data.consentVersion !== config.version) return reply.code(409).send({ error: "Условия изменились. Обновите страницу и ознакомьтесь с согласием." });
    const requestHash = hash(JSON.stringify([data.topic, data.message, data.consentVersion]));
    const result = await checkoutPool().query(`INSERT INTO club_support_tickets(id,key_hash,request_hash,topic,messages,consent_version,consent_text,expires_at)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,now()+$8*interval '1 day') ON CONFLICT(id) DO NOTHING RETURNING id`,
      [data.id, hash(data.key), requestHash, data.topic, JSON.stringify([{ author: "visitor", text: data.message, at: new Date().toISOString() }]), config.version, config.consent, config.retentionDays]);
    if (!result.rowCount) {
      const prior = await checkoutPool().query("SELECT id FROM club_support_tickets WHERE id=$1 AND key_hash=$2 AND request_hash=$3 AND expires_at>now()", [data.id, hash(data.key), requestHash]);
      if (!prior.rowCount) return reply.code(409).send({ error: "Повторная отправка отличается от исходной" });
    }
    return { id: data.id, status: "open" };
  });
  app.get("/support/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = idSchema.parse(req.params); const key = access.parse(req.headers["x-support-key"]);
    const { rows } = await checkoutPool().query("SELECT id,topic,messages,status,created_at,expires_at FROM club_support_tickets WHERE id=$1 AND key_hash=$2 AND expires_at>now()", [id, hash(key)]);
    if (!rows[0]) return reply.code(404).send({ error: "Обращение не найдено или код доступа неверен" });
    return rows[0];
  });
  app.post("/support/:id/messages", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const { id } = idSchema.parse(req.params); const key = access.parse(req.headers["x-support-key"]); const data = z.object({ message }).strict().parse(req.body);
    const { rowCount } = await checkoutPool().query(`UPDATE club_support_tickets SET messages=messages||$3::jsonb,status='open',updated_at=now(),expires_at=now()+$4*interval '1 day' WHERE id=$1 AND key_hash=$2 AND expires_at>now() AND status<>'closed' AND jsonb_array_length(messages)<50`, [id, hash(key), JSON.stringify([{ author: "visitor", text: data.message, at: new Date().toISOString() }]), env.SUPPORT_RETENTION_DAYS]);
    if (!rowCount) return reply.code(409).send({ error: "Обращение недоступно, закрыто или достигнут лимит сообщений" });
    return { ok: true };
  });
  app.delete("/support/:id", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = idSchema.parse(req.params); const key = access.parse(req.headers["x-support-key"]);
    const { rowCount } = await checkoutPool().query("DELETE FROM club_support_tickets WHERE id=$1 AND key_hash=$2", [id, hash(key)]);
    if (!rowCount) return reply.code(404).send({ error: "Обращение не найдено" });
    return { ok: true };
  });
  app.get("/admin/support", async (req, reply) => {
    // Тикеты – ПДн, но офис (editor) ведёт переписку; полный admin – для анонимизации/денег.
    const ctx = requireAdmin(req, reply); if (!ctx) return reply;
    const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const { rows } = await checkoutPool().query("SELECT id,topic,messages,status,created_at,expires_at FROM club_support_tickets WHERE expires_at>now() ORDER BY updated_at DESC LIMIT 30 OFFSET $1", [(page-1)*30]);
    audit("support.read", { actor: `admin:${ctx.userId}` });
    return rows;
  });
  /** Статус FAQ/Telegram – чтение для офиса (editor+admin), без ПДн. */
  app.get("/admin/bot-status", async (req, reply) => {
    const ctx = requireAdmin(req, reply); if (!ctx) return reply;
    const { BOT_FAQ } = await import("@club/shared");
    const username = env.TELEGRAM_BOT_USERNAME || "pravohse_alumni_bot";
    let openApprox: number | null = null;
    try {
      if (env.CHECKOUT_DATABASE_URL) {
        const { rows } = await checkoutPool().query(
          "SELECT count(*)::int AS n FROM club_support_tickets WHERE expires_at>now() AND status='open'",
        );
        openApprox = rows[0]?.n ?? 0;
      }
    } catch {
      openApprox = null;
    }
    const cfg = supportConfig();
    return {
      telegram: {
        username,
        tokenConfigured: !!env.TELEGRAM_BOT_TOKEN,
        polling: env.TELEGRAM_POLLING === "true",
        link: `https://t.me/${username}`,
      },
      siteFaq: {
        answers: BOT_FAQ.answers.length,
        gaps: BOT_FAQ.gaps.length,
        note: "Ворона на сайте и @pravohse_alumni_bot отвечают одним FAQ; каталог ДПО – из API.",
        hits: await faqGapStats(rangeSince("30d")),
      },
      tickets: { enabled: cfg.enabled, draft: cfg.draft, openApprox },
    };
  });
  app.patch("/admin/support/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply); if (!ctx) return reply;
    const { id } = idSchema.parse(req.params);
    const data = z.object({ message: message.optional(), status: z.enum(["answered", "closed"]) }).strict().refine(v=>v.status==="closed"||!!v.message).parse(req.body);
    const addition = data.message ? [{ author: "support", text: data.message, at: new Date().toISOString() }] : [];
    const { rowCount } = await checkoutPool().query(`UPDATE club_support_tickets SET messages=messages||$2::jsonb,status=$3,updated_at=now(),expires_at=now()+$4*interval '1 day' WHERE id=$1 AND expires_at>now() AND jsonb_array_length(messages)<50`, [id, JSON.stringify(addition), data.status, env.SUPPORT_RETENTION_DAYS]);
    if (!rowCount) return reply.code(404).send({ error: "Обращение недоступно" });
    audit("support.update", { actor: `admin:${ctx.userId}`, subject: id, detail: { status: data.status } });
    return { ok: true };
  });
}
