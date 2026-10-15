import { Redis } from 'ioredis';
import { env } from '../config.js';
import { logger } from './logger.js';

/** General-purpose Redis connection (cache, rate limits, leaderboard). */
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });

redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
