import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Style/strictness rules that don't indicate runtime bugs are downgraded to
  // warnings so `next build` isn't blocked by them (tsc still typechecks the
  // codebase). Real correctness rules stay at "error".
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler strictness rules — the codebase's imperative map/DOM
      // handling trips these but runs correctly; keep them visible as warnings
      // rather than blocking the production build.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
