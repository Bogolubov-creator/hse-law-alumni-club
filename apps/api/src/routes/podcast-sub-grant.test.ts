import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("../lib/checkout-store.js", async () => await import("../test/fake-checkout.js"));
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { adminRoutes } = await import("./admin.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

/**
 * Выдача подписки на подкасты офисом (POST /admin/members/:id/podcast-sub).
 *
 * Это операция с деньгами: подписка стоит 4 999 ₽ в год, и её выдача вручную –
 * то, чем офис закрывает оплату по счёту. Ручка не была покрыта тестами вообще,
 * хотя от неё зависит, откроются ли платные выпуски.
 */

const ADMIN_ID = "user-admin";
const EDITOR_ID = "user-editor";
const ALUMNI_ID = "alumni-1";

const adminSecret = () => env.ADMIN_AUTH_SECRET || env.AUTH_SECRET;
const tokenFor = (sub: string, role: string) =>
  jwt.sign({ sub, role, scope: "admin" }, adminSecret(), { expiresIn: "12h" });

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(adminRoutes);
  return app;
}

const grant = (app: FastifyInstance, token: string, id = ALUMNI_ID) =>
  app.inject({ method: "POST", url: `/admin/members/${id}/podcast-sub`, headers: { authorization: `Bearer ${token}` }, payload: {} });

/** Аудит пишется fire-and-forget, чтобы его сбой не ломал операцию: ждём микротаск. */
const settled = () => new Promise((r) => setTimeout(r, 0));

const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const monthsBetween = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86400000;

beforeEach(() => {
  resetDb({
    directus_users: [
      { id: ADMIN_ID, email: "chief@example.com", status: "active", role: { name: "admin" } },
      { id: EDITOR_ID, email: "office@example.com", status: "active", role: { name: "editor" } },
    ],
    alumni: [{
      id: ALUMNI_ID, user_id: "user-1", fio: "Иван Петров", verification_status: "verified",
      token_version: 0, points_cached: 0, personal_discount: 0,
      podcast_sub_until: null, podcast_reminder_sent: false,
    }],
    orders: [], levels: [], audit_log: [], points_ledger: [],
  });
});

describe("Выдача подписки офисом", () => {
  it("подписки не было – включается на год от сегодня", async () => {
    const app = await build();
    const r = await grant(app, tokenFor(ADMIN_ID, "admin"));

    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    const until = db.alumni![0]!.podcast_sub_until as string;
    expect(until).toBe(r.json().until);
    // Год – это 365 или 366 дней, поэтому проверяем окно, а не точную дату
    expect(monthsBetween(until)).toBeGreaterThan(364);
    expect(monthsBetween(until)).toBeLessThan(367);
  });

  /**
   * Главное в продлении: год прибавляется к остатку, а не затирает его.
   * Иначе оплативший заранее терял оплаченные месяцы.
   */
  it("подписка ещё активна – год прибавляется к остатку", async () => {
    const app = await build();
    db.alumni![0]!.podcast_sub_until = days(100);
    await grant(app, tokenFor(ADMIN_ID, "admin"));

    const left = monthsBetween(db.alumni![0]!.podcast_sub_until as string);
    expect(left).toBeGreaterThan(464); // 100 оставшихся + год
    expect(left).toBeLessThan(467);
  });

  it("подписка истекла – отсчёт от сегодня, а не от старой даты", async () => {
    const app = await build();
    db.alumni![0]!.podcast_sub_until = days(-200);
    await grant(app, tokenFor(ADMIN_ID, "admin"));

    const left = monthsBetween(db.alumni![0]!.podcast_sub_until as string);
    expect(left).toBeGreaterThan(364);
    expect(left).toBeLessThan(367);
  });

  /**
   * Без сброса флага выпускник получил бы предупреждение об окончании
   * один раз в жизни, а на следующий год – нет.
   */
  it("флаг «уже напомнили» сбрасывается при продлении", async () => {
    const app = await build();
    db.alumni![0]!.podcast_reminder_sent = true;
    await grant(app, tokenFor(ADMIN_ID, "admin"));

    expect(db.alumni![0]!.podcast_reminder_sent).toBe(false);
  });

  it("выдача попадает в журнал безопасности с указанием, кто и кому", async () => {
    const app = await build();
    await grant(app, tokenFor(ADMIN_ID, "admin"));
    await settled();

    const entry = db.audit_log!.find((e) => e.event === "podcast.sub.grant");
    expect(entry).toBeTruthy();
    expect(entry!.actor).toBe(`admin:${ADMIN_ID}`);
    expect(entry!.subject).toBe(`alumni:${ALUMNI_ID}`);
  });

  it("повторная выдача продлевает ещё на год, а не отказывает", async () => {
    const app = await build();
    await grant(app, tokenFor(ADMIN_ID, "admin"));
    const first = db.alumni![0]!.podcast_sub_until as string;
    await grant(app, tokenFor(ADMIN_ID, "admin"));
    const second = db.alumni![0]!.podcast_sub_until as string;
    await settled();

    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
    expect(db.audit_log!.filter((e) => e.event === "podcast.sub.grant")).toHaveLength(2);
  });
});

describe("Выдача подписки – кто имеет право", () => {
  it("без токена – 401, подписка не выдана", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: `/admin/members/${ALUMNI_ID}/podcast-sub`, payload: {} });

    expect(r.statusCode).toBe(401);
    expect(db.alumni![0]!.podcast_sub_until).toBeNull();
  });

  /**
   * Редактор ведёт контент сайта, но деньгами не распоряжается: подписка
   * стоит 4 999 ₽, и выдавать её может только администратор клуба.
   */
  it("редактору контента – 403, подписка не выдана", async () => {
    const app = await build();
    const r = await grant(app, tokenFor(EDITOR_ID, "editor"));

    expect(r.statusCode).toBe(403);
    expect(db.alumni![0]!.podcast_sub_until).toBeNull();
    await settled();
    expect(db.audit_log!.filter((e) => e.event === "podcast.sub.grant")).toHaveLength(0);
  });

  it("чужой подписью токен не подходит", async () => {
    const app = await build();
    const forged = jwt.sign({ sub: ADMIN_ID, role: "admin", scope: "admin" }, "не-тот-секрет", { expiresIn: "12h" });
    const r = await grant(app, forged);

    expect(r.statusCode).toBe(401);
    expect(db.alumni![0]!.podcast_sub_until).toBeNull();
  });
});
