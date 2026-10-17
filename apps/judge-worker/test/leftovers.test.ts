// The leftover sweep must only remove abandoned containers: other workers may share the Docker host.
import { describe, expect, it } from 'vitest';
import { docker, SANDBOX_DEADLINE_LABEL, SANDBOX_LABEL, SANDBOX_OWNER_LABEL, WORKER_ID } from '../src/docker.js';
import { removeLeftoverContainers, runInSandbox } from '../src/runner/dockerRunner.js';
import { LANGUAGES } from '../src/runner/languages.js';
import { sandboxReady } from './dockerAvailable.js';

const ready = await sandboxReady();

const ownContainers = () =>
  docker.listContainers({ all: true, filters: { label: [SANDBOX_LABEL, `${SANDBOX_OWNER_LABEL}=${WORKER_ID}`] } });

describe.skipIf(!ready)('removeLeftoverContainers', () => {
  it('does not kill a run that is still in flight', async () => {
    const run = runInSandbox({
      language: 'python',
      code: 'import time\ntime.sleep(2)\nprint("ok")',
      input: '',
      timeLimitMs: 5000,
      memoryLimitMb: 128,
      stdoutCapBytes: 1024,
    });

    // Sweep while the program is running, as a second worker starting up would.
    const deadline = Date.now() + 15_000;
    while ((await ownContainers()).every((c) => c.State !== 'running')) {
      if (Date.now() > deadline) throw new Error('sandbox container never started');
      await new Promise((r) => setTimeout(r, 50));
    }
    await removeLeftoverContainers();

    const res = await run;
    expect(res.timedOut).toBe(false);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('ok\n');
  });

  it('removes containers past their deadline', async () => {
    const container = await docker.createContainer({
      Image: LANGUAGES.python!.image,
      Cmd: ['sleep', '60'],
      NetworkDisabled: true,
      Labels: { [SANDBOX_LABEL]: '1', [SANDBOX_OWNER_LABEL]: 'crashed-worker', [SANDBOX_DEADLINE_LABEL]: String(Date.now() - 1000) },
      HostConfig: { NetworkMode: 'none' },
    });
    try {
      await container.start();
      expect(await removeLeftoverContainers()).toBeGreaterThanOrEqual(1);
      await expect(container.inspect()).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await container.remove({ force: true }).catch(() => {});
    }
  });
});
