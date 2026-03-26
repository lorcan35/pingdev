import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 30_000,
    // Integration tests share a single browser tab — run files sequentially
    fileParallelism: false,
    // But unit tests within a file can run in parallel
    sequence: {
      concurrent: false,
    },
  },
});
