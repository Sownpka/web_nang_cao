import { describe, expect, it } from 'vitest';
import { normalizeOutput, outputsMatch, stdoutCapFor, STDOUT_CAP_BYTES } from '../src/compare.js';

describe('normalizeOutput', () => {
  it('treats CRLF, trailing spaces and trailing blank lines as equal', () => {
    expect(outputsMatch('1 2  \r\n3\r\n\r\n\n', '1 2\n3')).toBe(true);
    expect(normalizeOutput('a\t \nb   ')).toBe('a\nb');
  });

  it('keeps leading whitespace and inner blank lines significant', () => {
    expect(outputsMatch(' 1', '1')).toBe(false);
    expect(outputsMatch('1\n\n2', '1\n2')).toBe(false);
  });

  it('distinguishes different answers', () => {
    expect(outputsMatch('YES', 'yes')).toBe(false);
    expect(outputsMatch('', '0')).toBe(false);
  });
});

describe('stdoutCapFor', () => {
  it('uses 64KB unless the expected output is larger', () => {
    expect(stdoutCapFor('3\n')).toBe(STDOUT_CAP_BYTES);
    expect(stdoutCapFor('x'.repeat(100_000))).toBe(100_000 + 1024);
  });
});
