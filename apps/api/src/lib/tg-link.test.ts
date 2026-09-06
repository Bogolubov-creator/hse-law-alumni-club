import { describe, it, expect, beforeAll } from "vitest";

// tg-link тянет env.ts (валидация process.env при импорте) – задаём минимум до импорта.
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

  describe("TTL 24 часа", () => {
    const NOW = Math.floor(Date.now() / 1000);

    it("код, выданный только что, валиден (roundtrip с явным временем)", () => {
      expect(verifyTgLinkCode(makeTgLinkCode(UUID, NOW), NOW)).toBe(UUID);
    });

    it("код на границе TTL ещё валиден, старше 24ч – нет", () => {
      expect(verifyTgLinkCode(makeTgLinkCode(UUID, NOW - 24 * 3600), NOW)).toBe(UUID);
      expect(verifyTgLinkCode(makeTgLinkCode(UUID, NOW - 24 * 3600 - 1), NOW)).toBeNull();
    });

    it("код «из будущего» дальше допуска сдвига часов (5 мин) отклоняется", () => {
      expect(verifyTgLinkCode(makeTgLinkCode(UUID, NOW + 6 * 60), NOW)).toBeNull();
      // а небольшой сдвиг часов вперёд – нормальная ситуация
      expect(verifyTgLinkCode(makeTgLinkCode(UUID, NOW + 4 * 60), NOW)).toBe(UUID);
    });

    it("подделка timestamp ломает подпись", () => {
      const code = makeTgLinkCode(UUID, NOW);
      // timestamp – символы 23–28 (после «l» и 22 символов uuid)
      const i = 25;
      const tampered = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
      expect(verifyTgLinkCode(tampered, NOW)).toBeNull();
    });
  });
});
