import { prisma } from '@judgehint/db';
import {
  applyHintPenalty,
  assignmentRoom,
  WRONG_SUBMISSION_PENALTY_MIN,
  type AssignmentProblemInfo,
  type Leaderboard,
  type LeaderboardCell,
  type LeaderboardRow,
  type Verdict,
} from '@judgehint/shared';
import { HttpError } from '../../lib/httpError.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { getIo } from '../../realtime/ioRegistry.js';

/** Verdicts that cost a penalty: CE and system errors are not the student's mistake (ICPC-style). */
const PENALIZED: ReadonlySet<Verdict> = new Set(['WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR']);

const dataKey = (id: string) => `lb:${id}:data`;
const zsetKey = (id: string) => `lb:${id}`;
const CACHE_TTL_SEC = 24 * 3600;

const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));

/** Builds the leaderboard from the database (CLAUDE.md §8). */
export async function computeLeaderboard(assignmentId: string): Promise<Leaderboard> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      problems: {
        orderBy: { order: 'asc' },
        select: { points: true, problem: { select: { id: true, slug: true, title: true, difficulty: true } } },
      },
      classroom: {
        select: { enrollments: { select: { user: { select: { id: true, fullName: true, studentCode: true } } } } },
      },
    },
  });
  if (!assignment) throw HttpError.notFound('Không tìm thấy bài tập');

  const problems: AssignmentProblemInfo[] = assignment.problems.map((p) => ({ ...p.problem, points: p.points }));
  const students = assignment.classroom.enrollments.map((e) => e.user);
  const studentIds = students.map((s) => s.id);

  // Only submissions made for this assignment, inside its window, count.
  const [submissions, hints] = await Promise.all([
    prisma.submission.findMany({
      where: {
        assignmentId,
        userId: { in: studentIds },
        createdAt: { gte: assignment.startsAt, lt: assignment.endsAt },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, problemId: true, verdict: true, createdAt: true },
    }),
    prisma.hint.findMany({
      where: { submission: { assignmentId, userId: { in: studentIds } } },
      select: { createdAt: true, submission: { select: { userId: true, problemId: true } } },
    }),
  ]);

  const key = (userId: string, problemId: string) => `${userId}:${problemId}`;
  const subsBy = new Map<string, typeof submissions>();
  for (const s of submissions) {
    const k = key(s.userId, s.problemId);
    subsBy.set(k, [...(subsBy.get(k) ?? []), s]);
  }
  const hintsBy = new Map<string, Date[]>();
  for (const h of hints) {
    const k = key(h.submission.userId, h.submission.problemId);
    hintsBy.set(k, [...(hintsBy.get(k) ?? []), h.createdAt]);
  }

  const rows: Omit<LeaderboardRow, 'rank'>[] = students.map((student) => {
    let totalScore = 0;
    let totalTimeMin = 0;
    let solvedCount = 0;
    const cells: LeaderboardCell[] = problems.map((p) => {
      const subs = subsBy.get(key(student.id, p.id)) ?? [];
      const firstAc = subs.find((s) => s.verdict === 'ACCEPTED');
      const cutoff = firstAc?.createdAt;
      const wrongAttempts = subs.filter((s) => PENALIZED.has(s.verdict) && (!cutoff || s.createdAt < cutoff)).length;
      const hintsUsed = (hintsBy.get(key(student.id, p.id)) ?? []).filter((d) => !cutoff || d < cutoff).length;
      if (!firstAc) {
        return { problemId: p.id, solved: false, score: 0, wrongAttempts, acceptedAtMin: null, hintsUsed };
      }
      const acceptedAtMin = minutesBetween(assignment.startsAt, firstAc.createdAt);
      const score = applyHintPenalty(p.points, hintsUsed);
      totalScore += score;
      totalTimeMin += acceptedAtMin + WRONG_SUBMISSION_PENALTY_MIN * wrongAttempts;
      solvedCount++;
      return { problemId: p.id, solved: true, score, wrongAttempts, acceptedAtMin, hintsUsed };
    });
    return { userId: student.id, fullName: student.fullName, studentCode: student.studentCode, totalScore, totalTimeMin, solvedCount, cells };
  });

  rows.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      a.totalTimeMin - b.totalTimeMin ||
      (a.studentCode ?? a.fullName).localeCompare(b.studentCode ?? b.fullName),
  );
  // Equal score and time share a rank (1, 1, 3, …).
  const ranked: LeaderboardRow[] = [];
  rows.forEach((r, i) => {
    const prev = ranked[i - 1];
    const tie = !!prev && prev.totalScore === r.totalScore && prev.totalTimeMin === r.totalTimeMin;
    ranked.push({ ...r, rank: tie ? prev.rank : i + 1 });
  });

  return { assignmentId, problems, rows: ranked, updatedAt: new Date().toISOString() };
}

async function store(board: Leaderboard): Promise<void> {
  const multi = redis.multi().set(dataKey(board.assignmentId), JSON.stringify(board), 'EX', CACHE_TTL_SEC).del(zsetKey(board.assignmentId));
  // Sorted set per CLAUDE.md: higher member score = better (points first, then less time).
  for (const r of board.rows) multi.zadd(zsetKey(board.assignmentId), r.totalScore * 1e6 - Math.min(r.totalTimeMin, 999_999), r.userId);
  multi.expire(zsetKey(board.assignmentId), CACHE_TTL_SEC);
  await multi.exec();
}

/** Cached leaderboard, computed on a miss. */
export async function getLeaderboard(assignmentId: string): Promise<Leaderboard> {
  const cached = await redis.get(dataKey(assignmentId));
  if (cached) return JSON.parse(cached) as Leaderboard;
  const board = await computeLeaderboard(assignmentId);
  await store(board);
  return board;
}

/** Recomputes, caches and pushes the leaderboard to everyone watching the assignment. */
export async function refreshLeaderboard(assignmentId: string): Promise<Leaderboard | null> {
  try {
    const board = await computeLeaderboard(assignmentId);
    await store(board);
    getIo()?.to(assignmentRoom(assignmentId)).emit('leaderboard:update', board);
    return board;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      await redis.del(dataKey(assignmentId), zsetKey(assignmentId));
      return null;
    }
    throw err;
  }
}

const pending = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 300;

/** Coalesces bursts (several ACs at once) into one recomputation per assignment. */
export function scheduleLeaderboardRefresh(assignmentId: string): void {
  clearTimeout(pending.get(assignmentId));
  pending.set(
    assignmentId,
    setTimeout(() => {
      pending.delete(assignmentId);
      refreshLeaderboard(assignmentId).catch((err: Error) => logger.error({ assignmentId, err: err.message }, 'leaderboard refresh failed'));
    }, DEBOUNCE_MS),
  );
}

/** Roster changes affect every assignment of the classroom. */
export async function refreshLeaderboardsOfClassroom(classroomId: string): Promise<void> {
  const assignments = await prisma.assignment.findMany({ where: { classroomId }, select: { id: true } });
  await Promise.all(assignments.map((a) => refreshLeaderboard(a.id)));
}
