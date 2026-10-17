// Builds every sandbox image used by the judge worker. Usage: pnpm build:sandbox
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const images = [
  { tag: 'judgehint/py:3.12', dir: 'python' },
  { tag: 'judgehint/node:20', dir: 'node' },
  { tag: 'judgehint/gcc:13', dir: 'gcc' },
];

for (const { tag, dir } of images) {
  console.log(`\n==> Building ${tag}`);
  execFileSync('docker', ['build', '-t', tag, join(here, dir)], { stdio: 'inherit' });
}
console.log('\nAll sandbox images built.');
