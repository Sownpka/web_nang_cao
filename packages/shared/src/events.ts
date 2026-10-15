import type { Language, Verdict } from './enums.js';

/** Redis pub/sub channel the judge worker publishes progress on. */
export const JUDGE_EVENTS_CHANNEL = 'judge-events';

/** BullMQ queue names. */
export const QUEUE_SUBMISSIONS = 'submissions';
export const QUEUE_RUNS = 'runs';
export const QUEUE_HINTS = 'hints';

/** Redis key holding a sample run's result (runs are never stored in Postgres). */
export const runResultKey = (runId: string) => `run:${runId}`;
export const RUN_RESULT_TTL_SEC = 15 * 60;

export interface SubmissionJobData {
  submissionId: string;
}

export interface RunJobData {
  runId: string;
  userId: string;
  problemId: string;
  language: Language;
  code: string;
  customInput?: string;
}

// ---- Sample runs ("Chạy thử") ---------------------------------------------

export interface RunCaseResult {
  /** 'sample' = public test of the problem, 'custom' = stdin typed by the student. */
  kind: 'sample' | 'custom';
  /** 1-based number among cases of the same kind. */
  number: number;
  input: string;
  /** null for custom input: there is nothing to compare against. */
  expected: string | null;
  actual: string;
  stderr: string | null;
  /** For custom input ACCEPTED only means "ran without error". */
  verdict: Verdict;
  runtimeMs: number | null;
}

export type RunStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR';

export interface RunResult {
  runId: string;
  problemId: string;
  status: RunStatus;
  total: number;
  cases: RunCaseResult[];
  error?: string;
}

// ---- Events published by the worker on JUDGE_EVENTS_CHANNEL -----------------

export interface SubmissionProgressEvent {
  type: 'progress';
  submissionId: string;
  userId: string;
  testIndex: number;
  total: number;
  status: Verdict;
}

export interface SubmissionDoneEvent {
  type: 'done';
  submissionId: string;
  userId: string;
  assignmentId: string | null;
  verdict: Verdict;
  passedCount: number;
  totalCount: number;
  runtimeMs: number | null;
  memoryKb: number | null;
}

export interface RunProgressEvent {
  type: 'run-progress';
  runId: string;
  userId: string;
  testIndex: number;
  total: number;
}

export interface RunDoneEvent {
  type: 'run-done';
  userId: string;
  result: RunResult;
}

export type JudgeEvent = SubmissionProgressEvent | SubmissionDoneEvent | RunProgressEvent | RunDoneEvent;

// ---- Socket.IO contract ---------------------------------------------------

export type SubmissionProgressPayload = Omit<SubmissionProgressEvent, 'type' | 'userId'>;
export type SubmissionDonePayload = Omit<SubmissionDoneEvent, 'type' | 'userId'>;
export type RunProgressPayload = Omit<RunProgressEvent, 'type' | 'userId'>;

export interface ServerToClientEvents {
  'submission:progress': (p: SubmissionProgressPayload) => void;
  'submission:done': (p: SubmissionDonePayload) => void;
  'run:progress': (p: RunProgressPayload) => void;
  'run:done': (p: RunResult) => void;
  'leaderboard:update': (p: { assignmentId: string; rows: unknown[] }) => void;
}

export type AckResponse = { ok: true } | { ok: false; error: string };

export interface ClientToServerEvents {
  'join:assignment': (p: { assignmentId: string }, ack?: (res: AckResponse) => void) => void;
  'leave:assignment': (p: { assignmentId: string }) => void;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const assignmentRoom = (assignmentId: string) => `assignment:${assignmentId}`;
