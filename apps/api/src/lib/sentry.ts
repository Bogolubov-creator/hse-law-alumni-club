import { env } from "../env.js";

/**
 * Sentry за фичефлагом: пустой SENTRY_DSN = полный no-op (пакет даже не
 * импортируется — на стендах без него ничего не падает). При заданном DSN
 * ловим необработанные исключения и 5xx из fastify-обработчика ошибок.
 */

let client: typeof import("@sentry/node") | null = null;

export async function initSentry(): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    client = await import("@sentry/node");
    client.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0, environment: env.PUBLIC_URL.includes("localhost") ? "dev" : "production" });
    console.log("[sentry] включён");
  } catch (e) {
    console.warn("[sentry] init failed:", (e as Error).message);
    client = null;
  }
}

/** Отправка ошибки, если Sentry включён. Безопасно звать всегда. */
export function captureError(err: unknown): void {
  client?.captureException(err);
}
