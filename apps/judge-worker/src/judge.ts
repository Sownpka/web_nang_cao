import { Verdict, type Language } from '@judgehint/shared';
import { outputsMatch, stdoutCapFor } from './compare.js';
import { runInSandbox, type RunOptions, type RunResult } from './runner/dockerRunner.js';

export interface JudgeTest {
  id: string;
  input: string;
  expected: string;
}

export interface JudgeInput {
  language: Language;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  tests: JudgeTest[];
}

export interface JudgeProgress {
  /** Number of tests finished so far (1-based after the first test). */
  testIndex: number;
  total: number;
  status: Verdict;
}

export interface FailedTest {
  /** 0-based position in the ordered test list. */
  index: number;
  testId: string;
  actualOutput: string;
}

export interface JudgeResult {
  verdict: Verdict;
  passedCount: number;
  totalCount: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  stderr: string | null;
  failed: FailedTest | null;
}

/** Stored stderr: the last 2KB, as the spec requires. */
export const STDERR_KEEP_BYTES = 2 * 1024;
/** Stored actual output of the failing test. */
export const ACTUAL_OUTPUT_KEEP_CHARS = 4 * 1024;

const MEMORY_ERROR_PATTERNS = [/\bMemoryError\b/, /JavaScript heap out of memory/, /Cannot allocate memory/];

export function tail(text: string, bytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  return buf.length <= bytes ? text : buf.subarray(buf.length - bytes).toString('utf8').replace(/^�+/, '');
}

/**
 * TLE / MLE / RE, or null if the program ran cleanly. Order matters: a killed program is TLE even
 * if it also hit memory limits.
 */
export function classifyExecution(run: RunResult, timeLimitMs: number): Verdict | null {
  const time = run.cpuMs ?? run.wallMs;
  if (run.timedOut || time > timeLimitMs) return Verdict.TIME_LIMIT_EXCEEDED;
  if (run.oomKilled || MEMORY_ERROR_PATTERNS.some((re) => re.test(run.stderr))) return Verdict.MEMORY_LIMIT_EXCEEDED;
  if (run.exitCode !== 0) return Verdict.RUNTIME_ERROR;
  return null;
}

/** Classifies a single run against the expected output. */
export function classifyRun(run: RunResult, expected: string, timeLimitMs: number): Verdict {
  return classifyExecution(run, timeLimitMs) ?? (outputsMatch(run.stdout, expected) ? Verdict.ACCEPTED : Verdict.WRONG_ANSWER);
}

type Runner = (opts: RunOptions) => Promise<RunResult>;

/**
 * Runs tests in order and stops at the first failure.
 * Throws SandboxError for infrastructure failures (the caller decides between retry and SYSTEM_ERROR).
 */
export async function judgeCode(
  input: JudgeInput,
  onProgress?: (p: JudgeProgress) => unknown,
  run: Runner = runInSandbox,
): Promise<JudgeResult> {
  const total = input.tests.length;
  if (total === 0) {
    return { verdict: Verdict.SYSTEM_ERROR, passedCount: 0, totalCount: 0, runtimeMs: null, memoryKb: null, stderr: 'Bài chưa có test', failed: null };
  }
  let runtimeMs: number | null = null;
  let memoryKb: number | null = null;

  for (const [index, test] of input.tests.entries()) {
    const result = await run({
      language: input.language,
      code: input.code,
      input: test.input,
      timeLimitMs: input.timeLimitMs,
      memoryLimitMb: input.memoryLimitMb,
      stdoutCapBytes: stdoutCapFor(test.expected),
    });

    const verdict = classifyRun(result, test.expected, input.timeLimitMs);
    const time = result.cpuMs ?? result.wallMs;
    runtimeMs = Math.max(runtimeMs ?? 0, Math.min(time, input.timeLimitMs));
    if (result.memoryKb !== null) memoryKb = Math.max(memoryKb ?? 0, result.memoryKb);

    await onProgress?.({ testIndex: index + 1, total, status: verdict === Verdict.ACCEPTED ? Verdict.RUNNING : verdict });

    if (verdict !== Verdict.ACCEPTED) {
      return {
        verdict,
        passedCount: index,
        totalCount: total,
        runtimeMs,
        memoryKb,
        stderr: result.stderr ? tail(result.stderr, STDERR_KEEP_BYTES) : null,
        failed: { index, testId: test.id, actualOutput: result.stdout.slice(0, ACTUAL_OUTPUT_KEEP_CHARS) },
      };
    }
  }

  return { verdict: Verdict.ACCEPTED, passedCount: total, totalCount: total, runtimeMs, memoryKb, stderr: null, failed: null };
}
