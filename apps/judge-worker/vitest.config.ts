import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sandbox tests start real containers; keep them sequential so timings are not distorted.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
