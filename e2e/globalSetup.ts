import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Fresh seed data for every run, also when the stack is reused from `pnpm e2e:stack`. */
export default function globalSetup() {
  execSync('pnpm exec tsx scripts/prepare.ts', {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: 'inherit',
  });
}
