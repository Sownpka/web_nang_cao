// Isolated environment for the e2e stack, derived from the developer's root .env.
// Ports differ from `pnpm dev` so both can run side by side.
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export const WEB_PORT = 5174;
export const API_PORT = 4100;
export const FAKE_LLM_PORT = 4199;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const FAKE_LLM_URL = `http://127.0.0.1:${FAKE_LLM_PORT}`;
/** Redis logical DB reserved for e2e (dev uses 0, Vitest uses 1). */
export const E2E_REDIS_DB = 2;

function rootEnv(): Record<string, string> {
  const path = `${repoRoot}.env`;
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

function withSuffix(url: string, suffix: string) {
  const u = new URL(url);
  u.pathname = `${u.pathname.replace(/\/$/, '')}${suffix}`;
  return u.toString();
}

export function e2eEnv(): Record<string, string> {
  const file = rootEnv();
  const dbUrl = file.DATABASE_URL ?? 'postgresql://judgehint:judgehint@localhost:5433/judgehint';
  const redisUrl = new URL(file.REDIS_URL ?? 'redis://localhost:6379');
  redisUrl.pathname = `/${E2E_REDIS_DB}`;

  return {
    NODE_ENV: 'development',
    DATABASE_URL: dbUrl.includes('_e2e') ? dbUrl : withSuffix(dbUrl, '_e2e'),
    REDIS_URL: redisUrl.toString(),
    API_PORT: String(API_PORT),
    WEB_ORIGIN: WEB_URL,
    VITE_API_PROXY: `http://localhost:${API_PORT}`,
    JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef01234',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef0123',
    // Hints go to the fake OpenAI-compatible server started by the stack, never to 9router.
    LLM_BASE_URL: `${FAKE_LLM_URL}/v1`,
    LLM_API_KEY: 'e2e-fake-key',
    LLM_MODEL: 'e2e-fake-model',
    HINT_DAILY_LIMIT: '20',
    JUDGE_CONCURRENCY: '2',
  };
}

export function assertE2eTargets(env: Record<string, string>) {
  if (!new URL(env.DATABASE_URL!).pathname.endsWith('_e2e')) {
    throw new Error(`Refusing to touch a non-e2e database: ${env.DATABASE_URL}`);
  }
  if (new URL(env.REDIS_URL!).pathname !== `/${E2E_REDIS_DB}`) {
    throw new Error(`Refusing to touch a non-e2e Redis DB: ${env.REDIS_URL}`);
  }
}
