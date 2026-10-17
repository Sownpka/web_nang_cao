// Every seeded problem's reference solution must pass all of its tests within the limits —
// otherwise the demo data (or the sandbox timing) is wrong.
import { describe, expect, it } from 'vitest';
import { MAX_TESTCASE_BYTES } from '@judgehint/shared';
import { seedProblems, type SeedProblem } from '../../../seed/problems.js';
import { judgeCode } from '../src/judge.js';
import { sandboxReady } from './dockerAvailable.js';

const ready = await sandboxReady();

const judgeSeed = (p: SeedProblem, code: string) =>
  judgeCode({
    language: 'python',
    code,
    timeLimitMs: p.timeLimitMs,
    memoryLimitMb: p.memoryLimitMb,
    tests: p.tests.map((t, i) => ({ id: String(i), ...t })),
  });

describe('seed problem data', () => {
  it('has unique slugs and a mix of difficulties', () => {
    expect(new Set(seedProblems.map((p) => p.slug)).size).toBe(seedProblems.length);
    for (const d of ['EASY', 'MEDIUM', 'HARD'] as const) {
      expect(seedProblems.filter((p) => p.difficulty === d).length).toBeGreaterThanOrEqual(3);
    }
  });

  for (const p of seedProblems) {
    it(`${p.slug} has public + hidden tests within the size limit`, () => {
      expect(p.allowedLanguages).toEqual(expect.arrayContaining(['python', 'javascript', 'cpp']));
      expect(p.tests.some((t) => !t.isHidden)).toBe(true);
      expect(p.tests.some((t) => t.isHidden)).toBe(true);
      for (const t of p.tests) {
        expect(Buffer.byteLength(t.input)).toBeLessThanOrEqual(MAX_TESTCASE_BYTES);
        expect(Buffer.byteLength(t.expected)).toBeLessThanOrEqual(MAX_TESTCASE_BYTES);
      }
    });
  }
});

describe.skipIf(!ready)('seed reference solutions', () => {
  for (const p of seedProblems) {
    it(`${p.slug} is ACCEPTED`, async () => {
      const res = await judgeSeed(p, p.referenceSolution);
      expect(res, JSON.stringify({ ...res, stderr: res.stderr?.slice(-300) })).toMatchObject({ verdict: 'ACCEPTED' });
      // Leave headroom so the demo does not flake on a slower machine.
      expect(res.runtimeMs!).toBeLessThan(p.timeLimitMs * 0.7);
    }, 120_000);
  }
});

// Correct-but-slow solutions the demo relies on to show TIME_LIMIT_EXCEEDED.
const naiveSolutions: Record<string, string> = {
  'dem-cap-co-tong-k': `n, k = map(int, input().split())
a = list(map(int, input().split()))
print(sum(1 for i in range(n) for j in range(i + 1, n) if a[i] + a[j] == k))
`,
  'tong-doan-truy-van': `import sys
data = sys.stdin.read().split()
n, q = int(data[0]), int(data[1])
a = list(map(int, data[2:2 + n]))
pos = 2 + n
for _ in range(q):
    l, r = int(data[pos]), int(data[pos + 1])
    pos += 2
    s = 0
    for i in range(l - 1, r):
        s += a[i]
    print(s)
`,
  'day-con-tang-dai-nhat': `n = int(input())
a = list(map(int, input().split()))
dp = [1] * n
for i in range(n):
    for j in range(i):
        if a[j] < a[i] and dp[j] + 1 > dp[i]:
            dp[i] = dp[j] + 1
print(max(dp))
`,
};

describe.skipIf(!ready)('seed naive solutions', () => {
  for (const [slug, code] of Object.entries(naiveSolutions)) {
    it(`${slug} naive solution gets TIME_LIMIT_EXCEEDED`, async () => {
      const p = seedProblems.find((x) => x.slug === slug)!;
      const res = await judgeSeed(p, code);
      expect(res.verdict).toBe('TIME_LIMIT_EXCEEDED');
      // It must still be correct on the small tests, so TLE is the only thing wrong with it.
      expect(res.passedCount).toBeGreaterThan(0);
    }, 120_000);
  }
});
