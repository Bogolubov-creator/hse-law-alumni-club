import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Гейт релиза: assertProdConfig(). Это последний рубеж между «забыли переменную»
 * и боевым стендом с открытой дырой, поэтому проверяется каждая ветка отдельно.
 *
 * env читается один раз при импорте модуля, поэтому на каждый набор переменных
 * модуль импортируется заново (vi.resetModules).
 */

const SAFE = {
  APP_ENV: "production",
  DIRECTUS_URL: "https://directus.club.example",
  DIRECTUS_SERVICE_TOKEN: "8f2c1a9d7e5b3c04f6a8d2e1b9c7a5f3",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef01234567",
  ADMIN_AUTH_SECRET: "fedcba9876543210fedcba9876543210fedcba98",
  PUBLIC_URL: "https://club.example.ru",
  SMTP_HOST: "smtp.example.ru",
  SMTP_FROM: "club@example.ru",
  SEED_DEMO: "false",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_WEBHOOK_SECRET: "",
  TELEGRAM_POLLING: "",
};

async function errorsFor(overrides: Record<string, string>): Promise<string[]> {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...SAFE, ...overrides })) vi.stubEnv(k, v);
  const { assertProdConfig } = await import("./env.js");
  return assertProdConfig();
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("assertProdConfig – корректная прод-конфигурация", () => {
  it("полный набор переменных проходит без замечаний", async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it("вне production не проверяется ничего (локальный стенд на том же образе)", async () => {
    const errs = await errorsFor({ APP_ENV: "development", SMTP_HOST: "", SEED_DEMO: "true", PUBLIC_URL: "http://localhost" });
    expect(errs).toEqual([]);
  });
});

describe("assertProdConfig – каждая небезопасная настройка ловится", () => {
  it("плейсхолдер в AUTH_SECRET", async () => {
    const errs = await errorsFor({ AUTH_SECRET: "replace_with_auth_secret_placeholder" });
    expect(errs.some((e) => /AUTH_SECRET/.test(e))).toBe(true);
  });

  it("плейсхолдер в сервисном токене Directus", async () => {
    const errs = await errorsFor({ DIRECTUS_SERVICE_TOKEN: "replace_with_service_token" });
    expect(errs.some((e) => /DIRECTUS_SERVICE_TOKEN/.test(e))).toBe(true);
  });

  it("пустой ADMIN_AUTH_SECRET – админ-сессии подписывались бы общим ключом", async () => {
    const errs = await errorsFor({ ADMIN_AUTH_SECRET: "" });
    expect(errs.some((e) => /ADMIN_AUTH_SECRET/.test(e))).toBe(true);
  });

  it("PUBLIC_URL без https – оплата, sitemap и canonical уехали бы по http", async () => {
    const errs = await errorsFor({ PUBLIC_URL: "http://club.example.ru" });
    expect(errs.some((e) => /PUBLIC_URL/.test(e))).toBe(true);
  });

  it("бот на webhook без секрета – принимались бы поддельные апдейты", async () => {
    const errs = await errorsFor({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "", TELEGRAM_POLLING: "" });
    expect(errs.some((e) => /TELEGRAM_WEBHOOK_SECRET/.test(e))).toBe(true);
  });

  it("бот на long-polling секрета webhook не требует", async () => {
    const errs = await errorsFor({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "", TELEGRAM_POLLING: "true" });
    expect(errs.some((e) => /TELEGRAM_WEBHOOK_SECRET/.test(e))).toBe(false);
  });

  it("пустой SMTP_HOST – молча ломались бы сброс пароля и подтверждение адреса", async () => {
    const errs = await errorsFor({ SMTP_HOST: "" });
    expect(errs.some((e) => /SMTP_HOST/.test(e))).toBe(true);
  });

  it("SMTP без отправителя", async () => {
    const errs = await errorsFor({ SMTP_FROM: "", SMTP_USER: "" });
    expect(errs.some((e) => /отправитель/i.test(e))).toBe(true);
  });

  it("SMTP_USER годится как отправитель вместо SMTP_FROM", async () => {
    const errs = await errorsFor({ SMTP_FROM: "", SMTP_USER: "club@example.ru" });
    expect(errs.some((e) => /отправитель/i.test(e))).toBe(false);
  });

  it("SEED_DEMO=true – демо-контент и тестовые аккаунты на боевом стенде", async () => {
    const errs = await errorsFor({ SEED_DEMO: "true" });
    expect(errs.some((e) => /SEED_DEMO/.test(e))).toBe(true);
  });

  it("SEED_DEMO=false проблемой не считается", async () => {
    const errs = await errorsFor({ SEED_DEMO: "false" });
    expect(errs.some((e) => /SEED_DEMO/.test(e))).toBe(false);
  });

  it("несколько проблем сразу перечисляются все, а не первая попавшаяся", async () => {
    const errs = await errorsFor({ ADMIN_AUTH_SECRET: "", SMTP_HOST: "", SEED_DEMO: "true", PUBLIC_URL: "http://x.ru" });
    expect(errs).toHaveLength(4);
  });
});
