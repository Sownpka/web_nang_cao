// Mirrors the enums in prisma/schema.prisma. Kept framework-free so the web app can import it.

export const Role = {
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Language = {
  python: 'python',
  javascript: 'javascript',
  cpp: 'cpp',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

export const Verdict = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  ACCEPTED: 'ACCEPTED',
  WRONG_ANSWER: 'WRONG_ANSWER',
  TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  COMPILE_ERROR: 'COMPILE_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Verdicts that mean judging has finished. */
export const FINAL_VERDICTS: readonly Verdict[] = [
  Verdict.ACCEPTED,
  Verdict.WRONG_ANSWER,
  Verdict.TIME_LIMIT_EXCEEDED,
  Verdict.MEMORY_LIMIT_EXCEEDED,
  Verdict.RUNTIME_ERROR,
  Verdict.COMPILE_ERROR,
  Verdict.SYSTEM_ERROR,
];

export const HINT_LEVELS = [1, 2, 3] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];
