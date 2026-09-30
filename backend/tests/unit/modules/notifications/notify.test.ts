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
    vi.doUnmock("nodemailer");
    vi.doUnmock("../../../../src/db/checkout-store.js");
    vi.restoreAllMocks();
  });

  it("без SMTP enqueueMail помечает blocked и не падает", async () => {
    process.env.CHECKOUT_DATABASE_URL = "";
    const { enqueueMail, mailEnabled } = await import("../../../../src/modules/notifications/notify.js");
    expect(mailEnabled()).toBe(false);
    const r = await enqueueMail({ to: "office@example.com", subject: "t", body: "b" });
    expect(r.sent).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it("drainMailOutbox без CHECKOUT_DATABASE_URL – нули", async () => {
    process.env.CHECKOUT_DATABASE_URL = "";
    const { drainMailOutbox } = await import("../../../../src/modules/notifications/notify.js");
    await expect(drainMailOutbox()).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("уведомление о вступлении идёт на выбранную почту офиса", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "qa" });
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
    process.env.OFFICE_NOTIFY_CHANNEL = "email";
    process.env.OFFICE_EMAIL = "office@example.com";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "club@example.com";
    const { notifyOfficeText } = await import("../../../../src/modules/notifications/notify.js");

    await notifyOfficeText("Новая заявка на вступление");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "office@example.com", subject: "Событие клуба выпускников", text: "Новая заявка на вступление",
    }));
  });

  it("после успешной отправки и сбоя записи статуса не отправляет письмо второй раз", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "qa" });
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })
      .mockRejectedValueOnce(new Error("database unavailable"));
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
    vi.doMock("../../../../src/db/checkout-store.js", () => ({ checkoutPool: () => ({ query }) }));
    process.env.CHECKOUT_DATABASE_URL = "postgresql://club:test@localhost/club";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "club@example.com";
    const { enqueueMail, EMAIL_CONFIRMATION_KIND } = await import("../../../../src/modules/notifications/notify.js");

    const result = await enqueueMail({
      to: "pending@example.com", subject: "Подтверждение", body: "Ссылка", kind: EMAIL_CONFIRMATION_KIND,
    });
    expect(result).toEqual({ id: 42, sent: true, blocked: false });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
