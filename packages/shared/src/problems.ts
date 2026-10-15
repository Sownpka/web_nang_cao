import { z } from 'zod';
import { Difficulty, Language } from './enums.js';
import { difficultySchema, languageSchema } from './schemas.js';

/** Languages the judge can currently run (C++ comes later). */
export const SUPPORTED_LANGUAGES: readonly Language[] = [Language.python, Language.javascript];

export const LANGUAGE_LABELS: Record<Language, string> = {
  python: 'Python 3.12',
  javascript: 'JavaScript (Node 20)',
  cpp: 'C++17',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

/** Max size of a single test input/expected output (1MB). */
export const MAX_TESTCASE_BYTES = 1024 * 1024;
export const MAX_TESTCASES_PER_PROBLEM = 100;

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL slug from a (Vietnamese) title: "Tổng hai số" → "tong-hai-so". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const byteSize = (s: string) => new TextEncoder().encode(s).length;

// ---- Problems ------------------------------------------------------------

export const problemInputSchema = z.object({
  title: z.string().trim().min(3, 'Tên bài tối thiểu 3 ký tự').max(120, 'Tên bài tối đa 120 ký tự'),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(SLUG_REGEX, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  statementMd: z.string().trim().min(10, 'Đề bài quá ngắn').max(50_000, 'Đề bài quá dài'),
  difficulty: difficultySchema,
  timeLimitMs: z.coerce.number().int().min(100, 'Tối thiểu 100ms').max(10_000, 'Tối đa 10 giây'),
  memoryLimitMb: z.coerce.number().int().min(32, 'Tối thiểu 32MB').max(1024, 'Tối đa 1024MB'),
  allowedLanguages: z
    .array(languageSchema)
    .min(1, 'Chọn ít nhất một ngôn ngữ')
    .refine((ls) => ls.every((l) => SUPPORTED_LANGUAGES.includes(l)), 'Ngôn ngữ chưa được hỗ trợ')
    .transform((ls) => [...new Set(ls)]),
  aiHintsEnabled: z.boolean(),
  referenceSolution: z
    .string()
    .max(50_000)
    .nullish()
    .transform((s) => (s?.trim() ? s : null)),
});
export type ProblemInput = z.input<typeof problemInputSchema>;
export type ProblemInputParsed = z.output<typeof problemInputSchema>;

export const problemListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  difficulty: difficultySchema.optional(),
  mine: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProblemListQuery = z.input<typeof problemListQuerySchema>;

export interface ProblemListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  allowedLanguages: Language[];
  solved: boolean;
  attempted: boolean;
  authorId: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SampleTest {
  order: number;
  input: string;
  expected: string;
}

/** Problem as shown to anyone signed in: public tests only, no reference solution. */
export interface ProblemDetail {
  id: string;
  slug: string;
  title: string;
  statementMd: string;
  difficulty: Difficulty;
  timeLimitMs: number;
  memoryLimitMb: number;
  allowedLanguages: Language[];
  aiHintsEnabled: boolean;
  samples: SampleTest[];
  totalTests: number;
  canEdit: boolean;
}

/** Full problem for its author / admins. */
export interface ProblemManage extends Omit<ProblemDetail, 'samples' | 'canEdit'> {
  referenceSolution: string | null;
  authorId: string;
  submissionCount: number;
}

// ---- Test cases ----------------------------------------------------------

const testText = (label: string) =>
  z
    .string()
    .max(MAX_TESTCASE_BYTES * 2)
    .refine((s) => byteSize(s) <= MAX_TESTCASE_BYTES, `${label} vượt quá 1MB`);

export const testCaseInputSchema = z.object({
  input: testText('Input'),
  expected: testText('Output'),
  isHidden: z.boolean().default(true),
});
export type TestCaseInput = z.input<typeof testCaseInputSchema>;

export const testCaseBulkSchema = z.object({
  /** Replace all existing tests instead of appending. */
  replace: z.boolean().default(false),
  cases: z.array(testCaseInputSchema).min(1, 'Không có test nào').max(MAX_TESTCASES_PER_PROBLEM),
});
export type TestCaseBulkInput = z.input<typeof testCaseBulkSchema>;

/** List view: large inputs are truncated to a preview. */
export interface TestCaseSummary {
  id: string;
  order: number;
  isHidden: boolean;
  inputPreview: string;
  expectedPreview: string;
  inputBytes: number;
  expectedBytes: number;
}

export interface TestCaseFull {
  id: string;
  order: number;
  isHidden: boolean;
  input: string;
  expected: string;
}
