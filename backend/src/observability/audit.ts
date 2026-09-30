import type { FastifyRequest } from "fastify";
import { createItem } from "../db/data-commands.js";
import { data } from "../db/data.js";

// Сбой записи аудита журналируется и не прерывает бизнес-операцию.
export function audit(
  event: string,
  opts: { actor?: string; subject?: string; detail?: Record<string, unknown>; req?: FastifyRequest } = {},
): void {
  const ip = opts.req?.ip ?? null; // за Caddy – реальный IP (trustProxy)
  void data
    .request((createItem as any)("audit_log", {
      event,
      actor: opts.actor ?? "system",
      subject: opts.subject ?? null,
      detail: opts.detail ?? null,
      ip,
    }))
    .catch((e: Error) => console.error(`[audit] не записалось ${event}:`, e.message));
}
