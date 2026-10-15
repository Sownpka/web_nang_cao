// Pairs uploaded test files by basename: "1.in" + "1.out" (or ".ans") → one test case.

export interface FilePair {
  name: string;
  input: string;
  expected: string;
}

const INPUT_EXT = ['.in', '.inp', '.input'];
const OUTPUT_EXT = ['.out', '.ans', '.ok', '.output'];

function split(fileName: string): { base: string; kind: 'in' | 'out' } | null {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = lower.slice(dot);
  const base = fileName.slice(0, dot);
  if (INPUT_EXT.includes(ext)) return { base, kind: 'in' };
  if (OUTPUT_EXT.includes(ext)) return { base, kind: 'out' };
  return null;
}

/** Natural sort so "2" comes before "10". */
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function pairTestFiles(files: File[]): Promise<{ pairs: FilePair[]; unpaired: string[] }> {
  const groups = new Map<string, { in?: File; out?: File }>();
  const unpaired: string[] = [];

  for (const file of files) {
    const parsed = split(file.name);
    if (!parsed) {
      unpaired.push(file.name);
      continue;
    }
    const g = groups.get(parsed.base) ?? {};
    g[parsed.kind] = file;
    groups.set(parsed.base, g);
  }

  const pairs: FilePair[] = [];
  for (const [base, g] of [...groups].sort(([a], [b]) => natural.compare(a, b))) {
    if (!g.in || !g.out) {
      unpaired.push((g.in ?? g.out)!.name);
      continue;
    }
    pairs.push({ name: base, input: await g.in.text(), expected: await g.out.text() });
  }
  return { pairs, unpaired };
}
