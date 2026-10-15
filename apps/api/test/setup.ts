import { afterAll } from 'vitest';
import { prisma } from '@judgehint/db';
import { redis } from '../src/lib/redis.js';

afterAll(async () => {
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});
