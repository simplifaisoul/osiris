import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    environment: "node",
    passWithNoTests: false,
    testTimeout: 10_000,
  },
});
