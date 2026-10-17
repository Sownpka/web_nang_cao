import type { Language } from '@judgehint/shared';

export interface LanguageSpec {
  image: string;
  /** Source path inside the container (tmpfs). */
  file: string;
  /** Shell command that runs the program, reading stdin. */
  run: string;
  /**
   * Compiled languages only: shell command run once in its own container that turns `file` into
   * BUILD_OUTPUT. Diagnostics must go to stderr. The binary then runs from BINARY_PATH.
   */
  compile?: string;
}

/** Where the compile container leaves the binary (noexec tmpfs: it is only read back, never run). */
export const BUILD_OUTPUT = '/tmp/main';
/** Exec-enabled tmpfs that only exists in run containers of compiled languages. */
export const BINARY_DIR = '/box';
export const BINARY_PATH = `${BINARY_DIR}/main`;

export const LANGUAGES: Partial<Record<Language, LanguageSpec>> = {
  python: { image: 'judgehint/py:3.12', file: '/tmp/main.py', run: 'python3 /tmp/main.py' },
  javascript: { image: 'judgehint/node:20', file: '/tmp/main.js', run: 'node /tmp/main.js' },
  cpp: {
    image: 'judgehint/gcc:13',
    file: '/tmp/main.cpp',
    compile: `cd /tmp && g++ -O2 -std=c++17 main.cpp -o ${BUILD_OUTPUT}`,
    run: BINARY_PATH,
  },
};

export const STATS_MARKER = '__JH_STATS__';
/** Printed when a run container cannot load the binary: a sandbox fault, not the student's. */
export const LOAD_FAILED = '__JH_LOAD_FAILED__';

/** Writes $JH_CODE to the tmpfs and clears the variable before any user-controlled code runs. */
const writeSource = (spec: LanguageSpec) => [`printf '%s' "$JH_CODE" > ${spec.file}`, 'unset JH_CODE'];

/**
 * Container entrypoint. Interpreted languages get the source in $JH_CODE (no host mounts at all); it is
 * written to the tmpfs and the variable is cleared before the program starts. Compiled languages get
 * the binary as the first `binaryBytes` bytes of stdin instead — `dd` reads exactly that much, so the
 * program sees only the test input. After the program exits, peak memory (bytes) and CPU time (µs) of
 * the container's cgroup are appended to stderr — cgroup v2 first, falling back to v1 (Docker Desktop).
 */
export function bootstrapScript(spec: LanguageSpec, binaryBytes?: number): string {
  const load = spec.compile
    ? [
        `dd of=${BINARY_PATH} bs=${binaryBytes ?? 0} count=1 iflag=fullblock 2>/dev/null && chmod 500 ${BINARY_PATH} ` +
          `|| { echo "${LOAD_FAILED}" >&2; exit 125; }`,
      ]
    : writeSource(spec);
  return [
    ...load,
    spec.run,
    'rc=$?',
    'G=/sys/fs/cgroup',
    'if [ -r $G/memory.peak ]; then m=$(cat $G/memory.peak); else m=$(cat $G/memory/memory.max_usage_in_bytes 2>/dev/null || echo -); fi',
    'if [ -r $G/cpu.stat ]; then c=$(sed -n "s/^usage_usec //p" $G/cpu.stat); elif [ -r $G/cpuacct/cpuacct.usage ]; then c=$(( $(cat $G/cpuacct/cpuacct.usage) / 1000 )); else c=-; fi',
    `echo "${STATS_MARKER} $m $c" >&2`,
    'exit $rc',
  ].join('\n');
}

/** Compile container entrypoint: compiler diagnostics on stderr, the binary on stdout on success. */
export function compileScript(spec: LanguageSpec): string {
  return [...writeSource(spec), `${spec.compile} 1>&2 || exit $?`, `cat ${BUILD_OUTPUT}`].join('\n');
}
