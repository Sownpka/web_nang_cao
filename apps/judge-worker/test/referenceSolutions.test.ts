// Every seeded problem's reference solution must pass all of its tests within the limits —
// otherwise the demo data (or the sandbox timing) is wrong.
import { describe, expect, it } from 'vitest';
import { seedProblems } from '../../../seed/problems.js';
import { judgeCode } from '../src/judge.js';
import { sandboxReady } from './dockerAvailable.js';

const ready = await sandboxReady();

describe.skipIf(!ready)('seed reference solutions', () => {
  for (const p of seedProblems) {
    it(`${p.slug} is ACCEPTED`, async () => {
      const res = await judgeCode({
        language: 'python',
        code: p.referenceSolution,
        timeLimitMs: p.timeLimitMs,
        memoryLimitMb: p.memoryLimitMb,
        tests: p.tests.map((t, i) => ({ id: String(i), ...t })),
      });
      expect(res, JSON.stringify({ ...res, stderr: res.stderr?.slice(-300) })).toMatchObject({ verdict: 'ACCEPTED' });
      // Leave headroom so the demo does not flake on a slower machine.
      expect(res.runtimeMs!).toBeLessThan(p.timeLimitMs * 0.7);
    }, 120_000);
  }
});
