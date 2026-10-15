import { randomUUID } from 'node:crypto';
import { prisma } from '@judgehint/db';
import { RUN_RESULT_TTL_SEC, runResultKey, type RunResult } from '@judgehint/shared';
import { HttpError } from '../../lib/httpError.js';
import { logger } from '../../lib/logger.js';
import { runsQueue } from '../../lib/queue.js';
import { redis } from '../../lib/redis.js';
import type { Actor } from '../problems/problems.service.js';
import type { RunSamplesInput } from './runs.schema.js';

/** What is stored in Redis: the result plus its owner. */
interface StoredRun {
  userId: string;
  result: RunResult;
}

/** Queues a sample run. Nothing is written to Postgres, so runs never affect scores. */
export async function createRun(problemId: string, input: RunSamplesInput, actor: Actor): Promise<RunResult> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, allowedLanguages: true, _count: { select: { testCases: { where: { isHidden: false } } } } },
  });
  if (!problem) throw HttpError.notFound('Không tìm thấy bài tập');
  if (!problem.allowedLanguages.includes(input.language)) {
    throw new HttpError(400, 'LANGUAGE_NOT_ALLOWED', 'Bài này không cho phép ngôn ngữ đã chọn');
  }
  const samples = problem._count.testCases;
  const hasCustom = input.customInput !== undefined;
  if (samples === 0 && !hasCustom) {
    throw HttpError.badRequest('Bài không có test công khai — hãy nhập input tự chọn để chạy thử');
  }

  const result: RunResult = {
    runId: randomUUID(),
    problemId,
    status: 'PENDING',
    total: samples + (hasCustom ? 1 : 0),
    cases: [],
  };
  const stored: StoredRun = { userId: actor.id, result };
  await redis.set(runResultKey(result.runId), JSON.stringify(stored), 'EX', RUN_RESULT_TTL_SEC);

  try {
    await runsQueue.add(
      'run',
      { runId: result.runId, userId: actor.id, problemId, language: input.language, code: input.code, customInput: input.customInput },
      { jobId: result.runId },
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'failed to enqueue sample run');
    await redis.del(runResultKey(result.runId));
    throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Hệ thống chấm đang bận, vui lòng thử lại sau');
  }
  return result;
}

export async function getRun(runId: string, actor: Actor): Promise<RunResult> {
  const raw = await redis.get(runResultKey(runId));
  const stored = raw ? (JSON.parse(raw) as StoredRun) : null;
  // Someone else's run looks exactly like a missing one.
  if (!stored || stored.userId !== actor.id) throw HttpError.notFound('Không tìm thấy lần chạy thử (có thể đã hết hạn)');
  return stored.result;
}
