// Real-container security tests (CLAUDE.md §5). Skipped when Docker or the sandbox images are missing;
// build them with `pnpm build:sandbox`.
import { describe, expect, it } from 'vitest';
import { docker, SANDBOX_LABEL } from '../src/docker.js';
import { judgeCode, type JudgeInput } from '../src/judge.js';
import { sandboxReady } from './dockerAvailable.js';

const ready = await sandboxReady();

const one = (language: JudgeInput['language'], code: string, extra: Partial<JudgeInput> = {}): JudgeInput => ({
  language,
  code,
  timeLimitMs: 1000,
  memoryLimitMb: 128,
  tests: [{ id: 't1', input: '3 4\n', expected: '7\n' }],
  ...extra,
});

describe.skipIf(!ready)('sandbox — normal programs', () => {
  it('accepts a correct Python solution', async () => {
    const res = await judgeCode(one('python', 'a, b = map(int, input().split())\nprint(a + b)'));
    expect(res.verdict).toBe('ACCEPTED');
    expect(res.runtimeMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts a correct JavaScript solution', async () => {
    const code = "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconsole.log(a + b);";
    expect((await judgeCode(one('javascript', code))).verdict).toBe('ACCEPTED');
  });

  it('reports a wrong answer with the actual output', async () => {
    const res = await judgeCode(one('python', 'print(8)'));
    expect(res.verdict).toBe('WRONG_ANSWER');
    expect(res.failed?.actualOutput).toBe('8\n');
  });

  it('reports a runtime error with the traceback tail', async () => {
    const res = await judgeCode(one('python', 'print(1 // 0)'));
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.stderr).toContain('ZeroDivisionError');
    expect(res.stderr).not.toContain('__JH_STATS__');
  });
});

describe.skipIf(!ready)('sandbox — malicious programs', () => {
  it('kills an infinite loop (TLE)', async () => {
    const started = Date.now();
    const res = await judgeCode(one('python', 'while True:\n    pass'));
    expect(res.verdict).toBe('TIME_LIMIT_EXCEEDED');
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('kills an infinite loop in JavaScript (TLE)', async () => {
    expect((await judgeCode(one('javascript', 'for (;;) {}'))).verdict).toBe('TIME_LIMIT_EXCEEDED');
  });

  it('kills a sleeping program by wall clock (TLE)', async () => {
    expect((await judgeCode(one('python', 'import time\ntime.sleep(60)'))).verdict).toBe('TIME_LIMIT_EXCEEDED');
  });

  it('contains a fork bomb with the pids limit', async () => {
    const code = 'import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass';
    const res = await judgeCode(one('python', code));
    expect(['TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR']).toContain(res.verdict);
  });

  it('has no network access', async () => {
    const code = 'import socket\ns = socket.create_connection(("1.1.1.1", 80), timeout=3)\nprint(7)';
    const res = await judgeCode(one('python', code));
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.stderr).toMatch(/OSError|unreachable|Network/i);
  });

  it('cannot reach the network from JavaScript either', async () => {
    const code = "require('http').get('http://1.1.1.1', () => console.log(7)).on('error', (e) => { console.error(e.code); process.exit(3); });";
    const res = await judgeCode(one('javascript', code));
    expect(res.verdict).toBe('RUNTIME_ERROR');
  });

  it('cannot write a 100MB file', async () => {
    const code = 'with open("/tmp/big.bin", "wb") as f:\n    for _ in range(100):\n        f.write(b"x" * 1024 * 1024)\nprint(7)';
    const res = await judgeCode(one('python', code));
    expect(res.verdict).toBe('RUNTIME_ERROR');
  });

  it('cannot write outside /tmp (read-only root filesystem)', async () => {
    const res = await judgeCode(one('python', 'open("/etc/judgehint-was-here", "w").write("x")\nprint(7)'));
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.stderr).toMatch(/Read-only file system|Permission denied/);
  });

  it('stops a 1GB allocation at the memory limit (MLE)', async () => {
    const res = await judgeCode(one('python', 'x = bytearray(1024 * 1024 * 1024)\nx[::4096] = b"y" * len(x[::4096])\nprint(7)'));
    expect(res.verdict).toBe('MEMORY_LIMIT_EXCEEDED');
  });

  it('only sees the container /etc/passwd, not the host one', async () => {
    const res = await judgeCode(one('python', 'print(open("/etc/passwd").read())'));
    expect(res.verdict).toBe('WRONG_ANSWER');
    const out = res.failed?.actualOutput ?? '';
    expect(out).toContain('nobody');
    const hostUser = process.env.USER ?? process.env.USERNAME;
    if (hostUser && hostUser !== 'root') expect(out).not.toContain(`${hostUser}:`);
  });

  it('runs as nobody without capabilities', async () => {
    const res = await judgeCode(one('python', 'import os\nprint(os.getuid(), open("/proc/self/status").read().split("CapEff:")[1].split()[0])'));
    expect(res.failed?.actualOutput.trim()).toBe('65534 0000000000000000');
  });

  it('caps a flood of output and still judges', async () => {
    const res = await judgeCode(one('python', 'while True:\n    print("x" * 1000)'));
    expect(res.verdict).toBe('TIME_LIMIT_EXCEEDED');
    expect(res.failed!.actualOutput.length).toBeLessThanOrEqual(4096);
  });

  it('still judges normally afterwards and leaves no containers behind', async () => {
    expect((await judgeCode(one('python', 'print(7)'))).verdict).toBe('ACCEPTED');
    const leftovers = await docker.listContainers({ all: true, filters: { label: [SANDBOX_LABEL] } });
    expect(leftovers).toHaveLength(0);
  });
});

const cpp = (body: string, includes = '') => `#include <bits/stdc++.h>\n${includes}using namespace std;\nint main() {\n${body}\n}\n`;

