import { testCaseInputSchema } from '@judgehint/shared';

export { testCaseBulkSchema, testCaseInputSchema } from '@judgehint/shared';

/** Partial update: any of input / expected / isHidden. */
export const testCaseUpdateSchema = testCaseInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Không có thay đổi nào');
