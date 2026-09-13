import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";

export type HealthCheck = {
  id: string; name: string; status: "ok" | "error" | "unknown" | "disabled";
  detail: string; latency_ms?: number;
};

async function probe(id: string, name: string, run: () => Promise<unknown>): Promise<HealthCheck> {
  const start = performance.now();
  try {
    await run();
    return { id, name, status: "ok", detail: "Контрольный запрос выполнен", latency_ms: Math.round(performance.now() - start) };
  } catch {
    // Причины соединения могут содержать адреса и секреты; наружу только результат.
    return { id, name, status: "error", detail: "Контрольный запрос не выполнен", latency_ms: Math.round(performance.now() - start) };
  }
}

export async function buildSystemHealth() {
  const [cms, database] = await Promise.all([
    probe("cms", "CMS · Directus", async () => {
      const response = await fetch(new URL("items/levels?limit=1&fields=id", `${env.DIRECTUS_URL.replace(/\/$/, "")}/`), {
        headers: { Authorization: `Bearer ${env.DIRECTUS_SERVICE_TOKEN}` }, signal: AbortSignal.timeout(3000),
      });
      if (!response.ok || !Array.isArray((await response.json() as { data?: unknown }).data)) throw new Error("probe failed");
    }),
    env.CHECKOUT_DATABASE_URL
      ? probe("database", "База заявок · PostgreSQL", async () => {
        const config = { text: "SELECT 1", query_timeout: 3000 };
        await checkoutPool().query(config);
      })
      : Promise.resolve<HealthCheck>({ id: "database", name: "База заявок · PostgreSQL", status: "disabled", detail: "Подключение не настроено; оформление недоступно" }),
  ]);
  const integration = (id: string, name: string, configured: boolean, detail: string): HealthCheck => ({
    id, name, status: configured ? "unknown" : "disabled", detail: configured ? detail : "Не настроено",
  });
  const checks: HealthCheck[] = [
    { id: "api", name: "API сайта", status: "ok", detail: "Обработал этот запрос" }, cms, database,
    integration("telegram", "Telegram-бот", !!env.TELEGRAM_BOT_TOKEN, "Токен задан; работа обработчика и доставка не проверены"),
    integration("email", "Электронная почта", !!env.SMTP_HOST, "SMTP задан; соединение и доставка не проверены"),
    integration("push", "Push-уведомления", !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), "Ключи заданы; доставка на устройства не проверена"),
  ];
  return {
    checked_at: new Date().toISOString(), uptime_seconds: Math.floor(process.uptime()),
    status: checks.some((c) => c.status === "error" || (c.id === "database" && c.status === "disabled")) ? "degraded" : "partial",
    checks,
  };
}
