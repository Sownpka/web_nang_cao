import { prisma } from '@judgehint/db';
import {
  FINAL_VERDICTS,
  SCORE_BUCKETS,
  type AssignmentReport,
  type ReportProblemStats,
  type ReportStudentRow,
  type Verdict,
} from '@judgehint/shared';
import { toCsv, type CsvValue } from '../../lib/csv.js';
import { HttpError } from '../../lib/httpError.js';
import { requireClassroomManager, toAssignmentSummary } from '../classrooms/classrooms.service.js';
import { computeLeaderboard } from '../leaderboard/leaderboard.service.js';
import type { Actor } from '../problems/problems.service.js';

const FINAL: ReadonlySet<Verdict> = new Set(FINAL_VERDICTS);

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : round1((s[mid - 1]! + s[mid]!) / 2);
}

/** Splits [0, total] into equal buckets; a perfect score lands in the last one. */
function scoreBuckets(scores: number[], total: number): AssignmentReport['scoreBuckets'] {
  const buckets = Array.from({ length: SCORE_BUCKETS }, (_, i) => ({
    from: round1((total * i) / SCORE_BUCKETS),
    to: round1((total * (i + 1)) / SCORE_BUCKETS),
    count: 0,
  }));
  for (const score of scores) {
    const i = Math.min(SCORE_BUCKETS - 1, Math.floor((score / total) * SCORE_BUCKETS));
    buckets[i]!.count++;
  }
  return buckets;
}

/** Class report for one assignment (CLAUDE.md §9 `/teacher/assignments/:id/report`). */
export async function getAssignmentReport(id: string, actor: Actor): Promise<AssignmentReport> {
  const a = await prisma.assignment.findUnique({
    where: { id },
    select: { id: true, classroomId: true, title: true, startsAt: true, endsAt: true, problems: { select: { points: true } } },
  });
  if (!a) throw HttpError.notFound('Không tìm thấy bài tập');
  const { classroom } = await requireClassroomManager(a.classroomId, actor);

  // The report must reflect the database right now, so it bypasses the leaderboard cache.
  const board = await computeLeaderboard(id);
  const studentIds = board.rows.map((r) => r.userId);
  const [users, submissions, hints] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, email: true } }),
    // Same window as the leaderboard: only submissions that can count.
    prisma.submission.findMany({
      where: { assignmentId: id, userId: { in: studentIds }, createdAt: { gte: a.startsAt, lt: a.endsAt } },
      select: { userId: true, problemId: true, verdict: true, createdAt: true },
    }),
    prisma.hint.findMany({
      where: { submission: { assignmentId: id, userId: { in: studentIds } } },
      select: { submission: { select: { userId: true, problemId: true } } },
    }),
  ]);
  const emailOf = new Map(users.map((u) => [u.id, u.email]));

  const problems: ReportProblemStats[] = board.problems.map((p) => {
    const subs = submissions.filter((s) => s.problemId === p.id);
    const solved = board.rows.map((r) => r.cells.find((c) => c.problemId === p.id)).filter((c) => c?.solved);
    const verdicts: Partial<Record<Verdict, number>> = {};
    for (const s of subs) if (FINAL.has(s.verdict)) verdicts[s.verdict] = (verdicts[s.verdict] ?? 0) + 1;
    return {
      ...p,
      attemptedCount: new Set(subs.map((s) => s.userId)).size,
      solvedCount: solved.length,
      submissionCount: subs.length,
      avgWrongBeforeAc: mean(solved.map((c) => c!.wrongAttempts)),
      avgAcceptedAtMin: mean(solved.map((c) => c!.acceptedAtMin ?? 0)),
      hintsOpened: hints.filter((h) => h.submission.problemId === p.id).length,
      verdicts,
    };
  });

  const students: ReportStudentRow[] = board.rows.map((r) => {
    const mine = submissions.filter((s) => s.userId === r.userId);
    const last = mine.reduce<Date | null>((max, s) => (!max || s.createdAt > max ? s.createdAt : max), null);
    return {
      rank: r.rank,
      userId: r.userId,
      fullName: r.fullName,
      studentCode: r.studentCode,
      email: emailOf.get(r.userId) ?? '',
      totalScore: r.totalScore,
      solvedCount: r.solvedCount,
      totalTimeMin: r.totalTimeMin,
      submissionCount: mine.length,
      hintsOpened: hints.filter((h) => h.submission.userId === r.userId).length,
      lastSubmissionAt: last?.toISOString() ?? null,
      cells: r.cells,
    };
  });

  const summary = toAssignmentSummary(a);
  const scores = students.map((s) => s.totalScore);
  return {
    assignment: { ...summary, classroom: { id: classroom.id, name: classroom.name } },
    summary: {
      studentCount: students.length,
      participantCount: new Set(submissions.map((s) => s.userId)).size,
      fullSolveCount: students.filter((s) => s.solvedCount === problems.length).length,
      averageScore: mean(scores) ?? 0,
      medianScore: median(scores),
      submissionCount: submissions.length,
      hintsOpened: hints.length,
    },
    scoreBuckets: scoreBuckets(scores, summary.totalPoints),
    problems,
    students,
    generatedAt: new Date().toISOString(),
  };
}

const problemLabel = (i: number) => String.fromCharCode(65 + i);

/** One row per student, one score column per problem — the sheet teachers paste into their grade book. */
export function reportToCsv(report: AssignmentReport): string {
  const header: CsvValue[] = [
    'Hạng',
    'Mã SV',
    'Họ tên',
    'Email',
    ...report.problems.map((p, i) => `${problemLabel(i)}. ${p.title} (${p.points})`),
    `Tổng điểm (${report.assignment.totalPoints})`,
    'Số bài đúng',
    'Thời gian (phút)',
    'Số lần nộp',
    'Số gợi ý đã mở',
  ];
  const rows = report.students.map((s): CsvValue[] => [
    s.rank,
    s.studentCode,
    s.fullName,
    s.email,
    ...report.problems.map((p) => s.cells.find((c) => c.problemId === p.id)?.score ?? 0),
    s.totalScore,
    s.solvedCount,
    s.totalTimeMin,
    s.submissionCount,
    s.hintsOpened,
  ]);
  return toCsv([header, ...rows]);
}
