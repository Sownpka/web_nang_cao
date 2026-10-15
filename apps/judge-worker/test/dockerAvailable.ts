import { docker } from '../src/docker.js';
import { LANGUAGES } from '../src/runner/languages.js';

/** True when the Docker daemon answers and every sandbox image is built. */
export async function sandboxReady(): Promise<boolean> {
  try {
    await docker.ping();
    for (const spec of Object.values(LANGUAGES)) await docker.getImage(spec!.image).inspect();
    return true;
  } catch {
    return false;
  }
}
