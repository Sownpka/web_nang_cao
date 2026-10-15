/** Max stdout kept for comparison (64KB), unless the expected answer is larger. */
export const STDOUT_CAP_BYTES = 64 * 1024;

/**
 * Normalises output for comparison: CRLF → LF, trailing whitespace on each line removed,
 * trailing blank lines removed.
 */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

export function stdoutCapFor(expected: string): number {
  return Math.max(STDOUT_CAP_BYTES, Buffer.byteLength(expected) + 1024);
}
