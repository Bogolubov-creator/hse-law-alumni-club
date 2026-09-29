import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Переменные окружения выставляются до импорта модулей приложения (env.ts
    // валидирует process.env при загрузке).
    setupFiles: ["src/test/setup.ts"],
    // Тесты роутов делят общий in-memory Directus и заглушают глобальный fetch –
    // параллельные файлы затирали бы состояние друг друга.
    fileParallelism: false,
  },
});
