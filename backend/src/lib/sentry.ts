import { env } from "../env.js";

/**
 * Sentry за фичефлагом: пустой SENTRY_DSN = полный no-op (пакет даже не
 * импортируется – на стендах без него ничего не падает). При заданном DSN
 * ловим необработанные исключения и 5xx из fastify-обработчика ошибок.
 */

let client: typeof import("@sentry/node") | null = null;

// Вычистить структурные ПДн (email/телефон) из произвольной строки перед отправкой
// в Sentry. ФИО регуляркой не отловить – поэтому тело, заголовки и параметры
// запроса удаляем целиком в beforeSend, а сообщения ошибок маскируем здесь.
function scrubPii(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d ()-]{7,}\d/g, "[phone]");
}

export async function initSentry(): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    client = await import("@sentry/node");
    client.init({
      dsn: env.SENTRY_DSN,
      tracesSampleRate: 0,
      environment: env.PUBLIC_URL.includes("localhost") ? "dev" : "production",
      // SDK 11 собирает больше данных по умолчанию; отключаем категории с ПДн.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
      },
      beforeSend(event) {
        if (event.message) event.message = scrubPii(event.message);
        for (const v of event.exception?.values ?? []) {
          if (v.value) v.value = scrubPii(v.value);
        }
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.query_string;
          if (event.request.url) {
            try {
              const url = new URL(event.request.url);
              url.search = "";
              url.hash = "";
              event.request.url = url.toString();
            } catch {
              delete event.request.url;
            }
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
