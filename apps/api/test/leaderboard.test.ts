// Leaderboard rules from CLAUDE.md §8, with fixed timestamps.
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import type { Verdict } from '@judgehint/shared';
import { computeLeaderboard } from '../src/modules/leaderboard/leaderboard.service.js';
import { createUser } from './helpers.js';

const START = new Date('2026-09-01T08:00:00Z');
const END = new Date('2026-09-01T10:00:00Z');
const at = (min: number) => new Date(START.getTime() + min * 60_000);

let assignmentId: string;
let p1: string;
let p2: string;
const users: Record<string, string> = {};

async function submit(user: string, problemId: string, verdict: Verdict, minute: number, opts: { assignment?: boolean } = {}) {
  return prisma.submission.create({
    data: {
      userId: users[user]!,
      problemId,
      assignmentId: opts.assignment === false ? null : assignmentId,
      language: 'python',
      code: 'x',
      verdict,
      createdAt: at(minute),
    },
  });
}

beforeAll(async () => {
  const teacher = await createUser('TEACHER');
  const mk = (slug: string) =>
    prisma.problem.create({
      data: { slug: `${slug}-${Date.now()}`, title: slug, statementMd: 'Đề.', difficulty: 'EASY', allowedLanguages: ['python'], authorId: teacher.user.id },
    });
  p1 = (await mk('lb-p1')).id;
  p2 = (await mk('lb-p2')).id;

  for (const name of ['an', 'binh', 'chau', 'dung', 'em']) users[name] = (await createUser('STUDENT')).user.id;
  const classroom = await prisma.classroom.create({
    data: {
      name: 'Lớp xếp hạng',
      joinCode: `L${Date.now()}`.slice(0, 12),
      teacherId: teacher.user.id,
      enrollments: { create: Object.values(users).map((userId) => ({ userId })) },
    },
  });
  assignmentId = (
    await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        title: 'Xếp hạng',
        startsAt: START,
        endsAt: END,
        problems: { create: [{ problemId: p1, points: 100, order: 0 }, { problemId: p2, points: 200, order: 1 }] },
      },
    })
  ).id;

  // an: p1 WA@10, AC@20 → 100 pts, 20 + 5 = 25 min. p2 WA@25, hint, AC@30 → 180 pts, 30 + 5 = 35 min.
  await submit('an', p1, 'WRONG_ANSWER', 10);
  await submit('an', p1, 'ACCEPTED', 20);
  const anP2 = await submit('an', p2, 'WRONG_ANSWER', 25);
  await prisma.hint.create({ data: { submissionId: anP2.id, level: 1, content: 'h', createdAt: at(26) } });
  await submit('an', p2, 'ACCEPTED', 30);
  // A hint after the AC must not count.
  const late = await submit('an', p2, 'WRONG_ANSWER', 40);
  await prisma.hint.create({ data: { submissionId: late.id, level: 1, content: 'h', createdAt: at(41) } });

  // binh: p1 AC@5, p2 AC@50, no hints → 300 pts, 55 min → first.
  await submit('binh', p1, 'ACCEPTED', 5);
  await submit('binh', p2, 'ACCEPTED', 50);

  // chau: p1 CE then SYSTEM_ERROR (no penalty), AC@15 → 100 pts, 15 min.
  await submit('chau', p1, 'COMPILE_ERROR', 3);
  await submit('chau', p1, 'SYSTEM_ERROR', 4);
  await submit('chau', p1, 'ACCEPTED', 15);

  // dung: AC@15 directly → 100 pts, 15 min → tied with chau.
  await submit('dung', p1, 'ACCEPTED', 15);

  // em: AC after the deadline and a practice AC outside the assignment → nothing counts.
  await submit('em', p1, 'ACCEPTED', 130);
  await submit('em', p2, 'ACCEPTED', 10, { assignment: false });
  await submit('em', p2, 'WRONG_ANSWER', 12);
});

describe('computeLeaderboard', () => {
  it('ranks by score desc, then time asc, sharing ranks on ties', async () => {
    const board = await computeLeaderboard(assignmentId);
    const summary = board.rows.map((r) => [r.userId, r.rank, r.totalScore, r.totalTimeMin]);
    expect(summary).toEqual([
      [users.binh, 1, 300, 55],
      [users.an, 2, 280, 60],
      [users.chau, 3, 100, 15],
      [users.dung, 3, 100, 15],
      [users.em, 5, 0, 0],
    ]);
  });

  it('applies wrong-attempt penalty and hint penalty per problem', async () => {
    const board = await computeLeaderboard(assignmentId);
    const an = board.rows.find((r) => r.userId === users.an)!;
    expect(an.cells).toEqual([
      { problemId: p1, solved: true, score: 100, wrongAttempts: 1, acceptedAtMin: 20, hintsUsed: 0 },
      { problemId: p2, solved: true, score: 180, wrongAttempts: 1, acceptedAtMin: 30, hintsUsed: 1 },
    ]);
  });

  it('ignores compile/system errors, late ACs and submissions outside the assignment', async () => {
    const board = await computeLeaderboard(assignmentId);
    expect(board.rows.find((r) => r.userId === users.chau)!.cells[0]).toMatchObject({ wrongAttempts: 0, score: 100 });
    const em = board.rows.find((r) => r.userId === users.em)!;
    expect(em.solvedCount).toBe(0);
    expect(em.cells[1]).toMatchObject({ solved: false, wrongAttempts: 1 });
  });

  it('lists problems in assignment order with their points', async () => {
    const board = await computeLeaderboard(assignmentId);
    expect(board.problems.map((p) => [p.id, p.points])).toEqual([
      [p1, 100],
      [p2, 200],
    ]);
  });
});
