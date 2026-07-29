import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { captureError } from "./sentry.js";

/**
 * Единый обработчик ошибок API. Вынесен из server.ts, чтобы тесты роутов
 * (src/routes/*.test.ts) поднимали приложение с ТОЙ ЖЕ обработкой, а не со своей
 * копией: иначе тест на «невалидное тело → 400» проверял бы поведение, которого
 * в проде нет.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _req, reply) => {
    // Валидационные ошибки zod → 400 (не 500).
    if (err instanceof ZodError) return reply.code(400).send({ error: "Некорректные данные", details: err.issues.map((i) => i.message) });
    app.log.error(err);
    const st = (err as { statusCode?: number }).statusCode;
    if (!st || st >= 500) captureError(err); // в Sentry — только наши падения, не 4xx клиента
    // 4xx — честное сообщение (это ошибка запроса, не наша); 5xx не раскрываем.
    if (st && st < 500) return reply.code(st).send({ error: (err as Error).message || "Некорректный запрос" });
    return reply.code(500).send({ error: "Внутренняя ошибка" });
  });
}
