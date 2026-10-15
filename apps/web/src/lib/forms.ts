import type { ZodError } from 'zod';
import { ApiError } from './api';

export type FieldErrors = Record<string, string | undefined>;

/** First message per field from a Zod error. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}

/** Maps API conflict codes onto the field they concern. */
const CODE_TO_FIELD: Record<string, string> = {
  EMAIL_TAKEN: 'email',
  STUDENT_CODE_TAKEN: 'studentCode',
};

/** Splits an API error into per-field errors and a form-level message. */
export function apiErrorToForm(err: unknown): { fields: FieldErrors; form?: string } {
  if (!(err instanceof ApiError)) return { fields: {}, form: 'Không kết nối được máy chủ, vui lòng thử lại' };
  const field = CODE_TO_FIELD[err.code];
  if (field) return { fields: { [field]: err.message } };
  const fields = err.fieldErrors;
  return Object.keys(fields).length ? { fields } : { fields: {}, form: err.message };
}
