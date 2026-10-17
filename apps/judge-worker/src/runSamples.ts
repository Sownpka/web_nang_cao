import type { Redis } from 'ioredis';
import { prisma } from '@judgehint/db';
import {
  RUN_RESULT_TTL_SEC,
  runResultKey,
  Verdict,
  type Language,
  type RunCaseResult,
  type RunJobData,
  type RunResult,
} from '@judgehint/shared';
import { STDOUT_CAP_BYTES, stdoutCapFor } from './compare.js';
import {
  ACTUAL_OUTPUT_KEEP_CHARS,
  classifyExecution,
  classifyRun,
  prepareProgram,
  STDERR_KEEP_BYTES,
  tail,
  type Compiler,
} from './judge.js';
import type { Publish } from './judgeSubmission.js';
import { logger } from './logger.js';
import { compileInSandbox, runInSandbox, SandboxError, type RunOptions, type RunResult as SandboxRun } from './runner/dockerRunner.js';

export interface RunCase {
  kind: 'sample' | 'custom';
  number: number;
  input: string;
  expected: string | null;
}

interface Limits {
  language: Language;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

type Runner = (opts: RunOptions) => Promise<SandboxRun>;

/**
 * Compiles if needed, then runs every case (no early stop: students want to see all samples) and
 * reports each one. A compile error fails every case, with the compiler output on the first.
 */
export async function executeCases(
  cases: RunCase[],
  limits: Limits,
  onCase: (result: RunCaseResult, done: number) => unknown,
  run: Runner = runInSandbox,
  compile: Compiler = compileInSandbox,
): Promise<RunCaseResult[]> {
  const results: RunCaseResult[] = [];
  const { binary, compileError } = await prepareProgram(limits.language, limits.code, compile);
  if (compileError !== undefined) {
    for (const c of cases) {
      const result: RunCaseResult = {
        kind: c.kind,
        number: c.number,
        input: c.input,
        expected: c.expected,
        actual: '',
        stderr: results.length === 0 ? compileError : null,
        verdict: Verdict.COMPILE_ERROR,
        runtimeMs: null,
      };
      results.push(result);
      await onCase(result, results.length);
    }
    return results;
  }

  for (const c of cases) {
    const out = await run({
      ...limits,
      input: c.input,
      stdoutCapBytes: c.expected === null ? STDOUT_CAP_BYTES : stdoutCapFor(c.expected),
      binary,
    });
    const verdict =
      c.expected === null
        ? (classifyExecution(out, limits.timeLimitMs) ?? Verdict.ACCEPTED)
        : classifyRun(out, c.expected, limits.timeLimitMs);
    const result: RunCaseResult = {
      kind: c.kind,
      number: c.number,
      input: c.input,
      expected: c.expected,
      actual: out.stdout.slice(0, ACTUAL_OUTPUT_KEEP_CHARS),
      stderr: out.stderr ? tail(out.stderr, STDERR_KEEP_BYTES) : null,
      verdict,
      runtimeMs: Math.min(out.cpuMs ?? out.wallMs, limits.timeLimitMs),
    };
    results.push(result);
    await onCase(result, results.length);
  }
  return results;
}

async function store(redis: Redis, userId: string, result: RunResult) {
  await redis.set(runResultKey(result.runId), JSON.stringify({ userId, result }), 'EX', RUN_RESULT_TTL_SEC);
}

/** Processes one "Chạy thử" job: public tests plus optional custom input. Results live only in Redis. */
export async function processRun(job: RunJobData, redis: Redis, publish: Publish): Promise<void> {
  const problem = await prisma.problem.findUnique({
    where: { id: job.problemId },
    select: {
      timeLimitMs: true,
      memoryLimitMb: true,
      testCases: { where: { isHidden: false }, orderBy: { order: 'asc' }, select: { input: true, expected: true } },
    },
  });

  const result: RunResult = { runId: job.runId, problemId: job.problemId, status: 'RUNNING', total: 0, cases: [] };
  if (!problem) {
    result.status = 'ERROR';
    result.error = 'Bài tập không còn tồn tại';
    await store(redis, job.userId, result);
    await publish({ type: 'run-done', userId: job.userId, result });
    return;
  }

  const cases: RunCase[] = problem.testCases.map((t, i) => ({ kind: 'sample', number: i + 1, input: t.input, expected: t.expected }));
  if (job.customInput !== undefined) cases.push({ kind: 'custom', number: 1, input: job.customInput, expected: null });
  result.total = cases.length;
  await store(redis, job.userId, result);
  await publish({ type: 'run-progress', runId: job.runId, userId: job.userId, testIndex: 0, total: cases.length });

  try {
    await executeCases(
      cases,
      { language: job.language, code: job.code, timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
      async (caseResult, done) => {
        result.cases.push(caseResult);
        await store(redis, job.userId, result);
        await publish({ type: 'run-progress', runId: job.runId, userId: job.userId, testIndex: done, total: cases.length });
      },
    );
    result.status = 'DONE';
  } catch (err) {
    result.status = 'ERROR';
    result.error = err instanceof SandboxError ? 'Lỗi hệ thống chấm bài, vui lòng thử lại sau.' : 'Có lỗi xảy ra khi chạy thử';
    logger.error({ runId: job.runId, err: (err as Error).message }, 'sample run failed');
  }

  await store(redis, job.userId, result);
  await publish({ type: 'run-done', userId: job.userId, result });
}
