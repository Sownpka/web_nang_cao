import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import { createApp } from '../src/app.js';
import { runsQueue } from '../src/lib/queue.js';
import { createUser } from './helpers.js';

const app = createApp();
let withSamples: string;
let hiddenOnly: string;

beforeAll(async () => {
  const teacher = await createUser('TEACHER');
  const make = (slug: string, tests: { input: string; expected: string; isHidden: boolean }[]) =>
    prisma.problem.create({
      data: {
        slug: `${slug}-${Date.now()}`,
        title: slug,
        statementMd: 'Chạy thử.',
        difficulty: 'EASY',
        allowedLanguages: ['python'],
        authorId: teacher.user.id,
        testCases: { create: tests.map((t, i) => ({ ...t, order: i + 1 })) },
      },
    });
  withSamples = (
    await make('run-samples', [
      { input: '1', expected: '1', isHidden: false },
      { input: '2', expected: '2', isHidden: false },
      { input: 'secret', expected: 'x', isHidden: true },
    ])
  ).id;
  hiddenOnly = (await make('run-hidden', [{ input: 'secret', expected: 'x', isHidden: true }])).id;
});

const run = (auth: string, problemId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/problems/${problemId}/run-samples`).set('Authorization', auth).send(body);

describe('POST /api/problems/:id/run-samples', () => {
  it('queues a run over public tests (+ custom input) without touching submissions', async () => {
    const student = await createUser('STUDENT');
    const before = await prisma.submission.count();

    const res = await run(student.auth, withSamples, { language: 'python', code: 'print(input())', customInput: '7' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'PENDING', total: 3, cases: [] });

    const job = await runsQueue.getJob(res.body.runId);
    expect(job?.data).toMatchObject({ problemId: withSamples, userId: student.user.id, customInput: '7' });
    expect(await prisma.submission.count()).toBe(before);
  });

  it('requires public tests or custom input', async () => {
    const student = await createUser('STUDENT');
    const res = await run(student.auth, hiddenOnly, { language: 'python', code: 'print(1)' });
    expect(res.status).toBe(400);
    // Rejected attempts still count towards the rate limit, so use a fresh user.
    const another = await createUser('STUDENT');
    const withCustom = await run(another.auth, hiddenOnly, { language: 'python', code: 'print(1)', customInput: '' });
    expect(withCustom.status).toBe(202);
    expect(withCustom.body.total).toBe(1);
  });

  it('is rate limited per user', async () => {
    const student = await createUser('STUDENT');
    expect((await run(student.auth, withSamples, { language: 'python', code: 'print(1)' })).status).toBe(202);
    expect((await run(student.auth, withSamples, { language: 'python', code: 'print(1)' })).status).toBe(429);
  });
});

describe('GET /api/runs/:runId', () => {
  it('returns the run to its owner only', async () => {
    const owner = await createUser('STUDENT');
    const other = await createUser('STUDENT');
    const { body } = await run(owner.auth, withSamples, { language: 'python', code: 'print(1)' });

    const mine = await request(app).get(`/api/runs/${body.runId}`).set('Authorization', owner.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.runId).toBe(body.runId);

    const theirs = await request(app).get(`/api/runs/${body.runId}`).set('Authorization', other.auth);
    expect(theirs.status).toBe(404);
  });
});