describe.skipIf(!ready)('sandbox — C++17', () => {
  it('accepts a correct solution over several tests', async () => {
    const res = await judgeCode(
      one('cpp', cpp('long long a, b; cin >> a >> b; cout << a + b << "\\n";'), {
        tests: [
          { id: 't1', input: '3 4\n', expected: '7\n' },
          { id: 't2', input: '-1000000000000 1\n', expected: '-999999999999\n' },
        ],
      }),
    );
    expect(res).toMatchObject({ verdict: 'ACCEPTED', passedCount: 2 });
    expect(res.memoryKb).toBeGreaterThan(0);
  });

  it('hands the program exactly the test input after the binary, even a large one', async () => {
    const n = 100_000;
    const input = `${n}\n${Array.from({ length: n }, (_, i) => i + 1).join(' ')}\n`;
    const code = cpp('int n; cin >> n; long long s = 0; for (int i = 0, x; i < n; i++) { cin >> x; s += x; }\nstring rest; cout << s << (cin >> rest ? " extra" : "") << "\\n";');
    const res = await judgeCode(one('cpp', code, { tests: [{ id: 't1', input, expected: `${(n * (n + 1)) / 2}\n` }] }));
    expect(res.verdict).toBe('ACCEPTED');
  });

  it('reports a wrong answer', async () => {
    const res = await judgeCode(one('cpp', cpp('cout << 8 << endl;')));
    expect(res.verdict).toBe('WRONG_ANSWER');
    expect(res.failed?.actualOutput).toBe('8\n');
  });

  it('reports a compile error with the compiler message', async () => {
    const res = await judgeCode(one('cpp', cpp('int x = 1\ncout << x;')));
    expect(res).toMatchObject({ verdict: 'COMPILE_ERROR', passedCount: 0, failed: null });
    expect(res.stderr).toMatch(/main\.cpp:\d+:\d+: error/);
    expect(res.stderr).not.toContain('__JH_STATS__');
  });

  it('reports a runtime error', async () => {
    const res = await judgeCode(one('cpp', cpp('vector<int> v; return v.at(3);')));
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.stderr).toContain('out_of_range');
  });

  it('kills an infinite loop (TLE)', async () => {
    const started = Date.now();
    const res = await judgeCode(one('cpp', cpp('volatile unsigned long long x = 0; for (;;) x++;')));
    expect(res.verdict).toBe('TIME_LIMIT_EXCEEDED');
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it('stops a 1GB allocation at the memory limit (MLE)', async () => {
    // Size and contents depend on the input so the optimizer cannot drop the allocation.
    const body = 'size_t a, b; cin >> a >> b; size_t n = a << 28; vector<char> v(n, (char)b); long long s = 0;\nfor (size_t i = 0; i < n; i += 4096) s += v[i];\ncout << s << endl;';
    const res = await judgeCode(one('cpp', cpp(body)));
    expect(res.verdict).toBe('MEMORY_LIMIT_EXCEEDED');
  });

  it('contains a fork bomb with the pids limit', async () => {
    const res = await judgeCode(one('cpp', cpp('for (;;) fork();', '#include <unistd.h>\n')));
    expect(['TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR']).toContain(res.verdict);
  });

  it('has no network access', async () => {
    const body = [
      'int s = socket(AF_INET, SOCK_STREAM, 0);',
      'sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(80); inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);',
      'if (s < 0 || connect(s, (sockaddr*)&a, sizeof a) != 0) { perror("connect"); return 3; }',
      'cout << 7 << endl;',
    ].join('\n');
    const res = await judgeCode(one('cpp', cpp(body, '#include <arpa/inet.h>\n#include <sys/socket.h>\n')));
    expect(res.verdict).toBe('RUNTIME_ERROR');
    expect(res.stderr).toMatch(/connect: .*(unreachable|Network)/i);
  });

  it('cannot run a copied binary from /tmp (noexec)', async () => {
    const body = [
      'ifstream in("/proc/self/exe", ios::binary); ofstream out("/tmp/copy", ios::binary); out << in.rdbuf(); out.close();',
      'chmod("/tmp/copy", 0755);',
      'string mode = getenv("JH_COPY") ? "copy" : "main";',
      'if (mode == "copy") { cout << "escaped" << endl; return 0; }',
      'setenv("JH_COPY", "1", 1); execl("/tmp/copy", "copy", (char*)nullptr);',
      'cout << (errno == EACCES ? "noexec" : strerror(errno)) << endl;',
    ].join('\n');
    const res = await judgeCode(
      one('cpp', cpp(body, '#include <sys/stat.h>\n#include <unistd.h>\n'), { tests: [{ id: 't1', input: '', expected: 'noexec\n' }] }),
    );
    expect(res.failed?.actualOutput ?? 'noexec\n').toBe('noexec\n');
    expect(res.verdict).toBe('ACCEPTED');
  });

  it('runs C++ as nobody without capabilities', async () => {
    const body = 'ifstream f("/proc/self/status"); string l; while (getline(f, l)) if (l.rfind("CapEff:", 0) == 0) cout << getuid() << " " << l.substr(7) << endl;';
    const res = await judgeCode(one('cpp', cpp(body, '#include <unistd.h>\n')));
    expect(res.failed?.actualOutput.replace(/\s+/g, ' ').trim()).toBe('65534 0000000000000000');
  });

  it('still judges normally afterwards and leaves no containers behind', async () => {
    expect((await judgeCode(one('cpp', cpp('cout << 7 << endl;')))).verdict).toBe('ACCEPTED');
    const leftovers = await docker.listContainers({ all: true, filters: { label: [SANDBOX_LABEL] } });
    expect(leftovers).toHaveLength(0);
  });
});
