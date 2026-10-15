import type { RequestHandler } from 'express';
import type { Role } from '@judgehint/shared';
import { HttpError } from '../lib/httpError.js';

/** Allows the request only if the authenticated user has one of `roles`. Use after `requireAuth`. */
export function requireRole(...roles: Role[]): RequestHandler {
  const allowed = new Set<Role>(roles);
  return (req, _res, next) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (!allowed.has(req.user.role)) return next(HttpError.forbidden());
    next();
  };
}
