import type { FastifyRequest } from "fastify";
import { createItem } from "@directus/sdk";
import { directus } from "./directus.js";

/**
 * Append-only аудит-след критичных операций: логины (успех/провал), платежи,
 * смены статусов, выдачи подписок, верификация, CRUD каталога. Нужен для
 * расследования инцидентов и споров по оплатам (кто/что/когда/с какого IP).
 *
 * Запись fire-and-forget: сбой аудита никогда не ломает бизнес-операцию,
 * но оставляет след в логах приложения.
 */
export function audit(
  event: string,
  opts: { actor?: string; subject?: string; detail?: Record<string, unknown>; req?: FastifyRequest } = {},
): void {
  const ip = opts.req?.ip ?? null; // за Caddy – реальный IP (trustProxy)
  void directus
    .request((createItem as any)("audit_log", {
      event,
      actor: opts.actor ?? "system",
      subject: opts.subject ?? null,
      detail: opts.detail ?? null,
      ip,
    }))
    .catch((e: Error) => console.error(`[audit] не записалось ${event}:`, e.message));
}
