import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/httpError.js';
import { verifyAccessToken } from '../lib/jwt.js';

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

/** Rejects the request unless it carries a valid access token; sets `req.user`. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) return next(HttpError.unauthorized());
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    // TOKEN_EXPIRED tells the client to call /auth/refresh and retry.
    if (err instanceof jwt.TokenExpiredError) {
      return next(HttpError.unauthorized('Phiên làm việc đã hết hạn', 'TOKEN_EXPIRED'));
    }
    next(HttpError.unauthorized('Token không hợp lệ', 'INVALID_TOKEN'));
  }
};

/** Returns the authenticated user; only call after `requireAuth`. */
export function currentUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw HttpError.unauthorized();
  return req.user;
}
