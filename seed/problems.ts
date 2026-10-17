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

// ---------- 8. Leap years ----------
function leapYear(): SeedProblem {
  const rng = mulberry32(8);
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const make = (ys: number[]) => ({
    input: `${ys.length}\n${ys.join('\n')}\n`,
    expected: ys.map((y) => (isLeap(y) ? 'YES' : 'NO')).join('\n') + '\n',
  });
  const s1 = make([2024, 1900, 2000]);
  const edge = make([1, 4, 100, 400, 1600, 1700, 2100, 2400, 999999600, 1000000000]);
  const big = make(Array.from({ length: 1000 }, () => randInt(rng, 1, 1e9)));
  return {
    slug: 'nam-nhuan',
    title: 'Năm nhuận',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Một năm là **năm nhuận** nếu nó chia hết cho 4 nhưng không chia hết cho 100, **hoặc** chia hết cho 400.

Cho **T** năm, với mỗi năm in \`YES\` nếu là năm nhuận, ngược lại in \`NO\`.

### Đầu vào
- Dòng 1: \`T\` (\`1 ≤ T ≤ 1000\`).
- \`T\` dòng tiếp theo, mỗi dòng một số nguyên \`y\` (\`1 ≤ y ≤ 10^9\`).

### Đầu ra
\`T\` dòng, mỗi dòng \`YES\` hoặc \`NO\`.

### Ví dụ
Input:
\`\`\`
3
2024
1900
2000
\`\`\`
Output:
\`\`\`
YES
NO
YES
\`\`\`
`,
    referenceSolution: `import sys
data = sys.stdin.read().split()
t = int(data[0])
out = []
for y in map(int, data[1:1 + t]):
    out.append("YES" if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else "NO")
print("\\n".join(out))
`,
    tests: [pub(s1.input, s1.expected), hid(edge.input, edge.expected), hid(big.input, big.expected)],
  };
}

// ---------- 9. Word count (irregular spacing) ----------
function wordCount(): SeedProblem {
  const rng = mulberry32(9);
  const count = (s: string) => s.split(' ').filter(Boolean).length;
  const word = () => Array.from({ length: randInt(rng, 1, 8) }, () => String.fromCharCode(97 + randInt(rng, 0, 25))).join('');
  const spaces = (lo: number) => ' '.repeat(randInt(rng, lo, 5));
  const line = (words: number) =>
    spaces(0) + word() + Array.from({ length: words - 1 }, () => spaces(1) + word()).join('') + spaces(0);
  const make = (s: string) => ({ input: `${s}\n`, expected: `${count(s)}\n` });
  const s1 = make('xin chao cac ban');
  const s2 = make('  JudgeHint   cham bai   tu dong  ');
  const hidden = [make('a'), make('     '), make(line(10)), make(line(5000)), make(line(12000))];
  return {
    slug: 'dem-tu',
    title: 'Đếm số từ',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho một dòng văn bản chỉ gồm chữ cái Latin và dấu cách. Một **từ** là một dãy chữ cái liên tiếp tối đa.

Lưu ý: đầu dòng, cuối dòng và giữa hai từ có thể có **nhiều dấu cách**; dòng cũng có thể không có từ nào.

### Đầu vào
Một dòng duy nhất, độ dài không quá \`10^5\` ký tự.

### Đầu ra
Số từ trong dòng.

### Ví dụ
| Input | Output |
|---|---|
| \`xin chao cac ban\` | \`4\` |
| \`␣␣JudgeHint␣␣␣cham bai␣␣␣tu dong␣␣\` | \`5\` |

(\`␣\` là dấu cách.)
`,
    referenceSolution: `import sys
print(len(sys.stdin.readline().split()))
`,
    tests: [pub(s1.input, s1.expected), pub(s2.input, s2.expected), ...hidden.map((t) => hid(t.input, t.expected))],
  };
}

