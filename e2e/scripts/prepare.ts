// Resets the e2e database and Redis DB to the demo seed so every run starts from the same state.
import { execSync } from 'node:child_process';
import { Redis } from 'ioredis';
import { assertE2eTargets, e2eEnv, repoRoot } from '../env.js';

const env = e2eEnv();
assertE2eTargets(env);
Object.assign(process.env, env);

const run = (cmd: string) => execSync(cmd, { cwd: repoRoot, env: process.env, stdio: 'inherit' });

// Creates the database on first use; non-destructive otherwise.
run('pnpm exec prisma migrate deploy');

const { prisma } = await import('@judgehint/db');
try {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
} finally {
  await prisma.$disconnect();
}

run('pnpm exec tsx seed/index.ts');

// Rate limits, hint quota/cache and leaderboard caches. Queue keys stay: a running worker owns them.
const redis = new Redis(env.REDIS_URL!);
const keys = (await redis.keys('*')).filter((k) => !k.startsWith('bull:'));
if (keys.length) await redis.del(...keys);
await redis.quit();

console.log('[e2e] database and redis reset');
