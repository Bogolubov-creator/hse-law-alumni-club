import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("notify mail outbox", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
    process.env.DIRECTUS_URL = process.env.DIRECTUS_URL || "http://127.0.0.1:8055";
    process.env.DIRECTUS_SERVICE_TOKEN = process.env.DIRECTUS_SERVICE_TOKEN || "x".repeat(40);
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "y".repeat(40);
    delete process.env.CHECKOUT_DATABASE_URL;
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.restoreAllMocks();
  });

  it("без SMTP enqueueMail помечает blocked и не падает", async () => {
    process.env.CHECKOUT_DATABASE_URL = "";
    const { enqueueMail, mailEnabled } = await import("./notify.js");
    expect(mailEnabled()).toBe(false);
    const r = await enqueueMail({ to: "office@example.com", subject: "t", body: "b" });
    expect(r.sent).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it("drainMailOutbox без CHECKOUT_DATABASE_URL – нули", async () => {
    process.env.CHECKOUT_DATABASE_URL = "";
    const { drainMailOutbox } = await import("./notify.js");
    await expect(drainMailOutbox()).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
  });
});
