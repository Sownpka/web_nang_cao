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
