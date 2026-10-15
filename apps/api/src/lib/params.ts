import type { Request } from 'express';
import { HttpError } from './httpError.js';

/** Reads a single string route param (Express 5 types also allow arrays for wildcards). */
export function param(req: Request, name: string): string {
  const value: unknown = req.params[name];
  if (typeof value !== 'string' || !value) throw HttpError.badRequest(`Thiếu tham số ${name}`);
  return value;
}
