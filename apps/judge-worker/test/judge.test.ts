// Judge logic with a fake runner — no Docker needed.
import { describe, expect, it } from 'vitest';
import { judgeCode, tail, type JudgeProgress } from '../src/judge.js';
import type { RunOptions, RunResult } from '../src/runner/dockerRunner.js';

const ok = (stdout: string, extra: Partial<RunResult> = {}): RunResult => ({
  timedOut: false,
  oomKilled: false,
  exitCode: 0,
  stdout,
  stdoutTruncated: false,
  stderr: '',
  wallMs: 120,
  cpuMs: 40,
  memoryKb: 9000,
  ...extra,
});

const tests = [
  { id: 't1', input: '1', expected: '1' },
  { id: 't2', input: '2', expected: '4' },
  { id: 't3', input: '3', expected: '9' },
];

const base = { language: 'python' as const, code: 'x', timeLimitMs: 1000, memoryLimitMb: 128, tests };

function fakeRunner(outputs: Record<string, RunResult>) {
  const calls: RunOptions[] = [];
  const run = async (opts: RunOptions) => {
    calls.push(opts);
    return outputs[opts.input]!;
  };
  return { run, calls };
}

describe('judgeCode', () => {
  it('accepts when every test passes and reports max runtime/memory', async () => {
    const { run } = fakeRunner({ '1': ok('1'), '2': ok('4\n', { cpuMs: 300, memoryKb: 12000 }), '3': ok('9') });
    const progress: JudgeProgress[] = [];
    const res = await judgeCode(base, (p) => void progress.push(p), run);
    expect(res).toMatchObject({ verdict: 'ACCEPTED', passedCount: 3, totalCount: 3, runtimeMs: 300, memoryKb: 12000, failed: null });
    expect(progress.map((p) => p.testIndex)).toEqual([1, 2, 3]);
  });

  it('stops at the first wrong answer and records the failing test', async () => {
    const { run, calls } = fakeRunner({ '1': ok('1'), '2': ok('5'), '3': ok('9') });
    const res = await judgeCode(base, undefined, run);
    expect(res.verdict).toBe('WRONG_ANSWER');
    expect(res.passedCount).toBe(1);
    expect(res.failed).toEqual({ index: 1, testId: 't2', actualOutput: '5' });
    expect(calls).toHaveLength(2);
  });

  it('classifies TLE by CPU time or by the wall-clock kill', async () => {
    const byCpu = fakeRunner({ '1': ok('1', { cpuMs: 1500 }) });
    expect((await judgeCode(base, undefined, byCpu.run)).verdict).toBe('TIME_LIMIT_EXCEEDED');
    const killed = fakeRunner({ '1': ok('', { timedOut: true, exitCode: 137, cpuMs: 2 }) });
    expect((await judgeCode(base, undefined, killed.run)).verdict).toBe('TIME_LIMIT_EXCEEDED');
  });

  it('classifies OOM kills and MemoryError as MLE, other non-zero exits as RTE', async () => {
    const oom = fakeRunner({ '1': ok('', { oomKilled: true, exitCode: 137 }) });
    expect((await judgeCode(base, undefined, oom.run)).verdict).toBe('MEMORY_LIMIT_EXCEEDED');
    const memErr = fakeRunner({ '1': ok('', { exitCode: 1, stderr: 'Traceback...\nMemoryError' }) });
    expect((await judgeCode(base, undefined, memErr.run)).verdict).toBe('MEMORY_LIMIT_EXCEEDED');
    const rte = fakeRunner({ '1': ok('', { exitCode: 1, stderr: 'ZeroDivisionError: division by zero' }) });
    const res = await judgeCode(base, undefined, rte.run);
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.stderr).toContain('ZeroDivisionError');
  });

  it('is a system error when the problem has no tests', async () => {
    const res = await judgeCode({ ...base, tests: [] }, undefined, async () => ok(''));
    expect(res.verdict).toBe('SYSTEM_ERROR');
  });

  it('keeps only the tail of long stderr', () => {
    const long = `${'a'.repeat(5000)}END`;
    expect(tail(long, 2048)).toHaveLength(2048);
    expect(tail(long, 2048).endsWith('END')).toBe(true);
  });
});
