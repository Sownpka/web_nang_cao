import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[judge-worker] Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
