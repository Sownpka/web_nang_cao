import { Router } from 'express';
import { prisma } from '@judgehint/db';
import { redis } from '../../lib/redis.js';

export const healthRouter = Router();

/** Liveness + dependency check used by the web app and compose healthchecks. */
healthRouter.get('/', async (_req, res) => {
  const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const status = {
    db: db.status === 'fulfilled' ? 'ok' : 'down',
    redis: cache.status === 'fulfilled' ? 'ok' : 'down',
  };
  const ok = status.db === 'ok' && status.redis === 'ok';
  res.status(ok ? 200 : 503).json({ ok, ...status, time: new Date().toISOString() });
});
