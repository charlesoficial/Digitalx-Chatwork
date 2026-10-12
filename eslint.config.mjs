import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**", "evidence/**", "supabase/functions/**"] },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "*.config.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Browser APIs and Realtime payloads are narrowed at their call sites.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
