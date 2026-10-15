import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import { createApp } from '../src/app.js';
import { submissionsQueue } from '../src/lib/queue.js';
import { summarizeHiddenStderr } from '../src/modules/submissions/submissions.service.js';
import { createUser } from './helpers.js';

const app = createApp();

let teacher: Awaited<ReturnType<typeof createUser>>;
let problemId: string;
let publicTestId: string;
let hiddenTestId: string;

beforeAll(async () => {
  teacher = await createUser('TEACHER');
  const problem = await prisma.problem.create({
    data: {
      slug: `sub-test-${Date.now()}`,
      title: 'Bài nộp thử',
      statementMd: 'In tổng hai số.',
      difficulty: 'EASY',
      allowedLanguages: ['python'],
      authorId: teacher.user.id,
      testCases: {
        create: [
          { order: 1, input: '1 2\n', expected: '3\n', isHidden: false },
          { order: 2, input: 'SECRET 40 2\n', expected: '42\n', isHidden: true },
        ],
      },
    },
    include: { testCases: { orderBy: { order: 'asc' } } },
  });
  problemId = problem.id;
  publicTestId = problem.testCases[0]!.id;
  hiddenTestId = problem.testCases[1]!.id;
});

const submit = (auth: string, body: Record<string, unknown>) => request(app).post('/api/submissions').set('Authorization', auth).send(body);

describe('POST /api/submissions', () => {
  it('stores a PENDING submission and enqueues a judge job', async () => {
    const student = await createUser('STUDENT');
    const res = await submit(student.auth, { problemId, language: 'python', code: 'print(3)' });
    expect(res.status).toBe(202);

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: res.body.submissionId } });
    expect(row).toMatchObject({ verdict: 'PENDING', totalCount: 2, userId: student.user.id });
    const job = await submissionsQueue.getJob(res.body.submissionId);
    expect(job?.data).toEqual({ submissionId: res.body.submissionId });
  });

  it('rejects a language the problem does not allow', async () => {
    const student = await createUser('STUDENT');
    const res = await submit(student.auth, { problemId, language: 'javascript', code: 'console.log(3)' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LANGUAGE_NOT_ALLOWED');
  });

  it('rejects problems without test cases', async () => {
    const student = await createUser('STUDENT');
    const empty = await prisma.problem.create({
      data: { slug: `empty-${Date.now()}`, title: 'Trống', statementMd: 'Chưa có test.', difficulty: 'EASY', allowedLanguages: ['python'], authorId: teacher.user.id },
    });
    const res = await submit(student.auth, { problemId: empty.id, language: 'python', code: 'print(1)' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_TESTS');
  });

  it('validates the body and rejects NUL bytes', async () => {
    const student = await createUser('STUDENT');
    const res = await submit(student.auth, { problemId, language: 'python', code: 'print(1)\0' });
    expect(res.status).toBe(400);
  });

  it('allows one submission per 5 seconds per user', async () => {
    const student = await createUser('STUDENT');
    expect((await submit(student.auth, { problemId, language: 'python', code: 'print(3)' })).status).toBe(202);
    const second = await submit(student.auth, { problemId, language: 'python', code: 'print(3)' });
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
  });
});

describe('GET /api/submissions', () => {
  it('only lets students see their own submissions', async () => {
    const a = await createUser('STUDENT');
    const b = await createUser('STUDENT');
    const { body } = await submit(a.auth, { problemId, language: 'python', code: 'print(3)' });

    expect((await request(app).get(`/api/submissions/${body.submissionId}`).set('Authorization', b.auth)).status).toBe(403);
    expect((await request(app).get(`/api/submissions/${body.submissionId}`).set('Authorization', teacher.auth)).status).toBe(200);

    const listB = await request(app).get('/api/submissions').set('Authorization', b.auth);
    expect(listB.body.items.find((s: { id: string }) => s.id === body.submissionId)).toBeUndefined();
    const listA = await request(app).get('/api/submissions').query({ problemId }).set('Authorization', a.auth);
    expect(listA.body.items[0]).toMatchObject({ id: body.submissionId, verdict: 'PENDING' });
    expect(listA.body.items[0]).not.toHaveProperty('code');
  });
});

describe('failed test details', () => {
  async function judged(failedTestId: string, failedTestIndex: number) {
    const student = await createUser('STUDENT');
    const s = await prisma.submission.create({
      data: {
        userId: student.user.id,
        problemId,
        language: 'python',
        code: 'raise Exception(input())',
        verdict: 'RUNTIME_ERROR',
        totalCount: 2,
        passedCount: failedTestIndex,
        failedTestId,
        failedTestIndex,
        actualOutput: '',
        stderr: 'Traceback (most recent call last):\n  File "/tmp/main.py", line 1\nException: SECRET 40 2',
      },
    });
    return { student, id: s.id };
  }

  it('shows input/expected/actual and full stderr for a public test', async () => {
    const { student, id } = await judged(publicTestId, 0);
    const res = await request(app).get(`/api/submissions/${id}`).set('Authorization', student.auth);
    expect(res.body.failedTest).toEqual({ number: 1, isHidden: false, input: '1 2\n', expected: '3\n', actual: '' });
    expect(res.body.stderr).toContain('Traceback');
  });

  it('never reveals hidden test contents to the student, even through stderr', async () => {
    const { student, id } = await judged(hiddenTestId, 1);
    const res = await request(app).get(`/api/submissions/${id}`).set('Authorization', student.auth);
    expect(res.body.failedTest).toEqual({ number: 2, isHidden: true });
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    expect(res.body.stderr).toMatch(/^Exception/);

    const asTeacher = await request(app).get(`/api/submissions/${id}`).set('Authorization', teacher.auth);
    expect(asTeacher.body.failedTest.input).toContain('SECRET');
  });
});

describe('summarizeHiddenStderr', () => {
  it('keeps only the exception type', () => {
    expect(summarizeHiddenStderr('Traceback...\nZeroDivisionError: division by zero')).toMatch(/^ZeroDivisionError /);
    expect(summarizeHiddenStderr('/tmp/main.js:1\nTypeError: x is not a function\n    at Object.<anonymous>')).toMatch(/^TypeError /);
    expect(summarizeHiddenStderr('segfault secret-data')).not.toContain('secret');
    expect(summarizeHiddenStderr(null)).toBeNull();
  });
});
