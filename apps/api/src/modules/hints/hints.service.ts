import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@judgehint/db';
import {
  HINT_LEVELS,
  type HintBlockReason,
  type HintItem,
  type HintLevel,
  type HintPhase,
  type HintState,
  type SubmissionDetail,
} from '@judgehint/shared';
import { checkHint, FALLBACK_HINTS } from '../../ai/leak-guard.js';
import { resolveChatStreamer, type ChatMessage, type ChatStreamer } from '../../ai/llmClient.js';
import { buildHintMessages, LEVEL_MAX_TOKENS, type HintContext } from '../../ai/prompts.js';
import { env } from '../../config.js';
import { HttpError } from '../../lib/httpError.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import type { Actor } from '../problems/problems.service.js';
import { hintPenaltyFor } from '../scoring/scoring.service.js';
import { getSubmission } from '../submissions/submissions.service.js';

const isStaff = (actor: Actor) => actor.role === 'TEACHER' || actor.role === 'ADMIN';

const toItem = (h: { level: number; content: string; blocked: boolean; createdAt: Date }): HintItem => ({
  level: h.level as HintLevel,
  content: h.content,
  blocked: h.blocked,
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

// ---- Daily quota (CLAUDE.md §6: HINT_DAILY_LIMIT per student per day) -------------------------

const dayInVietnam = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const quotaKey = (userId: string) => `hintquota:${userId}:${dayInVietnam()}`;

export async function hintsUsedToday(userId: string): Promise<number> {
  return Number((await redis.get(quotaKey(userId))) ?? 0);
}

/** Only fresh LLM generations count; reopening a stored or cached hint is free. */
async function consumeQuota(userId: string): Promise<void> {
  const key = quotaKey(userId);
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 36 * 3600);
}

// ---- Loading & state --------------------------------------------------------------------------

/** Loads the submission (visibility rules included) with its problem's hint settings and stored hints. */
async function load(submissionId: string, actor: Actor) {
  // getSubmission applies the access check and hides hidden-test data from students.
  const submission = await getSubmission(submissionId, actor);
  const [problem, hints] = await Promise.all([
    prisma.problem.findUniqueOrThrow({
      where: { id: submission.problem.id },
      select: { title: true, statementMd: true, aiHintsEnabled: true, referenceSolution: true },
    }),
    prisma.hint.findMany({ where: { submissionId }, orderBy: { level: 'asc' } }),
  ]);
  return { submission, problem, hints: hints.map(toItem) };
}

export async function getHintState(submissionId: string, actor: Actor): Promise<HintState> {
  const { submission, problem, hints } = await load(submissionId, actor);
  const blockedReason = blockReason(submission, problem.aiHintsEnabled, actor);
  const next = HINT_LEVELS.find((l) => !hints.some((h) => h.level === l)) ?? null;
  const limited = !isStaff(actor) && submission.user.id === actor.id;
  return {
    submissionId,
    hints,
    nextLevel: blockedReason ? null : next,
    blockedReason,
    quota: limited ? { used: await hintsUsedToday(actor.id), limit: env.HINT_DAILY_LIMIT } : null,
    penalty: await hintPenaltyFor(submission.user.id, submission.problem.id),
  };
}

// ---- Preparing a request ----------------------------------------------------------------------

export interface GuardMaterial {
  studentCode: string;
  referenceSolution: string | null;
}

export type PreparedHint =
  | { kind: 'stored'; hint: HintItem }
  | { kind: 'generate'; context: HintContext; guard: GuardMaterial; cacheKey: string };

/** Same submission content + level + earlier hints ⇒ same hint, even across submissions. */
function sharedCacheKey(problemId: string, ctx: HintContext): string {
  const material = JSON.stringify([
    problemId,
    ctx.language,
    ctx.code,
    ctx.verdict,
    ctx.failedTest,
    ctx.stderr,
    ctx.level,
    ctx.previousHints,
  ]);
  return `hintcache:${createHash('sha256').update(material).digest('hex')}`;
}
const SHARED_CACHE_TTL_SEC = 7 * 24 * 3600;

/** Validates a request for `level` and returns the stored hint or what is needed to generate it. */
export async function prepareHint(submissionId: string, level: HintLevel, actor: Actor): Promise<PreparedHint> {
  const { submission, problem, hints } = await load(submissionId, actor);
  const reason = blockReason(submission, problem.aiHintsEnabled, actor);
  if (reason) throw BLOCK_ERRORS[reason]();

  const existing = hints.find((h) => h.level === level);
  if (existing) return { kind: 'stored', hint: existing };
  // Levels open in order: 2 needs 1, 3 needs 2.
  if (level > hints.length + 1) {
    throw HttpError.conflict(`Hãy mở gợi ý mức ${hints.length + 1} trước`, 'LEVEL_LOCKED');
  }

  const context: HintContext = {
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
  };
  const cacheKey = sharedCacheKey(submission.problem.id, context);

  // Identical code resubmitted: reuse the earlier hint without calling the LLM or using quota.
  const cached = await redis.get(cacheKey);
  if (cached) {
    const { content, blocked } = JSON.parse(cached) as { content: string; blocked: boolean };
    return { kind: 'stored', hint: await saveHint(submissionId, level, content, blocked) };
  }

  if (!isStaff(actor) && (await hintsUsedToday(actor.id)) >= env.HINT_DAILY_LIMIT) {
    throw new HttpError(429, 'HINT_QUOTA_EXCEEDED', `Bạn đã dùng hết ${env.HINT_DAILY_LIMIT} lượt gợi ý hôm nay, hãy quay lại vào ngày mai`);
  }

  return {
    kind: 'generate',
    context,
    guard: { studentCode: submission.code, referenceSolution: problem.referenceSolution },
    cacheKey,
  };
}

// ---- Generation with the leak guard -----------------------------------------------------------

let streamer: ChatStreamer | null | undefined;
/** Resolved once so the "mock provider" warning is logged a single time. */
export function getStreamer(): ChatStreamer | null {
  if (streamer === undefined) streamer = resolveChatStreamer();
  return streamer;
}
/** Test hook: swap the LLM provider. */
export function setStreamer(s: ChatStreamer | null | undefined) {
  streamer = s;
}

export function hintMessages(context: HintContext) {
  return { messages: buildHintMessages(context), maxTokens: LEVEL_MAX_TOKENS[context.level] };
}

const REWRITE_REMINDER = `CÂU TRẢ LỜI TRƯỚC ĐÃ BỊ HỆ THỐNG CHẶN vì chứa code hoặc gần với lời giải.
Viết lại gợi ý đúng mức yêu cầu CHỈ BẰNG LỜI: không khối code, không viết bất kỳ dòng code mới nào,
không nêu biểu thức/công thức sửa lỗi. Chỉ được trích nguyên văn tối đa một dòng có sẵn trong code của sinh viên.`;

async function collect(
  run: ChatStreamer,
  messages: ChatMessage[],
  maxTokens: number,
  signal: AbortSignal,
  onChars?: (n: number) => void,
): Promise<string> {
  let text = '';
  let lastReport = 0;
  for await (const chunk of run(messages, { maxTokens, signal })) {
    text += chunk;
    if (onChars && text.length - lastReport >= 40) {
      lastReport = text.length;
      onChars(text.length);
    }
  }
  return text.trim();
}

export interface GeneratedHint {
  content: string;
  /** The model's first answer was rejected and replaced. */
  blocked: boolean;
}

/**
 * Generates a hint and only returns text the leak guard accepts: the first answer, a rewrite
 * after a stronger reminder, or a canned fallback for the level.
 */
export async function generateGuardedHint(
  context: HintContext,
  guard: GuardMaterial,
  run: ChatStreamer,
  signal: AbortSignal,
  onStatus: (phase: HintPhase, chars?: number) => void,
): Promise<GeneratedHint> {
  const { messages, maxTokens } = hintMessages(context);

  onStatus('generating', 0);
  const first = await collect(run, messages, maxTokens, signal, (n) => onStatus('generating', n));
  onStatus('checking');
  const firstVerdict = checkHint({ hint: first, ...guard });
  if (first && firstVerdict.ok) return { content: first, blocked: false };
  logger.warn({ level: context.level, reason: firstVerdict.reason ?? 'EMPTY', detail: firstVerdict.detail }, 'hint rejected by leak guard');

  onStatus('rewriting', 0);
  const retryMessages: ChatMessage[] = [messages[0]!, { role: 'user', content: `${messages[1]!.content}\n\n${REWRITE_REMINDER}` }];
  const second = await collect(run, retryMessages, maxTokens, signal, (n) => onStatus('rewriting', n));
  onStatus('checking');
  const secondVerdict = checkHint({ hint: second, ...guard });
  if (second && secondVerdict.ok) return { content: second, blocked: true };
  logger.warn({ level: context.level, reason: secondVerdict.reason ?? 'EMPTY' }, 'hint rewrite rejected, using fallback');

  return { content: FALLBACK_HINTS[context.level], blocked: true };
}

/** Records a fresh generation: shared cache for identical resubmissions and the daily quota. */
export async function recordGeneration(actor: Actor, cacheKey: string, hint: GeneratedHint): Promise<void> {
  await redis.set(cacheKey, JSON.stringify(hint), 'EX', SHARED_CACHE_TTL_SEC);
  if (!isStaff(actor)) await consumeQuota(actor.id);
}

/** Prevents two tabs from generating the same hint at once. Returns a release function, or null if taken. */
export async function lockHint(submissionId: string, level: HintLevel): Promise<(() => Promise<void>) | null> {
  const key = `hintlock:${submissionId}:${level}`;
  const ok = await redis.set(key, '1', 'EX', 120, 'NX');
  return ok ? async () => void (await redis.del(key)) : null;
}

/** Stores a finished hint; if another request won the race, returns theirs. */
export async function saveHint(submissionId: string, level: HintLevel, content: string, blocked: boolean): Promise<HintItem> {
  try {
    return toItem(await prisma.hint.create({ data: { submissionId, level, content, blocked } }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return toItem(await prisma.hint.findUniqueOrThrow({ where: { submissionId_level: { submissionId, level } } }));
    }
    throw err;
  }
}
