/**
 * Leak guard (CLAUDE.md §6): decides whether an AI hint gives away code the student did not write.
 *
 * 1. Any fenced code block longer than 2 lines is rejected.
 * 2. Any code-like line or inline `code` span that does not come from the student's own code is
 *    rejected (quoting the student's own line to point at it is allowed).
 * 3. With a reference solution, token 4-grams shared by the hint and the solution — excluding those
 *    the student already wrote — must stay below a threshold.
 */

export type LeakReason = 'CODE_BLOCK' | 'FOREIGN_CODE' | 'REFERENCE_SIMILARITY' | 'FIX_DIRECTIVE' | 'TOO_SPECIFIC';

export interface LeakVerdict {
  ok: boolean;
  reason?: LeakReason;
  /** Short human-readable detail for logs. */
  detail?: string;
}

export interface LeakGuardInput {
  hint: string;
  studentCode: string;
  referenceSolution?: string | null;
  /** Enables the level checks (no fix instructions; level 1 must not point at code). */
  level?: 1 | 2 | 3;
}

/**
 * Telling the student how to fix it, even in words ("hãy khởi tạo best bằng phần tử đầu"),
 * gives the answer away. Observed with real models despite the prompt, so it is enforced here.
 */
const FIX_DIRECTIVE =
  /(cách (khắc phục|sửa)|để sửa (lỗi|bài|code)|(^|\s)mẹo\s*:|(hãy|cần|nên|phải|chỉ cần)\s+(khởi tạo|đổi|thay|sửa|gán|chuyển|áp dụng|dùng|sử dụng|thêm)\s|(có thể|thử)\s+(dùng|sử dụng|áp dụng)\s|(thay|đổi|sửa)\s+(nó\s+|lại\s+)?(thành|bằng)\s)/iu;

/** Level 1 names the kind of mistake only: no line numbers and no quotes of the student's code. */
function tooSpecificForLevel1(hint: string, studentCode: string): string | null {
  const line = /dòng\s*\d+/iu.exec(hint);
  if (line) return line[0];
  const own = squash(studentCode);
  for (const m of hint.matchAll(/`([^`\n]+)`/g)) {
    const span = squash(m[1]!);
    if (span.length >= 4 && own.includes(span)) return m[1]!;
  }
  return null;
}

export const MAX_CODE_BLOCK_LINES = 2;
export const SIMILARITY_THRESHOLD = 0.25;
const NGRAM = 4;
/** Below this many distinctive reference n-grams the similarity check is meaningless. */
const MIN_REFERENCE_NGRAMS = 6;

const CODE_KEYWORDS =
  /\b(for|while|if|elif|else|return|def|class|import|from|print|range|len|max|min|sum|map|int|str|input|append|sorted|console|log|let|const|var|function|readFileSync|split|join|parseInt|Math)\b/g;

/** Removes whitespace so formatting differences do not matter when comparing code. */
const squash = (s: string) => s.replace(/\s+/g, '');

/** Heuristic "does this look like program code?" for a single line or inline span. */
export function looksLikeCode(text: string): boolean {
  const s = text.trim();
  if (s.length < 10) return false; // short fragments like `n = 1` or `a[0]` are fine to mention
  let score = 0;
  if (/(^|[^=!<>])=(?!=)/.test(s)) score++; // assignment
  if (/[A-Za-z_]\w*\s*\(/.test(s)) score++; // call
  if (/(\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||=>|\/\/|%)/.test(s)) score++;
  if (/[:;{]\s*$/.test(s)) score++; // block opener / statement end
  if (/\[[^\]]*\]/.test(s) && /\w\s*\[/.test(s)) score++; // indexing
  score += Math.min(2, (s.match(CODE_KEYWORDS) ?? []).length);
  // Vietnamese prose (letters with diacritics) is very unlikely to be code.
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s)) score -= 2;
  return score >= 3;
}

interface Extracted {
  blocks: string[][];
  spans: string[];
  lines: string[];
}

/** Splits a markdown hint into fenced blocks, inline code spans and the remaining prose lines. */
export function extractCode(hint: string): Extracted {
  const blocks: string[][] = [];
  const prose: string[] = [];
  let current: string[] | null = null;
  for (const line of hint.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (current) {
        blocks.push(current);
        current = null;
      } else {
        current = [];
      }
      continue;
    }
    (current ?? prose).push(line);
  }
  if (current) blocks.push(current); // unterminated fence still counts
  const text = prose.join('\n');
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
  const lines = prose.map((l) => l.replace(/`[^`\n]*`/g, ' '));
  return { blocks, spans, lines };
}

function tokens(text: string): string[] {
  return text.match(/[A-Za-z_]\w*|\d+|==|!=|<=|>=|\+=|-=|\*=|\/\/|\*\*|[-+*/%=<>()[\]{}:,.]/g) ?? [];
}

