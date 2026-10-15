import jwt from 'jsonwebtoken';
import { Role } from '@judgehint/shared';
import { env } from '../config.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

const ISSUER = 'judgehint';
const ROLES = new Set<string>(Object.values(Role));

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ role: payload.role }, env.JWT_ACCESS_SECRET, {
    subject: payload.sub,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
  });
}

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on invalid tokens. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded.role !== 'string' || !ROLES.has(decoded.role)) {
    throw new jwt.JsonWebTokenError('malformed payload');
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}
