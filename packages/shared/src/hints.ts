import { z } from 'zod';
import { HINT_LEVELS, type HintLevel } from './enums.js';

export const HINT_LEVEL_LABELS: Record<HintLevel, { title: string; description: string }> = {
  1: { title: 'Hướng nghĩ', description: 'Lỗi thuộc loại gì, nên xem lại khía cạnh nào' },
  2: { title: 'Khoanh vùng', description: 'Đoạn code đáng ngờ và trường hợp đầu vào làm sai' },
  3: { title: 'Chỉ dòng', description: 'Dòng nghi ngờ và vì sao sai — vẫn không có code sửa' },
};

/** Share of a problem's points lost per opened hint level (see CLAUDE.md §8). */
export const HINT_PENALTY_PER_LEVEL = 0.1;

export const hintLevelSchema = z.coerce
  .number()
  .int()
  .refine((n): n is HintLevel => (HINT_LEVELS as readonly number[]).includes(n), 'Mức gợi ý phải là 1, 2 hoặc 3');

export const hintStreamQuerySchema = z.object({
  submissionId: z.string().min(1),
  level: hintLevelSchema,
});

export interface HintItem {
  level: HintLevel;
  content: string;
  createdAt: string;
}

/** Why hints cannot be opened for a submission (null when they can). */
export type HintBlockReason = 'DISABLED' | 'ACCEPTED' | 'NOT_JUDGED' | 'SYSTEM_ERROR' | 'NOT_OWNER';

export interface HintState {
  submissionId: string;
  hints: HintItem[];
  /** Next level that may be opened, or null when all three are open or hints are blocked. */
  nextLevel: HintLevel | null;
  blockedReason: HintBlockReason | null;
}

/**
 * Server-sent events on GET /api/hints/stream:
 * - `delta`   { text }                 next chunk of the hint
 * - `replace` { content }              the streamed text was rejected; show this instead (leak guard)
 * - `done`    { level, content, cached } final, stored hint
 * - `error`   { code, message }
 */
export type HintStreamEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'replace'; data: { content: string } }
  | { event: 'done'; data: { level: HintLevel; content: string; cached: boolean } }
  | { event: 'error'; data: { code: string; message: string } };