// ---------- 10. Balanced brackets ----------
function balancedBrackets(): SeedProblem {
  const rng = mulberry32(10);
  const OPEN = '([{';
  const CLOSE = ')]}';
  const check = (s: string) => {
    const st: string[] = [];
    for (const c of s) {
      const o = OPEN.indexOf(c);
      if (o >= 0) st.push(CLOSE[o]!);
      else if (st.pop() !== c) return false;
    }
    return st.length === 0;
  };
  // Random walk that always closes in time, so the result is balanced.
  const balanced = (len: number) => {
    const st: number[] = [];
    let s = '';
    while (s.length < len) {
      if (st.length && (st.length === len - s.length || rng() < 0.5)) s += CLOSE[st.pop()!];
      else {
        const k = randInt(rng, 0, 2);
        st.push(k);
        s += OPEN[k];
      }
    }
    return s;
  };
  const corrupt = (s: string) => {
    const i = randInt(rng, 0, s.length - 1);
    const all = OPEN + CLOSE;
    const c = all[(all.indexOf(s[i]!) + randInt(rng, 1, 5)) % 6]!;
    return s.slice(0, i) + c + s.slice(i + 1);
  };
  const make = (ss: string[]) => ({
    input: `${ss.length}\n${ss.join('\n')}\n`,
    expected: ss.map((s) => (check(s) ? 'YES' : 'NO')).join('\n') + '\n',
  });
  const s1 = make(['([]{})', '([)]', '((']);
  const small = make([')(', '()', '{[()()]}', '}', '[', ...Array.from({ length: 20 }, (_, i) => (i % 2 ? corrupt(balanced(20)) : balanced(20)))]);
  const deep = make(['('.repeat(50000) + ')'.repeat(50000), '['.repeat(50000) + ']'.repeat(49999) + ')']);
  const big = make([balanced(100000), corrupt(balanced(100000)), balanced(99998) + ')(']);
  return {
    slug: 'kiem-tra-ngoac',
    title: 'Kiểm tra dấu ngoặc',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 128,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Một chuỗi gồm các ký tự \`( ) [ ] { }\` được gọi là **cân bằng** nếu mỗi dấu mở có đúng một dấu đóng cùng loại tương ứng và các cặp ngoặc lồng nhau đúng thứ tự.

Cho **T** chuỗi, với mỗi chuỗi in \`YES\` nếu cân bằng, ngược lại in \`NO\`.

### Đầu vào
- Dòng 1: \`T\` (\`1 ≤ T ≤ 100\`).
- \`T\` dòng tiếp theo, mỗi dòng một chuỗi khác rỗng. Tổng độ dài các chuỗi không quá \`3·10^5\`.

### Đầu ra
\`T\` dòng, mỗi dòng \`YES\` hoặc \`NO\`.

### Ví dụ
Input:
\`\`\`
3
([]{})
([)]
((
\`\`\`
Output:
\`\`\`
YES
NO
NO
\`\`\`

> Chú ý: chuỗi có thể lồng sâu tới \`5·10^4\` tầng.
`,
    referenceSolution: `import sys
PAIR = {")": "(", "]": "[", "}": "{"}
def ok(s):
    st = []
    for c in s:
        if c in "([{":
            st.append(c)
        elif not st or st.pop() != PAIR[c]:
            return False
    return not st
lines = sys.stdin.read().split()
t = int(lines[0])
print("\\n".join("YES" if ok(s) else "NO" for s in lines[1:1 + t]))
`,
    tests: [pub(s1.input, s1.expected), hid(small.input, small.expected), hid(deep.input, deep.expected), hid(big.input, big.expected)],
  };
}

