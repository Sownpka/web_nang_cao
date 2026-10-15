import { z } from 'zod';
import { Difficulty, Language, Role } from './enums.js';

export const roleSchema = z.nativeEnum(Role);
export const languageSchema = z.nativeEnum(Language);
export const difficultySchema = z.nativeEnum(Difficulty);

/** Max source size accepted by the API (64KB). */
export const MAX_CODE_BYTES = 64 * 1024;

const byteSize = (s: string) => new TextEncoder().encode(s).length;

export const codeSchema = z
  .string()
  .min(1, 'Code không được để trống')
  .refine((s) => byteSize(s) <= MAX_CODE_BYTES, 'Code vượt quá 64KB')
  // The sandbox passes code through an environment variable, which cannot hold NUL.
  .refine((s) => !s.includes('\0'), 'Code chứa ký tự không hợp lệ');

export const createSubmissionSchema = z.object({
  problemId: z.string().min(1),
  assignmentId: z.string().min(1).optional(),
  language: languageSchema,
  code: codeSchema,
});
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

/** Max size of a custom stdin for "Chạy thử" (64KB). */
export const MAX_CUSTOM_INPUT_BYTES = 64 * 1024;

export const runSamplesSchema = z.object({
  language: languageSchema,
  code: codeSchema,
  /** Optional extra stdin to run once without an expected answer. */
  customInput: z
    .string()
    .refine((s) => byteSize(s) <= MAX_CUSTOM_INPUT_BYTES, 'Input tự nhập vượt quá 64KB')
    .optional(),
});
export type RunSamplesInput = z.infer<typeof runSamplesSchema>;
