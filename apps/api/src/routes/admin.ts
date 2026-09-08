import { changeOrderStatus } from "../lib/checkout-store.js";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { slugifyRu, ORDER_STATUS_RU, ORDER_STATUS_VERB_RU } from "@club/shared";
import { directusCredsValid, findUserWithRole, signAdmin, resolveAdmin, requireAdmin, requireFullAdmin, revokeAdmin } from "../lib/auth.js";
import { addPoints } from "../lib/engine.js";
import { syncDpoCatalog } from "../lib/hse-sync.js";
import { extendPodcastSub, subActive } from "./podcasts.js";
import { audit } from "../lib/audit.js";
import { loginLocked, registerLoginFail, registerLoginSuccess, ipLoginLocked, registerIpFail, registerIpSuccess } from "../lib/security.js";
import { sendEmail } from "../lib/notify.js";
import { pushToAll, pushToAlumni } from "../lib/push.js";
import { anonymizeAlumni } from "../lib/anonymize.js";
import { readUsers } from "@directus/sdk";
import { env } from "../env.js";
import { count, sum, groupCount } from "../lib/agg.js";

/** E-mail выпускника по alumni_id (через привязанный аккаунт). */
async function alumniEmail(alumniId: string): Promise<string | null> {
  const a = (await di.request(readItems("alumni", { filter: { id: { _eq: alumniId } }, limit: 1, fields: ["user_id", "contacts_json"] }))) as any[];
  if (!a[0]) return null;
  if (a[0].user_id) {
    const u = (await di.request((readUsers as any)({ filter: { id: { _eq: a[0].user_id } }, limit: 1, fields: ["email"] }))) as any[];
    if (u[0]?.email) return u[0].email;
  }
  return a[0].contacts_json?.email ?? null;
}

const di = directus;
const ADMIN_ROLES = ["editor", "admin", "Administrator"];



