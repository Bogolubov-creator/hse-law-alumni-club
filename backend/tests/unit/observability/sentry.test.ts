import { afterEach, beforeEach, expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({ options: vi.fn(), envelopes: [] as unknown[] }));
vi.mock("@sentry/node", async importOriginal => {
  const sdk = await importOriginal<typeof import("@sentry/node")>();
  return {
    ...sdk,
    init: (options: Parameters<typeof sdk.init>[0]) => {
      observed.options(options);
      return sdk.init({
        ...options,
        defaultIntegrations: false,
        // Исполняется настоящий SDK; transport сохраняет результат без внешнего запроса.
        transport: () => ({
          send: async envelope => { observed.envelopes.push(envelope); return { statusCode: 200 }; },
          flush: async () => true,
        }),
      });
    },
  };
});

const { env } = await import("../../../src/config/env.js");
const { initSentry, captureError } = await import("../../../src/observability/sentry.js");
const originalDsn = env.SENTRY_DSN;
beforeEach(() => { observed.options.mockClear(); observed.envelopes.length = 0; });
afterEach(async () => { env.SENTRY_DSN = originalDsn; await (await import("@sentry/node")).close(1000); });

it("без DSN мониторинг не инициализирует SDK", async () => {
  env.SENTRY_DSN = "";
  await initSentry();
  expect(observed.options).not.toHaveBeenCalled();
  expect(observed.envelopes).toEqual([]);
});

it("SDK 11 сохраняет ограничения сбора и маскирует ПДн до transport", async () => {
  env.SENTRY_DSN = "https://1234567890abcdef1234567890abcdef@sentry.example.test/1";
  await initSentry();
  expect(observed.options).toHaveBeenCalledOnce();
  expect(observed.options.mock.calls[0]![0].dataCollection).toMatchObject({
    userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
    databaseQueryData: false, queues: false,
    genAI: { inputs: false, outputs: false }, graphQL: { document: false, variables: false },
  });

  const sdk = await import("@sentry/node");
  sdk.withScope(scope => {
    scope.addEventProcessor(event => ({
      ...event,
      request: {
        data: { password: "synthetic-password" }, cookies: { session: "synthetic-session" },
        headers: { authorization: "Bearer synthetic-secret", cookie: "synthetic-cookie", accept: "application/json" },
      },
    }));
    captureError(new Error("private@example.test +7 (999) 123-45-67"));
  });
  expect(await sdk.flush(1000)).toBe(true);
  expect(observed.envelopes).toHaveLength(1);
  const serialized = JSON.stringify(observed.envelopes);
  expect(serialized).not.toMatch(/private@example|123-45-67|synthetic-password|synthetic-session|synthetic-secret|synthetic-cookie/);
  expect(serialized).toContain("[email]");
  expect(serialized).toContain("[phone]");
});

it.each([
  { url: "https://club.example.test/api/me?q=url-person@example.test&token=synthetic-query-token#fragment-person@example.test-synthetic-hash-token", query_string: "q=query-person@example.test&token=synthetic-query-string-token", expectedUrl: "https://club.example.test/api/me" },
  { url: "https://club.example.test/api/me?q=url-person@example.test&token=synthetic-query-token#fragment-person@example.test-synthetic-hash-token", query_string: { q: "query-person@example.test", token: "synthetic-query-object-token" }, expectedUrl: "https://club.example.test/api/me" },
  { url: "invalid URL q=invalid-person@example.test&token=synthetic-invalid-token", query_string: "q=query-person@example.test", expectedUrl: undefined },
])("удаляет параметры, фрагменты и произвольные заголовки до transport: $query_string", async ({ url, query_string, expectedUrl }) => {
  env.SENTRY_DSN = "https://1234567890abcdef1234567890abcdef@sentry.example.test/1";
  await initSentry();
  const sdk = await import("@sentry/node");
  sdk.withScope(scope => {
    scope.addEventProcessor(event => ({
      ...event,
      request: {
        method: "PATCH", url, query_string,
        headers: { Authorization: "Bearer synthetic-uppercase-secret", "X-Person": "header-person@example.test", accept: "application/json" },
      },
    }));
    captureError(new Error("Не удалось обновить профиль"));
  });
  expect(await sdk.flush(1000)).toBe(true);
  expect(observed.envelopes).toHaveLength(1);
  const serialized = JSON.stringify(observed.envelopes);
  expect(serialized).not.toMatch(/person@example|synthetic-|query_string|Authorization|X-Person|headers/);
  const payload = JSON.parse(serialized)[0][1][0][1];
  expect(payload.request).toEqual(expectedUrl ? { method: "PATCH", url: expectedUrl } : { method: "PATCH" });
  expect(payload.exception.values[0].value).toBe("Не удалось обновить профиль");
});
