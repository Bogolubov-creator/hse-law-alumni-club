import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { env } from "../env.js";
import { resolveAlumni, requireAdmin } from "../lib/auth.js";
import { addPoints } from "../lib/engine.js";
import { audit } from "../lib/audit.js";
import { pushToAll } from "../lib/push.js";
import { announceEventByEmail } from "../lib/event-announce.js";

const di = directus;

/**
 * Календарь событий клуба: публичная афиша, RSVP («Пойду») для верифицированных,
 * отметка посещения офисом → автоначисление баллов (reason=event, идемпотентно).
 */
export async function eventsRoutes(app: FastifyInstance) {
  // Публичные счётчики клуба для главной. Кэш в памяти на 5 минут.
  let statsCache: { at: number; data: unknown } | null = null;
  app.get("/stats", async () => {
    if (statsCache && Date.now() - statsCache.at < 300_000) return statsCache.data;
    const [alumni, events, programs] = await Promise.all([
      di.request((readItems as any)("alumni", { filter: { verification_status: { _eq: "verified" } }, limit: -1, fields: ["id"] })),
      di.request((readItems as any)("events", { filter: { status: { _in: ["published", "done"] } }, limit: -1, fields: ["id"] })),
      di.request((readItems as any)("programs", { filter: { status: { _eq: "published" } }, limit: -1, fields: ["id"] })),
    ]) as [any[], any[], any[]];
    const data = { alumni: alumni.length, events: events.length, programs: programs.length };
    statsCache = { at: Date.now(), data };
    return data;
  });


  // Публичная афиша: предстоящие и недавние события.
  app.get("/events", async (req) => {
    const alumni = await resolveAlumni(req);
    const rows = (await di.request((readItems as any)("events", {
      filter: { status: { _in: ["published", "done"] } },
      sort: ["starts_at"], limit: 50,
      fields: ["id", "title", "description", "starts_at", "location", "cover", "reg_url", "format", "points", "status"],
    }))) as any[];

    // Счётчик «пойдут» + мой RSVP одним заходом.
    const rsvps = (await di.request((readItems as any)("event_rsvps", {
      limit: -1, fields: ["event_id", "alumni_id", "attended"],
    }))) as { event_id: string; alumni_id: string; attended: boolean }[];
    const going = new Map<string, number>();
    const mine = new Map<string, { attended: boolean }>();
    for (const r of rsvps) {
      going.set(r.event_id, (going.get(r.event_id) ?? 0) + 1);
      if (alumni && r.alumni_id === alumni.id) mine.set(r.event_id, { attended: r.attended });
    }
    return rows.map((e) => ({
      ...e,
      going: going.get(e.id) ?? 0,
      my_rsvp: mine.has(e.id),
      my_attended: mine.get(e.id)?.attended ?? false,
    }));
  });

  // Экспорт события в календарь (.ics): Apple/Google/Outlook. Публично —
  // в файле нет ничего, чего нет на афише.
  app.get("/events/:id.ics", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse({ id: (req.params as any).id });
    const rows = (await di.request((readItems as any)("events", {
      filter: { id: { _eq: id }, status: { _in: ["published", "done"] } }, limit: 1,
      fields: ["id", "title", "description", "starts_at", "location", "format", "reg_url"],
    }))) as any[];
    const ev = rows[0];
    if (!ev) return reply.code(404).send({ error: "Событие не найдено" });
    const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const start = new Date(ev.starts_at);
    const end = new Date(start.getTime() + 2 * 3600 * 1000); // 2 часа по умолчанию
    const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Клуб выпускников факультета права НИУ ВШЭ//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:event-${ev.id}@club-pravo-hse`,
      `DTSTAMP:${dt(new Date())}`,
      `DTSTART:${dt(start)}`,
      `DTEND:${dt(end)}`,
      `SUMMARY:${esc(ev.title)}`,
      ...(ev.description ? [`DESCRIPTION:${esc(ev.description + (ev.reg_url ? `\nРегистрация: ${ev.reg_url}` : ""))}`] : []),
      ...(ev.location && ev.format !== "online" ? [`LOCATION:${esc(ev.location)}`] : []),
      `URL:${env.PUBLIC_URL}/events`,
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.title)} — через 2 часа`, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ];
    reply.header("content-type", "text/calendar; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="club-event.ics"`);
    return lines.join("\r\n");
  });

  // «Пойду» / «Передумал» — только верифицированные участники клуба.
  app.post("/events/:id/rsvp", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Войдите в личный кабинет" });
    if (me.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const ev = (await di.request((readItems as any)("events", { filter: { id: { _eq: id }, status: { _eq: "published" } }, limit: 1, fields: ["id"] }))) as any[];
    if (!ev[0]) return reply.code(404).send({ error: "Событие не найдено" });

    const existing = (await di.request((readItems as any)("event_rsvps", {
      filter: { event_id: { _eq: id }, alumni_id: { _eq: me.id } }, limit: 1, fields: ["id", "attended"],
    }))) as any[];
    if (existing[0]) {
      if (existing[0].attended) return reply.code(400).send({ error: "Посещение уже отмечено — отменить нельзя" });
      await di.request((deleteItem as any)("event_rsvps", existing[0].id));
      return { going: false };
    }
    await di.request((createItem as any)("event_rsvps", { event_id: id, alumni_id: me.id, attended: false }));
    audit("event.rsvp", { actor: `alumni:${me.id}`, subject: `event:${id}`, req });
    return { going: true };
  });

  // ── Админ: CRUD событий + участники + отметка посещения (баллы) ──
  const eventBody = z.object({
    title: z.string().min(3),
    description: z.string().nullish(),
    starts_at: z.string().min(4),
    location: z.string().nullish(),
    cover: z.string().max(500).nullish(),
    reg_url: z.string().url().max(500).nullish().or(z.literal("").transform(() => null)),
    format: z.enum(["offline", "online"]).default("offline"),
    points: z.number().int().min(0).max(500).default(60),
    status: z.enum(["draft", "published", "done", "canceled"]).default("published"),
  });

  app.get("/admin/events", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const events = (await di.request((readItems as any)("events", { sort: ["-starts_at"], limit: -1, fields: ["id", "title", "description", "starts_at", "location", "cover", "reg_url", "format", "points", "status"] }))) as any[];
    const rsvps = (await di.request((readItems as any)("event_rsvps", { limit: -1, fields: ["id", "event_id", "alumni_id", "attended"] }))) as any[];
    const alumniIds = [...new Set(rsvps.map((r) => r.alumni_id))];
    const names = new Map<string, string | null>();
    if (alumniIds.length) {
      const rows = (await di.request((readItems as any)("alumni", { filter: { id: { _in: alumniIds } }, limit: -1, fields: ["id", "fio"] }))) as any[];
      for (const r of rows) names.set(r.id, r.fio);
    }
    return events.map((e) => ({
      ...e,
      rsvps: rsvps.filter((r) => r.event_id === e.id).map((r) => ({ id: r.id, alumni_id: r.alumni_id, fio: names.get(r.alumni_id) ?? "—", attended: r.attended })),
    }));
  });

  app.post("/admin/events", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = eventBody.parse(req.body);
    const created = (await di.request((createItem as any)("events", { ...b, description: b.description ?? null, location: b.location ?? null, cover: b.cover ?? null, reg_url: b.reg_url ?? null }))) as any;
    audit("event.create", { actor: `admin:${ctx.userId}`, subject: `event:${created.id}`, detail: { title: b.title }, req });
    if (b.status === "published") {
      pushToAll({ title: "Новое событие клуба 📅", body: b.title, url: "/events" });
      announceEventByEmail({ id: created.id, title: b.title, starts_at: b.starts_at, location: b.location, format: b.format, reg_url: b.reg_url });
    }
    return { ok: true, id: created.id };
  });

  app.patch("/admin/events/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = eventBody.partial().parse(req.body);
    await di.request((updateItem as any)("events", id, b));
    return { ok: true };
  });

  app.delete("/admin/events/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("events", id));
    return { ok: true };
  });

  // «Был на событии» → авто-начисление баллов события (идемпотентно навсегда).
  app.post("/admin/events/rsvp/:rsvpId/attend", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { rsvpId } = z.object({ rsvpId: z.string() }).parse(req.params);
    const rows = (await di.request((readItems as any)("event_rsvps", { filter: { id: { _eq: rsvpId } }, limit: 1, fields: ["id", "event_id", "alumni_id", "attended"] }))) as any[];
    const rsvp = rows[0];
    if (!rsvp) return reply.code(404).send({ error: "RSVP не найден" });
    if (rsvp.attended) return { ok: true, already: true };

    const ev = (await di.request((readItems as any)("events", { filter: { id: { _eq: rsvp.event_id } }, limit: 1, fields: ["title", "points"] }))) as any[];
    // Сначала баллы (идемпотентны по ключу), потом attended:true. Иначе при сбое
    // начисления attended уже стоял бы, а повтор коротко замыкался guard-ом выше —
    // участник навсегда без баллов за событие.
    await addPoints(rsvp.alumni_id, {
      reason: "event",
      delta: ev[0]?.points ?? 60,
      ref: rsvp.event_id,
      comment: `Участие: ${ev[0]?.title ?? "событие клуба"}`,
      idempotencyKey: `event-${rsvp.event_id}-${rsvp.alumni_id}`,
    });
    await di.request((updateItem as any)("event_rsvps", rsvp.id, { attended: true }));
    audit("event.attended", { actor: `admin:${ctx.userId}`, subject: `alumni:${rsvp.alumni_id}`, detail: { event: rsvp.event_id }, req });
    return { ok: true };
  });
}
