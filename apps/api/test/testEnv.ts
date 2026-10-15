// Derives an isolated test database / Redis DB from the developer's root .env.
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function rootEnv(): Record<string, string> {
  const path = `${repoRoot}.env`;
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

function withSuffix(url: string, suffix: string) {
  const u = new URL(url);
  u.pathname = `${u.pathname.replace(/\/$/, '')}${suffix}`;
  return u.toString();
}

export function testEnv(): Record<string, string> {
  const file = rootEnv();
  const dbUrl = process.env.DATABASE_URL ?? file.DATABASE_URL ?? 'postgresql://judgehint:judgehint@localhost:5433/judgehint';
  const redisUrl = new URL(process.env.REDIS_URL ?? file.REDIS_URL ?? 'redis://localhost:6379');
  redisUrl.pathname = '/1';

  return {
    NODE_ENV: 'test',
    DATABASE_URL: dbUrl.includes('_test') ? dbUrl : withSuffix(dbUrl, '_test'),
    REDIS_URL: redisUrl.toString(),
    JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
    // Never call a real LLM from tests: an empty URL selects the mock provider.
    LLM_BASE_URL: '',
    LLM_MODEL: '',
    // Small so the quota test does not need dozens of requests.
    HINT_DAILY_LIMIT: '3',
  };
}
