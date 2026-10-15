import { createHmac, randomBytes } from 'node:crypto';
import { Prisma, prisma, type User } from '@judgehint/db';
import { STUDENT_CODE_REGEX, type AuthResponse, type AuthUser } from '@judgehint/shared';
import { env } from '../../config.js';
import { HttpError } from '../../lib/httpError.js';
import { signAccessToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

/** A rotated-out token presented again after this window is treated as theft. */
const REUSE_GRACE_MS = 30_000;

export interface SessionMeta {
  userAgent?: string;
}

export interface IssuedSession {
  auth: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function toAuthUser(u: Pick<User, 'id' | 'email' | 'fullName' | 'studentCode' | 'role'>): AuthUser {
  return { id: u.id, email: u.email, fullName: u.fullName, studentCode: u.studentCode, role: u.role };
}

function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

const sessionExpired = () => HttpError.unauthorized('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'SESSION_EXPIRED');

async function issueSession(user: User, meta: SessionMeta): Promise<IssuedSession> {
  const refreshToken = randomBytes(32).toString('base64url');
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600e3);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  return {
    auth: { accessToken: signAccessToken({ sub: user.id, role: user.role }), user: toAuthUser(user) },
    refreshToken,
    refreshExpiresAt,
  };
}

export async function register(input: RegisterInput, meta: SessionMeta): Promise<IssuedSession> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { studentCode: input.studentCode }] },
    select: { email: true },
  });
  if (existing) {
    throw existing.email === input.email
      ? HttpError.conflict('Email đã được sử dụng', 'EMAIL_TAKEN')
      : HttpError.conflict('Mã sinh viên đã được đăng ký', 'STUDENT_CODE_TAKEN');
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        studentCode: input.studentCode,
        passwordHash: await hashPassword(input.password),
        role: 'STUDENT',
      },
    });
    return issueSession(user, meta);
  } catch (err) {
    // Lost a race with a concurrent registration using the same email/code.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw HttpError.conflict('Email hoặc mã sinh viên đã được sử dụng', 'ACCOUNT_TAKEN');
    }
    throw err;
  }
}

export async function login(input: LoginInput, meta: SessionMeta): Promise<IssuedSession> {
  const id = input.identifier;
  const user = STUDENT_CODE_REGEX.test(id)
    ? await prisma.user.findUnique({ where: { studentCode: id } })
    : await prisma.user.findUnique({ where: { email: id.toLowerCase() } });

  const ok = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !ok) {
    throw HttpError.unauthorized('Email/mã sinh viên hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
  }
  return issueSession(user, meta);
}

/** Rotates the refresh token: the presented one is revoked and a new pair is issued. */
export async function refresh(rawToken: string | undefined, meta: SessionMeta): Promise<IssuedSession> {
  if (!rawToken) throw HttpError.unauthorized('Chưa đăng nhập', 'NO_SESSION');

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    include: { user: true },
  });
  if (!row) throw sessionExpired();

  if (row.revokedAt) {
    // Small grace window covers two tabs refreshing at the same moment.
    if (Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) {
      logger.warn({ userId: row.userId }, 'refresh token reuse detected, revoking all sessions');
      await revokeAllSessions(row.userId);
    }
    throw sessionExpired();
  }
  if (row.expiresAt.getTime() <= Date.now()) throw sessionExpired();

  // Conditional update makes rotation atomic under concurrent requests.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw sessionExpired();

  return issueSession(row.user, meta);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
