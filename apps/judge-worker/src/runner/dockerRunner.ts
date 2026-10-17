import http from 'node:http';
import type { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import type { Container } from 'dockerode';
import type { Language } from '@judgehint/shared';
import { docker, SANDBOX_DEADLINE_LABEL, SANDBOX_LABEL, SANDBOX_OWNER_LABEL, WORKER_ID } from '../docker.js';
import { BINARY_DIR, bootstrapScript, compileScript, LANGUAGES, LOAD_FAILED, STATS_MARKER } from './languages.js';

export interface RunOptions {
  language: Language;
  code: string;
  input: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Stop collecting stdout after this many bytes (the program keeps running). */
  stdoutCapBytes: number;
  /** Compiled languages: the binary from compileInSandbox (`code` is then unused). */
  binary?: Buffer;
}

export interface RunResult {
  /** Killed by the wall-clock guard. */
  timedOut: boolean;
  oomKilled: boolean;
  exitCode: number | null;
  stdout: string;
  stdoutTruncated: boolean;
  /** Last bytes of stderr with the stats line removed. */
  stderr: string;
  wallMs: number;
  /** CPU time from the container cgroup; null if unavailable. */
  cpuMs: number | null;
  memoryKb: number | null;
}

export type CompileResult = { ok: true; binary: Buffer } | { ok: false; message: string };

/** Thrown when the sandbox itself fails (daemon down, missing image) — not the user's fault. */
export class SandboxError extends Error {
  override name = 'SandboxError';
}

export const SANDBOX_LIMITS = {
  cpus: 0.5,
  pids: 64,
  tmpfsMb: 16,
  fileSizeBytes: 1024 * 1024,
  stderrTailBytes: 8 * 1024,
  /** Exec-enabled tmpfs for a compiled binary, which the fsize limit already keeps under 1MB. */
  binaryTmpfsMb: 4,
} as const;

/** The compiler gets fixed, roomier limits than the program: it is our code, not the student's. */
export const COMPILE_LIMITS = {
  timeoutMs: 10_000,
  memoryMb: 512,
  tmpfsMb: 64,
  fileSizeBytes: 16 * 1024 * 1024,
  stderrHeadBytes: 8 * 1024,
} as const;

/** Programs get half a CPU, so wall time may legitimately reach ~2x CPU time plus start-up. */
export const wallClockLimit = (timeLimitMs: number) => timeLimitMs * 2 + 1000;

class CappedSink extends Writable {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  constructor(private readonly cap: number) {
    super();
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
    if (this.size < this.cap) {
      const part = chunk.subarray(0, this.cap - this.size);
      this.chunks.push(part);
      this.size += part.length;
      if (part.length < chunk.length) this.truncated = true;
    } else {
      this.truncated = true;
    }
    cb();
  }
  buffer() {
    return Buffer.concat(this.chunks);
  }
  text() {
    return this.buffer().toString('utf8');
  }
}

class TailSink extends Writable {
  private buf = Buffer.alloc(0);
  constructor(private readonly keep: number) {
    super();
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
    const joined = Buffer.concat([this.buf, chunk]);
    this.buf = joined.length > this.keep ? joined.subarray(joined.length - this.keep) : joined;
    cb();
  }
  text() {
    return this.buf.toString('utf8');
  }
}

function parseStats(stderr: string): { stderr: string; memoryKb: number | null; cpuMs: number | null } {
  const idx = stderr.lastIndexOf(STATS_MARKER);
  if (idx === -1) return { stderr, memoryKb: null, cpuMs: null };
  const line = stderr.slice(idx).split('\n')[0] ?? '';
  const [, mem, cpu] = line.trim().split(/\s+/);
  const num = (s?: string) => (s && /^\d+$/.test(s) ? Number(s) : null);
  const memBytes = num(mem);
  const cpuUs = num(cpu);
  return {
    stderr: stderr.slice(0, idx).replace(/\n$/, ''),
    memoryKb: memBytes === null ? null : Math.round(memBytes / 1024),
    cpuMs: cpuUs === null ? null : Math.round(cpuUs / 1000),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Connection fields of docker-modem (its typings are not published). */
interface ModemConnection {
  socketPath?: string;
  host?: string;
  port?: number | string;
}

/**
 * Opens a hijacked, stdin-only attach and resolves with the raw socket once Docker has upgraded the
 * connection. Done by hand because dockerode either sends its options as a body (which Docker feeds
 * into stdin) or, without a body, never flushes the request headers. Bytes must only be written after
 * the upgrade: anything sent earlier can be dropped.
 */
function attachStdin(containerId: string): Promise<Socket> {
  const modem = docker.modem as unknown as ModemConnection;
  const target = modem.socketPath
    ? { socketPath: modem.socketPath }
    : { host: modem.host ?? 'localhost', port: Number(modem.port ?? 2375) };

  return new Promise((resolve, reject) => {
    const req = http.request({
      ...target,
      method: 'POST',
      path: `/containers/${containerId}/attach?stream=1&stdin=1`,
      headers: { Connection: 'Upgrade', Upgrade: 'tcp', 'Content-Length': 0 },
    });
    req.once('upgrade', (_res, socket: Socket, head: Buffer) => {
      socket.setTimeout(0); // the attach timeout only covers the handshake
      if (head.length) socket.unshift(head);
      resolve(socket);
    });
    req.once('response', (res) => {
      res.resume();
      reject(new SandboxError(`stdin attach failed with HTTP ${res.statusCode}`));
    });
    req.once('error', reject);
    // Never hang a judge job on a stuck daemon connection.
    req.setTimeout(ATTACH_TIMEOUT_MS, () => req.destroy(new SandboxError('stdin attach timed out')));
    req.end();
  });
}

const ATTACH_TIMEOUT_MS = 10_000;

/** Slack on top of a run's own limits before its container counts as abandoned (slow daemon, clock skew). */
const LEFTOVER_GRACE_MS = 60_000;
/** Containers from workers that predate the deadline label: far longer than any run can take. */
const UNLABELLED_MAX_AGE_MS = 10 * 60_000;

/** Latest moment a live run can still use its container: both attaches, the wall limit, then grace. */
const containerDeadline = (wallLimitMs: number) => Date.now() + 2 * ATTACH_TIMEOUT_MS + wallLimitMs + LEFTOVER_GRACE_MS;

/**
 * Removes sandbox containers left behind by a crashed worker. Other workers may share the Docker host
 * (scale-out, tests, a restarted dev worker), so only containers past their deadline are touched — a
 * live run always removes its own container long before that.
 */
export async function removeLeftoverContainers(now = Date.now()): Promise<number> {
  const containers = await docker.listContainers({ all: true, filters: { label: [SANDBOX_LABEL] } });
  const expired = containers.filter((c) => {
    const deadline = Number(c.Labels[SANDBOX_DEADLINE_LABEL]);
    return now > (Number.isFinite(deadline) && deadline > 0 ? deadline : c.Created * 1000 + UNLABELLED_MAX_AGE_MS);
  });
  await Promise.all(expired.map((c) => docker.getContainer(c.Id).remove({ force: true }).catch(() => {})));
  return expired.length;
}

interface ContainerJob {
  image: string;
  script: string;
  env: string[];
  /** Everything the container reads on stdin, followed by EOF. */
  stdin: Buffer;
  memoryLimitMb: number;
  tmpfs: Record<string, string>;
  fileSizeBytes: number;
  wallLimitMs: number;
  stdout: Writable;
  stderr: Writable;
}

interface ContainerExit {
  timedOut: boolean;
  oomKilled: boolean;
  exitCode: number | null;
  wallMs: number;
}

/** Runs one script in a fresh, locked-down container (CLAUDE.md §5), then removes it. */
async function runContainer(job: ContainerJob): Promise<ContainerExit> {
  const memoryBytes = job.memoryLimitMb * 1024 * 1024;
  let container: Container;
  try {
    container = await docker.createContainer({
      Image: job.image,
      Cmd: ['sh', '-c', job.script],
      Env: job.env,
      User: '65534:65534',
      WorkingDir: '/tmp',
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      StdinOnce: true,
      Tty: false,
      NetworkDisabled: true,
      Labels: {
        [SANDBOX_LABEL]: '1',
        [SANDBOX_OWNER_LABEL]: WORKER_ID,
        [SANDBOX_DEADLINE_LABEL]: String(containerDeadline(job.wallLimitMs)),
      },
      HostConfig: {
        NetworkMode: 'none',
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // no swap
        NanoCpus: SANDBOX_LIMITS.cpus * 1e9,
        PidsLimit: SANDBOX_LIMITS.pids,
        ReadonlyRootfs: true,
        Tmpfs: job.tmpfs,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Ulimits: [
          { Name: 'fsize', Soft: job.fileSizeBytes, Hard: job.fileSizeBytes },
          { Name: 'nofile', Soft: 256, Hard: 256 },
        ],
        AutoRemove: false,
        Privileged: false,
      },
    });
  } catch (err) {
    throw new SandboxError(`Cannot create sandbox container: ${(err as Error).message}`);
  }

  try {
    // Separate connections: half-closing stdin must not tear down the output stream
    // (it does on Windows named pipes).
    const output = await container.attach({ stream: true, stdout: true, stderr: true });
    const input = await attachStdin(container.id);
    // EPIPE when the program exits without reading all input is expected.
    output.on('error', () => {});
    input.on('error', () => {});
    container.modem.demuxStream(output, job.stdout, job.stderr);
    const streamDone = new Promise<void>((resolve) => {
      output.once('end', resolve);
      output.once('close', resolve);
    });

    await container.start();
    const started = performance.now();
    input.end(job.stdin); // then EOF

    let timedOut = false;
    const guard = setTimeout(() => {
      timedOut = true;
      container.kill().catch(() => {});
    }, job.wallLimitMs);

    let exitCode: number | null = null;
    try {
      const res = (await container.wait()) as { StatusCode?: number };
      exitCode = typeof res.StatusCode === 'number' ? res.StatusCode : null;
    } finally {
      clearTimeout(guard);
    }
    const wallMs = Math.round(performance.now() - started);

    // Let the last output chunks drain, but never hang on a stuck stream.
    await Promise.race([streamDone, sleep(500)]);

    const info = await container.inspect();
    return { timedOut, oomKilled: !!info.State?.OOMKilled, exitCode, wallMs };
  } catch (err) {
    if (err instanceof SandboxError) throw err;
    throw new SandboxError(`Sandbox run failed: ${(err as Error).message}`);
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

const noexecTmpfs = (sizeMb: number) => `rw,size=${sizeMb}m,noexec,nosuid,nodev`;

/** Runs one program against one input in a fresh, locked-down container, then removes it. */
export async function runInSandbox(opts: RunOptions): Promise<RunResult> {
  const spec = LANGUAGES[opts.language];
  if (!spec) throw new SandboxError(`Unsupported language: ${opts.language}`);
  if (spec.compile && !opts.binary) throw new SandboxError(`${opts.language} needs a compiled binary`);

  const input = Buffer.from(opts.input, 'utf8');
  const stdout = new CappedSink(opts.stdoutCapBytes);
  const stderr = new TailSink(SANDBOX_LIMITS.stderrTailBytes);
  const exit = await runContainer({
    image: spec.image,
    script: bootstrapScript(spec, opts.binary?.length),
    env: spec.compile ? [] : [`JH_CODE=${opts.code}`],
    stdin: opts.binary ? Buffer.concat([opts.binary, input]) : input,
    memoryLimitMb: opts.memoryLimitMb,
    tmpfs: {
      '/tmp': noexecTmpfs(SANDBOX_LIMITS.tmpfsMb),
      // Only compiled languages get an exec-enabled dir, for their binary; /tmp stays noexec. The
      // program could write there too, but it is native code already, so that grants nothing new.
      ...(spec.compile && { [BINARY_DIR]: `rw,size=${SANDBOX_LIMITS.binaryTmpfsMb}m,exec,nosuid,nodev,uid=65534,gid=65534,mode=0700` }),
    },
    fileSizeBytes: SANDBOX_LIMITS.fileSizeBytes,
    wallLimitMs: wallClockLimit(opts.timeLimitMs),
    stdout,
    stderr,
  });

  // The loader runs before any student code, so its marker can only open stderr.
  if (exit.exitCode === 125 && stderr.text().startsWith(LOAD_FAILED)) throw new SandboxError('Run container could not load the binary');
  const stats = parseStats(stderr.text());
  return {
    ...exit,
    stdout: stdout.text(),
    stdoutTruncated: stdout.truncated,
    stderr: stats.stderr,
    cpuMs: stats.cpuMs,
    memoryKb: stats.memoryKb,
  };
}

/**
 * Compiles once in its own container with a 10s limit (CLAUDE.md §5). Failures the student caused —
 * compiler errors, a compiler timeout or blow-up, an oversized binary — are `ok: false` with a message
 * for them; infrastructure failures throw SandboxError.
 */
export async function compileInSandbox(language: Language, code: string): Promise<CompileResult> {
  const spec = LANGUAGES[language];
  if (!spec?.compile) throw new SandboxError(`${language} is not a compiled language`);

  // One byte over the cap tells "too big" apart from "exactly at the limit".
  const stdout = new CappedSink(SANDBOX_LIMITS.fileSizeBytes + 1);
  // The first errors are the useful ones, so keep the head of the compiler output.
  const stderr = new CappedSink(COMPILE_LIMITS.stderrHeadBytes);
  const exit = await runContainer({
    image: spec.image,
    script: compileScript(spec),
    env: [`JH_CODE=${code}`],
    stdin: Buffer.alloc(0),
    memoryLimitMb: COMPILE_LIMITS.memoryMb,
    tmpfs: { '/tmp': noexecTmpfs(COMPILE_LIMITS.tmpfsMb) },
    fileSizeBytes: COMPILE_LIMITS.fileSizeBytes,
    wallLimitMs: COMPILE_LIMITS.timeoutMs,
    stdout,
    stderr,
  });

  if (exit.timedOut) return { ok: false, message: `Biên dịch quá thời gian (${COMPILE_LIMITS.timeoutMs / 1000} giây).` };
  if (exit.oomKilled) return { ok: false, message: 'Trình biên dịch dùng quá nhiều bộ nhớ.' };
  if (exit.exitCode !== 0) {
    return { ok: false, message: stderr.text().trim() || `Biên dịch thất bại (mã thoát ${exit.exitCode ?? '?'}).` };
  }
  const binary = stdout.buffer();
  if (binary.length > SANDBOX_LIMITS.fileSizeBytes) {
    return { ok: false, message: `File chạy sau khi biên dịch vượt quá ${SANDBOX_LIMITS.fileSizeBytes / 1024 / 1024}MB.` };
  }
  if (binary.length === 0) throw new SandboxError('Compiler produced no binary');
  return { ok: true, binary };
}
