import { z } from 'zod';
import type { Difficulty } from './enums.js';

// ---- Classrooms ----------------------------------------------------------

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export const JOIN_CODE_LENGTH = 6;

export const classroomInputSchema = z.object({
  name: z.string().trim().min(3, 'Tên lớp tối thiểu 3 ký tự').max(100, 'Tên lớp tối đa 100 ký tự'),
});
export type ClassroomInput = z.infer<typeof classroomInputSchema>;

export const joinClassroomSchema = z.object({
  joinCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, 'Mã lớp không hợp lệ')
    .max(12, 'Mã lớp không hợp lệ'),
});
export type JoinClassroomInput = z.infer<typeof joinClassroomSchema>;

export interface ClassroomSummary {
  id: string;
  name: string;
  teacher: { id: string; fullName: string };
  studentCount: number;
  assignmentCount: number;
  /** Only shown to the classroom's teacher and admins. */
  joinCode: string | null;
}

export type AssignmentStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';

export function assignmentStatus(startsAt: Date | string, endsAt: Date | string, now = Date.now()): AssignmentStatus {
  if (now < new Date(startsAt).getTime()) return 'UPCOMING';
  if (now >= new Date(endsAt).getTime()) return 'ENDED';
  return 'ACTIVE';
}

export interface AssignmentSummary {
  id: string;
  classroomId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: AssignmentStatus;
  problemCount: number;
  totalPoints: number;
}

export interface ClassroomMember {
  id: string;
  fullName: string;
  studentCode: string | null;
  email: string;
  joinedAt: string;
}

export interface ClassroomDetail extends ClassroomSummary {
  canManage: boolean;
  assignments: AssignmentSummary[];
  /** Only for the teacher / admins. */
  members: ClassroomMember[] | null;
}

// ---- Assignments ---------------------------------------------------------

export const MAX_ASSIGNMENT_PROBLEMS = 30;

export const assignmentInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Tên bài tập tối thiểu 3 ký tự').max(120, 'Tên bài tập tối đa 120 ký tự'),
    startsAt: z.coerce.date({ invalid_type_error: 'Thời gian bắt đầu không hợp lệ' }),
    endsAt: z.coerce.date({ invalid_type_error: 'Thời gian kết thúc không hợp lệ' }),
    problems: z
      .array(
        z.object({
          problemId: z.string().min(1),
          points: z.coerce.number().int().min(1, 'Điểm tối thiểu là 1').max(1000, 'Điểm tối đa là 1000').default(100),
        }),
      )
      .min(1, 'Chọn ít nhất một bài')
      .max(MAX_ASSIGNMENT_PROBLEMS, `Tối đa ${MAX_ASSIGNMENT_PROBLEMS} bài`),
  })
  .refine((v) => v.endsAt.getTime() > v.startsAt.getTime(), { path: ['endsAt'], message: 'Thời gian kết thúc phải sau thời gian bắt đầu' })
  .refine((v) => new Set(v.problems.map((p) => p.problemId)).size === v.problems.length, {
    path: ['problems'],
    message: 'Một bài chỉ được thêm một lần',
  });
/** JSON payload for creating/updating an assignment (dates as ISO strings). */
export interface AssignmentInput {
  title: string;
  startsAt: string;
  endsAt: string;
  problems: { problemId: string; points?: number }[];
}

export interface AssignmentProblemInfo {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  points: number;
}

export interface AssignmentDetail extends AssignmentSummary {
  classroom: { id: string; name: string };
  problems: AssignmentProblemInfo[];
  canManage: boolean;
  /** The viewer's own leaderboard row (students only). */
  myRow: LeaderboardRow | null;
}

// ---- Leaderboard (CLAUDE.md §8) --------------------------------------------

/** Each judged wrong submission before the first AC adds this many minutes. */
export const WRONG_SUBMISSION_PENALTY_MIN = 5;

export interface LeaderboardCell {
  problemId: string;
  solved: boolean;
  /** Points after the hint penalty (0 when unsolved). */
  score: number;
  /** Judged wrong submissions (before the first AC when solved). */
  wrongAttempts: number;
  /** Minutes from the start to the first AC. */
  acceptedAtMin: number | null;
  /** Hint levels opened before the first AC (all of them while unsolved). */
  hintsUsed: number;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  fullName: string;
  studentCode: string | null;
  totalScore: number;
  /** Σ (minutes to AC + 5 × wrong attempts before it) over solved problems. */
  totalTimeMin: number;
  solvedCount: number;
  cells: LeaderboardCell[];
}

export interface Leaderboard {
  assignmentId: string;
  problems: AssignmentProblemInfo[];
  rows: LeaderboardRow[];
  updatedAt: string;
}
