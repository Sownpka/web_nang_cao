import type { Verdict } from './enums.js';

/** Redis pub/sub channel the judge worker publishes progress on. */
export const JUDGE_EVENTS_CHANNEL = 'judge-events';

/** BullMQ queue names. */
export const QUEUE_SUBMISSIONS = 'submissions';
export const QUEUE_HINTS = 'hints';

export interface SubmissionJobData {
  submissionId: string;
}

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

export type JudgeEvent = SubmissionProgressEvent | SubmissionDoneEvent;
