import { afterEach, beforeEach, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./checkout-store.js", () => ({ checkoutPool: () => ({ query }) }));
import { env } from "../env.js";
import { buildSystemHealth, DATABASE_READY_SQL } from "./system-health.js";
const original = { ...env };
beforeEach(() => {
  Object.assign(env, { CHECKOUT_DATABASE_URL: "postgres://private-test", TELEGRAM_BOT_TOKEN: "secret-test", SMTP_HOST: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" });
  query.mockResolvedValue({ rows: [{ value: 1 }] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 })));
});
afterEach(() => { Object.assign(env, original); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("проверяет CMS и БД, но не выдаёт токен Telegram за работающего бота", async () => {
  const result = await buildSystemHealth();
  expect(result.checks.find((c) => c.id === "cms")?.status).toBe("ok");
  expect(result.checks.find((c) => c.id === "database")?.status).toBe("ok");
  expect(result.checks.find((c) => c.id === "telegram")?.status).toBe("unknown");
  expect(result.status).toBe("partial");
  expect(JSON.stringify(result)).not.toContain("secret-test");
  expect(query).toHaveBeenCalledWith({ text: DATABASE_READY_SQL, query_timeout: 3000 });
});
it("показывает частичный отказ и скрывает внутренние причины ошибок", async () => {
  query.mockRejectedValue(new Error("postgres://secret-database"));
  const result = await buildSystemHealth();
  expect(result.status).toBe("degraded");
  expect(result.checks.find((c) => c.id === "cms")?.status).toBe("ok");
  expect(result.checks.find((c) => c.id === "database")?.status).toBe("error");
  expect(JSON.stringify(result)).not.toContain("secret-database");
});
it("не считает невалидный ответ CMS и ненастроенную БД здоровыми", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  env.CHECKOUT_DATABASE_URL = "";
  const result = await buildSystemHealth();
  expect(result.checks.find((c) => c.id === "cms")?.status).toBe("error");
  expect(result.checks.find((c) => c.id === "database")?.status).toBe("disabled");
  expect(query).not.toHaveBeenCalled();
});
