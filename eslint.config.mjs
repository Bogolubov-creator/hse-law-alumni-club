import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.generated.ts"] },
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/shared/src/**/*.ts", "scripts/src/**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...js.configs.recommended.rules,
      // Имена проверяет TypeScript. В проекте ещё есть неиспользуемые legacy-экспорты;
      // их удаление требует анализа маршрутов, а не автоматической правки линтером.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
