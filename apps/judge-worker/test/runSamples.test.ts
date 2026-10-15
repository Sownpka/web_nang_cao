import { describe, expect, it } from 'vitest';
import type { RunCaseResult } from '@judgehint/shared';
import type { RunOptions, RunResult } from '../src/runner/dockerRunner.js';
import { executeCases, type RunCase } from '../src/runSamples.js';

const out = (stdout: string, extra: Partial<RunResult> = {}): RunResult => ({
  timedOut: false,
  oomKilled: false,
  exitCode: 0,
  stdout,
  stdoutTruncated: false,
  stderr: '',
  wallMs: 100,
  cpuMs: 30,
  memoryKb: 9000,
  ...extra,
});

const limits = { language: 'python' as const, code: 'x', timeLimitMs: 1000, memoryLimitMb: 128 };

describe('executeCases', () => {
  it('runs every sample even after a failure and reports each one', async () => {
    const cases: RunCase[] = [
      { kind: 'sample', number: 1, input: '1', expected: '2' },
      { kind: 'sample', number: 2, input: '2', expected: '3' },
      { kind: 'sample', number: 3, input: '3', expected: '4' },
    ];
    const answers: Record<string, RunResult> = { '1': out('2'), '2': out('99'), '3': out('4') };
    const seen: number[] = [];
    const results = await executeCases(cases, limits, (_r, done) => seen.push(done), async (o: RunOptions) => answers[o.input]!);

    expect(results.map((r) => r.verdict)).toEqual(['ACCEPTED', 'WRONG_ANSWER', 'ACCEPTED']);
    expect(results[1]).toMatchObject({ actual: '99', expected: '3', number: 2 });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('treats custom input as "ran without error" and still surfaces runtime errors', async () => {
    const cases: RunCase[] = [
      { kind: 'custom', number: 1, input: 'ok', expected: null },
      { kind: 'custom', number: 2, input: 'boom', expected: null },
    ];
    const answers: Record<string, RunResult> = {
      ok: out('anything'),
      boom: out('', { exitCode: 1, stderr: 'ValueError: bad' }),
    };
    const results: RunCaseResult[] = await executeCases(cases, limits, () => {}, async (o) => answers[o.input]!);
    expect(results[0]).toMatchObject({ verdict: 'ACCEPTED', expected: null, actual: 'anything' });
    expect(results[1]).toMatchObject({ verdict: 'RUNTIME_ERROR', stderr: 'ValueError: bad' });
  });
});
