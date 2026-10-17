// Judge logic with a fake runner — no Docker needed.
import { describe, expect, it } from 'vitest';
import { head, judgeCode, tail, type JudgeProgress } from '../src/judge.js';
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

  it('keeps only the head of long compiler output', () => {
    const long = `START${'a'.repeat(5000)}`;
    expect(head(long, 2048)).toHaveLength(2048);
    expect(head(long, 2048).startsWith('START')).toBe(true);
  });
});

describe('judgeCode — compiled languages', () => {
  const cpp = { ...base, language: 'cpp' as const };
  const binary = Buffer.from('ELF');

  it('compiles once and hands the binary to every test run', async () => {
    const { run, calls } = fakeRunner({ '1': ok('1'), '2': ok('4'), '3': ok('9') });
    let compiles = 0;
    const compile = async () => {
      compiles++;
      return { ok: true as const, binary };
    };
    const res = await judgeCode(cpp, undefined, run, compile);
    expect(res.verdict).toBe('ACCEPTED');
    expect(compiles).toBe(1);
    expect(calls.map((c) => c.binary)).toEqual([binary, binary, binary]);
  });

  it('reports COMPILE_ERROR with the head of the compiler output and runs nothing', async () => {
    const { run, calls } = fakeRunner({});
    const message = `main.cpp:3:5: error: expected ';'\n${'x'.repeat(5000)}`;
    const res = await judgeCode(cpp, undefined, run, async () => ({ ok: false, message }));
    expect(res).toMatchObject({ verdict: 'COMPILE_ERROR', passedCount: 0, totalCount: 3, runtimeMs: null, failed: null });
    expect(res.stderr!.startsWith("main.cpp:3:5: error: expected ';'")).toBe(true);
    expect(res.stderr!.length).toBeLessThanOrEqual(2048);
    expect(calls).toHaveLength(0);
  });

  it('never compiles interpreted languages', async () => {
    const { run, calls } = fakeRunner({ '1': ok('1'), '2': ok('4'), '3': ok('9') });
    const compile = async () => {
      throw new Error('should not compile');
    };
    expect((await judgeCode(base, undefined, run, compile)).verdict).toBe('ACCEPTED');
    expect(calls[0]!.binary).toBeUndefined();
  });

  it('treats std::bad_alloc as MLE', async () => {
    const { run } = fakeRunner({ '1': ok('', { exitCode: 134, stderr: "terminate called after throwing an instance of 'std::bad_alloc'" }) });
    const res = await judgeCode(cpp, undefined, run, async () => ({ ok: true, binary }));
    expect(res.verdict).toBe('MEMORY_LIMIT_EXCEEDED');
  });
});
