import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false, // Run test files sequentially to prevent database fixture race conditions
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
