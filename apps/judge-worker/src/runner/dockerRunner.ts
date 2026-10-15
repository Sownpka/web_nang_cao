import http from 'node:http';
import type { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import type { Container } from 'dockerode';
import type { Language } from '@judgehint/shared';
import { docker, SANDBOX_LABEL } from '../docker.js';
import { bootstrapScript, LANGUAGES, STATS_MARKER } from './languages.js';

export interface RunOptions {
  language: Language;
  code: string;
  input: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Stop collecting stdout after this many bytes (the program keeps running). */
  stdoutCapBytes: number;
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
  text() {
    return Buffer.concat(this.chunks).toString('utf8');
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

/** Removes sandbox containers left behind by a crashed worker. */
export async function removeLeftoverContainers(): Promise<number> {
  const leftovers = await docker.listContainers({ all: true, filters: { label: [SANDBOX_LABEL] } });
  await Promise.all(leftovers.map((c) => docker.getContainer(c.Id).remove({ force: true }).catch(() => {})));
  return leftovers.length;
}

/** Runs one program against one input in a fresh, locked-down container, then removes it. */
export async function runInSandbox(opts: RunOptions): Promise<RunResult> {
  const spec = LANGUAGES[opts.language];
  if (!spec) throw new SandboxError(`Unsupported language: ${opts.language}`);

  const memoryBytes = opts.memoryLimitMb * 1024 * 1024;
  let container: Container;
  try {
    container = await docker.createContainer({
      Image: spec.image,
      Cmd: ['sh', '-c', bootstrapScript(spec)],
      Env: [`JH_CODE=${opts.code}`],
      User: '65534:65534',
      WorkingDir: '/tmp',
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      StdinOnce: true,
      Tty: false,
      NetworkDisabled: true,
      Labels: { [SANDBOX_LABEL]: '1' },
      HostConfig: {
        NetworkMode: 'none',
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // no swap
        NanoCpus: SANDBOX_LIMITS.cpus * 1e9,
        PidsLimit: SANDBOX_LIMITS.pids,
        ReadonlyRootfs: true,
        Tmpfs: { '/tmp': `rw,size=${SANDBOX_LIMITS.tmpfsMb}m,noexec,nosuid,nodev` },
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Ulimits: [
          { Name: 'fsize', Soft: SANDBOX_LIMITS.fileSizeBytes, Hard: SANDBOX_LIMITS.fileSizeBytes },
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
    const stdout = new CappedSink(opts.stdoutCapBytes);
    const stderr = new TailSink(SANDBOX_LIMITS.stderrTailBytes);
    container.modem.demuxStream(output, stdout, stderr);
    const streamDone = new Promise<void>((resolve) => {
      output.once('end', resolve);
      output.once('close', resolve);
    });

    await container.start();
    const started = performance.now();
    input.end(opts.input); // then EOF

    let timedOut = false;
    const guard = setTimeout(() => {
      timedOut = true;
      container.kill().catch(() => {});
    }, wallClockLimit(opts.timeLimitMs));

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
    const stats = parseStats(stderr.text());
    return {
      timedOut,
      oomKilled: !!info.State?.OOMKilled,
      exitCode,
      stdout: stdout.text(),
      stdoutTruncated: stdout.truncated,
      stderr: stats.stderr,
      wallMs,
      cpuMs: stats.cpuMs,
      memoryKb: stats.memoryKb,
    };
  } catch (err) {
    if (err instanceof SandboxError) throw err;
    throw new SandboxError(`Sandbox run failed: ${(err as Error).message}`);
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}
