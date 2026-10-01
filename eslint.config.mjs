import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.generated.ts"] },
  {
    files: ["frontend/{src,tests/unit}/**/*.{ts,tsx}", "packages/*/{src,tests}/**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