function ngrams(toks: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + NGRAM <= toks.length; i++) out.add(toks.slice(i, i + NGRAM).join(' '));
  return out;
}

/** Share of the reference's distinctive n-grams (not already in the student code) found in the hint. */
export function referenceSimilarity(hint: string, reference: string, studentCode: string): { score: number; size: number } {
  const own = ngrams(tokens(studentCode));
  const ref = [...ngrams(tokens(reference))].filter((g) => !own.has(g));
  if (ref.length < MIN_REFERENCE_NGRAMS) return { score: 0, size: ref.length };
  const said = ngrams(tokens(hint));
  const shared = ref.filter((g) => said.has(g)).length;
  return { score: shared / ref.length, size: ref.length };
}

export function checkHint({ hint, studentCode, referenceSolution, level }: LeakGuardInput): LeakVerdict {
  if (level) {
    const fix = FIX_DIRECTIVE.exec(hint);
    if (fix) return { ok: false, reason: 'FIX_DIRECTIVE', detail: fix[0].trim() };
    if (level === 1) {
      const pointer = tooSpecificForLevel1(hint, studentCode);
      if (pointer) return { ok: false, reason: 'TOO_SPECIFIC', detail: pointer };
    }
  }

  const { blocks, spans, lines } = extractCode(hint);

  for (const block of blocks) {
    const nonEmpty = block.filter((l) => l.trim()).length;
    if (nonEmpty > MAX_CODE_BLOCK_LINES) {
      return { ok: false, reason: 'CODE_BLOCK', detail: `${nonEmpty}-line code block` };
    }
  }

  const own = squash(studentCode);
  const candidates = [...blocks.flat(), ...spans, ...lines].map((s) => s.trim()).filter(Boolean);
  for (const c of candidates) {
    if (looksLikeCode(c) && !own.includes(squash(c))) {
      return { ok: false, reason: 'FOREIGN_CODE', detail: c.slice(0, 80) };
    }
  }

  if (referenceSolution) {
    const { score } = referenceSimilarity(hint, referenceSolution, studentCode);
    if (score >= SIMILARITY_THRESHOLD) {
      return { ok: false, reason: 'REFERENCE_SIMILARITY', detail: `similarity ${score.toFixed(2)}` };
    }
  }
  return { ok: true };
}

/** Safe stand-ins used when the LLM keeps leaking. */
export const FALLBACK_HINTS: Record<1 | 2 | 3, string> = {
  1: 'Hãy xem lại các **trường hợp biên** của đề (giá trị nhỏ nhất/lớn nhất, chỉ một phần tử, số âm) và tự chạy tay chương trình với chúng. Kết quả có khớp với điều đề yêu cầu không?',
  2: 'Hãy tập trung vào **phần xử lý chính** (vòng lặp hoặc phép tính tạo ra kết quả). Em thử tự nghĩ một input giống trường hợp làm bài sai — nhỏ nhất, lớn nhất hoặc đặc biệt nhất theo đề — rồi in giá trị các biến sau từng bước để xem chỗ nào bắt đầu lệch so với dự tính.',
  3: 'Hãy dò lại **từng dòng trong phần tính kết quả**: điều kiện dừng, giá trị khởi tạo và phép cập nhật biến. Một trong số đó đang không đúng với trường hợp làm bài sai — em có thể tự kiểm tra bằng cách in giá trị ngay trước và sau dòng đó.',
};

/** What the model is told when its previous answer was rejected (it always contains "ĐÃ BỊ HỆ THỐNG CHẶN"). */
export function rewriteReminder(reason: LeakReason | undefined): string {
  const head = 'CÂU TRẢ LỜI TRƯỚC ĐÃ BỊ HỆ THỐNG CHẶN';
  switch (reason) {
    case 'FIX_DIRECTIVE':
      return `${head} vì đã nói cách sửa. Viết lại: chỉ giúp em thấy VÌ SAO sai, tuyệt đối không nói nên khởi tạo/thay/đổi/dùng gì. Kết thúc bằng một câu hỏi.`;
    case 'TOO_SPECIFIC':
      return `${head} vì đã vượt mức 1 (nhắc số dòng hoặc trích code). Viết lại: chỉ gọi tên loại lỗi và đặt câu hỏi gợi mở, không chỉ vị trí.`;
    default:
      return `${head} vì chứa code hoặc gần với lời giải. Viết lại gợi ý đúng mức yêu cầu CHỈ BẰNG LỜI: không khối code, không viết dòng code mới, không nêu biểu thức/công thức sửa lỗi. Chỉ được trích nguyên văn tối đa một dòng có sẵn trong code của sinh viên.`;
  }
}
