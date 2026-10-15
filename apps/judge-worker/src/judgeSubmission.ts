import type { Redis } from 'ioredis';
import { prisma } from '@judgehint/db';
import { FINAL_VERDICTS, JUDGE_EVENTS_CHANNEL, Verdict, type JudgeEvent } from '@judgehint/shared';
import { judgeCode, type JudgeResult } from './judge.js';
import { logger } from './logger.js';

export type Publish = (event: JudgeEvent) => Promise<unknown>;

export function redisPublisher(redis: Redis): Publish {
  return (event) => redis.publish(JUDGE_EVENTS_CHANNEL, JSON.stringify(event));
}

/** Loads a submission, judges it in the sandbox and stores the result. Idempotent for finished ones. */
export async function judgeSubmission(submissionId: string, publish: Publish): Promise<JudgeResult | null> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      problem: {
        select: {
          timeLimitMs: true,
          memoryLimitMb: true,
          testCases: { orderBy: { order: 'asc' }, select: { id: true, input: true, expected: true } },
        },
      },
    },
  });
  if (!submission) {
    logger.warn({ submissionId }, 'submission vanished before judging');
    return null;
  }
  // A redelivered job (e.g. after a worker restart) must not judge twice.
  if (FINAL_VERDICTS.includes(submission.verdict)) return null;

  const tests = submission.problem.testCases;
  await prisma.submission.update({
    where: { id: submissionId },
    data: { verdict: Verdict.RUNNING, totalCount: tests.length },
  });

  const base = { submissionId, userId: submission.userId };
  await publish({ type: 'progress', ...base, testIndex: 0, total: tests.length, status: Verdict.RUNNING });

  const started = Date.now();
  const result = await judgeCode(
    {
      language: submission.language,
      code: submission.code,
      timeLimitMs: submission.problem.timeLimitMs,
      memoryLimitMb: submission.problem.memoryLimitMb,
      tests,
    },
    (p) => publish({ type: 'progress', ...base, ...p }),
  );

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      verdict: result.verdict,
      passedCount: result.passedCount,
      totalCount: result.totalCount,
      runtimeMs: result.runtimeMs,
      memoryKb: result.memoryKb,
      stderr: result.stderr,
      failedTestId: result.failed?.testId ?? null,
      failedTestIndex: result.failed?.index ?? null,
      actualOutput: result.failed?.actualOutput ?? null,
      judgedAt: new Date(),
    },
  });

  await publish({
    type: 'done',
    ...base,
    assignmentId: submission.assignmentId,
    verdict: result.verdict,
    passedCount: result.passedCount,
    totalCount: result.totalCount,
    runtimeMs: result.runtimeMs,
    memoryKb: result.memoryKb,
  });

  // Never log the code itself.
  logger.info(
    { submissionId, verdict: result.verdict, passed: `${result.passedCount}/${result.totalCount}`, ms: Date.now() - started },
    'judged',
  );
  return result;
}

/** Marks a submission as SYSTEM_ERROR after the sandbox failed for good. */
export async function markSystemError(submissionId: string, reason: string, publish: Publish): Promise<void> {
  const submission = await prisma.submission.update({
    where: { id: submissionId },
    data: { verdict: Verdict.SYSTEM_ERROR, stderr: 'Lỗi hệ thống chấm bài, vui lòng nộp lại sau.', judgedAt: new Date() },
  });
  logger.error({ submissionId, reason }, 'submission marked SYSTEM_ERROR');
  await publish({
    type: 'done',
    submissionId,
    userId: submission.userId,
    assignmentId: submission.assignmentId,
    verdict: Verdict.SYSTEM_ERROR,
    passedCount: submission.passedCount,
    totalCount: submission.totalCount,
    runtimeMs: null,
    memoryKb: null,
  });
}
