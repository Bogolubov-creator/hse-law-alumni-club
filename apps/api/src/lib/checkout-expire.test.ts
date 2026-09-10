import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("expireStaleReservations gates", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
    process.env.DIRECTUS_URL = process.env.DIRECTUS_URL || "http://127.0.0.1:8055";
    process.env.DIRECTUS_SERVICE_TOKEN = process.env.DIRECTUS_SERVICE_TOKEN || "x".repeat(40);
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "y".repeat(40);
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("RESERVE_TTL_HOURS=0 – выключено", async () => {
    process.env.CHECKOUT_DATABASE_URL = "postgres://local/alumni_staged";
    process.env.RESERVE_TTL_HOURS = "0";
    const { expireStaleReservations } = await import("./checkout-store.js");
    await expect(expireStaleReservations()).resolves.toBe(0);
  });

  it("без CHECKOUT_DATABASE_URL – 0", async () => {
    process.env.CHECKOUT_DATABASE_URL = "";
    process.env.RESERVE_TTL_HOURS = "72";
    const { expireStaleReservations } = await import("./checkout-store.js");
    await expect(expireStaleReservations()).resolves.toBe(0);
  });
});
