import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'intel/*.test.ts'],
    // Live-network integration tests are opt-in via RUN_LIVE_TESTS=1
    testTimeout: 30000,
  },
});
