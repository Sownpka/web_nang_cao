import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '@judgehint/shared';
import { signAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requireRole } from '../src/middleware/rbac.js';

const app = express();
app.get('/teacher-only', requireAuth, requireRole('TEACHER', 'ADMIN'), (_req, res) => {
  res.json({ ok: true });
});
app.get('/admin-only', requireAuth, requireRole('ADMIN'), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

const tokenFor = (role: Role) => `Bearer ${signAccessToken({ sub: `user-${role}`, role })}`;

describe('requireRole', () => {
  it.each([
    ['STUDENT', 403, 403],
    ['TEACHER', 200, 403],
    ['ADMIN', 200, 200],
  ] as const)('%s → teacher route %i, admin route %i', async (role, teacherStatus, adminStatus) => {
    const t = await request(app).get('/teacher-only').set('Authorization', tokenFor(role));
    const a = await request(app).get('/admin-only').set('Authorization', tokenFor(role));
    expect(t.status).toBe(teacherStatus);
    expect(a.status).toBe(adminStatus);
    if (t.status === 403) expect(t.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 before checking roles when unauthenticated', async () => {
    const res = await request(app).get('/teacher-only');
    expect(res.status).toBe(401);
  });
});