export async function adminRoutes(app: FastifyInstance) {
  app.post("/auth/admin-login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    // Email в нижний регистр (как register/forgot/login): findUserWithRole ищет _eq,
    // иначе «Office@Mail.ru» → user не найден → ложное 403 для валидного офиса.
    const email = parsed.email.toLowerCase().trim();
    const { password } = parsed;
    if (loginLocked(email) || ipLoginLocked(req.ip)) {
      audit("admin.login.locked", { actor: `email:${email}`, req });
      return reply.code(429).send({ error: "Слишком много неудачных попыток – попробуйте позже" });
    }
    if (!(await directusCredsValid(email, password))) {
      registerLoginFail(email);
      registerIpFail(req.ip);
      audit("admin.login.fail", { actor: `email:${email}`, req });
      return reply.code(401).send({ error: "Неверная почта или пароль" });
    }
    const user = await findUserWithRole(email);
    if (!user || !ADMIN_ROLES.includes(user.role)) return reply.code(403).send({ error: "Нет прав администратора" });
    registerLoginSuccess(email);
    registerIpSuccess(req.ip);
    audit("admin.login.ok", { actor: `admin:${user.id}`, req });
    return { token: signAdmin(user.id, user.role), role: user.role };
  });

  // Выход из панели: гасим конкретную сессию по jti. Без этого админ-токен жил
  // до истечения 12 ч, и «выход» был чисто клиентским – токен оставался годным.
  app.post("/auth/admin-logout", async (req, reply) => {
    const ctx = resolveAdmin(req);
    if (!ctx) return reply.code(401).send({ error: "Требуется вход администратора" });
    if (ctx.jti) revokeAdmin(ctx.jti);
    audit("admin.logout", { actor: `admin:${ctx.userId}`, req });
    return { ok: true };
  });

  /**
   * Подписки на подкасты: кто подписан, до какой даты, кто скоро истекает.
   * Отдельная ручка, а не фильтр по выпускникам: офису нужен срез именно по
   * подпискам, с сортировкой по дате окончания и статистикой прослушиваний.
   */
  app.get("/admin/podcast-subs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const now = new Date().toISOString();
    const soon = new Date(Date.now() + 30 * 86400000).toISOString();

    const subs = (await di.request((readItems as any)("alumni", {
      filter: { podcast_sub_until: { _nnull: true } },
      sort: ["podcast_sub_until"], limit: -1,
      fields: ["id", "fio", "cohort", "podcast_sub_until", "podcast_reminder_sent", "contacts_json"],
    }))) as any[];

    const active = subs.filter((a) => a.podcast_sub_until > now);
    const items = active.map((a) => ({
      id: a.id, fio: a.fio, cohort: a.cohort,
      until: a.podcast_sub_until,
      days_left: Math.ceil((new Date(a.podcast_sub_until).getTime() - Date.now()) / 86400000),
      reminded: !!a.podcast_reminder_sent,
      email: a.contacts_json?.email ?? null,
    }));

    // Прослушивания: сводка по выпускам. Пишет их сервер при выдаче аудио,
    // поэтому цифры отражают реальные обращения, а не клики по странице.
    const plays = (await di.request((readItems as any)("podcast_plays", {
      limit: -1, fields: ["podcast_id", "alumni_id", "created_at"],
    }))) as any[];
    const podcasts = (await di.request((readItems as any)("podcasts", {
      limit: -1, sort: ["sort"], fields: ["id", "title", "is_free"],
    }))) as any[];

    const monthAgo = Date.now() - 30 * 86400000;
    const byPodcast = podcasts.map((p) => {
      const mine = plays.filter((x) => x.podcast_id === p.id);
      return {
        id: p.id, title: p.title, is_free: !!p.is_free,
        plays: mine.length,
        listeners: new Set(mine.map((x) => x.alumni_id ?? "гость")).size,
        plays_30d: mine.filter((x) => new Date(x.created_at).getTime() >= monthAgo).length,
      };
    }).sort((a, b) => b.plays - a.plays);

    return {
      active: items.length,
      expiring_30d: active.filter((a) => a.podcast_sub_until <= soon).length,
      expired: subs.length - active.length,
      items,
      plays_total: plays.length,
      by_podcast: byPodcast,
    };
  });

  // Обзор: вся статистика сайта одним запросом.
  app.get("/admin/overview", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    // Агрегатные count/sum (Directus считает в БД) вместо полного скана 10 таблиц –
    // под масштаб не тащим тысячи строк в API ради .length.
    const now = new Date().toISOString();
    const [
      orders_count, new_orders, orders_paid,
      alumni_count, alumni_verified, pending_verifications, points_total, podcast_subscribers,
      programs_total, programs_nonactual, products_count, news_count,
      friendships, friend_requests, podcasts_count, push_subs_count,
    ] = await Promise.all([
      count("orders"),
      count("orders", { status: { _eq: "new" } }),
      count("orders", { payment_status: { _eq: "succeeded" } }),
      count("alumni"),
      count("alumni", { verification_status: { _eq: "verified" } }),
      count("alumni", { verification_status: { _eq: "pending" } }),
      sum("alumni", "points_cached"),
      count("alumni", { podcast_sub_until: { _gte: now } }),
      count("programs", { status: { _eq: "published" } }),
      count("programs", { status: { _eq: "published" }, enrollment: { _eq: "nonactual" } }),
      count("products", { status: { _eq: "published" } }),
      count("news", { status: { _eq: "published" } }),
      count("alumni_friends", { status: { _eq: "accepted" } }),
      count("alumni_friends", { status: { _eq: "pending" } }),
      count("podcasts", { status: { _eq: "published" } }),
      count("push_subs"),
    ]);
    // «Актуальный набор» = опубликованные минус nonactual (null-enrollment – актуальные,
    // как на сайте: enrollment !== "nonactual").
    const programs_actual = programs_total - programs_nonactual;
    // Ближайшее событие – маленькая выборка (1 строка) + count его RSVP.
    const evRows = (await di.request((readItems as any)("events", {
      filter: { status: { _eq: "published" }, starts_at: { _gte: now } }, sort: ["starts_at"], limit: 1, fields: ["id", "title", "starts_at"],
    }))) as any[];
    const ne = evRows[0] ?? null;
    return {
      new_orders, orders_count, orders_paid,
      pending_verifications, alumni_count, alumni_verified, points_total,
      programs_actual, programs_total, products_count, news_count,
      friendships, friend_requests, podcasts_count, podcast_subscribers, push_subs_count,
      next_event: ne ? { id: ne.id, title: ne.title, starts_at: ne.starts_at, rsvps: await count("event_rsvps", { event_id: { _eq: ne.id } }) } : null,
    };
  });

  // Ручная пуш-рассылка всем подписанным устройствам (анонсы офиса).
  app.post("/admin/push/broadcast", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    // Рассылка уходит на все устройства сразу и не отзывается – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return;
    const b = z.object({
      title: z.string().min(3).max(80),
      body: z.string().min(3).max(200),
      url: z.string().max(200).regex(/^\/[a-z0-9\-\/]*$/i, "Относительный путь, например /events").default("/"),
    }).parse(req.body);
    const subs = (await di.request((readItems as any)("push_subs", { fields: ["id"], limit: -1 }))) as any[];
    pushToAll({ title: b.title, body: b.body, url: b.url });
    audit("push.broadcast", { actor: `admin:${ctx.userId}`, detail: { title: b.title, subs: subs.length }, req });
    return { ok: true, subscribers: subs.length };
  });

  // Заявки: страница + total. Раньше отдавались только последние 100 без
  // пагинации – сто первая заявка исчезала из панели навсегда.
  app.get("/admin/orders", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const qp = z.object({
      q: z.string().max(100).optional(),
      status: z.enum(["new", "in_progress", "confirmed", "done", "canceled"]).optional(),
      payment: z.enum(["succeeded", "pending", "canceled", "none"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    const and: unknown[] = [];
    if (qp.status) and.push({ status: { _eq: qp.status } });
    if (qp.payment) and.push(qp.payment === "none" ? { payment_status: { _null: true } } : { payment_status: { _eq: qp.payment } });
    const q = (qp.q ?? "").trim();
    if (q) and.push({ _or: [{ number: { _icontains: q } }, { contact_fio: { _icontains: q } }, { contact_email: { _icontains: q } }, { contact_phone: { _icontains: q } }] });
    const filter = and.length ? { _and: and } : undefined;
    const [items, total] = await Promise.all([
      di.request((readItems as any)("orders", {
        ...(filter ? { filter } : {}),
        sort: ["-created_at"], limit: qp.limit, offset: (qp.page - 1) * qp.limit,
        fields: ["id", "number", "type", "contact_fio", "contact_phone", "contact_email", "fulfillment", "status", "payment_status", "subtotal", "total_estimate", "created_at", "items_json", "address", "comment"],
      })),
      count("orders", filter),
    ]);
    return { items, total, page: qp.page, limit: qp.limit };
  });

  app.patch("/admin/orders/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status } = z.object({ status: z.enum(["new", "in_progress", "confirmed", "done", "canceled"]) }).parse(req.body);
    const changed = await changeOrderStatus(id, status);
    if (!changed) return { ok: true, status };
    audit("order.status", { actor: `admin:${ctx.userId}`, subject: `order:${id}`, detail: { status }, req });
    // Уведомления клиенту (письмо + пуш) – один запрос заказа на оба.
    const verb = ORDER_STATUS_VERB_RU[status] ?? status;
    void (async () => {
      const rows = (await di.request(readItems("orders", { filter: { id: { _eq: id } }, limit: 1, fields: ["number", "contact_email", "contact_fio", "alumni_id"] }))) as any[];
      const o = rows[0];
      if (!o) return;
      if (o.contact_email && o.contact_email !== "-") {
        await sendEmail(o.contact_email, `Заявка ${o.number}: ${verb}`,
          `Здравствуйте, ${o.contact_fio}!\n\nСтатус вашей заявки ${o.number} изменился: ${verb}.\nДетали – в личном кабинете клуба.\n\n– Клуб выпускников факультета права Вышки`);
      }
      if (o.alumni_id) pushToAlumni(o.alumni_id, { title: "Статус заявки", body: `Заявка ${o.number} ${verb}`, url: "/lk" });
    })().catch((e) => req.log.error({ err: e }, "order status notify failed"));
    return { ok: true, status };
  });

  app.get("/admin/members", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const qp = z.object({
      q: z.string().max(100).optional(),
      status: z.enum(["pending", "verified", "rejected"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    const q = (qp.q ?? "").trim();
    const and: unknown[] = [];
    if (qp.status) and.push({ verification_status: { _eq: qp.status } });
    if (q) and.push({ _or: [{ fio: { _icontains: q } }, { cohort: { _icontains: q } }, { edu_program: { _icontains: q } }] });
    const filter = and.length ? { _and: and } : undefined;
    const listOpts = filter ? { filter } : {};

    // Страница + total (агрегат count, не скан). Дубли и друзья считаем только по
    // показанным участникам – без полного скана alumni на каждый заход (масштаб).
    const pageRows = (await di.request((readItems as any)("alumni", {
      ...listOpts, sort: ["-points_cached", "id"], limit: qp.limit, offset: (qp.page - 1) * qp.limit,
      fields: ["id", "user_id", "fio", "cohort", "status", "verification_status", "points_cached", "level_cached", "personal_discount", "podcast_sub_until", "edu_level", "edu_program", "interests_json", "contacts_json", "joined_at"],
    }))) as any[];
    const pageIds = pageRows.map((m) => m.id);
    const pageFios = [...new Set(pageRows.map((m) => m.fio).filter(Boolean))];

    const [total, links, dupGroups] = await Promise.all([
      count("alumni", filter),
      pageIds.length
        ? di.request((readItems as any)("alumni_friends", {
            filter: { _and: [{ status: { _eq: "accepted" } }, { _or: [{ alumni_id: { _in: pageIds } }, { friend_id: { _in: pageIds } }] }] },
            limit: -1, fields: ["alumni_id", "friend_id"],
          }))
        : Promise.resolve([]),
      // Возможные дубли: одинаковые ФИО+выпуск среди показанных, обезличенных исключаем.
      pageFios.length
        ? groupCount("alumni", ["fio", "cohort"], { _and: [{ fio: { _in: pageFios } }, { status: { _neq: "alumni_left" } }] })
        : Promise.resolve([]),
    ]) as [number, any[], Array<Record<string, unknown> & { count: number }>];

    const friendsOf = new Map<string, number>();
    for (const l of links) {
      friendsOf.set(l.alumni_id, (friendsOf.get(l.alumni_id) ?? 0) + 1);
      friendsOf.set(l.friend_id, (friendsOf.get(l.friend_id) ?? 0) + 1);
    }
    const dupKey = (fio: string | null, cohort: string | null) => `${(fio ?? "").trim().toLowerCase()}|${cohort ?? ""}`;
    const dupCount = new Map<string, number>();
    for (const g of dupGroups) { const k = dupKey(g.fio as string, g.cohort as string); dupCount.set(k, (dupCount.get(k) ?? 0) + g.count); }

    const userIds = pageRows.map((m) => m.user_id).filter(Boolean);
    const emails = new Map<string, string>();
    if (userIds.length) {
      const users = (await di.request((readUsers as any)({ filter: { id: { _in: userIds } }, limit: -1, fields: ["id", "email"] }))) as any[];
      for (const u of users) emails.set(u.id, u.email);
    }
    return {
      items: pageRows.map((m) => ({
        ...m,
        email: (m.user_id && emails.get(m.user_id)) || m.contacts_json?.email || null,
        friends_count: friendsOf.get(m.id) ?? 0,
        podcast_active: subActive(m.podcast_sub_until),
        duplicate: (dupCount.get(dupKey(m.fio, m.cohort)) ?? 0) > 1,
      })),
      total,
      page: qp.page,
      page_size: qp.limit,
    };
  });

  // Продление подписки на подкасты решением офиса (например, оплата по счёту).
  app.post("/admin/members/:id/podcast-sub", async (req, reply) => {
    // Выдача платной подписки – операция с деньгами, только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const until = await extendPodcastSub(id, 12);
    audit("podcast.sub.grant", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, detail: { until }, req });
    return { ok: true, until };
  });

  app.patch("/admin/members/:id", async (req, reply) => {
    // Верификация и персональная скидка – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      verification_status: z.enum(["pending", "verified", "rejected"]).optional(),
      personal_discount: z.number().int().min(0).max(10).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.verification_status === "verified") patch.verified_at = new Date().toISOString();
    await di.request((updateItem as any)("alumni", id, patch));
    audit("member.patch", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, detail: body, req });
    // Письмо о решении по верификации (fire-and-forget).
    if (body.verification_status === "verified" || body.verification_status === "rejected") {
      void (async () => {
        const email = await alumniEmail(id);
        if (!email) return;
        if (body.verification_status === "verified") {
          await sendEmail(email, "Кабинет выпускника активирован 🎓",
            "Поздравляем! Учебный офис подтвердил ваш выпуск – личный кабинет клуба активирован.\n\nВас ждут: скидка выпускника на программы ДПО, сообщество однокурсников, подкасты и мерч.\nВойти: " + env.PUBLIC_URL + "/lk\n\n– Клуб выпускников факультета права Вышки");
        } else {
          await sendEmail(email, "По вашей заявке на вступление",
            "К сожалению, учебный офис не смог подтвердить данные вашей заявки. Если считаете это ошибкой – ответьте на письмо или свяжитесь с офисом.\n\n– Клуб выпускников факультета права Вышки");
        }
      })().catch((e) => req.log.error({ err: e }, "verification email failed"));
    }

    // Рефералка: при верификации приглашённого – +80 баллов рефереру (идемпотентно).
    if (body.verification_status === "verified") {
      const rows = (await di.request(readItems("alumni", { filter: { id: { _eq: id } }, limit: 1, fields: ["referred_by"] }))) as any[];
      const referrer = rows[0]?.referred_by;
      if (referrer) {
        await addPoints(referrer, { reason: "referral", ref: id, comment: "Приглашённый выпускник верифицирован", idempotencyKey: `referral-${id}` });
      }
    }
    return { ok: true };
  });

  // ── Управление каталогом (программы ДПО и мерч) ──────────────────
  // Офис добавляет/правит/снимает с витрины/удаляет позиции без Directus Studio.

  const slugify = slugifyRu;

  // Синхронизация каталога ДПО с hse.ru по запросу офиса (та же логика, что ночной cron).
  app.post("/admin/dpo-sync", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    try {
      const r = await syncDpoCatalog();
      audit("catalog.dpo_sync", { actor: `admin:${ctx.userId}`, detail: { ...r }, req });
      return { ok: true, ...r };
    } catch (e) {
      req.log.error({ err: e }, "manual dpo sync failed");
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  const programBody = z.object({
    title: z.string().min(3),
    direction: z.string().min(2),
    format: z.enum(["online", "offline", "blended"]),
    duration: z.string().min(1),
    price: z.number().int().min(0), // копейки
    description: z.string().nullish(),
    start: z.string().nullish(), // человекочитаемая дата старта
    document: z.string().nullish(),
    status: z.enum(["draft", "published", "archived"]).default("published"),
  });

  app.get("/admin/programs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("programs", {
      sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "direction", "format", "duration", "price", "status", "enrollment", "source_url", "dates", "document", "description"],
    }));
  });

  app.post("/admin/programs", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = programBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("programs", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const row = {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, direction: b.direction, format: b.format, duration: b.duration, price: b.price,
      description: b.description ?? null, document: b.document ?? null,
      dates: b.start ? { start: b.start } : null, status: b.status,
    };
    const created = (await di.request((createItem as any)("programs", row))) as any;
    audit("program.create", { actor: `admin:${ctx.userId}`, subject: `program:${created.id}`, detail: { title: b.title, price: b.price, status: b.status }, req });
    return { ok: true, id: created.id, slug: row.slug };
  });

  app.patch("/admin/programs/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = programBody.partial().parse(req.body);
    const patch: Record<string, unknown> = { ...b };
    delete patch.start;
    if (b.start !== undefined) patch.dates = b.start ? { start: b.start } : null;
    await di.request((updateItem as any)("programs", id, patch));
    // Цена – деньги: правка фиксируется в журнале с прежним и новым значением.
    audit("program.patch", { actor: `admin:${ctx.userId}`, subject: `program:${id}`, detail: b, req });
    return { ok: true };
  });

  app.delete("/admin/programs/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("programs", id)); // заявки хранят снимок позиции – не рвутся
    audit("program.delete", { actor: `admin:${ctx.userId}`, subject: `program:${id}`, req });
    return { ok: true };
  });

  const productBody = z.object({
    title: z.string().min(3),
    category: z.string().min(2),
    price: z.number().int().min(0), // копейки
    stock: z.number().int().min(0).default(0),
    description: z.string().nullish(),
    variants_json: z.array(z.object({ sku: z.string().min(1), size: z.string().optional(), color: z.string().optional(), stock: z.number().int().min(0) })).nullish(),
    images: z.array(z.string()).nullish(), // пути/URL фото
    status: z.enum(["draft", "published", "archived"]).default("published"),
  });

  app.get("/admin/products", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("products", {
      sort: ["title"], limit: -1,
      fields: ["id", "slug", "title", "category", "price", "stock", "status", "variants_json", "description"],
    }));
  });

  app.post("/admin/products", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = productBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("products", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const row = {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, category: b.category, price: b.price, stock: b.stock,
      description: b.description ?? null, variants_json: b.variants_json ?? null, status: b.status,
    };
    const created = (await di.request((createItem as any)("products", row))) as any;
    audit("product.create", { actor: `admin:${ctx.userId}`, subject: `product:${created.id}`, detail: { title: b.title, price: b.price, stock: b.stock, status: b.status }, req });
    return { ok: true, id: created.id, slug: row.slug };
  });

  app.patch("/admin/products/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = productBody.partial().parse(req.body);
    await di.request((updateItem as any)("products", id, b));
    audit("product.patch", { actor: `admin:${ctx.userId}`, subject: `product:${id}`, detail: b, req });
    return { ok: true };
  });

  app.delete("/admin/products/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("products", id));
    audit("product.delete", { actor: `admin:${ctx.userId}`, subject: `product:${id}`, req });
    return { ok: true };
  });

  // ── Журнал безопасности: чтение аудит-лога ───────────────────────
  app.get("/admin/audit", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(300) }).parse(req.query);
    return di.request((readItems as any)("audit_log", {
      sort: ["-created_at"], limit,
      fields: ["id", "event", "actor", "subject", "detail", "ip", "created_at"],
    }));
  });

  // ── Выгрузка заявок в CSV (Excel-совместимо: BOM + точка с запятой) ──
  app.get("/admin/orders/export.csv", async (req, reply) => {
    // Выгрузка содержит ПДн всех заявителей – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return;
    const orders = (await di.request((readItems as any)("orders", {
      sort: ["-created_at"], limit: -1,
      fields: ["number", "created_at", "type", "contact_fio", "contact_phone", "contact_email", "fulfillment", "address", "items_json", "subtotal", "member_discount", "total_estimate", "status", "payment_status", "comment"],
    }))) as any[];

    // Защита от CSV-инъекции: ячейку, начинающуюся с = + - @ (или таб/CR),
    // Excel/Sheets выполняют как формулу. Данные заявок вводит любой гость,
    // поэтому такие значения обезвреживаем ведущим апострофом.
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rub2 = (kop: number) => (kop / 100).toFixed(2).replace(".", ","); // Excel-число в ru-локали
    const TYPE_RU: Record<string, string> = { dpo: "ДПО", merch: "Мерч", mixed: "Смешанная", podcast: "Подписка на подкасты" };

    const header = ["Номер", "Дата", "Тип", "Клиент", "Телефон", "Email", "Получение", "Адрес", "Состав", "Сумма, ₽", "Скидка, %", "Итого, ₽", "Статус", "Оплата", "Комментарий"];
    const lines = orders.map((o) => [
      esc(o.number),
      esc(o.created_at ? new Date(o.created_at).toLocaleString("ru-RU") : ""),
      esc(TYPE_RU[o.type] ?? o.type),
      esc(o.contact_fio), esc(o.contact_phone), esc(o.contact_email),
      esc(o.fulfillment === "delivery" ? "Доставка" : "Самовывоз"), esc(o.address),
      esc((o.items_json ?? []).map((i: any) => `${i.title}${i.variant_sku ? ` (${i.variant_sku})` : ""} ×${i.qty}`).join("; ")),
      esc(rub2(o.subtotal ?? 0)), esc(o.member_discount ?? 0), esc(rub2(o.total_estimate ?? 0)),
      esc(ORDER_STATUS_RU[o.status] ?? o.status),
      esc(o.payment_status === "succeeded" ? "Оплачено" : o.payment_status === "canceled" ? "Отменена" : o.payment_status === "review" ? "ТРЕБУЕТ ПРОВЕРКИ: сумма не совпала" : ""),
      esc(o.comment),
    ].join(";"));

    audit("orders.export", { actor: `admin:${ctx.userId}`, detail: { count: orders.length }, req });
    const csv = "﻿" + [header.map(esc).join(";"), ...lines].join("\r\n"); // BOM – кириллица в Excel
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  });

  // ── Новости: пишутся и публикуются из админ-панели ──────────────
  const newsBody = z.object({
    title: z.string().min(3),
    excerpt: z.string().nullish(),
    body: z.string().nullish(),
    status: z.enum(["draft", "published"]).default("published"),
  });

  app.get("/admin/news", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("news", { sort: ["-published_at"], limit: -1, fields: ["id", "slug", "title", "excerpt", "body", "published_at", "status"] }));
  });

  app.post("/admin/news", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = newsBody.parse(req.body);
    const slug = slugify(b.title);
    const dup = (await di.request(readItems("news", { filter: { slug: { _eq: slug } }, limit: 1, fields: ["id"] }))) as any[];
    const created = (await di.request((createItem as any)("news", {
      slug: dup.length ? `${slug}-${Date.now() % 10000}` : slug,
      title: b.title, excerpt: b.excerpt ?? null, body: b.body ?? null,
      status: b.status, published_at: new Date().toISOString(),
    }))) as any;
    audit("news.create", { actor: `admin:${ctx.userId}`, subject: `news:${created.id}`, detail: { title: b.title, status: b.status }, req });
    return { ok: true, id: created.id };
  });

  app.patch("/admin/news/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = newsBody.partial().parse(req.body);
    await di.request((updateItem as any)("news", id, b));
    audit("news.patch", { actor: `admin:${ctx.userId}`, subject: `news:${id}`, detail: b, req });
    return { ok: true };
  });

  app.delete("/admin/news/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("news", id));
    audit("news.delete", { actor: `admin:${ctx.userId}`, subject: `news:${id}`, req });
    return { ok: true };
  });

  // ── «История» на главной ─────────────────────────────────────────
  const timelineBody = z.object({
    year: z.string().min(4).max(4),
    title: z.string().min(2),
    text: z.string().nullish(),
    metric: z.string().nullish(),
    sort: z.number().int().optional(),
    status: z.enum(["draft", "published"]).default("published"),
  });

  app.get("/admin/timeline", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("timeline_items", { sort: ["sort"], limit: -1, fields: ["id", "year", "title", "text", "metric", "sort", "status"] }));
  });

  app.post("/admin/timeline", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = timelineBody.parse(req.body);
    const all = (await di.request(readItems("timeline_items", { fields: ["sort"], limit: -1 }))) as any[];
    const created = (await di.request((createItem as any)("timeline_items", {
      ...b, text: b.text ?? null, metric: b.metric ?? null,
      sort: b.sort ?? Math.max(0, ...all.map((t) => t.sort || 0)) + 1,
    }))) as any;
    audit("timeline.create", { actor: `admin:${ctx.userId}`, subject: `timeline:${created.id}`, detail: { year: b.year, title: b.title }, req });
    return { ok: true, id: created.id };
  });

  app.patch("/admin/timeline/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = timelineBody.partial().parse(req.body);
    await di.request((updateItem as any)("timeline_items", id, b));
    audit("timeline.patch", { actor: `admin:${ctx.userId}`, subject: `timeline:${id}`, detail: b, req });
    return { ok: true };
  });

  app.delete("/admin/timeline/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("timeline_items", id));
    audit("timeline.delete", { actor: `admin:${ctx.userId}`, subject: `timeline:${id}`, req });
    return { ok: true };
  });

  // ── Подкасты ──────────────────────────────────────────────────────
  // Ссылки на медиа обязаны быть http(s): значение уходит в 302-редирект плеера
  // и в img-src страницы, произвольная строка там не нужна.
  const mediaUrl = z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Ссылка должна начинаться с http:// или https://");
  const podcastBody = z.object({
    title: z.string().min(3),
    description: z.string().nullish(),
    cover: mediaUrl.nullish().or(z.literal("").transform(() => null)),
    audio_url: mediaUrl.nullish().or(z.literal("").transform(() => null)),
    duration: z.string().nullish(),
    is_free: z.boolean().optional(), // пробный выпуск (без подписки)
    sort: z.number().int().optional(),
    status: z.enum(["draft", "published"]).default("published"),
  });

  app.get("/admin/podcasts", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("podcasts", { sort: ["sort"], limit: -1, fields: ["id", "title", "description", "cover", "audio_url", "duration", "is_free", "sort", "status"] }));
  });

  app.post("/admin/podcasts", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = podcastBody.parse(req.body);
    const all = (await di.request(readItems("podcasts", { fields: ["sort"], limit: -1 }))) as any[];
    const created = (await di.request((createItem as any)("podcasts", {
      ...b, description: b.description ?? null, cover: b.cover ?? null,
      audio_url: b.audio_url ?? null, duration: b.duration ?? null,
      sort: b.sort ?? Math.max(0, ...all.map((p) => p.sort || 0)) + 1,
    }))) as any;
    if (b.status === "published") pushToAll({ title: "Новый подкаст 🎧", body: b.title, url: "/podcasts" });
    audit("podcast.create", { actor: `admin:${ctx.userId}`, subject: `podcast:${created.id}`, detail: { title: b.title, is_free: b.is_free ?? false, status: b.status }, req });
    return { ok: true, id: created.id };
  });

  app.patch("/admin/podcasts/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = podcastBody.partial().parse(req.body);
    await di.request((updateItem as any)("podcasts", id, b));
    // is_free снимает пейволл – правку обязательно видно в журнале.
    audit("podcast.patch", { actor: `admin:${ctx.userId}`, subject: `podcast:${id}`, detail: b, req });
    return { ok: true };
  });

  app.delete("/admin/podcasts/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("podcasts", id));
    audit("podcast.delete", { actor: `admin:${ctx.userId}`, subject: `podcast:${id}`, req });
    return { ok: true };
  });

  // ── Наполнение страниц: hero и CTA главной (M2A-блоки) ──────────
  const pageBlocks = async (slug: string) => {
    const rows = (await di.request((readItems as any)("pages", {
      filter: { slug: { _eq: slug } }, limit: 1,
      fields: ["id", "slug", "title", "blocks.collection", "blocks.item:block_hero.*", "blocks.item:block_cta.*"],
    }))) as any[];
    return rows[0] ?? null;
  };

  app.get("/admin/pages/:slug", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const page = await pageBlocks(slug);
    if (!page) return reply.code(404).send({ error: "Страница не найдена" });
    const blocks: Record<string, unknown> = {};
    for (const b of page.blocks ?? []) {
      if (b?.collection && b?.item) blocks[String(b.collection).replace("block_", "")] = b.item;
    }
    return { slug: page.slug, title: page.title, blocks };
  });

  const heroBody = z.object({
    badge: z.string().optional(), title_pre: z.string().optional(), title_accent: z.string().optional(),
    subtitle: z.string().optional(), cta_primary: z.string().optional(), cta_secondary: z.string().optional(),
    history_eyebrow: z.string().max(80).optional(), history_title: z.string().max(200).optional(), history_hint: z.string().max(200).optional(),
    marquee: z.array(z.string().max(60)).max(20).optional(),
  });
  const ctaBody = z.object({ title: z.string().optional(), text: z.string().optional(), button: z.string().optional() });

  app.patch("/admin/pages/:slug", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const body = z.object({ hero: heroBody.optional(), cta: ctaBody.optional() }).parse(req.body);
    const page = await pageBlocks(slug);
    if (!page) return reply.code(404).send({ error: "Страница не найдена" });
    for (const b of page.blocks ?? []) {
      if (body.hero && b?.collection === "block_hero" && b.item?.id) {
        await di.request((updateItem as any)("block_hero", b.item.id, body.hero));
      }
      if (body.cta && b?.collection === "block_cta" && b.item?.id) {
        await di.request((updateItem as any)("block_cta", b.item.id, body.cta));
      }
    }
    audit("page.patch", { actor: `admin:${ctx.userId}`, subject: `page:${slug}`, detail: { hero: !!body.hero, cta: !!body.cta }, req });
    return { ok: true };
  });

  // Ручное начисление баллов офисом.
  app.post("/admin/members/:id/points", async (req, reply) => {
    // Баллы конвертируются в скидку – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      reason: z.enum(["program", "event", "referral", "mentorship", "manual"]).default("manual"),
      delta: z.number().int().min(-2000).max(2000), // разумный предел ручной корректировки
      comment: z.string().optional(),
    }).parse(req.body);
    const res = await addPoints(id, { reason: body.reason, delta: body.delta, comment: body.comment ?? "Ручное начисление офисом" });
    // Баллы → уровень → скидка: ручная корректировка обязана оставлять след.
    audit("member.points", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, detail: { delta: body.delta, reason: body.reason, comment: body.comment ?? null }, req });
    return { ok: true, ...res };
  });

  // 152-ФЗ: офис исполняет запрос на удаление/стирание ПДн участника (без разработчика).
  // Обезличивает профиль и заявки, удаляет аккаунт входа. Необратимо.
  app.post("/admin/members/:id/anonymize", async (req, reply) => {
    // Необратимое стирание ПДн – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const ok = await anonymizeAlumni(id);
    if (!ok) return reply.code(404).send({ error: "Участник не найден" });
    audit("admin.member.anonymize", { actor: `admin:${ctx.userId}`, subject: `alumni:${id}`, req });
    return { ok: true };
  });
}