// ---------- 11. Student ranking (sort with tie-break) ----------
function studentRanking(): SeedProblem {
  const rng = mulberry32(11);
  type Row = { name: string; score: number };
  const name = () => Array.from({ length: randInt(rng, 3, 8) }, () => String.fromCharCode(97 + randInt(rng, 0, 25))).join('');
  const make = (rows: Row[]) => {
    const sorted = [...rows].sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return {
      input: `${rows.length}\n${rows.map((r) => `${r.name} ${r.score}`).join('\n')}\n`,
      expected: sorted.map((r) => `${r.name} ${r.score}`).join('\n') + '\n',
    };
  };
  const random = (n: number, maxScore: number) =>
    Array.from({ length: n }, () => ({ name: name(), score: randInt(rng, 0, maxScore) }));
  const s1 = make([
    { name: 'binh', score: 8 },
    { name: 'an', score: 9 },
    { name: 'chau', score: 8 },
    { name: 'dung', score: 10 },
  ]);
  const hidden = [
    make([{ name: 'solo', score: 0 }]),
    make([
      { name: 'ba', score: 5 },
      { name: 'b', score: 5 },
      { name: 'ab', score: 5 },
      { name: 'a', score: 5 },
    ]),
    make(random(1000, 10)),
    make(random(50000, 100)),
  ];
  return {
    slug: 'xep-hang-sinh-vien',
    title: 'Xếp hạng sinh viên',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho danh sách **n** sinh viên, mỗi sinh viên có tên và điểm. Hãy in bảng xếp hạng:

1. Điểm **giảm dần**.
2. Nếu bằng điểm, tên xếp theo **thứ tự từ điển tăng dần**.

### Đầu vào
- Dòng 1: \`n\` (\`1 ≤ n ≤ 5·10^4\`).
- \`n\` dòng tiếp theo, mỗi dòng gồm tên (chỉ chữ cái thường, không dấu, dài \`1..8\`) và điểm nguyên \`0 ≤ d ≤ 100\`.

### Đầu ra
\`n\` dòng theo thứ tự xếp hạng, mỗi dòng \`ten diem\`.

### Ví dụ
Input:
\`\`\`
4
binh 8
an 9
chau 8
dung 10
\`\`\`
Output:
\`\`\`
dung 10
an 9
binh 8
chau 8
\`\`\`
`,
    referenceSolution: `import sys
data = sys.stdin.read().split()
n = int(data[0])
rows = [(data[1 + 2 * i], int(data[2 + 2 * i])) for i in range(n)]
rows.sort(key=lambda r: (-r[1], r[0]))
print("\\n".join(f"{name} {score}" for name, score in rows))
`,
    tests: [pub(s1.input, s1.expected), ...hidden.map((t) => hid(t.input, t.expected))],
  };
}

// ---------- 12. Range sum queries (naive O(n·q) should TLE) ----------
function rangeSum(): SeedProblem {
  const rng = mulberry32(12);
  const make = (a: number[], qs: [number, number][]) => {
    const pre = [0];
    for (const x of a) pre.push(pre[pre.length - 1]! + x);
    return {
      input: `${a.length} ${qs.length}\n${a.join(' ')}\n${qs.map(([l, r]) => `${l} ${r}`).join('\n')}\n`,
      expected: qs.map(([l, r]) => pre[r]! - pre[l - 1]!).join('\n') + '\n',
    };
  };
  const random = (n: number, q: number, wide: boolean) => {
    const a = Array.from({ length: n }, () => randInt(rng, -1e4, 1e4));
    const qs = Array.from({ length: q }, (): [number, number] => {
      // Wide queries make the naive loop touch ~n elements every time.
      const l = wide ? randInt(rng, 1, 10) : randInt(rng, 1, n);
      const r = wide ? randInt(rng, n - 10, n) : randInt(rng, l, n);
      return [l, r];
    });
    return make(a, qs);
  };
  const s1 = make([3, -1, 4, 1, 5], [
    [1, 5],
    [2, 3],
    [4, 4],
  ]);
  const hidden = [make([7], [[1, 1]]), random(1000, 1000, false), random(50000, 50000, false), random(50000, 50000, true)];
  return {
    slug: 'tong-doan-truy-van',
    title: 'Truy vấn tổng đoạn',
    difficulty: 'MEDIUM',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho dãy **n** số nguyên \`a_1, a_2, …, a_n\` và **q** truy vấn. Mỗi truy vấn gồm hai số \`l, r\`, hãy in \`a_l + a_{l+1} + … + a_r\`.

### Đầu vào
- Dòng 1: \`n\` và \`q\` (\`1 ≤ n, q ≤ 5·10^4\`).
- Dòng 2: \`n\` số nguyên \`a_i\` (\`|a_i| ≤ 10^4\`).
- \`q\` dòng tiếp theo, mỗi dòng \`l r\` (\`1 ≤ l ≤ r ≤ n\`).

### Đầu ra
\`q\` dòng, dòng thứ \`i\` là đáp án truy vấn thứ \`i\`.

### Ví dụ
Input:
\`\`\`
5 3
3 -1 4 1 5
1 5
2 3
4 4
\`\`\`
Output:
\`\`\`
12
3
1
\`\`\`

> Gợi ý: cộng lại từng đoạn cho mỗi truy vấn là \`O(n·q)\` — quá chậm với giới hạn lớn nhất.
`,
    referenceSolution: `import sys
data = sys.stdin.buffer.read().split()
n, q = int(data[0]), int(data[1])
pre = [0] * (n + 1)
for i in range(n):
    pre[i + 1] = pre[i] + int(data[2 + i])
out = []
pos = 2 + n
for _ in range(q):
    l, r = int(data[pos]), int(data[pos + 1])
    pos += 2
    out.append(pre[r] - pre[l - 1])
print("\\n".join(map(str, out)))
`,
    tests: [pub(s1.input, s1.expected), ...hidden.map((t) => hid(t.input, t.expected))],
  };
}

