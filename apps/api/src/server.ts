import { supportRoutes, purgeSupport } from "./routes/support.js";
import { safeRequestLog } from "./lib/request-log.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cron from "node-cron";
import { env, assertProdConfig } from "./env.js";
import { checkDirectus } from "./lib/directus.js";
import { contentRoutes } from "./routes/content.js";
import { pointsRoutes } from "./routes/points.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { cartRoutes } from "./routes/cart.js";
import { ordersRoutes } from "./routes/orders.js";
import { adminRoutes } from "./routes/admin.js";
import { communityRoutes } from "./routes/community.js";
import { paymentsRoutes } from "./routes/payments.js";
import { podcastsRoutes } from "./routes/podcasts.js";
import { avatarsRoutes } from "./routes/avatars.js";
import { eventsRoutes } from "./routes/events.js";
import { pushRoutes } from "./routes/push.js";
import { telegramRoutes } from "./routes/telegram.js";
import { pageviewRoutes } from "./routes/pageviews.js";
import { registerBotCommands } from "./lib/telegram-bot.js";
import { startTelegramPolling } from "./lib/telegram-polling.js";
import { runDecay } from "./lib/engine.js";
import { runPodcastSubReminders } from "./lib/podcast-reminders.js";
import { runEventReminders } from "./lib/event-reminders.js";
import { runRetention } from "./lib/retention.js";
import { expireStaleReservations } from "./lib/checkout-store.js";
import { drainMailOutbox } from "./lib/notify.js";
import { initSentry } from "./lib/sentry.js";
import { registerErrorHandler } from "./lib/errors.js";
import { syncDpoCatalog } from "./lib/hse-sync.js";

// trustProxy: 1 – доверяем ТОЛЬКО одному прокси-хопу (Caddy). true доверял бы всей
// цепочке X-Forwarded-For, и клиент мог бы подделать req.ip (обход rate-limit,
// IP-allowlist вебхука ЮKassa, отравление IP в аудите). Число хопов = 1 (Caddy → api).
const app = Fastify({
  logger: {
    // Подписанные ссылки и токены подтверждения не попадают в журнал URL.
    serializers: { req: safeRequestLog },
    redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "password", "token"],
  },
  trustProxy: 1, bodyLimit: 256 * 1024,
});

// Валидационные ошибки zod → 400 (не 500).
await initSentry();

// Обработчик живёт в lib/errors.ts – тем же пользуются тесты роутов.
registerErrorHandler(app);

// Заголовки безопасности (API всегда JSON и не встраивается во фрейм).
await app.register(helmet, {
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: { maxAge: 15552000, includeSubDomains: true },
});

// Персональные/платёжные ответы не должны оседать в кэшах браузера и прокси.
app.addHook("onSend", async (req, reply) => {
  const url = req.url;
  if (url.startsWith("/me") || url.startsWith("/admin") || url.startsWith("/auth") || url.startsWith("/podcasts") || url.startsWith("/orders")) {
    reply.header("Cache-Control", "no-store");
  }
});

// Предупреждения о небезопасной прод-конфигурации – видны в логах при старте.
if (env.YOOKASSA_SHOP_ID && !env.PUBLIC_URL.startsWith("https://")) {
  app.log.warn("ОПЛАТА ВКЛЮЧЕНА, но PUBLIC_URL не https:// – на проде это недопустимо (redirect после оплаты пойдёт по HTTP)");
}
if (!env.ADMIN_AUTH_SECRET) {
  app.log.warn("ADMIN_AUTH_SECRET пуст – админ-сессии подписываются общим AUTH_SECRET (на проде задайте отдельный)");
}
// Fail-fast: при APP_ENV=production небезопасная конфигурация прерывает старт
// (плейсхолдеры секретов, PUBLIC_URL не https, бот на webhook без секрета).
const prodErrs = assertProdConfig();
if (prodErrs.length) {
  for (const e of prodErrs) app.log.error(`[prod-config] ${e}`);
  app.log.fatal("НЕБЕЗОПАСНАЯ ПРОД-КОНФИГУРАЦИЯ (APP_ENV=production) – старт прерван");
  process.exit(1);
}
// Глобальный лимит запросов per-IP (на auth/оплату/заявки – жёстче, см. роуты).
// Health-пинги мониторинга не лимитируем. Ключ – реальный IP за Caddy (trustProxy).
//
// Потолок вынесен в RATE_LIMIT_MAX: за университетским NAT с одного адреса
// выходит целый корпус, и прежние 300 запросов в минуту на всех отсекали бы
// живых людей. Настоящая защита – точечные лимиты чувствительных ручек.
await app.register(rateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: "1 minute",
  allowList: ["/health", "/ready"],
  continueExceeding: true, // упорный флуд держим в отказе, а не сбрасываем окно
});
// CORS: same-origin (без Origin) + Telegram + явный список из CORS_ORIGINS. Токены в Authorization, не в cookie.
const corsAllow = new Set([
  "https://web.telegram.org",
  "https://oauth.telegram.org",
  ...env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
]);
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || corsAllow.has(origin)),
  methods: ["GET", "POST", "PATCH", "DELETE"],
});
await app.register(contentRoutes);
await app.register(supportRoutes);
// После простоя удаляем обращения с истёкшим сроком; тексты ошибок БД не журналируем.
await purgeSupport().catch(() => app.log.error("support startup retention failed"));
await app.register(pointsRoutes);
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(cartRoutes);
await app.register(ordersRoutes);
await app.register(adminRoutes);
await app.register(communityRoutes);
await app.register(paymentsRoutes);
await app.register(podcastsRoutes);
await app.register(avatarsRoutes);
await app.register(eventsRoutes);
await app.register(pushRoutes);
await app.register(telegramRoutes);
await app.register(pageviewRoutes);

