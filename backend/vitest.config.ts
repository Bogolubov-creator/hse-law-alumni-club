import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Переменные окружения выставляются до импорта модулей приложения (env.ts
    // валидирует process.env при загрузке).
    setupFiles: ["tests/helpers/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Тесты роутов делят общий слой данных в памяти и заглушают глобальный fetch –
    // параллельные файлы затирали бы состояние друг друга.
    fileParallelism: false,
  },
});