// ---------- 13. Longest increasing subsequence (O(n²) should TLE) ----------
function longestIncreasing(): SeedProblem {
  const rng = mulberry32(13);
  const lis = (xs: number[]) => {
    const tails: number[] = [];
    for (const x of xs) {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tails[mid]! < x) lo = mid + 1;
        else hi = mid;
      }
      tails[lo] = x;
    }
    return tails.length;
  };
  const make = (xs: number[]) => ({ input: `${xs.length}\n${xs.join(' ')}\n`, expected: `${lis(xs)}\n` });
  const s1 = make([10, 9, 2, 5, 3, 7, 101, 18]);
  const s2 = make([7, 7, 7, 7]);
  const n = 100000;
  const hidden = [
    make([42]),
    make(Array.from({ length: 1000 }, () => randInt(rng, -1000, 1000))),
    make(Array.from({ length: n }, () => randInt(rng, -1e5, 1e5))),
    make(Array.from({ length: n }, (_, i) => i - 50000)),
    make(Array.from({ length: n }, (_, i) => (i % 2 ? i : -i))),
  ];
  return {
    slug: 'day-con-tang-dai-nhat',
    title: 'Dãy con tăng dài nhất',
    difficulty: 'HARD',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Cho dãy **n** số nguyên. Tìm độ dài của **dãy con tăng ngặt dài nhất** (các phần tử được chọn giữ nguyên thứ tự trong dãy ban đầu, không cần liên tiếp).

### Đầu vào
- Dòng 1: \`n\` (\`1 ≤ n ≤ 10^5\`).
- Dòng 2: \`n\` số nguyên \`a_i\` (\`|a_i| ≤ 10^5\`).

### Đầu ra
Độ dài dãy con tăng ngặt dài nhất.

### Ví dụ
Input:
\`\`\`
8
10 9 2 5 3 7 101 18
\`\`\`
Output:
\`\`\`
4
\`\`\`
(Ví dụ \`2 3 7 18\`.)

> Gợi ý: quy hoạch động \`O(n²)\` đúng nhưng sẽ quá thời gian với \`n = 10^5\`.
`,
    referenceSolution: `import sys
from bisect import bisect_left
data = sys.stdin.buffer.read().split()
n = int(data[0])
tails = []
for x in map(int, data[1:1 + n]):
    i = bisect_left(tails, x)
    if i == len(tails):
        tails.append(x)
    else:
        tails[i] = x
print(len(tails))
`,
    tests: [pub(s1.input, s1.expected), pub(s2.input, s2.expected), ...hidden.map((t) => hid(t.input, t.expected))],
  };
}

