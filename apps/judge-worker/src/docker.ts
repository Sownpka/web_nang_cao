import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import Docker from 'dockerode';

/** Docker client: the local socket / named pipe by default, or DOCKER_HOST (e.g. a socket proxy). */
export const docker = new Docker();

/** Label put on every sandbox container so leftovers can be found and removed. */
export const SANDBOX_LABEL = 'judgehint.sandbox';
/** Which worker process created the container — several workers may share one Docker host. */
export const SANDBOX_OWNER_LABEL = 'judgehint.sandbox.owner';
/** Epoch ms after which no live run can still need the container, so any worker may remove it. */
export const SANDBOX_DEADLINE_LABEL = 'judgehint.sandbox.deadline';

/** Unique per process: pids repeat across containers and restarts. */
export const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
