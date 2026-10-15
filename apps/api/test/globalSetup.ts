import { execSync } from 'node:child_process';
import { Redis } from 'ioredis';
import { repoRoot, testEnv } from './testEnv.js';

/**
 * Brings the isolated test database up to date (non-destructive; creates it if missing)
 * and clears rate-limit counters in the test Redis DB. Tests use unique accounts, so
 * leftover rows from earlier runs do not matter.
 */
export default async function setup() {
  const env = testEnv();
  if (!new URL(env.DATABASE_URL!).pathname.endsWith('_test')) {
    throw new Error('Refusing to run tests against a non-test database');
  }

  execSync('pnpm exec prisma migrate deploy', {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });

  const redis = new Redis(env.REDIS_URL!);
  // Rate-limit counters and queued jobs from earlier runs (no worker consumes the test DB).
  const keys = [...(await redis.keys('rl:*')), ...(await redis.keys('bull:*'))];
  if (keys.length) await redis.del(...keys);
  await redis.quit();
}
