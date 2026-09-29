import { it, expect, vi } from "vitest";
import Fastify from "fastify";
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/notify.js", () => ({ mailEnabled: () => true, sendEmail: mail.send, notifyOfficeText: vi.fn() }));
const { resetDb } = await import("../test/fake-directus.js");
const { authRoutes } = await import("./auth.js");
it.each([undefined, "/podcasts#podcast-subscription", "https://example.com", "//example.com"])("письмо восстановления: путь %s", async next => {
  resetDb({ directus_users: [{ id: "user-test", email: "graduate@example.com" }], alumni: [{ user_id: "user-test", token_version: 0 }] });
  mail.send.mockClear();
  const app = Fastify();
  await app.register(authRoutes);
  try {
    const response = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "graduate@example.com", ...(next ? { next } : {}) } });
    expect(response.statusCode).toBe(200);
    const body = mail.send.mock.calls[0]![2] as string;
    const link = new URL(body.split("\n").find(line => line.includes("/reset?token="))!);
    expect(link.searchParams.get("next")).toBe(next === "/podcasts#podcast-subscription" ? next : null);
    expect(link.searchParams.get("token")).toBeTruthy();
  } finally { await app.close(); }
});
