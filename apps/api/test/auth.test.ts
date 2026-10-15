import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import { createApp } from '../src/app.js';
import { cookieHeader, newStudent, refreshCookie } from './helpers.js';

const app = createApp();

async function registerStudent(overrides = {}) {
  const body = newStudent(overrides);
  const res = await request(app).post('/api/auth/register').send(body);
  expect(res.status).toBe(201);
  return { body, res, token: res.body.accessToken as string, cookie: refreshCookie(res)! };
}

describe('POST /api/auth/register', () => {
  it('creates a STUDENT and sets an httpOnly refresh cookie scoped to /api/auth', async () => {
    const { body, res, cookie } = await registerStudent();

    expect(res.body.user).toMatchObject({ email: body.email, studentCode: body.studentCode, role: 'STUDENT' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(cookie).toBeTruthy();
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\/api\/auth/);
  });

  it('ignores a role field in the body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newStudent(), role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STUDENT');
  });

  it('rejects duplicate email and duplicate student code', async () => {
    const { body } = await registerStudent();

    const dupEmail = await request(app).post('/api/auth/register').send(newStudent({ email: body.email }));
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');

    const dupCode = await request(app).post('/api/auth/register').send(newStudent({ studentCode: body.studentCode }));
    expect(dupCode.status).toBe(409);
    expect(dupCode.body.error.code).toBe('STUDENT_CODE_TAKEN');
  });

  it('returns VALIDATION_ERROR with field details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'A', studentCode: '12', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['fullName', 'studentCode', 'email', 'password']),
    );
  });
});

describe('POST /api/auth/login', () => {
  it('accepts email (case-insensitive) or student code', async () => {
    const { body } = await registerStudent();

    const byEmail = await request(app)
      .post('/api/auth/login')
      .send({ identifier: body.email.toUpperCase(), password: body.password });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.accessToken).toBeTruthy();

    const byCode = await request(app)
      .post('/api/auth/login')
      .send({ identifier: body.studentCode, password: body.password });
    expect(byCode.status).toBe(200);
  });

  it('returns the same error for wrong password and unknown account', async () => {
    const { body } = await registerStudent();
    const wrong = await request(app).post('/api/auth/login').send({ identifier: body.email, password: 'wrong-pass' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody@test.local', password: 'whatever1' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error).toEqual(wrong.body.error);
  });

  it('rate-limits repeated attempts on one account', async () => {
    const { body } = await registerStudent();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app).post('/api/auth/login').send({ identifier: body.email, password: 'wrong-pass' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('GET /api/me', () => {
  it('requires a valid access token', async () => {
    expect((await request(app).get('/api/me')).body.error.code).toBe('UNAUTHORIZED');

    const bad = await request(app).get('/api/me').set('Authorization', 'Bearer garbage');
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the current user', async () => {
    const { body, token } = await registerStudent();
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(body.email);
  });

  it('reports TOKEN_EXPIRED so the client knows to refresh', async () => {
    const { res: reg } = await registerStudent();
    const expired = jwt.sign(
      { role: 'STUDENT', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_ACCESS_SECRET!,
      { subject: reg.body.user.id, issuer: 'judgehint' },
    );
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects tokens signed with another secret', async () => {
    const { res: reg } = await registerStudent();
    const forged = jwt.sign({ role: 'ADMIN' }, 'some-other-secret-that-is-long-enough!!', {
      subject: reg.body.user.id,
      issuer: 'judgehint',
    });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${forged}`);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('refresh token rotation', () => {
  it('rotates the cookie and rejects the old token', async () => {
    const { cookie } = await registerStudent();

    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(cookie));
    expect(first.status).toBe(200);
    const rotated = refreshCookie(first)!;
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(cookie);

    const reused = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(cookie));
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('SESSION_EXPIRED');

    // A reuse inside the grace window must not kill the legitimate new session.
    const next = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(rotated));
    expect(next.status).toBe(200);
  });

  it('revokes every session when an old token is replayed after the grace window', async () => {
    const { cookie, res } = await registerStudent();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(cookie));
    const current = refreshCookie(first)!;

    await prisma.refreshToken.updateMany({
      where: { userId: res.body.user.id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(cookie));
    expect(replay.status).toBe(401);

    const afterTheft = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(current));
    expect(afterTheft.status).toBe(401);
  });

  it('fails without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { cookie } = await registerStudent();
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader(cookie));
    expect(out.status).toBe(204);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(cookie));
    expect(res.status).toBe(401);
  });
});
