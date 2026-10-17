// Demo problems. Expected outputs of generated tests are computed here with a trusted
// TypeScript implementation, so hidden tests never drift from the reference logic.
import type { Difficulty, Language } from '@judgehint/shared';

export interface SeedTest {
  input: string;
  expected: string;
  isHidden: boolean;
}

export interface SeedProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  timeLimitMs: number;
  memoryLimitMb: number;
  allowedLanguages: Language[];
  statementMd: string;
  referenceSolution: string;
  tests: SeedTest[];
}

/** Deterministic PRNG so re-seeding produces identical hidden tests. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

const pub = (input: string, expected: string): SeedTest => ({ input, expected, isHidden: false });
const hid = (input: string, expected: string): SeedTest => ({ input, expected, isHidden: true });

const ALL_LANGUAGES: Language[] = ['python', 'javascript', 'cpp'];

// ---------- 1. A + B ----------
function sumTwo(): SeedProblem {
  const rng = mulberry32(1);
  const tests: SeedTest[] = [pub('1 2\n', '3\n'), pub('-5 5\n', '0\n')];
  for (let i = 0; i < 4; i++) {
    const a = randInt(rng, -1e9, 1e9);
    const b = randInt(rng, -1e9, 1e9);
    tests.push(hid(`${a} ${b}\n`, `${a + b}\n`));
  }
  return {
    slug: 'tong-hai-so',
    title: 'Tổng hai số',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho hai số nguyên **a** và **b**. Hãy in ra **a + b**.

### Đầu vào
Một dòng gồm hai số nguyên \`a\`, \`b\` (\`-10^9 ≤ a, b ≤ 10^9\`).

### Đầu ra
Một số nguyên duy nhất là tổng \`a + b\`.

### Ví dụ
| Input | Output |
|---|---|
| \`1 2\` | \`3\` |
| \`-5 5\` | \`0\` |
`,
    referenceSolution: `a, b = map(int, input().split())\nprint(a + b)\n`,
    tests,
  };
}

// ---------- 2. Sum of array ----------
function sumArray(): SeedProblem {
  const rng = mulberry32(2);
  const make = (n: number) => {
    const xs = Array.from({ length: n }, () => randInt(rng, -1e6, 1e6));
    const sum = xs.reduce((s, x) => s + x, 0);
    return { input: `${n}\n${xs.join(' ')}\n`, expected: `${sum}\n` };
  };
  const tests: SeedTest[] = [pub('3\n1 2 3\n', '6\n'), pub('1\n-7\n', '-7\n')];
  for (const n of [10, 1000, 100000]) {
    const t = make(n);
    tests.push(hid(t.input, t.expected));
  }
  return {
    slug: 'tong-day-so',
    title: 'Tổng dãy số',
    difficulty: 'EASY',
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho dãy gồm **n** số nguyên. Hãy tính tổng các phần tử.

### Đầu vào
- Dòng 1: số nguyên \`n\` (\`1 ≤ n ≤ 10^5\`).
- Dòng 2: \`n\` số nguyên \`a_i\` (\`|a_i| ≤ 10^6\`), cách nhau bởi dấu cách.

### Đầu ra
Tổng của dãy.

### Ví dụ
Input:
\`\`\`
3
1 2 3
\`\`\`
Output:
\`\`\`
6
\`\`\`
`,
    referenceSolution: `n = int(input())\nprint(sum(map(int, input().split())))\n`,
    tests,
  };
}

// ---------- 3. Reverse string ----------
function reverseString(): SeedProblem {
  const rev = (s: string) => [...s].reverse().join('');
  const cases = ['phenikaa', 'a', 'racecar', 'Hello World', 'JudgeHint 2026'];
  const tests: SeedTest[] = [pub('abc\n', 'cba\n'), pub('xin chao\n', 'oahc nix\n')];
  for (const s of cases) tests.push(hid(`${s}\n`, `${rev(s)}\n`));
  return {
    slug: 'dao-nguoc-chuoi',
    title: 'Đảo ngược chuỗi',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho một chuỗi **s** chỉ gồm chữ cái Latin, chữ số và dấu cách. In ra chuỗi đảo ngược.

### Đầu vào
Một dòng chứa chuỗi \`s\` (\`1 ≤ |s| ≤ 1000\`).

### Đầu ra
Chuỗi \`s\` viết theo thứ tự ngược lại.

### Ví dụ
| Input | Output |
|---|---|
| \`abc\` | \`cba\` |
| \`xin chao\` | \`oahc nix\` |
`,
    referenceSolution: `print(input()[::-1])\n`,
    tests,
  };
}

// ---------- 4. Primality queries ----------
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

function primeCheck(): SeedProblem {
  const rng = mulberry32(4);
  const make = (qs: number[]) => ({
    input: `${qs.length}\n${qs.join('\n')}\n`,
    expected: qs.map((q) => (isPrime(q) ? 'YES' : 'NO')).join('\n') + '\n',
  });
  const edge = make([1, 2, 3, 4, 999999937, 1000000000]);
  const big = make(Array.from({ length: 1000 }, () => randInt(rng, 1, 1e9)));
  const s1 = make([2, 9, 17]);
  return {
    slug: 'kiem-tra-so-nguyen-to',
    title: 'Kiểm tra số nguyên tố',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho **T** truy vấn, mỗi truy vấn là một số nguyên dương **n**. Với mỗi truy vấn, in \`YES\` nếu \`n\` là số nguyên tố, ngược lại in \`NO\`.

### Đầu vào
- Dòng 1: \`T\` (\`1 ≤ T ≤ 1000\`).
- \`T\` dòng tiếp theo, mỗi dòng một số \`n\` (\`1 ≤ n ≤ 10^9\`).

### Đầu ra
\`T\` dòng, mỗi dòng \`YES\` hoặc \`NO\`.

### Ví dụ
Input:
\`\`\`
3
2
9
17
\`\`\`
Output:
\`\`\`
YES
NO
YES
\`\`\`
`,
    referenceSolution: `import sys
def is_prime(n):
    if n < 2: return False
    if n % 2 == 0: return n == 2
    d = 3
    while d * d <= n:
        if n % d == 0: return False
        d += 2
    return True
data = sys.stdin.read().split()
t = int(data[0])
print("\\n".join("YES" if is_prime(int(x)) else "NO" for x in data[1:1 + t]))
`,
    tests: [pub(s1.input, s1.expected), hid(edge.input, edge.expected), hid(big.input, big.expected)],
  };
}

// ---------- 5. Fibonacci mod ----------
function fibonacciMod(): SeedProblem {
  const MOD = 1_000_000_007n;
  const fib = (n: number): string => {
    let a = 0n;
    let b = 1n;
    for (let i = 0; i < n; i++) [a, b] = [b, (a + b) % MOD];
    return a.toString();
  };
  const tests: SeedTest[] = [pub('0\n', '0\n'), pub('10\n', '55\n')];
  for (const n of [1, 2, 50, 1000, 100000, 1000000]) tests.push(hid(`${n}\n`, `${fib(n)}\n`));
  return {
    slug: 'fibonacci-mod',
    title: 'Số Fibonacci thứ n',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Dãy Fibonacci: \`F(0) = 0\`, \`F(1) = 1\`, \`F(n) = F(n-1) + F(n-2)\`.

Cho **n**, in ra \`F(n) mod 10^9 + 7\`.

### Đầu vào
Một số nguyên \`n\` (\`0 ≤ n ≤ 10^6\`).

### Đầu ra
Giá trị \`F(n) mod 1000000007\`.

### Ví dụ
| Input | Output |
|---|---|
| \`0\` | \`0\` |
| \`10\` | \`55\` |
`,
    referenceSolution: `n = int(input())
a, b = 0, 1
for _ in range(n):
    a, b = b, (a + b) % 1000000007
print(a)
`,
    tests,
  };
}

// ---------- 6. Maximum subarray ----------
function maxSubarray(): SeedProblem {
  const rng = mulberry32(6);
  const kadane = (xs: number[]) => {
    let best = xs[0]!;
    let cur = 0;
    for (const x of xs) {
      cur = Math.max(x, cur + x);
      best = Math.max(best, cur);
    }
    return best;
  };
  const make = (xs: number[]) => ({ input: `${xs.length}\n${xs.join(' ')}\n`, expected: `${kadane(xs)}\n` });
  const s1 = make([-2, 1, -3, 4, -1, 2, 1, -5, 4]);
  const s2 = make([-3, -1, -2]);
  const hidden = [
    make([5]),
    make(Array.from({ length: 1000 }, () => randInt(rng, -1000, 1000))),
    make(Array.from({ length: 100000 }, () => randInt(rng, -1e4, 1e4))),
  ];
  return {
    slug: 'day-con-tong-lon-nhat',
    title: 'Dãy con liên tiếp có tổng lớn nhất',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho dãy **n** số nguyên. Tìm tổng lớn nhất của một đoạn con liên tiếp **khác rỗng**.

### Đầu vào
- Dòng 1: \`n\` (\`1 ≤ n ≤ 10^5\`).
- Dòng 2: \`n\` số nguyên \`a_i\` (\`|a_i| ≤ 10^4\`).

### Đầu ra
Tổng lớn nhất tìm được.

### Ví dụ
Input:
\`\`\`
9
-2 1 -3 4 -1 2 1 -5 4
\`\`\`
Output:
\`\`\`
6
\`\`\`
(Đoạn \`4 -1 2 1\`.)
`,
    referenceSolution: `n = int(input())
a = list(map(int, input().split()))
best = a[0]
cur = 0
for x in a:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)
`,
    tests: [pub(s1.input, s1.expected), pub(s2.input, s2.expected), ...hidden.map((t) => hid(t.input, t.expected))],
  };
}

// ---------- 7. Count pairs with sum K (naive O(n^2) should TLE) ----------
function countPairs(): SeedProblem {
  const rng = mulberry32(7);
  const count = (xs: number[], k: number) => {
    const seen = new Map<number, number>();
    let total = 0;
    for (const x of xs) {
      total += seen.get(k - x) ?? 0;
      seen.set(x, (seen.get(x) ?? 0) + 1);
    }
    return total;
  };
  const make = (xs: number[], k: number) => ({
    input: `${xs.length} ${k}\n${xs.join(' ')}\n`,
    expected: `${count(xs, k)}\n`,
  });
  const s1 = make([1, 5, 7, -1, 5], 6);
  const hidden = [
    make([1, 1, 1, 1], 2),
    make(Array.from({ length: 2000 }, () => randInt(rng, -100, 100)), 10),
    make(Array.from({ length: 100000 }, () => randInt(rng, -1e5, 1e5)), 777),
  ];
  return {
    slug: 'dem-cap-co-tong-k',
    title: 'Đếm cặp có tổng bằng K',
    difficulty: 'HARD',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho dãy **n** số nguyên và số **K**. Đếm số cặp chỉ số \`(i, j)\` với \`i < j\` sao cho \`a_i + a_j = K\`.

### Đầu vào
- Dòng 1: \`n\` và \`K\` (\`1 ≤ n ≤ 10^5\`, \`|K| ≤ 10^9\`).
- Dòng 2: \`n\` số nguyên \`a_i\` (\`|a_i| ≤ 10^5\`).

### Đầu ra
Số cặp thỏa mãn.

### Ví dụ
Input:
\`\`\`
5 6
1 5 7 -1 5
\`\`\`
Output:
\`\`\`
3
\`\`\`

> Gợi ý: lời giải \`O(n²)\` sẽ quá thời gian với \`n = 10^5\`.
`,
    referenceSolution: `from collections import defaultdict
n, k = map(int, input().split())
a = list(map(int, input().split()))
seen = defaultdict(int)
total = 0
for x in a:
    total += seen[k - x]
    seen[x] += 1
print(total)
`,
    tests: [pub(s1.input, s1.expected), ...hidden.map((t) => hid(t.input, t.expected))],
  };
}

export const seedProblems: SeedProblem[] = [
  sumTwo(),
  sumArray(),
  reverseString(),
  primeCheck(),
  fibonacciMod(),
  maxSubarray(),
  countPairs(),
];
