import { env } from "../env.js";

/**
 * Sentry за фичефлагом: пустой SENTRY_DSN = полный no-op (пакет даже не
 * импортируется — на стендах без него ничего не падает). При заданном DSN
 * ловим необработанные исключения и 5xx из fastify-обработчика ошибок.
 */

let client: typeof import("@sentry/node") | null = null;

// Вычистить структурные ПДн (email/телефон) из произвольной строки перед отправкой
// в Sentry. ФИО регуляркой не отловить — поэтому тело запроса/куки/Authorization
// удаляем целиком в beforeSend (ниже), а сообщения ошибок маскируем здесь.
function scrubPii(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d ()\-]{7,}\d/g, "[phone]");
}

export async function initSentry(): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    client = await import("@sentry/node");
    client.init({
      dsn: env.SENTRY_DSN,
      tracesSampleRate: 0,
      environment: env.PUBLIC_URL.includes("localhost") ? "dev" : "production",
      // 152-ФЗ: не отправляем ПДн наружу. Тело/куки/Authorization не прикладываем,
      // а сообщения ошибок маскируем от случайно попавших email/телефонов.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.message) event.message = scrubPii(event.message);
        for (const v of event.exception?.values ?? []) {
          if (v.value) v.value = scrubPii(v.value);
        }
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
        }
        return event;
      },
    });
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
