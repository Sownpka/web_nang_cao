import { defineConfig } from 'vitest/config';
import { testEnv } from './test/testEnv.js';

export default defineConfig({
  test: {
    env: testEnv(),
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
