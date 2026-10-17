// Starts everything the e2e tests need: fake LLM, api, judge worker and web (Vite), all pointed at
// the isolated e2e database / Redis DB. Playwright launches this as its webServer; it can also be
// run by hand with `pnpm e2e:stack` and reused across test runs.
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertE2eTargets, e2eEnv, FAKE_LLM_PORT, repoRoot, WEB_PORT } from '../env.js';
import { startFakeLlm } from '../fakeLlm.js';

const env = e2eEnv();
assertE2eTargets(env);
const childEnv = { ...process.env, ...env };

execSync('pnpm exec prisma migrate deploy', { cwd: repoRoot, env: childEnv, stdio: 'inherit' });

const fakeLlm = await startFakeLlm(FAKE_LLM_PORT);
console.log(`[e2e] fake LLM listening on ${FAKE_LLM_PORT}`);

const logFile = createWriteStream(fileURLToPath(new URL('../stack.log', import.meta.url)));
console.log('[e2e] service output is also written to e2e/stack.log');

const children: ChildProcess[] = [];
let stopping = false;

function startService(name: string, command: string) {
  const isWin = process.platform === 'win32';
  // detached on POSIX puts each service in its own process group so stop() can kill the whole group.
  const child = spawn(command, { cwd: repoRoot, env: childEnv, shell: true, detached: !isWin });
  const prefix = (chunk: Buffer) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => `[${name}] ${l}\n`)
      .join('');
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ] as const) {
    stream?.on('data', (c: Buffer) => {
      const text = prefix(c);
      logFile.write(text);
      out.write(text);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[e2e] ${name} exited with code ${code}; stopping the stack`);
      stop(1);
    }
  });
  children.push(child);
}

async function waitForApi(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await fetch(`${env.VITE_API_PROXY}/api/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API did not become healthy in time');
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    // pnpm/tsx spawn grandchildren; kill the whole tree.
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  fakeLlm.close();
  process.exit(code);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

startService('api', 'pnpm --filter @judgehint/api start');
startService('worker', 'pnpm --filter @judgehint/judge-worker start');
// Start Vite once the API answers, so its proxy does not log connection errors while booting.
await waitForApi().catch((err: Error) => {
  console.error(`[e2e] ${err.message}`);
  stop(1);
});
startService('web', `pnpm --filter @judgehint/web exec vite --port ${WEB_PORT} --strictPort`);
