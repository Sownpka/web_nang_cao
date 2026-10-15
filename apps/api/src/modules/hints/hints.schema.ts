import { z } from 'zod';

export { hintStreamQuerySchema } from '@judgehint/shared';

export const hintStateQuerySchema = z.object({ submissionId: z.string().min(1) });
