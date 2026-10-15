import { Prisma, prisma } from '@judgehint/db';
import {
  HINT_LEVELS,
  type HintBlockReason,
  type HintItem,
  type HintLevel,
  type HintState,
  type SubmissionDetail,
} from '@judgehint/shared';
import { buildHintMessages, LEVEL_MAX_TOKENS, type HintContext } from '../../ai/prompts.js';
import { resolveChatStreamer, type ChatStreamer } from '../../ai/llmClient.js';
import { HttpError } from '../../lib/httpError.js';
import { redis } from '../../lib/redis.js';
import type { Actor } from '../problems/problems.service.js';
import { getSubmission } from '../submissions/submissions.service.js';

const toItem = (h: { level: number; content: string; createdAt: Date }): HintItem => ({
  level: h.level as HintLevel,
  content: h.content,
  createdAt: h.createdAt.toISOString(),
});

function blockReason(s: SubmissionDetail, aiHintsEnabled: boolean, actor: Actor): HintBlockReason | null {
  if (s.user.id !== actor.id) return 'NOT_OWNER';
  if (!aiHintsEnabled) return 'DISABLED';
  if (s.verdict === 'ACCEPTED') return 'ACCEPTED';
  if (s.verdict === 'PENDING' || s.verdict === 'RUNNING') return 'NOT_JUDGED';
  if (s.verdict === 'SYSTEM_ERROR') return 'SYSTEM_ERROR';
  return null;
}

const BLOCK_ERRORS: Record<HintBlockReason, () => HttpError> = {
  NOT_OWNER: () => HttpError.forbidden('Chỉ người nộp bài mới mở được gợi ý'),
  DISABLED: () => new HttpError(403, 'HINTS_DISABLED', 'Giảng viên đã tắt gợi ý AI cho bài này'),
  ACCEPTED: () => HttpError.badRequest('Bài đã đúng, không cần gợi ý'),
  NOT_JUDGED: () => HttpError.conflict('Bài đang được chấm, hãy chờ có kết quả', 'NOT_JUDGED'),
  SYSTEM_ERROR: () => HttpError.conflict('Bài bị lỗi hệ thống khi chấm, hãy nộp lại', 'SYSTEM_ERROR'),
};

/** Loads the submission (visibility rules included) with its problem's hint settings and stored hints. */
async function load(submissionId: string, actor: Actor) {
  // getSubmission applies the access check and hides hidden-test data from students.
  const submission = await getSubmission(submissionId, actor);
  const [problem, hints] = await Promise.all([
    prisma.problem.findUniqueOrThrow({
      where: { id: submission.problem.id },
      select: { title: true, statementMd: true, aiHintsEnabled: true },
    }),
    prisma.hint.findMany({ where: { submissionId }, orderBy: { level: 'asc' } }),
  ]);
  return { submission, problem, hints: hints.map(toItem) };
}

export async function getHintState(submissionId: string, actor: Actor): Promise<HintState> {
  const { submission, problem, hints } = await load(submissionId, actor);
  const blockedReason = blockReason(submission, problem.aiHintsEnabled, actor);
  const next = HINT_LEVELS.find((l) => !hints.some((h) => h.level === l)) ?? null;
  return { submissionId, hints, nextLevel: blockedReason ? null : next, blockedReason };
}

export type PreparedHint = { cached: HintItem } | { context: HintContext };

/** Validates a request for `level` and returns either the stored hint or the prompt context. */
export async function prepareHint(submissionId: string, level: HintLevel, actor: Actor): Promise<PreparedHint> {
  const { submission, problem, hints } = await load(submissionId, actor);
  const reason = blockReason(submission, problem.aiHintsEnabled, actor);
  if (reason) throw BLOCK_ERRORS[reason]();

  const existing = hints.find((h) => h.level === level);
  if (existing) return { cached: existing };
  // Levels open in order: 2 needs 1, 3 needs 2.
  if (level > hints.length + 1) {
    throw HttpError.conflict(`Hãy mở gợi ý mức ${hints.length + 1} trước`, 'LEVEL_LOCKED');
  }

  return {
    context: {
      problemTitle: problem.title,
      statementMd: problem.statementMd,
      language: submission.language,
      code: submission.code,
      verdict: submission.verdict,
      passedCount: submission.passedCount,
      totalCount: submission.totalCount,
      failedTest: submission.failedTest,
      stderr: submission.stderr,
      level,
      previousHints: hints.map(({ level: l, content }) => ({ level: l, content })),
    },
  };
}

let streamer: ChatStreamer | null | undefined;
/** Resolved once so the "mock provider" warning is logged a single time. */
export function getStreamer(): ChatStreamer | null {
  if (streamer === undefined) streamer = resolveChatStreamer();
  return streamer;
}

export function hintMessages(context: HintContext) {
  return { messages: buildHintMessages(context), maxTokens: LEVEL_MAX_TOKENS[context.level] };
}

/** Prevents two tabs from generating the same hint at once. Returns a release function, or null if taken. */
export async function lockHint(submissionId: string, level: HintLevel): Promise<(() => Promise<void>) | null> {
  const key = `hintlock:${submissionId}:${level}`;
  const ok = await redis.set(key, '1', 'EX', 120, 'NX');
  return ok ? async () => void (await redis.del(key)) : null;
}

/** Stores a finished hint; if another request won the race, returns theirs. */
export async function saveHint(submissionId: string, level: HintLevel, content: string): Promise<HintItem> {
  try {
    return toItem(await prisma.hint.create({ data: { submissionId, level, content } }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return toItem(await prisma.hint.findUniqueOrThrow({ where: { submissionId_level: { submissionId, level } } }));
    }
    throw err;
  }
}
