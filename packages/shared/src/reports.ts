import { z } from 'zod';
import type { AssignmentProblemInfo, AssignmentSummary, LeaderboardCell } from './classrooms.js';
import type { Difficulty, Language, Verdict } from './enums.js';

// ---- Teacher assignment report ---------------------------------------------

export const reportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

/** Number of score-distribution buckets (each covers 10% of the total points). */
export const SCORE_BUCKETS = 10;

export interface ReportProblemStats extends AssignmentProblemInfo {
  /** Students with at least one counted submission on the problem. */
  attemptedCount: number;
  solvedCount: number;
  submissionCount: number;
  /** Mean wrong attempts before the first AC, over students who solved it. */
  avgWrongBeforeAc: number | null;
  /** Mean minutes from the start to the first AC, over students who solved it. */
  avgAcceptedAtMin: number | null;
  hintsOpened: number;
  /** Final verdicts of every counted submission. */
  verdicts: Partial<Record<Verdict, number>>;
}

export interface ReportStudentRow {
  rank: number;
  userId: string;
  fullName: string;
  studentCode: string | null;
  email: string;
  totalScore: number;
  solvedCount: number;
  totalTimeMin: number;
  submissionCount: number;
  hintsOpened: number;
  lastSubmissionAt: string | null;
  cells: LeaderboardCell[];
}

export interface AssignmentReport {
  assignment: AssignmentSummary & { classroom: { id: string; name: string } };
  summary: {
    studentCount: number;
    /** Students with at least one counted submission. */
    participantCount: number;
    /** Students who solved every problem. */
    fullSolveCount: number;
    averageScore: number;
    medianScore: number;
    submissionCount: number;
    hintsOpened: number;
  };
  /** `count` students scored in [from, to) — the last bucket includes the maximum. */
  scoreBuckets: { from: number; to: number; count: number }[];
  problems: ReportProblemStats[];
  students: ReportStudentRow[];
  generatedAt: string;
}

// ---- Personal profile statistics -------------------------------------------

/** Days of history in the profile timeline. */
export const PROFILE_TIMELINE_DAYS = 90;

export interface ProfileTimelinePoint {
  /** Local calendar day (Asia/Ho_Chi_Minh), `YYYY-MM-DD`. */
  date: string;
  submissions: number;
  /** Problems solved for the first time that day. */
  solved: number;
  /** Distinct problems solved up to and including that day. */
  cumulativeSolved: number;
}

export interface UserStats {
  totals: {
    submissions: number;
    acceptedSubmissions: number;
    solvedProblems: number;
    attemptedProblems: number;
    hintsOpened: number;
    /** Accepted / judged submissions, 0..1 (null before any judged submission). */
    acceptanceRate: number | null;
  };
  byDifficulty: { difficulty: Difficulty; solved: number; total: number }[];
  verdicts: { verdict: Verdict; count: number }[];
  languages: { language: Language; count: number }[];
  timeline: ProfileTimelinePoint[];
  recentSolved: { problemId: string; slug: string; title: string; difficulty: Difficulty; solvedAt: string }[];
}
