// Pairs uploaded test files by basename: "1.in" + "1.out" (or ".ans") → one test case.
// A .zip is unpacked client-side and its entries are paired the same way, keyed by their path
// inside the archive ("Test01/BAI.INP" + "Test01/BAI.OUT" → "Test01/BAI").
import { unzipSync, type UnzipFileInfo } from 'fflate';
import { MAX_TESTCASE_BYTES } from '@judgehint/shared';

export interface FilePair {
  name: string;
  input: string;
  expected: string;
}

export type SkipReason =
  | 'unpaired' // .in without .out or vice versa
  | 'unknownType' // not a test file extension
  | 'duplicate' // same test name uploaded twice
  | 'tooLarge' // one file over MAX_TESTCASE_BYTES
  | 'importTooLarge' // would push the import over MAX_IMPORT_BYTES
  | 'zipTooLarge' // archive itself over MAX_ZIP_BYTES
  | 'badZip'; // archive could not be read

export interface SkippedFile {
  name: string;
  reason: SkipReason;
}

export interface PairResult {
  pairs: FilePair[];
  skipped: SkippedFile[];
}

/** Largest .zip we read into memory. */
export const MAX_ZIP_BYTES = 20 * 1024 * 1024;
/** Total uncompressed text per import; the API accepts JSON bodies up to 8MB on /problems. */
export const MAX_IMPORT_BYTES = 7 * 1024 * 1024;

const INPUT_EXT = ['.in', '.inp', '.input'];
const OUTPUT_EXT = ['.out', '.ans', '.ok', '.output'];
export const ACCEPTED_EXTENSIONS = [...INPUT_EXT, ...OUTPUT_EXT, '.zip'];

function split(fileName: string): { base: string; kind: 'in' | 'out' } | null {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  // A dot right after "/" is a hidden file ("dir/.in"), not an extension.
  if (dot <= 0 || lower[dot - 1] === '/') return null;
  const ext = lower.slice(dot);
  const base = fileName.slice(0, dot);
  if (INPUT_EXT.includes(ext)) return { base, kind: 'in' };
  if (OUTPUT_EXT.includes(ext)) return { base, kind: 'out' };
  return null;
}

const isZip = (name: string) => name.toLowerCase().endsWith('.zip');

/** Directories and OS metadata (__MACOSX/, .DS_Store, ._foo) that zip tools add silently. */
function isZipNoise(path: string): boolean {
  return path.endsWith('/') || path.split('/').some((part) => part === '__MACOSX' || part.startsWith('.'));
}

/** Natural sort so "2" comes before "10". */
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const utf8 = new TextDecoder('utf-8');

interface Entry {
  /** Pairing key source: file name, or path inside the archive. */
  name: string;
  /** Shown when the entry is skipped; zip entries are prefixed with the archive name. */
  label: string;
  size: number;
  read: () => Promise<string>;
}

/** Tracks the running import size so one huge upload cannot exhaust memory or the API limit. */
class Budget {
  private used = 0;
  readonly skipped: SkippedFile[] = [];

  /** True if a file of `size` bytes may be read; records why not otherwise. */
  admit(name: string, size: number): boolean {
    if (size > MAX_TESTCASE_BYTES) return this.skip(name, 'tooLarge');
    if (this.used + size > MAX_IMPORT_BYTES) return this.skip(name, 'importTooLarge');
    this.used += size;
    return true;
  }

  skip(name: string, reason: SkipReason): false {
    this.skipped.push({ name, reason });
    return false;
  }
}

/** Test-file entries of one archive. Sizes are checked against the declared size before inflating. */
function unzipTestFiles(zipName: string, data: Uint8Array, budget: Budget): Entry[] {
  const filter = (f: UnzipFileInfo) => {
    if (isZipNoise(f.name)) return false;
    if (!split(f.name)) return budget.skip(`${zipName}/${f.name}`, 'unknownType');
    return budget.admit(`${zipName}/${f.name}`, f.originalSize);
  };
  let files: Record<string, Uint8Array>;
  try {
    // fflate inflates into a buffer of the declared size, so a lying header cannot grow memory.
    files = unzipSync(data, { filter });
  } catch {
    budget.skip(zipName, 'badZip');
    return [];
  }
  return Object.entries(files).map(([name, bytes]) => ({
    name,
    label: `${zipName}/${name}`,
    size: bytes.length,
    read: async () => utf8.decode(bytes),
  }));
}

export async function pairTestFiles(files: File[]): Promise<PairResult> {
  const budget = new Budget();
  const entries: Entry[] = [];

  for (const file of files) {
    if (isZip(file.name)) {
      if (file.size > MAX_ZIP_BYTES) {
        budget.skip(file.name, 'zipTooLarge');
        continue;
      }
      entries.push(...unzipTestFiles(file.name, new Uint8Array(await file.arrayBuffer()), budget));
    } else if (!split(file.name)) {
      budget.skip(file.name, 'unknownType');
    } else if (budget.admit(file.name, file.size)) {
      entries.push({ name: file.name, label: file.name, size: file.size, read: () => file.text() });
    }
  }

  const groups = new Map<string, { in?: Entry; out?: Entry }>();
  for (const entry of entries) {
    const { base, kind } = split(entry.name)!;
    const g = groups.get(base) ?? {};
    if (g[kind]) {
      budget.skip(entry.label, 'duplicate');
      continue;
    }
    g[kind] = entry;
    groups.set(base, g);
  }

  const pairs: FilePair[] = [];
  for (const [base, g] of [...groups].sort(([a], [b]) => natural.compare(a, b))) {
    if (!g.in || !g.out) {
      budget.skip((g.in ?? g.out)!.label, 'unpaired');
      continue;
    }
    pairs.push({ name: base, input: await g.in.read(), expected: await g.out.read() });
  }
  return { pairs, skipped: budget.skipped };
}
