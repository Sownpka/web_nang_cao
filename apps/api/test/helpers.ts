import type { Response } from 'supertest';

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
