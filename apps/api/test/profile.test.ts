// Personal statistics behind the profile page.
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import { PROFILE_TIMELINE_DAYS, type UserStats, type Verdict } from '@judgehint/shared';
import { createApp } from '../src/app.js';
import { getUserStats, localDay } from '../src/modules/users/users.service.js';
import { createUser } from './helpers.js';

const app = createApp();
// 2026-09-10 12:00 in Vietnam (UTC+7).
const NOW = new Date('2026-09-10T05:00:00Z');
const daysAgo = (d: number, hourUtc = 5) => new Date(Date.UTC(2026, 8, 10 - d, hourUtc));

let student: Awaited<ReturnType<typeof createUser>>;
let easy: string;
let medium: string;
let hard: string;

beforeAll(async () => {
  const teacher = await createUser('TEACHER');
  student = await createUser('STUDENT');
  const mk = (slug: string, difficulty: 'EASY' | 'MEDIUM' | 'HARD') =>
    prisma.problem.create({
      data: { slug: `${slug}-${Date.now()}`, title: slug, statementMd: 'Đề.', difficulty, allowedLanguages: ['python'], authorId: teacher.user.id },
    });
  easy = (await mk('pf-easy', 'EASY')).id;
  medium = (await mk('pf-medium', 'MEDIUM')).id;
  hard = (await mk('pf-hard', 'HARD')).id;

  const sub = (problemId: string, verdict: Verdict, createdAt: Date, language: 'python' | 'javascript' = 'python') =>
    prisma.submission.create({ data: { userId: student.user.id, problemId, language, code: 'x', verdict, createdAt } });

  // Solved long before the timeline window: counts in the starting cumulative total.
  await sub(easy, 'ACCEPTED', daysAgo(200));
  // medium: WA, then AC 3 days ago, then a second AC that must not count twice.
  await sub(medium, 'WRONG_ANSWER', daysAgo(3));
  const wa = await sub(medium, 'WRONG_ANSWER', daysAgo(3, 6));
  await prisma.hint.create({ data: { submissionId: wa.id, level: 1, content: 'h' } });
  await sub(medium, 'ACCEPTED', daysAgo(3, 7), 'javascript');
  await sub(medium, 'ACCEPTED', daysAgo(1));
  // hard: attempted, never solved; one still pending is not "judged".
  await sub(hard, 'TIME_LIMIT_EXCEEDED', daysAgo(0));
  await sub(hard, 'PENDING', daysAgo(0));
  // 23:30 in Vietnam on the 8th is 16:30 UTC — it belongs to the 8th locally, not the 9th.
  await sub(hard, 'RUNTIME_ERROR', new Date('2026-09-08T16:30:00Z'));
});

describe('getUserStats', () => {
  it('totals submissions, solved problems and acceptance rate', async () => {
    const stats = await getUserStats(student.user.id, NOW);
    expect(stats.totals).toEqual({
      submissions: 8,
      acceptedSubmissions: 3,
      solvedProblems: 2,
      attemptedProblems: 3,
      hintsOpened: 1,
      acceptanceRate: 3 / 7,
    });
    expect(stats.languages).toEqual([
      { language: 'python', count: 7 },
      { language: 'javascript', count: 1 },
    ]);
    expect(stats.verdicts).toEqual([
      { verdict: 'ACCEPTED', count: 3 },
      { verdict: 'WRONG_ANSWER', count: 2 },
      { verdict: 'TIME_LIMIT_EXCEEDED', count: 1 },
      { verdict: 'RUNTIME_ERROR', count: 1 },
    ]);
  });

  it('counts solved problems per difficulty against the whole problem set', async () => {
    const stats = await getUserStats(student.user.id, NOW);
    const byDiff = Object.fromEntries(stats.byDifficulty.map((d) => [d.difficulty, d]));
    expect(byDiff.EASY!.solved).toBe(1);
    expect(byDiff.MEDIUM!.solved).toBe(1);
    expect(byDiff.HARD!.solved).toBe(0);
    expect(byDiff.HARD!.total).toBeGreaterThanOrEqual(1);
  });

  it('builds a local-time daily timeline with a running solved total', async () => {
    const { timeline } = await getUserStats(student.user.id, NOW);
    expect(timeline).toHaveLength(PROFILE_TIMELINE_DAYS);
    expect(timeline.at(-1)!.date).toBe('2026-09-10');
    expect(timeline[0]!.cumulativeSolved).toBe(1); // the old easy AC
    const day = (date: string) => timeline.find((p) => p.date === date)!;
    expect(day('2026-09-07')).toEqual({ date: '2026-09-07', submissions: 3, solved: 1, cumulativeSolved: 2 });
    expect(day('2026-09-08')).toMatchObject({ submissions: 1, solved: 0 });
    expect(day('2026-09-09')).toMatchObject({ submissions: 1, solved: 0, cumulativeSolved: 2 });
    expect(day('2026-09-10')).toMatchObject({ submissions: 2, cumulativeSolved: 2 });
    expect(localDay(new Date('2026-09-08T17:30:00Z'))).toBe('2026-09-09');
  });

  it('lists recent first solves, newest first', async () => {
    const { recentSolved } = await getUserStats(student.user.id, NOW);
    expect(recentSolved.map((r) => r.problemId)).toEqual([medium, easy]);
    expect(recentSolved[0]!.solvedAt).toBe(daysAgo(3, 7).toISOString());
  });
});

describe('GET /me/stats', () => {
  it('returns the caller’s own stats', async () => {
    const res = await request(app).get('/api/me/stats').set('Authorization', student.auth);
    expect(res.status).toBe(200);
    expect((res.body as UserStats).totals.solvedProblems).toBe(2);
    expect((await request(app).get('/api/me/stats')).status).toBe(401);
  });
});
