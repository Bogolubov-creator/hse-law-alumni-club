/**
 * Переменные окружения для тестов. Ставятся ДО импорта модулей приложения:
 * env.ts валидирует process.env на этапе загрузки и без этих значений упадёт.
 */
process.env.APP_ENV = "development";
process.env.DIRECTUS_URL ??= "http://directus.test";
process.env.DIRECTUS_SERVICE_TOKEN ??= "test-service-token";
process.env.AUTH_SECRET ??= "test-auth-secret-not-a-real-one-32ch";
process.env.ADMIN_AUTH_SECRET ??= "test-admin-secret-not-a-real-one-32c";
process.env.PUBLIC_URL ??= "http://localhost";
