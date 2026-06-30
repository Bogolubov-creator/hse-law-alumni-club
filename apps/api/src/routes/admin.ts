import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { directusCredsValid, findUserWithRole, signAdmin, resolveAdmin } from "../lib/auth.js";
import { addPoints } from "../lib/engine.js";

const di = directus as any;
const ADMIN_ROLES = ["editor", "admin", "Administrator"];

function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const ctx = resolveAdmin(req);
  if (!ctx) { reply.code(401).send({ error: "Требуется вход администратора" }); return null; }
  return ctx;
}

export async function adminRoutes(app: FastifyInstance) {
  app.post("/auth/admin-login", async (req, reply) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    if (!(await directusCredsValid(email, password))) return reply.code(401).send({ error: "Неверная почта или пароль" });
    const user = await findUserWithRole(email);
    if (!user || !ADMIN_ROLES.includes(user.role)) return reply.code(403).send({ error: "Нет прав администратора" });
    return { token: signAdmin(user.id, user.role), role: user.role };
  });

  app.get("/admin/overview", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const orders = (await di.request((readItems as any)("orders", { fields: ["status"], limit: -1 }))) as any[];
    const alumni = (await di.request((readItems as any)("alumni", { fields: ["verification_status"], limit: -1 }))) as any[];
    return {
      new_orders: orders.filter((o) => o.status === "new").length,
      orders_count: orders.length,
      pending_verifications: alumni.filter((a) => a.verification_status === "pending").length,
      alumni_count: alumni.length,
    };
  });

  app.get("/admin/orders", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request((readItems as any)("orders", {
      sort: ["-created_at"], limit: 100,
      fields: ["id", "number", "type", "contact_fio", "contact_phone", "contact_email", "fulfillment", "status", "subtotal", "total_estimate", "created_at"],
    }));
  });

  app.patch("/admin/orders/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status } = z.object({ status: z.enum(["new", "in_progress", "confirmed", "done", "canceled"]) }).parse(req.body);
    await di.request((updateItem as any)("orders", id, { status }));
    return { ok: true, status };
  });

  app.get("/admin/members", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request((readItems as any)("alumni", {
      sort: ["-points_cached"], limit: 200,
      fields: ["id", "fio", "cohort", "status", "verification_status", "points_cached", "level_cached", "personal_discount"],
    }));
  });

  app.patch("/admin/members/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      verification_status: z.enum(["pending", "verified", "rejected"]).optional(),
      personal_discount: z.number().int().min(0).max(10).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.verification_status === "verified") patch.verified_at = new Date().toISOString();
    await di.request((updateItem as any)("alumni", id, patch));
    return { ok: true };
  });

  // Ручное начисление баллов офисом.
  app.post("/admin/members/:id/points", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      reason: z.enum(["program", "event", "referral", "mentorship", "manual"]).default("manual"),
      delta: z.number().int(),
      comment: z.string().optional(),
    }).parse(req.body);
    const res = await addPoints(id, { reason: body.reason, delta: body.delta, comment: body.comment ?? "Ручное начисление офисом" });
    return { ok: true, ...res };
  });
}
