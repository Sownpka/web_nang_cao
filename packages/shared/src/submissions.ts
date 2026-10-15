import { z } from 'zod';
import type { Language, Verdict } from './enums.js';

export const VERDICT_LABELS: Record<Verdict, string> = {
  PENDING: 'Đang chờ',
  RUNNING: 'Đang chấm',
  ACCEPTED: 'Chấp nhận',
  WRONG_ANSWER: 'Sai kết quả',
  TIME_LIMIT_EXCEEDED: 'Quá thời gian',
  MEMORY_LIMIT_EXCEEDED: 'Quá bộ nhớ',
  RUNTIME_ERROR: 'Lỗi khi chạy',
  COMPILE_ERROR: 'Lỗi biên dịch',
  SYSTEM_ERROR: 'Lỗi hệ thống',
};

export const VERDICT_SHORT: Record<Verdict, string> = {
  PENDING: '…',
  RUNNING: '…',
  ACCEPTED: 'AC',
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILE_ERROR: 'CE',
  SYSTEM_ERROR: 'SE',
};

export const submissionListQuerySchema = z.object({
  problemId: z.string().min(1).optional(),
  mine: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SubmissionListQuery = z.input<typeof submissionListQuerySchema>;

export interface SubmissionListItem {
  id: string;
  problem: { id: string; slug: string; title: string };
  user: { id: string; fullName: string; studentCode: string | null };
  language: Language;
  verdict: Verdict;
  passedCount: number;
  totalCount: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  createdAt: string;
}

/** Where judging stopped. Contents are only included for public tests. */
export interface FailedTestInfo {
  /** 1-based number shown to users. */
  number: number;
  isHidden: boolean;
  input?: string;
  expected?: string;
  actual?: string;
}

export interface SubmissionDetail extends SubmissionListItem {
  code: string;
  stderr: string | null;
  failedTest: FailedTestInfo | null;
  judgedAt: string | null;
}

export interface CreateSubmissionResponse {
  submissionId: string;
}
