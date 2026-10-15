import { z } from 'zod';
import { Difficulty, Language, Role } from './enums.js';

export const roleSchema = z.nativeEnum(Role);
export const languageSchema = z.nativeEnum(Language);
export const difficultySchema = z.nativeEnum(Difficulty);

/** Max source size accepted by the API (64KB). */
export const MAX_CODE_BYTES = 64 * 1024;

export const createSubmissionSchema = z.object({
  problemId: z.string().min(1),
  assignmentId: z.string().min(1).optional(),
  language: languageSchema,
  code: z
    .string()
    .min(1, 'Code không được để trống')
    .refine((s) => new TextEncoder().encode(s).length <= MAX_CODE_BYTES, 'Code vượt quá 64KB'),
});
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
