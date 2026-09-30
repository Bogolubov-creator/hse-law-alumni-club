process.env.APP_ENV = "development";
process.env.POINTS_SERVICE_TOKEN ??= "test-service-token";
process.env.AUTH_SECRET ??= "test-auth-secret-not-a-real-one-32ch";
process.env.ADMIN_AUTH_SECRET ??= "test-admin-secret-not-a-real-one-32c";
process.env.PUBLIC_URL ??= "http://localhost";

// HTTP-тесты используют настоящее ядро auth и Argon2, подменяя только persistence.
// SQL-набор отдельно проверяет настоящие блокировки, COMMIT и откат.
if (process.env.RUN_NATIVE_AUTH_INTEGRATION !== "true") {
  const { vi } = await import("vitest");
  vi.doMock("../../src/modules/auth/native-auth-store.js", async () => await import("./fake-native-auth-store.js"));
}
