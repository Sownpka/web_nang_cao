import { z } from 'zod';
import { HINT_LEVELS, type HintLevel } from './enums.js';

export const HINT_LEVEL_LABELS: Record<HintLevel, { title: string; description: string }> = {
  1: { title: 'Hướng nghĩ', description: 'Lỗi thuộc loại gì, nên xem lại khía cạnh nào' },
  2: { title: 'Khoanh vùng', description: 'Đoạn code đáng ngờ và trường hợp đầu vào làm sai' },
  3: { title: 'Chỉ dòng', description: 'Dòng nghi ngờ và vì sao sai — vẫn không có code sửa' },
};

/** Share of a problem's points lost per opened hint level (CLAUDE.md §8). */
export const HINT_PENALTY_PER_LEVEL = 0.1;
/** A problem never drops below this share of its points because of hints. */
export const HINT_PENALTY_FLOOR = 0.5;

/** Score multiplier after `hintsUsed` hint levels were opened before the first AC. */
export function hintMultiplier(hintsUsed: number): number {
  return Math.max(HINT_PENALTY_FLOOR, 1 - HINT_PENALTY_PER_LEVEL * Math.max(0, hintsUsed));
}

/** Points for a solved problem after the hint penalty, rounded to whole points. */
export function applyHintPenalty(points: number, hintsUsed: number): number {
  return Math.round(points * hintMultiplier(hintsUsed));
}

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
  /** True when the leak guard replaced the model's first answer. */
  blocked: boolean;
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
  /** Today's AI hint budget of the viewer (null for staff, who are not limited). */
  quota: { used: number; limit: number } | null;
  /** Hint levels the submission's author opened on this problem before the first AC. */
  penalty: { hintsUsed: number; multiplier: number; solved: boolean };
}

export type HintPhase = 'generating' | 'checking' | 'rewriting';

/**
 * Server-sent events on GET /api/hints/stream. The model's answer is checked by the leak guard
 * before any of it is sent, so the client only ever receives approved text:
 * - `status` { phase, chars? }          generation progress while nothing is shown yet
 * - `delta`  { text }                    next chunk of the approved hint
 * - `done`   { level, content, cached, blocked }
 * - `error`  { code, message }
 */
export type HintStreamEvent =
  | { event: 'status'; data: { phase: HintPhase; chars?: number } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { level: HintLevel; content: string; cached: boolean; blocked: boolean } }
  | { event: 'error'; data: { code: string; message: string } };
