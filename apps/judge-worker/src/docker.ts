import Docker from 'dockerode';

/** Docker client: the local socket / named pipe by default, or DOCKER_HOST (e.g. a socket proxy). */
export const docker = new Docker();

/** Label put on every sandbox container so leftovers can be found and removed. */
export const SANDBOX_LABEL = 'judgehint.sandbox';
