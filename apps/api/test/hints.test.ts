import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import type { Verdict } from '@judgehint/shared';
import type { HintContext } from '../src/ai/prompts.js';
import { createApp } from '../src/app.js';
import { hintMessages, prepareHint } from '../src/modules/hints/hints.service.js';
import { createUser } from './helpers.js';

const app = createApp();
let problemId: string;
let disabledProblemId: string;
let hiddenTestId: string;

beforeAll(async () => {
  const teacher = await createUser('TEACHER');
  const make = (aiHintsEnabled: boolean) =>
    prisma.problem.create({
      data: {
        slug: `hint-${aiHintsEnabled}-${Date.now()}`,
        title: 'Bài gợi ý',
        statementMd: 'In tổng.',
        difficulty: 'EASY',
        allowedLanguages: ['python'],
        aiHintsEnabled,
        authorId: teacher.user.id,
        testCases: { create: [{ order: 1, input: 'SECRET-INPUT', expected: '1', isHidden: true }] },
      },
      include: { testCases: true },
    });
  const p = await make(true);
  problemId = p.id;
  hiddenTestId = p.testCases[0]!.id;
  disabledProblemId = (await make(false)).id;
});

let codeSeq = 0;
/** Unique code by default so the cross-submission hint cache does not interfere. */
async function judged(userId: string, verdict: Verdict, pid = problemId, code = `print(input())  # ${Date.now()}-${++codeSeq}`) {
  return prisma.submission.create({
    data: {
      userId,
      problemId: pid,
      language: 'python',
      code,
      verdict,
      totalCount: 1,
      failedTestId: verdict === 'ACCEPTED' ? null : hiddenTestId,
      failedTestIndex: verdict === 'ACCEPTED' ? null : 0,
      stderr: verdict === 'RUNTIME_ERROR' ? 'Exception: SECRET-INPUT' : null,
    },
  });
}

/** Reads a whole SSE response into a list of events. */
function parseSse(text: string) {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith('event:'))
    .map((b) => {
      const [eventLine, dataLine] = b.split('\n');
      return { event: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) as Record<string, unknown> };
    });
}

const stream = (auth: string, submissionId: string, level: number) =>
  request(app).get('/api/hints/stream').query({ submissionId, level }).set('Authorization', auth).buffer(true).parse((res, cb) => {
    let text = '';
    res.on('data', (c: Buffer) => (text += c.toString()));
    res.on('end', () => cb(null, text));
  });

describe('GET /api/hints/stream', () => {
  it('streams deltas, stores the hint and serves it from cache afterwards', async () => {
    const student = await createUser('STUDENT');
    const sub = await judged(student.user.id, 'WRONG_ANSWER');

    const res = await stream(student.auth, sub.id, 1);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(res.body as string);
    const deltas = events.filter((e) => e.event === 'delta');
    const done = events.find((e) => e.event === 'done')!;
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.map((d) => d.data.text).join('').trim()).toBe(done.data.content);
    expect(done.data).toMatchObject({ level: 1, cached: false });

    const stored = await prisma.hint.findUnique({ where: { submissionId_level: { submissionId: sub.id, level: 1 } } });
    expect(stored?.content).toBe(done.data.content);

    const again = parseSse((await stream(student.auth, sub.id, 1)).body as string);
    expect(again).toEqual([{ event: 'done', data: { level: 1, content: stored!.content, cached: true, blocked: false } }]);
  });

  it('opens levels in order', async () => {
    const student = await createUser('STUDENT');
    const sub = await judged(student.user.id, 'WRONG_ANSWER');
    const res = await stream(student.auth, sub.id, 2);
    expect(res.status).toBe(409);
  });

  it('refuses other users, accepted submissions and disabled problems', async () => {
    const owner = await createUser('STUDENT');
    const other = await createUser('STUDENT');
    const wrong = await judged(owner.user.id, 'WRONG_ANSWER');
    expect((await stream(other.auth, wrong.id, 1)).status).toBe(403);

    const ac = await judged(owner.user.id, 'ACCEPTED');
    expect((await stream(owner.auth, ac.id, 1)).status).toBe(400);

    const off = await judged(owner.user.id, 'WRONG_ANSWER', disabledProblemId);
    const res = await stream(owner.auth, off.id, 1);
    expect(res.status).toBe(403);
  });

  it('never sends hidden test contents to the LLM, even when stderr carries them', async () => {
    const student = await createUser('STUDENT');
    const sub = await judged(student.user.id, 'RUNTIME_ERROR');
    const prepared = await prepareHint(sub.id, 1, { id: student.user.id, role: 'STUDENT' });
    expect('context' in prepared).toBe(true);
    const { messages } = hintMessages((prepared as { context: HintContext }).context);
    const sent = JSON.stringify(messages);
    expect(sent).not.toContain('SECRET-INPUT');
    expect(sent).toContain('Sai ở test ẩn số 1');
  });

  it('allows compile and runtime errors', async () => {
    const student = await createUser('STUDENT');
    const sub = await judged(student.user.id, 'RUNTIME_ERROR');
    expect((await stream(student.auth, sub.id, 1)).status).toBe(200);
  });
});

describe('GET /api/hints', () => {
  it('reports opened hints and the next level', async () => {
    const student = await createUser('STUDENT');
    const sub = await judged(student.user.id, 'WRONG_ANSWER');
    await stream(student.auth, sub.id, 1);

    const res = await request(app).get('/api/hints').query({ submissionId: sub.id }).set('Authorization', student.auth);
    expect(res.body).toMatchObject({ nextLevel: 2, blockedReason: null });
    expect(res.body.hints).toHaveLength(1);
  });

  it('lets teachers read hints but not open new ones', async () => {
    const student = await createUser('STUDENT');
    const teacher = await createUser('TEACHER');
    const sub = await judged(student.user.id, 'WRONG_ANSWER');
    const res = await request(app).get('/api/hints').query({ submissionId: sub.id }).set('Authorization', teacher.auth);
    expect(res.body).toMatchObject({ nextLevel: null, blockedReason: 'NOT_OWNER' });
  });
});
