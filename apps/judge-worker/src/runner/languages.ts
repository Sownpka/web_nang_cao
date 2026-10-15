import type { Language } from '@judgehint/shared';

export interface LanguageSpec {
  image: string;
  /** Source path inside the container (tmpfs). */
  file: string;
  /** Shell command that runs the program, reading stdin. */
  run: string;
}

export const LANGUAGES: Partial<Record<Language, LanguageSpec>> = {
  python: { image: 'judgehint/py:3.12', file: '/tmp/main.py', run: 'python3 /tmp/main.py' },
  javascript: { image: 'judgehint/node:20', file: '/tmp/main.js', run: 'node /tmp/main.js' },
};

export const STATS_MARKER = '__JH_STATS__';

/**
 * Container entrypoint. The source arrives in $JH_CODE (no host mounts at all), is written to the
 * tmpfs, and the variable is cleared before the program starts. After the program exits, peak memory
 * (bytes) and CPU time (µs) of the container's cgroup are appended to stderr — cgroup v2 first,
 * falling back to v1 (Docker Desktop).
 */
export function bootstrapScript(spec: LanguageSpec): string {
  return [
    `printf '%s' "$JH_CODE" > ${spec.file}`,
    'unset JH_CODE',
    spec.run,
    'rc=$?',
    'G=/sys/fs/cgroup',
    'if [ -r $G/memory.peak ]; then m=$(cat $G/memory.peak); else m=$(cat $G/memory/memory.max_usage_in_bytes 2>/dev/null || echo -); fi',
    'if [ -r $G/cpu.stat ]; then c=$(sed -n "s/^usage_usec //p" $G/cpu.stat); elif [ -r $G/cpuacct/cpuacct.usage ]; then c=$(( $(cat $G/cpuacct/cpuacct.usage) / 1000 )); else c=-; fi',
    `echo "${STATS_MARKER} $m $c" >&2`,
    'exit $rc',
  ].join('\n');
}
