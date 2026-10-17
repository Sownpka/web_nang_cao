import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { MAX_TESTCASE_BYTES } from '@judgehint/shared';
import { MAX_IMPORT_BYTES, MAX_ZIP_BYTES, pairTestFiles } from '../src/features/problems/testFiles';

const file = (name: string, content: string | Uint8Array) =>
  new File([typeof content === 'string' ? content : new Uint8Array(content)], name);

const zip = (name: string, entries: Record<string, string>) => {
  const tree: Zippable = {};
  for (const [path, text] of Object.entries(entries)) tree[path] = strToU8(text);
  return file(name, zipSync(tree));
};

describe('pairTestFiles: loose files', () => {
  it('pairs by basename with natural ordering and any supported extension', async () => {
    const res = await pairTestFiles([
      file('10.in', 'ten'),
      file('2.inp', 'two'),
      file('10.out', 'TEN'),
      file('2.ANS', 'TWO'),
      file('1.input', 'one'),
      file('1.ok', 'ONE'),
    ]);
    expect(res.pairs).toEqual([
      { name: '1', input: 'one', expected: 'ONE' },
      { name: '2', input: 'two', expected: 'TWO' },
      { name: '10', input: 'ten', expected: 'TEN' },
    ]);
    expect(res.skipped).toEqual([]);
  });

  it('reports files without a partner or with an unknown extension', async () => {
    const res = await pairTestFiles([file('1.in', 'a'), file('1.out', 'b'), file('2.in', 'c'), file('readme.txt', 'x')]);
    expect(res.pairs.map((p) => p.name)).toEqual(['1']);
    expect(res.skipped).toEqual(
      expect.arrayContaining([
        { name: '2.in', reason: 'unpaired' },
        { name: 'readme.txt', reason: 'unknownType' },
      ]),
    );
  });

  it('rejects a file over the per-test limit without reading it', async () => {
    const big = file('1.in', 'x'.repeat(MAX_TESTCASE_BYTES + 1));
    const res = await pairTestFiles([big, file('1.out', 'ok')]);
    expect(res.pairs).toEqual([]);
    expect(res.skipped).toEqual(
      expect.arrayContaining([
        { name: '1.in', reason: 'tooLarge' },
        { name: '1.out', reason: 'unpaired' },
      ]),
    );
  });
});

describe('pairTestFiles: zip archives', () => {
  it('unpacks and pairs entries, ignoring OS metadata', async () => {
    const res = await pairTestFiles([
      zip('tests.zip', {
        '1.in': '1 2\n',
        '1.out': '3\n',
        '2.in': '5 5\n',
        '2.ans': '10\n',
        '__MACOSX/._1.in': 'junk',
        '.DS_Store': 'junk',
      }),
    ]);
    expect(res.pairs).toEqual([
      { name: '1', input: '1 2\n', expected: '3\n' },
      { name: '2', input: '5 5\n', expected: '10\n' },
    ]);
    expect(res.skipped).toEqual([]);
  });

  it('pairs within sub-folders (Themis layout) and keeps UTF-8 text intact', async () => {
    const res = await pairTestFiles([
      zip('bai.zip', {
        'Test02/BAI.INP': 'xin chào\n',
        'Test02/BAI.OUT': 'oàhc nix\n',
        'Test01/BAI.INP': 'a\n',
        'Test01/BAI.OUT': 'a\n',
      }),
    ]);
    expect(res.pairs).toEqual([
      { name: 'Test01/BAI', input: 'a\n', expected: 'a\n' },
      { name: 'Test02/BAI', input: 'xin chào\n', expected: 'oàhc nix\n' },
    ]);
  });

  it('reports unknown and unpaired entries by their path in the archive', async () => {
    const res = await pairTestFiles([zip('t.zip', { '1.in': 'a', 'notes.txt': 'n', '3.out': 'c' })]);
    expect(res.pairs).toEqual([]);
    expect(res.skipped).toEqual(
      expect.arrayContaining([
        { name: 't.zip/notes.txt', reason: 'unknownType' },
        { name: 't.zip/1.in', reason: 'unpaired' },
        { name: 't.zip/3.out', reason: 'unpaired' },
      ]),
    );
  });

  it('mixes zip entries with loose files and flags duplicates', async () => {
    const res = await pairTestFiles([zip('t.zip', { '1.in': 'zip-in', '1.out': 'zip-out' }), file('1.in', 'loose'), file('2.in', 'b'), file('2.out', 'B')]);
    expect(res.pairs).toEqual([
      { name: '1', input: 'zip-in', expected: 'zip-out' },
      { name: '2', input: 'b', expected: 'B' },
    ]);
    expect(res.skipped).toEqual([{ name: '1.in', reason: 'duplicate' }]);
  });

  it('skips entries over the per-test limit before inflating them', async () => {
    const res = await pairTestFiles([zip('big.zip', { '1.in': 'x'.repeat(MAX_TESTCASE_BYTES + 1), '1.out': 'y' })]);
    expect(res.pairs).toEqual([]);
    expect(res.skipped).toEqual(expect.arrayContaining([{ name: 'big.zip/1.in', reason: 'tooLarge' }]));
  });

  it('stops admitting entries once the import would exceed the total limit', async () => {
    // Highly compressible, so the archive is tiny while the declared sizes add up past the limit.
    const chunk = 'x'.repeat(MAX_TESTCASE_BYTES - 1);
    const entries: Record<string, string> = {};
    const count = Math.ceil(MAX_IMPORT_BYTES / MAX_TESTCASE_BYTES) + 1;
    for (let i = 1; i <= count; i++) entries[`${i}.in`] = chunk;
    const res = await pairTestFiles([zip('bomb.zip', entries)]);
    const rejected = res.skipped.filter((s) => s.reason === 'importTooLarge');
    expect(rejected.length).toBeGreaterThan(0);
    // Everything that was admitted fits the budget.
    expect((count - rejected.length) * chunk.length).toBeLessThanOrEqual(MAX_IMPORT_BYTES);
  });

  it('reports a corrupt archive instead of throwing', async () => {
    const res = await pairTestFiles([file('broken.zip', 'definitely not a zip'), file('1.in', 'a'), file('1.out', 'b')]);
    expect(res.pairs.map((p) => p.name)).toEqual(['1']);
    expect(res.skipped).toEqual([{ name: 'broken.zip', reason: 'badZip' }]);
  });

  it('refuses an archive over the zip size limit without reading it', async () => {
    const huge = file('huge.zip', 'z');
    Object.defineProperty(huge, 'size', { value: MAX_ZIP_BYTES + 1 });
    huge.arrayBuffer = () => {
      throw new Error('must not be read');
    };
    const res = await pairTestFiles([huge]);
    expect(res.skipped).toEqual([{ name: 'huge.zip', reason: 'zipTooLarge' }]);
  });
});