// ---------- 14. Maze shortest path (BFS) ----------
function mazeShortestPath(): SeedProblem {
  const rng = mulberry32(14);
  const bfs = (g: string[]) => {
    const R = g.length;
    const C = g[0]!.length;
    const dist = new Int32Array(R * C).fill(-1);
    let start = 0;
    let end = 0;
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        if (g[r]![c] === 'S') start = r * C + c;
        if (g[r]![c] === 'E') end = r * C + c;
      }
    const queue = new Int32Array(R * C);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const cur = queue[head++]!;
      const r = Math.floor(cur / C);
      const c = cur % C;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= R || nc < 0 || nc >= C || g[nr]![nc] === '#') continue;
        const next = nr * C + nc;
        if (dist[next] !== -1) continue;
        dist[next] = dist[cur]! + 1;
        queue[tail++] = next;
      }
    }
    return dist[end]!;
  };
  const make = (g: string[]) => ({ input: `${g.length} ${g[0]!.length}\n${g.join('\n')}\n`, expected: `${bfs(g)}\n` });
  const random = (R: number, C: number, wallRate: number) =>
    Array.from({ length: R }, (_, r) =>
      Array.from({ length: C }, (_, c) => {
        if (r === 0 && c === 0) return 'S';
        if (r === R - 1 && c === C - 1) return 'E';
        return rng() < wallRate ? '#' : '.';
      }).join(''),
    );
  // Walls on every odd row with a gap alternating between the ends: one very long corridor.
  const serpentine = (R: number, C: number) =>
    Array.from({ length: R }, (_, r) => {
      if (r === 0) return 'S' + '.'.repeat(C - 1);
      if (r === R - 1) return (R % 4 === 1 ? '.'.repeat(C - 1) + 'E' : 'E' + '.'.repeat(C - 1));
      if (r % 2 === 0) return '.'.repeat(C);
      return r % 4 === 1 ? '#'.repeat(C - 1) + '.' : '.' + '#'.repeat(C - 1);
    });
  const s1 = make(['S.#', '..#', '#.E']);
  const s2 = make(['S#', '#E']);
  const hidden = [
    make(['SE']),
    make(random(20, 20, 0.25)),
    make(random(300, 300, 0.3)),
    make(random(500, 500, 0.2)),
    make(serpentine(499, 500)),
    make(random(200, 200, 0.6)),
  ];
  return {
    slug: 'me-cung',
    title: 'Thoát khỏi mê cung',
    difficulty: 'HARD',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ALL_LANGUAGES,
    statementMd: `Mê cung là lưới **R × C** ô. Ô \`.\` đi được, ô \`#\` là tường, \`S\` là điểm xuất phát, \`E\` là lối ra (cả hai đều đi được).

Mỗi bước, bạn đi sang một ô **kề cạnh** (lên, xuống, trái, phải) không phải tường. Hãy tìm số bước ít nhất để đi từ \`S\` tới \`E\`, hoặc in \`-1\` nếu không thể.

### Đầu vào
- Dòng 1: \`R\` và \`C\` (\`1 ≤ R, C ≤ 500\`, \`R·C ≥ 2\`).
- \`R\` dòng tiếp theo, mỗi dòng \`C\` ký tự thuộc \`. # S E\`. Có đúng một \`S\` và một \`E\`.

### Đầu ra
Số bước ít nhất, hoặc \`-1\`.

### Ví dụ
Input:
\`\`\`
3 3
S.#
..#
#.E
\`\`\`
Output:
\`\`\`
4
\`\`\`

> Chú ý: đường đi ngắn nhất có thể dài hơn \`10^5\` bước.
`,
    referenceSolution: `import sys
from collections import deque
data = sys.stdin.read().split()
R, C = int(data[0]), int(data[1])
g = "".join(data[2:2 + R])
start, end = g.index("S"), g.index("E")
dist = [-1] * (R * C)
dist[start] = 0
q = deque([start])
while q:
    cur = q.popleft()
    if cur == end:
        break
    r, c = divmod(cur, C)
    d = dist[cur] + 1
    for nxt, ok in ((cur - C, r > 0), (cur + C, r < R - 1), (cur - 1, c > 0), (cur + 1, c < C - 1)):
        if ok and dist[nxt] == -1 and g[nxt] != "#":
            dist[nxt] = d
            q.append(nxt)
print(dist[end])
`,
    tests: [pub(s1.input, s1.expected), pub(s2.input, s2.expected), ...hidden.map((t) => hid(t.input, t.expected))],
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
  leapYear(),
  wordCount(),
  balancedBrackets(),
  studentRanking(),
  rangeSum(),
  longestIncreasing(),
  mazeShortestPath(),
];
