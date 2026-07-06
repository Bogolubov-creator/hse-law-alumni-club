import { describe, it, expect, beforeAll } from "vitest";

// tg-link тянет env.ts (валидация process.env при импорте) — задаём минимум до импорта.
let makeTgLinkCode: (id: string) => string;
let verifyTgLinkCode: (code: string) => string | null;

beforeAll(async () => {
  process.env.DIRECTUS_URL ??= "http://directus.test";
  process.env.DIRECTUS_SERVICE_TOKEN ??= "test-token";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests-at-least-32-chars";
  ({ makeTgLinkCode, verifyTgLinkCode } = await import("./tg-link.js"));
});

const UUID = "3a7c9b12-4f0e-4d21-9c55-8ab301c2de44";

describe("tg-link", () => {
  it("roundtrip: verify(make(id)) возвращает id", () => {
    expect(verifyTgLinkCode(makeTgLinkCode(UUID))).toBe(UUID);
  });

  it("код укладывается в ограничения Telegram deep-link: ≤64 символов, только [A-Za-z0-9_-]", () => {
    const code = makeTgLinkCode(UUID);
    expect(code.length).toBeLessThanOrEqual(64);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("подделка подписи и мусор отклоняются", () => {
    const code = makeTgLinkCode(UUID);
    const tampered = code.slice(0, -1) + (code.endsWith("A") ? "B" : "A");
    expect(verifyTgLinkCode(tampered)).toBeNull();
    expect(verifyTgLinkCode("")).toBeNull();
    expect(verifyTgLinkCode("SERGEY2026")).toBeNull(); // реф-код не путается с привязкой
    expect(verifyTgLinkCode("l" + "x".repeat(38))).toBeNull();
  });

  it("коды разных выпускников различаются", () => {
    expect(makeTgLinkCode(UUID)).not.toBe(makeTgLinkCode("00000000-0000-4000-8000-000000000000"));
  });
});
