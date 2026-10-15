import { Router, type Request, type Response } from 'express';
import { isProd } from '../../config.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

export const REFRESH_COOKIE = 'jh_rt';
const COOKIE_PATH = '/api/auth';

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: COOKIE_PATH,
    expires,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'strict', path: COOKIE_PATH });
}

const meta = (req: Request) => ({ userAgent: req.get('user-agent') });
const readCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
};

export const authRouter = Router();

// Students in one classroom often share a public IP, so login is limited per account, not per IP.
const loginLimiter = rateLimit({
  name: 'login',
  limit: 10,
  windowSec: 15 * 60,
  key: (req) => {
    const id: unknown = req.body?.identifier;
    return typeof id === 'string' ? id.trim().toLowerCase().slice(0, 254) : undefined;
  },
  message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút',
});
const registerLimiter = rateLimit({ name: 'register', limit: 30, windowSec: 3600 });

authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const session = await authService.register(input, meta(req));
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.status(201).json(session.auth);
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const session = await authService.login(input, meta(req));
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.json(session.auth);
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const session = await authService.refresh(readCookie(req), meta(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    res.json(session.auth);
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(readCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
});
