import { prisma } from '@judgehint/db';
import {
  Difficulty,
  FINAL_VERDICTS,
  PROFILE_TIMELINE_DAYS,
  type AuthUser,
  type Language,
  type ProfileTimelinePoint,
  type UserStats,
  type Verdict,
} from '@judgehint/shared';
import { HttpError } from '../../lib/httpError.js';
import { toAuthUser } from '../auth/auth.service.js';

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.unauthorized('Tài khoản không còn tồn tại', 'ACCOUNT_GONE');
  return toAuthUser(user);
}

// Students and the class live in Vietnam; days are bucketed in local time, not UTC.
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
export const localDay = (d: Date) => dayFormat.format(d);

const DAY_MS = 24 * 3600 * 1000;
const RECENT_SOLVED = 8;

/** Personal statistics for the profile page (CLAUDE.md §10.6). */
export async function getUserStats(userId: string, now = new Date()): Promise<UserStats> {
  const [submissions, hintsOpened, problemTotals] = await Promise.all([
    prisma.submission.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { problemId: true, verdict: true, language: true, createdAt: true },
    }),
    prisma.hint.count({ where: { submission: { userId } } }),
    prisma.problem.groupBy({ by: ['difficulty'], _count: { _all: true } }),
  ]);

  // First AC per problem, in chronological order.
  const firstAc = new Map<string, Date>();
  const verdictCounts = new Map<Verdict, number>();
  const languageCounts = new Map<Language, number>();
  for (const s of submissions) {
    if (s.verdict === 'ACCEPTED' && !firstAc.has(s.problemId)) firstAc.set(s.problemId, s.createdAt);
    verdictCounts.set(s.verdict, (verdictCounts.get(s.verdict) ?? 0) + 1);
    languageCounts.set(s.language, (languageCounts.get(s.language) ?? 0) + 1);
  }

  const solvedProblems = await prisma.problem.findMany({
    where: { id: { in: [...firstAc.keys()] } },
    select: { id: true, slug: true, title: true, difficulty: true },
  });
  const problemById = new Map(solvedProblems.map((p) => [p.id, p]));

  // Timeline: the last N local days, ending today.
  const days: string[] = [];
  for (let i = PROFILE_TIMELINE_DAYS - 1; i >= 0; i--) days.push(localDay(new Date(now.getTime() - i * DAY_MS)));
  const firstDay = days[0]!;
  const subsPerDay = new Map<string, number>();
  for (const s of submissions) {
    const d = localDay(s.createdAt);
    subsPerDay.set(d, (subsPerDay.get(d) ?? 0) + 1);
  }
  const solvesPerDay = new Map<string, number>();
  let solvedBefore = 0;
  for (const at of firstAc.values()) {
    const d = localDay(at);
    if (d < firstDay) solvedBefore++;
    else solvesPerDay.set(d, (solvesPerDay.get(d) ?? 0) + 1);
  }
  let cumulative = solvedBefore;
  const timeline: ProfileTimelinePoint[] = days.map((date) => {
    const solved = solvesPerDay.get(date) ?? 0;
    cumulative += solved;
    return { date, submissions: subsPerDay.get(date) ?? 0, solved, cumulativeSolved: cumulative };
  });

  const judged = FINAL_VERDICTS.reduce((n, v) => n + (verdictCounts.get(v) ?? 0), 0);
  const accepted = verdictCounts.get('ACCEPTED') ?? 0;
  const totalBy = new Map(problemTotals.map((g) => [g.difficulty, g._count._all]));

  return {
    totals: {
      submissions: submissions.length,
      acceptedSubmissions: accepted,
      solvedProblems: firstAc.size,
      attemptedProblems: new Set(submissions.map((s) => s.problemId)).size,
      hintsOpened,
      acceptanceRate: judged ? accepted / judged : null,
    },
    byDifficulty: Object.values(Difficulty).map((difficulty) => ({
      difficulty,
      solved: solvedProblems.filter((p) => p.difficulty === difficulty).length,
      total: totalBy.get(difficulty) ?? 0,
    })),
    verdicts: FINAL_VERDICTS.map((verdict) => ({ verdict, count: verdictCounts.get(verdict) ?? 0 })).filter((v) => v.count > 0),
    languages: [...languageCounts].map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count),
    timeline,
    recentSolved: [...firstAc]
      .reverse()
      .slice(0, RECENT_SOLVED)
      .flatMap(([problemId, at]) => {
        const p = problemById.get(problemId);
        return p ? [{ problemId, slug: p.slug, title: p.title, difficulty: p.difficulty, solvedAt: at.toISOString() }] : [];
      }),
  };
}
