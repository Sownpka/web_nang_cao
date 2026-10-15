// Leak guard, daily quota, shared cache and hint penalty, end to end through the SSE endpoint.
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import type { ChatStreamer } from '../src/ai/llmClient.js';
import { FALLBACK_HINTS } from '../src/ai/leak-guard.js';
import { createApp } from '../src/app.js';
import { setStreamer } from '../src/modules/hints/hints.service.js';
import { createUser } from './helpers.js';

const app = createApp();
let problemId: string;

const LEAKY = 'Lời giải:\n```python\nn = int(input())\nbest = max(a)\nprint(best)\n```';
const CLEAN = 'Hãy xem lại **trường hợp biên**: khi mọi phần tử đều âm thì kết quả của bạn là gì?';

/** Fake LLM that answers with the given texts in order (the last one repeats) and counts calls. */
function scripted(...answers: string[]) {
  let calls = 0;
  const run: ChatStreamer = async function* () {
    const text = answers[Math.min(calls, answers.length - 1)]!;
    calls++;
    for (const word of text.split(/(?<= )/)) yield word;
  };
  return { run, calls: () => calls };
}

beforeAll(async () => {
  const teacher = await createUser('TEACHER');
  const p = await prisma.problem.create({
    data: {
      slug: `guard-${Date.now()}`,
      title: 'Bài kiểm tra leak guard',
      statementMd: 'Tìm giá trị lớn nhất.',
      difficulty: 'EASY',
      allowedLanguages: ['python'],
      referenceSolution: 'n = int(input())\na = list(map(int, input().split()))\nprint(max(a))',
      authorId: teacher.user.id,
      testCases: { create: [{ order: 1, input: '3\n1 2 3', expected: '3', isHidden: false }] },
    },
  });
  problemId = p.id;
});

afterEach(() => setStreamer(undefined));

let seq = 0;
const wrong = (userId: string, code = `print(0)  # ${Date.now()}-${++seq}`) =>
  prisma.submission.create({
    data: { userId, problemId, language: 'python', code, verdict: 'WRONG_ANSWER', totalCount: 1, failedTestIndex: 0 },
  });

const stream = (auth: string, submissionId: string, level: number) =>
  request(app).get('/api/hints/stream').query({ submissionId, level }).set('Authorization', auth).buffer(true).parse((res, cb) => {
    let text = '';
    res.on('data', (c: Buffer) => (text += c.toString()));
    res.on('end', () => cb(null, text));
  });

const events = (body: string) =>
  body
    .split('\n\n')
    .filter((b) => b.startsWith('event:'))
    .map((b) => {
      const [e, d] = b.split('\n');
      return { event: e!.slice(7), data: JSON.parse(d!.slice(6)) as Record<string, unknown> };
    });

describe('leak guard in the hint stream', () => {
  it('never sends a leaking answer: it rewrites and stores the safe version', async () => {
    const llm = scripted(LEAKY, CLEAN);
    setStreamer(llm.run);
    const student = await createUser('STUDENT');
    const sub = await wrong(student.user.id);

    const res = await stream(student.auth, sub.id, 1);
    expect(res.body as string).not.toContain('max(a)');
    const ev = events(res.body as string);
    expect(ev.filter((e) => e.event === 'status').map((e) => e.data.phase)).toEqual(
      expect.arrayContaining(['generating', 'checking', 'rewriting']),
    );
    expect(ev.at(-1)).toEqual({ event: 'done', data: { level: 1, content: CLEAN, cached: false, blocked: true } });
    expect(llm.calls()).toBe(2);

    const row = await prisma.hint.findFirstOrThrow({ where: { submissionId: sub.id } });
    expect(row).toMatchObject({ content: CLEAN, blocked: true });
  });

  it('falls back to the canned hint when the model keeps leaking', async () => {
    setStreamer(scripted(LEAKY).run);
    const student = await createUser('STUDENT');
    const sub = await wrong(student.user.id);
    const ev = events((await stream(student.auth, sub.id, 1)).body as string);
    expect(ev.at(-1)?.data).toMatchObject({ content: FALLBACK_HINTS[1], blocked: true });
  });

  it('passes a clean answer straight through', async () => {
    setStreamer(scripted(CLEAN).run);
    const student = await createUser('STUDENT');
    const sub = await wrong(student.user.id);
    const ev = events((await stream(student.auth, sub.id, 1)).body as string);
    expect(ev.at(-1)?.data).toMatchObject({ content: CLEAN, blocked: false });
    expect(ev.filter((e) => e.event === 'delta').map((e) => e.data.text).join('')).toBe(CLEAN);
  });
});

describe('daily quota', () => {
  it('stops new generations after HINT_DAILY_LIMIT (3 in tests) but still serves stored hints', async () => {
    setStreamer(scripted(CLEAN).run);
    const student = await createUser('STUDENT');
    const subs = await Promise.all([1, 2, 3, 4].map(() => wrong(student.user.id)));
    for (const s of subs.slice(0, 3)) expect((await stream(student.auth, s.id, 1)).status).toBe(200);

    const over = await stream(student.auth, subs[3]!.id, 1);
    expect(over.status).toBe(429);
    expect(over.body as string).toContain('HINT_QUOTA_EXCEEDED');

    expect((await stream(student.auth, subs[0]!.id, 1)).status).toBe(200); // stored: free
    const state = await request(app).get('/api/hints').query({ submissionId: subs[0]!.id }).set('Authorization', student.auth);
    expect(state.body.quota).toEqual({ used: 3, limit: 3 });
  });
});

describe('shared cache', () => {
  it('reuses a hint for identical resubmitted code without calling the LLM', async () => {
    const llm = scripted(CLEAN);
    setStreamer(llm.run);
    const student = await createUser('STUDENT');
    const code = `print(1)  # same ${Date.now()}`;
    const first = await wrong(student.user.id, code);
    const second = await wrong(student.user.id, code);

    await stream(student.auth, first.id, 1);
    const ev = events((await stream(student.auth, second.id, 1)).body as string);
    expect(ev).toEqual([{ event: 'done', data: { level: 1, content: CLEAN, cached: true, blocked: false } }]);
    expect(llm.calls()).toBe(1);
  });
});

describe('hint penalty', () => {
  it('counts levels opened before the first AC only', async () => {
    setStreamer(scripted(CLEAN).run);
    const student = await createUser('STUDENT');
    const sub = await wrong(student.user.id);
    await stream(student.auth, sub.id, 1);
    await stream(student.auth, sub.id, 2);

    await prisma.submission.create({
      data: { userId: student.user.id, problemId, language: 'python', code: 'print(3)', verdict: 'ACCEPTED', totalCount: 1, passedCount: 1 },
    });
    // A hint after solving does not count.
    const later = await wrong(student.user.id);
    await stream(student.auth, later.id, 1);

    const state = await request(app).get('/api/hints').query({ submissionId: sub.id }).set('Authorization', student.auth);
    expect(state.body.penalty).toEqual({ hintsUsed: 2, multiplier: 0.8, solved: true });
  });
});
