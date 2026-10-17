import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './env.js';

/**
 * Browser e2e tests for the main flows. Needs Docker running, `pnpm db:up` and `pnpm build:sandbox`.
 * The webServer below boots api + worker + web + a fake LLM against an isolated e2e database;
 * start it yourself with `pnpm e2e:stack` to keep it warm between runs.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './globalSetup.ts',
  // One judge with concurrency 2 and per-user submit rate limits: run flows one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'pnpm exec tsx scripts/stack.ts',
    url: `${WEB_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Service logs always go to e2e/stack.log; E2E_VERBOSE=1 also prints them here.
    stdout: process.env.E2E_VERBOSE ? 'pipe' : 'ignore',
    stderr: 'pipe',
  },
});