// Фоновые cron-задачи. Держим ссылки, чтобы остановить их при плавной остановке.
// ВНИМАНИЕ: cron выполняется внутри процесса API – деплой одноинстансный. На
// нескольких инстансах задачи задвоятся (нужен distributed-lock) – см. deploy-runbook.
const cronTasks: ReturnType<typeof cron.schedule>[] = [];

// Cron-decay: 03:00 первого числа каждого месяца. Идемпотентно по месяцу.
cronTasks.push(cron.schedule("0 3 1 * *", () => {
  runDecay().catch((e) => app.log.error(e, "decay failed"));
}, { timezone: "Europe/Moscow" }));

// Ночная автосинхронизация каталога ДПО с hse.ru (05:00). Сбой не критичен –
// каталог остаётся прежним, следующая попытка через сутки (или вручную из админки).
cronTasks.push(cron.schedule("0 5 * * *", () => {
  syncDpoCatalog()
    .then((r) => app.log.info(r, "dpo sync ok"))
    .catch((e) => app.log.error(e, "dpo sync failed"));
}, { timezone: "Europe/Moscow" }));

// Напоминание записавшимся за сутки до события (10:00 МСК; идемпотентно).
cronTasks.push(cron.schedule("0 10 * * *", () => {
  runEventReminders()
    .then((r) => { if (r.events) app.log.info(r, "event reminders sent"); })
    .catch((e) => app.log.error(e, "event reminders failed"));
}, { timezone: "Europe/Moscow" }));

// Подписка на подкасты заканчивается через 10 дней (11:00). Идемпотентно:
// флаг снимается при продлении, поэтому напоминание уходит раз за период.
cronTasks.push(cron.schedule("0 11 * * *", () => {
  runPodcastSubReminders()
    .then((r) => { if (r.due) app.log.info(r, "podcast sub reminders sent"); })
    .catch((e) => app.log.error(e, "podcast sub reminders failed"));
}, { timezone: "Europe/Moscow" }));

// Ретенция ПДн (04:00): обезличить старые заявки, подчистить аудит (152-ФЗ).
cronTasks.push(cron.schedule("0 4 * * *", () => {
  purgeSupport().catch(() => app.log.error("support retention failed"));
  runRetention()
    .then((r) => { if (r.orders || r.audit) app.log.info(r, "retention applied"); })
    .catch((e) => app.log.error(e, "retention failed"));
}, { timezone: "Europe/Moscow" }));

// Истечение резерва мерча (каждые 15 мин): new без платежа старше RESERVE_TTL_HOURS.
cronTasks.push(cron.schedule("*/15 * * * *", () => {
  expireStaleReservations()
    .then((n) => { if (n) app.log.info({ expired: n }, "merch reserves expired"); })
    .catch((e) => app.log.error(e, "reserve expiry failed"));
}, { timezone: "Europe/Moscow" }));

// Повтор писем из outbox (каждые 5 мин).
cronTasks.push(cron.schedule("*/5 * * * *", () => {
  drainMailOutbox()
    .then((r) => { if (r.sent || r.failed) app.log.info(r, "mail outbox drained"); })
    .catch((e) => app.log.error(e, "mail outbox failed"));
}, { timezone: "Europe/Moscow" }));

// Базовый health – для healthcheck'а docker и Caddy.
app.get("/health", async () => ({
  status: "ok",
  service: "club-api",
  ts: new Date().toISOString(),
}));

// Готовность – проверяет связь с Directus сервисным токеном (критерий приёмки Фазы 0).
// Эндпоинт публичный (Caddy проксирует /api/*), поэтому наружу отдаём только факт
// готовности: e-mail сервисного аккаунта и детали сидов – подсказка для атакующего.
// Полный ответ checkDirectus() остаётся в логе оператора.
app.get("/ready", async (_req, reply) => {
  const directus = await checkDirectus();
  if (!directus.ok) {
    app.log.error({ directus }, "readiness: Directus недоступен");
    return reply.code(503).send({ status: "degraded", directus: { ok: false } });
  }
  return { status: "ok", directus: { ok: true } };
});

// Плавная остановка: по SIGTERM/SIGINT (docker stop, редеплой) останавливаем cron
// и даём Fastify закрыть уже принятые соединения, а не рвём их посреди запроса.
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} получен – плавная остановка`);
  for (const t of cronTasks) { try { t.stop(); } catch { /* уже остановлена */ } }
  try {
    await app.close(); // дождаться завершения активных запросов и закрыть сервер
  } catch (e) {
    app.log.error(e, "ошибка при app.close()");
  }
  process.exit(0);
}
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`club-api слушает :${env.API_PORT}`);
  if (env.TELEGRAM_BOT_TOKEN) void registerBotCommands(env.TELEGRAM_BOT_TOKEN);
  startTelegramPolling();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
