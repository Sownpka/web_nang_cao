import type { Response } from 'supertest';
import { prisma } from '@judgehint/db';
import type { Role } from '@judgehint/shared';
import { signAccessToken } from '../src/lib/jwt.js';

/** Creates a user directly in the test DB and returns an Authorization header for it. */
export async function createUser(role: Role) {
  counter += 1;
  const tag = `${role.toLowerCase()}-${Date.now()}-${counter}`;
  const user = await prisma.user.create({
    data: { email: `${tag}@test.local`, fullName: `Test ${role}`, passwordHash: 'x', role },
  });
  return { user, auth: `Bearer ${signAccessToken({ sub: user.id, role })}` };
}

let counter = 0;

/** Unique student payload so tests never collide on email / student code. */
export function newStudent(overrides: Partial<Record<'fullName' | 'studentCode' | 'email' | 'password', string>> = {}) {
  counter += 1;
  const n = `${Date.now() % 1_000_000}${counter}`.padStart(8, '0').slice(-8);
  return {
    fullName: 'Sinh Viên Test',
    studentCode: n,
    email: `sv${n}@test.local`,
    password: 'password123',
    ...overrides,
  };
}

/** Extracts the refresh cookie value from a response, if set. */
export function refreshCookie(res: Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith('jh_rt='));
  const value = line?.split(';')[0]?.slice('jh_rt='.length);
  return value || undefined;
}

export const cookieHeader = (token: string) => `jh_rt=${token}`;
