import { changeOrderStatus } from "../lib/checkout-store.js";
import type { FastifyInstance } from "fastify";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { ORDER_STATUS_RU, ORDER_STATUS_VERB_RU } from "@club/shared";
import { requireAdmin, requireFullAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { sendEmail } from "../lib/notify.js";
import { pushToAlumni } from "../lib/push.js";
import { count } from "../lib/agg.js";
const di = directus;

export async function adminOrdersRoutes(app: FastifyInstance) {


  // Заявки: страница + total. Раньше отдавались только последние 100 без
  // пагинации – сто первая заявка исчезала из панели навсегда.
  app.get("/admin/orders", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const qp = z.object({
      q: z.string().max(100).optional(),
      status: z.enum(["new", "in_progress", "confirmed", "done", "canceled", "expired"]).optional(),
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
    const { status } = z.object({ status: z.enum(["new", "in_progress", "confirmed", "done", "canceled", "expired"]) }).parse(req.body);
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


  // ── Выгрузка заявок в CSV (Excel-совместимо: BOM + точка с запятой) ──
  app.get("/admin/orders/export.csv", async (req, reply) => {
    // Выгрузка содержит ПДн всех заявителей – только админ.
    const ctx = requireFullAdmin(req, reply);
    if (!ctx) return reply;
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
}
