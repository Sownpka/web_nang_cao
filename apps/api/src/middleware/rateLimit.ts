import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/httpError.js';
import { redis } from '../lib/redis.js';

export interface RateLimitOptions {
  /** Namespace for the Redis key, e.g. `login`. */
  name: string;
  limit: number;
  windowSec: number;
  /** Bucket key; return undefined to skip limiting for this request. Defaults to client IP. */
  key?: (req: Request) => string | undefined;
  message?: string;
}

/** Fixed-window limiter backed by Redis INCR, shared across API instances. */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const keyOf = opts.key ?? ((req: Request) => req.ip);
  return async (req, res, next) => {
    const bucket = keyOf(req);
    if (!bucket) return next();

    const key = `rl:${opts.name}:${bucket}`;
    const [[, count], [, ttl]] = (await redis
      .multi()
      .incr(key)
      .ttl(key)
      .exec()) as [[null, number], [null, number]];
    if (ttl < 0) await redis.expire(key, opts.windowSec);

    if (count > opts.limit) {
      res.setHeader('Retry-After', String(ttl > 0 ? ttl : opts.windowSec));
      return next(HttpError.tooManyRequests(opts.message));
    }
    next();
  };
}
